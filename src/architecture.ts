import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createCourtyardDetails } from "./courtyard-details";

/** Rectangular 90×210 cm envelope, with a rounded Cycladic head. */
export function archedDoorGeometry(
  width: number,
  height: number,
  depth: number,
) {
  const r = width / 2,
    spring = height - r,
    shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(width, 0);
  shape.lineTo(width, spring);
  shape.absarc(r, spring, r, 0, Math.PI, false);
  shape.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 36,
  });
  g.translate(-r, -height / 2, -depth / 2);
  return g;
}
export function archedLintel(
  left: number,
  right: number,
  spring: number,
  top: number,
  depth: number,
) {
  const center = (left + right) / 2,
    r = (right - left) / 2,
    shape = new THREE.Shape();
  shape.moveTo(left, spring);
  shape.lineTo(left, top);
  shape.lineTo(right, top);
  shape.lineTo(right, spring);
  shape.absarc(center, spring, r, 0, Math.PI, false);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 36,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
export function archMoulding(inner: number, outer: number, depth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(outer, 0);
  shape.absarc(0, 0, outer, 0, Math.PI, false);
  shape.lineTo(-inner, 0);
  shape.absarc(0, 0, inner, Math.PI, 0, true);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.005,
    bevelThickness: 0.005,
    curveSegments: 36,
  });
}

export function createExterior(materials?: {
  plaster: THREE.Material;
  blue: THREE.Material;
}) {
  const group = new THREE.Group();
  group.name = "santorini-exterior";
  const white =
    materials?.plaster ??
    new THREE.MeshStandardMaterial({ color: "#f5f3e9", roughness: 0.91 });
  const blue =
    materials?.blue ??
    new THREE.MeshStandardMaterial({ color: "#215a8b", roughness: 0.71 });
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material = white,
    parent: THREE.Object3D = group,
  ) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  // Low sculpted courtyard wall, a built-in bench and handmade planters.
  // A sheltered entrance garden: the ocean is revealed only after entering.
  for(const side of [-1,1]) {
    box(.24,2.8,4.8,side*2.4,1.4,4.95);
    box(.32,.08,4.8,side*2.4,2.84,4.95);
    for(const z of [3.2,4.7,6.2]) {
      box(.11,2.65,.11,side*2.24,1.325,z,blue);
    }
  }
  box(4.9,.12,.8,0,2.86,3.1);
  const pergolaWood = new THREE.MeshStandardMaterial({color:'#72664d',roughness:1});
  for(let z=3.7;z<7.4;z+=.48)box(4.9,.13,.12,0,2.85,z,pergolaWood);
  box(4.8,2.8,.2,0,1.4,7.4);
  box(.32,.08,3.6,-2.4,2.86,4.4);
  box(0.32, 0.08, 3.6, -2.4, 0.66, 4.4);
  box(1.08, 0.4, 0.4, -1.42, 0.2, 2.98);
  box(1.12, 0.05, 0.44, -1.42, 0.425, 2.98);
  group.add(createCourtyardDetails(white));
  // A distant island hamlet is scenery at its actual metre scale.
  const village = new THREE.Group();
  village.name = "aegean-village";
  village.position.set(-65, -7.73, -85);
  group.add(village);
  const rock = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.MeshStandardMaterial({ color: "#a39c88", roughness: 1 }),
  );
  rock.position.set(0, -1.25, 0);
  rock.scale.set(7, 2.5, 5);
  village.add(rock);
  for (let i = 0; i < 6; i++) {
    const x = (i % 3) * 1.6 - 2.2,
      z = Math.floor(i / 3) * 1.5,
      y = 0.1 + Math.floor(i / 3) * 0.5;
    box(1.4, 1.8, 1.5, x, y + 0.9, z, white, village);
    box(0.23, 0.52, 0.025, x + 0.36, y + 1.0, z + 0.765, blue, village);
    box(0.33, 0.65, 0.025, x - 0.26, y + 0.42, z + 0.765, blue, village);
  }
  const church = box(1.8, 2.4, 1.7, -0.4, 1.3, -1.6, white, village);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.87, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    blue,
  );
  dome.position.set(-0.4, 2.5, -1.6);
  village.add(dome);
  box(0.035, 0.36, 0.035, -0.4, 3.5, -1.6, white, village);
  box(0.2, 0.035, 0.035, -0.4, 3.56, -1.6, white, village);
  // Broad courtyard masonry and village details share a few static material batches.
  for (const parent of [group, village]) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...parent.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.name) continue;
      const meshes = batches.get(child.material) ?? []; meshes.push(child); batches.set(child.material, meshes);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => {
        mesh.updateMatrix();
        return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(parts);
      if (geometry) {
        const merged = new THREE.Mesh(geometry, material); merged.castShadow = merged.receiveShadow = true; parent.add(merged);
        for (const mesh of meshes) { parent.remove(mesh); mesh.geometry.dispose(); }
      }
      for (const part of parts) part.dispose();
    }
  }
  return group;
}
