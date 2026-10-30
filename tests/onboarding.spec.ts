import { test, expect } from '@playwright/test';
import { mockExperienceScene, finishSceneStep, enterFixtureRoom, openFixtureBook, closeFixtureBook } from './helpers/experience-scene';

test('entry has an explicit door state and repeated gestures cannot overlap journeys', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockExperienceScene(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await expect(page.locator('#enter')).toContainText('让风吹散迷雾');
  await page.locator('#enter').click();
  await expect(page.locator('#enter')).toBeDisabled();
  await expect(page.locator('#enter')).toContainText('风正在经过');
  await page.evaluate(() => {
    const probe = (window as any).__experience;
    probe.interact(); probe.interact();
  });
  expect(await page.evaluate(() => (window as any).__experience.clears)).toBe(1);
  await finishSceneStep(page, 'clearing');
  await expect(page.locator('#enter')).toBeEnabled();
  await expect(page.locator('#enter')).toHaveClass(/door-ready/);
  await expect(page.locator('#enter')).toContainText('推开这扇门');
  await page.locator('#enter').click();
  await expect(page.locator('#enter')).toBeDisabled();
  await page.evaluate(() => { (window as any).__experience.interact(); });
  expect(await page.evaluate(() => (window as any).__experience.enters)).toBe(1);
  await finishSceneStep(page, 'entering');
  await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#explore-guide')).toBeVisible();
  await expect(page.locator('#explore-guide')).toContainText('可以探索');
  expect(await page.locator('#explore-guide').evaluate(element => getComputedStyle(element).pointerEvents)).toBe('none');

  // View changes disable their room commands until the camera settles.
  await page.locator('#cozy-view').click();
  for (const selector of ['#cozy-view', '#open-book', '#choose-record', '#record-toggle'])
    await expect(page.locator(selector)).toBeDisabled();
  await page.evaluate(() => { (window as any).__experience.interact(); });
  expect(await page.evaluate(() => (window as any).__experience.opens)).toBe(0);
  await finishSceneStep(page, 'view');
  await expect(page.locator('#open-book')).toBeEnabled();
  await expect(page.locator('#cozy-view')).toBeEnabled();
  await expect(page.locator('#explore-guide')).toBeHidden();

  await page.locator('#open-book').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'opening');
  await expect(page.locator('#reader')).toHaveAttribute('aria-busy', 'true');
  await page.evaluate(() => { (window as any).__experience.interact(); (window as any).__experience.interact(); });
  expect(await page.evaluate(() => (window as any).__experience.opens)).toBe(1);
  await finishSceneStep(page, 'opening');
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  await closeFixtureBook(page);
  await openFixtureBook(page);
  await expect(page.locator('#chapter-title')).toHaveText('风经过的地方');
  expect(errors).toEqual([]);
});

test('chapter contents, keyboard and return agree while music stays optional', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mockExperienceScene(page);
  await page.goto('/'); await enterFixtureRoom(page);
  await expect(page.locator('#record-state')).toHaveText('未选择音乐');
  await expect(page.locator('.record-empty-note')).toContainText('只听海浪');
  await expect(page.locator('#sound')).toHaveAttribute('aria-label', '关闭声音');
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-label', '开启声音');
  await page.locator('#sound').click();
  await openFixtureBook(page);
  await expect(page.locator('#prev')).toHaveAttribute('aria-label', '上一章');
  await expect(page.locator('#next')).toHaveAttribute('aria-label', '下一章');
  await page.locator('#chapter-contents-toggle').click();
  await expect(page.locator('#chapter-contents-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#chapter-contents')).toBeVisible();
  await page.locator('#chapter-contents [data-chapter="2"]').click();
  await expect(page.locator('#chapter-title')).toHaveText('我们看过的远方');
  await expect(page.locator('#next')).toBeEnabled();
  await expect(page.locator('#chapter-contents')).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#chapter-title')).toHaveText('潮水会替我记得');
  await expect(page.locator('#next')).toBeDisabled();
  await page.locator('#chapter-contents-toggle').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#chapter-contents')).toBeHidden();
  await expect(page.locator('#chapter-contents-toggle')).toBeFocused();
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  await closeFixtureBook(page); await openFixtureBook(page);
  await expect(page.locator('#chapter-title')).toHaveText('潮水会替我记得');
});

test('WebGL retry keeps the chosen chapter and still leaves a usable fallback', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type.includes('webgl') ? null : get.apply(this, [type, ...args] as never);
    } as typeof get;
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('#fallback')).toBeVisible();
  await page.locator('#fallback-read').click();
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  await page.locator('#chapter-contents-toggle').click();
  await page.locator('#chapter-contents [data-chapter="2"]').click();
  await expect(page.locator('#chapter-title')).toHaveText('我们看过的远方');
  await page.locator('#close-book').click();
  await expect(page.locator('#fallback')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.locator('#reload-scene').click()]);
  await expect(page.locator('#fallback')).toBeVisible();
  await page.locator('#fallback-read').click();
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('#chapter-title')).toHaveText('我们看过的远方');
  // The retry snapshot is consumed once, rather than changing ordinary entry.
  await page.reload();
  await page.locator('#fallback-read').click();
  await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
  await expect(page.locator('#chapter-title')).toHaveText('风经过的地方');
  expect(errors).toEqual([]);
});

test('optional audio failure keeps a healthy room usable and music loading errors visible', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: class { constructor() { throw new DOMException('Audio device unavailable', 'NotSupportedError'); } },
    });
    // Hold only the native music request; scene and DOM controllers stay real.
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.play = function () {
      return new Promise<void>((_resolve, reject) => {
        (window as any).__rejectRecord = () => reject(new DOMException('Unsupported audio', 'NotSupportedError'));
      });
    };
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
  await expect(page.locator('#fallback')).toBeHidden();
  await expect(page.locator('#record-state')).toHaveText('未选择音乐');
  // Keep a valid resource so native decoding cannot bypass the controlled
  // pending play promise with its own earlier error event.
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  await page.locator('#record-file').setInputFiles({ name: 'test-record.wav', mimeType: 'audio/wav', buffer: wav });
  await expect(page.locator('#record-state')).toHaveText('加载中');
  await page.evaluate(() => (window as any).__rejectRecord());
  await expect(page.locator('#record-state')).toHaveText('播放失败');
  await expect(page.locator('#record-panel')).toBeVisible();
  await expect(page.locator('#record-panel .record-storage-note')).toContainText('当前浏览器');
  await expect(page.locator('#record-panel .record-storage-note')).toContainText('清除网站数据');
  await expect(page.locator('#choose-record')).toHaveText('更换音乐');
  await expect(page.locator('#choose-record')).toBeEnabled();
  await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#open-book')).toBeEnabled();
  await expect(page.locator('#fallback')).toBeHidden();
  expect(errors).toEqual([]);
});
