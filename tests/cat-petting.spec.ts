import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCatRig } from '../src/cat-rig';
import { CAT_REACTION_DURATION, sampleCatReaction } from '../src/cat-choreography';

/** Preserve the native GLB skin but skip photographs in the Node-only rig test. */
async function loadCatRig() {
  const file=readFileSync(new URL('../src/assets/sleeping-tabby.glb',import.meta.url));
  const jsonLength=file.readUInt32LE(12),binaryOffset=20+jsonLength;
  const document=JSON.parse(file.subarray(20,binaryOffset).toString());
  for(const mesh of document.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  delete document.materials;delete document.images;delete document.textures;delete document.samplers;
  const json=Buffer.from(JSON.stringify(document)),padding=(4-json.length%4)%4;
  const jsonChunk=Buffer.alloc(8+json.length+padding,0x20);
  jsonChunk.writeUInt32LE(json.length+padding,0);jsonChunk.write('JSON',4);json.copy(jsonChunk,8);
  const header=Buffer.from(file.subarray(0,12)),binary=file.subarray(binaryOffset);
  header.writeUInt32LE(12+jsonChunk.length+binary.length,8);
  const clean=Buffer.concat([header,jsonChunk,binary]);
  const gltf=await new GLTFLoader().parseAsync(clean.buffer.slice(clean.byteOffset,clean.byteOffset+clean.byteLength),'');
  let mesh!:THREE.SkinnedMesh;
  gltf.scene.traverse(object=>{if(object instanceof THREE.SkinnedMesh)mesh=object;});
  expect(mesh,'The asset must carry its own native skeleton and skin weights').toBeDefined();
  return{root:gltf.scene,mesh,animations:gltf.animations,rig:createCatRig(gltf.scene,gltf.animations)};
}

test('the native cat rig bends real joints continuously while keeping its support, hind leg and tail root planted',async()=>{
  const {root,mesh,rig,animations}=await loadCatRig(),geometry=mesh.geometry;
  const base=geometry.getAttribute('position'),original=Float32Array.from(base.array),index=geometry.index!.array.slice();
  const rest=mesh.skeleton.bones.map(bone=>({position:bone.position.clone(),quaternion:bone.quaternion.clone()}));
  const names=mesh.skeleton.bones.map(bone=>bone.name);
  expect(names).toEqual(expect.arrayContaining(['cat-root','cat-shoulder','cat-neck','cat-head','cat-ear-inner','cat-ear-outer','cat-tail-01','cat-tail-04']));
  expect(geometry.morphAttributes.position??[]).toHaveLength(0);
  expect(animations.map(clip=>clip.name)).toEqual(['pet-nuzzle','pet-stretch','pet-tail']);
  for(const clip of animations){expect(clip.duration).toBeCloseTo(CAT_REACTION_DURATION,5);expect(clip.tracks.filter(track=>track.name.endsWith('.quaternion')).length).toBeGreaterThan(5);}
  const skinIndices=geometry.getAttribute('skinIndex'),skinWeights=geometry.getAttribute('skinWeight');
  expect(skinIndices.count).toBe(base.count);expect(skinWeights.count).toBe(base.count);
  let floorCount=0,invalidWeights=0;
  for(let i=0;i<base.count;i++){
    const weights=[skinWeights.getX(i),skinWeights.getY(i),skinWeights.getZ(i),skinWeights.getW(i)];
    const joints=[skinIndices.getX(i),skinIndices.getY(i),skinIndices.getZ(i),skinIndices.getW(i)];
    if(Math.abs(weights.reduce((sum,value)=>sum+value,0)-1)>1e-6||weights.some(value=>!Number.isFinite(value)||value<0)||joints.some(value=>value<0||value>=names.length))invalidWeights++;
    if(base.getY(i)<=.005)floorCount++;
  }
  expect(invalidWeights).toBe(0);expect(floorCount).toBeGreaterThan(50);
  const normalPeaks:number[]=[],reducedPeaks:number[]=[],variantSignatures:string[]=[];
  const originalPoint=new THREE.Vector3(),posedPoint=new THREE.Vector3();
  try {
    for(const reduced of [false,true])for(let variant=0;variant<3;variant++){
      let maxHead=0,maxTail=0,maxFloor=0,maxHindLeg=0,maxTailRoot=0,maxJointStep=0;
      let previous:THREE.Quaternion[]|undefined;
      // Dense quaternion samples catch discontinuous interpolation between keys.
      for(let step=0;step<=Math.ceil(CAT_REACTION_DURATION*120);step++){
        const time=Math.min(CAT_REACTION_DURATION,step/120);
        rig.seek(time,variant,reduced);root.updateMatrixWorld(true);mesh.skeleton.update();
        mesh.skeleton.bones.forEach((bone,i)=>{
          expect(Number.isFinite(bone.quaternion.lengthSq())).toBe(true);
          if(previous)maxJointStep=Math.max(maxJointStep,bone.quaternion.angleTo(previous[i]));
        });
        previous=mesh.skeleton.bones.map(bone=>bone.quaternion.clone());
      }
      expect(maxJointStep).toBeLessThan(.045);
      for(const time of [.35,.58,1.04,1.7,2.36,2.88,3.12,3.75,CAT_REACTION_DURATION]){
        rig.seek(time,variant,reduced);root.updateMatrixWorld(true);mesh.skeleton.update();
        for(let i=0;i<base.count;i++){
          originalPoint.fromBufferAttribute(base,i);mesh.getVertexPosition(i,posedPoint);
          const delta=posedPoint.distanceTo(originalPoint),x=originalPoint.x,y=originalPoint.y,z=originalPoint.z;
          if(y<=.005)maxFloor=Math.max(maxFloor,delta);
          if(x<-.12&&y>.02)maxHead=Math.max(maxHead,delta);
          if(x>.10&&z<.07)maxHindLeg=Math.max(maxHindLeg,delta);
          if(z>.07)maxTail=Math.max(maxTail,delta);
          if(z>.07&&z<.09&&x>.175)maxTailRoot=Math.max(maxTailRoot,delta);
        }
        if(!reduced&&time===1.7)variantSignatures.push(JSON.stringify(mesh.skeleton.bones.map(bone=>bone.quaternion.toArray())));
      }
      expect(maxFloor).toBeLessThan(1e-7);expect(maxHindLeg).toBeLessThan(1e-7);
      expect(maxTailRoot).toBeLessThan(.008);expect(maxTail).toBeLessThan(.08);
      (reduced?reducedPeaks:normalPeaks).push(maxHead);
      rig.reset();root.updateMatrixWorld(true);mesh.skeleton.update();
      mesh.skeleton.bones.forEach((bone,i)=>{
        expect(bone.position.toArray()).toEqual(rest[i].position.toArray());
        expect(bone.quaternion.angleTo(rest[i].quaternion)).toBeLessThan(1e-7);
      });
    }
    expect(new Set(variantSignatures).size).toBe(3);
    // The native baked clips must reproduce the authored articulation between
    // samples; this also checks node bindings rather than just clip metadata.
    for(let variant=0;variant<3;variant++){
      rig.setPose(sampleCatReaction(1.317,false,variant));
      const authored=mesh.skeleton.bones.map(bone=>bone.quaternion.clone());
      rig.reset();rig.seek(1.317,variant,false);
      mesh.skeleton.bones.forEach((bone,i)=>expect(bone.quaternion.clone().normalize().angleTo(authored[i].clone().normalize())).toBeLessThan(.0003));
      rig.reset();
    }
    for(let variant=0;variant<3;variant++){
      expect(normalPeaks[variant]).toBeGreaterThan(.025);expect(normalPeaks[variant]).toBeLessThan(.065);
      expect(reducedPeaks[variant]).toBeGreaterThan(.001);expect(reducedPeaks[variant]).toBeLessThan(normalPeaks[variant]*.35);
    }
    expect(Float32Array.from(base.array)).toEqual(original);expect(geometry.index!.array).toEqual(index);
  } finally {
    mesh.skeleton.dispose();geometry.dispose();
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();
  }
});

test('petting the visible cat reacts once, purrs gently and remains safe with touch, mute and reading',async({browser})=>{
  test.setTimeout(240000);
  const context=await browser.newContext({viewport:{width:1600,height:900},hasTouch:true,reducedMotion:'reduce'});
  const page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{
    const state=(window as any).__petAudio={contexts:0,decoded:0,starts:0,stops:0,active:0,ends:0,voices:[] as {gesture:number;requested:string}[]};
    // A fixed RNG keeps this GPU regression repeatable without changing the real shuffle bag.
    Math.random=()=>.999;
    // A native rig updates its existing bone texture every frame. Count fresh
    // geometry/shader/storage work, allowing those expected matrix updates.
    const gpu=(window as any).__petGpu={buffers:0,shaders:0,textureStorage2D:0,textureStorage3D:0};
    for(const [name,key] of [['bufferData','buffers'],['compileShader','shaders'],['texStorage2D','textureStorage2D'],['texStorage3D','textureStorage3D']] as const){
      const original=(WebGL2RenderingContext.prototype as any)[name];
      (WebGL2RenderingContext.prototype as any)[name]=function(...args:unknown[]){gpu[key]++;return original.apply(this,args);};
    }
    const NativeAudio=window.AudioContext;
    window.AudioContext=class extends NativeAudio{constructor(options?:AudioContextOptions){super(options);state.contexts++;}};
    const decode=NativeAudio.prototype.decodeAudioData;
    NativeAudio.prototype.decodeAudioData=function(...args:any[]){
      const pending=(decode as any).apply(this,args) as Promise<AudioBuffer>;
      void pending.then(buffer=>{if(buffer.duration<6)state.decoded++;},()=>{});
      return pending;
    };
    const start=AudioBufferSourceNode.prototype.start,stop=AudioBufferSourceNode.prototype.stop;
    AudioBufferSourceNode.prototype.start=function(...args:any[]){
      if(this.buffer&&this.buffer.duration<6){
        state.starts++;state.active++;
        const context=this.context,startedAt=args[0]??context.currentTime;
        const gesture=(window as any).__petAccepted;
        state.voices.push({gesture,requested:(window as any).__catVoiceRequested});
        (window as any).__petSoundClock=()=>({gesture,elapsed:context.currentTime-startedAt});
        this.addEventListener('ended',()=>{state.active--;state.ends++;},{once:true});
      }
      return(start as any).apply(this,args);
    };
    AudioBufferSourceNode.prototype.stop=function(...args:any[]){if(this.buffer&&this.buffer.duration<6)state.stops++;return(stop as any).apply(this,args);};
  });
  await page.route(/\/src\/sound-controller\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    const play=/catVoice\?\.play\(([^)]+)\)/;
    expect(body).toMatch(play);
    body=body.replace(play,`(()=>{
      const requested=$1;
      window.__catVoiceRequested=requested;
      const started=catVoice?.play(requested);
      window.__catVoiceActive=catVoice?.getActiveProfile();
      return started;
    })()`);
    await route.fulfill({response,body});
  });
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    body=body.replace('const ray = new THREE.Raycaster();',`
      window.__petAccepted=0;window.__petFrames=[];window.__petMeowFrames={};window.__petFinishedFrames={};window.__petProfiles={};
      window.__petClock=()=>({active:cat.isPetting(),time:simulationTime});
      const originalPet=cat.pet.bind(cat);
      cat.pet=(...args)=>{
        const accepted=originalPet(...args);
        if(accepted){window.__petAccepted++;window.__petProfiles[window.__petAccepted]=cat.getReaction();}
        return accepted;
      };
      const originalUpdate=cat.update.bind(cat);
      cat.update=(...args)=>{
        const before=window.__petSoundClock?.();
        const changed=originalUpdate(...args);
        window.__petSampleClock={before,after:window.__petSoundClock?.()};
        return changed;
      };
      renderer.domElement.addEventListener('pointerdown',event=>{window.__lastPetPointer=event.pointerId;});
      let petMesh,petRest;
      window.__petPose=()=>{
        if(!petMesh){
          cat.group.traverse(object=>{if(object.isSkinnedMesh)petMesh=object;});
          if(!petMesh)throw new Error('Cat must render as a genuine SkinnedMesh');
          petRest=petMesh.skeleton.bones.map(bone=>bone.quaternion.clone());
        }
        const joints=petMesh.skeleton.bones.map((bone,i)=>({name:bone.name,angle:bone.quaternion.angleTo(petRest[i]),quaternion:bone.quaternion.toArray()}));
        return{joints,maxAngle:Math.max(...joints.map(joint=>joint.angle)),headAngle:Math.max(...joints.filter(joint=>/head|neck/i.test(joint.name)).map(joint=>joint.angle))};
      };
      window.__petSnapshot=()=>{
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const pose=window.__petPose(),base=petMesh.geometry.getAttribute('position');
        let headDelta=0,floorDelta=0,torsoDelta=0;
        const rest=new THREE.Vector3(),posed=new THREE.Vector3();
        for(let i=0;i<base.count;i++){
          rest.fromBufferAttribute(base,i);petMesh.getVertexPosition(i,posed);const delta=posed.distanceTo(rest);
          if(base.getX(i)<-.12&&base.getY(i)>.02)headDelta=Math.max(headDelta,delta);
          if(base.getY(i)<=.005)floorDelta=Math.max(floorDelta,delta);
          if(base.getX(i)>.01)torsoDelta=Math.max(torsoDelta,delta);
        }
        const point=lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.09,0)).project(camera);
        return{accepted:window.__petAccepted,active:cat.isPetting(),time:simulationTime,profile:window.__petProfiles[window.__petAccepted],voiceProfile:window.__catVoiceActive,...pose,headDelta,floorDelta,torsoDelta,point:{x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2},gpu:{...window.__petGpu},audio:{...window.__petAudio}};
      };
      const ray = new THREE.Raycaster();
    `);
    body=body.replace('renderer.render(scene, camera);',`
      renderer.render(scene, camera);
      if(window.__petSnapshot){
        const pose=window.__petPose();
        const active=cat.isPetting(),accepted=window.__petAccepted;
        const clock=window.__petSampleClock;
        const profile=window.__petProfiles[accepted];
        const frame={accepted,active,...pose,clock,profile,voiceProfile:window.__catVoiceActive};
        window.__petFrames.push(frame);
        // Preserve the actually drawn meow pose and first resting frame. The
        // sample time is taken around cat.update, before a slow GPU draw can
        // advance the audio clock while leaving these joint transforms unchanged.
        if(clock?.before?.gesture===accepted&&clock?.after?.gesture===accepted){
          const elapsed=(clock.before.elapsed+clock.after.elapsed)/2;
          const cue=profile?.cues.find(cue=>clock.before.elapsed>=cue.start&&clock.after.elapsed<=cue.end);
          if(active&&cue){
            const distance=Math.abs(elapsed-(cue.start+cue.end)/2);
            const previous=window.__petMeowFrames[accepted];
            if(!previous||distance<previous.distance)
              window.__petMeowFrames[accepted]={...frame,elapsed,distance,cue};
          }
          const previous=window.__petPreviousFrame;
          if(!active&&previous?.active&&previous.accepted===accepted)
            window.__petFinishedFrames[accepted]={...frame,previous};
        }
        window.__petPreviousFrame=frame;
        // Capture the actual drawn pose once per accepted gesture. Polling a
        // short reduced-motion reaction after an input round trip can miss it.
        if(active&&pose.headAngle>.025&&window.__petObserved?.accepted!==window.__petAccepted)
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
      profile:(window as any).__petProfiles[gesture],
      voice:(window as any).__petAudio.voices.find((voice:any)=>voice.gesture===gesture),
    }),gesture);
    expect(observed.meow,'A real rendered frame must keep the head raised during the meow').toBeDefined();
    expect(observed.meow.active).toBe(true);
    expect(observed.meow.headAngle).toBeGreaterThan(.01);
    expect(observed.voice.requested).toBe(observed.profile.id);
    expect(observed.meow.voiceProfile).toBe(observed.profile.id);
    expect(observed.profile.cues.some((cue:any)=>observed.meow.elapsed>=cue.start&&observed.meow.elapsed<=cue.end)).toBe(true);
    expect(observed.meow.joints.every((joint:any)=>joint.quaternion.every(Number.isFinite))).toBe(true);
    expect(observed.finished,'The same audio clock must include the quiet settling tail').toBeDefined();
    expect(observed.finished.maxAngle).toBeLessThan(1e-7);
    expect(observed.finished.clock.before.elapsed).toBeGreaterThanOrEqual(observed.profile.duration-.005);
    expect(observed.finished.previous.clock.after.elapsed).toBeLessThan(observed.profile.duration+.05);
  };
  try {
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    expect(await page.evaluate(()=>(window as any).__petAudio.starts)).toBe(0);
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
    await expect(page.locator('#room-ui')).toBeVisible({timeout:30000});
    await expect(page.locator('#pet-cat')).toBeHidden();
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAudio.decoded)).toBe(6);
    const before=await snapshot();expect(before.audio.contexts).toBe(1);expect(before.maxAngle).toBeLessThan(1e-7);
    await page.evaluate(()=>{(window as any).__petFrames=[];});
    // Clicking the actual visible scan from the desk approaches before the
    // first reaction; the same gesture must not be consumed by the album.
    await page.screenshot({path:test.info().outputPath('cat-desk-before.png')});
    await page.mouse.click(before.point.x,before.point.y);await page.mouse.click(before.point.x,before.point.y);
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true',{timeout:15000});
    await expect(page.locator('#pet-cat')).toBeVisible();await expect(page.locator('#pet-hint')).toBeVisible();
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAccepted)).toBe(1);
    await page.waitForFunction(()=>(window as any).__petObserved?.accepted===1,undefined,{timeout:10000});
    const reacting=await page.evaluate(()=>(window as any).__petObserved);
    expect(reacting.headDelta).toBeGreaterThan(.0005);expect(reacting.floorDelta).toBeLessThan(1e-7);expect(reacting.torsoDelta).toBeLessThan(.012);
    expect(reacting.audio.starts).toBe(1);expect(reacting.audio.contexts).toBe(1);
    expect(reacting.gpu).toEqual(before.gpu);
    await page.screenshot({path:test.info().outputPath('cat-pet-reaction.png')});
    await settled();
    await expectSynchronizedResponse(1);
    const resting=await snapshot();expect(resting.maxAngle).toBeLessThan(1e-7);expect(resting.headDelta).toBeLessThan(1e-7);
    expect(await page.evaluate(()=>(window as any).__petFrames.some((frame:any)=>frame.joints?.some((joint:any)=>/ear/i.test(joint.name)&&joint.angle>.01)))).toBe(true);
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
    const reading=await snapshot();expect(reading.active).toBe(false);expect(reading.maxAngle).toBeLessThan(1e-7);
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
    expect(phoneReaction.headDelta).toBeGreaterThan(.0005);expect(phoneReaction.floorDelta).toBeLessThan(1e-7);
    await expect(page.locator('#reader')).toBeHidden();await page.screenshot({path:test.info().outputPath('cat-pet-mobile.png')});
    await settled();
    await expect.poll(()=>page.evaluate(()=>(window as any).__petAudio.active),{timeout:10000}).toBe(0);
    await expectSynchronizedResponse(5);
    const profiles=await page.evaluate(()=>Object.values((window as any).__petProfiles).map((profile:any)=>profile.id));
    expect(new Set(profiles).size).toBe(5);
    expect(profiles.every((id,index)=>index===0||id!==profiles[index-1])).toBe(true);
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
