import * as THREE from "three";
import catModelUrl from "./assets/sleeping-tabby.glb?url";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** A cleaned, locally hosted tabby scan. Attribution: public/models/README.md. */
export function createSleepingCat() {
  const group=new THREE.Group();group.name="sleeping-tabby-cat";
  const breathing=new THREE.Group();breathing.name="tabby-breathing-flank";
  group.add(breathing);
  const controller=new AbortController();
  let disposed=false;
  function release(root:THREE.Object3D) {
    const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      object.geometry.dispose();
      for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
    });
    for(const material of materials) {
      for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
      material.dispose();
    }
    for(const texture of textures)texture.dispose();
  }
  // Vite versions the local GLB by content, so a new pose never reuses a
  // cached older model. The relative build URL also works on /memory/.
  const ready=fetch(catModelUrl,{signal:controller.signal})
    .then(response=>{
      if(!response.ok)throw new Error(`Cat model: HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then(data=>{
      if(disposed)throw new DOMException("Scene disposed","AbortError");
      return new GLTFLoader().parseAsync(data,"");
    })
    .then(gltf=>{
      if(disposed) {release(gltf.scene);return;}
      const model=gltf.scene;model.name="tabby-textured-scan";
      model.traverse(object=>{
        if(!(object instanceof THREE.Mesh))return;
        object.castShadow=object.receiveShadow=true;
        for(const material of Array.isArray(object.material)?object.material:[object.material]) {
          if(!(material instanceof THREE.MeshStandardMaterial))continue;
          material.roughness=1;material.metalness=0;
          if(material.map) {material.map.colorSpace=THREE.SRGBColorSpace;material.map.anisotropy=4;}
        }
      });
      breathing.add(model);
    });
  return {
    group,ready,
    update(time:number,reduced:boolean) {
      // The model's support is Y=0. Breath has no translational lift and is
      // frozen together with the room while reading or in a background tab.
      breathing.scale.y=1+Math.sin(time*.95)*(reduced?.0012:.0045);
    },
    dispose() {
      if(disposed)return;
      disposed=true;controller.abort();release(breathing);breathing.clear();
    },
  };
}
