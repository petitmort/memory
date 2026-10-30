import { test, expect } from '@playwright/test';

test('the cat can be approached smoothly, framed closely and left without losing the room view',async ({browser})=>{
  test.setTimeout(180000);
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'no-preference'});
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
        // The cloth rises into the arms; measure its support under the cat,
        // rather than treating the highest sewn edge as a flat seat plane.
        const supportRay=new THREE.Raycaster(lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0));
        const seatSupport=supportRay.intersectObject(lounge.group.getObjectByName('beanbag-yielding-seat-cushion'),false)[0]?.point.y;
        const projected=point.clone().project(camera);
        const catScreen={x:(projected.x+1)*innerWidth/2,y:(1-projected.y)*innerHeight/2};
        const catBox=new THREE.Box3().setFromObject(cat.group,true);
        const pixels=view=>{
          const corners=[];
          for(let x=0;x<2;x++)for(let y=0;y<2;y++)for(let z=0;z<2;z++){
            const p=new THREE.Vector3(x?catBox.max.x:catBox.min.x,y?catBox.max.y:catBox.min.y,z?catBox.max.z:catBox.min.z).project(view);
            corners.push({x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2});
          }
          const left=Math.min(...corners.map(p=>p.x)),right=Math.max(...corners.map(p=>p.x));
          const top=Math.min(...corners.map(p=>p.y)),bottom=Math.max(...corners.map(p=>p.y));
          return{left,right,top,bottom,width:right-left,height:bottom-top};
        };
        // Compare with the former distant view at the same aspect ratio.
        const farCamera=camera.clone();farCamera.position.copy(roomPose().p);farCamera.fov=50;
        farCamera.lookAt(point);farCamera.updateProjectionMatrix();farCamera.updateMatrixWorld(true);
        const sight=new THREE.Raycaster();sight.setFromCamera(new THREE.Vector2(projected.x,projected.y),camera);
        // Dust points use a large picking tolerance and do not occlude a cat.
        let first=sight.intersectObjects(scene.children,true).find(hit=>hit.object.isMesh&&hit.object.visible)?.object,catVisible=false;
        for(;first;first=first.parent)if(first===cat.group)catVisible=true;
        let meshes=0,triangles=0;
        lounge.group.traverse(object=>{if(object.isMesh){meshes++;triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3;}});
        const textures=[];cat.group.traverse(o=>{if(o.isMesh&&o.material.map)textures.push([o.material.map.image.width,o.material.map.image.height]);});
        const front=new THREE.Vector3(0,0,1).transformDirection(lounge.group.matrixWorld).toArray();
        const shell=lounge.group.getObjectByName('beanbag-soft-linen-shell'),positions=shell.geometry.getAttribute('position'),backWall=[];
        for(let i=0;i<positions.count;i++){
          const p=new THREE.Vector3().fromBufferAttribute(positions,i);
          if(p.y>.45&&p.z<-.39&&Math.abs(p.x)<.23)backWall.push(p.applyMatrix4(shell.matrixWorld).x+2.3);
        }
        return{front,backWall,textures,seatSupport,position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,catDistance:camera.position.distanceTo(point),farCatDistance:farCamera.position.distanceTo(point),catPixels:pixels(camera),farCatPixels:pixels(farCamera),lounge:bounds(lounge.group),cat:bounds(cat.group),pad:bounds(lounge.group.getObjectByName('beanbag-yielding-seat-cushion')),console:bounds(consoleTable),desk:bounds(tabletop),stool:bounds(stool),catScreen,catVisible,meshes,triangles,book:screen(book),rose:screen(bouquet),visible:lounge.group.visible};
      };
      const ray = new THREE.Raycaster();
    `);
    body=body.replace('renderer.render(scene, camera);',`
      renderer.render(scene, camera);
      window.__cozyFrames.push({p:camera.position.toArray(),t:target.toArray(),fov:camera.fov,moving:!!lookMotion,elapsed:lookMotion?.elapsed??null,breath:cat.group.getObjectByName('tabby-breathing-flank').scale.y});
    `);
    await route.fulfill({response,body});
  });
  const snapshot=()=>page.evaluate(()=>(window as any).__cozySnapshot());
  const ready=()=>expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:60000});
  try{
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    expect((await snapshot()).visible).toBe(false);
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled({timeout:30000});await page.locator('#enter').click();
    await expect(page.locator('#room-ui')).toBeVisible({timeout:30000});
    const room=await snapshot();expect(room.visible).toBe(true);
    expect(room.lounge.size[0]).toBeGreaterThan(.9);expect(room.lounge.size[0]).toBeLessThan(1.15);
    expect(room.lounge.size[1]).toBeLessThan(.85);expect(room.lounge.min[1]).toBeGreaterThan(-.002);
    expect(room.desk.min[0]-room.lounge.max[0]).toBeGreaterThan(.15);
    // The back sits near the left wall and the seat opens into the room.
    expect(room.front[0]).toBeGreaterThan(.97);
    expect(room.front[2]).toBeGreaterThan(.05);expect(room.front[2]).toBeLessThan(.25);
    expect(room.backWall.length).toBeGreaterThan(20);
    expect(Math.min(...room.backWall)).toBeGreaterThan(.05);
    expect(Math.max(...room.backWall)).toBeLessThan(.24);
    expect(room.lounge.min[0]).toBeLessThan(-2.15);
    expect(room.lounge.min[0]+2.3).toBeGreaterThan(.05);
    const floorGap=(a:any,b:any)=>Math.max(...[0,2].flatMap(axis=>[a.min[axis]-b.max[axis],b.min[axis]-a.max[axis]]));
    expect(floorGap(room.lounge,room.console)).toBeGreaterThan(.12);
    expect(room.meshes).toBeLessThanOrEqual(10);expect(room.triangles).toBeLessThan(36000);
    expect(room.textures).toEqual([[1024,1024]]);
    expect(room.seatSupport).toBeGreaterThan(.32);
    expect(room.cat.min[1]-room.seatSupport).toBeGreaterThan(-.012);
    expect(room.cat.min[1]-room.seatSupport).toBeLessThan(.008);
    for(const axis of [0,2]){
      expect(room.cat.min[axis]).toBeGreaterThan(room.pad.min[axis]+.01);
      expect(room.cat.max[axis]).toBeLessThan(room.pad.max[axis]-.01);
    }
    await page.screenshot({path:'test-results/cozy-room.png'});
    await page.evaluate(()=>{(window as any).__cozyFrames=[];});
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true',{timeout:15000});
    await expect(page.locator('#open-book')).toBeHidden();
    await expect(page.locator('#open-book')).toBeDisabled();
    await expect(page.locator('#scene-hint')).toBeHidden();
    const nook=await snapshot();expect(nook.catVisible).toBe(true);
    expect(nook.catDistance).toBeLessThan(2);
    expect(nook.catDistance).toBeLessThan(room.catDistance*.65);
    expect(nook.catPixels.width).toBeGreaterThan(nook.farCatPixels.width*1.7);
    expect(nook.fov).toBe(46);
    await expect(page.locator('#cozy-credit')).toBeVisible();
    await expect(page.locator('#cozy-credit')).toHaveAttribute('href','credits.html');
    const frames=await page.evaluate(()=>(window as any).__cozyFrames);
    const distance=(a:number[],b:number[])=>Math.hypot(...a.map((v,i)=>v-b[i]));
    expect(frames.length).toBeGreaterThanOrEqual(3);
    const movingFrames=frames.filter((frame:any)=>frame.moving);
    expect(movingFrames.length).toBeGreaterThanOrEqual(3);
    expect(movingFrames[0].elapsed).toBe(0);
    expect(distance(movingFrames[0].p,room.position)).toBeLessThan(.000001);
    const horizontalClearance=(p:number[],box:any)=>Math.hypot(...[0,2].map(axis=>Math.max(box.min[axis]-p[axis],0,p[axis]-box.max[axis])));
    for(const frame of frames){
      expect(frame.p[1]).toBeCloseTo(1.65,6);
      expect(Math.abs(frame.p[0])).toBeLessThan(2.1);expect(Math.abs(frame.p[2])).toBeLessThan(2.5);
      for(const furniture of [room.desk,room.stool,room.lounge])expect(horizontalClearance(frame.p,furniture)).toBeGreaterThan(.25);
    }
    expect(frames.some((frame:any)=>distance(frame.p,room.position)>.05&&distance(frame.p,nook.position)>.05)).toBe(true);
    expect(frames.some((frame:any)=>distance(frame.t,room.target)>.01&&distance(frame.t,nook.target)>.01)).toBe(true);
    expect(new Set(frames.map((frame:any)=>frame.breath.toFixed(7))).size).toBeGreaterThan(1);
    await page.screenshot({path:'test-results/cozy-cat.png'});
    await page.setViewportSize({width:390,height:844});
    await expect.poll(async()=>(await snapshot()).fov).toBe(54);
    const mobile=await snapshot();expect(mobile.catVisible).toBe(true);
    expect(distance(mobile.position,nook.position)).toBeLessThan(.000001);
    expect(mobile.catDistance).toBeLessThan(2);
    expect(mobile.catPixels.width).toBeGreaterThan(mobile.farCatPixels.width*1.35);
    expect(mobile.catPixels.width).toBeGreaterThan(150);expect(mobile.catPixels.height).toBeGreaterThan(100);
    expect(mobile.catPixels.left).toBeGreaterThan(35);expect(mobile.catPixels.right).toBeLessThan(355);
    expect(mobile.catPixels.top).toBeGreaterThan(150);expect(mobile.catPixels.bottom).toBeLessThan(640);
    expect(mobile.catScreen.x).toBeGreaterThan(60);expect(mobile.catScreen.x).toBeLessThan(330);
    expect(mobile.catScreen.y).toBeGreaterThan(150);expect(mobile.catScreen.y).toBeLessThan(640);
    expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,mobile.catScreen)).toBe('CANVAS');
    for(const point of [
      {x:mobile.catPixels.left,y:mobile.catPixels.top},{x:mobile.catPixels.right,y:mobile.catPixels.top},
      {x:mobile.catPixels.left,y:mobile.catPixels.bottom},{x:mobile.catPixels.right,y:mobile.catPixels.bottom},
    ])expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,point)).toBe('CANVAS');
    await page.screenshot({path:'test-results/cozy-cat-mobile.png'});
    await expect(page.locator('#open-book')).toBeHidden();
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','false',{timeout:15000});
    const desk=await snapshot();expect(distance(desk.position,[.55,1.65,1.15])).toBeLessThan(.000001);
    expect(distance(desk.target,[.15,1.05,-1.4])).toBeLessThan(.000001);expect(desk.fov).toBe(50);
    await expect(page.locator('#cozy-credit')).toBeHidden();
    await expect(page.locator('#open-book')).toBeVisible();
    await expect(page.locator('#open-book')).toBeEnabled();
    await page.locator('#open-book').click();await ready();
    await page.locator('#close-book').click();await expect(page.locator('#room-ui')).toBeVisible({timeout:60000});
    const returned=await snapshot();expect(distance(returned.position,desk.position)).toBeLessThan(.000001);
    expect(distance(returned.target,desk.target)).toBeLessThan(.000001);expect(returned.fov).toBe(desk.fov);
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','false');
    await expect(page.locator('#open-book')).toBeVisible();
    for(const point of [desk.book,desk.rose])expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,point)).toBe('CANVAS');
    // Rotate the phone while physically approaching. Resize must redirect the
    // remaining movement without replacing the current eye or viewing angle.
    await page.evaluate(()=>{
      (window as any).__cozyFrames=[];
      addEventListener('resize',()=>{
        (window as any).__cozyResizeBefore=(window as any).__cozySnapshot();
        queueMicrotask(()=>{(window as any).__cozyResizeAfter=(window as any).__cozySnapshot();});
      },{capture:true,once:true});
    });
    await page.locator('#cozy-view').click();
    await page.waitForFunction(()=>(window as any).__cozyFrames.some((frame:any)=>frame.moving&&frame.elapsed>50));
    await page.setViewportSize({width:1280,height:900});
    await page.waitForFunction(()=>!!(window as any).__cozyResizeAfter);
    const resize=await page.evaluate(()=>({before:(window as any).__cozyResizeBefore,after:(window as any).__cozyResizeAfter}));
    expect(distance(resize.before.position,resize.after.position)).toBeLessThan(.000001);
    expect(distance(resize.before.target,resize.after.target)).toBeLessThan(.000001);
    expect(resize.after.fov).toBeCloseTo(resize.before.fov,8);
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true',{timeout:15000});
    const resizedNook=await snapshot();expect(distance(resizedNook.position,nook.position)).toBeLessThan(.000001);
    expect(resizedNook.fov).toBe(46);expect(resizedNook.catVisible).toBe(true);
    await test.info().attach('cozy-corner-layout',{body:JSON.stringify({room,nook,mobile,resizedNook},null,2),contentType:'application/json'});
    await page.locator('#cozy-view').evaluate(button=>button.addEventListener('click',()=>setTimeout(()=>{
      document.querySelector<HTMLCanvasElement>('#world canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
    },0),{once:true}));
    await page.locator('#cozy-view').click();await expect(page.locator('#fallback')).toBeVisible({timeout:10000});
    await page.locator('#fallback-read').click();await ready();
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

for (const asset of [
  { name: 'cat model', url: /\/sleeping-tabby[^/?]*\.glb(?:\?.*)?$/, type: 'fetch' },
  { name: 'cotton cloth', url: /\/beanbag-cotton-albedo[^/?]*\.webp(?:\?.*)?$/, type: 'image' },
]) test(`a ${asset.name} download interrupted by WebGL loss cannot restart the room`,async ({page})=>{
  test.setTimeout(60000);
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  let requested!:()=>void,release!:()=>void;
  const started=new Promise<void>(resolve=>{requested=resolve;});
  const held=new Promise<void>(resolve=>{release=resolve;});
  await page.route(asset.url,async route=>{
    // Let Vite's URL-export modules load; hold only the actual asset.
    if(route.request().resourceType()!==asset.type){await route.continue();return;}
    requested();await held;
    // The browser may already have cancelled the held request.
    try{await route.continue();}catch{}
  });
  try{
    // An intentionally held HTML image delays the window load event.
    await page.goto('/',{waitUntil:'domcontentloaded'});await started;
    await expect(page.locator('#loading')).toBeVisible();
    await page.locator('#world canvas').evaluate(canvas=>{
      (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
    });
    await expect(page.locator('#fallback')).toBeVisible({timeout:10000});
    release();
    await page.locator('#fallback-read').click();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:10000});
    await page.locator('#next').click();
    await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    await page.waitForTimeout(300);
    await expect(page.locator('#room-ui')).toBeHidden();
    await expect(page.locator('#loading')).toBeHidden();
    expect(errors).toEqual([]);
  }finally{release();}
});
