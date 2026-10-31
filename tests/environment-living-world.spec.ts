import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import * as THREE from 'three';
import { calendarAt } from '../src/calendar-seed';
import { BIRD_DEPARTURE_INTERVAL, BIRD_KINDS, createBirdJourney, getBirdSchedule, sampleBirdFlight, type BirdKind } from '../src/bird-controller';
import { STORM_SLOT_MS, stormEventForSlot } from '../src/storm-controller';

const evidence = process.env.LIVING_ENV_EVIDENCE ?? '/tmp/memory-living-weather-qa';
type LivingSnapshot = {
  timestamp: number; updates: number; paused: boolean; low: boolean;
  weather: { kind: string; precipitation: number; snow: number; windSpeed: number };
  birds: { id: number; kind: BirdKind; member: number; position: number[]; opacity: number }[];
  storm: { flash: number; bolt: boolean; eventId: string | null; strikeTime: number; thunderTime: number; energy: number };
  birdProjection: { id: number; kind: BirdKind; throughWindow: boolean; x: number; y: number; opacity: number }[];
  resources: { geometries: number; textures: number; programs: number };
  counters: { buffers: number; shaders: number; draws: number };
  ocean: { rainAmount: number; rainDetail: number; waveScale: number };
  precipitation: { count: number; maxZ: number };
};

const snapshot = (page: Page) => page.evaluate(() => (window as any).__livingEnvironment.snapshot()) as Promise<LivingSnapshot>;

function localDate(timestamp: number) {
  const date = calendarAt(timestamp, 'Europe/Athens'), seconds = date.secondsOfDay;
  const pad = (value: number, width = 2) => String(Math.floor(value)).padStart(width, '0');
  return `${date.dayKey}T${pad(seconds / 3600)}:${pad(seconds / 60 % 60)}:${pad(seconds % 60)}.${pad(timestamp % 1000, 3)}`;
}

/** Pick visible absolute visits, without adding a force-birds production path. */
function visibleVisit(kind: BirdKind, mobile = false) {
  const camera = new THREE.PerspectiveCamera(50, mobile ? 390 / 844 : 1000 / 740, .1, 500);
  camera.position.set(mobile ? .55 : 1.1, 1.65, mobile ? 1.15 : .75);
  camera.lookAt(mobile ? .15 : -.2, mobile ? 1.05 : .95, mobile ? -1.4 : -1.5);
  camera.updateMatrixWorld(true);
  const beginning = Math.floor(Date.parse('2026-06-21T08:00:00Z') / BIRD_DEPARTURE_INTERVAL);
  for (let slot = beginning; slot < beginning + 80; slot++) {
    const journey = createBirdJourney(slot);
    if (journey.kind !== kind || !getBirdSchedule(journey.startMs + 1).some(value => value.id === journey.id)) continue;
    const hour = calendarAt(journey.startMs).secondsOfDay / 3600;
    if (hour < 9 || hour > 18) continue;
    for (const progress of [.32, .4, .48, .56, .64]) {
      const timestamp = journey.startMs + journey.durationMs * progress;
      const point = sampleBirdFlight(journey, timestamp), ratio = (-2.7 - camera.position.z) / (point.z - camera.position.z);
      const x = camera.position.x + (point.x - camera.position.x) * ratio;
      const y = camera.position.y + (point.y - camera.position.y) * ratio;
      const screen = new THREE.Vector3(point.x, point.y, point.z).project(camera);
      if (Math.abs(x) < 1.35 && y > .95 && y < 2.35 && Math.abs(screen.x) < .88 && Math.abs(screen.y) < .88)
        return { journey, timestamp };
    }
  }
  throw new Error(`No visible ${kind} visit in the daytime sample`);
}

const desktopVisits = Object.fromEntries(BIRD_KINDS.map(kind => [kind, visibleVisit(kind)])) as Record<BirdKind, ReturnType<typeof visibleVisit>>;

async function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const counters = (window as any).__livingCounters = { buffers: 0, shaders: 0, draws: 0 };
    const bufferData = WebGL2RenderingContext.prototype.bufferData;
    WebGL2RenderingContext.prototype.bufferData = function (...args: unknown[]) {
      counters.buffers++; return bufferData.apply(this, args as never);
    };
    const compileShader = WebGL2RenderingContext.prototype.compileShader;
    WebGL2RenderingContext.prototype.compileShader = function (shader) {
      counters.shaders++; return compileShader.call(this, shader);
    };
  });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text();
    const marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    const probe = `
      window.__livingEnvironment = {
        project(position) {
          camera.updateMatrixWorld(true);
          const point=new THREE.Vector3(...position), projected=point.clone().project(camera);
          const ratio=(-2.7-camera.position.z)/(point.z-camera.position.z);
          const x=camera.position.x+(point.x-camera.position.x)*ratio;
          const y=camera.position.y+(point.y-camera.position.y)*ratio;
          return {x:projected.x,y:projected.y,throughWindow:ratio>0&&ratio<1&&Math.abs(x)<1.5&&y>.85&&y<2.45&&Math.abs(projected.x)<1&&Math.abs(projected.y)<1};
        },
        snapshot() {
          const state=environment.snapshot(),rain=scene.getObjectByName('outdoor-rain');
          const positions=rain.geometry.getAttribute('position'),count=rain.geometry.drawRange.count;
          let maxZ=-Infinity;
          for(let index=0;index<count;index++)maxZ=Math.max(maxZ,positions.getZ(index));
          return {...state,
            birdProjection:state.birds.map(bird=>({...this.project(bird.position),id:bird.id,kind:bird.kind,opacity:bird.opacity})),
            resources:{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,programs:renderer.info.programs.length},
            counters:{...window.__livingCounters},
            ocean:{rainAmount:seaMat.uniforms.rainAmount.value,rainDetail:seaMat.uniforms.rainDetail.value,waveScale:seaMat.uniforms.waveScale.value},
            precipitation:{count,maxZ},
          };
        },
        compareRender(change,restore) {
          const gl=renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
          const before=new Uint8Array(width*height*4),after=new Uint8Array(before.length);
          renderer.render(scene,camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,before);
          const beforeCalls=renderer.info.render.calls;
          change();renderer.render(scene,camera);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,after);
          const drawCallDifference=beforeCalls-renderer.info.render.calls;
          restore();renderer.render(scene,camera);
          let changedPixels=0,totalDifference=0;
          for(let index=0;index<before.length;index+=4){
            const difference=Math.abs(before[index]-after[index])+Math.abs(before[index+1]-after[index+1])+Math.abs(before[index+2]-after[index+2]);
            if(difference>2)changedPixels++;totalDifference+=difference;
          }
          return {changedPixels,totalDifference,drawCallDifference};
        },
        birdPixels() {
          const mesh=scene.getObjectByName('pooled-coastal-birds'),visible=mesh.visible;
          return this.compareRender(()=>{mesh.visible=false;},()=>{mesh.visible=visible;});
        },
        rainPixels() {
          const detail=seaMat.uniforms.rainDetail.value;
          return this.compareRender(()=>{seaMat.uniforms.rainDetail.value=0;},()=>{seaMat.uniforms.rainDetail.value=detail;});
        },
      };
    `;
    const instrumented = source.replace(marker, probe + marker).replaceAll('renderer.render(scene, camera);', 'renderer.render(scene, camera); window.__livingCounters.draws++;');
    await route.fulfill({ response, body: instrumented });
  });
  return errors;
}

async function enter(page: Page, query: string) {
  await page.goto(`/?debugEnv=1&envTimeMode=scene&envQuality=normal&${query}`);
  await page.waitForFunction(() => typeof (window as any).__livingEnvironment?.snapshot === 'function', undefined, { timeout: 90_000 });
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90_000 });
  const loaded = await snapshot(page);
  await page.locator('#enter').click();
  await expect(page.locator('#enter')).toHaveText('推开这扇门', { timeout: 45_000 });
  await page.locator('#enter').click();
  await expect(page.locator('#open-book')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('#open-book')).toBeEnabled({ timeout: 45_000 });
  return loaded;
}

async function panel(page: Page, open: boolean) {
  if (await page.locator('.environment-debug').evaluate(element => (element as HTMLDetailsElement).open) !== open)
    await page.locator('.environment-debug summary').click();
}

async function seek(page: Page, timestamp: number) {
  await panel(page, true);
  await page.locator('#env-date').fill(localDate(timestamp));
  await page.locator('#env-date').dispatchEvent('change');
  await expect.poll(async () => Math.abs((await snapshot(page)).timestamp - timestamp), { timeout: 5000, intervals: [16, 32, 50] }).toBeLessThan(1500);
}

async function image(page: Page, name: string) {
  await panel(page, false); await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `${name}.png`) });
}

test('the live desktop world renders storms, sea rain impacts and all bird species with stable prewarmed resources', async ({ browser }) => {
  test.setTimeout(180_000);
  const context = await browser.newContext({ viewport: { width: 1000, height: 740 }, reducedMotion: 'no-preference' });
  const page = await context.newPage(), errors = await observe(page);
  try {
    const loaded = await enter(page, 'envDate=2026-10-01T18:45&envWeather=heavy-rain');
    const entered = await snapshot(page);
    expect(entered.counters.shaders).toBe(loaded.counters.shaders);
    expect(entered.counters.buffers).toBe(loaded.counters.buffers);
    expect(entered.ocean.rainAmount).toBeCloseTo(1, 4);
    expect(entered.precipitation.count).toBeGreaterThan(100);
    expect(entered.precipitation.maxZ).toBeLessThanOrEqual(-8.19);
    expect(await page.title()).toContain('潮汐之间');
    await expect(page.locator('#fallback')).toBeHidden();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    const rainPixels = await page.evaluate(() => (window as any).__livingEnvironment.rainPixels());
    expect(rainPixels.changedPixels, 'Raindrop rings affect actual visible ocean pixels').toBeGreaterThan(0);
    await image(page, 'desktop-heavy-rain');

    const event = stormEventForSlot(Math.floor(entered.timestamp / STORM_SLOT_MS) + 1);
    await seek(page, event.strikeTime - 1200);
    await expect.poll(async () => (await snapshot(page)).storm.flash, { timeout: 5000, intervals: [16] }).toBeGreaterThan(.02);
    const flashing = await snapshot(page);
    expect(flashing.storm.eventId).toBe(event.eventId);
    expect(flashing.storm.thunderTime).toBeGreaterThan(flashing.storm.strikeTime);
    expect(flashing.storm.thunderTime - flashing.storm.strikeTime).toBeCloseTo(event.distance / 343 * 1000, 4);
    await image(page, 'desktop-offshore-storm');

    await panel(page, true);
    await page.locator('#env-weather').selectOption('clear');
    await expect.poll(async () => (await snapshot(page)).weather.precipitation, { timeout: 10_000 }).toBeLessThan(.001);
    await expect.poll(async () => (await snapshot(page)).weather.kind).toBe('clear');
    for (const kind of BIRD_KINDS) {
      const visit = desktopVisits[kind];
      await seek(page, visit.timestamp);
      await expect.poll(async () => (await snapshot(page)).birdProjection.some(bird => bird.id === visit.journey.id && bird.kind === kind && bird.throughWindow && bird.opacity > .1)).toBe(true);
      const first = await snapshot(page);
      expect(first.birds).toHaveLength(1);
      await page.waitForTimeout(350);
      const after = await snapshot(page), beforeBird = first.birds.find(bird => bird.id === visit.journey.id)!;
      const afterBird = after.birds.find(bird => bird.id === visit.journey.id && bird.member === beforeBird.member)!;
      expect(after.updates).toBeGreaterThan(first.updates);
      expect(Math.hypot(...afterBird.position.map((value, index) => value - beforeBird.position[index]))).toBeGreaterThan(.02);
      expect(afterBird.position[2]).toBeLessThan(-30);
      const pixels = await page.evaluate(() => (window as any).__livingEnvironment.birdPixels());
      expect(pixels.changedPixels, `${kind} must contribute visible pixels through the window`).toBeGreaterThan(0);
      expect(pixels.drawCallDifference, 'All visible birds share one rendered draw').toBe(1);
      await image(page, `desktop-${kind}`);
    }
    const birdsRendered = await snapshot(page);
    expect(birdsRendered.counters.shaders).toBe(loaded.counters.shaders);
    expect(birdsRendered.counters.buffers).toBe(loaded.counters.buffers);
    expect(birdsRendered.resources).toEqual(entered.resources);

    await seek(page, desktopVisits.gull.timestamp);
    await page.locator('#env-quality').selectOption('low');
    await expect.poll(async () => (await snapshot(page)).low).toBe(true);
    await expect.poll(async () => (await snapshot(page)).birds.length, { timeout: 10_000 }).toBeLessThanOrEqual(1);
    const low = await snapshot(page);
    await page.locator('#env-quality').selectOption('normal');
    await expect.poll(async () => (await snapshot(page)).low).toBe(false);
    await page.locator('#env-quality').selectOption('low');
    await expect.poll(async () => (await snapshot(page)).low).toBe(true);
    expect((await snapshot(page)).resources).toEqual(low.resources);
    await panel(page, false);
    await page.locator('#open-book').click();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 60_000 });
    await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
    await expect(page.locator('.environment-debug')).toBeHidden();
    const reading = await snapshot(page); await page.waitForTimeout(500);
    const stillReading = await snapshot(page);
    expect(stillReading.updates).toBe(reading.updates); expect(stillReading.counters.draws).toBe(reading.counters.draws);
    expect(stillReading.birds).toEqual(reading.birds);
    await page.locator('#next').click();
    await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    await page.locator('#close-book').click();
    await expect(page.locator('#open-book')).toBeVisible({ timeout: 45_000 });
    await expect.poll(async () => (await snapshot(page)).paused).toBe(false);
    await expect.poll(async () => (await snapshot(page)).updates).toBeGreaterThan(reading.updates);
    expect((await snapshot(page)).timestamp).toBeGreaterThan(reading.timestamp);
    await image(page, 'desktop-return-after-reading');
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('mobile rain remains outdoors, reduced motion suppresses flashes and low quality survives rotation and cat interaction', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = await observe(page);
  try {
    await enter(page, 'envDate=2026-10-01T18:45&envWeather=heavy-rain');
    await panel(page, true); await page.locator('#env-quality').selectOption('low');
    await expect.poll(async () => (await snapshot(page)).low).toBe(true);
    const event = stormEventForSlot(Math.floor((await snapshot(page)).timestamp / STORM_SLOT_MS) + 1);
    await seek(page, event.strikeTime + 100);
    const reduced = await snapshot(page);
    expect(reduced.storm.energy).toBeGreaterThan(0); expect(reduced.storm.flash).toBe(0); expect(reduced.storm.bolt).toBe(false);
    expect(reduced.ocean.rainAmount).toBeCloseTo(1, 4);
    expect(reduced.ocean.rainDetail).toBeGreaterThan(0); expect(reduced.ocean.rainDetail).toBeLessThanOrEqual(.35);
    expect(reduced.precipitation.count).toBeGreaterThan(0); expect(reduced.precipitation.maxZ).toBeLessThanOrEqual(-8.19);
    expect(reduced.birds).toHaveLength(0);
    await image(page, 'mobile-reduced-rain-low');
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('#world canvas')).toBeVisible();
    await expect(page.locator('#open-book')).toBeVisible();
    await image(page, 'mobile-landscape-rain-low');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#cozy-view').click();
    await expect(page.locator('#pet-cat')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#pet-cat')).toBeEnabled({ timeout: 20_000 });
    await page.locator('#pet-cat').click();
    await expect(page.locator('#pet-cat')).toHaveAttribute('data-busy', 'true');
    await expect(page.locator('#pet-cat')).not.toHaveAttribute('data-busy', 'true', { timeout: 15_000 });
    await image(page, 'mobile-rain-cat');
    await page.locator('#cozy-view').click();
    await expect(page.locator('#open-book')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('#fallback')).toBeHidden();
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
