import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const left = (p: Page) => p.locator('.editor-page[data-side="0"]');
const right = (p: Page) => p.locator('.editor-page[data-side="1"]');
async function range(control: Locator, value: number) { await control.evaluate((element: HTMLInputElement, value) => { element.value = String(value); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); }, value); }
async function imageFile(page: Page) {
  const data = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 600; const x = c.getContext('2d')!; x.fillStyle = '#9ab6ab'; x.fillRect(0, 0, 800, 600); x.fillStyle = '#f2b98b'; x.fillRect(80, 120, 350, 360); x.fillStyle = '#426b72'; x.fillRect(430, 0, 370, 600); return c.toDataURL().split(',')[1]; });
  return { name: '我的图片.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}
async function saved(page: Page) { await expect(page.locator('#save-status')).toHaveText('✓ 已保存到本机'); }
test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto('/editor.html'); await saved(page); });

test('blank draft accepts Chinese composition and retains title, text and reading order after reload', async ({ page }) => {
  await expect(page.getByLabel('纪念册名称')).toHaveValue('未命名纪念册');
  await expect(page.locator('#paper-spread')).not.toContainText('风经过的地方');
  await page.getByLabel('纪念册名称').fill('我们的手帐'); await page.getByLabel('纪念册名称').press('Tab');
  const body = right(page).getByRole('textbox', { name: '页面正文' });
  await body.focus(); await body.dispatchEvent('compositionstart'); await body.fill('今天由我自己写。\n第二行也留下。'); await body.dispatchEvent('compositionend');
  await page.locator('#select-page').click(); await saved(page); await page.reload();
  await expect(page.getByLabel('纪念册名称')).toHaveValue('我们的手帐'); await expect(right(page).getByRole('textbox', { name: '页面正文' })).toHaveText('今天由我自己写。\n第二行也留下。');
  expect(await page.locator('canvas').count()).toBe(0);
});
test('paper, grid, columns and watermarks apply across a spread and undo restores the previous setting', async ({ page }) => {
  await page.getByLabel('页面设置应用到').selectOption('spread'); await page.getByLabel('纸张', { exact: true }).selectOption('watercolor');
  await expect(left(page)).toHaveAttribute('data-paper', 'watercolor'); await expect(right(page)).toHaveAttribute('data-paper', 'watercolor');
  await page.locator('summary').filter({ hasText: /^格线与点阵$/ }).click(); await page.getByLabel('格线样式').selectOption('square');
  await expect(right(page).locator('.album-grid')).toHaveClass(/album-grid-square/);
  await page.getByLabel('文字列数').selectOption('2');
  await page.locator('summary').filter({ hasText: /^图案水印$/ }).click();
  await page.getByLabel('图案主题').selectOption('paw'); await page.getByLabel('图案排布').selectOption('repeat'); await range(page.getByLabel('水印透明度'), 12);
  await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.12'); await expect(right(page).locator('.album-watermark-tile')).toHaveCount(18);
  await range(page.getByLabel('水印透明度'), 100); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '1');
  await page.locator('#undo').click(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.12');
  await page.locator('#redo').click(); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '1');
});
test('photo original and crop survive all frames and templates; controls restore crop', async ({ page }) => {
  await page.locator('#add-photo').click(); await page.locator('#image-input').setInputFiles(await imageFile(page));
  await expect(left(page).locator('.album-photo-view img')).toBeVisible();
  await range(page.getByLabel('照片取景缩放'), 1.8); await range(page.getByLabel('照片取景水平'), 28); await range(page.getByLabel('照片旋转'), 15);
  const crop = await left(page).locator('.album-photo-view img').getAttribute('style');
  for (const frame of ['white', 'polaroid', 'rounded', 'film', 'stamp', 'tape']) {
    await page.getByLabel('照片框', { exact: true }).selectOption(frame); await expect(left(page).locator('.album-photo-view img')).toHaveAttribute('style', crop!);
  }
  await page.getByLabel('照片图注').fill('作者自己的说明'); await page.getByLabel('照片图注').press('Tab');
  await page.getByLabel('页面模板').selectOption('collage');
  await expect(left(page).locator('figure.album-photo')).toHaveCount(4); await expect(left(page)).toContainText('作者自己的说明');
  await page.getByRole('button', { name: '恢复照片裁切' }).click(); await expect(page.getByLabel('照片取景缩放')).toHaveValue('1');
  await saved(page); const original = await page.evaluate(async () => { const { readDraft } = await import('/src/editor/storage.ts'); const d = await readDraft(); return { width: d!.document.assets[0].width, mime: d!.assets.values().next().value!.type }; });
  expect(original).toEqual({ width: 800, mime: 'image/png' });
});
test('sticker drag, resize and rotation are real pointer operations and one command each', async ({ page }) => {
  await page.locator('#add-sticker').click(); const sticker = left(page).locator('.album-sticker'); const start = await sticker.boundingBox();
  await page.mouse.move(start!.x + start!.width * .4, start!.y + start!.height * .6); await page.mouse.down(); await page.mouse.move(start!.x - 55, start!.y - 25, { steps: 8 }); await page.mouse.up();
  const moved = await sticker.boundingBox(); expect(moved!.x).toBeLessThan(start!.x - 30);
  await sticker.click();
  const handle = await page.getByRole('button', { name: '缩放贴纸' }).boundingBox();
  await page.mouse.move(handle!.x + 22, handle!.y + 22); await page.mouse.down(); await page.mouse.move(handle!.x + 65, handle!.y + 57, { steps: 8 }); await page.mouse.up();
  expect((await sticker.boundingBox())!.width).toBeGreaterThan(moved!.width + 10);
  await sticker.click(); const rotate = await page.getByRole('button', { name: '旋转贴纸' }).boundingBox();
  await page.mouse.move(rotate!.x + 22, rotate!.y + 22); await page.mouse.down(); await page.mouse.move(rotate!.x + 60, rotate!.y + 60, { steps: 8 }); await page.mouse.up();
  const after = await sticker.getAttribute('style'); await page.locator('#undo').click(); expect(await sticker.getAttribute('style')).not.toBe(after);
  await page.locator('#redo').click(); expect(await sticker.getAttribute('style')).toBe(after);
});
test('downloaded editable backup restores images and written text with an undoable import', async ({ page }) => {
  await left(page).getByRole('textbox', { name: '页面标题' }).fill('备份里保留的标题'); await page.locator('#select-page').click();
  await page.locator('#add-photo').click(); await page.locator('#image-input').setInputFiles(await imageFile(page)); await saved(page);
  await page.locator('.editor-export summary').click(); const download = page.waitForEvent('download'); await page.locator('#export-backup').click(); const file = await (await download).path();
  await page.locator('.editor-help summary').click(); await page.locator('#new-project').click(); await expect(left(page)).not.toContainText('备份里保留的标题');
  await page.locator('#import-backup').click(); await page.locator('#project-input').setInputFiles(file!);
  await expect(left(page)).toContainText('备份里保留的标题'); await expect(left(page).locator('.album-photo-view img')).toBeVisible();
  await page.locator('#undo').click(); await expect(left(page)).not.toContainText('备份里保留的标题');
});
test('clean single-page PNG and imported watermark use the chosen image without exporting editor handles', async ({ page }) => {
  await page.locator('summary').filter({ hasText: /^图案水印$/ }).click(); await page.getByRole('button', { name: '导入自己的水印' }).click(); await page.locator('#image-input').setInputFiles(await imageFile(page));
  await expect(left(page).locator('.album-watermark img')).toHaveCount(2); await expect(left(page).locator('.album-watermark')).toHaveCSS('opacity', '0.12');
  await page.locator('#add-sticker').click(); await expect(page.getByRole('button', { name: '缩放贴纸' })).toBeVisible();
  await page.locator('.editor-export summary').click(); const waiting = page.waitForEvent('download'); await page.locator('#export-page-image').click(); const file = await (await waiting).path();
  const png = await readFile(file!); expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]); expect(png.length).toBeGreaterThan(5000);
  await expect(page.locator('#editor-notice')).toContainText('单页图片已下载');
});
test('chapters and spreads can be copied, reordered and deleted with undo, while the last chapter is protected', async ({ page }) => {
  await page.getByRole('button', { name: '复制跨页', exact: true }).click(); await expect(page.locator('.editor-spread-link')).toHaveCount(2);
  await page.getByRole('button', { name: '上移跨页', exact: true }).click(); await expect(page.locator('.editor-spread-link.current')).toContainText('跨页 1');
  await page.getByRole('button', { name: '添加章节' }).click(); await expect(page.locator('.editor-chapter')).toHaveCount(2);
  await page.getByLabel('第2章标题').fill('第二个测试章'); await page.getByLabel('第2章标题').press('Tab'); await page.getByRole('button', { name: '上移章节', exact: true }).click(); await expect(page.getByLabel('第1章标题')).toHaveValue('第二个测试章');
  await page.getByRole('button', { name: '删除章节', exact: true }).click(); await expect(page.locator('.editor-chapter')).toHaveCount(1); await page.locator('#undo').click(); await expect(page.locator('.editor-chapter')).toHaveCount(2);
  await page.locator('#redo').click(); await page.getByRole('button', { name: '删除章节', exact: true }).click(); await expect(page.locator('.editor-chapter')).toHaveCount(1); await expect(page.locator('#editor-notice')).toContainText('至少保留一章');
});
test('two tabs preserve their own drafts and stale writer cannot silently overwrite', async ({ page, context }) => {
  const other = await context.newPage(); await other.goto('/editor.html'); await saved(other);
  await page.getByLabel('纪念册名称').fill('第一标签页的新稿'); await page.getByLabel('纪念册名称').press('Tab'); await saved(page);
  await expect(other.locator('#save-status')).toContainText('另一标签页');
  await other.getByLabel('纪念册名称').fill('第二页未保存的想法'); await other.getByLabel('纪念册名称').press('Tab');
  await expect(other.locator('#save-status')).toContainText('保存失败');
  expect(await other.evaluate(async () => (await (await import('/src/editor/storage.ts')).readDraft())!.document.title)).toBe('第一标签页的新稿');
  await other.locator('#reload-draft').click(); await expect(other.getByLabel('纪念册名称')).toHaveValue('第一标签页的新稿');
});
test('aborted autosave is shown as failure, and retry saves without losing current text', async ({ page }) => {
  await page.evaluate(() => { const original = IDBObjectStore.prototype.put; (window as any).__restorePut = () => { IDBObjectStore.prototype.put = original; }; IDBObjectStore.prototype.put = function(value, key) { const request = original.call(this, value, key); if (this.name === 'drafts') this.transaction.abort(); return request; }; });
  await page.getByLabel('纪念册名称').fill('保存失败也不丢的标题'); await page.getByLabel('纪念册名称').press('Tab'); await expect(page.locator('#save-status')).toContainText('保存失败');
  await expect(page.getByLabel('纪念册名称')).toHaveValue('保存失败也不丢的标题'); await page.evaluate(() => (window as any).__restorePut()); await page.locator('#retry-save').click(); await saved(page);
});
test('snapshot preview uses the custom pages, and mobile long copy stays readable and scrollable', async ({ page }) => {
  await right(page).getByRole('textbox', { name: '页面正文' }).fill('这是测试用长内容，用于检查阅读顺序与滚动。\n'.repeat(70)); await page.locator('#select-page').click();
  await page.locator('#preview').click(); const frame = page.frameLocator('#preview-frame'); await expect(frame.locator('.page-right')).toContainText('这是测试用长内容');
  await page.locator('#preview-mobile').click(); await expect(page.locator('#preview-frame')).toHaveCSS('width', '390px');
  const layout = await frame.locator('.page-right .album-text-body').evaluate(element => ({ font: parseFloat(getComputedStyle(element).fontSize), width: element.getBoundingClientRect().width, total: document.documentElement.scrollWidth, viewport: innerWidth, scroll: document.querySelector('#book')!.scrollHeight, client: document.querySelector('#book')!.clientHeight }));
  expect(layout.font).toBeGreaterThanOrEqual(16); expect(layout.total).toBeLessThanOrEqual(layout.viewport); expect(layout.scroll).toBeGreaterThan(layout.client * 2);
  await frame.locator('#book').evaluate(e => { e.scrollTop = e.scrollHeight; }); await expect(frame.locator('#close-book')).toBeVisible();
  await page.locator('#close-preview').click(); await expect(right(page)).toContainText('这是测试用长内容');
});
test('a custom turning leaf carries previous recto, next verso and matching underlay', async ({ page }) => {
  await right(page).getByRole('textbox', { name: '页面标题' }).fill('第一页的右侧'); await page.locator('#select-page').click();
  await page.locator('#add-spread').click(); await left(page).getByRole('textbox', { name: '页面标题' }).fill('下一页的左侧'); await page.locator('#select-page').click();
  await right(page).getByRole('textbox', { name: '页面标题' }).fill('下一页的右侧'); await page.locator('#select-page').click();
  await page.locator('#preview').click(); const frame = page.frameLocator('#preview-frame'); await expect(frame.locator('.page-right')).toContainText('第一页的右侧');
  await frame.locator('#next').click(); await expect(frame.locator('.turn-leaf')).toBeVisible();
  await frame.locator('.turn-leaf').evaluate(element => element.getAnimations().forEach(animation => animation.pause()));
  await expect(frame.locator('.leaf-front')).toContainText('第一页的右侧'); await expect(frame.locator('.leaf-back')).toContainText('下一页的左侧'); await expect(frame.locator('.turn-underlay')).toContainText('下一页的右侧');
  await frame.locator('.turn-leaf').evaluate(element => element.getAnimations().forEach(animation => animation.finish()));
  await expect(frame.locator('#chapter-count')).toHaveText('02 / 02 跨页');
});
