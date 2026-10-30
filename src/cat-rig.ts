import * as THREE from "three";
import { CAT_JOINTS,catJointTransforms } from "./cat-articulation";
import { CAT_REDUCED_WEIGHT,type CatReactionPose } from "./cat-choreography";

/** Native skinning and AnimationMixer playback for the locally authored GLB. */
export function createCatRig(root:THREE.Object3D,clips:THREE.AnimationClip[]=[]) {
  const bones=CAT_JOINTS.map(joint=>{
    const bone=root.getObjectByName(joint.name);
    if(!(bone instanceof THREE.Bone))throw new Error(`Cat rig missing ${joint.name}`);
    return bone;
  });
  const rest=bones.map(bone=>({position:bone.position.clone(),quaternion:bone.quaternion.clone()}));
  const mixer=new THREE.AnimationMixer(root);
  const actions=["pet-nuzzle","pet-stretch","pet-tail"].map(name=>{
    const clip=THREE.AnimationClip.findByName(clips,name);
    return clip?mixer.clipAction(clip):undefined;
  });
  const previous=new Float64Array(bones.length*7);
  let playbackKey="";
  function changed() {
    let result=false;
    bones.forEach((bone,i)=>{
      const values=[bone.position.x,bone.position.y,bone.position.z,bone.quaternion.x,bone.quaternion.y,bone.quaternion.z,bone.quaternion.w];
      values.forEach((value,k)=>{if(Math.abs(previous[i*7+k]-value)>1e-9)result=true;previous[i*7+k]=value;});
    });
    return result;
  }
  function restore() {bones.forEach((bone,i)=>{bone.position.copy(rest[i].position);bone.quaternion.copy(rest[i].quaternion);});}
  // SkinnedMesh bounds must cover the animated head and tail, including picking.
  root.traverse(object=>{
    if(!(object instanceof THREE.SkinnedMesh))return;
    object.geometry.computeBoundingBox();
    object.boundingBox=object.geometry.boundingBox!.clone().expandByScalar(.065);
    object.boundingSphere=object.boundingBox.getBoundingSphere(new THREE.Sphere());
  });
  changed();
  return {
    bones,
    setPose(pose:CatReactionPose) {
      mixer.stopAllAction();playbackKey="";
      const transforms=catJointTransforms(pose);
      bones.forEach((bone,i)=>{
        bone.position.copy(rest[i].position).add(new THREE.Vector3(...transforms[i].offset));
        bone.quaternion.setFromEuler(new THREE.Euler(...transforms[i].rotation));
      });
      root.updateMatrixWorld(true);
      return changed();
    },
    seek(elapsed:number,variant:number,reduced:boolean) {
      const index=((variant%3)+3)%3,key=`${index}:${reduced}`;
      const action=actions[index];
      if(!action)throw new Error("Cat animation clips unavailable");
      if(playbackKey!==key){
        mixer.stopAllAction();restore();playbackKey=key;
        action.reset().setLoop(THREE.LoopOnce,1).setEffectiveWeight(reduced?CAT_REDUCED_WEIGHT:1).play();
        action.clampWhenFinished=true;
      }
      action.paused=false;
      mixer.setTime(Math.max(0,elapsed));
      root.updateMatrixWorld(true);
      return changed();
    },
    reset() {
      mixer.stopAllAction();playbackKey="";restore();root.updateMatrixWorld(true);
      return changed();
    },
    dispose() {mixer.stopAllAction();mixer.uncacheRoot(root);},
  };
}
