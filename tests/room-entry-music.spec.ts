import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, finishSceneStep, openFixtureBook, closeFixtureBook } from './helpers/experience-scene';

async function installMedia(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const host = window as any;
    host.__entryMusicCalls = []; host.__entryMusicCount = 0;
    class Media extends EventTarget {
      preload = ''; autoplay = true; loop = true; volume = 1; muted = false;
      src = ''; currentSrc = ''; currentTime = 0; paused = true; ended = false; error = null;
      constructor() { super(); host.__entryMusic = this; host.__entryMusicCount++; }
      load() { this.currentSrc = this.src; this.currentTime = 0; this.paused = true; }
      removeAttribute(name: string) { if (name === 'src') this.src = this.currentSrc = ''; }
      pause() { const changed = !this.paused; this.paused = true; if (changed) this.dispatchEvent(new Event('pause')); }
      play() {
        host.__entryMusicCalls.push({ active: navigator.userActivation.isActive, stage: document.body.dataset.stage, source: this.src });
        if (host.__entryMusicBlocked) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
        this.paused = false; this.ended = false;
        if (host.__entryMusicHold) return new Promise<void>((resolve, reject) => {
          host.__releaseEntryMusic = () => { this.paused = false; this.dispatchEvent(new Event('playing')); resolve(); };
          host.__rejectEntryMusic = () => reject(new DOMException('Unavailable audio', 'NotSupportedError'));
        });
        this.dispatchEvent(new Event('playing')); return Promise.resolve();
      }
    }
    window.Audio = Media as unknown as typeof Audio;
  });
}

async function fixture(page: Page) {
  await mockExperienceScene(page); await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
}
async function startEntry(page: Page) {
  expect(await page.evaluate(() => (window as any).__entryMusicCalls.length)).toBe(0);
  await page.locator('#enter').click(); await finishSceneStep(page, 'clearing');
  expect(await page.evaluate(() => (window as any).__entryMusicCalls.length)).toBe(0);
  await page.locator('#enter').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'entering');
}
const calls = (page: Page) => page.evaluate(() => (window as any).__entryMusicCalls);

test('the native door gesture starts one record; reading continues it and manual pause survives returning', async ({ page }) => {
  await installMedia(page); await fixture(page);
  expect(await page.evaluate(() => (window as any).__entryMusic.src)).toBe('');
  await startEntry(page);
  const started = await calls(page); expect(started).toHaveLength(1);
  expect(started[0]).toMatchObject({ active: true, stage: 'entering' });
  expect(started[0].source).toMatch(/default-record.*\.mp3/);
  await finishSceneStep(page, 'entering'); await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#record-state')).toHaveText('播放中');
  // Automatically spinning the record does not consume its first object hint.
  expect(await page.evaluate(() => (window as any).__experience.used)).not.toContain('record');
  await openFixtureBook(page); await closeFixtureBook(page);
  expect(await calls(page)).toHaveLength(1); await expect(page.locator('#record-state')).toHaveText('播放中');
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-state')).toHaveText('已暂停');
  await page.locator('#cozy-view').click(); await finishSceneStep(page, 'view');
  await page.locator('#cozy-view').click(); await finishSceneStep(page, 'view');
  await openFixtureBook(page); await closeFixtureBook(page);
  await expect(page.locator('#record-state')).toHaveText('已暂停'); expect(await calls(page)).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).__entryMusicCount)).toBe(1);
});

test('muting before entry leaves music stopped until an explicit record action', async ({ page }) => {
  await installMedia(page); await fixture(page); await page.locator('#sound').click();
  await startEntry(page); await finishSceneStep(page, 'entering'); await expect(page.locator('#room-ui')).toBeVisible();
  expect(await calls(page)).toHaveLength(0);
  await page.locator('#sound').click(); expect(await calls(page)).toHaveLength(0);
  await expect(page.locator('#record-state')).toHaveText('已暂停');
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-state')).toHaveText('播放中');
  expect(await calls(page)).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).__experience.used)).toContain('record');
});

test('a saved record is selected before entry and starts without another file picker', async ({ page }) => {
  await installMedia(page);
  await page.route('**/__entry-storage', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><body></body>' }));
  await page.goto('/__entry-storage');
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('tideline-records', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('music');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, transaction = db.transaction('music', 'readwrite');
      transaction.objectStore('music').put({ blob: new Blob(['saved audio'], { type: 'audio/wav' }), name: 'saved-track.wav', lastModified: 0 }, 'current');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }));
  await fixture(page); await expect(page.locator('#record-track')).toHaveText('saved-track');
  await startEntry(page); await finishSceneStep(page, 'entering');
  const started = await calls(page); expect(started).toHaveLength(1); expect(started[0].source).toMatch(/^blob:/);
  await expect(page.locator('#record-state')).toHaveText('播放中');
});

test('blocked automatic playback keeps the room usable and one manual retry can play', async ({ page }) => {
  await installMedia(page); await fixture(page);
  await page.evaluate(() => { (window as any).__entryMusicBlocked = true; });
  await startEntry(page); await finishSceneStep(page, 'entering'); await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#record-state')).toHaveText('播放失败'); await expect(page.locator('#fallback')).toBeHidden();
  expect(await calls(page)).toHaveLength(1);
  await page.evaluate(() => { (window as any).__entryMusicBlocked = false; });
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-state')).toHaveText('播放中');
  expect(await calls(page)).toHaveLength(2); await expect(page.locator('#open-book')).toBeEnabled();
});

test('a late automatic error reports failure without covering the open room settings', async ({ page }) => {
  await installMedia(page); await fixture(page);
  await page.evaluate(() => { (window as any).__entryMusicHold = true; });
  await startEntry(page); await finishSceneStep(page, 'entering'); await expect(page.locator('#room-ui')).toBeVisible();
  await page.locator('#room-light').click();
  await page.evaluate(() => (window as any).__rejectEntryMusic());
  await expect(page.locator('#record-state')).toHaveText('播放失败');
  await expect(page.locator('#room-light-panel')).toBeVisible();
  await expect(page.locator('#record-panel')).toBeHidden();
  await page.evaluate(() => { (window as any).__entryMusicHold = false; });
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-state')).toHaveText('播放中');
  expect(await calls(page)).toHaveLength(2);
});

for (const reason of ['background', 'renderer-loss']) {
  test(`${reason} cancels pending entry playback and a late play result stays paused`, async ({ page }) => {
    await installMedia(page); await fixture(page);
    await page.evaluate(() => { (window as any).__entryMusicHold = true; });
    await startEntry(page); await expect(page.locator('#record-state')).toHaveText('加载中');
    if (reason === 'background') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    else await page.evaluate(() => (window as any).__experience.fail());
    await page.evaluate(() => (window as any).__releaseEntryMusic());
    expect(await page.evaluate(() => (window as any).__entryMusic.paused)).toBe(true);
    if (reason === 'background') {
      await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await finishSceneStep(page, 'entering'); await expect(page.locator('#room-ui')).toBeVisible();
      await expect(page.locator('#record-state')).toHaveText('已暂停');
    } else await expect(page.locator('#fallback')).toBeVisible();
    expect(await calls(page)).toHaveLength(1);
  });
}

test('late storage restoration cannot replace the record already starting at entry', async ({ page }) => {
  await installMedia(page);
  await page.route(/\/src\/record-storage\.ts(?:\?.*)?$/, route => route.fulfill({ contentType: 'application/javascript', body: 'export const createRecordStorage=()=>({read:()=>new Promise(resolve=>window.__releaseSavedRecord=resolve),save:async()=>{},clear:async()=>{}});' }));
  await fixture(page); await startEntry(page);
  await page.evaluate(() => (window as any).__releaseSavedRecord(new File(['saved'], 'late-track.mp3', { type: 'audio/mpeg' })));
  await finishSceneStep(page, 'entering');
  await expect(page.locator('#record-track')).toContainText('Merry Christmas Mr. Lawrence');
  expect(await calls(page)).toHaveLength(1);
  expect(await page.evaluate(() => (window as any).__entryMusic.src)).toMatch(/default-record.*\.mp3/);
});
