import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {consolePoint} from './interior-layout';
import type {RoomLightSettings} from './room-light';

/** A 31 cm linen-shade lamp. Mesh resources belong to the scene's shared disposal set. */
export function createCozyLamp(fabric: THREE.Texture) {
  const group = new THREE.Group();
  group.name = 'cream-linen-table-lamp';
  group.position.copy(consolePoint(-.26, 0));
  const brass = new THREE.MeshStandardMaterial({color:'#ab8853', metalness:.56, roughness:.48});
  const ceramic = new THREE.MeshStandardMaterial({color:'#e6d7bd', roughness:.73});
  const shade = new THREE.MeshStandardMaterial({
    color:'#f2e7d2', map:fabric, bumpMap:fabric, bumpScale:.00032, roughness:1,
    emissive:'#ffd6a3', emissiveIntensity:0, side:THREE.DoubleSide,
  });
  const metalParts: THREE.BufferGeometry[] = [];
  const cylinder = (top:number,bottom:number,height:number,y:number) => {
    const geometry = new THREE.CylinderGeometry(top,bottom,height,40);
    geometry.translate(0,y,0); metalParts.push(geometry);
  };
  cylinder(.057,.058,.008,.004);
  cylinder(.006,.009,.156,.102);
  cylinder(.014,.016,.009,.183);
  const finial = new THREE.SphereGeometry(.005,12,8);finial.translate(0,.308,0);metalParts.push(finial);
  const metal = new THREE.Mesh(mergeGeometries(metalParts)!,brass);
  for(const geometry of metalParts)geometry.dispose();
  metal.name='table-lamp-brass-stem';metal.castShadow=metal.receiveShadow=true;group.add(metal);
  const base = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0,.008),new THREE.Vector2(.054,.008),new THREE.Vector2(.054,.014),
    new THREE.Vector2(.046,.023),new THREE.Vector2(.013,.029),new THREE.Vector2(0,.029),
  ],40),ceramic);
  base.name='table-lamp-ceramic-foot';base.castShadow=base.receiveShadow=true;group.add(base);
  // An open, thin shade with an inner wall and rolled rims; no luminous solid cone.
  const cover = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(.069,.170),new THREE.Vector2(.070,.173),new THREE.Vector2(.047,.298),
    new THREE.Vector2(.045,.300),new THREE.Vector2(.0435,.298),new THREE.Vector2(.0665,.173),
    new THREE.Vector2(.069,.170),
  ],64),shade);
  cover.name='table-lamp-woven-shade';cover.castShadow=cover.receiveShadow=true;group.add(cover);
  const light = new THREE.PointLight('#ffd6a3',0,1.8,2);
  light.name='table-lamp-local-light';light.position.copy(group.position).add(new THREE.Vector3(.022,.187,.018));light.castShadow=false;
  // Add to the scene root separately: hiding the fixture before entry must not
  // change the prewarmed point-light count for every material in the room.
  let disposed=false;
  return {
    group,light,shade,
    setLighting(settings:RoomLightSettings,active:boolean,low:boolean) {
      if(disposed)return;
      const level=active&&settings.enabled?settings.brightness/100:0;
      light.color.set(settings.color);light.intensity=level*(low?1.1:1.4);
      shade.emissive.copy(light.color);shade.emissiveIntensity=level*1.2;
    },
    dispose() {
      if(disposed)return;
      disposed=true;light.intensity=0;shade.emissiveIntensity=0;light.removeFromParent();light.dispose();
    },
  };
}
