import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const evidence = process.env.SKY_WINDOW_EVIDENCE ?? '/tmp/memory-window-sky';

async function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), body = await response.text();
    const marker = 'const ray = new THREE.Raycaster();';
    expect(body).toContain(marker);
    await route.fulfill({ response, body: body.replace(marker, `
      window.__windowSky = {
        snapshot() {
          camera.updateMatrixWorld(true);
          const state=environment.snapshot(),sun=scene.getObjectByName('helios-radiant-sun');
          const position=sun.position.clone(),q=position.clone().project(camera);
          const ratio=(-2.7-camera.position.z)/(position.z-camera.position.z);
          const portal=camera.position.clone().lerp(position,ratio);
          return {sun:state.celestial.sun,weather:state.weather,low:state.low,
            visibleSun:sun.visible&&ratio>0&&ratio<1&&Math.abs(portal.x)<1.5&&portal.y>.85&&portal.y<2.45&&Math.abs(q.x)<1&&Math.abs(q.y)<1,
            sunPosition:position.toArray(),reflectionPosition:seaMat.uniforms.sunPosition.value.toArray(),
            resources:{...renderer.info.memory,programs:renderer.info.programs.length}};
        },
        pixels(name) {
          const object=scene.getObjectByName(name),visible=object.visible;
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const before=new Uint8Array(w*h*4),after=new Uint8Array(w*h*4);
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,before);
          const beforeCalls=renderer.info.render.calls;
          object.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,after);
          const calls=beforeCalls-renderer.info.render.calls;
          object.visible=visible;renderer.render(scene,camera);
          let changed=0,maxDifference=0;
          for(let i=0;i<before.length;i+=4){const delta=Math.abs(before[i]-after[i])+Math.abs(before[i+1]-after[i+1])+Math.abs(before[i+2]-after[i+2]);
            if(delta>6)changed++;maxDifference=Math.max(maxDifference,delta);}
          return {changed,maxDifference,calls};
        },
        skyPalette() {
          const clouds=scene.getObjectByName('calendar-cloud-layers'),visible=clouds.visible;
          clouds.visible=false;renderer.render(scene,camera);
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,pixels=new Uint8Array(w*h*4);
          gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
          clouds.visible=visible;renderer.render(scene,camera);
          const total=[0,0,0],eye=camera.position;let count=0;
          for(let y=0;y<h;y+=8)for(let x=0;x<w;x+=8){
            const point=new THREE.Vector3((x+.5)/w*2-1,(y+.5)/h*2-1,.5).unproject(camera);
            const ratio=(-2.7-eye.z)/(point.z-eye.z),portal=eye.clone().lerp(point,ratio);
            // Upper open window, excluding frame, mullion and the curtain edges.
            if(ratio<=0||portal.x< -1.2||portal.x>1.1||Math.abs(portal.x)<.055||portal.y<1.88||portal.y>2.35)continue;
            const index=(y*w+x)*4;for(let channel=0;channel<3;channel++)total[channel]+=pixels[index+channel];count++;
          }
          return {count,mean:total.map(value=>value/Math.max(1,count))};
        },
      };${marker}`) });
  });
  return errors;
}

async function enter(page: Page, date: string, weather: string) {
  await page.goto(`/?debugEnv=1&envTimeMode=scene&envQuality=normal&envDate=${date}&envWeather=${weather}&envDensity=0`);
  await page.waitForFunction(() => !!(window as any).__windowSky, undefined, { timeout: 90_000 });
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90_000 });
  await page.locator('#enter').click();
  await expect(page.locator('#enter')).toHaveText('推开这扇门', { timeout: 45_000 });
  await page.locator('#enter').click();
  await expect(page.locator('#open-book')).toBeEnabled({ timeout: 45_000 });
}

const snapshot = (page: Page) => page.evaluate(() => (window as any).__windowSky.snapshot());
const pixels = (page: Page, name: string) => page.evaluate(name => (window as any).__windowSky.pixels(name), name);
async function capture(page: Page, name: string) {
  await mkdir(evidence, { recursive: true });
  await page.screenshot({ path: join(evidence, `${name}.png`) });
}

test('the real west-facing room shows a distinct sunset disc on desktop and phone, with the same sea reflection direction', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile: mobile, hasTouch: mobile, reducedMotion: mobile ? 'reduce' : 'no-preference' });
    const page = await context.newPage(), errors = await observe(page);
    try {
      await enter(page, '2026-10-31T17:10', 'clear');
      const state = await snapshot(page);
      expect(state.visibleSun).toBe(true);
      expect(state.sun.altitude).toBeGreaterThan(0);
      expect(state.sunPosition).toEqual(state.reflectionPosition);
      const core = await pixels(page, 'solar-disc');
      expect(core.changed, 'The actual solar disc contributes visible pixels through the room window').toBeGreaterThan(20);
      expect(core.maxDifference).toBeGreaterThan(30);
      await capture(page, mobile ? 'sunset-phone' : 'sunset-desktop');
      await expect(page.locator('#fallback')).toBeHidden();
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});

test('daytime low sky is blue and distinct clouds render through the real window in normal and low quality', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      isMobile: mobile, hasTouch: mobile, reducedMotion: mobile ? 'reduce' : 'no-preference' });
    const page = await context.newPage(), errors = await observe(page);
    try {
      await enter(page, '2026-06-21T12:00', 'cloudy');
      const state = await snapshot(page);
      expect(state.visibleSun, 'A high midday sun is allowed to remain above the physical window').toBe(false);
      const palette = await page.evaluate(() => (window as any).__windowSky.skyPalette());
      expect(palette.count).toBeGreaterThan(20);
      expect(palette.mean[2] - palette.mean[0], 'The low daytime sky retains blue instead of near-white glare').toBeGreaterThan(30);
      for (const quality of ['normal', 'low']) {
        if (quality === 'low') {
          await page.locator('.environment-debug summary').click();
          await page.locator('#env-quality').selectOption('low');
          await expect.poll(async () => (await snapshot(page)).low).toBe(true);
          await page.locator('.environment-debug summary').click();
        }
        const cloud = await pixels(page, 'calendar-cloud-layers');
        expect(cloud.changed, `${mobile ? 'Phone' : 'Desktop'} ${quality} cloud bodies must change visible pixels`).toBeGreaterThan(200);
        expect(cloud.maxDifference).toBeGreaterThan(18);
        expect(cloud.calls).toBe(1);
        expect((await snapshot(page)).resources.geometries).toBe(state.resources.geometries);
        await capture(page, `clouds-${mobile ? 'phone' : 'desktop'}-${quality}`);
      }
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});
