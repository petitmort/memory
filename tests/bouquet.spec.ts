import {test,expect} from '@playwright/test';
import * as THREE from 'three';
import {createBouquet} from '../src/bouquet';

function geometryStats(group:THREE.Group) {
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  let triangles=0,vertices=0;
  group.traverse(o=>{if(o instanceof THREE.Mesh){
    geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);
    const count=o instanceof THREE.InstancedMesh?o.count:1;
    triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*count;
    vertices+=o.geometry.attributes.position.count*count;
    expect(o.geometry.attributes.position.array.every(Number.isFinite)).toBe(true);
  }});
  return {geometries,materials,triangles,vertices};
}
function vertices(group:THREE.Group) {
  const points:THREE.Vector3[]=[],instance=new THREE.Matrix4();group.updateMatrixWorld(true);
  group.traverse(o=>{if(o instanceof THREE.Mesh){const a=o.geometry.attributes.position;
    for(let n=0;n<(o instanceof THREE.InstancedMesh?o.count:1);n++){
      if(o instanceof THREE.InstancedMesh)o.getMatrixAt(n,instance);else instance.identity();
      const transform=new THREE.Matrix4().multiplyMatrices(o.matrixWorld,instance);
      for(let i=0;i<a.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(a,i).applyMatrix4(transform));
    }
  }});return points;
}
function release(group:THREE.Group){const stats=geometryStats(group);group.traverse(o=>{if(o instanceof THREE.InstancedMesh)o.dispose();});stats.geometries.forEach(g=>g.dispose());stats.materials.forEach(m=>m.dispose());}

test('refined bouquet has finite shared curved surfaces with a smaller triangle budget and deterministic construction',()=>{
  const a=createBouquet(),b=createBouquet(),stats=geometryStats(a);
  expect(a.userData.roseCount).toBe(9);expect(a.userData.petalCount).toBeGreaterThan(247);
  expect(stats.geometries.size).toBeLessThanOrEqual(13);expect(stats.materials.size).toBeLessThanOrEqual(6);
  expect(stats.triangles).toBeLessThan(149764);
  expect(new THREE.Box3().setFromPoints(vertices(a)).min.toArray()).toEqual(new THREE.Box3().setFromPoints(vertices(b)).min.toArray());
  expect(new THREE.Box3().setFromPoints(vertices(a)).max.toArray()).toEqual(new THREE.Box3().setFromPoints(vertices(b)).max.toArray());
  for(const material of stats.materials)for(const value of Object.values(material))expect(value instanceof THREE.Texture).toBe(false);
  release(a);release(b);
});

test('whole wrapped bouquet stays above the desktop, clear of the record player and inside its front edge throughout the move',()=>{
  const bouquet=createBouquet(),local=vertices(bouquet),from=new THREE.Vector3(.07,.8458,.04),to=new THREE.Vector3(.51,.8001,.13);
  const start=new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.12,-.25,.55));
  const end=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/2).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.32,.15,.35)));
  const scale=new THREE.Vector3(.32,.32,.32),m=new THREE.Matrix4(),q=new THREE.Quaternion(),p=new THREE.Vector3();
  const bounds:any[]=[];
  let recordClearance=Infinity;
  for(let i=0;i<=80;i++){
    const t=i/80,ease=t*t*(3-2*t);q.slerpQuaternions(start,end,ease);p.lerpVectors(from,to,ease);p.y+=Math.sin(Math.PI*t)*.027;p.z+=Math.sin(Math.PI*t)*.08;m.compose(p,q,scale);
    const transformed=local.map(v=>v.clone().applyMatrix4(m));
    const box=new THREE.Box3().setFromPoints(transformed);bounds.push({t,min:box.min.toArray(),max:box.max.toArray()});
    // Signed distance to the actual walnut case and upper lip, including their
    // rounded edges. AABB overlap alone would incorrectly reject their corners.
    for(const v of transformed)for(const [w,h,d,r,cy]of [[.40,.064,.34,.009,.804],[.395,.009,.335,.004,.839]]){
      const x=Math.abs(v.x-.34)-(w/2-r),y=Math.abs(v.y-cy)-(h/2-r),z=Math.abs(v.z+.16)-(d/2-r);
      recordClearance=Math.min(recordClearance,Math.hypot(Math.max(x,0),Math.max(y,0),Math.max(z,0))+Math.min(Math.max(x,y,z),0)-r);
    }
    expect(box.min.y,JSON.stringify(bounds.at(-1))).toBeGreaterThanOrEqual(.75);
    expect(box.min.x).toBeGreaterThan(-.7);expect(box.max.x).toBeLessThan(.7);
    expect(box.min.z).toBeGreaterThan(-.375);expect(box.max.z).toBeLessThan(.375);
  }
  expect(recordClearance).toBeGreaterThan(.004);
  expect(bounds.at(-1).min[2]).toBeGreaterThan(.0205);
  release(bouquet);
});

for(const width of [1280,390])test(`real wrapped flowers accept direct clicks, survive reading and release each shared resource once ${width}`,async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:width===390?844:800},reducedMotion:'reduce'}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch(),body=await response.text(),marker='const ray = new THREE.Raycaster();';expect(body).toContain(marker);
    await route.fulfill({response,body:body.replace(marker,`
      const bouquetGeometries=new Set(),bouquetMaterials=new Set(),bouquetInstances=[];
      const released={geometries:0,materials:0,instances:0};
      bouquet.traverse(o=>{if(o.isMesh){bouquetGeometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])bouquetMaterials.add(m);if(o.isInstancedMesh)bouquetInstances.push(o);}});
      for(const g of bouquetGeometries)g.addEventListener('dispose',()=>released.geometries++);
      for(const m of bouquetMaterials)m.addEventListener('dispose',()=>released.materials++);
      for(const mesh of bouquetInstances)mesh.addEventListener('dispose',()=>released.instances++);
      window.__bouquetReview={
        snapshot(){return {geometries:bouquetGeometries.size,materials:bouquetMaterials.size,instances:bouquetInstances.length,released:{...released},position:bouquet.position.toArray(),scale:bouquet.scale.toArray()};},
        point(){scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);const p=new THREE.Vector3(.06,.95,-.1).applyMatrix4(bouquet.matrixWorld).project(camera);return{x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};}
      };${marker}`)});
  });
  try {
    await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T12:00&envWeather=clear&envDensity=0&envBirds=0');
    await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled({timeout:30000});await page.locator('#enter').click();
    await expect(page.locator('#room-light')).toBeEnabled({timeout:30000});
    const before=await page.evaluate(()=>(window as any).__bouquetReview.snapshot());
    const point=await page.evaluate(()=>(window as any).__bouquetReview.point());
    expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,point)).toBe('CANVAS');
    await page.mouse.click(point.x,point.y);await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:45000});
    await page.locator('#close-book').click();await expect(page.locator('#room-light')).toBeEnabled({timeout:45000});
    const parked=await page.evaluate(()=>(window as any).__bouquetReview.snapshot());
    expect(parked.scale).toEqual(before.scale);expect(parked.position).toEqual([.51,.8001,.13]);
    expect(parked.released).toEqual({geometries:0,materials:0,instances:0});
    await page.evaluate(()=>document.querySelector('#world canvas')!.dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
    await expect(page.locator('#fallback')).toBeVisible();
    const disposed=await page.evaluate(()=>(window as any).__bouquetReview.snapshot());
    expect(disposed.released).toEqual({geometries:before.geometries,materials:before.materials,instances:before.instances});
    expect(errors).toEqual([]);
  } finally {await context.close();}
});
