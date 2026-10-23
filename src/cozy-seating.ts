import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** A softly filled one-person linen lounge, in metres, facing local +Z. */
export function createCozySeating() {
  const group = new THREE.Group();
  group.name = "oatmeal-linen-beanbag";
  const fabricMap = wovenLinen();
  const linen = new THREE.MeshPhysicalMaterial({
    map: fabricMap, bumpMap: fabricMap, bumpScale: .00055,
    color: "#e9ddc5", roughness: .98,
    sheen: .24, sheenRoughness: .9, sheenColor: new THREE.Color("#fff2d9"),
  });
  const sage = new THREE.MeshStandardMaterial({
    map: fabricMap, bumpMap: fabricMap, bumpScale: .00045,
    color: "#91a18b", roughness: 1, side: THREE.DoubleSide,
  });
  const stitch = new THREE.MeshStandardMaterial({ color: "#b9ad95", roughness: 1 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  const seatHeight = .326, radiusX = .49, radiusZ = .45, centreZ = .012;
  const smooth = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x,a,b);
  const edgeScale = (angle: number) => 1 + .018 * Math.sin(angle * 3) + .012 * Math.cos(angle * 5);
  const rimHeight = (angle: number) => .383 + .303 * smooth(.15,1,-Math.sin(angle))
    + .052 * Math.cos(angle) ** 2;
  function topPoint(radius: number, angle: number) {
    const scale = edgeScale(angle);
    const x = radiusX * radius * scale * Math.cos(angle);
    const z = centreZ + radiusZ * radius * scale * Math.sin(angle);
    const shoulder = smooth(.58,1,radius) ** 1.45;
    const folds = .0028 * Math.sin(angle * 19 + radius * 5) * smooth(.78,1,radius);
    return new THREE.Vector3(x,seatHeight + (rimHeight(angle)-seatHeight)*shoulder + folds,z);
  }
  function surfaceHeight(x: number, z: number) {
    const angle = Math.atan2((z-centreZ)/radiusZ,x/radiusX);
    const radius = Math.hypot(x/radiusX,(z-centreZ)/radiusZ)/edgeScale(angle);
    return topPoint(Math.min(1,radius),angle).y;
  }
  function sidePoint(t: number, angle: number) {
    const scale = edgeScale(angle);
    const softness = Math.sin(Math.PI*t);
    const radius = 1 + .035*softness - .26*t**2.1
      + .0035*Math.sin(angle*13+t*2)*softness;
    const y = .001 + (topPoint(1,angle).y-.001)*(1-t)**1.55;
    return new THREE.Vector3(radiusX*scale*radius*Math.cos(angle),y,
      centreZ+radiusZ*scale*radius*Math.sin(angle));
  }

  // One continuous upholstered shell: a broad seat depression rises into a
  // slightly irregular high back, then rounds down into the weighted base.
  const columns = 64, topRings = 22, sideRings = 12, stride = columns+1;
  const positions: number[] = [0,seatHeight,centreZ];
  const uvs: number[] = [.5,.5];
  const indices: number[] = [];
  const rings: number[] = [];
  function ring(point: (angle: number) => THREE.Vector3, side: boolean) {
    const start = positions.length/3;
    rings.push(start);
    for (let column=0;column<=columns;column++) {
      const angle=column/columns*Math.PI*2, p=point(angle);
      positions.push(p.x,p.y,p.z);
      if(side) uvs.push(column/columns*3,p.y*3);
      else uvs.push(p.x*3+.5,(p.z-centreZ)*3+.5);
    }
  }
  for(let row=1;row<=topRings;row++) ring(angle=>topPoint(row/topRings,angle),false);
  for(let row=1;row<=sideRings;row++) ring(angle=>sidePoint(row/sideRings,angle),true);
  for(let column=0;column<columns;column++) indices.push(0,rings[0]+column+1,rings[0]+column);
  for(let row=0;row<rings.length-1;row++) for(let column=0;column<columns;column++) {
    const a=rings[row]+column,b=rings[row+1]+column;
    indices.push(a,b+1,b,a,a+1,b+1);
  }
  const bottom=positions.length/3;
  positions.push(0,.001,centreZ);uvs.push(.5,.5);
  for(let column=0;column<columns;column++)
    indices.push(rings.at(-1)!+column,rings.at(-1)!+column+1,bottom);
  const bodyGeometry=new THREE.BufferGeometry();
  bodyGeometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  bodyGeometry.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  bodyGeometry.setIndex(indices);
  bodyGeometry.computeVertexNormals();
  // UV wrapping splits the seam vertices, but the filled shape remains smooth.
  const normals=bodyGeometry.getAttribute("normal");
  for(const start of rings) {
    const normal=new THREE.Vector3().fromBufferAttribute(normals,start)
      .add(new THREE.Vector3().fromBufferAttribute(normals,start+columns)).normalize();
    normals.setXYZ(start,normal.x,normal.y,normal.z);
    normals.setXYZ(start+columns,normal.x,normal.y,normal.z);
  }
  add(bodyGeometry,linen,"beanbag-soft-linen-shell");
  // A settled cushion breaks up the bowl shape and compresses under the cat.
  const cushion = new RoundedBoxGeometry(.64,.075,.52,5,.035);
  const cushionPositions = cushion.getAttribute("position");
  for(let i=0;i<cushionPositions.count;i++) {
    const x=cushionPositions.getX(i),y=cushionPositions.getY(i),z=cushionPositions.getZ(i);
    const top=Math.max(0,y/.0375);
    const pressure=.006*Math.exp(-((x+.025)**2/.06+(z-.045)**2/.04));
    cushionPositions.setY(i,y-pressure*top+.0015*Math.sin(x*18+z*12)*top);
  }
  cushion.computeVertexNormals();
  const pad=add(cushion,linen,"beanbag-yielding-seat-cushion");
  pad.position.set(0,.3235,.012);pad.rotation.y=.025;

  const seams: THREE.BufferGeometry[]=[];
  const rim=[];
  for(let index=0;index<96;index++) rim.push(topPoint(.991,index/96*Math.PI*2).add(new THREE.Vector3(0,.0015,0)));
  seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim,true,"centripetal"),96,.00135,5,true));
  for(const angle of [.20,Math.PI-.20]) {
    const points=[];
    for(let index=0;index<=24;index++) {
      const point=sidePoint(index/24,angle);
      point.x+=Math.cos(angle)*.0014;point.z+=Math.sin(angle)*.0014;
      points.push(point);
    }
    seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),32,.0012,5,false));
  }
  const seamGeometry=mergeGeometries(seams);
  if(seamGeometry) add(seamGeometry,stitch,"beanbag-tailored-panel-seams");
  for(const geometry of seams) geometry.dispose();

  // The throw lies across one arm and drops over its outside. Its inner edge
  // leaves the cat's broad, level seat patch open instead of hovering over it.
  function blanketPoint(u: number,t: number) {
    const z=centreZ+.10+(u-.5)*.29;
    const angle=Math.asin((z-centreZ)/radiusZ);
    const edgeX=radiusX*Math.cos(angle)*edgeScale(angle);
    const fold=Math.sin(u*Math.PI*9+.28*Math.sin(t*4))*.0025;
    if(t<=.68) {
      const x=.245+(edgeX-.245)*(t/.68);
      return new THREE.Vector3(x,surfaceHeight(x,z)+.0038+fold*.5,z);
    }
    const hanging=(t-.68)/.32;
    return new THREE.Vector3(edgeX+.012+.022*Math.sin(hanging*Math.PI)+fold,
      THREE.MathUtils.lerp(surfaceHeight(edgeX,z)+.004,.047,hanging)
        + .003*Math.sin(u*11)*hanging,
      z+.007*Math.sin(hanging*Math.PI));
  }
  const throwGeometry=new THREE.PlaneGeometry(1,1,24,32);
  const throwPositions=throwGeometry.getAttribute("position"),throwUV=throwGeometry.getAttribute("uv");
  for(let index=0;index<throwPositions.count;index++) {
    const u=throwUV.getX(index),t=1-throwUV.getY(index),point=blanketPoint(u,t);
    throwPositions.setXYZ(index,point.x,point.y,point.z);
    throwUV.setXY(index,u*.8,t*1.3);
  }
  throwGeometry.computeVertexNormals();
  add(throwGeometry,sage,"sage-linen-corner-throw");
  const hem=[];
  for(let index=0;index<=32;index++) hem.push(blanketPoint(index/32,1));
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hem),32,.0013,4,false),sage,"throw-soft-folded-hem");

  const catNest=new THREE.Group();
  catNest.name="beanbag-cat-nest";
  // The central seat is level to radius .58; an adult curled cat fits on this
  // 48 × 35 cm patch, just above the actual fabric, with room beside the throw.
  catNest.position.set(-.025,.355,.045);
  group.add(catNest);
  return {group,catNest};
}

function wovenLinen() {
  const canvas=document.createElement("canvas");canvas.width=canvas.height=512;
  const ctx=canvas.getContext("2d")!;
  ctx.fillStyle="#e8e3d9";ctx.fillRect(0,0,512,512);
  let seed=7361;
  const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  for(let coordinate=0;coordinate<512;coordinate+=2) {
    ctx.fillStyle=`rgba(119,110,94,${.035+random()*.045})`;
    ctx.fillRect(coordinate,0,.65,512);
    ctx.fillStyle=`rgba(255,252,235,${.09+random()*.08})`;
    ctx.fillRect(0,coordinate,512,.8);
  }
  for(let index=0;index<2400;index++) {
    ctx.fillStyle=index%3?"rgba(255,250,231,.07)":"rgba(113,104,86,.055)";
    ctx.fillRect(random()*512,random()*512,.4+random()*.9,.5+random()*1.5);
  }
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.anisotropy=4;
  return texture;
}
