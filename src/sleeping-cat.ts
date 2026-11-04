import * as THREE from "three";
import catModelUrl from "./assets/sleeping-tabby.glb?url";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createCatRig } from "./cat-rig";
import type { CatReactionPose } from "./cat-choreography";
import { createCatMotion } from "./cat-motion";

/** A cleaned, locally hosted tabby scan. Attribution: public/models/README.md. */
export function createSleepingCat() {
  const group=new THREE.Group();group.name="sleeping-tabby-cat";
  const breathing=new THREE.Group();breathing.name="tabby-breathing-flank";
  group.add(breathing);
  const controller=new AbortController();
  let disposed=false;
  let rig:ReturnType<typeof createCatRig>|undefined;
  const motion=createCatMotion();
  const axes=["head","yaw","roll","ears","earOuter","stretch","tail","tailCurl"] as const;
  const applied=new Float64Array(axes.length);
  function applyPose(pose:CatReactionPose) {
    if(!rig||!axes.some((axis,index)=>Math.abs(pose[axis]-applied[index])>1e-9))return false;
    const changed=rig.setPose(pose);
    axes.forEach((axis,index)=>{applied[index]=pose[axis];});
    return changed;
  }
  function release(root:THREE.Object3D) {
    const materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>(),skeletons=new Set<THREE.Skeleton>();
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh))return;
      object.geometry.dispose();
      if(object instanceof THREE.SkinnedMesh)skeletons.add(object.skeleton);
      for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);
    });
    for(const material of materials) {
      for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);
      material.dispose();
    }
    for(const texture of textures)texture.dispose();
    for(const skeleton of skeletons)skeleton.dispose();
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
      try {
        rig=createCatRig(model,gltf.animations);
        breathing.add(model);
      } catch(error) {
        release(model);
        throw error;
      }
    });
  return {
    group,ready,
    pet(time:number,reduced:boolean) {
      return !disposed&&!!rig&&motion.pet(time,reduced);
    },
    getReaction:motion.getReaction,
    setReactionClock:motion.setReactionClock,
    isPetting:motion.isPetting,
    cancelPet() {
      return applyPose(motion.cancel());
    },
    update(time:number,reduced:boolean) {
      if(disposed||!Number.isFinite(time))return false;
      // The model's support is Y=0. Breath has no translational lift and is
      // frozen together with the room while reading or in a background tab.
      breathing.scale.y=1+Math.sin(time*.95)*(reduced?.0012:.0045);
      return applyPose(motion.update(time,reduced));
    },
    dispose() {
      if(disposed)return;
      disposed=true;motion.cancel();controller.abort();rig?.dispose();rig=undefined;release(breathing);breathing.clear();
    },
  };
}
