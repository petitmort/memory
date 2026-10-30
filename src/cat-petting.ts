import * as THREE from "three";

/**
 * Four anatomical poses for the locally adapted scan, authored in metres.
 * Construct once before shader compilation; animation only changes GPU weights.
 */
export function prepareCatPetting(mesh: THREE.Mesh) {
  const geometry = mesh.geometry;
  const position = geometry.getAttribute("position");
  const count = position.count;
  const base = Float32Array.from(position.array);
  const head = base.slice(), ears = base.slice(), stretch = base.slice(), tail = base.slice();
  const smooth = THREE.MathUtils.smoothstep;
  const bell = (value: number, centre: number, width: number) => Math.exp(-(((value-centre)/width)**2));

  // The reconstructed tail is a separate connected surface. Identify it from
  // topology instead of a coordinate-only mask, which would bend the hind leg
  // immediately beneath it. Welding also keeps duplicate UV seam vertices in
  // the same component and gives the normal calculation a shared surface.
  const welded=new Int32Array(count),welds=new Map<string,number>();
  for(let i=0;i<count;i++) {
    const k=i*3,key=`${Math.round(base[k]*1e6)},${Math.round(base[k+1]*1e6)},${Math.round(base[k+2]*1e6)}`;
    let id=welds.get(key);
    if(id===undefined){id=welds.size;welds.set(key,id);}
    welded[i]=id;
  }
  const parents=Int32Array.from({length:welds.size},(_,i)=>i);
  function root(vertex:number) {
    while(parents[vertex]!==vertex){parents[vertex]=parents[parents[vertex]];vertex=parents[vertex];}
    return vertex;
  }
  const indices=geometry.index,triangleVertices=indices?.count??count;
  for(let i=0;i<triangleVertices;i+=3) {
    const a=root(welded[indices?indices.getX(i):i]);
    for(let j=1;j<3;j++)parents[root(welded[indices?indices.getX(i+j):i+j])]=a;
  }
  const components=new Map<number,{count:number;minX:number;minZ:number;maxZ:number}>();
  for(let i=0;i<count;i++) {
    const id=root(welded[i]),component=components.get(id)??{count:0,minX:Infinity,minZ:Infinity,maxZ:-Infinity};
    component.count++;component.minX=Math.min(component.minX,base[i*3]);
    component.minZ=Math.min(component.minZ,base[i*3+2]);component.maxZ=Math.max(component.maxZ,base[i*3+2]);
    components.set(id,component);
  }
  const tailComponents=new Set([...components].filter(([,part])=>
    part.count>100&&part.count<count/4&&part.minX>.09&&part.minZ>0&&part.maxZ>.14
  ).map(([id])=>id));

  for (let i=0;i<count;i++) {
    const offset=i*3,x=base[offset],y=base[offset+1],z=base[offset+2];
    // Fade through the neck. The paws, underside and ribcage stay supported;
    // the head tips upward from its neck rather than lifting the whole cat.
    const skull = smooth(-x,.065,.130)*smooth(z,-.100,-.030)*smooth(y,.006,.026);
    const dx=x+.085,dy=y-.048,dz=z+.040;
    const tilt=-.34*skull,yaw=-.14*skull;
    const cx=dx*Math.cos(tilt)-dy*Math.sin(tilt);
    const cy=dx*Math.sin(tilt)+dy*Math.cos(tilt);
    head[offset]=-.085+cx*Math.cos(yaw)+dz*Math.sin(yaw);
    head[offset+1]=.048+cy;
    head[offset+2]=-.040-cx*Math.sin(yaw)+dz*Math.cos(yaw);

    // Inner upright ear turns briefly back from its root. Separate spatial
    // falloffs avoid bending the neighbouring shoulder or skull with its tip.
    const inner=bell(x,-.114,.027)*bell(z,.018,.028)*smooth(y,.073,.104);
    const earY=y-.076,earZ=z-.018,angle=.44*inner;
    ears[offset+1]=.076+earY*Math.cos(angle)-earZ*Math.sin(angle);
    ears[offset+2]=.018+earY*Math.sin(angle)+earZ*Math.cos(angle);
    // The flattened outer ear responds more quietly, staying attached at its
    // base instead of appearing as an independent geometric piece.
    const outer=smooth(-x,.176,.207)*bell(z,.007,.035)*smooth(y,.005,.026);
    const ox=x+.176,oy=y-.032,outerAngle=-.28*outer;
    ears[offset]+=(ox*Math.cos(outerAngle)-oy*Math.sin(outerAngle))-ox;
    ears[offset+1]+=(ox*Math.sin(outerAngle)+oy*Math.cos(outerAngle))-oy;

    // Stretch only the upper shoulder/neck. The back and folded hind legs stay
    // still; the smoothly vanishing lower mask pins the paws and support plane.
    const shoulder=smooth(y,.015,.065)*smooth(x,-.15,-.075)*(1-smooth(x,.025,.10))*
      (1-smooth(Math.abs(z+.035),.085,.14));
    stretch[offset]-=.012*shoulder;
    stretch[offset+1]+=.014*shoulder;
    stretch[offset+2]-=.004*shoulder;

    if(tailComponents.has(root(welded[i]))) {
      // Leave the attached first third completely fixed. The distal curve
      // lifts and sweeps out from the flank, away from the folded hind leg.
      const tip=smooth(z,.070,.145),angle=.26*tip;
      const tx=x-.185,tz=z-.085;
      tail[offset]=.185+tx*Math.cos(angle)+tz*Math.sin(angle);
      tail[offset+1]+=.018*tip;
      tail[offset+2]=.085-tx*Math.sin(angle)+tz*Math.cos(angle);
    }
  }

  // Weld normals across the scan's duplicate UV vertices. Derive normal deltas
  // against the same rest calculation so unchanged fur has exactly zero delta.
  function normals(points:Float32Array) {
    const sums=new Float32Array(welds.size*3),indices=geometry.index;
    const triangles=indices?.count??count;
    for(let i=0;i<triangles;i+=3) {
      const ai=indices?indices.getX(i):i,bi=indices?indices.getX(i+1):i+1,ci=indices?indices.getX(i+2):i+2;
      const a=ai*3,b=bi*3,c=ci*3;
      const ux=points[b]-points[a],uy=points[b+1]-points[a+1],uz=points[b+2]-points[a+2];
      const vx=points[c]-points[a],vy=points[c+1]-points[a+1],vz=points[c+2]-points[a+2];
      const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
      for(const vertex of [ai,bi,ci]){const n=welded[vertex]*3;sums[n]+=nx;sums[n+1]+=ny;sums[n+2]+=nz;}
    }
    for(let i=0;i<sums.length;i+=3) {
      const length=Math.hypot(sums[i],sums[i+1],sums[i+2]);
      if(length>1e-12){sums[i]/=length;sums[i+1]/=length;sums[i+2]/=length;}
      else sums[i+1]=1;
    }
    const result=new Float32Array(count*3);
    for(let i=0;i<count;i++)for(let axis=0;axis<3;axis++)result[i*3+axis]=sums[welded[i]*3+axis];
    return result;
  }
  const restNormals=normals(base);
  geometry.morphTargetsRelative=true;
  geometry.morphAttributes.position=[];
  geometry.morphAttributes.normal=[];
  for(const [name,pose] of [["pet-head-nuzzle",head],["pet-ear-flick",ears],["pet-shoulder-stretch",stretch],["pet-tail-tip",tail]] as const) {
    const poseNormals=normals(pose),delta=new Float32Array(base.length),normalDelta=new Float32Array(base.length);
    for(let i=0;i<base.length;i++){delta[i]=pose[i]-base[i];normalDelta[i]=poseNormals[i]-restNormals[i];}
    const attribute=new THREE.BufferAttribute(delta,3);attribute.name=name;
    geometry.morphAttributes.position.push(attribute);
    geometry.morphAttributes.normal.push(new THREE.BufferAttribute(normalDelta,3));
  }
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  mesh.updateMorphTargets();
}
