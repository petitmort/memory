import * as THREE from "three";
import { timestampForLocalClock } from "./calendar-seed";
import { calculateCelestial, type CelestialState, type Direction3 } from "./celestial-controller";
import { createCloudController } from "./cloud-controller";
import { createEnvironmentDebug, readEnvironmentOptions } from "./environment-debug";
import { createEnvironmentSky } from "./environment-sky";
import { blendWeather, createWeatherController, sampleWeather, sampleWeatherFront, transitionWeather, type WeatherState } from "./weather-controller";
import type { createVesselController } from "./vessel-controller";
import { createBirdController } from "./bird-controller";
import { createStormController } from "./storm-controller";
import type { EnvironmentSoundFrame } from "./weather-audio";
import { createTimeFlowClock, loadTimeFlow, saveTimeFlow, type TimeFlowFrame, type TimeFlowSettings } from "./environment-time";

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
  onDaylight?: (daylight: number) => void;
  onTime?: (frame: TimeFlowFrame) => void;
  onCoastFrame?: (waterTime: number, weather: WeatherState, low: boolean, reduced: boolean, daylight: number, active: boolean, timestamp: number, sunAltitude: number) => void;
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
  const sky = createEnvironmentSky(bindings.sunGroup, options.location);
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
  let timestamp = 0, motionTimestamp = 0, celestial = calculateCelestial(Date.now(), options.location);
  let weather = sampleWeather(Date.now());
  let transition: { from: typeof weather; started: number } | undefined;
  let skyTransition: { from: CelestialState; started: number } | undefined;
  let timeInfoAt = -Infinity;
  const timeFlow = createTimeFlowClock(realtimeTime(anchorWall), anchorWall, options.enabled ? undefined : loadTimeFlow());
  const warmObjects: THREE.Object3D[] = [
    ...sky.warmObjects, clouds.group, ...clouds.group.children,
    particles.group, ...particles.group.children, ...vessels.warmObjects, ...birds.warmObjects, ...storm.warmObjects,
  ];
  const ownedGroups = [sky.group, clouds.group, particles.group, vessels.group, birds.group, storm.group];
  const warm = new THREE.Color("#ffd3a2"), daylightColor = new THREE.Color("#fff1db"), moonColor = new THREE.Color("#a8bedc");
  const dayAmbient = new THREE.Color("#e4edf0"), nightAmbient = new THREE.Color("#adb9ca");
  const waterDay = new THREE.Color(1, 1, 1), waterNight = new THREE.Color(.19, .28, .4), waterGray = new THREE.Color(.67, .75, .8);
  const tint = new THREE.Color(), weatherTint = new THREE.Color(), lightColor = new THREE.Color();

  function realtimeTime(wall: number) {
    if (options.timestamp !== undefined) return options.timestamp + wall - anchorWall;
    if (options.timeMode === "scene") return wall;
    // Daily timezone anchors are cached by the calendar; interpolate on every
    // frame so DST smoothing cannot become a 30-second staircase.
    return timestampForLocalClock(wall, options.location.timeZone, userTimeZone);
  }
  function timeFrame(wall = Date.now()): TimeFlowFrame {
    return { ...timeFlow.sample(realtimeTime(wall), wall), timeZone: options.location.timeZone };
  }
  function setTimeFlow(patch: Partial<TimeFlowSettings>) {
    if (disposed) return;
    const before = timeFrame(), wall = Date.now();
    const next = timeFlow.set(patch, realtimeTime(wall), wall);
    if (before.mode !== next.mode || before.speed !== next.speed)
      transition = { from: { ...weather }, started: performance.now() };
    if (before.mode !== next.mode) {
      if (Math.abs(next.timestamp - before.timestamp) > 1000) skyTransition = { from: celestial, started: performance.now() };
      storm.cancelPreview();
    }
    if (!options.enabled) saveTimeFlow(timeFlow.saved());
    celestialKey = weatherKey = timeInfoAt = -Infinity;
    bindings.onTime?.(timeFrame()); bindings.invalidate();
  }
  function departureState(at: number) {
    // Plan on the same natural timeline as vessel positions, including after
    // refresh. The accelerated calendar only changes current light/sea/trim.
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
    if ("timestamp" in patch || "timeMode" in patch) {
      timeFlow.seek(realtimeTime(Date.now()), Date.now());
      skyTransition = undefined; timeInfoAt = -Infinity;
    }
    if ("quality" in patch) bindings.quality(options.quality);
    celestialKey = weatherKey = -Infinity; debugAt = shadowAt = -Infinity;
    bindings.invalidate();
  }, () => {
    // This one-off developer action leaves calendar time and saved state alone.
    // First complete the ordinary cloud/rain transition, then show a discharge.
    storm.previewOnce(realtimeTime(Date.now()),7000);
    bindings.invalidate();
  }, () => setTimeFlow({ mode: "realtime" }));

  function update(waterTime: number, isLow: boolean, reduced: boolean, outdoors: boolean) {
    if (disposed || paused) return;
    updates++; low = isLow;
    const time = timeFrame(), perf = performance.now();
    timestamp = time.timestamp; motionTimestamp = time.motionTimestamp;
    // Limit expensive calendar sampling by elapsed real time, then interpolate
    // on the virtual timeline. High rates must not multiply CPU work by 3600.
    const rate = time.mode === "free" ? time.speed : 1;
    const celestialStep = Math.max(1000, rate * 250), weatherStep = Math.max(10000, rate * 500);
    const celestialBucket = Math.floor(timestamp / celestialStep), weatherBucket = Math.floor(timestamp / weatherStep);
    if (celestialBucket !== celestialKey) {
      celestialPair = [calculateCelestial(celestialBucket * celestialStep, options.location, options.moonPhase), calculateCelestial((celestialBucket + 1) * celestialStep, options.location, options.moonPhase)];
      celestialKey = celestialBucket;
    }
    const skyTarget = interpolateCelestial(...celestialPair, timestamp / celestialStep - celestialBucket);
    if (skyTransition) {
      const progress = THREE.MathUtils.clamp((perf - skyTransition.started) / (reduced ? 300 : 4000), 0, 1);
      celestial = interpolateCelestial(skyTransition.from, skyTarget, progress * progress * (3 - 2 * progress));
      if (progress === 1) skyTransition = undefined;
    } else celestial = skyTarget;
    bindings.onDaylight?.(celestial.daylight);
    if (weatherBucket !== weatherKey) {
      const config = { kind: options.weather, cloudCover: options.cloudCover, windSpeed: options.windSpeed,
        windDirection:options.windDirection, precipitation:options.precipitation, waveScale:options.waveScale, thunder:options.thunder, timeZone: options.location.timeZone };
      weatherPair = [sampleWeather(weatherBucket * weatherStep, config), sampleWeather((weatherBucket + 1) * weatherStep, config)];
      weatherKey = weatherBucket;
    }
    const target = blendWeather(...weatherPair, timestamp / weatherStep - weatherBucket);
    if (transition) {
      const progress = THREE.MathUtils.clamp((perf - transition.started) / 6000, 0, 1);
      weather = transitionWeather(transition.from, target, progress);
      if (progress === 1) transition = undefined;
    } else weather = target;
    const stormFrame = storm.update(motionTimestamp, weather, low, reduced || !outdoors, celestial.daylight);
    sky.update(celestial, weather, camera, stormFrame.flash, timestamp, low, reduced, motionTimestamp, options.celestialView);
    const d = celestial.daylight, cover = weather.cloudCover;
    const sunlight = THREE.MathUtils.smoothstep(celestial.sun.altitude, -.02, .23) * (1 - cover * .84);
    const moonlight = celestial.night * celestial.moonIllumination * THREE.MathUtils.smoothstep(celestial.moon.altitude, -.02, .15) * (1 - cover * .86);
    ambient.color.copy(nightAmbient).lerp(dayAmbient, d);
    // Preserve clear daylight while letting the ceiling and local linen lamp
    // describe the room at night, instead of uniformly filling every corner.
    ambient.intensity = .65 + d * .89 * (1 - cover * .18);
    ambient.groundColor.setRGB(.28 + .16 * d, .25 + .12 * d, .24 + .08 * d);
    fill.intensity = .26 + .64 * d * (1 - cover * .22) + stormFrame.flash * (.12+.18*d);
    fill.color.copy(moonColor).lerp(daylightColor, d);
    const warmAmount = 1 - THREE.MathUtils.smoothstep(celestial.sun.altitude, .03, .6);
    lightColor.copy(daylightColor).lerp(warm, warmAmount);
    sun.intensity = 3.35 * sunlight + .14 * moonlight;
    sun.color.copy(sunlight > .005 ? lightColor : moonColor);
    sun.position.copy(sunlight > .005 ? bindings.sunGroup.position : sky.moon.position).normalize().multiplyScalar(12);
    if (Math.abs(perf - shadowAt) > (time.mode === "free" ? 1000 : 15000)) { sun.shadow.needsUpdate = true; shadowAt = perf; }
    const uniforms = ocean.uniforms;
    uniforms.sunPosition.value.copy(bindings.sunGroup.position);
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
      const direction = sunlight > .005 ? sky.directions.sun : sky.directions.moon;
      clouds.update(motionTimestamp, weather, low, reduced, d, direction, {
        timeZone: options.location.timeZone, weather: options.weather,
        windSpeed: options.windSpeed, windDirection:options.windDirection, revision: cloudRevision, camera, flash:stormFrame.flash,
        liveWind: time.mode === "free" ? weather : undefined,
      });
      particles.update(motionTimestamp, weather, low, reduced, d);
      birds.update(motionTimestamp, weather, low, reduced, d, options.birdDensity);
      vessels.setDebugPaths(options.paths);
      vessels.update(motionTimestamp, waterTime, {
        low, reduced, daylight: d, windSpeed: weather.windSpeed, windDirection:weather.windDirection,
        severity: Math.max(weather.precipitation, (1 - weather.visibility) * .7, THREE.MathUtils.smoothstep(weather.windSpeed, 8, 16)),
        density: options.vesselDensity, forcedRoute: options.vesselRoute, forcedKind: options.vesselKind, waveScale: weather.waveScale,
        departureState, departureRevision,
      });
    }
    bindings.onCoastFrame?.(waterTime, weather, low, reduced, d, outdoors, motionTimestamp, celestial.sun.altitude);
    bindings.onSound?.({ timestamp: motionTimestamp, weather, storm: stormFrame, active: outdoors });
    if (perf - timeInfoAt >= 250) { timeInfoAt = perf; bindings.onTime?.(time); }
    if (timestamp - debugAt >= 1000 || timestamp < debugAt) {
      debugAt = timestamp;
      debug.update({ timestamp, timeZone: options.location.timeZone, weather: weather.kind, sunAltitude: celestial.sun.altitude, moonPhase: celestial.moonPhase, vessels: vessels.snapshot().length, low,
        windSpeed:weather.windSpeed,windDirection:weather.windDirection,waveScale:weather.waveScale,precipitation:weather.precipitation,
        birds: birds.snapshot().length, reduced, front: options.weather ? "强制预览 · 分阶段过渡" : sampleWeatherFront(timestamp, { timeZone: options.location.timeZone }).phase });
    }
  }
  return {
    update, warmObjects, ownedGroups, initialQuality: options.quality,
    getTime: timeFrame,
    isRealtime() { return timeFlow.getSettings().mode === "realtime"; },
    setTimeFlow,
    pause() { paused = true; storm.cancelPreview(); },
    resume() { paused = false; userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; },
    snapshot() { return { timestamp, motionTimestamp, timeFlow: timeFrame(), celestial, celestialView: options.celestialView, displayDirections: sky.directions, weather, vessels: vessels.snapshot(), birds: birds.snapshot(), storm: storm.snapshot(), low, updates, paused }; },
    dispose() {
      if (disposed) return;
      disposed = true; paused = true; debug.dispose(); sky.dispose(); clouds.dispose(); particles.dispose(); vessels.dispose(); birds.dispose(); storm.dispose();
    },
  };
}
