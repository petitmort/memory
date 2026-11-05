import * as THREE from "three";
import { DEFAULT_LOCATION, createSeededRandom, type CalendarLocation } from "./calendar-seed";
import { greenwichSiderealAngle, type CelestialState, type Direction3 } from "./celestial-controller";
import type { WeatherState } from "./weather-controller";

const RAD = Math.PI / 180, TAU = Math.PI * 2;
export const STAR_COUNT = 18000, LOW_STAR_COUNT = 7000;
/** One gentle visual revolution in 24 minutes, in addition to real sidereal drift. */
export const SKY_DRIFT_PERIOD_MS = 24 * 60 * 1000;
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
export function equatorialFrame(timestamp: number, location: CalendarLocation = DEFAULT_LOCATION, out = new Float64Array(9), drift = 0) {
  const theta = greenwichSiderealAngle(timestamp) + location.longitude * RAD + drift;
  const latitude = location.latitude * RAD, yaw = location.northYaw ?? 0;
  const st = Math.sin(theta), ct = Math.cos(theta), sp = Math.sin(latitude), cp = Math.cos(latitude);
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  out[0] = -cy * st + sy * sp * ct; out[1] = cp * ct; out[2] = sy * st + cy * sp * ct;
  out[3] = cy * ct + sy * sp * st; out[4] = cp * st; out[5] = -sy * ct + cy * sp * st;
  out[6] = -sy * cp; out[7] = sp; out[8] = -cy * cp;
  return out;
}

/**
 * The whole stellar sphere shares one calendar-derived presentation phase.
 * Modulo wraps only the angle, so midnight, refresh and pauses cannot restart
 * the motion. Sun, moon, weather and the geographic pole retain their clocks.
 */
export function nightSkyFrame(timestamp: number, location: CalendarLocation = DEFAULT_LOCATION, out = new Float64Array(9), reduced = false, motionTimestamp = timestamp) {
  const phase = reduced ? 0 : ((motionTimestamp % SKY_DRIFT_PERIOD_MS + SKY_DRIFT_PERIOD_MS) % SKY_DRIFT_PERIOD_MS) / SKY_DRIFT_PERIOD_MS * TAU;
  return equatorialFrame(timestamp, location, out, phase);
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

/**
 * Original spherical star clouds, extinction and unresolved stars. All noise is
 * sampled in 3D so the longitude seam closes; detail is baked once, keeping the
 * existing sky draw and shared stellar rotation on every drawn frame.
 */
export function createGalacticTexture() {
  const width = 2048, height = 1024, pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const b = ((y + .5) / height - .5) * Math.PI, cb = Math.cos(b), sb = Math.sin(b);
    for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      // Alpha is a separate fine-grain tile, sampled at a higher angular
      // frequency than RGB. Baking bright speckles into RGB would magnify them
      // into blurry discs when seen through the close room window.
      pixels[index + 3] = Math.round(255 * Math.pow(hash(x === width - 1 ? 0 : x, y === height - 1 ? 0 : y, 7919), 3));
      if (Math.abs(b) > .72) continue; // The rounded RGB tail is already black.
      const l = ((x + .5) / width - .5) * TAU;
      const px = cb * Math.cos(l), py = cb * Math.sin(l);
      const broad = noise(px * 6 + 21, py * 6 + 13, sb * 8 + 9);
      const bend = noise(px * 11 + 9, py * 11 + 37, sb * 13 + 22);
      // Domain warping gives star banks ragged, non-parallel edges. Their width
      // changes with longitude instead of being two Gaussian luminous rails.
      const qx = px * 16 + broad * 3, qy = py * 16 + bend * 3, qz = sb * 24;
      const cloud = noise(qx + 31, qy + 17, qz + 5);
      const medium = noise(qx * 2.6 + 8, qy * 2.6 + 29, qz * 2.2 + 11);
      const fine = noise(px * 117 + 7, py * 117 + 3, sb * 151 + 41);
      const filament = noise(qx * 4.7 + medium * 2, qy * 4.7 + cloud * 2, qz * 3.9 + 19);
      const offset = b + (broad - .5) * .12 + (bend - .5) * .07;
      const band = Math.exp(-Math.pow(offset / (.1 + broad * .12), 2));
      const halo = Math.exp(-Math.pow(b / .31, 2));
      const core = Math.exp(-Math.pow(l / .62, 2) - Math.pow((b + .025) / .23, 2));
      const cloudLight = Math.pow(cloud * .5 + medium * .32 + fine * .18, 2.1);
      // A branching rift has broad knots, torn edges and holes, not a sine-wave
      // cut running unbroken around the whole sphere. Small foreground stars
      // remain in the independent point layer, including in front of dark dust.
      const rift = Math.exp(-Math.pow((offset + (cloud - .5) * .14) / (.018 + medium * .045), 2));
      const knots = THREE.MathUtils.smoothstep(bend * .35 + medium * .4 + filament * .25, .38, .76);
      const veins = Math.exp(-Math.pow((filament - .5) / .105, 2));
      const opticalDepth = band * (rift * (1.1 + cloud * 1.8) + knots * 2.1 + veins * knots * .9);
      const glow = halo * .021 + band * (.025 + cloudLight * 1.75) * (.65 + broad * .65) + core * (.14 + cloudLight * .45);
      // Warm inner star clouds, cooler outskirts; dust reddens transmitted light.
      const warm = core * .68 + cloud * .12;
      pixels[index] = Math.round(Math.min(255, glow * (165 + warm * 85) * Math.exp(-opticalDepth * .86)));
      pixels[index + 1] = Math.round(Math.min(255, glow * (181 + warm * 31) * Math.exp(-opticalDepth)));
      pixels[index + 2] = Math.round(Math.min(255, glow * (216 - warm * 42) * Math.exp(-opticalDepth * 1.14)));
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
  const galaxyMap = createGalacticTexture(), map = galaxyMap.image;
  const galactic = new THREE.Matrix3().set(...EQUATORIAL_TO_GALACTIC), galacticInverse = galactic.clone().transpose();
  const direction = new THREE.Vector3();
  for (let index = 0; index < STAR_COUNT; index++) {
    let brightness: number, size: number;
    if (index < anchors.length) {
      const [ra, dec, value] = anchors[index];
      direction.set(Math.cos(dec * RAD) * Math.cos(ra * RAD), Math.cos(dec * RAD) * Math.sin(ra * RAD), Math.sin(dec * RAD));
      brightness = value; size = 2.25 + value * .65;
    } else {
      // Interleaving preserves a bright/faint mix in the low-quality prefix.
      // Fainter distant stars follow the cloudy banks and their extinction;
      // bright foreground anchors are allowed in front of the dust lanes.
      const faint = index % 3 !== 0;
      if (random() < (faint ? .84 : .6)) {
        let longitude = 0, b = 0;
        for (let attempt = 0; attempt < (faint ? 5 : 1); attempt++) {
          longitude = (random() - .5) * TAU;
          b = (random() + random() + random() - 1.5) * .22;
          const x = Math.min(map.width - 1, Math.floor((longitude / TAU + .5) * map.width));
          const y = Math.min(map.height - 1, Math.floor((b / Math.PI + .5) * map.height));
          const i = (y * map.width + x) * 4;
          const density = (map.data[i] + map.data[i + 1] + map.data[i + 2]) / 765;
          if (!faint || random() * .3 < density) break;
        }
        direction.set(Math.cos(b) * Math.cos(longitude), Math.cos(b) * Math.sin(longitude), Math.sin(b)).applyMatrix3(galacticInverse);
      } else {
        const longitude = random() * TAU, z = random() * 2 - 1, r = Math.sqrt(1 - z * z);
        direction.set(r * Math.cos(longitude), r * Math.sin(longitude), z);
      }
      // A stable pixel footprint survives the full room view and low-DPR phones;
      // variation comes from both intensity and size, rather than subpixel loss.
      brightness = faint ? .09 + Math.pow(random(), 3.6) * .32 : .24 + Math.pow(random(), 2.6) * .76;
      size = faint ? 1.05 + Math.pow(random(), 3) * .55 : 1.55 + Math.pow(random(), 3) * 1.1;
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
  const worldToGalactic = new THREE.Matrix3(), frame = new Float64Array(9), rotation = new THREE.Matrix3(), inverse = new THREE.Matrix3();
  const galaxyStrength = { value: 0 };
  let disposed = false;
  return {
    stars, galaxyMap, worldToGalactic, galaxyStrength,
    update(celestial: CelestialState, weather: WeatherState, timestamp: number, low: boolean, flash: number, reduced = false, motionTimestamp = timestamp) {
      if (disposed) return;
      nightSkyFrame(timestamp, location, frame, reduced, motionTimestamp);
      rotation.fromArray(frame);
      worldToGalactic.copy(galactic).multiply(inverse.copy(rotation).transpose());
      stars.matrix.set(frame[0], frame[3], frame[6], 0, frame[1], frame[4], frame[7], -8, frame[2], frame[5], frame[8], 0, 0, 0, 0, 1);
      stars.matrixWorldNeedsUpdate = true;
      const visibility = nightSkyVisibility(celestial, weather, flash);
      material.uniforms.opacity.value = visibility.stars * 1.4;
      galaxyStrength.value = visibility.galaxy * .135;
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
