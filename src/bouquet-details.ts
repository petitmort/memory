import * as THREE from "three";

type Head = readonly [number, number, number];

/** Static, shared batches: thin foliage, small wax flowers, folded paper and linen. */
export function createBouquetDetails(heads: readonly Head[]) {
  const group = new THREE.Group(); group.name = "bouquet-botanical-details";
  let seed = 947;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  const up = new THREE.Vector3(0, 1, 0), matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(), quaternion = new THREE.Quaternion(), scale = new THREE.Vector3();
  const colors = {
    stem: new THREE.Color("#59723c"), leaf: new THREE.Color("#3c642e"), vein: new THREE.Color("#879b53"),
    ivory: new THREE.Color("#f5f2df"), flowerCenter: new THREE.Color("#9daf70"),
    paper: new THREE.Color("#d4b495"), ribbon: new THREE.Color("#b5a383"),
  };
  function batch(name: string, roughness: number) {
    const p: number[] = [], c: number[] = [], indices: number[] = [];
    return {
      add(geometry: THREE.BufferGeometry, transform: THREE.Matrix4, color: THREE.Color) {
        const source = geometry.getAttribute("position"), offset = p.length / 3, v = new THREE.Vector3();
        const shades = geometry.getAttribute("color");
        for (let i = 0; i < source.count; i++) {
          v.fromBufferAttribute(source, i).applyMatrix4(transform); p.push(v.x, v.y, v.z);
          const shade = shades ? shades.getX(i) : 1;
          c.push(color.r * shade, color.g * shade, color.b * shade);
        }
        if (geometry.index) for (const index of geometry.index.array) indices.push(index + offset);
        else for (let i = 0; i < source.count; i++) indices.push(i + offset);
      },
      surface(points: number[], triangles: number[], color: THREE.Color, shades?: number[]) {
        const offset = p.length / 3; p.push(...points);
        for (let i = 0; i < points.length / 3; i++) {
          const shade = shades?.[i] ?? 1; c.push(color.r * shade, color.g * shade, color.b * shade);
        }
        for (const index of triangles) indices.push(index + offset);
      },
      finish() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
        geometry.setAttribute("color", new THREE.Float32BufferAttribute(c, 3)); geometry.setIndex(indices);
        geometry.computeVertexNormals(); geometry.computeBoundingBox(); geometry.computeBoundingSphere();
        const material = new THREE.MeshStandardMaterial({ color: "#ffffff", vertexColors: true, roughness, side: THREE.DoubleSide });
        const mesh = new THREE.Mesh(geometry, material); mesh.name = name;
        mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
      },
    };
  }
  const greenery = batch("bouquet-foliage-and-veins", .86), flowers = batch("bouquet-white-five-petal-flowers", .8);
  const paper = batch("bouquet-folded-kraft-paper", .96), linen = batch("bouquet-linen-binding", .91);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 5, 1), sphere = new THREE.SphereGeometry(1, 7, 5);
  function stem(from: THREE.Vector3, to: THREE.Vector3, radius: number, color = colors.stem) {
    position.copy(from).add(to).multiplyScalar(.5);
    quaternion.setFromUnitVectors(up, to.clone().sub(from).normalize()); scale.set(radius, from.distanceTo(to), radius);
    matrix.compose(position, quaternion, scale); greenery.add(cylinder, matrix, color);
  }
  function ball(target: ReturnType<typeof batch>, center: THREE.Vector3, radius: number, color: THREE.Color) {
    matrix.compose(center, new THREE.Quaternion(), new THREE.Vector3(radius, radius, radius)); target.add(sphere, matrix, color);
  }
  function leaf(root: THREE.Vector3, direction: THREE.Vector3, length: number, width: number, phase: number) {
    const q = new THREE.Quaternion().setFromUnitVectors(up, direction.clone().normalize());
    const p: number[] = [], ids: number[] = [], shades: number[] = [];
    const point = (t: number, u: number) => new THREE.Vector3(
      u * width * Math.pow(Math.sin(Math.PI * t), .78) * (1 + .045 * Math.sin(t * Math.PI * 14 + phase)),
      t * length,
      .022 * t * t + .009 * Math.sin(Math.PI * t) * (1 - Math.abs(u)) - .004 * Math.abs(u) * Math.sin(Math.PI * t),
    ).applyQuaternion(q).add(root);
    for (let row = 0; row <= 12; row++) for (let col = 0; col <= 4; col++) {
      const t = row / 12, u = col / 2 - 1, v = point(t, u); p.push(v.x, v.y, v.z);
      shades.push(.75 + .2 * (1 - Math.abs(u)) + .1 * t + .025 * Math.sin(t * 20 + phase));
      if (row < 12 && col < 4) { const a = row * 5 + col; ids.push(a, a + 5, a + 1, a + 1, a + 5, a + 6); }
    }
    greenery.surface(p, ids, colors.leaf, shades);
    for (let segment = 0; segment < 6; segment++) {
      const a = point(segment / 6, 0), b = point((segment + 1) / 6, 0);
      const lift = new THREE.Vector3(0, 0, .0006).applyQuaternion(q);
      a.add(lift); b.add(lift); stem(a, b, .0008, colors.vein);
    }
  }
  heads.forEach(([x, y, z], index) => {
    const root = new THREE.Vector3((random() - .5) * .06, -.18, (random() - .5) * .06), tip = new THREE.Vector3(x, y, z);
    const elbow = root.clone().lerp(tip, .58); elbow.x += .013 * Math.sin(index * 2.1);
    stem(root, elbow, .0063); stem(elbow, tip, .005);
    for (let l = 0; l < 3; l++) {
      const f = .57 + l * .10, anchor = root.clone().lerp(tip, f), angle = index * 2.4 + l * 2.15;
      const direction = new THREE.Vector3(Math.cos(angle), .22 + random() * .32, Math.sin(angle));
      const end = anchor.clone().addScaledVector(direction, .025); stem(anchor, end, .0018);
      leaf(end, direction, .15 + random() * .04, .031 + random() * .008, index + l);
    }
    ball(greenery, tip.clone().add(new THREE.Vector3(0, -.025, 0)), .026, colors.stem);
    for (let l = 0; l < 5; l++) {
      const angle = l * Math.PI * 2 / 5 + index;
      leaf(tip.clone().add(new THREE.Vector3(0, -.018, 0)), new THREE.Vector3(Math.cos(angle), -.32, Math.sin(angle)), .065, .008, angle);
    }
  });
  // Slender leafy tips rise between the roses without creating a dense green collar.
  for (let sprig = 0; sprig < 5; sprig++) {
    const angle = sprig * 2.399 + .4, tip = new THREE.Vector3(Math.cos(angle) * .36, .82 + random() * .18, Math.sin(angle) * .32);
    const root = new THREE.Vector3(0, .21, 0); stem(root, tip, .003);
    for (let l = 0; l < 4; l++) {
      const anchor = root.clone().lerp(tip, .42 + l * .15), a = angle + (l % 2 ? -1 : 1) * .9;
      leaf(anchor, new THREE.Vector3(Math.cos(a), .55, Math.sin(a)), .105, .021, l + sprig);
    }
  }
  // Each small bloom has five cupped petals around a separate pale-green centre.
  for (let sprig = 0; sprig < 6; sprig++) {
    const angle = sprig * 2.399 + .8, root = new THREE.Vector3(0, .36, 0);
    const tip = new THREE.Vector3(Math.cos(angle) * .34, .72 + random() * .18, Math.sin(angle) * .32);
    stem(root, tip, .0021);
    for (let flower = 0; flower < 3; flower++) {
      const center = tip.clone().add(new THREE.Vector3((random() - .5) * .085, (random() - .4) * .09, (random() - .5) * .085));
      stem(tip.clone().lerp(root, .17), center, .0013);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(2 + (random() - .5) * .5, angle, (random() - .5) * .5));
      const radius = .020 + random() * .004;
      for (let petal = 0; petal < 5; petal++) {
        const a = petal * Math.PI * 2 / 5, p: number[] = [], ids: number[] = [];
        for (let row = 0; row <= 4; row++) for (let col = 0; col <= 4; col++) {
          const t = row / 4, u = col / 2 - 1, spread = Math.sin(Math.PI * t) * radius * .43;
          const v = new THREE.Vector3(Math.sin(a) * radius * t + Math.cos(a) * u * spread,
            .004 * Math.sin(t * Math.PI) + .004 * t * t,
            Math.cos(a) * radius * t - Math.sin(a) * u * spread).applyQuaternion(q).add(center);
          p.push(v.x, v.y, v.z);
          if (row < 4 && col < 4) { const i = row * 5 + col; ids.push(i, i + 5, i + 1, i + 1, i + 5, i + 6); }
        }
        flowers.surface(p, ids, colors.ivory);
      }
      ball(greenery, center, .0045, colors.flowerCenter);
      if (flower === 2) ball(flowers, center.clone().add(new THREE.Vector3(.025, .025, 0)), .008, colors.ivory);
    }
  }
  // Overlapping, softly folded sheets form an open collar below the flower heads.
  for (let layer = 0; layer < 2; layer++) for (let panel = 0; panel < 6; panel++) {
    const p: number[] = [], ids: number[] = [], shades: number[] = [];
    const phase = panel * Math.PI / 3 + layer * .32, rows = 16, cols = 14;
    for (let row = 0; row <= rows; row++) for (let col = 0; col <= cols; col++) {
      const v = row / rows, u = col / cols * 2 - 1, a = phase + u * .67;
      const shoulder = THREE.MathUtils.smoothstep(v, .40, 1);
      const fold = (.016 * Math.cos(u * Math.PI * 3) + .009 * Math.sin(a * 5 + layer)) * Math.pow(v, 1.3);
      const radius = .071 + .24 * shoulder + layer * .012 + fold;
      const rim = .025 * Math.cos(u * Math.PI) + .025 * Math.sin(phase * 2 + .8);
      const frontOpening = .245 * THREE.MathUtils.smoothstep(Math.cos(a), -.15, .65) * Math.pow(v, 3);
      const y = -.15 + v * (.75 + rim + layer * .018) + .014 * Math.sin(u * 7 + phase) * Math.pow(v, 5) - frontOpening;
      p.push(Math.sin(a) * radius, y, Math.cos(a) * radius);
      shades.push(.91 + .065 * Math.cos(u * Math.PI * 3) + .035 * v + layer * .025);
      if (row < rows && col < cols) { const i = row * (cols + 1) + col; ids.push(i, i + cols + 1, i + 1, i + 1, i + cols + 1, i + cols + 2); }
    }
    paper.surface(p, ids, colors.paper, shades);
  }
  const band = new THREE.CylinderGeometry(.097, .091, .068, 28, 1, true);
  matrix.makeTranslation(0, .17, 0); linen.add(band, matrix, colors.ribbon); band.dispose();
  function ribbon(points: THREE.Vector3[], width: number) {
    const curve = new THREE.CatmullRomCurve3(points), p: number[] = [], ids: number[] = [];
    for (let i = 0; i <= 28; i++) {
      const t = i / 28, center = curve.getPoint(t), tangent = curve.getTangent(t);
      const cross = new THREE.Vector3(0, 0, 1).cross(tangent).normalize().multiplyScalar(width / 2);
      for (const side of [-1, 1]) { const v = center.clone().addScaledVector(cross, side); v.z += .004 * Math.sin(t * Math.PI * 3); p.push(v.x, v.y, v.z); }
      if (i < 28) { const a = i * 2; ids.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    linen.surface(p, ids, colors.ribbon);
  }
  for (const side of [-1, 1]) {
    ribbon([new THREE.Vector3(0, .19, .1), new THREE.Vector3(side * .105, .28, .12), new THREE.Vector3(side * .15, .17, .11), new THREE.Vector3(0, .17, .105)], .027);
    ribbon([new THREE.Vector3(side * .015, .17, .11), new THREE.Vector3(side * .06, .04, .12), new THREE.Vector3(side * .13, -.10, .14), new THREE.Vector3(side * .11, -.17, .12)], .035);
  }
  ball(linen, new THREE.Vector3(0, .18, .105), .025, colors.ribbon);
  cylinder.dispose(); sphere.dispose();
  greenery.finish(); flowers.finish(); paper.finish(); linen.finish();
  group.userData = { foliage: "thin-serrated-leaves-with-raised-midribs", fillerFlowerCount: 18, paperLayers: 2, drawBatches: 4 };
  return group;
}
