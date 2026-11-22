import { test, expect } from '@playwright/test';
import type * as Three from 'three';

test('responsive album print keeps shared identities and reallocates native texture storage only when its dimensions change', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/__album_texture_lifecycle', route => route.fulfill({
    contentType: 'text/html',
    body: '<!doctype html><html><head><link rel="icon" href="data:,"><title>Album native texture lifecycle</title></head><body></body></html>',
  }));
  await page.goto('/__album_texture_lifecycle');
  const result = await page.evaluate(async () => {
    const [{ createAlbum }, THREE] = await Promise.all([
      import('/src/album-model.ts'), import('/node_modules/.vite/deps/three.js'),
    ]);
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(16, 16); document.body.appendChild(renderer.domElement);
    const gl = renderer.getContext() as WebGL2RenderingContext;
    const created = new Set<WebGLTexture>();
    const deletes = new Map<WebGLTexture, number>();
    const storage: { texture: WebGLTexture | null; width: number; height: number }[] = [];
    const createTexture = gl.createTexture.bind(gl), deleteTexture = gl.deleteTexture.bind(gl);
    const texStorage2D = gl.texStorage2D.bind(gl);
    // Observe real native storage. The renderer and its Audio/Date/RAF environment
    // remain unchanged; the small framebuffer below is only a pixel probe.
    gl.createTexture = () => { const texture = createTexture(); if (texture) created.add(texture); return texture; };
    gl.deleteTexture = texture => {
      if (texture && created.has(texture)) deletes.set(texture, (deletes.get(texture) ?? 0) + 1);
      deleteTexture(texture);
    };
    gl.texStorage2D = (target, levels, format, width, height) => {
      storage.push({ texture: gl.getParameter(gl.TEXTURE_BINDING_2D), width, height });
      texStorage2D(target, levels, format, width, height);
    };
    const album = createAlbum();
    const maps = ['album-left-page', 'album-right-page'].map(name =>
      (album.group.getObjectByName(name) as Three.Mesh<Three.BufferGeometry, Three.MeshBasicMaterial>).material.map!);
    const originalSources = maps.map(map => map.source), originalCanvases = maps.map(map => map.image);
    const originalIds = maps.map(map => map.uuid);
    const framebuffer = gl.createFramebuffer()!;
    const errors = () => {
      const found: number[] = [];
      for (let i = 0; i < 8; i++) { const error = gl.getError(); if (error === gl.NO_ERROR) break; found.push(error); }
      return found;
    };
    const counts = () => ({ created: created.size, deleted: [...deletes.values()].reduce((a, b) => a + b, 0) });
    const nativeTexture = (map: Three.Texture) => renderer.properties.get(map).__webglTexture as WebGLTexture;
    const upload = (phase: string) => {
      for (const map of maps) renderer.initTexture(map);
      const uploadErrors = errors();
      const samples = maps.map(map => {
        const canvas = map.image as HTMLCanvasElement, texture = nativeTexture(map);
        const allocated = [...storage].reverse().find(item => item.texture === texture);
        const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER), pixel = new Uint8Array(4);
        gl.readPixels(canvas.width - 1, canvas.height - 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
        return { width: canvas.width, height: canvas.height, allocated: allocated && [allocated.width, allocated.height],
          pixel: [...pixel], framebufferComplete: status === gl.FRAMEBUFFER_COMPLETE };
      });
      const shader = { uniforms: {} as Record<string, { value: unknown }>, fragmentShader: '#include <map_fragment>' };
      const leafMaterial = album.leaf.material as Three.MeshBasicMaterial;
      leafMaterial.onBeforeCompile(shader as any, renderer);
      return { phase, counts: counts(), uploadErrors, readErrors: errors(), samples,
        identities: maps.every((map, i) => map.uuid === originalIds[i] && map.source === originalSources[i] && map.image === originalCanvases[i]),
        duplex: leafMaterial.map === maps[1] && shader.uniforms.reversePageMap.value === maps[0] };
    };
    const pages = (width: number, height: number, colors: [string | null, string | null]) => colors.map(color => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
      if (color) { const context = canvas.getContext('2d')!; context.fillStyle = color; context.fillRect(0, 0, width, height); }
      return canvas;
    }) as [HTMLCanvasElement, HTMLCanvasElement];
    const stages = [upload('initial-fallback')];
    album.setPageCanvases(pages(1024, 800, ['#ff0000', '#0000ff'])); stages.push(upload('grow'));
    album.setPageCanvases(pages(1024, 800, ['#00ff00', '#ffff00'])); stages.push(upload('same-size-new-ink'));
    album.setPageCanvases(pages(1024, 800, [null, null])); stages.push(upload('same-size-transparent'));
    album.setPageCanvases(pages(320, 480, ['#ff0000', '#0000ff'])); stages.push(upload('shrink'));
    album.setPageCanvases(pages(1536, 1024, ['#00ff00', '#ffff00'])); stages.push(upload('grow-again'));
    album.setChapter(1); stages.push(upload('chapter-fallback-restores-size'));
    album.setPageCanvases(pages(768, 640, ['#ff0000', '#0000ff'])); stages.push(upload('same-size-as-fallback'));
    for (const map of maps) map.dispose();
    const afterDispose = counts(), allDeletedOnce = [...created].every(texture => deletes.get(texture) === 1);
    gl.deleteFramebuffer(framebuffer); renderer.dispose();
    return { stages, afterDispose, allDeletedOnce, disposalErrors: errors() };
  });
  expect(pageErrors).toEqual([]);
  const byName = Object.fromEntries(result.stages.map(stage => [stage.phase, stage]));
  for (const stage of result.stages) {
    expect(stage.identities, stage.phase).toBe(true); expect(stage.duplex, stage.phase).toBe(true);
    expect(stage.uploadErrors, stage.phase).toEqual([]); expect(stage.readErrors, stage.phase).toEqual([]);
    for (const sample of stage.samples) {
      expect(sample.framebufferComplete, stage.phase).toBe(true);
      expect(sample.allocated, stage.phase).toEqual([sample.width, sample.height]);
    }
  }
  for (const phase of ['grow', 'shrink', 'same-size-as-fallback'])
    expect(byName[phase].samples.map(sample => sample.pixel), phase).toEqual([[255, 0, 0, 255], [0, 0, 255, 255]]);
  for (const phase of ['same-size-new-ink', 'grow-again'])
    expect(byName[phase].samples.map(sample => sample.pixel), phase).toEqual([[0, 255, 0, 255], [255, 255, 0, 255]]);
  expect(byName['same-size-transparent'].samples.map(sample => sample.pixel)).toEqual([[0, 0, 0, 0], [0, 0, 0, 0]]);
  expect(byName['initial-fallback'].counts).toEqual({ created: 2, deleted: 0 });
  expect(byName.grow.counts).toEqual({ created: 4, deleted: 2 });
  expect(byName['same-size-new-ink'].counts).toEqual(byName.grow.counts);
  expect(byName['same-size-transparent'].counts).toEqual(byName.grow.counts);
  expect(byName.shrink.counts).toEqual({ created: 6, deleted: 4 });
  expect(byName['grow-again'].counts).toEqual({ created: 8, deleted: 6 });
  expect(byName['chapter-fallback-restores-size'].counts).toEqual({ created: 10, deleted: 8 });
  expect(byName['same-size-as-fallback'].counts).toEqual({ created: 10, deleted: 8 });
  expect(result.afterDispose).toEqual({ created: 10, deleted: 10 });
  expect(result.allDeletedOnce).toBe(true); expect(result.disposalErrors).toEqual([]);
  await test.info().attach('native-album-texture-lifecycle', {
    contentType: 'application/json', body: JSON.stringify(result, null, 2),
  });
});
