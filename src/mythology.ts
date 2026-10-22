import * as THREE from 'three';

// A collector's Aegean: aged bronze indoors, an epic told beyond the window.
export function mythTextile() {
  const c=document.createElement('canvas'); c.width=1024;c.height=716;
  const x=c.getContext('2d')!;
  x.fillStyle='#304c59';x.fillRect(0,0,1024,716);
  x.strokeStyle='#bda071';x.lineWidth=3;
  for(let b=18;b<55;b+=12)x.strokeRect(b,b,1024-b*2,716-b*2);
  for(let i=70;i<960;i+=36)for(const y of [66,632]){x.beginPath();x.moveTo(i,y+18);x.lineTo(i,y);x.lineTo(i+26,y);x.lineTo(i+26,y+24);x.lineTo(i+9,y+24);x.lineTo(i+9,y+9);x.stroke();}
  // Classical medallions: Helios, the sea and Poseidon's trident.
  for(const cx of [260,512,764]){x.beginPath();x.ellipse(cx,358,103,185,0,0,Math.PI*2);x.stroke();}
  x.save();x.translate(260,335);
  for(let i=0;i<16;i++){x.rotate(Math.PI/8);x.beginPath();x.moveTo(0,-58);x.lineTo(-9,-108);x.lineTo(9,-108);x.closePath();x.fillStyle='#bda071';x.fill();}
  x.beginPath();x.arc(0,0,53,0,7);x.stroke();x.beginPath();x.moveTo(-24,-8);x.lineTo(-8,-8);x.moveTo(8,-8);x.lineTo(24,-8);x.moveTo(0,-7);x.lineTo(-4,16);x.lineTo(8,16);x.moveTo(-12,31);x.quadraticCurveTo(0,38,15,28);x.stroke();x.restore();
  x.lineWidth=8;x.beginPath();x.moveTo(512,480);x.lineTo(512,248);x.moveTo(457,253);x.lineTo(457,318);x.quadraticCurveTo(512,370,567,318);x.lineTo(567,253);x.stroke();
  for(const a of [457,512,567]){x.beginPath();x.moveTo(a-12,267);x.lineTo(a,235);x.lineTo(a+12,267);x.stroke();}
  x.lineWidth=4;for(let y=280;y<440;y+=27){x.beginPath();for(let i=0;i<140;i++)x.lineTo(697+i,y+Math.sin(i*.06+y)*14);x.stroke();}
  // Uneven warp and faded dye, rather than a pristine printed graphic.
  for(let i=0;i<716;i+=2){x.fillStyle=`rgba(225,205,170,${.025+(i%7)*.004})`;x.fillRect(0,i,1024,1);}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
  return new THREE.MeshStandardMaterial({map:t,roughness:1});
}
export function createMythology() {
  const group=new THREE.Group();group.name='aegean-mythology';
  const bronze=new THREE.MeshStandardMaterial({color:'#887047',metalness:.65,roughness:.55});
  const patina=new THREE.MeshStandardMaterial({color:'#486b64',metalness:.45,roughness:.72});
  const wood=new THREE.MeshStandardMaterial({color:'#55402e',roughness:.9});
  const ivory=new THREE.MeshStandardMaterial({color:'#c4b18a',roughness:.6});
  const mesh=(g:THREE.BufferGeometry,m:THREE.Material,p:THREE.Object3D=group)=>{const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;p.add(o);return o;};
  const tube=(pts:number[][],r:number,m:THREE.Material,p=group)=>mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(v=>new THREE.Vector3(...v as [number,number,number]))),40,r,8,false),m,p);
  const trident=new THREE.Group();trident.name='poseidon-trident';trident.position.set(-2.04,.08,-2.12);trident.rotation.z=-.1;group.add(trident);
  mesh(new THREE.CylinderGeometry(.014,.019,1.75,12),bronze,trident).position.y=.875;
  tube([[-.19,1.65,0],[-.18,1.48,0],[0,1.42,0],[.18,1.48,0],[.19,1.65,0]],.016,patina,trident);
  for(const a of [-.19,0,.19]){const tip=mesh(new THREE.ConeGeometry(.032,.16,8),bronze,trident);tip.position.set(a,a===0?1.86:1.73,0);}
  for(let i=0;i<5;i++){const ring=mesh(new THREE.TorusGeometry(.021,.004,6,14),bronze,trident);ring.rotation.x=Math.PI/2;ring.position.y=.32+i*.04;}
  const horn=new THREE.Group();horn.name='mythic-drinking-horn';horn.position.set(-.43,.80,-.73);horn.rotation.set(.2,.8,1.2);group.add(horn);
  const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(0,0,0),new THREE.Vector3(.04,.08,0),new THREE.Vector3(.06,.18,0),new THREE.Vector3(.02,.25,0)]);
  const hg=new THREE.TubeGeometry(curve,28,.04,16,false);const hp=hg.attributes.position;
  for(let i=0;i<hp.count;i++){const t=Math.floor(i/17)/28;const center=curve.getPointAt(t);const v=new THREE.Vector3().fromBufferAttribute(hp,i).sub(center).multiplyScalar(.15+.85*t).add(center);hp.setXYZ(i,v.x,v.y,v.z);}hg.computeVertexNormals();mesh(hg,ivory,horn);
  const rim=mesh(new THREE.TorusGeometry(.04,.006,8,24),bronze,horn);rim.position.set(.02,.25,0);rim.rotation.y=Math.PI/2;
  const hammer=new THREE.Group();hammer.name='dwarven-forged-hammer';hammer.position.set(-.36,.79,-1.17);hammer.rotation.y=.3;group.add(hammer);
  mesh(new THREE.CylinderGeometry(.012,.015,.25,10),wood,hammer).rotation.z=Math.PI/2;
  const head=mesh(new THREE.BoxGeometry(.075,.075,.14),patina,hammer);head.position.x=-.13;
  for(const z of [-.075,.075]){const cap=mesh(new THREE.BoxGeometry(.08,.08,.009),bronze,hammer);cap.position.set(-.13,0,z);}
  const mural=mesh(new THREE.PlaneGeometry(.83,1.10),mythTextile());mural.position.set(-2.195,1.65,.22);mural.rotation.y=Math.PI/2;mural.name='greek-gods-tapestry';
  // Hull, curved canvas and rigging are real geometry, not a seascape billboard.
  const ship=new THREE.Group();ship.name='mythic-sailing-ship';ship.position.set(-19,-8,-39);ship.rotation.y=.82;group.add(ship);
  const hull=mesh(new THREE.SphereGeometry(1,32,16),wood,ship);hull.scale.set(1.55,1.25,5.5);hull.position.y=.4;
  const sailCanvas=document.createElement('canvas');sailCanvas.width=sailCanvas.height=512;
  const sc=sailCanvas.getContext('2d')!;sc.fillStyle='#d9c9a8';sc.fillRect(0,0,512,512);
  for(let i=0;i<512;i+=3){sc.fillStyle=i%2?'#d4c4a3':'#decfaf';sc.fillRect(i,0,1,512);sc.fillRect(0,i,512,1);}
  sc.strokeStyle='#9a8867';sc.lineWidth=1;for(let i=15;i<512;i+=80){sc.beginPath();sc.moveTo(i,0);sc.lineTo(i,512);sc.stroke();}
  sc.strokeRect(8,8,496,496);const sailTexture=new THREE.CanvasTexture(sailCanvas);sailTexture.colorSpace=THREE.SRGBColorSpace;
  const sailMat=new THREE.MeshStandardMaterial({map:sailTexture,side:THREE.DoubleSide,roughness:.95});
  for(const z of [-2,1.4]){const mast=mesh(new THREE.CylinderGeometry(.07,.11,10,10),wood,ship);mast.position.set(0,5.1,z);
    for(const [y,w,h] of [[7.6,5.1,3],[4.5,4.4,2.5]]){const g=new THREE.PlaneGeometry(w,h,14,10);const p=g.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,Math.sin((p.getX(i)/w+.5)*Math.PI)*.65);g.computeVertexNormals();const sail=mesh(g,sailMat,ship);sail.position.set(0,y,z);tube([[-w/2,y+h/2,z],[w/2,y+h/2,z]],.045,wood,ship);}
    for(const x of [-1.4,1.4])tube([[0,9.9,z],[x,1,z+2]],.016,ivory,ship);
  }
  const monster=new THREE.Group();monster.name='distant-kraken';monster.position.set(-27,-8,-68);group.add(monster);
  const skin=new THREE.MeshStandardMaterial({color:'#305f60',roughness:.48,metalness:.15});
  const arms:THREE.Object3D[]=[];
  for(let i=0;i<5;i++){const arm=new THREE.Group();arm.rotation.y=i*1.35;monster.add(arm);arms.push(arm);
    const points=[[2,0,0],[3,2,.3*Math.sin(i)],[4+i%2,4+i*.5,0],[3.4,6+i*.5,.4],[1.8,6.8+i*.5,1],[1.4,5.8+i*.5,1.2]];
    const g=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v as [number,number,number]))),44,.52,10,false);const p=g.attributes.position;const path=new THREE.CatmullRomCurve3(points.map(v=>new THREE.Vector3(...v as [number,number,number])));
    for(let j=0;j<p.count;j++){const t=Math.floor(j/11)/44;const c=path.getPointAt(t);const v=new THREE.Vector3().fromBufferAttribute(p,j).sub(c).multiplyScalar(1-t*.9).add(c);p.setXYZ(j,v.x,v.y,v.z);}g.computeVertexNormals();mesh(g,skin,arm);
    const suckers=new THREE.InstancedMesh(new THREE.TorusGeometry(1,.23,6,10),ivory,18),stamp=new THREE.Object3D();
    for(let j=0;j<18;j++){const t=.15+j*.042,c=path.getPointAt(t),r=.12*(1-t*.8);stamp.position.copy(c);stamp.position.z+=.49*(1-t*.9);stamp.scale.setScalar(r);stamp.updateMatrix();suckers.setMatrixAt(j,stamp.matrix);}arm.add(suckers);

  }
  const vortexMat=new THREE.MeshBasicMaterial({color:'#b0d7cf',transparent:true,opacity:.38,depthWrite:false,side:THREE.DoubleSide});
  const vortex=new THREE.Group();vortex.name='whirlpool';vortex.position.copy(monster.position);vortex.position.y+=.12;group.add(vortex);
  for(let i=0;i<4;i++){const pts:number[][]=[];for(let j=0;j<=100;j++){const a=j*.12+i*Math.PI/2;const r=.5+j*.075;pts.push([Math.cos(a)*r,-.6+j*.006,Math.sin(a)*r]);}tube(pts,.055,vortexMat,vortex);}
  const helios=new THREE.Group();helios.name='helios-radiant-sun';helios.position.set(-57,17,-122);group.add(helios);
  const gold=new THREE.MeshBasicMaterial({color:'#ffe3a0',fog:false});mesh(new THREE.SphereGeometry(3,32,20),gold,helios);
  for(let i=0;i<20;i++){const a=i*Math.PI/10;const ray=mesh(new THREE.ConeGeometry(.23,2.7,5),gold,helios);ray.position.set(Math.sin(a)*5,Math.cos(a)*5,0);ray.rotation.z=-a;}
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=256;
  const glowCtx=glowCanvas.getContext('2d')!,gradient=glowCtx.createRadialGradient(128,128,20,128,128,128);
  gradient.addColorStop(0,'rgba(255,227,163,.7)');gradient.addColorStop(.38,'rgba(255,222,155,.28)');gradient.addColorStop(1,'rgba(255,222,155,0)');glowCtx.fillStyle=gradient;glowCtx.fillRect(0,0,256,256);
  const aura=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowCanvas),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false}));aura.scale.set(21,21,1);helios.add(aura);
  // A quiet archaic face, engraved into the solar disc.
  const faceCanvas=document.createElement('canvas');faceCanvas.width=faceCanvas.height=256;
  const f=faceCanvas.getContext('2d')!;f.strokeStyle='#b18a43';f.lineWidth=3;f.lineCap='round';
  f.beginPath();f.ellipse(128,132,73,86,0,0,Math.PI*2);f.moveTo(77,113);f.quadraticCurveTo(95,99,111,113);f.moveTo(145,113);f.quadraticCurveTo(163,99,181,113);f.moveTo(128,116);f.lineTo(118,150);f.lineTo(136,150);f.moveTo(108,173);f.quadraticCurveTo(128,185,150,171);f.stroke();
  const face=mesh(new THREE.PlaneGeometry(5.8,5.8),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(faceCanvas),transparent:true,depthWrite:false,fog:false}),helios);face.position.z=3.03;
  const halo=mesh(new THREE.RingGeometry(3.4,3.55,64),gold,helios);halo.material.side=THREE.DoubleSide;
  const cliff=mesh(new THREE.SphereGeometry(1,30,18),new THREE.MeshStandardMaterial({color:'#867d6b',roughness:1}));cliff.name='cliff-foundation';cliff.position.set(0,-5.5,1);cliff.scale.set(4.3,5.3,5.1);
  return {group,update(t:number,reduced:boolean){const a=reduced?t*.12:t;ship.rotation.z=Math.sin(a*.51)*.035;ship.position.y=-8+Math.sin(a*.71)*.25;vortex.rotation.y=-a*.13;arms.forEach((o,i)=>o.rotation.z=Math.sin(a*.4+i)*.055);}};
}
