import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { sampleCatReaction } from '../src/cat-choreography';

test('normal-motion cat responses render all four poses, vary across three pets and reset after approaching from the desk', async ({ browser }) => {
  test.setTimeout(180000);
  const context=await browser.newContext({viewport:{width:1600,height:900},reducedMotion:'no-preference'});
  const page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/\/src\/scene\.ts(?:\?.*)?$/,async route=>{
    const response=await route.fetch();let body=await response.text();
    body=body.replace('const ray = new THREE.Raycaster();',`
      const fullMotion=window.__fullMotion={accepted:0,gestures:{},frames:[],elapsed:0};
      let fullMesh,fullBase,fullLandmarks,fullExtents;
      const findFullMesh=()=>{
        if(fullMesh)return;
        cat.group.traverse(object=>{if(object.isMesh&&object.morphTargetInfluences)fullMesh=object;});
        fullBase=fullMesh.geometry.getAttribute('position');
        fullLandmarks=[];fullExtents=[];
        for(const pose of fullMesh.geometry.morphAttributes.position){
          let landmark=0,largest=0;
          for(let i=0;i<fullBase.count;i++){
            const delta=Math.hypot(pose.getX(i),pose.getY(i),pose.getZ(i));
            if(delta>largest){largest=delta;landmark=i;}
          }
          fullLandmarks.push(landmark);fullExtents.push(largest);
        }
      };
      window.__fullSnapshot=()=>{
        findFullMesh();scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        const point=lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,.09,0)).project(camera);
        return{accepted:fullMotion.accepted,active:cat.isPetting(),time:simulationTime,
          focused:nookFocused,moving:animating,weights:[...fullMesh.morphTargetInfluences],extents:fullExtents,
          position:camera.position.toArray(),point:{x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2}};
      };
      const originalFullPet=cat.pet.bind(cat);
      cat.pet=(...args)=>{
        const accepted=originalFullPet(...args);
        if(accepted){
          fullMotion.accepted++;
          fullMotion.gestures[fullMotion.accepted]={start:null,variant:(fullMotion.accepted-1)%3,
            acceptedFocused:nookFocused,acceptedMoving:animating,peaks:[0,0,0,0],captures:{},finished:null};
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
        const weights=[...fullMesh.morphTargetInfluences],active=cat.isPetting(),elapsed=fullMotion.elapsed;
        fullMotion.frames.push({gesture:fullMotion.accepted,elapsed,weights,active});
        weights.forEach((weight,i)=>{gesture.peaks[i]=Math.max(gesture.peaks[i],weight);});
        if(active){
          for(const [name,time] of [['nuzzle',.58],['stretch',1.04],['meow',2.88]]){
            if(gesture.captures[name]||elapsed<time)continue;
            const rest=new THREE.Vector3(),posed=new THREE.Vector3();
            let floorDelta=0;
            for(let i=0;i<fullBase.count;i++)if(fullBase.getY(i)<=.005){
              rest.fromBufferAttribute(fullBase,i);fullMesh.getVertexPosition(i,posed);
              floorDelta=Math.max(floorDelta,posed.distanceTo(rest));
            }
            const landmarkDelta=fullLandmarks.map(i=>{
              rest.fromBufferAttribute(fullBase,i);fullMesh.getVertexPosition(i,posed);return posed.distanceTo(rest);
            });
            gesture.captures[name]={elapsed,weights,landmarkDelta,floorDelta,image:renderer.domElement.toDataURL('image/png')};
          }
        }else gesture.finished={elapsed,weights};
      };
      const ray = new THREE.Raycaster();
    `);
    body=body.replace('renderer.render(scene, camera);','renderer.render(scene, camera); window.__recordFullFrame?.();');
    await route.fulfill({response,body});
  });
  const snapshot=()=>page.evaluate(()=>(window as any).__fullSnapshot());
  try {
    await page.goto('/');await expect(page.locator('#loading')).toBeHidden({timeout:60000});
    await page.locator('#enter').click();await expect(page.locator('#enter')).toBeEnabled();await page.locator('#enter').click();
    await expect(page.locator('#room-ui')).toBeVisible({timeout:30000});
    await page.locator('#sound').click();await expect(page.locator('#sound')).toHaveAttribute('aria-label','开启声音');
    await expect(page.locator('#cozy-view')).toHaveAttribute('aria-pressed','false');
    const desk=await snapshot();expect(desk.weights).toEqual([0,0,0,0]);
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
      expect(observed.finished.weights).toEqual([0,0,0,0]);expect(observed.finished.elapsed).toBeGreaterThanOrEqual(4);
      expect(observed.peaks[0]).toBeGreaterThan(.8);expect(observed.peaks[1]).toBeGreaterThan(.55);
      expect(observed.peaks[2]).toBeGreaterThan(gesture===2?.85:.55);
      expect(observed.peaks[3]).toBeGreaterThan(gesture===3?.85:.58);
      for(const name of ['nuzzle','stretch','meow']) {
        const capture=observed.captures[name];expect(capture).toBeDefined();
        expect(capture.floorDelta).toBe(0);
        const expected=sampleCatReaction(capture.elapsed,false,gesture-1);
        for(const [i,key] of ['head','ears','stretch','tail'].entries())expect(capture.weights[i]).toBeCloseTo(expected[key as 'head'],8);
        await writeFile(test.info().outputPath('cat-full-'+gesture+'-'+name+'.png'),Buffer.from(capture.image.split(',')[1],'base64'));
        delete capture.image;
      }
      expect(observed.captures.meow.landmarkDelta[0]).toBeGreaterThan(.035);
      expect(observed.captures.stretch.landmarkDelta[2]).toBeGreaterThan(gesture===2?.014:.009);
      const settled=await snapshot();expect(settled.weights).toEqual([0,0,0,0]);
      await page.waitForFunction(time=>(window as any).__fullSnapshot().time>time+.25,settled.time,{timeout:10000});
      await writeFile(test.info().outputPath('cat-full-gesture-'+gesture+'.json'),JSON.stringify(observed,null,2));
      await test.info().attach('cat-full-gesture-'+gesture,{body:JSON.stringify(observed,null,2),contentType:'application/json'});
    }
    const close=await snapshot();expect(Math.hypot(...close.position.map((v:number,i:number)=>v-desk.position[i]))).toBeGreaterThan(1);
    await expect(page.locator('#reader')).toBeHidden();expect(errors).toEqual([]);
  } finally {await context.close();}
});
