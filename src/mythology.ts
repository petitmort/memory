import * as THREE from 'three';
import { createSeascape } from './seascape';

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
  const seascape = createSeascape();
  group.add(seascape.group);
  const cliff=mesh(new THREE.SphereGeometry(1,30,18),new THREE.MeshStandardMaterial({color:'#867d6b',roughness:1}));cliff.name='cliff-foundation';cliff.position.set(0,-5.5,1);cliff.scale.set(4.3,5.3,5.1);
  return {group,update(t:number,reduced:boolean){seascape.update(t,reduced);}};
}
