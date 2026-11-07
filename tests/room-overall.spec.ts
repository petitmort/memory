import {test, expect, type Page} from '@playwright/test';

async function observe(page: Page) {
  const errors: string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch(),source=await response.text(),marker='const ray = new THREE.Raycaster();';
    expect(source).toContain(marker);
    await route.fulfill({response,body:source.replace(marker,`
      window.__overall={drawn:0,snapshot(){
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const point=p=>{const v=p.clone().project(camera);return{x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};};
        const box=new THREE.Box3().setFromObject(cat.group,true),points=[];
        for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(point(new THREE.Vector3(x,y,z)));
        const catPoint=point(lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.09,0)));
        const bouquetPoint=point(new THREE.Vector3(.06,.95,-.1).applyMatrix4(bouquet.matrixWorld));
        const tablePoints=[];
        const positions=tabletop.geometry.attributes.position;
        for(let i=0;i<positions.count;i++)tablePoints.push(point(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(tabletop.matrixWorld)));
        return{p:camera.position.toArray(),t:target.toArray(),fov:camera.fov,catPoint,bouquetPoint,catBounds:points,
          tableWidth:Math.max(...tablePoints.map(p=>p.x))-Math.min(...tablePoints.map(p=>p.x)),
          catHit:resolveInteraction({clientX:catPoint.x,clientY:catPoint.y}),
          bouquetHit:resolveInteraction({clientX:bouquetPoint.x,clientY:bouquetPoint.y}),drawn:this.drawn,
          memory:{...renderer.info.memory,programs:renderer.info.programs.length}};
      }};${marker}`).replace('renderer.render(scene, camera);','renderer.render(scene, camera); if(window.__overall)window.__overall.drawn++;')});
  });return errors;
}
const snapshot=(page:Page)=>page.evaluate(()=>(window as any).__overall.snapshot());

for(const [width,height] of [[1280,800],[1920,1080]])test(`coherent room framing keeps the cat clickable and returns continuously to the same pose ${width}`,async({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'}),page=await context.newPage(),errors=await observe(page);
  try{
    await page.goto('/?debugEnv=1&envTimeMode=scene&envDate=2026-10-31T12:00&envWeather=clear&envDensity=0&envBirds=0');
    await expect(page.locator('#loading')).toBeHidden({timeout:90000});
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
    await expect(page.locator('#room-ui')).toBeVisible({timeout:45000});
    const initial=await snapshot(page);
    // Real skinned cat bounds and nearest visible-mesh picking, not a fixture
    // anchor or a source-coordinate equality posing as visual evidence.
    for(const p of initial.catBounds){expect(p.x).toBeGreaterThan(0);expect(p.x).toBeLessThan(width);expect(p.y).toBeGreaterThan(0);expect(p.y).toBeLessThan(height);}
    expect(initial.tableWidth/width).toBeLessThan(.52);expect(initial.tableWidth/width).toBeGreaterThan(.35);
    expect(initial.fov).toBe(50);expect(initial.p[1]).toBe(1.65);
    expect(initial.catHit).toBe('cat');expect(initial.bouquetHit).toBe('bouquet');
    expect(await page.evaluate(p=>document.elementFromPoint(p.x,p.y)?.tagName,initial.catPoint)).toBe('CANVAS');
    await page.mouse.click(initial.catPoint.x,initial.catPoint.y);await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('#pet-cat')).toBeVisible();await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','false');
    for(const key of ['p','t'])for(let axis=0;axis<3;axis++)expect((await snapshot(page))[key][axis]).toBeCloseTo(initial[key][axis],8);
    const flower=(await snapshot(page)).bouquetPoint;
    await page.mouse.click(flower.x,flower.y);await expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:45000});
    const reading=await snapshot(page);await page.waitForTimeout(400);expect((await snapshot(page)).drawn).toBe(reading.drawn);
    await page.locator('#next').click();await expect(page.locator('#chapter-title')).toHaveText('把日子过成夏天');
    await page.locator('#close-book').click();await expect(page.locator('#room-ui')).toBeVisible({timeout:45000});
    const returned=await snapshot(page);for(const key of ['p','t'])for(let axis=0;axis<3;axis++)expect(returned[key][axis]).toBeCloseTo(initial[key][axis],8);expect(returned.memory).toEqual(initial.memory);
    await page.setViewportSize({width:390,height:844});
    await expect.poll(async()=>(await snapshot(page)).p).toEqual([.55,1.65,1.7]);
    await page.setViewportSize({width,height});await expect.poll(async()=>(await snapshot(page)).p.map((n:number)=>+n.toFixed(8))).toEqual(initial.p.map((n:number)=>+n.toFixed(8)));
    for(let axis=0;axis<3;axis++)expect((await snapshot(page)).t[axis]).toBeCloseTo(initial.t[axis],8);expect(errors).toEqual([]);
    await test.info().attach('room-projection',{body:JSON.stringify({initial,returned},null,2),contentType:'application/json'});
  }finally{await context.close();}
});
