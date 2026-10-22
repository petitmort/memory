import * as THREE from "three";

/** Rectangular 90×210 cm envelope, with a rounded Cycladic head. */
export function archedDoorGeometry(
  width: number,
  height: number,
  depth: number,
) {
  const r = width / 2,
    spring = height - r,
    shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(width, 0);
  shape.lineTo(width, spring);
  shape.absarc(r, spring, r, 0, Math.PI, false);
  shape.lineTo(0, 0);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 36,
  });
  g.translate(-r, -height / 2, -depth / 2);
  return g;
}
export function archedLintel(
  left: number,
  right: number,
  spring: number,
  top: number,
  depth: number,
) {
  const center = (left + right) / 2,
    r = (right - left) / 2,
    shape = new THREE.Shape();
  shape.moveTo(left, spring);
  shape.lineTo(left, top);
  shape.lineTo(right, top);
  shape.lineTo(right, spring);
  shape.absarc(center, spring, r, 0, Math.PI, false);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 36,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
export function archMoulding(inner: number, outer: number, depth: number) {
  const shape = new THREE.Shape();
  shape.moveTo(outer, 0);
  shape.absarc(0, 0, outer, 0, Math.PI, false);
  shape.lineTo(-inner, 0);
  shape.absarc(0, 0, inner, Math.PI, 0, true);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.005,
    bevelThickness: 0.005,
    curveSegments: 36,
  });
}

export function createExterior(materials?: {
  plaster: THREE.Material;
  blue: THREE.Material;
}) {
  const group = new THREE.Group();
  group.name = "santorini-exterior";
  const white =
    materials?.plaster ??
    new THREE.MeshStandardMaterial({ color: "#f5f3e9", roughness: 0.91 });
  const clay = new THREE.MeshStandardMaterial({
    color: "#b47a5e",
    roughness: 0.91,
  });
  const blue =
    materials?.blue ??
    new THREE.MeshStandardMaterial({ color: "#215a8b", roughness: 0.71 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: "#537156",
    roughness: 0.9,
  });
  const bractMat = new THREE.MeshStandardMaterial({
    color: "#bd4778",
    roughness: 0.85,
    side: THREE.DoubleSide,
  });
  function box(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
    material: THREE.Material = white,
    parent: THREE.Object3D = group,
  ) {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    o.position.set(x, y, z);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  // Low sculpted courtyard wall, a built-in bench and handmade planters.
  // A sheltered entrance garden: the ocean is revealed only after entering.
  for(const side of [-1,1]) {
    box(.24,2.8,4.8,side*2.4,1.4,4.95);
    box(.32,.08,4.8,side*2.4,2.84,4.95);
    for(const z of [3.2,4.7,6.2]) {
      box(.11,2.65,.11,side*2.24,1.325,z,blue);
    }
  }
  box(4.9,.12,.8,0,2.86,3.1);
  for(let z=3.7;z<7.4;z+=.48)box(4.9,.13,.12,0,2.85,z,new THREE.MeshStandardMaterial({color:'#72664d',roughness:1}));
  box(4.8,2.8,.2,0,1.4,7.4);
  box(.32,.08,3.6,-2.4,2.86,4.4);
  box(0.32, 0.08, 3.6, -2.4, 0.66, 4.4);
  box(1.08, 0.4, 0.4, -1.42, 0.2, 2.98);
  box(1.12, 0.05, 0.44, -1.42, 0.425, 2.98);
  const cushion = box(
    0.78,
    0.07,
    0.33,
    -1.42,
    0.485,
    2.98,
    new THREE.MeshStandardMaterial({ color: "#d3e4e0", roughness: 1 }),
  );
  cushion.rotation.y = 0.02;
  const pot = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, 0),
        new THREE.Vector2(0.12, 0),
        new THREE.Vector2(0.17, 0.12),
        new THREE.Vector2(0.155, 0.32),
        new THREE.Vector2(0.17, 0.34),
        new THREE.Vector2(0.15, 0.36),
        new THREE.Vector2(0.135, 0.33),
      ],
      28,
    ),
    clay,
  );
  pot.position.set(-1.98, 0, 3.13);
  pot.castShadow = true;
  group.add(pot);
  const stemMat = new THREE.MeshStandardMaterial({
    color: "#72664a",
    roughness: 1,
  });
  const branchCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.98, 0.3, 3.13),
    new THREE.Vector3(-2.02, 0.8, 2.96),
    new THREE.Vector3(-2.13, 1.4, 2.93),
    new THREE.Vector3(-1.87, 1.98, 2.89),
    new THREE.Vector3(-1.42, 2.4, 2.89),
  ]);
  const stem = new THREE.Mesh(
    new THREE.TubeGeometry(branchCurve, 30, 0.012, 6, false),
    stemMat,
  );
  stem.castShadow = true;
  group.add(stem);
  function bractGeometry() {
    const s = new THREE.Shape();
    s.moveTo(0, -0.9);
    s.bezierCurveTo(-0.45, -0.5, -0.85, 0.45, 0, 0.85);
    s.bezierCurveTo(0.85, 0.45, 0.45, -0.5, 0, -0.9);
    return new THREE.ShapeGeometry(s, 10);
  }
  const leaf = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 6),
      leafMat,
      86,
    ),
    flowers = new THREE.InstancedMesh(bractGeometry(), bractMat, 95),
    dummy = new THREE.Object3D();
  for (let i = 0; i < 86; i++) {
    const t = (i + 0.5) / 86,
      p = branchCurve.getPoint(t);
    p.x += Math.sin(i * 2.4) * 0.12;
    p.y += Math.cos(i * 1.3) * 0.07;
    p.z += Math.sin(i * 1.7) * 0.07;
    dummy.position.copy(p);
    dummy.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    dummy.scale.set(0.022, 0.0018, 0.035);
    dummy.updateMatrix();
    leaf.setMatrixAt(i, dummy.matrix);
  }
  for (let i = 0; i < 95; i++) {
    const t = 0.38 + (i / 95) * 0.62,
      p = branchCurve.getPoint(t);
    p.x += Math.sin(i * 2.4) * 0.15;
    p.y += Math.cos(i * 1.3) * 0.1;
    p.z += 0.03 + Math.sin(i * 1.7) * 0.09;
    dummy.position.copy(p);
    dummy.rotation.set(i * 0.4, i * 0.9, i * 0.8);
    dummy.scale.set(0.032, 0.032, 0.032);
    dummy.updateMatrix();
    flowers.setMatrixAt(i, dummy.matrix);
  }
  leaf.castShadow = flowers.castShadow = true;
  group.add(leaf, flowers);
  // A distant island hamlet is scenery at its actual metre scale.
  const village = new THREE.Group();
  village.name = "aegean-village";
  village.position.set(-65, -7.73, -85);
  group.add(village);
  const rock = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 12),
    new THREE.MeshStandardMaterial({ color: "#a39c88", roughness: 1 }),
  );
  rock.position.set(0, -1.25, 0);
  rock.scale.set(7, 2.5, 5);
  village.add(rock);
  for (let i = 0; i < 6; i++) {
    const x = (i % 3) * 1.6 - 2.2,
      z = Math.floor(i / 3) * 1.5,
      y = 0.1 + Math.floor(i / 3) * 0.5;
    box(1.4, 1.8, 1.5, x, y + 0.9, z, white, village);
    box(0.23, 0.52, 0.025, x + 0.36, y + 1.0, z + 0.765, blue, village);
    box(0.33, 0.65, 0.025, x - 0.26, y + 0.42, z + 0.765, blue, village);
  }
  const church = box(1.8, 2.4, 1.7, -0.4, 1.3, -1.6, white, village);
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(0.87, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2),
    blue,
  );
  dome.position.set(-0.4, 2.5, -1.6);
  village.add(dome);
  box(0.035, 0.36, 0.035, -0.4, 3.5, -1.6, white, village);
  box(0.2, 0.035, 0.035, -0.4, 3.56, -1.6, white, village);
  return group;
}
