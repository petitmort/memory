import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, finishSceneStep } from './helpers/experience-scene';

/** Freeze only after the door starts so each assertion measures settled-room time. */
async function arrive(page: Page, reducedMotion = true) {
  await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' });
  await mockExperienceScene(page);
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#enter').click();
  await finishSceneStep(page, 'clearing');
  await expect(page.locator('#enter')).toBeEnabled();
  await page.locator('#enter').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'entering');
  const now = new Date('2026-10-30T12:00:00Z');
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await page.evaluate(() => (window as any).__experience.complete());
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'room');
}

async function setHidden(page: Page, hidden: boolean) {
  await page.evaluate(hidden => {
    if (hidden) Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    else delete (document as any).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

test('settled room has two quiet seconds before the first invitation and primary controls', async ({ page }) => {
  await arrive(page);
  for (const selector of ['#room-ui', '#scene-hint', '#explore-guide'])
    await expect(page.locator(selector)).toBeHidden();
  await expect(page.locator('#sound')).toBeVisible();
  await expect(page.locator('#sound')).toBeEnabled();
  await expect(page.locator('#record-toggle')).toBeVisible();
  await expect(page.locator('#record-toggle')).toBeEnabled();
  await page.clock.runFor(1999);
  for (const selector of ['#room-ui', '#scene-hint', '#explore-guide'])
    await expect(page.locator(selector)).toBeHidden();
  await page.clock.runFor(1);
  for (const selector of ['#room-ui', '#scene-hint', '#explore-guide']) {
    await expect(page.locator(selector)).toBeVisible();
    expect(await page.locator(selector).evaluate(element => getComputedStyle(element).animationName)).toBe('none');
  }
  await page.clock.runFor(5000);
  await expect(page.locator('#explore-guide')).toBeHidden();
  await expect(page.locator('#room-ui')).toBeVisible();
});

test('normal motion fades the settled-room invitation instead of snapping it in', async ({ page }) => {
  await arrive(page, false);
  await page.clock.runFor(2000);
  for (const selector of ['#room-ui', '#scene-hint', '#explore-guide']) {
    await expect(page.locator(selector)).toBeVisible();
    expect(await page.locator(selector).evaluate(element => getComputedStyle(element).animationName)).toBe('room-arriving');
  }
  // A finished arrival is removed, so later view changes cannot replay it.
  await page.locator('#room-ui').evaluate(element => element.dispatchEvent(new AnimationEvent('animationend', { animationName: 'room-arriving' })));
  await expect(page.locator('#room-ui')).not.toHaveClass(/room-arriving/);
  const roomAppearance = () => page.locator('#room-ui').evaluate(element => {
    const style = getComputedStyle(element);
    return { animation: style.animationName, opacity: style.opacity };
  });
  expect(await roomAppearance()).toEqual({ animation: 'none', opacity: '1' });

  // The old base `appear` animation must not restart after either return path.
  await page.locator('#cozy-view').evaluate((element: HTMLButtonElement) => element.click());
  await page.evaluate(() => (window as any).__experience.complete());
  await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#cozy-view').evaluate((element: HTMLButtonElement) => element.click());
  await page.evaluate(() => (window as any).__experience.complete());
  await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'false');
  expect(await roomAppearance()).toEqual({ animation: 'none', opacity: '1' });

  await page.locator('#open-book').evaluate((element: HTMLButtonElement) => element.click());
  await expect.poll(() => page.evaluate(() => (window as any).__experience.pending)).toBe('opening');
  await page.evaluate(() => (window as any).__experience.complete());
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  await page.locator('#close-book').evaluate((element: HTMLButtonElement) => element.click());
  await expect.poll(() => page.evaluate(() => (window as any).__experience.pending)).toBe('closing');
  await page.evaluate(() => (window as any).__experience.complete());
  await expect(page.locator('#room-ui')).toBeVisible();
  expect(await roomAppearance()).toEqual({ animation: 'none', opacity: '1' });
});

test('a held pointer keeps its original scene target and opens the book without a late invitation', async ({ page }) => {
  await arrive(page);
  const point = await page.evaluate(() => {
    const ui = document.getElementById('room-ui')!;
    ui.classList.remove('hidden');
    const rect = document.getElementById('open-book')!.getBoundingClientRect();
    ui.classList.add('hidden');
    const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
    const original = document.elementFromPoint(x, y)!;
    (window as any).__originalClicks = 0;
    original.addEventListener('click', event => {
      if (event.target === original) (window as any).__originalClicks++;
      (window as any).__experience.interact();
    }, { once: true });
    return { x, y };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  // A simultaneous key or cat stroke must not insert a button under this press.
  await page.keyboard.press('Shift');
  await page.clock.runFor(3000);
  await expect(page.locator('#room-ui')).toBeHidden();
  await expect(page.locator('#explore-guide')).toBeHidden();
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).__originalClicks)).toBe(1);
  expect(await page.evaluate(() => (window as any).__experience.opens)).toBe(1);
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'opening');
  await page.clock.runFor(5000);
  await expect(page.locator('#room-ui')).toBeHidden();
  await expect(page.locator('#scene-hint')).toBeHidden();
  await expect(page.locator('#explore-guide')).toBeHidden();
});

test('keyboard use cancels the invitation and preserves the focused sound control', async ({ page }) => {
  await arrive(page);
  await page.locator('#sound').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#sound')).toHaveAttribute('aria-label', '开启声音');
  await expect(page.locator('#sound')).toBeFocused();
  await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#scene-hint')).toBeVisible();
  await expect(page.locator('#explore-guide')).toBeHidden();
  await page.clock.runFor(7000);
  await expect(page.locator('#explore-guide')).toBeHidden();
});

test('background time does not consume the remaining quiet observation', async ({ page }) => {
  await arrive(page);
  await page.clock.runFor(750);
  await setHidden(page, true);
  await page.clock.runFor(10000);
  await expect(page.locator('#room-ui')).toBeHidden();
  await setHidden(page, false);
  await page.clock.runFor(1249);
  await expect(page.locator('#room-ui')).toBeHidden();
  await page.clock.runFor(1);
  await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#explore-guide')).toBeVisible();
});

test('a cancelled pointer reveals usable controls and does not resurrect the invitation', async ({ page }) => {
  await arrive(page);
  await page.locator('#world').dispatchEvent('pointerdown', { pointerId: 4 });
  await expect(page.locator('#room-ui')).toBeHidden();
  await page.locator('#world').dispatchEvent('pointercancel', { pointerId: 4 });
  await page.clock.runFor(1);
  await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#explore-guide')).toBeHidden();
});

test('cat interaction during observation approaches immediately and cancels pending hints', async ({ page }) => {
  await arrive(page);
  expect(await page.evaluate(() => (window as any).__experience.catInteract())).toBe(true);
  expect(await page.evaluate(() => (window as any).__experience.views)).toBe(1);
  await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#cozy-view')).toBeDisabled();
  await page.evaluate(() => (window as any).__experience.complete());
  await expect(page.locator('#pet-cat')).toBeVisible();
  await page.clock.runFor(7000);
  await expect(page.locator('#scene-hint')).toBeHidden();
  await expect(page.locator('#explore-guide')).toBeHidden();
});

for (const interruption of ['scene loss', 'page disposal'] as const) {
  test(`${interruption} cancels observation without revealing stale controls`, async ({ page }) => {
    await arrive(page);
    await page.clock.runFor(750);
    await page.evaluate(interruption => {
      if (interruption === 'scene loss') (window as any).__experience.fail();
      else window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
    }, interruption);
    await page.clock.runFor(10000);
    await expect(page.locator('#room-ui')).toBeHidden();
    await expect(page.locator('#scene-hint')).toBeHidden();
    await expect(page.locator('#explore-guide')).toBeHidden();
    if (interruption === 'scene loss') await expect(page.locator('#fallback')).toBeVisible();
    else expect(await page.evaluate(() => (window as any).__experience.disposed)).toBe(true);
  });
}

test('closing a book opened during observation returns immediately without another quiet wait', async ({ page }) => {
  await arrive(page);
  await page.evaluate(() => (window as any).__experience.interact());
  // Paper capture is asynchronous; wait on the probe using real polling while RAF is frozen.
  await expect.poll(() => page.evaluate(() => (window as any).__experience.pending)).toBe('opening');
  await page.evaluate(() => (window as any).__experience.complete());
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  await page.locator('#close-book').evaluate((element: HTMLButtonElement) => element.click());
  await expect.poll(() => page.evaluate(() => (window as any).__experience.pending)).toBe('closing');
  await page.evaluate(() => (window as any).__experience.complete());
  await expect(page.locator('body')).toHaveAttribute('data-stage', 'room');
  await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#scene-hint')).toBeVisible();
  await expect(page.locator('#explore-guide')).toBeHidden();
  await page.clock.runFor(7000);
  await expect(page.locator('#explore-guide')).toBeHidden();
});
