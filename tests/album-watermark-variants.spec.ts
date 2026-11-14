import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const left = (page: Page) => page.locator('.editor-page[data-side="0"]');
const saved = (page: Page) => expect(page.locator('#save-status')).toHaveText('✓ 已保存到本机');
const draft = (page: Page) => page.evaluate(async () => (await (await import('/src/editor/storage.ts')).readDraft())!.document);
async function amount(input: Locator, value: number, commit = true) {
  await input.evaluate((e: HTMLInputElement, { value, commit }) => { e.value = String(value); e.dispatchEvent(new Event('input', { bubbles: true })); if (commit) e.dispatchEvent(new Event('change', { bubbles: true })); }, { value, commit });
}
async function pick(page: Page, name = '橘猫·抬头') {
  const choice = page.getByRole('button', { name: `使用水印：${name}`, exact: true }); await choice.click();
  await expect(choice).toHaveAttribute('aria-pressed', 'true'); await saved(page);
}
test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/editor.html'); await saved(page); await page.locator('#open-watermarks').click();
});

test('all families have independent generated kinds, original colors and actual detail choices', async ({ page }) => {
  const data = await page.evaluate(async () => {
    const { WATERMARK_PRESETS: all } = await import('/src/editor/watermark-library.ts');
    return { total: all.length, first: all[0].key, hashes: new Set(all.map(p => p.sha256)).size,
      families: ['cats', 'flowers', 'seaside', 'stars', 'leaves', 'sentiments'].map(category => {
        const p = all.filter(p => p.category === category);
        return { category, kinds: new Set(p.map(p => p.kind)).size, colors: new Set(p.map(p => p.color)).size, details: new Set(p.flatMap(p => p.details)).size };
      }), cats: all.filter(p => p.category === 'cats' && p.kind !== '猫爪').map(p => ({ name: p.name, details: p.details })) };
  });
  expect(data.total).toBe(169); expect(data.first).toBe('paw'); expect(data.hashes).toBe(169);
  for (const family of data.families) { expect(family.kinds).toBeGreaterThanOrEqual(2); expect(family.colors).toBeGreaterThanOrEqual(3); expect(family.details).toBeGreaterThanOrEqual(5); }
  for (const detail of ['蜷睡', '眨眼', '打哈欠', '背影', '抬爪', '朝左', '朝右']) expect(data.cats.some(p => p.details.includes(detail))).toBe(true);
});

test('kind, original color and detail combine without writing a draft and survive image selection', async ({ page }) => {
  const initial = await draft(page);
  await page.getByLabel('水印分类').selectOption('cats'); await page.getByLabel('水印种类').selectOption('橘猫'); await page.getByLabel('水印原色').selectOption('橘白'); await page.getByLabel('水印动作与细节').selectOption('蜷睡');
  const visible = page.locator('.editor-watermark-choice:visible'); await expect(visible).toHaveCount(1); await expect(visible).toHaveText('橘猫·蜷睡');
  expect(await draft(page)).toEqual(initial); await expect(page.locator('#undo')).toBeDisabled(); await visible.click(); await saved(page);
  await expect(page.getByLabel('水印种类')).toHaveValue('橘猫'); await expect(page.getByLabel('水印动作与细节')).toHaveValue('蜷睡');
  await page.locator('#other-page').click(); await expect(page.getByLabel('水印原色')).toHaveValue('橘白'); await expect(visible).toHaveCount(1);
  await page.getByLabel('水印动作与细节').selectOption('眨眼'); await expect(visible).toHaveCount(0); await page.getByRole('button', { name: '清除筛选' }).click();
  await expect(page.getByLabel('水印分类')).toHaveValue('all'); await expect(visible).toHaveCount(169);
});

test('new shooting-star and long-tail bow can be found by actual details and selected without losing effects', async ({ page }) => {
  const initial = await draft(page);
  await page.getByLabel('水印分类').selectOption('stars'); await page.getByLabel('水印种类').selectOption('流星');
  await page.getByLabel('水印原色').selectOption('金蓝紫'); await page.getByLabel('水印动作与细节').selectOption('双色尾迹');
  await expect(page.locator('.editor-watermark-choice:visible')).toHaveText('流星·蓝紫尾迹');
  expect(await draft(page)).toEqual(initial); await pick(page, '流星·蓝紫尾迹');
  await page.getByLabel('左右镜像').check(); await amount(page.getByLabel('水印色相'), -40);
  await page.getByLabel('水印分类').selectOption('sentiments'); await page.getByLabel('水印种类').selectOption('蝴蝶结');
  await page.getByLabel('搜索水印').fill('长飘带');
  await expect(page.locator('.editor-watermark-choice:visible')).toHaveCount(2); await pick(page, '粉色细带长尾结');
  await page.reload(); await saved(page); await page.locator('#open-watermarks').click();
  await expect(page.getByRole('button', { name: '使用水印：粉色细带长尾结', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('水印色相')).toHaveValue('-40'); await expect(page.getByLabel('左右镜像')).toBeChecked();
  const image = left(page).locator('.album-watermark img').first(); await image.evaluate((i: HTMLImageElement) => i.decode());
  const bytes = await page.evaluate(async () => { const s = (await (await import('/src/editor/storage.ts')).readDraft())!; const id = s.document.chapters[0].spreads[0].pages[0].watermark.assetId; return (await (await import('/src/editor/watermark-library.ts')).imageHash(s.assets.get(id)!)); });
  const entry = JSON.parse(await readFile('src/editor/watermarks/catalog.json', 'utf8')).find((p: { key: string }) => p.key === 'extra-bow-ribbon-flowing');
  expect(bytes).toBe(entry.sha256);
});

test('held color adjustment retains image and input nodes, previews every value and is one undo', async ({ page }) => {
  await pick(page); await page.getByLabel('左右镜像', { exact: true }).check();
  const hue = page.getByLabel('水印色相'); await hue.scrollIntoViewIfNeeded();
  await hue.evaluate(e => { (window as any).__variantNodes = [e, document.querySelector('.editor-page .album-watermark img'), document.querySelector('.editor-watermark-swatch img')]; });
  const box = (await hue.boundingBox())!; await page.mouse.move(box.x + box.width * .5, box.y + box.height / 2); await page.mouse.down();
  const values = [];
  for (const fraction of [.6, .7, .8]) {
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2); const value = Number(await hue.inputValue()); values.push(value);
    await expect(left(page).locator('.album-watermark')).toHaveCSS('filter', `hue-rotate(${value}deg) saturate(1) brightness(1)`);
    expect(await page.evaluate(() => (window as any).__variantNodes.every((n: Element) => n.isConnected))).toBe(true);
  }
  await page.mouse.up(); expect(new Set(values).size).toBe(3); await saved(page);
  await page.locator('#undo').click(); await expect(hue).toHaveValue('0'); await expect(page.getByLabel('左右镜像')).toBeChecked();
  await page.locator('#redo').click(); await expect(hue).toHaveValue(String(values.at(-1))); await saved(page);
  await page.reload(); await saved(page); await page.locator('#open-watermarks').click(); await expect(page.getByLabel('水印色相')).toHaveValue(String(values.at(-1))); await expect(page.getByLabel('左右镜像')).toBeChecked();
});

test('scope, new original choice, reset and undo preserve other layout settings', async ({ page }) => {
  await page.getByLabel('页面设置应用到').selectOption('spread'); await pick(page);
  await page.getByLabel('左右镜像').check(); await page.getByLabel('上下镜像').check();
  await amount(page.getByLabel('水印饱和度'), 45); await amount(page.getByLabel('水印明亮度'), 125); await amount(page.getByLabel('图案角度'), 35);
  await pick(page, '三花猫·回头背影'); await saved(page);
  const pages = (await draft(page)).chapters[0].spreads[0].pages;
  for (const p of pages) expect(p.watermark).toMatchObject({ flipX: true, flipY: true, saturation: .45, brightness: 1.25, rotation: 35 });
  await page.getByRole('button', { name: '恢复镜像与原色', exact: true }).click(); await expect(page.getByLabel('水印明亮度')).toHaveValue('100'); await expect(page.getByLabel('左右镜像')).not.toBeChecked();
  await expect(page.getByLabel('图案角度')).toHaveValue('35'); await expect(left(page).locator('.album-watermark')).toHaveCSS('filter', 'none');
  await page.locator('#undo').click(); await expect(page.getByLabel('水印明亮度')).toHaveValue('125'); await expect(page.getByLabel('上下镜像')).toBeChecked();
});

test('old schema-1 documents remain unchanged and malformed optional effects are rejected', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), d = m.newDocument(), old = JSON.stringify(d);
    const unchanged = JSON.stringify(m.validateDocument(d)) === old;
    const invalid = [{ flipX: 1 }, { flipY: null }, { hue: 181 }, { hue: '30' }, { saturation: -1 }, { brightness: 2.01 }].map(effect => {
      const copy = m.copy(d); Object.assign(copy.chapters[0].spreads[0].pages[0].watermark, effect); try { m.validateDocument(copy); return false; } catch { return true; }
    });
    const w = d.chapters[0].spreads[0].pages[0].watermark; Object.assign(w, { flipX: true, flipY: false, hue: -180, saturation: 0, brightness: 2 });
    return { unchanged, invalid, valid: m.validateDocument(d).chapters[0].spreads[0].pages[0].watermark };
  });
  expect(result.unchanged).toBe(true); expect(result.invalid).toEqual([true, true, true, true, true, true]); expect(result.valid).toMatchObject({ flipX: true, hue: -180, saturation: 0, brightness: 2 });
});

test('mirroring and color changes affect real reader and physical-page capture pixels', async ({ page }) => {
  await pick(page, '粉色细带长尾结'); await page.getByLabel('图案排布').selectOption('repeat'); await amount(page.getByLabel('水印透明度'), 100); await amount(page.getByLabel('图案大小'), 120);
  await page.getByLabel('左右镜像').check(); await amount(page.getByLabel('水印色相'), 120); await amount(page.getByLabel('水印饱和度'), 160);
  await page.locator('#preview').click(); const frame = page.locator('#preview-frame').contentFrame();
  await expect(frame.locator('.page-left .album-watermark')).toHaveCSS('filter', 'hue-rotate(120deg) saturate(1.6) brightness(1)');
  const difference = await frame.locator('#reader').evaluate(async root => {
    const { captureBookPages } = await import('/src/page-raster.ts'); await Promise.all(Array.from(root.querySelectorAll('img')).map(i => i.decode()));
    const changed = (a: HTMLCanvasElement, b: HTMLCanvasElement) => { const x = a.getContext('2d')!.getImageData(0, 0, a.width, a.height).data, y = b.getContext('2d')!.getImageData(0, 0, b.width, b.height).data; let count = 0; for (let i = 0; i < x.length; i += 4) if (Math.abs(x[i] - y[i]) + Math.abs(x[i + 1] - y[i + 1]) + Math.abs(x[i + 2] - y[i + 2]) > 20) count++; return count; };
    const adjusted = (await captureBookPages(root as HTMLElement))[0];
    const layer = root.querySelector<HTMLElement>('.page-left .album-watermark')!; layer.style.filter = 'none';
    const originalColor = (await captureBookPages(root as HTMLElement))[0];
    layer.querySelectorAll<HTMLElement>('.album-watermark-tile').forEach(tile => { tile.style.transform = tile.style.transform.replace(/scale\([^)]*\)/, ''); });
    const originalDirection = (await captureBookPages(root as HTMLElement))[0];
    return { color: changed(adjusted, originalColor), mirror: changed(originalColor, originalDirection) };
  });
  expect(difference.color).toBeGreaterThan(1000); expect(difference.mirror).toBeGreaterThan(1000); await page.locator('#close-preview').click();
  await page.locator('.editor-export summary').click(); const waiting = page.waitForEvent('download'); await page.locator('#export-page-image').click();
  const bytes = await readFile((await (await waiting).path())!); expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = await page.evaluate(async encoded => {
    const stored = (await (await import('/src/editor/storage.ts')).readDraft())!, m = await import('/src/album/document.ts'), { pageImage } = await import('/src/editor/page-image.ts');
    const urls = new Map(Array.from(stored.assets, ([id, blob]) => [id, URL.createObjectURL(blob)]));
    try {
      const spread = m.copy(stored.document.chapters[0].spreads[0]), adjusted = await pageImage(spread, 0, id => urls.get(id), 1);
      Object.assign(spread.pages[0].watermark, { flipX: false, hue: 0, saturation: 1 });
      const original = await pageImage(spread, 0, id => urls.get(id), 1);
      const decode = async (src: string) => { const i = new Image(); i.src = src; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d')!.drawImage(i, 0, 0); return c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data; };
      const blobData = async (blob: Blob) => { const url = URL.createObjectURL(blob); try { return await decode(url); } finally { URL.revokeObjectURL(url); } };
      const [actual, expected, neutral] = await Promise.all([decode('data:image/png;base64,' + encoded), blobData(adjusted), blobData(original)]);
      let changed = 0; for (let i = 0; i < actual.length; i += 4) if (Math.abs(actual[i] - neutral[i]) + Math.abs(actual[i + 1] - neutral[i + 1]) + Math.abs(actual[i + 2] - neutral[i + 2]) > 20) changed++;
      return { matches: actual.length === expected.length && actual.every((n, i) => n === expected[i]), changed };
    } finally { urls.forEach(url => URL.revokeObjectURL(url)); }
  }, bytes.toString('base64'));
  expect(png.matches).toBe(true); expect(png.changed).toBeGreaterThan(1000);
});

test('both faces of a moving leaf retain their own image direction and palette', async ({ page }) => {
  await pick(page); await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), s = await import('/src/editor/storage.ts'), stored = (await s.readDraft())!, d = stored.document;
    const first = d.chapters[0].spreads[0], next = m.makeSpread(); d.chapters[0].spreads.push(next);
    first.pages[1].watermark = { ...first.pages[0].watermark, flipY: true, hue: 35 };
    next.pages[0].watermark = { ...first.pages[0].watermark, flipX: true, hue: -80 };
    await s.saveDraft(d, stored.assets, stored.version);
  }); await page.reload(); await saved(page); await page.locator('#preview').click();
  const frame = page.locator('#preview-frame').contentFrame(); await expect(frame.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  await frame.locator('#book').evaluate(book => {
    new MutationObserver(() => book.querySelector('.turn-leaf')?.getAnimations().forEach(a => { a.pause(); a.currentTime = 150; })).observe(book, { childList: true });
  });
  await frame.locator('#next').click(); await expect(frame.locator('.leaf-front .album-watermark')).toHaveCSS('filter', 'hue-rotate(35deg) saturate(1) brightness(1)');
  await expect(frame.locator('.leaf-back .album-watermark')).toHaveCSS('filter', 'hue-rotate(-80deg) saturate(1) brightness(1)');
  await expect(frame.locator('.leaf-front .album-watermark-tile').first()).toHaveAttribute('style', /scale\(1,\s*-1\)/);
  await expect(frame.locator('.leaf-back .album-watermark-tile').first()).toHaveAttribute('style', /scale\(-1,\s*1\)/);
  await expect(frame.locator('.leaf-back .album-watermark img')).toHaveCount(2);
});

test('backup and public package keep effects and original variants remain portable', async ({ page }) => {
  await pick(page, '蓝灰猫爪·白袖口'); await page.getByLabel('左右镜像').check(); await amount(page.getByLabel('水印色相'), -70); await amount(page.getByLabel('水印饱和度'), 65); await amount(page.getByLabel('水印明亮度'), 120); await saved(page);
  const original = (await draft(page)).chapters[0].spreads[0].pages[0].watermark;
  await page.locator('.editor-export summary').click();
  const backupWaiting = page.waitForEvent('download'); await page.locator('#export-backup').click(); const filename = (await (await backupWaiting).path())!;
  const backup = JSON.parse(await readFile(filename, 'utf8')); expect(backup.document.chapters[0].spreads[0].pages[0].watermark).toEqual(original);
  const publicWaiting = page.waitForEvent('download'); await page.locator('#export-content').click(); const pack = JSON.parse(await readFile((await (await publicWaiting).path())!, 'utf8'));
  expect(pack.document.chapters[0].spreads[0].pages[0].watermark).toEqual(original); expect(pack.assets).toHaveLength(1);
  await page.locator('.editor-help summary').click(); await page.locator('#new-project').click(); await page.locator('#import-backup').click(); await page.locator('#project-input').setInputFiles(filename); await saved(page);
  const restored = (await draft(page)).chapters[0].spreads[0].pages[0].watermark;
  // Existing undo-only originals reserve their IDs, so import may remap an ID.
  expect({ ...restored, assetId: original.assetId }).toEqual(original);
  const hash = await page.evaluate(async id => { const s = await (await import('/src/editor/storage.ts')).readDraft(); return await (await import('/src/editor/watermark-library.ts')).imageHash(s!.assets.get(id)!); }, restored.assetId);
  expect(original.assetId).toBe(`wm-${hash}`);
});

for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) test(`variant controls are reachable without horizontal overflow at ${size.width}×${size.height}`, async ({ page }) => {
  await page.setViewportSize(size);
  await page.getByLabel('水印分类').selectOption('cats'); await page.getByLabel('水印种类').selectOption('三花猫'); await expect(page.locator('.editor-watermark-choice:visible')).toHaveCount(1); await pick(page, '三花猫·回头背影');
  await page.getByLabel('左右镜像').check(); await amount(page.getByLabel('水印饱和度'), 60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '恢复镜像与原色' }).scrollIntoViewIfNeeded(); await expect(page.getByRole('button', { name: '恢复镜像与原色' })).toBeInViewport();
  await page.locator('#preview').click(); await expect(page.frameLocator('#preview-frame').locator('.page-left .album-watermark img')).toHaveCount(2);
});
