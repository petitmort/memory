import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** A quiet cast-bronze vessel: its silhouette and finish carry the detail. All units are metres. */
export function createClassicalVessel(): THREE.Group {
  const vessel = new THREE.Group();
  vessel.name = "classical-relief-amphora";
  const finishCanvas = document.createElement("canvas");
  const roughCanvas = document.createElement("canvas");
  const grainCanvas = document.createElement("canvas");
  for (const canvas of [finishCanvas, roughCanvas, grainCanvas]) canvas.width = canvas.height = 512;
  const finish = finishCanvas.getContext("2d")!;
  const rough = roughCanvas.getContext("2d")!;
  const grain = grainCanvas.getContext("2d")!;
  let seed = 34217;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  finish.fillStyle = "#b6a27b"; finish.fillRect(0, 0, 512, 512);
  rough.fillStyle = "#eeeeee"; rough.fillRect(0, 0, 512, 512);
  grain.fillStyle = "#808080"; grain.fillRect(0, 0, 512, 512);
  // Oxidation is sparse and low contrast; it does not become a second decorative pattern.
  for (let i = 0; i < 26; i++) {
    const x = random() * 512, y = random() * 512;
    finish.fillStyle = `rgba(91,113,95,${.018 + random() * .024})`;
    finish.beginPath(); finish.ellipse(x, y, 9 + random() * 30, 7 + random() * 19, random() * Math.PI, 0, Math.PI * 2); finish.fill();
    rough.fillStyle = "rgba(255,255,255,.14)";
    rough.beginPath(); rough.ellipse(x, y, 10 + random() * 25, 8 + random() * 20, 0, 0, Math.PI * 2); rough.fill();
  }
  for (let i = 0; i < 16000; i++) {
    const x = random() * 512, y = random() * 512;
    finish.fillStyle = i % 2 ? "rgba(242,222,183,.055)" : "rgba(80,72,54,.04)";
    finish.fillRect(x, y, .45 + random() * 1.1, .45 + random() * 1.1);
    grain.fillStyle = i % 2 ? "rgba(255,255,255,.10)" : "rgba(0,0,0,.10)";
    grain.fillRect(x, y, .55, .55);
  }
  const map = new THREE.CanvasTexture(finishCanvas); map.colorSpace = THREE.SRGBColorSpace;
  const roughnessMap = new THREE.CanvasTexture(roughCanvas), bumpMap = new THREE.CanvasTexture(grainCanvas);
  for (const texture of [map, roughnessMap, bumpMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  }
  const bronze = new THREE.MeshStandardMaterial({
    map, color: "#ffffff", roughnessMap, bumpMap, bumpScale: .00007,
    metalness: .40, roughness: .58,
  });
  const polished = bronze.clone(); polished.roughness = .47; polished.metalness = .44;
  const inside = new THREE.MeshStandardMaterial({ color: "#786c52", metalness: .30, roughness: .74 });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material = bronze) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = mesh.receiveShadow = true; vessel.add(mesh); return mesh;
  };
  const profile = [
    [0, 0], [.043, 0], [.049, .003], [.050, .009], [.045, .015], [.034, .020],
    [.031, .028], [.039, .044], [.055, .070], [.073, .115], [.085, .162],
    [.087, .194], [.083, .230], [.074, .266], [.062, .292], [.051, .308],
    [.049, .321], [.052, .335], [.062, .344], [.065, .349], [.065, .354],
    [.061, .358], [.057, .356], [.056, .350],
  ];
  const outline = new THREE.SplineCurve(profile.map(p => new THREE.Vector2(p[0], p[1])));
  add(new THREE.LatheGeometry(outline.getPoints(96), 96)).name = "amphora-smooth-cast-body";
  // A real dark interior continues below the lip rather than a flat plug at the mouth.
  const innerProfile = [
    [.056, .350], [.051, .340], [.045, .324], [.046, .310], [.057, .289],
    [.070, .264], [.079, .228], [.083, .194], [.081, .163], [.069, .117],
    [.051, .073], [.036, .049], [.026, .038], [0, .038],
  ];
  const innerOutline = new THREE.SplineCurve(innerProfile.map(p => new THREE.Vector2(p[0], p[1])));
  add(new THREE.LatheGeometry(innerOutline.getPoints(64), 80), inside).name = "amphora-open-interior";
  function line(radius: number, y: number, thickness: number) {
    const mesh = add(new THREE.TorusGeometry(radius, thickness, 10, 96), polished);
    mesh.rotation.x = Math.PI / 2; mesh.position.y = y;
  }
  line(.0475, .010, .0009);
  line(.0512, .308, .00065);
  line(.0626, .352, .0016);
  function handle(points: number[][], radius: number, segments: number) {
    const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const geometry = new THREE.TubeGeometry(path, segments, radius, 16, false);
    geometry.scale(1, 1, .67); // Rounded ribbon casting, not an octagonal pipe.
    return add(geometry, polished);
  }
  for (const sign of [-1, 1]) {
    handle([
      [.071, .249, 0], [.107, .260, 0], [.124, .293, 0], [.128, .339, 0],
      [.120, .383, 0], [.102, .402, 0], [.087, .393, 0], [.085, .376, 0], [.096, .368, 0],
    ].map(p => [p[0] * sign, p[1], p[2]]), .0044, 64);
    handle([[.085 * sign, .376, 0], [.076 * sign, .363, 0], [.062 * sign, .353, 0]], .0031, 20);
    const joint = add(new THREE.SphereGeometry(1, 16, 12), polished);
    joint.position.set(sign * .078, .249, 0); joint.scale.set(.0027, .010, .007);
  }

  // Three finishes, three draw calls; no tiny figure geometry competes with the room.
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...vessel.children]) if (child instanceof THREE.Mesh && !Array.isArray(child.material)) {
    const list = batches.get(child.material) ?? []; list.push(child); batches.set(child.material, list);
  }
  for (const [material, meshes] of batches) {
    const pieces = meshes.map(mesh => { mesh.updateMatrix(); return mesh.geometry.clone().applyMatrix4(mesh.matrix); });
    const geometry = mergeGeometries(pieces);
    if (geometry) {
      const combined = add(geometry, material);
      combined.name = material === inside ? "amphora-shadowed-interior" : material === polished ? "amphora-cast-handles-and-lip" : "amphora-quiet-bronze-body";
      for (const mesh of meshes) { vessel.remove(mesh); mesh.geometry.dispose(); }
    }
    for (const piece of pieces) piece.dispose();
  }
  vessel.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(vessel, true);
  for (const child of vessel.children) if (child instanceof THREE.Mesh) child.geometry.translate(0, -bounds.min.y, 0);
  vessel.userData.displayHeight = bounds.max.y - bounds.min.y;
  return vessel;
}
