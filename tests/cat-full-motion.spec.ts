import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { CAT_REACTION_DURATION } from '../src/cat-choreography';

test('normal-motion responses render a fluid native rig, vary across three pets and settle after approaching from the desk', async ({ browser }) => {
  test.setTimeout(180000);
  const context=await browser.newContext({viewport:{width:1600,height:900},reducedMotion:'no-preference'});
  const page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    body=body.replace('const ray = new THREE.Raycaster();',`
      const fullMotion=window.__fullMotion={accepted:0,gestures:{},frames:[],elapsed:0};
      let fullMesh,fullBase,fullRest;
      const findFullMesh=()=>{
        if(fullMesh)return;
        cat.group.traverse(object=>{if(object.isSkinnedMesh)fullMesh=object;});
        if(!fullMesh)throw new Error('The rendered cat must use native skinning');
        fullBase=fullMesh.geometry.getAttribute('position');
        fullRest=fullMesh.skeleton.bones.map(bone=>bone.quaternion.clone());
      };
      const fullPose=()=>{
        findFullMesh();
        const joints=fullMesh.skeleton.bones.map((bone,i)=>({name:bone.name,angle:bone.quaternion.angleTo(fullRest[i]),quaternion:bone.quaternion.toArray()}));
        const angle=pattern=>Math.max(...joints.filter(joint=>pattern.test(joint.name)).map(joint=>joint.angle));
        return{joints,maxAngle:Math.max(...joints.map(joint=>joint.angle)),headAngle:angle(/head|neck/),earAngle:angle(/ear/),shoulderAngle:angle(/shoulder/),tailAngle:angle(/tail/)};
      };
      window.__fullSnapshot=()=>{
        scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const point=lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.09,0)).project(camera);
        return{accepted:fullMotion.accepted,active:cat.isPetting(),time:simulationTime,
          focused:nookFocused,moving:animating,...fullPose(),
          position:camera.position.toArray(),point:{x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2}};
      };
      const originalFullPet=cat.pet.bind(cat);
      cat.pet=(...args)=>{
        const accepted=originalFullPet(...args);
        if(accepted){
          fullMotion.accepted++;
          fullMotion.gestures[fullMotion.accepted]={start:null,variant:(fullMotion.accepted-1)%3,
            acceptedFocused:nookFocused,acceptedMoving:animating,peaks:{headAngle:0,earAngle:0,shoulderAngle:0,tailAngle:0},captures:{},finished:null};
        }
        return accepted;
      };
      const originalFullUpdate=cat.update.bind(cat);
      cat.update=(...args)=>{
        const gesture=fullMotion.gestures[fullMotion.accepted];
        if(gesture&&cat.isPetting()){
          if(gesture.start===null)gesture.start=args[0];
          fullMotion.elapsed=args[0]-gesture.start;
        }
        return originalFullUpdate(...args);
      };
      window.__recordFullFrame=()=>{
        const gesture=fullMotion.gestures[fullMotion.accepted];if(!gesture||gesture.finished)return;
        findFullMesh();
        const pose=fullPose(),active=cat.isPetting(),elapsed=fullMotion.elapsed;
        fullMotion.frames.push({gesture:fullMotion.accepted,elapsed,...pose,active});
        for(const key of Object.keys(gesture.peaks))gesture.peaks[key]=Math.max(gesture.peaks[key],pose[key]);
        if(active){
          for(const [name,time] of [['nuzzle',.58],['stretch',1.04],['meow',2.88]]){
            if(gesture.captures[name]||elapsed<time)continue;
            const rest=new THREE.Vector3(),posed=new THREE.Vector3();
            let floorDelta=0,headDelta=0,shoulderDelta=0,tailDelta=0;
            for(let i=0;i<fullBase.count;i++){
              rest.fromBufferAttribute(fullBase,i);fullMesh.getVertexPosition(i,posed);
              const delta=posed.distanceTo(rest);
              if(rest.y<=.005)floorDelta=Math.max(floorDelta,delta);
              if(rest.x<-.12&&rest.y>.02)headDelta=Math.max(headDelta,delta);
              if(rest.x>-.08&&rest.x<.04&&rest.y>.045)shoulderDelta=Math.max(shoulderDelta,delta);
              if(rest.z>.07)tailDelta=Math.max(tailDelta,delta);
            }
            gesture.captures[name]={elapsed,...pose,headDelta,shoulderDelta,tailDelta,floorDelta,image:renderer.domElement.toDataURL('image/png')};
          }
        }else gesture.finished={elapsed,...pose};
      };
      const ray = new THREE.Raycaster();
    `);
    body=body.replace('renderer.render(scene, camera);','renderer.render(scene, camera); window.__recordFullFrame?.();');
    await route.fulfill({response,body});
  });
  const snapshot=()=>page.evaluate(()=>(window as any).__fullSnapshot());
  const variants:string[]=[];
  try {
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
    await expect(page.locator('#room-ui')).toBeVisible({timeout:30000});
    await page.locator('#sound').click();await expect(page.locator('#sound')).toHaveAttribute('aria-label','开启声音');
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','false');
    const desk=await snapshot();expect(desk.maxAngle).toBeLessThan(1e-7);
    expect(desk.point.x).toBeGreaterThan(0);expect(desk.point.x).toBeLessThan(1600);
    await page.mouse.click(desk.point.x,desk.point.y);
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','true',{timeout:20000});
    await expect(page.locator('#pet-cat')).toBeVisible();
    for(let gesture=1;gesture<=3;gesture++) {
      if(gesture>1)await page.locator('#pet-cat').click();
      await expect.poll(()=>page.evaluate(()=>(window as any).__fullMotion.accepted),{timeout:10000}).toBe(gesture);
      await page.waitForFunction(id=>(window as any).__fullMotion.gestures[id]?.finished,gesture,{timeout:15000});
      const observed=await page.evaluate(id=>(window as any).__fullMotion.gestures[id],gesture);
      expect(observed.acceptedFocused).toBe(true);expect(observed.acceptedMoving).toBe(false);
      expect(observed.finished.maxAngle).toBeLessThan(1e-7);expect(observed.finished.elapsed).toBeGreaterThanOrEqual(CAT_REACTION_DURATION);
      expect(observed.peaks.headAngle).toBeGreaterThan(.12);expect(observed.peaks.earAngle).toBeGreaterThan(.12);
      expect(observed.peaks.shoulderAngle).toBeGreaterThan(.01);expect(observed.peaks.tailAngle).toBeGreaterThan(.1);
      for(const name of ['nuzzle','stretch','meow']) {
        const capture=observed.captures[name];expect(capture).toBeDefined();
        expect(capture.floorDelta).toBeLessThan(1e-7);
        expect(capture.joints.every((joint:any)=>joint.quaternion.every(Number.isFinite))).toBe(true);
        await writeFile(test.info().outputPath('cat-full-'+gesture+'-'+name+'.png'),Buffer.from(capture.image.split(',')[1],'base64'));
        delete capture.image;
      }
      expect(observed.captures.meow.headDelta).toBeGreaterThan(.025);
      expect(observed.captures.stretch.shoulderDelta).toBeGreaterThan(.001);
      variants.push(JSON.stringify(observed.captures.meow.joints.map((joint:any)=>joint.quaternion)));
      const settled=await snapshot();expect(settled.maxAngle).toBeLessThan(1e-7);
      await page.waitForFunction(time=>(window as any).__fullSnapshot().time>time+.25,settled.time,{timeout:10000});
      await writeFile(test.info().outputPath('cat-full-gesture-'+gesture+'.json'),JSON.stringify(observed,null,2));
      await test.info().attach('cat-full-gesture-'+gesture,{body:JSON.stringify(observed,null,2),contentType:'application/json'});
    }
    expect(new Set(variants).size).toBe(3);
    const close=await snapshot();expect(Math.hypot(...close.position.map((v:number,i:number)=>v-desk.position[i]))).toBeGreaterThan(1);
    await expect(page.locator('#reader')).toBeHidden();expect(errors).toEqual([]);
  } finally {await context.close();}
});
