import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { prepareCatPetting } from '../src/cat-petting';
import { CAT_REACTION_DURATION, sampleCatReaction } from '../src/cat-choreography';

/** Read geometry only: the material's photograph is exercised by the room test. */
function catGeometry() {
  const file=readFileSync(new URL('../src/assets/sleeping-tabby.glb',import.meta.url));
  const jsonLength=file.readUInt32LE(12);
  const document=JSON.parse(file.subarray(20,20+jsonLength).toString());
  const binaryOffset=20+jsonLength+8;
  const primitive=document.meshes[0].primitives[0];
  const geometry=new THREE.BufferGeometry();
  for(const [name,key,size] of [['position','POSITION',3],['normal','NORMAL',3]] as const) {
    const accessor=document.accessors[primitive.attributes[key]],view=document.bufferViews[accessor.bufferView];
    const offset=file.byteOffset+binaryOffset+(view.byteOffset??0)+(accessor.byteOffset??0);
    geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(file.buffer,offset,accessor.count*size).slice(),size));
  }
  const accessor=document.accessors[primitive.indices],view=document.bufferViews[accessor.bufferView];
  const offset=file.byteOffset+binaryOffset+(view.byteOffset??0)+(accessor.byteOffset??0);
  const indices=accessor.componentType===5125?new Uint32Array(file.buffer,offset,accessor.count):new Uint16Array(file.buffer,offset,accessor.count);
  geometry.setIndex(new THREE.BufferAttribute(indices.slice(),1));
  return geometry;
}

test('the real scan has localized petting poses without lifting its support or changing its mesh',()=>{
  const geometry=catGeometry(),material=new THREE.MeshStandardMaterial(),mesh=new THREE.Mesh(geometry,material);
  const original=Float32Array.from(geometry.getAttribute('position').array),indexCount=geometry.index!.count;
  try {
    prepareCatPetting(mesh);
    expect(geometry.index!.count).toBe(indexCount);
    expect(new Uint8Array(geometry.getAttribute('position').array.buffer)).toEqual(new Uint8Array(original.buffer));
    expect(mesh.morphTargetInfluences).toEqual([0,0]);
    const poses=geometry.morphAttributes.position;
    expect(poses).toHaveLength(2);
    let floorVertices=0,torsoVertices=0;
    const maximum=[0,0];
    for(let i=0;i<original.length/3;i++) {
      const x=original[i*3],y=original[i*3+1];
      if(y<=.005)floorVertices++;
      if(x>.01)torsoVertices++;
      for(let p=0;p<poses.length;p++) {
        const delta=Math.hypot(poses[p].getX(i),poses[p].getY(i),poses[p].getZ(i));
        maximum[p]=Math.max(maximum[p],delta);
        if(y<=.005||x>.01)expect(delta).toBe(0);
        const normals=geometry.morphAttributes.normal[p];
        expect(Number.isFinite(normals.getX(i)+normals.getY(i)+normals.getZ(i))).toBe(true);
      }
    }
    expect(floorVertices).toBeGreaterThan(50);expect(torsoVertices).toBeGreaterThan(1000);
    expect(maximum[0]).toBeGreaterThan(.012);expect(maximum[0]).toBeLessThan(.04);
    expect(maximum[1]).toBeGreaterThan(.003);expect(maximum[1]).toBeLessThan(.025);
  } finally { geometry.dispose();material.dispose(); }
});

test('petting the visible cat reacts once, purrs gently and remains safe with touch, mute and reading',async({browser})=>{
  test.setTimeout(240000);
  const context=await browser.newContext({viewport:{width:1100,height:800},hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const state=(window as any).__petAudio={contexts:0,decoded:false,starts:0,stops:0,active:0,ends:0};
    const gpu=(window as any).__petGpu={buffers:0,shaders:0,morphStorage:0,morphUploads:0};
    for(const [name,key] of [['bufferData','buffers'],['compileShader','shaders'],['texStorage3D','morphStorage'],['texSubImage3D','morphUploads']] as const){
      const original=(WebGL2RenderingContext.prototype as any)[name];
      (WebGL2RenderingContext.prototype as any)[name]=function(...args:unknown[]){gpu[key]++;return original.apply(this,args);};
    }
    const NativeAudio=window.AudioContext;
    window.AudioContext=class extends NativeAudio{constructor(options?:AudioContextOptions){super(options);state.contexts++;}};
    const decode=NativeAudio.prototype.decodeAudioData;
    NativeAudio.prototype.decodeAudioData=function(...args:any[]){
      const pending=(decode as any).apply(this,args) as Promise<AudioBuffer>;
      void pending.then(buffer=>{if(buffer.duration<4)state.decoded=true;},()=>{});
      return pending;
    };
    const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start=function(...args:any[]){
      if(this.buffer&&this.buffer.duration<4){
        state.starts++;state.active++;
        const context=this.context,startedAt=args[0]??context.currentTime;
        const gesture=(window as any).__petAccepted;
        (window as any).__petSoundClock=()=>({gesture,elapsed:context.currentTime-startedAt});
        this.addEventListener('ended',()=>{state.active--;state.ends++;},{once:true});
      }
      return(start as any).apply(this,args);
    };
    AudioBufferSourceNode.prototype.stop=function(...args:any[]){if(this.buffer&&this.buffer.duration<4)state.stops++;return(stop as any).apply(this,args);};
  });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    body=body.replace('const ray = new THREE.Raycaster();',`
      window.__petAccepted=0;window.__petFrames=[];window.__petMeowFrames={};window.__petFinishedFrames={};
      window.__petClock=()=>({active:cat.isPetting(),time:simulationTime});
      const originalPet=cat.pet.bind(cat);
      cat.pet=(...args)=>{const accepted=originalPet(...args);if(accepted)window.__petAccepted++;return accepted;};
      const originalUpdate=cat.update.bind(cat);
      cat.update=(...args)=>{
        const before=window.__petSoundClock?.();
        const changed=originalUpdate(...args);
        window.__petSampleClock={before,after:window.__petSoundClock?.()};
        return changed;
      };
      renderer.domElement.addEventListener('pointerdown',event=>{window.__lastPetPointer=event.pointerId;});
      window.__petSnapshot=()=>{
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        let mesh;cat.group.traverse(object=>{if(object.isMesh&&object.morphTargetInfluences)mesh=object;});
        const base=mesh.geometry.getAttribute('position'),head=mesh.geometry.morphAttributes.position[0];
        let headIndex=0,largest=0,floorDelta=0,torsoDelta=0;
        const rest=new THREE.Vector3(),posed=new THREE.Vector3();
        for(let i=0;i<base.count;i++){
          const amount=Math.hypot(head.getX(i),head.getY(i),head.getZ(i));if(amount>largest){largest=amount;headIndex=i;}
          if(base.getY(i)<=.005||base.getX(i)>.01){
            rest.fromBufferAttribute(base,i);mesh.getVertexPosition(i,posed);const delta=posed.distanceTo(rest);
            if(base.getY(i)<=.005)floorDelta=Math.max(floorDelta,delta);
            if(base.getX(i)>.01)torsoDelta=Math.max(torsoDelta,delta);
          }
        }
        rest.fromBufferAttribute(base,headIndex);mesh.getVertexPosition(headIndex,posed);
        const headDelta=posed.distanceTo(rest);
        const point=lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.09,0)).project(camera);
        return{accepted:window.__petAccepted,active:cat.isPetting(),time:simulationTime,weights:[...mesh.morphTargetInfluences],headDelta,floorDelta,torsoDelta,point:{x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2},gpu:{...window.__petGpu},audio:{...window.__petAudio}};
      };
      const ray = new THREE.Raycaster();
    `);
    body=body.replace('renderer.render(scene, camera);',`
      renderer.render(scene, camera);
      if(window.__petSnapshot){
        let weights;cat.group.traverse(object=>{if(object.isMesh&&object.morphTargetInfluences)weights=[...object.morphTargetInfluences];});
        const active=cat.isPetting(),accepted=window.__petAccepted;
        const clock=window.__petSampleClock;
        const frame={accepted,active,weights,clock};
        window.__petFrames.push(frame);
        // Preserve the actually drawn meow pose and first resting frame. The
        // sample time is taken around cat.update, before a slow GPU draw can
        // advance the audio clock while leaving these weights unchanged.
        if(clock?.before?.gesture===accepted&&clock?.after?.gesture===accepted){
          const elapsed=(clock.before.elapsed+clock.after.elapsed)/2;
          if(active&&clock.before.elapsed>=2.760&&clock.after.elapsed<=3.312){
            const previous=window.__petMeowFrames[accepted];
            if(!previous||Math.abs(elapsed-2.88)<Math.abs(previous.elapsed-2.88))
              window.__petMeowFrames[accepted]={...frame,elapsed};
          }
          const previous=window.__petPreviousFrame;
          if(!active&&previous?.active&&previous.accepted===accepted)
            window.__petFinishedFrames[accepted]={...frame,previous};
        }
        window.__petPreviousFrame=frame;
        // Capture the actual drawn pose once per accepted gesture. Polling a
        // short reduced-motion reaction after an input round trip can miss it.
        if(active&&weights[0]>.08&&window.__petObserved?.accepted!==window.__petAccepted)
          window.__petObserved=window.__petSnapshot();
      }
    `);
    await route.fulfill({response,body});
  });
  const snapshot=()=>page.evaluate(()=>(window as any).__petSnapshot());
  const settled=async()=>{
    await expect.poll(()=>page.evaluate(()=>(window as any).__petClock().active),{timeout:10000}).toBe(false);
    const time=await page.evaluate(()=>(window as any).__petClock().time);
    await page.waitForFunction(time=>(window as any).__petClock().time>time+.25,time,{timeout:10000});
  };
  const ready=()=>expect(page.locator('#reader')).toHaveAttribute('data-phase','ready',{timeout:60000});
  const expectSynchronizedResponse=async(gesture:number)=>{
    const observed=await page.evaluate(gesture=>({
      meow:(window as any).__petMeowFrames[gesture],
      finished:(window as any).__petFinishedFrames[gesture],
    }),gesture);
    expect(observed.meow,'A real rendered frame must keep the head raised during the meow').toBeDefined();
    expect(observed.meow.active).toBe(true);
    expect(observed.meow.weights[0]).toBeGreaterThan(.10);
    const expected=sampleCatReaction(observed.meow.elapsed,true);
    expect(Math.abs(observed.meow.weights[0]-expected.head)).toBeLessThan(.004);
    expect(Math.abs(observed.meow.weights[1]-expected.ears)).toBeLessThan(.004);
    expect(observed.finished,'The same audio clock must include the quiet settling tail').toBeDefined();
    expect(observed.finished.weights).toEqual([0,0]);
    expect(observed.finished.clock.before.elapsed).toBeGreaterThanOrEqual(CAT_REACTION_DURATION-.005);
    expect(observed.finished.previous.clock.after.elapsed).toBeLessThan(CAT_REACTION_DURATION+.02);
  };
  try {
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    expect(await page.evaluate(()=>(window as any).__petAudio.starts)).toBe(0);
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
    await expect(page.locator('#room-ui')).toBeVisible({timeout:30000});
    await expect(page.locator('#pet-cat')).toBeHidden();
    await page.locator('#cozy-view').click();await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true',{timeout:15000});
    await expect(page.locator('#pet-cat')).toBeVisible();await expect(page.locator('#pet-hint')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAudio.decoded)).toBe(true);
    const before=await snapshot();expect(before.audio.contexts).toBe(1);expect(before.weights).toEqual([0,0]);
    await page.evaluate(()=>{(window as any).__petFrames=[];});
    await page.mouse.click(before.point.x,before.point.y);await page.mouse.click(before.point.x,before.point.y);
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAccepted)).toBe(1);
    await page.waitForFunction(()=>(window as any).__petObserved?.accepted===1,undefined,{timeout:10000});
    const reacting=await page.evaluate(()=>(window as any).__petObserved);
    expect(reacting.headDelta).toBeGreaterThan(.0005);expect(reacting.floorDelta).toBe(0);expect(reacting.torsoDelta).toBe(0);
    expect(reacting.audio.starts).toBe(1);expect(reacting.audio.contexts).toBe(1);
    expect(reacting.gpu).toEqual(before.gpu);
    await page.screenshot({path:'test-results/cat-pet-reaction.png'});
    await settled();
    await expectSynchronizedResponse(1);
    const resting=await snapshot();expect(resting.weights).toEqual([0,0]);expect(resting.headDelta).toBe(0);
    expect(await page.evaluate(()=>(window as any).__petFrames.some((frame:any)=>frame.weights?.[1]>0))).toBe(true);
    expect(resting.gpu).toEqual(before.gpu);

    // Cancelling an in-progress touch cannot produce a late pet on release.
    await page.mouse.move(resting.point.x,resting.point.y);await page.mouse.down();
    await page.locator('#world canvas').evaluate(canvas=>canvas.dispatchEvent(new PointerEvent('pointercancel',{pointerId:(window as any).__lastPetPointer,pointerType:'mouse',isPrimary:true,button:0,bubbles:true})));
    await page.mouse.up();
    expect((await snapshot()).accepted).toBe(1);
    const cdp=await context.newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:resting.point.x,y:resting.point.y,id:11},{x:resting.point.x+22,y:resting.point.y+5,id:12}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await cdp.detach();expect((await snapshot()).accepted).toBe(1);

    // A real stroke acts once, even if its release ends over a reading control.
    await page.mouse.move(resting.point.x,resting.point.y);await page.mouse.down();
    await page.mouse.move(resting.point.x+18,resting.point.y,{steps:3});
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAccepted)).toBe(2);
    const open=await page.locator('#open-book').boundingBox();
    await page.mouse.move(open!.x+open!.width/2,open!.y+open!.height/2,{steps:3});await page.mouse.up();
    await expect(page.locator('#reader')).toBeHidden();await settled();

    // Muting controls this same context and must not queue a purr for later.
    await page.locator('#sound').click();await expect(page.locator('#sound')).toHaveAttribute('aria-label','开启声音');
    const muted=await snapshot();
    await page.locator('#pet-cat').focus();await page.keyboard.press('Enter');
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAccepted)).toBe(3);
    expect((await snapshot()).audio.starts).toBe(muted.audio.starts);
    await page.locator('#sound').click();await expect(page.locator('#sound')).toHaveAttribute('aria-label','关闭声音');
    expect((await snapshot()).audio.starts).toBe(muted.audio.starts);
    await settled();

    // The keyboard alternative uses the same reaction and prepared sound.
    // Open the book in the same browser task after the real button handler
    // starts the purr. A slow screenshot/input round trip can outlast 2.6 s.
    await page.evaluate(()=>{
      document.getElementById('pet-cat')!.addEventListener('click',()=>{
        (window as any).__petBookInterrupt={accepted:(window as any).__petAccepted,audio:{...(window as any).__petAudio}};
        document.getElementById('open-book')!.click();
      },{once:true});
    });
    await page.locator('#pet-cat').focus();await page.keyboard.press('Enter');
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAccepted)).toBe(4);
    const interrupted=await page.evaluate(()=>(window as any).__petBookInterrupt);
    expect(interrupted.accepted).toBe(4);
    expect(interrupted.audio.starts).toBe(muted.audio.starts+1);expect(interrupted.audio.active).toBe(1);
    await ready();
    const reading=await snapshot();expect(reading.active).toBe(false);expect(reading.weights).toEqual([0,0]);
    expect(reading.audio.stops).toBeGreaterThan(interrupted.audio.stops);
    await page.mouse.click(before.point.x,before.point.y);
    expect((await snapshot()).accepted).toBe(4);
    await page.locator('#close-book').click();await expect(page.locator('#room-ui')).toBeVisible({timeout:60000});
    expect((await snapshot()).audio.starts).toBe(reading.audio.starts);

    await page.setViewportSize({width:390,height:844});await expect(page.locator('#pet-cat')).toBeVisible();
    const phone=await snapshot();
    expect(phone.point.x).toBeGreaterThan(40);expect(phone.point.x).toBeLessThan(350);expect(phone.point.y).toBeLessThan(600);
    expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.tagName,phone.point)).toBe('CANVAS');
    await settled();
    await page.touchscreen.tap(phone.point.x,phone.point.y);
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAccepted)).toBe(5);
    await page.waitForFunction(()=>(window as any).__petObserved?.accepted===5,undefined,{timeout:10000});
    const phoneReaction=await page.evaluate(()=>(window as any).__petObserved);
    expect(phoneReaction.headDelta).toBeGreaterThan(.0005);expect(phoneReaction.floorDelta).toBe(0);
    await expect(page.locator('#reader')).toBeHidden();await page.screenshot({path:'test-results/cat-pet-mobile.png'});
    await settled();
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAudio.active),{timeout:10000}).toBe(0);
    await expectSynchronizedResponse(5);
    const voiceBeforeHidden=await page.evaluate(()=>({...((window as any).__petAudio)}));
    // Fence visibility loss directly after the next native pet activation,
    // while its source is verifiably playing, rather than after a screenshot.
    await page.evaluate(()=>{
      document.getElementById('pet-cat')!.addEventListener('click',()=>{
        (window as any).__petHiddenInterrupt={accepted:(window as any).__petAccepted,audio:{...(window as any).__petAudio}};
        Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
        document.dispatchEvent(new Event('visibilitychange'));
      },{once:true});
    });
    await page.locator('#pet-cat').focus();await page.keyboard.press('Enter');
    const hidden=await page.evaluate(()=>(window as any).__petHiddenInterrupt);
    expect(hidden.accepted).toBe(6);expect(hidden.audio.active).toBe(1);
    expect(hidden.audio.starts).toBe(voiceBeforeHidden.starts+1);
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAudio.stops)).toBeGreaterThan(hidden.audio.stops);
    await page.evaluate(()=>{delete(document as any).hidden;document.dispatchEvent(new Event('visibilitychange'));});
    const voices=(await snapshot()).audio.starts;await page.waitForTimeout(200);
    expect((await snapshot()).audio.starts).toBe(voices);expect((await snapshot()).audio.contexts).toBe(1);
    expect(errors).toEqual([]);
  } finally { await context.close(); }
});
