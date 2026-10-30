/** Rebuild with the shared Node entry: project-node scripts/rig-sleeping-cat.mjs.
 * The original document and byte length are retained as small provenance
 * metadata so rebuilding is deterministic and never accumulates rig buffers.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import * as THREE from 'three';
import {CAT_JOINTS,catJointTransforms} from '../src/cat-articulation.ts';
import {CAT_REACTION_DURATION,sampleCatReaction} from '../src/cat-choreography.ts';

const input=path.resolve(process.argv[2]??'src/assets/sleeping-tabby.glb');
const output=path.resolve(process.argv[3]??input);
const file=await fs.readFile(input),jsonLength=file.readUInt32LE(12);
let document=JSON.parse(file.subarray(20,20+jsonLength).toString());
let binary=file.subarray(20+jsonLength+8);
const source=document.asset.extras?.localRigSource;
if(source){document=source.document;binary=binary.subarray(0,source.byteLength);}
else binary=binary.subarray(0,document.buffers[0].byteLength);
const original=structuredClone(document),sourceLength=binary.length;
const primitive=document.meshes[0].primitives[0];
function readAccessor(id){
  const accessor=document.accessors[id],view=document.bufferViews[accessor.bufferView];
  const width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[accessor.type];
  const offset=(view.byteOffset??0)+(accessor.byteOffset??0);
  const ArrayType={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array}[accessor.componentType];
  return new ArrayType(binary.buffer,binary.byteOffset+offset,accessor.count*width).slice();
}
const positions=readAccessor(primitive.attributes.POSITION),indices=readAccessor(primitive.indices),count=positions.length/3;
const smooth=(value,a,b)=>THREE.MathUtils.smoothstep(value,a,b);
const bell=(value,centre,width)=>Math.exp(-(((value-centre)/width)**2));
// Identify the reconstructed tail by connected topology, including UV seams.
const welded=new Int32Array(count),welds=new Map();
for(let i=0;i<count;i++){
  const key=Array.from(positions.subarray(i*3,i*3+3),n=>Math.round(n*1e6)).join(',');
  if(!welds.has(key))welds.set(key,welds.size);welded[i]=welds.get(key);
}
const parents=Int32Array.from({length:welds.size},(_,i)=>i);
function root(i){while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;}
for(let i=0;i<indices.length;i+=3){const a=root(welded[indices[i]]);for(let k=1;k<3;k++)parents[root(welded[indices[i+k]])]=a;}
const parts=new Map();
for(let i=0;i<count;i++){
  const id=root(welded[i]),part=parts.get(id)??{count:0,minX:Infinity,minZ:Infinity,maxZ:-Infinity};
  part.count++;part.minX=Math.min(part.minX,positions[i*3]);part.minZ=Math.min(part.minZ,positions[i*3+2]);part.maxZ=Math.max(part.maxZ,positions[i*3+2]);parts.set(id,part);
}
const tailParts=new Set([...parts].filter(([,p])=>p.count>100&&p.count<count/4&&p.minX>.09&&p.minZ>0&&p.maxZ>.14).map(([id])=>id));
if(tailParts.size!==1)throw new Error('Expected one isolated reconstructed tail');
const joints=new Uint8Array(count*4),weights=new Float32Array(count*4);
let pinned=0,tailVertices=0;
for(let i=0;i<count;i++){
  const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2];
  let influences=[[0,1]];
  if(y<=.005)pinned++;
  else if(tailParts.has(root(welded[i]))){
    tailVertices++;
    if(z>.070){
      const knots=[.070,.098,.126,.145],at=knots.findIndex(value=>z<value);
      const left=at<=0?(at<0?3:0):at-1,right=Math.min(3,left+1);
      if(left===right)influences=[[6+left,1]];
      else {const t=smooth(z,knots[left],knots[right]);influences=[[6+left,1-t],[6+right,t]];}
      const release=smooth(z,.070,.087);
      influences=influences.map(([joint,w])=>[joint,w*release]);influences.push([0,1-release]);
    }
  }else{
    const skull=smooth(-x,.060,.118)*smooth(z,-.105,-.035)*smooth(y,.006,.025);
    const neck=smooth(-x,.015,.085)*smooth(y,.012,.045)*(1-smooth(Math.abs(z+.03),.08,.15))*(1-skull)*.65;
    const shoulder=smooth(y,.015,.065)*smooth(x,-.16,-.070)*(1-smooth(x,.025,.10))*(1-smooth(Math.abs(z+.035),.085,.14))*(1-skull-neck)*.8;
    const inner=bell(x,-.114,.027)*bell(z,.018,.028)*smooth(y,.073,.104);
    const outer=smooth(-x,.176,.207)*bell(z,.007,.035)*smooth(y,.005,.026);
    const earInner=skull*inner,earOuter=(skull-earInner)*outer;
    influences=[[0,1-skull-neck-shoulder],[1,shoulder],[2,neck],[3,skull-earInner-earOuter],[4,earInner],[5,earOuter]];
  }
  const chosen=influences.filter(([,w])=>w>1e-8).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=chosen.reduce((s,[,w])=>s+w,0);
  chosen.forEach(([joint,weight],k)=>{joints[i*4+k]=joint;weights[i*4+k]=weight/sum;});
}
const chunks=[binary];let length=binary.length;
function append(array,type,componentType,target){
  const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad;}
  const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),view=document.bufferViews.length;
  document.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length,...(target?{target}:{})});chunks.push(data);length+=data.length;
  const width={SCALAR:1,VEC4:4,MAT4:16}[type],accessor={bufferView:view,componentType,count:array.length/width,type};
  if(type==='SCALAR'){accessor.min=[array[0]];accessor.max=[array[array.length-1]];}
  return document.accessors.push(accessor)-1;
}
primitive.attributes.JOINTS_0=append(joints,'VEC4',5121,34962);
primitive.attributes.WEIGHTS_0=append(weights,'VEC4',5126,34962);
const inverse=new Float32Array(CAT_JOINTS.length*16);
CAT_JOINTS.forEach((joint,i)=>new THREE.Matrix4().makeTranslation(...joint.position).invert().toArray(inverse,i*16));
const inverseAccessor=append(inverse,'MAT4',5126);
CAT_JOINTS.forEach((joint,i)=>{
  const parent=joint.parent<0?[0,0,0]:CAT_JOINTS[joint.parent].position;
  document.nodes.push({name:joint.name,translation:joint.position.map((value,k)=>value-parent[k]),children:[]});
  if(joint.parent>=0)document.nodes[joint.parent+1].children.push(i+1);
});
document.nodes[0].name='Sleeping tabby — articulated Alben Tan scan (CC BY 4.0)';
document.nodes[0].children=[1];document.nodes[0].skin=0;
document.skins=[{name:'Grounded curled-cat rig',inverseBindMatrices:inverseAccessor,skeleton:1,joints:CAT_JOINTS.map((_,i)=>i+1)}];
const frames=Math.round(CAT_REACTION_DURATION*60)+1,times=Float32Array.from({length:frames},(_,i)=>i/60),timeAccessor=append(times,'SCALAR',5126);
document.animations=[];
for(let variant=0;variant<3;variant++){
  const animation={name:['pet-nuzzle','pet-stretch','pet-tail'][variant],samplers:[],channels:[]};
  for(let bone=1;bone<CAT_JOINTS.length;bone++){
    const rotations=new Float32Array(frames*4),quaternion=new THREE.Quaternion();
    for(let frame=0;frame<frames;frame++){
      const transform=catJointTransforms(sampleCatReaction(times[frame],false,variant))[bone];
      quaternion.setFromEuler(new THREE.Euler(...transform.rotation)).toArray(rotations,frame*4);
    }
    const sampler=animation.samplers.push({input:timeAccessor,output:append(rotations,'VEC4',5126),interpolation:'LINEAR'})-1;
    animation.channels.push({sampler,target:{node:bone+1,path:'rotation'}});
  }
  const positionData=new Float32Array(frames*3),joint=CAT_JOINTS[1],parent=CAT_JOINTS[joint.parent];
  for(let frame=0;frame<frames;frame++){
    const offset=catJointTransforms(sampleCatReaction(times[frame],false,variant))[1].offset;
    joint.position.forEach((value,k)=>{positionData[frame*3+k]=value-parent.position[k]+offset[k];});
  }
  // Position accessors have three components; no geometry data is touched.
  const padding=(4-length%4)%4;if(padding){chunks.push(Buffer.alloc(padding));length+=padding;}
  const view=document.bufferViews.push({buffer:0,byteOffset:length,byteLength:positionData.byteLength})-1;
  chunks.push(Buffer.from(positionData.buffer));length+=positionData.byteLength;
  const outputAccessor=document.accessors.push({bufferView:view,componentType:5126,count:frames,type:'VEC3'})-1;
  const sampler=animation.samplers.push({input:timeAccessor,output:outputAccessor,interpolation:'LINEAR'})-1;
  animation.channels.push({sampler,target:{node:2,path:'translation'}});document.animations.push(animation);
}
document.asset.extras.localRigSource={document:original,byteLength:sourceLength};
document.asset.extras.rigging={author:'Between the Tides project',license:'CC-BY-4.0',version:1,joints:CAT_JOINTS.length,clips:document.animations.map(a=>a.name),changes:'Native four-weight skinning; fixed paws, folded hind legs and tail root; articulated shoulder, neck, head, ears and distal tail. Three locally authored 4.4-second reaction clips with independent axes and delayed follow-through.'};
document.buffers[0].byteLength=length;
const json=Buffer.from(JSON.stringify(document)),jsonPad=(4-json.length%4)%4,binPad=(4-length%4)%4;
const total=12+8+json.length+jsonPad+8+length+binPad,result=Buffer.alloc(total);
result.writeUInt32LE(0x46546c67,0);result.writeUInt32LE(2,4);result.writeUInt32LE(total,8);
result.writeUInt32LE(json.length+jsonPad,12);result.writeUInt32LE(0x4e4f534a,16);json.copy(result,20);result.fill(32,20+json.length,20+json.length+jsonPad);
const binOffset=20+json.length+jsonPad;result.writeUInt32LE(length+binPad,binOffset);result.writeUInt32LE(0x004e4942,binOffset+4);Buffer.concat(chunks).copy(result,binOffset+8);
await fs.writeFile(output,result);
console.log(JSON.stringify({output,bytes:result.length,vertices:count,joints:CAT_JOINTS.length,pinned,tailVertices,animations:document.animations.map(a=>a.name)},null,2));
