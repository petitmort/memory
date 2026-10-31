import { test, expect, type Page } from '@playwright/test';

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

test('the adapter blends automatic weather for six seconds after a date jump and starts a new blend from the current display', async ({ page }) => {
  await controllerPage(page, '?debugEnv=1&envTimeMode=scene&envDate=2026-01-06T12:00', Date.UTC(2026, 0, 6, 10));
  const result = await page.evaluate(() => {
    const adapter = (window as any).__adapter;
    const before = adapter.step();
    adapter.patch('env-date', '2026-04-23T12:00');
    const first = adapter.step();
    const middle = adapter.step(3000);
    // Change the target while a blend is still running: preserve its visible start.
    adapter.patch('env-date', '2026-01-06T12:00');
    const interrupted = adapter.step();
    const back = adapter.step(6000);
    adapter.patch('env-date', '2026-04-23T12:00');
    const second = adapter.step();
    const after = adapter.step(6000);
    adapter.dispose();
    return { before, first, middle, interrupted, back, second, after };
  });
  expect(result.before.weather.kind).toBe('clear');
  expect(result.after.weather.kind).toBe('heavy-rain');
  expect(result.first.weather).toEqual(result.before.weather);
  expect(result.interrupted.weather).toEqual(result.middle.weather);
  expect(result.second.weather.precipitation).toBe(0);
  expect(result.first.timestamp - result.before.timestamp).toBeGreaterThan(90 * 86400000);
  expect(result.middle.weather.precipitation).toBeCloseTo(result.after.weather.precipitation / 2, 3);
  expect(result.back.weather.precipitation).toBe(0);
  expect(result.after.weather.precipitation).toBe(1);
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
