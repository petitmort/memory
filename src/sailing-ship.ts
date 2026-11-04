import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createAgedTimber, createAntiqueBronze } from "./antique-materials";

/** A small, plank-built Aegean vessel. X is the keel; the square yard runs across Z. */
export function createSailingShip(): THREE.Group {
  const ship = new THREE.Group();
  ship.name = "mythic-sailing-ship";
  ship.userData.recommendedYaw = -.1;
  ship.userData.keelDirection = [1, 0, 0];
  const wood = createAgedTimber();
  wood.color.set("#bcac92"); wood.bumpScale = .004;
  const darkWood = wood.clone(); darkWood.color.set("#786b58");
  const railWood = wood.clone(); railWood.color.set("#baab8d");
  const caulking = new THREE.MeshStandardMaterial({ color: "#413d32", roughness: 1 });
  const rope = new THREE.MeshStandardMaterial({ color: "#aca18a", roughness: 1 });
  const standingRope = new THREE.MeshStandardMaterial({ color: "#776c58", roughness: 1 });
  const bronze = createAntiqueBronze(); bronze.color.set("#a49a7b"); bronze.metalness = .3;
  const fadedBlue = new THREE.MeshStandardMaterial({ color: "#596f72", roughness: .93 });
  const detail = new THREE.Group(); detail.name = "galley-planking-and-fittings"; ship.add(detail);
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = detail) => {
    const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh;
  };
  const tube = (points: THREE.Vector3[], radius: number, material: THREE.Material, parent: THREE.Object3D = detail, segments = 24) =>
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 6, false), material, parent);
  const vec = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const beam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, parent: THREE.Object3D = detail, endRadius = radius) => {
    const mesh = add(new THREE.CylinderGeometry(endRadius, radius, a.distanceTo(b), 10), material, parent);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(vec(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  };
  const widthAt = (t: number) => .028 + 1.29 * Math.pow(Math.sin(Math.PI * t), .68);
  const sheerAt = (t: number) => .93 + 1.22 * Math.pow(Math.abs(t - .5) * 2, 4.5);
  const hullPoint = (t: number, a: number, inner = false) => vec(
    (t - .5) * 14,
    sheerAt(t) - Math.sin(a) * (inner ? 1.49 : 1.56),
    Math.cos(a) * (widthAt(t) - (inner ? .065 : 0)),
  );
  const hullSurface = (inner: boolean) => {
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    const sections = 72, ribs = 24;
    for (let i = 0; i <= sections; i++) for (let j = 0; j <= ribs; j++) {
      const t = i / sections, a = j / ribs * Math.PI;
      const p = hullPoint(t, a, inner); positions.push(p.x, p.y, p.z); uvs.push(t * 3.5, j / ribs * 1.4);
      if (i < sections && j < ribs) {
        const n = i * (ribs + 1) + j;
        if (inner) indices.push(n, n + ribs + 1, n + 1, n + 1, n + ribs + 1, n + ribs + 2);
        else indices.push(n, n + 1, n + ribs + 1, n + 1, n + ribs + 2, n + ribs + 1);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    return geometry;
  };
  add(hullSurface(false), wood, ship).name = "greek-galley-hull";
  add(hullSurface(true), darkWood, ship).name = "galley-inner-hull";

  // Thin seams follow the shell's curvature rather than drawing flat stripes across it.
  for (let j = 1; j < 9; j++) {
    const a = j / 9 * Math.PI;
    tube(Array.from({ length: 49 }, (_, i) => hullPoint(.015 + i / 48 * .97, a)), .008, caulking);
  }
  for (const side of [-1, 1]) {
    const rail = Array.from({ length: 49 }, (_, i) => hullPoint(i / 48, side === 1 ? 0 : Math.PI).add(vec(0, .025, 0)));
    tube(rail, .065, railWood);
    tube(rail.map(p => p.clone().add(vec(0, -.13, side * .007))), .026, fadedBlue);
    // The structural frames remain visible between the benches.
    for (let i = 0; i < 12; i++) {
      const t = .12 + i * .069;
      const points = Array.from({ length: 19 }, (_, j) => hullPoint(t, j / 18 * Math.PI, true));
      if (side === 1) tube(points, .033, railWood, detail, 24);
    }
    // Long sweeps are raised while sailing, with their shaped blades above the water.
    for (let i = 0; i < 10; i++) {
      const x = -3.95 + i * .84;
      const a = vec(x + .15, .7, side * .8), b = vec(x - 1.3, .12, side * 3.0);
      beam(a, b, .027, railWood, detail, .018);
      const blade = add(new THREE.SphereGeometry(1, 12, 8), wood);
      blade.position.copy(b).add(vec(-.13, -.015, side * .17));
      blade.scale.set(.095, .025, .37); blade.rotation.y = -side * .55;
      const collar = add(new THREE.TorusGeometry(.049, .012, 5, 10), standingRope);
      collar.position.set(x, .83, side * 1.18); collar.rotation.y = Math.PI / 2;
    }
  }
  // A low working sole and individual seat boards sit inside the hull, below its sheer.
  for (let j = 0; j < 7; j++) {
    const z = (j - 3) * .225;
    const length = 11.25 - Math.abs(z) * .9;
    const plank = add(new THREE.BoxGeometry(length, .055, .215), wood);
    plank.position.set(-.1, .25, z);
  }
  for (let i = 0; i < 10; i++) {
    const x = -4 + i * .86, t = x / 14 + .5;
    const bench = add(new THREE.BoxGeometry(.24, .085, widthAt(t) * 1.7), railWood);
    bench.position.set(x, .72, 0);
    beam(vec(x, .3, -.72), vec(x, .68, -.72), .034, darkWood);
    beam(vec(x, .3, .72), vec(x, .68, .72), .034, darkWood);
  }
  const foredeck = add(new THREE.BoxGeometry(1.28, .07, 1.08), wood); foredeck.position.set(5.25, 1.1, 0);
  const aftdeck = add(new THREE.BoxGeometry(1.2, .07, 1.05), wood); aftdeck.position.set(-5.35, 1.13, 0);
  tube([vec(5.65, 1.2, 0), vec(6.9, 2.1, 0), vec(7.45, 2.92, 0), vec(7.37, 3.2, 0)], .115, railWood);
  tube([vec(-5.8, 1.3, 0), vec(-6.9, 2.05, 0), vec(-7.16, 3.1, 0), vec(-6.92, 3.56, 0), vec(-6.65, 3.61, 0)], .115, railWood);
  const ram = add(new THREE.SphereGeometry(1, 18, 10), bronze);
  ram.position.set(7.05, .17, 0); ram.scale.set(.68, .11, .18);
  // The steering sweep is aft, off-centre, not another floating decoration.
  beam(vec(-5.32, 1.75, .95), vec(-6.25, -.23, 1.6), .055, railWood);
  const rudder = add(new THREE.SphereGeometry(1, 12, 8), darkWood);
  rudder.position.set(-6.17, -.12, 1.55); rudder.scale.set(.19, .48, .055); rudder.rotation.z = -.4;
  for (const x of [-4.75, 4.7]) for (const z of [-.8, .8]) {
    beam(vec(x, .96, z), vec(x, 1.15, z), .034, darkWood);
    beam(vec(x - .11, 1.12, z), vec(x + .11, 1.12, z), .028, darkWood);
  }

  beam(vec(0, .25, 0), vec(0, 10.45, 0), .12, railWood, detail, .067).name = "galley-mast";
  const mastFoot = add(new THREE.BoxGeometry(.5, .23, .5), darkWood); mastFoot.position.set(0, .37, 0);
  const rig = new THREE.Group(); rig.name = "square-sail-rig"; rig.rotation.y = -.35; ship.add(rig);
  rig.userData.braceAngle = -.35;
  rig.userData.normalBeforeBrace = [1, 0, 0];
  beam(vec(0, 9.72, -4.5), vec(0, 9.72, 0), .042, railWood, rig, .082).name = "square-yard-port";
  beam(vec(0, 9.72, 0), vec(0, 9.72, 4.5), .082, railWood, rig, .042).name = "square-yard-starboard";

  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1024;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#d9d3bf"; context.fillRect(0, 0, 1024, 1024);
  let seed = 751;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (let x = 0; x < 1024; x += 2) {
    context.fillStyle = x % 4 ? "rgba(107,97,77,.035)" : "rgba(255,249,224,.07)";
    context.fillRect(x, 0, 1, 1024); context.fillRect(0, x, 1024, 1);
  }
  for (let i = 0; i < 8; i++) {
    context.fillStyle = `rgba(137,123,93,${.015 + random() * .05})`;
    context.fillRect(i * 128, 0, 128, 1024);
    context.strokeStyle = "rgba(110,101,79,.27)"; context.lineWidth = 1.4;
    context.beginPath(); context.moveTo(i * 128 + 1, 0); context.lineTo(i * 128 + 1, 1024); context.stroke();
    context.strokeStyle = "rgba(245,236,209,.6)"; context.lineWidth = .7;
    for (let y = 2; y < 1024; y += 8) { context.beginPath(); context.moveTo(i * 128 + 2, y); context.lineTo(i * 128 + 5, y + 3); context.stroke(); }
  }
  for (let i = 0; i < 65; i++) {
    context.fillStyle = `rgba(119,104,74,${random() * .025})`; context.beginPath();
    context.ellipse(random() * 1024, random() * 1024, 20 + random() * 90, 10 + random() * 75, random() * Math.PI, 0, Math.PI * 2); context.fill();
  }
  context.strokeStyle = "rgba(117,107,84,.35)"; context.lineWidth = 5; context.strokeRect(5, 5, 1014, 1014);
  const sailMap = new THREE.CanvasTexture(canvas); sailMap.colorSpace = THREE.SRGBColorSpace; sailMap.anisotropy = 4;
  const sailMaterial = new THREE.MeshStandardMaterial({ map: sailMap, side: THREE.DoubleSide, roughness: .98, bumpMap: sailMap, bumpScale: .008, color: "#fff8e7" });
  sailMaterial.userData.windSail = "square";
  const sailPoint = (u: number, v: number) => {
    const cross = Math.sin(u * Math.PI), height = Math.sin(v * Math.PI);
    return vec(
      .025 + cross * height * (1.03 + .13 * Math.sin(u * 3 + v * 2))
        + Math.sin(u * 71 + v * 7) * .045 * height * (1 - v * .5),
      3.72 + v * 5.92 + .48 * cross * (1 - v),
      (u - .5) * 8.2 * (.85 + .15 * v),
    );
  };
  const sailPositions: number[] = [], sailUVs: number[] = [], sailIndices: number[] = [];
  const across = 56, high = 42;
  for (let y = 0; y <= high; y++) for (let x = 0; x <= across; x++) {
    const u = x / across, v = y / high, p = sailPoint(u, v);
    sailPositions.push(p.x, p.y, p.z); sailUVs.push(u, v);
    if (x < across && y < high) {
      const n = y * (across + 1) + x;
      sailIndices.push(n, n + 1, n + across + 1, n + 1, n + across + 2, n + across + 1);
    }
  }
  const sailGeometry = new THREE.BufferGeometry();
  sailGeometry.setAttribute("position", new THREE.Float32BufferAttribute(sailPositions, 3));
  sailGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(sailUVs, 2));
  sailGeometry.setIndex(sailIndices); sailGeometry.computeVertexNormals();
  const sail = add(sailGeometry, sailMaterial, rig); sail.name = "single-billowing-square-sail";
  sail.userData.corners = [sailPoint(0, 0).toArray(), sailPoint(1, 0).toArray(), sailPoint(0, 1).toArray(), sailPoint(1, 1).toArray()];
  // Bolt ropes follow the actual cloth perimeter, including the curved foot.
  for (const edge of [0, 1]) {
    tube(Array.from({ length: 33 }, (_, i) => sailPoint(edge, i / 32)), .018, rope, rig, 32);
    tube(Array.from({ length: 33 }, (_, i) => sailPoint(i / 32, edge)), .018, rope, rig, 32);
  }
  for (let i = 0; i < 17; i++) {
    const z = (i / 16 - .5) * 8.2;
    tube([vec(.025, 9.64, z), vec(.06, 9.71, z - .015), vec(-.05, 9.75, z)], .012, rope, rig, 6);
  }
  // Standing stays carry the mast; braces and sheets lead to real deck cleats.
  for (const x of [-5.65, 5.65]) tube([vec(0, 10.37, 0), vec(x * .46, 5.9, .015), vec(x, 1.3, 0)], .018, standingRope);
  for (const side of [-1, 1]) {
    for (const x of [-1.8, -1.2, 1.2, 1.8]) tube([vec(0, 9.95, 0), vec(x * .55, 5.3, side * .58), vec(x, .94, side * 1.22)], .013, standingRope);
    const top = vec(0, 9.72, side * 4.45).applyEuler(rig.rotation);
    const bottom = sailPoint(side < 0 ? 0 : 1, 0).applyEuler(rig.rotation);
    tube([top, top.clone().lerp(vec(-4.7, 1.14, side * .8), .52).add(vec(0, -.18, 0)), vec(-4.7, 1.14, side * .8)], .016, rope);
    tube([bottom, bottom.clone().lerp(vec(-4.75, 1.14, side * .8), .5).add(vec(0, -.15, 0)), vec(-4.75, 1.14, side * .8)], .021, rope);
    tube([vec(0, 10.38, 0), top], .018, rope);
    const block = add(new THREE.SphereGeometry(1, 10, 7), darkWood);
    block.position.copy(bottom); block.scale.set(.065, .1, .07);
  }

  // Preserve the sail, yard and hull names, while batching the small fixed fittings.
  const batch = (parent: THREE.Group) => {
    const groups = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.name) continue;
      const meshes = groups.get(child.material) ?? []; meshes.push(child); groups.set(child.material, meshes);
    }
    for (const [material, meshes] of groups) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => {
        mesh.updateMatrix();
        return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(parts);
      if (geometry) {
        const merged = new THREE.Mesh(geometry, material); merged.name = "galley-fixed-fittings"; parent.add(merged);
        for (const mesh of meshes) { parent.remove(mesh); mesh.geometry.dispose(); }
      }
      for (const part of parts) part.dispose();
    }
  };
  batch(detail); batch(rig);
  return ship;
}
