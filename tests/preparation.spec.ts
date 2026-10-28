import { test, expect } from '@playwright/test';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { prepareAmbientNoise } from '../src/ambient-audio';
import { warmSceneResources } from '../src/scene-warmup';

function seededRandom() {
  let seed = 1837;
  return () => {
    seed = Math.imul(seed, 1664525) + 1013904223 | 0;
    return (seed >>> 0) / 4294967296;
  };
}

function fakeAudio(sampleRate: number) {
  const allocations: { channels: number; length: number; rate: number }[] = [];
  const context = {
    state: 'running', sampleRate,
    createBuffer(channels: number, length: number, rate: number) {
      allocations.push({ channels, length, rate });
      const data = new Float32Array(length);
      return {
        length, sampleRate: rate, duration: length / rate, numberOfChannels: channels,
        getChannelData(channel: number) { expect(channel).toBe(0); return data; },
      } as AudioBuffer;
    },
  };
  return { context, allocations, audio: context as unknown as AudioContext };
}

test('ambient preparation preserves the original eight-second samples while yielding and cancelling safely', async () => {
  // SHA-256 of the legacy synchronous recurrence with the LCG above, seed 1837.
  // Fixed output catches changed filter state, gain, rate or chunk-boundary resets.
  const golden = new Map([
    [44100, '49e9ec48022b1fd7a1643c2b68e6e420bd1cd98a47e18a00cded79564e404e57'],
    [48000, 'b6b5880f854112a362569fb6bc5974512acdc5fcb23de6785263d61e09893223'],
  ]);
  for (const [rate, hash] of golden) {
    await test.step(`${rate} Hz retains the legacy waveform`, async () => {
      const source = fakeAudio(rate);
      let turns = 0;
      const heartbeat = setInterval(() => { turns++; }, 0);
      let buffer: AudioBuffer;
      try { buffer = await prepareAmbientNoise(source.audio, seededRandom()); }
      finally { clearInterval(heartbeat); }
      expect(turns).toBeGreaterThanOrEqual(2);
      expect(source.allocations).toEqual([{ channels: 1, length: rate * 8, rate }]);
      expect(buffer!.sampleRate).toBe(rate);
      expect(buffer!.duration).toBe(8);
      expect(buffer!.numberOfChannels).toBe(1);
      const samples = buffer!.getChannelData(0);
      expect(samples).toHaveLength(rate * 8);
      expect(createHash('sha256').update(new Uint8Array(samples.buffer)).digest('hex')).toBe(hash);
    });
  }
  const closed = fakeAudio(48000);
  closed.context.state = 'closed';
  await expect(prepareAmbientNoise(closed.audio, seededRandom())).rejects.toMatchObject({ name: 'AbortError' });
  expect(closed.allocations).toEqual([]);
  const closing = fakeAudio(44100);
  const pending = prepareAmbientNoise(closing.audio, seededRandom());
  closing.context.state = 'closed';
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(closing.allocations).toEqual([]);
});

function warmFixture(outcome: 'normal' | 'draw-error' | 'post-draw-cancel') {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const reveal = new THREE.Group(), untouched = new THREE.Group();
  reveal.visible = false; untouched.visible = false;
  scene.add(reveal, untouched);
  const material = new THREE.MeshStandardMaterial({ color: '#c7ae81', roughness: .91, metalness: .13, transparent: true, opacity: .82, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const points = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  const sprite = new THREE.Sprite();
  points.frustumCulled = false;
  reveal.add(mesh, line); untouched.add(points, sprite);
  const light = new THREE.DirectionalLight();
  light.castShadow = true; light.shadow.autoUpdate = false; light.shadow.needsUpdate = false;
  light.shadow.mapSize.set(2048, 2048);
  scene.add(light);
  const renderables = [mesh, points, line, sprite];
  const originalCull = renderables.map(object => object.frustumCulled);
  const viewport = new THREE.Vector4(12, 34, 640, 360), scissor = new THREE.Vector4(3, 4, 320, 180);
  const materialValues = () => [material.color.toArray(), material.roughness, material.metalness, material.opacity, material.transparent, material.side, material.depthWrite, material.version];
  const originalMaterial = materialValues();
  let scissorTest = false, ratio = 1.5, available = true, draws = 0;
  const setRect = (rect: THREE.Vector4, values: unknown[]) => {
    if (values.length === 1) rect.copy(values[0] as THREE.Vector4);
    else rect.set(...values as [number, number, number, number]);
  };
  const renderer = {
    toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1, outputColorSpace: THREE.SRGBColorSpace,
    shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap, autoUpdate: false, needsUpdate: false },
    getRenderTarget: () => null,
    setRenderTarget() { throw new Error('Warmup must use the normal framebuffer'); },
    getPixelRatio: () => ratio, setPixelRatio(value: number) { ratio = value; },
    getViewport: (target: THREE.Vector4) => target.copy(viewport),
    getScissor: (target: THREE.Vector4) => target.copy(scissor),
    getScissorTest: () => scissorTest,
    setViewport(...values: unknown[]) { setRect(viewport, values); },
    setScissor(...values: unknown[]) { setRect(scissor, values); },
    setScissorTest(value: boolean) { scissorTest = value; },
    render(actualScene: THREE.Scene, actualCamera: THREE.Camera) {
      draws++;
      expect(actualScene).toBe(scene); expect(actualCamera).toBe(camera);
      expect(reveal.visible).toBe(true); expect(untouched.visible).toBe(false);
      expect(renderables.every(object => !object.frustumCulled)).toBe(true);
      expect(viewport.toArray().map(value => value * ratio)).toEqual([0, 0, 16, 16]);
      expect(scissor.toArray().map(value => value * ratio)).toEqual([0, 0, 16, 16]);
      expect(scissorTest).toBe(true); expect(ratio).toBe(1.5);
      expect(materialValues()).toEqual(originalMaterial);
      expect(light.shadow.mapSize.toArray()).toEqual([2048, 2048]);
      expect(light.shadow.autoUpdate).toBe(false); expect(light.shadow.needsUpdate).toBe(true);
      if (outcome === 'draw-error') throw new Error('draw failed');
      light.shadow.needsUpdate = false; renderer.shadowMap.needsUpdate = false;
      if (outcome === 'post-draw-cancel') available = false;
    },
  };
  const assertRestored = () => {
    expect(reveal.visible).toBe(false); expect(untouched.visible).toBe(false);
    expect(renderables.map(object => object.frustumCulled)).toEqual(originalCull);
    expect(viewport.toArray()).toEqual([12, 34, 640, 360]);
    expect(scissor.toArray()).toEqual([3, 4, 320, 180]); expect(scissorTest).toBe(false);
    expect(ratio).toBe(1.5); expect(materialValues()).toEqual(originalMaterial);
    expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
    expect(renderer.toneMappingExposure).toBe(1.1); expect(renderer.outputColorSpace).toBe(THREE.SRGBColorSpace);
    expect(renderer.shadowMap.enabled).toBe(true); expect(renderer.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
    expect(renderer.shadowMap.autoUpdate).toBe(false); expect(light.shadow.autoUpdate).toBe(false);
    expect(light.shadow.mapSize.toArray()).toEqual([2048, 2048]);
  };
  return {
    renderer, scene, camera, reveal, light,
    draws: () => draws, assertRestored,
    requireAvailable() { if (!available) throw new Error('scene unavailable'); },
    cancel() { available = false; },
  };
}

test('scene warmup prepares one tiny native-quality draw and restores state on errors or cancellation', async () => {
  for (const outcome of ['normal', 'draw-error', 'post-draw-cancel'] as const) {
    await test.step(outcome, async () => {
      const fixture = warmFixture(outcome);
      const pending = warmSceneResources(fixture.renderer as unknown as THREE.WebGLRenderer, fixture.scene, fixture.camera, [fixture.reveal], fixture.requireAvailable);
      if (outcome === 'normal') await pending;
      else await expect(pending).rejects.toThrow(outcome === 'draw-error' ? 'draw failed' : 'scene unavailable');
      fixture.assertRestored(); expect(fixture.draws()).toBe(1);
      // The warm depth map includes hidden room objects. It must be invalidated
      // for the restored courtyard's first visible frame, even after a failed draw.
      expect(fixture.light.shadow.needsUpdate).toBe(true);
      expect(fixture.renderer.shadowMap.needsUpdate).toBe(true);
    });
  }
  const cancelled = warmFixture('normal');
  const pending = warmSceneResources(cancelled.renderer as unknown as THREE.WebGLRenderer, cancelled.scene, cancelled.camera, [cancelled.reveal], cancelled.requireAvailable);
  cancelled.cancel();
  await expect(pending).rejects.toThrow('scene unavailable');
  cancelled.assertRestored(); expect(cancelled.draws()).toBe(0);
  expect(cancelled.light.shadow.needsUpdate).toBe(false); expect(cancelled.renderer.shadowMap.needsUpdate).toBe(false);
});
