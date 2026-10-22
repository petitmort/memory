import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createAntiqueBronze } from "./antique-materials";

/** A 41 cm collector's amphora: chased figures are part of the vessel surface. */
export function createClassicalVessel(): THREE.Group {
  const vessel = new THREE.Group();
  vessel.name = "classical-relief-amphora";
  const bronze = createAntiqueBronze();
  bronze.roughness = .66;
  bronze.bumpScale = .0008;
  const worn = bronze.clone(); worn.color.set("#e0c99c"); worn.roughness = .57;
  const recess = bronze.clone(); recess.color.set("#87917a"); recess.roughness = .8;
  function add(geometry: THREE.BufferGeometry, material: THREE.Material = bronze) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true;
    vessel.add(mesh);
    return mesh;
  }
  function tube(points: number[][], radius: number, material: THREE.Material = worn, segments = 42) {
    return add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2]))), segments, radius, 8, false), material);
  }
  const profile = [
    [0, 0], [.044, 0], [.050, .004], [.051, .011], [.044, .018], [.035, .024],
    [.038, .034], [.050, .049], [.062, .069], [.074, .100], [.084, .143],
    [.087, .181], [.082, .225], [.071, .264], [.059, .286], [.053, .299],
    [.051, .313], [.054, .326], [.063, .333], [.066, .340], [.064, .348],
    [.060, .353], [.057, .350], [.057, .343], [.052, .336], [.047, .327], [.046, .313],
  ];
  // A softly rounded profile avoids stacks of independent cylindrical bands.
  const outline = new THREE.SplineCurve(profile.map(p => new THREE.Vector2(p[0], p[1])));
  const bodyGeometry = new THREE.LatheGeometry(outline.getPoints(184), 160);
  const position = bodyGeometry.attributes.position;
  function ellipse(x: number, y: number, cx: number, cy: number, rx: number, ry: number, height: number, tilt = 0) {
    const dx = x - cx, dy = y - cy, c = Math.cos(tilt), s = Math.sin(tilt);
    const u = (dx * c + dy * s) / rx, v = (dy * c - dx * s) / ry;
    return Math.pow(Math.max(0, 1 - u * u - v * v), .7) * height;
  }
  function stroke(x: number, y: number, points: number[][], radius: number, height: number) {
    let distance = Infinity;
    for (let i = 1; i < points.length; i++) {
      const [ax, ay] = points[i - 1], [bx, by] = points[i];
      const dx = bx - ax, dy = by - ay;
      const t = THREE.MathUtils.clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
      distance = Math.min(distance, Math.hypot(x - ax - dx * t, y - ay - dy * t));
    }
    return Math.exp(-Math.pow(distance / radius, 2) * 2) * height;
  }
  function figures(x: number, y: number) {
    // A seated muse with a lyre and a standing companion, in shallow repousse.
    let h = ellipse(x, y, -.006, .245, .010, .014, .0027, -.1);
    h += ellipse(x, y, -.005, .227, .004, .011, .0014);
    h += ellipse(x, y, -.003, .201, .014, .026, .0018, -.25);
    h += ellipse(x, y, .009, .169, .025, .012, .002, .2);
    h += ellipse(x, y, .023, .139, .013, .032, .0015, -.18);
    h += stroke(x, y, [[-.014, .218], [-.026, .203], [-.019, .185], [.006, .194]], .0031, .0021);
    h += stroke(x, y, [[.008, .218], [.023, .204], [.036, .222]], .0033, .0021);
    for (let i = 0; i < 6; i++) {
      const offset = (i - 2.5) * .0038;
      h += stroke(x, y, [[-.008 + offset, .204], [-.012 + offset, .181], [.013 + offset, .163], [.019 + offset, .111]], .0008, .0012);
    }
    h += ellipse(x, y, -.044, .218, .0083, .0115, .0022, .15);
    h += ellipse(x, y, -.041, .181, .0115, .026, .0015, -.12);
    h += ellipse(x, y, -.037, .142, .014, .032, .0011);
    h += stroke(x, y, [[-.048, .199], [-.056, .183], [-.041, .173]], .0025, .0016);
    h += stroke(x, y, [[-.034, .197], [-.026, .186], [-.016, .191]], .0024, .0017);
    for (let i = 0; i < 5; i++) {
      const offset = (i - 2) * .0035;
      h += stroke(x, y, [[-.043 + offset, .185], [-.037 + offset, .164], [-.044 + offset, .116]], .00065, .001);
    }
    // Tiny lyre, foliage and an irregular ground frieze join the figures.
    h += stroke(x, y, [[.031, .196], [.027, .216], [.031, .234]], .0012, .0014);
    h += stroke(x, y, [[.039, .196], [.043, .216], [.039, .234]], .0012, .0014);
    h += stroke(x, y, [[.028, .229], [.041, .229]], .001, .0012);
    for (let i = 0; i < 4; i++) h += stroke(x, y, [[.031 + i * .0024, .199], [.031 + i * .0024, .229]], .00045, .0007);
    h += stroke(x, y, [[-.06, .102], [-.035, .109], [-.006, .099], [.018, .108], [.048, .103], [.061, .119]], .0012, .001);
    return h;
  }
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius < .001 || y < .078 || y > .272) continue;
    const angle = Math.atan2(x, z), front = Math.max(0, Math.cos(angle));
    const relief = figures(x, y) * Math.pow(front, 7);
    position.setXYZ(i, x * (1 + relief / radius), y, z * (1 + relief / radius));
  }
  bodyGeometry.computeVertexNormals();
  add(bodyGeometry).name = "amphora-repousse-body";

  function ring(radius: number, y: number, thickness: number, material: THREE.Material = worn) {
    const mesh = add(new THREE.TorusGeometry(radius, thickness, 8, 112), material);
    mesh.rotation.x = Math.PI / 2; mesh.position.y = y;
  }
  ring(.050, .007, .0012); ring(.042, .019, .0009, recess);
  ring(.053, .299, .0011); ring(.062, .332, .0018); ring(.063, .347, .0012);
  ring(.071, .263, .0011, recess); ring(.073, .258, .0009);
  // Egg-and-dart shoulder moulding and a chased bead edge.
  for (let i = 0; i < 42; i++) {
    const a = i * Math.PI * 2 / 42;
    const egg = add(new THREE.SphereGeometry(1, 10, 8), i % 7 === 0 ? recess : worn);
    egg.position.set(Math.sin(a) * .068, .277 + Math.sin(i * 2.8) * .0005, Math.cos(a) * .068);
    egg.scale.set(.0034, .0087, .0017); egg.rotation.y = a;
  }
  for (let i = 0; i < 40; i++) {
    const a = i * Math.PI * 2 / 40;
    const bead = add(new THREE.SphereGeometry(.0014, 8, 6), worn);
    bead.position.set(Math.sin(a) * .0608, .352, Math.cos(a) * .0608);
  }

  for (const sign of [-1, 1]) {
    const handle = [
      [.071, .228, 0], [.103, .243, 0], [.121, .281, -.002], [.128, .334, -.002],
      [.123, .383, 0], [.105, .406, .003], [.086, .392, .004], [.086, .368, .003], [.104, .361, .002],
    ].map(p => [p[0] * sign, p[1], p[2]]);
    tube(handle, .0048);
    tube([[.081 * sign, .245, .002], [.107 * sign, .276, .004], [.112 * sign, .318, .005], [.103 * sign, .349, .006]], .0012, recess);
    // A continuous little cameo, not separate spherical eyes and mouth parts.
    const medal = new THREE.SphereGeometry(1, 48, 32), p = medal.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), nz = p.getZ(i);
      const gaussian = (cx: number, cy: number, sx: number, sy: number) => Math.exp(-((x - cx) ** 2 / sx ** 2 + (y - cy) ** 2 / sy ** 2) * 2);
      let relief = .0013 * gaussian(0, .05, .16, .62) + .0007 * gaussian(0, -.3, .24, .18);
      relief -= .0005 * (gaussian(-.34, .3, .3, .18) + gaussian(.34, .3, .3, .18));
      relief += .0005 * gaussian(0, -.58, .35, .18);
      p.setXYZ(i, x * .023, y * .025, nz * .003 + (nz > 0 ? relief : 0));
    }
    medal.computeVertexNormals();
    const cameo = add(medal, worn); cameo.position.set(sign * .103, .383, .005);
    const border = add(new THREE.TorusGeometry(.026, .0016, 8, 64), bronze); border.position.set(sign * .103, .383, .005);
    const inner = add(new THREE.TorusGeometry(.0238, .0006, 6, 64), recess); inner.position.copy(border.position); inner.position.z += .001;
    // Acanthus scrolls curl back onto the shoulder rather than floating beside it.
    tube([[sign * .076, .251, .011], [sign * .089, .268, .013], [sign * .087, .287, .014], [sign * .077, .293, .014], [sign * .073, .283, .014], [sign * .080, .279, .014]], .0019);
  }

  // Merge by finish: the intricate metalwork renders in three draw calls.
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...vessel.children]) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
    const list = buckets.get(child.material) ?? []; list.push(child); buckets.set(child.material, list);
  }
  for (const [material, meshes] of buckets) {
    const parts = meshes.map(mesh => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const combined = mergeGeometries(parts);
    if (combined) {
      const mesh = add(combined, material); mesh.name = material === bronze ? "amphora-sculpted-body" : material === worn ? "amphora-raised-ornament" : "amphora-patinated-recesses";
      for (const old of meshes) { vessel.remove(old); old.geometry.dispose(); }
    }
    for (const part of parts) part.dispose();
  }
  vessel.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vessel, true);
  for (const child of vessel.children) {
    if (child instanceof THREE.Mesh) child.geometry.translate(0, -bounds.min.y, 0);
  }
  vessel.userData.displayHeight = bounds.max.y - bounds.min.y;
  return vessel;
}
