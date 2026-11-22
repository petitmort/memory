import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, finishSceneStep, enterFixtureRoom, openFixtureBook, closeFixtureBook } from './helpers/experience-scene';

async function mask(page: Page) {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>('.vignette')!;
    const style = getComputedStyle(element);
    return {
      stage: document.body.dataset.stage,
      profile: document.body.dataset.roomVignette ?? '',
      stop: Number.parseFloat(style.getPropertyValue('--room-vignette-stop')),
      opacity: Number(style.opacity),
      image: style.backgroundImage,
      durations: style.transitionDuration.split(',').map(value => Number.parseFloat(value)),
    };
  });
}

async function fixture(page: Page, reduced: boolean) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await mockExperienceScene(page);
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
}

async function beginEntry(page: Page) {
  await page.locator('#enter').click();
  await finishSceneStep(page, 'clearing');
  await expect(page.locator('#enter')).toBeEnabled();
  await page.locator('#enter').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'entering');
}

test('the mobile room mask persists through real reading stages and room-loss fallback with reduced motion', async ({ page }) => {
  await fixture(page, true);
  expect(await mask(page)).toMatchObject({ stage: 'fog', profile: '', stop: 76, opacity: 1 });
  await beginEntry(page);
  expect(await mask(page)).toMatchObject({ stage: 'entering', profile: '', stop: 76 });
  await finishSceneStep(page, 'entering');
  await expect.poll(async () => (await mask(page)).stop).toBe(56);
  await page.keyboard.press('Shift');
  await expect(page.locator('#room-ui')).toBeVisible();
  const room = await mask(page);
  expect(room).toMatchObject({ stage: 'room', profile: 'ready', stop: 56, opacity: 1 });
  expect(room.durations.every(value => value <= .001)).toBe(true);

  await page.locator('#open-book').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'opening');
  expect(await mask(page)).toMatchObject({ stage: 'opening', profile: 'ready', stop: 56 });
  await finishSceneStep(page, 'opening');
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  expect(await mask(page)).toMatchObject({ stage: 'reading', profile: 'ready', stop: 56, opacity: 0 });

  await page.locator('#close-book').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'closing');
  expect(await mask(page)).toMatchObject({ stage: 'closing', profile: 'ready', stop: 56 });
  await finishSceneStep(page, 'closing');
  await expect(page.locator('#room-ui')).toBeVisible();
  expect(await mask(page)).toMatchObject({ stage: 'room', profile: 'ready', stop: 56, opacity: 1 });

  await page.evaluate(() => (window as any).__experience.fail());
  await expect(page.locator('#fallback')).toBeVisible();
  expect(await mask(page)).toMatchObject({ stage: 'fallback', profile: 'ready', stop: 56, opacity: 1 });
  await page.locator('#fallback-read').click();
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  expect(await mask(page)).toMatchObject({ stage: 'reading', profile: 'ready', stop: 56, opacity: 0 });
  await page.locator('#close-book').click();
  await expect(page.locator('#fallback')).toBeVisible();
  expect(await mask(page)).toMatchObject({ stage: 'fallback', profile: 'ready', stop: 56, opacity: 1 });
});

test('opening immediately during the first mobile reveal keeps the same interpolating mask shape', async ({ page }) => {
  await fixture(page, false);
  await beginEntry(page);
  // Complete entry and pause its actual CSS transition in the same browser
  // task, before the observation delay can let the reveal finish unnoticed.
  const initial = await page.evaluate(async () => {
    (window as any).__experience.complete();
    for (let i = 0; i < 20 && document.body.dataset.stage !== 'room'; i++) await Promise.resolve();
    if (document.body.dataset.stage !== 'room') throw new Error('Entry did not finish');
    const element = document.querySelector<HTMLElement>('.vignette')!;
    getComputedStyle(element).getPropertyValue('--room-vignette-stop');
    const animation = element.getAnimations().find(value => value instanceof CSSTransition && value.transitionProperty === '--room-vignette-stop');
    if (!animation) throw new Error('Mobile mask reveal did not create an interpolating transition');
    animation.pause();
    animation.currentTime = 0;
    (window as any).__vignetteReveal = animation;
    return Number.parseFloat(getComputedStyle(element).getPropertyValue('--room-vignette-stop'));
  });
  expect(initial).toBeCloseTo(76, 3);
  const intermediate = await page.evaluate(() => {
    const animation = (window as any).__vignetteReveal as Animation;
    animation.currentTime = Number(animation.effect!.getComputedTiming().duration) / 3;
    return Number.parseFloat(getComputedStyle(document.querySelector('.vignette')!).getPropertyValue('--room-vignette-stop'));
  });
  expect(intermediate).toBeGreaterThan(56);
  expect(intermediate).toBeLessThan(76);
  const sameReveal = async () => page.evaluate(() => document.querySelector('.vignette')!.getAnimations().includes((window as any).__vignetteReveal));
  await page.keyboard.press('Shift');
  await page.locator('#open-book').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'opening');
  expect((await mask(page)).stage).toBe('opening');
  expect((await mask(page)).stop).toBeCloseTo(intermediate, 3);
  expect(await sameReveal()).toBe(true);
  await finishSceneStep(page, 'opening');
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  expect(await mask(page)).toMatchObject({ stage: 'reading', profile: 'ready', opacity: 0 });
  expect((await mask(page)).stop).toBeCloseTo(intermediate, 3);

  await page.locator('#close-book').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'closing');
  expect((await mask(page)).stop).toBeCloseTo(intermediate, 3);
  expect(await sameReveal()).toBe(true);
  await finishSceneStep(page, 'closing');
  await expect(page.locator('#room-ui')).toBeVisible();
  expect((await mask(page)).stop).toBeCloseTo(intermediate, 3);
  await page.evaluate(() => ((window as any).__vignetteReveal as Animation).finish());
  await expect.poll(async () => (await mask(page)).stop).toBe(56);
  expect(await mask(page)).toMatchObject({ stage: 'room', profile: 'ready', opacity: 1 });
});

test('an initial WebGL failure preserves the entry profile through fallback reading and returning', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type.includes('webgl') ? null : get.apply(this, [type, ...args] as never);
    } as typeof get;
  });
  await page.goto('/');
  await expect(page.locator('#fallback')).toBeVisible();
  expect(await mask(page)).toMatchObject({ stage: 'fallback', profile: '', stop: 76, opacity: 1 });
  await page.locator('#fallback-read').click();
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  expect(await mask(page)).toMatchObject({ stage: 'reading', profile: '', stop: 76, opacity: 0 });
  await page.locator('#close-book').click();
  await expect(page.locator('#fallback')).toBeVisible();
  expect(await mask(page)).toMatchObject({ stage: 'fallback', profile: '', stop: 76, opacity: 1 });
});

test('a browser without registered-property capability retains the legacy mask after room entry', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'CSSPropertyRule', { configurable: true, value: undefined }));
  await fixture(page, true);
  await enterFixtureRoom(page);
  expect(await mask(page)).toMatchObject({ stage: 'room', profile: '', stop: 76, opacity: 1 });
  await openFixtureBook(page);
  expect(await mask(page)).toMatchObject({ stage: 'reading', profile: '', stop: 76, opacity: 0 });
  await closeFixtureBook(page);
  expect(await mask(page)).toMatchObject({ stage: 'room', profile: '', stop: 76, opacity: 1 });
});

test('desktop keeps its original overlay and rotation never restarts the revealed room mask transition', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await mockExperienceScene(page);
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  const original = await mask(page);
  await enterFixtureRoom(page);
  expect(await mask(page)).toMatchObject({ stage: 'room', profile: 'ready', stop: 56, opacity: 1, image: original.image });
  const rotated = () => page.evaluate(() => {
    const element = document.querySelector('.vignette')!;
    return {
      stop: Number.parseFloat(getComputedStyle(element).getPropertyValue('--room-vignette-stop')),
      hasStopTransition: element.getAnimations().some(value => value instanceof CSSTransition && value.transitionProperty === '--room-vignette-stop'),
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  // Read at the actual media-query change, rather than polling until a
  // mistakenly restarted 900ms transition has already finished.
  expect(await rotated()).toEqual({ stop: 56, hasStopTransition: false });
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await mask(page)).image).toBe(original.image);
  expect(await mask(page)).toMatchObject({ stage: 'room', profile: 'ready', stop: 56, opacity: 1 });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await rotated()).toEqual({ stop: 56, hasStopTransition: false });
});
