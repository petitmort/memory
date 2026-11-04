import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createVesselController } from '../src/vessel-controller';
import { sampleWaterHeight } from '../src/water-surface';
import { createVesselJourney, getVesselSchedule, isSailingVessel, sampleSailTrim, sampleVesselJourney, sailingPolar,
  vesselDepartureInterval, vesselExclusionZones, vesselKinds } from '../src/vessel-navigation';

test('departure wind selects safe sailable lanes and reverse headings agree with actual travel', () => {
  for (const kind of ['wood-sail', 'twin-mast', 'catamaran'] as const) for (let direction = 0; direction < 16; direction++) {
    const wind = { windDirection: direction * Math.PI / 8, windSpeed: 6 };
    const journey = createVesselJourney(19_822_211, { forcedKind: kind, ...wind });
    expect(createVesselJourney(journey.id, { forcedKind: kind, ...wind })).toEqual(journey);
    expect(journey.sailEligible).toBe(true); expect(journey.motorAssisted).toBe(false);
    expect(journey.durationMs).toBeLessThan(16 * vesselDepartureInterval);
    let minimumPolar = Infinity, clearance = Infinity, headingError = 0;
    for (let i = 0; i < 100; i++) {
      const now = journey.startMs + journey.durationMs * i / 100, point = sampleVesselJourney(journey, now);
      const later = sampleVesselJourney(journey, now + 10);
      const cosine = (point.dx * Math.cos(wind.windDirection) + point.dz * Math.sin(wind.windDirection)) / Math.hypot(point.dx, point.dz);
      minimumPolar = Math.min(minimumPolar, sailingPolar(kind, cosine));
      headingError = Math.max(headingError,
        Math.abs(Math.cos(point.yaw) - (later.x - point.x) / Math.hypot(later.x - point.x, later.z - point.z)),
        Math.abs(-Math.sin(point.yaw) - (later.z - point.z) / Math.hypot(later.x - point.x, later.z - point.z)));
      for (const land of vesselExclusionZones)
        clearance = Math.min(clearance, Math.hypot((point.x - land.x) / (land.rx + 7), (point.z - land.z) / (land.rz + 7)));
    }
    expect(minimumPolar, `${kind}, direction ${direction}`).toBeGreaterThan(0);
    expect(clearance).toBeGreaterThan(1); expect(headingError).toBeLessThan(.0005);
  }
  const east = createVesselJourney(10, { forcedKind: 'wood-sail', windSpeed: 5, windDirection: 0 });
  const west = createVesselJourney(10, { forcedKind: 'wood-sail', windSpeed: 5, windDirection: Math.PI });
  const a = sampleVesselJourney(east, east.startMs + east.durationMs / 2), b = sampleVesselJourney(west, west.startMs + west.durationMs / 2);
  expect(a.dx).toBeGreaterThan(0); expect(b.dx).toBeLessThan(0);
});

test('the same departure responds to wind speed, calm sailing waits and forced upwind previews furl their sails', () => {
  for (const kind of vesselKinds) {
    const breeze = createVesselJourney(131, { forcedKind: kind, windSpeed: 2, windDirection: .7 });
    const wind = createVesselJourney(131, { forcedKind: kind, windSpeed: 8, windDirection: .7 });
    if (isSailingVessel(kind)) {
      expect(wind.speed).toBeGreaterThan(breeze.speed * 1.7);
      expect(wind.durationMs).toBeLessThan(breeze.durationMs);
    } else {
      expect(wind.speed).toBeLessThan(breeze.speed);
      expect(wind.speed).toBeGreaterThan(breeze.speed * .9);
    }
  }
  const still = getVesselSchedule(Date.UTC(2026, 6, 10, 12), { windSpeed: 0, windDirection: .7 });
  expect(still.every(journey => !isSailingVessel(journey.kind))).toBe(true);
  const preview = createVesselJourney(130, { forcedKind: 'wood-sail', forcedRoute: 'left-to-right', windSpeed: 7, windDirection: Math.PI });
  expect(preview.motorAssisted).toBe(true); expect(preview.reverse).toBe(false);
  expect(sampleSailTrim(preview.kind, 0, preview.wind!, preview.motorAssisted).reef).toBe(.18);
  const normal = sampleSailTrim('catamaran', 0, { windSpeed: 5, windDirection: 1 });
  const opposite = sampleSailTrim('catamaran', 0, { windSpeed: 5, windDirection: -1 });
  const gale = sampleSailTrim('catamaran', 0, { windSpeed: 20, windDirection: 1 });
  expect(normal.trim).toBeGreaterThan(0); expect(opposite.trim).toBeLessThan(0);
  expect(gale.reef).toBeLessThan(normal.reef * .5);
  expect(sampleSailTrim('catamaran', 0, { windSpeed: .1, windDirection: 1 }).fullness).toBeLessThan(normal.fullness);
});

test('absolute wind voyages recover after sleep and remain safely separated across weather and slot boundaries', () => {
  const start = Date.UTC(2026, 6, 10), departureWind = (timestamp: number) => ({
    windSpeed: 2 + (Math.floor(timestamp / 7200000) % 3) * 3,
    windDirection: .4 + Math.sin(timestamp / 3600000) * .7,
  });
  let closest = Infinity, slowVoyages = 0;
  for (let minute = 0; minute < 360; minute += 2) {
    const now = start + minute * 60000, schedule = getVesselSchedule(now, { departureWind });
    getVesselSchedule(now + 3600000, { departureWind });
    expect(getVesselSchedule(now, { departureWind })).toEqual(schedule);
    for (const journey of schedule) {
      expect(journey.wind).toEqual(departureWind(journey.startMs));
      if (journey.durationMs > 7 * vesselDepartureInterval) slowVoyages++;
      const before = sampleVesselJourney(journey, now - 1), after = sampleVesselJourney(journey, now + 1);
      expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(.01);
    }
    for (let a = 0; a < schedule.length; a++) for (let b = a + 1; b < schedule.length; b++) {
      const p = sampleVesselJourney(schedule[a], now), q = sampleVesselJourney(schedule[b], now);
      closest = Math.min(closest, Math.hypot(p.x - q.x, p.z - q.z));
    }
  }
  expect(slowVoyages).toBeGreaterThan(0); expect(closest).toBeGreaterThan(14.9);
});

function unitController() {
  const original = globalThis.document;
  const context = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, {
    get: (target, key) => Reflect.get(target, key) ?? (() => {}),
  });
  Object.assign(globalThis, { document: { createElement: () => ({ getContext: () => context, data: new Uint8Array(4) }) } });
  try { return createVesselController(); }
  finally { Object.assign(globalThis, { document: original }); }
}

test('wind only trims an active voyage while the shared wave field supports every hull and resources stay pooled', () => {
  const controller = unitController(), fresh = unitController();
  const now = Date.UTC(2026, 6, 10, 12, 3, 16);
  const departureState = () => ({ daylight: 1, severity: 0, windSpeed: 5, windDirection: .7 });
  const options = { low: false, reduced: false, daylight: 1, severity: 0, windSpeed: 5, windDirection: .7, density: 3, departureState,
    forcedRoute: 'left-to-right' as const, forcedKind: 'wood-sail' as const };
  controller.update(now, 17, options);
  const initial = controller.snapshot(); expect(initial.length).toBeGreaterThan(0);
  const roots = [...controller.group.children];
  controller.update(now + 16, 17.016, { ...options, windSpeed: 19, windDirection: -.7 });
  for (const boat of controller.snapshot()) {
    const original = initial.find(candidate => candidate.id === boat.id)!;
    expect(boat.journey).toEqual(original.journey);
    const expected = sampleVesselJourney(boat.journey, now + 16);
    expect(boat.position[0]).toBe(expected.x); expect(boat.position[2]).toBe(expected.z);
    expect(boat.position[1]).toBeCloseTo(-8 + sampleWaterHeight(expected.x, expected.z, 17.016, { windSpeed: 19, windDirection: -.7 }) - .09, 10);
    expect(boat.sail.reef).toBeLessThan(original.sail.reef);
  }
  for (let i = 2; i <= 500; i++) controller.update(now + i * 16, 17 + i * .016, { ...options, windSpeed: 19, windDirection: -.7 });
  const sailed = controller.snapshot();
  for (const boat of sailed) expect(Math.abs(boat.sail.brace - initial.find(candidate => candidate.id === boat.id)!.sail.brace)).toBeGreaterThan(.2);
  // The same calendar instant reconstructs the same frozen departure voyage.
  const resume = now + 10 * 60000;
  controller.update(resume, 40, options); fresh.update(resume, 40, options);
  expect(controller.snapshot()).toEqual(fresh.snapshot());
  expect(controller.group.children.every((object, index) => object === roots[index])).toBe(true);
  let sails = 0;
  controller.group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || Array.isArray(object.material) || !object.material.userData.windSail) return;
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as any;
    object.material.onBeforeCompile(shader, null as any);
    expect(shader.vertexShader).toContain('uniform vec4 vesselSail');
    expect(shader.uniforms.vesselSail.value).toBeInstanceOf(THREE.Vector4);
    if (object.material.userData.windSail === 'lateen') expect(object.geometry.getAttribute('sailFrame').count).toBe(object.geometry.getAttribute('position').count);
    sails++;
  });
  expect(sails).toBe(15);
  controller.update(resume + 10000, 50, { ...options, density: 0 });
  expect(controller.snapshot()).toHaveLength(0);
  controller.dispose(); controller.dispose(); fresh.dispose();
});
