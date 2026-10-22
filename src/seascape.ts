import * as THREE from "three";
import { createKraken } from "./kraken";
import { sampleWaterHeight } from "./water-surface";
import { createAntiqueBronze, createAgedTimber } from "./antique-materials";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Metres in the world; positions are composed through the study's real window.
export const seaComposition = {
  ship: new THREE.Vector3(-27, -8, -54),
  kraken: new THREE.Vector3(-31, -8, -112),
  sun: new THREE.Vector3(-18, 9.5, -145),
};

export function createSeascape() {
  const group = new THREE.Group();
  const wood = createAgedTimber();
  const bronze = createAntiqueBronze();
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
  const hullMaterial = wood.clone();
  hullMaterial.side = THREE.DoubleSide;
  hullMaterial.color.set("#ac9a81");
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
  const sc = sailCanvas.getContext("2d")!; sc.fillStyle = "#d5cfbd"; sc.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 512; i += 3) { sc.fillStyle = i % 2 ? "rgba(105,97,78,.045)" : "rgba(250,241,210,.1)"; sc.fillRect(i, 0, 1, 512); sc.fillRect(0, i, 512, 1); }
  let sailSeed = 751;
  const sailRandom = () => { sailSeed = sailSeed * 16807 % 2147483647; return sailSeed / 2147483647; };
  for (let y = 0; y < 512; y += 86) for (let x = 0; x < 512; x += 64) {
    sc.fillStyle = `rgba(124,111,82,${sailRandom() * .06})`; sc.fillRect(x, y, 63, 85);
    sc.strokeStyle = "rgba(110,102,80,.24)"; sc.lineWidth = .7; sc.strokeRect(x + 2, y + 2, 60, 82);
  }
  for (let i = 0; i < 45; i++) {
    sc.fillStyle = `rgba(126,111,77,${sailRandom() * .025})`; sc.beginPath();
    sc.ellipse(sailRandom() * 512, sailRandom() * 512, 8 + sailRandom() * 70, 4 + sailRandom() * 25, sailRandom() * 3, 0, Math.PI * 2); sc.fill();
  }
  sc.strokeStyle = "rgba(100,91,70,.42)"; sc.lineWidth = 3; sc.strokeRect(4, 4, 504, 504);
  const sailMap = new THREE.CanvasTexture(sailCanvas); sailMap.colorSpace = THREE.SRGBColorSpace;
  const sailGeometry = new THREE.PlaneGeometry(8.5, 6.1, 36, 30), sp = sailGeometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), u = x / 8.5 + .5, v = y / 6.1 + .5;
    const belly = Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * (1 + .12 * Math.sin(u * 3 + v));
    sp.setXYZ(i, x * (.8 + .2 * v), y + .7 * Math.sin(u * Math.PI) * (1 - v), belly * 1.25 + Math.sin(u * 42 + v * 5) * .065 * Math.sin(v * Math.PI) + Math.sin(u * 15 + v * 19) * .025);
  }
  sailGeometry.computeVertexNormals();
  const sail = add(sailGeometry, new THREE.MeshStandardMaterial({ map: sailMap, side: THREE.DoubleSide, roughness: .97, bumpMap: sailMap, bumpScale: .012 }), ship);
  sail.name = "single-billowing-square-sail"; sail.position.set(0, 6.55, .08);
  for (const x of [-6.1, 6.1]) tube([[0, 10.4, 0], [x, 1.1, .8]], .018, rope, ship);
  for (const x of [-4.25, 4.25]) tube([[x, 9.6, 0], [x * .8, 3.5, .1], [x * 1.3, 1, 1]], .019, rope, ship);

  const kraken = createKraken(seaComposition.kraken);
  group.add(kraken.group);
  const vortex = new THREE.Group(); vortex.name = "whirlpool"; vortex.position.copy(seaComposition.kraken); group.add(vortex);
  // The whirlpool foam is shaded on the displaced water itself.

  const helios = new THREE.Group(); helios.name = "helios-radiant-sun";
  helios.position.copy(seaComposition.sun); group.add(helios);
  // A simple sun disc: the light itself is the subject, with no sculpted face or rays.
  const solarDisc = add(new THREE.CircleGeometry(2.4, 64), new THREE.MeshBasicMaterial({
    color: "#fffdf3", fog: false, toneMapped: false,
  }), helios);
  solarDisc.name = "solar-disc";
  const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 256;
  const gc = glowCanvas.getContext("2d")!, gradient = gc.createRadialGradient(128, 128, 26, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,248,217,.95)");
  gradient.addColorStop(.22, "rgba(255,235,181,.8)");
  gradient.addColorStop(.48, "rgba(255,215,135,.32)");
  gradient.addColorStop(.76, "rgba(255,201,105,.075)");
  gradient.addColorStop(1, "rgba(255,201,105,0)");
  gc.fillStyle = gradient; gc.fillRect(0, 0, 256, 256);
  const glowMap = new THREE.CanvasTexture(glowCanvas);
  const auraMaterial = new THREE.SpriteMaterial({
    map: glowMap, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false, toneMapped: false, opacity: .62,
  });
  const aura = new THREE.Sprite(auraMaterial);
  aura.name = "solar-outer-glow"; aura.scale.set(22, 22, 1); aura.position.z = -4.5; helios.add(aura);
  const corona = new THREE.Sprite(auraMaterial.clone());
  corona.name = "solar-inner-corona"; corona.material.opacity = .45;
  corona.scale.set(10, 10, 1); corona.position.z = -3.5; helios.add(corona);
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
    const waterTime = t * (reduced ? .15 : 1);
    const waterline = sampleWaterHeight(ship.position.x, ship.position.z, waterTime, seaComposition.kraken);
    const offsetX = Math.cos(ship.rotation.y) * 4, offsetZ = -Math.sin(ship.rotation.y) * 4;
    const bow = sampleWaterHeight(ship.position.x + offsetX, ship.position.z + offsetZ, waterTime, seaComposition.kraken);
    const stern = sampleWaterHeight(ship.position.x - offsetX, ship.position.z - offsetZ, waterTime, seaComposition.kraken);
    ship.position.y = seaComposition.ship.y + waterline - .12;
    ship.rotation.z = Math.max(-.045, Math.min(.045, (bow - stern) / 8)) * .7;
    ship.rotation.x = Math.sin(a * .41) * .009;
    kraken.update(t, reduced);
  } };
}
