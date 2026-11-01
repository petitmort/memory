import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { createLighthouseBeacon, sampleLighthouseBeacon } from '../src/lighthouse-beacon';
import { PIER_SEA_LEVEL, PIER_TOWER_SITE, samplePierPath } from '../src/pier-layout';

const origin = { x: PIER_TOWER_SITE.x, y: PIER_TOWER_SITE.y + 6.67, z: PIER_TOWER_SITE.z };
const clear = { visibility: 1, precipitation: 0 };
const radians = Math.PI / 180;

test('the lantern begins gently at eight solar degrees and reaches full dusk illumination below the horizon', () => {
  const values = [12, 8, 7.99, 5, 2, 0, -3, -12].map(altitude =>
    sampleLighthouseBeacon(123456, altitude * radians, clear, origin));
  expect(values[0].lanternIntensity).toBe(0); expect(values[1].lanternIntensity).toBe(0);
  expect(values[2].lanternIntensity).toBeLessThan(.00001);
  expect(values.at(-1)!.lanternIntensity).toBeCloseTo(1.2, 12);
  for (let index = 1; index < values.length; index++) {
    expect(values[index].lanternIntensity).toBeGreaterThanOrEqual(values[index - 1].lanternIntensity);
    expect(values[index].twilight).toBeGreaterThanOrEqual(0);
    expect(values[index].twilight).toBeLessThanOrEqual(1);
  }
});

test('beacon rotation follows a stable 28-second calendar phase rather than render frames', () => {
  const time = Date.UTC(2026, 10, 1, 18, 0, 0, 375);
  const state = sampleLighthouseBeacon(time, -8 * radians, clear, origin);
  const sameCycle = sampleLighthouseBeacon(time + 28000 * 12345, -8 * radians, clear, origin);
  const quarter = sampleLighthouseBeacon(time + 7000, -8 * radians, clear, origin);
  expect(sameCycle.direction).toEqual(state.direction);
  expect(state.direction.x * quarter.direction.x + state.direction.z * quarter.direction.z).toBeCloseTo(0, 10);
  const before = sampleLighthouseBeacon(27999.999, -8 * radians, clear, origin);
  const after = sampleLighthouseBeacon(28000.001, -8 * radians, clear, origin);
  expect(Math.hypot(before.direction.x - after.direction.x, before.direction.z - after.direction.z)).toBeLessThan(.000001);
  expect(sampleLighthouseBeacon(-1, -8 * radians, clear, origin).direction)
    .toEqual(sampleLighthouseBeacon(27999, -8 * radians, clear, origin).direction);
});

test('the beam remains continuous through the full turn, attenuates toward shore and meets the sea along its true direction', () => {
  const path = samplePierPath(1);
  let visible = 0, hidden = 0, previous: ReturnType<typeof sampleLighthouseBeacon> | undefined;
  for (let timestamp = 0; timestamp <= 28000; timestamp += 50) {
    const state = sampleLighthouseBeacon(timestamp, -8 * radians, clear, origin);
    const direction = state.direction.x * path.tangentX + state.direction.z * path.tangentZ;
    if (direction <= -.16) { expect(state.beamStrength).toBeCloseTo(.24, 10); hidden++; }
    if (direction >= .24) { expect(state.beamStrength).toBeCloseTo(.6, 10); visible++; }
    expect(state.beamStrength).toBeGreaterThan(0); expect(state.beamStrength).toBeLessThanOrEqual(.6);
    if (previous) expect(Math.abs(state.beamStrength - previous.beamStrength)).toBeLessThan(.025);
    expect(state.seaIntersection.y).toBe(PIER_SEA_LEVEL);
    const dx = state.seaIntersection.x - origin.x, dz = state.seaIntersection.z - origin.z;
    expect(dx * state.direction.z - dz * state.direction.x).toBeCloseTo(0, 10);
    expect(Math.hypot(dx, dz)).toBeGreaterThan(100);
    expect(Math.hypot(dx, dz)).toBeLessThan(145);
    previous = state;
  }
  expect(visible).toBeGreaterThan(150); expect(hidden).toBeGreaterThan(150);
});

test('reduced motion keeps a faint stable seaward beam while haze raises scattering without raising lantern power', () => {
  const a = sampleLighthouseBeacon(0, -8 * radians, clear, origin, true);
  const b = sampleLighthouseBeacon(91712, -8 * radians, clear, origin, true);
  expect(a.direction).toEqual(b.direction); expect(a.beamStrength).toBe(b.beamStrength);
  const path = samplePierPath(1);
  expect(a.direction.x * path.tangentX + a.direction.z * path.tangentZ).toBeCloseTo(1, 10);
  const hazy = sampleLighthouseBeacon(0, -8 * radians, { visibility: .25, precipitation: .8 }, origin, true);
  expect(hazy.beamStrength).toBeGreaterThan(a.beamStrength);
  expect(hazy.lanternIntensity).toBe(a.lanternIntensity);
  expect(sampleLighthouseBeacon(0, -8 * radians, clear, origin, true, true).beamStrength).toBeLessThan(a.beamStrength);
});

test('one pooled texture-free unlit beam aligns with its sampled world direction and disposes resources once', () => {
  const beacon = createLighthouseBeacon(origin);
  const mesh = beacon.group.getObjectByName('lighthouse-narrow-air-beam') as THREE.Mesh;
  const geometry = mesh.geometry, material = mesh.material as THREE.ShaderMaterial;
  expect(beacon.group.children).toHaveLength(1);
  expect(material.uniforms.strength.value).toBe(0);
  expect(material.depthWrite).toBe(false);
  expect(material.blending).toBe(THREE.AdditiveBlending);
  expect(material.uniforms.seaLevel.value).toBe(PIER_SEA_LEVEL);
  const lights: THREE.Light[] = [], textures: THREE.Texture[] = [];
  beacon.group.traverse(object => { if (object instanceof THREE.Light) lights.push(object); });
  for (const value of Object.values(material.uniforms)) if (value.value instanceof THREE.Texture) textures.push(value.value);
  expect(lights).toEqual([]); expect(textures).toEqual([]);
  for (const timestamp of [0, 5000, 17900, 31200000]) {
    const state = beacon.update(timestamp, -8 * radians, clear)!;
    beacon.group.updateMatrixWorld(true);
    const end = new THREE.Vector3(0, -145 * .068, -145).applyMatrix4(beacon.group.matrixWorld).sub(new THREE.Vector3(origin.x, origin.y, origin.z));
    expect(end.x / 145).toBeCloseTo(state.direction.x, 10);
    expect(end.y / 145).toBeCloseTo(state.direction.y, 10);
    expect(end.z / 145).toBeCloseTo(state.direction.z, 10);
    expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material);
  }
  beacon.update(9000, -8 * radians, clear, true, true);
  expect(mesh.geometry).toBe(geometry); expect(mesh.material).toBe(material);
  expect(Array.from(geometry.getAttribute('position').array).every(Number.isFinite)).toBe(true);
  expect(geometry.index!.count / 3).toBe(384);
  let geometryDisposals = 0, materialDisposals = 0;
  geometry.addEventListener('dispose', () => geometryDisposals++);
  material.addEventListener('dispose', () => materialDisposals++);
  beacon.dispose(); beacon.dispose(); beacon.update(10, 0, clear);
  expect(geometryDisposals).toBe(1); expect(materialDisposals).toBe(1);
  expect(beacon.group.children).toHaveLength(0);
});
