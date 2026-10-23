import { test, expect } from '@playwright/test';

test('rendering sleeps while reading or hidden and resumes without skipping the sea',async ({browser}) => {
  test.setTimeout(180000);
  const context=await browser.newContext({viewport:{width:640,height:480},reducedMotion:'reduce'});
  const page=await context.newPage();const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    expect(body).toContain('function tick(now) {');
    body=body.replace('function tick(now) {','function tick(now) { window.__loadReview.callbacks++;');
    body=body.replace('const ray = new THREE.Raycaster();',`
      window.__loadReview={callbacks:0,samples:[],snapshot(){
        const geometry=ocean.geometry;
        let oceanBytes=geometry.index.array.byteLength;
        for(const attribute of Object.values(geometry.attributes))oceanBytes+=attribute.array.byteLength;
        return {callbacks:this.callbacks,draws:this.samples.length,wave:seaMat.uniforms.time.value,ratio:renderer.getPixelRatio(),oceanVertices:geometry.attributes.position.count,oceanBytes,hiddenOcean:!ocean.visible,hiddenFlowers:!bouquet.visible};
      }};
      const ray = new THREE.Raycaster();
    `);
    body=body.replace('renderer.render(scene, camera);',`
      renderer.render(scene, camera);
      window.__loadReview.samples.push({wave:seaMat.uniforms.time.value,stage:current,ratio:renderer.getPixelRatio()});
    `);
    await route.fulfill({response,body});
  });
  const snapshot=()=>page.evaluate(()=>(window as any).__loadReview.snapshot());
  try {
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    const entry=await snapshot();
    expect(entry.hiddenOcean).toBe(true);expect(entry.hiddenFlowers).toBe(true);
    expect(entry.oceanVertices).toBeLessThan(65536);
    expect(entry.oceanBytes).toBeLessThan(2*1024*1024);
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();
    await page.locator('#enter').click();await expect(page.locator('#room-ui')).toBeVisible({timeout:30000});
    expect((await snapshot()).hiddenOcean).toBe(false);
    const paused=await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
      document.dispatchEvent(new Event('visibilitychange'));
      return (window as any).__loadReview.snapshot();
    });
    await page.waitForTimeout(350);
    expect((await snapshot()).callbacks).toBe(paused.callbacks);
    expect((await snapshot()).draws).toBe(paused.draws);
    await page.evaluate(()=>{
      delete (document as any).hidden;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(count=>(window as any).__loadReview.samples.length>count,paused.draws);
    const resumed=await page.evaluate(index=>(window as any).__loadReview.samples[index],paused.draws);
    expect(resumed.wave).toBeCloseTo(paused.wave,8);
    await page.locator('#open-book').click();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:60000});
    await page.evaluate(()=>{(window as any).__sameChapterCanvas=document.querySelector('#art-holder canvas');});
    await page.waitForTimeout(150);
    const reading=await snapshot();await page.waitForTimeout(350);
    expect((await snapshot()).callbacks).toBe(reading.callbacks);
    expect((await snapshot()).draws).toBe(reading.draws);
    await page.setViewportSize({width:680,height:480});
    await page.waitForFunction(count=>(window as any).__loadReview.samples.length>count,reading.draws);
    await page.waitForTimeout(150);
    const resized=await snapshot();await page.waitForTimeout(350);
    expect((await snapshot()).callbacks).toBe(resized.callbacks);
    expect((await snapshot()).draws).toBe(resized.draws);
    expect(resized.draws-reading.draws).toBeLessThanOrEqual(3);
    const beforeReturn=await snapshot();
    await page.locator('#close-book').click();await expect(page.locator('#room-ui')).toBeVisible({timeout:60000});
    const returned=await page.evaluate(index=>(window as any).__loadReview.samples[index],beforeReturn.draws);
    expect(returned.wave).toBeCloseTo(beforeReturn.wave,8);
    const beforePower=await snapshot();await page.locator('#quality').click();
    expect((await snapshot()).ratio).toBeLessThanOrEqual(beforePower.ratio);
    await page.locator('#open-book').click();await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:60000});
    expect(await page.evaluate(()=>document.querySelector('#art-holder canvas')===(window as any).__sameChapterCanvas)).toBe(true);
    expect(errors).toEqual([]);
  } finally {await context.close();}
});
