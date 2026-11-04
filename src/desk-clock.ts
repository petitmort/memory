import * as THREE from "three";
import { clockReading } from "./desk-clock-time";

type Reading = ReturnType<typeof clockReading>;
const FLIP_MS = 700;
const MINUTE_MS = 60_000;
const ATLAS_WIDTH = 2048, ATLAS_HEIGHT = 1024, ROW_HEIGHT = 512;
const tiles = [{ x: 0, width: 512 }, { x: 512, width: 512 }, { x: 1024, width: 1024 }];

/** A physical split-flap clock. Its feet touch y=0 and its face looks toward +Z. */
export function createDeskClock() {
  const group = new THREE.Group(); group.name = "desk-calendar-clock";
  const warmObjects: THREE.Object3D[] = [group];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  // Shared by static halves and moving leaves: the lower edge is the hinge.
  const halfPage = new THREE.PlaneGeometry(1, 1); halfPage.translate(0, .5, 0);
  const geometries = [cube, halfPage];
  const materials: THREE.Material[] = [];
  const metal = new THREE.MeshStandardMaterial({ color: "#474c4b", metalness: .55, roughness: .58 });
  const recess = new THREE.MeshStandardMaterial({ color: "#101413", roughness: .95 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#202522", roughness: 1 });
  const markings = new THREE.MeshStandardMaterial({ color: "#d9ded8", roughness: .9 });
  materials.push(metal, recess, rubber, markings);
  type Block = readonly [number, number, number, number, number, number];
  const blocks = (name: string, material: THREE.Material, parts: readonly Block[]) => {
    const mesh = new THREE.InstancedMesh(cube, material, parts.length);
    mesh.name = name;
    const transform = new THREE.Matrix4(), position = new THREE.Vector3(), size = new THREE.Vector3();
    for (let i = 0; i < parts.length; i++) {
      const [x, y, z, width, height, depth] = parts[i];
      position.set(x, y, z); size.set(width, height, depth);
      transform.compose(position, new THREE.Quaternion(), size); mesh.setMatrixAt(i, transform);
    }
    mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
    group.add(mesh); return mesh;
  };
  // The shallow inset and substantial side rails make the clock a desk object,
  // rather than a floating text plane. The static shell stays inside .36×.18×.095m.
  blocks("clock-brushed-metal-case", metal, [
    [0, .097, -.005, .36, .166, .085],
    [-.1725, .097, .042, .015, .166, .011], [.1725, .097, .042, .015, .166, .011],
    [0, .1725, .042, .33, .015, .011], [0, .0195, .042, .33, .011, .011],
  ]);
  blocks("clock-recess-and-hinges", recess, [
    [0, .096, .0377, .333, .145, .0025],
    [-.0805, .112, .0429, .145, .001, .001], [.0805, .112, .0429, .145, .001, .001],
    [0, .036, .0429, .306, .00065, .001],
    [-.155, .112, .044, .004, .006, .003], [-.006, .112, .044, .004, .006, .003],
    [.006, .112, .044, .004, .006, .003], [.155, .112, .044, .004, .006, .003],
  ]);
  blocks("clock-rubber-feet", rubber, [
    [-.119, .006, -.004, .055, .012, .069], [.119, .006, -.004, .055, .012, .069],
  ]);
  blocks("clock-colon", markings, [[0, .13, .0428, .0035, .005, .001], [0, .094, .0428, .0035, .005, .001]]);

  const canvas = document.createElement("canvas"); canvas.width = ATLAS_WIDTH; canvas.height = ATLAS_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    throw new Error("The desk clock needs a 2D canvas context.");
  }
  const atlas = new THREE.CanvasTexture(canvas);
  atlas.name = "desk-clock-current-previous-atlas";
  atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
  atlas.minFilter = THREE.LinearMipmapLinearFilter; atlas.magFilter = THREE.LinearFilter;
  let atlasUpdates = 0;
  function drawRow(reading: Reading, row: number) {
    const values = [reading.hour, reading.minute, reading.date];
    for (let index = 0; index < tiles.length; index++) {
      const tile = tiles[index], top = row * ROW_HEIGHT;
      context!.save(); context!.beginPath(); context!.rect(tile.x, top, tile.width, ROW_HEIGHT); context!.clip();
      const background = context!.createLinearGradient(0, top, 0, top + ROW_HEIGHT);
      background.addColorStop(0, "#171c1a"); background.addColorStop(.49, "#111614"); background.addColorStop(1, "#1c211e");
      context!.fillStyle = background; context!.fillRect(tile.x, top, tile.width, ROW_HEIGHT);
      context!.fillStyle = "#efeee5"; context!.textAlign = "center"; context!.textBaseline = "middle";
      context!.translate(tile.x + tile.width / 2, top + ROW_HEIGHT / 2 + (index < 2 ? 14 : 2));
      if (index < 2) {
        context!.scale(.78, 1);
        context!.font = '200 444px "Helvetica Neue", "Arial Narrow", Arial, sans-serif';
        context!.fillText(values[index], 0, 0, 590);
      } else {
        // This wide physical strip shares a square atlas row. Compensate its
        // aspect ratio so Chinese glyphs stay upright instead of flattening.
        context!.scale(.027 * tile.width / (.306 * ROW_HEIGHT), 1);
        context!.font = '400 400px "PingFang SC", "Microsoft YaHei", sans-serif';
        context!.fillText(values[index], 0, 0);
      }
      context!.restore();
    }
  }
  function paint(previous: Reading, current: Reading) {
    drawRow(previous, 0); drawRow(current, 1); atlas.needsUpdate = true; atlasUpdates++;
  }
  // Canvas rows run downwards, while the texture's v axis runs upwards.
  const rectangle = (index: number, row: number, upper: boolean, reverseV = false) => {
    const tile = tiles[index];
    const start = 1 - row * .5 - (upper ? .25 : .5);
    return new THREE.Vector4(tile.x / ATLAS_WIDTH, tile.width / ATLAS_WIDTH,
      reverseV ? start + .25 : start, reverseV ? -.25 : .25);
  };
  function faceMaterial(index: number, row: number, upper: boolean, moving = false) {
    const front = { value: rectangle(index, row, upper) };
    // A leaf turns around X: x stays unchanged and v must reverse on its back.
    const back = { value: rectangle(index, 1, false, true) };
    const material = new THREE.MeshStandardMaterial({
      map: atlas, color: "#efefe9", roughness: .96, metalness: 0,
      side: moving ? THREE.DoubleSide : THREE.FrontSide,
    });
    material.name = moving ? `clock-flap-two-sided-${index}` : `clock-static-${index}-${upper ? "upper" : "lower"}`;
    material.onBeforeCompile = shader => {
      shader.uniforms.clockFrontRect = front; shader.uniforms.clockBackRect = back;
      shader.fragmentShader = `uniform vec4 clockFrontRect;\nuniform vec4 clockBackRect;\n${shader.fragmentShader}`;
      shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `
        vec4 clockRect = ${moving ? "gl_FrontFacing ? clockFrontRect : clockBackRect" : "clockFrontRect"};
        vec2 clockUV = vec2(clockRect.x + vMapUv.x * clockRect.y, clockRect.z + vMapUv.y * clockRect.w);
        diffuseColor *= texture2D(map, clockUV);
      `);
    };
    material.customProgramCacheKey = () => moving ? "desk-clock-flap-v1" : "desk-clock-static-v1";
    materials.push(material); return { material, front, back };
  }
  const cells = [
    { name: "hours", x: -.0805, y: .112, width: .145, height: .103 },
    { name: "minutes", x: .0805, y: .112, width: .145, height: .103 },
    { name: "date", x: 0, y: .036, width: .306, height: .027 },
  ].map((layout, index) => {
    const upper = faceMaterial(index, 1, true), lower = faceMaterial(index, 1, false), turning = faceMaterial(index, 0, true, true);
    const gap = index === 2 ? .00065 : .001;
    const height = layout.height / 2 - gap / 2;
    const top = new THREE.Mesh(halfPage, upper.material);
    top.name = `clock-${layout.name}-upper`; top.position.set(layout.x, layout.y + gap / 2, .042);
    top.scale.set(layout.width, height, 1);
    const bottom = new THREE.Mesh(halfPage, lower.material);
    bottom.name = `clock-${layout.name}-lower`; bottom.position.set(layout.x, layout.y - layout.height / 2, .042);
    bottom.scale.set(layout.width, height, 1);
    const pivot = new THREE.Group(); pivot.name = `clock-${layout.name}-hinge`; pivot.position.set(layout.x, layout.y, .043);
    const leaf = new THREE.Mesh(halfPage, turning.material); leaf.name = `clock-${layout.name}-turning-leaf`;
    leaf.position.y = gap / 2; leaf.scale.set(layout.width, height, 1); pivot.add(leaf); pivot.visible = false;
    group.add(top, bottom, pivot); warmObjects.push(top, bottom, pivot, leaf);
    return { index, name: layout.name, upper, lower, turning, pivot, active: false };
  });
  let reading = clockReading(Date.now()), previous = reading;
  paint(reading, reading);
  let initialized = false, mustResync = false, disposed = false;
  let lastMinute = NaN, lastTimestamp = NaN, lastAnimation = NaN, startedAt = 0;
  let flipping = false, progress = 1, angle = Math.PI;

  function settle() {
    flipping = false; progress = 1; angle = Math.PI;
    for (const cell of cells) {
      cell.active = false; cell.pivot.visible = false; cell.pivot.rotation.x = Math.PI;
      cell.lower.front.value.copy(rectangle(cell.index, 1, false));
    }
  }
  function update(timestampMs: number, animationMs: number, reduced: boolean) {
    if (disposed) return;
    if (!Number.isFinite(timestampMs) || Math.abs(timestampMs) > 8.64e15)
      throw new RangeError("Clock time must be finite and representable.");
    const animation = Number.isFinite(animationMs) ? animationMs : lastAnimation || 0;
    const minute = Math.floor(timestampMs / MINUTE_MS);
    const backwards = initialized && timestampMs < lastTimestamp;
    const animationReset = initialized && animation < lastAnimation;
    if (!initialized || minute !== lastMinute || mustResync || backwards) {
      const next = clockReading(timestampMs);
      const changed = next.key !== reading.key;
      const consecutive = minute - lastMinute === 1
        && Date.parse(`${next.key}Z`) - Date.parse(`${reading.key}Z`) === MINUTE_MS;
      const animate = initialized && !mustResync && !backwards && !animationReset && !reduced
        && consecutive && timestampMs - lastTimestamp <= 1500
        && Math.abs((timestampMs - lastTimestamp) - (animation - lastAnimation)) <= 1500;
      previous = reading; reading = next;
      if (changed || !initialized) paint(animate ? previous : reading, reading);
      settle();
      if (animate && changed) {
        const before = [previous.hour, previous.minute, previous.date], after = [reading.hour, reading.minute, reading.date];
        for (const cell of cells) {
          cell.active = before[cell.index] !== after[cell.index];
          if (!cell.active) continue;
          cell.lower.front.value.copy(rectangle(cell.index, 0, false));
          cell.pivot.visible = true; cell.pivot.rotation.x = 0;
        }
        flipping = true; progress = 0; angle = 0; startedAt = animation;
      }
      initialized = true; mustResync = false; lastMinute = minute;
    }
    if (flipping) {
      if (reduced || animationReset || backwards) settle();
      else {
        progress = THREE.MathUtils.clamp((animation - startedAt) / FLIP_MS, 0, 1);
        const eased = progress * progress * (3 - 2 * progress);
        angle = Math.PI * eased;
        for (const cell of cells) if (cell.active) cell.pivot.rotation.x = angle;
        if (progress === 1) settle();
      }
    }
    lastTimestamp = timestampMs; lastAnimation = animation;
  }
  return {
    group, warmObjects, update,
    resume() { if (!disposed) mustResync = true; },
    snapshot() {
      return {
        reading: { ...reading }, current: { ...reading }, previous: { ...previous },
        flipping, progress, angle, durationMs: FLIP_MS, atlasUpdates, disposed,
        cells: cells.map(cell => ({ name: cell.name, active: cell.active, angle: cell.pivot.rotation.x, visible: cell.pivot.visible })),
      };
    },
    dispose() {
      if (disposed) return;
      disposed = true; flipping = false;
      group.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      atlas.dispose(); group.removeFromParent(); group.clear();
    },
  };
}
