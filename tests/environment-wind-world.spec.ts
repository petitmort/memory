import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { sampleWaterHeight } from '../src/water-surface';
import { stormEventForSlot, THUNDERSTORM_SLOT_MS } from '../src/storm-controller';

const evidence=process.env.WIND_WORLD_EVIDENCE??'/tmp/memory-wind-world';
async function observe(page:Page){
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch(),source=await response.text(),marker='const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({response,body:source.replace(marker,`
      const nativeWall=Date.now.bind(Date);let testWall=null;
      Date.now=()=>testWall??nativeWall();
      window.__windWorld={
        sample(at,low=false,reduced=false){
          testWall=at;seaMat.uniforms.time.value=20;environment.update(20,low,reduced,true);
          renderer.render(scene,camera);return this.snapshot();
        },
        snapshot(){return {...environment.snapshot(),waterTime:seaMat.uniforms.time.value,
          ocean:{windDirection:seaMat.uniforms.windDirection.value,windSpeed:seaMat.uniforms.windSpeed.value,windInfluence:seaMat.uniforms.windInfluence.value},
          resources:{...renderer.info.memory,programs:renderer.info.programs.length},
          oldBirds:scene.children.flatMap(root=>{const found=[];root.traverse(o=>{if(o.name.startsWith('distant-gliding-gull'))found.push(o.name)});return found}).length};},
        difference(change,restore){
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const a=new Uint8Array(w*h*4),b=new Uint8Array(a.length);
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
          change();renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
          restore();renderer.render(scene,camera);let pixels=0,total=0;
          for(let i=0;i<a.length;i+=4){const d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>3)pixels++;total+=d;}
          return {pixels,total};
        },
        objectPixels(name){const object=scene.getObjectByName(name),before=object.visible;return this.difference(()=>object.visible=false,()=>object.visible=before);},
        wavePixels(){const u=seaMat.uniforms.windDirection,before=u.value;return this.difference(()=>u.value+=Math.PI/2,()=>u.value=before);},
        sailPixels(){const sails=[];scene.traverse(o=>{if(o.isMesh&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.userData.windSail))sails.push([o,o.visible]);});
          return this.difference(()=>sails.forEach(([o])=>o.visible=false),()=>sails.forEach(([o,v])=>o.visible=v));},
      };${marker}`)});
  });
  return errors;
}
async function enter(page:Page,query:string){
  await page.goto('/?debugEnv=1&envTimeMode=scene&envQuality=normal&'+query);
  await expect(page.locator('#loading')).toBeHidden({timeout:90000});
  await page.locator('#enter').click();await expect(page.locator('#enter')).toHaveText('推开这扇门',{timeout:45000});
  await page.locator('#enter').click();await expect(page.locator('#open-book')).toBeEnabled({timeout:45000});
}
const sample=(page:Page,at:number,low=false,reduced=false)=>page.evaluate(({at,low,reduced})=>(window as any).__windWorld.sample(at,low,reduced),{at,low,reduced});
async function capture(page:Page,name:string){await mkdir(evidence,{recursive:true});await page.screenshot({path:join(evidence,name+'.png')});}

test('real room wind drives ocean pixels and boat waterlines; trimmed sails, reefs and remote islands render on desktop and phone',async({browser})=>{
  test.setTimeout(150000);
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'});
    const page=await context.newPage(),errors=await observe(page);
    try{
      await enter(page,'envWeather=clear&envWind=9&envWindDirection=0&envDensity=3&envVessel=catamaran&envRoute=left-to-right');
      const start=Date.parse('2026-06-21T09:00Z');let state=await sample(page,start);
      expect(state.oldBirds).toBe(0);expect(state.ocean).toMatchObject({windDirection:0,windSpeed:9,windInfluence:1});
      const wave=await page.evaluate(()=>(window as any).__windWorld.wavePixels());
      expect(wave.pixels).toBeGreaterThan(500);
      const far=await page.evaluate(()=>(window as any).__windWorld.objectPixels('far-horizon-archipelago'));
      expect(far.pixels,'Remote islands must contribute actual visible pixels').toBeGreaterThan(5);
      let sail={pixels:0,total:0};
      for(let step=0;step<12&&sail.pixels<3;step++){
        state=await sample(page,start+step*15000);
        sail=await page.evaluate(()=>(window as any).__windWorld.sailPixels());
      }
      expect(sail.pixels,'Wind-driven sail shaders contribute visible pixels through the window').toBeGreaterThan(2);
      expect(state.vessels.length).toBeGreaterThan(0);
      for(const boat of state.vessels){
        const height=-8+sampleWaterHeight(boat.position[0],boat.position[2],20,state.weather)*state.weather.waveScale-.09;
        expect(boat.position[1]).toBeCloseTo(height,5);expect(boat.sail).toBeTruthy();
        expect(boat.journey.wind.windSpeed).toBe(9);
      }
      expect(state.resources.geometries).toBeLessThanOrEqual(257);expect(state.resources.textures).toBeLessThanOrEqual(41);
      await capture(page,mobile?'wind-sails-phone':'wind-sails-desktop');
      const low=await sample(page,state.timestamp,true,true);expect(low.resources.geometries).toBe(state.resources.geometries);
      await expect(page.locator('#fallback')).toBeHidden();await expect(page.locator('vite-error-overlay')).toHaveCount(0);expect(errors).toEqual([]);
      await test.info().attach('wind-room-'+(mobile?'phone':'desktop'),{body:JSON.stringify({wave,far,sail,state},null,2),contentType:'application/json'});
    }finally{await context.close();}
  }
});

test('the separate thunderstorm renders stronger offshore lightning and preserves a silent reduced-motion preview',async({page})=>{
  test.setTimeout(90000);const errors=await observe(page);
  await enter(page,'envWeather=thunderstorm&envWind=12&envCloud=1');
  const base=Date.parse('2026-10-01T15:45Z');let slot=Math.floor(base/THUNDERSTORM_SLOT_MS);
  while(!stormEventForSlot(slot,true).bolt)slot++;
  const event=stormEventForSlot(slot,true);
  const state=await sample(page,event.strikeTime+75);
  expect(state.weather.kind).toBe('thunderstorm');expect(state.weather.thunder).toBe(1);
  expect(state.storm.flash).toBeGreaterThan(.1);expect(state.storm.bolt).toBe(true);
  const lightning=await page.evaluate(()=>(window as any).__windWorld.objectPixels('offshore-convective-storm'));
  expect(lightning.pixels,'Lightning and cloud illumination must change real window pixels').toBeGreaterThan(5);
  await capture(page,'active-thunderstorm');
  const reduced=await sample(page,event.strikeTime+75,false,true);
  expect(reduced.storm.flash).toBe(0);expect(reduced.storm.bolt).toBe(false);
  expect(reduced.storm.thunderTime-reduced.storm.strikeTime).toBeGreaterThan(800);expect(errors).toEqual([]);
  await test.info().attach('thunderstorm-pixels',{body:JSON.stringify({state,lightning},null,2),contentType:'application/json'});
});
