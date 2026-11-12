import { openRoomSettings } from './helpers/room-settings';
import {test, expect, type Page} from '@playwright/test';
import * as THREE from 'three';
import {createReadingDetails} from '../src/reading-details';

test('closed books rest on the console and share a supported contact plane throughout the stack', () => {
  const fabric = new THREE.Texture(), group = createReadingDetails(fabric);
  const covers = group.getObjectByName('reading-book-cloth-covers') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  const bounds = new THREE.Box3().setFromObject(group);
  expect(bounds.min.y).toBeCloseTo(.78, 6);expect(bounds.max.y).toBeLessThan(.81);
  covers.material.side = THREE.DoubleSide;
  const ray = new THREE.Raycaster();
  for (const x of [-.03, 0, .03]) for (const z of [-.025, 0, .025]) {
    const point = group.localToWorld(new THREE.Vector3(x, 0, z));
    ray.set(new THREE.Vector3(point.x, 1.2, point.z), new THREE.Vector3(0, -1, 0));
    const hits = ray.intersectObject(covers), contacts = hits.filter(hit => hits.some(other =>
      Math.abs(other.point.y - hit.point.y) < 1e-7 && other.face!.normal.y * hit.face!.normal.y < -.99));
    expect(contacts.length).toBeGreaterThan(1);
    const planes = new Set(contacts.map(hit => hit.point.y.toFixed(6)));
    expect(planes.size).toBe(1);
    const bottom = hits.at(-1)!;expect(bottom.point.y).toBeCloseTo(.78, 6);expect(bottom.face!.normal.y).toBeLessThan(-.99);
  }
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(object => {if (object instanceof THREE.Mesh) {geometries.add(object.geometry);materials.add(object.material);}});
  geometries.forEach(geometry => geometry.dispose());materials.forEach(material => material.dispose());fabric.dispose();
});

async function observe(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {if (message.type() === 'error') errors.push(message.text());});
  await page.addInitScript(() => {
    const host = window as any;host.__readingUse = {buffers: 0, shaders: 0};
    const buffer = WebGL2RenderingContext.prototype.bufferData, compile = WebGL2RenderingContext.prototype.compileShader;
    WebGL2RenderingContext.prototype.bufferData = function(...args: any[]) {host.__readingUse.buffers++;return buffer.apply(this, args as never);};
    WebGL2RenderingContext.prototype.compileShader = function(shader) {host.__readingUse.shaders++;return compile.call(this, shader);};
  });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(), source = await response.text(), marker = 'const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({response, body: source.replace(marker, `
      const readingResources=new Set([homeFabric]),readingReleases={};
      readingDetails.traverse(o=>{if(o.isMesh){readingResources.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])readingResources.add(m);}});
      for(const resource of readingResources){readingReleases[resource.uuid]=0;resource.addEventListener('dispose',()=>readingReleases[resource.uuid]++);}
      window.__readingDetails={
        snapshot(){
          scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
          const inverse=consoleTable.matrixWorld.clone().invert();
          const bounds=object=>{const box=new THREE.Box3(),p=new THREE.Vector3();object.traverse(o=>{if(o.isMesh){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){p.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).applyMatrix4(inverse);box.expandByPoint(p);}}});return{min:box.min.toArray(),max:box.max.toArray()};};
          const books=bounds(readingDetails),tray=scene.getObjectByName('vintage-console-serving-tray'),dish=bounds(tray),lamp=bounds(cozyLamp.group),vessel=bounds(scene.getObjectByName('classical-relief-amphora'));
          const point=readingDetails.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.013,0)).project(camera);
          return{visible:readingDetails.visible,books,dish,lamp,vessel,table:bounds(consoleTop),
            screen:{x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2},
            memory:{...renderer.info.memory,programs:renderer.info.programs.length},use:{...window.__readingUse},
            versions:readingDetails.children.map(o=>o.geometry.attributes.position.version),releases:{...readingReleases}};
        },
        pixels(){
          const gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,a=new Uint8Array(w*h*4),b=new Uint8Array(a.length),visible=readingDetails.visible;
          try{renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);readingDetails.visible=false;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);}
          finally{readingDetails.visible=visible;renderer.render(scene,camera);}
          let changed=0;for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)changed++;return changed;
        }
      };${marker}`)});
  });
  return errors;
}

for (const width of [1280, 390]) test(`B2 books preserve furniture clearance, first-use warmth and lifecycle ${width}`, async ({browser}) => {
  test.setTimeout(120000);
  const context = await browser.newContext({viewport: {width, height: width === 390 ? 844 : 800}, reducedMotion: 'reduce'});
  const page = await context.newPage(), errors = await observe(page), snapshot = () => page.evaluate(() => (window as any).__readingDetails.snapshot());
  try {
    await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T12:00&envWeather=clear&envDensity=0&envBirds=0&envPhase=0');
    await expect(page.locator('#loading')).toBeHidden({timeout: 90000});
    const prepared = await snapshot();expect(prepared.visible).toBe(false);
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
    await expect(page.locator('#room-light')).toBeEnabled({timeout: 45000});
    const entered = await snapshot();expect(entered.visible).toBe(true);expect(entered.use).toEqual(prepared.use);
    expect(entered.books.min[1]).toBeCloseTo(entered.table.max[1], 5);
    for (const object of [entered.books, entered.dish]) for (const axis of [0, 2]) {
      expect(object.min[axis] - entered.table.min[axis]).toBeGreaterThan(.015);
      expect(entered.table.max[axis] - object.max[axis]).toBeGreaterThan(.015);
    }
    expect(entered.dish.min[2] - entered.books.max[2]).toBeGreaterThan(.003);
    expect(entered.books.min[0] - entered.lamp.max[0]).toBeGreaterThan(.05);
    expect(entered.vessel.min[0] - entered.books.max[0]).toBeGreaterThan(.05);
    const pixels = width === 1280 ? await page.evaluate(() => (window as any).__readingDetails.pixels()) : null;
    if (width === 1280) {expect(entered.screen.x).toBeGreaterThan(0);expect(pixels).toBeGreaterThan(80);}
    else expect(entered.screen.x).toBeLessThan(0);
    await openRoomSettings(page); await page.locator('#room-light').click();await page.locator('#room-light-color').fill('#557dff');
    await page.locator('#room-light-toggle').click();await page.locator('#room-light-toggle').click();await page.keyboard.press('Escape');
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed', 'false');
    await page.locator('#open-book').click();await expect(page.locator('#reader')).toHaveAttribute('data-phase', 'ready', {timeout: 45000});
    await page.locator('#next').click();await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    await page.locator('#close-book').click();await expect(page.locator('#room-light')).toBeEnabled({timeout: 45000});
    const returned = await snapshot();
    expect(returned.books).toEqual(entered.books);expect(returned.dish).toEqual(entered.dish);
    expect(returned.versions).toEqual(entered.versions);expect(returned.memory).toEqual(entered.memory);
    const switchQuality = async () => {await page.locator('#quality').click();await page.waitForTimeout(180);};
    await switchQuality();await switchQuality();const warmed = await snapshot();
    expect(warmed.memory.geometries).toBe(entered.memory.geometries);expect(warmed.memory.textures).toBe(entered.memory.textures);
    await switchQuality();await switchQuality();expect((await snapshot()).memory).toEqual(warmed.memory);
    await page.setViewportSize({width: 844, height: 390});expect((await snapshot()).books).toEqual(entered.books);
    await test.info().attach('reading-details', {body: JSON.stringify({prepared, entered, returned, pixels}, null, 2), contentType: 'application/json'});
    await page.locator('#world canvas').evaluate(canvas => (canvas as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
    await expect(page.locator('#fallback')).toBeVisible();
    const releases = (await snapshot()).releases;expect(Object.values(releases)).toEqual(Object.keys(releases).map(() => 1));
    expect(errors).toEqual([]);
  } finally {await context.close();}
});
