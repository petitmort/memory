import * as THREE from "three";
import { createBouquet } from "./bouquet";
import { createOcean } from "./ocean";

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
    42,
    innerWidth / innerHeight,
    0.1,
    500,
  );
  const target = new THREE.Vector3();
  const ambient = new THREE.HemisphereLight("#e9f0de", "#6e6656", 2.0);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight("#fff0cf", 3.8);
  sun.position.set(-4, 9, -5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.normalBias = 0.035;
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
  const floor = box(14, 0.15, 17, wood, 0, -0.1, 3.4);
  floor.receiveShadow = true;
  const seams = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.009, 0.008, 17),
    mat("#76624c"),
    40,
  );
  for (let i = 0; i < 40; i++)
    seams.setMatrixAt(
      i,
      new THREE.Matrix4().makeTranslation(-14 + i * 0.7, -0.019, 3.4),
    );
  scene.add(seams);
  // Room open to the ocean: back wall frames an expansive window.
  const room = new THREE.Group();
  scene.add(room);
  room.scale.y = 0.8;
  box(1.2, 5.8, 0.3, plaster, -5.2, 2.85, -5, room);
  box(1.2, 5.8, 0.3, plaster, 5.2, 2.85, -5, room);
  box(9.2, 0.8, 0.3, plaster, 0, 5.35, -5, room);
  box(9.2, 1.1, 0.3, plaster, 0, 0.5, -5, room);
  box(0.25, 5.8, 10, plaster, -5.8, 2.85, 0, room);
  box(0.25, 5.8, 10, plaster, 5.8, 2.85, 0, room);
  box(9.4, 0.15, 0.6, trim, 0, 1.07, -4.85, room);
  box(0.1, 4, 0.2, trim, 0, 3, -4.85, room);
  for (const x of [-4.6, 4.6]) box(0.16, 4.05, 0.3, trim, x, 3.05, -4.86, room);
  box(9.4, 0.15, 0.3, trim, 0, 5.05, -4.85, room);
  // Airy curtains, built as soft folded fabric surfaces.
  const curtainMat = new THREE.MeshStandardMaterial({
    color: "#eee6d4",
    roughness: 1,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.87,
  });
  const curtains: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const g = new THREE.PlaneGeometry(1.55, 4.25, 18, 24);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i);
      pos.setZ(i, Math.sin(x * 17) * 0.1 + Math.pow((2.1 - y) / 4.2, 2) * 0.17);
    }
    g.computeVertexNormals();
    const c = new THREE.Mesh(g, curtainMat);
    c.position.set(side * 4.1, 3, -4.5);
    room.add(c);
    curtains.push(c);
  }
  cylinder(0.035, 0.035, 10, brass, 0, 5.25, -4.45, room).rotation.z =
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
  // Linen rug and a solid oak writing table.
  box(5.3, 0.025, 3.65, mat("#bfb7a0"), 0, 0.01, -0.25);
  const stripes = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.025, 0.008, 3.6),
    mat("#cfc6ad"),
    53,
  );
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < 53; i++)
    stripes.setMatrixAt(
      i,
      matrix.makeTranslation((i - 26) * 0.1, 0.028, -0.25),
    );
  stripes.receiveShadow = true;
  scene.add(stripes);
  const table = new THREE.Group();
  table.scale.setScalar(0.65);
  table.position.set(0.25, 0, -0.8);
  room.add(table);
  box(3.8, 0.15, 2.1, wood, 0, 1.52, 0, table);
  box(3.5, 0.24, 0.12, darkWood, 0, 1.34, 0.87, table);
  box(3.5, 0.24, 0.12, darkWood, 0, 1.34, -0.87, table);
  for (const x of [-1.6, 1.6])
    for (const z of [-0.8, 0.8]) {
      const leg = box(0.13, 1.4, 0.13, darkWood, x, 0.7, z, table);
      leg.rotation.z = x > 0 ? -0.035 : 0.035;
    }
  // Album, cover embossing, and page edges.
  const book = new THREE.Group();
  book.position.set(-0.25, 1.65, 0.18);
  book.rotation.y = -0.1;
  table.add(book);
  box(1.65, 0.12, 1.15, paper, 0, 0.015, 0, book);
  box(1.72, 0.035, 1.21, green, 0, -0.065, 0, book);
  const bookHinge = new THREE.Group();
  bookHinge.position.set(-0.86, 0.1, 0);
  book.add(bookHinge);
  box(1.72, 0.055, 1.21, green, 0.86, 0, 0, bookHinge);
  for (let i = 0; i < 9; i++)
    box(1.63, 0.003, 1.14, mat("#b8b09c"), 0, -0.035 + i * 0.012, 0, book);
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
    new THREE.PlaneGeometry(1.68, 1.17),
    new THREE.MeshStandardMaterial({ map: labelTexture(), roughness: 0.9 }),
  );
  label.rotation.x = -Math.PI / 2;
  label.position.set(0.86, 0.03, 0);
  bookHinge.add(label);
  // A compact garden bouquet rests diagonally across the album.
  const bouquet = createBouquet();
  bouquet.position.set(0.42, 1.83, 0.49);
  bouquet.rotation.set(-1.12, -0.25, 0.55);
  table.add(bouquet);
  // Ceramic cup, handwritten letter, and a simple stool.
  cylinder(0.115, 0.09, 0.19, mat("#ded5be"), 1.2, 1.69, -0.5, table);
  cylinder(0.098, 0.098, 0.01, mat("#51402e"), 1.2, 1.79, -0.5, table);
  const handle = new THREE.Mesh(
    new THREE.TorusGeometry(0.075, 0.018, 8, 16),
    mat("#ded5be"),
  );
  handle.position.set(1.33, 1.69, -0.5);
  table.add(handle);
  const letter = box(0.5, 0.007, 0.36, paper, -1.21, 1.606, -0.43, table);
  letter.rotation.y = 0.2;
  cylinder(0.32, 0.32, 0.08, wood, 0.3, 0.55, 0.6, room);
  for (const x of [-0.22, 0.22])
    for (const z of [0.38, 0.82])
      box(0.06, 0.53, 0.06, darkWood, x + 0.3, 0.265, z, room);
  // Small console and sunlit ceramics to give the room depth.
  box(1.5, 0.11, 0.65, wood, -4.4, 1.07, -2.6, room);
  for (const x of [-5, -3.8]) box(0.07, 1, 0.07, darkWood, x, 0.5, -2.6, room);
  cylinder(0.15, 0.2, 0.5, mat("#c8b89b"), -4.6, 1.38, -2.6, room);
  cylinder(0.09, 0.15, 0.35, green, -4.12, 1.31, -2.62, room);
  // The entry facade and its inset paneled timber door.
  const facade = new THREE.Group();
  scene.add(facade);
  facade.position.z = 3.5;
  facade.scale.y = 0.7;
  box(20, 8, 0.35, plaster, -10.58, 3.95, 0, facade);
  box(20, 8, 0.35, plaster, 11.88, 3.95, 0, facade);
  box(2.2, 2.5, 0.35, plaster, 0.6, 4.7, 0, facade);
  box(0.2, 3.7, 0.35, trim, -0.6, 1.8, 0.07, facade);
  box(0.2, 3.7, 0.35, trim, 1.8, 1.8, 0.07, facade);
  box(2.6, 0.2, 0.35, trim, 0.6, 3.65, 0.07, facade);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-0.48, 0, 0.02);
  facade.add(doorPivot);
  const door = box(2.16, 3.5, 0.13, wood, 1.08, 1.75, 0, doorPivot);
  for (const y of [1.05, 2.6]) {
    box(1.68, 1.1, 0.025, darkWood, 1.08, y, 0.078, doorPivot);
    box(1.55, 0.97, 0.025, wood, 1.08, y, 0.097, doorPivot);
  }
  box(0.08, 3.38, 0.045, darkWood, 0.08, 1.75, 0.09, doorPivot);
  box(0.08, 3.38, 0.045, darkWood, 2.08, 1.75, 0.09, doorPivot);
  const plate = box(0.13, 0.35, 0.04, brass, 1.9, 1.63, 0.12, doorPivot);
  sphere(0.065, brass, 1.9, 1.65, 0.22, doorPivot);
  box(0.27, 0.035, 0.045, brass, 1.82, 1.66, 0.24, doorPivot);
  box(2.8, 0.09, 0.6, mat("#a59b81"), 0.6, 0.01, 0.18, facade);
  box(2.9, 0.08, 0.7, mat("#c3b79a"), 0.6, -0.07, 0.3, facade);
  // Framed house number, wall lamp, and potted olive branches.
  box(0.33, 0.4, 0.035, brass, 2.3, 2.75, 0.2, facade);
  const lanternMat = new THREE.MeshStandardMaterial({
    color: "#f8dfaa",
    emissive: "#eec28a",
    emissiveIntensity: 0.6,
    roughness: 0.6,
  });
  box(0.22, 0.32, 0.2, lanternMat, 2.45, 3.25, 0.28, facade);
  box(0.3, 0.04, 0.28, darkWood, 2.45, 3.43, 0.28, facade);
  box(0.3, 0.04, 0.28, darkWood, 2.45, 3.07, 0.28, facade);
  const oliveLeaf = mat("#738265");
  const oliveTwig = mat("#7a7152");
  const pot = mat("#a78368");
  cylinder(0.25, 0.17, 0.5, pot, 2.8, 0.23, 0.42, facade);
  const trunk = cylinder(0.025, 0.04, 1.35, darkWood, 2.8, 1.1, 0.42, facade);
  trunk.rotation.z = 0.09;
  for (let i = 0; i < 10; i++) {
    const a = i * 2.4,
      y = 0.85 + (i % 5) * 0.2;
    const branch = cylinder(
      0.008,
      0.013,
      0.55,
      oliveTwig,
      2.8 + Math.cos(a) * 0.2,
      y,
      0.42 + Math.sin(a) * 0.17,
      facade,
      5,
    );
    branch.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.9);
    for (let j = 0; j < 5; j++) {
      const leaf = sphere(
        0.095,
        oliveLeaf,
        2.8 + Math.cos(a) * (0.15 + j * 0.06),
        y + j * 0.05,
        0.42 + Math.sin(a) * (0.15 + j * 0.06),
        facade,
        0.35,
        0.3,
        1.4,
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
      size: 0.018,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  scene.add(dust);
  type Pose = { p: THREE.Vector3; t: THREE.Vector3 };
  const mobile = () => innerWidth < 760;
  // Eye height remains 1.65 m. The path crosses the real doorway at x=.6.
  const entryPose = (): Pose => ({
    p: new THREE.Vector3(0.6, 1.65, 8),
    t: new THREE.Vector3(mobile() ? 0.6 : -0.38, 1.55, 3.5),
  });
  const roomPose = (): Pose =>
    mobile()
      ? {
          p: new THREE.Vector3(0.6, 1.65, 2.2),
          t: new THREE.Vector3(0, 1.05, -1.5),
        }
      : {
          p: new THREE.Vector3(1.55, 1.65, 1.5),
          t: new THREE.Vector3(-0.35, 1.05, -1.9),
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
            new THREE.Vector3(0.6, 1.65, 4.4),
            new THREE.Vector3(0.6, 1.65, 2.8),
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
        to: new THREE.Vector3(1.27, 1.7, 0.76),
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
      bouquet.position.y += Math.sin(Math.PI * a) * 0.07;
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
