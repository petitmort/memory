import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, enterFixtureRoom } from './helpers/experience-scene';

const title = 'Merry Christmas Mr. Lawrence — 坂本龍一';

function quietRecord() {
  const wav = Buffer.alloc(44 + 16000);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
  wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40);
  return wav;
}

async function trackMedia(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const host = window as any, NativeAudio = window.Audio;
    host.__defaultPlays = 0;
    const TrackAudio = function (source?: string) {
      const audio = source === undefined ? new NativeAudio() : new NativeAudio(source);
      host.__defaultMedia = audio;
      return audio;
    };
    TrackAudio.prototype = NativeAudio.prototype;
    window.Audio = TrackAudio as unknown as typeof Audio;
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if (this === host.__defaultMedia) host.__defaultPlays++;
      return play.call(this);
    };
  });
}

async function media(page: Page) {
  return page.evaluate(() => {
    const audio = (window as any).__defaultMedia as HTMLAudioElement;
    return { source: audio.src, paused: audio.paused, time: audio.currentTime, duration: audio.duration,
      preload: audio.preload, plays: (window as any).__defaultPlays };
  });
}

test('the supplied default stays paused and undownloaded until a trusted playback gesture', async ({ page }) => {
  const requests: string[] = [], errors: string[] = [];
  page.on('request', request => { if (request.resourceType() === 'media') requests.push(request.url()); });
  page.on('pageerror', error => errors.push(error.message));
  await trackMedia(page); await mockExperienceScene(page);
  await page.goto('/'); await enterFixtureRoom(page);
  await expect(page.locator('#record-track')).toHaveText(title);
  await expect(page.locator('#record-state')).toHaveText('已暂停');
  await expect(page.locator('#record-toggle')).toHaveAttribute('aria-label', '播放唱片');
  expect(await media(page)).toMatchObject({ source: '', paused: true, plays: 0, preload: 'none' });
  expect(requests).toEqual([]);

  await page.locator('#record-toggle').focus(); await page.keyboard.press('Enter');
  await expect(page.locator('#record-state')).toHaveText('播放中', { timeout: 30000 });
  await page.waitForFunction(() => (window as any).__defaultMedia.currentTime > .05);
  const playing = await media(page);
  expect(playing.source).toMatch(/default-record.*\.mp3/);
  expect(playing.duration).toBeGreaterThan(60);
  expect(playing.plays).toBe(1); expect(playing.paused).toBe(false);
  expect(requests.some(url => /default-record.*\.mp3/.test(url))).toBe(true);
  await page.locator('#record-toggle').click();
  await expect(page.locator('#record-state')).toHaveText('已暂停');
  expect((await media(page)).source).toBe(playing.source);
  expect(errors).toEqual([]);
});

test('a saved personal song wins and restoring the default removes that saved override', async ({ page }) => {
  // Seed a real IndexedDB record on this origin before the application starts.
  await page.route('**/__default-music-storage', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Saved music</title>' }));
  await page.goto('/__default-music-storage');
  await page.evaluate(async bytes => {
    const { createRecordStorage } = await import('/src/record-storage.ts');
    await createRecordStorage().save(new File([new Uint8Array(bytes)], '私の音楽.wav', { type: 'audio/wav' }));
  }, [...quietRecord()]);
  await trackMedia(page); await mockExperienceScene(page);
  page.on('filechooser', () => {});
  await page.goto('/'); await enterFixtureRoom(page);
  await expect(page.locator('#record-track')).toHaveText('私の音楽');
  expect(await media(page)).toMatchObject({ paused: true, plays: 0 });
  expect((await media(page)).source).toMatch(/^blob:/);

  const choose = page.waitForEvent('filechooser', { timeout: 30000 });
  await page.locator('#choose-record').click();
  await (await choose).setFiles([]);
  await expect(page.locator('#restore-record')).toBeVisible();
  await page.locator('#restore-record').click();
  await expect(page.locator('#record-track')).toHaveText(title);
  await expect(page.locator('#record-state')).toHaveText('播放中', { timeout: 30000 });
  expect((await media(page)).source).toMatch(/default-record.*\.mp3/);
  await expect.poll(() => page.evaluate(async () => {
    const { createRecordStorage } = await import('/src/record-storage.ts');
    return (await createRecordStorage().read())?.name ?? null;
  })).toBe(null);
  await page.reload(); await enterFixtureRoom(page);
  await expect(page.locator('#record-track')).toHaveText(title);
  expect(await media(page)).toMatchObject({ paused: true, plays: 0 });
});

test('blocked browser storage still leaves the supplied default playable', async ({ page }) => {
  await trackMedia(page); await mockExperienceScene(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { configurable: true, get() { throw new DOMException('Storage unavailable', 'SecurityError'); } });
  });
  await page.goto('/'); await enterFixtureRoom(page);
  await expect(page.locator('#record-track')).toHaveText(title);
  await page.locator('#record-toggle').click();
  await expect(page.locator('#record-state')).toHaveText('播放中', { timeout: 30000 });
  expect((await media(page)).source).toMatch(/default-record.*\.mp3/);
});

test('a late browser restore cannot replace a default record the user already started', async ({ page }) => {
  await trackMedia(page); await mockExperienceScene(page);
  await page.route(/\/src\/record-storage\.ts(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: `export function createRecordStorage() { return {
      read() { return new Promise(resolve => { window.__releaseSavedRecord = () => resolve(new File(['late'], '迟到的音乐.mp3', {type:'audio/mpeg'})); }); },
      save() { return Promise.resolve(); }, clear() { return Promise.resolve(); }
    }; }`,
  }));
  await page.goto('/'); await enterFixtureRoom(page);
  await page.locator('#record-toggle').click();
  await expect(page.locator('#record-state')).toHaveText('播放中', { timeout: 30000 });
  const playing = await media(page);
  await page.evaluate(() => (window as any).__releaseSavedRecord());
  await page.waitForFunction(time => (window as any).__defaultMedia.currentTime > time + .05, playing.time);
  await expect(page.locator('#record-track')).toHaveText(title);
  expect((await media(page)).source).toBe(playing.source);
  expect((await media(page)).paused).toBe(false);
});
