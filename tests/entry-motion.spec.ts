import { test, expect, type Page } from '@playwright/test';

type EntryFrame = {
  p: number[]; t: number[]; door: number; current: string; wall: boolean;
  gate: { elapsed: number; duration: number } | null;
  walk: { elapsed: number; duration: number; mobile: boolean } | null;
  doorCompleted: boolean; walkCompleted: boolean;
};

// Observe the real camera immediately after WebGL draws. Pauses exercise the
// production visibility handler; no debug surface is added to the application.
async function observeEntry(page: Page) {
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/, async route => {
    const response = await route.fetch(); let body = await response.text();
    expect(body).toContain('const ray = new THREE.Raycaster();');
    expect(body).toContain('renderer.render(scene, camera);');
    body = body.replace('const ray = new THREE.Raycaster();', `
      window.__entryProbe = { frames: [], hold: null, held: null, record(doorCompleted,walkCompleted) {
        const sample = {
          p:camera.position.toArray(),t:target.toArray(),door:doorPivot.rotation.y,current,wall:facade.visible,
          gate:doorPassage?{elapsed:doorPassage.elapsed,duration:doorPassage.duration}:null,
          walk:walking?{elapsed:walking.elapsed,duration:walking.duration,mobile:walking.mobile}:null,
          doorCompleted,walkCompleted,
        };
        this.frames.push(sample);
        if ((this.hold==='door'&&sample.gate?.elapsed>=100)||
            (this.hold==='walk'&&sample.walk?.elapsed>=1000)) {
          this.held=this.hold;this.hold=null;
          Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
          document.dispatchEvent(new Event('visibilitychange'));
        }
      }};
      const ray = new THREE.Raycaster();
    `).replace('renderer.render(scene, camera);',
      'renderer.render(scene, camera); window.__entryProbe.record(!!finishDoorFrame,!!finishWalkingFrame);');
    await route.fulfill({ response, body });
  });
}

const frames = (page: Page): Promise<EntryFrame[]> => page.evaluate(() => (window as any).__entryProbe.frames);
const resume = (page: Page) => page.evaluate(() => {
  delete (document as any).hidden; document.dispatchEvent(new Event('visibilitychange'));
});
async function clearFog(page: Page) {
  await page.goto('/');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 60000 });
  await page.locator('#enter').click();
  await expect(page.locator('#enter')).toBeEnabled({ timeout: 60000 });
  await expect(page.locator('#enter')).toContainText('推开这扇门');
}

test('entry curve keeps eye height and doorway clearance, with continuous speed after responsive retargeting', async ({ page }) => {
  await page.route('**/__entry-motion', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Entry motion</title>' }));
  await page.goto('/__entry-motion');
  const evidence = await page.evaluate(async () => {
    const threePath = '/node_modules/.vite/deps/three.js', entryPath = '/src/entry-motion.ts', motionPath = '/src/reading-motion.ts';
    const [THREE, { createEntryPath }, { retargetReadingPath }] = await Promise.all([import(threePath), import(entryPath), import(motionPath)]);
    const from = { p: new THREE.Vector3(.55,1.65,6.3), t: new THREE.Vector3(.12,1.2,2.7), fov:50 };
    const to = { p:new THREE.Vector3(1.1,1.65,.75), t:new THREE.Vector3(-.2,.95,-1.5), fov:50 };
    const duration = 3800, path = createEntryPath(from,to,{x:.55,y:1.65,z:2.7},duration);
    const samples = Array.from({length:1001},(_,index)=>path.sample(index/1000));
    const joinIndex = samples.findIndex(sample=>sample.p.z<=2.1), progress=joinIndex/1000;
    const initial=path.sample(progress), remaining=duration*(1-progress), step=.1;
    const destination = { p:new THREE.Vector3(.55,1.65,1.15),t:new THREE.Vector3(.15,1.05,-1.4),fov:50 };
    const redirect = retargetReadingPath(initial,destination,remaining);
    const before = path.sample(progress-step/duration), join=redirect.sample(0), after=redirect.sample(step/remaining);
    const vector=sample=>({p:sample.p.toArray(),t:sample.t.toArray(),fov:sample.fov});
    const velocity=(a,b)=>b.p.clone().sub(a.p).multiplyScalar(1/step).toArray();
    return {
      start:vector(samples[0]),end:vector(samples.at(-1)),
      startVelocity:vector(samples[0].velocity),endVelocity:vector(samples.at(-1).velocity),
      startStep:samples[1].p.distanceTo(samples[0].p),endStep:samples.at(-1).p.distanceTo(samples.at(-2).p),
      heights:samples.map(sample=>sample.p.y),
      doorXs:samples.filter(sample=>Math.abs(sample.p.z-2.7)<.3).map(sample=>sample.p.x),
      distances:samples.map(sample=>sample.p.distanceTo(to.p)),
      initial:vector(initial),join:vector(join),incoming:velocity(before,initial),outgoing:velocity(join,after),
      retargetEnd:vector(redirect.sample(1)),destination:vector(destination),
      redirected:Array.from({length:101},(_,i)=>redirect.sample(i/100).p.toArray()),
    };
  });
  for (let axis=0;axis<3;axis++) {
    expect(evidence.start.p[axis]).toBeCloseTo([.55,1.65,6.3][axis],10);
    expect(evidence.end.p[axis]).toBeCloseTo([1.1,1.65,.75][axis],10);
  }
  expect(evidence.startStep).toBeLessThan(.000001); expect(evidence.endStep).toBeLessThan(.000001);
  for (const velocity of [evidence.startVelocity,evidence.endVelocity]) {
    expect(Math.hypot(...velocity.p)).toBe(0); expect(Math.hypot(...velocity.t)).toBe(0); expect(velocity.fov).toBe(0);
  }
  expect(evidence.heights.every(y=>Math.abs(y-1.65)<.000001)).toBe(true);
  expect(evidence.doorXs.length).toBeGreaterThan(20);
  expect(Math.min(...evidence.doorXs)).toBeGreaterThan(.28); expect(Math.max(...evidence.doorXs)).toBeLessThan(.82);
  for (let i=1;i<evidence.distances.length;i++) expect(evidence.distances[i]).toBeLessThanOrEqual(evidence.distances[i-1]+.000001);
  expect(evidence.join).toEqual(evidence.initial); expect(evidence.retargetEnd).toEqual(evidence.destination);
  for (let axis=0;axis<3;axis++) expect(evidence.outgoing[axis]).toBeCloseTo(evidence.incoming[axis],6);
  expect(evidence.redirected.every(p=>Math.abs(p[1]-1.65)<.000001 && p[2]<2.1)).toBe(true);
  await test.info().attach('entry-curve',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
});

test('door draws before the eye moves, hidden tabs pause entry, and rotation preserves the doorway route', async ({ browser }) => {
  test.setTimeout(180000);
  const context=await browser.newContext({viewport:{width:960,height:720},reducedMotion:'no-preference'});
  const page=await context.newPage(), errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await observeEntry(page);
  try {
    await clearFog(page);
    const cleared=await frames(page);
    expect(cleared.every(sample=>Math.abs(sample.p[2]-6.3)<.000001&&sample.door===0&&sample.walk===null)).toBe(true);
    await page.evaluate(()=>{const probe=(window as any).__entryProbe;probe.frames=[];probe.hold='door';});
    await page.locator('#enter').click();
    await page.waitForFunction(()=>(window as any).__entryProbe.held==='door',undefined,{timeout:60000});
    const doorHold=await frames(page), heldDoor=doorHold.at(-1)!;
    expect(heldDoor.gate!.elapsed).toBeLessThan(400); expect(heldDoor.p[2]).toBeCloseTo(6.3,10); expect(heldDoor.walk).toBeNull();
    await page.waitForTimeout(650); expect(await frames(page)).toEqual(doorHold);
    await page.evaluate(()=>{const probe=(window as any).__entryProbe;probe.hold='walk';probe.held=null;});
    await resume(page);
    await page.waitForFunction(()=>(window as any).__entryProbe.held==='walk',undefined,{timeout:60000});
    const walkHold=await frames(page), heldWalk=walkHold.at(-1)!;
    expect(walkHold[doorHold.length].gate!.elapsed).toBe(heldDoor.gate!.elapsed);
    expect(walkHold[doorHold.length].door).toBe(heldDoor.door);
    expect(heldWalk.p[2]).toBeGreaterThan(2.7); expect(heldWalk.walk!.mobile).toBe(false);
    await page.setViewportSize({width:390,height:844});
    await page.waitForTimeout(650); expect(await frames(page)).toEqual(walkHold);
    await resume(page);
    await page.waitForFunction(()=>(window as any).__entryProbe.frames.some(sample=>sample.walkCompleted),undefined,{timeout:60000});
    const entry=await frames(page), resumed=entry[walkHold.length];
    expect(resumed.p).toEqual(heldWalk.p); expect(resumed.walk!.elapsed).toBe(heldWalk.walk!.elapsed);
    const doorComplete=entry.findIndex(sample=>sample.doorCompleted), firstWalk=entry.findIndex(sample=>sample.walk!==null);
    expect(doorComplete).toBeGreaterThan(0); expect(firstWalk).toBeGreaterThan(doorComplete);
    expect(entry[doorComplete].door).toBeLessThanOrEqual(-Math.PI*.45);
    expect(entry.slice(0,firstWalk).every(sample=>Math.abs(sample.p[2]-6.3)<.000001)).toBe(true);
    expect(entry[firstWalk].walk!.elapsed).toBe(0); expect(entry[firstWalk].p[2]).toBeCloseTo(6.3,10);
    const retarget=entry.find(sample=>sample.walk?.mobile);
    expect(retarget).toBeTruthy(); expect(retarget!.p[2]).toBeLessThanOrEqual(2.1); expect(retarget!.walk!.elapsed).toBe(0);
    for (const sample of entry) {
      expect(sample.p[1]).toBeCloseTo(1.65,6); expect(sample.wall).toBe(true);
      if (Math.abs(sample.p[2]-2.7)<.3) {
        expect(sample.p[0]).toBeGreaterThan(.28); expect(sample.p[0]).toBeLessThan(.82); expect(sample.door).toBeLessThan(-1.4);
      }
    }
    const crossing=entry.findIndex((sample,i)=>i>0&&sample.p[2]<2.7&&entry[i-1].p[2]>=2.7);
    expect(crossing).toBeGreaterThan(0);
    const before=entry[crossing-1],after=entry[crossing],a=(2.7-before.p[2])/(after.p[2]-before.p[2]);
    const crossingX=before.p[0]+a*(after.p[0]-before.p[0]); expect(crossingX).toBeGreaterThan(.28); expect(crossingX).toBeLessThan(.82);
    const end=entry.find(sample=>sample.walkCompleted)!;
    for (let axis=0;axis<3;axis++) {
      expect(end.p[axis]).toBeCloseTo([.55,1.65,1.15][axis],10);
      expect(end.t[axis]).toBeCloseTo([.15,1.05,-1.4][axis],10);
    }
    await page.screenshot({path:test.info().outputPath('entry-mobile-room.png')});
    await test.info().attach('rendered-entry',{body:JSON.stringify(entry,null,2),contentType:'application/json'});
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});

test('reduced motion draws an open door and an unchanged first walking frame before settling', async ({ browser }) => {
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width:960,height:720},reducedMotion:'reduce'});
  const page=await context.newPage(), errors:string[]=[]; page.on('pageerror',error=>errors.push(error.message));
  await observeEntry(page);
  try {
    await clearFog(page);
    await page.evaluate(()=>{(window as any).__entryProbe.frames=[];});
    await page.locator('#enter').click();
    await page.waitForFunction(()=>(window as any).__entryProbe.frames.some(sample=>sample.walkCompleted),undefined,{timeout:60000});
    const entry=await frames(page), doorComplete=entry.findIndex(sample=>sample.doorCompleted), firstWalk=entry.findIndex(sample=>sample.walk!==null);
    expect(doorComplete).toBeGreaterThanOrEqual(0); expect(firstWalk).toBeGreaterThan(doorComplete);
    expect(entry[doorComplete].door).toBeCloseTo(-Math.PI*.58,8); expect(entry[doorComplete].p[2]).toBeCloseTo(6.3,10);
    expect(entry[firstWalk].walk!.elapsed).toBe(0); expect(entry[firstWalk].p[2]).toBeCloseTo(6.3,10);
    const end=entry.find(sample=>sample.walkCompleted)!;
    for(let axis=0;axis<3;axis++)expect(end.p[axis]).toBeCloseTo([1.1,1.65,.75][axis],10);
    await test.info().attach('reduced-rendered-entry',{body:JSON.stringify(entry,null,2),contentType:'application/json'});
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
