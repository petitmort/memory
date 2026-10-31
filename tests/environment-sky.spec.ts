import { expect, test } from '@playwright/test';

test('the real moon shader renders continuous illuminated areas and opposite quarter terminators', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__environment_moon_pixels', route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><title>Moon illumination pixels</title><body style="margin:0"></body>',
  }));
  await page.goto('/__environment_moon_pixels');
  const records = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { createEnvironmentSky } = await import('/src/environment-sky.ts');
    const { calculateCelestial } = await import('/src/celestial-controller.ts');
    const { sampleWeather } = await import('/src/weather-controller.ts');
    const size = 256, fov = 2, distance = 240;
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setPixelRatio(1); renderer.setSize(size, size);
    const target = new THREE.WebGLRenderTarget(size, size, { depthBuffer: false, stencilBuffer: false });
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x000000);
    const camera = new THREE.PerspectiveCamera(fov, 1, .1, 500);
    // update() places the horizontal lunar direction at y=-8; observe its disc head-on.
    camera.position.set(0, -8, 0); camera.lookAt(0, -8, -distance); camera.updateMatrixWorld(true);
    const sky = createEnvironmentSky(new THREE.Group()); scene.add(sky.group);
    // Isolate the actual exported moon mesh from the unrelated sky/stars pixel colours.
    for (const child of sky.group.children) child.visible = child === sky.moon;
    const timestamp = Date.parse('2026-06-21T21:00:00Z'), weather = sampleWeather(timestamp, { kind: 'clear', cloudCover: 0 });
    const radius = 2.6 / (distance * Math.tan(fov * Math.PI / 360)) * size / 2;
    const pixels = new Uint8Array(size * size * 4);
    const rows: { phase: number; mean: number; left: number; right: number; brightArea: number; gpuError: number; geometries: number; programs: number }[] = [];
    try {
      renderer.setRenderTarget(target);
      for (const phase of [0, .125, .25, .375, .5, .625, .75, .875, 1]) {
        const calculated = calculateCelestial(timestamp, undefined, phase);
        sky.update({
          ...calculated, daylight: 0, twilight: 0, night: 1,
          sun: { altitude: -.5, azimuth: 0, direction: [0, -.5, -Math.sqrt(.75)] },
          moon: { altitude: 1, azimuth: 0, direction: [0, 0, -1] },
        }, weather, camera);
        renderer.render(scene, camera);
        renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels);
        let sum = 0, left = 0, right = 0, leftCount = 0, rightCount = 0, count = 0, bright = 0;
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const qx = (x + .5 - size / 2) / radius, qy = (y + .5 - size / 2) / radius;
          // Exclude the soft outer rim; the same analytic projected disc is sampled for every phase.
          if (qx * qx + qy * qy > .98 * .98) continue;
          const offset = (y * size + x) * 4;
          const luminance = pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722;
          sum += luminance; count++; if (luminance > 24) bright++;
          if (qx < 0) { left += luminance; leftCount++; }
          else { right += luminance; rightCount++; }
        }
        rows.push({ phase, mean: sum / count, left: left / leftCount, right: right / rightCount, brightArea: bright / count,
          gpuError: renderer.getContext().getError(), geometries: renderer.info.memory.geometries, programs: renderer.info.programs?.length ?? 0 });
      }
      return rows;
    } finally {
      renderer.setRenderTarget(null); target.dispose(); sky.dispose(); renderer.dispose();
    }
  });
  expect(errors).toEqual([]);
  expect(records.map(row => row.gpuError)).toEqual(records.map(() => 0));
  const [newMoon, crescent, first, waxing, full, waning, last, oldCrescent, nextNew] = records;
  expect(newMoon.brightArea).toBeLessThan(.01); expect(newMoon.mean).toBeLessThan(10);
  expect(full.brightArea).toBeGreaterThan(.98); expect(full.mean).toBeGreaterThan(100);
  for (const quarter of [first, last]) {
    expect(quarter.brightArea).toBeGreaterThan(.45); expect(quarter.brightArea).toBeLessThan(.55);
    expect(quarter.mean).toBeGreaterThan(newMoon.mean * 6); expect(quarter.mean).toBeLessThan(full.mean * .8);
  }
  // Northern-hemisphere waxing moon lights its right side; waning lights its left.
  expect(first.right).toBeGreaterThan(first.left * 6);
  expect(last.left).toBeGreaterThan(last.right * 6);
  expect(full.left / full.right).toBeGreaterThan(.85); expect(full.left / full.right).toBeLessThan(1.15);
  // Intermediate phases must form curved crescent/gibbous terminators, not four image swaps.
  for (const row of [crescent, oldCrescent]) {
    expect(row.brightArea).toBeGreaterThan(.08); expect(row.brightArea).toBeLessThan(.22);
  }
  for (const row of [waxing, waning]) {
    expect(row.brightArea).toBeGreaterThan(.77); expect(row.brightArea).toBeLessThan(.91);
  }
  expect(newMoon.mean).toBeCloseTo(nextNew.mean, 2);
  expect(records.every(row => row.geometries === records[0].geometries && row.programs === records[0].programs)).toBe(true);
});
