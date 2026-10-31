import * as THREE from "three";
import { createBouquetDetails } from "./bouquet-details";

/** Wide, overlapping petals around a flower axis, with a soft rounded shoulder. */
function rosePetalGeometry(variant: number) {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const rows = 12, cols = 10, arc = [.98, .82, .68][variant];
  const rootRadius = [.10, .20, .29][variant];
  for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
    const v = row / rows, u = col / cols * 2 - 1;
    // The broad tip stays rounded; it never collapses into a sharp radial point.
    const shoulder = v * (1 - .14 * u * u - .025 * Math.exp(-u * u * 13));
    const radius = THREE.MathUtils.lerp(rootRadius, 1, Math.pow(shoulder, .86));
    const angle = u * arc * (.10 + .90 * Math.sin(v * Math.PI / 2));
    const lip = Math.pow(THREE.MathUtils.smoothstep(v, .76, 1), 2);
    const fold = .035 * Math.sin(u * 4.2 + variant) * Math.sin(v * Math.PI);
    positions.push(
      radius * Math.sin(angle),
      Math.pow(shoulder, .72) - .16 * lip * (1 - .28 * u * u) + fold
        + .028 * Math.pow(Math.abs(u), 3) * Math.sin(Math.PI * v),
      radius * Math.cos(angle) + .045 * lip,
    );
    const shade = .68 + .28 * v - .055 * Math.pow(Math.abs(u), 3) + .018 * Math.sin(u * 5 + v * 7);
    colors.push(shade, shade * (.90 + .08 * v), shade * (.91 + .07 * v));
    if (row < rows && col < cols) {
      const a = row * (cols + 1) + col, b = a + cols + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
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
  const crowns: THREE.Matrix4[] = [], crownColors: THREE.Color[] = [];
  const head = new THREE.Object3D(), petal = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion();
  heads.forEach(([x,y,z], flower) => {
    head.position.set(x,y,z);
    // In the existing reclined bouquet this axis faces upward and into the room.
    head.rotation.set(2 + (random() - .5) * .18, (random() - .5) * .22, (random() - .5) * .28);
    head.scale.setScalar(.81 + random() * .12); head.updateMatrix();
    crowns.push(head.matrix.clone()); crownColors.push(new THREE.Color(palette[flower]).multiplyScalar(.76));
    const phase = random() * Math.PI * 2;
    for (let p = 0; p < 33; p++) {
      const variant = p < 12 ? 0 : p < 26 ? 1 : 2;
      const f = variant === 0 ? p / 11 : variant === 1 ? (p - 12) / 13 : (p - 26) / 6;
      const radius = variant === 0 ? (p < 3 ? .007 + p * .0045 : .018 + f * .034) : variant === 1 ? .057 + f * .061 : .124 + f * .031;
      const height = variant === 0 ? .142 - f * .025 : variant === 1 ? .115 - f * .031 : .083 - f * .022;
      const angle = phase + (variant === 2 ? (p - 26) * Math.PI * 2 / 7 : p * 2.399963) + (random() - .5) * .16;
      const radialOffset = p < 3 ? -.006 : .002;
      petal.position.set(radialOffset * Math.sin(angle), .006 * Math.sin(p * 2.1), radialOffset * Math.cos(angle));
      petal.quaternion.setFromEuler(new THREE.Euler((variant === 2 ? .12 : variant === 1 ? .04 : -.1) + (random() - .5) * .2, 0, (random() - .5) * .16));
      turn.setFromAxisAngle(up, angle); petal.quaternion.premultiply(turn);
      petal.scale.set(radius * (.90 + random() * .20), height * (.95 + random() * .10), radius * (.94 + random() * .12)); petal.updateMatrix();
      const batch = batches[variant]; batch.matrices.push(head.matrix.clone().multiply(petal.matrix));
      batch.colors.push(new THREE.Color(palette[flower]).multiplyScalar(.68 + p / 32 * .30 + random() * .035));
    }
  });
  const material = new THREE.MeshStandardMaterial({
    color: "#fff5f0", vertexColors: true, roughness: .80, metalness: 0, side: THREE.DoubleSide,
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
  // Compressed inner petals form an opaque dark receptacle below the open
  // layers. This keeps stems and the green calyx from showing through a bloom.
  const crown = new THREE.LatheGeometry([
    [0,.004],[.012,.002],[.04,.009],[.085,.02],[.125,.034],
    [.141,.042],[.13,.056],[.095,.071],[.045,.086],[0,.09],
  ].map(([r,y])=>new THREE.Vector2(r,y)),24);
  const shade = new Float32Array(crown.attributes.position.count * 3); shade.fill(.78);
  crown.setAttribute("color",new THREE.BufferAttribute(shade,3));
  const receptacles = new THREE.InstancedMesh(crown,material,crowns.length);
  receptacles.name = "rose-shadowed-receptacles";
  crowns.forEach((matrix,i)=>{receptacles.setMatrixAt(i,matrix);receptacles.setColorAt(i,crownColors[i]);});
  receptacles.castShadow = receptacles.receiveShadow = true;
  receptacles.computeBoundingBox(); receptacles.computeBoundingSphere(); bouquet.add(receptacles);
  bouquet.add(createBouquetDetails(heads));
  bouquet.userData = { petalCount: heads.length * 33, roseCount: heads.length, petalStyle: "rounded-overlapping-cupped-spiral" };
  return bouquet;
}
