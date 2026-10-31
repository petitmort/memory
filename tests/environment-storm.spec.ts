import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { sampleWeather, WEATHER_KINDS } from '../src/weather-controller';
import { createStormController, sampleStorm, stormStrength, stormEventForSlot, STORM_SLOT_MS, STORM_FLASH_MS, SPEED_OF_SOUND } from '../src/storm-controller';

const wet = sampleWeather(Date.UTC(2026, 9, 31, 12), { kind: 'heavy-rain' });

test('only convective heavy rain can produce lightning; clear wind, ordinary rain and snow stay quiet', () => {
  for (const kind of WEATHER_KINDS) {
    const weather = sampleWeather(0, { kind });
    const event = stormEventForSlot(100), frame = sampleStorm(event.strikeTime + 60, weather);
    if (kind === 'heavy-rain') { expect(frame.flash).toBeGreaterThan(0); expect(frame.energy).toBeGreaterThan(0); }
    else { expect(frame.flash).toBe(0); expect(frame.eventId).toBeNull(); }
  }
  expect(stormStrength(sampleWeather(0, { kind: 'clear', windSpeed: 20 }))).toBe(0);
  expect(stormStrength({ ...wet, snow: 1 })).toBe(0);
  expect(stormStrength({ ...wet, cloudCover: .7 })).toBe(0);
  expect(stormStrength({ ...wet, windSpeed: 0 })).toBe(0);
});

test('storm schedules are deterministic, irregular, offshore and use actual source distance for thunder delay', () => {
  const gaps = new Set<number>(); let hidden = 0, channels = 0;
  for (let slot = -500; slot < 500; slot++) {
    const event = stormEventForSlot(slot), next = stormEventForSlot(slot + 1);
    expect(event).toEqual(stormEventForSlot(slot));
    const gap = next.strikeTime - event.strikeTime;
    gaps.add(Math.round(gap)); expect(gap).toBeGreaterThan(64000); expect(gap).toBeLessThan(156000);
    expect(event.z).toBeLessThanOrEqual(-300); expect(event.z).toBeGreaterThan(-410);
    expect(Math.abs(event.x)).toBeLessThan(90);
    expect(event.distance).toBeCloseTo(Math.hypot(event.x, event.height / 2 - 1.65, event.z), 10);
    expect(event.thunderTime - event.strikeTime).toBeCloseTo(event.distance / SPEED_OF_SOUND * 1000, 6);
    expect(Math.hypot(event.x, event.height, event.z)).toBeLessThan(500);
    expect(event.thunderTime).toBeGreaterThan(event.strikeTime + STORM_FLASH_MS);
    if (event.bolt) channels++; else hidden++;
  }
  expect(gaps.size).toBeGreaterThan(900); expect(hidden).toBeGreaterThan(100); expect(channels).toBeGreaterThan(500);
});

test('one smooth light pulse returns to zero before delayed thunder and reduced motion suppresses every visible flash', () => {
  const event = stormEventForSlot(15673); let previous = 0, peaks = 0, slope = 1;
  for (let age = 0; age <= STORM_FLASH_MS + 100; age++) {
    const frame = sampleStorm(event.strikeTime + age, wet);
    expect(frame.flash).toBeGreaterThanOrEqual(0); expect(frame.flash).toBeLessThanOrEqual(1);
    expect(Math.abs(frame.flash - previous)).toBeLessThan(.04);
    if (frame.flash > 0 && frame.flash < previous && slope > 0) { peaks++; slope = -1; }
    if (frame.flash > previous) slope = 1;
    previous = frame.flash;
    const reduced = sampleStorm(event.strikeTime + age, wet, true);
    expect(reduced.flash).toBe(0); expect(reduced.bolt).toBe(false);
    expect(reduced.eventId).toBe(frame.eventId); expect(reduced.thunderTime).toBe(frame.thunderTime);
  }
  expect(peaks).toBe(1);
  const atThunder = sampleStorm(event.thunderTime, wet);
  expect(atThunder.flash).toBe(0); expect(atThunder.eventId).toBe(event.eventId);
});

test('calendar boundaries and out-of-order pause/refresh queries retain the same event and continuous pulse', () => {
  for (const timestamp of [Date.UTC(2026, 10, 1), Date.UTC(2027, 0, 1), Date.UTC(2024, 1, 29), 0, -STORM_SLOT_MS * 5]) {
    const before = sampleStorm(timestamp - 1, wet), after = sampleStorm(timestamp + 1, wet);
    expect(Math.abs(before.flash - after.flash)).toBeLessThan(.04);
    sampleStorm(timestamp + 17 * STORM_SLOT_MS, wet);
    expect(sampleStorm(timestamp - 1, wet)).toEqual(before);
  }
  const event = stormEventForSlot(14237);
  const a = sampleStorm(event.strikeTime + 99, wet);
  sampleStorm(event.strikeTime + 2 * 3600000, wet);
  expect(sampleStorm(event.strikeTime + 99, wet)).toEqual(a);
  expect(sampleStorm(event.thunderTime - 1, wet).eventId).toBe(event.eventId);
  expect(sampleStorm(event.thunderTime + 1, wet).eventId).toBe(event.eventId);
});

test('convective eligibility fades continuously with weather rather than switching at a kind label', () => {
  const time = stormEventForSlot(87).strikeTime + 60;
  const previous = { ...wet, precipitation: .62 - .00001 }, next = { ...wet, precipitation: .62 + .00001 };
  expect(stormStrength(previous)).toBe(0);
  expect(stormStrength(next)).toBeGreaterThan(0);
  expect(sampleStorm(time, next).flash).toBeLessThan(.000001);
  const one = sampleStorm(time, { ...wet, kind: 'rain' }), two = sampleStorm(time, wet);
  expect(one).toEqual(two);
  for (const key of ['precipitation', 'cloudCover', 'windSpeed'] as const) {
    const a = sampleStorm(time, { ...wet, [key]: wet[key] - .00001 });
    const b = sampleStorm(time, { ...wet, [key]: wet[key] + .00001 });
    expect(Math.abs(a.flash - b.flash)).toBeLessThan(.0001);
  }
  expect(() => sampleStorm(NaN, wet)).toThrow(RangeError);
  expect(() => sampleStorm(Infinity, wet)).toThrow(RangeError);
  expect(() => stormEventForSlot(.5)).toThrow(RangeError);
});

test('storm renderer shares prewarmed resources, stays outdoors, reduces branches and disposes idempotently', () => {
  const controller = createStormController(), parent = new THREE.Group(); parent.add(controller.group);
  expect(controller.group.children).toHaveLength(2);
  expect(controller.warmObjects).toHaveLength(3);
  const bolt = controller.group.children[0] as THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  const glow = controller.group.children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  const attribute = bolt.geometry.getAttribute('position'), buffer = attribute.array;
  const geometry = bolt.geometry, material = bolt.material;
  let disposal = 0;
  for (const object of [geometry, material, glow.geometry, glow.material]) object.addEventListener('dispose', () => disposal++);
  let firstSlot = 0; while (!stormEventForSlot(firstSlot).bolt) firstSlot++;
  const event = stormEventForSlot(firstSlot);
  const first = controller.update(event.strikeTime + 75, wet, false, false, .4);
  expect(first.flash).toBeGreaterThan(0); expect(bolt.visible).toBe(true); expect(glow.visible).toBe(true);
  expect(bolt.geometry.drawRange.count).toBe(72);
  for (let i = 0; i < attribute.count; i++) {
    expect(attribute.getZ(i)).toBeLessThan(-295); expect(attribute.getY(i)).toBeGreaterThan(-20);
  }
  controller.update(event.strikeTime + 80, wet, true, false, .4);
  expect(bolt.geometry.drawRange.count).toBe(36);
  expect(bolt.geometry).toBe(geometry); expect(bolt.material).toBe(material); expect(attribute.array).toBe(buffer);
  controller.update(event.strikeTime + 90, wet, false, true, .4);
  expect(bolt.visible).toBe(false); expect(glow.visible).toBe(false);
  controller.dispose(); controller.dispose(); expect(disposal).toBe(4);
  expect(parent.children).toHaveLength(0); expect(controller.group.children).toHaveLength(0);
  expect(controller.update(event.strikeTime + 75, wet, false, false, .4).flash).toBe(0);
});
