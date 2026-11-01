import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { PIER_FOOT_WIDTH, PIER_SEA_LEVEL, distanceToPier, samplePierPath, type PierSide } from '../src/pier-layout';
import { createPierSurf, samplePierDroplet, samplePierImpact, samplePierImpactShape, type PierImpact, type PierSurfWeather } from '../src/pier-surf';
import { sampleWaterHeight } from '../src/water-surface';

const path = samplePierPath(.5);
const windwardDirection = Math.atan2(-path.normalZ, -path.normalX);
const storm: PierSurfWeather = { windSpeed: 18, windDirection: windwardDirection, waveScale: 1.5 };
const contactAmounts = Array.from({ length: 12 }, (_, i) => .1 + .76 * i / 11);

function impacts(weather: PierSurfWeather) {
  const unique = new Map<string, PierImpact>();
  for (const side of [1, -1] as PierSide[]) for (const amount of contactAmounts) for (let time = 0; time < 60; time += .7) {
    const hit = samplePierImpact(amount, side, time, weather);
    if (hit) unique.set(`${side}:${amount}:${hit.crossingTime}`, hit);
  }
  return [...unique.values()];
}

test('pier impacts begin at real rising ocean crests on the exterior of both faces', () => {
  let checked = 0;
  for (const weather of [storm, { windSpeed: 3, windDirection: .3, waveScale: .75 }]) {
    const hits = impacts(weather);
    expect(hits.length).toBeGreaterThan(50);
    expect(new Set(hits.map(hit => hit.side))).toEqual(new Set([-1, 1]));
    for (const hit of hits) {
      const threshold = .04 + weather.waveScale * .055;
      const end = Math.ceil((hit.crossingTime - 1e-9) / .2) * .2;
      const before = sampleWaterHeight(hit.x, hit.z, end - .2, weather) * weather.waveScale;
      const after = sampleWaterHeight(hit.x, hit.z, end, weather) * weather.waveScale;
      expect(before).toBeLessThan(threshold);
      expect(after).toBeGreaterThanOrEqual(threshold);
      expect((after - before) / .2).toBeGreaterThan(.035);
      expect(distanceToPier(hit.x, hit.z)).toBeCloseTo(.045, 8);
      expect(hit.normalX * hit.tangentX + hit.normalZ * hit.tangentZ).toBeCloseTo(0, 12);
      checked++;
    }
  }
  expect(checked).toBeGreaterThanOrEqual(150);
});

test('run-up rises, peels outward and drains, with foam lasting after the sheet', () => {
  const all = impacts(storm).sort((a, b) => b.height - a.height), hit = all[0];
  console.info('Strong windward surf phase:', JSON.stringify({ crossingTime: hit.crossingTime,
    rising: hit.crossingTime + .25, peeling: hit.crossingTime + .55, draining: hit.crossingTime + 1.15,
    position: [hit.x, hit.z], height: hit.height, weather: storm }));
  const visibleHit = all.find(candidate => candidate.side === 1 && candidate.amount >= .65)!;
  console.info('Right-pane surf phase:', JSON.stringify({ amount: visibleHit.amount,
    crossingTime: visibleHit.crossingTime, rising: visibleHit.crossingTime + .25,
    peeling: visibleHit.crossingTime + .55, spraying: visibleHit.crossingTime + .65,
    draining: visibleHit.crossingTime + 1.15, foam: visibleHit.crossingTime + 1.85,
    position: [visibleHit.x, visibleHit.z], height: visibleHit.height, weather: storm }));
  const at = (age: number, reduced = false) => samplePierImpactShape(hit, hit.crossingTime + age, reduced);
  expect(at(0).runup).toBe(0);
  expect(at(.42).runup).toBeGreaterThan(at(.15).runup);
  expect(at(.95).runup).toBeLessThan(at(.54).runup);
  expect(at(1.7).runup).toBe(0);
  expect(at(1).curl).toBeGreaterThan(at(.4).curl);
  expect(at(1.6).sheetAlpha).toBe(0);
  expect(at(1.6).foamAlpha).toBeGreaterThan(0);
  expect(at(3.2).foamAlpha).toBe(0);
  expect(at(.54, true).runup / at(.54).runup).toBeCloseTo(.55, 10);
  let previous = at(0);
  for (let age = .01; age < 3.3; age += .01) {
    const next = at(age);
    expect(Math.abs(next.runup - previous.runup)).toBeLessThan(hit.height * .04);
    expect(next.runup).toBeGreaterThanOrEqual(0);
    expect(next.runup).toBeLessThanOrEqual(hit.height);
    previous = next;
  }
});

test('stronger wind increases splash energy and reversed wind exchanges the exposed side', () => {
  const forward = impacts(storm);
  const reverse = impacts({ ...storm, windDirection: windwardDirection + Math.PI });
  const calm = impacts({ ...storm, windSpeed: 2, waveScale: .7 });
  const mean = (hits: PierImpact[], side: PierSide) => {
    const selected = hits.filter(hit => hit.side === side);
    return selected.reduce((sum, hit) => sum + hit.height, 0) / selected.length;
  };
  expect(mean(forward, 1)).toBeGreaterThan(mean(forward, -1) * 3);
  expect(mean(reverse, -1)).toBeGreaterThan(mean(reverse, 1) * 3);
  expect(mean(forward, 1)).toBeGreaterThan(mean(calm, 1) * 3);
  expect(mean(calm, -1)).toBeGreaterThan(0);
});

test('visible spray flies up then falls outside the footing and disappears into the actual sea', () => {
  const hit = impacts(storm).sort((a, b) => b.height - a.height)[0];
  let visible = 0, rising = 0, falling = 0;
  for (let index = 0; index < 14; index++) {
    let previous: ReturnType<typeof samplePierDroplet> | null = null;
    for (let age = 0; age < 2.2; age += .015) {
      const drop = samplePierDroplet(hit, index, hit.crossingTime + age, storm);
      expect([drop.x, drop.y, drop.z, drop.size, drop.alpha].every(Number.isFinite)).toBe(true);
      if (drop.alpha > .01) {
        visible++;
        const center = samplePierPath(hit.amount);
        const across = ((drop.x - center.x) * center.normalX + (drop.z - center.z) * center.normalZ) * hit.side;
        expect(across).toBeGreaterThan(PIER_FOOT_WIDTH / 2);
        expect(distanceToPier(drop.x, drop.z)).toBeGreaterThan(0);
        const sea = PIER_SEA_LEVEL + sampleWaterHeight(drop.x, drop.z, hit.crossingTime + age, storm) * storm.waveScale;
        expect(drop.y).toBeGreaterThan(sea + .025);
        if (previous && previous.alpha > .01) {
          if (drop.y > previous.y) rising++; else falling++;
        }
      }
      previous = drop;
    }
    expect(samplePierDroplet(hit, index, hit.crossingTime + 3, storm).alpha).toBe(0);
  }
  expect(visible).toBeGreaterThan(300);
  expect(rising).toBeGreaterThan(50);
  expect(falling).toBeGreaterThan(50);
});

test('absolute crest buckets agree after different frame rates, long pauses and backwards previews', async () => {
  const a = createPierSurf(), b = createPierSurf(), restored = createPierSurf();
  try {
    for (let frame = 0; frame <= 240; frame++) a.update(60 + frame / 60, storm);
    for (let frame = 0; frame <= 96; frame++) b.update(60 + frame / 24, storm);
    restored.update(4000, storm); restored.update(64, storm);
    expect(a.snapshot()).toEqual(b.snapshot());
    expect(a.snapshot()).toEqual(restored.snapshot());
    for (const side of [1, -1] as PierSide[]) for (const amount of contactAmounts) {
      const hit = samplePierImpact(amount, side, 64, storm);
      const actual = a.snapshot().contacts.find(contact => contact.side === side && contact.amount === amount);
      expect(actual?.crossingTime).toEqual(hit?.crossingTime);
    }
    await test.info().attach('pier-surf-phase-evidence', { body: JSON.stringify(a.snapshot(), null, 2), contentType: 'application/json' });
  } finally { a.dispose(); b.dispose(); restored.dispose(); }
});

test('pooled surf reuses exactly three unlit texture-free batches across quality, reduced motion and disposal', () => {
  const surf = createPierSurf(), geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  const textures: THREE.Texture[] = [], lights: THREE.Light[] = [];
  surf.group.traverse(object => {
    if (object instanceof THREE.Light) lights.push(object);
    if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
      geometries.add(object.geometry);
      const material = object.material as THREE.ShaderMaterial;
      materials.add(material);
      for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) textures.push(uniform.value);
    }
  });
  expect(geometries.size).toBe(3); expect(materials.size).toBe(3);
  expect(textures).toEqual([]); expect(lights).toEqual([]);
  const sheets = surf.group.getObjectByName('pier-curling-wave-sheets') as THREE.InstancedMesh;
  const foam = surf.group.getObjectByName('pier-broken-sea-foam') as THREE.InstancedMesh;
  const spray = surf.group.getObjectByName('pier-airborne-spray') as THREE.Points;
  const geometryArray = [...geometries], materialArray = [...materials];
  const attributes = geometryArray.map(geometry => Object.values(geometry.attributes).map(attribute => attribute.array));
  const time = impacts(storm).sort((a, b) => b.height - a.height)[0].crossingTime + .65;
  surf.update(time, storm);
  expect(sheets.count).toBe(24); expect(foam.count).toBe(24);
  const full = surf.snapshot(); expect(full.droplets).toBeGreaterThan(0);
  const matrixVersion = sheets.instanceMatrix.version;
  surf.update(time + .01, storm);
  expect(sheets.instanceMatrix.version).toBe(matrixVersion);
  surf.update(time, storm, true);
  expect(sheets.count).toBe(12); expect(foam.count).toBe(12);
  expect(surf.snapshot().droplets).toBeLessThan(full.droplets);
  surf.update(time, storm, false, true);
  expect(surf.snapshot().droplets).toBe(0);
  expect(surf.snapshot().contacts[0].runup).toBeCloseTo(full.contacts[0].runup * .55, 10);
  expect(sheets.count).toBe(24);
  expect(spray.geometry.drawRange.count).toBe(336);
  expect(geometryArray.map(geometry => Object.values(geometry.attributes).map(attribute => attribute.array))).toEqual(attributes);
  let geometryDisposals = 0, materialDisposals = 0, instanceDisposals = 0;
  for (const geometry of geometryArray) geometry.addEventListener('dispose', () => geometryDisposals++);
  for (const material of materialArray) material.addEventListener('dispose', () => materialDisposals++);
  sheets.addEventListener('dispose', () => instanceDisposals++); foam.addEventListener('dispose', () => instanceDisposals++);
  surf.dispose(); surf.dispose(); surf.update(100, storm);
  expect(surf.group.children).toHaveLength(0);
  expect(geometryDisposals).toBe(3); expect(materialDisposals).toBe(3); expect(instanceDisposals).toBe(2);
});
