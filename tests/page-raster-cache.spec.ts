import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, enterFixtureRoom, openFixtureBook, closeFixtureBook } from './helpers/experience-scene';

async function observeCapture(page: Page) {
  await page.route(/\/src\/page-raster\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    let source = await response.text();
    const marker = 'async function captureBookPages(reader) {';
    expect(source).toContain(marker);
    source = source.replace(marker, marker + `
      (window.__paperCaptures ??= []).push({
        title: reader.querySelector('#chapter-title')?.textContent,
        width:innerWidth, height:innerHeight, dpr:devicePixelRatio,
        underLoader:!document.querySelector('#loading').classList.contains('hidden'),
        inaccessible:reader.inert && reader.getAttribute('aria-hidden') === 'true',
      });
    `);
    await route.fulfill({ response, body: source });
  });
}
const captures = (page: Page) => page.evaluate(() => (window as any).__paperCaptures);

test('initial paper is prepared invisibly; opening, closing and reopening reuse the exact spread, while chapter and viewport changes recapture', async ({ page }) => {
  await mockExperienceScene(page); await observeCapture(page); await page.goto('/');
  await enterFixtureRoom(page);
  const first = await captures(page);
  expect(first).toHaveLength(1);
  expect(first[0].underLoader).toBe(true); expect(first[0].inaccessible).toBe(true);
  await expect(page.locator('#reader')).toBeHidden();
  await openFixtureBook(page); await closeFixtureBook(page); await openFixtureBook(page);
  expect(await captures(page)).toHaveLength(1);
  await page.locator('#next').click(); await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
  await closeFixtureBook(page); await openFixtureBook(page);
  const chapter = await captures(page); expect(chapter).toHaveLength(2);
  expect(chapter[1].title).toBe('把日子过成夏天');
  await closeFixtureBook(page);
  await page.setViewportSize({ width:390, height:844 });
  await openFixtureBook(page);
  const resized = await captures(page); expect(resized).toHaveLength(3);
  expect(resized[2]).toMatchObject({ width:390, height:844, title:'把日子过成夏天' });
  await expect(page.locator('#reader')).toHaveAttribute('aria-busy','false');
  expect(await page.locator('#reader').evaluate(reader => reader.inert || reader.hasAttribute('aria-hidden'))).toBe(false);
});

test('a failed initial raster is retried on opening instead of caching a rejection', async ({ page }) => {
  await mockExperienceScene(page);
  await page.route(/\/src\/page-raster\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const source = (await response.text()).replace('async function captureBookPages(reader) {', `
      async function captureBookPages(reader) {
        window.__attempts = (window.__attempts ?? 0) + 1;
        if(window.__attempts === 1) throw new Error('Optional photograph unavailable');
    `);
    await route.fulfill({ response, body:source });
  });
  await page.goto('/'); await enterFixtureRoom(page); await openFixtureBook(page);
  await expect(page.locator('#world')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__attempts)).toBe(2);
  await closeFixtureBook(page); await openFixtureBook(page);
  expect(await page.evaluate(() => (window as any).__attempts)).toBe(2);
});

for (const lost of [false,true]) {
  test(lost ? 'scene loss releases initial preparation and late completion cannot hide the readable fallback' : 'a stalled optional initial image cannot indefinitely block entry or poison the next capture', async ({ page }) => {
    await mockExperienceScene(page);
    await page.route(/\/src\/page-raster\.ts(?:\?.*)?$/, route => route.fulfill({
      contentType:'application/javascript',body:`
        let count=0;
        export function captureBookPages(){
          const pages=[document.createElement('canvas'),document.createElement('canvas')];
          if(++count>1)return Promise.resolve(pages);
          return new Promise(resolve=>window.__latePaper=()=>resolve(pages));
        }
      `,
    }));
    await page.goto('/');
    await page.waitForFunction(() => !!(window as any).__latePaper);
    if(lost) {
      await page.evaluate(() => (window as any).__experience.fail());
      await expect(page.locator('#loading')).toBeHidden();
      await expect(page.locator('#fallback')).toBeVisible();
      await page.locator('#fallback-read').click();
      await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready');
    } else {
      await expect(page.locator('#loading')).toBeHidden({ timeout:5000 });
      await enterFixtureRoom(page); await openFixtureBook(page);
    }
    await page.evaluate(() => (window as any).__latePaper());
    await expect(page.locator('#reader')).toBeVisible();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready');
    expect(await page.locator('#reader').evaluate(reader => reader.inert || reader.hasAttribute('aria-hidden') || reader.classList.contains('is-preparing'))).toBe(false);
  });
}

test('cache holds only the current layout, does not retain late failures, and releases on disposal', async ({ page }) => {
  await page.route('**/__paper_cache', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/__paper_cache');
  const result = await page.evaluate(async () => {
    const { createPageRasterCache } = await import('/src/page-raster-cache.ts');
    const cache = createPageRasterCache(), pair = () => [document.createElement('canvas'),document.createElement('canvas')] as [HTMLCanvasElement,HTMLCanvasElement];
    let rejectOld!: (reason: Error) => void, calls = 0;
    const old = cache.capture('chapter-1:dpr-1', () => { calls++; return new Promise((_,reject) => { rejectOld = reject; }); });
    const same = cache.capture('chapter-1:dpr-1', async () => { throw new Error('must deduplicate'); });
    await Promise.resolve();
    const pages = pair(), current = cache.capture('chapter-1:dpr-1.5', async () => { calls++; return pages; });
    await current; rejectOld(new Error('Late source failure')); await old.catch(() => {});
    const afterFailure = await cache.capture('chapter-1:dpr-1.5', async () => { throw new Error('must retain current'); });
    await cache.capture('chapter-1:dpr-1', async () => { calls++; return pair(); });
    cache.clear(); await cache.capture('chapter-1:dpr-1', async () => { calls++; return pair(); });
    cache.dispose();
    const disposed = await cache.capture('chapter-1:dpr-1', async () => { calls++; return pair(); }).then(() => false, () => true);
    return {deduplicated:old === same, currentPreserved:afterFailure === pages, calls, disposed};
  });
  expect(result).toEqual({deduplicated:true,currentPreserved:true,calls:4,disposed:true});
});
