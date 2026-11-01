import { test, expect, type Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

// Observe the actual served scene, without adding a production debug API.
async function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text();
    const marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      window.__pierReview = {
        snapshot() {
          const surf=mythology.seascape.pierSurf,state=environment.snapshot();
          return {surf:surf.snapshot(),beacon:mythology.seascape.lighthouseCoast.beacon.snapshot(),paused:state.paused,updates:state.updates,low:state.low,
            resources:{...renderer.info.memory,programs:renderer.info.programs.length}};
        },
        beaconFrame(phase,part) {
          const coast=mythology.seascape.lighthouseCoast,state=environment.snapshot();
          const time=Math.floor(state.timestamp/28000)*28000+phase;
          const beam=coast.updateBeacon(time,state.celestial.sun.altitude,state.weather,false,false);
          const uniforms=seaMat.uniforms;
          uniforms.beaconPosition.value.set(beam.origin.x,beam.origin.y,beam.origin.z);
          uniforms.beaconDirection.value.set(beam.direction.x,beam.direction.y,beam.direction.z);
          uniforms.beaconStrength.value=beam.beamStrength;
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const a=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4);
          const air=coast.beacon.group,visible=air.visible;
          let capture;
          try {
            renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
            capture=renderer.domElement.toDataURL('image/png');
            if(part==='air')air.visible=false;else uniforms.beaconStrength.value=0;
            renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
          } finally {
            air.visible=visible;
            const restored=coast.updateBeacon(state.timestamp,state.celestial.sun.altitude,state.weather,reducedMotion,state.low);
            uniforms.beaconPosition.value.set(restored.origin.x,restored.origin.y,restored.origin.z);
            uniforms.beaconDirection.value.set(restored.direction.x,restored.direction.y,restored.direction.z);
            uniforms.beaconStrength.value=restored.beamStrength;
            renderer.render(scene,camera);
          }
          let changed=0,energy=0;
          for(let i=0;i<a.length;i+=4){const delta=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(delta>3)changed++;energy+=delta;}
          return {changed,energy,beam,capture};
        },
        frame(time,hiddenName) {
          const surf=mythology.seascape.pierSurf,state=environment.snapshot(),previous=surf.snapshot();
          const weather={...state.weather,windSpeed:18,windDirection:-.21109333322274657,waveScale:1.5};
          const saved={};for(const key of ['time','windSpeed','windDirection','waveScale'])saved[key]=seaMat.uniforms[key].value;
          Object.assign(seaMat.uniforms.time,{value:time});
          for(const key of ['windSpeed','windDirection','waveScale'])seaMat.uniforms[key].value=weather[key];
          surf.update(time,weather,false,false,state.celestial.daylight);
          const object=scene.getObjectByName(hiddenName),visible=object.visible;
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const a=new Uint8Array(w*h*4),b=new Uint8Array(w*h*4);
          let capture,result;
          try {
            renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
            capture=renderer.domElement.toDataURL('image/png');result=surf.snapshot();
            object.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
          } finally {
            object.visible=visible;for(const key of Object.keys(saved))seaMat.uniforms[key].value=saved[key];
            surf.update(previous.time,state.weather,state.low,reducedMotion,state.celestial.daylight);renderer.render(scene,camera);
          }
          let changed=0,energy=0,minX=w,minY=h,maxX=0,maxY=0;
          for(let i=0;i<a.length;i+=4){const delta=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);
            if(delta>3){changed++;const x=(i/4)%w,y=h-1-Math.floor(i/4/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}energy+=delta;}
          return {changed,energy,bounds:{minX,minY,maxX,maxY},surf:result,capture,
            visibility:[surf.group.visible,...surf.group.children.map(o=>o.visible)]};
        }
      };${marker}`) });
  });
  return errors;
}
async function enter(page: Page, night = false) {
  await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T' + (night ? '22:00' : '12:00') + '&envWeather=clear&envPhase=0&envQuality=normal&envDensity=0&envBirdDensity=0&envWind=18&envWindDirection=348&envWaves=1.5');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
  await page.locator('#enter').click();
  await expect(page.locator('#enter')).toHaveText('推开这扇门', { timeout: 45000 });
  await page.locator('#enter').click();
  await expect(page.locator('#open-book')).toBeEnabled({ timeout: 45000 });
}
const snapshot = (page: Page) => page.evaluate(() => (window as any).__pierReview.snapshot());
const frame = (page: Page, time: number, name = 'pier-wave-surf') => page.evaluate(
  ({ time, name }) => (window as any).__pierReview.frame(time, name), { time, name });

test('real window pixels show upward peeling water, airborne spray and settling foam on desktop and phone', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = await observe(page);
    try {
      await enter(page);
      const tower = await frame(page, 27.466, 'coastal-lighthouse');
      expect(tower.changed).toBeGreaterThan(20);
      const phases = [];
      for (const time of [27.166, 27.466, 28.066, 28.766]) {
        const result = await frame(page, time);
        phases.push({ time, changed: result.changed, energy: result.energy, bounds: result.bounds,
          counts:[result.surf.sheets,result.surf.foam,result.surf.droplets],visibility:result.visibility });
        const path=testInfo.outputPath(`${mobile ? 'phone' : 'desktop'}-wave-${time}.png`);
        await writeFile(path, Buffer.from(result.capture.split(',')[1], 'base64'));
        await testInfo.attach(`${mobile ? 'phone' : 'desktop'}-wave-${time}`, { path, contentType: 'image/png' });
      }
      console.log(JSON.stringify({ mobile, phases, errors }));
      expect(phases.filter(p => p.changed > 12).length).toBeGreaterThanOrEqual(3);
      expect(new Set(phases.map(p => p.energy)).size).toBe(4);
      const sheet = await frame(page, 27.466, 'pier-curling-wave-sheets');
      const spray = await frame(page, 27.566, 'pier-airborne-spray');
      const foam = await frame(page, 28.766, 'pier-broken-sea-foam');
      expect(sheet.changed, 'Actual upward sheet pixels').toBeGreaterThan(5);
      expect(spray.changed, 'Actual airborne droplet pixels').toBeGreaterThan(2);
      expect(foam.changed, 'Actual receding foam pixels').toBeGreaterThan(5);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});

test('surf shares the sea clock, sleeps while reading or hidden, and reuses resources in low quality and after resizing', async ({ browser }) => {
  test.setTimeout(180000);
  const context = await browser.newContext({ viewport: { width: 1000, height: 740 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = await observe(page);
  try {
    await enter(page, true);
    const initial = await snapshot(page);
    await page.locator('#open-book').click();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 45000 });
    const reading = await snapshot(page); await page.waitForTimeout(250);
    expect((await snapshot(page)).surf).toEqual(reading.surf);
    expect((await snapshot(page)).beacon).toEqual(reading.beacon);
    expect(reading.paused).toBe(true);
    await page.locator('#close-book').click();
    await expect(page.locator('#open-book')).toBeEnabled({ timeout: 45000 });
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    const hidden = await snapshot(page); await page.waitForTimeout(250);
    expect((await snapshot(page)).surf).toEqual(hidden.surf);
    await page.evaluate(() => { delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange')); });
    await expect.poll(async () => (await snapshot(page)).surf.time).toBeGreaterThan(hidden.surf.time);
    await page.locator('#quality').click();
    await expect.poll(async () => (await snapshot(page)).low).toBe(true);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const final = await snapshot(page);
    expect(final.surf.time).toBeGreaterThan(initial.surf.time);
    expect(final.beacon.timestamp).toBeGreaterThan(initial.beacon.timestamp);
    expect(final.surf.droplets).toBe(0); // reduced-motion mode
    // Explicit power-saving disables existing shadows and may compile their
    // non-shadow variants once; shared geometry/texture pools must not grow.
    expect(final.resources.geometries).toBe(initial.resources.geometries);
    expect(final.resources.textures).toBe(initial.resources.textures);
    expect(final.resources.geometries).toBeLessThanOrEqual(257);
    expect(final.resources.textures).toBeLessThanOrEqual(41);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('the rotating dusk beacon and its matching broken sea illumination have actual window pixels', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  for (const mobile of [false, true]) {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = await observe(page);
  try {
    await enter(page, true);
    const resources = (await snapshot(page)).resources;
    const samples = [];
    for (const phase of [1000, 5000, 9000, 13000, 16000, 18000, 19000, 20000, 22000, 25000]) {
      const air = await page.evaluate(phase => (window as any).__pierReview.beaconFrame(phase, 'air'), phase);
      const sea = await page.evaluate(phase => (window as any).__pierReview.beaconFrame(phase, 'sea'), phase);
      samples.push({ phase, air: air.changed, sea: sea.changed, airEnergy: air.energy, seaEnergy: sea.energy, direction: air.beam.direction });
      const path = testInfo.outputPath(`${mobile ? 'phone' : 'desktop'}-lighthouse-sweep-${phase}.png`);
      await writeFile(path, Buffer.from(air.capture.split(',')[1], 'base64'));
      await testInfo.attach(`${mobile ? 'phone' : 'desktop'}-lighthouse-sweep-${phase}`, { path, contentType: 'image/png' });
    }
    console.log(JSON.stringify({ mobile, beaconPixels: samples, errors }));
    expect(samples.filter(sample => sample.air > 5).length, 'Atmospheric beam must visibly sweep').toBeGreaterThanOrEqual(2);
    expect(Math.max(...samples.map(sample => sample.airEnergy)), 'The beam needs clearly luminous window pixels, not only a barely detectable difference').toBeGreaterThan(mobile ? 70000 : 160000);
    expect(samples.filter(sample => sample.sea > 5).length, 'The rotating beam must illuminate the actual sea').toBeGreaterThanOrEqual(2);
    expect(new Set(samples.map(sample => sample.seaEnergy)).size).toBeGreaterThan(3);
    expect((await snapshot(page)).resources).toEqual(resources);
    expect(resources.geometries).toBeLessThanOrEqual(257);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
  }
});
