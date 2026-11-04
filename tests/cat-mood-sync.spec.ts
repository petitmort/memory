import { test, expect } from '@playwright/test';

/** Real sound UI and native decoded voices, without a GPU room for each mood. */
test('every mood reaches its matching native voice and keeps one clock without queued muted reactions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    const host = window as any;
    const NativeContext = window.AudioContext;
    host.__moodStats = { contexts: 0, starts: 0, durations: [] as number[], sampleRates: [] as number[] };
    window.AudioContext = class extends NativeContext {
      constructor(options?: AudioContextOptions) {
        super(options); host.__moodContext = this; host.__moodStats.contexts++;
      }
    };
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args: any[]) {
      if (this.buffer && this.buffer.duration < 6) {
        host.__moodStats.starts++;
        host.__moodStats.durations.push(this.buffer.duration);
        host.__moodStats.sampleRates.push(this.buffer.sampleRate);
      }
      return (start as any).apply(this, args);
    };
  });
  // Retain the real factory's return value only in this isolated test page.
  await page.route(/\/src\/cat-voice\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch();
    const body = await response.text();
    expect(body).toContain('export function createCatVoice(');
    await route.fulfill({ response, body: body.replace('export function createCatVoice(', 'function buildMoodVoice(') + `
      export function createCatVoice(...args) {
        const voice=buildMoodVoice(...args); window.__moodVoice=voice; return voice;
      }
    ` });
  });
  await page.route('**/__cat-mood-sync', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Cat voice synchronization</title><div id="app"></div>',
  }));
  await page.goto('/__cat-mood-sync');
  await page.evaluate(async () => {
    const { mountAppView } = await import('/src/app-view.ts');
    const { createSoundController } = await import('/src/sound-controller.ts');
    const { CAT_REACTIONS } = await import('/src/cat-reactions.ts');
    const host = window as any;
    mountAppView();
    document.getElementById('loading')!.remove();
    document.getElementById('intro')!.remove();
    host.__moodProfiles = CAT_REACTIONS;
    host.__moodController = createSoundController({
      getState: () => 'room', getSceneAvailable: () => true,
      onRecordPlaying: () => {}, toast: () => {},
    });
    const unlock = document.createElement('button'); unlock.id = 'mood-unlock'; unlock.textContent = '开启声音';
    unlock.onclick = async () => { await host.__moodController.unlock(); host.__moodUnlocked = true; };
    const pet = document.createElement('button'); pet.id = 'mood-pet'; pet.textContent = '测试本次反应';
    pet.onclick = () => { host.__moodClock = host.__moodController.onCatPet(host.__moodProfiles[host.__moodIndex]); };
    document.body.append(unlock, pet);
    host.__moodController.prepare();
    await host.__moodVoice.ready;
  });
  await page.locator('#mood-unlock').click();
  await page.waitForFunction(() => (window as any).__moodUnlocked === true);
  const ids = await page.evaluate(() => (window as any).__moodProfiles.map((profile: any) => profile.id));
  expect(ids).toHaveLength(6);
  for (let index = 0; index < ids.length; index++) {
    await page.evaluate(index => { (window as any).__moodIndex = index; }, index);
    await page.locator('#mood-pet').click();
    const started = await page.evaluate(() => {
      const host = window as any;
      return { id: host.__moodVoice.getActiveProfile(), time: host.__moodClock?.(), starts: host.__moodStats.starts,
        duration: host.__moodStats.durations.at(-1), sampleRate: host.__moodStats.sampleRates.at(-1),
        expectedEnd: host.__moodProfiles[host.__moodIndex].cues.at(-1).end };
    });
    expect(started.id).toBe(ids[index]);
    expect(started.starts).toBe(index + 1);
    // MP3 endpoints are on 44.1kHz frames; native decoding may resample to the
    // device rate. Allow one source and one output frame, still below 0.05ms.
    expect(started.sampleRate).toBeGreaterThan(0);
    expect(Math.abs(started.duration - started.expectedEnd)).toBeLessThanOrEqual(1 / 44100 + 1 / started.sampleRate + 1e-7);
    expect(started.time).toBeGreaterThanOrEqual(0);
    expect(started.time).toBeLessThan(.5);
    await page.waitForFunction(time => (window as any).__moodClock() > time + .025, started.time);
    await page.evaluate(() => { (window as any).__moodController.stopCat(); });
    await expect.poll(() => page.evaluate(() => (window as any).__moodVoice.getActiveProfile() ?? null)).toBe(null);
    const oldTime = await page.evaluate(() => (window as any).__moodClock());
    await page.evaluate(() => { (window as any).__oldMoodClock = (window as any).__moodClock; });
    expect(await page.evaluate(() => (window as any).__oldMoodClock())).toBeGreaterThanOrEqual(oldTime);
  }
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-label', '开启声音');
  await page.locator('#mood-pet').click();
  expect(await page.evaluate(() => (window as any).__moodVoice.getActiveProfile() ?? null)).toBe(null);
  expect(await page.evaluate(() => (window as any).__moodStats.starts)).toBe(6);
  await page.locator('#sound').click();
  await expect(page.locator('#sound')).toHaveAttribute('aria-label', '关闭声音');
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__moodStats.starts)).toBe(6);
  expect(await page.evaluate(() => (window as any).__moodStats.contexts)).toBe(1);
  await page.evaluate(() => { (window as any).__moodController.dispose(); });
  expect(errors).toEqual([]);
});
