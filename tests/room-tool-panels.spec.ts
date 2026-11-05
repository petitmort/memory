import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, enterFixtureRoom, finishSceneStep, openFixtureBook, closeFixtureBook } from './helpers/experience-scene';

async function settledLayout(page: Page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function expectActionsReachable(page: Page, panel: string) {
  // ResizeObserver can run after the first paint following a media-query
  // change. Wait for its settled layout rather than asserting an interim box.
  await expect(async () => {
    await settledLayout(page);
    const result = await page.evaluate(selector => {
      const room = document.querySelector('#room-ui')!.getBoundingClientRect();
      const bounds = document.querySelector(selector)!.getBoundingClientRect();
      const intersection = Math.min(room.right, bounds.right) - Math.max(room.left, bounds.left) > .5
        && Math.min(room.bottom, bounds.bottom) - Math.max(room.top, bounds.top) > .5;
      const missed = ['open-book', 'cozy-view', 'pet-cat', 'choose-record', 'room-light', 'time-flow'].filter(id => {
        const element = document.getElementById(id)!;
        if (!element.checkVisibility()) return false;
        const r = element.getBoundingClientRect();
        return r.height < 44 || r.width < 44 || !element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      });
      return { intersection, missed, outside: bounds.left < -.5 || bounds.top < -.5 || bounds.right > innerWidth + .5 || bounds.bottom > innerHeight + .5,
        details: { selector, width: innerWidth, height: innerHeight, room: room.toJSON(), panel: bounds.toJSON(), maxHeight: document.querySelector<HTMLElement>(selector)!.style.maxHeight,
          computed: ['height','min-height','max-height','box-sizing','transform','padding-top','padding-bottom'].map(name => [name, getComputedStyle(document.querySelector(selector)!).getPropertyValue(name)]) } };
    }, panel);
    const { details, ...status } = result;
    expect(status, JSON.stringify(details)).toEqual({ intersection: false, missed: [], outside: false });
  }).toPass({ timeout: 5000, intervals: [100, 250, 500] });
}

for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 800]]) {
  test(`light and time panels leave room and cat actions reachable at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height }); await page.emulateMedia({ reducedMotion: 'reduce' });
    await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
    for (const cat of [false, true]) {
      if (cat) { await page.locator('#cozy-view').click(); await finishSceneStep(page, 'view'); }
      await page.locator('#room-light').click(); await expectActionsReachable(page, '#room-light-panel');
      for (const id of ['room-light-toggle', 'room-light-color', 'room-light-brightness', 'room-light-close']) {
        const control = page.locator('#' + id); await control.scrollIntoViewIfNeeded();
        const bounds = await control.boundingBox();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
        expect(await control.evaluate(element => {
          const r = element.getBoundingClientRect(); return element.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
        }), id).toBe(true);
      }
      await page.keyboard.press('Escape');
      await page.locator('#time-flow').click(); await page.locator('#time-flow-free').check();
      await expectActionsReachable(page, '#time-flow-panel');
      // A narrower viewport changes the number of action rows while open.
      await page.setViewportSize({ width: 320, height: 568 });
      await expectActionsReachable(page, '#time-flow-panel');
      await page.keyboard.press('Escape'); await page.setViewportSize({ width, height }); await settledLayout(page);
    }
    // Light must also refit when an already-open panel crosses the breakpoint.
    await page.locator('#room-light').click(); await page.setViewportSize({ width: 390, height: 568 });
    await expectActionsReachable(page, '#room-light-panel');
    await page.keyboard.press('Escape');
    await page.locator('#cozy-view').click(); await finishSceneStep(page, 'view');
    await page.locator('#room-light').click(); await openFixtureBook(page);
    await expect(page.locator('#room-light-panel')).toBeHidden();
    await closeFixtureBook(page); await page.locator('#time-flow').click();
    await page.evaluate(() => (window as any).__experience.fail());
    await expect(page.locator('#time-flow-panel')).toBeHidden();
  });
}

test('keyboard switching replaces each tool panel and Escape restores only the active trigger', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
  page.on('filechooser', chooser => { void chooser.setFiles([]); });
  const tools = [['room-light', 'room-light-panel'], ['time-flow', 'time-flow-panel'], ['choose-record', 'record-panel']] as const;
  for (const [from, fromPanel] of tools) for (const [to, toPanel] of tools) {
    if (from === to) continue;
    await page.locator('#' + from).focus(); await page.keyboard.press('Enter');
    await expect(page.locator('#' + fromPanel)).toBeVisible();
    await page.locator('#' + to).focus(); await page.keyboard.press('Space');
    await expect(page.locator('#' + toPanel)).toBeVisible();
    await expect(page.locator('#' + fromPanel)).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#' + toPanel)).toBeHidden(); await expect(page.locator('#' + to)).toBeFocused();
  }
  await page.locator('#room-light').click(); await page.locator('#room-light-brightness').fill('72');
  await expect(page.locator('#room-light-panel')).toBeVisible();
  await page.locator('#time-flow').focus(); await page.keyboard.press('Enter');
  await page.locator('#room-light').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#room-light-brightness')).toHaveValue('72');
  await page.locator('#cozy-view').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#room-light-panel')).toBeHidden();
});

test('open settings follow action-row reflow without a viewport resize', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 568 }); await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
  for (const [trigger, panel] of [['room-light', '#room-light-panel'], ['time-flow', '#time-flow-panel']]) {
    await page.locator('#' + trigger).click();
    // Simulate a longer translated button wrapping onto another real flex row.
    await page.locator('#cozy-view').evaluate(element => { element.style.width = '100%'; });
    await expectActionsReachable(page, panel);
    await page.keyboard.press('Escape');
    await page.locator('#cozy-view').evaluate(element => { element.style.width = ''; });
  }
});
