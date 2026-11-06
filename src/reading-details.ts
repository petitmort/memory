import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {consoleLayout, consolePoint, consoleReadingLayout} from './interior-layout';

function outline(width: number, depth: number, radius: number) {
  const points: THREE.Vector2[] = [];
  const corners = [[width / 2 - radius, depth / 2 - radius], [-width / 2 + radius, depth / 2 - radius],
    [-width / 2 + radius, -depth / 2 + radius], [width / 2 - radius, -depth / 2 + radius]];
  for (let corner = 0; corner < 4; corner++) for (let step = 0; step <= 4; step++) {
    const angle = (corner + step / 4) * Math.PI / 2;
    points.push(new THREE.Vector2(corners[corner][0] + Math.cos(angle) * radius, corners[corner][1] + Math.sin(angle) * radius));
  }
  return points;
}

function cover(width: number, depth: number) {
  const bevel = .00018;
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(outline(width - bevel * 2, depth - bevel * 2, .002)), {
    depth: .0013 - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2,
  });
  geometry.rotateX(-Math.PI / 2);geometry.translate(0, bevel, 0);
  return geometry;
}

function tint(geometry: THREE.BufferGeometry, color: string) {
  const positions = geometry.getAttribute('position'), colors = new Float32Array(positions.count * 3), base = new THREE.Color(color);
  for (let i = 0; i < positions.count; i++) {
    const shade = .99 + .01 * Math.sin(positions.getX(i) * 731 + positions.getZ(i) * 563);
    base.clone().multiplyScalar(shade).toArray(colors, i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** A closed page block: rounded corners and subtle horizontal paper layers. */
function pages(width: number, height: number, depth: number) {
  const ring = outline(width, depth, .0018), count = ring.length, rows = 20;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const paper = new THREE.Color(row % 3 === 1 ? '#cbbb9c' : '#e2d7bf');
    for (const p of ring) {positions.push(p.x, height * row / rows, p.y);paper.toArray(colors, colors.length);}
    if (row < rows) for (let i = 0; i < count; i++) {
      const a = row * count + i, b = row * count + (i + 1) % count;
      indices.push(a, a + count, b, b, a + count, b + count);
    }
  }
  for (const top of [false, true]) {
    const start = positions.length / 3, paper = new THREE.Color('#e9dfc9'), y = top ? height : 0;
    positions.push(0, y, 0);paper.toArray(colors, colors.length);
    for (const p of ring) {positions.push(p.x, y, p.y);paper.toArray(colors, colors.length);}
    for (let i = 0; i < count; i++) {
      const a = start + 1 + i, b = start + 1 + (i + 1) % count;
      indices.push(...(top ? [start, b, a] : [start, a, b]));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

/** A thin closed ribbon emerges between pages, then bends down under gravity. */
function bookmark(height: number, depth: number) {
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.018, height - .0032, depth / 2 - .006),
    new THREE.Vector3(-.018, height - .0035, depth / 2 + .001),
    new THREE.Vector3(-.0177, height - .006, depth / 2 + .009),
    new THREE.Vector3(-.017, height - .013, depth / 2 + .016),
  ]);
  const rows = 24, columns = 2, layer = (rows + 1) * (columns + 1);
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const side of [1, -1]) for (let row = 0; row <= rows; row++) {
    const t = row / rows, point = path.getPoint(t);
    for (let col = 0; col <= columns; col++) {
      const across = col / columns - .5;
      positions.push(point.x + across * .007, point.y + side * .000125 + Math.sin(t * Math.PI) * across * .0004, point.z);
      uvs.push(col / columns, t * 2);
    }
    if (side === 1 && row < rows) for (let col = 0; col < columns; col++) {
      const a = row * (columns + 1) + col, b = a + columns + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
      indices.push(a + layer, a + 1 + layer, b + layer, a + 1 + layer, b + 1 + layer, b + layer);
    }
  }
  const perimeter = [0, 1, 2];
  for (let row = 1; row <= rows; row++) perimeter.push(row * 3 + 2);
  perimeter.push(rows * 3 + 1, rows * 3);
  for (let row = rows - 1; row > 0; row--) perimeter.push(row * 3);
  for (let i = 0; i < perimeter.length; i++) {
    const a = perimeter[i], b = perimeter[(i + 1) % perimeter.length];
    indices.push(a, b, a + layer, b, b + layer, a + layer);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);geometry.computeVertexNormals();
  return geometry;
}

/** Static B2-A accents; existing scene ownership disposes the shared fabric once. */
export function createReadingDetails(fabric: THREE.Texture) {
  const group = new THREE.Group();group.name = 'lamp-side-reading-books';
  group.position.copy(consolePoint(consoleReadingLayout.booksX, consoleReadingLayout.booksZ, 0));
  group.rotation.y = consoleLayout.rotation;
  const covers: THREE.BufferGeometry[] = [], paper: THREE.BufferGeometry[] = [];
  const upper = new THREE.Matrix4().compose(new THREE.Vector3(.0015, .013, -.001),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 90), new THREE.Vector3(1, 1, 1));
  for (const [width, depth, color, transform] of [
    [.15, .105, '#c3b08e', new THREE.Matrix4()], [.146, .102, '#839075', upper],
  ] as const) {
    for (const y of [0, .013 - .0013]) {
      const geometry = cover(width, depth);geometry.translate(0, y, 0);
      covers.push(tint(geometry, color).applyMatrix4(transform));
    }
    const spine = new RoundedBoxGeometry(width - .0006, .0128, .0018, 2, .0006);
    spine.translate(0, .0065, -depth / 2 + .0009);
    covers.push(tint(spine, color).applyMatrix4(transform));
    const block = pages(width - .004, .013 - .0026, depth - .004);
    block.translate(0, .0013, .0007);paper.push(block.applyMatrix4(transform));
  }
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, name: string) => {
    const mesh = new THREE.Mesh(geometry, material);mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;group.add(mesh);
  };
  for (const [parts, name, roughness] of [[covers, 'reading-book-cloth-covers', .94], [paper, 'reading-book-page-blocks', .97]] as const) {
    const flat = parts.map(part => {
      const geometry = part.index ? part.toNonIndexed() : part;geometry.deleteAttribute('uv');return geometry;
    });
    const geometry = mergeGeometries(flat);
    for (const part of new Set([...parts, ...flat])) part.dispose();
    if (!geometry) throw new Error('Unable to assemble reading details');
    add(geometry, new THREE.MeshStandardMaterial({vertexColors: true, roughness}), name);
  }
  add(bookmark(.013, .102).applyMatrix4(upper), new THREE.MeshStandardMaterial({
    color: '#b18a72', map: fabric, bumpMap: fabric, bumpScale: .00012, roughness: 1,
  }), 'reading-linen-bookmark');
  return group;
}
