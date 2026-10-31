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

/** Weather is a simulated world clock, independent of the visitor's location. */
export const WEATHER_FRONT_HOUR = 3600000;
const FRONT_JITTER = 14 * 60000;
const frontTargets = new Map<string, WeatherState>();
const variants: Record<WeatherKind, readonly (readonly [WeatherKind, number])[]> = {
  clear: [["clear", .88], ["few-clouds", .105], ["cloudy", .015]],
  "few-clouds": [["clear", .12], ["few-clouds", .7], ["cloudy", .16], ["light-rain", .02]],
  cloudy: [["few-clouds", .18], ["cloudy", .56], ["overcast", .18], ["light-rain", .07], ["rain", .01]],
  overcast: [["cloudy", .16], ["overcast", .54], ["light-rain", .19], ["rain", .09], ["heavy-rain", .02]],
  "light-rain": [["cloudy", .1], ["overcast", .2], ["light-rain", .46], ["rain", .2], ["heavy-rain", .04]],
  rain: [["overcast", .06], ["light-rain", .18], ["rain", .59], ["heavy-rain", .17]],
  "heavy-rain": [["light-rain", .08], ["rain", .28], ["heavy-rain", .64]],
  "light-snow": [["overcast", .2], ["light-snow", .65], ["snow", .15]],
  snow: [["overcast", .08], ["light-snow", .28], ["snow", .64]],
};

function frontBoundary(index: number, seed: number): number {
  const random = createSeededRandom(seedFromString(`aegean-front-boundary:${seed}:${index}`));
  // Bounded jitter guarantees increasing anchors 32–88 minutes apart, without
  // walking an unbounded Markov chain when a page resumes or refreshes.
  return index * WEATHER_FRONT_HOUR + Math.round((random() * 2 - 1) * FRONT_JITTER);
}

function frontTarget(index: number, timeZone: string, seed: number): WeatherState {
  const key = `${timeZone}/${seed}/${index}`;
  const cached = frontTargets.get(key);
  if (cached) return cached;
  const start = frontBoundary(index, seed);
  const base = daily(start + 20 * 60000, timeZone, seed);
  const random = createSeededRandom(seedFromString(`aegean-front-target:${seed}:${index}`));
  let roll = random(), kind = base.state.kind;
  for (const [candidate, weight] of variants[base.state.kind]) {
    kind = candidate;
    if (roll < weight) break;
    roll -= weight;
  }
  const state = profile(kind, base.state.windDirection + (random() - .5) * .2);
  state.windSpeed *= .85 + random() * .3;
  // The Aegean can be windy under a clear sky (summer Meltemi). A dry gust
  // must not manufacture rain or snow just to produce wind and rougher water.
  if (base.date.season === "summer" && !state.precipitation && random() < .12)
    state.windSpeed = 6.5 + random() * 4;
  state.waveScale = Math.max(state.waveScale, .83 + state.windSpeed * .055);
  if (frontTargets.size >= 96) frontTargets.delete(frontTargets.keys().next().value!);
  frontTargets.set(key, state);
  return state;
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

/**
 * A front has causal stages: cloud/wind gather before rain arrives; rain stops
 * before clouds clear. Each channel has zero derivative at its stage edges.
 * Wet/wet rain and snow amounts mix by mass. At a dry endpoint the snow
 * fraction also fades continuously, keeping the cold lighting tint smooth.
 */
export function transitionWeather(from: WeatherState, to: WeatherState, progress: number): WeatherState {
  const p = clamp(progress);
  if (p === 0) return { ...from };
  if (p === 1) return { ...to };
  const wetting = to.precipitation > from.precipitation;
  const drying = to.precipitation < from.precipitation;
  const precipitation = smooth(wetting ? (p - .38) / .62 : drying ? p / .6 : p);
  const cover = smooth(wetting ? p / .55 : drying ? (p - .35) / .65 : p);
  const wind = smooth(wetting ? (p - .05) / .7 : drying ? (p - .15) / .85 : p);
  const visibility = smooth(wetting ? (p - .1) / .9 : drying ? (p - .22) / .78 : p);
  const state = blendWeather(from, to, smooth(p));
  state.cloudCover = from.cloudCover + (to.cloudCover - from.cloudCover) * cover;
  state.windSpeed = from.windSpeed + (to.windSpeed - from.windSpeed) * wind;
  state.visibility = from.visibility + (to.visibility - from.visibility) * visibility;
  const rain = from.precipitation * (1 - from.snow) * (1 - precipitation) + to.precipitation * (1 - to.snow) * precipitation;
  const snow = from.precipitation * from.snow * (1 - precipitation) + to.precipitation * to.snow * precipitation;
  state.precipitation = rain + snow;
  state.snow = from.precipitation > 0 && to.precipitation > 0
    ? snow / state.precipitation : from.snow + (to.snow - from.snow) * smooth(p);
  if (state.precipitation > .04) state.kind = state.snow > .5
    ? (state.precipitation > .4 ? "snow" : "light-snow")
    : (state.precipitation > .75 ? "heavy-rain" : state.precipitation > .36 ? "rain" : "light-rain");
  else state.kind = state.cloudCover > .76 ? "overcast" : state.cloudCover > .4 ? "cloudy" : state.cloudCover > .12 ? "few-clouds" : "clear";
  return state;
}

export type WeatherFront = {
  startedAt: number;
  settledAt: number;
  nextAt: number;
  progress: number;
  fromKind: WeatherKind;
  toKind: WeatherKind;
  phase: "settled" | "gathering" | "rain-arriving" | "rain-clearing" | "clearing" | "cloud-transition";
};

function frontAt(timestampMs: number, timeZone: string, seed: number) {
  if (!Number.isFinite(timestampMs)) throw new RangeError("The weather timestamp must be finite.");
  let index = Math.floor(timestampMs / WEATHER_FRONT_HOUR);
  if (timestampMs < frontBoundary(index, seed)) index--;
  else if (timestampMs >= frontBoundary(index + 1, seed)) index++;
  const startedAt = frontBoundary(index, seed), nextAt = frontBoundary(index + 1, seed);
  const random = createSeededRandom(seedFromString(`aegean-front-duration:${seed}:${index}`));
  const settledAt = startedAt + (6 + random() * 4) * 60000;
  const progress = clamp((timestampMs - startedAt) / (settledAt - startedAt));
  const from = frontTarget(index - 1, timeZone, seed), to = frontTarget(index, timeZone, seed);
  return { from, to, startedAt, settledAt, nextAt, progress };
}

/** Metadata is only for optional developer diagnostics, never a real forecast. */
export function sampleWeatherFront(timestampMs: number, options: WeatherOptions = {}): WeatherFront {
  const front = frontAt(timestampMs, options.timeZone ?? "Europe/Athens", options.seed ?? 761031);
  const { startedAt, settledAt, nextAt, progress, from, to } = front;
  const phase: WeatherFront["phase"] = options.kind || progress === 1 ? "settled"
    : to.precipitation > from.precipitation ? (progress < .38 ? "gathering" : "rain-arriving")
      : to.precipitation < from.precipitation ? (progress < .6 ? "rain-clearing" : "clearing") : "cloud-transition";
  return { startedAt, settledAt, nextAt, progress: options.kind ? 1 : progress,
    fromKind: options.kind ?? from.kind, toKind: options.kind ?? to.kind, phase };
}

/** Date/season-seeded simulated fronts; never a local weather service request. */
export function sampleWeather(timestampMs: number, options: WeatherOptions = {}): WeatherState {
  const zone = options.timeZone ?? "Europe/Athens", seed = options.seed ?? 761031;
  const front = frontAt(timestampMs, zone, seed);
  let state = transitionWeather(front.from, front.to, front.progress);
  // Small aperiodic-looking gusts continue inside a settled front. Absolute
  // time preserves their phase through refresh, midnight, DST and sleep.
  const time = timestampMs / 1000;
  state.cloudCover = clamp(state.cloudCover + Math.sin(time / 1373 + seed) * .008);
  state.windSpeed = Math.max(.4, state.windSpeed + Math.sin(time / 137 + seed) * .2 + Math.sin(time / 379) * .17);
  if (options.kind) state = profile(options.kind, state.windDirection);
  if (options.cloudCover !== undefined && Number.isFinite(options.cloudCover)) state.cloudCover = clamp(options.cloudCover);
  if (options.windSpeed !== undefined && Number.isFinite(options.windSpeed)) {
    state.windSpeed = clamp(options.windSpeed, 0, 20);
    // A dry gale changes the same wave field used by boats. Its 1.084 m
    // amplitude bound × 1.6 stays inside the ocean's existing ±1.8 m bounds.
    state.waveScale = Math.max(state.waveScale, Math.min(1.6, .83 + state.windSpeed * .055));
  }
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
