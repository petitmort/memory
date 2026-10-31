import * as THREE from "three";
import { calendarAt, createSeededRandom, positiveModulo, seedFromString } from "./calendar-seed";

export const WEATHER_KINDS = ["clear", "few-clouds", "cloudy", "overcast", "light-rain", "rain", "heavy-rain", "light-snow", "snow"] as const;
export type WeatherKind = typeof WEATHER_KINDS[number];
export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: "晴天", "few-clouds": "少云", cloudy: "多云", overcast: "阴天",
  "light-rain": "小雨", rain: "中雨", "heavy-rain": "大雨", "light-snow": "小雪", snow: "中雪",
};
export type WeatherState = {
  kind: WeatherKind;
  cloudCover: number;
  precipitation: number;
  /** Fraction of precipitation that falls as snow, not a separate on/off switch. */
  snow: number;
  windSpeed: number;
  windDirection: number;
  visibility: number;
  waveScale: number;
  simulated: true;
};
export type WeatherOptions = { kind?: WeatherKind; cloudCover?: number; windSpeed?: number; seed?: number; timeZone?: string };
const clamp = (value: number, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
// cover, precipitation, snow fraction, wind m/s, visibility, wave multiplier
const profiles: Record<WeatherKind, readonly number[]> = {
  clear: [.035, 0, 0, 2.1, 1, .88], "few-clouds": [.23, 0, 0, 2.8, .96, .96],
  cloudy: [.58, 0, 0, 3.6, .86, 1.04], overcast: [.94, 0, 0, 4.1, .69, 1.09],
  "light-rain": [.77, .23, 0, 4.2, .72, 1.12], rain: [.94, .53, 0, 5.7, .56, 1.22],
  "heavy-rain": [1, 1, 0, 8.1, .36, 1.42], "light-snow": [.86, .26, 1, 2.2, .62, 1.02], snow: [.98, .57, 1, 3.1, .43, 1.09],
};
const seasonalWeights = {
  spring: [.22, .26, .23, .12, .11, .045, .014, .0009, .0001],
  summer: [.63, .22, .08, .025, .025, .015, .005, 0, 0],
  autumn: [.36, .29, .15, .08, .075, .035, .01, 0, 0],
  winter: [.12, .17, .19, .29, .15, .06, .015, .004, .001],
} as const;

function profile(kind: WeatherKind, windDirection: number): WeatherState {
  const p = profiles[kind];
  return { kind, cloudCover: p[0], precipitation: p[1], snow: p[2], windSpeed: p[3], windDirection, visibility: p[4], waveScale: p[5], simulated: true };
}

function daily(timestamp: number, timeZone: string, seed: number) {
  const date = calendarAt(timestamp, timeZone);
  const random = createSeededRandom(seedFromString(`aegean-weather:${date.dayKey}:${seed}`));
  const weights = seasonalWeights[date.season];
  let roll = random() * weights.reduce<number>((sum, value) => sum + value, 0), index = 0;
  for (; index < weights.length - 1 && roll > weights[index]; index++) roll -= weights[index];
  const state = profile(WEATHER_KINDS[index], .42 + random() * .9);
  state.windSpeed *= .85 + random() * .3;
  return { date, state };
}

/** Blend the same state for clouds, water, light, precipitation and navigation. */
export function blendWeather(from: WeatherState, to: WeatherState, amount: number): WeatherState {
  const a = clamp(amount), mix = (x: number, y: number) => x + (y - x) * a;
  const angle = positiveModulo(to.windDirection - from.windDirection + Math.PI, Math.PI * 2) - Math.PI;
  return {
    kind: a < .5 ? from.kind : to.kind,
    cloudCover: mix(from.cloudCover, to.cloudCover), precipitation: mix(from.precipitation, to.precipitation),
    snow: mix(from.snow, to.snow), windSpeed: mix(from.windSpeed, to.windSpeed),
    windDirection: from.windDirection + angle * a,
    visibility: mix(from.visibility, to.visibility), waveScale: mix(from.waveScale, to.waveScale), simulated: true,
  };
}

/** Date-seeded simulation, never a forecast or a request to a weather service. */
export function sampleWeather(timestampMs: number, options: WeatherOptions = {}): WeatherState {
  const zone = options.timeZone ?? "Europe/Athens", seed = options.seed ?? 761031;
  const current = daily(timestampMs, zone, seed);
  const previous = daily(timestampMs - (current.date.secondsOfDay + 43200) * 1000, zone, seed);
  // Midnight is a smooth handover, including a browser opened halfway through it.
  let state = blendWeather(previous.state, current.state, smooth(current.date.secondsOfDay / 3600));
  const fraction = current.date.secondsOfDay / 86400;
  const envelope = Math.sin(Math.PI * fraction) ** 2;
  const variation = Math.sin(timestampMs / 1000 / 5200 + current.date.seed * .00001) * envelope;
  state.cloudCover = clamp(state.cloudCover + variation * .035);
  state.windSpeed = Math.max(.4, state.windSpeed + variation * .35);
  if (options.kind) state = profile(options.kind, state.windDirection);
  if (options.cloudCover !== undefined && Number.isFinite(options.cloudCover)) state.cloudCover = clamp(options.cloudCover);
  if (options.windSpeed !== undefined && Number.isFinite(options.windSpeed)) state.windSpeed = clamp(options.windSpeed, 0, 20);
  return state;
}

export const PRECIPITATION_BOUNDS = { minX: -54, maxX: 54, minY: -8.3, maxY: 20, minZ: -82.5, maxZ: -8.5 } as const;
const RAIN_CAPACITY = 1500, SNOW_CAPACITY = 420;
type ParticleSeed = { x: number; z: number; phase: number; cycles: number; sway: number };
function particleSeed(index: number, snow: boolean): ParticleSeed {
  const random = createSeededRandom((index + 1) * 91648253 + (snow ? 7531 : 1987));
  return { x: random() * 108, z: random() * 74, phase: random(), cycles: snow ? 50 + Math.floor(random() * 46) : 1200 + Math.floor(random() * 601), sway: random() * Math.PI * 2 };
}
function writeParticle(seed: ParticleSeed, timestampMs: number, snow: boolean, windSpeed: number, windDirection: number, reduced: boolean, out: Float32Array | number[], offset: number) {
  const time = positiveModulo(timestampMs / 1000, 4096) / 4096;
  // Integer cycles make this long clock wrap continuous, including after sleep.
  const cycles = reduced ? Math.max(1, Math.round(seed.cycles * .35)) : seed.cycles;
  const fall = positiveModulo(time * cycles + seed.phase, 1);
  const sway = snow ? Math.sin(fall * 8 + seed.sway) * .7 : 0;
  const drift = windSpeed * (snow ? 1.15 : .48) * fall;
  out[offset] = positiveModulo(seed.x + Math.cos(windDirection) * drift + sway, 108) - 54;
  out[offset + 1] = 20 - fall * 28.3;
  out[offset + 2] = -8.5 - positiveModulo(seed.z + Math.sin(windDirection) * drift + sway * .4, 74);
}

/** The renderer and bounds tests use this same physical outdoor position model. */
export function samplePrecipitation(index: number, timestampMs: number, snow: boolean, windSpeed = 4, windDirection = .7, reduced = false): [number, number, number] {
  const position: [number, number, number] = [0, 0, 0];
  writeParticle(particleSeed(index, snow), timestampMs, snow, windSpeed, windDirection, reduced, position, 0);
  return position;
}

/** Two preallocated buffers; no timers, camera, renderer or new objects per drop. */
export function createWeatherController() {
  const group = new THREE.Group(); group.name = "outdoor-simulated-weather";
  const rainPositions = new Float32Array(RAIN_CAPACITY * 6), snowPositions = new Float32Array(SNOW_CAPACITY * 3);
  const rainGeometry = new THREE.BufferGeometry(), snowGeometry = new THREE.BufferGeometry();
  const rainAttribute = new THREE.BufferAttribute(rainPositions, 3).setUsage(THREE.DynamicDrawUsage);
  const snowAttribute = new THREE.BufferAttribute(snowPositions, 3).setUsage(THREE.DynamicDrawUsage);
  rainGeometry.setAttribute("position", rainAttribute); snowGeometry.setAttribute("position", snowAttribute);
  const bounds = new THREE.Box3(new THREE.Vector3(-60, -9, -85), new THREE.Vector3(60, 23, -8));
  for (const geometry of [rainGeometry, snowGeometry]) {
    geometry.boundingBox = bounds.clone(); geometry.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
    // Keep one transparent primitive available to the scene's normal prewarm.
    geometry.setDrawRange(0, geometry === rainGeometry ? 2 : 1);
  }
  const rainMaterial = new THREE.LineBasicMaterial({ color: "#b9d0db", transparent: true, opacity: 0, depthWrite: false, fog: true });
  const snowMaterial = new THREE.PointsMaterial({ color: "#e5edf2", size: .075, transparent: true, opacity: 0, depthWrite: false, fog: true, sizeAttenuation: true });
  snowMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <map_particle_fragment>", "#include <map_particle_fragment>\ndiffuseColor.a*=1.-smoothstep(.18,.5,length(gl_PointCoord-vec2(.5)));" );
  };
  snowMaterial.customProgramCacheKey = () => "soft-outdoor-snow-v1";
  const rain = new THREE.LineSegments(rainGeometry, rainMaterial), snow = new THREE.Points(snowGeometry, snowMaterial);
  rain.name = "outdoor-rain"; snow.name = "outdoor-snow";
  group.add(rain, snow);
  const rainSeeds = Array.from({ length: RAIN_CAPACITY }, (_, i) => particleSeed(i, false));
  const snowSeeds = Array.from({ length: SNOW_CAPACITY }, (_, i) => particleSeed(i, true));
  let disposed = false;
  return {
    group,
    update(timestampMs: number, state: WeatherState, low: boolean, reduced: boolean, daylight: number) {
      if (disposed) return;
      const rainAmount = state.precipitation * (1 - state.snow), snowAmount = state.precipitation * state.snow;
      const rainCount = Math.max(1, Math.round((low ? 430 : RAIN_CAPACITY) * rainAmount));
      const snowCount = Math.max(1, Math.round((low ? 140 : SNOW_CAPACITY) * snowAmount));
      const windX = Math.cos(state.windDirection) * state.windSpeed * .48;
      const windZ = Math.sin(state.windDirection) * state.windSpeed * .48;
      for (let i = 0; i < rainCount; i++) {
        const offset = i * 6;
        writeParticle(rainSeeds[i], timestampMs, false, state.windSpeed, state.windDirection, reduced, rainPositions, offset);
        const length = .75 + (i % 7) * .13;
        rainPositions[offset + 3] = rainPositions[offset] - windX / 28.3 * length;
        rainPositions[offset + 4] = Math.min(22, rainPositions[offset + 1] + length);
        rainPositions[offset + 5] = Math.min(-8.2, rainPositions[offset + 2] - windZ / 28.3 * length);
      }
      for (let i = 0; i < snowCount; i++) writeParticle(snowSeeds[i], timestampMs, true, state.windSpeed, state.windDirection, reduced, snowPositions, i * 3);
      rainGeometry.setDrawRange(0, rainCount * 2); snowGeometry.setDrawRange(0, snowCount);
      rainAttribute.clearUpdateRanges(); rainAttribute.addUpdateRange(0, rainCount * 6); rainAttribute.needsUpdate = true;
      snowAttribute.clearUpdateRanges(); snowAttribute.addUpdateRange(0, snowCount * 3); snowAttribute.needsUpdate = true;
      rainMaterial.opacity = rainAmount * (.14 + clamp(daylight) * .17);
      snowMaterial.opacity = snowAmount * (.38 + clamp(daylight) * .4);
      group.userData.rainCount = rainAmount > 0 ? rainCount : 0;
      group.userData.snowCount = snowAmount > 0 ? snowCount : 0;
      group.userData.simulated = true;
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent();
      rainGeometry.dispose(); snowGeometry.dispose(); rainMaterial.dispose(); snowMaterial.dispose(); group.clear();
    },
  };
}
