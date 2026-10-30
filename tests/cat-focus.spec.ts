import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, enterFixtureRoom, finishSceneStep } from './helpers/experience-scene';

const counts = (page: Page) => page.evaluate(() => {
  const { views, pets, petAttempts } = (window as any).__experience;
  return { views, pets, petAttempts };
});
const touchCat = (page: Page) => page.evaluate(() => (window as any).__experience.catInteract());

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockExperienceScene(page);
  await page.goto('/');
  await enterFixtureRoom(page);
});

test('a desk cat click approaches once and pets only after arrival; nearby clicks stay nearby', async ({ page }) => {
  await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'false');
  expect(await touchCat(page)).toBe(true);
  expect(await counts(page)).toEqual({ views: 1, pets: 0, petAttempts: 0 });
  for (const selector of ['#cozy-view', '#open-book', '#pet-cat', '#choose-record', '#record-toggle'])
    await expect(page.locator(selector)).toBeDisabled();
  expect(await touchCat(page)).toBe(false);
  await page.evaluate(() => {
    document.getElementById('open-book')!.click();
    document.getElementById('cozy-view')!.click();
  });
  expect(await page.evaluate(() => (window as any).__experience.opens)).toBe(0);
  expect(await counts(page)).toEqual({ views: 1, pets: 0, petAttempts: 0 });

  await finishSceneStep(page, 'view');
  await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#pet-cat')).toBeVisible();
  expect(await counts(page)).toEqual({ views: 1, pets: 1, petAttempts: 1 });
  expect(await touchCat(page)).toBe(true);
  expect(await counts(page)).toEqual({ views: 1, pets: 2, petAttempts: 2 });
  await expect(page.locator('#reader')).toBeHidden();
});

test('the view button still approaches without automatically petting', async ({ page }) => {
  await page.locator('#cozy-view').click();
  await finishSceneStep(page, 'view');
  await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'true');
  expect(await counts(page)).toEqual({ views: 1, pets: 0, petAttempts: 0 });
  await page.locator('#pet-cat').click();
  expect(await counts(page)).toEqual({ views: 1, pets: 1, petAttempts: 1 });
});

test('hiding during approach cancels the pending pet even after the page returns', async ({ page }) => {
  expect(await touchCat(page)).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  expect(await touchCat(page)).toBe(false);
  await page.evaluate(() => {
    delete (document as any).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await finishSceneStep(page, 'view');
  await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'true');
  expect(await counts(page)).toEqual({ views: 1, pets: 0, petAttempts: 0 });
  await page.locator('#pet-cat').click();
  expect(await counts(page)).toEqual({ views: 1, pets: 1, petAttempts: 1 });
});

for (const interruption of ['WebGL loss', 'page disposal'] as const) {
  test(`${interruption} during approach cannot trigger a late pet`, async ({ page }) => {
    expect(await touchCat(page)).toBe(true);
    await page.evaluate(kind => {
      const probe = (window as any).__experience;
      if (kind === 'WebGL loss') probe.fail();
      else window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      probe.complete();
    }, interruption);
    if (interruption === 'WebGL loss') await expect(page.locator('#fallback')).toBeVisible();
    else expect(await page.evaluate(() => (window as any).__experience.disposed)).toBe(true);
    expect(await touchCat(page)).toBe(false);
    expect(await counts(page)).toEqual({ views: 1, pets: 0, petAttempts: 0 });
  });
}
