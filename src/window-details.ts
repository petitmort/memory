import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {dimensions as D} from './dimensions';

/** Static B1 furnishings. The scene owns their geometry/material disposal. */
export const windowDetailsLayout = {
  plant: {x: -.92, z: -D.room.depth / 2 + .025, base: D.window.sill},
  coaster: {radius: .0575, thickness: .003},
} as const;

function colorize(geometry: THREE.BufferGeometry, color: THREE.Color, variation = 0) {
  const position = geometry.getAttribute('position'), colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    const shade = 1 + variation * Math.sin(x * 413 + y * 697 + z * 937);
    color.clone().multiplyScalar(shade).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function batch(parts: THREE.BufferGeometry[], name: string, roughness: number) {
  const flat = parts.map(part => {
    const geometry = part.index ? part.toNonIndexed() : part;
    geometry.deleteAttribute('uv');
    return geometry;
  });
  const geometry = mergeGeometries(flat);
  for (const part of new Set([...parts, ...flat])) part.dispose();
  if (!geometry) throw new Error('Unable to assemble static window detail');
  geometry.computeBoundingSphere();
  const material = new THREE.MeshStandardMaterial({vertexColors: true, roughness});
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** A narrow, rolled leaf with a pale underside and a closed, curved cross-section. */
function rosemaryLeaf(length: number, width: number, shade: number) {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const rows = 6, columns = 2;
  for (const side of [1, -1]) for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    const taper = .055 + .945 * Math.pow(Math.sin(t * Math.PI), .55);
    for (let column = 0; column <= columns; column++) {
      const across = column - 1;
      positions.push(across * width * taper / 2, length * t,
        length * .09 * t * t + width * .17 * across * across + side * .00009 * taper);
      const base = new THREE.Color(side === 1 ? '#637b54' : '#a0ac8b');
      base.multiplyScalar(shade * (.9 + .1 * (1 - Math.abs(across))));
      base.toArray(colors, colors.length);
    }
  }
  const layer = (rows + 1) * (columns + 1);
  for (let row = 0; row < rows; row++) for (let col = 0; col < columns; col++) {
    const a = row * (columns + 1) + col, b = a + columns + 1;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
    indices.push(a + layer, b + layer, a + 1 + layer, a + 1 + layer, b + layer, b + 1 + layer);
  }
  const perimeter = [0, 1, 2];
  for (let row = 1; row <= rows; row++) perimeter.push(row * 3 + 2);
  perimeter.push(rows * 3 + 1, rows * 3);
  for (let row = rows - 1; row > 0; row--) perimeter.push(row * 3);
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    indices.push(a, a + layer, b, b, a + layer, b + layer);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Small rooted rosemary: three opaque batches, no textures, updates or extra lights. */
export function createWindowPlant() {
  const group = new THREE.Group();
  group.name = 'window-rosemary';
  const layout = windowDetailsLayout.plant;
  group.position.set(layout.x, layout.base, layout.z);
  const ceramic: THREE.BufferGeometry[] = [], earthy: THREE.BufferGeometry[] = [], leaves: THREE.BufferGeometry[] = [];
  const lathe = (points: [number, number][], color: string) =>
    colorize(new THREE.LatheGeometry(points.map(([r, y]) => new THREE.Vector2(r, y)), 48), new THREE.Color(color), .025);
  ceramic.push(lathe([[0, 0], [.041, 0], [.045, .002], [.045, .004], [.043, .006], [.033, .006], [.030, .003], [0, .003]], '#bc9e7c'));
  ceramic.push(lathe([[0, .003], [.027, .003], [.031, .008], [.040, .059], [.041, .062], [.040, .065],
    [.038, .065], [.0365, .060], [.035, .050], [.027, .011], [0, .011]], '#c5ac8b'));
  group.add(batch(ceramic, 'rosemary-terracotta-pot-and-saucer', .94));

  let seed = 61873;
  const random = () => {seed = Math.imul(seed, 1664525) + 1013904223 | 0; return (seed >>> 0) / 4294967296;};
  const soil = new THREE.CylinderGeometry(.036, .035, .002, 40);
  soil.translate(0, .056, 0);
  earthy.push(colorize(soil, new THREE.Color('#514234'), .15));
  for (let i = 0; i < 24; i++) {
    const angle = random() * Math.PI * 2, radius = .032 * Math.sqrt(random());
    const grain = new THREE.IcosahedronGeometry(.0007 + random() * .0007);
    grain.scale(1, .45, .8); grain.translate(Math.cos(angle) * radius, .057, Math.sin(angle) * radius);
    earthy.push(colorize(grain, new THREE.Color(i % 3 === 0 ? '#9d8b6a' : '#6f5b40')));
  }
  const up = new THREE.Vector3(0, 1, 0);
  for (let sprig = 0; sprig < 9; sprig++) {
    const angle = sprig * 2.39996 + .23, spread = sprig === 0 ? .011 : .026 + random() * .025;
    const height = sprig === 0 ? .151 : .092 + random() * .050;
    const base = new THREE.Vector3(Math.cos(angle) * .009, .056, Math.sin(angle) * .009);
    const end = new THREE.Vector3(Math.cos(angle) * spread, .056 + height, Math.sin(angle) * spread);
    const curve = new THREE.CatmullRomCurve3([base,
      base.clone().lerp(end, .36).add(new THREE.Vector3(Math.sin(angle) * .005, 0, Math.cos(angle) * .004)),
      base.clone().lerp(end, .73), end]);
    const stem = new THREE.TubeGeometry(curve, 12, .0007, 5, false);
    earthy.push(colorize(stem, new THREE.Color(sprig % 3 === 0 ? '#776b45' : '#687346'), .09));
    const nodes = 8 + Math.floor(random() * 3);
    for (let node = 0; node < nodes; node++) {
      const t = .15 + node / (nodes - 1) * .82, point = curve.getPoint(t), tangent = curve.getTangent(t);
      const turn = angle + node * Math.PI / 2 + .12 * Math.sin(node + sprig);
      for (const side of [-1, 1]) {
        const direction = new THREE.Vector3(Math.cos(turn) * side, .45 + .6 * t, Math.sin(turn) * side).normalize();
        direction.addScaledVector(tangent, .18).normalize();
        const leaf = rosemaryLeaf((.019 + random() * .008) * (1 - .32 * t), .0027 + random() * .001, .86 + random() * .22);
        const rotation = new THREE.Quaternion().setFromUnitVectors(up, direction);
        const twist = new THREE.Quaternion().setFromAxisAngle(up, turn * .37);
        rotation.multiply(twist);
        leaf.applyQuaternion(rotation); leaf.translate(point.x, point.y, point.z);
        leaves.push(leaf);
      }
    }
  }
  group.add(batch(earthy, 'rosemary-soil-and-branches', .96));
  group.add(batch(leaves, 'rosemary-curved-leaves', .86));
  return group;
}

/** 3mm cork, with beveled edges and small non-repeating granules in vertex colors. */
export function createCorkCoaster() {
  const {radius, thickness} = windowDetailsLayout.coaster;
  const segments = 96, rings = 18, positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const top = new THREE.Color('#c8a577'), dark = new THREE.Color('#9c7953'), light = new THREE.Color('#d5ba92');
  const profiles: [number, number][] = [[0, thickness], [radius - .0007, thickness], [radius, thickness - .0006], [radius, .0006], [radius - .0007, 0], [0, 0]];
  const layers: [number, number][] = [];
  for (let ring = 0; ring <= rings; ring++) layers.push([(radius - .0007) * ring / rings, thickness]);
  layers.push(...profiles.slice(2));
  for (let row = 0; row < layers.length; row++) for (let segment = 0; segment <= segments; segment++) {
    const angle = segment / segments * Math.PI * 2, [r, y] = layers[row];
    const x = Math.cos(angle) * r, z = Math.sin(angle) * r;
    positions.push(x, y, z);
    const grain = Math.sin(x * 13287 + z * 8971) * Math.sin(x * 7187 - z * 16741);
    const base = row <= rings ? top.clone().lerp(grain < 0 ? dark : light, Math.abs(grain) * .52) : dark.clone();
    base.toArray(colors, colors.length);
    if (row < layers.length - 1 && segment < segments) {
      const a = row * (segments + 1) + segment, b = a + segments + 1;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const coaster = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({vertexColors: true, roughness: .98}));
  coaster.name = 'thin-cork-coaster'; coaster.castShadow = coaster.receiveShadow = true;
  return coaster;
}
