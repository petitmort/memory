import * as THREE from 'three';
import { createSeascape } from './seascape';
import { createArtifacts } from './artifacts';

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
  const mesh=(g:THREE.BufferGeometry,m:THREE.Material,p:THREE.Object3D=group)=>{const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;p.add(o);return o;};
  group.add(createArtifacts());
  const mural=mesh(new THREE.PlaneGeometry(.83,1.10),mythTextile());mural.position.set(-2.195,1.65,.22);mural.rotation.y=Math.PI/2;mural.name='greek-gods-tapestry';
  const seascape = createSeascape();
  group.add(seascape.group);
  const cliff=mesh(new THREE.SphereGeometry(1,30,18),new THREE.MeshStandardMaterial({color:'#867d6b',roughness:1}));cliff.name='cliff-foundation';cliff.position.set(0,-5.5,1);cliff.scale.set(4.3,5.3,5.1);
  return {group,update(t:number,reduced:boolean){seascape.update(t,reduced);}};
}
