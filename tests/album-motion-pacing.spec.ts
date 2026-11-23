import { test, expect } from '@playwright/test';

for (const quality of ['low', 'normal']) {
  test(`${quality}: flower, camera and paper use every available frame without changing quality; idle economy and reader pause remain`, async ({ page }) => {
    test.setTimeout(120000);
    // Drive the actual scene tick at a known 60 Hz. This checks scheduling
    // decisions without depending on the test machine's GPU speed or RAF rate.
    await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
      const response = await route.fetch();
      let source = await response.text();
      const schedule = 'frame = requestAnimationFrame(tick);';
      const draw = 'renderer.render(scene, camera);';
      const marker = 'const ray = new THREE.Raycaster();';
      for (const token of [schedule, draw, marker]) expect(source).toContain(token);
      source = source.replace(schedule, 'frame = window.__motionPacing?.held ? 0 : requestAnimationFrame(tick);');
      source = source.replaceAll(draw, `${draw}
        if(window.__motionPacing?.held)window.__motionPacing.draws.push({flower:!!bouquetMotion,paper:!!readingMotion});`);
      source = source.replace(marker, `
        window.__motionPacing={held:false,draws:[],clock:0,
          begin(){this.held=true;cancelAnimationFrame(frame);frame=0;this.clock=lastDraw??performance.now();this.draws=[];},
          async step(count){this.draws=[];for(let i=0;i<count;i++){this.clock+=1000/60;tick(this.clock);await Promise.resolve();await Promise.resolve();}return this.draws;},
          quality(){return {low,ratio:renderer.getPixelRatio(),shadows:renderer.shadowMap.enabled,map:sun.shadow.mapSize.toArray(),resources:[renderer.info.memory.geometries,renderer.info.memory.textures,renderer.info.programs.length]};}
        };${marker}`);
      await route.fulfill({ response, body: source });
    });
    await page.goto(`/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T12:00&envWeather=clear&envQuality=${quality}`);
    await expect(page.locator('#loading')).toBeHidden({ timeout:90000 });
    await page.locator('#enter').click(); await expect(page.locator('#enter')).toBeEnabled();
    await page.locator('#enter').click(); await expect(page.locator('#room-ui')).toBeVisible({ timeout:30000 });
    const initial = await page.evaluate(() => (window as any).__motionPacing.quality());
    expect(initial.low).toBe(quality === 'low');
    await page.evaluate(() => (window as any).__motionPacing.begin());
    await page.locator('#open-book').click();
    const flower = await page.evaluate(() => (window as any).__motionPacing.step(60));
    expect(flower.length).toBeGreaterThanOrEqual(58);
    expect(flower.filter((f: any) => f.flower).length).toBeGreaterThanOrEqual(58);
    const approach = await page.evaluate(() => (window as any).__motionPacing.step(132));
    expect(approach.filter((f: any) => f.paper).length).toBeGreaterThan(115);
    await page.evaluate(() => (window as any).__motionPacing.step(60));
    await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready');
    const paused = await page.evaluate(() => (window as any).__motionPacing.step(60));
    expect(paused).toHaveLength(0);
    await page.locator('#close-book').click();
    const closing = await page.evaluate(() => (window as any).__motionPacing.step(132));
    expect(closing.filter((f: any) => f.paper).length).toBeGreaterThan(115);
    await expect(page.locator('#room-ui')).toBeVisible();
    const idle = await page.evaluate(() => (window as any).__motionPacing.step(60));
    expect(idle.length).toBeGreaterThanOrEqual(29);
    expect(idle.length).toBeLessThanOrEqual(quality === 'low' ? 31 : 60);
    const final = await page.evaluate(() => (window as any).__motionPacing.quality());
    expect(final).toEqual(initial);
  });
}
