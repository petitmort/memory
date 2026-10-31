import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { timestampFromZonedInput } from '../src/calendar-seed';
import { blendWeather, createWeatherController, PRECIPITATION_BOUNDS, samplePrecipitation, sampleWeather, WEATHER_KINDS, WEATHER_LABELS } from '../src/weather-controller';
import { CLOUD_LIFETIME, CLOUD_FADE_DURATION, createCloudController, sampleCloudPosition } from '../src/cloud-controller';
import { cloudWindVector, createCloudWindIntegrator, CLOUD_WIND_CACHE_HOURS, CLOUD_WIND_HOUR } from '../src/cloud-wind';

test('simulated coastal weather is deterministic and all ten forced conditions remain explicit', () => {
  const timestamp = Date.parse('2026-10-31T12:34:56Z');
  expect(sampleWeather(timestamp)).toEqual(sampleWeather(timestamp));
  expect(Object.keys(WEATHER_LABELS)).toHaveLength(10);
  for (const kind of WEATHER_KINDS) {
    const state = sampleWeather(timestamp, { kind });
    expect(state.kind).toBe(kind); expect(state.simulated).toBe(true);
    for (const value of [state.cloudCover, state.precipitation, state.snow, state.visibility]) {
      expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThanOrEqual(1);
    }
    if (kind.includes('rain')) expect(state.precipitation).toBeGreaterThan(0);
    if (kind.includes('snow')) { expect(state.snow).toBe(1); expect(state.precipitation).toBeGreaterThan(0); }
  }
  const override = sampleWeather(timestamp, { kind: 'snow', cloudCover: 1.7, windSpeed: -3 });
  expect(override.cloudCover).toBe(1); expect(override.windSpeed).toBe(0);
});

test('summer favours clear skies, winter is cloudier, and default coastal snow stays rare', () => {
  let summerClear = 0, winterClear = 0, summerCover = 0, winterCover = 0, snow = 0, count = 0;
  for (let year = 2001; year <= 2030; year++) for (let day = 1; day <= 28; day++) {
    const summer = sampleWeather(Date.UTC(year, 6, day, 12)), winter = sampleWeather(Date.UTC(year, 0, day, 12));
    summerClear += Number(summer.kind === 'clear'); winterClear += Number(winter.kind === 'clear');
    summerCover += summer.cloudCover; winterCover += winter.cloudCover;
    snow += Number(winter.kind.includes('snow')); count++;
    expect(summer.snow).toBe(0);
  }
  expect(summerClear / count).toBeGreaterThan(.52);
  expect(summerClear).toBeGreaterThan(winterClear * 3);
  expect(winterCover / count).toBeGreaterThan(summerCover / count + .2);
  expect(snow / count).toBeLessThan(.025);
});

test('local midnight and ordinary clock samples remain continuous across time zones', () => {
  for (const zone of ['Europe/Athens', 'Asia/Shanghai', 'America/New_York']) {
    const midnight = timestampFromZonedInput('2026-11-01T00:00', zone);
    const a = sampleWeather(midnight - 5, { timeZone: zone }), b = sampleWeather(midnight + 5, { timeZone: zone });
    for (const key of ['cloudCover', 'precipitation', 'snow', 'windSpeed', 'visibility', 'waveScale'] as const)
      expect(Math.abs(a[key] - b[key]), `${zone}:${key}`).toBeLessThan(.001);
    // Random fronts may now change weather within ten minutes. Millisecond
    // neighbours must remain continuous irrespective of where a front starts.
    const noon = midnight + 12 * 3600000, one = sampleWeather(noon - 5, { timeZone: zone }), two = sampleWeather(noon + 5, { timeZone: zone });
    for (const key of ['cloudCover', 'precipitation', 'snow', 'windSpeed', 'visibility', 'waveScale'] as const)
      expect(Math.abs(one[key] - two[key]), `${zone}:noon:${key}`).toBeLessThan(.001);
  }
  const a = { ...sampleWeather(0, { kind: 'clear' }), windDirection: Math.PI * 2 - .1 };
  const b = { ...sampleWeather(0, { kind: 'rain' }), windDirection: .1 };
  expect(Math.cos(blendWeather(a, b, .5).windDirection)).toBeCloseTo(1, 8);
  expect(blendWeather(a, b, 0)).toEqual(a);
  expect(blendWeather(a, b, 1).precipitation).toEqual(b.precipitation);
});

test('rain and snow stay outdoors under wind, clock wraps and reduced motion', () => {
  for (const snow of [false, true]) for (const reduced of [false, true]) {
    for (let index = 0; index < 300; index++) {
      const time = Date.parse('2026-12-25T23:59:59Z') + index * 123475;
      const p = samplePrecipitation(index, time, snow, 20, index * .19, reduced);
      expect(p).toEqual(samplePrecipitation(index, time, snow, 20, index * .19, reduced));
      expect(p[0]).toBeGreaterThanOrEqual(PRECIPITATION_BOUNDS.minX); expect(p[0]).toBeLessThanOrEqual(PRECIPITATION_BOUNDS.maxX);
      expect(p[1]).toBeGreaterThanOrEqual(PRECIPITATION_BOUNDS.minY); expect(p[1]).toBeLessThanOrEqual(PRECIPITATION_BOUNDS.maxY);
      expect(p[2]).toBeGreaterThanOrEqual(PRECIPITATION_BOUNDS.minZ); expect(p[2]).toBeLessThanOrEqual(PRECIPITATION_BOUNDS.maxZ);
      expect(p[2]).toBeLessThan(-8);
    }
  }
});

test('cloud wind integrates hourly vectors continuously with ten samples across backward queries and calendar edges', () => {
  const integrator = createCloudWindIntegrator(timestamp => ({ x: timestamp / CLOUD_WIND_HOUR, z: -2 }));
  const from = 20.25 * CLOUD_WIND_HOUR, to = 25.75 * CLOUD_WIND_HOUR;
  const expectedX = ((to / CLOUD_WIND_HOUR) ** 2 - (from / CLOUD_WIND_HOUR) ** 2) * 1800;
  const result = integrator.integral(from, to);
  expect(result.x).toBeCloseTo(expectedX, 8); expect(result.z).toBeCloseTo(-2 * (to - from) / 1000, 8);
  expect(integrator.stats().cachedHours).toBe(CLOUD_WIND_CACHE_HOURS);
  const initial = integrator.stats().samples;
  for (let i = 0; i < 100; i++) integrator.integral(from, to + i);
  expect(integrator.stats().samples).toBe(initial);
  integrator.integral(from + CLOUD_WIND_HOUR, to + CLOUD_WIND_HOUR);
  expect(integrator.stats().samples).toBe(initial + 1);
  expect(integrator.integral(from, to)).toEqual(result);
  expect(integrator.stats().samples).toBe(initial + 11);
  expect(() => integrator.integral(from, from + CLOUD_LIFETIME + 1)).toThrow(RangeError);

  for (const centre of ['2026-01-01T00:00:00Z', '2024-02-29T00:00:00Z', '2024-03-01T00:00:00Z',
    '2026-03-29T01:00:00Z', '2026-10-25T01:00:00Z', '2026-11-01T00:00:00Z']) {
    const timestamp = Date.parse(centre);
    for (const timeZone of ['Europe/Athens', 'Asia/Shanghai', 'America/New_York']) {
      const wind = createCloudWindIntegrator(), fresh = createCloudWindIntegrator();
      const a = wind.integral(timestamp - 7 * CLOUD_WIND_HOUR, timestamp - 1, timeZone);
      const b = wind.integral(timestamp - 7 * CLOUD_WIND_HOUR, timestamp + 1, timeZone);
      expect(Math.abs(a.x - b.x)).toBeLessThan(.03); expect(Math.abs(a.z - b.z)).toBeLessThan(.03);
      expect(b).toEqual(fresh.integral(timestamp - 7 * CLOUD_WIND_HOUR, timestamp + 1, timeZone));
      wind.integral(timestamp + 36 * CLOUD_WIND_HOUR, timestamp + 40 * CLOUD_WIND_HOUR, timeZone);
      expect(wind.integral(timestamp - 7 * CLOUD_WIND_HOUR, timestamp + 1, timeZone)).toEqual(b);
      expect(wind.stats().cachedHours).toBeLessThanOrEqual(10);
    }
  }
});

test('cloud lifetimes fade invisibly, calendar positions repeat and signed wind controls both axes', () => {
  const timestamp = Date.parse('2026-10-31T12:00:00Z');
  const phases: number[] = [];
  for (const reduced of [false, true]) for (let index = 0; index < 36; index++) {
    const a = sampleCloudPosition(index, timestamp, undefined, .7, reduced);
    expect(sampleCloudPosition(index, timestamp, undefined, .7, reduced)).toEqual(a);
    expect(a.z).toBeLessThanOrEqual(-55); expect(a.y).toBeGreaterThan(0);
    if (!reduced) phases.push(a.birth);
    const zero = sampleCloudPosition(index, timestamp, 0, .7, reduced);
    const still = sampleCloudPosition(index, timestamp + 1000, 0, .7, reduced);
    expect([still.x, still.y, still.z]).toEqual([zero.x, zero.y, zero.z]);
    const positive = sampleCloudPosition(index, timestamp, 4, .7, reduced);
    const positiveNext = sampleCloudPosition(index, timestamp + 1000, 4, .7, reduced);
    const negative = sampleCloudPosition(index, timestamp, 4, .7 + Math.PI, reduced);
    const negativeNext = sampleCloudPosition(index, timestamp + 1000, 4, .7 + Math.PI, reduced);
    expect(positiveNext.rawX - positive.rawX).toBeGreaterThan(0);
    expect(positiveNext.rawZ - positive.rawZ).toBeGreaterThan(0);
    expect(negativeNext.rawX - negative.rawX).toBeLessThan(0);
    expect(negativeNext.rawZ - negative.rawZ).toBeLessThan(0);
    expect(positiveNext.rawX - positive.rawX).toBeCloseTo(-(negativeNext.rawX - negative.rawX), 8);
    const before = sampleCloudPosition(index, a.birth + CLOUD_LIFETIME - 1);
    const after = sampleCloudPosition(index, a.birth + CLOUD_LIFETIME + 1);
    expect(before.alpha).toBeLessThan(.000001); expect(after.alpha).toBeLessThan(.000001);
    expect(sampleCloudPosition(index, a.birth + CLOUD_FADE_DURATION).age).toBeCloseTo(CLOUD_FADE_DURATION, 3);
  }
  expect(new Set(phases).size).toBe(36);
  const normal = sampleCloudPosition(4, timestamp + 1000, 4).rawX - sampleCloudPosition(4, timestamp, 4).rawX;
  const reduced = sampleCloudPosition(4, timestamp + 1000, 4, .7, true).rawX - sampleCloudPosition(4, timestamp, 4, .7, true).rawX;
  expect(reduced / normal).toBeCloseTo(.2, 8);
  expect(cloudWindVector(0, Math.PI)).toEqual({ x: -0, z: 0 });
});

function unitCloudController() {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const context = { save() {}, beginPath() {}, rect() {}, clip() {}, restore() {}, fillRect() {},
    createRadialGradient() { return { addColorStop() {} }; } };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    createElement() { return { width: 0, height: 0, getContext() { return context; } }; },
  } });
  try { return createCloudController(); }
  finally { if (original) Object.defineProperty(globalThis, 'document', original); else delete (globalThis as any).document; }
}

test('debug wind changes preserve cloud positions, zero wind remains still and pooled low-quality actors recover', () => {
  const clouds = unitCloudController(), fresh = unitCloudController();
  const mesh = clouds.group.children[0] as any, style = mesh.geometry.getAttribute('cloudStyle');
  const positions = () => Array.from(mesh.instanceMatrix.array);
  const now = Date.parse('2026-10-31T12:00:00Z'), state = sampleWeather(now, { kind: 'cloudy', windSpeed: 0 });
  const options = { windSpeed: 0, revision: 1 };
  let disposals = 0;
  // InstancedMesh owns the instanceMatrix GPU buffer separately from geometry.
  for (const resource of [mesh, mesh.geometry, mesh.material, mesh.material.uniforms.cloudMap.value]) resource.addEventListener('dispose', () => disposals++);
  clouds.update(now, state, false, false, 1, undefined, options);
  fresh.update(now, state, false, false, 1, undefined, options);
  expect(Array.from((fresh.group.children[0] as any).instanceMatrix.array)).toEqual(positions());
  const stationary = positions(), matrixBuffer = mesh.instanceMatrix.array, styleBuffer = style.array;
  clouds.update(now + 60000, state, false, false, 1, undefined, options);
  expect(positions()).toEqual(stationary);
  clouds.update(now + 60000, state, false, false, 1, undefined, { windSpeed: 10, revision: 2 });
  expect(positions()).toEqual(stationary);
  clouds.update(now + 66000, state, false, false, 1, undefined, { windSpeed: 10, revision: 2 });
  expect(positions()).not.toEqual(stationary);
  const moving = positions();
  clouds.update(now + 66000, state, false, false, 1, undefined, { windSpeed: 0, revision: 3 });
  expect(positions()).toEqual(moving);
  clouds.update(now + 72000, state, false, false, 1, undefined, { windSpeed: 0, revision: 3 });
  const stopped = positions();
  clouds.update(now + 132000, state, false, false, 1, undefined, { windSpeed: 0, revision: 3 });
  expect(positions()).toEqual(stopped);
  clouds.update(now + 9 * CLOUD_WIND_HOUR, state, false, false, 1, undefined, { windSpeed: 0, revision: 3 });
  expect(positions()).toEqual(stopped);
  clouds.update(now + 9 * CLOUD_WIND_HOUR, state, false, false, 1, undefined, { revision: 4 });
  expect(positions()).toEqual(stopped);
  clouds.update(now + 9 * CLOUD_WIND_HOUR + 1000, state, true, false, 1, undefined, { revision: 4 });
  expect(mesh.count).toBe(16);
  clouds.update(now + 9 * CLOUD_WIND_HOUR + 2000, state, false, false, 1, undefined, { revision: 4 });
  expect(mesh.count).toBe(36);
  expect(mesh.instanceMatrix.array).toBe(matrixBuffer); expect(style.array).toBe(styleBuffer);
  expect(clouds.group.userData.windCache.cachedHours).toBeLessThanOrEqual(10);
  clouds.dispose(); clouds.dispose(); fresh.dispose(); expect(disposals).toBe(4);
});

test('a fixed cloud wind direction keeps automatic speed across fronts and reanchors continuously every ten seconds', () => {
  const clouds = unitCloudController(), constant = unitCloudController();
  const mesh = clouds.group.children[0] as THREE.InstancedMesh;
  const matrices = () => Array.from(mesh.instanceMatrix.array);
  const now = Date.parse('2026-10-31T12:00:00Z'), options = { windDirection: 0 };
  const initial = sampleWeather(now, options), fixed = { windDirection: 0, windSpeed: initial.windSpeed };
  const update = (controller: typeof clouds, at: number, configuration: typeof options & { windSpeed?: number }) =>
    controller.update(at, sampleWeather(at, configuration), false, false, 1, undefined, configuration);
  try {
    update(clouds, now, options); update(constant, now, fixed);
    update(clouds, now + 9999, options);
    update(constant, now + 10000, fixed); update(clouds, now + 10000, options);
    // The 10-second sample changes future velocity, never the integrated position.
    expect(matrices()).toEqual(Array.from((constant.group.children[0] as THREE.InstancedMesh).instanceMatrix.array));
    const later = Array.from({ length: 48 }, (_, index) => now + (index + 1) * CLOUD_WIND_HOUR)
      .find(at => Math.abs(sampleWeather(at, options).windSpeed - initial.windSpeed) > 1);
    expect(later).toBeDefined(); if (later === undefined) throw new Error('Expected a natural speed-changing front');
    const target = sampleWeather(later, options);
    update(clouds, later, options); update(clouds, later + 6000, options);
    const before = matrices(); update(clouds, later + 7000, options); const after = matrices();
    expect(after[12] - before[12]).toBeCloseTo(target.windSpeed * .038, 4);
    expect(after[14] - before[14]).toBe(0);
  } finally { clouds.dispose(); constant.dispose(); }
});

test('a fixed cloud wind speed keeps automatic direction across fronts while a fully fixed zero wind stays still', () => {
  const clouds = unitCloudController(), calm = unitCloudController();
  const mesh = clouds.group.children[0] as THREE.InstancedMesh;
  const calmMesh = calm.group.children[0] as THREE.InstancedMesh;
  const now = Date.parse('2026-10-31T12:00:00Z'), options = { windSpeed: 5 }, stationary = { windSpeed: 0, windDirection: 1.1 };
  const initial = sampleWeather(now, options);
  const later = Array.from({ length: 48 }, (_, index) => now + (index + 1) * CLOUD_WIND_HOUR)
    .find(at => Math.abs(Math.atan2(Math.sin(sampleWeather(at, options).windDirection - initial.windDirection),
      Math.cos(sampleWeather(at, options).windDirection - initial.windDirection))) > .25);
  expect(later).toBeDefined(); if (later === undefined) throw new Error('Expected a natural turning front');
  const update = (controller: typeof clouds, at: number, configuration: { windSpeed: number; windDirection?: number }) =>
    controller.update(at, sampleWeather(at, configuration), false, false, 1, undefined, configuration);
  try {
    update(clouds, now, options); update(calm, now, stationary);
    const still = Array.from(calmMesh.instanceMatrix.array);
    update(clouds, later, options); update(clouds, later + 6000, options);
    const before = Array.from(mesh.instanceMatrix.array); update(clouds, later + 7000, options);
    const after = Array.from(mesh.instanceMatrix.array), target = sampleWeather(later, options);
    expect(after[12] - before[12]).toBeCloseTo(Math.cos(target.windDirection) * 5 * .038, 4);
    expect(after[14] - before[14]).toBeCloseTo(Math.sin(target.windDirection) * 5 * .038 * .16, 4);
    update(calm, now + 10000, stationary); expect(Array.from(calmMesh.instanceMatrix.array)).toEqual(still);
    update(calm, later + 7000, stationary); expect(Array.from(calmMesh.instanceMatrix.array)).toEqual(still);
  } finally { clouds.dispose(); calm.dispose(); }
});

function roomCamera(mobile: boolean) {
  const camera = new THREE.PerspectiveCamera(50, mobile ? 390 / 844 : 1000 / 740, .1, 500);
  camera.position.set(mobile ? .55 : 1.1, 1.65, mobile ? 1.15 : .75);
  camera.lookAt(mobile ? .15 : -.2, mobile ? 1.05 : .95, mobile ? -1.4 : -1.5);
  camera.updateMatrixWorld(true);
  return camera;
}

test('low quality draws selected pooled seeds with their matching styles and restores all normal positions', () => {
  const clouds = unitCloudController(), mesh = clouds.group.children[0] as any;
  const timestamp = Date.parse('2026-10-31T12:00Z'), state = sampleWeather(timestamp, { kind: 'cloudy' }), camera = roomCamera(true);
  clouds.update(timestamp, state, false, false, 1, undefined, { camera });
  const all = Array.from(mesh.instanceMatrix.array) as number[];
  const allStyles = Array.from(mesh.geometry.getAttribute('cloudStyle').array) as number[];
  const keys = Array.from({ length: 36 }, (_, index) => all.slice(index * 16, index * 16 + 16).join(','));
  clouds.update(timestamp, state, true, false, 1, undefined, { camera });
  const chosen: number[] = [], styles = mesh.geometry.getAttribute('cloudStyle').array;
  for (let slot = 0; slot < 16; slot++) {
    const key = Array.from(mesh.instanceMatrix.array.slice(slot * 16, slot * 16 + 16)).join(',');
    const seed = keys.indexOf(key); expect(seed).toBeGreaterThanOrEqual(0); chosen.push(seed);
    for (let field = 0; field < 4; field++) expect(styles[slot * 4 + field]).toBe(allStyles[seed * 4 + field]);
  }
  expect(new Set(chosen).size).toBe(16); expect(chosen.some(index => index >= 16)).toBe(true);
  clouds.update(timestamp, state, false, false, 1, undefined, { camera });
  expect(Array.from(mesh.instanceMatrix.array)).toEqual(all);
  clouds.dispose();
});

test('cloudy and snowy windows retain comparable visible clouds in low quality over complete days', () => {
  const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  const visible = (p: { x: number; y: number; z: number; width: number; height: number; alpha: number }, threshold: number, cover: number, camera: THREE.PerspectiveCamera) => {
    if (p.alpha * smooth((cover - threshold + .16) / .32) < .1) return false;
    const halfWidth = p.width * .48, halfHeight = p.height * .38, eye = camera.position;
    const ratio = (-2.7 - eye.z) / (p.z - eye.z);
    if (eye.x + (p.x + halfWidth - eye.x) * ratio < -1.5 || eye.x + (p.x - halfWidth - eye.x) * ratio > 1.5
      || eye.y + (p.y + halfHeight - eye.y) * ratio < .85 || eye.y + (p.y - halfHeight - eye.y) * ratio > 2.45) return false;
    const corners = [[-halfWidth, -halfHeight], [halfWidth, -halfHeight], [halfWidth, halfHeight], [-halfWidth, halfHeight]]
      .map(([x, y]) => new THREE.Vector3(p.x + x, p.y + y, p.z).project(camera));
    return !(Math.max(...corners.map(point => point.x)) < -1 || Math.min(...corners.map(point => point.x)) > 1
      || Math.max(...corners.map(point => point.y)) < -1 || Math.min(...corners.map(point => point.y)) > 1);
  };
  const cases = [{ date: '2026-01-15T00:00Z', cover: .98 }, { date: '2026-04-23T00:00Z', cover: 1 },
    { date: '2026-06-21T00:00Z', cover: .58 }, { date: '2026-10-31T00:00Z', cover: .58 }];
  for (const sample of cases) for (const mobile of [false, true]) for (const reduced of [false, true]) {
    const clouds = unitCloudController(), mesh = clouds.group.children[0] as any, camera = roomCamera(mobile);
    let fullEmpty = 0, lowEmpty = 0, maxFullEmpty = 0, maxLowEmpty = 0, fullTotal = 0, lowTotal = 0;
    try {
      for (let tick = 0; tick <= 24 * 12; tick++) {
        const timestamp = Date.parse(sample.date) + tick * 300000, state = { ...sampleWeather(timestamp), cloudCover: sample.cover };
        clouds.update(timestamp, state, true, reduced, 1, undefined, { camera });
        let fullCount = 0, lowCount = 0;
        for (let index = 0; index < 36; index++) {
          if (visible(sampleCloudPosition(index, timestamp, undefined, .7, reduced), .05 + index % 12 / 12 * .84, sample.cover, camera)) fullCount++;
        }
        const matrices = mesh.instanceMatrix.array, styles = mesh.geometry.getAttribute('cloudStyle').array;
        for (let slot = 0; slot < 16; slot++) {
          if (visible({ x: matrices[slot * 16 + 12], y: matrices[slot * 16 + 13], z: matrices[slot * 16 + 14],
            width: matrices[slot * 16], height: matrices[slot * 16 + 5], alpha: styles[slot * 4 + 3] }, styles[slot * 4 + 2], sample.cover, camera)) lowCount++;
        }
        fullTotal += fullCount; lowTotal += lowCount;
        maxFullEmpty = Math.max(maxFullEmpty, fullCount ? (fullEmpty = 0) : ++fullEmpty);
        maxLowEmpty = Math.max(maxLowEmpty, lowCount ? (lowEmpty = 0) : ++lowEmpty);
      }
      const label = `${sample.date}:mobile=${mobile}:reduced=${reduced}`;
      expect(maxLowEmpty, label).toBeLessThanOrEqual(maxFullEmpty + 1);
      expect(lowTotal / fullTotal, label).toBeGreaterThan(.9);
    } finally { clouds.dispose(); }
  }
});

test('precipitation reuses its buffers, reduces quality and disposes resources once', () => {
  const weather = createWeatherController(), rain = weather.group.getObjectByName('outdoor-rain') as any;
  const snow = weather.group.getObjectByName('outdoor-snow') as any;
  const rainBuffer = rain.geometry.getAttribute('position').array, snowBuffer = snow.geometry.getAttribute('position').array;
  const state = sampleWeather(Date.now(), { kind: 'heavy-rain' });
  let disposals = 0;
  for (const resource of [rain.geometry, rain.material, snow.geometry, snow.material]) resource.addEventListener('dispose', () => disposals++);
  weather.update(Date.now(), state, false, false, 1);
  expect(weather.group.userData.rainCount).toBe(1500); expect(rain.geometry.drawRange.count).toBe(3000);
  for (let i = 2; i < rain.geometry.drawRange.count * 3; i += 3) expect(rainBuffer[i]).toBeLessThan(-8);
  weather.update(Date.now() + 5000, state, true, false, 1);
  expect(weather.group.userData.rainCount).toBe(430);
  weather.update(Date.now() + 8000, sampleWeather(Date.now(), { kind: 'snow' }), false, false, .2);
  expect(weather.group.userData.snowCount).toBeGreaterThan(200);
  expect(rain.geometry.getAttribute('position').array).toBe(rainBuffer); expect(snow.geometry.getAttribute('position').array).toBe(snowBuffer);
  weather.dispose(); weather.dispose(); expect(disposals).toBe(4); expect(weather.group.children).toHaveLength(0);
});

test('the cloud shader and outdoor particle buffers render with fog without new allocations', async ({ page }) => {
  await page.route('**/__weather_render', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Weather render check</title><body style="margin:0"></body>' }));
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/__weather_render');
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { createWeatherController, sampleWeather } = await import('/src/weather-controller.ts');
    const { createCloudController } = await import('/src/cloud-controller.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(400, 300); document.body.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#60798a'); scene.fog = new THREE.FogExp2('#60798a', .002);
    const camera = new THREE.PerspectiveCamera(70, 4 / 3, .1, 500); camera.position.set(0, 2, 1); camera.lookAt(0, 6, -40);
    const weather = createWeatherController(), clouds = createCloudController(); scene.add(weather.group, clouds.group);
    const now = Date.parse('2026-12-25T12:00:00Z');
    const records: any[] = [];
    for (const kind of ['clear', 'heavy-rain', 'snow']) {
      const state = sampleWeather(now, { kind: kind as any });
      weather.update(now, state, false, false, 1); clouds.update(now, state, false, false, 1, [1, .5, -.2]);
      renderer.render(scene, camera);
      records.push({ kind, geometry: renderer.info.memory.geometries, textures: renderer.info.memory.textures, calls: renderer.info.render.calls, rain: weather.group.userData.rainCount, snow: weather.group.userData.snowCount });
    }
    const pixels = new Uint8Array(400 * 300 * 4), gl = renderer.getContext(); gl.readPixels(0, 0, 400, 300, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const varied = new Set(Array.from({ length: 120000 }, (_, i) => `${pixels[i * 4]}:${pixels[i * 4 + 1]}:${pixels[i * 4 + 2]}`)).size;
    weather.dispose(); clouds.dispose(); renderer.dispose();
    return { records, varied };
  });
  expect(errors).toEqual([]);
  expect(result.records.map(r => r.geometry)).toEqual([3, 3, 3]);
  expect(result.records.map(r => r.textures)).toEqual([1, 1, 1]);
  expect(result.records[1].rain).toBe(1500); expect(result.records[2].snow).toBeGreaterThan(0);
  expect(result.varied).toBeGreaterThan(8);
});
