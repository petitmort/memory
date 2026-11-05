import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { createTimeFlowClock, loadTimeFlow, normalizeTimeFlow, saveTimeFlow, TIME_FLOW_STORAGE_KEY, MAX_CALENDAR_TIME } from '../src/environment-time';
import { nightSkyFrame, equatorialFrame } from '../src/night-sky';
import { mockExperienceScene, enterFixtureRoom, openFixtureBook, closeFixtureBook } from './helpers/experience-scene';

const start = Date.UTC(2026, 9, 31, 18);
test('free calendar rates, pause and realtime switching share continuous anchors while motion remains at one-times speed', () => {
  const clock = createTimeFlowClock(start, 1000);
  expect(clock.sample(start, 1000)).toMatchObject({ mode: 'realtime', speed: 60, timestamp: start });
  clock.set({ mode: 'free' }, start, 1000);
  const minute = clock.sample(start + 1000, 2000);
  expect(minute.timestamp).toBe(start + 60000); expect(minute.motionTimestamp).toBe(start + 1000);
  expect(clock.set({ speed: 3600 }, start + 1000, 2000).timestamp).toBe(minute.timestamp);
  const hour = clock.sample(start + 2000, 3000); expect(hour.timestamp).toBe(start + 3660000);
  expect(clock.set({ speed: 0 }, start + 2000, 3000).timestamp).toBe(hour.timestamp);
  expect(clock.sample(start + 86400000, 86401000)).toMatchObject({ timestamp: hour.timestamp, motionTimestamp: start + 86400000 });
  expect(clock.set({ mode: 'realtime' }, start + 86400000, 86401000).timestamp).toBe(start + 86400000);
  expect(clock.set({ mode: 'free', speed: .5 }, start + 86400000, 86401000).timestamp).toBe(start + 86400000);
  expect(clock.sample(start + 86402000, 86403000).timestamp).toBe(start + 86401000);
});

test('saved anchors restore elapsed background or reload time, zero stays fixed and supported calendar bounds do not wrap', () => {
  const clock = createTimeFlowClock(start, 1000); clock.set({ mode: 'free', speed: 300 }, start, 1000);
  expect(createTimeFlowClock(start + 120000, 121000, clock.saved()).sample(start + 120000, 121000).timestamp).toBe(start + 36000000);
  clock.set({ speed: 0 }, start, 2000);
  const saved = clock.saved(); expect(createTimeFlowClock(start, 1e10, saved).sample(start, 1e10).timestamp).toBe(saved.calendar);
  clock.seek(MAX_CALENDAR_TIME - 1000, 3000); clock.set({ speed: 3600 }, start, 3000);
  expect(clock.sample(start + 1000, 4000)).toMatchObject({ timestamp: MAX_CALENDAR_TIME, limited: true });
  expect(normalizeTimeFlow({ mode: 'broken', speed: Infinity })).toEqual({ mode: 'realtime', speed: 60 });
  expect(normalizeTimeFlow({ mode: 'free', speed: -10 })).toEqual({ mode: 'free', speed: 0 });
  expect(normalizeTimeFlow({ speed: 90000 }).speed).toBe(3600);
});

test('malformed or blocked storage cannot create a free clock with poisoned anchors', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), values = new Map<string, string>();
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) } });
    for (const value of ['null', 'broken', '"text"', JSON.stringify({ mode: 'free', speed: 60, calendar: null, wall: 0 })]) {
      values.set(TIME_FLOW_STORAGE_KEY, value); expect(loadTimeFlow()).toBeUndefined();
    }
    const saved = { mode: 'free' as const, speed: 60, calendar: start, wall: 1000 };
    saveTimeFlow(saved); expect(loadTimeFlow()).toEqual(saved);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
    expect(loadTimeFlow()).toBeUndefined(); expect(() => saveTimeFlow(saved)).not.toThrow();
  } finally { if (original) Object.defineProperty(globalThis, 'localStorage', original); else delete (globalThis as any).localStorage; }
});

test('free calendar astronomy does not multiply the additional 24-minute stellar presentation phase', () => {
  const virtual = start + 3600000, motion = start + 1000;
  const frame = nightSkyFrame(virtual, undefined, undefined, false, motion);
  const sameMotion = nightSkyFrame(start, undefined, undefined, false, motion);
  const angle = (a: ArrayLike<number>, b: ArrayLike<number>) => Math.acos(Math.min(1, Math.max(-1, (Array.from(a).reduce((v, x, i) => v + x * b[i], 0) - 1) / 2)));
  expect(angle(frame, sameMotion) * 180 / Math.PI).toBeCloseTo(15.041, 2);
  expect(Array.from(nightSkyFrame(virtual, undefined, undefined, true, motion))).toEqual(Array.from(equatorialFrame(virtual)));
});

const evidence = process.env.TIME_FLOW_EVIDENCE ?? '/tmp/memory-time-flow';
async function instrument(page: Page) {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const host = window as any, now = Date.now; host.__timeOffset = 0;
    Date.now = () => now() + host.__timeOffset;
  });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text(), marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `window.__timeReview={
      snapshot(){return {environment:environment.snapshot(),clock:deskClock.snapshot(),clockVisible:deskClock.group.visible,
        memory:{...renderer.info.memory,programs:renderer.info.programs.length},seaTime:seaMat.uniforms.time.value};},
      clockPixels(){
        const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
        const a=new Uint8Array(w*h*4),b=new Uint8Array(a.length),visible=deskClock.group.visible;
        renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
        deskClock.group.visible=!visible;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
        deskClock.group.visible=visible;renderer.render(scene,camera);
        let changed=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>6)changed++;
        return changed;
      }
    };${marker}`) });
  });
  return errors;
}
const snapshot = (page: Page) => page.evaluate(() => (window as any).__timeReview.snapshot());
const drawn = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
async function enter(page: Page, query = '') {
  await page.goto('/' + query); await expect(page).toHaveTitle(/潮汐之间/);
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
  await page.locator('#enter').click(); await expect(page.locator('#enter')).toBeEnabled({ timeout: 45000 });
  await page.locator('#enter').click(); await expect(page.locator('#time-flow')).toBeEnabled({ timeout: 45000 });
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) test(`real room hides the clock, advances and pauses the free calendar and restores realtime without resource churn ${viewport.width}`, async ({ browser }) => {
  // This includes repeated GPU readbacks and the complete reading round trip.
  // Software WebGL needs a larger wall-clock budget than native desktop GPUs.
  test.setTimeout(240000); await mkdir(evidence, { recursive: true });
  const context = await browser.newContext({ viewport, reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' }), page = await context.newPage();
  const errors = await instrument(page);
  try {
    await enter(page, '?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T18:00&envWeather=few-clouds&envDensity=0&envBirdDensity=0');
    const initial = await snapshot(page); expect(initial.clockVisible).toBe(true);
    expect(await page.evaluate(() => (window as any).__timeReview.clockPixels())).toBeGreaterThan(50);
    await page.locator('#time-flow').click(); await expect(page.locator('#time-flow-realtime')).toBeChecked();
    await page.locator('#time-flow-free').check(); await expect(page.locator('#time-flow-speed-controls')).toBeVisible();
    expect((await snapshot(page)).clockVisible).toBe(false); await expect(page.locator('#desk-clock-status')).toBeEmpty();
    await expect(page.locator('#desk-clock-status')).toHaveAttribute('hidden', '');
    await page.locator('#time-flow-custom').fill('3600'); await page.locator('#time-flow-custom').press('Tab');
    await expect(page.locator('#time-flow-rate')).toHaveText('3600倍');
    await drawn(page);
    const running = await snapshot(page); await page.waitForTimeout(800); const later = await snapshot(page);
    const realDelta = later.environment.motionTimestamp - running.environment.motionTimestamp;
    expect((later.environment.timestamp - running.environment.timestamp) / realDelta).toBeCloseTo(3600, 0);
    expect(later.environment.celestial.sun.direction).not.toEqual(running.environment.celestial.sun.direction);
    await page.locator('#time-flow-speed').fill('0'); await expect(page.locator('#time-flow-rate')).toHaveText('已暂停');
    await drawn(page);
    const stopped = await snapshot(page); await page.waitForTimeout(350); expect((await snapshot(page)).environment.timestamp).toBe(stopped.environment.timestamp);
    await page.screenshot({ path: `${evidence}/free-${viewport.width}.png` });
    await page.locator('#time-flow-speed').fill('3'); await drawn(page);
    await page.locator('#open-book').click(); await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 45000 });
    await expect(page.locator('#time-flow-panel')).toBeHidden(); const reading = await snapshot(page);
    await page.waitForTimeout(300); expect((await snapshot(page)).environment.updates).toBe(reading.environment.updates);
    await page.locator('#close-book').click(); await expect(page.locator('#time-flow')).toBeEnabled({ timeout: 45000 });
    const returned = await snapshot(page); expect(returned.clockVisible).toBe(false);
    expect(returned.environment.timestamp).toBeGreaterThan(reading.environment.timestamp);
    if (viewport.width === 1280) {
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
      const hidden = await snapshot(page); await page.waitForTimeout(200);
      expect((await snapshot(page)).environment.updates).toBe(hidden.environment.updates);
      await page.evaluate(() => { (window as any).__timeOffset += 120000; delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
      await expect.poll(async () => (await snapshot(page)).environment.paused).toBe(false);
      await expect.poll(async () => (await snapshot(page)).environment.timestamp - hidden.environment.timestamp).toBeGreaterThan(120000 * 59);
      expect((await snapshot(page)).clockVisible).toBe(false);
    }
    await page.locator('#time-flow').click(); await page.locator('#time-flow-realtime').check();
    await expect.poll(async () => (await snapshot(page)).clockVisible).toBe(true);
    await expect(page.locator('#desk-clock-status')).not.toBeEmpty(); await expect(page.locator('#desk-clock-status')).not.toHaveAttribute('hidden', '');
    await page.keyboard.press('Escape'); await expect(page.locator('#time-flow')).toBeFocused();
    const restored = await snapshot(page); expect(restored.memory).toEqual(initial.memory);
    expect(restored.environment.timeFlow.mode).toBe('realtime');
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    expect(errors).toEqual([]); await expect(page.locator('.vite-error-overlay')).toHaveCount(0);
    await expect(page.locator('#fallback')).toBeHidden();
  } finally { await context.close(); }
});

test('normal visitor preferences survive refresh, debug sessions remain isolated, and renderer failure closes the time panel', async ({ page }) => {
  test.setTimeout(120000); await instrument(page); await enter(page);
  await page.locator('#time-flow').click(); await page.locator('#time-flow-free').check();
  await page.locator('#time-flow-custom').fill('12.5'); await page.locator('#time-flow-custom').press('Tab');
  const saved = await page.evaluate(key => localStorage.getItem(key), TIME_FLOW_STORAGE_KEY);
  const before = await snapshot(page); await page.reload(); await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
  const restored = await snapshot(page); expect(restored.environment.timeFlow).toMatchObject({ mode: 'free', speed: 12.5 });
  expect(restored.environment.timeFlow.timestamp).toBeGreaterThan(before.environment.timestamp);
  await enter(page, '?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T22:00');
  await page.locator('#time-flow').click(); await expect(page.locator('#time-flow-realtime')).toBeChecked();
  await page.locator('#time-flow-free').check(); await page.locator('#time-flow-speed').fill('6');
  expect(await page.evaluate(key => localStorage.getItem(key), TIME_FLOW_STORAGE_KEY)).toBe(saved);
  await page.locator('.environment-debug > summary').click(); await page.locator('.environment-debug-reset').click();
  await expect.poll(async () => (await snapshot(page)).clockVisible).toBe(true);
  await expect(page.locator('#desk-clock-status')).not.toBeEmpty();
  await page.locator('#time-flow').click();
  await page.evaluate(() => (document.querySelector('#world canvas') as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.locator('#fallback')).toBeVisible(); await expect(page.locator('#time-flow-panel')).toBeHidden();
});

for (const viewport of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) test(`keyboard, touch targets and blocked storage keep time controls available across reading and failure ${viewport.width}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.addInitScript(() => { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } }); });
  await mockExperienceScene(page); await page.goto('/'); await enterFixtureRoom(page);
  await page.locator('#time-flow').click(); await page.locator('#time-flow-free').check();
  await page.locator('#time-flow-custom').fill('7.5'); await page.locator('#time-flow-custom').press('Tab');
  await expect(page.locator('#time-flow-rate')).toHaveText('7.5倍');
  for (const id of ['time-flow', 'time-flow-close', 'time-flow-speed', 'time-flow-custom']) {
    const box = await page.locator('#' + id).boundingBox(); expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  }
  const panel = await page.locator('#time-flow-panel').boundingBox(), room = await page.locator('#room-ui').boundingBox();
  expect(panel!.x < room!.x + room!.width && panel!.x + panel!.width > room!.x
    && panel!.y < room!.y + room!.height && panel!.y + panel!.height > room!.y).toBe(false);
  await page.keyboard.press('Escape'); await expect(page.locator('#time-flow')).toBeFocused();
  await openFixtureBook(page); await expect(page.locator('#time-flow-panel')).toBeHidden();
  await closeFixtureBook(page); await page.locator('#time-flow').click();
  await page.evaluate(() => (window as any).__experience.fail());
  await expect(page.locator('#fallback')).toBeVisible(); await expect(page.locator('#time-flow-panel')).toBeHidden();
});
