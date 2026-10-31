import { test, expect, type Page } from '@playwright/test';
import { sampleWeather } from '../src/weather-controller';

/** Actual production adapter, deterministic clocks, no renderer or production test global. */
async function controllerPage(page: Page, query: string, wall: number) {
  await page.route('**/__environment-controller*', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Environment adapter regression</title>',
  }));
  await page.goto(`/__environment-controller${query}`);
  await page.evaluate(async wall => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { createEnvironmentController } = await import('/src/environment-controller.ts');
    const { createVesselController } = await import('/src/vessel-controller.ts');
    const { createOcean } = await import('/src/ocean.ts');
    const host = window as any, clocks = { wall, perf: 1000 };
    Date.now = () => clocks.wall;
    Object.defineProperty(performance, 'now', { configurable: true, value: () => clocks.perf });
    const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2();
    const ocean = createOcean();
    const create = () => createEnvironmentController({
      scene, camera: new THREE.PerspectiveCamera(), ocean: ocean.material,
      sunGroup: new THREE.Group(), vessels: createVesselController(),
      ambient: new THREE.HemisphereLight(), sun: new THREE.DirectionalLight(), fill: new THREE.DirectionalLight(),
      invalidate() {}, quality() {},
    });
    let controller = create();
    host.__adapter = {
      step(wallDelta = 0, perfDelta = wallDelta) {
        clocks.wall += wallDelta; clocks.perf += perfDelta;
        controller.update(20, false, true, true);
        return controller.snapshot();
      },
      patch(id: string, value: string) {
        const input = document.getElementById(id) as HTMLInputElement;
        input.value = value; input.dispatchEvent(new Event('change'));
      },
      refresh() { controller.dispose(); controller = create(); return this.step(); },
      pause() { controller.pause(); }, resume() { controller.resume(); },
      dispose() { controller.dispose(); ocean.geometry.dispose(); ocean.material.dispose(); },
    };
    host.__adapter.step();
  }, wall);
}

test('the adapter stages clouds before rain over six seconds after date jumps and resumes interruptions from the displayed weather', async ({ page }) => {
  await controllerPage(page, '?debugEnv=1&envTimeMode=scene&envDate=2026-01-06T12:00', Date.UTC(2026, 0, 6, 10));
  const result = await page.evaluate(() => {
    const adapter = (window as any).__adapter;
    const before = adapter.step();
    adapter.patch('env-date', '2026-04-23T12:00');
    const first = adapter.step();
    const gathering = adapter.step(1800);
    const middle = adapter.step(1200);
    // Change the target while a blend is still running: preserve its visible start.
    adapter.patch('env-date', '2026-01-06T12:00');
    const interrupted = adapter.step();
    const clearing = adapter.step(4200);
    const back = adapter.step(1800);
    adapter.patch('env-date', '2026-04-23T12:00');
    const second = adapter.step();
    const after = adapter.step(6000);
    adapter.dispose();
    return { before, first, gathering, middle, interrupted, clearing, back, second, after };
  });
  const expected = (snapshot: typeof result.before) => sampleWeather(snapshot.timestamp, { timeZone: 'Europe/Athens' });
  for (const endpoint of [result.before, result.back, result.after]) {
    const target = expected(endpoint);
    expect(endpoint.weather.kind).toBe(target.kind);
    // The adapter interpolates ten-second samples; allow only their small
    // numerical difference from sampling the continuous curve directly.
    for (const field of ['cloudCover', 'precipitation', 'snow', 'windSpeed', 'visibility', 'waveScale'] as const)
      expect(endpoint.weather[field], `settled:${field}`).toBeCloseTo(target[field], 3);
  }
  expect(result.before.weather.precipitation).toBe(0);
  expect(result.after.weather.precipitation).toBeGreaterThan(.35);
  expect(result.first.weather).toEqual(result.before.weather);
  expect(result.interrupted.weather).toEqual(result.middle.weather);
  expect(result.second.weather.precipitation).toBe(0);
  expect(result.first.timestamp - result.before.timestamp).toBeGreaterThan(90 * 86400000);
  const cloudDifference = result.after.weather.cloudCover - result.before.weather.cloudCover;
  expect(cloudDifference).toBeGreaterThan(.5);
  expect(result.gathering.weather.cloudCover).toBeGreaterThan(result.before.weather.cloudCover + cloudDifference * .5);
  expect(result.gathering.weather.windSpeed).toBeGreaterThan(result.before.weather.windSpeed);
  expect(result.gathering.weather.precipitation).toBe(0);
  expect(result.middle.weather.cloudCover).toBeGreaterThan(result.before.weather.cloudCover + cloudDifference * .85);
  expect(result.middle.weather.precipitation).toBeGreaterThan(0);
  expect(result.middle.weather.precipitation).toBeLessThan(result.after.weather.precipitation * .25);
  expect(result.clearing.weather.precipitation).toBe(0);
  expect(result.clearing.weather.cloudCover).toBeGreaterThan(result.back.weather.cloudCover
    + (result.interrupted.weather.cloudCover - result.back.weather.cloudCover) * .25);
  expect(result.back.weather.precipitation).toBe(0);
});

test('the real adapter stays continuous across the old DST cache boundary and restores the same time after pause or refresh', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  try {
    await controllerPage(page, '', Date.parse('2026-03-28T19:59:59.999Z'));
    const result = await page.evaluate(() => {
      const adapter = (window as any).__adapter;
      const before = adapter.step(), after = adapter.step(1);
      const later = adapter.step(30000), fresh = adapter.refresh();
      adapter.pause(); const paused = adapter.step(120000);
      adapter.resume(); const resumed = adapter.step(), refreshed = adapter.refresh();
      adapter.dispose();
      return { before, after, later, fresh, paused, resumed, refreshed };
    });
    expect(result.after.timestamp - result.before.timestamp).toBeGreaterThan(.9);
    expect(result.after.timestamp - result.before.timestamp).toBeLessThan(1.1);
    expect(result.later.timestamp - result.after.timestamp).toBeGreaterThan(28000);
    expect(result.later.timestamp - result.after.timestamp).toBeLessThan(32000);
    expect(result.fresh.timestamp).toBe(result.later.timestamp);
    expect(result.fresh.celestial).toEqual(result.later.celestial);
    expect(result.paused.updates).toBe(result.fresh.updates);
    expect(result.paused.timestamp).toBe(result.fresh.timestamp);
    expect(result.resumed.timestamp - result.paused.timestamp).toBeGreaterThan(110000);
    expect(result.refreshed.timestamp).toBe(result.resumed.timestamp);
    expect(result.refreshed.weather).toEqual(result.resumed.weather);
    expect(result.refreshed.vessels).toEqual(result.resumed.vessels);
  } finally { await context.close(); }
});
