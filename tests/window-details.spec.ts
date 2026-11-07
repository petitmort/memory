import { openRoomSettings } from './helpers/room-settings';
import {test, expect, type Page} from '@playwright/test';
import * as THREE from 'three';
import {createWindowPlant, createCorkCoaster} from '../src/window-details';

test('small rosemary fits its sill and cork supports the mug with outward-facing top and bottom', () => {
  const plant = createWindowPlant(), coaster = createCorkCoaster();
  const plantBounds = new THREE.Box3().setFromObject(plant);
  const pot = plant.getObjectByName('rosemary-terracotta-pot-and-saucer')!;
  const potBounds = new THREE.Box3().setFromObject(pot);
  expect(plantBounds.getSize(new THREE.Vector3()).y).toBeGreaterThan(.18);
  expect(plantBounds.getSize(new THREE.Vector3()).y).toBeLessThan(.22);
  expect(potBounds.min.y).toBeCloseTo(.85, 6);
  expect(potBounds.min.z).toBeGreaterThan(-2.775);
  expect(potBounds.max.z).toBeLessThan(-2.575);
  expect(potBounds.getSize(new THREE.Vector3()).x).toBeLessThan(.10);
  const ray = new THREE.Raycaster(new THREE.Vector3(.045, .1, 0), new THREE.Vector3(0, -1, 0));
  const top = ray.intersectObject(coaster)[0];
  expect(top?.point.y).toBeCloseTo(.003, 6);
  expect(top?.face?.normal.y).toBeGreaterThan(.99);
  ray.set(new THREE.Vector3(.045, -.1, 0), new THREE.Vector3(0, 1, 0));
  const bottom = ray.intersectObject(coaster)[0];
  expect(bottom?.point.y).toBeCloseTo(0, 6);
  expect(bottom?.face?.normal.y).toBeLessThan(-.99);
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const root of [plant, coaster]) root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      resources.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) resources.add(material);
    }
  });
  resources.forEach(resource => resource.dispose());
});

async function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text(), marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({response, body: source.replace(marker, `
      const detailResources=new Set(),detailReleases={};
      for(const root of [windowPlant,coaster])root.traverse(o=>{if(o.isMesh){detailResources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])detailResources.add(m);}});
      for(const resource of detailResources){detailReleases[resource.uuid]=0;resource.addEventListener('dispose',()=>detailReleases[resource.uuid]++);}
      const detailVersions=()=>[...detailResources].map(r=>r.isBufferGeometry?r.attributes.position.version:r.version);
      window.__windowDetails={
        snapshot(){
          scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
          const bounds=o=>{const box=new THREE.Box3().setFromObject(o);return{min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new THREE.Vector3()).toArray()};};
          const center=windowPlant.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.12,0)).project(camera);
          return{plant:bounds(windowPlant),pot:bounds(windowPlant.getObjectByName('rosemary-terracotta-pot-and-saucer')),sill:bounds(windowSill),coaster:bounds(coaster),cup:bounds(cup),
            cupPosition:cup.position.toArray(),plantVisible:windowPlant.visible,coasterVisible:coaster.visible,
            memory:{...renderer.info.memory,programs:renderer.info.programs.length},versions:detailVersions(),releases:{...detailReleases},
            screen:{x:(center.x+1)*innerWidth/2,y:(1-center.y)*innerHeight/2}};
        },
        pixels(name){
          const object=name==='plant'?windowPlant:coaster,gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
          const a=new Uint8Array(w*h*4),b=new Uint8Array(a.length),wasVisible=object.visible;
          try{renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);object.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);}
          finally{object.visible=wasVisible;renderer.render(scene,camera);}
          let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;
          return changed;
        },
        curtainClearance(){
          const sample=createCurtains({width:D.window.width,height:D.window.height,sill:D.window.sill,back});
          const plantBox=new THREE.Box3().setFromObject(windowPlant),panel=sample.group.children[0],p=new THREE.Vector3();
          let maximumX=-Infinity,maximumZ=-Infinity;
          try{
            for(let frame=0;frame<=480;frame++){
              sample.update(frame*.25,false,20);
              const positions=panel.geometry.attributes.position;
              for(let i=0;i<positions.count;i++){
                p.fromBufferAttribute(positions,i);
                if(p.y<plantBox.min.y-.06||p.y>plantBox.max.y+.06)continue;
                maximumX=Math.max(maximumX,p.x);maximumZ=Math.max(maximumZ,p.z);
              }
            }
          }finally{
            const geometries=new Set(),materials=new Set(),textures=new Set();
            sample.group.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);if(o.material.map)textures.add(o.material.map);}});
            geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
          }
          return{gapX:plantBox.min.x-maximumX,maximumX,maximumZ};
        }
      };${marker}`)});
  });
  return errors;
}

for (const width of [1280, 390]) test(`B1 is visible, clear of curtains and supported through book, light and quality changes ${width}`, async ({browser}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({viewport: {width, height: width === 390 ? 844 : 800}, reducedMotion: 'reduce'});
  const page = await context.newPage(), errors = await observe(page);
  const snapshot = () => page.evaluate(() => (window as any).__windowDetails.snapshot());
  try {
    await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T12:00&envWeather=clear&envWind=20&envDensity=0&envBirds=0&envPhase=0');
    await expect(page.locator('#loading')).toBeHidden({timeout: 90000});
    const prepared = await snapshot();
    expect(prepared.plantVisible).toBe(false);expect(prepared.coasterVisible).toBe(false);
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
    await expect(page.locator('#room-light')).toBeEnabled({timeout: 45000});
    const entered = await snapshot();
    expect(entered.plantVisible).toBe(true);expect(entered.coasterVisible).toBe(true);
    expect(entered.pot.min[1]).toBeCloseTo(entered.sill.max[1], 5);
    for (const axis of [0, 2]) {
      expect(entered.pot.min[axis]).toBeGreaterThan(entered.sill.min[axis]);
      expect(entered.pot.max[axis]).toBeLessThan(entered.sill.max[axis]);
    }
    expect(entered.cup.min[1]).toBeCloseTo(entered.coaster.max[1], 5);
    expect(entered.cupPosition).toEqual([-.49, .753, .23]);
    expect(entered.screen.x).toBeGreaterThan(0);expect(entered.screen.x).toBeLessThan(width);
    expect(entered.screen.y).toBeGreaterThan(0);expect(entered.screen.y).toBeLessThan(600);
    const pixels = {plant: await page.evaluate(() => (window as any).__windowDetails.pixels('plant')),
      coaster: await page.evaluate(() => (window as any).__windowDetails.pixels('coaster'))};
    expect(pixels.plant).toBeGreaterThan(80);expect(pixels.coaster).toBeGreaterThan(30);
    const clearance = await page.evaluate(() => (window as any).__windowDetails.curtainClearance());
    expect(clearance.gapX).toBeGreaterThan(.03);
    await openRoomSettings(page); await page.locator('#room-light').click();await page.locator('#room-light-color').fill('#557dff');
    await page.locator('#room-light-toggle').click();await page.locator('#room-light-toggle').click();await page.keyboard.press('Escape');
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#open-book').click();await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', {timeout: 45000});
    await page.locator('#next').click();await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    await page.locator('#close-book').click();await expect(page.locator('#room-light')).toBeEnabled({timeout: 45000});
    const returned = await snapshot();
    expect(returned.plant).toEqual(entered.plant);expect(returned.coaster).toEqual(entered.coaster);expect(returned.cup).toEqual(entered.cup);
    expect(returned.versions).toEqual(entered.versions);
    expect(returned.memory).toEqual(entered.memory);
    const switchQuality = async () => {
      await page.locator('#quality').click();
      await page.waitForTimeout(180);
    };
    // Manual shadow changes warm the existing second shader variant once.
    // Geometry/textures stay fixed; subsequent full cycles reuse both variants.
    await switchQuality();await switchQuality();
    const warmed = await snapshot();
    expect(warmed.memory.geometries).toBe(entered.memory.geometries);
    expect(warmed.memory.textures).toBe(entered.memory.textures);
    await switchQuality();await switchQuality();
    expect((await snapshot()).memory).toEqual(warmed.memory);
    await page.setViewportSize({width: 844, height: 390});
    expect((await snapshot()).plant).toEqual(entered.plant);
    await test.info().attach('window-details', {body: JSON.stringify({prepared, entered, returned, clearance, pixels}, null, 2), contentType: 'application/json'});
    await page.locator('#world canvas').evaluate(canvas => (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
    await expect(page.locator('#fallback')).toBeVisible();
    const releases = (await snapshot()).releases;
    expect(Object.values(releases)).toEqual(Object.keys(releases).map(() => 1));
    expect(errors).toEqual([]);
  } finally {await context.close();}
});
