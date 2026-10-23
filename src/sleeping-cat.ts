import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** A life-size curled mackerel tabby. Local Y=0 is the cushion's support plane. */
export function createSleepingCat() {
  const group = new THREE.Group();
  group.name = "sleeping-tabby-cat";
  const furMap = tabbyTexture(false);
  const flankMap = tabbyTexture(false, true);
  const faceMap = tabbyTexture(true);
  const fur = new THREE.MeshStandardMaterial({ map: furMap, roughness: .98, color: "#e0dacf" });
  const flankFur = fur.clone(); flankFur.map = flankMap;
  const faceFur = new THREE.MeshStandardMaterial({ map: faceMap, roughness: .98, color: "#e0dacf" });
  const cream = new THREE.MeshStandardMaterial({ color: "#cbbda4", roughness: 1 });
  const ink = new THREE.MeshStandardMaterial({ color: "#392f29", roughness: 1 });
  const skin = new THREE.MeshStandardMaterial({ color: "#95786d", roughness: .96 });
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const stamp = new THREE.Object3D();
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  function addPart(geometry: THREE.BufferGeometry, material: THREE.Material, parent = group) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function fixed(geometry: THREE.BufferGeometry, material: THREE.Material, position = v(0, 0, 0), scale = v(1, 1, 1), rotation = new THREE.Euler()) {
    stamp.position.copy(position); stamp.scale.copy(scale); stamp.rotation.copy(rotation); stamp.updateMatrix();
    geometry.applyMatrix4(stamp.matrix);
    const geometries = batches.get(material) ?? [];
    geometries.push(geometry); batches.set(material, geometries);
  }
  function oval(position: THREE.Vector3, scale: THREE.Vector3, material: THREE.Material, rotation = new THREE.Euler(), segments = 20) {
    fixed(new THREE.SphereGeometry(1, segments, 12), material, position, scale, rotation);
  }
  function line(points: THREE.Vector3[], radius: number, material: THREE.Material, parentMatrix?: THREE.Matrix4) {
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 12, radius, 4, false);
    if (parentMatrix) geometry.applyMatrix4(parentMatrix);
    fixed(geometry, material);
  }

  // A single smoothly deformed flank, rather than separate ball-shaped haunches.
  const flankGeometry = new THREE.SphereGeometry(1, 40, 24);
  const flankPosition = flankGeometry.getAttribute("position"), flankUV = flankGeometry.getAttribute("uv");
  for (let i = 0; i < flankPosition.count; i++) {
    const nx = flankPosition.getX(i), ny = flankPosition.getY(i), nz = flankPosition.getZ(i);
    const shoulder = 1 - .17 * Math.max(0, -nx);
    const x = .025 + nx * .177 + .013 * nz * (1 - nx * nx);
    const y = Math.max(.006, .092 + ny * .091 * shoulder + .007 * nx);
    const z = -.019 + nz * .119 * shoulder - .012 * (1 - nx * nx);
    flankPosition.setXYZ(i, x, y - .006, z);
    // Stripes follow the flank length and wrap across its back, not the UV pole.
    flankUV.setXY(i, (nx + 1) * .5, (Math.atan2(nz, ny) / (Math.PI * 2) + 1) % 1);
  }
  flankGeometry.computeVertexNormals();
  const breathing = new THREE.Group();
  breathing.name = "tabby-breathing-flank"; breathing.position.y = .006; group.add(breathing);
  const flank = addPart(flankGeometry, flankFur, breathing);
  flank.name = "tabby-curled-body";

  // The tail lies against the seat and tapers around the outer curve of the cat.
  const tailCurve = new THREE.CatmullRomCurve3([
    v(.168,.084,-.055),v(.204,.060,.008),v(.180,.034,.091),
    v(.087,.023,.143),v(-.035,.019,.151),v(-.132,.019,.145),v(-.182,.024,.117),
  ]);
  const tailSegments = 56, ringSegments = 10;
  const frames = tailCurve.computeFrenetFrames(tailSegments, false);
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  for (let row = 0; row <= tailSegments; row++) {
    const t = row / tailSegments, centre = tailCurve.getPointAt(t);
    const radius = .027 * Math.pow(1 - t, .38) + .003;
    for (let col = 0; col <= ringSegments; col++) {
      const angle = col / ringSegments * Math.PI * 2;
      const point = centre.clone().addScaledVector(frames.normals[row], Math.cos(angle) * radius)
        .addScaledVector(frames.binormals[row], Math.sin(angle) * radius);
      point.y = Math.max(.001, point.y);
      positions.push(point.x, point.y, point.z); uv.push(t, col / ringSegments);
      if (row < tailSegments && col < ringSegments) {
        const a = row * (ringSegments + 1) + col, b = a + ringSegments + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  }
  const tail = new THREE.BufferGeometry();
  tail.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  tail.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2)); tail.setIndex(indices); tail.computeVertexNormals();
  fixed(tail, fur);
  oval(v(-.182,.024,.117), v(.005,.005,.005), fur, new THREE.Euler(), 12);

  // Folded forelegs disappear naturally under the cheek, with small pale toes.
  oval(v(-.102,.025,.096), v(.047,.022,.052), fur, new THREE.Euler(0,-.22,-.05));
  oval(v(-.078,.017,.124), v(.040,.016,.045), cream, new THREE.Euler(0,-.28,0));
  oval(v(-.143,.020,.119), v(.032,.019,.041), cream, new THREE.Euler(0,.21,.06));
  for (const x of [-.151,-.141,-.089,-.079])
    line([v(x,.019,.148),v(x+.001,.022,.155),v(x+.002,.019,.160)], .00065, ink);

  const headPose = new THREE.Object3D();
  headPose.position.set(-.118,.078,.073); headPose.rotation.set(-.24,-.12,-.20); headPose.updateMatrix();
  const headGeometry = new THREE.SphereGeometry(1, 28, 20);
  const headPositions = headGeometry.getAttribute("position");
  for (let i = 0; i < headPositions.count; i++) {
    const x = headPositions.getX(i), y = headPositions.getY(i), z = headPositions.getZ(i);
    headPositions.setXYZ(i, x * .059 * (1 - .07 * Math.max(0,-y)), y * .050, z * .057 - .004 * y);
  }
  headGeometry.computeVertexNormals(); headGeometry.applyMatrix4(headPose.matrix);
  fixed(headGeometry, faceFur);

  // Soft triangular ears have a curved rim and an inset inner surface.
  function ear(side: number, inset: boolean) {
    const geometry = new THREE.SphereGeometry(1, 16, 10);
    const attribute = geometry.getAttribute("position");
    for (let i = 0; i < attribute.count; i++) {
      const x = attribute.getX(i), y = attribute.getY(i), z = attribute.getZ(i);
      const up = (y + 1) * .5, taper = 1 - .80 * up;
      const spread = inset ? .014 : .022, height = inset ? .032 : .046;
      attribute.setXYZ(i, side * (.039 + up * .011) + x * spread * taper,
        .028 + up * height, -.009 + z * (inset ? .005 : .014) + (inset ? .013 : 0) - up * .009);
    }
    geometry.computeVertexNormals(); geometry.applyMatrix4(headPose.matrix);
    fixed(geometry, inset ? skin : fur);
  }
  for (const side of [-1,1]) { ear(side,false); ear(side,true); }
  function headOval(position: THREE.Vector3, scale: THREE.Vector3, material: THREE.Material) {
    const geometry = new THREE.SphereGeometry(1, 20, 12);
    geometry.scale(scale.x, scale.y, scale.z); geometry.translate(position.x,position.y,position.z);
    geometry.applyMatrix4(headPose.matrix); fixed(geometry,material);
  }
  headOval(v(-.013,-.020,.047),v(.022,.015,.020),cream);
  headOval(v(.013,-.020,.047),v(.022,.015,.020),cream);
  headOval(v(0,-.033,.043),v(.021,.009,.016),cream);

  const noseShape = new THREE.Shape();
  noseShape.moveTo(-.006,0); noseShape.quadraticCurveTo(0,-.007,.006,0);
  noseShape.quadraticCurveTo(0,.004,-.006,0);
  const nose = new THREE.ExtrudeGeometry(noseShape,{depth:.002,bevelEnabled:true,bevelSize:.001,bevelThickness:.001,bevelSegments:2,curveSegments:5});
  nose.translate(0,-.017,.067); nose.applyMatrix4(headPose.matrix); fixed(nose,skin);
  // Eyelids are relaxed arcs; no eyeballs or oversized cartoon features.
  for (const side of [-1,1]) {
    line([v(side*.011,.004,.055),v(side*.026,-.001,.052),v(side*.042,.005,.041)],.0010,ink,headPose.matrix);
    line([v(0,-.020,.068),v(0,-.025,.068),v(side*.008,-.029,.065)],.00065,ink,headPose.matrix);
  }

  // A few fine whiskers share a single line draw call.
  const whiskerPositions: number[] = [];
  for (const side of [-1,1]) for (let index=0;index<3;index++) {
    const start=v(side*.020,-.020-index*.002,.064).applyMatrix4(headPose.matrix);
    const end=v(side*(.060+index*.004),-.019-index*.007,.057-index*.001).applyMatrix4(headPose.matrix);
    whiskerPositions.push(start.x,start.y,start.z,end.x,end.y,end.z);
  }
  const whiskers = new THREE.BufferGeometry();
  whiskers.setAttribute("position",new THREE.Float32BufferAttribute(whiskerPositions,3));
  const whiskerLines = new THREE.LineSegments(whiskers,new THREE.LineBasicMaterial({color:"#d8cbb2",transparent:true,opacity:.52}));
  whiskerLines.name="tabby-fine-whiskers"; group.add(whiskerLines);

  for (const [material, geometries] of batches) {
    const indexed = geometries.map(geometry => {
      if (!geometry.index) geometry.setIndex(Array.from({length:geometry.getAttribute("position").count},(_,index)=>index));
      return geometry;
    });
    const combined = mergeGeometries(indexed)!;
    const mesh = addPart(combined, material);
    mesh.name = material === faceFur ? "tabby-sleeping-face" : material === fur ? "tabby-tail-and-folded-paws" : "tabby-resting-details";
    for (const geometry of geometries) geometry.dispose();
  }
  return {
    group,
    update(time: number, reduced: boolean) {
      // The pivot lies at the underside, so the sleeping cat never floats.
      breathing.scale.y = 1 + Math.sin(time * .95) * (reduced ? .0012 : .0045);
    },
  };
}

/** Mackerel stripes with small irregular edges and fine short-coat grain. */
function tabbyTexture(face: boolean, flank = false) {
  const canvas=document.createElement("canvas");
  canvas.width=face?512:768; canvas.height=face?256:384;
  const c=canvas.getContext("2d")!,w=canvas.width,h=canvas.height;
  let seed=face?193:781;
  const random=()=>{seed=seed*16807%2147483647;return seed/2147483647;};
  const base=c.createLinearGradient(0,0,0,h);
  base.addColorStop(0,"#8b877e");base.addColorStop(.25,"#aaa394");
  base.addColorStop(.50,"#c7beac");base.addColorStop(.76,"#a29c8f");base.addColorStop(1,"#8b877e");
  c.fillStyle=base;c.fillRect(0,0,w,h);
  c.lineCap="round";c.lineJoin="round";
  if (flank) {
    // Broken, tapering side markings meet a soft dorsal stripe. Each side has
    // its own lengths and bends, so the coat never becomes a stack of rings.
    c.shadowColor="rgba(56,50,43,.35)";c.shadowBlur=3;
    for (const side of [-1,1]) for(let stripe=0;stripe<10;stripe++) {
      const centre=(stripe+.4+random()*.25)/10;
      const start=.014+random()*.035, end=.25+random()*.11;
      const width=.007+random()*.008, phase=random()*Math.PI*2;
      const edges: [number,number][][]=[[],[]];
      for(let step=0;step<=32;step++) {
        const t=step/32,v=start+(end-start)*t;
        const x=centre+.018*Math.sin(v*15+phase)+.007*Math.sin(v*29+stripe);
        const half=width*Math.sin(Math.PI*t)**.45;
        for(let edge=0;edge<2;edge++) edges[edge].push([(x+(edge?half:-half))*w,(side>0?v:1-v)*h]);
      }
      c.beginPath();
      for(const [index,point] of [...edges[0],...edges[1].reverse()].entries())
        index?c.lineTo(point[0],point[1]):c.moveTo(point[0],point[1]);
      c.closePath();c.fillStyle=`rgba(66,59,50,${.40+random()*.13})`;c.fill();
    }
    c.shadowBlur=0;
    for(const edge of [0,h]) {
      const fade=c.createLinearGradient(0,edge===0?0:h,0,edge===0?h*.07:h*.93);
      fade.addColorStop(0,"rgba(63,57,48,.28)");fade.addColorStop(1,"rgba(63,57,48,0)");
      c.fillStyle=fade;c.fillRect(0,edge===0?0:h*.93,w,h*.07);
    }
  } else if (!face) {
    for(let stripe=0;stripe<11;stripe++) for(const [start,end] of [[0,.43],[.58,1]]) {
      const centre=(stripe+.42)/11*w;
      c.beginPath();
      for(let step=0;step<=30;step++) {
        const v=start+(end-start)*step/30;
        const x=centre+Math.sin(v*15+stripe*1.73)*w*.010+Math.sin(v*33+stripe)*w*.003;
        if(step)c.lineTo(x,v*h);else c.moveTo(x,v*h);
      }
      c.strokeStyle="rgba(58,49,41,.72)";c.lineWidth=w*(.012+random()*.008);c.stroke();
    }
    c.strokeStyle="rgba(47,42,36,.43)";c.lineWidth=h*.043;
    for(const y of [0,h]){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
  } else {
    // Sphere front is U=.25. The tabby's forehead M continues into cheek bars.
    const centre=w*.25;
    c.strokeStyle="rgba(57,47,39,.80)";c.lineWidth=7;
    c.beginPath();c.moveTo(centre-31,h*.33);c.lineTo(centre-19,h*.14);c.lineTo(centre,h*.25);
    c.lineTo(centre+18,h*.14);c.lineTo(centre+31,h*.33);c.stroke();
    c.lineWidth=4;
    for(const side of [-1,1])for(let stripe=0;stripe<3;stripe++){
      c.beginPath();c.moveTo(centre+side*(38+stripe*7),h*(.30+stripe*.13));
      c.quadraticCurveTo(centre+side*(52+stripe*6),h*(.36+stripe*.13),centre+side*(69+stripe*3),h*(.29+stripe*.13));c.stroke();
    }
    c.strokeStyle="rgba(59,50,41,.58)";c.lineWidth=9;
    for(let stripe=0;stripe<5;stripe++) {
      const x=w*.55+stripe*w*.08;
      c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x-12,h*.3,x+18,h*.65,x+4,h);c.stroke();
    }
  }
  for(let index=0;index<5200;index++) {
    const x=random()*w,y=random()*h;
    c.strokeStyle=random()>.5?"rgba(225,212,185,.15)":"rgba(45,39,32,.11)";
    c.lineWidth=.45;c.beginPath();c.moveTo(x,y);c.lineTo(x+(random()-.5)*1.8,y+1.5+random()*2.5);c.stroke();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}
