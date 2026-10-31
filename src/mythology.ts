import * as THREE from 'three';
import { createSeascape } from './seascape';
import { createArtifacts } from './artifacts';
import { createClassicalCollection } from './classical-gallery';

export function createMythology(dynamicSea = false) {
  const group=new THREE.Group();group.name='aegean-mythology';
  const mesh=(g:THREE.BufferGeometry,m:THREE.Material,p:THREE.Object3D=group)=>{const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;p.add(o);return o;};
  group.add(createArtifacts());
  group.add(createClassicalCollection());
  const seascape = createSeascape(dynamicSea);
  group.add(seascape.group);
  const cliff=mesh(new THREE.SphereGeometry(1,30,18),new THREE.MeshStandardMaterial({color:'#867d6b',roughness:1}));cliff.name='cliff-foundation';cliff.position.set(0,-5.5,1);cliff.scale.set(4.3,5.3,5.1);
  return {group,seascape,update(t:number,reduced:boolean){seascape.update(t,reduced);}};
}
