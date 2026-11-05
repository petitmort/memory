import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {dimensions as D} from './dimensions';

/** One-time projected triangle index for static chair fitting, in world coordinates. */
export function createSeatingSupportSampler(seating:THREE.Object3D,axis:'y'|'z') {
  type Face={u:number[];v:number[];h:number[];inverse:number};
  const faces:Face[]=[],point=new THREE.Vector3();
  let minU=Infinity,maxU=-Infinity,minV=Infinity,maxV=-Infinity;
  seating.updateMatrixWorld(true);
  seating.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const geometry:THREE.BufferGeometry=object.geometry;
    const position=geometry.getAttribute('position'),index=geometry.index;
    const count=index?.count??position.count;
    for(let first=0;first+2<count;first+=3) {
      const material=Array.isArray(object.material)
        ?object.material[geometry.groups.find(g=>first>=g.start&&first<g.start+g.count)?.materialIndex??0]
        :object.material;
      const u:number[]=[],v:number[]=[],h:number[]=[];
      for(let corner=0;corner<3;corner++) {
        point.fromBufferAttribute(position,index?index.getX(first+corner):first+corner).applyMatrix4(object.matrixWorld);
        u.push(point.x);v.push(axis==='y'?point.z:point.y);h.push(axis==='y'?point.y:point.z);
      }
      const determinant=(v[1]-v[2])*(u[0]-u[2])+(u[2]-u[1])*(v[0]-v[2]);
      if(Math.abs(determinant)<1e-12)continue;
      const front=axis==='y'?determinant<0:determinant>0;
      if(material.side!==THREE.DoubleSide&&front!==(material.side!==THREE.BackSide))continue;
      faces.push({u,v,h,inverse:1/determinant});
      minU=Math.min(minU,...u);maxU=Math.max(maxU,...u);minV=Math.min(minV,...v);maxV=Math.max(maxV,...v);
    }
  });
  const resolution=32,cells:Face[][]=Array.from({length:resolution*resolution},()=>[]);
  const cell=(value:number,min:number,max:number)=>Math.max(0,Math.min(resolution-1,Math.floor((value-min)/(max-min||1)*resolution)));
  for(const face of faces) {
    const u0=cell(Math.min(...face.u),minU,maxU),u1=cell(Math.max(...face.u),minU,maxU);
    const v0=cell(Math.min(...face.v),minV,maxV),v1=cell(Math.max(...face.v),minV,maxV);
    for(let v=v0;v<=v1;v++)for(let u=u0;u<=u1;u++)cells[v*resolution+u].push(face);
  }
  return (u:number,v:number,origin=Infinity)=>{
    if(u<minU||u>maxU||v<minV||v>maxV)return undefined;
    let height:number|undefined;
    for(const face of cells[cell(v,minV,maxV)*resolution+cell(u,minU,maxU)]) {
      const a=((face.v[1]-face.v[2])*(u-face.u[2])+(face.u[2]-face.u[1])*(v-face.v[2]))*face.inverse;
      const b=((face.v[2]-face.v[0])*(u-face.u[2])+(face.u[0]-face.u[2])*(v-face.v[2]))*face.inverse;
      const c=1-a-b;
      if(a< -1e-10||b< -1e-10||c< -1e-10)continue;
      const hit=a*face.h[0]+b*face.h[1]+c*face.h[2];
      if(hit<=origin&&(height===undefined||hit>height))height=hit;
    }
    return height;
  };
}

/** Shared, neutral linen study; one texture for the throw, cushion and lampshade. */
export function createHomeFabric() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;
  ctx.fillStyle='#f0eade';ctx.fillRect(0,0,256,256);
  let seed=817;
  const random=()=>{seed=Math.imul(seed,1664525)+1013904223|0;return(seed>>>0)/4294967296;};
  for(let i=0;i<64;i++) {
    ctx.fillStyle=`rgba(118,102,78,${.05+random()*.06})`;ctx.fillRect(i*4,0,1,256);
    ctx.fillRect(0,i*4,256,1);
    ctx.fillStyle='rgba(255,255,247,.28)';ctx.fillRect(i*4+1,0,1,256);
    ctx.fillRect(0,i*4+1,256,1);
  }
  for(let i=0;i<350;i++) {
    ctx.fillStyle='rgba(118,102,78,.06)';ctx.fillRect(random()*256,random()*256,1,2+random()*4);
  }
  const texture=new THREE.CanvasTexture(canvas);texture.name='quiet-home-linen-weave';
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=4;
  return texture;
}

/** Thin rounded mat with a real hem and floor contact, not a hovering rectangle. */
export function createCozyRug(material:THREE.Material) {
  const w=(D.rug.width-.002)/2,d=(D.rug.depth-.002)/2,r=.045,shape=new THREE.Shape();
  shape.moveTo(-w+r,-d);shape.lineTo(w-r,-d);shape.quadraticCurveTo(w,-d,w,-d+r);
  shape.lineTo(w,d-r);shape.quadraticCurveTo(w,d,w-r,d);shape.lineTo(-w+r,d);
  shape.quadraticCurveTo(-w,d,-w,d-r);shape.lineTo(-w,-d+r);shape.quadraticCurveTo(-w,-d,-w+r,-d);
  const geometry=new THREE.ExtrudeGeometry(shape,{depth:D.rug.thickness-.002,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:2,steps:1,curveSegments:6});
  geometry.rotateX(-Math.PI/2);geometry.translate(0,.001,0);
  const positions=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
  for(let i=0;i<positions.count;i++)uv.setXY(i,positions.getX(i)/D.rug.width+.5,positions.getZ(i)/D.rug.depth+.5);
  const rug=new THREE.Mesh(geometry,material);rug.name='rug';rug.receiveShadow=true;
  rug.position.set(-.12,0,-.65);
  return rug;
}

/** Fit static cloth once, in the beanbag's local coordinates before it is placed. */
export function createCozyTextiles(seating:THREE.Group,fabric:THREE.Texture) {
  const group=new THREE.Group();group.name='soft-home-textiles';
  const linen=new THREE.MeshStandardMaterial({color:'#eddbbb',map:fabric,bumpMap:fabric,bumpScale:.00055,roughness:1});
  const pillowMaterial=linen.clone();pillowMaterial.color.set('#c59983');
  const seamMaterial=new THREE.MeshStandardMaterial({color:'#d1b99a',roughness:1});
  const add=(geometry:THREE.BufferGeometry,material:THREE.Material,name:string)=>{
    const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  // The chair is fixed during authoring. Index its triangles once instead of
  // traversing the entire dense cover for every one of thousands of fit rays.
  const heightAt=createSeatingSupportSampler(seating,'y'),frontAt=createSeatingSupportSampler(seating,'z');
  const support=(x:number,z:number)=>heightAt(x,z,1.15);
  const columns=24,rows=64,positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  const top:THREE.Vector3[]=[],smooth=THREE.MathUtils.smoothstep;
  // A narrow throw follows the empty near arm, then falls over the front hem.
  // Its inner edge stays outside the sleeping/petting envelope of the cat.
  for(let row=0;row<=rows;row++)for(let col=0;col<=columns;col++) {
    const u=col/columns,v=row/rows,x=-.405+u*.14+.003*Math.sin(v*8)*(1-u);
    const z=v<=.70?-.27+v/.70*.61:.34+(v-.70)/.30*.15;
    const supported=support(x,z);
    const sx=Math.max(-.392,x),sz=Math.min(.34,z);
    const shoulder=(sx===x&&sz===z?supported:support(sx,sz))??.34;
    const fall=shoulder+( .025-shoulder)*smooth(.70,1,v);
    // Continue a single smooth hanging profile outside the front. A missed ray
    // must not switch abruptly to a different extrapolation at each column.
    let y=Math.max(supported??-1,fall)+.010;
    // Fold crests sit above the fitted cover; gravity compresses them at the hem.
    const lift=(.0025+.008*Math.sin(u*Math.PI*3.2+v*5)**2)*(1-.65*smooth(.8,1,v));
    y=Math.max(.018,y+lift);
    top.push(new THREE.Vector3(x,y,z));
  }
  const count=top.length;
  for(let side=0;side<2;side++)for(let i=0;i<count;i++) {
    const p=top[i];positions.push(p.x,p.y-side*.0024,p.z);uvs.push(p.x*8,p.z*8);
  }
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
    const a=row*(columns+1)+col,b=a+columns+1;
    indices.push(a,b,a+1,a+1,b,b+1,a+count,a+1+count,b+count,a+1+count,b+1+count,b+count);
  }
  const perimeter:number[]=[];
  for(let col=0;col<=columns;col++)perimeter.push(col);
  for(let row=1;row<=rows;row++)perimeter.push(row*(columns+1)+columns);
  for(let col=columns-1;col>=0;col--)perimeter.push(rows*(columns+1)+col);
  for(let row=rows-1;row>0;row--)perimeter.push(row*(columns+1));
  for(let i=0;i<perimeter.length;i++) {
    const a=perimeter[i],b=perimeter[(i+1)%perimeter.length];
    indices.push(a,b+count,b,a,a+count,b+count);
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeVertexNormals();
  add(geometry,linen,'oatmeal-draped-throw');
  // A small closed, stuffed cushion with pinched seams and shallow corner folds.
  const pillowPositions:number[]=[],pillowUV:number[]=[],pillowIndex:number[]=[],n=16,stride=n+1;
  for(let side=0;side<2;side++)for(let row=0;row<=n;row++)for(let col=0;col<=n;col++) {
    const u=col/n*2-1,v=row/n*2-1;
    const bulge=(Math.sin((u+1)*Math.PI/2)*Math.sin((v+1)*Math.PI/2))**.65;
    const crease=.002*Math.sin(u*29+v*8)*Math.abs(u*v)**3;
    pillowPositions.push(.091*u*Math.sqrt(1-.16*v*v),.082*v*Math.sqrt(1-.16*u*u),(side?-1:1)*(.0035+.033*bulge-crease));
    pillowUV.push((u+1)*.75,(v+1)*.68);
  }
  const half=stride*stride;
  for(let side=0;side<2;side++)for(let row=0;row<n;row++)for(let col=0;col<n;col++) {
    const a=side*half+row*stride+col,b=a+stride;
    pillowIndex.push(...(side?[a,b,a+1,a+1,b,b+1]:[a,a+1,b,a+1,b+1,b]));
  }
  const rim:number[]=[];
  for(let i=0;i<=n;i++)rim.push(i);
  for(let i=1;i<=n;i++)rim.push(i*stride+n);
  for(let i=n-1;i>=0;i--)rim.push(n*stride+i);
  for(let i=n-1;i>0;i--)rim.push(i*stride);
  for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];pillowIndex.push(a,b+half,a+half,a,b,b+half);}
  const pillowGeometry=new THREE.BufferGeometry();pillowGeometry.setAttribute('position',new THREE.Float32BufferAttribute(pillowPositions,3));
  pillowGeometry.setAttribute('uv',new THREE.Float32BufferAttribute(pillowUV,2));pillowGeometry.setIndex(pillowIndex);pillowGeometry.computeVertexNormals();
  const pillow=add(pillowGeometry,pillowMaterial,'small-terracotta-linen-cushion');
  pillow.position.set(.24,.60,0);pillow.rotation.set(-.40,-.12,-.13);
  pillow.updateMatrix();
  // Rest the pinched rear against the real sloping back, instead of burying
  // half the cushion inside it or floating its bottom above the seat.
  let front=-.30;
  for(let i=half;i<pillowPositions.length/3;i++) {
    const p=new THREE.Vector3().fromBufferAttribute(pillowGeometry.getAttribute('position'),i).applyMatrix4(pillow.matrix);
    const hit=frontAt(p.x,p.y,.6);
    if(hit!==undefined)front=Math.max(front,hit-p.z+.002);
  }
  pillow.position.z=front;
  const seams:THREE.BufferGeometry[]=[];
  const hem=perimeter.map(i=>top[i].clone().add(new THREE.Vector3(0,.0008,0)));
  seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hem,true,'centripetal'),112,.00065,4,true));
  const pillowRim=rim.map(i=>new THREE.Vector3(pillowPositions[i*3],pillowPositions[i*3+1],0));
  const piping=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pillowRim,true,'centripetal'),64,.0008,4,true);
  pillow.updateMatrix();piping.applyMatrix4(pillow.matrix);seams.push(piping);
  add(mergeGeometries(seams)!,seamMaterial,'home-textile-stitched-hems');seams.forEach(g=>g.dispose());
  return {group};
}
