import { test, expect, type Page } from '@playwright/test';
import * as THREE from 'three';
import { writeFile } from 'node:fs/promises';
import { createCoastalEnvironment } from '../src/coastal-environment';
import { createLighthouseBeacon, sampleLighthouseBeacon } from '../src/lighthouse-beacon';
import { PIER_TOWER_SITE } from '../src/pier-layout';

const origin = { x: PIER_TOWER_SITE.x, y: PIER_TOWER_SITE.y + 6.67, z: PIER_TOWER_SITE.z };

test('emergent islands are predominantly green canopy with submerged stone shores, deterministic relief and the original five batches', () => {
  const coast = createCoastalEnvironment(), repeated = createCoastalEnvironment();
  coast.group.updateMatrixWorld(true);
  let green = 0, emerged = 0;
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  coast.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry); materials.add(object.material as THREE.Material);
    const copy = repeated.group.getObjectByName(object.name) as THREE.Mesh;
    expect(object.geometry.getAttribute('position').array).toEqual(copy.geometry.getAttribute('position').array);
    expect(object.geometry.getAttribute('color').array).toEqual(copy.geometry.getAttribute('color').array);
    if (object.userData.kind === 'submerged-reef') return;
    const position = object.geometry.getAttribute('position'), color = object.geometry.getAttribute('color');
    for (let i = 0; i < position.count; i++) {
      const worldY = position.getY(i) + object.position.y;
      if (worldY < -7.3) continue;
      emerged++;
      if (color.getY(i) > color.getX(i) * 1.12 && color.getY(i) > color.getZ(i) * 1.15) green++;
    }
    const bounds = new THREE.Box3().setFromObject(object, true);
    expect(bounds.min.y).toBeLessThan(-9.5);
    expect(bounds.max.y).toBeLessThan(0);
    expect(bounds.max.y).toBeGreaterThan(-6);
  });
  expect(emerged).toBeGreaterThan(2000); expect(green / emerged).toBeGreaterThan(.9);
  expect(geometries.size).toBe(5); expect(materials.size).toBe(2);
  expect([...materials].every(material => material.depthTest && !material.transparent)).toBe(true);
  expect(coast.group.children.some(object => object instanceof THREE.Light)).toBe(false);
});

test('land reuses the sampled cone through dawn, reduced motion and standby without changing material variants or resources', () => {
  const coast = createCoastalEnvironment();
  const mesh = coast.group.getObjectByName('distant-island-west') as THREE.Mesh;
  const material = mesh.material as THREE.MeshStandardMaterial, version = material.version;
  const key = material.customProgramCacheKey();
  for (const [time, altitude, reduced, low] of [[19000, -1, false, false], [22000, -1, true, true], [22000, 1, false, false]] as const) {
    const state = sampleLighthouseBeacon(time, altitude, { visibility: .8, precipitation: .2 }, origin, reduced, low);
    coast.updateBeacon(state);
    expect(coast.beaconState()).toEqual({ strength: state.beamStrength,
      origin: [state.origin.x, state.origin.y, state.origin.z], direction: [state.direction.x, state.direction.y, state.direction.z] });
    expect(mesh.material).toBe(material); expect(material.version).toBe(version);
    expect(material.customProgramCacheKey()).toBe(key);
  }
  coast.updateBeacon(); expect(coast.beaconState().strength).toBe(0);
  const beacon = createLighthouseBeacon(origin);
  expect((beacon.group.children[0] as THREE.Mesh).material).toHaveProperty('depthTest', true);
  beacon.dispose();
});

async function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text();
    const marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({ response, body: source.replace(marker, `
      window.__coastLight = {
        snapshot() {
          return { land:mythology.seascape.coast.beaconState(),beam:mythology.seascape.lighthouseCoast.beacon.snapshot(),
            sea:{strength:seaMat.uniforms.beaconStrength.value,direction:seaMat.uniforms.beaconDirection.value.toArray()},
            paused:environment.snapshot().paused,resources:{...renderer.info.memory,programs:renderer.info.programs.length}};
        },
        frame(phase,daylightMask=false) {
          const land=mythology.seascape.coast,coast=mythology.seascape.lighthouseCoast,state=environment.snapshot();
          const beam=coast.updateBeacon(phase,state.celestial.sun.altitude,state.weather,false,state.low);
          const setSea=beam=>{
            seaMat.uniforms.beaconPosition.value.set(beam.origin.x,beam.origin.y,beam.origin.z);
            seaMat.uniforms.beaconDirection.value.set(beam.direction.x,beam.direction.y,beam.direction.z);
            seaMat.uniforms.beaconStrength.value=beam.beamStrength;
          };
          const air=coast.beacon.group,visible=air.visible,gl=renderer.getContext();
          const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,enabled=new Uint8Array(w*h*4),disabled=new Uint8Array(w*h*4);
          const islands=land.group.children.filter(object=>object.userData.kind==='natural-island'||object.userData.kind==='far-islands');
          const boxes=islands.map(object=>{
            const box=new THREE.Box3().setFromObject(object,true),points=[];
            for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])
              points.push(new THREE.Vector3(x,y,z).project(camera));
            return {name:object.name,minX:Math.min(...points.map(p=>(p.x+1)*w/2)),maxX:Math.max(...points.map(p=>(p.x+1)*w/2)),
              minY:Math.min(...points.map(p=>(p.y+1)*h/2)),maxY:Math.max(...points.map(p=>(p.y+1)*h/2))};
          });
          let capture,maskCount=0,greenCount=0;
          try {
            setSea(beam);land.updateBeacon(beam);renderer.render(scene,camera);capture=renderer.domElement.toDataURL('image/png');
            air.visible=false;
            renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,enabled);
            land.updateBeacon();renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,disabled);
            if(daylightMask){
              const maskMaterial=new THREE.MeshBasicMaterial({color:0x000000}),saved=islands.map(o=>o.material);
              const black=new Uint8Array(w*h*4),white=new Uint8Array(w*h*4);
              try {
                islands.forEach(o=>o.material=maskMaterial);renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,black);
                maskMaterial.color.set(0xffffff);renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,white);
                for(let i=0;i<black.length;i+=4)if(white[i]-black[i]>20){maskCount++;
                  if(enabled[i+1]>enabled[i]*1.03&&enabled[i+1]>enabled[i+2]*1.015)greenCount++;}
              }finally{islands.forEach((o,i)=>o.material=saved[i]);maskMaterial.dispose();}
            }
          } finally {
            air.visible=visible;
            const restored=coast.updateBeacon(state.timestamp,state.celestial.sun.altitude,state.weather,reducedMotion,state.low);
            land.updateBeacon(restored);setSea(restored);
            renderer.render(scene,camera);
          }
          let changed=0,energy=0,sumX=0,offIsland=0;
          for(let i=0;i<enabled.length;i+=4){const delta=Math.abs(enabled[i]-disabled[i])+Math.abs(enabled[i+1]-disabled[i+1])+Math.abs(enabled[i+2]-disabled[i+2]);
            if(delta>4){const x=i/4%w,y=Math.floor(i/4/w);changed++;sumX+=x;
              if(!boxes.some(b=>x>=b.minX-1&&x<=b.maxX+1&&y>=b.minY-1&&y<=b.maxY+1))offIsland++;}energy+=delta;}
          return {phase,beam,changed,energy,centerX:changed?sumX/changed:null,offIsland,greenCount,maskCount,capture};
        }
      };${marker}`) });
  });
  return errors;
}

async function enter(page: Page, night = true, low = false) {
  await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T'+(night?'22:00':'12:00')+'&envWeather=clear&envPhase=0&envDensity=0&envBirdDensity=0&envQuality='+(low?'low':'normal'));
  await expect(page.locator('#loading')).toBeHidden({ timeout: 90000 });
  await page.locator('#enter').click(); await expect(page.locator('#enter')).toHaveText('推开这扇门');
  await page.locator('#enter').click(); await expect(page.locator('#open-book')).toBeEnabled({ timeout: 45000 });
}
const frame = (page: Page, phase: number, mask = false) => page.evaluate(({phase,mask}) => (window as any).__coastLight.frame(phase,mask), {phase,mask});
const snapshot = (page: Page) => page.evaluate(() => (window as any).__coastLight.snapshot());

test('real desktop and phone window pixels show green island slopes in daylight, including distance haze', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  for (const mobile of [false, true]) {
    const context = await browser.newContext({ viewport: mobile ? { width:390, height:844 } : { width:1280, height:800 }, reducedMotion:'reduce' });
    const page = await context.newPage(), errors = await observe(page);
    try {
      await enter(page, false, mobile);
      const result = await frame(page, 19000, true);
      const path = testInfo.outputPath(`${mobile?'phone':'desktop'}-green-islands.png`);
      await writeFile(path, Buffer.from(result.capture.split(',')[1], 'base64'));
      await testInfo.attach('green-islands', { path, contentType:'image/png' });
      console.log(JSON.stringify({mobile,green:result.greenCount,visibleIsland:result.maskCount}));
      expect(result.maskCount).toBeGreaterThan(1000);
      expect(result.greenCount/result.maskCount).toBeGreaterThan(.7);
      expect(result.changed, 'A daytime beacon must not paint a patch onto the island').toBe(0);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});

test('one rotating cone lights actual island surfaces at successive bearings and leaves the opposite sweep dark', async ({ browser }, testInfo) => {
  test.setTimeout(180000);
  for (const mobile of [false,true]) {
    const context = await browser.newContext({ viewport:mobile?{width:390,height:844}:{width:1280,height:800},reducedMotion:'reduce' });
    const page = await context.newPage(), errors = await observe(page);
    try {
      await enter(page,true,mobile);
      const before = await snapshot(page), results = [];
      for (const phase of [4000,17500,18500,19000,19500,20000,20500,21000,21500,22500]) {
        const result = await frame(page,phase), {capture,...metrics}=result;
        results.push(metrics);
        if ([18500,19500,21000].includes(phase)) {
          const path=testInfo.outputPath(`${mobile?'phone':'desktop'}-land-sweep-${phase}.png`);
          await writeFile(path,Buffer.from(capture.split(',')[1],'base64'));
          await testInfo.attach('land-sweep',{path,contentType:'image/png'});
        }
      }
      console.log(JSON.stringify({mobile,islandSweep:results}));
      expect(results[0].changed).toBe(0);
      expect(results.filter(r=>r.changed>5).length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...results.map(r=>r.energy))).toBeGreaterThan(mobile?2500:5000);
      const illuminated=results.filter(r=>r.changed>5);
      expect(Math.max(...illuminated.map(r=>r.centerX))-Math.min(...illuminated.map(r=>r.centerX))).toBeGreaterThan(40);
      expect(results.every(r=>r.offIsland===0),'Only actual land pixels may change').toBe(true);
      expect((await snapshot(page)).resources).toEqual(before.resources);
      expect(errors).toEqual([]);
    } finally { await context.close(); }
  }
});

test('the production land receiver stays in phase after reading, hidden-page recovery and a power-saving resize', async ({ page }) => {
  test.setTimeout(120000);
  await page.emulateMedia({reducedMotion:'reduce'}); const errors=await observe(page); await enter(page);
  const samePhase=async()=>{
    const state=await snapshot(page);
    expect(state.land.strength).toBe(state.beam.beamStrength);
    expect(state.land.direction).toEqual([state.beam.direction.x,state.beam.direction.y,state.beam.direction.z]);
    expect(state.sea).toEqual({strength:state.land.strength,direction:state.land.direction});
    return state;
  };
  const initial=await samePhase();
  await page.locator('#open-book').click(); await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:45000});
  const reading=await snapshot(page); await page.waitForTimeout(150);
  expect((await snapshot(page)).land).toEqual(reading.land); expect(reading.paused).toBe(true);
  await page.locator('#close-book').click();await expect(page.locator('#open-book')).toBeEnabled({timeout:45000});await samePhase();
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  const hidden=await snapshot(page);await page.waitForTimeout(150);expect((await snapshot(page)).land).toEqual(hidden.land);
  await page.evaluate(()=>{delete (document as any).hidden;document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(async()=>(await snapshot(page)).beam.timestamp).toBeGreaterThan(hidden.beam.timestamp);await samePhase();
  await page.locator('#quality').click();await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
  const powerSaving=await samePhase();
  // The first manual quality change warms the existing non-shadow variants.
  // Once both qualities have drawn, repeated changes must reuse those programs.
  await page.locator('#quality').click();await page.waitForTimeout(200);await page.locator('#quality').click();await page.waitForTimeout(200);
  const final=await samePhase();
  expect(final.resources.geometries).toBe(initial.resources.geometries);expect(final.resources.textures).toBe(initial.resources.textures);
  expect(final.resources).toEqual(powerSaving.resources);expect(errors).toEqual([]);
});
