import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** A sheltered entrance garden. Dimensions and supports are authored in metres. */
export function createCourtyardDetails(plaster: THREE.Material) {
  const courtyard = new THREE.Group();
  courtyard.name = "lived-in-entrance-garden";
  let seed = 813;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const material = (color: string, roughness = .9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const bark = material("#776b53"), twigs = material("#8b8065");
  const darkBronze = material("#665b43", .67, .42);
  const blue = material("#4c7184", .8);
  const soil = material("#514b3d");
  function add(geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, name = "") {
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function group(name: string, x = 0, y = 0, z = 0) {
    const result = new THREE.Group(); result.name = name; result.position.set(x, y, z); courtyard.add(result); return result;
  }
  function texture(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
    const c = document.createElement("canvas"); c.width = width; c.height = height;
    paint(c.getContext("2d")!);
    const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
    return map;
  }
  const clayMap = texture(256, 512, ctx => {
    ctx.fillStyle = "#c39374"; ctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = random() > .5 ? "rgba(246,221,186,.11)" : "rgba(92,66,48,.09)";
      ctx.fillRect(random() * 256, random() * 512, 1 + random(), .5 + random());
    }
    for (let y = 0; y < 512; y += 7) {
      ctx.strokeStyle = `rgba(104,77,52,${.015 + random() * .045})`; ctx.lineWidth = .6;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(65, y + 1, 195, y - 1, 256, y); ctx.stroke();
    }
  });
  const clay = new THREE.MeshStandardMaterial({ map: clayMap, bumpMap: clayMap, bumpScale: .0014, roughness: .94 });
  const ceramicMap = texture(256, 512, ctx => {
    ctx.fillStyle = "#d1c8b0"; ctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 1800; i++) {
      ctx.fillStyle = `rgba(113,112,85,${random() * .075})`;
      ctx.beginPath(); ctx.ellipse(random() * 256, random() * 512, random() * 9, 2 + random() * 21, 0, 0, Math.PI * 2); ctx.fill();
    }
  });
  const ceramic = new THREE.MeshStandardMaterial({ map: ceramicMap, bumpMap: clayMap, bumpScale: .0005, roughness: .73 });
  const linenMap = texture(512, 512, ctx => {
    ctx.fillStyle = "#dbd9c9"; ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 512; i += 2) {
      ctx.fillStyle = i % 4 ? "rgba(255,253,232,.12)" : "rgba(108,108,82,.08)";
      ctx.fillRect(i, 0, 1, 512); ctx.fillRect(0, i, 512, 1);
    }
    for (const x of [67, 77, 91, 420, 434, 444]) {
      ctx.fillStyle = "rgba(68,106,120,.58)"; ctx.fillRect(x, 0, x % 2 ? 3 : 5, 512);
    }
  });
  const linen = new THREE.MeshStandardMaterial({ map: linenMap, bumpMap: linenMap, bumpScale: .0006, roughness: 1 });
  const softBlue = linen.clone(); softBlue.color.set("#a6c4bf");

  function branch(points: THREE.Vector3[], radius: number, parent: THREE.Object3D, mat = bark, taper = .24) {
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 20, radius, 7, false);
    const positions = geometry.getAttribute("position"), uv = geometry.getAttribute("uv");
    for (let i = 0; i < positions.count; i++) {
      const t = uv.getX(i), centre = curve.getPointAt(t);
      const amount = 1 - (1 - taper) * t;
      positions.setXYZ(i, centre.x + (positions.getX(i) - centre.x) * amount, centre.y + (positions.getY(i) - centre.y) * amount, centre.z + (positions.getZ(i) - centre.z) * amount);
    }
    geometry.computeVertexNormals(); add(geometry, mat, parent);
    return curve;
  }
  function pot(parent: THREE.Object3D, height: number, width: number, mat: THREE.Material) {
    const body = add(new THREE.LatheGeometry([
      new THREE.Vector2(0, 0),new THREE.Vector2(width * .34, 0),new THREE.Vector2(width * .37, height * .05),
      new THREE.Vector2(width * .46, height * .29),new THREE.Vector2(width * .5, height * .73),
      new THREE.Vector2(width * .48, height * .91),new THREE.Vector2(width * .51, height * .96),
      new THREE.Vector2(width * .505, height),new THREE.Vector2(width * .453, height),
      new THREE.Vector2(width * .448, height * .93),new THREE.Vector2(width * .43, height * .84),
    ], 48), mat, parent);
    body.position.y = .001;
    const earth = add(new THREE.CylinderGeometry(width * .43, width * .43, .012, 40), soil, parent);
    earth.position.y = height * .865;
  }
  function leafGeometry(length: number, width: number) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -length / 2); shape.bezierCurveTo(-width * .72, -length * .2, -width * .55, length * .21, 0, length / 2);
    shape.bezierCurveTo(width * .55, length * .21, width * .72, -length * .2, 0, -length / 2);
    const g = new THREE.ShapeGeometry(shape, 7), positions = g.getAttribute("position");
    for (let i = 0; i < positions.count; i++) positions.setZ(i, Math.abs(positions.getX(i)) * .18 + Math.sin((positions.getY(i) / length + .5) * Math.PI) * .0025);
    g.computeVertexNormals(); return g;
  }

  // A mature small olive with an open, irregular crown and connected woody branches.
  const olive = group("olive-planter", 1.54, 0, 3.18);
  pot(olive, .41, .43, ceramic);
  for (const y of [.327, .342]) {
    const band = add(new THREE.TorusGeometry(.208, .0022, 6, 48), blue, olive); band.rotation.x = Math.PI / 2; band.position.y = y;
  }
  branch([v(0, .345, 0),v(-.018, .64, .008),v(.025, .91, -.018),v(-.025, 1.21, .01)], .023, olive);
  const oliveBranches: THREE.CatmullRomCurve3[] = [];
  for (let i = 0; i < 17; i++) {
    const angle = i * 2.39996, startY = .68 + (i % 6) * .073;
    const reach = .23 + random() * .15;
    const end = v(Math.cos(angle) * reach, startY + .21 + random() * .14, Math.sin(angle) * reach * .7);
    const line = branch([v(.01, startY, 0),v(end.x * .53, startY + .14, end.z * .46),end], .0065, olive, twigs, .13);
    oliveBranches.push(line);
  }
  const oliveLeaf = new THREE.MeshStandardMaterial({ roughness: .93, side: THREE.DoubleSide });
  const leaves = new THREE.InstancedMesh(leafGeometry(.057, .014), oliveLeaf, 17 * 42);
  leaves.name = "silver-olive-crown"; const stamp = new THREE.Object3D();
  const leafColor = new THREE.Color();
  for (let i = 0; i < oliveBranches.length; i++) for (let j = 0; j < 42; j++) {
    const t = .28 + random() * .72, point = oliveBranches[i].getPointAt(t);
    point.add(v((random() - .5) * .095, (random() - .5) * .12, (random() - .5) * .10));
    stamp.position.copy(point); stamp.rotation.set(random() * 1.6 - .8, i * 2.4 + (j % 2) * 2.3, (random() - .5) * 2.2);
    stamp.scale.setScalar(.74 + random() * .45); stamp.updateMatrix(); leaves.setMatrixAt(i * 42 + j, stamp.matrix);
    leafColor.setHSL(.24 + random() * .035, .12 + random() * .12, .35 + random() * .14); leaves.setColorAt(i * 42 + j, leafColor);
  }
  leaves.castShadow = true; olive.add(leaves);

  // Bougainvillea grows in loose clusters up the left wall and over the pergola.
  const climbing = group("courtyard-bougainvillea", -1.98, 0, 3.13);
  pot(climbing, .38, .39, clay);
  const mainVine = branch([v(0, .32, 0),v(-.055, .86, -.10),v(-.08, 1.52, -.14),v(.13, 2.13, -.15),v(.64, 2.42, -.12),v(1.31, 2.5, .02)], .020, climbing);
  const shoots: THREE.CatmullRomCurve3[] = [];
  for (let i = 0; i < 19; i++) {
    const t = .19 + i / 24, origin = mainVine.getPointAt(t), direction = i % 2 ? -1 : 1;
    const end = origin.clone().add(v(direction * (.16 + random() * .20), .09 + random() * .17, .02 + random() * .13));
    end.x = Math.max(-.17, end.x); // Keep the crown in front of the courtyard's left wall.
    shoots.push(branch([origin,origin.clone().lerp(end, .6).add(v(0, .03, -.015)),end], .0048, climbing, twigs, .12));
  }
  const foliage = new THREE.InstancedMesh(leafGeometry(.069, .041), new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide }), 570);
  foliage.name = "bougainvillea-leaf-clusters";
  const bract = leafGeometry(.047, .037);
  const flowerMat = new THREE.MeshStandardMaterial({ roughness: 1, side: THREE.DoubleSide });
  const flowers = new THREE.InstancedMesh(bract, flowerMat, 420);
  flowers.name = "bougainvillea-bloom-clusters";
  for (let i = 0; i < 570; i++) {
    const curve = shoots[i % shoots.length], point = curve.getPointAt(.2 + random() * .8);
    point.add(v((random() - .5) * .13, (random() - .5) * .16, (random() - .5) * .15));
    stamp.position.copy(point); stamp.rotation.set((random() - .5) * 1.5, random() * Math.PI * 2, (random() - .5) * 2);
    stamp.scale.setScalar(.65 + random() * .55); stamp.updateMatrix(); foliage.setMatrixAt(i, stamp.matrix);
    leafColor.setHSL(.23 + random() * .045, .23, .29 + random() * .16); foliage.setColorAt(i, leafColor);
  }
  for (let cluster = 0; cluster < 140; cluster++) {
    const curve = shoots[(cluster * 7) % shoots.length], centre = curve.getPointAt(.4 + random() * .6);
    centre.add(v((random() - .5) * .11, (random() - .5) * .10, .025 + random() * .06));
    for (let j = 0; j < 3; j++) {
      const angle = j / 3 * Math.PI * 2 + cluster * 1.7;
      stamp.position.copy(centre).add(v(Math.sin(angle) * .013, Math.cos(angle) * .013, Math.sin(angle * 2) * .004));
      stamp.rotation.set(.2 + random() * .5, (random() - .5) * .8, -angle);
      stamp.scale.setScalar(.7 + random() * .45); stamp.updateMatrix(); flowers.setMatrixAt(cluster * 3 + j, stamp.matrix);
      leafColor.setHSL(.93 + random() * .035, .34 + random() * .15, .42 + random() * .16); flowers.setColorAt(cluster * 3 + j, leafColor);
    }
  }
  foliage.castShadow = flowers.castShadow = true; climbing.add(foliage, flowers);

  // Soft furnishings share the bench's actual 45 cm top; the throw folds over its front.
  const textiles = group("courtyard-bench-textiles");
  const seat = add(new RoundedBoxGeometry(.98, .075, .365, 4, .025), softBlue, textiles);
  seat.position.set(-1.42, .4875, 2.985);
  const pillow = add(new RoundedBoxGeometry(.34, .29, .115, 4, .035), linen, textiles);
  pillow.position.set(-1.45, .67, 2.858); pillow.rotation.set(-.09, -.08, .10);
  const throwGeometry = new THREE.PlaneGeometry(.27, .63, 20, 36), throwPosition = throwGeometry.getAttribute("position");
  for (let i = 0; i < throwPosition.count; i++) {
    const x = throwPosition.getX(i), t = (throwPosition.getY(i) + .315) / .63;
    const hanging = Math.max(0, (t - .64) / .36);
    throwPosition.setXYZ(i, -1.76 + x, .529 + Math.sin(x * 57) * .005 - hanging * .28, 2.81 + Math.min(t / .64, 1) * .405 + Math.sin(hanging * Math.PI) * .015);
  }
  throwGeometry.computeVertexNormals(); const throwMaterial = linen.clone(); throwMaterial.side = THREE.DoubleSide;
  add(throwGeometry, throwMaterial, textiles, "striped-linen-bench-throw");

  const lantern = group("aged-bronze-courtyard-lantern", 1.31, 1.91, 2.90);
  const backplate = add(new RoundedBoxGeometry(.085, .17, .018, 3, .015), darkBronze, lantern); backplate.position.set(0, .12, -.104);
  branch([v(0, .19, -.105),v(0, .265, -.09),v(0, .27, .015),v(0, .195, .025)], .007, lantern, darkBronze, 1);
  const cap = add(new THREE.ConeGeometry(.113, .07, 4), darkBronze, lantern); cap.rotation.y = Math.PI / 4; cap.position.y = .155;
  const lowerCap = add(new THREE.BoxGeometry(.155, .022, .135), darkBronze, lantern); lowerCap.position.y = -.145;
  const glass = add(new THREE.BoxGeometry(.112, .245, .095), new THREE.MeshPhysicalMaterial({ color: "#ede2be", transparent: true, opacity: .18, roughness: .28, depthWrite: false }), lantern);
  glass.castShadow = false;
  for (const x of [-.064, .064]) for (const z of [-.055, .055]) {
    const post = add(new THREE.CylinderGeometry(.003, .0045, .29, 8), darkBronze, lantern); post.position.set(x, 0, z);
  }
  const candle = add(new THREE.CylinderGeometry(.016, .017, .105, 16), material("#e6d8b5"), lantern); candle.position.y = -.075;
  const flame = add(new THREE.SphereGeometry(.011, 12, 8), new THREE.MeshStandardMaterial({ color: "#ffe5aa", emissive: "#efc57e", emissiveIntensity: .55, roughness: .9 }), lantern);
  flame.position.y = -.013; flame.scale.set(.55, 1.5, .55); flame.castShadow = false;

  const plaque = group("handpainted-entrance-plaque", 1.24, 1.49, 2.805);
  add(new RoundedBoxGeometry(.205, .125, .015, 4, .012), ceramic, plaque);
  const plaqueMap = texture(512, 320, ctx => {
    ctx.fillStyle = "#ded9c6"; ctx.fillRect(0, 0, 512, 320);
    ctx.strokeStyle = "#477184"; ctx.lineWidth = 6; ctx.strokeRect(19, 19, 474, 282);
    ctx.lineWidth = 2; ctx.strokeRect(28, 28, 456, 264);
    ctx.fillStyle = "#3d6279"; ctx.textAlign = "center"; ctx.font = '46px Georgia, serif'; ctx.fillText("THALASSA", 256, 126);
    ctx.font = '68px Georgia, serif'; ctx.fillText("03", 256, 222);
    for (let i = 0; i < 1300; i++) { ctx.fillStyle = "rgba(125,117,91,.07)"; ctx.fillRect(random() * 512, random() * 320, random() * 2, 1); }
  });
  const plaqueFace = add(new THREE.PlaneGeometry(.184, .106), new THREE.MeshStandardMaterial({ map: plaqueMap, roughness: .87 }), plaque); plaqueFace.position.z = .0081;

  // A second thin limewash reveal gives the facade depth, without altering its doorway.
  const reveals = group("layered-limewash-entry-reveal");
  const ring = new THREE.Shape(); ring.moveTo(.59, 0); ring.absarc(0, 0, .59, 0, Math.PI, false); ring.lineTo(-.555, 0); ring.absarc(0, 0, .555, Math.PI, 0, true); ring.closePath();
  const revealMat = material("#e6dfce", .97);
  const reveal = add(new THREE.ExtrudeGeometry(ring, { depth: .023, bevelEnabled: true, bevelSize: .003, bevelThickness: .003, bevelSegments: 3, steps: 1, curveSegments: 40 }), revealMat, reveals);
  reveal.position.set(.55, 1.665, 2.795);
  for (const x of [-.0225, 1.1225]) {
    const jamb = add(new RoundedBoxGeometry(.035, 1.665, .024, 3, .003), revealMat, reveals); jamb.position.set(x, .8325, 2.808);
  }
  for (const [left, right] of [[-2.3, .075], [1.025, 2.3]]) {
    const plinth = add(new RoundedBoxGeometry(right - left, .11, .025, 3, .005), plaster, reveals);
    plinth.position.set((left + right) / 2, .055, 2.807);
  }

  // Keep semantic groups, but bake fixed parts within each furnishing by material.
  for (const parent of [olive, climbing, textiles, lantern, plaque, reveals]) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of [...parent.children]) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || Array.isArray(child.material) || child.name) continue;
      const parts = batches.get(child.material) ?? []; parts.push(child); batches.set(child.material, parts);
    }
    for (const [mat, meshes] of batches) {
      if (meshes.length < 2) continue;
      const parts = meshes.map(mesh => { mesh.updateMatrix(); return (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrix); });
      const combined = mergeGeometries(parts);
      if (combined) {
        add(combined, mat, parent);
        for (const mesh of meshes) { parent.remove(mesh); mesh.geometry.dispose(); }
      }
      for (const part of parts) part.dispose();
    }
  }
  return courtyard;
}
