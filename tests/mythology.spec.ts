import { test, expect } from '@playwright/test';

test('mythic courtyard reveal and direct album reopening stay clear of mobile controls', async ({browser}) => {
  test.setTimeout(180000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const page=await context.newPage();
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();const body=await response.text();
    await route.fulfill({response,body:body.replace('renderer.render(scene, camera);',`
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const screen=o=>{const v=o.getWorldPosition(new THREE.Vector3()).project(camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};};
      const bounds=name=>{const b=new THREE.Box3().setFromObject(scene.getObjectByName(name),true);return {min:b.min.toArray(),max:b.max.toArray()};};
      const painting=scene.getObjectByName('classical-myth-oil-painting');
      window.__myth={paintingReady:painting?.material.map.image?.naturalWidth===1024,woodReady:tabletop.material.map.image?.naturalWidth===1024,removed:['classical-carved-harp','greek-gods-tapestry','distant-kraken','whirlpool'].map(n=>!scene.getObjectByName(n)),collection:{vessel:bounds('classical-relief-amphora'),console:bounds('console-top'),painting:bounds('vintage-framed-seascape'),rotation:scene.getObjectByName('console').rotation.y},supports:{desk:bounds('tabletop'),shelf:bounds('entry-collection-shelf-top'),horn:bounds('mythic-drinking-horn'),hammer:bounds('dwarven-forged-hammer'),trident:bounds('poseidon-trident')},basket:bounds('woven-market-basket'),composition:['helios-radiant-sun','mythic-sailing-ship'].map(n=>{const o=scene.getObjectByName(n);const top=new THREE.Vector3(0,n==='helios-radiant-sun'?6.4:0,0).applyMatrix4(o.matrixWorld).project(camera);return {...screen(o),top:(1-top.y)*innerHeight/2,distance:o.getWorldPosition(new THREE.Vector3()).distanceTo(camera.position)};}),width:innerWidth,book:screen(book),rose:screen(bouquet),details:['mythic-sailing-ship','aegean-natural-coast','helios-radiant-sun','poseidon-trident','mythic-drinking-horn','dwarven-forged-hammer','cliff-foundation','classical-relief-amphora','classical-myth-oil-painting'].map(n=>!!scene.getObjectByName(n))};
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
  await page.waitForFunction(()=>(window as any).__myth.paintingReady && (window as any).__myth.woodReady);
  expect(await page.evaluate(()=>(window as any).__myth.removed.every(Boolean))).toBe(true);
  const collection=await page.evaluate(()=>(window as any).__myth.collection);
  const {vessel,console:sideboard,painting}=collection;
  expect(collection.rotation).toBeCloseTo(Math.PI/2,6);
  expect(vessel.min[1]).toBeCloseTo(sideboard.max[1]+.0003,4);
  for(const axis of [0,2]){
    expect(vessel.min[axis]).toBeGreaterThan(sideboard.min[axis]+.01);
    expect(vessel.max[axis]).toBeLessThan(sideboard.max[axis]-.01);
  }
  expect(painting.min[1]-sideboard.max[1]).toBeGreaterThan(.2);
  expect(painting.min[1]-sideboard.max[1]).toBeLessThan(.36);
  expect((painting.min[2]+painting.max[2])/2).toBeCloseTo((sideboard.min[2]+sideboard.max[2])/2,5);
  const supports=await page.evaluate(()=>(window as any).__myth.supports);
  for(const key of ['horn','hammer']) {
    const object=supports[key],shelf=supports.shelf;
    expect(object.min[1]).toBeCloseTo(shelf.max[1]+.0003,4);
    expect(object.max[1]-object.min[1]).toBeLessThan(.105);
    for(const axis of [0,2]) {
      expect(object.min[axis]).toBeGreaterThan(shelf.min[axis]+.015);
      expect(object.max[axis]).toBeLessThan(shelf.max[axis]-.015);
    }
  }
  expect(supports.trident.min[1]).toBeCloseTo(.001,4);
  expect(supports.trident.min[2]).toBeGreaterThan(1.9);
  expect(supports.horn.min[2]).toBeGreaterThan(2.3);
  expect(supports.hammer.min[2]).toBeGreaterThan(2.3);
  expect(supports.desk.min[0]-sideboard.max[0]).toBeGreaterThan(1.2);
  const composition=await page.evaluate(()=>(window as any).__myth.composition);
  const [sun,ship]=composition;
  expect(sun.x).toBeGreaterThan(1440*.65);
  expect(sun.y).toBeLessThan(1000*.3);
  expect(sun.top).toBeGreaterThan(40);
  expect(sun.x).toBeGreaterThan(ship.x);
  const basket=await page.evaluate(()=>(window as any).__myth.basket);
  expect(basket.min[1]).toBeCloseTo(.001,4);
  expect(basket.min[2]).toBeGreaterThan(2.7);
  expect(basket.max[0]).toBeLessThan(-.35);
  await page.screenshot({path:'test-results/mythic-room.png'});
  await page.locator('#open-book').click();await expect(page.locator('#reader')).toBeVisible();
  await page.locator('#close-book').click();await expect(page.locator('#open-book')).toContainText('继续翻阅');
  await page.waitForTimeout(600);
  expect(await page.evaluate(()=>(window as any).__myth.supports)).toEqual(supports);
  const rose=await page.evaluate(()=>(window as any).__myth.rose);
  await page.mouse.click(rose.x,rose.y);await expect(page.locator('#reader')).toBeHidden();
  const book=await page.evaluate(()=>(window as any).__myth.book);
  await page.mouse.click(book.x,book.y);await expect(page.locator('#reader')).toBeVisible();
  await page.locator('#close-book').click();
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>(window as any).__myth.width===390);
  await page.waitForTimeout(500);
  const mobileShip=await page.evaluate(()=>(window as any).__myth.composition[1]);
  expect(mobileShip.x).toBeGreaterThan(390*.15);
  expect(mobileShip.x).toBeLessThan(390*.8);
  const clear=await page.evaluate(()=>{const {book,rose}=(window as any).__myth;return [book,rose].map(p=>({ ...p,tag:document.elementFromPoint(p.x,p.y)?.tagName,id:document.elementFromPoint(p.x,p.y)?.id }));});
  await page.screenshot({path:'test-results/mythic-mobile.png'});
  expect(clear.map(p=>p.tag)).toEqual(['CANVAS','CANVAS']);
  expect(errors).toEqual([]);
  await context.close();
});
