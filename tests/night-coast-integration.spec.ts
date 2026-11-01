import { test, expect, type Page } from '@playwright/test';

/** Instrument only the served development module; no production test API. */
async function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text();
    const marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      window.__nightCoast = {
        snapshot() {
          const state=environment.snapshot(),stars=scene.getObjectByName('quiet-night-stars');
          return {timestamp:state.timestamp,paused:state.paused,updates:state.updates,low:state.low,
            weather:state.weather,night:state.celestial.night,
            starsMatrix:stars.matrixWorld.elements.slice(),
            resources:{...renderer.info.memory,programs:renderer.info.programs.length}};
        },
        difference(name,uniform) {
          const object=scene.getObjectByName(name),visible=object.visible;
          const value=uniform?object.material.uniforms[uniform].value:undefined;
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const a=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4);
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
          if(uniform)object.material.uniforms[uniform].value=0;else object.visible=false;
          try {renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);}
          finally {if(uniform)object.material.uniforms[uniform].value=value;else object.visible=visible;renderer.render(scene,camera);}
          let changed=0,energy=0,max=0;
          for(let i=0;i<a.length;i+=4){const delta=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(delta>3)changed++;energy+=delta;max=Math.max(max,delta);}
          return {changed,energy,max};
        }
      };${marker}`) });
  });
  return errors;
}

async function enter(page: Page) {
  await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T22:00&envWeather=few-clouds&envPhase=0&envQuality=normal&envDensity=0&envBirdDensity=0');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
  await page.locator('#enter').click();
  await expect(page.locator('#enter')).toHaveText('推开这扇门', { timeout: 45000 });
  await page.locator('#enter').click();
  await expect(page.locator('#open-book')).toBeEnabled({ timeout: 45000 });
}
const snapshot = (page: Page) => page.evaluate(() => (window as any).__nightCoast.snapshot());
const difference = (page: Page, name: string, uniform?: string) => page.evaluate(
  ({ name, uniform }) => (window as any).__nightCoast.difference(name, uniform), { name, uniform });

test('stars, galactic texture, the lighthouse and connected cliff path render through desktop and phone windows', async ({ browser }) => {
  test.setTimeout(180000);
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = await observe(page);
    try {
      await enter(page);
      const stars = await difference(page, 'quiet-night-stars');
      expect(stars.changed, 'Stars need visible pixels through the actual window').toBeGreaterThan(12);
      const galaxy = await difference(page, 'continuous-day-night-sky', 'galaxyStrength');
      expect(galaxy.changed, 'The Milky Way must contribute actual window pixels').toBeGreaterThan(60);
      const coast = await difference(page, 'lighthouse-coast');
      expect(coast.changed).toBeGreaterThan(100);
      const lighthouse = await difference(page, 'coastal-lighthouse');
      expect(lighthouse.changed, 'The lighthouse needs a distinct visible silhouette').toBeGreaterThan(10);
      const path = await difference(page, 'cliff-path');
      expect(path.changed, 'The path must be visible from the room, not just exist outside the view').toBeGreaterThan(10);
      expect(errors).toEqual([]);
      await expect(page.locator('#fallback')).toBeHidden();
    } finally { await context.close(); }
  }
});

test('calendar sky resumes present orientation after reading and background, and day or thick cloud suppresses starlight', async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 1000, height: 740 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = await observe(page);
  try {
    await enter(page);
    const initial = await snapshot(page);
    const clear = await difference(page, 'quiet-night-stars');
    await page.locator('#open-book').click();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 45000 });
    await expect.poll(async () => (await snapshot(page)).paused).toBe(true);
    const paused = await snapshot(page);
    await page.evaluate(() => { const now = Date.now; Date.now = () => now() + 3600000; });
    await page.waitForTimeout(250);
    expect((await snapshot(page)).updates).toBe(paused.updates);
    await page.locator('#close-book').click();
    await expect(page.locator('#open-book')).toBeEnabled({ timeout: 45000 });
    const resumed = await snapshot(page);
    expect(resumed.timestamp - initial.timestamp).toBeGreaterThan(3590000);
    expect(resumed.starsMatrix).not.toEqual(initial.starsMatrix);
    expect(resumed.resources).toEqual(initial.resources);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = await snapshot(page);
    await page.waitForTimeout(250);
    expect((await snapshot(page)).updates).toBe(hidden.updates);
    await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(async () => (await snapshot(page)).updates).toBeGreaterThan(hidden.updates);
    await page.locator('.environment-debug summary').click();
    await page.locator('#env-weather').selectOption('overcast');
    await page.waitForTimeout(6500);
    await page.locator('.environment-debug summary').click();
    expect((await difference(page, 'quiet-night-stars')).energy).toBeLessThan(clear.energy * .12);
    await page.locator('.environment-debug summary').click();
    await page.locator('#env-date').fill('2026-10-31T12:00');
    await page.locator('#env-date').dispatchEvent('change');
    await page.locator('#env-weather').selectOption('clear');
    await page.waitForTimeout(6500);
    await page.locator('.environment-debug summary').click();
    expect((await difference(page, 'quiet-night-stars')).energy).toBe(0);
    expect((await difference(page, 'continuous-day-night-sky', 'galaxyStrength')).energy).toBe(0);
    expect((await snapshot(page)).resources).toEqual(initial.resources);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
