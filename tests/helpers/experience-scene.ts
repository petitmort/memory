import { expect, type Page } from '@playwright/test';

/** Keep real DOM/controllers and replace only slow rendering with drawn-frame gates. */
function sceneFixture(
  _container: HTMLElement, interact: () => void, _reduced: boolean, onUnavailable: () => void,
  onPet?: () => unknown, _onRecord?: () => void, _onQuality?: (low: boolean) => void,
  onCatInteract?: () => boolean,
) {
  let lost = false, focused = false, disposed = false, interactive = false;
  let rejectLoss!: (error: Error) => void;
  const loss = new Promise<never>((_, reject) => { rejectLoss = reject; });
  void loss.catch(() => {});
  let complete: (() => void) | undefined;
  const probe = (window as any).__experience = {
    pending: '', clears: 0, enters: 0, opens: 0, views: 0, returns: 0, quality: false,
    pets: 0, petAttempts: 0, disposed: false,
    complete: () => complete?.(), interact,
    catInteract: () => onCatInteract?.() ?? false,
    fail() {
      if (lost) return;
      lost = true; onUnavailable(); rejectLoss(new Error('Renderer unavailable'));
    },
  };
  const wait = async (phase: string) => {
    if (lost) throw new Error('Renderer unavailable');
    probe.pending = phase;
    await Promise.race([new Promise<void>(resolve => { complete = resolve; }), loss]);
    probe.pending = '';
  };
  const projection = () => {
    const x = innerWidth * .3, y = innerHeight * .4, w = innerWidth * .17, h = innerHeight * .24;
    const left = { corners: [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }] };
    const right = { corners: left.corners.map(point => ({ x: point.x + w, y: point.y })) };
    return { corners: [left.corners[0], right.corners[1], right.corners[2], left.corners[3]], pages: [left, right] };
  };
  return {
    ready: Promise.resolve(),
    async clearFog() { probe.clears++; await wait('clearing'); },
    async enterRoom() { probe.enters++; await wait('entering'); },
    async openBook(onFrame?: (frame: unknown) => void, paperReady?: Promise<void>) {
      probe.opens++;
      await Promise.race([paperReady ?? Promise.resolve(), loss]);
      onFrame?.({ progress: .65, projection: projection() });
      await wait('opening');
      onFrame?.({ progress: 1, projection: projection() });
    },
    async returnToRoom(onFrame?: (frame: unknown) => void) {
      probe.returns++; await wait('closing');
      onFrame?.({ progress: 1, projection: projection() });
    },
    async focusCozyCorner(value: boolean) { probe.views++; await wait('view'); return focused = value; },
    isCozyFocused: () => focused,
    getBookProjection: projection,
    setBookChapter() {}, setBookPageCanvases() {}, setBookVisibility() {},
    setRecordPlaying() {}, setInteractionEnabled(value: boolean) { interactive = value; }, clearInteractionFeedback() {}, hintInteractionsOnce() {},
    getQuality: () => ({ low: probe.quality, manual: false }),
    setQuality(value: boolean) { probe.quality = value; },
    petCat() {
      probe.petAttempts++;
      if (lost || disposed || !interactive) return false;
      probe.pets++; onPet?.(); return true;
    },
    dispose() {
      disposed = probe.disposed = true;
      rejectLoss(new Error('Scene disposed'));
    },
  };
}

export async function mockExperienceScene(page: Page) {
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export class SceneUnavailableError extends Error {}; export const createScene=' + sceneFixture.toString() + ';',
  }));
}

export async function finishSceneStep(page: Page, phase: string) {
  await page.waitForFunction(phase => (window as any).__experience?.pending === phase, phase);
  await page.evaluate(() => (window as any).__experience.complete());
}

export async function enterFixtureRoom(page: Page) {
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#enter').click(); await finishSceneStep(page, 'clearing');
  await expect(page.locator('#enter')).toBeEnabled();
  await page.locator('#enter').click(); await finishSceneStep(page, 'entering');
  await expect(page.locator('#room-ui')).toBeVisible();
}

export async function openFixtureBook(page: Page) {
  await page.locator('#open-book').click(); await finishSceneStep(page, 'opening');
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
}

export async function closeFixtureBook(page: Page) {
  await page.locator('#close-book').click(); await finishSceneStep(page, 'closing');
  await expect(page.locator('#room-ui')).toBeVisible();
}
