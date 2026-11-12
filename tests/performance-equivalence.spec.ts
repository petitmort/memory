import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const original = JSON.parse(readFileSync('tests/fixtures/render-equivalence.json', 'utf8'));

test('cloth, rain, snow and water retain original simulation bytes across quality and motion modes', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
  const result = await page.evaluate(async () => {
    const curtainPath = '/src/curtains.ts', weatherPath = '/src/weather-controller.ts', waterPath = '/src/water-surface.ts';
    const { createCurtains } = await import(curtainPath);
    const { createWeatherController, sampleWeather } = await import(weatherPath);
    const { sampleWaterHeight } = await import(waterPath);
    const hash = async (array: Float32Array | Float64Array) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', array.buffer as ArrayBuffer))].map(x => x.toString(16).padStart(2, '0')).join('');
    const cloth = [];
    for (const reduced of [false, true]) {
      const controller = createCurtains({ width: 3, height: 1.6, sill: .85, back: -2.7 });
      try {
        for (let frame = 1; frame <= 360; frame++) {
          controller.update(frame / 30, reduced, frame < 80 ? 2 : frame < 160 ? 20 : frame < 240 ? 0 : 6);
          if (frame % 60 === 0) for (const panel of controller.group.children) cloth.push({
            reduced, frame, side: panel.name,
            positions: await hash(panel.geometry.attributes.position.array), normals: await hash(panel.geometry.attributes.normal.array),
          });
        }
      } finally {
        for (const panel of controller.group.children) panel.geometry.dispose();
        controller.group.children[0].material.map.dispose(); controller.group.children[0].material.dispose();
      }
    }
    const precipitation = [], controller = createWeatherController();
    try {
      for (const low of [false, true]) for (const reduced of [false, true]) for (const kind of ['light-rain', 'heavy-rain', 'light-snow', 'snow', 'thunderstorm']) {
        const weather = sampleWeather(1793448000000, { kind, windSpeed: 17, windDirection: 2.17 });
        controller.update(1793448000237, weather, low, reduced, .37);
        const [rain, snow] = controller.group.children;
        precipitation.push({ low, reduced, kind, rain: await hash(rain.geometry.attributes.position.array), snow: await hash(snow.geometry.attributes.position.array), counts: [rain.geometry.drawRange.count, snow.geometry.drawRange.count] });
      }
    } finally { controller.dispose(); }
    const water = new Float64Array(4200); let offset = 0;
    for (const windDirection of [0, .7, 2.17, -4, Math.PI * 2, NaN, Infinity]) for (const windSpeed of [0, 4, 20, 200, -3, NaN]) for (let i = 0; i < 100; i++)
      water[offset++] = sampleWaterHeight(Math.sin(i) * 57, -19 - i, 47.25 + i / 13, { windSpeed, windDirection });
    return { cloth, precipitation, water: await hash(water), waterSamples: water.length };
  });
  expect(result).toEqual({ cloth: original.cloth, precipitation: original.precipitation, water: original.water, waterSamples: original.waterSamples });
});

for (const mobile of [false, true]) test(`optimized cloth lighting matches native normals in the same rendered frame ${mobile ? 'phone' : 'desktop'}`, async ({ browser }) => {
  const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text(), marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      window.__normalEquivalence=()=>{
        const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
        const before=new Uint8Array(w*h*4),after=new Uint8Array(before.length),without=new Uint8Array(before.length);
        const panels=curtains.group.children;
        const normals=panels.map(panel=>new Float32Array(panel.geometry.attributes.normal.array));
        let changed=0,contribution=0,bytesEqual=true;
        try {
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,before);
          panels.forEach((panel,index)=>{
            panel.geometry.computeVertexNormals();
            const a=new Uint8Array(normals[index].buffer),b=new Uint8Array(panel.geometry.attributes.normal.array.buffer);
            for(let i=0;i<a.length;i++)if(a[i]!==b[i])bytesEqual=false;
          });
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,after);
          curtains.group.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,without);
          for(let i=0;i<before.length;i+=4){
            if(before[i]!==after[i]||before[i+1]!==after[i+1]||before[i+2]!==after[i+2]||before[i+3]!==after[i+3])changed++;
            if(Math.abs(before[i]-without[i])+Math.abs(before[i+1]-without[i+1])+Math.abs(before[i+2]-without[i+2])>6)contribution++;
          }
          return {changed,contribution,bytesEqual};
        }finally{
          curtains.group.visible=true;
          panels.forEach((panel,index)=>{panel.geometry.attributes.normal.array.set(normals[index]);panel.geometry.attributes.normal.needsUpdate=true;});
          renderer.render(scene,camera);
        }
      };${marker}`) });
  });
  try {
    await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T22:00&envWeather=clear&envWind=20&envDensity=0&envBirdDensity=0');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
    await page.locator('#enter').click(); await expect(page.locator('#enter')).toBeEnabled();
    await page.locator('#enter').click(); await expect(page.locator('#room-ui')).toBeVisible();
    const result = await page.evaluate(() => (window as any).__normalEquivalence());
    expect(result.bytesEqual).toBe(true); expect(result.changed).toBe(0);
    expect(result.contribution, 'the compared cloth must contribute actual visible pixels').toBeGreaterThan(100);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
