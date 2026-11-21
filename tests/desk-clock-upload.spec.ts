import { test, expect } from '@playwright/test';
import type * as Three from 'three';

test('CPU-backed clock canvas preserves the frozen print, flap phases, sampling and native resource budget without explicit pixel readback', async ({ page }) => {
  test.setTimeout(120000);
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/__desk_clock_upload', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><head><link rel="icon" href="data:,"><title>Native clock upload comparison</title></head><body></body>',
  }));
  await page.goto('/__desk_clock_upload');
  const result = await page.evaluate(async () => {
    const [{ createDeskClock }, { createDeskClock: createReference }, THREE] = await Promise.all([
      import('/src/desk-clock.ts'), import('/tests/fixtures/desk-clock-reference.ts'), import('/node_modules/.vite/deps/three.js'),
    ]);
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(640, 360);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
    document.body.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#ada69b');
    scene.add(new THREE.HemisphereLight('#fff3e0', '#6d6672', 2));
    const light = new THREE.DirectionalLight('#ffffff', 3); light.position.set(-1, 3, 4); scene.add(light);
    const camera = new THREE.PerspectiveCamera(30, 640 / 360, .01, 10);
    camera.position.set(.06, .2, .76); camera.lookAt(0, .085, 0);
    const gl = renderer.getContext() as WebGL2RenderingContext;
    let phase = 'construct-reference';
    const uploads: { phase: string; source: string; bytes: number; width: number; height: number; elapsedMs: number }[] = [];
    const copies: { phase: string; width: number; height: number; x: number; y: number; sourceAllocatedBefore: boolean; sourceAllocatedAfter: boolean; elapsedMs: number }[] = [];
    const mipmaps: { phase: string; elapsedMs: number }[] = [];
    const reads: { phase: string; elapsedMs: number; bytes: number; cpuHint: boolean }[] = [];
    const storage: { width: number; height: number; levels: number }[] = [];
    const created = new Set<WebGLTexture>(), deleted = new Map<WebGLTexture, number>();
    const getImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function(...args) {
      const started = performance.now(), image = getImageData.apply(this, args as Parameters<typeof getImageData>);
      if (this.canvas.width === 2048 && this.canvas.height === 1024) {
        reads.push({ phase, elapsedMs: performance.now() - started, bytes: image.data.byteLength,
          cpuHint: this.getContextAttributes().willReadFrequently });
      }
      return image;
    };
    const texSubImage2D = gl.texSubImage2D.bind(gl), generateMipmap = gl.generateMipmap.bind(gl);
    const texStorage2D = gl.texStorage2D.bind(gl), createTexture = gl.createTexture.bind(gl), deleteTexture = gl.deleteTexture.bind(gl);
    gl.texSubImage2D = ((...args: any[]) => {
      const source = args[args.length - 1], started = performance.now();
      (texSubImage2D as any)(...args);
      uploads.push({ phase, source: source instanceof HTMLCanvasElement ? 'canvas' : ArrayBuffer.isView(source) ? 'bytes' : typeof source,
        bytes: ArrayBuffer.isView(source) ? source.byteLength : 0,
        width: args.length >= 9 ? args[4] : source.width, height: args.length >= 9 ? args[5] : source.height,
        elapsedMs: performance.now() - started });
    }) as typeof gl.texSubImage2D;
    const copyTextureToTexture = renderer.copyTextureToTexture.bind(renderer);
    renderer.copyTextureToTexture = ((...args: any[]) => {
      const source = args[0] as Three.Texture, destination = args[3] as Three.Vector2;
      const sourceAllocatedBefore = renderer.properties.has(source), started = performance.now();
      (copyTextureToTexture as any)(...args);
      copies.push({ phase, width: source.image.width, height: source.image.height, x: destination.x, y: destination.y,
        sourceAllocatedBefore, sourceAllocatedAfter: renderer.properties.has(source), elapsedMs: performance.now() - started });
    }) as typeof renderer.copyTextureToTexture;
    gl.generateMipmap = target => { const started = performance.now(); generateMipmap(target); mipmaps.push({ phase, elapsedMs: performance.now() - started }); };
    gl.texStorage2D = (target, levels, format, width, height) => { storage.push({ width, height, levels }); texStorage2D(target, levels, format, width, height); };
    gl.createTexture = () => { const texture = createTexture(); if (texture) created.add(texture); return texture; };
    gl.deleteTexture = texture => { if (texture && created.has(texture)) deleted.set(texture, (deleted.get(texture) ?? 0) + 1); deleteTexture(texture); };
    const originalNow = Date.now, fixedNow = new Date(2026, 9, 31, 15, 59, 59, 900).getTime();
    let reference: ReturnType<typeof createReference>, actual: ReturnType<typeof createDeskClock>;
    try {
      Date.now = () => fixedNow;
      reference = createReference(); phase = 'construct-actual'; actual = createDeskClock();
    } finally { Date.now = originalNow; }
    scene.add(reference.group, actual.group);
    const atlas = (clock: typeof actual) => {
      let found: Three.Texture | undefined;
      clock.group.traverse((object: Three.Object3D) => {
        if ((object as Three.Mesh).isMesh) {
          const material = (object as Three.Mesh).material;
          for (const item of Array.isArray(material) ? material : [material])
            if ((item as Three.MeshStandardMaterial).map?.name === 'desk-clock-current-previous-atlas') found = (item as Three.MeshStandardMaterial).map!;
        }
      });
      if (!found) throw new Error('Clock atlas missing');
      return found;
    };
    const oldAtlas = atlas(reference), newAtlas = atlas(actual);
    const textureSettings = (map: Three.Texture) => ({
      width: map.image.width, height: map.image.height, colorSpace: map.colorSpace, anisotropy: map.anisotropy,
      minFilter: map.minFilter, magFilter: map.magFilter, generateMipmaps: map.generateMipmaps,
      flipY: map.flipY, unpackAlignment: map.unpackAlignment, format: map.format, type: map.type,
    });
    const settings = { reference: textureSettings(oldAtlas), actual: textureSettings(newAtlas) };
    const contextHints = {
      reference: (oldAtlas.image as HTMLCanvasElement).getContext('2d')!.getContextAttributes().willReadFrequently,
      actual: (newAtlas.image as HTMLCanvasElement).getContext('2d')!.getContextAttributes().willReadFrequently,
    };
    const frames: { name: string; maxDelta: number; differingPixels: number; pixelsAboveOne: number; nonBackground: number;
      reference: ReturnType<typeof reference.snapshot>; actual: ReturnType<typeof actual.snapshot>;
      updateMs: [number, number]; renderMs: [number, number]; programs: [number, number] }[] = [];
    const cpuAtlases: { name: string; maxDelta: number; differingBytes: number }[] = [];
    const compareCpuAtlas = (name: string) => {
      const before = phase; phase = `test-only-atlas-read:${name}`;
      const old = (oldAtlas.image as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 2048, 1024).data;
      const next = (newAtlas.image as HTMLCanvasElement).getContext('2d')!.getImageData(0, 0, 2048, 1024).data;
      let maxDelta = 0, differingBytes = 0;
      for (let i = 0; i < old.length; i++) {
        const delta = Math.abs(old[i] - next[i]); if (delta) differingBytes++; maxDelta = Math.max(maxDelta, delta);
      }
      cpuAtlases.push({ name, maxDelta, differingBytes }); phase = before;
    };
    const errors: number[] = [];
    const checkErrors = () => { for (let i = 0; i < 8; i++) { const code = gl.getError(); if (!code) break; errors.push(code); } };
    const draw = (clock: typeof actual, other: typeof actual, label: string, wall: number, animation: number, reduced: boolean) => {
      phase = label; clock.group.visible = true; other.group.visible = false;
      const updateStart = performance.now(); clock.update(wall, animation, reduced); const updateMs = performance.now() - updateStart;
      const renderStart = performance.now(); renderer.render(scene, camera); const renderMs = performance.now() - renderStart;
      const pixels = new Uint8Array(640 * 360 * 4); gl.readPixels(0, 0, 640, 360, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      checkErrors(); return { pixels, state: clock.snapshot(), updateMs, renderMs, programs: renderer.info.programs!.length };
    };
    const compare = (name: string, wall: number, animation: number, reduced = false) => {
      const old = draw(reference, actual, `reference:${name}`, wall, animation, reduced);
      const next = draw(actual, reference, `actual:${name}`, wall, animation, reduced);
      let maxDelta = 0, differingPixels = 0, pixelsAboveOne = 0, nonBackground = 0;
      for (let i = 0; i < old.pixels.length; i += 4) {
        let pixelDelta = 0;
        for (let channel = 0; channel < 4; channel++) pixelDelta = Math.max(pixelDelta, Math.abs(old.pixels[i + channel] - next.pixels[i + channel]));
        maxDelta = Math.max(maxDelta, pixelDelta); if (pixelDelta) differingPixels++; if (pixelDelta > 1) pixelsAboveOne++;
        if (Math.abs(old.pixels[i] - old.pixels[0]) > 6 || Math.abs(old.pixels[i + 1] - old.pixels[1]) > 6 || Math.abs(old.pixels[i + 2] - old.pixels[2]) > 6) nonBackground++;
      }
      frames.push({ name, maxDelta, differingPixels, pixelsAboveOne, nonBackground,
        reference: old.state, actual: next.state, updateMs: [old.updateMs, next.updateMs], renderMs: [old.renderMs, next.renderMs], programs: [old.programs, next.programs] });
      compareCpuAtlas(name);
    };
    const resume = () => { reference.resume(); actual.resume(); };
    resume(); compare('old-hour', fixedNow, 0);
    compare('hour-start', fixedNow + 100, 100); compare('hour-front', fixedNow + 300, 300);
    compare('hour-back', fixedNow + 650, 650); compare('hour-settled', fixedNow + 1000, 1000);
    const nextMinute = new Date(2026, 9, 31, 16, 0, 59, 900).getTime();
    resume(); compare('old-minute', nextMinute, 2000); compare('minute-start', nextMinute + 100, 2100);
    compare('minute-front', nextMinute + 300, 2300); compare('minute-back', nextMinute + 650, 2650); compare('minute-settled', nextMinute + 1000, 3000);
    const midnight = new Date(2026, 9, 31, 23, 59, 59, 900).getTime();
    resume(); compare('old-date', midnight, 4000); compare('date-start', midnight + 100, 4100);
    compare('date-front', midnight + 300, 4300); compare('date-back', midnight + 650, 4650); compare('date-settled', midnight + 1000, 5000);
    resume(); compare('resume-jump', midnight + 4 * 3600000, 6000);
    compare('backward-jump', fixedNow, 7000); compare('reduced-turn', fixedNow + 100, 7100, true);
    camera.position.set(.45, .5, 3.5); camera.lookAt(0, .085, 0);
    compare('room-scale-current', fixedNow + 100, 7200, true);
    resume(); compare('room-scale-date', midnight + 100, 7300, true);
    camera.position.set(.06, .2, .76); camera.lookAt(0, .085, 0);
    const prime = new Date(2026, 9, 31, 16, 9, 59, 900).getTime();
    resume(); compare('patch-prime-old', prime, 10000);
    compare('patch-prime-start', prime + 100, 10100); compare('patch-prime-settled', prime + 1000, 11000);
    compare('patch-next-ready', prime + 60000, 70000);
    compare('patch-normal-minute', prime + 60100, 70100);
    const burst = [[midnight, 80000], [midnight + 100, 80100], [prime, 81000], [prime + 100, 81100]];
    resume();
    for (const [wall, animation] of burst) {
      phase = 'reference:burst-update'; reference.update(wall, animation, false);
      phase = 'actual:burst-update'; actual.update(wall, animation, false);
    }
    compareCpuAtlas('burst-before-render'); compare('burst-rendered', prime + 300, 81300);
    const beforeProbe = { textures: renderer.info.memory.textures, created: created.size, storage: [...storage] };
    // Check row orientation and sRGB mid-grey explicitly. Both atlases retain
    // their real CanvasTexture path, including the original UVs and mipmaps.
    phase = 'orientation-probe';
    for (const map of [oldAtlas, newAtlas]) {
      const brush = (map.image as HTMLCanvasElement).getContext('2d')!;
      brush.fillStyle = '#ff0000'; brush.fillRect(0, 0, 1024, 512);
      brush.fillStyle = '#00ff00'; brush.fillRect(1024, 0, 1024, 512);
      brush.fillStyle = '#0000ff'; brush.fillRect(0, 512, 1024, 512);
      brush.fillStyle = '#808080'; brush.fillRect(1024, 512, 1024, 512);
    }
    oldAtlas.needsUpdate = newAtlas.needsUpdate = true;
    renderer.initTexture(oldAtlas); renderer.initTexture(newAtlas);
    const framebuffer = gl.createFramebuffer()!;
    const corners = [oldAtlas, newAtlas].map(map => [0, 1].map(level => {
      const width = 2048 >> level, height = 1024 >> level;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderer.properties.get(map).__webglTexture, level);
      const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      const samples = [[4, 4], [width - 5, 4], [4, height - 5], [width - 5, height - 5]].map(([x, y]) => {
        const pixel = new Uint8Array(4); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel); return [...pixel];
      });
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, level); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { level, complete, samples };
    }));
    checkErrors(); gl.deleteFramebuffer(framebuffer);
    const used = { created: created.size, storage: [...storage], programs: renderer.info.programs!.length };
    phase = 'dispose'; reference.dispose(); actual.dispose(); actual.dispose(); renderer.dispose();
    const deletedOnce = [...created].every(texture => deleted.get(texture) === 1); checkErrors();
    CanvasRenderingContext2D.prototype.getImageData = getImageData;
    return { strategy: 'fixed-atlas-dirty-tiles', frames, cpuAtlases, settings, contextHints, uploads, copies, mipmaps, reads,
      beforeProbe, used, corners, errors, deletedOnce, deleted: [...deleted.values()].reduce((a, b) => a + b, 0) };
  });
  await test.info().attach('clock-native-upload-equivalence', { contentType: 'application/json', body: JSON.stringify(result, null, 2) });
  expect(pageErrors).toEqual([]); expect(result.errors).toEqual([]);
  expect(result.settings.actual).toEqual(result.settings.reference);
  for (const frame of result.frames) {
    expect(frame.actual, frame.name).toEqual(frame.reference);
    expect(frame.programs[1], frame.name).toBe(frame.programs[0]);
    expect(frame.nonBackground, frame.name).toBeGreaterThan(1000);
    expect(frame.maxDelta, frame.name).toBeLessThanOrEqual(1);
  }
  expect(result.frames.find(frame => frame.name === 'hour-front')!.actual.angle).toBeLessThan(Math.PI / 2);
  expect(result.frames.find(frame => frame.name === 'hour-back')!.actual.angle).toBeGreaterThan(Math.PI / 2);
  expect(result.frames.find(frame => frame.name === 'date-start')!.actual.cells.find(cell => cell.name === 'date')!.active).toBe(true);
  expect(result.contextHints.actual).toBe(true);
  expect(result.contextHints.reference).toBe(false);
  expect(result.reads.filter(item => item.phase === 'construct-actual' || item.phase.startsWith('actual:'))).toEqual([]);
  for (const atlas of result.cpuAtlases) {
    expect(atlas.maxDelta, atlas.name).toBe(0); expect(atlas.differingBytes, atlas.name).toBe(0);
  }
  expect(result.uploads.filter(item => item.phase.startsWith('actual:')).length).toBeGreaterThan(2);
  expect(result.uploads.filter(item => item.phase.startsWith('actual:')).every(item => item.source === 'canvas')).toBe(true);
  expect(result.uploads.filter(item => item.phase.startsWith('reference:')).every(item => item.source === 'canvas')).toBe(true);
  const fullActualUploads = result.uploads.filter(item => item.phase.startsWith('actual:') && item.width === 2048 && item.height === 1024);
  expect(fullActualUploads).toHaveLength(1);
  expect(result.copies.every(item => !item.sourceAllocatedBefore && !item.sourceAllocatedAfter)).toBe(true);
  const minuteCopies = result.copies.filter(item => item.phase === 'actual:patch-normal-minute');
  expect(minuteCopies).toHaveLength(2);
  expect(minuteCopies.map(item => [item.width, item.height, item.x, item.y]).sort((a, b) => a[3] - b[3]))
    .toEqual([[512, 512, 512, 0], [512, 512, 512, 512]]);
  expect(minuteCopies.reduce((bytes, item) => bytes + item.width * item.height * 4, 0)).toBe(2 * 1024 * 1024);
  const burstCopies = result.copies.filter(item => item.phase === 'actual:burst-rendered');
  expect(burstCopies.length).toBeGreaterThan(0); expect(burstCopies.length).toBeLessThanOrEqual(6);
  expect(new Set(burstCopies.map(item => `${item.x},${item.y}`)).size).toBe(burstCopies.length);
  expect(result.beforeProbe.textures).toBe(2); expect(result.beforeProbe.created).toBe(2);
  expect(result.used.created).toBe(2); expect(result.used.storage).toHaveLength(2);
  for (const allocation of result.used.storage) expect(allocation).toEqual({ width: 2048, height: 1024, levels: 12 });
  expect(result.corners[1]).toEqual(result.corners[0]);
  for (const levels of result.corners) for (const level of levels) {
    expect(level.complete).toBe(true);
    expect(level.samples).toEqual([[0, 0, 255, 255], [128, 128, 128, 255], [255, 0, 0, 255], [0, 255, 0, 255]]);
  }
  expect(result.deletedOnce).toBe(true); expect(result.deleted).toBe(2);
});

test('clock dirty regions survive optional staging failure and GPU reinitialization without allocating staging textures', async ({ page }) => {
  test.setTimeout(120000);
  await page.route('**/__desk_clock_recovery', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><head><link rel="icon" href="data:,"></head><body></body>',
  }));
  await page.goto('/__desk_clock_recovery');
  const result = await page.evaluate(async () => {
    const [{ createDeskClock }, { createDeskClock: createReference }, THREE] = await Promise.all([
      import('/src/desk-clock.ts'), import('/tests/fixtures/desk-clock-reference.ts'), import('/node_modules/.vite/deps/three.js'),
    ]);
    const originalNow = Date.now, base = new Date(2026, 9, 31, 16, 9, 59, 900).getTime();
    let reference: ReturnType<typeof createReference>, actual: ReturnType<typeof createDeskClock>;
    try { Date.now = () => base; reference = createReference(); actual = createDeskClock(); } finally { Date.now = originalNow; }
    const atlas = (clock: typeof actual) => {
      const face = clock.group.getObjectByName('clock-minutes-upper') as Three.Mesh<Three.BufferGeometry, Three.MeshStandardMaterial>;
      return face.material.map!;
    };
    const oldAtlas = atlas(reference), newAtlas = atlas(actual);
    const face = actual.group.getObjectByName('clock-minutes-upper') as Three.Mesh;
    const created = new Set<WebGLTexture>(), deleted = new Map<WebGLTexture, number>();
    const carriers = new Set<Three.Texture>(), carrierCanvases = new Set<HTMLCanvasElement>();
    let carrierDisposals = 0, phase = '', denyStage = false;
    const uploads: { phase: string; width: number; height: number }[] = [], copies: { phase: string; width: number; allocated: boolean }[] = [];
    const errors: number[] = [], checks: { name: string; maxDelta: number; differingBytes: number; snapshotsEqual: boolean }[] = [];
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type: string, ...options: any[]) {
      if (denyStage && type === '2d' && this.width === 512 && this.height === 512) return null;
      return (getContext as any).call(this, type, ...options);
    } as typeof HTMLCanvasElement.prototype.getContext;
    const makeRenderer = () => {
      const renderer = new THREE.WebGLRenderer(); renderer.setSize(16, 16);
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const create = gl.createTexture.bind(gl), remove = gl.deleteTexture.bind(gl), upload = gl.texSubImage2D.bind(gl);
      gl.createTexture = () => { const texture = create(); if (texture) created.add(texture); return texture; };
      gl.deleteTexture = texture => { if (texture && created.has(texture)) deleted.set(texture, (deleted.get(texture) ?? 0) + 1); remove(texture); };
      gl.texSubImage2D = ((...args: any[]) => {
        const source = args[args.length - 1]; uploads.push({ phase, width: args.length >= 9 ? args[4] : source.width, height: args.length >= 9 ? args[5] : source.height });
        (upload as any)(...args);
      }) as typeof gl.texSubImage2D;
      const copy = renderer.copyTextureToTexture.bind(renderer);
      renderer.copyTextureToTexture = ((...args: any[]) => {
        const source = args[0] as Three.Texture;
        if (!carriers.has(source)) { carriers.add(source); carrierCanvases.add(source.image); source.addEventListener('dispose', () => carrierDisposals++); }
        copies.push({ phase, width: source.image.width, allocated: renderer.properties.has(source) });
        (copy as any)(...args);
      }) as typeof renderer.copyTextureToTexture;
      return renderer;
    };
    let renderer = makeRenderer();
    const flush = (name: string) => {
      phase = `actual:${name}`; face.onBeforeRender(renderer, null as any, null as any, face.geometry, face.material, null as any);
      phase = `reference:${name}`; renderer.initTexture(oldAtlas);
      const gl = renderer.getContext() as WebGL2RenderingContext, framebuffer = gl.createFramebuffer()!;
      const pixels = [oldAtlas, newAtlas].map(map => {
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, renderer.properties.get(map).__webglTexture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Clock texture framebuffer incomplete');
        const data = new Uint8Array(2048 * 1024 * 4); gl.readPixels(0, 0, 2048, 1024, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return data;
      });
      gl.deleteFramebuffer(framebuffer);
      let maxDelta = 0, differingBytes = 0;
      for (let i = 0; i < pixels[0].length; i++) { const delta = Math.abs(pixels[0][i] - pixels[1][i]); if (delta) differingBytes++; maxDelta = Math.max(maxDelta, delta); }
      checks.push({ name, maxDelta, differingBytes, snapshotsEqual: JSON.stringify(actual.snapshot()) === JSON.stringify(reference.snapshot()) });
      for (let i = 0; i < 8; i++) { const error = gl.getError(); if (!error) break; errors.push(error); }
    };
    const step = (wall: number, animation: number) => { reference.update(wall, animation, false); actual.update(wall, animation, false); };
    step(base, 0); flush('initial');
    step(base + 100, 100); denyStage = true; flush('stage-unavailable'); denyStage = false;
    step(base + 60000, 60000); step(base + 60100, 60100); flush('stage-recovered');
    const later = new Date(2026, 10, 1, 2, 14, 59, 900).getTime();
    reference.resume(); actual.resume(); step(later, 70000); step(later + 100, 70100);
    // Release the old GPU allocation while preserving the clock's CPU state,
    // then create a fresh renderer; this exercises the full-upload restore path.
    oldAtlas.dispose(); newAtlas.dispose(); renderer.dispose(); renderer = makeRenderer();
    flush('gpu-reinitialized');
    step(later + 60000, 130000); step(later + 60100, 130100); flush('after-reinitialization-minute');
    const liveTextures = renderer.info.memory.textures;
    reference.dispose(); actual.dispose(); actual.dispose(); renderer.dispose();
    HTMLCanvasElement.prototype.getContext = getContext;
    return { checks, errors, uploads, copies, liveTextures, created: created.size,
      deleted: [...deleted.values()].reduce((sum, count) => sum + count, 0), deletedOnce: [...created].every(texture => deleted.get(texture) === 1),
      carriers: carriers.size, carrierDisposals, stagingReleased: [...carrierCanvases].every(canvas => canvas.width === 1 && canvas.height === 1) };
  });
  await test.info().attach('clock-native-upload-recovery', { contentType: 'application/json', body: JSON.stringify(result, null, 2) });
  expect(result.errors).toEqual([]);
  for (const check of result.checks) {
    expect(check.snapshotsEqual, check.name).toBe(true); expect(check.maxDelta, check.name).toBe(0); expect(check.differingBytes, check.name).toBe(0);
  }
  expect(result.uploads.filter(item => item.phase === 'actual:stage-unavailable')).toEqual([{ phase: 'actual:stage-unavailable', width: 2048, height: 1024 }]);
  expect(result.copies.filter(item => item.phase === 'actual:stage-unavailable')).toEqual([]);
  expect(result.copies.filter(item => item.phase === 'actual:stage-recovered')).toHaveLength(2);
  expect(result.uploads.filter(item => item.phase === 'actual:gpu-reinitialized')).toEqual([{ phase: 'actual:gpu-reinitialized', width: 2048, height: 1024 }]);
  expect(result.copies.filter(item => item.phase === 'actual:gpu-reinitialized')).toEqual([]);
  expect(result.copies.filter(item => item.phase === 'actual:after-reinitialization-minute')).toHaveLength(2);
  expect(result.copies.every(item => !item.allocated)).toBe(true);
  expect(result.liveTextures).toBe(2); expect(result.created).toBe(4); expect(result.deleted).toBe(4); expect(result.deletedOnce).toBe(true);
  expect(result.carrierDisposals).toBe(result.carriers); expect(result.stagingReleased).toBe(true);
});
