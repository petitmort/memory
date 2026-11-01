import * as THREE from "three";
import { DEFAULT_LOCATION, createSeededRandom, type CalendarLocation } from "./calendar-seed";
import { greenwichSiderealAngle, type CelestialState, type Direction3 } from "./celestial-controller";
import type { WeatherState } from "./weather-controller";

const RAD = Math.PI / 180, TAU = Math.PI * 2;
export const STAR_COUNT = 3000, LOW_STAR_COUNT = 1500;
/** J2000 equatorial Cartesian basis to IAU galactic Cartesian basis (row-major). */
export const EQUATORIAL_TO_GALACTIC = [
  -.0548755604, -.8734370902, -.4838350155,
  .4941094279, -.4448296300, .7469822445,
  -.8676661490, -.1980763734, .4559837762,
] as const;

/**
 * Column-major equatorial-to-world rotation. Its Z axis is the celestial pole,
 * tilted by the observer's latitude, rather than an arbitrary world-Y spin.
 */
export function equatorialFrame(timestamp: number, location: CalendarLocation = DEFAULT_LOCATION, out = new Float64Array(9)) {
  const theta = greenwichSiderealAngle(timestamp) + location.longitude * RAD;
  const latitude = location.latitude * RAD, yaw = location.northYaw ?? 0;
  const st = Math.sin(theta), ct = Math.cos(theta), sp = Math.sin(latitude), cp = Math.cos(latitude);
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  out[0] = -cy * st + sy * sp * ct; out[1] = cp * ct; out[2] = sy * st + cy * sp * ct;
  out[3] = cy * ct + sy * sp * st; out[4] = cp * st; out[5] = -sy * ct + cy * sp * st;
  out[6] = -sy * cp; out[7] = sp; out[8] = -cy * cp;
  return out;
}

export function stellarDirection(rightAscension: number, declination: number, timestamp: number, location: CalendarLocation = DEFAULT_LOCATION): Direction3 {
  const frame = equatorialFrame(timestamp, location), cd = Math.cos(declination);
  const x = cd * Math.cos(rightAscension), y = cd * Math.sin(rightAscension), z = Math.sin(declination);
  return [frame[0] * x + frame[3] * y + frame[6] * z, frame[1] * x + frame[4] * y + frame[7] * z, frame[2] * x + frame[5] * y + frame[8] * z];
}

/** Clouds also occlude individual stars spatially; this is atmospheric extinction. */
export function nightSkyVisibility(celestial: CelestialState, weather: WeatherState, flash = 0) {
  const moon = celestial.moonIllumination * THREE.MathUtils.smoothstep(celestial.moon.altitude, 0, .42);
  const atmosphere = celestial.night * (1 - THREE.MathUtils.smoothstep(weather.cloudCover, .32, .98))
    * (1 - weather.precipitation * .8) * weather.visibility * (1 - THREE.MathUtils.clamp(flash, 0, 1) * .95);
  return { stars: atmosphere * (1 - moon * .48), galaxy: atmosphere * (1 - moon * .88), moon };
}

function hash(x: number, y: number, z: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2147483647);
  n = Math.imul(n ^ n >>> 13, 1274126177);
  return ((n ^ n >>> 16) >>> 0) / 4294967295;
}
function noise(x: number, y: number, z: number) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx *= fx * (3 - 2 * fx); fy *= fy * (3 - 2 * fy); fz *= fz * (3 - 2 * fz);
  const mix = THREE.MathUtils.lerp;
  return mix(mix(mix(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx), mix(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx), fy),
    mix(mix(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx), mix(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}

/** Original, seamless spherical dust/density map; generated once, not per frame. */
export function createGalacticTexture() {
  const width = 512, height = 256, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const b = ((y + .5) / height - .5) * Math.PI, cb = Math.cos(b), sb = Math.sin(b);
    for (let x = 0; x < width; x++) {
      const l = ((x + .5) / width - .5) * TAU;
      const px = cb * Math.cos(l), py = cb * Math.sin(l);
      const n = noise(px * 6 + 21, py * 6 + 13, sb * 9 + 9);
      const fine = noise(px * 25 + 11, py * 25 + 30, sb * 41 + 17);
      const grain = noise(px * 71 + 7, py * 71 + 3, sb * 91 + 41);
      const offset = b - .018 * Math.sin(l * 4) - .009 * Math.sin(l * 11);
      const band = Math.exp(-Math.pow(offset / (.075 + .045 * n), 2));
      const halo = Math.exp(-Math.pow(offset / .25, 2));
      const core = Math.exp(-Math.pow(Math.atan2(Math.sin(l), Math.cos(l)) / .52, 2) - Math.pow(b / .2, 2));
      const lane = Math.exp(-Math.pow((offset + .012 * Math.sin(l * 7)) / (.022 + .025 * fine), 2));
      const dust = 1 - lane * (.5 + .35 * n);
      const density = Math.min(1, (halo * .06 + band * (.12 + .58 * Math.pow(n, 1.4) + .32 * Math.pow(fine, 1.6) + .12 * grain) + core * .28) * dust);
      const index = (y * width + x) * 4, warm = core * .22;
      pixels[index] = Math.round(density * (140 + warm * 110));
      pixels[index + 1] = Math.round(density * (174 + warm * 40));
      pixels[index + 2] = Math.round(density * (216 - warm * 45)); pixels[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height);
  texture.name = "original-galactic-dust-density";
  texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true; texture.needsUpdate = true;
  return texture;
}

// Bright anchors use J2000 RA/Dec. Fainter stars are an original seeded field,
// not an astrometric catalogue. The complete sphere rotates as one fixed world.
const anchors = [
  [37.955, 89.264, .75], [279.235, 38.784, 1], [310.358, 45.280, .85], [297.696, 8.868, .95],
  [213.915, 19.182, 1], [79.172, 45.998, .95], [101.287, -16.716, 1], [95.988, -52.696, .9],
  [88.793, 7.407, .88], [78.634, -8.202, .9], [68.980, 16.509, .84], [24.429, -57.237, .82],
  [114.825, 5.225, .86], [201.298, -11.161, .85], [247.352, -26.432, .86], [344.413, -29.622, .85],
  [116.329, 28.026, .8], [186.650, -63.099, .82], [104.656, -28.972, .8], [31.793, 23.462, .76],
] as const;

export function createNightSky(location: CalendarLocation = DEFAULT_LOCATION) {
  const random = createSeededRandom(942031), positions: number[] = [], styles: number[] = [], colors: number[] = [];
  const galactic = new THREE.Matrix3().set(...EQUATORIAL_TO_GALACTIC), galacticInverse = galactic.clone().transpose();
  const direction = new THREE.Vector3();
  for (let index = 0; index < STAR_COUNT; index++) {
    let brightness: number, size: number;
    if (index < anchors.length) {
      const [ra, dec, value] = anchors[index];
      direction.set(Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD));
      brightness = value; size = 2.25 + value * .65;
    } else {
      const longitude = random() * TAU;
      if (random() < .42) {
        const b = (random() + random() + random() - 1.5) * .25;
        direction.set(Math.cos(b) * Math.cos(longitude), Math.cos(b) * Math.sin(longitude), Math.sin(b)).applyMatrix3(galacticInverse);
      } else {
        const z = random() * 2 - 1, r = Math.sqrt(1 - z * z);
        direction.set(r * Math.cos(longitude), r * Math.sin(longitude), z);
      }
      // A stable pixel footprint survives the full room view and low-DPR phones;
      // variation comes from both intensity and size, rather than subpixel loss.
      brightness = .15 + Math.pow(random(), 2.4) * .71;
      size = 1.45 + Math.pow(random(), 3) * 1.05;
    }
    positions.push(direction.x * 280, direction.y * 280, direction.z * 280);
    styles.push(size, brightness);
    const warmth = random(); colors.push(.69 + warmth * .25, .8 + warmth * .11, 1 - warmth * .17);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("starStyle", new THREE.Float32BufferAttribute(styles, 2));
  geometry.setAttribute("starColor", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { opacity: { value: 0 }, pixelScale: { value: 1 } },
    vertexShader: `attribute vec2 starStyle;attribute vec3 starColor;
      varying vec3 vStarColor;varying float vStarAlpha;uniform float pixelScale;
      void main(){vec3 direction=normalize(mat3(modelMatrix)*position);
        vStarColor=starColor;vStarAlpha=starStyle.y*smoothstep(-.015,.12,direction.y);
        gl_PointSize=starStyle.x*pixelScale;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);
      }`,
    fragmentShader: `uniform float opacity;varying vec3 vStarColor;varying float vStarAlpha;
      void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.)discard;
        float alpha=opacity*vStarAlpha*exp(-r*1.25)*(1.-smoothstep(.6,1.,r));
        gl_FragColor=vec4(vStarColor,alpha);
        #include <colorspace_fragment>
      }`,
  });
  const stars = new THREE.Points(geometry, material); stars.name = "quiet-night-stars";
  stars.renderOrder = -9; stars.matrixAutoUpdate = false; stars.frustumCulled = false;
  stars.onBeforeRender = renderer => { material.uniforms.pixelScale.value = Math.min(1.8, renderer.getPixelRatio()); };
  const galaxyMap = createGalacticTexture(), worldToGalactic = new THREE.Matrix3(), frame = new Float64Array(9), rotation = new THREE.Matrix3(), inverse = new THREE.Matrix3();
  const galaxyStrength = { value: 0 };
  let disposed = false;
  return {
    stars, galaxyMap, worldToGalactic, galaxyStrength,
    update(celestial: CelestialState, weather: WeatherState, timestamp: number, low: boolean, flash: number) {
      if (disposed) return;
      equatorialFrame(timestamp, location, frame);
      rotation.fromArray(frame);
      worldToGalactic.copy(galactic).multiply(inverse.copy(rotation).transpose());
      stars.matrix.set(frame[0], frame[3], frame[6], 0, frame[1], frame[4], frame[7], -8, frame[2], frame[5], frame[8], 0, 0, 0, 0, 1);
      stars.matrixWorldNeedsUpdate = true;
      const visibility = nightSkyVisibility(celestial, weather, flash);
      material.uniforms.opacity.value = visibility.stars;
      galaxyStrength.value = visibility.galaxy * .09;
      geometry.setDrawRange(0, low ? LOW_STAR_COUNT : STAR_COUNT);
      // Keep zero-opacity objects in warmup; never allocate a reveal-time shader.
      stars.userData.visibility = visibility.stars;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stars.removeFromParent(); geometry.dispose(); material.dispose(); galaxyMap.dispose();
    },
  };
}
