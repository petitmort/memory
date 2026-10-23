import * as THREE from "three";

type CurtainWindow = {
  width: number;
  height: number;
  sill: number;
  back: number;
};

/** Voile with openwork floral lace. The fabric and lace are one continuous surface. */
export function createCurtains({ width, height, sill, back }: CurtainWindow) {
  const group = new THREE.Group();
  group.name = "aqua-lace-curtains";
  const rodHeight = sill + height + 0.06;
  const length = rodHeight - 0.025;
  const texture = voileTexture();
  const material = new THREE.MeshPhysicalMaterial({
    color: "#e1faf5",
    map: texture,
    transparent: true,
    opacity: 0.94,
    alphaTest: 0.025,
    depthWrite: false,
    forceSinglePass: true,
    side: THREE.DoubleSide,
    roughness: 0.82,
    sheen: 0.36,
    sheenRoughness: 0.8,
    sheenColor: new THREE.Color("#eef9ec"),
    bumpMap: texture,
    bumpScale: 0.00025,
  });

  const panels: {
    side: number;
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
    coordinates: Float32Array;
    rest: Float64Array;
  }[] = [];
  const columns = 28;
  const rows = 54;
  for (const side of [-1, 1]) {
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
    const uv = new Float32Array((columns + 1) * (rows + 1) * 2);
    const coordinates = new Float32Array((columns + 1) * (rows + 1) * 2);
    const indices: number[] = [];
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= columns; col++) {
        const index = row * (columns + 1) + col;
        const u = col / columns;
        const v = row / rows;
        coordinates[index * 2] = u;
        coordinates[index * 2 + 1] = v;
        // The same lace texture faces the inner opening on both panels.
        uv[index * 2] = side < 0 ? u : 1 - u;
        uv[index * 2 + 1] = 1 - v;
        if (row < rows && col < columns) {
          const a = index;
          const b = index + columns + 1;
          indices.push(a, b, a + 1, b, b + 1, a + 1);
        }
      }
    }
    // Rest positions and freedom depend only on the cloth coordinates. Keep
    // their double precision so the animated positions retain the same formula.
    const rest = new Float64Array(positions.length / 3 * 4);
    for (let i = 0; i < positions.length / 3; i++) {
      const u = coordinates[i * 2];
      const v = coordinates[i * 2 + 1];
      const fabricWidth = 0.56 + 0.16 * Math.sin(v * Math.PI * 0.5);
      const folds = Math.sin(u * Math.PI * 12 + v * 0.7) * (0.029 + v * 0.009);
      const scallop = Math.pow(v, 16) * 0.009 * (0.5 + 0.5 * Math.cos(u * Math.PI * 16));
      rest[i * 4] = side * (width / 2 - 0.035) + (u - 0.5) * fabricWidth;
      rest[i * 4 + 1] = rodHeight - v * length + scallop;
      rest[i * 4 + 2] = back + 0.3 + folds + 0.06 * v * v;
      rest[i * 4 + 3] = Math.pow(v, 1.65);
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("normal", new THREE.BufferAttribute(new Float32Array(positions.length), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = side < 0 ? "left-voile-panel" : "right-voile-panel";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    group.add(mesh);
    panels.push({ side, mesh, coordinates, rest });
  }

  let lastTime = -1;
  function update(time: number, reducedMotion: boolean) {
    // Reduced motion retains an almost imperceptible natural breathing of the cloth.
    const t = time * (reducedMotion ? 0.16 : 1);
    if (Math.abs(t - lastTime) < 1 / 65 && lastTime >= 0) return;
    lastTime = t;
    for (const { side, mesh, coordinates, rest } of panels) {
      const positions = mesh.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const u = coordinates[i * 2];
        const v = coordinates[i * 2 + 1];
        const free = rest[i * 4 + 3];
        const phase = side * 1.9;
        const breath =
          (0.064 * Math.sin(t * 0.74 + v * 4.1 + u * 2.2 + phase) +
            0.025 * Math.sin(t * 1.31 - v * 3.7 + u * 8.7 - phase)) *
          free;
        const drift =
          0.022 * free * Math.sin(t * 0.93 + u * 5.4 + v * 2.1 + phase);
        positions.setXYZ(
          i,
          rest[i * 4] + drift,
          rest[i * 4 + 1] + 0.006 * free * Math.sin(t * 1.2 + u * 9 + phase),
          rest[i * 4 + 2] + breath,
        );
      }
      positions.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }
  update(0, false);
  return { group, update };
}

/** Color and alpha are painted together so the lace is genuine openwork, not a solid decal. */
function voileTexture() {
  const canvas = document.createElement("canvas");
  const w = 512;
  const h = 1024;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(165,211,205,0.36)";
  ctx.fillRect(0, 0, w, h);

  // Very fine crossing threads: restrained enough to avoid a busy screen-door pattern.
  for (let x = 0; x < w; x += 3) {
    ctx.fillStyle =
      x % 9 === 0 ? "rgba(230,247,239,.085)" : "rgba(235,249,244,.035)";
    ctx.fillRect(x, 0, 0.6, h);
  }
  for (let y = 0; y < h; y += 4) {
    ctx.fillStyle = "rgba(238,249,239,.045)";
    ctx.fillRect(0, y, w, 0.7);
  }

  // Open areas in the border reveal the sea and the room behind the lace.
  const bottom = h - 58;
  const inner = w - 42;
  ctx.clearRect(inner, 0, 42, h);
  ctx.clearRect(0, bottom, w, h - bottom);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(242,244,221,.78)";
  ctx.lineWidth = 1.25;

  function flower(x: number, y: number, r: number) {
    for (let petal = 0; petal < 6; petal++) {
      const angle = (petal / 6) * Math.PI * 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.ellipse(r * 0.55, 0, r * 0.55, r * 0.25, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  function chain(x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // A narrow, floral Valenciennes-style trim down the free vertical edge.
  for (let y = 5; y < h; y += 30) {
    flower(inner + 22, y + 11, 9);
    ctx.beginPath();
    ctx.moveTo(inner + 8, y - 4);
    ctx.bezierCurveTo(inner + 20, y + 4, inner + 2, y + 16, inner + 11, y + 27);
    ctx.stroke();
    chain(inner + 11, y + 27, inner + 34, y + 29);
    chain(inner + 3, y + 10, inner + 12, y + 17);
    chain(inner + 12, y + 17, inner + 4, y + 25);
  }
  // A scalloped bottom edge with small flowers, picots and open diamond mesh.
  for (let x = 0; x < w; x += 48) {
    ctx.lineWidth = 0.7;
    ctx.strokeStyle = "rgba(226,239,218,.48)";
    for (let j = 0; j < 4; j++) {
      const a = x + j * 12;
      chain(a, bottom + 3, a + 12, bottom + 18);
      chain(a + 12, bottom + 18, a + 24, bottom + 3);
      chain(a, bottom + 26, a + 12, bottom + 41);
      chain(a + 12, bottom + 41, a + 24, bottom + 26);
    }
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = "rgba(246,244,222,.82)";
    flower(x + 24, bottom + 27, 11);
    ctx.beginPath();
    ctx.moveTo(x, bottom + 31);
    ctx.bezierCurveTo(x + 10, h - 5, x + 38, h - 5, x + 48, bottom + 31);
    ctx.stroke();
    for (let j = 0; j < 4; j++) {
      ctx.beginPath();
      ctx.arc(x + 9 + j * 10, h - 11, 1.8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  // Sewn hems and two delicate lines above the bottom lace band.
  ctx.strokeStyle = "rgba(226,241,223,.67)";
  ctx.lineWidth = 1.3;
  chain(2, 0, 2, bottom);
  chain(inner + 1, 0, inner + 1, bottom);
  chain(inner + 4, 0, inner + 4, bottom);
  chain(0, bottom - 4, w, bottom - 4);
  chain(0, bottom - 1, w, bottom - 1);
  ctx.fillStyle = "rgba(193,224,210,.4)";
  ctx.fillRect(0, 0, w, 9);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
