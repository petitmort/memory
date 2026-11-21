import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { PIER_FOOT_WIDTH, PIER_SEA_LEVEL, PIER_WIDTH, samplePierEdge, samplePierPath, type PierSide } from '../src/pier-layout';
import { createPierSurf, samplePierDroplet, samplePierImpact, samplePierImpactShape, type PierImpact, type PierSurfWeather } from '../src/pier-surf';
import { sampleWaterHeight } from '../src/water-surface';

const STEP = .2, HISTORY = 3.6, LIFETIME = 3.2;
const CONTACTS = 12, CAPACITY = CONTACTS * 2, DROPS = 14;
const clamp = THREE.MathUtils.clamp;
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };

// Frozen forward reconstruction from 5ded761. Keep its evaluation order and
// completed-crossing predicate independent of the optimized newest-first search.
function oldContact(amount: number, side: PierSide) {
  const p = samplePierEdge(amount, side), nx = p.normalX * side, nz = p.normalZ * side;
  const footing = (PIER_FOOT_WIDTH - PIER_WIDTH) * .5 + .045;
  return { amount, side, x: p.x + nx * footing, z: p.z + nz * footing,
    tangentX: p.tangentX, tangentZ: p.tangentZ, normalX: nx, normalZ: nz };
}
function oldCrossing(point: ReturnType<typeof oldContact>, before: number, after: number, weather: PierSurfWeather): PierImpact | null {
  const threshold = .04 + weather.waveScale * .055;
  const h0 = sampleWaterHeight(point.x, point.z, before, weather) * weather.waveScale;
  const h1 = sampleWaterHeight(point.x, point.z, after, weather) * weather.waveScale;
  const velocity = (h1 - h0) / (after - before);
  if (h0 >= threshold || h1 < threshold || velocity < .035) return null;
  const crossingTime = before + (after - before) * (threshold - h0) / (h1 - h0);
  const gust = smooth(weather.windSpeed / 18);
  const incoming = Math.max(0, -Math.cos(weather.windDirection) * point.normalX - Math.sin(weather.windDirection) * point.normalZ);
  const exposure = .25 + .75 * incoming;
  const energy = clamp((.2 + velocity * 1.2 + gust * .35) * exposure, .04, 1);
  const pocket = .74 + .26 * Math.sin(point.x * .73 + point.z * 1.19 + crossingTime * .47) ** 2;
  const height = (.36 + 2.55 * gust) * (.38 + .62 * energy) * exposure * pocket;
  const baseHeight = PIER_SEA_LEVEL + sampleWaterHeight(point.x, point.z, crossingTime + .23, weather) * weather.waveScale;
  const spread = .77 + .23 * Math.cos(point.x * 1.31 - point.z * .57) ** 2;
  return { ...point, crossingTime, baseHeight, height, energy, width: (1.3 + energy * 1.45) * spread };
}
function oldImpact(point: ReturnType<typeof oldContact>, time: number, weather: PierSurfWeather): PierImpact | null {
  const bucket = Math.floor(time / STEP);
  let result: PierImpact | null = null;
  for (let i = bucket - Math.ceil(HISTORY / STEP); i <= bucket; i++) {
    const found = oldCrossing(point, (i - 1) * STEP, i * STEP, weather);
    if (found && found.crossingTime <= time) result = found;
  }
  return result && time - result.crossingTime < LIFETIME ? result : null;
}

const path = samplePierPath(.5), windward = Math.atan2(-path.normalZ, -path.normalX);
const weatherCases: PierSurfWeather[] = [
  { windSpeed: 0, windDirection: 0, waveScale: .2 },
  { windSpeed: 1.5, windDirection: Math.PI / 2, waveScale: .7 },
  { windSpeed: 4, windDirection: .3, waveScale: .83 },
  { windSpeed: 12, windDirection: windward, waveScale: 1.3 },
  { windSpeed: 18, windDirection: windward, waveScale: 1.5 },
  { windSpeed: 20, windDirection: windward + Math.PI, waveScale: 1.6 },
];
const amounts = Array.from({ length: CONTACTS }, (_, i) => .1 + .76 * i / (CONTACTS - 1));

test('newest-first crest reconstruction exactly matches frozen forward results around bucket boundaries', () => {
  const times = [-15.6, -.01, 0, .01, .199999999, .2, .200000001, 64, 4000, 1_000_000.17,
    ...Array.from({ length: 96 }, (_, i) => 8 + i * .37)];
  let hits = 0, beforeBoundaries = 0, atBoundaries = 0, afterBoundaries = 0, checked = 0;
  for (const weather of weatherCases) for (const side of [1, -1] as const) for (const amount of amounts) {
    const point = oldContact(amount, side);
    for (const time of times) {
      const expected = oldImpact(point, time, weather);
      expect(samplePierImpact(amount, side, time, weather)).toEqual(expected);
      if (expected) hits++;
      const bucket = Math.floor(time / STEP);
      if (Math.floor((time + 1e-8) / STEP) > bucket) beforeBoundaries++;
      if (time === bucket * STEP) atBoundaries++;
      if (Math.floor((time - 1e-8) / STEP) < bucket) afterBoundaries++;
      expect(expected?.crossingTime ?? -Infinity).toBeLessThanOrEqual(time);
      checked++;
    }
  }
  expect(checked).toBe(15_264); expect(hits).toBeGreaterThan(1_000);
  expect(beforeBoundaries).toBeGreaterThanOrEqual(144);
  expect(atBoundaries).toBeGreaterThanOrEqual(144);
  expect(afterBoundaries).toBeGreaterThanOrEqual(144);
});

function oldBuffers() {
  const points = Array.from({ length: CAPACITY }, (_, i) => oldContact(.1 + .76 * (i % CONTACTS) / (CONTACTS - 1), i < CONTACTS ? 1 : -1));
  const impacts: (PierImpact | null)[] = points.map(() => null);
  const states = new Float32Array(CAPACITY * 4), styles = new Float32Array(CAPACITY * 4), foam = new Float32Array(CAPACITY * 4);
  const positions = new Float32Array(CAPACITY * DROPS * 3), drops = new Float32Array(CAPACITY * DROPS * 2), matrices = new Float32Array(CAPACITY * 16);
  const matrix = new THREE.Matrix4();
  function pose(index: number, p: typeof points[number]) {
    matrix.set(p.tangentX, 0, p.normalX, p.x, 0, 1, 0, 0, p.tangentZ, 0, p.normalZ, p.z, 0, 0, 0, 1);
    matrix.toArray(matrices, index * 16);
  }
  points.forEach((point, i) => pose(i, point));
  let lastBucket = -Infinity, lastTime = -Infinity, lastLow = false;
  return {
    states, styles, foam, positions, drops, matrices,
    update(time: number, weather: PierSurfWeather, low: boolean, reduced: boolean) {
      const bucket = Math.floor(time / STEP), reset = !Number.isFinite(lastBucket) || time < lastTime || time - lastTime > .65;
      let packed = 0, sheets = 0, foams = 0, droplets = 0;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (reset) impacts[i] = oldImpact(point, time, weather);
        else if (bucket > lastBucket) for (let step = lastBucket + 1; step <= bucket; step++) {
          const hit = oldCrossing(point, (step - 1) * STEP, step * STEP, weather);
          if (hit) impacts[i] = hit;
        }
        if (low && i % CONTACTS % 2) continue;
        if (low !== lastLow) pose(packed, point);
        const impact = impacts[i], currentHeight = PIER_SEA_LEVEL + sampleWaterHeight(point.x, point.z, time, weather) * weather.waveScale;
        const shape = impact ? samplePierImpactShape(impact, time, reduced) : undefined;
        const alpha = shape?.sheetAlpha ?? 0, foamAlpha = shape?.foamAlpha ?? 0;
        states.set([currentHeight, shape?.runup ?? 0, shape?.curl ?? 0, alpha], packed * 4);
        styles.set([impact?.width ?? 2, i * 1.713, 0, 0], packed * 4);
        foam.set([(impact?.width ?? 2) * 1.13, currentHeight + .035, foamAlpha, shape?.foamSpread ?? 0], packed * 4);
        if (alpha > .015) sheets++; if (foamAlpha > .015) foams++;
        for (let j = 0; j < DROPS; j++) {
          const index = packed * DROPS + j;
          const drop = impact && !(reduced || low && j % 3) ? samplePierDroplet(impact, j, time, weather, reduced) : null;
          positions[index * 3] = drop?.x ?? point.x; positions[index * 3 + 1] = drop?.y ?? PIER_SEA_LEVEL; positions[index * 3 + 2] = drop?.z ?? point.z;
          drops[index * 2] = drop?.size ?? .05; drops[index * 2 + 1] = drop?.alpha ?? 0;
          if (drop && drop.alpha > .01) droplets++;
        }
        packed++;
      }
      lastBucket = bucket; lastTime = time; lastLow = low;
      return { count: packed, sheets, foam: foams, droplets };
    },
  };
}

function layers(surf: ReturnType<typeof createPierSurf>) {
  return {
    sheets: surf.group.getObjectByName('pier-curling-wave-sheets') as THREE.InstancedMesh,
    foam: surf.group.getObjectByName('pier-broken-sea-foam') as THREE.InstancedMesh,
    spray: surf.group.getObjectByName('pier-airborne-spray') as THREE.Points,
  };
}

test('slow gaps, mutable winds, backwards time and full-low-full packing retain every original Float32 buffer', () => {
  const surf = createPierSurf(), expected = oldBuffers(), { sheets, foam, spray } = layers(surf);
  const weather = { ...weatherCases[4] };
  const frames = [
    { time: 20, low: false, reduced: false }, { time: 20.001, low: false, reduced: false },
    { time: 20.2, low: true, reduced: false }, { time: 20.21, low: true, reduced: true },
    { time: 20.4, low: false, reduced: true }, { time: 22.2, low: false, reduced: false },
    { time: 24.0, low: true, reduced: false }, { time: 25.8, low: false, reduced: false },
    { time: 4000, low: false, reduced: false }, { time: 64, low: true, reduced: false },
    { time: 64.199999999, low: false, reduced: false }, { time: 64.2, low: false, reduced: false },
  ];
  try {
    for (let i = 0; i < frames.length; i++) {
      Object.assign(weather, weatherCases[i % weatherCases.length]);
      const { time, low, reduced } = frames[i], count = expected.update(time, weather, low, reduced);
      surf.update(time, weather, low, reduced);
      expect(sheets.geometry.getAttribute('surfState').array).toEqual(expected.states);
      expect(sheets.geometry.getAttribute('surfStyle').array).toEqual(expected.styles);
      expect(foam.geometry.getAttribute('foamState').array).toEqual(expected.foam);
      expect(spray.geometry.getAttribute('position').array).toEqual(expected.positions);
      expect(spray.geometry.getAttribute('dropStyle').array).toEqual(expected.drops);
      expect(sheets.instanceMatrix.array).toEqual(expected.matrices); expect(foam.instanceMatrix.array).toEqual(expected.matrices);
      expect(sheets.count).toBe(count.count); expect(foam.count).toBe(count.count);
      expect(spray.geometry.drawRange.count).toBe(count.count * DROPS);
      expect(surf.snapshot()).toMatchObject({ sheets: count.sheets, foam: count.foam, droplets: count.droplets, time });
    }
  } finally { surf.dispose(); }
});

test('unchanged width and packed phase reuse the uploaded style while low packing remaps it', () => {
  const surf = createPierSurf(), { sheets } = layers(surf), weather = weatherCases[4];
  const style = sheets.geometry.getAttribute('surfStyle') as THREE.InstancedBufferAttribute;
  try {
    surf.update(20, weather);
    const first = style.version, original = Array.from(style.array);
    surf.update(20, weather); expect(style.version).toBe(first); expect(Array.from(style.array)).toEqual(original);
    surf.update(20, weather, true); expect(style.version).toBe(first + 1);
    expect(Array.from(style.array).slice(0, CONTACTS * 4)).not.toEqual(original.slice(0, CONTACTS * 4));
    const low = style.version; surf.update(20, weather, true); expect(style.version).toBe(low);
    surf.update(20, weather, false); expect(style.version).toBe(low + 1); expect(Array.from(style.array)).toEqual(original);
  } finally { surf.dispose(); }
});
