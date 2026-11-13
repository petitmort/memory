import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const left = (page: Page) => page.locator('.editor-page[data-side="0"]');
const right = (page: Page) => page.locator('.editor-page[data-side="1"]');
const saved = (page: Page) => expect(page.locator('#save-status')).toHaveText('✓ 已保存到本机');
async function preview(control: Locator, value: number) {
  await control.evaluate((element: HTMLInputElement, value) => { element.value = String(value); element.dispatchEvent(new Event('input', { bubbles: true })); }, value);
}
async function settle(page: Page) { await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))); }
async function pattern(page: Page) { await page.locator('summary').filter({ hasText: /^图案水印$/ }).click(); }

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/editor.html'); await saved(page);
  // All tests own an isolated browser draft, never the author's local storage.
  await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), s = await import('/src/editor/storage.ts');
    const doc = m.newDocument(), canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 600;
    const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#9bbcb5'; ctx.fillRect(0, 0, 800, 600); ctx.fillStyle = '#ead3ab'; ctx.fillRect(400, 100, 300, 300);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(blob => resolve(blob!), 'image/png')), assetId = m.id();
    doc.assets.push({ id: assetId, name: '交互测试图.png', mime: 'image/png', width: 800, height: 600 });
    (doc.chapters[0].spreads[0].pages[0].elements.find(e => e.type === 'photo') as any).assetId = assetId;
    const pages = doc.chapters[0].spreads[0].pages;
    for (const page of pages) { page.watermark.mode = 'repeat'; page.watermark.opacity = .12; page.watermark.density = 4; }
    (pages[1].elements.find(e => e.type === 'text' && e.role === 'title') as any).text = '测试用标题';
    (pages[1].elements.find(e => e.type === 'text' && e.role === 'body') as any).text = '正文保持自己的顺序。';
    await s.saveDraft(doc, new Map([[assetId, blob]]), (await s.readDraft())!.version);
  });
  await page.reload(); await saved(page); await expect(left(page).locator('img')).toBeVisible();
});

test('paper and font changes retain decoded photos, native focus and chapter controls', async ({ page }) => {
  await page.getByLabel('页面设置应用到').selectOption('spread');
  await right(page).getByRole('textbox', { name: '页面标题' }).click();
  await page.evaluate(() => { (window as any).__refs = { image: document.querySelector('.editor-page img'), paper: document.querySelector('[aria-label="纸张"]'), font: document.querySelector('[aria-label="字体"]'), chapter: document.querySelector('[aria-label="第1章标题"]'), text: document.querySelector('.editor-page[data-side="1"] [data-text]') }; });
  const paper = page.getByLabel('纸张', { exact: true }), font = page.getByLabel('字体', { exact: true });
  await paper.focus(); await paper.selectOption('kraft'); await expect(paper).toBeFocused();
  await expect(page.getByLabel('纸张底色')).toHaveValue('#d9bc90'); await expect(left(page)).toHaveAttribute('data-paper', 'kraft'); await expect(right(page)).toHaveAttribute('data-paper', 'kraft');
  await font.focus(); await font.selectOption('sans'); await expect(font).toBeFocused();
  await expect(right(page).locator('.album-text-title')).toHaveAttribute('data-font', 'sans');
  expect(await page.evaluate(() => Object.values((window as any).__refs).every((node: any) => node.isConnected))).toBe(true);
  await saved(page); await page.reload(); await expect(right(page).locator('.album-text-title')).toHaveAttribute('data-font', 'sans'); await expect(right(page)).toHaveAttribute('data-paper', 'kraft');
});

test('a held opacity slider paints every value, preserves capture and saves one undo command', async ({ page }) => {
  await page.getByLabel('页面设置应用到').selectOption('spread'); await pattern(page);
  const slider = page.getByLabel('水印透明度'); await slider.scrollIntoViewIfNeeded();
  await slider.evaluate(element => { (window as any).__slider = element; (window as any).__image = document.querySelector('.editor-page img'); });
  const box = (await slider.boundingBox())!; await page.mouse.move(box.x + box.width * .25, box.y + box.height / 2); await page.mouse.down();
  for (const fraction of [.35, .55, .8]) {
    await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
    await expect.poll(async () => Number(await left(page).locator('.album-watermark').evaluate(e => getComputedStyle(e).opacity))).toBeCloseTo(Number(await slider.inputValue()) / 100, 2);
    await expect(right(page).locator('.album-watermark')).toHaveCSS('opacity', await left(page).locator('.album-watermark').evaluate(e => getComputedStyle(e).opacity));
    expect(await slider.evaluate(element => element === (window as any).__slider && (window as any).__image.isConnected)).toBe(true);
  }
  const final = Number(await slider.inputValue()) / 100; await page.mouse.up();
  await page.locator('#undo').click(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.12');
  await page.locator('#redo').click(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', String(final));
  await saved(page); await page.reload(); await expect(right(page).locator('.album-watermark')).toHaveCSS('opacity', String(final));
});

test('size, angle and density keep existing imported watermark images while updating the pattern', async ({ page }) => {
  await pattern(page); await page.getByRole('button', { name: '导入自己的水印' }).click();
  const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!; x.fillStyle = '#6d998a'; x.fillRect(0, 0, 64, 64); return c.toDataURL().split(',')[1]; });
  await page.locator('#image-input').setInputFiles({ name: '测试水印.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
  await expect(left(page).locator('.album-watermark img')).toHaveCount(32);
  await page.evaluate(() => { (window as any).__watermarkImage = document.querySelector('.album-watermark img'); });
  for (const [label, value] of [['图案大小', 64], ['图案角度', 35], ['图案密度', 6]] as const) {
    const control = page.getByLabel(label); await preview(control, value); await settle(page);
    expect(await page.evaluate(() => (window as any).__watermarkImage === document.querySelector('.album-watermark img'))).toBe(true);
    await control.dispatchEvent('change');
  }
  await expect(left(page).locator('.album-watermark img')).toHaveCount(72); await expect(left(page).locator('.album-watermark-tile').first()).toHaveCSS('width', '64px');
  await expect(left(page).locator('.album-watermark-tile').first()).toHaveAttribute('style', /rotate\(35deg\)/);
  await page.locator('#undo').click(); await expect(left(page).locator('.album-watermark img')).toHaveCount(32);
});

for (const boundary of ['blur', 'hidden'] as const) test(`unfinished slider input is committed and saved on ${boundary}`, async ({ page }) => {
  await pattern(page); await preview(page.getByLabel('水印透明度'), 57); await settle(page);
  await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.57');
  await page.evaluate(boundary => {
    if (boundary === 'blur') window.dispatchEvent(new Event('blur'));
    else { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); delete (document as any).hidden; }
  }, boundary);
  await saved(page); await page.reload(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.57');
});

test('preview and editable backup finalize the latest live value without extra undo steps', async ({ page }) => {
  await pattern(page); await preview(page.getByLabel('水印透明度'), 64); await page.locator('#preview').click();
  await expect(page.frameLocator('#preview-frame').locator('.page-left .album-watermark')).toHaveCSS('opacity', '0.64');
  await page.locator('#close-preview').click(); await page.locator('#undo').click(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.12');
  await page.locator('#redo').click(); await preview(page.getByLabel('水印透明度'), 39);
  await page.locator('.editor-export summary').click(); const waiting = page.waitForEvent('download'); await page.locator('#export-backup').click();
  const backup = JSON.parse(await readFile((await (await waiting).path())!, 'utf8'));
  expect(backup.document.chapters[0].spreads[0].pages[0].watermark.opacity).toBe(.39);
  await page.locator('#undo').click(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.64');
});

test('live crop and frame settings reuse the photo and one undo restores the original crop', async ({ page }) => {
  await left(page).locator('figure.album-photo').click();
  await page.evaluate(() => { (window as any).__photo = document.querySelector('.album-photo-view img'); });
  const slider = page.getByLabel('照片取景缩放'); await slider.scrollIntoViewIfNeeded(); const box = (await slider.boundingBox())!;
  await page.mouse.move(box.x + box.width * .2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width * .6, box.y + box.height / 2); await settle(page);
  await expect(left(page).locator('.album-photo-view img')).not.toHaveAttribute('style', /scale\(1\)/); expect(await page.evaluate(() => (window as any).__photo === document.querySelector('.album-photo-view img'))).toBe(true);
  await page.mouse.up(); await page.locator('#undo').click(); await expect(left(page).locator('.album-photo-view img')).toHaveAttribute('style', /scale\(1\)/);
  await left(page).locator('figure.album-photo').click(); await page.evaluate(() => { (window as any).__photo = document.querySelector('.album-photo-view img'); });
  for (const frame of ['polaroid', 'film', 'stamp', 'tape']) await page.getByLabel('照片框', { exact: true }).selectOption(frame);
  expect(await page.evaluate(() => (window as any).__photo === document.querySelector('.album-photo-view img'))).toBe(true); await expect(left(page).locator('figure')).toHaveClass(/album-frame-tape/);
});

test('retained element controls delete the selected element after reordering, with undo', async ({ page }) => {
  await right(page).getByRole('textbox', { name: '页面标题' }).click(); await page.getByRole('button', { name: '向前一层', exact: true }).click();
  await page.getByRole('button', { name: '删除元素', exact: true }).click(); await expect(right(page).getByRole('textbox', { name: '页面标题' })).toHaveCount(0); await expect(right(page)).toContainText('正文保持自己的顺序。');
  await page.locator('#undo').click(); await expect(right(page).getByRole('textbox', { name: '页面标题' })).toHaveText('测试用标题'); await expect(right(page)).toContainText('正文保持自己的顺序。');
});

test('incremental authoring matches the complete shared renderer across styles and document replacement', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), r = await import('/src/album/renderer.ts');
    let p = m.newDocument().chapters[0].spreads[0].pages[1];
    const photo = m.photoElement(), sticker = m.stickerElement(); photo.assetId = 'test'; p.elements.push(photo, sticker);
    const resolveAsset = () => 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="8" height="8"%3E%3Cpath fill="%239ab6ab" d="M0 0h8v8H0z"/%3E%3C/svg%3E';
    const full = document.createElement('article'), incremental = document.createElement('article'), mismatches: string[] = []; let states = 0;
    const compare = (label: string) => { r.renderAlbumPage(full, p, { resolveAsset, editable: true, number: 1 }); r.updateAlbumPage(incremental, p, { resolveAsset, editable: true, number: 1 }); states++; if (full.outerHTML !== incremental.outerHTML) mismatches.push(label); };
    compare('initial');
    for (const paper of Object.keys(m.PAPER_NAMES)) { p.paper.kind = paper as any; p.paper.texture = .55; compare(`paper:${paper}`); }
    for (const frame of Object.keys(m.FRAME_NAMES)) { photo.frame = frame as any; photo.crop = { zoom: 1.85, x: 28, y: 71, rotation: 17 }; compare(`frame:${frame}`); }
    for (const template of Object.keys(m.TEMPLATE_NAMES)) { m.applyTemplate(p, template as any); compare(`template:${template}`); }
    for (const kind of ['none', 'ruled', 'square', 'dotted']) { p.grid.kind = kind as any; p.grid.spacing = 29; p.grid.opacity = .37; compare(`grid:${kind}`); }
    for (const mode of ['single', 'corner', 'border', 'repeat']) for (const opacity of [0, .12, 1]) { p.watermark.mode = mode as any; p.watermark.opacity = opacity; p.watermark.size = 64; p.watermark.rotation = 28; p.watermark.density = 5; compare(`watermark:${mode}:${opacity}`); }
    p.watermark.assetId = 'test'; compare('custom watermark'); p.watermark.size = 83; p.watermark.rotation = -35; compare('custom geometry');
    for (const font of Object.keys(m.FONT_NAMES)) { const text = p.elements.find(e => e.type === 'text') as any; text.font = font; text.text = '测试文本\n下一行'; compare(`font:${font}`); }
    p = m.copy(p); compare('document replacement'); p.elements = []; compare('empty');
    return { states, mismatches };
  });
  expect(result.states).toBe(42); expect(result.mismatches).toEqual([]);
});
