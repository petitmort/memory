import { test, expect } from '@playwright/test';

test('a sleeping tabby rests on a soft lounge and can be viewed without moving the eye',async ({browser})=>{
  test.setTimeout(180000);
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const page=await context.newPage();const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    body=body.replace('const ray = new THREE.Raycaster();',`
      window.__cozyFrames=[];
      window.__cozySnapshot=()=>{
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const bounds=object=>{const b=new THREE.Box3().setFromObject(object,true);return{min:b.min.toArray(),max:b.max.toArray(),size:b.getSize(new THREE.Vector3()).toArray()}};
        const screen=object=>{const v=object.getWorldPosition(new THREE.Vector3()).project(camera);return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2}};
        const point=lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.09,0));
        const projected=point.project(camera);
        const catScreen={x:(projected.x+1)*innerWidth/2,y:(1-projected.y)*innerHeight/2};
        const sight=new THREE.Raycaster();sight.setFromCamera(new THREE.Vector2(projected.x,projected.y),camera);
        // Dust points use a large picking tolerance and do not occlude a cat.
        let first=sight.intersectObjects(scene.children,true).find(hit=>hit.object.isMesh&&hit.object.visible)?.object,catVisible=false;
        for(;first;first=first.parent)if(first===cat.group)catVisible=true;
        let meshes=0,triangles=0;
        lounge.group.traverse(object=>{if(object.isMesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;}});
        return{position:camera.position.toArray(),target:target.toArray(),lounge:bounds(lounge.group),cat:bounds(cat.group),pad:bounds(lounge.group.getObjectByName('beanbag-yielding-seat-cushion')),console:bounds(consoleTable),desk:bounds(tabletop),catScreen,catVisible,meshes,triangles,book:screen(book),rose:screen(bouquet),visible:lounge.group.visible};
      };
      const ray = new THREE.Raycaster();
    `);
    body=body.replace('renderer.render(scene, camera);',`
      renderer.render(scene, camera);
      window.__cozyFrames.push({p:camera.position.toArray(),t:target.toArray(),breath:cat.group.getObjectByName('tabby-breathing-flank').scale.y});
    `);
    await route.fulfill({response,body});
  });
  const snapshot=()=>page.evaluate(()=>(window as any).__cozySnapshot());
  const ready=()=>expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:60000});
  try{
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    expect((await snapshot()).visible).toBe(false);
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
    await expect(page.locator('#room-ui')).toBeVisible({timeout:30000});
    const room=await snapshot();expect(room.visible).toBe(true);
    expect(room.lounge.size[0]).toBeGreaterThan(.9);expect(room.lounge.size[0]).toBeLessThan(1.15);
    expect(room.lounge.size[1]).toBeLessThan(.8);expect(room.lounge.min[1]).toBeGreaterThan(-.002);
    expect(room.desk.min[0]-room.lounge.max[0]).toBeGreaterThan(.15);
    expect(room.lounge.min[0]-room.console.max[0]).toBeGreaterThan(.06);
    expect(room.meshes).toBeLessThanOrEqual(14);expect(room.triangles).toBeLessThan(22000);
    expect(room.cat.min[1]-room.pad.max[1]).toBeGreaterThan(-.012);
    expect(room.cat.min[1]-room.pad.max[1]).toBeLessThan(.008);
    for(const axis of [0,2]){
      expect(room.cat.min[axis]).toBeGreaterThan(room.pad.min[axis]+.01);
      expect(room.cat.max[axis]).toBeLessThan(room.pad.max[axis]-.01);
    }
    await page.screenshot({path:'test-results/cozy-room.png'});
    await page.evaluate(()=>{(window as any).__cozyFrames=[];});
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true',{timeout:15000});
    const nook=await snapshot();expect(nook.catVisible).toBe(true);
    const frames=await page.evaluate(()=>(window as any).__cozyFrames);
    const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for(const frame of frames)expect(distance(frame.p,room.position)).toBeLessThan(.000001);
    expect(frames.some((frame:any)=>distance(frame.t,room.target)>.01&&distance(frame.t,nook.target)>.01)).toBe(true);
    expect(new Set(frames.map((frame:any)=>frame.breath.toFixed(7))).size).toBeGreaterThan(1);
    await page.screenshot({path:'test-results/cozy-cat.png'});
    await page.locator('#open-book').click();await ready();
    await page.locator('#close-book').click();await expect(page.locator('#room-ui')).toBeVisible({timeout:60000});
    const returned=await snapshot();expect(distance(returned.position,nook.position)).toBeLessThan(.000001);
    expect(distance(returned.target,nook.target)).toBeLessThan(.000001);
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true');
    await page.setViewportSize({width:390,height:844});
    const mobile=await snapshot();expect(mobile.catVisible).toBe(true);
    expect(mobile.catScreen.x).toBeGreaterThan(60);expect(mobile.catScreen.x).toBeLessThan(330);
    expect(mobile.catScreen.y).toBeGreaterThan(150);expect(mobile.catScreen.y).toBeLessThan(640);
    expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,mobile.catScreen)).toBe('CANVAS');
    await page.screenshot({path:'test-results/cozy-cat-mobile.png'});
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','false',{timeout:15000});
    const desk=await snapshot();expect(distance(desk.position,mobile.position)).toBeLessThan(.000001);
    for(const point of [desk.book,desk.rose])expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,point)).toBe('CANVAS');
    await test.info().attach('cozy-corner-layout',{body:JSON.stringify({room,nook,mobile},null,2),contentType:'application/json'});
    await page.locator('#cozy-view').evaluate(button=>button.addEventListener('click',()=>setTimeout(()=>{
      document.querySelector<HTMLCanvasElement>('#world canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
    },0),{once:true}));
    await page.locator('#cozy-view').click();await expect(page.locator('#fallback')).toBeVisible({timeout:10000});
    await page.locator('#fallback-read').click();await ready();
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
