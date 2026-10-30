import { test, expect } from '@playwright/test';
import type * as Three from 'three';

test('staggered fog culling preserves rendered pixels and restores wisps after a viewport change', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__courtyard-fog-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><meta charset="utf-8"><title>Courtyard fog rendering</title>' }));
  await page.goto('/__courtyard-fog-test');
  const evidence = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { createCourtyardFog } = await import('/src/courtyard-fog.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(320, 240);
    document.body.style.margin = '0';
    document.body.append(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#324e64');
    const camera = new THREE.PerspectiveCamera(50, 4 / 3, .1, 50);
    camera.position.set(.55, 1.65, 6.3); camera.lookAt(.12, 1.2, 2.7); camera.updateMatrixWorld();
    const fog = createCourtyardFog(); scene.add(fog.group);
    const mesh = fog.group.children[0] as Three.InstancedMesh;
    const pixels = () => {
      renderer.render(scene, camera);
      const gl = renderer.getContext(), image = new Uint8Array(320 * 240 * 4);
      gl.readPixels(0, 0, 320, 240, gl.RGBA, gl.UNSIGNED_BYTE, image);
      return image;
    };
    const states: { progress: number; fov: number; aspect: number; active: number; pixelDifferences: number }[] = [];
    for (const shape of [{ fov: 50, aspect: 16 / 9 }, { fov: 50, aspect: 390 / 844 }, { fov: 100, aspect: 16 / 9 }]) {
      camera.fov = shape.fov; camera.aspect = shape.aspect; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
      for (const progress of [.2, .4, .6, .8, .9, .97, 1]) {
        fog.update(0, progress, false, camera);
        const active = mesh.count, culled = pixels();
        // Draw all five original banks as a pixel reference. Removing a bank
        // is valid only if its actual shader contributes no visible pixels.
        mesh.count = 5;
        const reference = pixels();
        let pixelDifferences = 0;
        for (let index = 0; index < reference.length; index++) if (reference[index] !== culled[index]) pixelDifferences++;
        states.push({ progress, ...shape, active, pixelDifferences });
      }
    }
    camera.fov = 30; camera.aspect = 390 / 844; camera.updateProjectionMatrix();
    const restores: { progress: number; narrow: number; wide: number }[] = [];
    for (let step = 10; step < 100; step++) {
      const progress = step / 100;
      camera.fov = 30; camera.aspect = 390 / 844; camera.updateProjectionMatrix();
      fog.update(0, progress, false, camera); const narrow = mesh.count;
      camera.fov = 100; camera.aspect = 16 / 9; camera.updateProjectionMatrix();
      fog.update(0, progress, false, camera); const wide = mesh.count;
      if (wide > narrow) restores.push({ progress, narrow, wide });
    }
    camera.fov = 50; camera.aspect = 4 / 3; camera.updateProjectionMatrix();
    fog.update(0, .6, false, camera); pixels();
    const uniforms = (mesh.material as Three.ShaderMaterial).uniforms;
    const banks = uniforms.bankClearing.value.map((value: Three.Vector4) => value.toArray());
    const drawCalls = renderer.info.render.calls;
    fog.dispose(); renderer.dispose();
    return { states, restores, banks, drawCalls };
  });
  expect(evidence.states.every(state => state.pixelDifferences === 0), JSON.stringify(evidence.states)).toBe(true);
  expect(evidence.states.some(state => state.active > 0 && state.active < 5)).toBe(true);
  expect(evidence.restores.length, 'wider framing must restore banks whose edge wisps become visible').toBeGreaterThan(0);
  expect(evidence.banks).toHaveLength(5);
  expect(evidence.banks[4][0]).toBeGreaterThan(evidence.banks[0][0]);
  expect(evidence.drawCalls).toBe(1);
  expect(errors).toEqual([]);
  await test.info().attach('fog-bank-rendering', { body: JSON.stringify(evidence, null, 2), contentType: 'application/json' });
});
