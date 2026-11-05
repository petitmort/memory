import { test, expect, type Page } from '@playwright/test';

async function observeReading(page: Page) {
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(); let source = await response.text();
    const marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    source = source.replace(marker, `window.__readingReview={paths:[],room:()=>({p:camera.position.toArray(),t:target.toArray(),fov:camera.fov})};${marker}`);
    expect(source).toContain('readingMotion = {');
    source = source.replace('readingMotion = {', `window.__readingReview.paths.push({kind,duration,visited:bookOpened,bouquetParked,frames:[]});readingMotion = {`);
    const draw = 'renderer.render(scene, camera);';
    expect(source).toContain(draw);
    source = source.replace(draw, `if(updateReadingFrame){(window.__readingReview.paths.at(-1)).frames.push({phase:updateReadingFrame.progress,cover:coverProgress,leaf:leafProgress,p:camera.position.toArray(),t:target.toArray(),fov:camera.fov});}${draw}`);
    await route.fulfill({ response, body: source });
  });
}

for (const reduced of [false, true]) {
  test(`${reduced ? 'reduced' : 'normal'}: first opening keeps its ceremony and later openings retain the chapter with a continuous shorter approach`, async ({ browser }) => {
    test.setTimeout(240000);
    const context = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
    const page = await context.newPage(); const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(60000);
    try {
      await observeReading(page); await page.goto('/'); await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
      await page.locator('#enter').click(); await expect(page.locator('#enter')).toBeEnabled({ timeout: 60000 });
      await page.locator('#enter').click(); await expect(page.locator('#room-ui')).toBeVisible({ timeout: 60000 });
      const room = await page.evaluate(() => (window as any).__readingReview.room());
      await page.locator('#open-book').click(); await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 60000 });
      await page.locator('#next').click(); await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
      await page.locator('#close-book').click(); await expect(page.locator('#room-ui')).toBeVisible({ timeout: 60000 });
      await page.locator('#open-book').click(); await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 60000 });
      await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
      const paths = await page.evaluate(() => (window as any).__readingReview.paths);
      expect(paths.map((path: any) => [path.kind, path.duration, path.visited])).toEqual([
        ['opening', reduced ? 180 : 2600, false], ['closing', reduced ? 180 : 2000, true], ['opening', reduced ? 180 : 2000, true],
      ]);
      // Bouquet parking finishes before the first approach, so it cannot stand
      // in for a successful earlier opening when choosing the shorter journey.
      expect(paths.every((path: any) => path.bouquetParked)).toBe(true);
      for (const path of paths) {
        const frames = path.frames;
        expect(frames[0].phase).toBe(0); expect(frames.at(-1).phase).toBe(1);
        expect(frames.length).toBeGreaterThan(reduced ? 2 : 20);
        for (let i = 1; i < frames.length; i++) {
          expect(frames[i].phase).toBeGreaterThanOrEqual(frames[i - 1].phase);
          expect(frames[i].phase - frames[i - 1].phase).toBeLessThanOrEqual(100 / path.duration + 1e-8);
        }
      }
      expect(paths[0].frames[0].p).toEqual(room.p);
      expect(paths[1].frames.at(-1).p).toEqual(room.p);
      expect(paths[1].frames.at(-1).fov).toBe(room.fov);
      expect(paths[2].frames[0].p).toEqual(room.p);
      expect(paths[2].frames.at(-1).p).toEqual(paths[0].frames.at(-1).p);
      expect(paths[2].frames.at(-1).cover).toBe(1); expect(paths[2].frames.at(-1).leaf).toBe(1);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  });
}
