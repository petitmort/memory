import { test, expect } from '@playwright/test';
import { timestampFromZonedInput } from '../src/calendar-seed';
import { sampleWeather, sampleWeatherFront, transitionWeather, WEATHER_KINDS } from '../src/weather-controller';

const fields = ['cloudCover', 'precipitation', 'snow', 'windSpeed', 'visibility', 'waveScale'] as const;

test('rain fronts gather clouds and wind before rainfall, then clear rain before the sky', () => {
  const clear = sampleWeather(0, { kind: 'clear' }), rain = sampleWeather(0, { kind: 'heavy-rain' });
  const gathering = transitionWeather(clear, rain, .3);
  expect(gathering.precipitation).toBe(0);
  expect(gathering.cloudCover).toBeGreaterThan(.5);
  expect(gathering.windSpeed).toBeGreaterThan(clear.windSpeed);
  expect(gathering.kind).not.toBe('heavy-rain');
  const arrival = transitionWeather(clear, rain, .65);
  expect(arrival.precipitation).toBeGreaterThan(.3);
  expect(arrival.precipitation).toBeLessThan(.5);
  expect(arrival.cloudCover).toBe(1);
  const clearing = transitionWeather(rain, clear, .65);
  expect(clearing.precipitation).toBe(0);
  expect(clearing.cloudCover).toBeGreaterThan(.5);
  expect(transitionWeather(clear, rain, 0)).toEqual(clear);
  expect(transitionWeather(clear, rain, 1)).toEqual(rain);
  expect(transitionWeather(rain, clear, 0)).toEqual(rain);
  expect(transitionWeather(rain, clear, 1)).toEqual(clear);
});

test('rain and snow fade continuously by precipitation mass instead of changing type abruptly', () => {
  const rain = sampleWeather(0, { kind: 'rain' }), snow = sampleWeather(0, { kind: 'snow' });
  let previous = transitionWeather(rain, snow, 0);
  for (let step = 1; step <= 1000; step++) {
    const next = transitionWeather(rain, snow, step / 1000);
    for (const key of fields) expect(Math.abs(next[key] - previous[key])).toBeLessThan(.01);
    expect(next.precipitation).toBeGreaterThanOrEqual(Math.min(rain.precipitation, snow.precipitation));
    expect(next.precipitation).toBeLessThanOrEqual(Math.max(rain.precipitation, snow.precipitation));
    previous = next;
  }
  expect(previous).toEqual(snow);
  const clear = sampleWeather(0, { kind: 'clear' });
  for (const [from, to] of [[snow, clear], [clear, snow]]) {
    for (const progress of [.38, .6, .999999]) {
      const a = transitionWeather(from, to, progress - .000001), b = transitionWeather(from, to, progress + .000001);
      for (const key of fields) expect(Math.abs(a[key] - b[key])).toBeLessThan(.0001);
    }
  }
});

test('seeded fronts evolve within a day, have multi-minute causal transitions and never reset at their boundaries', () => {
  let cursor = Date.parse('2026-01-01T00:00Z');
  const kinds = new Set<string>();
  let wetting = false, drying = false, changes = 0;
  for (let index = 0; index < 240; index++) {
    const front = sampleWeatherFront(cursor);
    expect(front.nextAt - front.startedAt).toBeGreaterThanOrEqual(32 * 60000);
    expect(front.nextAt - front.startedAt).toBeLessThanOrEqual(88 * 60000);
    expect(front.settledAt - front.startedAt).toBeGreaterThanOrEqual(6 * 60000);
    expect(front.settledAt - front.startedAt).toBeLessThanOrEqual(10 * 60000);
    const a = sampleWeather(front.startedAt - 1), b = sampleWeather(front.startedAt + 1);
    for (const key of fields) expect(Math.abs(a[key] - b[key]), `${front.startedAt}:${key}`).toBeLessThan(.001);
    const quarter = front.startedAt + (front.settledAt - front.startedAt) * .25;
    const stage = sampleWeatherFront(quarter);
    wetting ||= stage.phase === 'gathering';
    drying ||= stage.phase === 'rain-clearing';
    kinds.add(front.toKind);
    changes += Number(front.fromKind !== front.toKind);
    cursor = front.nextAt + 1;
  }
  expect(kinds.size).toBeGreaterThanOrEqual(5);
  expect(changes).toBeGreaterThan(30);
  expect(wetting).toBe(true); expect(drying).toBe(true);
  let dayWithChanges = false;
  for (let day = 1; day <= 14; day++) {
    const daily = new Set(Array.from({ length: 96 }, (_, index) => sampleWeather(Date.UTC(2026, 0, day, 0, index * 15)).kind));
    dayWithChanges ||= daily.size >= 3;
  }
  expect(dayWithChanges).toBe(true);
});

test('calendar edges, DST, backward seeks and evicted targets recover the same absolute weather', () => {
  for (const timeZone of ['Europe/Athens', 'Asia/Shanghai', 'America/New_York']) {
    for (const date of ['2024-02-29T00:00', '2026-01-01T00:00', '2026-03-29T03:00', '2026-10-25T03:00']) {
      const timestamp = timestampFromZonedInput(date, timeZone);
      const before = sampleWeather(timestamp - 1, { timeZone }), after = sampleWeather(timestamp + 1, { timeZone });
      for (const key of fields) expect(Math.abs(before[key] - after[key])).toBeLessThan(.001);
      const exact = sampleWeather(timestamp, { timeZone });
      for (let index = 0; index < 110; index++) sampleWeather(timestamp + index * 3600000, { timeZone });
      expect(sampleWeather(timestamp, { timeZone })).toEqual(exact);
      expect(sampleWeather(timestamp + 1, { timeZone })).toEqual(after);
    }
  }
});

test('summer can have dry coastal wind while forcing weather remains stable and never reads real weather', () => {
  let dryWind = false;
  for (let day = 1; day <= 28; day++) for (let hour = 0; hour < 24; hour++) {
    const at = Date.UTC(2026, 6, day, hour), state = sampleWeather(at);
    expect(state.snow).toBe(0); expect(state.simulated).toBe(true);
    dryWind ||= state.precipitation === 0 && state.windSpeed > 7;
    if (state.windSpeed > 7 && state.precipitation === 0) expect(state.waveScale).toBeGreaterThan(1.1);
  }
  expect(dryWind).toBe(true);
  const timestamp = Date.parse('2026-07-21T12:00Z');
  for (const kind of ['clear', 'heavy-rain', 'snow'] as const) {
    const before = sampleWeather(timestamp, { kind }), later = sampleWeather(timestamp + 4 * 3600000, { kind });
    expect(later.kind).toBe(kind);
    expect(later.precipitation).toBe(before.precipitation);
    expect(sampleWeatherFront(timestamp, { kind }).phase).toBe('settled');
  }
  expect(sampleWeather(timestamp, { windSpeed: 0 }).windSpeed).toBe(0);
  expect(() => sampleWeatherFront(NaN)).toThrow(RangeError);
});

test('explicit wind overrides strengthen shared ocean swell within existing displacement bounds', () => {
  const timestamp = Date.parse('2026-07-21T12:00Z');
  const automatic = sampleWeather(timestamp);
  expect(sampleWeather(timestamp, { windSpeed: undefined })).toEqual(automatic);
  expect(sampleWeather(timestamp, { windSpeed: NaN })).toEqual(automatic);
  expect(sampleWeather(timestamp, { windSpeed: Infinity })).toEqual(automatic);
  const clear = sampleWeather(timestamp, { kind: 'clear' });
  const calm = sampleWeather(timestamp, { kind: 'clear', windSpeed: 0 });
  const windy = sampleWeather(timestamp, { kind: 'clear', windSpeed: 8 });
  const gale = sampleWeather(timestamp, { kind: 'clear', windSpeed: 20 });
  expect(calm.windSpeed).toBe(0); expect(calm.waveScale).toBe(clear.waveScale);
  expect(windy.waveScale).toBeGreaterThan(calm.waveScale);
  expect(gale.waveScale).toBeGreaterThan(windy.waveScale);
  expect(gale.waveScale).toBe(1.6); expect(gale.precipitation).toBe(0);
  for (const kind of WEATHER_KINDS) {
    const baseline = sampleWeather(timestamp, { kind });
    for (const windSpeed of [-5, 0, 4, 8, 12, 20, 100]) {
      const state = sampleWeather(timestamp, { kind, windSpeed });
      expect(state.precipitation).toBe(baseline.precipitation);
      expect(state.snow).toBe(baseline.snow);
      expect(state.waveScale).toBeGreaterThanOrEqual(baseline.waveScale);
      expect(state.waveScale).toBeLessThanOrEqual(1.6);
      expect(state.windSpeed).toBeGreaterThanOrEqual(0);
      expect(state.windSpeed).toBeLessThanOrEqual(20);
    }
  }
});
