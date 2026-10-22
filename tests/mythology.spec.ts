import { test, expect } from '@playwright/test';

test('mythic courtyard reveal and direct album reopening stay clear of mobile controls', async ({browser}) => {
  test.setTimeout(180000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();const body=await response.text();
    await route.fulfill({response,body:body.replace('renderer.render(scene, camera);',`
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const screen=o=>{const v=o.getWorldPosition(new THREE.Vector3()).project(camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};};
      window.__myth={composition:['helios-radiant-sun','mythic-sailing-ship','distant-kraken'].map(n=>{const o=scene.getObjectByName(n);const top=new THREE.Vector3(0,n==='helios-radiant-sun'?6.4:0,0).applyMatrix4(o.matrixWorld).project(camera);return {...screen(o),top:(1-top.y)*innerHeight/2,distance:o.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position)};}),width:innerWidth,book:screen(book),rose:screen(bouquet),details:['mythic-sailing-ship','distant-kraken','whirlpool','helios-radiant-sun','poseidon-trident','greek-gods-tapestry','mythic-drinking-horn','dwarven-forged-hammer','cliff-foundation'].map(n=>!!scene.getObjectByName(n))};
      if(current==='entry' && !window.__courtyardChecked){
        const probeRay=new THREE.Raycaster();let exposed=0;
        for(const x of [-.95,-.5,0,.5,.95])for(const y of [-.95,-.5,0,.5,.95]){
          probeRay.setFromCamera(new THREE.Vector2(x,y),camera);
          const hits=probeRay.intersectObjects(scene.children,true);
          if(hits[0]?.object===ocean)exposed++;
        }
        window.__courtyardChecked={exposed};
      }
      renderer.render(scene, camera);`)});
  });
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden();
  await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).__courtyardChecked.exposed)).toBe(0);
  await page.screenshot({path:'test-results/mythic-courtyard.png'});
  await page.locator('#enter').click();await expect(page.locator('#room-ui')).toBeVisible();
  expect(await page.evaluate(()=>(window as any).__myth.details.every(Boolean))).toBe(true);
  const composition=await page.evaluate(()=>(window as any).__myth.composition);
  const [sun,ship,kraken]=composition;
  expect(sun.x).toBeGreaterThan(1440*.65);
  expect(sun.y).toBeLessThan(1000*.3);
  expect(sun.top).toBeGreaterThan(40);
  expect(sun.x).toBeGreaterThan(ship.x);
  expect(kraken.distance).toBeGreaterThan(ship.distance*1.6);
  expect(Math.abs(kraken.x-ship.x)).toBeGreaterThan(100);
  await page.screenshot({path:'test-results/mythic-room.png'});
  await page.locator('#open-book').click();await expect(page.locator('#reader')).toBeVisible();
  await page.locator('#close-book').click();await expect(page.locator('#open-book')).toContainText('继续翻阅');
  await page.waitForTimeout(600);
  const rose=await page.evaluate(()=>(window as any).__myth.rose);
  await page.mouse.click(rose.x,rose.y);await expect(page.locator('#reader')).toBeHidden();
  const book=await page.evaluate(()=>(window as any).__myth.book);
  await page.mouse.click(book.x,book.y);await expect(page.locator('#reader')).toBeVisible();
  await page.locator('#close-book').click();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>(window as any).__myth.width===390);
  await page.waitForTimeout(500);
  const clear=await page.evaluate(()=>{const {book,rose}=(window as any).__myth;return [book,rose].map(p=>({ ...p,tag:document.elementFromPoint(p.x,p.y)?.tagName,id:document.elementFromPoint(p.x,p.y)?.id }));});
  await page.screenshot({path:'test-results/mythic-mobile.png'});
  expect(clear.map(p=>p.tag)).toEqual(['CANVAS','CANVAS']);
  await context.close();
});
