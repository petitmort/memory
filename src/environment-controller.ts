import * as THREE from "three";
import { timestampForLocalClock } from "./calendar-seed";
import { calculateCelestial, type CelestialState, type Direction3 } from "./celestial-controller";
import { createCloudController } from "./cloud-controller";
import { createEnvironmentDebug, readEnvironmentOptions } from "./environment-debug";
import { createEnvironmentSky } from "./environment-sky";
import { blendWeather, createWeatherController, sampleWeather } from "./weather-controller";
import type { createVesselController } from "./vessel-controller";

type Bindings = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  ambient: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  fill: THREE.DirectionalLight;
  ocean: THREE.ShaderMaterial;
  sunGroup: THREE.Group;
  vessels: ReturnType<typeof createVesselController>;
  invalidate: () => void;
  quality: (value?: boolean) => void;
};
const lerp = THREE.MathUtils.lerp;
function interpolateCelestial(a: CelestialState, b: CelestialState, f: number): CelestialState {
  const direction = (x: Direction3, y: Direction3): Direction3 => {
    const result = x.map((v, i) => lerp(v, y[i], f)) as Direction3;
    const length = Math.hypot(...result); return result.map(v => v / length) as Direction3;
  };
  const angle = (x: number, y: number) => x + Math.atan2(Math.sin(y - x), Math.cos(y - x)) * f;
  return {
    ...a,
    sun: { altitude: lerp(a.sun.altitude, b.sun.altitude, f), azimuth: angle(a.sun.azimuth, b.sun.azimuth), direction: direction(a.sun.direction, b.sun.direction) },
    moon: { altitude: lerp(a.moon.altitude, b.moon.altitude, f), azimuth: angle(a.moon.azimuth, b.moon.azimuth), direction: direction(a.moon.direction, b.moon.direction) },
    moonPhase: ((angle(a.moonPhase * Math.PI * 2, b.moonPhase * Math.PI * 2) / (Math.PI * 2)) % 1 + 1) % 1,
    moonLightDirection: direction(a.moonLightDirection, b.moonLightDirection),
    moonIllumination: lerp(a.moonIllumination, b.moonIllumination, f),
    daylight: lerp(a.daylight, b.daylight, f), twilight: lerp(a.twilight, b.twilight, f), night: lerp(a.night, b.night, f),
  };
}

/** One adapter driven only by the existing scene's actual drawn frames. */
export function createEnvironmentController(bindings: Bindings) {
  const { scene, camera, ambient, sun, fill, ocean, vessels } = bindings;
  const options = readEnvironmentOptions();
  const sky = createEnvironmentSky(bindings.sunGroup);
  const clouds = createCloudController(), particles = createWeatherController();
  scene.add(sky.group, clouds.group, particles.group);
  clouds.group.visible = particles.group.visible = false;
  let disposed = false, paused = false, updates = 0, low = false;
  let anchorWall = Date.now(), offset = 0, offsetSample = -Infinity;
  let celestialKey = -Infinity, weatherKey = -Infinity, debugAt = -Infinity, shadowAt = -Infinity;
  let celestialPair: [CelestialState, CelestialState];
  let weatherPair: [ReturnType<typeof sampleWeather>, ReturnType<typeof sampleWeather>];
  let timestamp = 0, celestial = calculateCelestial(Date.now(), options.location);
  let weather = sampleWeather(Date.now());
  let transition: { from: typeof weather; started: number } | undefined;
  const warmObjects: THREE.Object3D[] = [
    ...sky.warmObjects, clouds.group, ...clouds.group.children,
    particles.group, ...particles.group.children, ...vessels.warmObjects,
  ];
  const ownedGroups = [sky.group, clouds.group, particles.group, vessels.group];
  const warm = new THREE.Color("#ffd3a2"), daylightColor = new THREE.Color("#fff1db"), moonColor = new THREE.Color("#a8bedc");
  const dayAmbient = new THREE.Color("#e4edf0"), nightAmbient = new THREE.Color("#adb9ca");
  const waterDay = new THREE.Color(1, 1, 1), waterNight = new THREE.Color(.19, .28, .4), waterGray = new THREE.Color(.67, .75, .8);
  const tint = new THREE.Color(), weatherTint = new THREE.Color(), lightColor = new THREE.Color();

  function selectedTime(wall: number) {
    if (options.timestamp !== undefined) return options.timestamp + wall - anchorWall;
    if (options.timeMode === "scene") return wall;
    // Intl/DST conversion is deliberately outside the per-frame hot path.
    if (Math.abs(wall - offsetSample) >= 30000) {
      offset = timestampForLocalClock(wall, options.location.timeZone) - wall; offsetSample = wall;
    }
    return wall + offset;
  }
  const debug = createEnvironmentDebug(options, patch => {
    if (disposed) return;
    if ("weather" in patch || "cloudCover" in patch || "windSpeed" in patch)
      transition = { from: { ...weather }, started: performance.now() };
    Object.assign(options, patch);
    if ("timestamp" in patch) anchorWall = Date.now();
    if ("quality" in patch) bindings.quality(options.quality);
    celestialKey = weatherKey = -Infinity; debugAt = -Infinity; offsetSample = -Infinity;
    bindings.invalidate();
  });

  function update(waterTime: number, isLow: boolean, reduced: boolean, outdoors: boolean) {
    if (disposed || paused) return;
    updates++; low = isLow;
    timestamp = selectedTime(Date.now());
    const second = Math.floor(timestamp / 1000), tenSeconds = Math.floor(timestamp / 10000);
    if (second !== celestialKey) {
      celestialPair = [calculateCelestial(second * 1000, options.location, options.moonPhase), calculateCelestial((second + 1) * 1000, options.location, options.moonPhase)];
      celestialKey = second;
    }
    celestial = interpolateCelestial(...celestialPair, timestamp / 1000 - second);
    if (tenSeconds !== weatherKey) {
      const config = { kind: options.weather, cloudCover: options.cloudCover, windSpeed: options.windSpeed, timeZone: options.location.timeZone };
      weatherPair = [sampleWeather(tenSeconds * 10000, config), sampleWeather((tenSeconds + 1) * 10000, config)];
      weatherKey = tenSeconds;
    }
    const target = blendWeather(...weatherPair, timestamp / 10000 - tenSeconds);
    if (transition) {
      const progress = THREE.MathUtils.clamp((performance.now() - transition.started) / 6000, 0, 1);
      weather = blendWeather(transition.from, target, progress * progress * (3 - 2 * progress));
      if (progress === 1) transition = undefined;
    } else weather = target;
    sky.update(celestial, weather, camera);
    const d = celestial.daylight, cover = weather.cloudCover;
    const sunlight = THREE.MathUtils.smoothstep(celestial.sun.altitude, -.02, .23) * (1 - cover * .84);
    const moonlight = celestial.night * celestial.moonIllumination * THREE.MathUtils.smoothstep(celestial.moon.altitude, -.02, .15) * (1 - cover * .86);
    ambient.color.copy(nightAmbient).lerp(dayAmbient, d);
    ambient.intensity = 1.02 + d * .52 * (1 - cover * .18);
    ambient.groundColor.setRGB(.28 + .16 * d, .25 + .12 * d, .24 + .08 * d);
    fill.intensity = .46 + .44 * d * (1 - cover * .22);
    fill.color.copy(moonColor).lerp(daylightColor, d);
    const warmAmount = 1 - THREE.MathUtils.smoothstep(celestial.sun.altitude, .03, .6);
    lightColor.copy(daylightColor).lerp(warm, warmAmount);
    sun.intensity = 3.35 * sunlight + .14 * moonlight;
    sun.color.copy(sunlight > .005 ? lightColor : moonColor);
    sun.position.fromArray(sunlight > .005 ? celestial.sun.direction : celestial.moon.direction).multiplyScalar(12);
    if (Math.abs(timestamp - shadowAt) > 15000) { sun.shadow.needsUpdate = true; shadowAt = timestamp; }
    const uniforms = ocean.uniforms;
    uniforms.sunPosition.value.fromArray(celestial.sun.direction).multiplyScalar(235); uniforms.sunPosition.value.y -= 8;
    uniforms.moonPosition.value.copy(sky.moon.position);
    uniforms.skyHorizon.value.copy(sky.horizon); uniforms.skyZenith.value.copy(sky.zenith);
    tint.copy(waterNight).lerp(waterDay, d).multiply(weatherTint.copy(waterGray).lerp(waterDay, 1 - cover * .78));
    if (weather.snow > 0) { tint.r *= 1 - weather.snow * .08; tint.b *= 1 + weather.snow * .03; }
    uniforms.waterTint.value.copy(tint);
    uniforms.lightColor.value.copy(lightColor); uniforms.lightStrength.value = sunlight;
    uniforms.moonStrength.value = moonlight * .12;
    uniforms.waveScale.value = weather.waveScale;
    uniforms.rainAmount.value = weather.precipitation * (1 - weather.snow);
    uniforms.fogDensity.value = .003 + (1 - weather.visibility) * .007;
    // Courtyard's five fog layers retain their own reveal sequencing.
    if (outdoors && scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(sky.horizon); scene.fog.density = uniforms.fogDensity.value;
    }
    clouds.group.visible = particles.group.visible = outdoors;
    if (outdoors) {
      const direction = sunlight > .005 ? celestial.sun.direction : celestial.moon.direction;
      clouds.update(timestamp, weather, low, reduced, d, direction);
      particles.update(timestamp, weather, low, reduced, d);
      vessels.setDebugPaths(options.paths);
      vessels.update(timestamp, waterTime, {
        low, reduced, daylight: d, windSpeed: weather.windSpeed,
        severity: Math.max(weather.precipitation, (1 - weather.visibility) * .7),
        density: options.vesselDensity, forcedRoute: options.vesselRoute, forcedKind: options.vesselKind, waveScale: weather.waveScale,
      });
    }
    if (timestamp - debugAt >= 1000 || timestamp < debugAt) {
      debugAt = timestamp;
      debug.update({ timestamp, timeZone: options.location.timeZone, weather: weather.kind, sunAltitude: celestial.sun.altitude, moonPhase: celestial.moonPhase, vessels: vessels.snapshot().length, low });
    }
  }
  return {
    update, warmObjects, ownedGroups, initialQuality: options.quality,
    pause() { paused = true; },
    resume() { paused = false; offsetSample = -Infinity; },
    snapshot() { return { timestamp, celestial, weather, vessels: vessels.snapshot(), low, updates, paused }; },
    dispose() {
      if (disposed) return;
      disposed = true; paused = true; debug.dispose(); sky.dispose(); clouds.dispose(); particles.dispose(); vessels.dispose();
    },
  };
}
