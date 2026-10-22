import * as THREE from "three";
import { createClassicalPainting } from "./classical-gallery";
import { consolePoint } from "./interior-layout";

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

  decor.add(createClassicalPainting());

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
  // Beside the entrance bench, with its full silhouette visible from the path.
  basket.position.set(-0.6, 0.001, 3.02);
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
  const basketBase = new THREE.Mesh(new THREE.CylinderGeometry(.145,.145,.018,48),straw);
  basketBase.position.y=.009;
  basket.add(basketBase);
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
  // A folded liner rests inside the opening instead of cutting through the wicker.
  const clothGeometry = new THREE.PlaneGeometry(0.25, 0.22, 18, 24);
  const clothPos = clothGeometry.attributes.position;
  for (let i = 0; i < clothPos.count; i++) {
    const x = clothPos.getX(i),
      z = clothPos.getY(i);
    clothPos.setXYZ(
      i,
      x,
      0.256 + 0.006 * Math.cos(x * 72) - 0.009 * Math.cos(z * 12),
      z,
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
  cloth.name = "folded-basket-linen";
  cloth.castShadow = true;
  cloth.receiveShadow = true;
  basket.add(cloth);
  for (const x of [-0.111, 0.111]) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 16; i++) {
      const z = -.11 + i / 15 * .22;
      points.push(
        new THREE.Vector3(
          x,
          0.258 + 0.006 * Math.cos(x * 72) - 0.009 * Math.cos(z * 12),
          z,
        ),
      );
    }
    tube(points, 0.0012, material("#628a95"), basket);
  }

  const tray = new THREE.Group();tray.name="vintage-console-serving-tray";
  tray.position.copy(consolePoint(-.25,0));decor.add(tray);
  const dish = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0,0),new THREE.Vector2(.047,0),new THREE.Vector2(.071,.006),
    new THREE.Vector2(.073,.011),new THREE.Vector2(.069,.013),new THREE.Vector2(.045,.006),new THREE.Vector2(0,.006),
  ],48),material("#d6ccb5",.72));
  dish.castShadow=dish.receiveShadow=true;tray.add(dish);
  return decor;
}
