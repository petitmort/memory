import * as THREE from "three";
import { createAntiqueBronze, createAgedTimber } from "./antique-materials";

/** Collector's objects are authored in metres and seated on their actual support. */
export function createArtifacts() {
  const group = new THREE.Group();
  group.name = "antique-mythic-artifacts";
  const bronze = createAntiqueBronze();
  const wood = createAgedTimber();
  const iron = new THREE.MeshStandardMaterial({ color: "#5c6260", roughness: .75, metalness: .55 });
  const leather = new THREE.MeshStandardMaterial({ color: "#68503b", roughness: .94 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const tube = (points: number[][], radius: number, material: THREE.Material, parent: THREE.Object3D) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p as [number, number, number]))), 40, radius, 8, false), material, parent);
  function seat(object: THREE.Object3D, height: number) {
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object, true);
    object.position.y += height - bounds.min.y;
    object.updateMatrixWorld(true);
  }
  function chamferBox(width: number, height: number, depth: number, bevel: number) {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2 + bevel, -height / 2 + bevel);
    shape.lineTo(width / 2 - bevel, -height / 2 + bevel);
    shape.lineTo(width / 2 - bevel, height / 2 - bevel);
    shape.lineTo(-width / 2 + bevel, height / 2 - bevel);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, {
      depth: depth - bevel * 2, bevelEnabled: true, bevelSize: bevel,
      bevelThickness: bevel, bevelSegments: 3, steps: 1,
    });
    g.translate(0, 0, -depth / 2 + bevel);
    return g;
  }

  const horn = new THREE.Group();
  horn.name = "mythic-drinking-horn";
  horn.position.set(-1.32, 0, 2.48);
  horn.rotation.set(0, -.17, .09);
  group.add(horn);
  const hornCanvas = document.createElement("canvas");
  hornCanvas.width = hornCanvas.height = 512;
  const ctx = hornCanvas.getContext("2d")!;
  const color = ctx.createLinearGradient(0, 0, 512, 0);
  color.addColorStop(0, "#645039"); color.addColorStop(.3, "#9c8058");
  color.addColorStop(.72, "#c8b78e"); color.addColorStop(1, "#dfd1ac");
  ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 700; i++) {
    const y = (i * 73.37) % 512;
    ctx.strokeStyle = `rgba(74,52,29,${.018 + (i % 7) * .006})`;
    ctx.lineWidth = .4 + i % 3 * .3;
    ctx.beginPath(); ctx.moveTo(0, y);
    ctx.bezierCurveTo(180, y + Math.sin(i) * 5, 350, y - 3, 512, y + 2); ctx.stroke();
  }
  const hornMap = new THREE.CanvasTexture(hornCanvas); hornMap.colorSpace = THREE.SRGBColorSpace; hornMap.anisotropy = 4;
  const hornMaterial = new THREE.MeshStandardMaterial({ map: hornMap, bumpMap: hornMap, bumpScale: .00035, roughness: .57 });
  const innerMaterial = new THREE.MeshStandardMaterial({ color: "#736249", roughness: .87, side: THREE.BackSide });
  const centerline = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.15, .02, -.05), new THREE.Vector3(-.13, .025, .015),
    new THREE.Vector3(-.07, .027, .04), new THREE.Vector3(.02, .03, .02),
    new THREE.Vector3(.135, .038, -.018),
  ]);
  const segments = 64, radial = 32, frames = centerline.computeFrenetFrames(segments, false);
  const radiusAt = (t: number) => .0012 + .043 * Math.pow(t, 1.23);
  function shell(inner: boolean) {
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments, center = centerline.getPointAt(t);
      const radius = inner ? Math.max(.0002, radiusAt(t) - .0022) : radiusAt(t);
      for (let j = 0; j <= radial; j++) {
        const a = j / radial * Math.PI * 2;
        const irregular = 1 + Math.sin(a * 3 + t * 4) * .022;
        const offset = frames.normals[i].clone().multiplyScalar(Math.cos(a) * radius * irregular)
          .addScaledVector(frames.binormals[i], Math.sin(a) * radius * irregular);
        positions.push(center.x + offset.x, center.y + offset.y, center.z + offset.z);
        uv.push(t, j / radial);
        if (i < segments && j < radial) {
          const n = i * (radial + 1) + j;
          indices.push(n, n + 1, n + radial + 1, n + 1, n + radial + 2, n + radial + 1);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  }
  add(shell(false), hornMaterial, horn).name = "natural-horn-shell";
  add(shell(true), innerMaterial, horn).name = "hollow-horn-interior";
  for (const t of [.9, .985]) {
    const fitting = add(new THREE.TorusGeometry(radiusAt(t) + .0007, .0018, 10, 48), bronze, horn);
    fitting.position.copy(centerline.getPointAt(t));
    fitting.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), centerline.getTangentAt(t));
  }
  const lip = add(new THREE.RingGeometry(.041, .0455, 48), bronze, horn);
  lip.position.copy(centerline.getPointAt(1));
  lip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), centerline.getTangentAt(1));
  seat(horn, 1.1828);

  const hammer = new THREE.Group();
  hammer.name = "dwarven-forged-hammer";
  hammer.position.set(-.92, 0, 2.48); hammer.rotation.y = -.12;
  group.add(hammer);
  const handle = add(new THREE.LatheGeometry([
    new THREE.Vector2(.013, -.025), new THREE.Vector2(.015, 0),
    new THREE.Vector2(.011, .07), new THREE.Vector2(.010, .18), new THREE.Vector2(.012, .215),
  ], 24), wood, hammer);
  handle.rotation.z = -Math.PI / 2; handle.position.set(-.09, .04, 0);
  const head = add(chamferBox(.075, .075, .13, .006), iron, hammer);
  head.position.set(-.09, .042, 0);
  for (const z of [-.063, .063]) {
    const cap = add(chamferBox(.072, .072, .008, .002), bronze, hammer);
    cap.position.set(-.09, .042, z);
  }
  for (let i = 0; i < 11; i++) {
    const wrap = add(new THREE.TorusGeometry(.013, .0018, 6, 20), leather, hammer);
    wrap.rotation.y = Math.PI / 2; wrap.position.set(.035 + i * .007, .04, 0);
  }
  tube([[.12, .037, 0], [.15, .026, .02], [.16, .015, .045], [.13, .01, .061], [.11, .018, .044]], .002, leather, hammer);
  seat(hammer, 1.1828);

  const trident = new THREE.Group(); trident.name = "poseidon-trident";
  trident.position.set(1.92, 0, 2.19); trident.rotation.z = -.075; group.add(trident);
  const shaft = add(new THREE.LatheGeometry([
    new THREE.Vector2(.014, 0), new THREE.Vector2(.016, .035), new THREE.Vector2(.011, .07),
    new THREE.Vector2(.010, 1.38), new THREE.Vector2(.016, 1.44), new THREE.Vector2(.019, 1.49),
  ], 24), bronze, trident);
  shaft.name = "worn-bronze-trident-shaft";
  tube([[-.165, 1.67, 0], [-.16, 1.51, 0], [-.09, 1.45, 0], [0, 1.43, 0], [.09, 1.45, 0], [.16, 1.51, 0], [.165, 1.67, 0]], .012, bronze, trident);
  for (const [x, height] of [[-.165, .18], [0, .29], [.165, .18]]) {
    const blade = new THREE.Shape();
    blade.moveTo(-.011, 0); blade.bezierCurveTo(-.033, height * .35, -.018, height * .69, .002, height);
    blade.bezierCurveTo(.025, height * .62, .024, height * .23, .011, 0); blade.closePath();
    const tip = add(new THREE.ExtrudeGeometry(blade, {
      depth: .008, bevelEnabled: true, bevelSize: .0015, bevelThickness: .0015, bevelSegments: 2, curveSegments: 20,
    }), bronze, trident);
    tip.position.set(x, x === 0 ? 1.48 : 1.65, -.004);
  }
  for (let i = 0; i < 6; i++) {
    const ring = add(new THREE.TorusGeometry(.012, .002, 6, 20), bronze, trident);
    ring.rotation.x = Math.PI / 2; ring.position.y = .35 + i * .022;
  }
  seat(trident, .001);
  const shelf = add(chamferBox(.84,.025,.22,.003),wood,group);
  shelf.name="entry-collection-shelf-top";shelf.position.set(-1.12,1.17,2.48);
  for(const x of [-1.43,-.81]){
    const bracket=add(new THREE.BoxGeometry(.018,.10,.15),bronze,group);bracket.position.set(x,1.112,2.51);
  }
  return group;
}
