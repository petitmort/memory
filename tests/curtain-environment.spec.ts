import { test, expect } from '@playwright/test';

test('rendered curtains receive the current blended wind and retain their lace resources through reading', async ({ browser }) => {
  test.setTimeout(240000);
  const context = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion: 'no-preference' });
  const page = await context.newPage(), errors: string[] = [];
  page.setDefaultTimeout(60000); page.on('pageerror', error => errors.push(error.message));
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text(), marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      const originalClothUpdate=curtains.update,clothPanels=curtains.group.children;
      const originalCloth=clothPanels.map(panel=>({position:panel.geometry.attributes.position,normal:panel.geometry.attributes.normal,map:panel.material.map,rest:new Float32Array(panel.geometry.attributes.position.array)}));
      let forwardedWind,windAtCall,clothFrames=0;
      curtains.update=(time,reduced,speed)=>{forwardedWind=speed;windAtCall=seaMat.uniforms.windSpeed.value;clothFrames++;originalClothUpdate(time,reduced,speed);};
      window.__clothReview={snapshot(){
        let max=0;const versions=[],identities=[];
        clothPanels.forEach((panel,index)=>{const p=panel.geometry.attributes.position,r=originalCloth[index];versions.push(p.version,panel.geometry.attributes.normal.version);identities.push(p===r.position,panel.geometry.attributes.normal===r.normal,panel.material.map===r.map);for(let i=0;i<p.count;i++){const o=i*3;max=Math.max(max,Math.hypot(p.array[o]-r.rest[o],p.array[o+1]-r.rest[o+1],p.array[o+2]-r.rest[o+2]));}});
        return {wind:seaMat.uniforms.windSpeed.value,weather:environment.snapshot().weather.windSpeed,forwardedWind,windAtCall,clothFrames,max,versions,identities,memory:{...renderer.info.memory,programs:renderer.info.programs.length}};
      },pixels(){
        const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,a=new Uint8Array(w*h*4),b=new Uint8Array(a.length),before=curtains.group.visible;
        try{renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);curtains.group.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);}finally{curtains.group.visible=before;renderer.render(scene,camera);}
        let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>6)changed++;return changed;
      }};${marker}`) });
  });
  const snapshot = () => page.evaluate(() => (window as any).__clothReview.snapshot());
  const setWind = async (speed: string) => {
    await page.locator('.environment-debug > summary').click();
    await page.locator('#env-wind').fill(speed); await page.locator('#env-wind').dispatchEvent('change');
    await page.locator('.environment-debug > summary').click();
    await expect.poll(async () => (await snapshot()).wind, { timeout: 30000 }).toBeCloseTo(Number(speed), 4);
    const state = await snapshot();
    expect(state.forwardedWind).toBe(state.windAtCall); expect(state.forwardedWind).toBe(state.weather);
    expect(state.identities.every(Boolean)).toBe(true); expect(state.max).toBeLessThan(.1);
    return state;
  };
  try {
    await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-06-21T12:00&envWeather=clear&envWind=2&envDensity=0&envBirdDensity=0');
    await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
    await page.locator('#enter').click(); await expect(page.locator('#enter')).toBeEnabled({ timeout: 60000 });
    await page.locator('#enter').click(); await expect(page.locator('#room-ui')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('#record-state')).toHaveText('播放中', { timeout: 30000 });
    const light = await snapshot(); expect(light.forwardedWind).toBe(2);
    const strong = await setWind('20'); expect(strong.memory).toEqual(light.memory);
    expect(await page.evaluate(() => (window as any).__clothReview.pixels())).toBeGreaterThan(150);
    await page.screenshot({ path: test.info().outputPath('strong-wind-lace.png') });
    const calm = await setWind('0'); expect(calm.memory).toEqual(strong.memory);
    await page.locator('#open-book').click(); await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', { timeout: 60000 });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const reading = await snapshot(); await page.waitForTimeout(250); const resting = await snapshot();
    expect(resting.versions).toEqual(reading.versions);
    await page.locator('#close-book').click(); await expect(page.locator('#room-ui')).toBeVisible({ timeout: 60000 });
    const returned = await snapshot(); expect(returned.forwardedWind).toBe(0); expect(returned.identities.every(Boolean)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
