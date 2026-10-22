import * as THREE from "three";
import { createBouquet } from "./bouquet";
import { createOcean } from "./ocean";
import { dimensions as D } from "./dimensions";

export function createScene(
  container: HTMLElement,
  onInteract: () => void,
  reducedMotion: boolean,
) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#b6c6c1");
  scene.fog = new THREE.FogExp2("#c2cec4", 0.018);
  const camera = new THREE.PerspectiveCamera(
    50,
    innerWidth / innerHeight,
    0.1,
    500,
  );
  const target = new THREE.Vector3();
  const ambient = new THREE.HemisphereLight("#e9f0de", "#6e6656", 2.0);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight("#fff0cf", 3.8);
  sun.position.set(-3, 4.5, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(
    innerWidth < 760 ? 1024 : 2048,
    innerWidth < 760 ? 1024 : 2048,
  );
  sun.shadow.camera.left = -5;
  sun.shadow.camera.right = 5;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -5;
  sun.shadow.normalBias = 0.003;
  sun.shadow.autoUpdate = false;
  sun.shadow.needsUpdate = true;
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#c2ded9", 1.1);
  fill.position.set(3, 5, 8);
  scene.add(fill);
  const mat = (color: string, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const plaster = mat("#d8d0bc"),
    trim = mat("#e8dfca"),
    darkWood = mat("#694f37"),
    brass = mat("#bda16b", 0.35, 0.65),
    green = mat("#304c46"),
    paper = mat("#e8dec5");
  function box(
    w: number,
    h: number,
    d: number,
    m: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
    parent: THREE.Object3D = scene,
  ) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function cylinder(
    rt: number,
    rb: number,
    h: number,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = scene,
    segments = 20,
  ) {
    const o = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, h, segments),
      m,
    );
    o.position.set(x, y, z);
    o.castShadow = true;
    o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function sphere(
    r: number,
    m: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = scene,
    sx = 1,
    sy = 1,
    sz = 1,
  ) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), m);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    o.castShadow = true;
    parent.add(o);
    return o;
  }
  function woodTexture() {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 512;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#947151";
    ctx.fillRect(0, 0, 256, 512);
    let seed = 42;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 850; i++) {
      ctx.strokeStyle = `rgba(${rand() > 0.5 ? "40,25,15" : "230,200,150"},${rand() * 0.13})`;
      ctx.lineWidth = rand() * 2;
      let x = rand() * 256;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(
        x + rand() * 16,
        170,
        x - rand() * 15,
        340,
        x + rand() * 9,
        512,
      );
      ctx.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const wood = new THREE.MeshStandardMaterial({
    map: woodTexture(),
    roughness: 0.78,
    color: "#bda480",
  });
  // World construction uses metres directly. No non-uniform parent scaling.
  const front = D.room.depth / 2,
    back = -front,
    halfWidth = D.room.width / 2;
  const floor = box(
    D.room.width,
    0.12,
    D.room.depth + 4.2,
    wood,
    0,
    -0.06,
    2.1,
  );
  const seams = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.002, 0.001, D.room.depth + 4.2),
    mat("#76624c"),
    33,
  );
  for (let i = 0; i < 33; i++)
    seams.setMatrixAt(
      i,
      new THREE.Matrix4().makeTranslation(-2.24 + i * 0.14, 0.0005, 2.1),
    );
  scene.add(seams);
  const room = new THREE.Group();
  room.name = "room";
  scene.add(room);
  box(
    D.room.width,
    0.12,
    D.room.depth,
    plaster,
    0,
    D.room.height + 0.06,
    0,
    room,
  ).name = "ceiling";
  const windowTop = D.window.sill + D.window.height;
  for (const side of [-1, 1]) {
    box(
      (D.room.width - D.window.width) / 2,
      D.room.height,
      D.room.wall,
      plaster,
      side * (D.window.width / 2 + (D.room.width - D.window.width) / 4),
      D.room.height / 2,
      back,
      room,
    ).name = side < 0 ? "back-left" : "back-right";
    box(
      D.room.wall,
      D.room.height,
      D.room.depth,
      plaster,
      side * (halfWidth + D.room.wall / 2),
      D.room.height / 2,
      0,
      room,
    ).name = side < 0 ? "side-left" : "side-right";
  }
  box(
    D.window.width,
    D.window.sill,
    D.room.wall,
    plaster,
    0,
    D.window.sill / 2,
    back,
    room,
  ).name = "back-below";
  box(
    D.window.width,
    D.room.height - windowTop,
    D.room.wall,
    plaster,
    0,
    (windowTop + D.room.height) / 2,
    back,
    room,
  ).name = "back-above";
  box(
    D.window.width + 0.1,
    0.035,
    0.2,
    trim,
    0,
    D.window.sill - 0.0175,
    back + 0.025,
    room,
  );
  for (const x of [-D.window.width / 2, 0, D.window.width / 2])
    box(
      D.window.frame,
      D.window.height,
      0.08,
      trim,
      x,
      D.window.sill + D.window.height / 2,
      back + 0.07,
      room,
    );
  box(
    D.window.width + 0.045,
    0.045,
    0.08,
    trim,
    0,
    windowTop,
    back + 0.07,
    room,
  );
  const curtainMat = new THREE.MeshStandardMaterial({
    color: "#eee6d4",
    roughness: 1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.87,
  });
  const curtains: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(0.48, 2.35, 20, 28);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++)
      pos.setZ(
        i,
        Math.sin(pos.getX(i) * 65) * 0.027 +
          0.018 * Math.pow((1.175 - pos.getY(i)) / 2.35, 2),
      );
    g.computeVertexNormals();
    const c = new THREE.Mesh(g, curtainMat);
    c.position.set(side * 1.4, 1.325, back + 0.17);
    room.add(c);
    curtains.push(c);
  }
  cylinder(0.012, 0.012, 3.36, brass, 0, 2.51, back + 0.17, room).rotation.z =
    Math.PI / 2;
  const ocean = createOcean();
  const seaMat = ocean.material;
  scene.add(ocean);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader:
      "varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:
      "varying vec3 vPos;void main(){float h=normalize(vPos).y;vec3 col=mix(vec3(.84,.86,.77),vec3(.46,.65,.70),smoothstep(0.,.8,h));gl_FragColor=vec4(col,1.);}",
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(350, 24, 12), skyMat);
  scene.add(sky);
  // Far-off island silhouettes.
  const islandMat = mat("#7c9992");
  for (let i = 0; i < 5; i++) {
    const island = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 8),
      islandMat,
    );
    island.scale.set(5 + i * 1.3, 0.9 + i * 0.12, 2);
    island.position.set(17 + i * 3, -0.05, -37 - i * 3);
    scene.add(island);
  }
  const rug = box(
    D.rug.width,
    D.rug.thickness,
    D.rug.depth,
    mat("#bfb7a0"),
    0.1,
    D.rug.thickness / 2,
    -0.65,
  );
  rug.name = "rug";
  const stripes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.005, 0.0005, D.rug.depth - 0.02),
    mat("#cfc6ad"),
    50,
  );
  for (let i = 0; i < 50; i++)
    stripes.setMatrixAt(
      i,
      new THREE.Matrix4().makeTranslation(
        0.1 + (i - 24.5) * 0.04,
        0.0085,
        -0.65,
      ),
    );
  stripes.receiveShadow = true;
  scene.add(stripes);
  const table = new THREE.Group();
  table.name = "desk";
  table.position.set(0.1, 0, -0.9);
  room.add(table);
  const tabletop = box(
    D.desk.width,
    D.desk.top,
    D.desk.depth,
    wood,
    0,
    D.desk.height - D.desk.top / 2,
    0,
    table,
  );
  tabletop.name = "tabletop";
  for (const z of [-0.3, 0.3])
    box(1.27, 0.08, 0.025, darkWood, 0, 0.675, z, table);
  for (const x of [-0.61, 0.61])
    for (const z of [-0.29, 0.29])
      box(
        0.045,
        D.desk.height - D.desk.top,
        0.045,
        darkWood,
        x,
        (D.desk.height - D.desk.top) / 2,
        z,
        table,
      );
  const book = new THREE.Group();
  book.name = "album";
  book.position.set(-0.13, D.desk.height, -0.03);
  book.rotation.y = -0.1;
  table.add(book);
  box(D.album.width, 0.003, D.album.depth, green, 0, 0.0015, 0, book);
  box(0.31, 0.029, 0.25, paper, 0, 0.0175, 0, book);
  const bookHinge = new THREE.Group();
  bookHinge.position.set(-D.album.width / 2, 0.0335, 0);
  book.add(bookHinge);
  box(
    D.album.width,
    0.003,
    D.album.depth,
    green,
    D.album.width / 2,
    0,
    0,
    bookHinge,
  );
  const pageEdge = mat("#b8b09c");
  for (let i = 0; i < 18; i++)
    box(0.3102, 0.0002, 0.2502, pageEdge, 0, 0.005 + i * 0.0015, 0, book);
  function labelTexture() {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 384;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#304c46";
    ctx.fillRect(0, 0, 512, 384);
    ctx.strokeStyle = "#b4a17a";
    ctx.lineWidth = 2;
    ctx.strokeRect(30, 30, 452, 324);
    ctx.fillStyle = "#d5c5a0";
    ctx.textAlign = "center";
    ctx.font = "18px Georgia";
    ctx.fillText("BETWEEN THE TIDES", 256, 148);
    ctx.font = "42px serif";
    ctx.fillText("潮 汐 之 间", 256, 212);
    ctx.font = "13px Georgia";
    ctx.fillText("A COLLECTION OF LITTLE MOMENTS", 256, 278);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(D.album.width - 0.002, D.album.depth - 0.002),
    new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.9 }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(D.album.width / 2, 0.0016, 0);
  bookHinge.add(label);
  const bouquet = createBouquet();
  bouquet.name = "bouquet";
  bouquet.scale.setScalar(D.bouquet.scale);
  bouquet.position.set(0.07, 0.811, 0.04);
  bouquet.rotation.set(-1.12, -0.25, 0.55);
  table.add(bouquet);
  // An ordinary ~300 ml mug with a 3 mm wall and a properly sized handle.
  const cup = new THREE.Group();
  cup.name = "cup";
  cup.position.set(0.49, D.desk.height, -0.24);
  table.add(cup);
  const ceramic = mat("#ded5be");
  const profile = [
    new THREE.Vector2(0.029, 0),
    new THREE.Vector2(0.032, 0.004),
    new THREE.Vector2(0.0425, 0.09),
    new THREE.Vector2(0.0425, 0.095),
    new THREE.Vector2(0.0395, 0.095),
    new THREE.Vector2(0.0395, 0.09),
    new THREE.Vector2(0.029, 0.008),
    new THREE.Vector2(0, 0.008),
  ];
  const cupBody = new THREE.Mesh(new THREE.LatheGeometry(profile, 32), ceramic);
  cupBody.name = "mug-body";
  cupBody.castShadow = true;
  cupBody.receiveShadow = true;
  cup.add(cupBody);
  cylinder(0.0385, 0.0385, 0.001, mat("#51402e"), 0, 0.084, 0, cup);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.021, 0.004, 10, 24),
    ceramic,
  );
  handle.position.set(0.055, 0.055, 0);
  handle.castShadow = true;
  cup.add(handle);
  const letter = box(
    0.148,
    0.0005,
    0.105,
    paper,
    -0.48,
    D.desk.height + 0.0003,
    -0.19,
    table,
  );
  letter.rotation.y = 0.12;
  letter.name = "letter";
  const stool = new THREE.Group();
  stool.name = "stool";
  stool.position.set(0.1, 0, -0.18);
  room.add(stool);
  cylinder(
    D.stool.diameter / 2,
    D.stool.diameter / 2,
    D.stool.seat,
    wood,
    0,
    D.stool.height - D.stool.seat / 2,
    0,
    stool,
    32,
  );
  for (const x of [-0.115, 0.115])
    for (const z of [-0.115, 0.115])
      box(
        0.035,
        D.stool.height - D.stool.seat,
        0.035,
        darkWood,
        x,
        (D.stool.height - D.stool.seat) / 2,
        z,
        stool,
      );
  const consoleTable = new THREE.Group();
  consoleTable.name = "console";
  consoleTable.position.set(-1.72, 0, -1.8);
  room.add(consoleTable);
  box(
    D.console.width,
    0.025,
    D.console.depth,
    wood,
    0,
    D.console.height - 0.0125,
    0,
    consoleTable,
  ).name = "console-top";
  for (const x of [-0.39, 0.39])
    for (const z of [-0.11, 0.11])
      box(
        0.03,
        D.console.height - 0.025,
        0.03,
        darkWood,
        x,
        (D.console.height - 0.025) / 2,
        z,
        consoleTable,
      );
  cylinder(
    0.045,
    0.065,
    0.23,
    mat("#c8b89b"),
    -0.2,
    D.console.height + 0.115,
    0,
    consoleTable,
  );
  cylinder(
    0.035,
    0.05,
    0.17,
    green,
    0.17,
    D.console.height + 0.085,
    0,
    consoleTable,
  );
  // A 90 × 210 cm door leaf, 4.5 cm thick, with the handle 1 m above the floor.
  const facade = new THREE.Group();
  facade.name = "entry-wall";
  facade.position.z = front;
  scene.add(facade);
  const openingLeft = D.door.centerX - 0.455,
    openingRight = D.door.centerX + 0.455;
  const headerBottom = D.door.height + D.door.threshold + 0.07;
  box(
    openingLeft + halfWidth,
    D.room.height,
    D.room.wall,
    plaster,
    (-halfWidth + openingLeft) / 2,
    D.room.height / 2,
    0,
    facade,
  );
  box(
    halfWidth - openingRight,
    D.room.height,
    D.room.wall,
    plaster,
    (halfWidth + openingRight) / 2,
    D.room.height / 2,
    0,
    facade,
  );
  box(
    0.95,
    D.room.height - headerBottom,
    D.room.wall,
    plaster,
    D.door.centerX,
    (D.room.height + headerBottom) / 2,
    0,
    facade,
  );
  for (const x of [openingLeft - 0.035, openingRight + 0.035])
    box(0.07, headerBottom, 0.12, trim, x, headerBottom / 2, 0.035, facade);
  box(
    1.09,
    0.07,
    0.12,
    trim,
    D.door.centerX,
    D.door.height + D.door.threshold + 0.035,
    0.035,
    facade,
  );
  const doorPivot = new THREE.Group();
  doorPivot.position.set(
    D.door.centerX - D.door.width / 2,
    D.door.threshold,
    0.005,
  );
  facade.add(doorPivot);
  const door = box(
    D.door.width,
    D.door.height,
    D.door.thickness,
    wood,
    D.door.width / 2,
    D.door.height / 2,
    0,
    doorPivot,
  );
  door.name = "door-leaf";
  for (const y of [0.53, 1.52]) {
    box(0.69, 0.7, 0.006, darkWood, 0.45, y, 0.0255, doorPivot);
    box(0.64, 0.65, 0.007, wood, 0.45, y, 0.032, doorPivot);
  }
  for (const x of [0.025, 0.875])
    box(0.035, 2.04, 0.009, darkWood, x, 1.05, 0.028, doorPivot);
  const knobY = D.door.handleHeight - D.door.threshold;
  box(0.035, 0.15, 0.006, brass, 0.79, knobY, 0.03, doorPivot);
  sphere(0.014, brass, 0.79, knobY, 0.055, doorPivot);
  box(0.115, 0.016, 0.022, brass, 0.75, knobY, 0.065, doorPivot).name =
    "door-handle";
  box(
    1.03,
    D.door.threshold,
    0.22,
    mat("#a59b81"),
    D.door.centerX,
    D.door.threshold / 2,
    0.04,
    facade,
  );
  box(0.08, 0.11, 0.008, brass, 1.2, 1.52, 0.1, facade);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: "#f8dfaa",
    emissive: "#eec28a",
    emissiveIntensity: 0.6,
    roughness: 0.6,
  });
  box(0.12, 0.2, 0.1, lanternMat, 1.31, 1.9, 0.14, facade);
  for (const y of [1.79, 2.01])
    box(0.15, 0.018, 0.13, darkWood, 1.31, y, 0.14, facade);
  const oliveLeaf = mat("#738265"),
    oliveTwig = mat("#7a7152");
  const plant = new THREE.Group();
  plant.name = "olive-planter";
  plant.position.set(1.5, 0, 0.28);
  facade.add(plant);
  cylinder(0.12, 0.085, 0.28, mat("#a78368"), 0, 0.14, 0, plant);
  cylinder(0.011, 0.016, 0.62, darkWood, 0, 0.58, 0, plant);
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4,
      y = 0.52 + (i % 5) * 0.075;
    const branch = cylinder(
      0.0025,
      0.004,
      0.25,
      oliveTwig,
      Math.cos(a) * 0.09,
      y,
      Math.sin(a) * 0.07,
      plant,
      6,
    );
    branch.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.9);
    for (let j = 0; j < 5; j++) {
      const leaf = sphere(
        0.035,
        oliveLeaf,
        Math.cos(a) * (0.07 + j * 0.025),
        y + j * 0.025,
        Math.sin(a) * (0.07 + j * 0.025),
        plant,
        0.16,
        0.025,
        0.8,
      );
      leaf.rotation.y = a;
    }
  }
  // Floating dust is one draw call, deliberately sparse.
  const dustPositions = new Float32Array(120 * 3);
  for (let i = 0; i < 120; i++) {
    dustPositions[i * 3] = (Math.sin(i * 127.1) * 0.5 + 0.5) * 11 - 5.5;
    dustPositions[i * 3 + 1] = (Math.sin(i * 311.7) * 0.5 + 0.5) * 5;
    dustPositions[i * 3 + 2] = (Math.cos(i * 53.3) * 0.5 + 0.5) * 10 - 5;
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dg,
    new THREE.PointsMaterial({
      color: "#fff0d0",
      size: 0.002,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  scene.add(dust);
  type Pose = { p: THREE.Vector3; t: THREE.Vector3 };
  const mobile = () => innerWidth < 760;
  // Human eye height, centred on the 91 cm frame opening.
  const entryPose = (): Pose => ({
    p: new THREE.Vector3(D.door.centerX, D.eye, front + 3.6),
    t: new THREE.Vector3(mobile() ? D.door.centerX : 0.12, 1.2, front),
  });
  const roomPose = (): Pose =>
    mobile()
      ? {
          p: new THREE.Vector3(0.55, D.eye, 1.15),
          t: new THREE.Vector3(0, 1.05, -1.4),
        }
      : {
          p: new THREE.Vector3(1.1, D.eye, 0.75),
          t: new THREE.Vector3(-0.2, 0.95, -1.5),
        };
  let current: "entry" | "room" | "book" = "entry";
  let animating = false,
    doorOpen = 0,
    albumOpen = 0,
    disposed = false;
  const initial = entryPose();
  camera.position.copy(initial.p);
  target.copy(initial.t);
  let walking: {
    path: THREE.CatmullRomCurve3;
    fromT: THREE.Vector3;
    toT: THREE.Vector3;
    start: number;
    duration: number;
    done: () => void;
  } | null = null;
  let bouquetMotion: {
    from: THREE.Vector3;
    to: THREE.Vector3;
    fromQ: THREE.Quaternion;
    toQ: THREE.Quaternion;
    start: number;
    duration: number;
    done: () => void;
  } | null = null;
  let bouquetParked = false;
  function walkIntoRoom() {
    return new Promise<void>((done) => {
      const end = roomPose();
      walking = {
        path: new THREE.CatmullRomCurve3(
          [
            camera.position.clone(),
            new THREE.Vector3(D.door.centerX, D.eye, front + 0.6),
            new THREE.Vector3(D.door.centerX, D.eye, front - 0.6),
            end.p,
          ],
          false,
          "centripetal",
        ),
        fromT: target.clone(),
        toT: end.t,
        start: performance.now(),
        duration: reducedMotion ? 120 : 3800,
        done,
      };
    });
  }
  function parkBouquet() {
    if (bouquetParked) return Promise.resolve();
    return new Promise<void>((done) => {
      bouquetMotion = {
        from: bouquet.position.clone(),
        to: new THREE.Vector3(0.49, 0.765, 0.2),
        fromQ: bouquet.quaternion.clone(),
        toQ: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(-1.32, 0.15, 0.35),
        ),
        start: performance.now(),
        duration: reducedMotion ? 80 : 1100,
        done,
      };
    });
  }
  const clock = new THREE.Clock();
  let frame = 0,
    lastDraw = 0,
    low = false;
  let average = 16,
    slowFrames = 0;
  function tick(now: number) {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    if (document.hidden) return;
    if (low && now - lastDraw < 31) return;
    const delta = now - lastDraw;
    lastDraw = now;
    if (delta < 100) {
      average = average * 0.98 + delta * 0.02;
      if (average > 30 && ++slowFrames > 90) {
        renderer.setPixelRatio(Math.min(devicePixelRatio, 1));
        slowFrames = 0;
      }
    }
    const t = clock.getElapsedTime();
    seaMat.uniforms.time.value = t * (reducedMotion ? 0.15 : 1);
    if (!reducedMotion) {
      curtains.forEach(
        (c, i) => (c.rotation.y = Math.sin(t * 0.5 + i) * 0.025),
      );
      dust.position.y = Math.sin(t * 0.1) * 0.06;
    }
    if (walking) {
      const a = Math.min(1, (now - walking.start) / walking.duration),
        ease = a * a * (3 - 2 * a);
      camera.position.copy(walking.path.getPoint(ease));
      target.lerpVectors(walking.fromT, walking.toT, ease);
      if (a === 1) {
        const done = walking.done;
        walking = null;
        animating = false;
        current = "room";
        done();
      }
    }
    if (bouquetMotion) {
      const a = Math.min(
          1,
          (now - bouquetMotion.start) / bouquetMotion.duration,
        ),
        ease = a * a * (3 - 2 * a);
      bouquet.position.lerpVectors(bouquetMotion.from, bouquetMotion.to, ease);
      bouquet.position.y += Math.sin(Math.PI * a) * 0.025;
      bouquet.quaternion.slerpQuaternions(
        bouquetMotion.fromQ,
        bouquetMotion.toQ,
        ease,
      );
      if (a === 1) {
        const done = bouquetMotion.done;
        bouquetMotion = null;
        bouquetParked = true;
        done();
      }
    }
    const dt = Math.min(Math.max(delta / 1000, 0), 0.1);
    doorPivot.rotation.y = THREE.MathUtils.damp(
      doorPivot.rotation.y,
      doorOpen,
      5,
      dt,
    );
    bookHinge.rotation.z = THREE.MathUtils.damp(
      bookHinge.rotation.z,
      albumOpen,
      5,
      dt,
    );
    if (
      animating ||
      Math.abs(doorOpen - doorPivot.rotation.y) > 0.005 ||
      bouquetMotion !== null ||
      Math.abs(albumOpen - bookHinge.rotation.z) > 0.005
    )
      sun.shadow.needsUpdate = true;
    camera.lookAt(target);
    renderer.render(scene, camera);
  }
  frame = requestAnimationFrame(tick);
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  function hit(e: PointerEvent) {
    if (animating || current === "book") return false;
    pointer.set(
      (e.clientX / innerWidth) * 2 - 1,
      (-e.clientY / innerHeight) * 2 + 1,
    );
    ray.setFromCamera(pointer, camera);
    return (
      ray.intersectObject(current === "entry" ? door : bouquet, true).length > 0
    );
  }
  renderer.domElement.addEventListener("pointerup", (e) => {
    if (hit(e)) onInteract();
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    renderer.domElement.style.cursor = hit(e) ? "pointer" : "default";
  });
  window.addEventListener("resize", () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    if (!animating && current !== "book") {
      const pose = current === "entry" ? entryPose() : roomPose();
      camera.position.copy(pose.p);
      target.copy(pose.t);
    }
  });
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    cancelAnimationFrame(frame);
    const notice = document.createElement("div");
    notice.className = "context-notice";
    notice.textContent = "画面暂时中断，请刷新页面恢复。纪念册内容仍可阅读。";
    container.appendChild(notice);
  });
  return {
    clearFog() {
      scene.fog = new THREE.FogExp2("#c2cec4", 0.009);
    },
    async enterRoom() {
      doorOpen = -Math.PI * 0.58;
      animating = true;
      await new Promise((resolve) =>
        setTimeout(resolve, reducedMotion ? 0 : 800),
      );
      await walkIntoRoom();
    },
    async openBook() {
      current = "book";
      await parkBouquet();
      albumOpen = Math.PI * 0.85;
      await new Promise((resolve) =>
        setTimeout(resolve, reducedMotion ? 0 : 650),
      );
    },
    returnToRoom() {
      albumOpen = 0;
      current = "room";
    },
    setQuality(value: boolean) {
      low = value;
      renderer.setPixelRatio(value ? 1 : Math.min(devicePixelRatio, 1.5));
      renderer.shadowMap.enabled = !value;
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.forEach((m) => (m.needsUpdate = true));
        }
      });
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      renderer.dispose();
    },
  };
}
