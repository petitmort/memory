import { test, expect, type Page } from '@playwright/test';

// Observe the real renderer immediately after drawing, before WebGL clears its
// backbuffer. The mid-transition hold also exercises the actual pause/resume path.
async function observeFog(page: Page) {
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    expect(body).toContain('const ray = new THREE.Raycaster();');
    body=body.replace('const ray = new THREE.Raycaster();',`
      window.__fogDebug={frames:[],pixels:{},holdAt:null,held:false,snapshot(){
        courtyardFog.group.updateWorldMatrix(true,true);
        const meshes=[];courtyardFog.group.traverse(object=>{if(object.isMesh)meshes.push(object);});
        const banks=meshes.find(object=>object.isInstancedMesh),depths=[];
        if(banks)for(let i=0;i<banks.count;i++){
          const matrix=new THREE.Matrix4();banks.getMatrixAt(i,matrix);matrix.premultiply(banks.matrixWorld);
          depths.push(new THREE.Vector3().setFromMatrixPosition(matrix).z);
        }
        const texture=banks?.material.uniforms.cloudMap.value;
        return{clearance:fogClearance,density:sceneFog.density,visible:courtyardFog.group.visible,
          eye:camera.position.toArray(),time:banks?.material.uniforms.time.value??0,depths,
          meshes:meshes.length,triangles:meshes.reduce((sum,mesh)=>sum+(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3*(mesh.count??1),0),
          shadow:meshes.some(mesh=>mesh.castShadow||mesh.receiveShadow),
          depthTest:banks?.material.depthTest,depthWrite:banks?.material.depthWrite,
          texture:texture?{width:texture.image.width,height:texture.image.height,bytes:texture.image.data.byteLength}:null};
      },contrast(){
        const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
        const box=new THREE.Box3().setFromObject(door,true),corners=[];
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
          corners.push(new THREE.Vector3(x,y,z).project(camera));
        }
        const xs=corners.map(p=>(p.x+1)*w/2),ys=corners.map(p=>(p.y+1)*h/2);
        const loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);
        const x=Math.max(0,Math.floor(loX-(hiX-loX)*.22)),y=Math.max(0,Math.floor(loY-(hiY-loY)*.08));
        const width=Math.min(w-x,Math.ceil((hiX-loX)*1.44)),height=Math.min(h-y,Math.ceil((hiY-loY)*1.16));
        const pixels=new Uint8Array(width*height*4);gl.readPixels(x,y,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        let sum=0,squared=0;
        for(let i=0;i<pixels.length;i+=4){const l=(pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722)/255;sum+=l;squared+=l*l;}
        const count=pixels.length/4,mean=sum/count;
        return{mean,contrast:Math.sqrt(Math.max(0,squared/count-mean*mean)),width,height};
      },record(){
        const snapshot=this.snapshot(),button=document.querySelector('#enter');
        const frame={...snapshot,locked:button.disabled,clearing:button.disabled&&current==='entry'};
        this.frames.push(frame);
        if(!this.pixels.dense&&snapshot.clearance===0)this.pixels.dense=this.contrast();
        if(!this.pixels.middle&&snapshot.clearance>.25&&snapshot.clearance<.8)this.pixels.middle=this.contrast();
        if(!this.pixels.clear&&snapshot.clearance===1)this.pixels.clear=this.contrast();
        if(this.holdAt!==null&&snapshot.clearance>=this.holdAt&&snapshot.clearance<1){
          this.holdAt=null;this.held=true;
          Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
          document.dispatchEvent(new Event('visibilitychange'));
        }
      }};
      const ray = new THREE.Raycaster();
    `);
    body=body.replaceAll('renderer.render(scene, camera);','renderer.render(scene, camera); window.__fogDebug.record();');
    await route.fulfill({response,body});
  });
}

const snapshot=(page: Page)=>page.evaluate(()=>(window as any).__fogDebug.snapshot());

test('dense courtyard mist has moving depth and clears through rendered intermediate frames',async ({browser})=>{
  test.setTimeout(180000);
  const context=await browser.newContext({viewport:{width:960,height:720},reducedMotion:'no-preference'});
  const page=await context.newPage();const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await observeFog(page);
  try{
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    await page.waitForFunction(()=>(window as any).__fogDebug.frames.length>0);
    const dense=await snapshot(page);
    expect(dense.density).toBeGreaterThanOrEqual(.25);expect(dense.clearance).toBe(0);expect(dense.visible).toBe(true);
    expect(dense.meshes).toBe(1);expect(dense.depths).toHaveLength(5);expect(new Set(dense.depths).size).toBe(5);
    expect(Math.min(...dense.depths)).toBeGreaterThan(2.7);expect(Math.max(...dense.depths)).toBeLessThan(6.3);
    expect(dense.triangles).toBeLessThanOrEqual(10);expect(dense.shadow).toBe(false);
    expect(dense.depthTest).toBe(true);expect(dense.depthWrite).toBe(false);
    expect(dense.texture.width).toBeLessThanOrEqual(512);expect(dense.texture.height).toBeLessThanOrEqual(512);
    expect(dense.texture.bytes).toBeLessThanOrEqual(1024*1024);
    await expect(page.locator('#fog')).toHaveCSS('backdrop-filter','none');
    await page.waitForFunction(time=>(window as any).__fogDebug.snapshot().time>time+.015,dense.time);
    await page.screenshot({path:'test-results/fog-dense.png'});
    await page.evaluate(()=>{(window as any).__fogDebug.frames=[];(window as any).__fogDebug.holdAt=.35;});
    await page.locator('#enter').click();
    await page.waitForFunction(()=>(window as any).__fogDebug.held,{},{timeout:60000});
    const held=await snapshot(page),heldCount=await page.evaluate(()=>(window as any).__fogDebug.frames.length);
    expect(held.clearance).toBeGreaterThanOrEqual(.35);expect(held.clearance).toBeLessThan(.6);
    await expect(page.locator('#enter')).toBeDisabled();await expect(page.locator('#room-ui')).toBeHidden();
    await page.screenshot({path:'test-results/fog-clearing.png'});
    await page.waitForTimeout(200);
    expect(await page.evaluate(()=>(window as any).__fogDebug.frames.length)).toBe(heldCount);
    expect((await snapshot(page)).time).toBe(held.time);expect((await snapshot(page)).clearance).toBe(held.clearance);
    await page.evaluate(()=>{delete (document as any).hidden;document.dispatchEvent(new Event('visibilitychange'));});
    await expect(page.locator('#enter')).toBeEnabled({timeout:60000});
    await expect(page.locator('#enter')).toContainText('推开这扇门');
    const clear=await snapshot(page),frames=await page.evaluate(()=>(window as any).__fogDebug.frames);
    const clearing=frames.filter((frame:any)=>frame.clearing);
    expect(clearing.length).toBeGreaterThanOrEqual(4);expect(clearing[0].clearance).toBe(0);
    expect(clearing.some((frame:any)=>frame.clearance>0&&frame.clearance<1)).toBe(true);
    expect(clearing.at(-1).clearance).toBe(1);expect(clearing.every((frame:any)=>frame.locked)).toBe(true);
    for(let i=1;i<clearing.length;i++)expect(clearing[i].clearance).toBeGreaterThanOrEqual(clearing[i-1].clearance);
    for(const frame of frames)expect(Math.hypot(...frame.eye.map((v:number,i:number)=>v-dense.eye[i]))).toBeLessThan(.000001);
    expect(frames[heldCount].time).toBeCloseTo(held.time,8);
    expect(clear.visible).toBe(false);expect(clear.clearance).toBe(1);expect(clear.density).toBeCloseTo(.005,6);
    const pixels=await page.evaluate(()=>(window as any).__fogDebug.pixels);
    expect(pixels.middle).toBeTruthy();
    // Same eye and same doorway: fog must visibly suppress architectural
    // contrast, rather than merely changing an invisible uniform or CSS blur.
    expect(pixels.clear.contrast).toBeGreaterThan(pixels.dense.contrast*1.2);
    expect(Math.abs(pixels.clear.mean-pixels.dense.mean)).toBeGreaterThan(.035);
    await page.screenshot({path:'test-results/fog-clear-door.png'});
    await test.info().attach('fog-rendering',{body:JSON.stringify({dense,held,clear,pixels,frames:clearing},null,2),contentType:'application/json'});
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('mobile keeps dense fog and usable intro, and losing WebGL during clearing preserves reading',async ({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage();const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await observeFog(page);
  try{
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    await page.waitForFunction(()=>(window as any).__fogDebug.frames.length>0);
    const dense=await snapshot(page);expect(dense.density).toBeGreaterThanOrEqual(.25);expect(dense.visible).toBe(true);
    await expect(page.locator('#intro h1')).toBeVisible();await expect(page.locator('#enter')).toBeEnabled();
    await expect(page.locator('#fog')).toHaveAttribute('aria-hidden','true');
    const hit=await page.locator('#enter').evaluate(button=>{
      const rect=button.getBoundingClientRect(),target=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
      return{clickable:target?.closest('#enter')===button,inside:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight};
    });
    expect(hit).toEqual({clickable:true,inside:true});
    await page.screenshot({path:'test-results/fog-mobile-dense.png'});
    await page.locator('#enter').evaluate(button=>button.addEventListener('click',()=>{
      (window as any).__fogLossGuard={locked:(button as HTMLButtonElement).disabled,visible:(window as any).__fogDebug.snapshot().visible};
      document.querySelector<HTMLCanvasElement>('#world canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext();
    },{once:true}));
    await page.locator('#enter').click();
    expect(await page.evaluate(()=>(window as any).__fogLossGuard)).toEqual({locked:true,visible:true});
    await expect(page.locator('#fallback')).toBeVisible({timeout:10000});
    await expect(page.locator('#fog')).toBeHidden();
    await page.locator('#fallback-read').click();
    await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:10000});
    await page.locator('#next').click();await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
