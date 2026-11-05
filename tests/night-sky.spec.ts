import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { DEFAULT_LOCATION, timestampFromZonedInput } from '../src/calendar-seed';
import { calculateCelestial, greenwichSiderealAngle } from '../src/celestial-controller';
import { EQUATORIAL_TO_GALACTIC, LOW_STAR_COUNT, STAR_COUNT, SKY_DRIFT_PERIOD_MS, createGalacticTexture, createNightSky, equatorialFrame, nightSkyFrame, nightSkyVisibility, stellarDirection } from '../src/night-sky';
import { sampleWeather } from '../src/weather-controller';

const RAD = Math.PI / 180, at = timestampFromZonedInput('2026-10-31T22:00');
const angularDistance = (a: number[], b: number[]) => Math.acos(Math.min(1, Math.max(-1, a.reduce((sum, value, index) => sum + value * b[index], 0))));

test('the star frame is an orthonormal geographic frame tilted to latitude, with correct east and north', () => {
  for (const latitude of [-90, -36, 0, 36.3932, 90]) for (const northYaw of [0, 1.5 * Math.PI]) {
    const location = { ...DEFAULT_LOCATION, latitude, northYaw };
    const matrix = new THREE.Matrix3().fromArray(equatorialFrame(at, location));
    expect(matrix.determinant()).toBeCloseTo(1, 10);
    const identity = matrix.clone().transpose().multiply(matrix).elements;
    identity.forEach((value, index) => expect(value).toBeCloseTo(index % 4 === 0 ? 1 : 0, 10));
    const pole = stellarDirection(0, Math.PI / 2, at, location);
    expect(pole[1]).toBeCloseTo(Math.sin(latitude * RAD), 10);
  }
  const equator = { ...DEFAULT_LOCATION, latitude: 0, longitude: 0, northYaw: 0 };
  const meridian = greenwichSiderealAngle(at);
  expect(stellarDirection(meridian, 0, at, equator)[1]).toBeCloseTo(1, 10);
  expect(stellarDirection(meridian + Math.PI / 2, 0, at, equator)[0]).toBeCloseTo(1, 10);
  const north = stellarDirection(0, Math.PI / 2, at);
  expect(north[0]).toBeGreaterThan(.8); expect(Math.abs(north[2])).toBeLessThan(1e-10);
});

test('stars advance at sidereal speed and restore the same absolute orientation across refresh and day boundaries', () => {
  const direction = (time: number) => stellarDirection(1.2, 0, time);
  const hour = angularDistance(direction(at), direction(at + 3600000)) / RAD;
  expect(hour).toBeCloseTo(15.0410686, 5);
  expect(angularDistance(direction(at), direction(at + 86164090.5)) / RAD).toBeLessThan(.00002);
  expect(angularDistance(direction(at), direction(at + 86400000)) / RAD).toBeCloseTo(.9856474, 5);
  const longitudeShift = stellarDirection(1.2, 0, at, { ...DEFAULT_LOCATION, longitude: DEFAULT_LOCATION.longitude + 15.0410686 });
  expect(angularDistance(longitudeShift, direction(at + 3600000)) / RAD).toBeLessThan(.00001);
  const midnight = timestampFromZonedInput('2026-11-01T00:00');
  expect(angularDistance(direction(midnight - 1), direction(midnight + 1))).toBeLessThan(2e-7);
  expect(equatorialFrame(at + 8 * 3600000)).toEqual(equatorialFrame(at + 8 * 3600000));
});

test('the galactic band uses the IAU pole and centre rather than a camera-facing painted stripe', () => {
  const matrix = new THREE.Matrix3().set(...EQUATORIAL_TO_GALACTIC);
  const poleRA = 192.85948 * RAD, poleDec = 27.12825 * RAD;
  const pole = new THREE.Vector3(Math.cos(poleDec) * Math.cos(poleRA), Math.cos(poleDec) * Math.sin(poleRA), Math.sin(poleDec)).applyMatrix3(matrix);
  expect(pole.z).toBeCloseTo(1, 8); expect(Math.hypot(pole.x, pole.y)).toBeLessThan(1e-7);
  expect(matrix.determinant()).toBeCloseTo(1, 8);
  const centreRA = 266.4051 * RAD, centreDec = -28.936175 * RAD;
  const centre = new THREE.Vector3(Math.cos(centreDec) * Math.cos(centreRA), Math.cos(centreDec) * Math.sin(centreRA), Math.sin(centreDec)).applyMatrix3(matrix);
  expect(centre.x).toBeCloseTo(1, 8); expect(Math.hypot(centre.y, centre.z)).toBeLessThan(2e-6);
});

test('the complete stellar frame drifts slowly about the geographic pole without a phase seam or a refresh reset', () => {
  const vector = (time: number, reduced = false) => new THREE.Vector3(1, 0, 0).applyMatrix3(new THREE.Matrix3().fromArray(nightSkyFrame(time, DEFAULT_LOCATION, undefined, reduced))).toArray();
  const seconds = 12, degrees = angularDistance(vector(at), vector(at + seconds * 1000)) / RAD;
  expect(degrees).toBeCloseTo(3 + 15.0410686 / 3600 * seconds, 5);
  expect(degrees).toBeGreaterThan(3); expect(degrees).toBeLessThan(3.1);
  for (const time of [at, at + 2 * 86400000, -2 * SKY_DRIFT_PERIOD_MS, 0]) {
    const frame = nightSkyFrame(time), matrix = new THREE.Matrix3().fromArray(frame);
    expect(matrix.determinant()).toBeCloseTo(1, 10);
    expect(frame.slice(6)).toEqual(equatorialFrame(time).slice(6));
    expect(nightSkyFrame(time)).toEqual(frame);
  }
  const boundary = Math.ceil(at / SKY_DRIFT_PERIOD_MS) * SKY_DRIFT_PERIOD_MS;
  expect(angularDistance(vector(boundary - 1), vector(boundary + 1)) / RAD).toBeCloseTo(.000508356, 7);
  expect(angularDistance(vector(at, true), vector(at + 12000, true)) / RAD).toBeCloseTo(.050136895, 6);
});

test('every star stays locked to the same galactic position while visual time advances, quality changes and a new sky restores the date', () => {
  const sky = createNightSky(), replica = createNightSky();
  const celestial = calculateCelestial(at), weather = sampleWeather(at, { kind: 'clear' });
  const galactic = new THREE.Matrix3().set(...EQUATORIAL_TO_GALACTIC), star = new THREE.Vector3(1, 0, 0);
  try {
    const originalResources = [sky.stars.geometry, sky.stars.material, sky.galaxyMap];
    for (const time of [at, at + 12000, at + 10 * 60000, at + 9 * 3600000]) {
      sky.update(celestial, weather, time, false, 0);
      const rotation = new THREE.Matrix3().setFromMatrix4(sky.stars.matrix);
      const actual = star.clone().applyMatrix3(rotation).applyMatrix3(sky.worldToGalactic);
      expect(actual.distanceTo(star.clone().applyMatrix3(galactic))).toBeLessThan(1e-10);
      const matrix = sky.stars.matrix.elements.slice(), galaxy = sky.worldToGalactic.elements.slice();
      replica.update(celestial, weather, time, true, 0);
      expect(replica.stars.matrix.elements).toEqual(matrix); expect(replica.worldToGalactic.elements).toEqual(galaxy);
      expect([sky.stars.geometry, sky.stars.material, sky.galaxyMap]).toEqual(originalResources);
    }
    sky.update(celestial, weather, at + 12345, false, 0, true);
    expect(new THREE.Matrix3().setFromMatrix4(sky.stars.matrix).elements).toEqual(Array.from(equatorialFrame(at + 12345)));
  } finally { sky.dispose(); replica.dispose(); }
});

test('twilight, clouds and visible moonlight extinguish the galaxy continuously while a set moon does not', () => {
  const calculated = calculateCelestial(at), weather = sampleWeather(at, { kind: 'clear', cloudCover: 0 });
  const night = { ...calculated, night: 1, moonIllumination: 1, moon: { ...calculated.moon, altitude: -.1 } };
  const dark = nightSkyVisibility(night, weather);
  expect(dark.galaxy).toBe(1); expect(dark.stars).toBe(1);
  const moon = nightSkyVisibility({ ...night, moon: { ...night.moon, altitude: .8 } }, weather);
  expect(moon.galaxy).toBeLessThan(dark.galaxy * .15); expect(moon.stars).toBeGreaterThan(dark.stars * .5);
  expect(nightSkyVisibility({ ...night, night: 0 }, weather).stars).toBe(0);
  expect(nightSkyVisibility(night, { ...weather, cloudCover: 1 }).galaxy).toBe(0);
  const before = nightSkyVisibility(night, { ...weather, cloudCover: .60000 });
  const after = nightSkyVisibility(night, { ...weather, cloudCover: .60001 });
  expect(Math.abs(before.galaxy - after.galaxy)).toBeLessThan(.0001);
  expect(nightSkyVisibility(night, weather, 1).galaxy).toBeLessThan(dark.galaxy * .06);
});

test('night and low quality reuse preallocated stars and density resources, with a single disposal per owned resource', () => {
  const sky = createNightSky(), geometry = sky.stars.geometry, material = sky.stars.material, texture = sky.galaxyMap;
  const celestial = calculateCelestial(at), weather = sampleWeather(at, { kind: 'clear' });
  let geometries = 0, materials = 0, textures = 0;
  geometry.addEventListener('dispose', () => geometries++); material.addEventListener('dispose', () => materials++); texture.addEventListener('dispose', () => textures++);
  sky.update(celestial, weather, at, false, 0);
  expect(geometry.drawRange.count).toBe(STAR_COUNT);
  const before = sky.stars.matrix.elements.slice(), firstFrame = sky.worldToGalactic.elements.slice();
  sky.update(celestial, weather, at + 3600000, true, 0);
  expect(geometry.drawRange.count).toBe(LOW_STAR_COUNT); expect(sky.stars.geometry).toBe(geometry); expect(sky.galaxyMap).toBe(texture);
  expect(sky.stars.matrix.elements).not.toEqual(before); expect(sky.worldToGalactic.elements).not.toEqual(firstFrame);
  sky.update(celestial, weather, at, false, 0);
  expect(sky.stars.matrix.elements).toEqual(before); expect(sky.worldToGalactic.elements).toEqual(firstFrame);
  expect(sky.stars.renderOrder).toBeLessThan(0); expect(material.depthWrite).toBe(false); expect(material.depthTest).toBe(true);
  sky.dispose(); sky.dispose(); expect([geometries, materials, textures]).toEqual([1, 1, 1]);
});

test('the denser night field follows the Milky Way while preserving bright anchors, quiet high latitudes and low-quality distribution', () => {
  const sky = createNightSky(), replica = createNightSky();
  const positions = sky.stars.geometry.getAttribute('position'), styles = sky.stars.geometry.getAttribute('starStyle');
  const galactic = new THREE.Matrix3().set(...EQUATORIAL_TO_GALACTIC), direction = new THREE.Vector3();
  try {
    expect(positions.count).toBeGreaterThanOrEqual(12000);
    expect(positions.count).toBeLessThanOrEqual(20000);
    expect(LOW_STAR_COUNT).toBeGreaterThanOrEqual(6000);
    expect(LOW_STAR_COUNT).toBeLessThanOrEqual(positions.count / 2);
    expect(replica.stars.geometry.getAttribute('position').array).toEqual(positions.array);
    for (const count of [LOW_STAR_COUNT, STAR_COUNT]) {
      let inPlane = 0, highLatitude = 0, luminous = 0, brightness = 0, faint = 0;
      for (let i = 20; i < count; i++) {
        direction.fromBufferAttribute(positions, i).normalize().applyMatrix3(galactic);
        const latitude = Math.abs(Math.asin(THREE.MathUtils.clamp(direction.z, -1, 1)));
        if (latitude < 12 * RAD) inPlane++;
        if (latitude > 30 * RAD) highLatitude++;
        if (styles.getY(i) > .8) luminous++;
        if (styles.getY(i) < .24) faint++;
        brightness += styles.getY(i);
      }
      const faintCount = count - 20;
      // Uniform white noise would put only sin(12deg), about21%, in this band.
      expect(inPlane / faintCount).toBeGreaterThan(.7);
      expect(inPlane / faintCount).toBeLessThan(.87);
      expect(highLatitude / faintCount).toBeGreaterThan(.08);
      expect(highLatitude / faintCount).toBeLessThan(.18);
      expect(luminous / faintCount).toBeGreaterThan(.015);
      expect(luminous / faintCount).toBeLessThan(.08);
      expect(faint / faintCount).toBeGreaterThan(.5);
      expect(brightness / faintCount).toBeGreaterThan(.2);
      expect(brightness / faintCount).toBeLessThan(.32);
    }
    const celestial = calculateCelestial(at), weather = sampleWeather(at, { kind: 'clear', cloudCover: 0 });
    const dark = { ...celestial, night: 1, moonIllumination: 0 };
    sky.update(dark, weather, at, false, 0);
    expect((sky.stars.material as THREE.ShaderMaterial).uniforms.opacity.value).toBeGreaterThan(1.3);
    expect(sky.galaxyStrength.value).toBeGreaterThan(.12);
    expect(sky.galaxyStrength.value).toBeLessThan(.16);
    sky.update({ ...dark, night: 0 }, weather, at, false, 0);
    expect((sky.stars.material as THREE.ShaderMaterial).uniforms.opacity.value).toBe(0);
    expect(sky.galaxyStrength.value).toBe(0);
  } finally { sky.dispose(); replica.dispose(); }
});

test('galactic banks have varying widths and small-scale contrast, with repeatable fine grain in one bounded atlas', () => {
  const texture = createGalacticTexture(), replica = createGalacticTexture();
  try {
    const { data, width, height } = texture.image;
    expect(data).toEqual(replica.image.data);
    expect(width).toBeGreaterThanOrEqual(1024);
    expect(data.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
    const lum = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722;
    };
    const widths: number[] = [], ridges: number[] = [];
    let total = 0, detail = 0, grain = 0, grainSquare = 0;
    const radius = Math.max(1, Math.round(width / 720));
    for (let x = 8; x < width - 8; x += 8) {
      let light = 0, weightedB = 0, weightedBB = 0, max = 0;
      for (let y = Math.floor(height * (.5 - 20 / 180)); y < height * (.5 + 20 / 180); y++) {
        const l = lum(x, y), b = ((y + .5) / height - .5) * 180;
        light += l; weightedB += l * b; weightedBB += l * b * b; max = Math.max(max, l);
        if (Math.abs(b) < 12) {
          total += l;
          detail += Math.abs(l - (lum(x - radius, y) + lum(x + radius, y) + lum(x, y - radius) + lum(x, y + radius)) / 4);
        }
      }
      widths.push(Math.sqrt(weightedBB / light - (weightedB / light) ** 2)); ridges.push(max);
    }
    const quantile = (a: number[], t: number) => a.sort((x, y) => x - y)[Math.floor((a.length - 1) * t)];
    // A thin smooth rail or an equally bright band cannot satisfy these together.
    expect(quantile(widths, .5)).toBeGreaterThan(6);
    expect(quantile(widths, .95) - quantile(widths, .05)).toBeGreaterThan(1.2);
    expect(quantile(ridges, .95) / quantile(ridges, .05)).toBeGreaterThan(1.6);
    expect(detail / total).toBeGreaterThan(.08);
    for (let y = 0; y < height; y += 7) {
      expect(data[(y * width + width - 1) * 4 + 3]).toBe(data[y * width * 4 + 3]);
      for (let x = 0; x < width; x += 7) {
        const value = data[(y * width + x) * 4 + 3] / 255;
        grain += value; grainSquare += value * value;
      }
    }
    const samples = Math.ceil(height / 7) * Math.ceil(width / 7), mean = grain / samples;
    expect(mean).toBeGreaterThan(.22); expect(mean).toBeLessThan(.28);
    expect(grainSquare / samples - mean * mean).toBeGreaterThan(.04);
    for (let x = 0; x < width; x += 7) expect(data[((height - 1) * width + x) * 4 + 3]).toBe(data[x * 4 + 3]);
  } finally { texture.dispose(); replica.dispose(); }
});

test('fine stellar banks favor luminous cloud patches while foreground bright stars remain in dark dust', () => {
  const sky = createNightSky();
  try {
    const positions = sky.stars.geometry.getAttribute('position'), style = sky.stars.geometry.getAttribute('starStyle');
    const matrix = new THREE.Matrix3().set(...EQUATORIAL_TO_GALACTIC), v = new THREE.Vector3();
    const { width, height, data } = sky.galaxyMap.image;
    let fineLight = 0, fineCount = 0, foregroundLight = 0, foregroundCount = 0;
    for (let i = 20; i < positions.count; i++) {
      v.fromBufferAttribute(positions, i).normalize().applyMatrix3(matrix);
      const b = Math.asin(THREE.MathUtils.clamp(v.z, -1, 1));
      if (Math.abs(b) > 12 * RAD) continue;
      const x = Math.min(width - 1, Math.floor((Math.atan2(v.y, v.x) / (2 * Math.PI) + .5) * width));
      const y = Math.min(height - 1, Math.floor((b / Math.PI + .5) * height));
      const k = (y * width + x) * 4, light = data[k] + data[k + 1] + data[k + 2];
      if (style.getY(i) < .24) { fineLight += light; fineCount++; }
      else { foregroundLight += light; foregroundCount++; }
    }
    expect(fineCount).toBeGreaterThan(6000); expect(foregroundCount).toBeGreaterThan(1000);
    expect(fineLight / fineCount).toBeGreaterThan(foregroundLight / foregroundCount * 1.12);
  } finally { sky.dispose(); }
});

test('the production sky shader resolves fine grain beyond its broad RGB clouds without changing mean brightness', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__galactic-grain', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Galactic grain pixels</title>' }));
  await page.goto('/__galactic-grain');
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { createEnvironmentSky } = await import('/src/environment-sky.ts');
    const { calculateCelestial } = await import('/src/celestial-controller.ts');
    const { sampleWeather } = await import('/src/weather-controller.ts');
    const { EQUATORIAL_TO_GALACTIC, nightSkyFrame } = await import('/src/night-sky.ts');
    const at = Date.parse('2026-08-15T19:00:00Z'), celestial = calculateCelestial(at, undefined, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(512, 384); renderer.setPixelRatio(1);
    const target = new THREE.WebGLRenderTarget(512, 384), scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(18, 4 / 3, .1, 500); camera.position.set(0, -8, 0);
    const centre = new THREE.Vector3(1, 0, 0).applyMatrix3(new THREE.Matrix3().set(...EQUATORIAL_TO_GALACTIC).transpose())
      .applyMatrix3(new THREE.Matrix3().fromArray(nightSkyFrame(at, undefined, undefined, true)));
    camera.lookAt(centre.clone().multiplyScalar(80).add(camera.position)); camera.updateMatrixWorld(true);
    const sky = createEnvironmentSky(new THREE.Group()); scene.add(sky.group);
    sky.update(celestial, sampleWeather(at, { kind: 'clear', cloudCover: 0 }), camera, 0, at, false, true);
    sky.moon.visible = false; sky.group.getObjectByName('quiet-night-stars')!.visible = false;
    const dome = sky.group.getObjectByName('continuous-day-night-sky') as any;
    const texture = dome.material.uniforms.galaxyMap.value, data = texture.image.data as Uint8Array;
    const pixels = () => { renderer.setRenderTarget(target); renderer.render(scene, camera); const out = new Uint8Array(512 * 384 * 4); renderer.readRenderTargetPixels(target, 0, 0, 512, 384, out); return out; };
    try {
      const detailed = pixels(), original = data.slice();
      for (let i = 3; i < data.length; i += 4) data[i] = 64;
      texture.needsUpdate = true;
      const smooth = pixels(); data.set(original); texture.needsUpdate = true;
      const restored = pixels();
      let changed = 0, energy = 0, signedEnergy = 0, replay = 0;
      for (let i = 0; i < detailed.length; i += 4) {
        const d = detailed[i] + detailed[i + 1] + detailed[i + 2] - smooth[i] - smooth[i + 1] - smooth[i + 2];
        if (Math.abs(d) > 3) changed++; energy += Math.abs(d); signedEnergy += d;
        replay += Math.abs(restored[i] - detailed[i]) + Math.abs(restored[i + 1] - detailed[i + 1]) + Math.abs(restored[i + 2] - detailed[i + 2]);
      }
      return { changed, energy, signedEnergy, replay, altitude: centre.y, gpuError: renderer.getContext().getError() };
    } finally { sky.dispose(); target.dispose(); renderer.dispose(); }
  });
  expect(result.altitude).toBeGreaterThan(.1); expect(result.gpuError).toBe(0);
  expect(result.changed).toBeGreaterThan(5000); expect(result.energy).toBeGreaterThan(40000);
  expect(Math.abs(result.signedEnergy)).toBeLessThan(result.energy * .3);
  expect(result.replay).toBe(0);
  expect(errors).toEqual([]);
});

test('the galactic texture keeps an uneven luminous band and dark dust instead of filling the whole sky', () => {
  const sky = createNightSky();
  try {
    const image = sky.galaxyMap.image, pixels = image.data as Uint8Array;
    let bandLight = 0, bandCount = 0, farLight = 0, farCount = 0, darkCuts = 0;
    const luminance = (x: number, y: number) => {
      const i = (y * image.width + x) * 4;
      return .2126 * pixels[i] + .7152 * pixels[i + 1] + .0722 * pixels[i + 2];
    };
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const latitude = Math.abs(((y + .5) / image.height - .5) * Math.PI);
      const light = luminance(x, y);
      if (latitude < 8 * RAD) { bandLight += light; bandCount++; }
      if (latitude > 35 * RAD) { farLight += light; farCount++; }
    }
    const ridges: number[] = [];
    for (let x = 0; x < image.width; x++) {
      const centre = Math.floor(image.height / 2);
      const brightest = Math.max(...Array.from({ length: 21 }, (_, i) => luminance(x, centre - 10 + i)));
      ridges.push(brightest);
      const centralCut = Math.min(...Array.from({ length: 7 }, (_, i) => luminance(x, centre - 3 + i)));
      if (centralCut < brightest * .7) darkCuts++;
    }
    expect(bandLight / bandCount).toBeGreaterThan(20);
    expect(farLight / farCount).toBeLessThan(.1);
    expect(Math.max(...ridges) - Math.min(...ridges)).toBeGreaterThan(20);
    expect(darkCuts / image.width).toBeGreaterThan(.65);
  } finally { sky.dispose(); }
});

test('actual galaxy pixels have mottled structure and real cloud alpha attenuates a star drawn behind it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__night-sky-pixels', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Night sky pixels</title>' }));
  await page.goto('/__night-sky-pixels');
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { createEnvironmentSky } = await import('/src/environment-sky.ts');
    const { createCloudController } = await import('/src/cloud-controller.ts');
    const { calculateCelestial } = await import('/src/celestial-controller.ts');
    const { sampleWeather } = await import('/src/weather-controller.ts');
    const timestamp = Date.parse('2026-10-31T20:00:00Z'), weather = sampleWeather(timestamp, { kind: 'clear', cloudCover: 0 });
    const celestial = calculateCelestial(timestamp, undefined, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(320, 240); renderer.setPixelRatio(1);
    const target = new THREE.WebGLRenderTarget(320, 240), scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(44, 4 / 3, .1, 500); camera.position.set(0, -8, 0); camera.lookAt(0, 7, -80); camera.updateMatrixWorld(true);
    const sky = createEnvironmentSky(new THREE.Group()), clouds = createCloudController(); scene.add(sky.group, clouds.group);
    const dome = sky.group.getObjectByName('continuous-day-night-sky') as any, stars = sky.group.getObjectByName('quiet-night-stars') as any;
    const pixels = () => { renderer.setRenderTarget(target); renderer.render(scene, camera); const data = new Uint8Array(320 * 240 * 4); renderer.readRenderTargetPixels(target, 0, 0, 320, 240, data); return data; };
    try {
      sky.update(celestial, weather, camera, 0, timestamp); clouds.group.visible = false;
      stars.visible = false; sky.moon.visible = false;
      const galaxy = pixels(), strength = dome.material.uniforms.galaxyStrength.value;
      dome.material.uniforms.galaxyStrength.value = 0;
      const blank = pixels(), differences: number[] = [];
      for (let i = 0; i < blank.length; i += 4) differences.push(galaxy[i] + galaxy[i + 1] + galaxy[i + 2] - blank[i] - blank[i + 1] - blank[i + 2]);
      const changed = differences.filter(value => value > 3).length, maxDifference = Math.max(...differences);
      // A controlled line of sight through the production cloud shader checks
      // compositing order, not a chance alignment of random cloud and star seeds.
      const direction = new THREE.Vector3(0, 15, -80).normalize(), inverse = new THREE.Matrix3().setFromMatrix4(stars.matrix).transpose();
      const local = direction.clone().applyMatrix3(inverse).multiplyScalar(280);
      stars.geometry.getAttribute('position').setXYZ(0, local.x, local.y, local.z);
      stars.geometry.getAttribute('position').needsUpdate = true;
      stars.geometry.getAttribute('starStyle').setXY(0, 30, 1); stars.geometry.getAttribute('starStyle').needsUpdate = true;
      stars.geometry.getAttribute('starColor').setXYZ(0, 1, 1, 1); stars.geometry.getAttribute('starColor').needsUpdate = true;
      stars.geometry.setDrawRange(0, 1); stars.material.uniforms.opacity.value = 1;
      const cloud = clouds.group.children[0] as any; cloud.count = 1;
      cloud.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(0, 7, -80), new THREE.Quaternion(), new THREE.Vector3(80, 80, 1)));
      cloud.instanceMatrix.needsUpdate = true;
      cloud.geometry.getAttribute('cloudStyle').setXYZW(0, 0, 1, 0, 1); cloud.geometry.getAttribute('cloudStyle').needsUpdate = true;
      cloud.material.uniforms.cloudCover.value = 1; cloud.material.uniforms.daylight.value = 0;
      const centreLum = (data: Uint8Array) => { let sum = 0; for (let y = 116; y < 124; y++) for (let x = 156; x < 164; x++) { const i = (y * 320 + x) * 4; sum += data[i] + data[i + 1] + data[i + 2]; } return sum / 64; };
      stars.visible = false; const base = centreLum(pixels());
      stars.visible = true; const starOnly = centreLum(pixels());
      stars.visible = false; clouds.group.visible = true; const cloudOnly = centreLum(pixels());
      stars.visible = true; const together = centreLum(pixels());
      return { changed, maxDifference, strength, without: starOnly - base, throughCloud: together - cloudOnly, gpuError: renderer.getContext().getError() };
    } finally { sky.dispose(); clouds.dispose(); target.dispose(); renderer.dispose(); }
  });
  expect(errors).toEqual([]); expect(result.gpuError).toBe(0);
  expect(result.strength).toBeGreaterThan(.03); expect(result.changed).toBeGreaterThan(3000); expect(result.maxDifference).toBeGreaterThan(8);
  expect(result.without).toBeGreaterThan(100); expect(result.throughCloud).toBeLessThan(result.without * .9);
});

test('both real star and Milky Way pixels move over a twelve-second visual interval and reproduce exactly at the same date', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__night-sky-motion', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Night sky motion pixels</title>' }));
  await page.goto('/__night-sky-motion');
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { createEnvironmentSky } = await import('/src/environment-sky.ts');
    const { calculateCelestial } = await import('/src/celestial-controller.ts');
    const { sampleWeather } = await import('/src/weather-controller.ts');
    const at = Date.parse('2026-10-31T20:00:00Z'), celestial = calculateCelestial(at, undefined, 0);
    const weather = sampleWeather(at, { kind: 'clear', cloudCover: 0 });
    const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(320, 240); renderer.setPixelRatio(1);
    const target = new THREE.WebGLRenderTarget(320, 240), scene = new THREE.Scene(), sun = new THREE.Group();
    const camera = new THREE.PerspectiveCamera(44, 4 / 3, .1, 500); camera.position.set(0, -8, 0); camera.lookAt(0, 7, -80); camera.updateMatrixWorld(true);
    const sky = createEnvironmentSky(sun); scene.add(sky.group);
    const stars = sky.group.getObjectByName('quiet-night-stars') as any, dome = sky.group.getObjectByName('continuous-day-night-sky') as any;
    const pixels = (time: number, kind: 'stars' | 'galaxy') => {
      sky.update(celestial, weather, camera, 0, time);
      sky.moon.visible = false; stars.visible = kind === 'stars';
      if (kind === 'stars') dome.material.uniforms.galaxyStrength.value = 0;
      renderer.setRenderTarget(target); renderer.render(scene, camera);
      const data = new Uint8Array(320 * 240 * 4); renderer.readRenderTargetPixels(target, 0, 0, 320, 240, data); return data;
    };
    const difference = (a: Uint8Array, b: Uint8Array) => {
      let changed = 0, energy = 0;
      for (let i = 0; i < a.length; i += 4) {
        const delta = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        if (delta > 3) changed++; energy += delta;
      }
      return { changed, energy };
    };
    try {
      const starBefore = pixels(at, 'stars'), starAfter = pixels(at + 12000, 'stars');
      const galaxyBefore = pixels(at, 'galaxy'), galaxyAfter = pixels(at + 12000, 'galaxy');
      return { stars: difference(starBefore, starAfter), galaxy: difference(galaxyBefore, galaxyAfter),
        replayStars: difference(starBefore, pixels(at, 'stars')), replayGalaxy: difference(galaxyBefore, pixels(at, 'galaxy')),
        gpuError: renderer.getContext().getError() };
    } finally { sky.dispose(); target.dispose(); renderer.dispose(); }
  });
  expect(errors).toEqual([]); expect(result.gpuError).toBe(0);
  expect(result.stars.changed).toBeGreaterThan(150); expect(result.galaxy.changed).toBeGreaterThan(500);
  expect(result.replayStars.energy).toBe(0); expect(result.replayGalaxy.energy).toBe(0);
});
