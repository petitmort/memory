import * as THREE from "three";

/** A small hand-tied garden bouquet. All petals, leaves and stems share draw calls. */
export function createBouquet() {
  const bouquet = new THREE.Group();
  const dummy = new THREE.Object3D();
  const petals: THREE.Matrix4[] = [],
    colors: THREE.Color[] = [];
  const leaves: THREE.Matrix4[] = [],
    stems: THREE.Matrix4[] = [];
  const centers: THREE.Matrix4[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const temp = new THREE.Object3D();
  let seed = 129;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

  // Four asymmetrical, spoon-shaped petals. Each ends in a rounded, rolled lip.
  // These are individual surfaces, not sectors of a circular bowl.
  function petalGeometry(variant: number) {
    const geometry = new THREE.BufferGeometry();
    const positions: number[] = [],
      indices: number[] = [],
      vertexColors: number[] = [];
    const across = 16,
      length = 18;
    for (let row = 0; row <= length; row++) {
      const v = row / length;
      for (let col = 0; col <= across; col++) {
        const u = (col / across) * 2 - 1;
        const end = 1 - 0.19 * u * u + 0.025 * u * Math.sin(variant + 1);
        const along = v * end;
        const width = 0.103 * Math.pow(Math.sin(Math.PI * along), 0.63);
        const sideCurl =
          Math.pow(Math.abs(u), 3) * 0.021 * Math.sin(Math.PI * along);
        const lip = Math.pow(Math.max(0, (along - 0.72) / 0.28), 2);
        const wrinkle =
          0.0025 * Math.sin(u * 6 + variant * 1.7) * Math.sin(Math.PI * along);
        positions.push(
          u * width + 0.012 * Math.sin(variant * 2) * along * along,
          0.13 * Math.sin(along * 1.55) -
            0.068 * Math.pow(along, 4) +
            sideCurl -
            0.025 * lip +
            wrinkle,
          0.009 +
            0.17 * along +
            0.016 * lip +
            0.008 * u * Math.sin(variant + 0.4) * along,
        );
        const shade = 0.65 + 0.32 * along - Math.abs(u) * 0.04;
        vertexColors.push(
          shade,
          shade * (0.83 + 0.15 * along),
          shade * (0.82 + 0.17 * along),
        );
        if (row < length && col < across) {
          const a = row * (across + 1) + col,
            b = a + across + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(vertexColors, 3),
    );
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  const petalMaterial = new THREE.MeshStandardMaterial({
    color: "#fff5f0",
    vertexColors: true,
    roughness: 0.73,
    side: THREE.DoubleSide,
  });

  function segment(from: THREE.Vector3, to: THREE.Vector3, radius: number) {
    dummy.position.copy(from).add(to).multiplyScalar(0.5);
    dummy.quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize());
    dummy.scale.set(radius, from.distanceTo(to), radius);
    dummy.updateMatrix();
    stems.push(dummy.matrix.clone());
  }
  const palette = [
    "#a8344c",
    "#c44d61",
    "#b83c51",
    "#d7757e",
    "#a9354b",
    "#bd495e",
    "#cf6672",
  ];
  const heads = [
    [-0.23, 0.83, 0.05],
    [0.06, 0.95, -0.1],
    [0.27, 0.78, 0.02],
    [-0.07, 0.73, 0.24],
    [0.16, 0.77, 0.24],
    [-0.28, 0.67, 0.23],
    [0.02, 0.88, -0.25],
  ];
  heads.forEach(([x, y, z], flower) => {
    const tip = new THREE.Vector3(x, y, z);
    const root = new THREE.Vector3(
      (random() - 0.5) * 0.07,
      -0.18,
      (random() - 0.5) * 0.06,
    );
    segment(root, tip, 0.009);
    temp.position.copy(tip);
    temp.rotation.set(
      2.0 + (random() - 0.5) * 0.35,
      random() * 0.8 - 0.4,
      (random() - 0.5) * 0.5,
    );
    temp.scale.setScalar(0.86 + random() * 0.22);
    temp.updateMatrix();
    // A continuous, irregular spiral: no repeated rings or equal-height tiers.
    const count = 34 + (flower % 4);
    const phase = random() * Math.PI * 2;
    for (let p = 0; p < count; p++) {
      const t = p / (count - 1),
        spread = Math.pow(t, 0.8);
      const angle = phase + p * 2.399963 + (random() - 0.5) * 0.34;
      const size = 0.18 + spread * 0.92;
      dummy.position.set(
        Math.sin(angle) * 0.012 * spread,
        0.073 * (1 - spread) + (random() - 0.5) * 0.017,
        Math.cos(angle) * 0.012 * spread,
      );
      // Rotate the petal around the bud after giving it its own opening angle.
      dummy.quaternion.setFromEuler(
        new THREE.Euler(
          -0.95 * (1 - spread) + 0.18 * spread + (random() - 0.5) * 0.22,
          0,
          (random() - 0.5) * 0.25,
        ),
      );
      dummy.quaternion.premultiply(
        new THREE.Quaternion().setFromAxisAngle(up, angle),
      );
      dummy.scale.set(size * (0.82 + random() * 0.3), 0.64 + size * 0.6, size);
      dummy.updateMatrix();
      petals.push(temp.matrix.clone().multiply(dummy.matrix));
      const color = new THREE.Color(palette[flower]);
      color.multiplyScalar(0.82 + spread * 0.15 + random() * 0.06);
      colors.push(color);
    }
    // Pointed leaves branch off the stem, below the blossom cluster.
    for (let l = 0; l < 3; l++) {
      const height = 0.32 + l * 0.14,
        side = l % 2 ? 1 : -1;
      dummy.position.set(
        (x * height) / y + side * 0.065,
        height,
        (z * height) / y,
      );
      dummy.rotation.set(0.5 + random() * 0.9, random() * 6, side * 0.8);
      dummy.scale.set(0.045, 0.13, 0.015);
      dummy.updateMatrix();
      leaves.push(dummy.matrix.clone());
    }
  });
  // Rounded eucalyptus sprigs give the bouquet an irregular silhouette.
  for (let sprig = 0; sprig < 4; sprig++) {
    const angle = sprig * 2.4,
      tip = new THREE.Vector3(
        Math.cos(angle) * 0.44,
        0.66 + random() * 0.3,
        Math.sin(angle) * 0.38,
      );
    segment(new THREE.Vector3(0, 0.12, 0), tip, 0.005);
    for (let l = 0; l < 4; l++) {
      const f = 0.4 + l * 0.14;
      for (const side of [-1, 1]) {
        dummy.position.copy(tip).multiplyScalar(f);
        dummy.position.x += side * 0.045;
        dummy.rotation.set(
          0.7 + random() * 0.4,
          angle + side * 0.7,
          side * 0.5,
        );
        dummy.scale.set(0.043, 0.062, 0.012);
        dummy.updateMatrix();
        leaves.push(dummy.matrix.clone());
      }
    }
  }
  // Airy ivory buds on fine branching stems.
  for (let i = 0; i < 16; i++) {
    const a = i * 2.399,
      tip = new THREE.Vector3(
        Math.cos(a) * (0.3 + random() * 0.12),
        0.63 + random() * 0.4,
        Math.sin(a) * 0.32,
      );
    segment(tip.clone().multiplyScalar(0.65), tip, 0.0028);
    dummy.position.copy(tip);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(0.016 + random() * 0.008);
    dummy.updateMatrix();
    centers.push(dummy.matrix.clone());
  }
  function instances(
    g: THREE.BufferGeometry,
    material: THREE.Material,
    matrices: THREE.Matrix4[],
    cast = true,
  ) {
    const mesh = new THREE.InstancedMesh(g, material, matrices.length);
    matrices.forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    bouquet.add(mesh);
    return mesh;
  }
  for (let variant = 0; variant < 4; variant++) {
    const matrices = petals.filter((_, i) => i % 4 === variant);
    const shades = colors.filter((_, i) => i % 4 === variant);
    const blooms = instances(petalGeometry(variant), petalMaterial, matrices);
    shades.forEach((color, i) => blooms.setColorAt(i, color));
  }
  const leafGeo = new THREE.SphereGeometry(1, 10, 6);
  const leafMat = new THREE.MeshStandardMaterial({
    color: "#8a9b83",
    roughness: 0.95,
  });
  instances(leafGeo, leafMat, leaves);
  instances(
    new THREE.CylinderGeometry(0.7, 1, 1, 6),
    new THREE.MeshStandardMaterial({ color: "#6f8062", roughness: 1 }),
    stems,
  );
  instances(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshStandardMaterial({ color: "#fcf0db", roughness: 0.9 }),
    centers,
  );

  // Muted silk binding, two looped folds and softly curling ribbon tails.
  const ribbonMat = new THREE.MeshStandardMaterial({
    color: "#c89b8d",
    roughness: 0.88,
    side: THREE.DoubleSide,
  });
  const binding = new THREE.Mesh(
    new THREE.CylinderGeometry(0.068, 0.063, 0.12, 20, 1, true),
    ribbonMat,
  );
  binding.position.y = 0.17;
  bouquet.add(binding);
  function ribbon(points: THREE.Vector3[], width: number) {
    const curve = new THREE.CatmullRomCurve3(points),
      p: number[] = [],
      ids: number[] = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28,
        center = curve.getPoint(t),
        tangent = curve.getTangent(t);
      const cross = new THREE.Vector3(0, 0, 1)
        .cross(tangent)
        .normalize()
        .multiplyScalar(width / 2);
      for (const side of [-1, 1]) {
        const v = center.clone().addScaledVector(cross, side);
        p.push(v.x, v.y, v.z);
      }
      if (i < 28) {
        const a = i * 2;
        ids.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setIndex(ids);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, ribbonMat);
    m.castShadow = true;
    bouquet.add(m);
  }
  for (const side of [-1, 1]) {
    ribbon(
      [
        new THREE.Vector3(0, 0.2, 0.065),
        new THREE.Vector3(side * 0.15, 0.34, 0.08),
        new THREE.Vector3(side * 0.21, 0.2, 0.08),
        new THREE.Vector3(0, 0.18, 0.085),
      ],
      0.047,
    );
    ribbon(
      [
        new THREE.Vector3(side * 0.02, 0.18, 0.08),
        new THREE.Vector3(side * 0.12, 0.04, 0.1),
        new THREE.Vector3(side * 0.22, -0.08, 0.15),
        new THREE.Vector3(side * 0.18, -0.17, 0.12),
      ],
      0.055,
    );
  }
  // A generous invisible hit target makes the gaps between stems clickable.
  const hitTarget = new THREE.Mesh(
    new THREE.SphereGeometry(0.42, 8, 6),
    new THREE.MeshBasicMaterial(),
  );
  hitTarget.position.set(0, 0.65, 0);
  hitTarget.scale.set(1, 1.2, 1);
  hitTarget.visible = false;
  bouquet.add(hitTarget);
  bouquet.userData.petalCount = petals.length;
  return bouquet;
}
