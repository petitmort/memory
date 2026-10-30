import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CAT_REACTIONS, type CatReactionProfile } from '../src/cat-reactions';
import { CAT_REDUCED_WEIGHT, sampleCatResponse } from '../src/cat-choreography';
import { createCatRig } from '../src/cat-rig';

const axes = ['head', 'yaw', 'roll', 'ears', 'earOuter', 'stretch', 'tail', 'tailCurl'] as const;
const rest = { head:0, yaw:0, roll:0, ears:0, earOuter:0, stretch:0, tail:0, tailCurl:0 };

test('six response shapes differ while each vocal cue has an anticipatory head and ear response', () => {
  const signatures = new Set<string>();
  for (const profile of CAT_REACTIONS) {
    signatures.add(JSON.stringify([.4,.8,1.3,1.9,2.5,3.3].map(time => sampleCatResponse(time,false,profile))));
    for (const [cueIndex,cue] of profile.cues.entries()) {
      const before = sampleCatResponse(Math.max(.001,cue.start-.25),false,profile);
      const accent = sampleCatResponse(cue.peak ?? cue.start+.15,false,profile);
      const during = sampleCatResponse((cue.start+cue.end)/2,false,profile);
      const end = sampleCatResponse(cue.end,false,profile);
      if(cueIndex===0)expect(accent.head, profile.id).toBeGreaterThan(before.head+.08);
      else expect(accent.head, 'Closely spaced calls retain the raised head instead of forcing a dip').toBeGreaterThan(.75);
      expect(during.head, profile.id).toBeGreaterThan(.55);
      expect(end.head, profile.id).toBeGreaterThan(.50);
      expect(sampleCatResponse(cue.start+.08,false,profile).ears,profile.id).toBeGreaterThan(.70);
    }
  }
  expect(signatures.size).toBe(6);
  const profile = (id: string) => CAT_REACTIONS.find(item => item.id===id)!;
  expect(sampleCatResponse(1.40,false,profile('stretch')).stretch)
    .toBeGreaterThan(sampleCatResponse(1.40,false,profile('curious')).stretch+.35);
  const tailEnergy = (id: string) => Array.from({length:88},(_,i)=>Math.abs(sampleCatResponse(i*.05,false,profile(id)).tail)).reduce((sum,value)=>sum+value,0);
  expect(tailEnergy('playful')).toBeGreaterThan(tailEnergy('sleepy')*1.7);
});

test('random response parameters preserve smooth bounded poses, quiet endpoints and reduced-motion timing', () => {
  let maxStep=0,maxValue=0,maxReducedError=0,timingMismatch=false;
  for (const original of CAT_REACTIONS) for (const direction of [-1,1]) {
    const profile: CatReactionProfile = {...original,variation:{amplitude:.96,direction,tailPhase:direction*.10}};
    let previous=sampleCatResponse(0,false,profile);
    expect(previous).toEqual({...rest,done:false});
    for (let time=.001;time<profile.duration;time+=.001) {
      const normal=sampleCatResponse(time,false,profile),reduced=sampleCatResponse(time,true,profile);
      timingMismatch ||= reduced.done!==normal.done;
      for(const axis of axes){
        maxValue=Math.max(maxValue,Math.abs(normal[axis]));
        maxStep=Math.max(maxStep,Math.abs(normal[axis]-previous[axis]));
        maxReducedError=Math.max(maxReducedError,Math.abs(reduced[axis]-normal[axis]*CAT_REDUCED_WEIGHT));
      }
      previous=normal;
    }
    const epsilon=.0001;
    for(const axis of axes){
      expect(Math.abs(sampleCatResponse(epsilon,false,profile)[axis])/epsilon).toBeLessThan(.01);
      expect(Math.abs(sampleCatResponse(profile.duration-epsilon,false,profile)[axis])/epsilon).toBeLessThan(.01);
    }
    expect(sampleCatResponse(profile.duration,false,profile)).toEqual({...rest,done:true});
    expect(sampleCatResponse(profile.duration+10,true,profile)).toEqual({...rest,done:true});
    expect(sampleCatResponse(Number.NaN,false,profile)).toEqual({...rest,done:false});
  }
  expect(maxValue).toBeLessThanOrEqual(1);
  expect(maxStep).toBeLessThan(.010);
  expect(maxReducedError).toBeLessThan(1e-12);
  expect(timingMismatch).toBe(false);
});

async function loadRig() {
  const file=readFileSync(new URL('../src/assets/sleeping-tabby.glb',import.meta.url));
  const jsonLength=file.readUInt32LE(12),binaryOffset=20+jsonLength;
  const document=JSON.parse(file.subarray(20,binaryOffset).toString());
  for(const mesh of document.meshes)for(const primitive of mesh.primitives)delete primitive.material;
  delete document.materials;delete document.images;delete document.textures;delete document.samplers;
  const json=Buffer.from(JSON.stringify(document)),padding=(4-json.length%4)%4;
  const jsonChunk=Buffer.alloc(8+json.length+padding,0x20);
  jsonChunk.writeUInt32LE(json.length+padding,0);jsonChunk.write('JSON',4);json.copy(jsonChunk,8);
  const header=Buffer.from(file.subarray(0,12)),binary=file.subarray(binaryOffset);
  header.writeUInt32LE(12+jsonChunk.length+binary.length,8);
  const clean=Buffer.concat([header,jsonChunk,binary]);
  const gltf=await new GLTFLoader().parseAsync(clean.buffer.slice(clean.byteOffset,clean.byteOffset+clean.byteLength),'');
  let mesh!:THREE.SkinnedMesh;
  gltf.scene.traverse(object=>{if(object instanceof THREE.SkinnedMesh)mesh=object;});
  return {root:gltf.scene,mesh,rig:createCatRig(gltf.scene,gltf.animations)};
}

test('all six responses articulate the real skin without moving support or allocating geometry', async () => {
  const {root,mesh,rig}=await loadRig(),geometry=mesh.geometry,base=geometry.getAttribute('position');
  const attributes=Object.fromEntries(Object.entries(geometry.attributes).map(([key,attribute])=>[key,attribute.array]));
  const original=Float32Array.from(base.array),restBones=rig.bones.map(bone=>({p:bone.position.clone(),q:bone.quaternion.clone()}));
  const from=new THREE.Vector3(),to=new THREE.Vector3(),stats:unknown[]=[];
  try {
    // Cross from a native GLB clip to direct sampled bone motion, as a reused
    // rig may do, without retaining any animation-mixer influence.
    rig.seek(2.88,0,false);
    for(const originalProfile of CAT_REACTIONS) for(const direction of [-1,1]){
      const profile:CatReactionProfile={...originalProfile,variation:{amplitude:1,direction,tailPhase:direction*.10}};
      let head=0,tail=0,floor=0,hind=0,tailRoot=0,outsideBounds=0;
      const times=[.4,.8,1.4,2.0,2.6,3.3,3.8,...profile.cues.map(cue=>cue.peak??(cue.start+cue.end)/2)];
      for(const time of times){
        rig.setPose(sampleCatResponse(time,false,profile));root.updateMatrixWorld(true);mesh.skeleton.update();
        for(let i=0;i<base.count;i++){
          from.fromBufferAttribute(base,i);mesh.getVertexPosition(i,to);
          const delta=from.distanceTo(to);
          if(from.y<=.005)floor=Math.max(floor,delta);
          if(from.x<-.12&&from.y>.02)head=Math.max(head,delta);
          if(from.x>.10&&from.z<.07)hind=Math.max(hind,delta);
          if(from.z>.07)tail=Math.max(tail,delta);
          if(from.z>.07&&from.z<.09&&from.x>.175)tailRoot=Math.max(tailRoot,delta);
          if(!mesh.boundingBox!.containsPoint(to))outsideBounds++;
        }
      }
      expect(floor,profile.id).toBeLessThan(1e-7);expect(hind,profile.id).toBeLessThan(1e-7);
      expect(tailRoot,profile.id).toBeLessThan(.008);
      expect(head,profile.id).toBeGreaterThan(.02);expect(head,profile.id).toBeLessThan(.065);
      expect(tail,profile.id).toBeLessThan(.08);
      expect(outsideBounds,'Animated vertices remain pickable and inside the authored bounds').toBe(0);
      rig.setPose(sampleCatResponse(profile.duration,false,profile));
      rig.bones.forEach((bone,i)=>{
        expect(bone.position.toArray()).toEqual(restBones[i].p.toArray());
        expect(bone.quaternion.angleTo(restBones[i].q)).toBeLessThan(1e-7);
      });
      stats.push({id:profile.id,direction,headMm:head*1000,tailMm:tail*1000,floor});
    }
    for(const [key,attribute] of Object.entries(geometry.attributes))expect(attribute.array).toBe(attributes[key]);
    expect(Float32Array.from(base.array)).toEqual(original);
    console.log('Random response skin measurements:',JSON.stringify(stats));
  } finally {
    rig.dispose();mesh.skeleton.dispose();geometry.dispose();
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material])material.dispose();
  }
});
