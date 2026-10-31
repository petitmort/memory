import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createSailingShip } from "./sailing-ship";
import { vesselKinds, type VesselKind } from "./vessel-navigation";

/** Original lightweight hulls, in metres; fixed geometry is batched by material. */
export function createVesselModels(legacyShip?: THREE.Group) {
  const timber = new THREE.MeshStandardMaterial({ color: "#a58c6e", roughness: .88 });
  const dark = new THREE.MeshStandardMaterial({ color: "#55594f", roughness: .9 });
  const cream = new THREE.MeshStandardMaterial({ color: "#e4dec9", roughness: .86 });
  const blue = new THREE.MeshStandardMaterial({ color: "#667e81", roughness: .82 });
  const canvas = new THREE.MeshStandardMaterial({ color: "#e6e0cb", roughness: .98, side: THREE.DoubleSide });
  const glass = new THREE.MeshStandardMaterial({ color: "#485c61", roughness: .34 });
  const steel = new THREE.MeshStandardMaterial({ color: "#8b948d", roughness: .58, metalness: .28 });
  const templates = {} as Record<VesselKind, THREE.Group>;
  const legacy = legacyShip ?? createSailingShip();
  legacy.position.set(0, 0, 0); legacy.rotation.set(0, 0, 0);
  legacy.scale.setScalar(.62);
  templates["wood-sail"] = legacy;
  legacy.userData.vesselKind = "wood-sail";

  for (const kind of vesselKinds.filter(kind => kind !== "wood-sail")) {
    const group = new THREE.Group(); group.name = `aegean-${kind}`;
    group.userData.vesselKind = kind;
    const details = new THREE.Group(); details.name = "near-vessel-details"; group.add(details);
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0, detailed = false) => {
      const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); (detailed ? details : group).add(mesh); return mesh;
    };
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z = 0, detailed = false) =>
      add(new THREE.BoxGeometry(w, h, d), material, x, y, z, detailed);
    const pole = (height: number, x: number, z = 0) => add(new THREE.CylinderGeometry(.045, .065, height, 7), timber, x, height * .5 + .45, z);
    const sail = (mastX: number, height: number, length: number, z = 0) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([
        mastX, .8, z, mastX, height + .45, z, mastX - length * .5, height * .43 + .8, z + .28,
        mastX, .8, z, mastX - length * .5, height * .43 + .8, z + .28, mastX - length, .85, z + .14,
      ], 3));
      geometry.computeVertexNormals(); add(geometry, canvas);
    };
    const hull = (length: number, width: number, z = 0, material: THREE.Material = timber) => {
      // A tapered shell with a proper pointed bow (+X), immersed keel and low sheer.
      const vertices: number[] = [], indices: number[] = [];
      const sections = 16;
      for (let i = 0; i <= sections; i++) {
        const t = i / sections, x = (t - .5) * length;
        const beam = width * .5 * Math.pow(Math.sin(Math.PI * t), .62) + .018;
        const sheer = .45 + Math.pow(Math.abs(t - .5) * 2, 3) * .24;
        vertices.push(x, sheer, -beam + z, x, -.48, -.12 * beam + z, x, -.48, .12 * beam + z, x, sheer, beam + z);
        if (i < sections) for (let j = 0; j < 3; j++) {
          const a = i * 4 + j; indices.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      add(geometry, material); box(length * .68, .11, width * .69, cream, 0, .38, z);
    };
    if (kind === "catamaran") {
      hull(7.8, .78, -1.45, cream); hull(7.8, .78, 1.45, cream);
      box(4.5, .16, 2.9, cream, -.45, .48); box(2.5, .8, 1.8, cream, -1, .95);
      box(2.2, .3, 1.83, glass, -.9, 1.13); pole(8.8, 1); sail(1, 8.8, 4.8);
    } else {
      const ferry = kind === "ferry", motor = kind === "motor-yacht", fishing = kind === "fishing";
      const length = ferry ? 13.5 : motor ? 8.4 : fishing ? 6.6 : 9.3;
      hull(length, ferry ? 3.5 : motor ? 2.2 : 2.1, 0, ferry || motor ? cream : fishing ? blue : timber);
      if (kind === "twin-mast") {
        pole(8.5, 1.5); pole(6.2, -2.3); sail(1.5, 8.5, 4.5); sail(-2.3, 6.2, 2.2);
        box(2.8, .55, 1.25, cream, -1.4, .74);
      } else {
        const cabinLength = ferry ? 8.8 : motor ? 4.8 : 2.5;
        const cabinHeight = ferry ? 1.55 : motor ? .9 : 1.45;
        box(cabinLength, cabinHeight, ferry ? 2.8 : 1.45, cream, -.7, .5 + cabinHeight * .5);
        box(cabinLength * .85, .38, ferry ? 2.84 : 1.49, glass, -.55, .63 + cabinHeight * .6);
        box(cabinLength * 1.03, .12, ferry ? 3.0 : 1.65, cream, -.7, .57 + cabinHeight);
        if (ferry) {
          box(3.3, .8, 2.1, cream, 1.4, 2.45); box(2.8, .34, 2.14, glass, 1.5, 2.53);
          box(.9, 1.2, .85, blue, -2.4, 2.5); box(.98, .14, .93, dark, -2.4, 3.12);
        } else if (fishing) {
          pole(3.5, -2); box(.8, .6, .8, blue, 1.7, .73, .15, true);
          const net = add(new THREE.TorusGeometry(.48, .075, 4, 12), dark, 1.4, .65, -.6, true); net.rotation.x = Math.PI * .5;
        } else {
          const windshield = box(1.1, .54, 1.5, glass, 1.45, 1.05); windshield.rotation.z = -.35;
          box(2, .2, 1.4, cream, 2.3, .64);
        }
      }
      // Fine rail stanchions are omitted beyond 115 m by the controller.
      for (const side of [-1, 1]) for (let i = 0; i < 6; i++)
        add(new THREE.CylinderGeometry(.018, .018, .45, 5), steel, -length * .32 + i * length * .128, .8, side * (ferry ? 1.45 : .82), true);
    }
    // Geometry attributes are normalised before merging; no per-frame geometry.
    for (const parent of [group, details]) {
      const batches = new Map<THREE.Material, THREE.Mesh[]>();
      for (const child of [...parent.children]) if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
        const list = batches.get(child.material) ?? []; list.push(child); batches.set(child.material, list);
      }
      for (const [material, meshes] of batches) {
        const pieces = meshes.map(mesh => {
          mesh.updateMatrix(); const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
          geometry.deleteAttribute("uv"); geometry.applyMatrix4(mesh.matrix); return geometry;
        });
        const geometry = mergeGeometries(pieces);
        if (geometry) { const mesh = new THREE.Mesh(geometry, material); mesh.name = `${kind}-${parent === details ? "detail" : "body"}`; parent.add(mesh); }
        for (const mesh of meshes) { parent.remove(mesh); mesh.geometry.dispose(); }
        for (const piece of pieces) piece.dispose();
      }
    }
    templates[kind] = group;
  }
  return templates;
}
