import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/** A compact walnut record player, authored in metres with its feet at Y=0. */
export function createRecordPlayer() {
  const group = new THREE.Group();
  group.name = "record-player";
  group.userData.dimensions = { width: .40, depth: .391, height: .402 };
  group.userData.baseFootprint = { width: .40, depth: .34 };
  group.userData.supportY = 0;
  group.userData.rpm = 100 / 3;
  const textures: THREE.CanvasTexture[] = [];
  function texture(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    draw(ctx);
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    textures.push(map);
    return map;
  }
  const timber = texture(256, 128, ctx => {
    ctx.fillStyle = "#926b46"; ctx.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 180; i++) {
      const y = i * 128 / 180;
      ctx.strokeStyle = i % 4 ? "rgba(38,24,16,.11)" : "rgba(207,163,110,.14)";
      ctx.lineWidth = i % 5 ? .45 : .8;
      ctx.beginPath(); ctx.moveTo(0, y);
      ctx.bezierCurveTo(65, y + Math.sin(i * .7) * 2, 150, y + Math.cos(i * .41) * 2, 256, y);
      ctx.stroke();
    }
    // Low contrast pores follow the grain instead of a large tiled wood pattern.
    for (let i = 0; i < 360; i++) {
      ctx.fillStyle = "rgba(32,19,13,.08)";
      ctx.fillRect((i * 67.17) % 256, (i * 31.13) % 128, 1.5 + i % 4, .4);
    }
  });
  const grooves = texture(256, 256, ctx => {
    ctx.fillStyle = "#171b1b"; ctx.fillRect(0, 0, 256, 256);
    for (let r = 42; r < 126; r += 1.35) {
      ctx.strokeStyle = Math.floor(r) % 7 ? "rgba(121,134,131,.10)" : "rgba(7,11,12,.24)";
      ctx.lineWidth = .45;
      ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = "#bba474";
    ctx.beginPath(); ctx.arc(128, 128, 37, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#71654a"; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.arc(128, 128, 33, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = "#34494a"; ctx.textAlign = "center";
    ctx.font = "9px Georgia,serif"; ctx.fillText("SIDE A", 128, 112);
    ctx.font = "6px Georgia,serif"; ctx.fillText("33 ⅓ · MONO", 128, 147);
    ctx.fillStyle = "rgba(53,68,64,.55)"; ctx.fillRect(115, 153, 26, .8);
    ctx.fillStyle = "#1b2422";
    ctx.beginPath(); ctx.arc(128, 128, 3, 0, Math.PI * 2); ctx.fill();
  });
  // Vinyl grooves reflect along their circular tangent. A flat isotropic
  // highlight would wash the entire record white from the room camera.
  const grooveDirection = texture(64, 64, ctx => {
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const dx = x - 31.5, dy = y - 31.5, length = Math.hypot(dx, dy);
      const red = Math.round(127.5 - dy / length * 127.5);
      const green = Math.round(127.5 + dx / length * 127.5);
      ctx.fillStyle = `rgb(${red},${green},255)`;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  if (grooveDirection) grooveDirection.colorSpace = THREE.NoColorSpace;
  const wood = new THREE.MeshStandardMaterial({ map: timber, bumpMap: timber, bumpScale: .00012, roughness: .71 });
  const dark = new THREE.MeshStandardMaterial({ color: "#252c29", roughness: .73 });
  const bronze = new THREE.MeshStandardMaterial({ color: "#a18a62", roughness: .46, metalness: .64 });
  const silver = new THREE.MeshStandardMaterial({ color: "#b8b9b2", roughness: .35, metalness: .72 });
  const smokedGlass = new THREE.MeshPhysicalMaterial({ color: "#a5927e", transparent: true, opacity: .18,
    roughness: .18, metalness: 0, clearcoat: .28, clearcoatRoughness: .16,
    depthWrite: false, side: THREE.DoubleSide });
  const vinyl = new THREE.MeshPhysicalMaterial({ map: grooves, roughness: .44, metalness: .06,
    specularIntensity: .08, anisotropy: .8, anisotropyMap: grooveDirection });
  const labelMaterial = new THREE.MeshStandardMaterial({ map: grooves, roughness: .95 });
  const indicator = new THREE.MeshStandardMaterial({ color: "#76623e", emissive: "#dcaf61", emissiveIntensity: 0, roughness: .45 });
  const materials = [wood, dark, bronze, silver, smokedGlass, vinyl, labelMaterial, indicator];
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  function addPart(geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0,
    rotation?: THREE.Euler) {
    if (rotation) geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(rotation));
    geometry.translate(x, y, z);
    let batch = batches.get(material);
    if (!batch) { batch = []; batches.set(material, batch); }
    batch.push(geometry);
  }
  const rounded = (w: number, h: number, d: number, radius = .003) => new RoundedBoxGeometry(w, h, d, 2, radius);
  // A visible lower rebate and four rubber feet keep the case grounded.
  for (const x of [-.16, .16]) for (const z of [-.13, .13])
    addPart(new THREE.CylinderGeometry(.013, .014, .013, 12), dark, x, .0065, z);
  addPart(rounded(.386, .011, .326, .003), dark, 0, .0185, 0);
  addPart(rounded(.40, .064, .34, .009), wood, 0, .054, 0);
  addPart(rounded(.395, .009, .335, .004), wood, 0, .089, 0);
  addPart(rounded(.374, .0035, .314, .003), dark, 0, .095, 0);

  // Keep the walnut fascia quiet, with a single small machined control.
  addPart(new THREE.CylinderGeometry(.011, .011, .009, 24), silver, .149, .052, .174,
    new THREE.Euler(Math.PI / 2, 0, 0));
  // The knob's machined radial cuts are small physical notches, merged once.
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI * 2 / 16;
    addPart(new THREE.BoxGeometry(.0007, .0007, .005), dark,
      .149 + Math.cos(angle) * .0109, .052 + Math.sin(angle) * .0109, .174);
  }
  addPart(new THREE.CylinderGeometry(.0013, .0013, .003, 8), dark, .149, .058, .179,
    new THREE.Euler(Math.PI / 2, 0, 0));

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .0016, 64), vinyl);
  disc.name = "record-disc";
  disc.position.set(-.019, .1026, -.004);
  disc.castShadow = disc.receiveShadow = true;
  group.add(disc);
  const labelGeometry = new THREE.CircleGeometry(.043, 64);
  const labelUV = labelGeometry.getAttribute("uv");
  for (let i = 0; i < labelUV.count; i++)
    labelUV.setXY(i, .5 + (labelUV.getX(i) - .5) * .285, .5 + (labelUV.getY(i) - .5) * .285);
  const label = new THREE.Mesh(labelGeometry, labelMaterial);
  label.name = "record-paper-label";
  label.rotation.x = -Math.PI / 2;
  label.position.y = .00095;
  label.receiveShadow = true;
  disc.add(label);
  // The concentric platter rim and spindle stay static, so spinning the
  // circular record does not invalidate the room's cached shadow map.
  addPart(new THREE.CylinderGeometry(.152, .152, .004, 64), silver, -.019, .0994, -.004);
  addPart(new THREE.CylinderGeometry(.0018, .002, .010, 12), silver, -.019, .1068, -.004);

  const pivotX = .163, pivotZ = -.110;
  const restAngle = .38;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .006, -.019), new THREE.Vector3(-.007, .009, .020),
    new THREE.Vector3(-.028, .008, .061), new THREE.Vector3(-.033, .002, .105),
    new THREE.Vector3(-.073, -.003, .178),
  ]);
  addPart(new THREE.CylinderGeometry(.014, .017, .015, 20), dark, pivotX, .105, pivotZ);
  addPart(new THREE.CylinderGeometry(.010, .011, .007, 20), silver, pivotX, .116, pivotZ);
  // The parked tube rests in a small fork behind the cartridge. Derive its
  // support from the actual parked curve, rather than leaving a short peg
  // below the arm or letting a taller peg intersect the cartridge housing.
  const rest = curve.getPoint(.88).applyAxisAngle(new THREE.Vector3(0, 1, 0), restAngle)
    .add(new THREE.Vector3(pivotX, .124, pivotZ));
  const restBottom = .09675, restTop = rest.y - .0027;
  addPart(new THREE.CylinderGeometry(.0025, .0028, restTop - restBottom, 12), silver,
    rest.x, (restTop + restBottom) / 2, rest.z);
  for (const side of [-1, 1])
    addPart(new THREE.BoxGeometry(.0007, .0038, .003), silver, rest.x + side * .00305, restTop + .0012, rest.z);
  // Four countersunk screw heads sit in the deck, without floating above it.
  for (const x of [-.176, .176]) for (const z of [-.143, .143])
    addPart(new THREE.CylinderGeometry(.0024, .0024, .0007, 10), silver, x, .0971, z);
  for (const x of [-.14, .14]) {
    addPart(rounded(.024, .012, .012, .002), dark, x, .091, -.170);
    addPart(new THREE.CylinderGeometry(.004, .004, .026, 12), silver, x, .098, -.170,
      new THREE.Euler(0, 0, Math.PI / 2));
  }

  for (const [material, pieces] of batches) {
    const plain = pieces.map(piece => piece.index ? piece.toNonIndexed() : piece.clone());
    const geometry = mergeGeometries(plain, false)!;
    for (const piece of pieces) piece.dispose();
    for (const piece of plain) piece.dispose();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = material === wood ? "record-player-walnut-case" : "record-player-fittings";
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }

  const arm = new THREE.Group();
  arm.name = "record-player-tonearm";
  arm.position.set(pivotX, .120, pivotZ);
  group.add(arm);
  const armMetalParts: THREE.BufferGeometry[] = [new THREE.TubeGeometry(curve, 30, .0027, 8, false)];
  const counterweight = new THREE.CylinderGeometry(.0095, .0095, .018, 20);
  counterweight.rotateX(Math.PI / 2); counterweight.translate(.001, .006, -.026);
  armMetalParts.push(counterweight);
  const needle = new THREE.CylinderGeometry(.00055, .00035, .0035, 8);
  needle.translate(-.073, -.0147, .178); armMetalParts.push(needle);
  const armMetalPlain = armMetalParts.map(part => part.toNonIndexed());
  const armMetal = new THREE.Mesh(mergeGeometries(armMetalPlain, false)!, silver);
  for (const part of [...armMetalParts, ...armMetalPlain]) part.dispose();
  armMetal.castShadow = armMetal.receiveShadow = true; arm.add(armMetal);
  const cartridge = new THREE.Mesh(rounded(.012, .009, .019, .0016), dark);
  cartridge.name = "record-player-cartridge";
  cartridge.position.set(-.073, -.0085, .174);
  cartridge.castShadow = cartridge.receiveShadow = true; arm.add(cartridge);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.0022, 10, 6), indicator);
  lamp.name = "record-player-playing-light";
  lamp.position.set(.116, .053, .172); group.add(lamp);

  // Thin smoked acrylic, hinged at the actual rear edge. This is a transparent
  // dust cover, not an opaque back board or a large gramophone horn.
  const lid = new THREE.Group(); lid.name = "record-player-dust-lid";
  lid.position.set(0, .098, -.170); lid.rotation.x = -55 * Math.PI / 180;
  lid.userData.openDegrees = 55;
  const panes = [
    new THREE.BoxGeometry(.397, .0025, .337).translate(0, .047, .1685),
    new THREE.BoxGeometry(.0025, .047, .337).translate(-.19725, .0235, .1685),
    new THREE.BoxGeometry(.0025, .047, .337).translate(.19725, .0235, .1685),
    new THREE.BoxGeometry(.392, .047, .0025).translate(0, .0235, .33575),
    new THREE.BoxGeometry(.392, .047, .0025).translate(0, .0235, .00125),
  ];
  const lidMesh = new THREE.Mesh(mergeGeometries(panes, false)!, smokedGlass);
  for (const pane of panes) pane.dispose();
  lidMesh.name = "record-player-smoked-acrylic";
  lidMesh.castShadow = false; lidMesh.receiveShadow = false;
  lid.add(lidMesh); group.add(lid);

  let playing = false, disposed = false, armMix = 0, lastTime: number | null = null;
  arm.rotation.y = restAngle;
  arm.position.y = .124;
  return {
    group,
    setPlaying(value: boolean) {
      if (disposed) return;
      playing = value;
      group.userData.playing = playing;
      indicator.emissiveIntensity = value ? .55 : 0;
      indicator.color.set(value ? "#c2a36a" : "#76623e");
    },
    update(time: number, reduced: boolean) {
      if (disposed || !Number.isFinite(time)) return false;
      const delta = lastTime === null ? 0 : Math.max(0, time - lastTime);
      lastTime = time;
      if (playing && !reduced) disc.rotation.y = (disc.rotation.y - delta * Math.PI * 10 / 9) % (Math.PI * 2);
      const target = playing ? 1 : 0, previous = armMix;
      armMix = reduced ? target : THREE.MathUtils.lerp(armMix, target, 1 - Math.exp(-Math.min(delta, .1) * 8));
      if (Math.abs(armMix - target) < .0001) armMix = target;
      arm.rotation.y = restAngle * (1 - armMix);
      arm.position.y = .120 + .004 * (1 - armMix);
      return Math.abs(armMix - previous) > 1e-7;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      for (const material of materials) material.dispose();
      for (const map of textures) map.dispose();
      group.clear();
    },
  };
}
