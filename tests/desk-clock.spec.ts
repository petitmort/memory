import {test,expect,type Page} from '@playwright/test';
import {clockReading} from '../src/desk-clock-time';

test('device-local clock rolls hours, midnight, leap day and year without using the outdoor calendar',()=>{
  const local=(y:number,m:number,d:number,h=0,min=0,s=0)=>new Date(y,m-1,d,h,min,s).getTime();
  expect(clockReading(local(2026,10,31,9,59,59))).toMatchObject({key:'2026-10-31T09:59',hour:'09',minute:'59',date:'10月31日  周六'});
  expect(clockReading(local(2026,10,31,10))).toMatchObject({hour:'10',minute:'00'});
  expect(clockReading(local(2026,10,31,23,59)+60000)).toMatchObject({key:'2026-11-01T00:00',date:'11月01日  周日'});
  expect(clockReading(local(2028,2,28,23,59)+60000).dateKey).toBe('2028-02-29');
  expect(clockReading(local(2028,2,29,23,59)+60000).dateKey).toBe('2028-03-01');
  expect(clockReading(local(2026,12,31,23,59)+60000)).toMatchObject({key:'2027-01-01T00:00',date:'01月01日  周五'});
  for(const invalid of [NaN,Infinity,-Infinity,8.65e15])expect(()=>clockReading(invalid)).toThrow(RangeError);
});

async function instrumentClock(page:Page) {
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    const host=window as any,now=Date.now;
    host.__clockWall=new Date(2026,9,31,9,59,30).getTime();Date.now=()=>host.__clockWall??now();
    host.__clockUse={buffers:0,shaders:0};
    const upload=WebGL2RenderingContext.prototype.bufferData,compile=WebGL2RenderingContext.prototype.compileShader;
    WebGL2RenderingContext.prototype.bufferData=function(...args:any[]){host.__clockUse.buffers++;return upload.apply(this,args as never);};
    WebGL2RenderingContext.prototype.compileShader=function(shader){host.__clockUse.shaders++;return compile.call(this,shader);};
  });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    const marker='const ray = new THREE.Raycaster();';expect(body).toContain(marker);
    const call='deskClock.update(clockNow, t * 1e3, reducedMotion || current === "book");';
    const decimal=call.replace('1e3','1000');
    expect(body.includes(call)||body.includes(decimal)).toBe(true);
    body=body.replace(body.includes(call)?call:decimal,`if(!window.__clockManual) ${body.includes(call)?call:decimal}`);
    body=body.replace(marker,`
      window.__deskReview={
        snapshot(){return {clock:deskClock.snapshot(),use:{...window.__clockUse},memory:{...renderer.info.memory,programs:renderer.info.programs.length},intensity:roomLight.light.intensity};},
        step(wall,animation,reduced=false){window.__clockManual=true;deskClock.update(wall,animation,reduced);renderer.render(scene,camera);return this.snapshot();},
        resume(){window.__clockManual=false;deskClock.resume();},
        difference(){
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const a=new Uint8Array(w*h*4),b=new Uint8Array(a.length);
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
          deskClock.group.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
          deskClock.group.visible=true;renderer.render(scene,camera);
          let changed=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>6)changed++;
          return changed;
        },
        bounds(){
          scene.updateMatrixWorld(true);
          const world=new THREE.Box3().setFromObject(deskClock.group,true),points=[];
          for(const x of [world.min.x,world.max.x])for(const y of [world.min.y,world.max.y])for(const z of [world.min.z,world.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);points.push((p.x+1)*innerWidth/2);}
          const b=world.clone().applyMatrix4(table.matrixWorld.clone().invert());
          return {min:b.min.toArray(),max:b.max.toArray(),screenMin:Math.min(...points),screenMax:Math.max(...points)};
        }
      };${marker}`);
    await route.fulfill({response,body});
  });return errors;
}

for(const viewport of [{width:1280,height:800},{width:390,height:844}])test(`real desk clock is readable on the table, prewarmed and restores actual local time after reading ${viewport.width}`,async({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport,reducedMotion:'reduce',timezoneId:'Asia/Shanghai'}),page=await context.newPage();
  const errors=await instrumentClock(page);
  const snapshot=()=>page.evaluate(()=>(window as any).__deskReview.snapshot());
  try {
    await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2031-06-21T22:00&envWeather=clear&envDensity=0&envBirds=0');
    await expect(page.locator('#loading')).toBeHidden({timeout:90000});const prepared=await snapshot();
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled({timeout:45000});await page.locator('#enter').click();
    await expect(page.locator('#room-light')).toBeEnabled({timeout:45000});
    await expect(page.locator('#desk-clock-status')).toHaveText('2026年10月31日，星期六，09点59分');
    const entered=await snapshot();expect(entered.intensity).toBe(15);expect(entered.use).toEqual(prepared.use);
    expect(await page.evaluate(()=>(window as any).__deskReview.difference())).toBeGreaterThan(viewport.width===390?50:150);
    const bounds=await page.evaluate(()=>(window as any).__deskReview.bounds());
    expect(bounds.min[0]).toBeGreaterThan(-.7);expect(bounds.max[0]).toBeLessThan(.7);
    expect(bounds.min[2]).toBeGreaterThan(-.375);expect(bounds.max[2]).toBeLessThan(.375);
    expect(bounds.min[1]).toBeCloseTo(.75,4);
    expect(bounds.screenMin).toBeGreaterThan(0);expect(bounds.screenMax).toBeLessThan(viewport.width);
    const turns=await page.evaluate(()=>{
      const h=window as any,t=new Date(2026,9,31,9,59,59,900).getTime(),probe=h.__deskReview;
      probe.resume();probe.step(t,0);const start=probe.step(t+100,100),mid=probe.step(t+450,450),done=probe.step(t+900,900);
      return {start,mid,done};
    });
    expect(turns.start.clock.flipping).toBe(true);expect(turns.mid.clock.flipping).toBe(true);expect(turns.done.clock.flipping).toBe(false);
    expect(turns.mid.clock.angle).toBeGreaterThan(.1);expect(turns.mid.clock.angle).toBeLessThan(Math.PI);
    expect(turns.done.use).toEqual(entered.use);expect(turns.done.memory).toEqual(entered.memory);
    await page.evaluate(()=>{(window as any).__deskReview.resume();});
    await page.locator('#open-book').click();await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:45000});
    const reading=await snapshot();await page.evaluate(()=>{(window as any).__clockWall=new Date(2026,10,1,0,0).getTime();});
    await page.setViewportSize({width:viewport.width+10,height:viewport.height});await page.waitForTimeout(100);
    expect((await snapshot()).clock.reading).toEqual(reading.clock.reading);
    await page.locator('#close-book').click();await expect(page.locator('#room-light')).toBeEnabled({timeout:45000});
    await expect(page.locator('#desk-clock-status')).toHaveText('2026年11月1日，星期日，00点00分');
    expect((await snapshot()).clock.flipping).toBe(false);
    await page.evaluate(()=>{
      Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
      (window as any).__clockWall=new Date(2026,10,1,11,45).getTime();
      delete (document as any).hidden;document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.locator('#desk-clock-status')).toHaveText('2026年11月1日，星期日，11点45分');
    expect((await snapshot()).clock.flipping).toBe(false);expect(errors).toEqual([]);
    await expect(page.locator('#fallback')).toBeHidden();
  } finally {await context.close();}
});

test('mechanical cards cross the hinge, clock jumps snap, shared resources remain fixed and dispose once',async({page})=>{
  await page.route('**/__clock_model',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><body style="margin:0;background:#ada69b"></body>'}));
  await page.goto('/__clock_model');
  const result=await page.evaluate(async()=>{
    const clockPath='/src/desk-clock.ts',threePath='/node_modules/.vite/deps/three.js';
    const [{createDeskClock},THREE]=await Promise.all([import(clockPath),import(threePath)]);
    const clock=createDeskClock(),scene=new THREE.Scene();scene.add(clock.group);
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(720,420);renderer.setPixelRatio(1);
    scene.background=new THREE.Color('#ada69b');scene.add(new THREE.HemisphereLight('#fff3e0','#6d6672',2));
    const light=new THREE.DirectionalLight('#ffffff',3);light.position.set(-1,3,4);scene.add(light);
    const camera=new THREE.PerspectiveCamera(30,720/420,.01,10);camera.position.set(.06,.2,.76);camera.lookAt(0,.085,0);
    document.body.append(renderer.domElement);
    const geometries=new Set<any>(),materials=new Set<any>(),textures=new Set<any>();
    clock.group.traverse((o:any)=>{if(o.isMesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if((v as any)?.isTexture)textures.add(v);for(const v of Object.values(m.uniforms??{}))if((v as any)?.value?.isTexture)textures.add((v as any).value);}}});
    const t=new Date(2026,9,31,15,59,59,900).getTime(),images:any[]=[],states:any[]=[];
    const draw=(name:string,wall:number,animation:number,reduced=false)=>{clock.update(wall,animation,reduced);renderer.render(scene,camera);const state=clock.snapshot();states.push({name,...state});images.push({name,png:renderer.domElement.toDataURL('image/png')});};
    clock.resume();draw('old',t,0);draw('start',t+100,100);draw('front',t+300,300);draw('back',t+650,650);draw('settled',t+1000,1000);
    clock.resume();clock.update(t+4*3600000,1100,false);const resumed=clock.snapshot();
    clock.update(t-24*3600000,1200,false);const backward=clock.snapshot();
    clock.resume();clock.update(t,2000,false);clock.update(t+100,2100,true);const reduced=clock.snapshot();
    const beforeJump=new Date(2026,9,31,9,59,50).getTime();clock.resume();clock.update(beforeJump,2200,false);
    clock.update(beforeJump+20000,2216,false);const forwardJump=clock.snapshot();
    const midnight=new Date(2026,10,1,0,0).getTime();clock.resume();clock.update(midnight-100,2300,false);
    clock.update(midnight,2400,false);const dateTurn=clock.snapshot();clock.update(midnight+800,3200,false);
    for(let i=0;i<120;i++){clock.update(t+i*60000,3000+i*1000,true);renderer.render(scene,camera);}
    const after={...renderer.info.memory},counts={geometry:geometries.size,material:materials.size,texture:textures.size};
    const disposed={geometry:0,material:0,texture:0};
    for(const [key,set]of [['geometry',geometries],['material',materials],['texture',textures]] as const)for(const r of set)r.addEventListener('dispose',()=>{disposed[key]++;});
    clock.dispose();clock.dispose();renderer.dispose();
    return {states,images,resumed,backward,reduced,forwardJump,dateTurn,counts,disposed,after};
  });
  expect(result.states.find(s=>s.name==='front').flipping).toBe(true);
  expect(result.states.find(s=>s.name==='front').angle).toBeLessThan(Math.PI/2);
  expect(result.states.find(s=>s.name==='back').angle).toBeGreaterThan(Math.PI/2);
  expect(result.states.at(-1).flipping).toBe(false);
  expect(result.resumed.flipping).toBe(false);expect(result.resumed.reading).toMatchObject({hour:"19",minute:"59"});
  expect(result.backward.flipping).toBe(false);expect(result.backward.reading.dateKey).toBe("2026-10-30");
  expect(result.reduced.flipping).toBe(false);expect(result.reduced.reading).toMatchObject({hour:"16",minute:"00"});
  expect(result.forwardJump.flipping).toBe(false);expect(result.forwardJump.reading).toMatchObject({hour:'10',minute:'00'});
  expect(result.dateTurn.cells.find(c=>c.name==='date').active).toBe(true);expect(result.dateTurn.reading.date).toBe('11月01日  周日');
  expect(result.counts.geometry).toBeLessThanOrEqual(8);expect(result.counts.texture).toBeLessThanOrEqual(2);
  expect(result.after.geometries).toBe(result.counts.geometry);expect(result.after.textures).toBe(result.counts.texture);
  expect(result.disposed).toEqual(result.counts);
  const {mkdir,writeFile}=await import('node:fs/promises');
  const evidence=process.env.DESK_CLOCK_EVIDENCE??'/tmp/memory-desk-clock';await mkdir(evidence,{recursive:true});
  for(const shot of result.images)await writeFile(evidence+'/'+shot.name+'.png',Buffer.from(shot.png.split(',')[1],'base64'));
  await writeFile(evidence+'/model.json',JSON.stringify({...result,images:undefined},null,2));
});
