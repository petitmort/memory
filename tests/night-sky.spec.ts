import { expect, test } from '@playwright/test';
import * as THREE from 'three';
import { DEFAULT_LOCATION, timestampFromZonedInput } from '../src/calendar-seed';
import { calculateCelestial, greenwichSiderealAngle } from '../src/celestial-controller';
import { EQUATORIAL_TO_GALACTIC, LOW_STAR_COUNT, STAR_COUNT, createNightSky, equatorialFrame, nightSkyVisibility, stellarDirection } from '../src/night-sky';
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
    expect(positions.count).toBeGreaterThanOrEqual(5000);
    expect(positions.count).toBeLessThanOrEqual(7000);
    expect(LOW_STAR_COUNT).toBeGreaterThanOrEqual(2000);
    expect(LOW_STAR_COUNT).toBeLessThanOrEqual(positions.count / 2);
    expect(replica.stars.geometry.getAttribute('position').array).toEqual(positions.array);
    for (const count of [LOW_STAR_COUNT, STAR_COUNT]) {
      let inPlane = 0, highLatitude = 0, luminous = 0, brightness = 0;
      for (let i = 20; i < count; i++) {
        direction.fromBufferAttribute(positions, i).normalize().applyMatrix3(galactic);
        const latitude = Math.abs(Math.asin(THREE.MathUtils.clamp(direction.z, -1, 1)));
        if (latitude < 12 * RAD) inPlane++;
        if (latitude > 30 * RAD) highLatitude++;
        if (styles.getY(i) > .8) luminous++;
        brightness += styles.getY(i);
      }
      const faintCount = count - 20;
      // Uniform white noise would put only sin(12deg), about21%, in this band.
      expect(inPlane / faintCount).toBeGreaterThan(.62);
      expect(inPlane / faintCount).toBeLessThan(.8);
      expect(highLatitude / faintCount).toBeGreaterThan(.15);
      expect(highLatitude / faintCount).toBeLessThan(.26);
      expect(luminous / faintCount).toBeGreaterThan(.04);
      expect(luminous / faintCount).toBeLessThan(.2);
      expect(brightness / faintCount).toBeGreaterThan(.42);
      expect(brightness / faintCount).toBeLessThan(.5);
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
