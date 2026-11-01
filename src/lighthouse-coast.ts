import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = (t: number) => t * t * (3 - 2 * t);

/** The path and its supporting headland share this world-space centre line. */
export function sampleLighthousePath(amount: number) {
  const t = clamp(amount, 0, 1);
  return {
    x: 3.8 - 8 * smooth(t) + .8 * Math.sin(t * Math.PI),
    y: -.15 - .95 * t,
    z: -5 - 26 * t,
    width: 2.2 - .5 * t,
  };
}

export const lighthouseSite = Object.freeze({ x: -4.2, y: -1.1, z: -31 });

const rockyShoulder = (t: number) => 1.35 + .48 * (1 + Math.sin(t * 19 + .4))
  + .32 * (1 + Math.sin(t * 43 - .7));

function shoreline() {
  const left: THREE.Vector2[] = [], right: THREE.Vector2[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48, p = sampleLighthousePath(t);
    left.push(new THREE.Vector2(p.x - p.width / 2 - rockyShoulder(t), p.z));
    right.push(new THREE.Vector2(p.x + p.width / 2 + 4.8 + .45 * Math.sin(t * 7), p.z));
  }
  // A round, connected rock promontory supports both the path end and tower.
  const end: THREE.Vector2[] = [];
  const a = left[left.length - 1], b = right[right.length - 1];
  const centre = (a.x + b.x) / 2, radius = (b.x - a.x) / 2;
  for (let i = 1; i < 24; i++) {
    const angle = i / 24 * Math.PI;
    end.push(new THREE.Vector2(centre - radius * Math.cos(angle), -31 - Math.sin(angle) * 4.1));
  }
  return [...left, ...end, ...right.reverse()];
}

const groundHeight = (z: number) => -.15 - .95 * Math.max(0, (-z - 5) / 26);
const grain = (x: number, y: number, z: number) => Math.sin(x * 4.7 + y * 1.9 + z * 2.6) * .55
  + Math.sin(x * 11.1 - y * 2.7 + z * 5.9) * .27;

function cliffGeometry(outline: THREE.Vector2[]) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const dry = new THREE.Color("#787e79"), wet = new THREE.Color("#3f4e50");
  const scrub = new THREE.Color("#626f53"), c = new THREE.Color();
  const count = outline.length, levels = 14;
  for (let level = 0; level <= levels; level++) {
    const t = level / levels;
    for (let j = 0; j < count; j++) {
      const p = outline[j], before = outline[(j + count - 1) % count], after = outline[(j + 1) % count];
      const top = groundHeight(p.y), y = THREE.MathUtils.lerp(top, -9.5, t);
      const dx = after.x - before.x, dz = after.y - before.y, length = Math.hypot(dx, dz);
      // A broad sloping talus, stepped beds and tilted fracture planes replace
      // the former straight extrusion beneath the path. The very top stays
      // connected to the paved ground, while its coastline is independently ragged.
      const strata = .28 * Math.sin(t * 24 + p.y * .31) + .2 * Math.sin(t * 39 - p.y * .7);
      const edge = 2.15 * t + (.57 + strata + .24 * Math.sin(p.y * .83)) * Math.sin(t * Math.PI);
      const fracture = grain(p.x * .6, y, p.y * .65) * .31 * Math.sin(t * Math.PI);
      const x = p.x + dz / length * edge + fracture;
      // Keep the most distant submerged toe clear of every existing vessel lane.
      const z = clamp(p.y - dx / length * edge + Math.sin(p.x * 1.7 + y * 1.3) * .15 * Math.sin(t * Math.PI), -37.1, -4.4);
      positions.push(x, y, z);
      const tide = THREE.MathUtils.smoothstep(y, -8.5, -6.8);
      const bed = Math.sin(y * 3.7 + p.y * .19 + Math.sin(p.x * .7) * .3);
      const joint = Math.pow(.5 + .5 * Math.sin(y * 7.3 + p.y * .2), 8);
      c.copy(wet).lerp(dry, tide).multiplyScalar(.96 + bed * .075 - joint * .1 + grain(x, y, z) * .055);
      if (level === 0) c.lerp(scrub, .14 + .12 * Math.sin(p.x * 2 + p.y));
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let level = 0; level < levels; level++) for (let j = 0; j < count; j++) {
    const next = (j + 1) % count, a = level * count + j, b = level * count + next;
    indices.push(a, b, a + count, b, b + count, a + count);
  }
  // Triangulated top uses the very same rim positions; no floating road skirt.
  const topTriangles = THREE.ShapeUtils.triangulateShape(outline, []);
  for (const face of topTriangles) indices.push(face[2], face[1], face[0]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

type Batch = "rock" | "paving" | "plaster" | "tower" | "metal" | "lantern" | "vegetation";

/** A small seven-draw headland: no textures, added lights, shadows or own clock. */
export function createLighthouseCoast() {
  const group = new THREE.Group(); group.name = "lighthouse-coast";
  const batches: Record<Batch, THREE.BufferGeometry[]> = { rock: [], paving: [], plaster: [], tower: [], metal: [], lantern: [], vegetation: [] };
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1), translation = new THREE.Vector3(), euler = new THREE.Euler();
  const add = (batch: Batch, source: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, yaw = 0) => {
    let geometry = source;
    if (geometry.index) { geometry = source.toNonIndexed(); source.dispose(); }
    geometry.deleteAttribute("uv");
    matrix.compose(translation.set(x, y, z), quaternion.setFromEuler(euler.set(0, yaw, 0)), unit);
    geometry.applyMatrix4(matrix);
    if (!geometry.getAttribute("color")) {
      const position = geometry.getAttribute("position"), colors = new Float32Array(position.count * 3);
      const base = new THREE.Color(color), shade = new THREE.Color();
      for (let i = 0; i < position.count; i++) {
        shade.copy(base).multiplyScalar(1 + grain(position.getX(i), position.getY(i), position.getZ(i)) * .035);
        colors.set([shade.r, shade.g, shade.b], i * 3);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    }
    batches[batch].push(geometry);
  };
  const box = (batch: Batch, color: string, width: number, height: number, depth: number, x: number, y: number, z: number, yaw = 0) =>
    add(batch, new THREE.BoxGeometry(width, height, depth), color, x, y, z, yaw);
  const cylinder = (batch: Batch, color: string, radiusTop: number, radiusBottom: number, height: number, x: number, y: number, z: number, segments = 20) =>
    add(batch, new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), color, x, y, z);
  add("rock", cliffGeometry(shoreline()), "#787e79");
  const boulder = (x: number, y: number, z: number, radius: number, phase: number, flat: boolean) => {
    const geometry = new THREE.IcosahedronGeometry(radius, 1), position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i), py = position.getY(i), pz = position.getZ(i);
      const relief = 1 + .14 * grain(px + phase, py, pz - phase);
      position.setXYZ(i, px * relief * 1.2, py * relief * (flat ? .58 : .95), pz * relief * 1.45);
    }
    geometry.computeVertexNormals();
    add("rock", geometry, y < -6.9 ? "#465554" : "#6f7870", x, y, z, phase);
  };
  // Broken shoulders interrupt the cliff skyline; interlocking toe stones
  // emerge from the sloped face instead of looking like a retaining wall.
  for (let i = 0; i < 15; i++) {
    const t = .035 + i / 15 * .92, p = sampleLighthousePath(t);
    const edge = p.x - p.width / 2 - rockyShoulder(t);
    const radius = .45 + .22 * (.5 + .5 * Math.sin(i * 3.7));
    boulder(edge + .07, p.y - .16, p.z, radius, i * .73, true);
    if (i % 2 === 0) boulder(edge - 1.4, -6.65 - .7 * Math.sin(i * 2.8), p.z + .3, .7 + radius * .5, i * 1.37, false);
  }

  // A dark mortar bed ties staggered stone flags into one continuous walkway.
  const samples = 52;
  for (let i = 0; i < samples; i++) {
    const a = sampleLighthousePath(i / samples), b = sampleLighthousePath((i + 1) / samples);
    const length = Math.hypot(b.x - a.x, b.z - a.z), yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2, z = (a.z + b.z) / 2, width = (a.width + b.width) / 2;
    box("paving", "#6f756e", width, .055, length + .025, x, y + .04, z, yaw);
    for (let side = -1; side <= 1; side += 2) {
      const offset = side * width * .25;
      box("paving", i % 3 === 0 ? "#b9b7a5" : "#c3c1b0", width * .5 - .022, .022, length - .022,
        x + Math.cos(yaw) * offset, y + .078, z - Math.sin(yaw) * offset, yaw);
    }
    if (i % 3 === 0) {
      const left = width * .5 + .09;
      box("plaster", "#c1bda9", .21, .43, length * 3 + .06,
        x - Math.cos(yaw) * left, y + .24, z + Math.sin(yaw) * left, yaw);
    }
  }
  const site = lighthouseSite;
  cylinder("paving", "#b6b5a3", 1.5, 1.55, .26, site.x, site.y + .01, site.z, 32);
  cylinder("tower", "#d7d5c5", .66, .73, .22, site.x, site.y + .25, site.z);
  cylinder("tower", "#e6e4d7", .42, .57, 4.45, site.x, site.y + 2.585, site.z, 24);
  cylinder("tower", "#d5d4c4", .66, .51, .18, site.x, site.y + 4.9, site.z);
  cylinder("metal", "#39474a", .69, .69, .065, site.x, site.y + 5.02, site.z);
  cylinder("lantern", "#ffc77b", .43, .43, .61, site.x, site.y + 5.37, site.z, 16);
  cylinder("metal", "#364448", .63, .63, .07, site.x, site.y + 5.72, site.z);
  cylinder("metal", "#354349", 0, .72, .43, site.x, site.y + 5.96, site.z, 16);
  cylinder("metal", "#354349", .018, .027, .27, site.x, site.y + 6.31, site.z, 8);
  for (let i = 0; i < 8; i++) {
    const angle = i / 8 * TAU;
    cylinder("metal", "#334348", .025, .025, .69, site.x + Math.cos(angle) * .46, site.y + 5.37, site.z + Math.sin(angle) * .46, 6);
    cylinder("metal", "#3c4948", .018, .018, .42, site.x + Math.cos(angle) * .66, site.y + 5.22, site.z + Math.sin(angle) * .66, 6);
  }
  // Door and narrow recessed windows face back toward the room and path.
  box("metal", "#485553", .31, .83, .035, site.x, site.y + .79, site.z + .542);
  for (const height of [2.06, 3.5]) box("metal", "#3c5357", .13, .28, .04,
    site.x, site.y + height, site.z + .559 - height * .028);

  // Sparse salt-tolerant scrub stays low; the walkway itself remains clear.
  for (let i = 0; i < 28; i++) {
    const t = .05 + i / 29 * .91, p = sampleLighthousePath(t);
    const x = p.x + p.width / 2 + .55 + .35 * Math.sin(i * 2.7), z = p.z + .16 * Math.sin(i * 5);
    const height = .11 + .08 * (.5 + .5 * Math.sin(i * 7.1));
    add("vegetation", new THREE.IcosahedronGeometry(.24 + .07 * Math.sin(i * 3.7), 0), i % 3 ? "#6d7758" : "#909374", x, p.y + height * .4, z);
  }
  for (let i = 0; i < 11; i++) {
    const t = .08 + i / 11 * .83, p = sampleLighthousePath(t);
    const x = p.x - p.width / 2 - .68 - .2 * Math.sin(i * 3.1);
    const geometry = new THREE.IcosahedronGeometry(.18 + .04 * Math.sin(i * 4.7), 0);
    geometry.scale(1.25, .65, .9);
    add("vegetation", geometry, i % 3 ? "#657354" : "#8b8c6c", x, p.y + .045, p.z);
  }
  for (const t of [.22, .54, .84]) {
    const p = sampleLighthousePath(t), x = p.x - p.width * .5 + .08;
    box("metal", "#4d5550", .12, .16, .11, x, p.y + .31, p.z);
    box("lantern", "#ffd397", .075, .055, .115, x, p.y + .32, p.z + .006);
  }

  const plaster = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .96, emissive: "#b4a17a", emissiveIntensity: 0 });
  const materials: Record<Batch, THREE.MeshStandardMaterial> = {
    rock: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    paving: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }),
    plaster, tower: plaster,
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .73, metalness: .12 }),
    lantern: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .55, emissive: "#ffc77b", emissiveIntensity: 0 }),
    vegetation: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }),
  };
  const geometries: THREE.BufferGeometry[] = [];
  for (const name of Object.keys(batches) as Batch[]) {
    const merged = mergeGeometries(batches[name])!;
    const geometry = mergeVertices(merged); merged.dispose();
    for (const part of batches[name]) part.dispose();
    geometry.computeBoundingSphere(); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, materials[name]);
    mesh.name = name === "paving" ? "cliff-path" : name === "tower" ? "coastal-lighthouse" : `lighthouse-coast-${name}`; mesh.userData.kind = name;
    group.add(mesh);
  }
  group.userData.path = Array.from({ length: 53 }, (_, i) => sampleLighthousePath(i / 52));
  group.userData.lighthouse = { ...site, height: 6.445 };
  group.userData.seaLevel = -8;
  let disposed = false;
  return {
    group,
    update(daylight: number) {
      if (disposed) return;
      const night = 1 - THREE.MathUtils.smoothstep(clamp(daylight, 0, 1), .04, .55);
      // Emission marks a lit lantern without illuminating sea or room through walls.
      materials.lantern.emissiveIntensity = night * .95;
      materials.plaster.emissiveIntensity = night * .012;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const geometry of geometries) geometry.dispose();
      for (const material of new Set(Object.values(materials))) material.dispose();
      group.clear();
    },
  };
}
