import * as THREE from "three";
import { timestampForLocalClock } from "./calendar-seed";
import { calculateCelestial, type CelestialState, type Direction3 } from "./celestial-controller";
import { createCloudController } from "./cloud-controller";
import { createEnvironmentDebug, readEnvironmentOptions } from "./environment-debug";
import { createEnvironmentSky } from "./environment-sky";
import { blendWeather, createWeatherController, sampleWeather, sampleWeatherFront, transitionWeather } from "./weather-controller";
import type { createVesselController } from "./vessel-controller";
import { createBirdController } from "./bird-controller";
import { createStormController } from "./storm-controller";
import type { EnvironmentSoundFrame } from "./weather-audio";

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
  onSound?: (frame: EnvironmentSoundFrame) => void;
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
  const birds = createBirdController(), storm = createStormController();
  scene.add(sky.group, clouds.group, particles.group, birds.group, storm.group);
  clouds.group.visible = particles.group.visible = false;
  birds.group.visible = storm.group.visible = false;
  let disposed = false, paused = false, updates = 0, low = false;
  let anchorWall = Date.now(), departureRevision = 0, cloudRevision = 0;
  let userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let celestialKey = -Infinity, weatherKey = -Infinity, debugAt = -Infinity, shadowAt = -Infinity;
  let celestialPair: [CelestialState, CelestialState];
  let weatherPair: [ReturnType<typeof sampleWeather>, ReturnType<typeof sampleWeather>];
  let timestamp = 0, celestial = calculateCelestial(Date.now(), options.location);
  let weather = sampleWeather(Date.now());
  let transition: { from: typeof weather; started: number } | undefined;
  const warmObjects: THREE.Object3D[] = [
    ...sky.warmObjects, clouds.group, ...clouds.group.children,
    particles.group, ...particles.group.children, ...vessels.warmObjects, ...birds.warmObjects, ...storm.warmObjects,
  ];
  const ownedGroups = [sky.group, clouds.group, particles.group, vessels.group, birds.group, storm.group];
  const warm = new THREE.Color("#ffd3a2"), daylightColor = new THREE.Color("#fff1db"), moonColor = new THREE.Color("#a8bedc");
  const dayAmbient = new THREE.Color("#e4edf0"), nightAmbient = new THREE.Color("#adb9ca");
  const waterDay = new THREE.Color(1, 1, 1), waterNight = new THREE.Color(.19, .28, .4), waterGray = new THREE.Color(.67, .75, .8);
  const tint = new THREE.Color(), weatherTint = new THREE.Color(), lightColor = new THREE.Color();

  function selectedTime(wall: number) {
    if (options.timestamp !== undefined) return options.timestamp + wall - anchorWall;
    if (options.timeMode === "scene") return wall;
    // Daily timezone anchors are cached by the calendar; interpolate on every
    // frame so DST smoothing cannot become a 30-second staircase.
    return timestampForLocalClock(wall, options.location.timeZone, userTimeZone);
  }
  function departureState(at: number) {
    const skyAtDeparture = calculateCelestial(at, options.location);
    const weatherAtDeparture = sampleWeather(at, {
      kind: options.weather, cloudCover: options.cloudCover,
      windSpeed: options.windSpeed, windDirection: options.windDirection, precipitation: options.precipitation,
      waveScale:options.waveScale, thunder:options.thunder, timeZone: options.location.timeZone,
    });
    return {
      daylight: skyAtDeparture.daylight,
      windSpeed:weatherAtDeparture.windSpeed, windDirection:weatherAtDeparture.windDirection,
      severity: Math.max(weatherAtDeparture.precipitation, (1 - weatherAtDeparture.visibility) * .7, THREE.MathUtils.smoothstep(weatherAtDeparture.windSpeed, 8, 16)),
    };
  }
  const debug = createEnvironmentDebug(options, patch => {
    if (disposed) return;
    if (["weather","cloudCover","windSpeed","windDirection","precipitation","waveScale","thunder","timestamp","timeMode"].some(key=>key in patch)) {
      transition = { from: { ...weather }, started: performance.now() };
      storm.cancelPreview();
    }
    if (["weather","cloudCover","windSpeed","windDirection","precipitation"].some(key=>key in patch)) departureRevision++;
    if (["weather","windSpeed","windDirection","timestamp","timeMode"].some(key=>key in patch)) cloudRevision++;
    Object.assign(options, patch);
    if ("timestamp" in patch) anchorWall = Date.now();
    if ("quality" in patch) bindings.quality(options.quality);
    celestialKey = weatherKey = -Infinity; debugAt = -Infinity;
    bindings.invalidate();
  }, () => {
    // This one-off developer action leaves calendar time and saved state alone.
    // First complete the ordinary cloud/rain transition, then show a discharge.
    storm.previewOnce(selectedTime(Date.now()),7000);
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
      const config = { kind: options.weather, cloudCover: options.cloudCover, windSpeed: options.windSpeed,
        windDirection:options.windDirection, precipitation:options.precipitation, waveScale:options.waveScale, thunder:options.thunder, timeZone: options.location.timeZone };
      weatherPair = [sampleWeather(tenSeconds * 10000, config), sampleWeather((tenSeconds + 1) * 10000, config)];
      weatherKey = tenSeconds;
    }
    const target = blendWeather(...weatherPair, timestamp / 10000 - tenSeconds);
    if (transition) {
      const progress = THREE.MathUtils.clamp((performance.now() - transition.started) / 6000, 0, 1);
      weather = transitionWeather(transition.from, target, progress);
      if (progress === 1) transition = undefined;
    } else weather = target;
    const stormFrame = storm.update(timestamp, weather, low, reduced || !outdoors, celestial.daylight);
    sky.update(celestial, weather, camera, stormFrame.flash);
    const d = celestial.daylight, cover = weather.cloudCover;
    const sunlight = THREE.MathUtils.smoothstep(celestial.sun.altitude, -.02, .23) * (1 - cover * .84);
    const moonlight = celestial.night * celestial.moonIllumination * THREE.MathUtils.smoothstep(celestial.moon.altitude, -.02, .15) * (1 - cover * .86);
    ambient.color.copy(nightAmbient).lerp(dayAmbient, d);
    ambient.intensity = 1.02 + d * .52 * (1 - cover * .18);
    ambient.groundColor.setRGB(.28 + .16 * d, .25 + .12 * d, .24 + .08 * d);
    fill.intensity = .46 + .44 * d * (1 - cover * .22) + stormFrame.flash * (.12+.18*d);
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
    uniforms.windDirection.value = weather.windDirection; uniforms.windSpeed.value = weather.windSpeed;
    uniforms.windInfluence.value = 1;
    uniforms.rainAmount.value = weather.precipitation * (1 - weather.snow);
    uniforms.rainDetail.value = (low ? .35 : 1) * (reduced ? .25 : 1);
    uniforms.stormFlash.value=stormFrame.flash;uniforms.stormSource.value.copy(storm.source);
    uniforms.fogDensity.value = .003 + (1 - weather.visibility) * .007;
    // Courtyard's five fog layers retain their own reveal sequencing.
    if (outdoors && scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.copy(sky.horizon); scene.fog.density = uniforms.fogDensity.value;
    }
    clouds.group.visible = particles.group.visible = outdoors;
    birds.group.visible = storm.group.visible = outdoors;
    if (outdoors) {
      const direction = sunlight > .005 ? celestial.sun.direction : celestial.moon.direction;
      clouds.update(timestamp, weather, low, reduced, d, direction, {
        timeZone: options.location.timeZone, weather: options.weather,
        windSpeed: options.windSpeed, windDirection:options.windDirection, revision: cloudRevision, camera, flash:stormFrame.flash,
      });
      particles.update(timestamp, weather, low, reduced, d);
      birds.update(timestamp, weather, low, reduced, d, options.birdDensity);
      vessels.setDebugPaths(options.paths);
      vessels.update(timestamp, waterTime, {
        low, reduced, daylight: d, windSpeed: weather.windSpeed, windDirection:weather.windDirection,
        severity: Math.max(weather.precipitation, (1 - weather.visibility) * .7, THREE.MathUtils.smoothstep(weather.windSpeed, 8, 16)),
        density: options.vesselDensity, forcedRoute: options.vesselRoute, forcedKind: options.vesselKind, waveScale: weather.waveScale,
        departureState, departureRevision,
      });
    }
    bindings.onSound?.({ timestamp, weather, storm: stormFrame, active: outdoors });
    if (timestamp - debugAt >= 1000 || timestamp < debugAt) {
      debugAt = timestamp;
      debug.update({ timestamp, timeZone: options.location.timeZone, weather: weather.kind, sunAltitude: celestial.sun.altitude, moonPhase: celestial.moonPhase, vessels: vessels.snapshot().length, low,
        windSpeed:weather.windSpeed,windDirection:weather.windDirection,waveScale:weather.waveScale,precipitation:weather.precipitation,
        birds: birds.snapshot().length, reduced, front: options.weather ? "强制预览 · 分阶段过渡" : sampleWeatherFront(timestamp, { timeZone: options.location.timeZone }).phase });
    }
  }
  return {
    update, warmObjects, ownedGroups, initialQuality: options.quality,
    pause() { paused = true; storm.cancelPreview(); },
    resume() { paused = false; userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; },
    snapshot() { return { timestamp, celestial, weather, vessels: vessels.snapshot(), birds: birds.snapshot(), storm: storm.snapshot(), low, updates, paused }; },
    dispose() {
      if (disposed) return;
      disposed = true; paused = true; debug.dispose(); sky.dispose(); clouds.dispose(); particles.dispose(); vessels.dispose(); birds.dispose(); storm.dispose();
    },
  };
}
