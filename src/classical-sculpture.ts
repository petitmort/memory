import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createAntiqueBronze } from "./antique-materials";

/** An ivory-stone Athena, 1.05 m including its moulded collector's plinth. */
export function createAthenaSculpture(): THREE.Group {
  const statue = new THREE.Group();
  statue.name = "athena-collection-statue";
  const bronze = createAntiqueBronze(); bronze.bumpScale = .00045;
  const stone = new THREE.MeshStandardMaterial({ color: "#d9d3be", roughness: .86 });
  const recess = new THREE.MeshStandardMaterial({ color: "#8c8978", roughness: .93 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material = stone) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true;
    statue.add(mesh); return mesh;
  };
  const tube = (points: number[][], radius: number, material: THREE.Material = stone) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0],p[1],p[2]))), 40, radius, 9, false), material);
  const oval = (x: number,y: number,z: number,sx: number,sy: number,sz: number,material:THREE.Material = stone) => {
    const mesh=add(new THREE.SphereGeometry(1,16,10),material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);return mesh;
  };
  const pedestal = add(new THREE.LatheGeometry([
    [0,0],[.14,0],[.14,.018],[.132,.026],[.116,.039],[.108,.048],
    [.108,.198],[.118,.211],[.133,.222],[.14,.238],[.14,.25],[0,.25],
  ].map(v=>new THREE.Vector2(v[0],v[1])),80));
  pedestal.name="athena-moulded-plinth";
  for(const [r,y] of [[.134,.024],[.111,.047],[.121,.215]]) {
    const bead=add(new THREE.TorusGeometry(r,.0018,7,72));bead.rotation.x=Math.PI/2;bead.position.y=y;
  }
  oval(-.031,.262,.025,.025,.012,.050);
  oval(.038,.262,.012,.025,.012,.046);

  // Folded chiton: one continuous surface with an off-centre weight-bearing hip.
  const sections=72,radial=80,vertices:number[]=[],uv:number[]=[],indices:number[]=[];
  const profile=[[.27,.088],[.36,.081],[.50,.070],[.62,.052],[.73,.070],[.797,.091],[.85,.034]];
  const radius=(y:number)=>{
    for(let i=1;i<profile.length;i++)if(y<=profile[i][0]){
      const [ay,ar]=profile[i-1],[by,br]=profile[i];const t=THREE.MathUtils.smoothstep(y,ay,by);return ar+(br-ar)*t;
    }
    return .034;
  };
  for(let row=0;row<=sections;row++) {
    const v=row/sections,y=.27+v*.58,r=radius(y),lean=.012*Math.sin(v*Math.PI);
    for(let col=0;col<=radial;col++) {
      const a=col/radial*Math.PI*2;
      const fold=(Math.sin(a*15+.3*Math.sin(v*5))*.0048+Math.sin(a*29+v*.8)*.0012)*(1-v*.45);
      vertices.push(lean+Math.sin(a)*(r+fold),y+Math.sin(a*2+v)*.0018,Math.cos(a)*(r*.69+fold));
      uv.push(col/radial,v);
      if(row<sections&&col<radial){const n=row*(radial+1)+col;indices.push(n,n+1,n+radial+1,n+1,n+radial+2,n+radial+1);}
    }
  }
  const dress=new THREE.BufferGeometry();dress.setAttribute("position",new THREE.Float32BufferAttribute(vertices,3));dress.setAttribute("uv",new THREE.Float32BufferAttribute(uv,2));dress.setIndex(indices);dress.computeVertexNormals();
  add(dress).name="athena-continuous-chiton";
  // A broad folded mantle crosses the body and falls in a soft, asymmetric panel.
  const mantle=new THREE.PlaneGeometry(1,1,32,52),mp=mantle.attributes.position;
  for(let i=0;i<mp.count;i++){
    const u=mp.getX(i)+.5,v=mp.getY(i)+.5;
    const y=.34+v*.45,width=.052+Math.sin(v*Math.PI)*.058;
    const x=-.036+.022*Math.sin(v*2.4)+(u-.5)*width;
    const z=.057+.012*Math.sin(u*Math.PI)+.005*Math.sin(u*24+v*.7)*(1-v*.4);
    mp.setXYZ(i,x,y-.004*Math.sin(u*Math.PI),z);
  }
  mantle.computeVertexNormals();add(mantle).material=new THREE.MeshStandardMaterial({color:"#e0dac7",roughness:.9,side:THREE.DoubleSide});
  tube([[-.08,.79,.002],[-.108,.73,.022],[-.121,.66,.045]],.020);
  tube([[-.121,.66,.045],[-.13,.625,.083],[-.123,.612,.105]],.0125);
  tube([[.078,.796,.005],[.108,.753,.025],[.122,.709,.036]],.019);
  tube([[.122,.709,.036],[.148,.727,.045],[.164,.744,.044]],.0125);
  oval(.165,.744,.043,.014,.019,.014);
  oval(-.123,.612,.103,.014,.018,.012);
  oval(.004,.861,0,.026,.031,.026);

  // The head is carved as one surface; all facial relief remains part of its anatomy.
  const face=new THREE.SphereGeometry(1,48,32),fp=face.attributes.position;
  const bell=(x:number,y:number,cx:number,cy:number,sx:number,sy:number)=>Math.exp(-2*((x-cx)**2/(sx*sx)+(y-cy)**2/(sy*sy)));
  for(let i=0;i<fp.count;i++){
    const x=fp.getX(i),y=fp.getY(i),z=fp.getZ(i);
    let relief=0;
    if(z>0){
      relief=.0048*bell(x,y,0,.0,.18,.63)+.0028*bell(x,y,0,-.28,.28,.19);
      relief+=.0017*bell(x,y,0,-.58,.38,.13)-.0010*bell(x,y,0,-.49,.39,.055);
      for(const sign of [-1,1]){relief-=.0018*bell(x,y,sign*.38,.26,.3,.17);relief+=.0016*bell(x,y,sign*.4,.45,.37,.12);relief+=.0014*bell(x,y,sign*.53,-.11,.38,.35);}
    }
    fp.setXYZ(i,x*.037+.004,y*.051+.921,z*.033+relief+.005);
  }
  face.computeVertexNormals();add(face).name="athena-carved-face";
  // Corinthian-inspired brow, cheek guards and a narrow, upswept crest.
  const helmet=add(new THREE.SphereGeometry(.046,48,24,0,Math.PI*2,0,Math.PI*.57),bronze);
  helmet.position.set(.004,.933,.002);helmet.scale.z=.92;
  tube([[-.037,.936,.019],[-.020,.943,.036],[.003,.946,.043],[.027,.942,.033],[.043,.933,.016]],.0032,bronze);
  for(const side of [-1,1])tube([[side*.034+.004,.939,.002],[side*.039+.004,.916,.005],[side*.032+.004,.891,.017]],.0055,bronze);
  const crestShape=new THREE.Shape();
  crestShape.moveTo(-.058,.967);crestShape.bezierCurveTo(-.075,1.001,-.019,1.048,.031,1.043);crestShape.bezierCurveTo(.057,1.041,.061,1.028,.057,1.014);crestShape.quadraticCurveTo(-.005,1.032,-.042,.967);crestShape.closePath();
  const crest=add(new THREE.ExtrudeGeometry(crestShape,{depth:.008,bevelEnabled:true,bevelSize:.0015,bevelThickness:.0015,bevelSegments:2,curveSegments:26}),bronze);
  crest.rotation.y=Math.PI/2;crest.position.x=.0005;
  for(let i=0;i<9;i++)tube([[.005,.980+i*.003,-.04+i*.007],[.005,1.014+i*.002,-.03+i*.007]],.001,recess);

  const pectoral=new THREE.PlaneGeometry(1,1,28,16),pp=pectoral.attributes.position;
  for(let i=0;i<pp.count;i++){
    const u=pp.getX(i)+.5,v=pp.getY(i)+.5,x=(u-.5)*(.122+v*.024);
    pp.setXYZ(i,x+.009,.735+v*.077,.047+.017*Math.sin(u*Math.PI)+.003*Math.sin(u*40));
  }
  pectoral.computeVertexNormals();add(pectoral,bronze);
  for(let i=0;i<17;i++){
    const a=(i/16-.5)*Math.PI*.88;
    oval(.009+Math.sin(a)*.067,.799-Math.cos(a)*.026,.065,.002,.003,.0017,bronze);
  }

  const spear=add(new THREE.CylinderGeometry(.0026,.0032,.742,12),bronze);spear.position.set(.165,.629,.044);
  const bladeShape=new THREE.Shape();bladeShape.moveTo(-.007,0);bladeShape.quadraticCurveTo(-.012,.026,0,.052);bladeShape.quadraticCurveTo(.012,.026,.007,0);bladeShape.closePath();
  const blade=add(new THREE.ExtrudeGeometry(bladeShape,{depth:.003,bevelEnabled:true,bevelSize:.0006,bevelThickness:.0006,bevelSegments:2,curveSegments:14}),bronze);
  blade.position.set(.165,.998,.0425);

  // Convex oval shield with an inset Gorgon cameo and curling, chased serpent hair.
  const shield=new THREE.SphereGeometry(1,48,32),sp=shield.attributes.position;
  for(let i=0;i<sp.count;i++){
    const x=sp.getX(i),y=sp.getY(i),z=sp.getZ(i),front=Math.max(z,0);
    const cameo=Math.exp(-((x/.54)**2+(y/.58)**2)*2);
    let raised=.004*cameo;
    raised+=.004*bell(x,y,0,.0,.13,.39)-.002*(bell(x,y,-.22,.15,.13,.11)+bell(x,y,.22,.15,.13,.11));
    raised+=.0016*bell(x,y,0,-.25,.24,.07);
    sp.setXYZ(i,-.123+x*.080,.606+y*.103,.137+z*.012+raised*front);
  }
  shield.computeVertexNormals();add(shield,bronze).name="athena-gorgon-shield";
  const rim=add(new THREE.TorusGeometry(1,.018,7,64),bronze);rim.position.set(-.123,.606,.141);rim.scale.set(.079,.102,.079);
  for(let i=0;i<10;i++){
    const a=i*Math.PI*2/10,points:number[][]=[];
    for(let j=0;j<=11;j++){const t=j/11,r=.046+t*.01+Math.sin(t*Math.PI*2)*.004,angle=a+t*.58;points.push([-.123+Math.sin(angle)*r,.606+Math.cos(angle)*r*1.23,.150+Math.sin(t*Math.PI)*.0018]);}
    tube(points,.0018,bronze);
  }

  // The intricacy is static: bake by material for a compact gallery ornament.
  const batches=new Map<THREE.Material,THREE.Mesh[]>();
  for(const object of [...statue.children])if(object instanceof THREE.Mesh&&!Array.isArray(object.material)){
    const meshes=batches.get(object.material)??[];meshes.push(object);batches.set(object.material,meshes);
  }
  for(const [material,meshes] of batches){
    if(meshes.length<2)continue;
    const pieces=meshes.map(mesh=>{mesh.updateMatrix();const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();return g.applyMatrix4(mesh.matrix);});
    const geometry=mergeGeometries(pieces);
    if(geometry){const combined=new THREE.Mesh(geometry,material);combined.castShadow=combined.receiveShadow=true;combined.name="athena-sculpted-details";statue.add(combined);for(const mesh of meshes){statue.remove(mesh);mesh.geometry.dispose();}}
    for(const piece of pieces)piece.dispose();
  }
  statue.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(statue,true);statue.position.y-=bounds.min.y;statue.updateMatrixWorld(true);
  statue.userData.dimensions=new THREE.Box3().setFromObject(statue,true).getSize(new THREE.Vector3()).toArray();
  return statue;
}
