import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createAntiqueBronze, createAgedTimber } from "./antique-materials";
import { createClassicalVessel } from "./classical-vessel";
import { consoleLayout, consolePoint } from "./interior-layout";

export function createClassicalCollection() {
  const group = new THREE.Group(); group.name = "classical-collector-corner";
  const vessel = createClassicalVessel();
  vessel.scale.setScalar(.78);
  vessel.position.copy(consolePoint(.23, 0));
  vessel.rotation.y = .92;
  group.add(vessel);
  return group;
}

/** An original mythological oil painting, framed as a small antique gallery piece. */
export function createClassicalPainting() {
  const frame = new THREE.Group();
  frame.name = "vintage-framed-seascape"; // Existing scene identifier retained for the gallery wall.
  frame.position.set(-2.294, 1.48, consoleLayout.z); frame.scale.setScalar(.9); frame.rotation.y = Math.PI / 2;
  const wood = createAgedTimber(), gilt = createAntiqueBronze();
  const dark = new THREE.MeshStandardMaterial({color:"#4a3c2c",roughness:.9});
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true;
    frame.add(mesh); return mesh;
  };
  function rectangle(w: number, h: number) {
    const shape = new THREE.Shape();
    shape.moveTo(-w/2,-h/2);shape.lineTo(w/2,-h/2);shape.lineTo(w/2,h/2);shape.lineTo(-w/2,h/2);shape.closePath();
    return shape;
  }
  function moulding(w: number, h: number, thickness: number, depth: number, bevel: number, material: THREE.Material, z: number) {
    const shape = rectangle(w,h); const inner = rectangle(w-thickness*2,h-thickness*2);
    shape.holes.push(new THREE.Path(inner.getPoints()));
    const geometry = new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3});
    const mesh = add(geometry,material); mesh.position.z=z;
  }
  moulding(.724,.874,.044,.023,.0035,wood,0);
  moulding(.706,.856,.014,.014,.003,gilt,.022);
  moulding(.646,.796,.009,.008,.002,gilt,.015);
  const backing=add(new THREE.BoxGeometry(.63,.78,.007),dark);backing.position.z=.004;
  const painting = new THREE.TextureLoader().load(`${import.meta.env.BASE_URL}art/classical-myth-oil.webp`);
  painting.colorSpace=THREE.SRGBColorSpace;painting.anisotropy=8;
  const image = add(new THREE.PlaneGeometry(.616,.770),new THREE.MeshStandardMaterial({map:painting,roughness:.94}));
  image.name="classical-myth-oil-painting";image.position.z=.016;
  const ornamentGeometries: THREE.BufferGeometry[]=[];
  const bead=new THREE.SphereGeometry(1,8,6);
  const stamp=new THREE.Object3D();
  function beadAt(x:number,y:number,vertical:boolean){
    stamp.position.set(x,y,.042);stamp.rotation.set(0,0,vertical?Math.PI/2:0);stamp.scale.set(.0028,.0041,.0027);stamp.updateMatrix();
    ornamentGeometries.push(bead.clone().applyMatrix4(stamp.matrix));
  }
  for(let x=-.325;x<=.325;x+=.014)for(const y of [-.405,.405])beadAt(x,y,false);
  for(let y=-.392;y<=.392;y+=.014)for(const x of [-.33,.33])beadAt(x,y,true);
  for(const sx of [-1,1])for(const sy of [-1,1]){
    const points:THREE.Vector3[]=[];
    for(let i=0;i<24;i++){
      const a=i*.17,r=.002+i*.00055;
      points.push(new THREE.Vector3(sx*(.339+Math.cos(a)*r),sy*(.413+Math.sin(a)*r),.04));
    }
    ornamentGeometries.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),28,.0015,6,false));
  }
  const ornament=mergeGeometries(ornamentGeometries);
  if(ornament)add(ornament,gilt).name="gilt-frame-beadwork";
  for(const geometry of ornamentGeometries)geometry.dispose();bead.dispose();
  return frame;
}
