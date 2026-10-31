import { test, expect, type Page } from '@playwright/test';
import { createThunderGate, createWeatherSoundscape, type EnvironmentSoundFrame } from '../src/weather-audio';
import { sampleStorm, stormEventForSlot } from '../src/storm-controller';
import { sampleWeather } from '../src/weather-controller';

const stormWeather = sampleWeather(0, { kind: 'heavy-rain' });
const event = stormEventForSlot(9731);
const frame = (timestamp: number, active = true, reduced = false): EnvironmentSoundFrame => ({
  timestamp, weather: stormWeather, storm: sampleStorm(timestamp, stormWeather, reduced), active,
});

function observeStrike(gate: ReturnType<typeof createThunderGate>, reduced = false) {
  expect(gate.update(frame(event.strikeTime - 120, true, reduced), true)).toBe(false);
  expect(gate.update(frame(event.strikeTime + 30, true, reduced), true)).toBe(false);
}

test('thunder follows an observed strike by the physical delay and fires exactly once', () => {
  const gate = createThunderGate(); observeStrike(gate);
  expect(gate.update(frame(event.thunderTime - 1), true)).toBe(false);
  expect(gate.update(frame(event.thunderTime + 30), true)).toBe(true);
  for (const elapsed of [31, 60, 100, 500, 1500])
    expect(gate.update(frame(event.thunderTime + elapsed), true)).toBe(false);
  const next = stormEventForSlot(9732);
  expect(gate.update(frame(next.strikeTime - 120), true)).toBe(false);
  expect(gate.update(frame(next.strikeTime + 30), true)).toBe(false);
  expect(gate.update(frame(next.thunderTime + 30), true)).toBe(true);
});

test('the enhanced thunderstorm reaches the existing sound gate more often without replaying or removing the physical delay', () => {
  const start = Date.UTC(2026, 9, 1, 12), counts: number[] = [];
  for (const kind of ['heavy-rain', 'thunderstorm'] as const) {
    const weather = sampleWeather(start, { kind }), gate = createThunderGate();
    let count = 0;
    for (let timestamp = start; timestamp < start + 600000; timestamp += 50) {
      const storm = sampleStorm(timestamp, weather);
      const input = { timestamp, weather, storm, active: true };
      if (!gate.update(input, true)) continue;
      count++;
      expect(timestamp - storm.strikeTime).toBeGreaterThan(800);
      expect(Math.abs(timestamp - storm.thunderTime)).toBeLessThan(51);
      expect(gate.update(input, true)).toBe(false);
    }
    counts.push(count);
  }
  expect(counts[0]).toBeGreaterThan(0);
  expect(counts[1]).toBeGreaterThan(counts[0] * 2);
});

test('first frame and large time jumps do not catch up a visible or already audible storm', () => {
  for (const initial of [event.strikeTime + 50, event.thunderTime - 1, event.thunderTime + 10]) {
    const gate = createThunderGate();
    expect(gate.update(frame(initial), true)).toBe(false);
    expect(gate.update(frame(event.thunderTime + 40), true)).toBe(false);
  }
  const gate = createThunderGate();
  expect(gate.update(frame(event.strikeTime - 10000), true)).toBe(false);
  expect(gate.update(frame(event.thunderTime + 20), true)).toBe(false);
  expect(gate.update(frame(event.thunderTime + 40), true)).toBe(false);
});

test('muting, leaving the room and explicit pause reset discard pending thunder without replay on return', () => {
  for (const reason of ['mute', 'inactive', 'reset'] as const) {
    const gate = createThunderGate(); observeStrike(gate);
    if (reason === 'mute') expect(gate.update(frame(event.strikeTime + 100), false)).toBe(false);
    if (reason === 'inactive') expect(gate.update(frame(event.strikeTime + 100, false), true)).toBe(false);
    if (reason === 'reset') gate.reset();
    expect(gate.update(frame(event.thunderTime + 30), true)).toBe(false);
    expect(gate.update(frame(event.thunderTime + 60), true)).toBe(false);
  }
});

test('backward seeks and an observed strike whose audio deadline was missed do not replay thunder', () => {
  const gate = createThunderGate(); observeStrike(gate);
  expect(gate.update(frame(event.thunderTime + 20), true)).toBe(true);
  expect(gate.update(frame(event.strikeTime - 100), true)).toBe(false);
  expect(gate.update(frame(event.strikeTime + 30), true)).toBe(false);
  expect(gate.update(frame(event.thunderTime + 20), true)).toBe(false);
  gate.reset(); observeStrike(gate);
  expect(gate.update(frame(event.thunderTime + 300), true)).toBe(false);
  expect(gate.update(frame(event.thunderTime + 400), true)).toBe(false);
});

test('reduced motion suppresses lightning visuals while preserving the delayed thunder crossing', () => {
  const gate = createThunderGate(); observeStrike(gate, true);
  const quietVisual = frame(event.strikeTime + 30, true, true);
  expect(quietVisual.storm.flash).toBe(0); expect(quietVisual.storm.bolt).toBe(false);
  expect(gate.update(frame(event.thunderTime - 1, true, true), true)).toBe(false);
  expect(gate.update(frame(event.thunderTime + 20, true, true), true)).toBe(true);
});

test('ordinary rain and snow never create a thunder event for the audio gate', () => {
  for (const kind of ['clear', 'light-rain', 'rain', 'light-snow', 'snow'] as const) {
    const weather = sampleWeather(0, { kind }), gate = createThunderGate();
    for (const timestamp of [event.strikeTime - 120, event.strikeTime + 30, event.thunderTime + 20]) {
      const storm = sampleStorm(timestamp, weather);
      expect(storm.eventId).toBeNull();
      expect(gate.update({ timestamp, weather, storm, active: true }, true)).toBe(false);
    }
  }
});

test('optional audio construction releases every partial node when panning, connection or starting a source fails', () => {
  for (const failure of ['panner', 'connection', 'start'] as const) {
    const nodes: any[] = [], sources: any[] = [];
    let connects = 0, starts = 0;
    const parameter = () => ({ value: 0 });
    const node = (kind: string) => {
      const value = {
        kind, connected: false, disconnected: false, started: false, stopped: false, stopAttempts: 0,
        buffer: null, loop: false, gain: parameter(), frequency: parameter(), Q: parameter(), pan: parameter(),
        connect() {
          connects++;
          if (failure === 'connection' && connects === 2) throw new Error('Audio connection unavailable');
          value.connected = true;
        },
        disconnect() {
          value.disconnected = true; value.connected = false;
          if (nodes[0] === value) throw new Error('Closed destination');
        },
        start() {
          starts++;
          if (failure === 'start' && starts === 2) throw new Error('Audio source start failed');
          value.started = true;
        },
        stop() {
          value.stopAttempts++;
          if (!value.started) throw new Error('Cannot stop an unstarted source');
          value.stopped = true;
        },
      };
      nodes.push(value); if (kind === 'source') sources.push(value);
      return value;
    };
    const context = {
      currentTime: 0, destination: {},
      createGain: () => node('gain'), createBiquadFilter: () => node('filter'), createBufferSource: () => node('source'),
      createStereoPanner: () => { if (failure === 'panner') throw new Error('Stereo panning unsupported'); return node('pan'); },
    } as unknown as BaseAudioContext;
    expect(() => createWeatherSoundscape(context, { duration: 8 } as AudioBuffer)).toThrow(
      failure === 'panner' ? 'Stereo panning unsupported' : failure === 'connection' ? 'Audio connection unavailable' : 'Audio source start failed',
    );
    expect(nodes.length).toBeGreaterThanOrEqual(3);
    expect(nodes.every(value => value.disconnected)).toBe(true);
    expect(sources.every(value => value.stopAttempts === 1)).toBe(true);
    expect(sources.filter(value => value.started && !value.stopped && value.connected)).toHaveLength(0);
    if (failure === 'panner') { expect(sources).toHaveLength(3); expect(starts).toBe(0); }
    if (failure === 'start') { expect(starts).toBe(2); expect(sources[0].started).toBe(true); expect(sources[0].stopped).toBe(true); }
  }
});

async function audioPage(page: Page) {
  await page.route('**/__environment-audio*', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Native offline environmental audio regression</title>',
  }));
  await page.goto('/__environment-audio');
}

test('native OfflineAudioContext renders distinct wet and wind signals, zero muted output and music ducking from shared seeded noise', async ({ page }) => {
  await audioPage(page);
  const result = await page.evaluate(async () => {
    const { createWeatherSoundscape } = await import('/src/weather-audio.ts');
    const { prepareAmbientNoise } = await import('/src/ambient-audio.ts');
    const { createSeededRandom } = await import('/src/calendar-seed.ts');
    const { sampleWeather } = await import('/src/weather-controller.ts');
    const { sampleStorm } = await import('/src/storm-controller.ts');
    const sampleRate = 22050, length = sampleRate * 4;
    const sourceContext = new OfflineAudioContext(1, sampleRate * 8, sampleRate);
    const buffer = await prepareAmbientNoise(sourceContext as unknown as AudioContext, createSeededRandom(417623));
    const timestamp = Date.UTC(2026, 9, 31, 12);
    const render = async (kind: 'clear' | 'heavy-rain', windSpeed: number, enabled = true, music = false) => {
      const context = new OfflineAudioContext(1, length, sampleRate);
      const soundscape = createWeatherSoundscape(context, buffer);
      const weather = sampleWeather(timestamp, { kind, windSpeed });
      soundscape.setContext(enabled, music, true);
      soundscape.update({ timestamp, weather, storm: sampleStorm(timestamp, weather), active: true });
      const snapshot = soundscape.snapshot();
      const rendered = await context.startRendering(), data = rendered.getChannelData(0);
      let energy = 0, max = 0, changes = 0;
      for (let i = sampleRate * 3; i < length; i++) {
        energy += data[i] * data[i]; max = Math.max(max, Math.abs(data[i]));
        if (data[i] * data[i - 1] < 0) changes++;
      }
      soundscape.dispose();
      return { rms: Math.sqrt(energy / sampleRate), max, zeroCrossings: changes, snapshot };
    };
    return {
      source: { seconds: buffer.duration, frames: buffer.length, sampleRate: buffer.sampleRate },
      calm: await render('clear', 1.5), rain: await render('heavy-rain', 1.5),
      wind: await render('clear', 20), muted: await render('heavy-rain', 20, false),
      duckedRain: await render('heavy-rain', 1.5, true, true),
    };
  });
  expect(result.source).toEqual({ seconds: 8, frames: 176400, sampleRate: 22050 });
  expect(result.calm.rms).toBe(0);
  expect(result.rain.rms).toBeGreaterThan(.00001); expect(result.wind.rms).toBeGreaterThan(.00001);
  expect(result.rain.zeroCrossings).toBeGreaterThan(result.wind.zeroCrossings * 2);
  expect(result.muted.rms).toBe(0); expect(result.muted.max).toBe(0);
  expect(result.duckedRain.rms / result.rain.rms).toBeCloseTo(.075 / .16, 4);
  expect(result.duckedRain.snapshot.playingMusic).toBe(true);
  for (const signal of [result.calm, result.rain, result.wind, result.muted, result.duckedRain]) {
    expect(signal.max).toBeLessThan(1); expect(signal.snapshot.sources).toBe(3);
  }
});

test('native offline audio fades mute, reuses its three source nodes across weather changes and releases them once', async ({ page }) => {
  await audioPage(page);
  const result = await page.evaluate(async () => {
    const { createWeatherSoundscape } = await import('/src/weather-audio.ts');
    const { prepareAmbientNoise } = await import('/src/ambient-audio.ts');
    const { createSeededRandom } = await import('/src/calendar-seed.ts');
    const { sampleWeather } = await import('/src/weather-controller.ts');
    const { sampleStorm } = await import('/src/storm-controller.ts');
    const sampleRate = 22050, context = new OfflineAudioContext(1, sampleRate * 4, sampleRate);
    const buffer = await prepareAmbientNoise(context as unknown as AudioContext, createSeededRandom(52728));
    let created = 0, stopped = 0, disconnected = 0;
    const create = context.createBufferSource.bind(context);
    context.createBufferSource = () => {
      const source = create(); created++;
      const stop = source.stop.bind(source), disconnect = source.disconnect.bind(source);
      source.stop = (at?: number) => { stopped++; stop(at); };
      source.disconnect = () => { disconnected++; disconnect(); };
      return source;
    };
    const soundscape = createWeatherSoundscape(context, buffer), timestamp = Date.UTC(2026, 9, 31, 12);
    soundscape.setContext(true, false, true);
    for (let i = 0; i < 120; i++) {
      const at = timestamp + i * 100, weather = sampleWeather(at, { kind: i % 2 ? 'clear' : 'heavy-rain', windSpeed: 8 });
      soundscape.update({ timestamp: at, weather, storm: sampleStorm(at, weather), active: true });
    }
    const before = soundscape.snapshot();
    const suspended = context.suspend(2), rendering = context.startRendering();
    await suspended;
    soundscape.setContext(false, false, true);
    await context.resume();
    const rendered = await rendering, data = rendered.getChannelData(0);
    const rms = (start: number, end: number) => {
      let energy = 0; const from = start * sampleRate, to = end * sampleRate;
      for (let i = from; i < to; i++) energy += data[i] ** 2;
      return Math.sqrt(energy / (to - from));
    };
    soundscape.dispose(); soundscape.dispose();
    const after = soundscape.snapshot();
    const weather = sampleWeather(timestamp, { kind: 'heavy-rain' });
    soundscape.update({ timestamp, weather, storm: sampleStorm(timestamp, weather), active: true });
    return { before, after, afterIgnoredUpdate: soundscape.snapshot(), created, stopped, disconnected,
      sounding: rms(1, 2), mutedTail: rms(3, 4), atMute: data[2 * sampleRate - 1], afterMute: data[2 * sampleRate] };
  });
  expect(result.before.sources).toBe(3); expect(result.before.updates).toBe(120);
  expect(result.created).toBe(3); expect(result.stopped).toBe(3); expect(result.disconnected).toBe(3);
  expect(result.sounding).toBeGreaterThan(.00001); expect(result.mutedTail).toBeLessThan(result.sounding * .000001);
  expect(Math.abs(result.atMute - result.afterMute)).toBeLessThan(.005);
  expect(result.after.disposed).toBe(true); expect(result.after.sources).toBe(0);
  expect(result.afterIgnoredUpdate).toEqual(result.after);
});

test('unsupported optional stereo panning preserves the original native ocean, LFO and cat audio on the same device', async ({ page }) => {
  await audioPage(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.evaluate(async () => {
    document.body.innerHTML = `<button id="unlock-audio">Unlock native audio</button><button id="sound"></button>
      <button id="record-toggle"></button><button id="choose-record"></button><input id="record-file" type="file">
      <span id="record-track"></span><span id="record-status"></span><button id="pet-cat"></button><span id="pet-hint"></span>`;
    const host = window as any;
    const stats = host.__optionalAudioFailure = {
      contexts: 0, bufferSources: 0, sourceStarts: 0, oscillatorStarts: 0, decodes: 0,
      sourceDisconnects: 0, ready: false, targets: [] as number[], toasts: [] as string[],
    };
    const NativeContext = window.AudioContext;
    window.AudioContext = class extends NativeContext {
      constructor() { super(); stats.contexts++; host.__optionalDevice = this; }
      createStereoPanner(): StereoPannerNode { throw new DOMException('Stereo panning unavailable', 'NotSupportedError'); }
      createBufferSource() {
        const source = super.createBufferSource(); stats.bufferSources++;
        const start = source.start.bind(source), disconnect = source.disconnect.bind(source);
        source.start = (when?: number, offset?: number, duration?: number) => { stats.sourceStarts++; start(when, offset, duration); };
        source.disconnect = () => { stats.sourceDisconnects++; disconnect(); };
        return source;
      }
      createGain() {
        const gain = super.createGain(), target = gain.gain.setTargetAtTime.bind(gain.gain);
        gain.gain.setTargetAtTime = (value: number, start: number, constant: number) => {
          stats.targets.push(value); return target(value, start, constant);
        };
        return gain;
      }
      createOscillator() {
        const oscillator = super.createOscillator(), start = oscillator.start.bind(oscillator);
        oscillator.start = (when?: number) => { stats.oscillatorStarts++; start(when); };
        return oscillator;
      }
      decodeAudioData(data: ArrayBuffer) {
        return super.decodeAudioData(data).then(buffer => { stats.decodes++; return buffer; });
      }
    };
    const { createSoundController } = await import('/src/sound-controller.ts');
    const sound = host.__optionalSound = createSoundController({
      getState: () => 'room', getSceneAvailable: () => true, onRecordPlaying() {},
      toast(message: string) { stats.toasts.push(message); },
    });
    document.querySelector('#unlock-audio')!.addEventListener('click', () => {
      void sound.unlock().then(() => { stats.ready = true; });
    });
  });
  await page.locator('#unlock-audio').click();
  await expect.poll(() => page.evaluate(() => (window as any).__optionalAudioFailure.ready)).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as any).__optionalAudioFailure.decodes)).toBe(6);
  const before = await page.evaluate(() => {
    const host = window as any;
    return { ...host.__optionalAudioFailure, state: host.__optionalDevice.state,
      weatherUnavailable: host.__optionalSound.environmentSnapshot() === undefined };
  });
  expect(before.contexts).toBe(1); expect(before.state).toBe('running'); expect(before.weatherUnavailable).toBe(true);
  expect(before.bufferSources).toBe(4); expect(before.sourceStarts).toBe(1); expect(before.oscillatorStarts).toBe(1);
  expect(before.sourceDisconnects).toBe(3); expect(before.targets).toContain(.065);
  expect(before.toasts).not.toContain('此浏览器暂时无法播放环境声');
  const pet = await page.evaluate(() => {
    const host = window as any, clock = host.__optionalSound.onCatPet();
    return { hasClock: typeof clock === 'function', starts: host.__optionalAudioFailure.sourceStarts };
  });
  expect(pet.hasClock).toBe(true); expect(pet.starts).toBe(2);
  await page.evaluate(() => { const sound = (window as any).__optionalSound; sound.dispose(); sound.dispose(); });
  await expect.poll(() => page.evaluate(() => (window as any).__optionalDevice.state)).toBe('closed');
  expect(errors).toEqual([]);
});
