import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** Reef feet are submerged; these footprints can also guide shallow-water shading. */
export const coastalReefs = [
  { x: -4, z: -76, radius: 4.3 },
  { x: -44, z: -85, radius: 3.6 },
] as const;

const TAU = Math.PI * 2;
const smoothstep = (min: number, max: number, value: number) => THREE.MathUtils.smoothstep(value, min, max);

// A continuous, deterministic field gives adjoining faces the same weathering.
function grain(x: number, y: number, z: number) {
  return Math.sin(x * 2.63 + z * 1.91 + y * .71) * .47
    + Math.sin(x * 5.21 - z * 3.17 + y * 2.34) * .21
    + Math.sin(x * 11.8 + z * 7.13 - y * 4.3) * .09;
}

function islandGeometry(width: number, depth: number, height: number, phase: number, haze = .1, far = false) {
  const segments = far ? 48 : 100, rings = far ? 10 : 28;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const stone = new THREE.Color("#8f9285");
  const scrub = new THREE.Color("#6c7868");
  const shore = new THREE.Color("#b2a58e");
  const distantHaze = new THREE.Color("#b8cad0");
  const rock = new THREE.Color();
  for (let ring = 0; ring <= rings; ring++) {
    const radial = ring / rings;
    for (let j = 0; j <= segments; j++) {
      const angle = j / segments * TAU;
      const coast = 1 + .105 * Math.sin(angle * 3 + phase)
        + .065 * Math.sin(angle * 5 - .7) + .035 * Math.cos(angle * 9 + phase);
      const r = radial * coast;
      // A long, weathered ridge has unequal seaward slopes and small saddles.
      // Its silhouette stays low, rather than reading as two round model hills.
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const ridgeZ = x * .15 + .065 * Math.sin(x * 5 + phase);
      const side = (z - ridgeZ) / (z > ridgeZ ? .29 : .48);
      const crossSlope = Math.exp(-Math.pow(Math.abs(side), 1.35));
      const spine = .48 + .07 * Math.sin(x * 4.7 + phase)
        + .045 * Math.sin(x * 11.3 - .7) + .022 * Math.sin(x * 23 + phase);
      const endSlope = 1 - smoothstep(.51, 1.08, Math.abs(x));
      const interior = 1 - smoothstep(.71, 1.03, radial);
      const relief = grain(x * 3.1 + phase, 0, z * 2.8);
      let y = height * spine * crossSlope * endSlope * interior;
      y += height * relief * .035 * Math.sin(radial * Math.PI);
      // Last rings slope into the sea rather than ending in a visible flat skirt.
      y -= smoothstep(.84, 1, radial) * 2.1;
      positions.push(x * width * .5, y, z * depth * .5);
      const vegetation = smoothstep(.5, 2.4, y) * (1 - smoothstep(height * .5, height * .88, y));
      const patch = .5 + .5 * grain(x * 10 + phase, y, z * 9);
      rock.copy(stone).lerp(scrub, vegetation * patch * .65);
      rock.lerp(shore, (1 - smoothstep(.2, 1.6, y)) * .52);
      rock.multiplyScalar(1 + relief * .055);
      // These fixed distant islands have less local contrast than nearby reefs.
      rock.lerp(distantHaze, haze);
      colors.push(rock.r, rock.g, rock.b);
      if (ring < rings && j < segments) {
        const a = ring * (segments + 1) + j, b = a + segments + 1;
        indices.push(a, b + 1, b, a, a + 1, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function weatheredRock(width: number, depth: number, height: number, seed: number) {
  const segments = 25, levels = 12;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const wet = new THREE.Color("#3d4b48"), dry = new THREE.Color("#85877a");
  const surface = new THREE.Color();
  for (let level = 0; level <= levels; level++) {
    const t = level / levels;
    // An eroded outcrop has an uneven oval footprint, undercut tide ledges and
    // different shoulders; avoid the old softened rectangular pillow outline.
    const profile = 1.08 - .34 * t + .06 * Math.sin(t * 16 + seed)
      - .13 * smoothstep(.68, 1, t);
    for (let j = 0; j <= segments; j++) {
      const a = j / segments * TAU;
      const edge = 1 + .14 * Math.sin(a * 3 + seed) + .085 * Math.sin(a * 7 - seed * 1.3);
      const disturbance = .035 * Math.sin(t * 17 + a * 4 + seed);
      const nx = Math.cos(a), nz = Math.sin(a);
      const x = nx * width * .5 * (profile * edge + disturbance) + t * width * .09;
      const z = nz * depth * .5 * (profile * edge + disturbance) - t * depth * .06;
      const slant = (-nx * .3 + nz * .16 + Math.sin(a * 3 + seed) * .18
        + Math.sin(a * 7 - seed) * .065) * Math.pow(t, 1.5);
      const y = -1.8 + t * (height + 1.8) + slant;
      positions.push(x, y, z);
      const weather = grain(x + seed * 3, y, z);
      // Wet stone darkens naturally near the tide line, with uneven salt bleaching.
      surface.copy(wet).lerp(dry, smoothstep(.05 + weather * .3, 1.45, y));
      const strata = Math.sin(y * 13 + x * .45 + z * .27 + weather * .5);
      const fissure = Math.pow(Math.max(0, Math.sin(x * 4.1 + z * 3.3 + seed)), 18);
      surface.multiplyScalar(1 + weather * .13 - Math.pow(Math.max(0, strata), 10) * .10 - fissure * .07);
      colors.push(surface.r, surface.g, surface.b);
      if (level < levels && j < segments) {
        const a0 = level * (segments + 1) + j, b0 = a0 + segments + 1;
        indices.push(a0, b0, b0 + 1, a0, b0 + 1, a0 + 1);
      }
    }
  }
  // A sloped, fractured crown closes each shoulder, with no flat box top.
  const topRing = levels * (segments + 1);
  const capRings = 4;
  for (let ring = 1; ring <= capRings; ring++) {
    const amount = 1 - ring / capRings;
    const start = positions.length / 3;
    for (let j = 0; j <= segments; j++) {
      const edge = (topRing + j) * 3;
      const x = width * .09 + (positions[edge] - width * .09) * amount;
      const z = -depth * .06 + (positions[edge + 2] + depth * .06) * amount;
      const y = height + (positions[edge + 1] - height) * amount
        + grain(x + seed, height, z) * .17 * Math.sin(amount * Math.PI);
      positions.push(x, y, z);
      surface.copy(dry).multiplyScalar(.98 + grain(x, y, z + seed) * .11);
      colors.push(surface.r, surface.g, surface.b);
      if (j < segments) {
        const outer = ring === 1 ? topRing + j : start - segments - 1 + j;
        const inner = start + j;
        indices.push(outer, inner, inner + 1, outer, inner + 1, outer + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createCoastalEnvironment() {
  const group = new THREE.Group();
  group.name = "aegean-natural-coast";
  const landMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const islands = [
    { name: "distant-island-west", x: -55, z: -160, width: 48, depth: 21, height: 9.6, turn: -.16, phase: .8 },
    { name: "distant-island-east", x: -7, z: -185, width: 34, depth: 16, height: 6.4, turn: .23, phase: 2.2 },
  ];
  for (const island of islands) {
    const mesh = new THREE.Mesh(islandGeometry(island.width, island.depth, island.height, island.phase), landMaterial);
    mesh.name = island.name;
    mesh.position.set(island.x, -8, island.z);
    mesh.rotation.y = island.turn;
    mesh.userData.kind = "natural-island";
    group.add(mesh);
  }

  // One batched low skyline lies behind the existing islands, while all feet
  // remain within the ocean's distant edge. Fog supplies the remaining depth.
  const farParts = [
    { x: -96, z: -223, width: 64, depth: 13, height: 8.8, phase: 3.7 },
    { x: -12, z: -233, width: 90, depth: 11, height: 7.6, phase: 5.2 },
    { x: 55, z: -237, width: 36, depth: 8, height: 5.7, phase: 1.4 },
  ].map(island => {
    const geometry = islandGeometry(island.width, island.depth, island.height, island.phase, .38, true);
    geometry.translate(island.x, -8, island.z);
    return geometry;
  });
  const farGeometry = mergeGeometries(farParts)!;
  for (const part of farParts) part.dispose();
  const horizon = new THREE.Mesh(farGeometry, landMaterial);
  horizon.name = "far-horizon-archipelago"; horizon.userData.kind = "far-islands"; horizon.userData.islandCount = 3;
  group.add(horizon);

  const reefMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .94 });
  for (let i = 0; i < coastalReefs.length; i++) {
    const reef = coastalReefs[i];
    const cluster = new THREE.Group();
    cluster.name = `sea-reef-${i + 1}`;
    cluster.position.set(reef.x, -8, reef.z);
    group.add(cluster);
    const shapes = i === 0
      ? [[0, 0, 3.9, 2.9, 1.9, .2], [-2.1, .4, 2.5, 2.2, .95, -.4], [1.9, -.9, 2.7, 2.3, .58, .8], [.8, 1.5, 1.8, 1.5, .18, -.3]]
      : [[0, 0, 4.3, 2.8, 1.45, .3], [2.2, .35, 2.4, 1.8, .6, -.6], [-2.3, -.55, 2.2, 1.7, .3, .4]];
    const parts = shapes.map(([x, z, width, depth, height, rotation], index) => {
      const geometry = weatheredRock(width, depth, height, i * 7 + index + 1);
      geometry.rotateY(rotation);
      geometry.translate(x, 0, z);
      return geometry;
    });
    const geometry = mergeGeometries(parts)!;
    for (const part of parts) part.dispose();
    const mesh = new THREE.Mesh(geometry, reefMaterial);
    mesh.name = `sea-reef-${i + 1}-weathered-stone`;
    mesh.userData.kind = "submerged-reef";
    cluster.add(mesh);
  }

  // Birds have one owner: the calendar bird controller. The former three
  // permanently hovering gulls bypassed its single-visitor/weather rules.
  return { group, update(_t: number, _reducedMotion: boolean) {} };
}
