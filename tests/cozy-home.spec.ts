import { openRoomSettings } from './helpers/room-settings';
import {test,expect,type Page} from '@playwright/test';
import * as THREE from 'three';
import {createCozyLamp} from '../src/cozy-lamp';
import {consoleLayout} from '../src/interior-layout';
import {createSeatingSupportSampler} from '../src/cozy-textiles';

test('indexed static chair support agrees with actual raycasting for height, back contact and face sides',()=>{
  const seating=new THREE.Group(),material=new THREE.MeshStandardMaterial();
  const body=new THREE.Mesh(new THREE.SphereGeometry(.4,40,24),material);
  body.position.set(-.03,.42,0);body.scale.set(1,.9,1.1);body.rotation.set(.12,.18,-.1);seating.add(body);
  const seat=new THREE.Mesh(new THREE.BoxGeometry(.5,.035,.4),material);seat.position.set(.03,.44,.2);seat.rotation.y=.15;seating.add(seat);
  const backMaterial=material.clone();backMaterial.side=THREE.BackSide;
  const back=new THREE.Mesh(new THREE.PlaneGeometry(.35,.2),backMaterial);back.position.set(0,.65,-.3);seating.add(back);
  seating.updateMatrixWorld(true);
  const ray=new THREE.Raycaster();
  for(const axis of ['y','z'] as const){
    const sample=createSeatingSupportSampler(seating,axis);
    for(let i=0;i<19;i++)for(let j=0;j<17;j++){
      const u=-.5+i/18,v=(axis==='y'?-.5:0)+j/16;
      ray.set(axis==='y'?new THREE.Vector3(u,1.5,v):new THREE.Vector3(u,v,1.5),axis==='y'?new THREE.Vector3(0,-1,0):new THREE.Vector3(0,0,-1));
      const expected=ray.intersectObject(seating,true)[0]?.point[axis],actual=sample(u,v,1.5);
      if(expected===undefined)expect(actual).toBeUndefined();else expect(actual).toBeCloseTo(expected,8);
    }
  }
  body.geometry.dispose();seat.geometry.dispose();back.geometry.dispose();material.dispose();backMaterial.dispose();
});

test('small lamp fits the console and shares the existing light control without extra shadows or toggle resources',()=>{
  const fabric=new THREE.Texture(),lamp=createCozyLamp(fabric),scene=new THREE.Scene();scene.add(lamp.group);
  const bounds=new THREE.Box3().setFromObject(lamp.group);
  expect(bounds.min.y).toBeCloseTo(consoleLayout.height+.0003,4);
  expect(bounds.max.y-bounds.min.y).toBeLessThan(.32);
  expect(Math.max(Math.abs(bounds.min.x-consoleLayout.x),Math.abs(bounds.max.x-consoleLayout.x))).toBeLessThan(.16);
  expect(lamp.light.intensity).toBe(0);expect(lamp.shade.emissiveIntensity).toBe(0);
  const settings={enabled:true,color:'#ffd6a3',brightness:50};
  lamp.setLighting(settings,true,false);expect(lamp.light.intensity).toBeCloseTo(.7);
  lamp.setLighting({...settings,color:'#557dff'},true,true);
  expect(lamp.light.intensity).toBeCloseTo(.55);expect(lamp.light.color.getHexString()).toBe('557dff');
  expect(lamp.shade.emissive.getHexString()).toBe('557dff');
  for(const [active,enabled,brightness] of [[false,true,50],[true,false,50],[true,true,0]] as const){
    lamp.setLighting({...settings,enabled,brightness},active,false);
    expect(lamp.light.intensity).toBe(0);expect(lamp.shade.emissiveIntensity).toBe(0);
  }
  expect(lamp.light.visible).toBe(true);expect(lamp.light.castShadow).toBe(false);
  let disposed=0;const release=lamp.light.shadow.dispose;
  lamp.light.shadow.dispose=function(){disposed++;release.call(this);};
  lamp.dispose();lamp.dispose();lamp.setLighting(settings,true,false);
  expect(disposed).toBe(1);expect(lamp.light.intensity).toBe(0);expect(lamp.light.parent).toBeNull();
});

async function instrument(page:Page){
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.addInitScript(()=>{
    const h=window as any;h.__homeUse={buffers:0,shaders:0};
    const buffer=WebGL2RenderingContext.prototype.bufferData,compile=WebGL2RenderingContext.prototype.compileShader;
    WebGL2RenderingContext.prototype.bufferData=function(...args:any[]){h.__homeUse.buffers++;return buffer.apply(this,args as never);};
    WebGL2RenderingContext.prototype.compileShader=function(shader){h.__homeUse.shaders++;return compile.call(this,shader);};
  });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch(),source=await response.text(),marker='const ray = new THREE.Raycaster();';expect(source).toContain(marker);
    await route.fulfill({response,body:source.replace(marker,`
      const homeReleases={};
      const homeResources=new Set([homeFabric]);
      for(const root of [cozyLamp.group,textiles.group,rug])root.traverse(o=>{
        if(o.isMesh){homeResources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])homeResources.add(m);}
      });
      for(const resource of homeResources){homeReleases[resource.uuid]=0;resource.addEventListener('dispose',()=>homeReleases[resource.uuid]++);}
      window.__home={
        snapshot(){
          scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
          const inverse=lounge.group.matrixWorld.clone().invert();
          const bounds=(object,local=false)=>{
            const box=new THREE.Box3(),p=new THREE.Vector3();
            object.traverse(o=>{if(o.isMesh){for(let i=0;i<o.geometry.attributes.position.count;i++){
              o.getVertexPosition(i,p);p.applyMatrix4(o.matrixWorld);if(local)p.applyMatrix4(inverse);box.expandByPoint(p);
            }}});return{min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new THREE.Vector3()).toArray()};
          };
          const supportRay=new THREE.Raycaster(),cloth=textiles.group.getObjectByName('oatmeal-draped-throw'),pos=cloth.geometry.attributes.position;
          const clearances=[];
          for(let i=0;i<pos.count/2;i++){
            const p=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(cloth.matrixWorld);
            supportRay.set(p.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0));
            const hit=supportRay.intersectObject(lounge.group,true).find(h=>h.object.name.startsWith('beanbag-')&&h.object.isMesh);
            if(hit)clearances.push(p.y-hit.point.y);
          }
          const point=cat.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.06,0)).project(camera);
          let points=0;scene.traverse(o=>{if(o.isPointLight)points++;});
          return {light:cozyLamp.light.intensity,shade:cozyLamp.shade.emissiveIntensity,color:cozyLamp.light.color.getHexString(),
            visible:cozyLamp.group.visible,textilesVisible:textiles.group.visible,pointLights:points,
            memory:{...renderer.info.memory,programs:renderer.info.programs.length},use:{...window.__homeUse},
            lamp:bounds(cozyLamp.group),console:bounds(consoleTable),rug:bounds(rug),
            throw:bounds(cloth,true),pillow:bounds(textiles.group.getObjectByName('small-terracotta-linen-cushion'),true),cat:bounds(cat.group,true),
            clothClearance:clearances.length?Math.min(...clearances):null,
            catPoint:{x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2},releases:{...homeReleases}};
        },
        difference(){
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const a=new Uint8Array(w*h*4),b=new Uint8Array(a.length),intensity=cozyLamp.light.intensity,emissive=cozyLamp.shade.emissiveIntensity;
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
          cozyLamp.light.intensity=0;cozyLamp.shade.emissiveIntensity=0;
          renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);
          cozyLamp.light.intensity=intensity;cozyLamp.shade.emissiveIntensity=emissive;renderer.render(scene,camera);
          let changed=0;const rgb=[0,0,0];
          for(let i=0;i<a.length;i+=4){
            const delta=(a[i]-b[i])*.2126+(a[i+1]-b[i+1])*.7152+(a[i+2]-b[i+2])*.0722;
            if(delta>2)changed++;for(let c=0;c<3;c++)rgb[c]+=Math.max(0,a[i+c]-b[i+c]);
          }return{changed,rgb};
        },
        reactionClearance(){
          // Cloth is static: fit/raycast it once, then sample only the moving
          // cat vertices. Repeating the support raycasts for every pose would
          // measure test overhead instead of checking animation clearance.
          const fixed=this.snapshot(),inverse=lounge.group.matrixWorld.clone().invert();
          const meshes=[],p=new THREE.Vector3();
          cat.group.traverse(o=>{if(o.isMesh)meshes.push(o);});
          let minimum=Infinity;const reactions=[];
          for(let gesture=0;gesture<6;gesture++){
            const start=10000+gesture*10;
            cat.cancelPet();
            if(!cat.pet(start,false))throw new Error('Animation clearance probe did not start a real reaction');
            reactions.push(cat.getReaction().id);
            for(let i=0;i<=88;i++){
              const t=i*.05;cat.setReactionClock(()=>t);cat.update(start+t,false);
              cat.group.updateMatrixWorld(true);
              for(const mesh of meshes)for(let j=0;j<mesh.geometry.attributes.position.count;j++){
                mesh.getVertexPosition(j,p);p.applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse);
                minimum=Math.min(minimum,p.x-fixed.throw.max[0],p.z-fixed.pillow.max[2]);
              }
            }
          }
          cat.cancelPet();cat.update(simulationTime,true);cat.cancelPet();
          return {minimum,reactions};
        }
      };${marker}`)});
  });return errors;
}

for(const width of [1280,390])test(`cozy furnishing keeps cat, book and controls usable and releases shared resources once ${width}`,async({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width,height:width===390?844:800},reducedMotion:'reduce'}),page=await context.newPage();
  const errors=await instrument(page),snapshot=()=>page.evaluate(()=>(window as any).__home.snapshot());
  try{
    await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T22:00&envWeather=clear&envDensity=0&envBirds=0&envPhase=0');
    await expect(page.locator('#loading')).toBeHidden({timeout:90000});const prepared=await snapshot();
    expect(prepared.light).toBe(0);expect(prepared.shade).toBe(0);expect(prepared.visible).toBe(false);expect(prepared.textilesVisible).toBe(false);
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled({timeout:45000});await page.locator('#enter').click();
    await expect(page.locator('#room-light')).toBeEnabled({timeout:45000});const initial=await snapshot();
    expect(initial.visible).toBe(true);expect(initial.textilesVisible).toBe(true);expect(initial.pointLights).toBe(2);
    expect(initial.light).toBeCloseTo(.7);expect(initial.use).toEqual(prepared.use);
    expect(initial.lamp.min[1]-initial.console.max[1]).toBeCloseTo(.0003,3);
    expect(initial.rug.min[1]).toBeCloseTo(0,4);expect(initial.rug.max[1]).toBeCloseTo(.008,4);
    expect(initial.rug.size[0]).toBeCloseTo(2.4,4);expect(initial.rug.size[2]).toBeCloseTo(1.75,4);
    expect(initial.clothClearance).toBeGreaterThan(.001);
    expect(initial.throw.max[0]).toBeLessThan(initial.cat.min[0]-.008);
    // The small cushion rests behind the cat; local coordinates avoid an inflated rotated world AABB.
    expect(initial.pillow.max[2]).toBeLessThan(initial.cat.min[2]-.01);
    const reactions=await page.evaluate(()=>(window as any).__home.reactionClearance());
    expect(reactions.minimum).toBeGreaterThan(.008);
    expect(new Set(reactions.reactions).size).toBe(6);
    if(width===1280){
      const warm=await page.evaluate(()=>(window as any).__home.difference());
      expect(warm.changed).toBeGreaterThan(500);expect(warm.rgb[0]).toBeGreaterThan(warm.rgb[2]);
    }
    await openRoomSettings(page); await page.locator('#room-light').click();await page.locator('#room-light-color').fill('#557dff');
    expect((await snapshot()).color).toBe('557dff');
    await page.locator('#room-light-brightness').fill('25');expect((await snapshot()).light).toBeCloseTo(.35);
    await page.locator('#room-light-toggle').click();const off=await snapshot();expect(off.light).toBe(0);expect(off.shade).toBe(0);
    expect(await page.evaluate(()=>(window as any).__home.difference())).toEqual({changed:0,rgb:[0,0,0]});
    await page.locator('#room-light-toggle').click();await page.keyboard.press('Escape');
    expect((await snapshot()).use).toEqual(initial.use);expect((await snapshot()).memory).toEqual(initial.memory);
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true',{timeout:45000});
    const nook=await snapshot();await page.mouse.click(nook.catPoint.x,nook.catPoint.y);
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','false',{timeout:45000});
    await page.locator('#open-book').click();await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:45000});
    await page.locator('#next').click();await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    await page.locator('#close-book').click();await expect(page.locator('#room-light')).toBeEnabled({timeout:45000});
    expect((await snapshot()).light).toBeCloseTo(.35);
    await page.locator('#quality').click();const low=await snapshot();expect(low.light).toBeCloseTo(.275);
    await page.locator('#quality').click();expect((await snapshot()).light).toBeCloseTo(.35);
    await test.info().attach('cozy-home',{body:JSON.stringify({prepared,initial,nook,low},null,2),contentType:'application/json'});
    await page.locator('#world canvas').evaluate(canvas=>(canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
    await expect(page.locator('#fallback')).toBeVisible();
    const released=await snapshot();expect(Object.values(released.releases)).toEqual(Object.keys(released.releases).map(()=>1));
    expect(released.light).toBe(0);expect(released.shade).toBe(0);
    await page.locator('#fallback-read').click();await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready');
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
