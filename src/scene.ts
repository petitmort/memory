import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { createBouquet } from "./bouquet";
import { createAlbum } from "./album-model";
import { createOcean } from "./ocean";
import { dimensions as D } from "./dimensions";
import { createPalette } from "./materials";
import {
  archedDoorGeometry,
  archedLintel,
  archMoulding,
  createExterior,
} from "./architecture";
import { createCurtains } from "./curtains";
import { createMythology } from "./mythology";
import { createDecor } from "./decor";
import { consoleLayout } from "./interior-layout";
import { readingBlend } from "./reading-timeline";
import { advanceReadingClock, createReadingPath, readingRetargetDuration, retargetReadingPath, type ReadingPath } from "./reading-motion";

export type PageProjection = { corners: { x: number; y: number }[] };
export type BookProjection = PageProjection & { pages: [PageProjection, PageProjection] };
export type ReadingFrame = { progress: number; projection: BookProjection };

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
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c6dce5");
  scene.fog = new THREE.FogExp2("#d2e4e8", 0.008);
  const camera = new THREE.PerspectiveCamera(
    50,
    innerWidth / innerHeight,
    0.1,
    500,
  );
  const target = new THREE.Vector3();
  const ambient = new THREE.HemisphereLight("#d5e9f7", "#a28b6d", 1.65);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight("#fff2dc", 3.5);
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
  const fill = new THREE.DirectionalLight("#f9f4e8", 1.1);
  fill.position.set(3, 5, 8);
  scene.add(fill);
  const mat = (color: string, roughness = 0.8, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const palette = createPalette();
  const plaster = palette.plaster,
    trim = palette.trim,
    darkWood = mat("#6b513a"),
    brass = mat("#ac8d55", 0.42, 0.65),
    green = mat("#295a72"),
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
  const wood = palette.wood;
  // World construction uses metres directly. No non-uniform parent scaling.
  const front = D.room.depth / 2,
    back = -front,
    halfWidth = D.room.width / 2;
  const floor = box(
    D.room.width,
    0.12,
    D.room.depth + 4.2,
    palette.stone,
    0,
    -0.06,
    2.1,
  );
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
  const curtains = createCurtains({
    width: D.window.width,
    height: D.window.height,
    sill: D.window.sill,
    back,
  });
  room.add(curtains.group);
  cylinder(0.012, 0.012, 3.64, brass, 0, 2.51, back + 0.3, room).rotation.z =
    Math.PI / 2;
  for (const x of [-1.62, 1.62]) {
    box(0.045, 0.075, 0.006, brass, x, 2.49, back + 0.095, room);
    const support = cylinder(
      0.0045,
      0.0045,
      0.2,
      brass,
      x,
      2.51,
      back + 0.2,
      room,
      10,
    );
    support.rotation.x = Math.PI / 2;
  }
  for (const x of [-1.84, 1.84])
    sphere(0.019, brass, x, 2.51, back + 0.3, room);
  const ocean = createOcean();
  const seaMat = ocean.material;
  scene.add(ocean);
  const mythology = createMythology();
  scene.add(mythology.group);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader:
      "varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader:
      "varying vec3 vPos;void main(){float h=normalize(vPos).y;vec3 col=mix(vec3(.84,.92,.95),vec3(.36,.65,.82),smoothstep(0.,.8,h));gl_FragColor=vec4(col,1.);}",
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(350, 24, 12), skyMat);
  scene.add(sky);
  const rug = box(
    D.rug.width,
    D.rug.thickness,
    D.rug.depth,
    palette.rug,
    0.1,
    D.rug.thickness / 2,
    -0.65,
  );
  rug.name = "rug";
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
  tabletop.material = palette.tableWood;
  const outline=new THREE.Shape();
  outline.moveTo(-.65,-.375);outline.bezierCurveTo(-.71,-.37,-.7,-.25,-.7,-.22);
  outline.lineTo(-.695,.27);outline.quadraticCurveTo(-.69,.375,-.59,.375);
  outline.bezierCurveTo(-.15,.363,.3,.375,.62,.368);outline.quadraticCurveTo(.7,.36,.7,.28);
  outline.lineTo(.695,-.27);outline.quadraticCurveTo(.69,-.375,.59,-.375);outline.closePath();
  const wornTop=new THREE.ExtrudeGeometry(outline,{depth:.027,bevelEnabled:true,bevelSize:.004,bevelThickness:.004,bevelSegments:3,curveSegments:20});
  wornTop.rotateX(-Math.PI/2);
  wornTop.computeBoundingBox();
  const topBounds=wornTop.boundingBox!,topSize=topBounds.getSize(new THREE.Vector3());
  wornTop.translate(-topBounds.getCenter(new THREE.Vector3()).x,-topBounds.getCenter(new THREE.Vector3()).y,-topBounds.getCenter(new THREE.Vector3()).z);
  wornTop.scale(D.desk.width/topSize.x,D.desk.top/topSize.y,D.desk.depth/topSize.z);
  tabletop.geometry.dispose();(tabletop as THREE.Mesh<THREE.BufferGeometry>).geometry=wornTop;

  for (const z of [-0.3, 0.3])
    box(1.27, 0.08, 0.025, darkWood, 0, 0.675, z, table);
  const legProfile = [
    new THREE.Vector2(0.0225, 0),
    new THREE.Vector2(0.0225, 0.04),
    new THREE.Vector2(0.017, 0.1),
    new THREE.Vector2(0.014, 0.45),
    new THREE.Vector2(0.023, 0.51),
    new THREE.Vector2(0.023, 0.55),
    new THREE.Vector2(0.018, 0.59),
    new THREE.Vector2(0.0225, D.desk.height - D.desk.top),
  ];
  const legGeometry = new THREE.LatheGeometry(legProfile, 16);
  for (const x of [-0.61, 0.61])
    for (const z of [-0.29, 0.29]) {
      const leg = new THREE.Mesh(legGeometry, wood);
      leg.position.set(x, 0, z);
      leg.castShadow = true;
      leg.receiveShadow = true;
      table.add(leg);
    }
  for (const z of [-0.315, 0.315])
    box(1.27, 0.012, 0.012, wood, 0, 0.706, z, table);
  const album = createAlbum();
  const book = album.group;
  book.position.set(-0.13, D.desk.height, -0.03);
  book.rotation.y = -0.1;
  table.add(book);
  const bookHinge = album.hinge;
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
  const glaze = mat("#326585", 0.28);
  for (const y of [0.026, 0.07]) {
    const stripe = new THREE.Mesh(
      new THREE.TorusGeometry(0.032 + y * 0.11, 0.0014, 6, 36),
      glaze,
    );
    stripe.rotation.x = Math.PI / 2;
    stripe.position.y = y;
    cup.add(stripe);
  }
  const pen = cylinder(
    0.0035,
    0.0035,
    0.135,
    green,
    0.2,
    0.755,
    -0.23,
    table,
    12,
  );
  pen.rotation.z = Math.PI / 2;
  const penNib = cylinder(
    0.0025,
    0,
    0.018,
    brass,
    0.277,
    0.755,
    -0.23,
    table,
    10,
  );
  penNib.rotation.z = Math.PI / 2;

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
    D.stool.height - D.stool.seat / 2 - 0.025,
    0,
    stool,
    32,
  );
  const stoolLegGeometry=new THREE.LatheGeometry([
    new THREE.Vector2(.017,0),new THREE.Vector2(.019,.025),new THREE.Vector2(.012,.09),
    new THREE.Vector2(.014,.25),new THREE.Vector2(.023,.31),new THREE.Vector2(.02,.35),
    new THREE.Vector2(.017,.39),
  ],16);
  for(const x of [-.115,.115])for(const z of [-.115,.115]){
    const leg=new THREE.Mesh(stoolLegGeometry,wood);leg.position.set(x,0,z);leg.castShadow=true;stool.add(leg);
  }
  for(const z of [-.115,.115]){
    const rail=cylinder(.008,.009,.23,wood,0,.14,z,stool,12);rail.rotation.z=Math.PI/2;
  }
  const cushion = new THREE.Mesh(new THREE.LatheGeometry([
    new THREE.Vector2(0,0),new THREE.Vector2(.16,0),new THREE.Vector2(.174,.004),
    new THREE.Vector2(.175,.009),new THREE.Vector2(.17,.019),new THREE.Vector2(.14,.024),new THREE.Vector2(0,.025),
  ],64),mat("#9db1ad",.98));
  cushion.position.y=.425; cushion.castShadow=cushion.receiveShadow=true;stool.add(cushion);
  const piping = new THREE.Mesh(
    new THREE.TorusGeometry(0.169, 0.0016, 6, 48),
    mat("#cbdad0"),
  );
  piping.rotation.x = Math.PI / 2;
  piping.position.y = 0.448;
  stool.add(piping);
  const consoleTable = new THREE.Group();
  consoleTable.name = "console";
  consoleTable.position.set(consoleLayout.x, 0, consoleLayout.z);
  consoleTable.rotation.y = consoleLayout.rotation;
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
  const consoleTop = consoleTable.getObjectByName("console-top") as THREE.Mesh;
  consoleTop.geometry.dispose();consoleTop.geometry = new RoundedBoxGeometry(D.console.width,.025,D.console.depth,4,.004);
  consoleTop.material=palette.tableWood;
  const consoleLegGeometry = new THREE.LatheGeometry([
    new THREE.Vector2(.015,0),new THREE.Vector2(.017,.025),new THREE.Vector2(.011,.07),
    new THREE.Vector2(.012,.50),new THREE.Vector2(.018,.56),new THREE.Vector2(.017,.60),
    new THREE.Vector2(.015,D.console.height-.025),
  ],24);
  for(const x of [-.39,.39])for(const z of [-.11,.11]) {
    const leg=new THREE.Mesh(consoleLegGeometry,wood);leg.position.set(x,0,z);
    leg.castShadow=leg.receiveShadow=true;consoleTable.add(leg);
  }
  for(const z of [-.12,.12])box(.80,.085,.022,wood,0,.705,z,consoleTable);
  for(const x of [-.39,.39])box(.022,.085,.25,wood,x,.705,0,consoleTable);
  const drawer=box(.68,.059,.012,palette.tableWood,0,.706,.139,consoleTable);
  drawer.name="console-front-drawer";drawer.geometry.dispose();
  (drawer as THREE.Mesh<THREE.BufferGeometry>).geometry=new RoundedBoxGeometry(.68,.059,.012,3,.003);
  const drawerPull = new THREE.Mesh(new THREE.TorusGeometry(.010,.0018,8,24),brass);
  drawerPull.position.set(0,.701,.153); consoleTable.add(drawerPull);
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
  const spring = D.door.height + D.door.threshold - D.door.width / 2;
  const lintel = new THREE.Mesh(
    archedLintel(openingLeft, openingRight, spring, D.room.height, D.room.wall),
    plaster,
  );
  lintel.castShadow = lintel.receiveShadow = true;
  facade.add(lintel);
  for (const x of [openingLeft - 0.035, openingRight + 0.035])
    box(0.07, spring, 0.12, trim, x, spring / 2, 0.035, facade);
  const arch = new THREE.Mesh(
    archMoulding((openingRight - openingLeft) / 2, 0.545, 0.1),
    trim,
  );
  arch.position.set(D.door.centerX, spring, -0.015);
  arch.castShadow = arch.receiveShadow = true;
  facade.add(arch);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(
    D.door.centerX - D.door.width / 2,
    D.door.threshold,
    0.005,
  );
  facade.add(doorPivot);
  const door: THREE.Mesh<THREE.BufferGeometry, THREE.Material> = box(
    D.door.width,
    D.door.height,
    D.door.thickness,
    palette.blue,
    D.door.width / 2,
    D.door.height / 2,
    0,
    doorPivot,
  );
  door.geometry.dispose();
  door.geometry = archedDoorGeometry(
    D.door.width,
    D.door.height,
    D.door.thickness,
  );
  door.name = "door-leaf";
  for (const y of [0.52, 1.27]) {
    box(0.69, 0.55, 0.006, palette.blue, 0.45, y, 0.0255, doorPivot);
    for (const x of [0.105, 0.795])
      box(0.012, 0.56, 0.014, palette.blue, x, y, 0.033, doorPivot);
    for (const dy of [-0.275, 0.275])
      box(0.7, 0.012, 0.014, palette.blue, 0.45, y + dy, 0.033, doorPivot);
  }
  for (let i = 0; i < 9; i++)
    box(
      0.0015,
      1.63,
      0.001,
      mat("#173f64"),
      0.05 + i * 0.1,
      0.82,
      0.023,
      doorPivot,
    );
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
  scene.add(createExterior({ plaster, blue: palette.blue }));
  scene.add(createDecor());
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
          t: new THREE.Vector3(0.15, 1.05, -1.4),
        }
      : {
          p: new THREE.Vector3(1.1, D.eye, 0.75),
          t: new THREE.Vector3(-0.2, 0.95, -1.5),
        };
  let current: "entry" | "room" | "book" = "entry";
  let animating = false,
    doorOpen = 0,
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
  let readerBackdropFrozen = false;
  let singleRenderRequested = false;
  let coverProgress = 0, leafProgress = 0;
  type ReadingPose = Pose & { fov: number };
  let roomBeforeReading: (ReadingPose & { mobile: boolean }) | null = null;
  let readingMotion: {
    kind: "opening" | "closing";
    from: ReadingPose;
    to: ReadingPose;
    path: ReadingPath;
    elapsed: number;
    duration: number;
    lastDrawAt: number | null;
    mobile: boolean;
    phaseStart: number;
    onFrame?: (frame: ReadingFrame) => void;
    done: () => void;
  } | null = null;
  album.setInvalidation(() => { singleRenderRequested = true; });

  function bookReadingPose(): ReadingPose {
    book.updateWorldMatrix(true, false);
    const centre = album.spreadCenter.clone().applyMatrix4(book.matrixWorld);
    return mobile()
      ? { p: centre.clone().add(new THREE.Vector3(0, .87, 1.65)), t: centre, fov: 54 }
      : { p: centre.clone().add(new THREE.Vector3(0, .82, .64)), t: centre, fov: 36 };
  }
  function getBookProjection(): BookProjection {
    book.updateWorldMatrix(true, true);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    const screen = (point: THREE.Vector3) => {
      const projected = point.clone().project(camera);
      return { x: (projected.x + 1) * innerWidth / 2, y: (1 - projected.y) * innerHeight / 2 };
    };
    const pages = album.pageWorldCorners().map(corners => ({ corners: corners.map(screen) })) as [PageProjection, PageProjection];
    return {
      corners: [pages[0].corners[0], pages[1].corners[1], pages[1].corners[2], pages[0].corners[3]],
      pages,
    };
  }
  function moveToBook(kind: "opening" | "closing", onFrame?: (frame: ReadingFrame) => void) {
    return new Promise<void>(done => {
      const from = { p: camera.position.clone(), t: target.clone(), fov: camera.fov };
      const saved = roomBeforeReading;
      const to = kind === "opening" ? bookReadingPose() : saved && saved.mobile === mobile()
        ? { p: saved.p.clone(), t: saved.t.clone(), fov: saved.fov }
        : { ...roomPose(), fov: 50 };
      const duration = reducedMotion ? 180 : kind === "opening" ? 2600 : 2000;
      readingMotion = {
        kind, from, to,
        path: createReadingPath(from,to,duration),
        elapsed: 0, duration, lastDrawAt: null, mobile: mobile(),
        phaseStart: 0, onFrame, done,
      };
    });
  }
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
    if (document.hidden || (readerBackdropFrozen && !singleRenderRequested)) return;
    if (low && now - lastDraw < 31 && !singleRenderRequested) return;
    const delta = now - lastDraw;
    lastDraw = now;
    if (delta > 0 && delta < 2000) {
      average = average * 0.9 + Math.min(delta, 250) * 0.1;
      if (average > 45) slowFrames++;
      else slowFrames = Math.max(0, slowFrames - 1);
      if (slowFrames >= 12) {
        const currentRatio = renderer.getPixelRatio();
        const next = Math.max(0.75, currentRatio * 0.85);
        if (next < currentRatio - 0.01) renderer.setPixelRatio(next);
        slowFrames = 0;
      }
    }
    const t = clock.getElapsedTime();
    seaMat.uniforms.time.value = t * (reducedMotion ? 0.15 : 1);
    if (!reducedMotion) {
      dust.position.y = Math.sin(t * 0.1) * 0.06;
    }
    curtains.update(t, reducedMotion);
    mythology.update(t, reducedMotion);
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
    let finishReadingFrame: (() => void) | null = null;
    let updateReadingFrame: { progress: number; callback: (frame: ReadingFrame) => void } | null = null;
    if (readingMotion) {
      const motion = readingMotion;
      // Keep the cover and leaf visible through slow shader/resize frames.
      // Normal frame rates retain the intended duration; a stall cannot skip a turn.
      const a = advanceReadingClock(motion,now);
      const phase = THREE.MathUtils.lerp(motion.phaseStart, 1, a);
      const pose = motion.path.sample(a);
      camera.position.copy(pose.p);
      target.copy(pose.t);
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      if (motion.kind === "opening") {
        coverProgress = THREE.MathUtils.smoothstep(phase, .06, .43);
        leafProgress = THREE.MathUtils.smoothstep(phase, .28, .60);
      } else {
        leafProgress = 1 - THREE.MathUtils.smoothstep(phase, .38, .74);
        coverProgress = 1 - THREE.MathUtils.smoothstep(phase, .60, .98);
      }
      album.setOpening(coverProgress, leafProgress);
      album.setVisibility(readingBlend(phase, motion.kind === "opening").book, true);
      if (motion.onFrame) updateReadingFrame = { progress: phase, callback: motion.onFrame };
      if (a === 1) {
        camera.position.copy(motion.to.p);
        target.copy(motion.to.t);
        readingMotion = null;
        finishReadingFrame = () => {
          animating = false;
          current = motion.kind === "opening" ? "book" : "room";
          readerBackdropFrozen = motion.kind === "opening";
          motion.done();
        };
      }
    }
    const dt = Math.min(Math.max(delta / 1000, 0), 0.1);
    doorPivot.rotation.y = THREE.MathUtils.damp(
      doorPivot.rotation.y,
      doorOpen,
      5,
      dt,
    );
    if (
      animating ||
      Math.abs(doorOpen - doorPivot.rotation.y) > 0.005 ||
      bouquetMotion !== null ||
      readingMotion !== null
    )
      sun.shadow.needsUpdate = true;
    camera.lookAt(target);
    renderer.render(scene, camera);
    singleRenderRequested = false;
    // Camera, paper and DOM all advance on this same rendered frame, including p=1.
    if (updateReadingFrame) updateReadingFrame.callback({ progress: updateReadingFrame.progress, projection: getBookProjection() });
    finishReadingFrame?.();
  }
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
      ray.intersectObject(current === "entry" ? door : bouquetParked ? book : bouquet, true).length > 0
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
    if (readingMotion) {
      const previous = readingMotion;
      singleRenderRequested = true;
      // An aspect-ratio change alone does not change either endpoint. Keep the
      // same trajectory and frame clock instead of braking and starting again.
      if (previous.mobile === mobile()) return;
      const progress = previous.elapsed / previous.duration;
      const from = { p: camera.position.clone(), t: target.clone(), fov: camera.fov };
      const velocity = previous.path.sample(progress).velocity;
      const saved = roomBeforeReading;
      const to = previous.kind === "opening" ? bookReadingPose() : saved && saved.mobile === mobile()
        ? { p: saved.p.clone(), t: saved.t.clone(), fov: saved.fov }
        : { ...roomPose(), fov: 50 };
      const duration = readingRetargetDuration(previous);
      readingMotion = {
        ...previous, from, to,
        path: retargetReadingPath({...from,velocity},to,duration),
        elapsed: 0, duration, mobile: mobile(),
        phaseStart: THREE.MathUtils.lerp(previous.phaseStart, 1, progress),
      };
    } else if (!animating && current === "book") {
      const pose = bookReadingPose();
      camera.position.copy(pose.p); target.copy(pose.t); camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      singleRenderRequested = true;
    } else if (!animating) {
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
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  // Warm the two-sided paper shader before its first visible turn.
  album.leaf.visible = true;
  const ready = renderer.compileAsync(scene, camera).then(() => {
    album.leaf.visible = false;
    renderer.render(scene, camera);
    clock.start();
    frame = requestAnimationFrame(tick);
  });
  return {
    ready,
    clearFog() {
      scene.fog = new THREE.FogExp2("#d2e4e8", 0.005);
    },
    async enterRoom() {
      doorOpen = -Math.PI * 0.58;
      animating = true;
      await new Promise((resolve) =>
        setTimeout(resolve, reducedMotion ? 0 : 800),
      );
      await walkIntoRoom();
    },
    async openBook(onFrame?: (frame: ReadingFrame) => void, paperReady?: Promise<void>) {
      if (animating || current !== "room") return getBookProjection();
      roomBeforeReading = { p: camera.position.clone(), t: target.clone(), fov: camera.fov, mobile: mobile() };
      animating = true;
      readerBackdropFrozen = false;
      current = "book";
      album.setVisibility(1);
      await Promise.all([parkBouquet(), paperReady]);
      await moveToBook("opening", onFrame);
      return getBookProjection();
    },
    getBookProjection,
    setBookChapter(index: number) {
      album.setChapter(index);
    },
    setBookPageCanvases(pages: [HTMLCanvasElement, HTMLCanvasElement]) {
      album.setPageCanvases(pages);
    },
    setBookVisibility(opacity: number) {
      album.setVisibility(opacity);
    },
    async returnToRoom(onFrame?: (frame: ReadingFrame) => void) {
      if (animating || current !== "book") return;
      animating = true;
      readerBackdropFrozen = false;
      singleRenderRequested = true;
      await moveToBook("closing", onFrame);
      album.setVisibility(1);
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
