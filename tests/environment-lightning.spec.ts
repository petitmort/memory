import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {THUNDERSTORM_SLOT_MS,stormEventForSlot} from '../src/storm-controller';

const evidence=process.env.LIGHTNING_EVIDENCE??'/tmp/memory-lightning-visibility';
async function probe(page:Page){
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch(),source=await response.text(),marker='const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({response,body:source.replace(marker,`
      const wallNow=Date.now.bind(Date);let frozenWall=null,sampleLow=false,sampleReduced=false;
      Date.now=()=>frozenWall??wallNow();
      window.__lightning={
        at(timestamp,low=false,reduced=false){
          frozenWall=timestamp;sampleLow=low;sampleReduced=reduced;
          seaMat.uniforms.time.value=20;environment.update(20,low,reduced,true);
          renderer.render(scene,camera);return environment.snapshot();
        },
        snapshot(){return environment.snapshot();},
        pixels(part){
          // A real scene RAF can run between evaluations; restore the sampled settings synchronously.
          if(frozenWall!==null){seaMat.uniforms.time.value=20;environment.update(20,sampleLow,sampleReduced,true);}
          const group=scene.getObjectByName('offshore-convective-storm'),bolt=scene.getObjectByName('distant-lightning-channel');
          const cloud=scene.getObjectByName('subtle-intracloud-light');
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const a=new Uint8Array(w*h*4),b=new Uint8Array(a.length);
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
          const restore=[];
          if(part==='bolt'||part==='cloud'){
            const o=part==='bolt'?bolt:cloud,before=o.visible;o.visible=false;restore.push(()=>o.visible=before);
          }else{
            const before=seaMat.uniforms.stormFlash.value;seaMat.uniforms.stormFlash.value=0;restore.push(()=>seaMat.uniforms.stormFlash.value=before);
          }
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
          restore.forEach(fn=>fn());renderer.render(scene,camera);
          let pixels=0,contrast=0,total=0,max=0;
          for(let i=0;i<a.length;i+=4){
            const d=.2126*(a[i]-b[i])+.7152*(a[i+1]-b[i+1])+.0722*(a[i+2]-b[i+2]);
            if(d>2)pixels++;if(d>18)contrast++;total+=Math.max(0,d);max=Math.max(max,d);
          }
          return {pixels,contrast,total,max};
        },
        resources(){return {...renderer.info.memory,programs:renderer.info.programs.length};}
      };${marker}`)});
  });
  return errors;
}
async function enter(page:Page,date='2026-10-01T18:45',weather='thunderstorm'){
  await page.goto('/?debugEnv=1&envTimeMode=scene&envWeather='+weather+(date?'&envDate='+date:''));
  await expect(page.locator('#loading')).toBeHidden({timeout:90000});
  await page.locator('#enter').click();await expect(page.locator('#enter')).toHaveText('推开这扇门',{timeout:45000});
  await page.locator('#enter').click();await expect(page.locator('#open-book')).toBeEnabled({timeout:45000});
}
function eventNear(at:number){
  let slot=Math.floor(at/THUNDERSTORM_SLOT_MS);
  for(let i=0;i<100;i++){
    const event=stormEventForSlot(slot+i,true);
    if(event.bolt&&event.x>-30&&event.x<5)return event;
  }
  throw new Error('No central visible discharge in sample');
}

test('lightning has a legible white channel, lit clouds and a source-aligned sea pulse in daylight, dusk and night on both screen sizes',async({browser})=>{
  test.setTimeout(150000);await mkdir(evidence,{recursive:true});
  const rows=[];
  for(const mobile of [false,true]){
    const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,reducedMotion:'no-preference'});
    const page=await context.newPage(),errors=await probe(page);
    try{
      await enter(page,'');const initial=await page.evaluate(()=>(window as any).__lightning.resources());
      for(const [name,date]of [['day','2026-06-21T08:00Z'],['dusk','2026-10-01T15:00Z'],['night','2026-10-01T21:00Z']] as const){
        const event=eventNear(Date.parse(date)),at=event.strikeTime+75;
        for(const low of [false,true]){
          const frame=await page.evaluate(({at,low})=>(window as any).__lightning.at(at,low),{at,low});
          expect(frame.storm.bolt).toBe(true);
          const pixels=await page.evaluate(()=>Object.fromEntries(['bolt','cloud','sea'].map(part=>[part,(window as any).__lightning.pixels(part)])));
          rows.push({mobile,name,low,event,pixels});
          await test.info().attach(`contrast-${mobile}-${name}-${low}`,{body:JSON.stringify({frame,pixels}),contentType:'application/json'});
          expect(pixels.bolt.contrast,'White core must be perceptible against its actual sky').toBeGreaterThan(35);
          expect(pixels.bolt.max).toBeGreaterThan(35);
          expect(pixels.cloud.pixels,'Local cloud illumination must have visible area').toBeGreaterThan(500);
          expect(pixels.sea.pixels,'The sea responds to the same visible strike').toBeGreaterThan(1000);
          if(!low)await page.screenshot({path:join(evidence,`${mobile?'phone':'desktop'}-${name}.png`)});
        }
        const faded=await page.evaluate(at=>(window as any).__lightning.at(at),event.strikeTime+600);
        expect(faded.storm.flash).toBe(0);
        const reduced=await page.evaluate(at=>(window as any).__lightning.at(at,true,true),at);
        expect(reduced.storm.flash).toBe(0);expect(reduced.storm.bolt).toBe(false);
        expect((await page.evaluate(()=>(window as any).__lightning.pixels('sea'))).pixels).toBe(0);
      }
      expect(await page.evaluate(()=>(window as any).__lightning.resources())).toEqual(initial);
      expect(errors).toEqual([]);await expect(page.locator('#fallback')).toBeHidden();
    }finally{await context.close();}
  }
  await test.info().attach('lightning-contrast',{body:JSON.stringify(rows,null,2),contentType:'application/json'});
  await writeFile(join(evidence,'contrast.json'),JSON.stringify(rows,null,2));
});

test('one preview prepares real thunderstorm weather, flashes once without changing the calendar and cancels on reading',async({page})=>{
  test.setTimeout(60000);const errors=await probe(page);
  await enter(page,'2026-10-31T16:30','few-clouds');
  await page.locator('.environment-debug summary').click();
  const button=page.locator('#env-preview-lightning');await expect(button).toBeEnabled();
  const before=await page.evaluate(()=>(window as any).__lightning.snapshot().timestamp);
  await button.click();
  await expect.poll(async()=>page.evaluate(()=>(window as any).__lightning.snapshot().storm.eventId),{timeout:12000,intervals:[16]}).toContain('preview:');
  const frame=await page.evaluate(()=>(window as any).__lightning.snapshot());
  expect(frame.timestamp-before).toBeGreaterThan(6500);expect(frame.timestamp-before).toBeLessThan(11000);
  expect(frame.weather.kind).toBe('thunderstorm');expect(frame.weather.precipitation).toBeCloseTo(1,3);
  await page.locator('.environment-debug summary').click();await expect(page.locator('#env-weather')).toHaveValue('thunderstorm');
  await button.click();
  await page.locator('#open-book').click();await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:45000});
  await page.waitForTimeout(7500);await page.locator('#close-book').click();await expect(page.locator('#open-book')).toBeEnabled({timeout:45000});
  const returned=await page.evaluate(()=>(window as any).__lightning.snapshot());expect(returned.storm.eventId??'').not.toContain('preview:');
  await page.emulateMedia({reducedMotion:'reduce'});
  await enter(page,'2026-10-31T16:30','thunderstorm');
  await page.locator('.environment-debug summary').click();await expect(button).toBeDisabled();
  await expect(page.locator('.environment-debug')).toContainText('减少动态效果');
  expect(errors).toEqual([]);
});
