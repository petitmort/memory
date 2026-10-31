import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { timestampFromZonedInput } from '../src/calendar-seed';
import { createVesselJourney, sampleVesselJourney, vesselKinds, vesselRoutes } from '../src/vessel-navigation';
import { sampleWaterHeight } from '../src/water-surface';

type Snapshot = {
  timestamp: number;
  celestial: { sun: { altitude: number }; moonPhase: number; moonIllumination: number; daylight: number; night: number };
  weather: { kind: string; simulated: boolean; precipitation: number; snow: number; waveScale: number };
  vessels: { id: number; kind: typeof vesselKinds[number]; route: typeof vesselRoutes[number]; position: number[]; yaw: number; opacity: number }[];
  low: boolean; updates: number; paused: boolean; waterTime: number;
};

/** Probes live only in the intercepted Vite module; production has no test global. */
async function observeEnvironment(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text();
    const marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      window.__environment = () => ({ ...environment.snapshot(), waterTime: seaMat.uniforms.time.value });
      window.__environmentPixels = () => {
        renderer.render(scene, camera);
        const gl = renderer.getContext(), pixel = new Uint8Array(4), colors = new Set();
        let light = 0;
        for (let y = 1; y <= 8; y++) for (let x = 1; x <= 8; x++) {
          gl.readPixels(Math.floor(gl.drawingBufferWidth * x / 9), Math.floor(gl.drawingBufferHeight * y / 9), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
          colors.add(pixel[0] + ':' + pixel[1] + ':' + pixel[2]);
          light += pixel[0] + pixel[1] + pixel[2];
        }
        return { colors: colors.size, light };
      };
      ${marker}
    `) });
  });
  return errors;
}

const snapshot = (page: Page) => page.evaluate(() => (window as any).__environment()) as Promise<Snapshot>;

async function enterRoom(page: Page, url: string) {
  await page.goto(url);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
  await page.locator('#enter').click();
  await expect(page.locator('#enter')).toHaveText('推开这扇门', { timeout: 45000 });
  await page.locator('#enter').click();
  await expect(page.locator('#room-ui')).toBeVisible({ timeout: 45000 });
  await expect.poll(async () => (await snapshot(page)).updates).toBeGreaterThan(0);
}

async function setSceneDate(page: Page, date: string) {
  const expected = timestampFromZonedInput(date, 'Europe/Athens');
  await page.locator('#env-date').fill(date);
  await page.locator('#env-date').dispatchEvent('change');
  await expect.poll(async () => Math.abs((await snapshot(page)).timestamp - expected)).toBeLessThan(15000);
}

async function assertRendered(page: Page) {
  await expect(page.locator('#world canvas')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  const pixels = await page.evaluate(() => (window as any).__environmentPixels());
  expect(pixels.colors).toBeGreaterThan(8);
  expect(pixels.light).toBeGreaterThan(100);
}

test('the real room renders four calendar environments, six navigation directions and nonpersistent debug controls', async ({ browser }) => {
  test.setTimeout(300000);
  const context = await browser.newContext({ viewport: { width: 1000, height: 740 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = await observeEnvironment(page);
  try {
    await enterRoom(page, '/?debugEnv=1&envTimeMode=scene&envDate=2026-06-21T12:00&envWeather=clear&envDensity=2&envVessel=wood-sail&envRoute=left-to-right');
    await page.locator('.environment-debug summary').click();
    await expect(page.locator('.environment-debug-note')).toContainText('模拟天气');

    const conditions = [
      { date: '2026-06-21T12:00', kind: 'clear', sun: 'day', image: 'sunny-noon' },
      { date: '2026-10-01T18:45', kind: 'heavy-rain', sun: 'dusk', image: 'rainy-dusk' },
      { date: '2026-01-15T12:00', kind: 'snow', sun: 'day', image: 'snowy-noon' },
      { date: '2026-06-21T23:30', kind: 'clear', sun: 'night', image: 'full-moon-night' },
    ];
    for (const condition of conditions) {
      await setSceneDate(page, condition.date);
      await page.locator('#env-weather').selectOption(condition.kind);
      if (condition.sun === 'night') await page.locator('#env-phase').selectOption('0.5');
      await expect.poll(async () => (await snapshot(page)).weather.kind).toBe(condition.kind);
      const state = await snapshot(page);
      expect(state.weather.simulated).toBe(true);
      if (condition.sun === 'day') expect(state.celestial.sun.altitude).toBeGreaterThan(.2);
      if (condition.sun === 'dusk') expect(Math.abs(state.celestial.sun.altitude)).toBeLessThan(.2);
      if (condition.sun === 'night') {
        expect(state.celestial.sun.altitude).toBeLessThan(-.2);
        expect(state.celestial.moonIllumination).toBeCloseTo(1, 3);
      }
      await expect(page.locator('.environment-debug-status')).toContainText('模拟天气');
      await assertRendered(page);
      if (process.env.ENVIRONMENT_SCREENSHOT_DIR) {
        await mkdir(process.env.ENVIRONMENT_SCREENSHOT_DIR, { recursive: true });
        await page.locator('.environment-debug summary').click();
        // Weather labels switch halfway through the six-second blend. Give
        // the optional visual review the finished environment, not its midpoint.
        await page.waitForTimeout(3200);
        await page.screenshot({ path: join(process.env.ENVIRONMENT_SCREENSHOT_DIR, `${condition.image}.png`) });
        await page.locator('.environment-debug summary').click();
      }
    }

    await setSceneDate(page, '2026-06-21T12:00');
    await page.locator('#env-phase').selectOption('');
    await page.locator('#env-weather').selectOption('clear');
    await page.locator('#env-paths').check();
    for (const [index, route] of vesselRoutes.entries()) {
      const kind = vesselKinds[index];
      await page.locator('#env-vessel').selectOption(kind);
      await page.locator('#env-route').selectOption(route);
      await expect.poll(async () => {
        const boats = (await snapshot(page)).vessels;
        return boats.length > 0 && boats.every(boat => boat.route === route && boat.kind === kind);
      }, { timeout: 15000 }).toBe(true);
      const state = await snapshot(page);
      expect(state.vessels.length).toBeLessThanOrEqual(5);
      for (const boat of state.vessels) {
        expect(boat.position.every(Number.isFinite)).toBe(true);
        const waterline = -8 + sampleWaterHeight(boat.position[0], boat.position[2], state.waterTime) * state.weather.waveScale - .09;
        expect(boat.position[1]).toBeCloseTo(waterline, 5);
        expect(boat.position[2]).toBeLessThan(-20);
        const expected = sampleVesselJourney(createVesselJourney(boat.id, { forcedKind: kind, forcedRoute: route }), state.timestamp);
        expect(boat.position[0]).toBeCloseTo(expected.x, 2); expect(boat.position[2]).toBeCloseTo(expected.z, 2);
        expect(boat.yaw).toBeCloseTo(expected.yaw, 5);
      }
    }
    await page.locator('#env-quality').selectOption('low');
    await expect.poll(async () => (await snapshot(page)).low).toBe(true);
    await expect.poll(async () => (await snapshot(page)).vessels.length).toBeLessThanOrEqual(3);
    await page.locator('.environment-debug-reset').click();
    await expect(page.locator('#env-weather')).toHaveValue('');
    await expect(page.locator('#env-phase')).toHaveValue('');
    await expect(page.locator('#env-route')).toHaveValue('');
    await expect(page.locator('#env-quality')).toHaveValue('auto');
    await expect(page.locator('#env-paths')).not.toBeChecked();
    await expect.poll(async () => Math.abs((await snapshot(page)).timestamp - Date.now())).toBeLessThan(48 * 3600000);
    const persisted = await page.evaluate(() => {
      const all: Record<string, string | null> = {};
      for (const storage of [localStorage, sessionStorage]) for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)!; if (/env|weather|vessel|moon/i.test(key)) all[key] = storage.getItem(key);
      }
      return all;
    });
    expect(persisted).toEqual({});
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('reading and background pauses stop environment work and resume the present absolute world', async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 1000, height: 740 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = await observeEnvironment(page);
  try {
    await enterRoom(page, '/?debugEnv=1&envTimeMode=scene&envWeather=clear');
    await page.locator('#open-book').click();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 60000 });
    await expect(page.locator('.environment-debug')).toBeHidden();
    await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
    const reading = await snapshot(page);
    await page.waitForTimeout(500);
    expect((await snapshot(page)).updates).toBe(reading.updates);
    await page.locator('#next').click();
    await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    await page.locator('#close-book').click();
    await expect(page.locator('#room-ui')).toBeVisible({ timeout: 45000 });
    await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
    await expect.poll(async () => (await snapshot(page)).updates).toBeGreaterThan(reading.updates);

    const before = await snapshot(page);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
    const hidden = await snapshot(page);
    await page.waitForTimeout(500);
    expect((await snapshot(page)).updates).toBe(hidden.updates);
    // Advance the wall clock while sleeping. No scene timer or accumulated
    // animation delta may force the old voyage to replay on return.
    await page.evaluate(() => {
      const original = Date.now;
      (window as any).__restoreEnvironmentClock = () => { Date.now = original; };
      Date.now = () => original() + 120000;
      delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
    await expect.poll(async () => (await snapshot(page)).timestamp - before.timestamp).toBeGreaterThan(115000);
    await page.evaluate(() => (window as any).__restoreEnvironmentClock());
    await expect.poll(async () => Math.abs((await snapshot(page)).timestamp - Date.now())).toBeLessThan(5000);
    await assertRendered(page);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('ordinary visitors ignore preview overrides and retain responsive room and WebGL fallback reading', async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 1000, height: 740 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = await observeEnvironment(page);
  try {
    await enterRoom(page, '/?envDate=2001-01-01T00:00&envWeather=snow&envPhase=0.5&envPaths=1&envQuality=low');
    await expect(page.locator('.environment-debug')).toHaveCount(0);
    expect(Math.abs((await snapshot(page)).timestamp - Date.now())).toBeLessThan(48 * 3600000);
    for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(size);
      await assertRendered(page);
      await expect(page.locator('#open-book')).toBeVisible();
    }
    await page.evaluate(() => document.querySelector('#world canvas')!.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    await expect(page.locator('#fallback')).toBeVisible();
    await page.locator('#fallback-read').click();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 15000 });
    await expect(page.locator('#chapter-title')).toHaveText('风经过的地方');
    await page.locator('#next').click();
    await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
