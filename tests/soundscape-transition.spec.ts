import { test, expect, type Page } from '@playwright/test';
import { mockExperienceScene, finishSceneStep } from './helpers/experience-scene';

/** Observe native nodes and automation without replacing the Web Audio graph. */
async function observeNativeAudio(page: Page, holdPreparation = false) {
  await page.addInitScript(({ holdPreparation }) => {
    const host = window as any;
    const stats = host.__soundscapeAudio = {
      contexts: 0, gains: 0, sources: 0, starts: 0, stops: 0, disconnects: 0,
      oscillators: 0, oscillatorStarts: 0, decodes: 0,
      directGains: [] as number[],
      automation: [] as { gain: number; value: number; at: number; constant: number; before: number; after: number }[],
    };
    host.__soundscapeGains = [];
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      private firstSuspend = true;
      constructor(options?: AudioContextOptions) {
        super({ sampleRate: 22050, ...options });
        stats.contexts++; host.__soundscapeDevice = this;
      }
      suspend() {
        const suspended = super.suspend();
        if (!this.firstSuspend || !holdPreparation) return suspended;
        this.firstSuspend = false;
        // The native device really suspends. Only its completion is delayed.
        return suspended.then(() => new Promise<void>(resolve => { host.__releaseSoundscapePreparation = resolve; }));
      }
      resume() {
        if (host.__soundscapeRejectResume) return Promise.reject(new DOMException('Audio device interrupted', 'InvalidStateError'));
        return super.resume();
      }
      createGain() {
        const gain = super.createGain(), index = stats.gains++;
        host.__soundscapeGains.push(gain);
        const connect = gain.connect.bind(gain);
        gain.connect = ((destination: AudioNode | AudioParam, output?: number, input?: number) => {
          if (destination === this.destination) stats.directGains.push(index);
          return destination instanceof AudioNode ? connect(destination, output, input) : connect(destination, output);
        }) as typeof gain.connect;
        const target = gain.gain.setTargetAtTime.bind(gain.gain);
        gain.gain.setTargetAtTime = (value: number, at: number, constant: number) => {
          const before = gain.gain.value, result = target(value, at, constant);
          stats.automation.push({ gain: index, value, at, constant, before, after: gain.gain.value });
          return result;
        };
        return gain;
      }
      createBufferSource() {
        const source = super.createBufferSource(); stats.sources++;
        const start = source.start.bind(source), stop = source.stop.bind(source), disconnect = source.disconnect.bind(source);
        source.start = (at?: number, offset?: number, duration?: number) => { stats.starts++; start(at, offset, duration); };
        source.stop = (at?: number) => { stats.stops++; stop(at); };
        source.disconnect = () => { stats.disconnects++; disconnect(); };
        return source;
      }
      createOscillator() {
        const oscillator = super.createOscillator(), start = oscillator.start.bind(oscillator);
        stats.oscillators++;
        oscillator.start = (at?: number) => { stats.oscillatorStarts++; start(at); };
        return oscillator;
      }
      decodeAudioData(data: ArrayBuffer) {
        return super.decodeAudioData(data).then(buffer => { stats.decodes++; return buffer; });
      }
    };

    // Media state is a deterministic boundary; all environmental audio above
    // uses the browser's real AudioContext, AudioParams and native source nodes.
    class RecordMedia extends EventTarget {
      preload = ''; autoplay = false; loop = false; volume = 1; muted = false;
      src = ''; currentSrc = ''; currentTime = 0; paused = true; ended = false; error = null;
      constructor() { super(); host.__soundscapeMedia = this; }
      load() { this.currentSrc = this.src; this.currentTime = 0; this.paused = true; }
      removeAttribute(name: string) { if (name === 'src') this.src = this.currentSrc = ''; }
      pause() { const changed = !this.paused; this.paused = true; if (changed) this.dispatchEvent(new Event('pause')); }
      play() {
        host.__soundscapeMusicCalls = (host.__soundscapeMusicCalls ?? 0) + 1;
        if (host.__soundscapeBlockMusic) return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
        this.paused = false;
        if (host.__soundscapeHoldMusic) return new Promise<void>(resolve => {
          host.__releaseSoundscapeMusic = () => { this.dispatchEvent(new Event('playing')); resolve(); };
        });
        this.dispatchEvent(new Event('playing'));
        return Promise.resolve();
      }
    }
    window.Audio = RecordMedia as unknown as typeof Audio;
  }, { holdPreparation });
}

async function controllerFixture(page: Page, options: { holdPreparation?: boolean; initialState?: string } = {}) {
  await observeNativeAudio(page, options.holdPreparation);
  await page.route('**/__soundscape-controller*', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Native room soundscape transition regression</title>',
  }));
  await page.goto('/__soundscape-controller');
  await page.evaluate(async initialState => {
    document.body.innerHTML = `<button id="unlock-audio">Unlock sound</button><button id="door-audio">Open door</button>
      <div id="room-ui"><button id="sound"></button><button id="record-toggle"></button>
      <button id="choose-record"></button><input id="record-file" type="file"><span id="record-track"></span>
      <span id="record-status"></span><button id="pet-cat"></button><span id="pet-hint"></span></div>`;
    const host = window as any;
    const fixture: any = host.__soundscape = { stage: initialState, available: true, hidden: false, unlocks: 0, toasts: [] as string[] };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => fixture.hidden });
    const { createSoundController } = await import('/src/sound-controller.ts');
    const sound = fixture.sound = createSoundController({
      getState: () => fixture.stage, getSceneAvailable: () => fixture.available,
      onRecordPlaying() {}, toast: (message: string) => fixture.toasts.push(message),
    });
    document.querySelector('#unlock-audio')!.addEventListener('click', () => {
      void sound.unlock().then(() => { fixture.unlocks++; });
    });
    document.querySelector('#door-audio')!.addEventListener('click', () => {
      fixture.stage = 'entering'; sound.updateContext(); sound.onRoomEntry();
    });
    sound.prepare();
  }, options.initialState ?? 'fog');
}

async function audioSnapshot(page: Page) {
  return page.evaluate(() => {
    const host = window as any, stats = host.__soundscapeAudio, device = host.__soundscapeDevice;
    const sea = host.__soundscapeGains[0] as GainNode | undefined;
    const weatherMaster = stats.directGains.find((index: number) => index !== 0);
    return {
      contexts: stats.contexts as number, gains: stats.gains as number, sources: stats.sources as number,
      starts: stats.starts as number, stops: stats.stops as number, disconnects: stats.disconnects as number,
      oscillators: stats.oscillators as number, oscillatorStarts: stats.oscillatorStarts as number,
      decodes: stats.decodes as number, state: device?.state as AudioContextState | undefined,
      seaValue: sea?.gain.value as number | undefined,
      effectiveSea: device?.state === 'running' ? sea?.gain.value ?? 0 : 0,
      targets: stats.automation.filter((entry: { gain: number }) => entry.gain === 0) as {
        gain: number; value: number; at: number; constant: number; before: number; after: number;
      }[],
      weatherMasterTarget: stats.automation.filter((entry: { gain: number }) => entry.gain === weatherMaster).at(-1)?.value as number | undefined,
      weather: host.__soundscape?.sound.environmentSnapshot(),
      muted: host.__soundscapeMedia?.muted as boolean,
      paused: host.__soundscapeMedia?.paused as boolean,
      musicCalls: (host.__soundscapeMusicCalls ?? 0) as number,
    };
  });
}
async function setStage(page: Page, stage: string) {
  await page.evaluate(stage => {
    const fixture = (window as any).__soundscape; fixture.stage = stage; fixture.sound.updateContext();
  }, stage);
}
async function unlock(page: Page) {
  await page.locator('#unlock-audio').click();
  await expect.poll(() => page.evaluate(() => (window as any).__soundscape.unlocks)).toBeGreaterThan(0);
  await expect.poll(async () => (await audioSnapshot(page)).sources).toBe(4);
}
async function feedWeather(page: Page, timestamps: number[], active = true) {
  await page.evaluate(async ({ timestamps, active }) => {
    const { sampleWeather } = await import('/src/weather-controller.ts');
    const { sampleStorm } = await import('/src/storm-controller.ts');
    const sound = (window as any).__soundscape.sound;
    for (const timestamp of timestamps) {
      const weather = sampleWeather(timestamp, { kind: 'heavy-rain', windSpeed: 12 });
      sound.updateEnvironment({ timestamp, weather, storm: sampleStorm(timestamp, weather), active });
    }
  }, { timestamps, active });
}

test('the native sound device stays silent before a gesture and reuses the same graph through entry', async ({ page }) => {
  await controllerFixture(page);
  await expect.poll(async () => (await audioSnapshot(page)).sources).toBe(4);
  for (const stage of ['fog', 'clearing', 'door', 'entering', 'room']) {
    await setStage(page, stage);
    const before = await audioSnapshot(page);
    expect(before.effectiveSea).toBe(0);
    expect(before.targets.at(-1)?.value).toBe(0);
    expect(before.weather.audible).toBe(false);
  }
  await setStage(page, 'clearing'); await unlock(page);
  await feedWeather(page, [Date.UTC(2026, 10, 18, 12)], false);
  const clearing = await audioSnapshot(page);
  expect(clearing.targets.at(-1)!.value).toBe(0);
  expect(clearing.weather).toMatchObject({ audible: true, inRoom: false, space: 'courtyard', targetRain: 0 });
  expect(clearing.weather.targetWind).toBeGreaterThan(0);
  expect(clearing.weatherMasterTarget).toBe(.03);
  await setStage(page, 'door');
  const door = await audioSnapshot(page);
  expect(door.targets.at(-1)!.value).toBe(clearing.targets.at(-1)!.value);
  await setStage(page, 'entering');
  const entering = await audioSnapshot(page);
  expect(entering.targets.at(-1)).toMatchObject({ value: .065, constant: 1.2 });
  expect(entering.weather).toMatchObject({ audible: true, inRoom: false, space: 'interior' });
  expect(entering.weather.targetRain).toBeGreaterThan(0);
  await setStage(page, 'room');
  const room = await audioSnapshot(page);
  expect(room.targets.at(-1)).toMatchObject({ value: .065, constant: 1.2 });
  expect(room.weather).toMatchObject({ audible: true, inRoom: true });
  expect(room.weatherMasterTarget).toBe(.16);
  expect(room.contexts).toBe(1); expect(room.sources).toBe(4); expect(room.starts).toBe(4);
  expect(room.oscillators).toBe(1); expect(room.oscillatorStarts).toBe(1);
  await page.evaluate(() => (window as any).__soundscape.sound.dispose());
});

test('real gain automation remains continuous while record ducking and reading preserve the room mix', async ({ page }) => {
  await controllerFixture(page, { initialState: 'clearing' }); await unlock(page);
  await setStage(page, 'entering');
  // Wait for an actual rendered control interval, not just scheduled targets.
  await expect.poll(async () => (await audioSnapshot(page)).seaValue ?? 0).toBeGreaterThan(.0001);
  const beforeEntry = await audioSnapshot(page);
  await setStage(page, 'room');
  const entry = await audioSnapshot(page);
  expect(Math.abs(entry.targets.at(-1)!.after - entry.targets.at(-1)!.before)).toBeLessThan(.001);
  expect(entry.seaValue!).toBeGreaterThanOrEqual(beforeEntry.seaValue! - .001);
  await page.locator('#record-toggle').click();
  await expect(page.locator('#record-state')).toHaveText('播放中');
  const playing = await audioSnapshot(page);
  expect(playing.targets.at(-1)).toMatchObject({ value: .032, constant: 1.2 });
  for (const stage of ['opening', 'reading', 'closing', 'room']) {
    await setStage(page, stage);
    const reading = await audioSnapshot(page);
    expect(reading.targets.at(-1)).toMatchObject({ value: .032, constant: 1.2 });
    expect(reading.weather).toMatchObject({ audible: true, inRoom: stage === 'room', playingMusic: true });
    expect(reading.weatherMasterTarget).toBe(.075);
    expect(reading.musicCalls).toBe(1); expect(reading.sources).toBe(4); expect(reading.starts).toBe(4);
  }
  await page.locator('#record-toggle').click();
  await expect(page.locator('#record-state')).toHaveText('已暂停');
  const paused = await audioSnapshot(page);
  expect(paused.targets.at(-1)).toMatchObject({ value: .065, constant: 1.2 });
  expect(paused.musicCalls).toBe(1);
  for (const event of paused.targets) expect(Math.abs(event.after - event.before)).toBeLessThan(.001);
  await page.evaluate(() => (window as any).__soundscape.sound.dispose());
});

test('mute, hidden pages and scene loss silence both ambient layers without replaying a paused record', async ({ page }) => {
  await controllerFixture(page, { initialState: 'room' }); await unlock(page);
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-state')).toHaveText('播放中');
  await page.locator('#sound').click();
  const muted = await audioSnapshot(page);
  expect(muted.targets.at(-1)?.value).toBe(0); expect(muted.weather.audible).toBe(false);
  expect(muted.muted).toBe(true); expect(muted.paused).toBe(false);
  await page.locator('#sound').click();
  await expect.poll(async () => (await audioSnapshot(page)).targets.at(-1)?.value).toBe(.032);
  await page.evaluate(() => {
    const fixture = (window as any).__soundscape; fixture.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await audioSnapshot(page)).state).toBe('suspended');
  const hidden = await audioSnapshot(page);
  expect(hidden.targets.at(-1)?.value).toBe(0); expect(hidden.weather.audible).toBe(false);
  expect(hidden.effectiveSea).toBe(0); expect(hidden.paused).toBe(true);
  await page.evaluate(() => {
    const fixture = (window as any).__soundscape; fixture.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await audioSnapshot(page)).state).toBe('running');
  await expect(page.locator('#record-state')).toHaveText('已暂停');
  const returned = await audioSnapshot(page);
  expect(returned.targets.at(-1)?.value).toBe(.065); expect(returned.musicCalls).toBe(1);
  await page.evaluate(() => {
    const fixture = (window as any).__soundscape; fixture.available = false; fixture.stage = 'fallback'; fixture.sound.updateContext();
  });
  const unavailable = await audioSnapshot(page);
  expect(unavailable.targets.at(-1)?.value).toBe(0); expect(unavailable.weather.audible).toBe(false);
  expect(await page.evaluate(() => (window as any).__soundscape.sound.onCatPet())).toBeUndefined();
  await page.evaluate(() => { const sound = (window as any).__soundscape.sound; sound.dispose(); sound.dispose(); });
  await expect.poll(async () => (await audioSnapshot(page)).state).toBe('closed');
  const disposed = await audioSnapshot(page);
  expect(disposed.effectiveSea).toBe(0); expect(disposed.stops).toBe(4); expect(disposed.disconnects).toBe(4);
});

test('late native preparation cannot start sources after rapid muting and disposal', async ({ page }) => {
  await controllerFixture(page, { initialState: 'clearing', holdPreparation: true });
  await page.waitForFunction(() => typeof (window as any).__releaseSoundscapePreparation === 'function');
  await page.locator('#unlock-audio').click();
  await page.locator('#sound').click(); await page.locator('#sound').click(); await page.locator('#sound').click();
  const immediateToasts = await page.evaluate(() => [...(window as any).__soundscape.toasts]);
  await page.evaluate(() => {
    const host = window as any; host.__soundscape.sound.dispose(); host.__releaseSoundscapePreparation();
  });
  await expect.poll(async () => (await audioSnapshot(page)).state).toBe('closed');
  await expect.poll(() => page.evaluate(() => (window as any).__soundscape.unlocks)).toBe(1);
  await page.evaluate(async () => {
    const sound = (window as any).__soundscape.sound;
    sound.prepare(); await sound.unlock(); sound.updateContext(); sound.dispose();
  });
  const after = await audioSnapshot(page);
  expect(after.contexts).toBe(1); expect(after.sources).toBe(0); expect(after.starts).toBe(0);
  expect(after.oscillatorStarts).toBe(0); expect(after.effectiveSea).toBe(0);
  expect(await page.evaluate(() => (window as any).__soundscape.toasts)).toEqual(immediateToasts);
});

test('a rejected device resume closes the sound gate and a later gesture restores the same native graph', async ({ page }) => {
  await controllerFixture(page, { initialState: 'room' }); await unlock(page);
  await expect.poll(async () => (await audioSnapshot(page)).decodes).toBe(6);
  await expect.poll(async () => (await audioSnapshot(page)).seaValue ?? 0).toBeGreaterThan(.005);
  await page.evaluate(() => { (window as any).__soundscapeRejectResume = true; });
  await page.locator('#unlock-audio').click();
  await expect.poll(() => page.evaluate(() => (window as any).__soundscape.unlocks)).toBe(2);
  const failed = await audioSnapshot(page);
  expect(failed.targets.at(-1)?.value).toBe(0); expect(failed.weather.audible).toBe(false);
  expect(failed.weatherMasterTarget).toBe(0);
  const failedPet = await page.evaluate(() => typeof (window as any).__soundscape.sound.onCatPet() === 'function');
  expect(failedPet).toBe(false);
  const afterFailedPet = await audioSnapshot(page);
  expect(afterFailedPet.sources).toBe(4); expect(afterFailedPet.starts).toBe(4);
  await expect.poll(async () => (await audioSnapshot(page)).effectiveSea).toBeLessThan(.0001);
  expect(await page.evaluate(() => (window as any).__soundscape.toasts)).toContain('此浏览器暂时无法播放环境声');
  await page.evaluate(() => { (window as any).__soundscapeRejectResume = false; });
  await page.locator('#unlock-audio').click();
  await expect.poll(() => page.evaluate(() => (window as any).__soundscape.unlocks)).toBe(3);
  const restored = await audioSnapshot(page);
  expect(restored.targets.at(-1)?.value).toBe(.065); expect(restored.weather.audible).toBe(true);
  expect(restored.contexts).toBe(1); expect(restored.sources).toBe(4); expect(restored.starts).toBe(4);
  const restoredPet = await page.evaluate(() => typeof (window as any).__soundscape.sound.onCatPet() === 'function');
  expect(restoredPet).toBe(true);
  const afterRestoredPet = await audioSnapshot(page);
  expect(afterRestoredPet.contexts).toBe(1); expect(afterRestoredPet.sources).toBe(5); expect(afterRestoredPet.starts).toBe(5);
  await page.evaluate(() => (window as any).__soundscape.sound.dispose());
});

test('a rejected foreground resume resets every sound gate until a later explicit gesture', async ({ page }) => {
  await controllerFixture(page, { initialState: 'room' }); await unlock(page);
  await page.evaluate(() => {
    const host = window as any; host.__soundscape.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await audioSnapshot(page)).state).toBe('suspended');
  await page.evaluate(() => {
    const host = window as any; host.__soundscapeRejectResume = true; host.__soundscape.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await audioSnapshot(page)).targets.at(-1)?.value).toBe(0);
  const failed = await audioSnapshot(page);
  expect(failed.effectiveSea).toBe(0); expect(failed.weather.audible).toBe(false); expect(failed.weatherMasterTarget).toBe(0);
  expect(failed.musicCalls).toBe(0); expect(failed.sources).toBe(4); expect(failed.starts).toBe(4);
  await page.evaluate(() => { (window as any).__soundscapeRejectResume = false; });
  await page.locator('#unlock-audio').click();
  await expect.poll(() => page.evaluate(() => (window as any).__soundscape.unlocks)).toBe(2);
  const restored = await audioSnapshot(page);
  expect(restored.state).toBe('running'); expect(restored.targets.at(-1)?.value).toBe(.065);
  expect(restored.weather.audible).toBe(true); expect(restored.contexts).toBe(1); expect(restored.sources).toBe(4);
  await page.evaluate(() => (window as any).__soundscape.sound.dispose());
});

test('a hidden page completing unlock remains silent until visible and never starts the record', async ({ page }) => {
  await controllerFixture(page, { initialState: 'entering', holdPreparation: true });
  await page.waitForFunction(() => typeof (window as any).__releaseSoundscapePreparation === 'function');
  await page.locator('#unlock-audio').click();
  await page.evaluate(() => {
    const host = window as any; host.__soundscape.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    host.__releaseSoundscapePreparation();
  });
  await expect.poll(() => page.evaluate(() => (window as any).__soundscape.unlocks)).toBe(1);
  await expect.poll(async () => (await audioSnapshot(page)).sources).toBe(4);
  const hidden = await audioSnapshot(page);
  expect(hidden.effectiveSea).toBe(0); expect(hidden.targets.at(-1)?.value).toBe(0);
  expect(hidden.weather.audible).toBe(false); expect(hidden.musicCalls).toBe(0);
  await page.evaluate(() => {
    const fixture = (window as any).__soundscape; fixture.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(async () => (await audioSnapshot(page)).state).toBe('running');
  const returned = await audioSnapshot(page);
  expect(returned.targets.at(-1)).toMatchObject({ value: .065, constant: 1.2 });
  expect(returned.musicCalls).toBe(0); expect(returned.contexts).toBe(1);
  await page.evaluate(() => (window as any).__soundscape.sound.dispose());
});

test('courtyard weather has only quiet wind and cannot carry a thunder event through the doorway', async ({ page }) => {
  await controllerFixture(page); await unlock(page);
  const event = await page.evaluate(async () => {
    const { stormEventForSlot } = await import('/src/storm-controller.ts');
    return stormEventForSlot(9731);
  });
  // In the real scene the courtyard's environment frames have active:false.
  await feedWeather(page, [event.strikeTime - 120, event.strikeTime + 30], false);
  const courtyard = await audioSnapshot(page);
  expect(courtyard.targets.at(-1)?.value).toBe(0);
  expect(courtyard.weather).toMatchObject({ audible: true, inRoom: false, space: 'courtyard', targetRain: 0, thunders: 0 });
  expect(courtyard.weather.targetWind).toBeGreaterThan(0);
  await setStage(page, 'entering');
  await feedWeather(page, [event.thunderTime - 1]);
  await setStage(page, 'room');
  await feedWeather(page, [event.thunderTime + 30, event.thunderTime + 60]);
  const entered = await audioSnapshot(page);
  expect(entered.weather.thunders).toBe(0); expect(entered.weather.targetRain).toBeGreaterThan(0);
  const next = await page.evaluate(async () => {
    const { stormEventForSlot } = await import('/src/storm-controller.ts');
    return stormEventForSlot(9732);
  });
  await feedWeather(page, [next.strikeTime - 120, next.strikeTime + 30, next.thunderTime + 30]);
  expect((await audioSnapshot(page)).weather.thunders).toBe(1);
  const before = await audioSnapshot(page);
  for (const stage of ['opening', 'reading', 'closing', 'room', 'door', 'room']) await setStage(page, stage);
  const after = await audioSnapshot(page);
  expect(after.contexts).toBe(before.contexts); expect(after.sources).toBe(before.sources);
  expect(after.starts).toBe(before.starts); expect(after.oscillatorStarts).toBe(before.oscillatorStarts);
  await page.evaluate(() => (window as any).__soundscape.sound.dispose());
});

test('real entry controls keep the initial wind quiet, begin sea during the door animation and permit a blocked record retry', async ({ page }) => {
  await observeNativeAudio(page); await mockExperienceScene(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/'); await expect(page.locator('#loading')).toBeHidden();
  await expect.poll(async () => (await audioSnapshot(page)).sources).toBe(4);
  expect((await audioSnapshot(page)).effectiveSea).toBe(0);
  await page.locator('#enter').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'clearing');
  await expect.poll(async () => (await audioSnapshot(page)).state).toBe('running');
  expect((await audioSnapshot(page)).targets.at(-1)?.value).toBe(0);
  await finishSceneStep(page, 'clearing'); await expect(page.locator('#enter')).toBeEnabled();
  await page.evaluate(() => { (window as any).__soundscapeBlockMusic = true; });
  await page.locator('#enter').click();
  await page.waitForFunction(() => (window as any).__experience.pending === 'entering');
  await expect.poll(async () => (await audioSnapshot(page)).targets.at(-1)?.value).toBe(.065);
  expect((await audioSnapshot(page)).musicCalls).toBe(1);
  // The room's sea is already fading in while the camera is still entering.
  await expect.poll(async () => (await audioSnapshot(page)).seaValue ?? 0).toBeGreaterThan(.0001);
  await finishSceneStep(page, 'entering'); await expect(page.locator('#room-ui')).toBeVisible();
  await expect(page.locator('#record-state')).toHaveText('播放失败');
  await page.evaluate(() => { (window as any).__soundscapeBlockMusic = false; });
  await page.locator('#record-toggle').click(); await expect(page.locator('#record-state')).toHaveText('播放中');
  const retried = await audioSnapshot(page);
  expect(retried.targets.at(-1)).toMatchObject({ value: .032, constant: 1.2 });
  expect(retried.musicCalls).toBe(2); expect(retried.contexts).toBe(1); expect(retried.sources).toBe(4);
});

async function offlineAudioPage(page: Page) {
  await page.route('**/__soundscape-offline*', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Native offline room soundscape regression</title>',
  }));
  await page.goto('/__soundscape-offline');
}

test('native offline courtyard audio is wind-only with weather strength, record ducking and zero muted output', async ({ page }) => {
  await offlineAudioPage(page);
  const result = await page.evaluate(async () => {
    const { createWeatherSoundscape } = await import('/src/weather-audio.ts');
    const { prepareAmbientNoise } = await import('/src/ambient-audio.ts');
    const { createSeededRandom } = await import('/src/calendar-seed.ts');
    const { sampleWeather } = await import('/src/weather-controller.ts');
    const { sampleStorm } = await import('/src/storm-controller.ts');
    const sampleRate = 22050, length = sampleRate * 4, timestamp = Date.UTC(2026, 10, 18, 12);
    const sourceContext = new OfflineAudioContext(1, sampleRate * 8, sampleRate);
    const buffer = await prepareAmbientNoise(sourceContext as unknown as AudioContext, createSeededRandom(812314));
    const render = async (kind: 'clear' | 'heavy-rain', windSpeed: number, music = false, enabled = true) => {
      const context = new OfflineAudioContext(1, length, sampleRate);
      const soundscape = createWeatherSoundscape(context, buffer);
      const weather = sampleWeather(timestamp, { kind, windSpeed });
      soundscape.setContext(enabled, music, false, 'courtyard');
      soundscape.update({ timestamp, weather, storm: sampleStorm(timestamp, weather), active: false });
      const snapshot = soundscape.snapshot(), rendered = await context.startRendering();
      const data = rendered.getChannelData(0);
      let energy = 0, max = 0;
      for (let i = sampleRate * 3; i < length; i++) {
        energy += data[i] ** 2; max = Math.max(max, Math.abs(data[i]));
      }
      soundscape.dispose();
      return { data, rms: Math.sqrt(energy / sampleRate), max, snapshot, windSpeed: weather.windSpeed };
    };
    const clear = await render('clear', 8), rain = await render('heavy-rain', 8);
    const stronger = await render('heavy-rain', 13), ducked = await render('heavy-rain', 8, true);
    const muted = await render('heavy-rain', 8, false, false);
    let differentSamples = 0;
    for (let i = 0; i < length; i++) if (clear.data[i] !== rain.data[i]) differentSamples++;
    const summary = ({ data: _data, ...signal }: typeof clear) => signal;
    return {
      differentSamples, clear: summary(clear), rain: summary(rain), stronger: summary(stronger),
      ducked: summary(ducked), muted: summary(muted),
    };
  });
  expect(result.differentSamples).toBe(0); expect(result.clear.rms).toBe(result.rain.rms);
  expect(result.rain.rms).toBeGreaterThan(.000001);
  expect(result.stronger.rms).toBeGreaterThan(result.rain.rms * 1.5);
  expect(result.ducked.rms / result.rain.rms).toBeCloseTo(.015 / .03, 5);
  expect(result.muted.rms).toBe(0); expect(result.muted.max).toBe(0);
  expect(result.clear.windSpeed).toBe(8); expect(result.rain.windSpeed).toBe(8);
  for (const signal of [result.clear, result.rain, result.stronger, result.ducked, result.muted]) {
    expect(signal.snapshot).toMatchObject({ space: 'courtyard', inRoom: false, targetRain: 0, sources: 3, thunders: 0 });
    expect(signal.snapshot.targetWind).toBeGreaterThan(0); expect(signal.max).toBeLessThan(1);
  }
});

test('native offline doorway automation restores cached rain without a weather frame, a signal seam or new nodes', async ({ page }) => {
  await offlineAudioPage(page);
  const result = await page.evaluate(async () => {
    const { createWeatherSoundscape } = await import('/src/weather-audio.ts');
    const { prepareAmbientNoise } = await import('/src/ambient-audio.ts');
    const { createSeededRandom } = await import('/src/calendar-seed.ts');
    const { sampleWeather } = await import('/src/weather-controller.ts');
    const { sampleStorm, stormEventForSlot } = await import('/src/storm-controller.ts');
    const sampleRate = 22050, length = sampleRate * 4;
    const sourceContext = new OfflineAudioContext(1, sampleRate * 8, sampleRate);
    const buffer = await prepareAmbientNoise(sourceContext as unknown as AudioContext, createSeededRandom(712619));
    const event = stormEventForSlot(9731);
    const render = async (kind: 'clear' | 'heavy-rain') => {
      const context = new OfflineAudioContext(1, length, sampleRate);
      let allocations = 0, sourceAllocations = 0;
      for (const factory of ['createGain', 'createBiquadFilter', 'createBufferSource', 'createStereoPanner'] as const) {
        const create = context[factory].bind(context);
        (context as any)[factory] = () => {
          allocations++; if (factory === 'createBufferSource') sourceAllocations++;
          return create();
        };
      }
      const soundscape = createWeatherSoundscape(context, buffer);
      soundscape.setContext(true, false, false, 'courtyard');
      // A courtyard strike is observed by the world while room audio is inactive.
      for (const timestamp of [event.strikeTime - 120, event.strikeTime + 30]) {
        const weather = sampleWeather(timestamp, { kind, windSpeed: 8 });
        soundscape.update({ timestamp, weather, storm: sampleStorm(timestamp, weather), active: false });
      }
      const before = soundscape.snapshot(), beforeAllocations = allocations;
      const suspended = context.suspend(2), rendering = context.startRendering();
      await suspended;
      const transitionFrame = Math.round(context.currentTime * sampleRate);
      soundscape.setContext(true, false, false, 'interior');
      const entered = soundscape.snapshot();
      // No update() above: the rain target must come from the cached weather.
      for (let i = 0; i < 6; i++) {
        soundscape.setContext(false, false, false, 'courtyard');
        soundscape.setContext(true, false, true, 'interior');
        soundscape.setContext(true, false, false, 'interior');
      }
      const afterContexts = soundscape.snapshot(), afterAllocations = allocations;
      await context.resume();
      const rendered = await rendering, data = rendered.getChannelData(0);
      const afterRendering = soundscape.snapshot();
      soundscape.dispose();
      return { data, before, entered, afterContexts, afterRendering, transitionFrame,
        beforeAllocations, afterAllocations, sourceAllocations };
    };
    const wet = await render('heavy-rain'), dry = await render('clear');
    let prefixDifferences = 0, tailDifferenceEnergy = 0;
    for (let i = 0; i < wet.transitionFrame; i++) if (wet.data[i] !== dry.data[i]) prefixDifferences++;
    for (let i = sampleRate * 3; i < length; i++) tailDifferenceEnergy += (wet.data[i] - dry.data[i]) ** 2;
    const frame = wet.transitionFrame;
    const seamExtra = Math.abs((wet.data[frame] - wet.data[frame - 1]) - (dry.data[frame] - dry.data[frame - 1]));
    const summary = ({ data: _data, ...signal }: typeof wet) => signal;
    return { wet: summary(wet), dry: summary(dry), prefixDifferences, seamExtra,
      tailDifferenceRms: Math.sqrt(tailDifferenceEnergy / sampleRate) };
  });
  expect(result.prefixDifferences).toBe(0);
  expect(result.wet.transitionFrame).toBe(result.dry.transitionFrame);
  expect(result.seamExtra).toBeLessThan(.00001);
  expect(result.tailDifferenceRms).toBeGreaterThan(.00001);
  expect(result.wet.before.targetRain).toBe(0); expect(result.wet.entered.targetRain).toBeGreaterThan(0);
  expect(result.wet.entered.updates).toBe(result.wet.before.updates);
  expect(result.dry.entered.targetRain).toBe(0);
  for (const signal of [result.wet, result.dry]) {
    expect(signal.beforeAllocations).toBe(signal.afterAllocations); expect(signal.sourceAllocations).toBe(3);
    expect(signal.afterContexts).toMatchObject({ space: 'interior', inRoom: false, sources: 3, thunders: 0 });
    expect(signal.afterContexts.updates).toBe(signal.before.updates);
    expect(signal.afterRendering.thunders).toBe(0); expect(signal.afterRendering.sources).toBe(3);
  }
});
