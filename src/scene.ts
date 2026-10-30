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
import { createCozySeating } from "./cozy-seating";
import { createSleepingCat } from "./sleeping-cat";
import { createRecordPlayer } from "./record-player";
import { createCourtyardFog } from "./courtyard-fog";
import { warmSceneResources } from "./scene-warmup";
import { readingBlend } from "./reading-timeline";
import { advanceReadingClock, createReadingPath, readingRetargetDuration, retargetReadingPath, type ReadingPath } from "./reading-motion";
import { createInteractionFeedback, type InteractionKind } from "./interaction-feedback";
import { createQualityPolicy } from "./quality-policy";
import type { CatReactionProfile } from "./cat-reactions";

export type PageProjection = { corners: { x: number; y: number }[] };
export type BookProjection = PageProjection & { pages: [PageProjection, PageProjection] };
export type ReadingFrame = { progress: number; projection: BookProjection };

export class SceneUnavailableError extends Error {
  constructor() {
    super("The 3D scene is no longer available.");
    this.name = "SceneUnavailableError";
  }
}

export function createScene(
  container: HTMLElement,
  onInteract: () => void,
  reducedMotion: boolean,
  onUnavailable?: () => void,
  onPet?: (profile: CatReactionProfile) => (() => number) | undefined,
  onRecord?: () => void,
  onQualityChange?: (low: boolean) => void,
  onCatInteract?: () => boolean,
) {
  const listeners = new AbortController();
  const listenerOptions = { signal: listeners.signal };
  const hints = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const qualityPolicy = createQualityPolicy({ deviceMemory: hints.deviceMemory, hardwareConcurrency: hints.hardwareConcurrency, saveData: hints.connection?.saveData });
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, qualityPolicy.initialLow ? 1 : 1.5));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = !qualityPolicy.initialLow;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);
  const feedback = createInteractionFeedback(container);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#c6dce5");
  const fogColor = new THREE.Color("#c5d0d1"), clearColor = new THREE.Color("#d2e4e8");
  const sceneFog = new THREE.FogExp2(fogColor, .27);
  scene.fog = sceneFog;
  const camera = new THREE.PerspectiveCamera(
    50,
    innerWidth / innerHeight,
    0.1,
    500,
  );
  const courtyardFog = createCourtyardFog();
  courtyardFog.update(0, 0, reducedMotion);
  scene.add(courtyardFog.group);
  const target = new THREE.Vector3();
  const ambient = new THREE.HemisphereLight("#e1e8e5", "#aa9273", 1.65);
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
  const fill = new THREE.DirectionalLight("#ffe9cd", 1.05);
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
  const recordPlayer = createRecordPlayer();
  recordPlayer.group.position.set(.34, D.desk.height, -.16);
  table.add(recordPlayer.group);
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
  cup.position.set(-.49, D.desk.height, .23);
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
    0.025,
    0.755,
    -0.27,
    table,
    12,
  );
  pen.rotation.z = Math.PI / 2;
  const penNib = cylinder(
    0.0025,
    0,
    0.018,
    brass,
    0.102,
    0.755,
    -0.27,
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
    -0.28,
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
  const lounge = createCozySeating();
  // The back follows the left wall, with a slight angle opening into the room.
  lounge.group.position.set(-1.77, 0, -.27);
  lounge.group.rotation.y = Math.PI / 2 - .16;
  room.add(lounge.group);
  const cat = createSleepingCat();
  cat.group.rotation.y = Math.PI / 2;
  lounge.catNest.add(cat.group);
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
  // Approach through the clear space in front of the desk and stool. Keep a
  // standing eye, with enough distance to see the whole curled cat on a phone.
  const cozyPose = () => ({
    p: new THREE.Vector3(-.65, D.eye, .65),
    t: lounge.catNest.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, .09, 0)),
    fov: mobile() ? 54 : 46,
  });
  let current: "entry" | "room" | "book" = "entry";
  let fogClearance = 0;
  let fogClearing: Promise<void> | null = null;
  let fogMotion: { elapsed: number; duration: number; lastDrawAt: number | null; done: () => void } | null = null;
  // These objects sit behind the closed entrance. Reveal them before the door
  // starts moving, rather than drawing their hidden triangles in the courtyard.
  const shelteredDetails = [ocean, mythology.group, curtains.group, book, bouquet, lounge.group, recordPlayer.group];
  shelteredDetails.forEach(object => { object.visible = false; });
  let roomRevealed = false;
  let simulationTime = 0;
  let animating = false,
    doorOpen = 0,
    disposed = false;
  let unavailableError: SceneUnavailableError | null = null;
  const pending = new Set<(error: SceneUnavailableError) => void>();

  function requireAvailable() {
    if (unavailableError) throw unavailableError;
  }

  function whileAvailable<T>(operation: PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const cancel = (error: SceneUnavailableError) => {
        pending.delete(cancel);
        reject(error);
      };
      pending.add(cancel);
      // Observe both outcomes even after cancellation. A late image or shader
      // completion must neither revive the scene nor cause an unhandled reject.
      Promise.resolve(operation).then(value => {
        pending.delete(cancel);
        if (unavailableError) reject(unavailableError);
        else resolve(value);
      }, error => {
        pending.delete(cancel);
        reject(error);
      });
      if (unavailableError) cancel(unavailableError);
    });
  }
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
  let nookFocused = false;
  let lookMotion: {
    path: ReadingPath;
    to: Pose & { fov: number };
    focus: boolean;
    mobile: boolean;
    elapsed: number;
    duration: number;
    lastDrawAt: number | null;
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
  album.setInvalidation(requestRender);

  function setAlbumVisibility(opacity: number, preservePaper = false) {
    const wasVisible = album.group.visible;
    album.setVisibility(opacity, preservePaper);
    if (wasVisible !== album.group.visible) sun.shadow.needsUpdate = true;
  }

  function collectResources(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    root.traverse(object => {
      const renderable = object as THREE.Mesh;
      if (renderable.geometry instanceof THREE.BufferGeometry) geometries.add(renderable.geometry);
      if (!renderable.material) return;
      for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
        if (material instanceof THREE.ShaderMaterial)
          for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
      }
    });
    return { geometries, materials, textures };
  }

  function makeUnavailable(notify: boolean) {
    if (unavailableError) return;
    unavailableError = new SceneUnavailableError();
    stopIdleHint();
    feedback.dispose();
    listeners.abort();
    // Asset factories own their loading cancellation and private resources.
    // Release the remaining room resources once, including Points and uniforms.
    const resources = collectResources(scene);
    for (const owned of [cat.group, recordPlayer.group, courtyardFog.group]) {
      const asset = collectResources(owned);
      asset.geometries.forEach(value => resources.geometries.delete(value));
      asset.materials.forEach(value => resources.materials.delete(value));
      asset.textures.forEach(value => resources.textures.delete(value));
    }
    const fabric = collectResources(lounge.group);
    fabric.materials.forEach(value => resources.materials.delete(value));
    fabric.textures.forEach(value => resources.textures.delete(value));
    cat.dispose();
    recordPlayer.dispose();
    lounge.dispose();
    courtyardFog.dispose();
    resources.geometries.forEach(value => value.dispose());
    resources.materials.forEach(value => value.dispose());
    resources.textures.forEach(value => value.dispose());
    sun.shadow.dispose();
    album.setInvalidation(() => {});
    renderer.renderLists.dispose();
    fogMotion = null;
    cancelAnimationFrame(frame);
    frame = 0;
    walking = null;
    lookMotion = null;
    bouquetMotion = null;
    readingMotion = null;
    animating = false;
    for (const cancel of pending) cancel(unavailableError);
    pending.clear();
    if (notify) onUnavailable?.();
  }

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
    requireAvailable();
    return whileAvailable(new Promise<void>(done => {
      const from = { p: camera.position.clone(), t: target.clone(), fov: camera.fov };
      const saved = roomBeforeReading;
      if (kind === "closing" && saved && saved.mobile !== mobile()) nookFocused = false;
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
    }));
  }
  function walkIntoRoom() {
    requireAvailable();
    return whileAvailable(new Promise<void>((done) => {
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
        start: simulationTime * 1000,
        duration: reducedMotion ? 120 : 3800,
        done,
      };
    }));
  }
  function parkBouquet() {
    requireAvailable();
    if (bouquetParked) return Promise.resolve();
    return whileAvailable(new Promise<void>((done) => {
      bouquetMotion = {
        from: bouquet.position.clone(),
        to: new THREE.Vector3(.51, .805, .13),
        fromQ: bouquet.quaternion.clone(),
        toQ: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2)
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.32, .15, .35))),
        start: simulationTime * 1000,
        duration: reducedMotion ? 80 : 1100,
        done,
      };
    }));
  }
  let frame = 0,
    low = qualityPolicy.initialLow;
  let lastDraw: number | null = null;
  let prepared = false;
  let drawing = false;
  function scheduleFrame() {
    if (!frame && !drawing && prepared && !disposed && !unavailableError && !document.hidden)
      frame = requestAnimationFrame(tick);
  }
  function requestRender() {
    singleRenderRequested = true;
    scheduleFrame();
  }
  function pauseFrames() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastDraw = null;
    if (readingMotion) readingMotion.lastDrawAt = null;
    if (lookMotion) lookMotion.lastDrawAt = null;
    if (fogMotion) fogMotion.lastDrawAt = null;
  }
  function visibilityChanged() {
    if (document.hidden) {
      clearInteractionFeedback();
      qualityPolicy.resetSamples();
      if (cat.cancelPet()) sun.shadow.needsUpdate = true;
      pauseFrames();
    }
    else {
      scheduleIdleHint();
      if (!readerBackdropFrozen || singleRenderRequested) scheduleFrame();
    }
  }
  document.addEventListener("visibilitychange", visibilityChanged, listenerOptions);
  function tick(now: number) {
    frame = 0;
    if (disposed || unavailableError) return;
    if (document.hidden || (readerBackdropFrozen && !singleRenderRequested)) return;
    const interval = low || (current === "entry" && !animating) ? 1000 / 30 : 0;
    if (lastDraw !== null && now - lastDraw < interval - 1 && !singleRenderRequested) {
      scheduleFrame();
      return;
    }
    drawing = true;
    const delta = lastDraw === null ? 0 : now - lastDraw;
    lastDraw = now;
    if (qualityPolicy.sample(delta, { eligible: current === "room" && !animating && !readerBackdropFrozen })) applyQuality(true, true);
    // Hidden tabs and reading pauses do not advance the sea or a walking eye.
    simulationTime += Math.max(delta, 0) / 1000;
    const t = simulationTime;
    let finishFogFrame: (() => void) | undefined;
    let updateFog = false;
    if (current === "entry" && fogClearance < 1) {
      if (fogMotion) {
        const motion = fogMotion;
        // Clearing begins on an actual draw and pauses with a hidden tab.
        const a = advanceReadingClock(motion, now);
        fogClearance = a * a * (3 - 2 * a);
        if (a === 1) {
          fogMotion = null;
          finishFogFrame = () => { animating = false; motion.done(); };
        }
      }
      updateFog = true;
      sceneFog.density = THREE.MathUtils.lerp(.27, .005, fogClearance);
      sceneFog.color.lerpColors(fogColor, clearColor, fogClearance);
    }
    if (!reducedMotion) {
      dust.position.y = Math.sin(t * 0.1) * 0.06;
    }
    if (roomRevealed) {
      seaMat.uniforms.time.value = t * (reducedMotion ? 0.15 : 1);
      curtains.update(t, reducedMotion);
      mythology.update(t, reducedMotion);
      if (cat.update(t, reducedMotion)) sun.shadow.needsUpdate = true;
      if (recordPlayer.update(t, reducedMotion)) sun.shadow.needsUpdate = true;
    }
    let finishLookFrame: (() => void) | undefined;
    if (lookMotion) {
      const motion = lookMotion;
      const a = advanceReadingClock(motion, now), pose = motion.path.sample(a);
      camera.position.copy(pose.p);
      target.copy(pose.t);
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      if (a === 1) {
        camera.position.copy(motion.to.p); target.copy(motion.to.t);
        lookMotion = null;
        finishLookFrame = () => { animating = false; motion.done(); };
      }
    }
    if (walking) {
      const a = Math.min(1, (t * 1000 - walking.start) / walking.duration),
        ease = a * a * (3 - 2 * a);
      camera.position.copy(walking.path.getPoint(ease));
      target.lerpVectors(walking.fromT, walking.toT, ease);
      if (a === 1) {
        const done = walking.done;
        walking = null;
        animating = false;
        current = "room";
        scheduleIdleHint();
        done();
      }
    }
    if (bouquetMotion) {
      const previousPosition = bouquet.position.clone();
      const previousRotation = bouquet.quaternion.clone();
      const a = Math.min(
          1,
          (t * 1000 - bouquetMotion.start) / bouquetMotion.duration,
        ),
        ease = a * a * (3 - 2 * a);
      bouquet.position.lerpVectors(bouquetMotion.from, bouquetMotion.to, ease);
      bouquet.position.y += Math.sin(Math.PI * a) * 0.025;
      bouquet.position.z += Math.sin(Math.PI * a) * .06;
      bouquet.quaternion.slerpQuaternions(
        bouquetMotion.fromQ,
        bouquetMotion.toQ,
        ease,
      );
      if (!bouquet.position.equals(previousPosition) || !bouquet.quaternion.equals(previousRotation))
        sun.shadow.needsUpdate = true;
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
      const previousCover = coverProgress, previousLeaf = leafProgress;
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
      setAlbumVisibility(readingBlend(phase, motion.kind === "opening").book, true);
      if (album.group.visible && (coverProgress !== previousCover || leafProgress !== previousLeaf))
        sun.shadow.needsUpdate = true;
      if (motion.onFrame) updateReadingFrame = { progress: phase, callback: motion.onFrame };
      if (a === 1) {
        camera.position.copy(motion.to.p);
        target.copy(motion.to.t);
        readingMotion = null;
        if (motion.kind === "opening" && cat.cancelPet()) sun.shadow.needsUpdate = true;
        finishReadingFrame = () => {
          animating = false;
          current = motion.kind === "opening" ? "book" : "room";
          readerBackdropFrozen = motion.kind === "opening";
          scheduleIdleHint();
          motion.done();
        };
      }
    }
    const dt = Math.min(Math.max(delta / 1000, 0), 0.1);
    const previousDoor = doorPivot.rotation.y;
    doorPivot.rotation.y = THREE.MathUtils.damp(
      doorPivot.rotation.y,
      doorOpen,
      5,
      dt,
    );
    // The light is fixed. Moving only the eye can reuse its world-space depth
    // map; rebuild it only when a caster actually moves or changes visibility.
    if (Math.abs(doorPivot.rotation.y - previousDoor) > .000001)
      sun.shadow.needsUpdate = true;
    camera.lookAt(target);
    if (updateFog) {
      camera.updateMatrixWorld();
      courtyardFog.update(t, fogClearance, reducedMotion, camera);
    }
    renderer.render(scene, camera);
    singleRenderRequested = false;
    // Camera, paper and DOM all advance on this same rendered frame, including p=1.
    if (updateReadingFrame) updateReadingFrame.callback({ progress: updateReadingFrame.progress, projection: getBookProjection() });
    finishFogFrame?.();
    finishLookFrame?.();
    finishReadingFrame?.();
    drawing = false;
    if (readerBackdropFrozen && !singleRenderRequested) lastDraw = null;
    else scheduleFrame();
  }
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const canvas = renderer.domElement;
  let interactionEnabled = true, idleGuidanceShown = false, explored = false;
  let idleHintTimer: ReturnType<typeof setTimeout> | undefined;
  let petStroke: { id: number; x: number; y: number; length: number; stroked: boolean } | null = null;
  let recordPress: { id: number; x: number; y: number; moved: boolean } | null = null;
  let objectPress: { id: number; x: number; y: number; moved: boolean; kind: InteractionKind } | null = null;
  const activePointers = new Set<number>(), cancelledPointers = new Set<number>();
  const feedbackText: Record<InteractionKind, string> = {
    bouquet: "轻触花束，打开纪念册", book: "轻触画册，继续阅读", cat: "轻轻摸摸睡着的小猫", record: "轻触唱片机，听一首喜欢的歌", door: "探索门后的房间",
  };
  function stopIdleHint() { clearTimeout(idleHintTimer); idleHintTimer = undefined; }
  function clearInteractionFeedback() { stopIdleHint(); feedback.hide(); canvas.style.cursor = "default"; }
  function showFeedback(kind: InteractionKind, e: Pick<PointerEvent, "clientX" | "clientY">, phase: "hover" | "press" | "activate", text = feedbackText[kind]) {
    feedback.show(kind, text, e.clientX, e.clientY, phase, phase === "hover" ? undefined : phase === "press" ? 1600 : 1700);
  }
  function markExplored() { explored = true; stopIdleHint(); }
  function hintInteractionsOnce() {
    if (idleGuidanceShown || explored || nookFocused || !canPet()) return;
    const object = bouquetParked ? book : bouquet;
    object.updateWorldMatrix(true, true);
    camera.updateMatrixWorld(true);
    const anchor = new THREE.Box3().setFromObject(object).getCenter(new THREE.Vector3()).project(camera);
    const x = (anchor.x + 1) * innerWidth / 2, y = (1 - anchor.y) * innerHeight / 2;
    if (anchor.z < -1 || anchor.z > 1 || x < 16 || x > innerWidth - 16 || y < 90 || y > innerHeight - 80) return;
    // A visual hint can never intercept an object or a nearby UI control.
    if (document.elementFromPoint(x, y) !== canvas) return;
    idleGuidanceShown = true;
    const kind = bouquetParked ? "book" : "bouquet";
    feedback.show(kind, feedbackText[kind], x, y, "hint", 4200);
  }
  function scheduleIdleHint() {
    stopIdleHint();
    if (!idleGuidanceShown && !explored && canPet()) idleHintTimer = setTimeout(hintInteractionsOnce, 6000);
  }
  function interactionActivity() {
    if (current === "room") { feedback.hide(); scheduleIdleHint(); }
  }
  window.addEventListener("pointerdown", interactionActivity, { ...listenerOptions, capture: true });
  window.addEventListener("keydown", interactionActivity, listenerOptions);
  function canPet() {
    return interactionEnabled && !disposed && !unavailableError && !animating && current === "room" && !document.hidden;
  }
  function performPet() {
    if (!canPet() || !cat.pet(simulationTime, reducedMotion)) return false;
    markExplored();
    cat.setReactionClock(onPet?.(cat.getReaction()!));
    requestRender();
    return true;
  }
  function requestPet(e: PointerEvent) {
    const nearby = nookFocused;
    if (!(onCatInteract ? onCatInteract() : performPet())) return;
    showFeedback("cat", e, "activate", nearby ? "小猫舒服地蹭了蹭" : "走近看看小猫…");
  }
  function pointRay(e: PointerEvent) {
    pointer.set((e.clientX / innerWidth) * 2 - 1, (-e.clientY / innerHeight) * 2 + 1);
    ray.far = Infinity;
    ray.setFromCamera(pointer, camera);
  }
  function visibleHit(root: THREE.Object3D, e: PointerEvent) {
    pointRay(e);
    const candidate = ray.intersectObject(root, true)[0];
    if (!candidate) return false;
    // Only do the wider occlusion check after hitting the small cat bounds.
    // A hand cannot reach through furniture to a hidden part of the model.
    ray.far = Math.max(0, candidate.distance - .001);
    const blocked = ray.intersectObjects(scene.children, true).some(hit => {
      if (!(hit.object instanceof THREE.Mesh)) return false;
      for (let object: THREE.Object3D | null = hit.object; object; object = object.parent) {
        if (!object.visible || object === root) return false;
      }
      return true;
    });
    ray.far = Infinity;
    return !blocked;
  }
  function catHit(e: PointerEvent) { return canPet() && visibleHit(cat.group, e); }
  function recordHit(e: PointerEvent) { return canPet() && visibleHit(recordPlayer.group, e); }
  function hit(e: PointerEvent) {
    if (!interactionEnabled || disposed || unavailableError || animating || current === "book" || (current === "room" && nookFocused) || document.hidden) return false;
    pointRay(e);
    return current === "entry" ? ray.intersectObject(door, true).length > 0 : visibleHit(bouquetParked ? book : bouquet, e);
  }
  canvas.addEventListener("pointerdown", e => {
    activePointers.add(e.pointerId);
    if (!e.isPrimary || activePointers.size > 1) {
      for (const id of activePointers) cancelledPointers.add(id);
      petStroke = null;
      recordPress = null;
      objectPress = null;
      feedback.hide();
      return;
    }
    if (e.button !== 0) return;
    if (recordHit(e)) {
      recordPress = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
      showFeedback("record", e, "press");
      canvas.setPointerCapture(e.pointerId);
      return;
    }
    if (catHit(e)) {
      petStroke = { id: e.pointerId, x: e.clientX, y: e.clientY, length: 0, stroked: false };
      showFeedback("cat", e, "press");
      canvas.setPointerCapture(e.pointerId);
    } else if (hit(e)) {
      const kind = current === "entry" ? "door" : bouquetParked ? "book" : "bouquet";
      objectPress = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, kind };
      showFeedback(kind, e, "press");
      canvas.setPointerCapture(e.pointerId);
    }
  }, listenerOptions);
  canvas.addEventListener("pointerup", e => {
    activePointers.delete(e.pointerId);
    if (cancelledPointers.delete(e.pointerId) || !e.isPrimary || e.button !== 0) return;
    if (recordPress?.id === e.pointerId) {
      const press = recordPress;
      recordPress = null;
      if (!press.moved && recordHit(e)) {
        markExplored();
        showFeedback("record", e, "activate", "已轻触唱片机");
        onRecord?.();
      } else feedback.hide();
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      return;
    }
    if (petStroke?.id === e.pointerId) {
      const stroke = petStroke;
      petStroke = null;
      if (!stroke.stroked && stroke.length < 10 && catHit(e)) requestPet(e);
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      return; // A stroke ending over the desk must never open the album.
    }
    if (objectPress?.id === e.pointerId) {
      const press = objectPress;
      objectPress = null;
      if (!press.moved && hit(e)) {
        if (current === "room") markExplored();
        showFeedback(press.kind, e, "activate", press.kind === "bouquet" ? "把花轻轻放到一旁…" : press.kind === "book" ? "继续翻阅纪念册…" : fogClearance < 1 ? "风正在经过…" : "轻轻推开这扇门…");
        onInteract();
      } else feedback.hide();
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    }
  }, listenerOptions);
  canvas.addEventListener("pointermove", e => {
    if (recordPress?.id === e.pointerId) {
      recordPress.moved ||= Math.hypot(e.clientX - recordPress.x, e.clientY - recordPress.y) >= 10;
      if (recordPress.moved) feedback.hide();
      canvas.style.cursor = "pointer";
    } else if (petStroke?.id === e.pointerId) {
      petStroke.length += Math.hypot(e.clientX - petStroke.x, e.clientY - petStroke.y);
      petStroke.x = e.clientX; petStroke.y = e.clientY;
      if (!petStroke.stroked && petStroke.length >= 10 && catHit(e)) {
        petStroke.stroked = true;
        requestPet(e);
      }
      canvas.style.cursor = "grabbing";
    } else if (objectPress?.id === e.pointerId) {
      objectPress.moved ||= Math.hypot(e.clientX - objectPress.x, e.clientY - objectPress.y) >= 10;
      if (objectPress.moved) feedback.hide();
    } else if (e.pointerType !== "touch" && e.timeStamp - lastPointerHint > 65) {
      lastPointerHint = e.timeStamp;
      const kind = catHit(e) ? "cat" : recordHit(e) ? "record" : hit(e) ? current === "entry" ? "door" : bouquetParked ? "book" : "bouquet" : undefined;
      canvas.style.cursor = kind === "cat" ? "grab" : kind ? "pointer" : "default";
      if (kind) { scheduleIdleHint(); showFeedback(kind, e, "hover"); }
      else feedback.hide();
    }
  }, listenerOptions);
  canvas.addEventListener("pointerleave", () => { if (!petStroke && !recordPress && !objectPress) feedback.hide(); }, listenerOptions);
  canvas.addEventListener("pointercancel", e => {
    activePointers.delete(e.pointerId);
    cancelledPointers.delete(e.pointerId);
    if (petStroke?.id === e.pointerId) petStroke = null;
    if (recordPress?.id === e.pointerId) recordPress = null;
    if (objectPress?.id === e.pointerId) objectPress = null;
    feedback.hide();
  }, listenerOptions);
  canvas.addEventListener("lostpointercapture", e => {
    if (petStroke?.id === e.pointerId) {
      cancelledPointers.add(e.pointerId);
      petStroke = null;
    }
    if (recordPress?.id === e.pointerId) {
      cancelledPointers.add(e.pointerId);
      recordPress = null;
    }
    if (objectPress?.id === e.pointerId) {
      cancelledPointers.add(e.pointerId);
      objectPress = null;
    }
  }, listenerOptions);
  let lastPointerHint = -Infinity;
  function finishPointer(e: PointerEvent) {
    activePointers.delete(e.pointerId); cancelledPointers.delete(e.pointerId);
    if (petStroke?.id === e.pointerId) petStroke = null;
    if (recordPress?.id === e.pointerId) recordPress = null;
    if (objectPress?.id === e.pointerId) objectPress = null;
  }
  window.addEventListener("pointerup", finishPointer, listenerOptions);
  window.addEventListener("pointercancel", finishPointer, listenerOptions);
  window.addEventListener("resize", () => {
    if (disposed || unavailableError) return;
    clearInteractionFeedback();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    requestRender();
    if (lookMotion) {
      const previous = lookMotion;
      if (previous.mobile === mobile()) return;
      const from = { p: camera.position.clone(), t: target.clone(), fov: camera.fov };
      const velocity = previous.path.sample(previous.elapsed / previous.duration).velocity;
      const to = previous.focus ? cozyPose() : { ...roomPose(), fov: 50 };
      const duration = readingRetargetDuration(previous);
      lookMotion = {
        ...previous, to, path: retargetReadingPath({ ...from, velocity }, to, duration),
        elapsed: 0, duration, lastDrawAt: null, mobile: mobile(),
      };
      return;
    }
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
      if (previous.kind === "closing" && saved && saved.mobile !== mobile()) nookFocused = false;
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
      const pose = current === "entry" ? { ...entryPose(), fov: 50 }
        : nookFocused ? cozyPose() : { ...roomPose(), fov: 50 };
      camera.position.copy(pose.p);
      target.copy(pose.t);
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
    }
  }, listenerOptions);
  renderer.domElement.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    makeUnavailable(true);
  }, listenerOptions);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  // Warm the two-sided paper shader before its first visible turn.
  album.leaf.visible = true;
  const ready = whileAvailable(Promise.all([cat.ready, lounge.ready])).then(() => {
    requireAvailable();
    return whileAvailable(renderer.compileAsync(scene, camera));
  }).then(() => whileAvailable(warmSceneResources(renderer, scene, camera, shelteredDetails, requireAvailable))).then(() => {
    requireAvailable();
    album.leaf.visible = false;
    renderer.render(scene, camera);
    prepared = true;
    requestRender();
  });
  function applyQuality(value: boolean, automatic = false) {
    if (disposed || unavailableError) return;
    low = value;
    renderer.setPixelRatio(value ? Math.min(renderer.getPixelRatio(), automatic ? .85 : 1) : Math.min(devicePixelRatio, 1.5));
    // Automatic adaptation keeps the warmed shadow shader variant. Switching
    // resolution and frame pacing must not introduce new compilation stalls.
    const shadowsChanged = !automatic && renderer.shadowMap.enabled !== !value;
    if (!automatic) renderer.shadowMap.enabled = !value;
    if (!value) sun.shadow.needsUpdate = true;
    // A quality change may alter shadow defines. Mark each shared material once,
    // and avoid recompiling any program for a resolution-only adjustment.
    if (shadowsChanged) {
      const materials = new Set<THREE.Material>();
      scene.traverse(object => {
        if (object instanceof THREE.Mesh)
          for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      });
      materials.forEach(material => { material.needsUpdate = true; });
    }
    canvas.dataset.quality = value ? "low" : "auto";
    onQualityChange?.(value);
    requestRender();
  }
  return {
    ready,
    clearFog() {
      requireAvailable();
      if (fogClearing) return fogClearing;
      clearInteractionFeedback();
      animating = true;
      fogClearing = whileAvailable(new Promise<void>(done => {
        fogMotion = { elapsed: 0, duration: reducedMotion ? 100 : 1850, lastDrawAt: null, done };
      }));
      requestRender();
      return fogClearing;
    },
    async enterRoom() {
      requireAvailable();
      clearInteractionFeedback();
      qualityPolicy.resetSamples();
      if (!roomRevealed) {
        roomRevealed = true;
        shelteredDetails.forEach(object => { object.visible = true; });
        sun.shadow.needsUpdate = true;
      }
      doorOpen = -Math.PI * 0.58;
      animating = true;
      requestRender();
      await whileAvailable(new Promise<void>((resolve) =>
        setTimeout(resolve, reducedMotion ? 0 : 800),
      ));
      requireAvailable();
      await walkIntoRoom();
      requireAvailable();
    },
    async openBook(onFrame?: (frame: ReadingFrame) => void, paperReady?: Promise<void>) {
      requireAvailable();
      if (animating || current !== "room") return getBookProjection();
      clearInteractionFeedback();
      qualityPolicy.resetSamples();
      roomBeforeReading = { p: camera.position.clone(), t: target.clone(), fov: camera.fov, mobile: mobile() };
      animating = true;
      readerBackdropFrozen = false;
      current = "book";
      setAlbumVisibility(1);
      await whileAvailable(Promise.all([parkBouquet(), paperReady]));
      requireAvailable();
      await moveToBook("opening", onFrame);
      requireAvailable();
      return getBookProjection();
    },
    async focusCozyCorner(focus: boolean) {
      requireAvailable();
      if (animating || current !== "room") return nookFocused;
      clearInteractionFeedback();
      qualityPolicy.resetSamples();
      const from = { p: camera.position.clone(), t: target.clone(), fov: camera.fov };
      const to = focus ? cozyPose() : { ...roomPose(), fov: 50 };
      const duration = reducedMotion ? 180 : 1800;
      animating = true;
      await whileAvailable(new Promise<void>(done => {
        lookMotion = {
          path: retargetReadingPath({ ...from, velocity: { p: new THREE.Vector3(), t: new THREE.Vector3(), fov: 0 } }, to, duration),
          to, focus, mobile: mobile(), elapsed: 0,
          duration, lastDrawAt: null, done,
        };
        requestRender();
      }));
      nookFocused = focus;
      scheduleIdleHint();
      return nookFocused;
    },
    isCozyFocused() { return nookFocused; },
    petCat: performPet,
    setInteractionEnabled(enabled: boolean) {
      interactionEnabled = enabled;
      if (!enabled) clearInteractionFeedback();
      else scheduleIdleHint();
    },
    clearInteractionFeedback,
    hintInteractionsOnce,
    getQuality() { return { low, manual: qualityPolicy.manual !== undefined }; },
    setRecordPlaying(playing: boolean) {
      if (disposed || unavailableError) return;
      recordPlayer.setPlaying(playing);
      requestRender();
    },
    getBookProjection,
    setBookChapter(index: number) {
      album.setChapter(index);
    },
    setBookPageCanvases(pages: [HTMLCanvasElement, HTMLCanvasElement]) {
      album.setPageCanvases(pages);
    },
    setBookVisibility(opacity: number) {
      setAlbumVisibility(opacity);
    },
    async returnToRoom(onFrame?: (frame: ReadingFrame) => void) {
      requireAvailable();
      if (animating || current !== "book") return;
      clearInteractionFeedback();
      qualityPolicy.resetSamples();
      animating = true;
      readerBackdropFrozen = false;
      lastDraw = null;
      singleRenderRequested = true;
      scheduleFrame();
      await moveToBook("closing", onFrame);
      requireAvailable();
      setAlbumVisibility(1);
    },
    setQuality(value: boolean) {
      qualityPolicy.setManual(value ? true : undefined);
      applyQuality(qualityPolicy.low);
    },
    dispose() {
      if (disposed) return;
      makeUnavailable(false);
      disposed = true;
      cancelAnimationFrame(frame);
      renderer.dispose();
    },
  };
}
