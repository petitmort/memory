import * as THREE from "three";
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

  const monster = new THREE.Group(); monster.name = "distant-kraken";
  monster.position.copy(seaComposition.kraken); group.add(monster);
  const skinCanvas = document.createElement("canvas"); skinCanvas.width = skinCanvas.height = 512;
  const sk = skinCanvas.getContext("2d")!; sk.fillStyle = "#485854"; sk.fillRect(0, 0, 512, 512);
  let skinSeed = 317;
  const skinRandom = () => { skinSeed = skinSeed * 16807 % 2147483647; return skinSeed / 2147483647; };
  for (let i = 0; i < 2300; i++) {
    sk.fillStyle = i % 3 ? `rgba(24,43,42,${skinRandom() * .22})` : `rgba(156,152,125,${skinRandom() * .18})`;
    sk.beginPath(); sk.ellipse(skinRandom() * 512, skinRandom() * 512, 1 + skinRandom() * 8, 1 + skinRandom() * 4, skinRandom() * Math.PI, 0, Math.PI * 2); sk.fill();
  }
  const skinMap = new THREE.CanvasTexture(skinCanvas); skinMap.colorSpace = THREE.SRGBColorSpace;
  skinMap.wrapS = skinMap.wrapT = THREE.RepeatWrapping;
  const skin = new THREE.MeshStandardMaterial({ map: skinMap, bumpMap: skinMap, bumpScale: .1, color: "#88958e", roughness: .6, metalness: .03 });
  const suckerMaterial = new THREE.MeshStandardMaterial({ color: "#9b9b85", roughness: .84 });
  const mantleGeometry = new THREE.SphereGeometry(1, 40, 30), mantlePositions = mantleGeometry.attributes.position;
  for (let i = 0; i < mantlePositions.count; i++) {
    const x = mantlePositions.getX(i), y = mantlePositions.getY(i), z = mantlePositions.getZ(i);
    mantlePositions.setXYZ(i, x * (1.6 + .15 * y), y * 1.65 + .08 * Math.sin(z * 6), z * (1.35 + .12 * Math.sin(x * 4 + y * 2)));
  }
  mantleGeometry.computeVertexNormals();
  const head = add(mantleGeometry, skin, monster); head.position.set(0, .85, 0);
  const arms: THREE.Object3D[] = [];
  const armProfiles = [
    [[-1, -.3, .1], [-3.1, .65, .1], [-4.9, 2.7, .6], [-5.2, 4.7, 1], [-3.9, 5.8, 1.2], [-2.9, 5.15, 1.1], [-3.45, 4.4, 1.2]],
    [[.8, -.2, 0], [2.9, .9, .4], [4.1, 3.6, .7], [5.5, 5.4, .6], [6.5, 4.9, .1], [6, 3.9, -.1], [5.3, 4.15, .1]],
    [[0, -.2, -1], [-.6, 1.2, -2], [-2, 4.5, -2.2], [-1.4, 6.6, -1.3], [.1, 7.1, -.7], [.7, 6.3, -.6]],
    [[0, -.5, 1], [2.8, .2, 3], [5, 1.7, 3.1], [5.6, 3.2, 3], [4.6, 3.9, 3.1], [4, 3.2, 3.2]],
    [[-1, -.3, 1], [-3, .1, 2], [-6, 1, 2.4], [-7, 2.7, 2], [-6.7, 3.7, 2.1], [-5.9, 3.8, 2.2]],
  ];
  for (let armIndex = 0; armIndex < armProfiles.length; armIndex++) {
    const arm = new THREE.Group(); monster.add(arm); arms.push(arm);
    const path = curve(armProfiles[armIndex]), frames = path.computeFrenetFrames(72, false);
    const g = new THREE.TubeGeometry(path, 72, 1, 14, false), p = g.attributes.position;
    const radiusAt = (t: number) => (.86 * Math.pow(1 - t, 1.05) + .035) * (1 + .06 * Math.sin(t * 21 + armIndex));
    for (let i = 0; i <= 72; i++) {
      const t = i / 72, center = path.getPointAt(t), radius = radiusAt(t);
      for (let j = 0; j <= 14; j++) {
        const a = j / 14 * Math.PI * 2;
        const v = center.clone().addScaledVector(frames.normals[i], -Math.cos(a) * radius).addScaledVector(frames.binormals[i], Math.sin(a) * radius * (.79 + .06 * Math.sin(t * 11)));
        p.setXYZ(i * 15 + j, v.x, v.y, v.z);
      }
    }
    g.computeVertexNormals(); add(g, skin, arm);
    const cups = new THREE.InstancedMesh(new THREE.TorusGeometry(1, .3, 7, 12), suckerMaterial, 44), stamp = new THREE.Object3D();
    for (let i = 0; i < 22; i++) {
      const t = .09 + i * .037, tangent = path.getTangentAt(t), forward = new THREE.Vector3(0, 0, 1);
      forward.addScaledVector(tangent, -forward.dot(tangent)).normalize();
      const side = tangent.clone().cross(forward).normalize();
      for (let row = 0; row < 2; row++) {
        const normal = forward.clone().addScaledVector(side, row ? .30 : -.30).normalize();
        stamp.position.copy(path.getPointAt(t)).addScaledVector(normal, radiusAt(t) * .82);
        stamp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
        stamp.scale.setScalar(.16 * (1 - t * .9)); stamp.updateMatrix(); cups.setMatrixAt(i * 2 + row, stamp.matrix);
      }
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
  // A single continuous bronze relief, with anatomy in its surface rather than separate eyeballs.
  const solarGold = createAntiqueBronze(); solarGold.fog = false;
  solarGold.emissive.set("#b38c47"); solarGold.emissiveIntensity = .12;
  const darkGold = solarGold.clone(); darkGold.color.set("#77694d"); darkGold.emissiveIntensity = .035;
  const faceGeometry = new THREE.SphereGeometry(1, 96, 64), fp = faceGeometry.attributes.position;
  const bell = (x: number, y: number, cx: number, cy: number, sx: number, sy: number) => Math.exp(-((x - cx) ** 2 / (sx * sx) + (y - cy) ** 2 / (sy * sy)) * 2);
  for (let i = 0; i < fp.count; i++) {
    const nx = fp.getX(i), ny = fp.getY(i), nz = fp.getZ(i), x = nx * 1.94, y = ny * 2.48;
    let z = nz * .64;
    if (nz > 0) {
      let relief = .34 * bell(x, y, 0, .1, .23, .8) + .27 * bell(x, y, 0, -.35, .33, .24);
      relief += .12 * bell(x, y, 0, -1.43, .66, .42);
      relief += .075 * bell(x, y, 0, -.8, .49, .12) + .075 * bell(x, y, 0, -1.01, .43, .13);
      relief -= .07 * bell(x, y, 0, -.91, .48, .065);
      for (const sign of [-1, 1]) {
        relief -= .14 * bell(x, y, sign * .72, .52, .56, .30);
        relief += .12 * bell(x, y, sign * .7, .91, .64, .16);
        relief += .14 * bell(x, y, sign * .96, -.24, .64, .66);
        relief += .08 * bell(x, y, sign * .23, -.40, .19, .16);
      }
      z += relief * Math.pow(nz, .45);
    }
    fp.setXYZ(i, x, y, z);
  }
  faceGeometry.computeVertexNormals(); add(faceGeometry, solarGold, helios);
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI * 2 / 20 + Math.sin(i * 2.7) * .018, length = (i % 2 ? 2.7 : 3.7) + Math.sin(i * 1.9) * .15;
    const shape = new THREE.Shape(); shape.moveTo(-.22, 2.06);
    if (i % 2) { shape.bezierCurveTo(-.6, 3.3, .5, 3.55, -.04, 2.06 + length); shape.bezierCurveTo(.15, 3.7, .52, 2.8, .22, 2.06); }
    else { shape.quadraticCurveTo(-.09, 3.7, .02, 2.06 + length); shape.quadraticCurveTo(.13, 3.3, .22, 2.06); }
    shape.closePath();
    const ray = add(new THREE.ExtrudeGeometry(shape, { depth: .10, bevelEnabled: true, bevelSize: .06, bevelThickness: .06, bevelSegments: 2, curveSegments: 14 }), solarGold, helios);
    ray.rotation.z = a; ray.position.z = -.15;
    const hair: number[][] = [];
    for (let j = 0; j < 10; j++) { const r = 1.75 + j * .14, angle = a + Math.sin(j * .7 + i) * .09; hair.push([Math.sin(angle) * r, Math.cos(angle) * r * 1.08, .25 + Math.sin(j * .7) * .045]); }
    tube(hair, .095, solarGold, helios);
  }
  for (const sign of [-1, 1]) {
    tube([[sign * .29, .55, .56], [sign * .66, .47, .59], [sign * 1.05, .55, .51]], .025, darkGold, helios);
  }
  const glowCanvas = document.createElement("canvas"); glowCanvas.width = glowCanvas.height = 256;
  const gc = glowCanvas.getContext("2d")!, gradient = gc.createRadialGradient(128, 128, 26, 128, 128, 128);
  gradient.addColorStop(0, "rgba(255,228,170,.27)"); gradient.addColorStop(.45, "rgba(255,221,155,.07)"); gradient.addColorStop(1, "rgba(255,213,131,0)");
  gc.fillStyle = gradient; gc.fillRect(0, 0, 256, 256);
  const aura = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(glowCanvas), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  aura.scale.set(16, 16, 1); helios.add(aura);
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
    vortex.rotation.y = -a * .1;
    arms.forEach((arm, i) => arm.rotation.z = Math.sin(a * .32 + i) * .025);
  } };
}
