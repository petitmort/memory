import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import * as THREE from 'three';
import {createRoomLight,normalizeRoomLightSettings,DEFAULT_ROOM_LIGHT,ROOM_LIGHT_STORAGE_KEY} from '../src/room-light';
import {mockExperienceScene,enterFixtureRoom} from './helpers/experience-scene';

const evidence=process.env.ROOM_LIGHT_EVIDENCE??'/tmp/memory-room-light';

test('stored light settings cannot poison the renderer and a zero-intensity switch preserves its light and lifecycle',()=>{
  expect(normalizeRoomLightSettings({enabled:'yes',color:'url(secret)',brightness:NaN})).toEqual(DEFAULT_ROOM_LIGHT);
  expect(normalizeRoomLightSettings({enabled:true,color:'#ABCDEF',brightness:150})).toEqual({enabled:true,color:'#abcdef',brightness:100});
  const controller=createRoomLight({enabled:true,color:'#ffd6a3',brightness:50}),scene=new THREE.Scene();
  scene.add(controller.light);let disposals=0;const disposeShadow=controller.light.shadow.dispose;
  controller.light.shadow.dispose=function(){disposals++;disposeShadow.call(this);};
  expect(controller.light.intensity).toBe(0);controller.setActive(true);expect(controller.light.intensity).toBeGreaterThan(0);
  for(let i=0;i<20;i++)controller.setSettings({...controller.getSettings(),enabled:i%2===0});
  expect(controller.light.visible).toBe(true);expect(scene.children).toEqual([controller.light]);
  expect(controller.light.castShadow).toBe(false);expect(controller.light.position.toArray()).toEqual([0,2.48,0]);
  controller.dispose();controller.dispose();expect(disposals).toBe(1);expect(scene.children).toHaveLength(0);
});

async function instrument(page:Page){
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
    const host=window as any;host.__lampUse={buffers:0,shaders:0};
    const upload=WebGL2RenderingContext.prototype.bufferData,compile=WebGL2RenderingContext.prototype.compileShader;
    WebGL2RenderingContext.prototype.bufferData=function(...args:any[]){host.__lampUse.buffers++;return upload.apply(this,args as never);};
    WebGL2RenderingContext.prototype.compileShader=function(shader){host.__lampUse.shaders++;return compile.call(this,shader);};
  });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch(),source=await response.text(),marker='const ray = new THREE.Raycaster();';expect(source).toContain(marker);
    await route.fulfill({response,body:source.replace(marker,`
      window.__lamp={
        snapshot(){return {settings:roomLight.getSettings(),intensity:roomLight.light.intensity,
          position:roomLight.light.position.toArray(),visible:roomLight.light.visible,
          lights:scene.children.filter(o=>o.isPointLight).length,
          memory:{...renderer.info.memory,programs:renderer.info.programs.length},use:{...window.__lampUse}};},
        difference(){
          const light=roomLight.light,intensity=light.intensity,gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const a=new Uint8Array(w*h*4),b=new Uint8Array(a.length);
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
          light.intensity=0;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
          light.intensity=intensity;renderer.render(scene,camera);
          let changed=0;const rgb=[0,0,0];
          for(let i=0;i<a.length;i+=4){
            const d=.2126*(a[i]-b[i])+.7152*(a[i+1]-b[i+1])+.0722*(a[i+2]-b[i+2]);
            if(d>2)changed++;
            for(let c=0;c<3;c++)rgb[c]+=Math.max(0,a[i+c]-b[i+c]);
          }
          return {changed,rgb};
        }
      };${marker}`)});
  });return errors;
}
async function enter(page:Page,date='2026-10-31T22:00'){
  await page.goto('/?debugEnv=1&envDate='+date+'&envWeather=clear&envDensity=0&envBirds=0');
  await expect(page.locator('#loading')).toBeHidden({timeout:90000});
  await page.locator('#enter').click();await expect(page.locator('#enter')).toHaveText('推开这扇门',{timeout:45000});
  await page.locator('#enter').click();await expect(page.locator('#room-light')).toBeEnabled({timeout:45000});
}

test('real overhead light changes room pixels and colour, remembers settings and survives reading and quality switches without shader churn',async({browser})=>{
  test.setTimeout(90000);await mkdir(evidence,{recursive:true});
  const context=await browser.newContext({viewport:{width:1280,height:800},reducedMotion:'reduce'}),page=await context.newPage();
  const errors=await instrument(page);
  try{
    await enter(page);const initial=await page.evaluate(()=>(window as any).__lamp.snapshot());
    expect(initial.intensity).toBe(0);expect(initial.lights).toBe(1);
    await page.locator('#room-light').click();await expect(page.locator('#room-light-toggle')).toHaveAttribute('aria-checked','false');
    await page.locator('#room-light-toggle').click();
    const warm=await page.evaluate(()=>(window as any).__lamp.difference());expect(warm.changed).toBeGreaterThan(5000);
    expect(warm.rgb[0]).toBeGreaterThan(warm.rgb[2]);
    await page.screenshot({path:evidence+'/night-warm-panel.png'});
    await page.locator('#room-light-color').fill('#557dff');
    const cool=await page.evaluate(()=>(window as any).__lamp.difference());
    expect(cool.changed).toBeGreaterThan(3000);expect(cool.rgb[2]/cool.rgb[0]).toBeGreaterThan(warm.rgb[2]/warm.rgb[0]*2);
    await page.locator('#room-light-brightness').fill('25');await expect(page.locator('#room-light-percentage')).toHaveText('25%');
    expect((await page.evaluate(()=>(window as any).__lamp.snapshot())).intensity).toBe(7.5);
    await page.locator('#room-light-toggle').click();expect((await page.evaluate(()=>(window as any).__lamp.difference())).changed).toBe(0);
    await page.locator('#room-light-toggle').click();
    const toggled=await page.evaluate(()=>(window as any).__lamp.snapshot());
    expect(toggled.memory).toEqual(initial.memory);expect(toggled.use).toEqual(initial.use);
    await writeFile(evidence+'/pixels.json',JSON.stringify({warm,cool,initial,toggled},null,2));
    await page.keyboard.press('Escape');await expect(page.locator('#room-light')).toBeFocused();
    await page.reload();await expect(page.locator('#loading')).toBeHidden({timeout:90000});
    const restoredEntry=await page.evaluate(()=>(window as any).__lamp.snapshot());
    expect(restoredEntry.settings).toEqual({enabled:true,color:'#557dff',brightness:25});expect(restoredEntry.intensity).toBe(0);
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
    await expect(page.locator('#room-light')).toBeEnabled({timeout:45000});
    await page.locator('#room-light').click();await expect(page.locator('#room-light-color')).toHaveValue('#557dff');
    await page.locator('#open-book').click();await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:45000});
    await expect(page.locator('#room-light-panel')).toBeHidden();expect(await page.locator('#reader').evaluate(el=>el.contains(document.activeElement))).toBe(true);
    await page.locator('#close-book').click();await expect(page.locator('#room-light')).toBeEnabled({timeout:45000});
    expect((await page.evaluate(()=>(window as any).__lamp.snapshot())).intensity).toBe(7.5);
    await page.locator('#quality').click();await page.locator('#room-light').click();await page.locator('#room-light-toggle').click();await page.locator('#room-light-toggle').click();
    expect((await page.evaluate(()=>(window as any).__lamp.snapshot())).intensity).toBe(7.5);
    expect(errors).toEqual([]);await expect(page.locator('#fallback')).toBeHidden();
  }finally{await context.close();}
});

test('unavailable browser storage keeps light controls usable and renderer failure closes the panel',async({page})=>{
  await page.addInitScript(()=>{Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new Error('Storage blocked');}});});
  await mockExperienceScene(page);await page.goto('/');await enterFixtureRoom(page);
  await page.locator('#room-light').click();await page.locator('#room-light-toggle').click();
  await page.locator('#room-light-brightness').fill('80');await expect(page.locator('#room-light-percentage')).toHaveText('80%');
  await page.evaluate(()=>(window as any).__experience.fail());
  await expect(page.locator('#fallback')).toBeVisible();await expect(page.locator('#room-light-panel')).toBeHidden();
});
