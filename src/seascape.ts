import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Metres in the world; positions are composed through the study's real window.
export const seaComposition = {
  ship: new THREE.Vector3(-27, -8, -54),
  kraken: new THREE.Vector3(-31, -8, -112),
  sun: new THREE.Vector3(-18, 9.5, -145),
};

export function createSeascape() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: "#4c3528", roughness: .86 });
  const bronze = new THREE.MeshStandardMaterial({ color: "#b69a5d", metalness: .68, roughness: .48 });
  const rope = new THREE.MeshStandardMaterial({ color: "#a99a75", roughness: 1 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D) => {
    const mesh = new THREE.Mesh(geometry, material); parent.add(mesh); return mesh;
  };
  const curve = (points: number[][]) => new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const tube = (points: number[][], radius: number, material: THREE.Material, parent: THREE.Object3D) =>
    add(new THREE.TubeGeometry(curve(points), 48, radius, 8, false), material, parent);
  const beam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, parent: THREE.Object3D) => {
    const mesh = add(new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10), material, parent);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  };

  const ship = new THREE.Group(); ship.name = "mythic-sailing-ship";
  ship.position.copy(seaComposition.ship); ship.rotation.y = .45; group.add(ship);
  // Open, plank-built galley hull with a fine keel and upswept stem and stern.
  const vertices: number[] = [], uvs: number[] = [], indices: number[] = [];
  const sections = 48, ribs = 12;
  for (let i = 0; i <= sections; i++) {
    const t = i / sections, x = (t - .5) * 14;
    const width = Math.pow(Math.sin(Math.PI * t), .65) * 1.18 + .025;
    const sheer = .85 + Math.pow(Math.abs(t - .5) * 2, 5) * 1.45;
    for (let j = 0; j <= ribs; j++) {
      const a = j / ribs * Math.PI;
      vertices.push(x, sheer - Math.sin(a) * 1.5, Math.cos(a) * width);
      uvs.push(t * 5, j / ribs);
      if (i < sections && j < ribs) {
        const n = i * (ribs + 1) + j;
        indices.push(n, n + 1, n + ribs + 1, n + 1, n + ribs + 2, n + ribs + 1);
      }
    }
  }
  const hullGeometry = new THREE.BufferGeometry();
  hullGeometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  hullGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  hullGeometry.setIndex(indices); hullGeometry.computeVertexNormals();
  const plankCanvas = document.createElement("canvas"); plankCanvas.width = plankCanvas.height = 256;
  const pc = plankCanvas.getContext("2d")!; pc.fillStyle = "#614532"; pc.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 24) { pc.fillStyle = y % 48 ? "#75543c" : "#5d4231"; pc.fillRect(0, y, 256, 23); pc.fillStyle = "#34271f"; pc.fillRect(0, y, 256, 1); }
  const plankMap = new THREE.CanvasTexture(plankCanvas); plankMap.colorSpace = THREE.SRGBColorSpace;
  const hullMaterial = new THREE.MeshStandardMaterial({ map: plankMap, roughness: .86, side: THREE.DoubleSide });
  add(hullGeometry, hullMaterial, ship).name = "greek-galley-hull";
  for (const side of [-1, 1]) {
    const rail: number[][] = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20; rail.push([(t - .5) * 14, .89 + Math.pow(Math.abs(t - .5) * 2, 5) * 1.45, side * (Math.pow(Math.sin(Math.PI * t), .65) * 1.18 + .025)]); }
    tube(rail, .055, bronze, ship);
    // Oars taper to blades; both banks follow the same historical rowing angle.
    for (let i = 0; i < 13; i++) {
      const x = -4.8 + i * .78;
      const a = new THREE.Vector3(x, .71, side * .96), b = new THREE.Vector3(x - 1.05, -.32, side * 3.1);
      beam(a, b, .035, wood, ship);
      const blade = add(new THREE.SphereGeometry(1, 10, 6), wood, ship);
      blade.position.copy(b); blade.scale.set(.14, .035, .49); blade.rotation.y = -side * .45;
    }
  }
  for (let i = 0; i < 10; i++) {
    const bench = add(new THREE.BoxGeometry(.26, .09, 1.9), wood, ship); bench.position.set(-3.8 + i * .83, .6, 0);
  }
  tube([[6.1, 1.1, 0], [7.15, 1.8, 0], [7.7, 2.6, 0], [7.65, 3.05, 0]], .13, wood, ship);
  tube([[-6, 1.1, 0], [-7, 2, 0], [-7.2, 3.2, 0], [-6.9, 3.6, 0]], .12, wood, ship);
  const ram = add(new THREE.SphereGeometry(1, 20, 12), bronze, ship); ram.position.set(7.15, .5, 0); ram.scale.set(.85, .18, .22);
  beam(new THREE.Vector3(0, .3, 0), new THREE.Vector3(0, 10.4, 0), .085, wood, ship);
  beam(new THREE.Vector3(-4.5, 9.65, 0), new THREE.Vector3(4.5, 9.65, 0), .065, wood, ship);
  const sailCanvas = document.createElement("canvas"); sailCanvas.width = sailCanvas.height = 512;
  const sc = sailCanvas.getContext("2d")!; sc.fillStyle = "#d3c8af"; sc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 512; i += 3) { sc.fillStyle = i % 2 ? "#c9bda3" : "#dfd4bb"; sc.fillRect(i, 0, 1, 512); }
  sc.strokeStyle = "#968b74"; sc.lineWidth = 1;
  for (let i = 8; i < 512; i += 64) { sc.beginPath(); sc.moveTo(i, 0); sc.lineTo(i, 512); sc.moveTo(0, i); sc.lineTo(512, i); sc.stroke(); }
  const sailMap = new THREE.CanvasTexture(sailCanvas); sailMap.colorSpace = THREE.SRGBColorSpace;
  const sailGeometry = new THREE.PlaneGeometry(8.5, 6.1, 36, 30), sp = sailGeometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), u = x / 8.5 + .5, v = y / 6.1 + .5;
    const belly = Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
    sp.setXYZ(i, x * (.8 + .2 * v), y + .7 * Math.sin(u * Math.PI) * (1 - v), belly * 1.15 + Math.sin(u * 35) * .045 * Math.sin(v * Math.PI));
  }
  sailGeometry.computeVertexNormals();
  const sail = add(sailGeometry, new THREE.MeshStandardMaterial({ map: sailMap, side: THREE.DoubleSide, roughness: .95 }), ship);
  sail.name = "single-billowing-square-sail"; sail.position.set(0, 6.55, .08);
  for (const x of [-6.1, 6.1]) tube([[0, 10.4, 0], [x, 1.1, .8]], .018, rope, ship);
  for (const x of [-4.25, 4.25]) tube([[x, 9.6, 0], [x * .8, 3.5, .1], [x * 1.3, 1, 1]], .019, rope, ship);

  const monster = new THREE.Group(); monster.name = "distant-kraken";
  monster.position.copy(seaComposition.kraken); group.add(monster);
  const skin = new THREE.MeshStandardMaterial({ color: "#405354", roughness: .68, metalness: .08 });
  const suckerMaterial = new THREE.MeshStandardMaterial({ color: "#7c8680", roughness: .9 });
  const head = add(new THREE.SphereGeometry(1, 28, 20), skin, monster); head.position.set(0, 1.2, 0); head.scale.set(1.5, 2.1, 1.35);
  const arms: THREE.Object3D[] = [];
  const armProfiles = [
    [[-1, 0, 0], [-3, 1, 0], [-4.7, 3.5, .6], [-5.2, 5.2, 1], [-4, 6, 1], [-3.3, 5.4, 1], [-3.8, 4.8, 1]],
    [[1, 0, 0], [3, 1.4, .5], [4, 4.5, 1], [5.4, 6.1, .7], [6.7, 5.5, .3], [6.3, 4.5, .2], [5.5, 4.8, .2]],
    [[0, 0, -1], [-.7, 2, -2], [-2, 5, -2], [-1.5, 7.2, -1], [0, 7.7, -.7], [.6, 6.9, -.6]],
    [[0, 0, 1], [2.8, .7, 3], [5, 2.3, 3], [5.6, 3.8, 3], [4.6, 4.5, 3], [4, 3.8, 3]],
    [[-1, 0, 1], [-3, .5, 2], [-6, 1.5, 2.3], [-7, 3.2, 2], [-6.7, 4.2, 2], [-5.9, 4.3, 2]],
  ];
  for (const points of armProfiles) {
    const arm = new THREE.Group(); monster.add(arm); arms.push(arm);
    const path = curve(points), g = new THREE.TubeGeometry(path, 64, .62, 12, false), p = g.attributes.position;
    for (let j = 0; j < p.count; j++) {
      const t = Math.floor(j / 13) / 64, center = path.getPointAt(t);
      const v = new THREE.Vector3().fromBufferAttribute(p, j).sub(center).multiplyScalar(Math.pow(1 - t, .8) * .95 + .04).add(center);
      p.setXYZ(j, v.x, v.y, v.z);
    }
    g.computeVertexNormals(); add(g, skin, arm);
    const cups = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .28, 6, 10), suckerMaterial, 24);
    const stamp = new THREE.Object3D();
    for (let i = 0; i < 24; i++) {
      const t = .08 + i * .035; stamp.position.copy(path.getPointAt(t)); stamp.position.z += .55 * Math.pow(1 - t, .8);
      stamp.scale.setScalar(.17 * (1 - t * .85)); stamp.updateMatrix(); cups.setMatrixAt(i, stamp.matrix);
    }
    arm.add(cups);
  }
  const vortex = new THREE.Group(); vortex.name = "whirlpool"; vortex.position.copy(seaComposition.kraken); group.add(vortex);
  const foam = new THREE.MeshBasicMaterial({ color: "#b2ccc6", transparent: true, opacity: .42, depthWrite: false });
  for (let i = 0; i < 3; i++) {
    const points: number[][] = [];
    for (let j = 0; j <= 100; j++) { const a = j * .105 + i * Math.PI * 2 / 3, r = 2 + j * .065; points.push([Math.cos(a) * r, -.6 + j * .008, Math.sin(a) * r]); }
    tube(points, .06, foam, vortex);
  }

  const helios = new THREE.Group(); helios.name = "helios-radiant-sun";
  helios.position.copy(seaComposition.sun); group.add(helios);
  // Sculpted human features, a flowing mane and alternating flame / lance rays.
  const solarGold = new THREE.MeshStandardMaterial({ color: "#c5a264", metalness: .65, roughness: .44, emissive: "#bb8534", emissiveIntensity: .26, fog: false });
  const darkGold = new THREE.MeshStandardMaterial({ color: "#78603d", metalness: .6, roughness: .64, fog: false });
  const relief = (r: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material = solarGold) => {
    const o = add(new THREE.SphereGeometry(r, 24, 18), material, helios); o.position.set(x, y, z); o.scale.set(sx, sy, sz); return o;
  };
  relief(1, 0, 0, 0, 2.05, 2.45, .62);
  for (let i = 0; i < 18; i++) {
    const a = i * Math.PI * 2 / 18, length = i % 2 ? 3.2 : 4.1;
    const shape = new THREE.Shape(); shape.moveTo(-.29, 1.9);
    if (i % 2) { shape.bezierCurveTo(-.8, 3.3, .65, 3.8, 0, 1.9 + length); shape.bezierCurveTo(.2, 3.7, .75, 2.8, .29, 1.9); }
    else { shape.lineTo(0, 1.9 + length); shape.lineTo(.29, 1.9); }
    shape.closePath();
    const ray = add(new THREE.ExtrudeGeometry(shape, { depth: .18, bevelEnabled: true, bevelSize: .07, bevelThickness: .07, bevelSegments: 2, curveSegments: 12 }), solarGold, helios);
    ray.rotation.z = a; ray.position.z = -.15;
    const hair: number[][] = [];
    for (let j = 0; j < 8; j++) { const r = 1.8 + j * .2, angle = a + Math.sin(j * .8) * .1; hair.push([Math.sin(angle) * r, Math.cos(angle) * r * 1.04, .35 + Math.sin(j) * .06]); }
    tube(hair, .14, solarGold, helios);
  }
  // Cheekbones, brow ridges, recessed eyes, nose bridge and parted lips.
  for (const sign of [-1, 1]) {
    relief(1, sign * .98, -.35, .48, .62, .8, .36);
    relief(1, sign * .7, .53, .62, .55, .28, .18, darkGold);
    relief(1, sign * .7, .5, .74, .36, .13, .075);
    relief(1, sign * .7, .5, .8, .095, .10, .045, darkGold);
    tube([[sign * .22, .93, .66], [sign * .65, 1.03, .72], [sign * 1.13, .87, .61]], .10, solarGold, helios);
  }
  relief(1, 0, .12, .8, .21, .67, .31); relief(1, 0, -.32, .96, .30, .21, .22);
  relief(1, 0, -.91, .66, .49, .095, .13, darkGold);
  relief(1, 0, -.82, .75, .43, .11, .14); relief(1, 0, -1.01, .73, .39, .12, .13);
  const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 256;
  const gc = glowCanvas.getContext("2d")!, gradient = gc.createRadialGradient(128, 128, 26, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,221,146,.5)"); gradient.addColorStop(.45, "rgba(255,213,131,.15)"); gradient.addColorStop(1, "rgba(255,213,131,0)");
  gc.fillStyle = gradient; gc.fillRect(0, 0, 256, 256);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  aura.scale.set(19, 19, 1); helios.add(aura);
  helios.lookAt(new THREE.Vector3(1.1, 1.65, .75));

  // Bake the static parts by material; intricate relief and rigging need only a few draws.
  for (const parent of [ship, helios]) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...parent.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
      const list = batches.get(child.material) ?? []; list.push(child); batches.set(child.material, list);
    }
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => {
        mesh.updateMatrix();
        const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        return g.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(parts);
      if (geometry) {
        const combined = add(geometry, material, parent); combined.name = parent.name + '-sculpted-details';
        for (const mesh of meshes) { parent.remove(mesh); mesh.geometry.dispose(); }
      }
      for (const part of parts) part.dispose();
    }
  }
  return { group, update(t: number, reduced: boolean) {
    const a = reduced ? t * .12 : t;
    ship.rotation.z = Math.sin(a * .51) * .018;
    ship.position.y = seaComposition.ship.y + Math.sin(a * .71) * .22;
    vortex.rotation.y = -a * .1;
    arms.forEach((arm, i) => arm.rotation.z = Math.sin(a * .32 + i) * .025);
  } };
}
