import { test, expect } from '@playwright/test';
import { mockExperienceScene, enterFixtureRoom, openFixtureBook } from './helpers/experience-scene';

const viewports = [
  { label: 'small-phone', width: 320, height: 568, scale: 1 },
  { label: 'portrait-phone', width: 390, height: 844, scale: 2 },
  { label: 'landscape-phone', width: 844, height: 390, scale: 2 },
  { label: 'desktop-2x', width: 2560, height: 1440, scale: 2 },
];

for (const viewport of viewports) {
  test(`${viewport.label}: controls stay reachable and reading can scroll without clipping`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.scale,
      hasTouch: true, reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    try {
      await mockExperienceScene(page); await page.goto('/');
      await enterFixtureRoom(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const selector of ['#open-book', '#cozy-view', '#choose-record', '#room-light', '#record-toggle', '#sound', '#fullscreen', '#quality']) {
        const button = page.locator(selector);
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        expect(box, selector).not.toBeNull();
        expect(box!.width, selector).toBeGreaterThanOrEqual(44);
        expect(box!.height, selector).toBeGreaterThanOrEqual(44);
        expect(box!.x, selector).toBeGreaterThanOrEqual(-.5);
        expect(box!.y, selector).toBeGreaterThanOrEqual(-.5);
        expect(box!.x + box!.width, selector).toBeLessThanOrEqual(viewport.width + .5);
        expect(box!.y + box!.height, selector).toBeLessThanOrEqual(viewport.height + .5);
        const center = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
        expect(await button.evaluate((element, center) => element.contains(document.elementFromPoint(center.x, center.y)), center), selector).toBe(true);
      }
      await page.screenshot({ path: `test-results/${viewport.label}-room.png` });
      await page.locator('#room-light').click();
      const lightPanel=await page.locator('#room-light-panel').boundingBox();
      expect(lightPanel!.x).toBeGreaterThanOrEqual(0);expect(lightPanel!.y).toBeGreaterThanOrEqual(0);
      expect(lightPanel!.x+lightPanel!.width).toBeLessThanOrEqual(viewport.width);
      expect(lightPanel!.y+lightPanel!.height).toBeLessThanOrEqual(viewport.height);
      for(const selector of ['#room-light-toggle','#room-light-color','#room-light-brightness','#room-light-close']){
        await page.locator(selector).scrollIntoViewIfNeeded();
        const box=await page.locator(selector).boundingBox();expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.y).toBeGreaterThanOrEqual(lightPanel!.y);expect(box!.y+box!.height).toBeLessThanOrEqual(lightPanel!.y+lightPanel!.height);
        const close=await page.locator('#room-light-close').boundingBox();
        expect(close!.y).toBeGreaterThanOrEqual(lightPanel!.y);
        expect(close!.y+close!.height).toBeLessThanOrEqual(lightPanel!.y+lightPanel!.height);
      }
      await page.locator('#room-light-close').click();await expect(page.locator('#room-light')).toBeFocused();
      await openFixtureBook(page);
      for (const selector of ['#close-book', '#chapter-contents-toggle']) {
        const box = await page.locator(selector).boundingBox();
        expect(box!.height, selector).toBeGreaterThanOrEqual(44);
        expect(box!.y, selector).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height, selector).toBeLessThanOrEqual(viewport.height + .5);
      }
      const typography = await page.evaluate(() => ({
        body: parseFloat(getComputedStyle(document.querySelector('.story-note')!).fontSize),
        caption: parseFloat(getComputedStyle(document.querySelector('.photo-caption')!).fontSize),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        bookOverflow: document.querySelector('#book')!.scrollWidth > document.querySelector('#book')!.clientWidth + 1,
      }));
      expect(typography.body).toBeGreaterThanOrEqual(16);
      expect(typography.caption).toBeGreaterThanOrEqual(14);
      expect(typography.horizontalOverflow).toBe(false);
      expect(typography.bookOverflow).toBe(false);
      await page.locator('#book').evaluate(element => { element.scrollTop = element.scrollHeight; });
      const lastLine = await page.locator('#chapter-note').boundingBox();
      const book = await page.locator('#book').boundingBox();
      expect(lastLine!.x).toBeGreaterThanOrEqual(book!.x - 1);
      expect(lastLine!.x + lastLine!.width).toBeLessThanOrEqual(book!.x + book!.width + 1);
      expect(lastLine!.y + lastLine!.height).toBeLessThanOrEqual(book!.y + book!.height + 1);
      await page.screenshot({ path: `test-results/${viewport.label}-reading.png` });
      await page.locator('#chapter-contents-toggle').click();
      const directory = await page.locator('#chapter-contents').boundingBox();
      expect(directory!.x).toBeGreaterThanOrEqual(0);
      expect(directory!.x + directory!.width).toBeLessThanOrEqual(viewport.width + 1);
      expect(directory!.y + directory!.height).toBeLessThanOrEqual(viewport.height + 1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
