import * as THREE from "three";
import catModelUrl from "./assets/sleeping-tabby.glb?url";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { prepareCatPetting } from "./cat-petting";

/** A cleaned, locally hosted tabby scan. Attribution: public/models/README.md. */
export function createSleepingCat() {
  const group=new THREE.Group();group.name="sleeping-tabby-cat";
  const breathing=new THREE.Group();breathing.name="tabby-breathing-flank";
  group.add(breathing);
  const controller=new AbortController();
  let disposed=false;
  const petMeshes:THREE.Mesh[]=[];
  let reaction:{elapsed:number;lastFrameTime:number|null;duration:number;gentle:boolean}|null=null;
  let cooldownUntil=-Infinity,lastTime=0;
  function pose(head:number,ears:number) {
    let changed=false;
    for(const mesh of petMeshes) {
      const weights=mesh.morphTargetInfluences!;
      if(Math.abs(weights[0]-head)>1e-6||Math.abs(weights[1]-ears)>1e-6)changed=true;
      weights[0]=head;weights[1]=ears;
    }
    return changed;
  }
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
        prepareCatPetting(object);petMeshes.push(object);
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
    pet(time:number,reduced:boolean) {
      if(disposed||!petMeshes.length||reaction||!Number.isFinite(time)||time<cooldownUntil)return false;
      reaction={elapsed:0,lastFrameTime:null,duration:reduced?.65:2.15,gentle:reduced};
      return true;
    },
    isPetting(){return reaction!==null;},
    cancelPet() {
      reaction=null;cooldownUntil=lastTime+.12;
      return pose(0,0);
    },
    update(time:number,reduced:boolean) {
      if(disposed)return false;
      lastTime=time;
      // The model's support is Y=0. Breath has no translational lift and is
      // frozen together with the room while reading or in a background tab.
      breathing.scale.y=1+Math.sin(time*.95)*(reduced?.0012:.0045);
      if(!reaction)return false;
      // Start on a drawn frame and retain intermediate poses after a slow draw,
      // rather than skipping a short response during a main-thread stall.
      const delta=reaction.lastFrameTime===null?0:THREE.MathUtils.clamp(time-reaction.lastFrameTime,0,.1);
      reaction.lastFrameTime=time;
      reaction.elapsed=Math.min(reaction.duration,reaction.elapsed+delta);
      const phase=reaction.elapsed/reaction.duration;
      if(phase===1) {
        reaction=null;cooldownUntil=time+.20;
        return pose(0,0);
      }
      const smooth=THREE.MathUtils.smoothstep;
      const lift=smooth(phase,0,.25)*(1-smooth(phase,.56,1));
      const pulse=(start:number,end:number)=>phase<=start||phase>=end?0:Math.sin((phase-start)/(end-start)*Math.PI)**2;
      const ears=pulse(.20,.38)*.85+pulse(.45,.59)*.38;
      return pose(lift*(reaction.gentle?.16:1),ears*(reaction.gentle?.22:1));
    },
    dispose() {
      if(disposed)return;
      disposed=true;reaction=null;controller.abort();release(breathing);breathing.clear();petMeshes.length=0;
    },
  };
}
