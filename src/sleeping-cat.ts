import * as THREE from "three";
import catModelUrl from "./assets/sleeping-tabby.glb?url";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createCatRig } from "./cat-rig";
import { sampleCatReaction } from "./cat-choreography";

/** A cleaned, locally hosted tabby scan. Attribution: public/models/README.md. */
export function createSleepingCat() {
  const group=new THREE.Group();group.name="sleeping-tabby-cat";
  const breathing=new THREE.Group();breathing.name="tabby-breathing-flank";
  group.add(breathing);
  const controller=new AbortController();
  let disposed=false;
  let rig:ReturnType<typeof createCatRig>|undefined;
  let reaction:{elapsed:number;startedAt:number|null;clock?:()=>number;gentle:boolean;variant:number}|null=null;
  let cooldownUntil=-Infinity,lastTime=0,nextVariant=0;
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
      if(disposed||!rig||reaction||!Number.isFinite(time)||time<cooldownUntil)return false;
      reaction={elapsed:0,startedAt:null,gentle:reduced,variant:nextVariant};
      nextVariant=(nextVariant+1)%3;
      return true;
    },
    setReactionClock(clock: (()=>number)|undefined) { if(reaction)reaction.clock=clock; },
    isPetting(){return reaction!==null;},
    cancelPet() {
      reaction=null;cooldownUntil=lastTime+.12;
      return rig?.reset()??false;
    },
    update(time:number,reduced:boolean) {
      if(disposed)return false;
      lastTime=time;
      // The model's support is Y=0. Breath has no translational lift and is
      // frozen together with the room while reading or in a background tab.
      breathing.scale.y=1+Math.sin(time*.95)*(reduced?.0012:.0045);
      if(!reaction)return false;
      // Sounding gestures sample their own audio clock. Muted gestures use
      // scene time from the first draw; neither clock stretches on slow frames.
      if(reaction.startedAt===null)reaction.startedAt=time;
      reaction.elapsed=Math.max(reaction.elapsed,reaction.clock?.()??time-reaction.startedAt);
      const frame=sampleCatReaction(reaction.elapsed,reaction.gentle,reaction.variant);
      if(frame.done) {
        reaction=null;cooldownUntil=time+.20;
        return rig!.reset();
      }
      return rig!.seek(reaction.elapsed,reaction.variant,reaction.gentle);
    },
    dispose() {
      if(disposed)return;
      disposed=true;reaction=null;controller.abort();rig?.dispose();rig=undefined;release(breathing);breathing.clear();
    },
  };
}
