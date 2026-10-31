import { test, expect } from '@playwright/test';
import { timestampFromZonedInput } from '../src/calendar-seed';
import { blendWeather, createWeatherController, PRECIPITATION_BOUNDS, samplePrecipitation, sampleWeather, WEATHER_KINDS, WEATHER_LABELS } from '../src/weather-controller';
import { sampleCloudPosition } from '../src/cloud-controller';

test('simulated coastal weather is deterministic and all nine forced conditions remain explicit', () => {
  const timestamp = Date.parse('2026-10-31T12:34:56Z');
  expect(sampleWeather(timestamp)).toEqual(sampleWeather(timestamp));
  expect(Object.keys(WEATHER_LABELS)).toHaveLength(9);
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

test('local midnight weather is continuous and daily variation remains small', () => {
  for (const zone of ['Europe/Athens', 'Asia/Shanghai', 'America/New_York']) {
    const midnight = timestampFromZonedInput('2026-11-01T00:00', zone);
    const a = sampleWeather(midnight - 5, { timeZone: zone }), b = sampleWeather(midnight + 5, { timeZone: zone });
    for (const key of ['cloudCover', 'precipitation', 'snow', 'windSpeed', 'visibility', 'waveScale'] as const)
      expect(Math.abs(a[key] - b[key]), `${zone}:${key}`).toBeLessThan(.001);
    const noon = midnight + 12 * 3600000, one = sampleWeather(noon, { timeZone: zone }), two = sampleWeather(noon + 600000, { timeZone: zone });
    expect(one.kind).toBe(two.kind);
    expect(Math.abs(one.cloudCover - two.cloudCover)).toBeLessThan(.02);
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

test('cloud positions follow absolute time across refresh and midnight without visible resets', () => {
  const midnight = Date.parse('2026-11-01T00:00:00Z');
  for (const reduced of [false, true]) for (let index = 0; index < 36; index++) {
    const a = sampleCloudPosition(index, midnight - 1, 4, .7, reduced);
    const b = sampleCloudPosition(index, midnight + 1, 4, .7, reduced);
    expect(a).toEqual(sampleCloudPosition(index, midnight - 1, 4, .7, reduced));
    expect(Math.abs(a.x - b.x)).toBeLessThan(.001);
    expect(Math.abs(a.z - b.z)).toBeLessThan(.001);
    expect(a.z).toBeLessThan(-45); expect(a.y).toBeGreaterThan(0);
    const gust = sampleCloudPosition(index, midnight, 20, 2.5, reduced);
    expect(Math.abs(gust.x - b.x)).toBeLessThan(30);
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
