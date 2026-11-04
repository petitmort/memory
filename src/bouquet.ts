import * as THREE from "three";
import { createBouquetDetails } from "./bouquet-details";

/** A closed, thin petal shell: upright cup walls, an inward curl or rolled lip. */
function rosePetalGeometry(variant: number) {
  const surface = new THREE.BufferGeometry();
  const points: number[] = [], shades: number[] = [], faces: number[] = [];
  const rows = 8, cols = 10, arc = [.91, .83, .78][variant];
  const rootRadius = [.16, .19, .23][variant];
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const v = row / rows, u = col / cols * 2 - 1;
    const shoulder = v * (1 - .16 * u * u);
    const lip = THREE.MathUtils.smoothstep(v, .68, 1);
    // The middle of the petal rises into a vertical wall. Only its shoulder
    // curls; spreading every height radially would flatten it into a disc.
    const radius = rootRadius + (.88 - rootRadius) * Math.pow(Math.sin(shoulder * Math.PI / 2), 1.45)
      + [-.23, -.045, .14][variant] * lip * lip;
    const angle = u * arc * (.24 + .76 * Math.sin(v * Math.PI / 2));
    const fold = .028 * Math.sin(u * 4.8 + variant * .9) * Math.sin(v * Math.PI);
    points.push(
      radius * Math.sin(angle),
      shoulder + [ .035, -.025, -.12 ][variant] * lip * lip + fold
        + .022 * Math.pow(Math.abs(u), 3) * Math.sin(Math.PI * v),
      radius * Math.cos(angle),
    );
    shades.push(.82 + .14 * v - .025 * Math.abs(u) + .018 * Math.sin(u * 4 + v * 6));
    if (row < rows && col < cols) {
      const a = row * (cols + 1) + col, b = a + cols + 1;
      faces.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  surface.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
  surface.setIndex(faces); surface.computeVertexNormals();
  const p = surface.attributes.position, normal = surface.attributes.normal;
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  // Front, back and perimeter are real surfaces, sharing one batched material.
  // The small thickness reads at an edge without inflating the whole bloom.
  for (const side of [1, -1]) for (let i = 0; i < p.count; i++) {
    positions.push(p.getX(i) + normal.getX(i) * .003 * side,
      p.getY(i) + normal.getY(i) * .003 * side,
      p.getZ(i) + normal.getZ(i) * .003 * side);
    const shade = shades[i] * (side === 1 ? 1 : .96);
    colors.push(shade, shade * .97, shade * .98);
  }
  for (let i = 0; i < faces.length; i += 3) {
    indices.push(faces[i], faces[i + 1], faces[i + 2],
      faces[i + 2] + p.count, faces[i + 1] + p.count, faces[i] + p.count);
  }
  const edge: number[] = [];
  for (let col = 0; col <= cols; col++) edge.push(col);
  for (let row = 1; row <= rows; row++) edge.push(row * (cols + 1) + cols);
  for (let col = cols - 1; col >= 0; col--) edge.push(rows * (cols + 1) + col);
  for (let row = rows - 1; row > 0; row--) edge.push(row * (cols + 1));
  for (let i = 0; i < edge.length; i++) {
    const a = edge[i], b = edge[(i + 1) % edge.length];
    indices.push(a, a + p.count, b, b, a + p.count, b + p.count);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  surface.dispose();
  return geometry;
}

/** A hand-tied crimson bouquet; static shared batches reuse the scene lifecycle. */
export function createBouquet() {
  const bouquet = new THREE.Group(); bouquet.name = "bouquet";
  let seed = 129;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  // Keep the original central upper rose as the discoverable interaction anchor.
  const heads = [
    [-.23,.83,.05], [.06,.95,-.10], [.27,.78,.02],
    [-.07,.73,.24], [.16,.77,.24], [-.28,.67,.23],
    [.02,.88,-.25], [-.20,.99,-.18], [.29,.96,-.18],
  ] as const;
  const palette = ["#8d0a20", "#930a23", "#9c1129", "#960e25", "#870b20", "#900a22", "#9a0e24", "#8c0a21", "#961027"];
  const batches = Array.from({length: 3}, () => ({matrices: [] as THREE.Matrix4[], colors: [] as THREE.Color[]}));
  const crowns: THREE.Matrix4[] = [], crownColors: THREE.Color[] = [], flowerAxes: THREE.Vector3[] = [];
  const head = new THREE.Object3D(), petal = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
  heads.forEach(([x,y,z], flower) => {
    head.position.set(x,y,z);
    // In the existing reclined bouquet this axis faces upward and into the room.
    head.rotation.set(2 + z * .55 + (random() - .5) * .16, x * .5 + (random() - .5) * .15, -x * .9 + (random() - .5) * .14);
    head.scale.setScalar(.81 + random() * .12); head.updateMatrix();
    flowerAxes.push(up.clone().applyQuaternion(head.quaternion));
    crowns.push(head.matrix.clone()); crownColors.push(new THREE.Color(palette[flower]).multiplyScalar(.76));
    const phase = random() * Math.PI * 2;
    for (let p = 0; p < 33; p++) {
      const variant = p < 12 ? 0 : p < 26 ? 1 : 2;
      const f = variant === 0 ? p / 11 : variant === 1 ? (p - 12) / 13 : (p - 26) / 6;
      const radius = variant === 0 ? (p < 3 ? .007 + p * .0045 : .018 + f * .034) : variant === 1 ? .057 + f * .061 : .124 + f * .031;
      const height = variant === 0 ? .166 - f * .006 : variant === 1 ? .177 - f * .022 : .177 + f * .008;
      const angle = phase + (variant === 2 ? (p - 26) * Math.PI * 2 / 7 : p * 2.399963) + (random() - .5) * .16;
      const radialOffset = variant === 0 ? -.003 : variant === 1 ? .008 : .015;
      const rootHeight = variant === 0 ? .024 : variant === 1 ? -.004 : -.033;
      petal.position.set(radialOffset * Math.sin(angle), rootHeight + .005 * Math.sin(p * 2.1), radialOffset * Math.cos(angle));
      petal.quaternion.setFromEuler(new THREE.Euler((variant === 2 ? .02 : variant === 1 ? -.015 : -.06) + (random() - .5) * .14, 0, (random() - .5) * .16));
      turn.setFromAxisAngle(up, angle); petal.quaternion.premultiply(turn);
      petal.scale.set(radius * (.90 + random() * .20), height * (.95 + random() * .10), radius * (.94 + random() * .12)); petal.updateMatrix();
      const batch = batches[variant]; batch.matrices.push(head.matrix.clone().multiply(petal.matrix));
      batch.colors.push(new THREE.Color(palette[flower]).multiplyScalar(.80 + p / 32 * .17 + random() * .035));
    }
  });
  const material = new THREE.MeshStandardMaterial({
    color: "#fff5f0", vertexColors: true, roughness: .67, metalness: 0, side: THREE.FrontSide,
  });
  batches.forEach((batch, variant) => {
    const mesh = new THREE.InstancedMesh(rosePetalGeometry(variant), material, batch.matrices.length);
    mesh.name = ["rose-coiled-inner-petals", "rose-cupped-middle-petals", "rose-rolled-outer-petals"][variant];
    batch.matrices.forEach((matrix, i) => {mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, batch.colors[i]);});
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = mesh.receiveShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere();
    bouquet.add(mesh);
  });
  // A small, low receptacle seals the roots below the cup walls.
  // It must not reach above the outer petals or become a broad visible cap.
  const crown = new THREE.LatheGeometry([
    [0,-.039],[.026,-.035],[.05,-.02],[.075,.008],
    [.085,.026],[.070,.043],[.035,.054],[0,.054],
  ].map(([r,y])=>new THREE.Vector2(r,y)),24);
  const shade = new Float32Array(crown.attributes.position.count * 3); shade.fill(.78);
  crown.setAttribute("color",new THREE.BufferAttribute(shade,3));
  const receptacles = new THREE.InstancedMesh(crown,material,crowns.length);
  receptacles.name = "rose-shadowed-receptacles";
  crowns.forEach((matrix,i)=>{receptacles.setMatrixAt(i,matrix);receptacles.setColorAt(i,crownColors[i]);});
  receptacles.castShadow = receptacles.receiveShadow = true;
  receptacles.computeBoundingBox(); receptacles.computeBoundingSphere(); bouquet.add(receptacles);
  bouquet.add(createBouquetDetails(heads, flowerAxes));
  bouquet.userData = { petalCount: heads.length * 33, roseCount: heads.length, petalStyle: "deep-cup-closed-petal-shells" };
  return bouquet;
}
