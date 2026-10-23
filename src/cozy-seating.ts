import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** A low, softly upholstered linen lounge, in metres, facing local +Z. */
export function createCozySeating() {
  const group = new THREE.Group();
  group.name = "oatmeal-linen-beanbag";
  const fabricMap = wovenLinen();
  const linen = new THREE.MeshPhysicalMaterial({
    map: fabricMap, bumpMap: fabricMap, bumpScale: .00065,
    color: "#c3a05f", roughness: .98,
    sheen: .28, sheenRoughness: .92, sheenColor: new THREE.Color("#f8dfac"),
  });
  const cushionLinen = linen.clone();
  cushionLinen.color.set("#cfad70");
  const stitch = new THREE.MeshStandardMaterial({ color: "#ad8747", roughness: 1 });
  const shell: THREE.BufferGeometry[] = [];
  const backPads: THREE.BufferGeometry[] = [];
  const seams: THREE.BufferGeometry[] = [];
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x,y,z);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(geometry,material);
    mesh.name = name; mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  const pose = (geometry: THREE.BufferGeometry, position: THREE.Vector3, rotation = 0) => {
    geometry.rotateX(rotation); geometry.translate(position.x,position.y,position.z); return geometry;
  };
  function softBox(width: number, height: number, depth: number, radius: number,
    deform: (x: number, y: number, z: number) => THREE.Vector3, segments = 5) {
    const geometry = new RoundedBoxGeometry(width,height,depth,segments,radius);
    const position = geometry.getAttribute("position");
    for(let i=0;i<position.count;i++) {
      const p=deform(position.getX(i),position.getY(i),position.getZ(i));
      position.setXYZ(i,p.x,p.y,p.z);
    }
    geometry.computeVertexNormals();return geometry;
  }
  const gaussian = (value: number, centre: number, width: number) => Math.exp(-(((value-centre)/width)**2));

  // One continuous, filled cloth shell carries the broad weighted base up
  // into the side bolsters and the high back. A rounded square footprint and
  // a narrow shoulder give it the yielding silhouette of a beanbag chair.
  const smooth=(a: number,b: number,x: number)=>THREE.MathUtils.smoothstep(x,a,b);
  const signPower=(value: number,power: number)=>Math.sign(value)*Math.abs(value)**power;
  const frontness=(angle: number)=>Math.max(0,Math.sin(angle));
  const backness=(angle: number)=>Math.max(0,-Math.sin(angle));
  function edge(angle: number, floor=false) {
    const back=backness(angle);
    return v((floor?.483:.455-.027*back)*signPower(Math.cos(angle),.48),0,
      (floor?.438:.415)*signPower(Math.sin(angle),.48));
  }
  function rimHeight(angle: number) {
    return .35+.418*smooth(-.05,1,-Math.sin(angle))+.15*Math.cos(angle)**2;
  }
  function topPoint(radius: number,angle: number) {
    const point=edge(angle), back=backness(angle), front=frontness(angle);
    const shoulder=smooth(.64-.25*back+.18*front,1,radius);
    const height=.307+(rimHeight(angle)-.307)*shoulder;
    const fold=.0065*(gaussian(angle,.62,.06)+gaussian(angle,Math.PI-.56,.06))
      *smooth(.70,1,radius);
    const relax=.003*Math.sin(angle*3+.7)*shoulder;
    return v(point.x*radius,height-fold+relax,point.z*radius);
  }
  function sidePoint(t: number,angle: number) {
    const top=topPoint(1,angle), floor=edge(angle,true), blend=smooth(0,1,t);
    const bulge=.010*Math.sin(Math.PI*t), normal=v(Math.cos(angle),0,Math.sin(angle));
    const point=top.clone().lerp(floor,blend).addScaledVector(normal,bulge);
    point.y=.001+(top.y-.001)*Math.cos(t*Math.PI/2)**1.35;
    const front=frontness(angle), gathering=Math.sin(t*Math.PI)**.65;
    // A handful of tapered folds radiate from sewn front corners. Their
    // depressions are anatomical to the chair panels, never an all-over wave.
    const gather=(gaussian(angle,.67+.08*t,.028)+gaussian(angle,2.49-.07*t,.033))
      *.010*gathering;
    point.addScaledVector(normal,-gather);
    point.y-=.004*front*gaussian(t,.72,.12)*Math.cos(angle*5);
    return point;
  }
  const columns=80,topRings=18,sideRings=22;
  const positions:number[]=[0,.307,0],uvs:number[]=[.5,.5],indices:number[]=[],rings:number[]=[];
  function ring(point:(angle: number)=>THREE.Vector3,side:boolean) {
    const start=positions.length/3;rings.push(start);
    for(let column=0;column<=columns;column++) {
      const angle=column/columns*Math.PI*2,p=point(angle);
      positions.push(p.x,p.y,p.z);
      if(side)uvs.push(column/columns*2,p.y*2);
      else uvs.push(p.x*2+.5,p.z*2+.5);
    }
  }
  for(let row=1;row<=topRings;row++)ring(angle=>topPoint(row/topRings,angle),false);
  for(let row=1;row<=sideRings;row++)ring(angle=>sidePoint(row/sideRings,angle),true);
  for(let column=0;column<columns;column++)indices.push(0,rings[0]+column+1,rings[0]+column);
  for(let row=0;row<rings.length-1;row++)for(let column=0;column<columns;column++) {
    const a=rings[row]+column,b=rings[row+1]+column;
    indices.push(a,b+1,b,a,a+1,b+1);
  }
  const bottom=positions.length/3;positions.push(0,.001,0);uvs.push(.5,.5);
  for(let column=0;column<columns;column++)indices.push(rings.at(-1)!+column,rings.at(-1)!+column+1,bottom);
  const body=new THREE.BufferGeometry();
  body.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
  body.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));
  body.setIndex(indices);body.computeVertexNormals();
  const normals=body.getAttribute("normal");
  for(const start of rings) {
    const normal=v(0,0,0).fromBufferAttribute(normals,start)
      .add(v(0,0,0).fromBufferAttribute(normals,start+columns)).normalize();
    normals.setXYZ(start,normal.x,normal.y,normal.z);
    normals.setXYZ(start+columns,normal.x,normal.y,normal.z);
  }
  shell.push(body);

  // Two thick, gently compressed back pads, with an actual fold between them.
  // Broad pillow bulges and pinched seams read as upholstery in the room view.
  const pads=[
    {width:.642,height:.242,depth:.17,centre:v(-.006,.676,-.215),angle:-.18,phase:.2},
    {width:.635,height:.171,depth:.174,centre:v(.002,.480,-.163),angle:-.12,phase:1.7},
  ];
  for(const pad of pads) {
    const halfX=pad.width/2,halfY=pad.height/2;
    const geometry=softBox(pad.width,pad.height,pad.depth,.070,(x,y,z)=>{
      const front=Math.max(0,z/(pad.depth/2));
      const edge=Math.max(0,Math.abs(x)/halfX-.55)/.45;
      const tuck=(gaussian(x,-halfX*.77,.022)+gaussian(x,halfX*.74,.022));
      const crease=.0055*tuck*Math.max(0,1-Math.abs(y)/halfY)*front;
      return v(x+.002*Math.sin(y*17+pad.phase)*edge,
        y+.003*Math.sin(x*11+pad.phase)*Math.max(0,y/halfY),z-crease);
    });
    pose(geometry,pad.centre,pad.angle);backPads.push(geometry);
  }

  // The generous seat is almost level where the cat rests, with a shallow
  // pressure dent rather than a hard platform or a conspicuous circular bowl.
  const seat=softBox(.668,.13,.572,.055,(x,y,z)=>{
    const top=Math.max(0,y/.065), front=Math.max(0,z/.286);
    const pressure=.0045*Math.exp(-((x+.025)**2/.055+(z-.035)**2/.035));
    const crease=.003*(gaussian(x,-.255,.022)+gaussian(x,.25,.02))*front*top;
    return v(x,y-pressure*top-crease,z+.002*Math.sin(x*18)*front);
  });
  pose(seat,v(0,.29,.072));
  add(seat,cushionLinen,"beanbag-yielding-seat-cushion");

  function seam(points: THREE.Vector3[], closed=false, radius=.0013) {
    seams.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points,closed,"centripetal"),
      closed?72:36,radius,4,closed));
  }
  // Piping follows the middle of the seat's rounded side wall, where it is
  // actually supported by the cushion, and a hand sewn hem defines the base.
  function roundedOutline(width: number, depth: number, radius: number, y: number, z: number) {
    const points: THREE.Vector3[]=[];
    for(const [cx,cz,start] of [[width/2-radius,depth/2-radius,0],[-width/2+radius,depth/2-radius,Math.PI/2],
      [-width/2+radius,-depth/2+radius,Math.PI],[width/2-radius,-depth/2+radius,Math.PI*1.5]]) {
      for(let step=0;step<12;step++) {
        const angle=start+step/12*Math.PI/2;
        points.push(v(cx+radius*Math.cos(angle),y+.0008*Math.sin(angle*3),z+cz+radius*Math.sin(angle)));
      }
    }
    return points;
  }
  seam(roundedOutline(.669,.573,.055,.290,.072),true);
  const hem:THREE.Vector3[]=[];
  for(let i=0;i<96;i++)hem.push(sidePoint(.90,i/96*Math.PI*2).add(v(0,.0005,0)));
  seam(hem,true,.00105);
  // The long panel joins bend with the yielding shoulder and disappear into
  // the hem. This is one sewn cloth bag, rather than stacked upholstered boxes.
  for(const angle of [.67,Math.PI-.65]) {
    const points:THREE.Vector3[]=[];
    for(let step=0;step<=32;step++) {
      const t=step/32*.90,p=sidePoint(t,angle+.04*Math.sin(t*Math.PI));
      p.add(v(Math.cos(angle)*.0012,0,Math.sin(angle)*.0012));points.push(p);
    }
    seam(points,false,.0011);
  }

  const shellGeometry=mergeGeometries(shell)!;
  add(shellGeometry,linen,"beanbag-soft-linen-shell");
  add(mergeGeometries(backPads)!,cushionLinen,"beanbag-soft-segmented-back-pads");
  add(mergeGeometries(seams)!,stitch,"beanbag-tailored-panel-seams");
  for(const geometry of [...shell,...backPads,...seams]) geometry.dispose();

  const catNest=new THREE.Group();
  catNest.name="beanbag-cat-nest";
  catNest.position.set(-.025,.352,.107);
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
