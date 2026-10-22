import { test, expect } from '@playwright/test';

test('only flexible tentacles emerge: submerged body, anchored roots and independent motion', async ({ page }) => {
  // Exercise the real geometry and animation without rendering the entire room.
  await page.route('**/__kraken_geometry', route => route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/__kraken_geometry');
  const result=await page.evaluate(async()=>{
    const path='/src/kraken.ts';
    const {createKraken}=await import(path);
    const kraken=createKraken({x:-31,y:-8,z:-112});
    const sample=()=>{
      kraken.group.updateMatrixWorld(true);
      return Array.from({length:5},(_,i)=>{
        const mesh=kraken.group.getObjectByName(`kraken-tentacle-${i}`),p=mesh.geometry.attributes.position,uv=mesh.geometry.attributes.uv;
        const centre=(t:number)=>{
          const sum=[0,0,0];let count=0;
          for(let j=0;j<p.count;j++)if(Math.abs(uv.getX(j)-t)<.0001){sum[0]+=p.getX(j);sum[1]+=p.getY(j);sum[2]+=p.getZ(j);count++;}
          return sum.map(n=>n/count);
        };
        return {root:centre(0),tip:centre(1),matrix:Array.from(mesh.matrixWorld.elements)};
      });
    };
    kraken.update(0,false);const first=sample();
    kraken.update(2,false);const second=sample();
    const body=kraken.group.getObjectByName('submerged-kraken-body');
    const bp=body.geometry.attributes.position,m=body.matrixWorld.elements;
    let bodyTop=-Infinity;
    for(let i=0;i<bp.count;i++)bodyTop=Math.max(bodyTop,m[1]*bp.getX(i)+m[5]*bp.getY(i)+m[9]*bp.getZ(i)+m[13]);
    const slow=createKraken({x:-31,y:-8,z:-112});
    // Reduced motion uses the same model with a slower, smaller animation.
    const readTip=()=>{const g=slow.group.getObjectByName('kraken-tentacle-0').geometry,p=g.attributes.position,uv=g.attributes.uv;let n=0;const out=[0,0,0];for(let i=0;i<p.count;i++)if(uv.getX(i)===1){out[0]+=p.getX(i);out[1]+=p.getY(i);out[2]+=p.getZ(i);n++;}return out.map(v=>v/n);};
    slow.update(0,true);const slowStart=readTip();slow.update(2,true);const slowEnd=readTip();
    return {first,second,bodyTop,slowStart,slowEnd};
  });
  const distance=(a:number[],b:number[])=>Math.hypot(...a.map((n,i)=>n-b[i]));
  expect(result.bodyTop).toBeLessThan(-11.5);
  const motions:number[]=[];
  for(let i=0;i<5;i++){
    const before=result.first[i],after=result.second[i];
    expect(distance(before.root,after.root)).toBeLessThan(.00001);
    expect(before.root[1]).toBeLessThan(-3);
    expect(Math.hypot(before.root[0],before.root[2])).toBeLessThan(2.6);
    expect(after.matrix).toEqual(before.matrix);
    const motion=distance(before.tip,after.tip);motions.push(motion);
    expect(motion).toBeGreaterThan(.1);
  }
  expect(Math.max(...motions)-Math.min(...motions)).toBeGreaterThan(.05);
  expect(distance(result.slowStart,result.slowEnd)).toBeLessThan(motions[0]);
});
