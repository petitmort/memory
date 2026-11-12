import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, enterFixtureRoom, openFixtureBook, closeFixtureBook } from './helpers/experience-scene';

async function snapshot(page: Page, hand = false, long = false) {
  await page.goto('/album-preview.html');
  return await page.evaluate(async ({ hand, long }) => {
    const m = await import('/src/album/document.ts'), { savePreview } = await import('/src/editor/storage.ts'), d = m.newDocument();
    d.chapters[0].title = '作者的测试章'; d.chapters[0].spreads.push(m.makeSpread());
    const first = d.chapters[0].spreads[0], second = d.chapters[0].spreads[1];
    const title = first.pages[1].elements.find(e => e.type === 'text' && e.role === 'title') as any;
    title.text = '潮汐之间 · 中文手帐'; title.font = hand ? 'hand' : 'serif';
    const body = first.pages[1].elements.find(e => e.type === 'text' && e.role === 'body') as any;
    body.text = '这段文字只用于验证排版与阅读。\n'.repeat(long ? 70 : 3); body.font = hand ? 'hand' : 'serif';
    (second.pages[0].elements.find(e => e.type === 'text') as any).text = '第二跨页的左页';
    (second.pages[1].elements.find(e => e.type === 'text') as any).text = '第二跨页的右页';
    first.pages[0].watermark = { ...first.pages[0].watermark, opacity: .3, motif: 'paw', mode: 'repeat' };
    first.pages[1].paper.kind = 'watercolor'; first.pages[1].grid.kind = 'square'; first.pages[1].layout.columns = 2;
    const c = document.createElement('canvas'); c.width = 800; c.height = 600; const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#a1c6c0'; ctx.fillRect(0, 0, 800, 600); ctx.fillStyle = '#d88862'; ctx.fillRect(180, 0, 220, 600); ctx.fillStyle = '#233d48'; ctx.fillRect(500, 0, 300, 600);
    const blob = await new Promise<Blob>(resolve => c.toBlob(blob => resolve(blob!), 'image/png')), assetId = m.id();
    d.assets.push({ id: assetId, name: '测试裁切.png', mime: 'image/png', width: 800, height: 600 });
    const photo = first.pages[0].elements[0] as any; photo.assetId = assetId; photo.caption = '照片说明 · 保持至少14px'; photo.crop.zoom = 1.4; photo.crop.x = 75; photo.frame = 'rounded';
    return await savePreview(d, new Map([[assetId, blob]]));
  }, { hand, long });
}
test('raster captures self-hosted Chinese font, inline watermarks, paper and cropped photograph', async ({ page }) => {
  const token = await snapshot(page, true); await page.goto(`/album-preview.html?albumPreview=${token}`);
  await expect(page.locator('.page-right')).toContainText('中文手帐');
  const result = await page.evaluate(async () => {
    await document.fonts.load('28px "Tides Hand"', '潮汐之间中文手帐');
    const { captureBookPages } = await import('/src/page-raster.ts');
    const before = await captureBookPages(document.querySelector('#reader')!);
    const text = document.querySelectorAll<HTMLElement>('.page-right .album-text');
    text.forEach(e => { e.dataset.font = 'serif'; e.style.fontFamily = 'serif'; });
    const after = await captureBookPages(document.querySelector('#reader')!);
    const a = before[1].getContext('2d')!.getImageData(0, 0, before[1].width, before[1].height).data;
    const b = after[1].getContext('2d')!.getImageData(0, 0, after[1].width, after[1].height).data;
    let diff = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 30) diff++;
    const left = before[0].getContext('2d')!.getImageData(0, 0, before[0].width, before[0].height).data;
    let colored = 0; for (let i = 0; i < left.length; i += 4) if (left[i + 2] > left[i] + 8 || left[i] > left[i + 1] + 30) colored++;
    return { fontReady: document.fonts.check('28px "Tides Hand"', '潮汐之间中文手帐'), diff, colored, width: before[0].width, height: before[0].height };
  });
  expect(result.fontReady).toBe(true); expect(result.diff).toBeGreaterThan(500); expect(result.colored).toBeGreaterThan(5000); expect(result.width).toBeGreaterThan(250); expect(result.height).toBeGreaterThan(400);
});
test('custom long reading remains reachable at all four acceptance dimensions', async ({ page }) => {
  const token = await snapshot(page, false, true);
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport); await page.goto(`/album-preview.html?albumPreview=${token}`); await expect(page.locator('.page-right')).toContainText('中文手帐');
    await page.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.querySelectorAll('img')).map(image => image.decode().catch(() => {}))); });
    const layout = await page.evaluate(() => {
      const rect = (id: string) => document.getElementById(id)!.getBoundingClientRect().toJSON();
      return { width: innerWidth, overflow: document.documentElement.scrollWidth, close: rect('close-book'), contents: rect('chapter-contents-toggle'), body: parseFloat(getComputedStyle(document.querySelector('.page-right .album-text-body')!).fontSize), caption: parseFloat(getComputedStyle(document.querySelector('figcaption')!).fontSize), book: document.querySelector('#book')!.scrollHeight, client: document.querySelector('#book')!.clientHeight, columns: getComputedStyle(document.querySelector('.page-right .album-copy')!).columnCount };
    });
    expect(layout.overflow).toBeLessThanOrEqual(viewport.width); expect(layout.body).toBeGreaterThanOrEqual(16); expect(layout.caption).toBeGreaterThanOrEqual(14); expect(layout.book).toBeGreaterThan(layout.client);
    if (viewport.width < 760) expect(layout.columns).toBe('1');
    for (const rect of [layout.close, layout.contents]) { expect(rect.top).toBeGreaterThanOrEqual(0); expect(rect.bottom).toBeLessThanOrEqual(viewport.height); expect(rect.height).toBeGreaterThanOrEqual(44); }
    const tail = await page.locator('#book').evaluate(book => { book.scrollTo({ top: book.scrollHeight, behavior: 'instant' }); return { text: document.querySelector('.page-right .album-text-body')!.getBoundingClientRect().bottom, bottom: book.getBoundingClientRect().bottom, scroll: book.scrollTop, height: book.scrollHeight, width: innerWidth }; });
    expect(tail.text, JSON.stringify(tail)).toBeLessThanOrEqual(tail.bottom + 1);
    await page.locator('#chapter-contents-toggle').click(); await page.locator('[data-chapter="1"]').click(); await expect(page.locator('#book > .page-left')).toContainText('第二跨页的左页');
  }
});
test('room preview opens and returns at the retained custom spread without using the sample chapter', async ({ page }) => {
  const token = await snapshot(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await mockExperienceScene(page); await page.goto(`/?albumPreview=${token}`); await enterFixtureRoom(page); await openFixtureBook(page);
  await expect(page.locator('.page-right')).toContainText('中文手帐'); await page.locator('#next').click(); await expect(page.locator('#chapter-count')).toHaveText('02 / 02 跨页');
  await closeFixtureBook(page); await openFixtureBook(page); await expect(page.locator('.page-left')).toContainText('第二跨页的左页');
});
test('failed custom capture preserves readable custom content and releases the scene transition', async ({ page }) => {
  const token = await snapshot(page); await page.emulateMedia({ reducedMotion: 'reduce' }); await mockExperienceScene(page);
  await page.route(/\/src\/page-raster\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: 'export async function captureBookPages(){throw new Error("capture unavailable")}' }));
  await page.goto(`/?albumPreview=${token}`); await enterFixtureRoom(page); await page.locator('#open-book').click(); await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('.page-right')).toContainText('中文手帐'); await expect(page.locator('#world')).toBeHidden(); await expect(page.locator('#close-book')).toContainText('返回纪念册入口');
});
test('unavailable private preview shows a clear recovery message and no unrelated sample text', async ({ page }) => {
  await page.goto('/album-preview.html?albumPreview=00000000-0000-0000-0000-000000000000'); await expect(page.locator('#reader')).toContainText('预览已过期'); await expect(page.locator('#reader')).not.toContainText('风经过的地方'); await expect(page.getByRole('link', { name: '返回工作台重新预览' })).toBeVisible();
});
test('published content loads for an ordinary visitor without reading the local draft', async ({ page }) => {
  await page.goto('/editor.html');
  await expect(page.locator('#save-status')).toHaveText('✓ 已保存到本机');
  await page.getByLabel('纪念册名称').fill('仅本机的草稿'); await page.getByLabel('纪念册名称').press('Tab');
  const published = await page.evaluate(async () => {
    const m = await import('/src/album/document.ts'), document = m.newDocument();
    document.chapters[0].title = '已发布的内容测试';
    const text = document.chapters[0].spreads[0].pages[1].elements.find(e => e.type === 'text' && e.role === 'title') as any;
    text.text = '公开成稿与本机草稿分离'; return document;
  });
  await page.route(/\/src\/album\/published\.json(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: `export default ${JSON.stringify(published)};` }));
  await page.emulateMedia({ reducedMotion: 'reduce' }); await mockExperienceScene(page); await page.goto('/');
  await enterFixtureRoom(page); await openFixtureBook(page);
  await expect(page.locator('.page-right')).toContainText('公开成稿与本机草稿分离');
  await expect(page.locator('#book')).not.toContainText('仅本机的草稿');
  await expect(page.locator('#chapter-count')).toHaveText('01 / 01 跨页');
  await page.locator('#chapter-contents-toggle').click();
  await expect(page.locator('[data-chapter="0"]')).toContainText('已发布的内容测试');
});
