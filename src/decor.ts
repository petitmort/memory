import * as THREE from "three";

/** Curated, full-size furnishings; every length is expressed in metres. */
export function createDecor(): THREE.Group {
  const decor = new THREE.Group();
  decor.name = "mediterranean-furnishings";
  let seed = 41;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const material = (color: string, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const walnut = material("#70543d"),
    brass = material("#ac8b55", 0.4, 0.55),
    linen = material("#e8e2cf");
  function box(
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = decor,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function tube(
    points: THREE.Vector3[],
    radius: number,
    m: THREE.Material,
    parent: THREE.Object3D = decor,
    segments = 24,
  ) {
    const mesh = new THREE.Mesh(
      new THREE.TubeGeometry(
        new THREE.CatmullRomCurve3(points),
        segments,
        radius,
        7,
        false,
      ),
      m,
    );
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function texture(
    width: number,
    height: number,
    paint: (c: CanvasRenderingContext2D) => void,
  ) {
    const c = document.createElement("canvas");
    c.width = width;
    c.height = height;
    paint(c.getContext("2d")!);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  }
  const bluePaint = texture(256, 512, (c) => {
    c.fillStyle = "#335c85";
    c.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 650; i++) {
      const x = random() * 256;
      c.strokeStyle =
        random() > 0.3 ? "rgba(13,40,63,.08)" : "rgba(218,211,179,.11)";
      c.lineWidth = 0.3 + random() * 1.3;
      c.beginPath();
      c.moveTo(x, 0);
      c.bezierCurveTo(x + 3, 170, x - 4, 320, x + 1, 512);
      c.stroke();
    }
    for (let i = 0; i < 95; i++) {
      c.fillStyle = "rgba(205,193,158,.22)";
      c.fillRect(
        random() * 256,
        random() * 512,
        0.5 + random() * 2,
        2 + random() * 9,
      );
    }
  });
  const blue = new THREE.MeshStandardMaterial({
    map: bluePaint,
    roughness: 0.88,
    color: "#d6dde2",
  });
  const shutterSet = new THREE.Group();
  shutterSet.name = "aged-cobalt-shutters";
  decor.add(shutterSet);
  const louverMatrices: THREE.Matrix4[] = [];
  const helper = new THREE.Object3D();
  for (const side of [-1, 1]) {
    const panel = new THREE.Group();
    panel.position.set(side * 1.81, 1.65, -2.575);
    panel.rotation.y = side * 0.045;
    shutterSet.add(panel);
    box(0.54, 1.64, 0.022, blue, 0, 0, 0, panel);
    for (const x of [-0.245, 0.245])
      box(0.05, 1.64, 0.035, blue, x, 0, 0.025, panel);
    for (const y of [-0.795, 0, 0.795])
      box(0.46, 0.05, 0.035, blue, 0, y, 0.026, panel);
    for (let i = 0; i < 28; i++) {
      helper.position.set(0, -0.73 + i * 0.054, 0.043);
      helper.rotation.set(-0.42, 0, 0);
      helper.scale.set(1, 1, 1);
      helper.updateMatrix();
      panel.updateMatrix();
      louverMatrices.push(panel.matrix.clone().multiply(helper.matrix));
    }
    for (const y of [1.11, 2.17])
      box(0.065, 0.025, 0.012, brass, side * 1.53, y, -2.525, shutterSet);
  }
  const louvers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.43, 0.035, 0.018),
    blue,
    louverMatrices.length,
  );
  louverMatrices.forEach((m, i) => louvers.setMatrixAt(i, m));
  louvers.castShadow = true;
  louvers.receiveShadow = true;
  shutterSet.add(louvers);

  // A small, faded gouache in a dark timber frame, hung at gallery eye height.
  const painting = texture(480, 620, (c) => {
    c.fillStyle = "#dedbca";
    c.fillRect(0, 0, 480, 620);
    const sky = c.createLinearGradient(0, 0, 0, 420);
    sky.addColorStop(0, "#b6c9c9");
    sky.addColorStop(1, "#e2ddc9");
    c.fillStyle = sky;
    c.fillRect(22, 22, 436, 570);
    c.fillStyle = "#6a9ba6";
    c.fillRect(22, 280, 436, 312);
    for (let i = 0; i < 100; i++) {
      const y = 288 + random() * 280;
      c.strokeStyle = "rgba(225,230,213,.2)";
      c.lineWidth = 0.6;
      c.beginPath();
      const x = 25 + random() * 390;
      c.moveTo(x, y);
      c.lineTo(x + 15 + random() * 65, y);
      c.stroke();
    }
    c.fillStyle = "#c9bea7";
    c.beginPath();
    c.moveTo(22, 400);
    c.lineTo(190, 342);
    c.lineTo(458, 500);
    c.lineTo(458, 592);
    c.lineTo(22, 592);
    c.fill();
    const house = (
      x: number,
      y: number,
      w: number,
      h: number,
      tint: string,
    ) => {
      c.fillStyle = tint;
      c.fillRect(x, y, w, h);
      c.beginPath();
      c.ellipse(x + w / 2, y, w / 2, 13, 0, Math.PI, 0);
      c.fill();
      c.fillStyle = "#37698a";
      c.fillRect(x + w * 0.35, y + h * 0.48, w * 0.26, h * 0.52);
      c.beginPath();
      c.arc(x + w * 0.48, y + h * 0.48, w * 0.13, Math.PI, 0);
      c.fill();
      c.fillStyle = "#a7b6b0";
      c.fillRect(x + w * 0.12, y + h * 0.22, w * 0.15, w * 0.2);
    };
    house(40, 325, 100, 155, "#f2ecda");
    house(138, 366, 104, 150, "#e7dfc8");
    house(220, 309, 118, 218, "#f1ead4");
    house(326, 408, 114, 157, "#e4d9bf");
    c.fillStyle = "#396e9b";
    c.beginPath();
    c.ellipse(279, 311, 62, 48, 0, Math.PI, 0);
    c.fill();
    c.fillRect(217, 307, 124, 7);
    c.strokeStyle = "#a39170";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(38, 480);
    c.bezierCurveTo(130, 446, 260, 590, 433, 552);
    c.stroke();
    for (let i = 0; i < 16000; i++) {
      c.fillStyle =
        random() > 0.5 ? "rgba(255,250,222,.075)" : "rgba(72,67,45,.045)";
      c.fillRect(
        random() * 480,
        random() * 620,
        1 + random() * 2,
        1 + random() * 2,
      );
    }
  });
  const frame = new THREE.Group();
  frame.name = "vintage-framed-seascape";
  frame.position.set(-2.205, 1.67, -0.88);
  frame.rotation.y = Math.PI / 2;
  decor.add(frame);
  for (const x of [-0.236, 0.236])
    box(0.035, 0.65, 0.034, walnut, x, 0, 0, frame);
  for (const y of [-0.3075, 0.3075])
    box(0.44, 0.035, 0.034, walnut, 0, y, 0, frame);
  const art = new THREE.Mesh(
    new THREE.PlaneGeometry(0.437, 0.577),
    new THREE.MeshStandardMaterial({ map: painting, roughness: 1 }),
  );
  art.position.z = 0.019;
  frame.add(art);
  const innerLip = material("#c0aa80", 0.75);
  for (const x of [-0.216, 0.216])
    box(0.005, 0.58, 0.005, innerLip, x, 0, 0.02, frame);
  for (const y of [-0.2875, 0.2875])
    box(0.435, 0.005, 0.005, innerLip, 0, y, 0.02, frame);

  const tilePattern = texture(256, 256, (c) => {
    c.fillStyle = "#e9e4cf";
    c.fillRect(0, 0, 256, 256);
    c.strokeStyle = "#466f91";
    c.lineWidth = 3.5;
    c.strokeRect(8, 8, 240, 240);
    c.translate(128, 128);
    for (let i = 0; i < 8; i++) {
      c.save();
      c.rotate((i * Math.PI) / 4);
      c.beginPath();
      c.moveTo(0, 0);
      c.bezierCurveTo(-38, -35, -42, -74, 0, -91);
      c.bezierCurveTo(42, -74, 38, -35, 0, 0);
      c.stroke();
      c.restore();
    }
    c.beginPath();
    c.arc(0, 0, 17, 0, Math.PI * 2);
    c.stroke();
    for (let i = 0; i < 2800; i++) {
      c.fillStyle = "rgba(105,91,63,.035)";
      c.fillRect(random() * 256 - 128, random() * 256 - 128, 1, 1);
    }
  });
  const tiles = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.145, 0.145),
    new THREE.MeshStandardMaterial({ map: tilePattern, roughness: 0.53 }),
    30,
  );
  tiles.name = "handpainted-ceramic-skirting";
  for (let i = 0; i < 30; i++)
    tiles.setMatrixAt(
      i,
      new THREE.Matrix4().makeTranslation((i - 14.5) * 0.15, 0.105, -2.603),
    );
  decor.add(tiles);
  // A single traditional blue-and-white plate balances the framed painting.
  const plate = new THREE.Group();
  plate.name = "antique-ceramic-wall-plate";
  plate.position.set(-2.208, 1.77, 0.05);
  plate.rotation.y = Math.PI / 2;
  decor.add(plate);
  const disk = new THREE.Mesh(
    new THREE.CircleGeometry(0.125, 48),
    new THREE.MeshStandardMaterial({ map: tilePattern, roughness: 0.52 }),
  );
  plate.add(disk);
  const plateRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.124, 0.006, 8, 48),
    material("#ddd7be", 0.55),
  );
  plateRim.position.z = 0.003;
  plate.add(plateRim);

  const weave = texture(512, 512, (c) => {
    c.fillStyle = "#b3986c";
    c.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 48; row++)
      for (let col = 0; col < 32; col++) {
        const x = col * 16,
          y = row * 11;
        const bright = (row + col) % 2 === 0;
        c.fillStyle = bright ? "#c7b083" : "#8f7550";
        c.fillRect(x + (row % 2) * 3, y, bright ? 14 : 5, 8);
        c.fillStyle = "rgba(241,222,176,.33)";
        c.fillRect(x + 1, y + 1, bright ? 12 : 2, 1);
        c.fillStyle = "rgba(63,48,29,.22)";
        c.fillRect(x, y + 8, 16, 2);
      }
  });
  const fabric = texture(256, 512, (c) => {
    c.fillStyle = "#eee8d9";
    c.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 350; i++) {
      c.strokeStyle = "rgba(145,137,110,.12)";
      c.lineWidth = 0.5;
      c.beginPath();
      const x = random() * 256;
      c.moveTo(x, 0);
      c.lineTo(x, 512);
      c.stroke();
    }
    for (let i = 0; i < 512; i += 3) {
      c.fillStyle = "rgba(255,253,240,.17)";
      c.fillRect(0, i, 256, 1);
    }
    for (const x of [38, 46, 210, 218]) {
      c.fillStyle = "rgba(65,108,130,.35)";
      c.fillRect(x, 0, 3, 512);
    }
  });
  const straw = new THREE.MeshStandardMaterial({
    map: weave,
    bumpMap: weave,
    bumpScale: 0.0025,
    roughness: 0.98,
  });
  const basket = new THREE.Group();
  basket.name = "woven-market-basket";
  basket.position.set(-1.82, 0.005, -0.74);
  decor.add(basket);
  const basketProfile = [
    new THREE.Vector2(0.145, 0),
    new THREE.Vector2(0.15, 0.012),
    new THREE.Vector2(0.183, 0.23),
    new THREE.Vector2(0.19, 0.27),
    new THREE.Vector2(0.182, 0.279),
    new THREE.Vector2(0.176, 0.25),
    new THREE.Vector2(0.145, 0.024),
  ];
  const basketBody = new THREE.Mesh(
    new THREE.LatheGeometry(basketProfile, 48),
    straw,
  );
  basketBody.castShadow = true;
  basketBody.receiveShadow = true;
  basket.add(basketBody);
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.186, 0.009, 8, 48),
    straw,
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.271;
  basket.add(rim);
  tube(
    [
      new THREE.Vector3(-0.16, 0.25, -0.045),
      new THREE.Vector3(-0.11, 0.4, -0.045),
      new THREE.Vector3(0.09, 0.41, -0.045),
      new THREE.Vector3(0.16, 0.25, -0.045),
    ],
    0.009,
    straw,
    basket,
  );
  const clothGeometry = new THREE.PlaneGeometry(0.29, 0.39, 18, 24);
  const clothPos = clothGeometry.attributes.position;
  for (let i = 0; i < clothPos.count; i++) {
    const x = clothPos.getX(i),
      v = (clothPos.getY(i) + 0.195) / 0.39;
    const drape = THREE.MathUtils.smoothstep(v, 0.58, 1);
    clothPos.setXYZ(
      i,
      x,
      0.272 + 0.012 * Math.cos(x * 72) - drape * 0.19,
      -0.09 + v * 0.37,
    );
  }
  clothGeometry.computeVertexNormals();
  const cloth = new THREE.Mesh(
    clothGeometry,
    new THREE.MeshStandardMaterial({
      color: "#f4f0e5",
      map: fabric,
      roughness: 1,
      side: THREE.DoubleSide,
    }),
  );
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  basket.add(cloth);
  for (const x of [-0.129, 0.129]) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const v = i / 15;
      points.push(
        new THREE.Vector3(
          x,
          0.275 +
            0.012 * Math.cos(x * 72) -
            THREE.MathUtils.smoothstep(v, 0.58, 1) * 0.19,
          -0.09 + v * 0.37,
        ),
      );
    }
    tube(points, 0.0012, material("#628a95"), basket);
  }

  const serving = new THREE.Group();
  serving.name = "vintage-console-serving-tray";
  serving.position.set(-1.735, 0.784, -1.8);
  decor.add(serving);
  const tray = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.006, 48),
    material("#a98a58", 0.48, 0.35),
  );
  tray.scale.set(0.118, 1, 0.086);
  tray.receiveShadow = true;
  serving.add(tray);
  const trayEdge = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.028, 6, 48),
    brass,
  );
  trayEdge.scale.set(0.115, 0.083, 0.11);
  trayEdge.rotation.x = -Math.PI / 2;
  trayEdge.position.y = 0.006;
  serving.add(trayEdge);
  const glass = new THREE.MeshStandardMaterial({
    color: "#e4efe9",
    roughness: 0.12,
    metalness: 0.06,
    depthWrite: false,
    transparent: true,
    opacity: 0.22,
  });
  const carafe = new THREE.Group();
  carafe.name = "glass-water-carafe";
  carafe.position.set(-0.035, 0.006, -0.026);
  serving.add(carafe);
  const glassProfile = [
    new THREE.Vector2(0.034, 0),
    new THREE.Vector2(0.041, 0.008),
    new THREE.Vector2(0.043, 0.12),
    new THREE.Vector2(0.041, 0.15),
    new THREE.Vector2(0.022, 0.18),
    new THREE.Vector2(0.019, 0.225),
    new THREE.Vector2(0.023, 0.235),
    new THREE.Vector2(0.02, 0.236),
    new THREE.Vector2(0.016, 0.225),
    new THREE.Vector2(0.019, 0.18),
    new THREE.Vector2(0.038, 0.15),
    new THREE.Vector2(0.04, 0.12),
    new THREE.Vector2(0.038, 0.009),
    new THREE.Vector2(0, 0.009),
  ];
  carafe.add(new THREE.Mesh(new THREE.LatheGeometry(glassProfile, 40), glass));
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.039, 0.035, 0.117, 32),
    new THREE.MeshStandardMaterial({
      color: "#b2cecb",
      roughness: 0.08,
      depthWrite: false,
      transparent: true,
      opacity: 0.16,
    }),
  );
  water.position.y = 0.069;
  carafe.add(water);
  const rimGlass = new THREE.MeshStandardMaterial({
    color: "#e8f1eb",
    roughness: 0.18,
    metalness: 0.15,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
  });
  const carafeRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.0215, 0.0012, 6, 32),
    rimGlass,
  );
  carafeRim.rotation.x = Math.PI / 2;
  carafeRim.position.y = 0.235;
  carafe.add(carafeRim);
  const waterSurface = new THREE.Mesh(
    new THREE.CircleGeometry(0.0388, 32),
    new THREE.MeshStandardMaterial({
      color: "#bfd9d2",
      roughness: 0.12,
      metalness: 0.12,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
    }),
  );
  waterSurface.rotation.x = -Math.PI / 2;
  waterSurface.position.y = 0.1276;
  carafe.add(waterSurface);
  const tumbler = new THREE.Group();
  tumbler.name = "small-drinking-glass";
  tumbler.position.set(0.064, 0.006, 0.028);
  serving.add(tumbler);
  const drinkingProfile = [
    new THREE.Vector2(0.022, 0),
    new THREE.Vector2(0.027, 0.072),
    new THREE.Vector2(0.025, 0.074),
    new THREE.Vector2(0.02, 0.007),
    new THREE.Vector2(0, 0.007),
  ];
  tumbler.add(
    new THREE.Mesh(new THREE.LatheGeometry(drinkingProfile, 32), glass),
  );

  const tumblerRim = new THREE.Mesh(
    new THREE.TorusGeometry(0.026, 0.001, 6, 32),
    rimGlass,
  );
  tumblerRim.rotation.x = Math.PI / 2;
  tumblerRim.position.y = 0.073;
  tumbler.add(tumblerRim);

  // Fine olive sprigs in the existing cream vase, never in the doorway or main view.
  const sprigs = new THREE.Group();
  sprigs.name = "olive-sprigs-on-console";
  sprigs.position.set(-1.92, 1.0, -1.8);
  decor.add(sprigs);
  const leafMatrices: THREE.Matrix4[] = [];
  const stemMatrices: THREE.Matrix4[] = [];
  for (let branch = 0; branch < 5; branch++) {
    const angle = branch * 2.399,
      height = 0.25 + random() * 0.17,
      tip = new THREE.Vector3(
        Math.cos(angle) * 0.15,
        height,
        Math.sin(angle) * 0.11,
      );
    helper.position.copy(tip).multiplyScalar(0.5);
    helper.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      tip.clone().normalize(),
    );
    helper.scale.set(0.002, tip.length(), 0.002);
    helper.updateMatrix();
    stemMatrices.push(helper.matrix.clone());
    for (let j = 0; j < 6; j++)
      for (const side of [-1, 1]) {
        const f = 0.25 + j * 0.12;
        helper.position.copy(tip).multiplyScalar(f);
        helper.position.x += side * 0.017;
        helper.rotation.set(0.2, angle + side * 0.6, side * 0.35);
        helper.scale.set(0.008, 0.002, 0.032);
        helper.updateMatrix();
        leafMatrices.push(helper.matrix.clone());
      }
  }
  const branches = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(1, 1, 1, 5),
    material("#83795a"),
    stemMatrices.length,
  );
  stemMatrices.forEach((m, i) => branches.setMatrixAt(i, m));
  sprigs.add(branches);
  const foliage = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 5),
    material("#7b8d73"),
    leafMatrices.length,
  );
  leafMatrices.forEach((m, i) => foliage.setMatrixAt(i, m));
  foliage.castShadow = true;
  sprigs.add(foliage);
  return decor;
}
