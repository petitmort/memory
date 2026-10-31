import { test, expect } from '@playwright/test';
import { calendarAt, createSeededRandom, DEFAULT_LOCATION, seedFromString, timestampForLocalClock, timestampFromZonedInput } from '../src/calendar-seed';
import { calculateCelestial } from '../src/celestial-controller';

const sceneTime = (value: string) => timestampFromZonedInput(value, 'Europe/Athens');
const hours = (value: number) => calendarAt(value, 'Europe/Athens').secondsOfDay / 3600;

test('scene calendar dates and reproducible seeds do not depend on formatting locale, time of day or a refresh', () => {
  const morning = calendarAt(Date.parse('2024-02-29T00:01:00Z'), 'Europe/Athens');
  const evening = calendarAt(Date.parse('2024-02-29T20:59:59Z'), 'Europe/Athens');
  expect(morning.dayKey).toBe('2024-02-29');
  expect(morning.dayOfYear).toBe(60);
  expect(evening.dayOfYear).toBe(60);
  expect(evening.seed).toBe(morning.seed);
  expect(calendarAt(Date.parse('2024-02-29T23:00:00Z'), 'Europe/Athens').dayKey).toBe('2024-03-01');
  expect(calendarAt(Date.parse('2024-02-29T23:00:00Z'), 'America/New_York').dayKey).toBe('2024-02-29');
  expect(calendarAt(Date.parse('2026-07-01T00:00:00Z')).season).toBe('summer');
  const a = createSeededRandom(morning.seed), b = createSeededRandom(seedFromString('2024-02-29'));
  const samples = Array.from({ length: 200 }, () => a());
  expect(Array.from({ length: 200 }, () => b())).toEqual(samples);
  expect(samples.every(value => value >= 0 && value < 1)).toBe(true);
  expect(new Set(samples).size).toBe(200);
  expect(seedFromString('2024-03-01')).not.toBe(morning.seed);
});

test('local-clock mode preserves the user date and clock while observing scene DST rules', () => {
  for (const instant of ['2026-01-15T16:20:30.123Z', '2026-07-15T16:20:30.123Z']) {
    const actual = Date.parse(instant);
    const mapped = timestampForLocalClock(actual, 'Europe/Athens', 'Asia/Shanghai');
    const scene = calendarAt(mapped, 'Europe/Athens'), user = calendarAt(actual, 'Asia/Shanghai');
    expect(scene.dayKey).toBe(user.dayKey);
    expect(scene.secondsOfDay).toBeCloseTo(user.secondsOfDay, 5);
    expect(timestampForLocalClock(actual, 'Europe/Athens', 'Europe/Athens')).toBe(actual);
  }
  expect(new Date(sceneTime('2026-01-15T12:00')).toISOString()).toBe('2026-01-15T10:00:00.000Z');
  expect(new Date(sceneTime('2026-07-15T12:00')).toISOString()).toBe('2026-07-15T09:00:00.000Z');
  // Compatible disambiguation: skip the missing spring hour, use the first fall hour.
  expect(new Date(sceneTime('2026-03-29T03:30')).toISOString()).toBe('2026-03-29T01:30:00.000Z');
  expect(hours(sceneTime('2026-03-29T03:30'))).toBe(4.5);
  expect(new Date(sceneTime('2026-10-25T03:30')).toISOString()).toBe('2026-10-25T00:30:00.000Z');
  expect(() => sceneTime('2026-02-30T12:00')).toThrow(RangeError);
  expect(() => sceneTime('2026-01-01T25:00')).toThrow(RangeError);
});

test('Santorini solar rise and set follow seasonal astronomy rather than fixed six-to-eighteen hours', () => {
  const summer = calculateCelestial(sceneTime('2026-06-21T13:00'));
  const winter = calculateCelestial(sceneTime('2026-12-21T13:00'));
  const equinox = calculateCelestial(sceneTime('2026-03-20T13:00'));
  expect(summer.dayLengthHours).toBeGreaterThan(14.5);
  expect(summer.dayLengthHours).toBeLessThan(15);
  expect(winter.dayLengthHours).toBeGreaterThan(9.4);
  expect(winter.dayLengthHours).toBeLessThan(9.9);
  expect(equinox.dayLengthHours).toBeGreaterThan(12);
  expect(equinox.dayLengthHours).toBeLessThan(12.3);
  expect(hours(summer.sunrise!)).toBeGreaterThan(5.5);
  expect(hours(summer.sunrise!)).toBeLessThan(6.5);
  expect(hours(summer.sunset!)).toBeGreaterThan(20);
  expect(hours(summer.sunset!)).toBeLessThan(21.2);
  expect(summer.sun.altitude).toBeGreaterThan(winter.sun.altitude);
  const rise = calculateCelestial(summer.sunrise!), set = calculateCelestial(summer.sunset!);
  expect(rise.sun.azimuth).toBeLessThan(Math.PI);
  expect(set.sun.azimuth).toBeGreaterThan(Math.PI);
  // South-facing window, east is world -X and west is +X.
  expect(rise.sun.direction[0]).toBeLessThan(0);
  expect(set.sun.direction[0]).toBeGreaterThan(0);
  expect(summer.sun.direction[2]).toBeLessThan(0);
});

test('known 2024 new, quarter and full moons produce continuous illumination and reasonable orbital positions', () => {
  const newMoon = calculateCelestial(Date.parse('2024-04-08T18:21:00Z'));
  const quarter = calculateCelestial(Date.parse('2024-04-15T19:13:00Z'));
  const full = calculateCelestial(Date.parse('2024-04-23T23:49:00Z'));
  expect(newMoon.moonIllumination).toBeLessThan(.005);
  expect(Math.min(newMoon.moonPhase, 1 - newMoon.moonPhase)).toBeLessThan(.015);
  expect(quarter.moonIllumination).toBeGreaterThan(.46);
  expect(quarter.moonIllumination).toBeLessThan(.54);
  expect(quarter.moonPhase).toBeGreaterThan(.24);
  expect(quarter.moonPhase).toBeLessThan(.26);
  expect(full.moonIllumination).toBeGreaterThan(.995);
  expect(full.moonPhase).toBeGreaterThan(.49);
  expect(full.moonPhase).toBeLessThan(.51);
  expect(full.moonLightDirection[2]).toBeGreaterThan(.99);
  expect(newMoon.moonLightDirection[2]).toBeLessThan(-.99);
  // At a full moon the Moon is on the opposite side of the sky to the Sun.
  expect(full.moon.altitude).toBeGreaterThan(0);
  expect(full.sun.altitude).toBeLessThan(0);
  for (const state of [newMoon, quarter, full]) {
    for (const direction of [state.sun.direction, state.moon.direction, state.moonLightDirection])
      expect(Math.hypot(...direction)).toBeCloseTo(1, 10);
  }
});

test('lunar rise and set change with the date, and arbitrary phase overrides retain smooth terminator lighting', () => {
  const at = sceneTime('2026-11-01T00:00');
  const sampled = Array.from({ length: 96 }, (_, i) => calculateCelestial(at + i * 900000));
  expect(sampled.some(state => state.moon.altitude > .5)).toBe(true);
  expect(sampled.some(state => state.moon.altitude < -.5)).toBe(true);
  const nextWeek = calculateCelestial(at + 7 * 86400000);
  expect(Math.abs(sampled[0].moon.altitude - nextWeek.moon.altitude)).toBeGreaterThan(.15);
  for (let index = 0; index <= 120; index++) {
    const phase = index / 120;
    const state = calculateCelestial(at, DEFAULT_LOCATION, phase);
    expect(state.moonIllumination).toBeCloseTo((1 - Math.cos(phase * Math.PI * 2)) / 2, 10);
    expect(Math.hypot(...state.moonLightDirection)).toBeCloseTo(1, 10);
  }
});

test('twilight and minute boundaries remain continuous and polar dates return explicit null rise/set events', () => {
  const noon = calculateCelestial(sceneTime('2026-06-21T13:00'));
  for (const centre of [noon.sunrise!, noon.sunset!, sceneTime('2026-06-21T00:00')]) {
    const before = calculateCelestial(centre - 500), after = calculateCelestial(centre + 500);
    for (const key of ['daylight', 'twilight', 'night', 'moonIllumination'] as const)
      expect(Math.abs(after[key] - before[key])).toBeLessThan(.001);
    expect(Math.hypot(...after.sun.direction.map((value, i) => value - before.sun.direction[i]))).toBeLessThan(.0001);
  }
  const north = { ...DEFAULT_LOCATION, latitude: 80, longitude: 0, timeZone: 'UTC' };
  const summer = calculateCelestial(Date.parse('2026-06-21T12:00Z'), north);
  const winter = calculateCelestial(Date.parse('2026-12-21T12:00Z'), north);
  expect(summer.sunrise).toBeNull(); expect(summer.sunset).toBeNull(); expect(summer.dayLengthHours).toBe(24);
  expect(winter.sunrise).toBeNull(); expect(winter.sunset).toBeNull(); expect(winter.dayLengthHours).toBe(0);
  expect(() => calculateCelestial(NaN)).toThrow(RangeError);
  expect(() => calculateCelestial(0, { ...DEFAULT_LOCATION, latitude: 95 })).toThrow(RangeError);
});
