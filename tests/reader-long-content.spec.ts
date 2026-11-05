import { test, expect } from '@playwright/test';

for (const mode of ['Chinese', 'unbroken-English']) {
  test(`${mode}: long reading content wraps, scrolls to the end and leaves the directory usable`, async ({ page }, testInfo) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
        return type.includes('webgl') ? null : (getContext as any).apply(this, [type, ...args]);
      } as typeof getContext;
    });
    await page.goto('/'); await expect(page.locator('#fallback')).toBeVisible();
    await page.evaluate(async mode => {
      const content = await import('/src/content.ts');
      const token = 'TravelPhotograph_' + 'ABCDEFGHIJKLMN'.repeat(12) + '.webp';
      Object.assign(content.chapters[0], {
        title: mode === 'Chinese' ? '那次沿着海岸慢慢走到傍晚才回来的旅行' : token,
        date: mode === 'Chinese' ? '一个值得记住的夏日午后' : token,
        subtitle: mode === 'Chinese' ? '沿着海边的小路慢慢走，记下旅途中每个想留下来的细节' : token,
        caption: mode === 'Chinese' ? '一张有很长说明的旅行照片，记录远处风景与沿途细节。'.repeat(5) : token,
        text: '海风走过窗前\n我们慢慢把故事留下\n' + (mode === 'Chinese' ? '沿着那条熟悉的小路，走到夕阳渐渐落下。' : token),
        note: ('一路走到小路尽头，停下来听风，拍下一张想留下来的照片。\n').repeat(35) + (mode === 'Chinese' ? '' : token + '\n') + '这是最后一行，可以完整读到这里。',
      });
      content.chapters[2].title = mode === 'Chinese' ? '再远一点的小岛，也会留下一段很长很长的故事' : token;
    }, mode);
    await page.locator('#fallback-read').click(); await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1920, 1080]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const result = await page.evaluate(() => {
        const book = document.querySelector<HTMLElement>('#book')!;
        const fields = ['photo-caption', 'chapter-title', 'chapter-date', 'chapter-subtitle', 'chapter-text', 'chapter-note'];
        const escaped = fields.filter(id => {
          const field = document.getElementById(id)!, bounds = field.closest('.page')!.getBoundingClientRect();
          const range = document.createRange(); range.selectNodeContents(field);
          return Array.from(range.getClientRects()).some(line => line.left < bounds.left - 1 || line.right > bounds.right + 1);
        });
        const caption = document.createRange(); caption.selectNodeContents(document.getElementById('photo-caption')!);
        return {
          escaped, bookOverflow: book.scrollWidth > book.clientWidth + 1,
          documentOverflow: document.documentElement.scrollWidth > innerWidth,
          columns: getComputedStyle(book).gridTemplateColumns.split(' ').length,
          body: parseFloat(getComputedStyle(document.getElementById('chapter-note')!).fontSize),
          caption: parseFloat(getComputedStyle(document.getElementById('photo-caption')!).fontSize),
          captionLines: caption.getClientRects().length,
        };
      });
      expect(result.escaped, `${width}×${height}`).toEqual([]);
      expect(result.bookOverflow).toBe(false); expect(result.documentOverflow).toBe(false);
      expect(result.columns).toBe(width < 760 ? 1 : 2);
      expect(result.body).toBeGreaterThanOrEqual(16); expect(result.caption).toBeGreaterThanOrEqual(14);
      expect(result.captionLines).toBeGreaterThan(1);
      await page.locator('#book').evaluate(element => { element.scrollTop = element.scrollHeight; });
      const note = await page.locator('#chapter-note').boundingBox(), book = await page.locator('#book').boundingBox();
      expect(note!.y + note!.height).toBeLessThanOrEqual(book!.y + book!.height + 1);
      for (const id of ['close-book', 'chapter-contents-toggle', 'next']) {
        const button = page.locator('#' + id), bounds = await button.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(await button.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
      }
      await page.screenshot({ path: testInfo.outputPath(`${mode}-${width}-last-line.png`) });
      await page.locator('#chapter-contents-toggle').click();
      const directory = page.locator('#chapter-contents');
      expect(await directory.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      const entry = directory.locator('button').last(); await entry.scrollIntoViewIfNeeded();
      expect(await entry.evaluate(element => { const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
      await page.keyboard.press('Escape'); await expect(page.locator('#chapter-contents-toggle')).toBeFocused();
    }
    await expect(page.locator('#chapter-title')).toHaveText(mode === 'Chinese' ? '那次沿着海岸慢慢走到傍晚才回来的旅行' : /^TravelPhotograph_/);
    expect(errors).toEqual([]);
  });
}

test('the real reader raster preserves visible ink on every wrapped caption line', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: any[]) {
      return type.includes('webgl') ? null : (getContext as any).apply(this, [type, ...args]);
    } as typeof getContext;
  });
  for (const [width, height] of [[1280, 800], [390, 844]]) {
    // Capture settled desktop and phone layouts; transition/rotation continuity
    // is exercised separately, rather than rasterizing a changing breakpoint.
    await page.setViewportSize({ width, height });
    await page.goto('/'); await expect(page.locator('#fallback')).toBeVisible();
    await page.evaluate(async () => {
      const { chapters } = await import('/src/content.ts');
      chapters[0].caption = 'Photo_' + 'ABCDEFGHIJ'.repeat(10) + '.webp';
    });
    await page.locator('#fallback-read').click(); await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
    const result = await page.evaluate(async () => {
      const caption = document.getElementById('photo-caption')!, left = document.querySelector<HTMLElement>('.page-left')!;
      // The reduced-motion stylesheet assigns a tiny transition duration even
      // to text. Freeze this test-only ink marker before taking its colour.
      caption.style.setProperty('transition', 'none', 'important');
      caption.style.color = 'rgb(245,0,190)';
      await document.fonts.ready;
      const range = document.createRange(); range.selectNodeContents(caption);
      const origin = left.getBoundingClientRect();
      const lines = Array.from(range.getClientRects()).map(r => ({ x: r.x - origin.x, y: r.y - origin.y, width: r.width, height: r.height }));
      const { captureBookPages } = await import('/src/page-raster.ts');
      const [canvas] = await captureBookPages(document.getElementById('reader')!);
      const scaleX = canvas.width / parseFloat(getComputedStyle(left).width), scaleY = canvas.height / parseFloat(getComputedStyle(left).height), context = canvas.getContext('2d')!;
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const ink = lines.map(rect => {
        let count = 0;
        for (let y = Math.max(0, Math.floor(rect.y * scaleY)); y < Math.min(canvas.height, Math.ceil((rect.y + rect.height) * scaleY)); y++)
          for (let x = Math.max(0, Math.floor(rect.x * scaleX)); x < Math.min(canvas.width, Math.ceil((rect.x + rect.width) * scaleX)); x++) {
            const i = (y * canvas.width + x) * 4;
            if (pixels[i] > 210 && pixels[i + 1] < 100 && pixels[i + 2] > 140) count++;
          }
        return count;
      });
      return { lines: lines.length, ink, width: canvas.width, expectedWidth: Math.ceil(parseFloat(getComputedStyle(left).width) * Math.min(devicePixelRatio || 1, 1.5)) };
    });
    expect(result.lines).toBeGreaterThan(1);
    expect(result.ink.every(count => count > 5), JSON.stringify(result)).toBe(true);
    expect(result.width).toBe(result.expectedWidth);
  }
});
