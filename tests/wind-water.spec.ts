import { test, expect } from '@playwright/test';
import { sampleWaterHeight, WIND_WATER_HEIGHT_BOUND, type WaterWind } from '../src/water-surface';

/** Numerical energy flux observes the travelling field, not its implementation. */
function fieldEnergy(wind: WaterWind) {
  let along = 0, across = 0, slopeEnergy = 0, heightEnergy = 0;
  const wx = Math.cos(wind.windDirection), wz = Math.sin(wind.windDirection), epsilon = .001;
  for (let i = 0; i < 3000; i++) {
    const x = Math.sin(i * 1.617) * 115, z = -130 + Math.cos(i * 2.319) * 100, t = i * .173;
    const h = sampleWaterHeight(x, z, t, wind);
    const dx = (sampleWaterHeight(x + epsilon, z, t, wind) - sampleWaterHeight(x - epsilon, z, t, wind)) / (epsilon * 2);
    const dz = (sampleWaterHeight(x, z + epsilon, t, wind) - sampleWaterHeight(x, z - epsilon, t, wind)) / (epsilon * 2);
    const dt = (sampleWaterHeight(x, z, t + epsilon, wind) - sampleWaterHeight(x, z, t - epsilon, wind)) / (epsilon * 2);
    const parallel = dx * wx + dz * wz;
    along -= dt * parallel;
    across -= dt * (-dx * wz + dz * wx);
    slopeEnergy += parallel * parallel; heightEnergy += h * h;
  }
  return { along, across, speed: along / slopeEnergy, rms: Math.sqrt(heightEnergy / 3000) };
}

test('wind sea crests actually travel downwind in all eight world directions', () => {
  for (let index = 0; index < 8; index++) {
    const energy = fieldEnergy({ windDirection: index * Math.PI / 4, windSpeed: 12 });
    expect(energy.along).toBeGreaterThan(0);
    expect(Math.abs(energy.across) / energy.along).toBeLessThan(.12);
  }
});

test('a gale produces more wave energy and a faster dominant travelling sea than calm wind', () => {
  for (const windDirection of [0, .47, Math.PI / 2, 4.1]) {
    const calm = fieldEnergy({ windDirection, windSpeed: 0 });
    const gale = fieldEnergy({ windDirection, windSpeed: 20 });
    expect(gale.rms).toBeGreaterThan(calm.rms * 2);
    expect(gale.speed).toBeGreaterThan(calm.speed * 1.35);
  }
});

test('a running sea crossfades wind trains without accumulated-time phase jumps or direction wrap seams', () => {
  for (const time of [0, 36, 3600, 86400, 1e6]) for (let index = 0; index < 100; index++) {
    const x = Math.sin(index * 1.3) * 120, z = -index * 2.1;
    const wind = { windDirection: index * .17, windSpeed: index % 21 };
    const before = sampleWaterHeight(x, z, time, wind);
    const after = sampleWaterHeight(x, z, time, { windDirection: wind.windDirection + 1e-5, windSpeed: wind.windSpeed + 1e-5 });
    expect(Math.abs(before - after)).toBeLessThan(.0001);
    expect(sampleWaterHeight(x, z, time, { ...wind, windDirection: wind.windDirection + Math.PI * 2 })).toBeCloseTo(before, 11);
    expect(sampleWaterHeight(x, z, time, wind)).toBe(before);
  }
});

test('all wind levels preserve the existing 1.8 m ocean displacement envelope', () => {
  expect(WIND_WATER_HEIGHT_BOUND * 1.6).toBeLessThan(1.8);
  for (let level = 0; level <= 20; level++) for (let index = 0; index < 300; index++) {
    const height = sampleWaterHeight(Math.sin(index * 1.7) * 130, -index * .8, index * .73,
      { windDirection: index * .023, windSpeed: level });
    expect(Math.abs(height)).toBeLessThanOrEqual(WIND_WATER_HEIGHT_BOUND);
  }
  expect(sampleWaterHeight(0, -80, 10, { windDirection: 0, windSpeed: -1 })).toBe(sampleWaterHeight(0, -80, 10, { windDirection: 0, windSpeed: 0 }));
  expect(sampleWaterHeight(0, -80, 10, { windDirection: 0, windSpeed: 30 })).toBe(sampleWaterHeight(0, -80, 10, { windDirection: 0, windSpeed: 20 }));
});

test('the actual GPU wind-height and analytic normals agree with the boat sampler', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__wind_water', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Wind water</title>'}));
  await page.goto('/__wind_water');
  const pairs = await page.evaluate(async () => {
    const [THREE, water] = await Promise.all([import('/node_modules/.vite/deps/three.js'), import('/src/water-surface.ts')]);
    const renderer = new THREE.WebGLRenderer({ antialias:false }); renderer.setSize(1,1);
    const target = new THREE.WebGLRenderTarget(1,1,{ type:THREE.FloatType, depthBuffer:false });
    const material = new THREE.ShaderMaterial({
      uniforms:{ time:{value:0}, windDirection:{value:0}, windSpeed:{value:0}, windInfluence:{value:1}, point:{value:new THREE.Vector2()} },
      vertexShader:'void main(){gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader:water.waterSurfaceGLSL()+'\nuniform vec2 point;void main(){gl_FragColor=vec4(surface(point,0.),1.);}',
    });
    const geometry = new THREE.PlaneGeometry(2,2), scene = new THREE.Scene(); scene.add(new THREE.Mesh(geometry,material));
    const camera = new THREE.Camera(), pixel = new Float32Array(4), result = [];
    try {
      renderer.setRenderTarget(target);
      for (const windSpeed of [0,2,8,14,20]) for (const windDirection of [0,.43,Math.PI/2,3.2,5.8]) {
        const time=37.6, x=-19.3,z=-87.1,wind={windDirection,windSpeed}, e=.001;
        material.uniforms.time.value=time;material.uniforms.windSpeed.value=windSpeed;material.uniforms.windDirection.value=windDirection;material.uniforms.point.value.set(x,z);
        renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
        result.push({gpu:Array.from(pixel),cpu:[water.sampleWaterHeight(x,z,time,wind),
          (water.sampleWaterHeight(x+e,z,time,wind)-water.sampleWaterHeight(x-e,z,time,wind))/(2*e),
          (water.sampleWaterHeight(x,z+e,time,wind)-water.sampleWaterHeight(x,z-e,time,wind))/(2*e)]});
      }
      material.uniforms.windInfluence.value=0;
      renderer.render(scene,camera);renderer.readRenderTargetPixels(target,0,0,1,1,pixel);
      result.push({gpu:Array.from(pixel),cpu:[water.sampleWaterHeight(-19.3,-87.1,37.6)]});
      return result;
    } finally { renderer.setRenderTarget(null);target.dispose();material.dispose();geometry.dispose();renderer.dispose(); }
  });
  for (const pair of pairs) for (let index=0;index<pair.cpu.length;index++)
    expect(pair.gpu[index]).toBeCloseTo(pair.cpu[index],3);
  expect(errors).toEqual([]);
});
