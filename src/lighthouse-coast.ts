import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";
import { PIER_DECK_HEIGHT, PIER_FOOT_WIDTH, PIER_LENGTH, PIER_PLATFORM_RADIUS, PIER_SEA_LEVEL, PIER_TOWER_SITE, PIER_WIDTH, samplePierEdge, samplePierPath } from "./pier-layout";
import { createLighthouseBeacon, type BeaconWeather } from "./lighthouse-beacon";

// Compatibility exports keep the seascape and existing diagnostics on one layout.
export const lighthouseSite = PIER_TOWER_SITE;
export const sampleLighthousePath = samplePierPath;
export const LIGHTHOUSE_HEIGHT = 8.66;
const TAU = Math.PI * 2;
type Batch = "support" | "paving" | "coping" | "tower" | "metal" | "lantern" | "glass";

/** Six masonry batches and one pooled rotating beacon. */
export function createLighthouseCoast() {
  const group = new THREE.Group(); group.name = "lighthouse-coast";
  const parts: Record<Batch, THREE.BufferGeometry[]> = { support: [], paving: [], coping: [], tower: [], metal: [], lantern: [], glass: [] };
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1);
  const translation = new THREE.Vector3(), euler = new THREE.Euler();
  const add = (batch: Batch, original: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, yaw = 0) => {
    const geometry = original.index ? original.toNonIndexed() : original;
    if (geometry !== original) original.dispose();
    geometry.deleteAttribute("uv");
    matrix.compose(translation.set(x, y, z), quaternion.setFromEuler(euler.set(0, yaw, 0)), scale);
    geometry.applyMatrix4(matrix);
    const position = geometry.getAttribute("position"), colors = new Float32Array(position.count * 3);
    const base = new THREE.Color(color), shade = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const px = position.getX(i), py = position.getY(i), pz = position.getZ(i);
      const grain = Math.sin(px * 2.3 + pz * 3.7 + py * 1.3) * .012 + Math.sin(px * 13 - pz * 9 + py * 7) * .008;
      const wet = batch === "support" ? THREE.MathUtils.smoothstep(py, PIER_SEA_LEVEL - .4, PIER_SEA_LEVEL + .85) : 1;
      shade.copy(base).multiplyScalar((.69 + wet * .31) * (1 + grain));
      colors.set([shade.r, shade.g, shade.b], i * 3);
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3)); parts[batch].push(geometry);
  };
  const box = (batch: Batch, color: string, width: number, height: number, depth: number, x: number, y: number, z: number, yaw = 0) =>
    add(batch, new THREE.BoxGeometry(width, height, depth), color, x, y, z, yaw);
  const cylinder = (batch: Batch, color: string, top: number, bottom: number, height: number, x: number, y: number, z: number, sides = 32, open = false) =>
    add(batch, new THREE.CylinderGeometry(top, bottom, height, sides, 1, open), color, x, y, z);
  const tube = (batch: Batch, color: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, sides = 6) => {
    const delta = b.clone().sub(a), geometry = new THREE.CylinderGeometry(radius, radius, delta.length(), sides);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
    geometry.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); add(batch, geometry, color);
  };
  const p = samplePierPath(.5), yaw = Math.atan2(p.tangentX, p.tangentZ);
  // A continuous submerged footing and vertical ashlar walls replace the rock promontory.
  const bottom = PIER_SEA_LEVEL - 2.1, wallTop = PIER_DECK_HEIGHT - .18;
  box("support", "#87928c", PIER_WIDTH, wallTop - bottom, PIER_LENGTH + .04, p.x, (wallTop + bottom) / 2, p.z, yaw);
  box("support", "#6c7d79", PIER_FOOT_WIDTH, .42, PIER_LENGTH + .12, p.x, bottom + .2, p.z, yaw);
  const blocks = 32, courses = 6, courseHeight = (wallTop - bottom) / courses;
  for (const side of [-1, 1] as const) for (let row = 0; row < courses; row++) for (let column = 0; column < blocks; column++) {
    const stagger = row % 2 * .5, t = (column + .5 + stagger) / blocks;
    if (t > 1) continue;
    const q = samplePierEdge(t, side), length = PIER_LENGTH / blocks - .018;
    box("support", row < 2 ? "#667c77" : column % 5 === 0 ? "#9ca49a" : "#a5ada2", .075, courseHeight - .018, length,
      q.x + q.normalX * side * .025, bottom + (row + .5) * courseHeight, q.z + q.normalZ * side * .025, yaw);
  }
  // The landing and deck are level and join without a visible gap or floating skirt.
  cylinder("support", "#8c9890", PIER_PLATFORM_RADIUS, PIER_PLATFORM_RADIUS + .2, wallTop - bottom,
    lighthouseSite.x, (wallTop + bottom) / 2, lighthouseSite.z, 48);
  box("paving", "#8b968d", PIER_WIDTH + .04, .20, PIER_LENGTH + .08, p.x, PIER_DECK_HEIGHT - .1, p.z, yaw);
  cylinder("paving", "#b9b9a8", PIER_PLATFORM_RADIUS + .02, PIER_PLATFORM_RADIUS + .02, .20,
    lighthouseSite.x, PIER_DECK_HEIGHT - .1, lighthouseSite.z, 48);
  const flags = 48;
  for (let i = 0; i < flags; i++) {
    const q = samplePierPath((i + .5) / flags);
    for (const side of [-1, 1]) box("paving", i % 7 === 0 ? "#b0b4a7" : "#c2c2b1", PIER_WIDTH / 2 - .045, .026, PIER_LENGTH / flags - .024,
      q.x + q.normalX * side * PIER_WIDTH * .25, PIER_DECK_HEIGHT + .013, q.z + q.normalZ * side * PIER_WIDTH * .25, yaw);
  }
  // Low regular curb blocks leave the water-facing edge open to visible wave run-up.
  for (const side of [-1, 1] as const) {
    const q = samplePierEdge(.5, side);
    box("coping", "#d1d0bc", .18, .22, PIER_LENGTH + .04, q.x, PIER_DECK_HEIGHT + .11, q.z, yaw);
    for (let i = 0; i <= 16; i++) {
      const r = samplePierEdge(i / 16, side);
      cylinder("metal", "#6e7d78", .035, .043, .68, r.x, PIER_DECK_HEIGHT + .45, r.z, 8);
      if (i < 16) {
        const next = samplePierEdge((i + 1) / 16, side), a = new THREE.Vector3(r.x, PIER_DECK_HEIGHT + .62, r.z), b = new THREE.Vector3(next.x, PIER_DECK_HEIGHT + .62, next.z);
        const midpoint = a.clone().lerp(b, .5); midpoint.y -= .09;
        tube("metal", "#77837a", a, midpoint, .018); tube("metal", "#77837a", midpoint, b, .018);
      }
    }
  }
  // The tower's silhouette is entirely inside the right pane on both room cameras.
  const site = lighthouseSite;
  const profile = [
    [1.0, 0], [1.0, .18], [.92, .25], [.90, .34], [.84, .40], [.73, 5.19],
    [.80, 5.21], [.82, 5.35], [.73, 5.43], [.73, 5.59], [1.09, 5.68], [1.13, 5.78], [1.10, 5.9], [.63, 5.95], [.63, 6.13],
  ];
  add("tower", new THREE.LatheGeometry(profile.map(([radius, y]) => new THREE.Vector2(radius, y)), 48), "#e1e0cf", site.x, site.y, site.z);
  cylinder("tower", "#a86c56", .855, .87, .12, site.x, site.y + .47, site.z, 48);
  cylinder("tower", "#b27a60", .815, .815, .10, site.x, site.y + 5.29, site.z, 48);
  cylinder("metal", "#4a5c5a", 1.135, 1.135, .06, site.x, site.y + 5.91, site.z, 48);
  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * TAU, x = site.x + Math.cos(angle) * 1.07, z = site.z + Math.sin(angle) * 1.07;
    cylinder("metal", "#576b68", .019, .025, .66, x, site.y + 6.27, z, 6);
  }
  for (const h of [6.13, 6.38, 6.59]) {
    const ring = new THREE.TorusGeometry(1.075, .019, 5, 64); ring.rotateX(Math.PI / 2); add("metal", ring, "#5a6d68", site.x, site.y + h, site.z);
  }
  cylinder("metal", "#536969", .675, .675, .17, site.x, site.y + 6.12, site.z, 48);
  cylinder("glass", "#aac4c7", .642, .642, 1.05, site.x, site.y + 6.71, site.z, 32, true);
  for (let i = 0; i < 12; i++) {
    const angle = i / 12 * TAU;
    cylinder("metal", "#526567", .021, .021, 1.13, site.x + Math.cos(angle) * .648, site.y + 6.71, site.z + Math.sin(angle) * .648, 6);
  }
  for (const h of [6.20, 6.73, 7.27]) cylinder("metal", "#53696a", .67, .67, .035, site.x, site.y + h, site.z, 48, true);
  cylinder("lantern", "#ffddaa", .19, .24, .48, site.x, site.y + 6.67, site.z, 20);
  cylinder("metal", "#586e70", .72, .78, .11, site.x, site.y + 7.30, site.z, 48);
  const dome = new THREE.SphereGeometry(.89, 40, 12, 0, TAU, 0, Math.PI / 2); dome.scale(1, .74, 1);
  add("metal", dome, "#647a7c", site.x, site.y + 7.36, site.z);
  cylinder("metal", "#536a6d", .23, .25, .12, site.x, site.y + 8.08, site.z, 24);
  cylinder("metal", "#52676c", .015, .025, .43, site.x, site.y + 8.36, site.z, 8);
  tube("metal", "#637777", new THREE.Vector3(site.x - .17, site.y + 8.5, site.z), new THREE.Vector3(site.x + .17, site.y + 8.5, site.z), .012);
  // Recessed door, limestone lintel and narrow white window frames face the room.
  const facing = Math.atan2(.55 - site.x, 1.7 - site.z), front = (distance: number) => ({ x: site.x + Math.sin(facing) * distance, z: site.z + Math.cos(facing) * distance });
  let face = front(.86);
  box("metal", "#506866", .47, 1.24, .045, face.x, site.y + .95, face.z, facing);
  for (const s of [-1, 1]) box("tower", "#f0ead8", .07, 1.37, .065, face.x + Math.cos(facing) * .27 * s, site.y + .98, face.z - Math.sin(facing) * .27 * s, facing);
  box("tower", "#ddd9c5", .62, .09, .08, face.x, site.y + 1.69, face.z, facing);
  for (const h of [3.15, 4.38]) {
    face = front(.80 - h * .015);
    box("metal", "#46616b", .27, .49, .032, face.x, site.y + h, face.z, facing);
    for (const s of [-1, 1]) box("tower", "#f0ecdc", .055, .57, .055, face.x + Math.cos(facing) * .165 * s, site.y + h, face.z - Math.sin(facing) * .165 * s, facing);
    box("tower", "#eee9d8", .37, .055, .065, face.x, site.y + h - .28, face.z, facing);
    box("tower", "#eee9d8", .37, .055, .065, face.x, site.y + h + .28, face.z, facing);
    box("tower", "#eee9d8", .026, .49, .045, face.x, site.y + h, face.z + .018, facing);
  }
  const landingLights = [.17, .44, .71, .94];
  for (const t of landingLights) {
    const q = samplePierEdge(t, -1);
    box("metal", "#5c6d68", .12, .16, .13, q.x, PIER_DECK_HEIGHT + .28, q.z, yaw);
    box("lantern", "#ffdbac", .08, .06, .135, q.x, PIER_DECK_HEIGHT + .29, q.z, yaw);
  }
  // Curbs and paving share one stone batch, leaving the geometry budget intact
  // when the single atmospheric beacon is added.
  parts.paving.push(...parts.coping); parts.coping.length = 0;
  const plaster = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .93, emissive: "#b5a27e", emissiveIntensity: 0 });
  const materials: Record<Batch, THREE.MeshStandardMaterial> = {
    support: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .95 }),
    paving: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94 }),
    coping: plaster, tower: plaster,
    metal: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .53, metalness: .32 }),
    lantern: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .45, emissive: "#ffcc88", emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: .21, depthWrite: false, roughness: .18, metalness: .12, side: THREE.DoubleSide }),
  };
  const geometries: THREE.BufferGeometry[] = [];
  for (const name of Object.keys(parts) as Batch[]) {
    if (!parts[name].length) continue;
    const merged = mergeGeometries(parts[name])!, geometry = mergeVertices(merged); merged.dispose();
    parts[name].forEach(value => value.dispose()); geometry.computeBoundingSphere(); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, materials[name]);
    mesh.name = name === "paving" ? "cliff-path" : name === "tower" ? "coastal-lighthouse" : `lighthouse-coast-${name}`;
    mesh.userData.kind = name; group.add(mesh);
  }
  group.userData.path = Array.from({ length: 53 }, (_, i) => samplePierPath(i / 52));
  group.userData.lighthouse = { ...site, height: LIGHTHOUSE_HEIGHT };
  group.userData.seaLevel = PIER_SEA_LEVEL; group.userData.kind = "regular-breakwater-pier";
  const beacon = createLighthouseBeacon({ x: site.x, y: site.y + 6.67, z: site.z });
  group.add(beacon.group);
  let disposed = false;
  return {
    group, beacon, warmObjects: beacon.warmObjects,
    updateBeacon(timestamp: number, sunAltitude: number, weather: BeaconWeather, reduced = false, low = false) {
      if (disposed) return;
      const state = beacon.update(timestamp, sunAltitude, weather, reduced, low);
      if (state) {
        materials.lantern.emissiveIntensity = state.lanternIntensity;
        materials.glass.emissive.set("#ffd395");
        materials.glass.emissiveIntensity = state.twilight * .07;
      }
      return state;
    },
    update(daylight: number) {
      if (disposed) return;
      const night = 1 - THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(daylight, 0, 1), .04, .55);
      materials.lantern.emissiveIntensity = night * 1.15;
      plaster.emissiveIntensity = night * .012;
    },
    dispose() {
      if (disposed) return; disposed = true;
      beacon.dispose();
      geometries.forEach(value => value.dispose());
      new Set(Object.values(materials)).forEach(value => value.dispose()); group.clear();
    },
  };
}
