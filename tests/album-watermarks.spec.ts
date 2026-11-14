import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const left = (page: Page) => page.locator('.editor-page[data-side="0"]');
const right = (page: Page) => page.locator('.editor-page[data-side="1"]');
const saved = (page: Page) => expect(page.locator('#save-status')).toHaveText('✓ 已保存到本机');
const gallery = (page: Page) => page.getByRole('group', { name: '图片水印图库' });
async function openPattern(page: Page) { await page.locator('summary').filter({ hasText: /^图案水印$/ }).click(); }
async function opacity(page: Page, value: number) {
  await page.getByLabel('水印透明度').evaluate((input, value) => {
    (input as HTMLInputElement).value = String(value); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
}
async function pick(page: Page, index = 0) {
  const button = gallery(page).getByRole('button').nth(index); await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true'); await expect(left(page).locator('.album-watermark img').first()).toBeVisible();
  await left(page).locator('.album-watermark img').first().evaluate(image => (image as HTMLImageElement).decode());
}
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/editor.html'); await saved(page); await openPattern(page); });

test('choosing a theme enables a previously invisible watermark and the switch restores its strength', async ({ page }) => {
  await expect(page.getByLabel('启用水印', { exact: true })).not.toBeChecked(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0');
  await page.getByLabel('图案主题', { exact: true }).selectOption('paw'); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.28');
  await expect(page.getByLabel('启用水印', { exact: true })).toBeChecked(); await expect(left(page).locator('.album-watermark-tile')).toHaveCount(2);
  await opacity(page, 53);
  await page.getByLabel('启用水印', { exact: true }).uncheck(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0');
  await expect(page.locator('.editor-watermark-current')).toContainText('水印已关闭'); await page.getByLabel('启用水印', { exact: true }).check();
  await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.53');
  await page.locator('#undo').click(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0');
});

test('every generated thumbnail decodes and points to a distinct verified local image', async ({ page }) => {
  const presets = await page.evaluate(async () => (await import('/src/editor/watermark-library.ts')).WATERMARK_PRESETS);
  expect(presets.length).toBeGreaterThan(5); expect(new Set(presets.map(p => p.sha256)).size).toBe(presets.length);
  await expect(gallery(page).getByRole('button')).toHaveCount(presets.length);
  for (let i = 0; i < presets.length; i++) {
    const image = gallery(page).locator('img').nth(i); await image.scrollIntoViewIfNeeded();
    const pixels = await image.evaluate(async image => {
      const img = image as HTMLImageElement; await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!; ctx.drawImage(img, 0, 0); const data = ctx.getImageData(0, 0, c.width, c.height).data;
      let opaque = 0, clear = 0; for (let p = 3; p < data.length; p += 4) { if (data[p] > 200) opaque++; if (!data[p]) clear++; }
      return { size: [img.naturalWidth, img.naturalHeight], opaque, clear, corner: data[3] };
    });
    expect(pixels.size).toEqual([presets[i].width, presets[i].height]);
    expect(pixels.opaque).toBeGreaterThan(300); expect(pixels.clear).toBeGreaterThan(300); expect(pixels.corner).toBe(0);
    expect(presets[i].assetId).toMatch(/^wm-[a-f0-9]{64}$/);
  }
});

test('selecting a generated image creates a visible portable asset without altering written content', async ({ page }) => {
  await right(page).getByRole('textbox', { name: '页面标题' }).fill('我自己写的标题'); await page.locator('#other-page').click(); await page.locator('#select-page').click();
  await pick(page); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.28'); await expect(page.getByLabel('图案大小', { exact: true })).toHaveValue('88');
  await expect(right(page)).toContainText('我自己写的标题'); await saved(page);
  const asset = await page.evaluate(async () => {
    const { readDraft } = await import('/src/editor/storage.ts'), { imageHash } = await import('/src/editor/watermark-library.ts');
    const draft = (await readDraft())!, watermark = draft.document.chapters[0].spreads[0].pages[0].watermark;
    return { id: watermark.assetId, sha: await imageHash(draft.assets.get(watermark.assetId)!), count: draft.document.assets.length };
  });
  expect(asset.id).toBe(`wm-${asset.sha}`); expect(asset.count).toBe(1);
  await page.reload(); await saved(page); await expect(left(page).locator('.album-watermark img').first()).toBeVisible(); await expect(right(page)).toContainText('我自己写的标题');
});

test('a library choice applies to the selected scope, reuses stored bytes and remains one undo command', async ({ page }) => {
  await page.locator('#add-spread').click(); await page.getByLabel('页面设置应用到').selectOption('book'); await pick(page); await saved(page);
  await pick(page); await saved(page);
  const all = await page.evaluate(async () => { const d = (await (await import('/src/editor/storage.ts')).readDraft())!.document; return { refs: d.chapters.flatMap(c => c.spreads.flatMap(s => s.pages.map(p => p.watermark.assetId))), assets: d.assets.length }; });
  expect(all.refs).toHaveLength(4); expect(new Set(all.refs).size).toBe(1); expect(all.assets).toBe(1);
  await page.locator('#undo').click(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0'); await expect(right(page).locator('.album-watermark')).toHaveCSS('opacity', '0');
  await page.locator('#redo').click(); await expect(left(page).locator('.album-watermark img')).toHaveCount(2);
});

test('failed image loading leaves the page intact and a later retry succeeds', async ({ page }) => {
  const preset = await page.evaluate(async () => (await import('/src/editor/watermark-library.ts')).WATERMARK_PRESETS[0]);
  await page.route(preset.url, route => route.request().resourceType() === 'fetch' ? route.fulfill({ status: 503, body: '' }) : route.continue());
  await gallery(page).getByRole('button').first().click(); await expect(page.locator('#editor-notice')).toContainText('原稿保留');
  await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0');
  await page.unroute(preset.url); await pick(page); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.28');
});

test('a delayed image choice cannot overwrite a later manual theme selection', async ({ page }) => {
  const preset = await page.evaluate(async () => (await import('/src/editor/watermark-library.ts')).WATERMARK_PRESETS[0]);
  let resume!: () => void; const gate = new Promise<void>(resolve => { resume = resolve; });
  await page.route(preset.url, async route => { if (route.request().resourceType() === 'fetch') await gate; await route.continue(); });
  await gallery(page).getByRole('button').first().click(); await expect(gallery(page).getByRole('button').first()).toHaveAttribute('aria-busy', 'true');
  await page.getByLabel('图案主题', { exact: true }).selectOption('shell');
  const response = page.waitForResponse(r => r.request().resourceType() === 'fetch' && r.url().includes(preset.file)); resume(); await response;
  await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 100)));
  await expect(left(page).locator('.album-watermark svg')).toHaveCount(2); await expect(gallery(page).getByRole('button').first()).toHaveAttribute('aria-busy', 'false');
  await saved(page); expect(await page.evaluate(async () => (await (await import('/src/editor/storage.ts')).readDraft())!.document.chapters[0].spreads[0].pages[0].watermark.assetId)).toBe('');
});

test('editable backup retains actual generated bytes and restores without a catalog dependency', async ({ page }) => {
  await pick(page); await saved(page); const before = await left(page).locator('.album-watermark img').first().getAttribute('src');
  await page.locator('.editor-export summary').click(); const waiting = page.waitForEvent('download'); await page.locator('#export-backup').click(); const filename = (await (await waiting).path())!;
  const pack = JSON.parse(await readFile(filename, 'utf8')); expect(pack.assets).toHaveLength(1); expect(pack.assets[0].data).toMatch(/^data:image\/webp;base64,/);
  await page.locator('.editor-help summary').click(); await page.locator('#new-project').click(); await expect(left(page).locator('.album-watermark img')).toHaveCount(0);
  await page.locator('#import-backup').click(); await page.locator('#project-input').setInputFiles(filename); await expect(left(page).locator('.album-watermark img')).toHaveCount(2);
  const restored = left(page).locator('.album-watermark img').first(); expect(await restored.getAttribute('src')).not.toBe(before); await restored.evaluate(image => (image as HTMLImageElement).decode());
  await page.locator('#preview').click(); await expect(page.frameLocator('#preview-frame').locator('.page-left .album-watermark img')).toHaveCount(2);
});

test('a catalog image cannot replace an original retained only by undo history', async ({ page }) => {
  const original = await page.evaluate(async () => {
    const { readDraft, saveDraft } = await import('/src/editor/storage.ts'), { imageHash, WATERMARK_PRESETS } = await import('/src/editor/watermark-library.ts');
    const draft = (await readDraft())!, assetId = WATERMARK_PRESETS[0].assetId;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 20; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#487c6a'; ctx.fillRect(0, 0, 20, 20);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png'));
    draft.document.assets.push({ id: assetId, name: '先前备份原图.png', mime: 'image/png', width: 20, height: 20 });
    Object.assign(draft.document.chapters[0].spreads[0].pages[0].watermark, { assetId, opacity: .5 });
    await saveDraft(draft.document, new Map([[assetId, blob]]), draft.version); return { id: assetId, hash: await imageHash(blob) };
  });
  await page.reload(); await saved(page); await openPattern(page);
  await page.locator('.editor-help summary').click(); await page.locator('#new-project').click();
  await gallery(page).getByRole('button').first().click(); await expect(left(page).locator('.album-watermark img')).toHaveCount(2); await saved(page);
  const current = await page.evaluate(async () => { const d = (await (await import('/src/editor/storage.ts')).readDraft())!; const id = d.document.chapters[0].spreads[0].pages[0].watermark.assetId; return { id, hash: await (await import('/src/editor/watermark-library.ts')).imageHash(d.assets.get(id)!) }; });
  expect(current.id).not.toBe(original.id); expect(`wm-${current.hash}`).toBe(original.id);
  await page.locator('#undo').click(); await page.locator('#undo').click(); await saved(page);
  const restored = await page.evaluate(async () => { const d = (await (await import('/src/editor/storage.ts')).readDraft())!; const id = d.document.chapters[0].spreads[0].pages[0].watermark.assetId; return { id, hash: await (await import('/src/editor/watermark-library.ts')).imageHash(d.assets.get(id)!) }; });
  expect(restored).toEqual(original);
});

test('generated watermarks contribute real pixels to the captured page and PNG export', async ({ page }) => {
  await pick(page); await page.getByLabel('图案排布').selectOption('repeat'); await opacity(page, 65);
  await page.locator('#preview').click(); const frame = page.frameLocator('#preview-frame'); await expect(frame.locator('.page-left .album-watermark img')).toHaveCount(18);
  const difference = await page.locator('#preview-frame').contentFrame().locator('#reader').evaluate(async root => {
    const { captureBookPages } = await import('/src/page-raster.ts'); await Promise.all(Array.from(root.querySelectorAll('img')).map(image => image.decode()));
    const before = (await captureBookPages(root as HTMLElement))[0]; (root.querySelector('.page-left .album-watermark') as HTMLElement).style.opacity = '0';
    const after = (await captureBookPages(root as HTMLElement))[0], a = before.getContext('2d')!.getImageData(0, 0, before.width, before.height).data, b = after.getContext('2d')!.getImageData(0, 0, after.width, after.height).data;
    let changed = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 6) changed++;
    return changed;
  });
  expect(difference).toBeGreaterThan(1000); await page.locator('#close-preview').click();
  await page.locator('.editor-export summary').click(); const waiting = page.waitForEvent('download'); await page.locator('#export-page-image').click(); const bytes = await readFile((await (await waiting).path())!); expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
});

test('content packages include the selected watermark and mobile reading remains usable', async ({ page }) => {
  await pick(page); await page.locator('.editor-export summary').click(); const waiting = page.waitForEvent('download'); await page.locator('#export-content').click();
  const pack = JSON.parse(await readFile((await (await waiting).path())!, 'utf8')); expect(pack.format).toBe('tides-album-content'); expect(pack.assets).toHaveLength(1); expect(pack.document.chapters[0].spreads[0].pages[0].watermark.assetId).toBe(pack.assets[0].id);
  await page.locator('#preview').click(); await expect(page.locator('#preview-frame')).toHaveAttribute('src', /album-preview/); const src = (await page.locator('#preview-frame').getAttribute('src'))!;
  const reading = await page.context().newPage();
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    await reading.setViewportSize(viewport); await reading.goto(src); await expect(reading.locator('.page-left .album-watermark img')).toHaveCount(2);
    await expect(reading.locator('#close-book')).toBeVisible(); expect(await reading.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await reading.locator('.page-right .album-text-body').evaluate(e => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
  }
  await reading.close();
});
