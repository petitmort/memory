import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createAntiqueBronze, createAgedTimber } from "./antique-materials";

/** A carved parlour harp, in metres: walnut, old gilt mounts and an ivory caryatid. */
export function createClassicalInstrument() {
  const group = new THREE.Group();
  group.name = "classical-carved-harp";
  const wood = createAgedTimber();
  wood.color.set("#a99a83");
  const gilt = createAntiqueBronze();
  const ivory = new THREE.MeshStandardMaterial({ color: "#ddd4bc", roughness: .83 });
  const shadow = new THREE.MeshStandardMaterial({ color: "#4e4030", roughness: .93 });
  const gut = new THREE.MeshStandardMaterial({ color: "#c4b68e", roughness: .55, metalness: .22 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh); return mesh;
  };
  const path = (points: number[][]) => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const tube = (points: number[][], radius: number, material: THREE.Material, segments = 32) =>
    add(new THREE.TubeGeometry(path(points), segments, radius, radius < .005 ? 5 : 8, false), material);
  const beam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) => {
    const mesh = add(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 8), material);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  };
  function bevelledBox(w: number, h: number, d: number, bevel: number) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2 + bevel, -h / 2 + bevel); s.lineTo(w / 2 - bevel, -h / 2 + bevel);
    s.lineTo(w / 2 - bevel, h / 2 - bevel); s.lineTo(-w / 2 + bevel, h / 2 - bevel); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: d - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3 });
    g.translate(0, 0, -d / 2 + bevel); return g;
  }
  for (const [w, h, d, y, material] of [
    [.54, .035, .32, .0175, shadow], [.515, .027, .30, .0485, wood], [.51, .009, .295, .0665, gilt],
  ] as const) add(bevelledBox(w, h, d, .004), material).position.y = y;

  const soundboxShoe = add(bevelledBox(.14, .04, .24, .005), wood);
  soundboxShoe.position.set(-.09, .086, 0);
  const caryatidFoot = add(new THREE.LatheGeometry([
    new THREE.Vector2(.055, 0), new THREE.Vector2(.059, .005),
    new THREE.Vector2(.055, .013), new THREE.Vector2(.046, .032), new THREE.Vector2(.049, .048),
  ], 28), gilt);
  caryatidFoot.position.set(-.213, .067, .033);

  // A curved, hollow-looking soundbox, broader at its foot and tapering into the neck.
  const longitudinal = 52, radial = 24;
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const board = (t: number) => new THREE.Vector3(-.09 + .31 * t - .015 * Math.sin(t * Math.PI), .12 + 1.035 * t, 0);
  const sideways = new THREE.Vector3(1.035, -.31, 0).normalize();
  for (let i = 0; i <= longitudinal; i++) {
    const t = i / longitudinal, c = board(t), width = .055 * (1 - t) + .017, depth = .083 * (1 - t) + .031;
    for (let j = 0; j <= radial; j++) {
      const a = j / radial * Math.PI * 2;
      const p = c.clone().addScaledVector(sideways, Math.cos(a) * width);
      p.z = Math.sin(a) * depth;
      positions.push(p.x, p.y, p.z); uvs.push(t * 1.8, j / radial);
      if (i < longitudinal && j < radial) {
        const n = i * (radial + 1) + j;
        indices.push(n, n + radial + 1, n + 1, n + 1, n + radial + 1, n + radial + 2);
      }
    }
  }
  const bodyGeometry = new THREE.BufferGeometry();
  bodyGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  bodyGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); bodyGeometry.setIndex(indices); bodyGeometry.computeVertexNormals();
  add(bodyGeometry, wood);
  // The soundboard's two rolled gold edges and a raised bridge follow its actual curve.
  for (const side of [-1, 1]) {
    const points: number[][] = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20, c = board(t); c.addScaledVector(sideways, side * (.053 * (1 - t) + .015)); points.push([c.x, c.y, .055 * (1 - t) + .023]); }
    tube(points, .0027, gilt);
  }
  const neckPoints = [[-.223, 1.015, 0], [-.236, 1.236, 0], [-.217, 1.36, 0], [-.145, 1.405, 0], [-.055, 1.386, 0], [.045, 1.315, 0], [.14, 1.225, 0], [.221, 1.155, 0]];
  const neck = path(neckPoints);
  add(new THREE.TubeGeometry(neck, 72, .035, 16, false), wood);
  for (const z of [-.032, .032]) tube(neckPoints.map(p => [p[0], p[1], p[2] + z]), .0035, gilt, 64);

  // The taut strings fan between the curved neck and the diagonal bridge.
  for (let i = 0; i < 25; i++) {
    const t = .025 + i / 25 * .90, lower = board(t), x = lower.x;
    let upper = neck.getPointAt(.40);
    for (let j = 1; j <= 220; j++) {
      const p = neck.getPointAt(.32 + j / 220 * .68);
      if (p.x >= x) { upper = p; break; }
    }
    lower.z = .061 * (1 - t) + .027; upper.z = .037;
    beam(lower, upper, i % 6 === 0 ? .0008 : .00055, gut);
    const pin = add(new THREE.SphereGeometry(.0032, 8, 6), gilt); pin.position.copy(upper); pin.position.z += .005;
  }

  // A continuous draped caryatid supports the pillar; its face is carved, without bead-like eyes.
  const robePositions: number[] = [], robeUV: number[] = [], robeIndices: number[] = [];
  const rows = 30, columns = 30;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows, y = .11 + t * .865;
    const radius = .049 + .012 * Math.sin(t * Math.PI * 1.5) - .019 * Math.exp(-(((t - .69) / .18) ** 2));
    for (let j = 0; j <= columns; j++) {
      const a = j / columns * Math.PI * 2;
      const fold = 1 + (.075 + .08 * (1 - t)) * Math.sin(a * 11 + t * 3) + .045 * Math.sin(a * 7 - t * 9);
      const x = -.214 + Math.sin(t * Math.PI) * .008 + Math.cos(a) * radius * fold;
      const z = Math.sin(a) * radius * fold * .76;
      robePositions.push(x, y + Math.sin(a * 4 + t * 7) * .003 * (1 - t), z); robeUV.push(j / columns, t);
      if (i < rows && j < columns) { const n = i * (columns + 1) + j; robeIndices.push(n, n + columns + 1, n + 1, n + 1, n + columns + 1, n + columns + 2); }
    }
  }
  const robeGeometry = new THREE.BufferGeometry();
  robeGeometry.setAttribute("position", new THREE.Float32BufferAttribute(robePositions, 3)); robeGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(robeUV, 2)); robeGeometry.setIndex(robeIndices); robeGeometry.computeVertexNormals();
  add(robeGeometry, ivory);
  const collar = add(new THREE.LatheGeometry([new THREE.Vector2(.020, 0), new THREE.Vector2(.018, .05), new THREE.Vector2(.023, .06)], 24), ivory); collar.position.set(-.213, .963, 0);
  const headGeometry = new THREE.SphereGeometry(1, 28, 24), hp = headGeometry.attributes.position;
  const bump = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-((x - cx) ** 2 / sx ** 2 + (y - cy) ** 2 / sy ** 2) * 2);
  for (let i = 0; i < hp.count; i++) {
    const x = hp.getX(i) * .036, y = hp.getY(i) * .051, nz = hp.getZ(i); let z = nz * .032;
    if (nz > 0) {
      z += .006 * bump(x, y, 0, .002, .006, .023) + .004 * bump(x, y, 0, -.008, .009, .007);
      z -= .003 * (bump(x, y, -.014, .010, .011, .006) + bump(x, y, .014, .010, .011, .006));
      z += .002 * bump(x, y, 0, -.025, .014, .006);
    }
    hp.setXYZ(i, x, y, z);
  }
  headGeometry.computeVertexNormals(); const head = add(headGeometry, ivory); head.position.set(-.212, 1.07, .005); head.rotation.y = -.12;
  // Flowing locks and raised fabric creases give the silhouette its period character.
  for (let i = 0; i < 9; i++) {
    const a = i / 8 * Math.PI;
    tube([[-.213 + Math.cos(a) * .032, 1.10, -.006 + Math.sin(a) * .025], [-.213 + Math.cos(a) * .038, 1.065, -.008 + Math.sin(a) * .027], [-.213 + Math.cos(a) * .03, 1.018, -.012 + Math.sin(a) * .027]], .0032, ivory, 14);
  }
  tube([[-.24, .94, .004], [-.254, 1.065, .005], [-.249, 1.198, .004], [-.225, 1.27, .012]], .013, ivory);
  tube([[-.18, .94, .005], [-.155, .85, .029], [-.179, .76, .045], [-.207, .77, .05]], .012, ivory);
  for (let i = 0; i < 6; i++) tube([[-.247 + i * .012, .92, .023], [-.249 + i * .012, .72, .037], [-.253 + i * .013, .43, .039], [-.255 + i * .015, .14, .027]], .0017, ivory, 24);

  // Acanthus leaves and hand-cut scrolls follow the neck and foot, not a repeating decal.
  const leafShape = new THREE.Shape(); leafShape.moveTo(0, -.021);
  leafShape.bezierCurveTo(-.015, -.014, -.012, .003, -.004, .009);
  leafShape.bezierCurveTo(-.006, .015, -.002, .022, 0, .03);
  leafShape.bezierCurveTo(.012, .009, .014, -.008, 0, -.021); leafShape.closePath();
  const leafGeometry = new THREE.ExtrudeGeometry(leafShape, { depth: .0016, bevelEnabled: true, bevelSize: .0007, bevelThickness: .0007, bevelSegments: 1, curveSegments: 6 });
  for (let i = 0; i < 23; i++) {
    const t = .04 + i / 23 * .92, p = neck.getPointAt(t), tangent = neck.getTangentAt(t);
    const leaf = add(leafGeometry.clone(), gilt); leaf.position.copy(p); leaf.position.z = .036;
    leaf.rotation.z = -Math.atan2(tangent.x, tangent.y) + (i % 2 ? .55 : -.45); leaf.scale.setScalar(.7 + (i % 4) * .08);
  }
  for (const [cx, cy, radius, turn] of [[-.218, 1.262, .031, 1], [-.157, 1.371, .028, -1], [.137, 1.221, .022, 1], [-.09, .18, .038, -1], [-.20, .101, .026, 1]] as const) {
    for (const z of [-.043, .043]) {
      const points: number[][] = [];
      for (let i = 0; i <= 45; i++) { const t = i / 45, a = t * Math.PI * 3.1 * turn, r = radius * (1 - t * .88); points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, z]); }
      tube(points, .0028, gilt, 26);
    }
  }
  // Three carved sound holes are backed with dark wood, with fine gilt lips.
  for (const t of [.18, .38, .58]) {
    const p = board(t), front = .083 * (1 - t) + .031;
    const hole = add(new THREE.CircleGeometry(.012 * (1 - t * .3), 24), shadow); hole.position.set(p.x, p.y, front + .0007);
    const ring = add(new THREE.TorusGeometry(.012 * (1 - t * .3), .0013, 6, 24), gilt); ring.position.copy(hole.position); ring.position.z += .0006;
  }

  // Curves, ornament and 25 strings collapse into five material batches.
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...group.children]) if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
    const batch = batches.get(child.material) ?? []; batch.push(child); batches.set(child.material, batch);
  }
  for (const [material, meshes] of batches) {
    const geometries = meshes.map(mesh => {
      if (material === ivory) mesh.position.z += .033;
      mesh.updateMatrix();
      const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
      return g.applyMatrix4(mesh.matrix);
    });
    const combined = mergeGeometries(geometries);
    if (combined) {
      const mesh = add(combined, material); mesh.name = "harp-" + (material === ivory ? "ivory-caryatid" : material === gilt ? "carved-gilt-ornament" : material === gut ? "gut-strings" : material === wood ? "walnut-frame" : "dark-insets");
      for (const original of meshes) { group.remove(original); original.geometry.dispose(); }
    }
    for (const geometry of geometries) geometry.dispose();
  }
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group, true);
  group.position.y -= bounds.min.y;
  group.userData.floorStanding = true;
  return group;
}
