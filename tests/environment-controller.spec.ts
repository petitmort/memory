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
      onSound(frame: any) { host.__soundFrame = frame; },
      onCoastFrame(_water: any, _weather: any, _low: any, _reduced: any, _day: any, _active: any, at: number) { host.__coastTime = at; },
    });
    let controller = create();
    host.__adapter = {
      step(wallDelta = 0, perfDelta = wallDelta) {
        clocks.wall += wallDelta; clocks.perf += perfDelta;
        controller.update(20, false, host.__adapter.reduced !== false, true);
        return controller.snapshot();
      },
      patch(id: string, value: string) {
        const input = document.getElementById(id) as HTMLInputElement;
        input.value = value; input.dispatchEvent(new Event('change'));
      },
      refresh() { controller.dispose(); controller = create(); return this.step(); },
      pause() { controller.pause(); }, resume() { controller.resume(); },
      setTimeFlow(patch: any) { controller.setTimeFlow(patch); return this.step(); },
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

test('free time advances astronomy but keeps vessels on their natural schedule and resumes without replaying background frames', async ({ page }) => {
  await controllerPage(page, '?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T12:00&envWeather=clear&envDensity=3&envRoute=left-to-right&envVessel=motor-yacht', Date.UTC(2026, 9, 31, 10));
  const result = await page.evaluate(() => {
    const adapter = (window as any).__adapter;
    const before = adapter.step(), free = adapter.setTimeFlow({ mode: 'free', speed: 3600 });
    const after = adapter.step(1000);
    const stopped = adapter.setTimeFlow({ speed: 0 }), waiting = adapter.step(5000);
    adapter.setTimeFlow({ speed: 60 }); const reading = adapter.step();
    adapter.pause(); const paused = adapter.step(120000); adapter.resume(); const resumed = adapter.step();
    adapter.setTimeFlow({ speed: 0 }); adapter.patch('env-date', '2026-11-01T22:00'); const seek = adapter.step();
    const real = adapter.setTimeFlow({ mode: 'realtime' }); adapter.dispose();
    return { before, free, after, stopped, waiting, reading, paused, resumed, seek, real };
  });
  expect(result.free.timestamp).toBe(result.before.timestamp);
  expect(result.after.timestamp - result.free.timestamp).toBe(3600000);
  expect(result.after.motionTimestamp - result.free.motionTimestamp).toBe(1000);
  expect(result.after.vessels.length).toBeGreaterThan(0);
  for (const vessel of result.after.vessels) {
    const earlier = result.free.vessels.find((value: typeof vessel) => value.id === vessel.id);
    if (!earlier) continue;
    const distance = Math.hypot(vessel.position[0] - earlier.position[0], vessel.position[2] - earlier.position[2]);
    expect(distance).toBeLessThan(2);
  }
  expect(result.waiting.timestamp).toBe(result.stopped.timestamp);
  expect(result.waiting.motionTimestamp - result.stopped.motionTimestamp).toBe(5000);
  expect(result.paused.updates).toBe(result.reading.updates);
  expect(result.resumed.timestamp - result.reading.timestamp).toBe(120000 * 60);
  expect(result.resumed.updates).toBe(result.reading.updates + 1);
  expect(new Date(result.seek.timestamp).toISOString()).toBe('2026-11-01T20:00:00.000Z');
  expect(result.real.timestamp).toBe(result.seek.timestamp);
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

test('free calendars keep lightning preview, audio and coast on real seconds and the debug reset restores realtime', async ({ page }) => {
  await controllerPage(page, '?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T22:00&envWeather=thunderstorm', Date.UTC(2026, 9, 31, 20));
  const result = await page.evaluate(() => {
    const host = window as any, adapter = host.__adapter;
    adapter.reduced = false; adapter.step(1000);
    const before = adapter.setTimeFlow({ mode: 'free', speed: 3600 });
    document.getElementById('env-preview-lightning')!.click();
    const soon = adapter.step(1000), strike = adapter.step(6000);
    const sound = host.__soundFrame, coastTime = host.__coastTime;
    (document.querySelector('.environment-debug-reset') as HTMLButtonElement).click(); const reset = adapter.step();
    adapter.dispose(); return { before, soon, strike, sound, coastTime, reset };
  });
  expect(result.strike.timestamp - result.before.timestamp).toBe(7000 * 3600);
  expect(result.soon.storm.eventId?.startsWith('preview:')).toBeFalsy();
  expect(result.strike.storm.eventId?.startsWith('preview:')).toBe(true);
  expect(result.sound.timestamp).toBe(result.strike.motionTimestamp);
  expect(result.coastTime).toBe(result.strike.motionTimestamp);
  expect(result.sound.storm.strikeTime).toBe(result.before.motionTimestamp + 7000);
  expect(result.reset.timeFlow.mode).toBe('realtime');
});

test('saved free time reconstructs the same natural vessel journeys after refreshing', async ({ browser }) => {
  const context = await browser.newContext({ timezoneId: 'Europe/Athens' });
  const page = await context.newPage();
  try {
    await controllerPage(page, '', Date.UTC(2026, 6, 12, 10, 3));
    const result = await page.evaluate(() => {
      const adapter = (window as any).__adapter;
      adapter.setTimeFlow({ mode: 'free', speed: 3600 });
      const before = adapter.step(60000), fresh = adapter.refresh();
      // Wave height/heel and fading legitimately react to the current weather;
      // voyage identity, path and progress must reconstruct independently.
      const journeys = (frame: any) => frame.vessels.map((vessel: any) => ({
        id: vessel.id, kind: vessel.kind, route: vessel.route,
        x: vessel.position[0], z: vessel.position[2], yaw: vessel.yaw,
      })).sort((a: any, b: any) => a.id - b.id);
      adapter.dispose();
      return { before: journeys(before), fresh: journeys(fresh),
        calendar: before.timestamp, freshCalendar: fresh.timestamp,
        motion: before.motionTimestamp };
    });
    expect(result.calendar - result.motion).toBeGreaterThan(2 * 86400000);
    expect(result.before.length).toBeGreaterThan(0);
    expect(result.freshCalendar).toBe(result.calendar);
    expect(result.fresh).toEqual(result.before);
  } finally { await context.close(); }
});
