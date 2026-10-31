import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { BIRD_DEPARTURE_INTERVAL, BIRD_KINDS, createBirdController, createBirdJourney, getBirdSchedule, sampleBirdFlight } from '../src/bird-controller';
import { sampleWeather } from '../src/weather-controller';

function example(kind: typeof BIRD_KINDS[number], minCount = 1) {
  for (let id = 8_000_000; id < 8_001_000; id++) {
    const journey = createBirdJourney(id);
    if (journey.kind === kind && journey.admission < .76 && journey.count >= minCount) return journey;
  }
  throw new Error(`No deterministic ${kind} example`);
}

test('all coastal bird species follow deterministic outdoor trajectories, tangent headings and quiet absolute schedules', () => {
  for (const kind of BIRD_KINDS) {
    const journey = example(kind);
    expect(createBirdJourney(journey.id)).toEqual(journey);
    const before = sampleBirdFlight(journey, journey.startMs - 1), start = sampleBirdFlight(journey, journey.startMs);
    const end = sampleBirdFlight(journey, journey.startMs + journey.durationMs);
    expect(before.alpha).toBe(0); expect(start.alpha).toBe(0); expect(end.alpha).toBe(0);
    expect(Math.abs(start.x)).toBeGreaterThan(80);
    for (let i = 1; i < 100; i++) {
      const now = journey.startMs + i / 100 * journey.durationMs;
      const point = sampleBirdFlight(journey, now), later = sampleBirdFlight(journey, now + 1);
      expect(sampleBirdFlight(journey, now)).toEqual(point);
      expect(point.z).toBeLessThan(-30); expect(point.y).toBeGreaterThan(1);
      const length = Math.hypot(point.dx, point.dz);
      expect(Math.cos(point.yaw)).toBeCloseTo(point.dx / length, 8);
      expect(-Math.sin(point.yaw)).toBeCloseTo(point.dz / length, 8);
      const numericYaw = Math.atan2(-(later.z - point.z), later.x - point.x);
      expect(Math.abs(Math.atan2(Math.sin(point.yaw - numericYaw), Math.cos(point.yaw - numericYaw)))).toBeLessThan(.002);
      expect(Math.hypot(later.x - point.x, later.y - point.y, later.z - point.z)).toBeLessThan(.02);
      expect(Math.abs(point.bank)).toBeLessThanOrEqual(.24);
    }
    if (kind !== 'small-bird') { expect(end.y - start.y).toBeGreaterThan(13); expect(start.z - end.z).toBeGreaterThan(140); }
    const midpoint = journey.startMs + journey.durationMs / 2;
    expect(getBirdSchedule(midpoint).some(value => value.id === journey.id)).toBe(true);
    expect(getBirdSchedule(midpoint)).toEqual(getBirdSchedule(midpoint));
    expect(getBirdSchedule(journey.startMs + journey.durationMs + 10_000)).not.toContainEqual(journey);
  }
  let active = 0, empty = 0;
  const base = 8_000_000 * BIRD_DEPARTURE_INTERVAL;
  for (let elapsed = 0; elapsed < 86_400_000; elapsed += 10_000) {
    const schedule = getBirdSchedule(base + elapsed);
    if (schedule.length) active++; else empty++;
    expect(schedule.length).toBeLessThanOrEqual(1);
  }
  expect(active).toBeGreaterThan(300); expect(empty).toBeGreaterThan(active);
  expect(getBirdSchedule(NaN)).toEqual([]);
});

test('bird flaps include true glides and reduced motion changes wing amplitude without resetting a flight', () => {
  for (const kind of ['gull', 'eagle'] as const) {
    const journey = example(kind);
    let glide = 0, flaps = 0;
    for (let i = 0; i < 500; i++) {
      const now = journey.startMs + 1000 + i * 100;
      const normal = sampleBirdFlight(journey, now), reduced = sampleBirdFlight(journey, now, 0, true);
      expect([reduced.x, reduced.y, reduced.z, reduced.yaw]).toEqual([normal.x, normal.y, normal.z, normal.yaw]);
      expect(Math.abs(reduced.flap - .055)).toBeCloseTo(Math.abs(normal.flap - .055) * .18, 8);
      if (Math.abs(normal.flap - .055) < 1e-6) glide++; else if (Math.abs(normal.flap - .055) > .1) flaps++;
    }
    expect(glide).toBeGreaterThan(100); expect(flaps).toBeGreaterThan(10);
  }
});

test('pooled birds fade with storms and quality, restore absolute positions and dispose shared resources once', () => {
  const journey = example('gull', 4), now = journey.startMs + journey.durationMs * .5;
  const clear = sampleWeather(now, { kind: 'clear' }), rain = sampleWeather(now, { kind: 'heavy-rain' });
  const controller = createBirdController(), fresh = createBirdController();
  const mesh = controller.group.children[0] as THREE.InstancedMesh;
  const geometry = mesh.geometry, material = mesh.material as THREE.Material;
  const matrices = mesh.instanceMatrix.array, poses = geometry.getAttribute('birdPose').array;
  let geometryDisposals = 0, materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++); material.addEventListener('dispose', () => materialDisposals++);
  controller.update(now, clear, false, false, 1); fresh.update(now, clear, false, false, 1);
  expect(controller.snapshot()).toHaveLength(4); expect(controller.snapshot()).toEqual(fresh.snapshot());
  expect(mesh.count).toBe(4); expect(controller.group.userData.visibleBirds).toBe(4);
  expect(controller.warmObjects).toContain(mesh);
  const before = controller.snapshot();
  controller.update(now + 16, rain, false, false, 1);
  const fading = controller.snapshot();
  expect(fading).toHaveLength(4);
  expect(fading[0].opacity).toBeGreaterThan(.8); expect(fading[0].opacity).toBeLessThan(before[0].opacity);
  for (let i = 2; i <= 300; i++) controller.update(now + i * 16, rain, false, false, 1);
  expect(controller.snapshot()).toHaveLength(0);
  fresh.update(now + 10000, rain, false, false, 1); expect(fresh.snapshot()).toHaveLength(0);
  fresh.update(now + 20000, clear, true, false, 1); expect(fresh.snapshot()).toHaveLength(2);
  fresh.update(now + 30000, clear, false, false, 0); expect(fresh.snapshot()).toHaveLength(0);
  controller.update(now + 300000, clear, false, false, 1);
  const recovered = createBirdController(); recovered.update(now + 300000, clear, false, false, 1);
  expect(controller.snapshot()).toEqual(recovered.snapshot());
  expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material);
  expect(mesh.instanceMatrix.array).toBe(matrices); expect(geometry.getAttribute('birdPose').array).toBe(poses);
  expect(geometry.getAttribute('position').count).toBeLessThan(100);
  controller.dispose(); controller.dispose();
  expect(controller.group.children).toHaveLength(0); expect(controller.snapshot()).toHaveLength(0);
  expect(geometryDisposals).toBe(1); expect(materialDisposals).toBe(1);
  fresh.dispose(); recovered.dispose();
});

test('jittered departures become visible after an earlier frame in the same cached slot', () => {
  const journey = example('gull'), controller = createBirdController();
  const weather = sampleWeather(journey.startMs, { kind: 'clear' });
  const first = journey.id * BIRD_DEPARTURE_INTERVAL;
  controller.update(first, weather, false, false, 1);
  expect(controller.snapshot()).toHaveLength(0);
  controller.update(journey.startMs + 10_000, weather, false, false, 1);
  expect(controller.snapshot().some(bird => bird.id === journey.id)).toBe(true);
  controller.dispose();
});
