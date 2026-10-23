import * as THREE from "three";
import { artwork, chapters } from "./content";
import { dimensions as D } from "./dimensions";

/** A real hinged cover and a flexible paper leaf, all dimensions in metres. */
export function createAlbum() {
  const group = new THREE.Group();
  group.name = "album";
  const cloth = new THREE.MeshStandardMaterial({ color: "#295a72", roughness: .91 });
  const paper = new THREE.MeshStandardMaterial({ color: "#e8dec5", roughness: 1 });
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = group) => {
    const item = new THREE.Mesh(geometry, material);
    item.castShadow = item.receiveShadow = true;
    parent.add(item);
    return item;
  };
  const board = mesh(new THREE.BoxGeometry(D.album.width, .003, D.album.depth), cloth);
  board.position.y = .0015;
  const block = mesh(new THREE.BoxGeometry(.31, .029, .25), paper);
  block.position.y = .0175;
  const hinge = new THREE.Group();
  hinge.name = "album-cover-hinge";
  hinge.position.set(-D.album.width / 2, .0335, 0);
  group.add(hinge);
  const cover = mesh(new THREE.BoxGeometry(D.album.width, .003, D.album.depth), cloth, hinge);
  cover.position.x = D.album.width / 2;

  const coverCanvas = document.createElement("canvas");
  coverCanvas.width = 1024; coverCanvas.height = 832;
  const cc = coverCanvas.getContext("2d")!;
  cc.fillStyle = "#295a72"; cc.fillRect(0, 0, 1024, 832);
  cc.strokeStyle = "#b4a17a"; cc.lineWidth = 3; cc.strokeRect(58, 58, 908, 716);
  cc.strokeStyle = "#b4a17a55"; cc.lineWidth = 1; cc.strokeRect(69, 69, 886, 694);
  cc.fillStyle = "#d5c5a0"; cc.textAlign = "center";
  cc.font = "26px Georgia"; cc.fillText("BETWEEN THE TIDES", 512, 321);
  cc.font = "68px serif"; cc.fillText("潮 汐 之 间", 512, 440);
  cc.font = "18px Georgia"; cc.fillText("A COLLECTION OF LITTLE MOMENTS", 512, 580);
  const coverMap = new THREE.CanvasTexture(coverCanvas); coverMap.colorSpace = THREE.SRGBColorSpace;
  const label = mesh(new THREE.PlaneGeometry(.318, .258), new THREE.MeshStandardMaterial({ map: coverMap, roughness: .94 }), hinge);
  label.rotation.x = -Math.PI / 2;
  label.position.set(D.album.width / 2, .0016, 0);

  const edgeCanvas = document.createElement("canvas");
  edgeCanvas.width = 32; edgeCanvas.height = 256;
  const edgeContext = edgeCanvas.getContext("2d")!;
  edgeContext.fillStyle = "#e8dec5"; edgeContext.fillRect(0, 0, 32, 256);
  edgeContext.fillStyle = "#b8b09c88";
  for (let y = 5; y < 256; y += 13) edgeContext.fillRect(0, y, 32, 1);
  const edgeMap = new THREE.CanvasTexture(edgeCanvas); edgeMap.colorSpace = THREE.SRGBColorSpace;
  block.material = new THREE.MeshStandardMaterial({ map: edgeMap, roughness: 1 });

  const canvases = [0, 1].map(() => {
    const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 640; return canvas;
  });
  const maps = canvases.map(canvas => {
    const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8; return map;
  });
  const faces = maps.map(map => new THREE.MeshBasicMaterial({ map, toneMapped: false, fog: false }));
  const rightPage = mesh(new THREE.PlaneGeometry(.306, .246), faces[1]);
  rightPage.name = "album-right-page";
  rightPage.rotation.x = -Math.PI / 2; rightPage.position.y = .0322;
  const leftGeometry = new THREE.PlaneGeometry(.306, .246, 28, 16);
  const leftVertices = leftGeometry.getAttribute("position"), leftUV = leftGeometry.getAttribute("uv");
  // A slightly lifted flat sheet joins the cover to the binding. Its print has
  // one projective surface, shared exactly by the readable DOM paper.
  for (let i = 0; i < leftVertices.count; i++)
    leftVertices.setZ(i, .0291 * leftUV.getX(i));
  leftGeometry.computeVertexNormals();
  const leftPage = mesh(leftGeometry, faces[0], hinge);
  leftPage.name = "album-left-page";
  // Reverse both in-plane directions so the inside cover reads correctly when open.
  leftPage.rotation.set(Math.PI / 2, 0, Math.PI);
  leftPage.position.set(.16, -.0016, 0);

  const leafGeometry = new THREE.PlaneGeometry(.306, .246, 28, 16);
  const leafMaterial = new THREE.MeshBasicMaterial({ map: maps[1], side: THREE.DoubleSide, toneMapped: false, fog: false });
  // Print different faces, mirroring the reverse UV so letters never turn backwards.
  leafMaterial.onBeforeCompile = shader => {
    shader.uniforms.reversePageMap = { value: maps[0] };
    shader.fragmentShader = 'uniform sampler2D reversePageMap;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      #ifdef USE_MAP
        vec4 ink = gl_FrontFacing ? texture2D(map,vMapUv)
          : texture2D(reversePageMap,vec2(1.-vMapUv.x,vMapUv.y));
        diffuseColor *= ink;
      #endif
    `);
  };
  leafMaterial.customProgramCacheKey = () => 'album-duplex-page';
  const leaf = mesh(leafGeometry, leafMaterial);
  leaf.name = "album-opening-leaf";
  leaf.position.set(-.153, .0325, 0); leaf.visible = false;
  const leafUV = leafGeometry.getAttribute("uv"), leafPositions = leafGeometry.getAttribute("position");
  if (leafPositions instanceof THREE.BufferAttribute) leafPositions.setUsage(THREE.DynamicDrawUsage);
  let previousPageProgress: number | undefined;
  let selected = -1;
  let pageSourceVersion = 0;
  let invalidate: (() => void) | undefined;

  function paintChapter(index: number, photo?: HTMLImageElement) {
    const chapter = chapters[index];
    // Chapter artwork is the safe fallback until a matching DOM raster is ready.
    for (const canvas of canvases) {
      if (canvas.width !== 768) canvas.width = 768;
      if (canvas.height !== 640) canvas.height = 640;
    }
    const left = canvases[0].getContext("2d")!, right = canvases[1].getContext("2d")!;
    for (const context of [left, right]) {
      context.fillStyle = "#eee7d5"; context.fillRect(0, 0, 768, 640);
      context.fillStyle = "rgba(112,98,68,.035)";
      for (let i = 0; i < 1400; i++) context.fillRect(i * 127 % 768, i * 73 % 640, 1, 1);
      context.fillStyle = "#8d907b"; context.font = "17px serif"; context.textAlign = "left";
    }
    left.fillText(chapter.date, 45, 48);
    left.save(); left.translate(384, 312); left.rotate(-.035);
    left.fillStyle = "#fbf7e9"; left.shadowColor = "#56482b30"; left.shadowBlur = 10; left.shadowOffsetY = 4;
    left.fillRect(-294, -210, 588, 425); left.shadowColor = "transparent";
    const art = photo ?? artwork(chapter.scene, 800, 576);
    const cropRatio = 568 / 344, imageRatio = art.width / art.height;
    if (imageRatio > cropRatio) {
      const width = art.height * cropRatio;
      left.drawImage(art, (art.width - width) / 2, 0, width, art.height, -284, -200, 568, 344);
    } else {
      const height = art.width / cropRatio;
      left.drawImage(art, 0, (art.height - height) / 2, art.width, height, -284, -200, 568, 344);
    }
    left.restore(); left.textAlign = "center"; left.fillStyle = "#777f6e"; left.font = "22px serif";
    left.fillText(chapter.caption, 384, 565);
    right.textAlign = "right"; right.font = "15px Georgia"; right.fillText(chapter.subtitle, 720, 48);
    right.textAlign = "center"; right.fillStyle = "#99a28a"; right.font = "38px serif"; right.fillText("✳", 384, 128);
    right.fillStyle = "#405248"; right.font = "42px serif"; right.fillText(chapter.title, 384, 204);
    right.font = "26px serif";
    chapter.text.split("\n").forEach((line, i) => right.fillText(line, 384, 274 + i * 43));
    right.fillStyle = "#a8ac96"; right.fillRect(365, 377, 38, 1);
    right.fillStyle = "#84907d"; right.font = "21px serif";
    chapter.note.split("\n").forEach((line, i) => right.fillText(line, 384, 428 + i * 36));
    for (let side = 0; side < 2; side++) {
      const context = canvases[side].getContext("2d")!;
      context.fillStyle = "#989b86"; context.font = "16px Georgia"; context.textAlign = side ? "right" : "left";
      context.fillText(String(index * 2 + side + 1).padStart(2, "0"), side ? 722 : 46, 610);
      maps[side].needsUpdate = true;
    }
    invalidate?.();
  }
  function setChapter(index: number) {
    const next = Math.max(0, Math.min(chapters.length - 1, index));
    if (selected === next) return;
    selected = next;
    const version = ++pageSourceVersion;
    paintChapter(next);
    const path = chapters[next].image;
    if (path) {
      const photo = new Image();
      photo.crossOrigin = "anonymous";
      photo.onload = () => { if (selected === next && pageSourceVersion === version) paintChapter(next, photo); };
      photo.src = path;
    }
  }
  function setPageCanvases(pages: [HTMLCanvasElement, HTMLCanvasElement]) {
    // Keep the texture identities: the leaf's reverse-face uniform uses these too.
    ++pageSourceVersion;
    for (let side = 0; side < 2; side++) {
      canvases[side].width = Math.max(1, pages[side].width);
      canvases[side].height = Math.max(1, pages[side].height);
      canvases[side].getContext('2d')!.drawImage(pages[side], 0, 0);
      maps[side].needsUpdate = true;
    }
    invalidate?.();
  }

  const materials = new Set<THREE.Material>();
  let currentOpacity = 1;
  let currentPaperOpacity = 1;
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.transparent = true;
      materials.add(material);
    }
  });
  function setVisibility(opacity: number, preservePaper = false) {
    const alpha = THREE.MathUtils.clamp(opacity, 0, 1);
    // DOM ink is composited over this identical opaque print. Fading both
    // layers with complementary alpha would let the dark room show through.
    const paperAlpha = preservePaper && alpha > .0001 ? 1 : alpha;
    if (Math.abs(alpha - currentOpacity) < .00001 && paperAlpha === currentPaperOpacity) return;
    currentOpacity = alpha;
    currentPaperOpacity = paperAlpha;
    group.visible = alpha > .0001;
    for (const material of materials) {
      material.opacity = faces.includes(material as THREE.MeshBasicMaterial) || material === leafMaterial ? paperAlpha : alpha;
      // A fading sheet must not leave an invisible depth mask over its DOM twin.
      material.depthWrite = material.opacity >= .999;
    }
    invalidate?.();
  }

  function pageCorners(page: THREE.Mesh) {
    const positions = page.geometry.getAttribute('position'), uv = page.geometry.getAttribute('uv');
    const corners = [[0, 1], [1, 1], [1, 0], [0, 0]];
    return corners.map(([u, v]) => {
      for (let i = 0; i < uv.count; i++)
        if (Math.abs(uv.getX(i) - u) < .0001 && Math.abs(uv.getY(i) - v) < .0001)
          return new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(page.matrixWorld);
      throw new Error('Album page has no corner UV');
    });
  }
  function setOpening(coverProgress: number, pageProgress: number) {
    hinge.rotation.z = coverProgress * Math.PI;
    hinge.position.y = .0335 - .032 * THREE.MathUtils.smoothstep(coverProgress, .55, 1);
    if (pageProgress === previousPageProgress) return;
    previousPageProgress = pageProgress;
    leaf.userData.turnProgress = pageProgress;
    leaf.visible = pageProgress > .001 && pageProgress < .999;
    const angle = pageProgress * Math.PI, curl = Math.sin(pageProgress * Math.PI) * .82;
    leaf.position.y = .0325 + Math.sin(pageProgress * Math.PI) * .004;
    leaf.position.x = -.153 - .014 * THREE.MathUtils.smoothstep(pageProgress, 0, 1);
    for (let i = 0; i < leafPositions.count; i++) {
      const u = leafUV.getX(i), v = leafUV.getY(i), distance = u * .306;
      const bend = angle + curl * (u - .35);
      const settling = .0291 * THREE.MathUtils.smoothstep(pageProgress, .75, 1)
        * u;
      leafPositions.setXYZ(i, distance * Math.cos(bend), distance * Math.sin(bend) + Math.sin(u * Math.PI) * Math.sin(pageProgress * Math.PI) * .012 - settling, (.5 - v) * .246);
    }
    leafPositions.needsUpdate = true;
    // The unlit duplex sheet and its depth shadow do not consume normals.
  }
  setOpening(0, 0);
  setChapter(0);
  return {
    group, hinge, leaf, setChapter, setOpening, setPageCanvases, setVisibility,
    pageWorldCorners() { return [pageCorners(leftPage), pageCorners(rightPage)] as const; },
    setInvalidation(callback: () => void) { invalidate = callback; },
    // Corners of the entire open paper, in the same order as a DOM rectangle.
    paperCorners: [new THREE.Vector3(-.473, .0031, -.123), new THREE.Vector3(.153, .0322, -.123), new THREE.Vector3(.153, .0322, .123), new THREE.Vector3(-.473, .0031, .123)],
    spreadCenter: new THREE.Vector3(-.16, .0352, 0),
  };
}
