import * as THREE from "three";
import { sampleWaterHeight } from "./water-surface";
import { createVesselModels } from "./vessel-models";
import { getVesselSchedule, sampleSailTrim, sampleVesselJourney, sampleVesselRoute, vesselDepartureInterval, vesselKinds, vesselRoutes, type VesselKind, type VesselJourney, type VesselRoute, type VesselWind } from "./vessel-navigation";

export type VesselOptions = {
  low: boolean; reduced: boolean; daylight: number; windSpeed: number; severity: number;
  /** Flow direction toward world (cos(theta), sin(theta)) in X/Z. */
  windDirection?: number;
  density?: number; forcedRoute?: VesselRoute; forcedKind?: VesselKind; waveScale?: number;
  /** Stable simulation at departure; a changing dawn must not spawn a boat midway. */
  departureState?: (timestampMs: number) => { daylight: number; severity: number; windSpeed?: number; windDirection?: number };
  /** Invalidate cached departure conditions after an explicit debug override. */
  departureRevision?: number;
};
const smooth = (x: number) => { const a = THREE.MathUtils.clamp(x, 0, 1); return a * a * (3 - 2 * a); };
type SailUniforms = { pose: { value: THREE.Vector4 }; time: { value: number } };

function installSailShader(material: THREE.Material, state: SailUniforms, square: boolean) {
  material.onBeforeCompile = shader => {
    shader.uniforms.vesselSail = state.pose; shader.uniforms.vesselSailTime = state.time;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      uniform vec4 vesselSail;
      uniform float vesselSailTime;
      ${square ? '' : 'attribute vec4 sailFrame;'}
    `).replace('#include <begin_vertex>', `#include <begin_vertex>
      ${square ? `
        float flex=sin(uv.x*3.141593)*sin(uv.y*3.141593);
        transformed.x=.025+(transformed.x-.025)*(.2+.8*vesselSail.y)
          +sin(uv.x*17.+uv.y*9.+vesselSailTime*1.7)*flex*(1.-vesselSail.y)*.065;
      ` : `
        float u=clamp((sailFrame.x-position.x)/sailFrame.w,0.,1.);
        float v=clamp((position.y-sailFrame.y)/sailFrame.z,0.,1.);
        float flex=sin(u*3.141593)*sin(v*3.141593);
        float draft=(position.z+flex*(.12+.42*vesselSail.y))*vesselSail.w
          +sin(u*18.+v*8.+vesselSailTime*1.7)*flex*(1.-vesselSail.y)*.045;
        float foot=position.x-sailFrame.x;
        transformed.x=sailFrame.x+foot*cos(vesselSail.x)+draft*sin(vesselSail.x);
        transformed.z=-foot*sin(vesselSail.x)+draft*cos(vesselSail.x);
        transformed.y=sailFrame.y+(position.y-sailFrame.y)*vesselSail.z;
      `}
    `);
    if (!square) shader.vertexShader = shader.vertexShader.replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
      float sailNormalX=objectNormal.x;
      objectNormal.x=sailNormalX*cos(vesselSail.x)+objectNormal.z*sin(vesselSail.x);
      objectNormal.z=-sailNormalX*sin(vesselSail.x)+objectNormal.z*cos(vesselSail.x);
      objectNormal.y/=max(.1,vesselSail.z);
    `);
  };
  material.customProgramCacheKey = () => square ? 'wind-square-sail-v1' : 'wind-lateen-sail-v1';
}

/** Five pooled actors; geometry, materials and paths are created only at startup. */
export function createVesselController({ legacyShip }: { legacyShip?: THREE.Group } = {}) {
  const group = new THREE.Group(); group.name = "calendar-vessel-traffic";
  const templates = createVesselModels(legacyShip);
  const warmObjects: THREE.Object3D[] = [group];
  const wakeGeometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  wakeGeometry.rotateX(-Math.PI / 2);
  const wakeCanvas = document.createElement("canvas"); wakeCanvas.width = 128; wakeCanvas.height = 64;
  const wakeContext = wakeCanvas.getContext("2d")!;
  for (let i = 0; i < 20; i++) {
    const x = 8 + i * 5.4, width = 4 + i * .32;
    const gradient = wakeContext.createRadialGradient(x, 32, 0, x, 32, width);
    gradient.addColorStop(0, `rgba(235,244,238,${.18 + i / 120})`); gradient.addColorStop(1, "rgba(235,244,238,0)");
    wakeContext.fillStyle = gradient; wakeContext.fillRect(x - width, 32 - width, width * 2, width * 2);
  }
  const wakeMap = new THREE.CanvasTexture(wakeCanvas); wakeMap.colorSpace = THREE.SRGBColorSpace;
  const lightGeometry = new THREE.SphereGeometry(.065, 5, 4);
  const actors = Array.from({ length: 5 }, (_, index) => {
    const root = new THREE.Group(); root.name = `pooled-vessel-${index}`; group.add(root); warmObjects.push(root);
    const materials = new Map<THREE.Material, THREE.Material>();
    const sailState: SailUniforms = { pose: { value: new THREE.Vector4(0, 1, 1, 1) }, time: { value: 0 } };
    const squareRigs: THREE.Object3D[] = [];
    const models = {} as Record<VesselKind, THREE.Group>;
    for (const kind of vesselKinds) {
      const model = index === 0 && kind === "wood-sail" ? templates[kind] : templates[kind].clone(true);
      model.name = kind === "wood-sail" && index === 0 ? "mythic-sailing-ship" : `pooled-${kind}`;
      model.traverse(object => {
        if (object.name === "square-sail-rig") squareRigs.push(object);
        if (object.name === "near-vessel-details" || object.name === "galley-fixed-fittings") warmObjects.push(object);
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = object.receiveShadow = false;
        const copy = (source: THREE.Material) => {
          let material = materials.get(source);
          if (!material) {
            material = source.clone(); material.transparent = true; materials.set(source, material);
            if (source.userData.windSail) installSailShader(material, sailState, source.userData.windSail === "square");
          }
          return material;
        };
        object.material = Array.isArray(object.material) ? object.material.map(copy) : copy(object.material);
      });
      model.visible = false; models[kind] = model; root.add(model); warmObjects.push(model);
    }
    const wakeMaterial = new THREE.MeshBasicMaterial({ color: "#e6efeb", map: wakeMap, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide });
    const wake = new THREE.Mesh(wakeGeometry, wakeMaterial); wake.name = "soft-vessel-wake";
    wake.position.set(-5.3, .16, 0); wake.scale.set(7.2, 1, 1.15); root.add(wake); warmObjects.push(wake);
    const lightMaterial = new THREE.MeshBasicMaterial({ color: "#e7d8ac", transparent: true, opacity: .7, toneMapped: false });
    const light = new THREE.Mesh(lightGeometry, lightMaterial); light.name = "vessel-navigation-lamp"; light.position.set(2, 1.3, 0); root.add(light); warmObjects.push(light);
    root.visible = false;
    return { root, models, materials, wake, light, sailState, squareRigs, brace: -.35, sailReady: false,
      journey: null as VesselJourney | null, opacity: 0 };
  });
  const pathGeometry = new THREE.BufferGeometry(), positions: number[] = [];
  for (const route of vesselRoutes) for (let i = 0; i < 96; i++) {
    const a = sampleVesselRoute(route, i / 96), b = sampleVesselRoute(route, (i + 1) / 96);
    positions.push(a.x, -6.9, a.z, b.x, -6.9, b.z);
  }
  pathGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const paths = new THREE.LineSegments(pathGeometry, new THREE.LineBasicMaterial({ color: "#d7af64", transparent: true, opacity: .55 }));
  paths.name = "vessel-debug-routes"; paths.visible = false; group.add(paths); warmObjects.push(paths);
  let disposed = false, previousTime: number | undefined, scheduleKey = "", schedule: VesselJourney[] = [];
  let departureStates = new Map<number, { daylight: number; severity: number; windSpeed?: number; windDirection?: number }>();
  const desiredSail = new THREE.Vector4();
  const waterWind = { windSpeed: 0, windDirection: 0 };
  const identity = (journey: VesselJourney) => `${journey.id}:${journey.kind}:${journey.route}:${!!journey.reverse}:${journey.speed}`;

  function update(timestampMs: number, waterTime: number, options: VesselOptions) {
    if (disposed || !Number.isFinite(timestampMs + waterTime)) return;
    const restoring = previousTime === undefined || timestampMs - previousTime > 1000 || timestampMs < previousTime;
    const dt = previousTime === undefined ? 0 : THREE.MathUtils.clamp((timestampMs - previousTime) / 1000, 0, .1);
    previousTime = timestampMs;
    const key = `${Math.floor(timestampMs / vesselDepartureInterval)}:${options.forcedRoute ?? ""}:${options.forcedKind ?? ""}:${options.departureRevision ?? 0}`;
    if (scheduleKey !== key) {
      if (scheduleKey.split(':').slice(1).join(':') !== key.split(':').slice(1).join(':')) departureStates.clear();
      const atDeparture = (at: number) => {
        let state = departureStates.get(at);
        if (!state) {
          state = options.departureState?.(at) ?? { daylight: options.daylight, severity: options.severity,
            windSpeed: options.windSpeed, windDirection: options.windDirection };
          departureStates.set(at, state);
        }
        return state;
      };
      const departureWind = options.windDirection === undefined ? undefined : (at: number): VesselWind => {
        const state = atDeparture(at);
        return { windSpeed: state.windSpeed ?? options.windSpeed, windDirection: state.windDirection ?? options.windDirection! };
      };
      schedule = getVesselSchedule(timestampMs, { ...options, departureWind }); scheduleKey = key;
      for (const journey of schedule) atDeparture(journey.startMs);
      // The longest permitted wind-polar voyage fits sixteen departure slots.
      // Keep only a bounded band, also covering its earlier conflict candidates.
      for (const at of departureStates.keys()) if (at < timestampMs - vesselDepartureInterval * 34 || at > timestampMs) departureStates.delete(at);
    }
    const available = schedule.filter(journey => timestampMs < journey.startMs + journey.durationMs);
    const limit = options.low ? 3 : 5;
    const density = THREE.MathUtils.clamp(options.density ?? 1, 0, 3);
    const wanted = available.filter(journey => {
      if (density === 0) return false;
      const state = options.departureState ? departureStates.get(journey.startMs)! : options;
      const probability = THREE.MathUtils.clamp((.4 + .38 * state.daylight) * (1 - .8 * state.severity) * density * (options.low ? .7 : 1), 0, 1);
      return options.forcedRoute || options.forcedKind || journey.admission < probability;
    }).slice(-limit);
    const ids = new Set(wanted.map(identity));
    // Sleeping scenes must release obsolete assignments before filling the
    // current schedule, even when all five actors belonged to old voyages.
    if (restoring) for (const actor of actors) if (actor.journey && !ids.has(identity(actor.journey))) {
      actor.journey = null; actor.opacity = 0; actor.root.visible = false;
    }
    for (const journey of wanted) if (!actors.some(actor => actor.journey && identity(actor.journey) === identity(journey))) {
      // Assignments made earlier in this pass still have zero opacity. They
      // already reserve an actor for a wanted voyage and must not be replaced.
      const actor = actors.find(actor => !actor.journey || (actor.opacity < .004 && !ids.has(identity(actor.journey))));
      if (!actor) continue;
      for (const model of Object.values(actor.models)) model.visible = false;
      actor.journey = journey; actor.models[journey.kind].visible = true; actor.opacity = 0; actor.sailReady = false;
    }
    waterWind.windSpeed = options.windSpeed; waterWind.windDirection = options.windDirection ?? 0;
    for (const actor of actors) {
      const journey = actor.journey;
      if (!journey) { actor.root.visible = false; continue; }
      const point = sampleVesselJourney(journey, timestampMs);
      const onJourney = point.progress >= 0 && point.progress < 1;
      const edge = smooth(point.progress / .045) * smooth((1 - point.progress) / .045);
      const desired = onJourney && ids.has(identity(journey)) ? edge : 0;
      // Changes of weather/quality fade gently instead of deleting a visible ship.
      // A fresh page or a sleeping scene restores the absolute voyage directly.
      actor.opacity = restoring ? desired : THREE.MathUtils.damp(actor.opacity, desired, 1.5, dt || .016);
      if (actor.opacity < .004 && !desired) { actor.root.visible = false; actor.journey = null; continue; }
      actor.root.visible = true;
      const scale = options.waveScale ?? 1;
      const waveWind = options.windDirection === undefined ? undefined : waterWind;
      const height = sampleWaterHeight(point.x, point.z, waterTime, waveWind) * scale;
      const half = journey.kind === "ferry" ? 5.5 : journey.kind === "wood-sail" ? 3.8 : 3;
      const x = Math.cos(point.yaw) * half, z = -Math.sin(point.yaw) * half;
      const bow = sampleWaterHeight(point.x + x, point.z + z, waterTime, waveWind) * scale;
      const stern = sampleWaterHeight(point.x - x, point.z - z, waterTime, waveWind) * scale;
      const tilt = THREE.MathUtils.clamp((bow - stern) / (half * 2), -.065, .065) * (options.reduced ? .25 : .7);
      actor.root.position.set(point.x, -8 + height - .09, point.z);
      const roll = THREE.MathUtils.clamp(.004 + options.windSpeed * .00055, .004, .018) * (options.reduced ? .22 : 1);
      actor.root.rotation.set(Math.sin(waterTime * .4 + journey.id) * roll, point.yaw, tilt, "YXZ");
      const trim = sampleSailTrim(journey.kind, point.yaw,
        { windSpeed: options.windSpeed, windDirection: options.windDirection ?? .7 }, !!journey.motorAssisted);
      desiredSail.set(trim.trim, trim.fullness, trim.reef, trim.side);
      if (restoring || !actor.sailReady || options.windDirection === undefined) { actor.sailState.pose.value.copy(desiredSail); actor.brace = trim.brace; actor.sailReady = true; }
      else {
        actor.sailState.pose.value.lerp(desiredSail, 1 - Math.exp(-dt * 2));
        actor.brace = THREE.MathUtils.damp(actor.brace, trim.brace, 2, dt);
      }
      actor.sailState.time.value = waterTime * (options.reduced ? .25 : 1);
      for (const rig of actor.squareRigs) {
        rig.rotation.y = actor.brace;
        rig.scale.y = actor.sailState.pose.value.z;
        rig.position.y = 9.72 * (1 - rig.scale.y);
      }
      for (const material of actor.materials.values()) material.opacity = actor.opacity;
      const far = Math.hypot(point.x, point.z) > 115;
      actor.models[journey.kind].traverse(object => {
        if (object.name === "near-vessel-details" || object.name === "galley-fixed-fittings") object.visible = !options.low && !far;
      });
      actor.wake.visible = !options.low && !options.reduced && !far && journey.kind !== "wood-sail";
      actor.wake.material.opacity = actor.opacity * .09 * (journey.kind === "motor-yacht" ? 1 : .55);
      actor.light.visible = options.daylight < .22;
      actor.light.position.y = journey.kind === "ferry" ? 3.5 : journey.kind === "fishing" ? 2.4 : 1.6;
      actor.light.material.opacity = actor.opacity * (1 - options.daylight) * .58;
      actor.root.userData.journeyId = journey.id; actor.root.userData.vesselKind = journey.kind; actor.root.userData.route = journey.route;
      actor.root.userData.sail = { ...trim, brace: actor.brace, trim: actor.sailState.pose.value.x,
        fullness: actor.sailState.pose.value.y, reef: actor.sailState.pose.value.z, side: actor.sailState.pose.value.w };
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    for (const root of [group, ...Object.values(templates)]) root.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    for (const actor of actors) for (const material of actor.materials.keys()) materials.add(material);
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    group.clear(); schedule = []; departureStates.clear(); previousTime = undefined;
  }
  return {
    group, warmObjects, update,
    setDebugPaths(visible: boolean) { if (!disposed) paths.visible = visible; },
    snapshot() { return actors.filter(actor => actor.root.visible && actor.journey).map(actor => ({
      id: actor.journey!.id, kind: actor.journey!.kind, route: actor.journey!.route,
      position: actor.root.position.toArray(), yaw: actor.root.rotation.y, opacity: actor.opacity,
      journey: actor.journey!, motorAssisted: !!actor.journey!.motorAssisted, sail: actor.root.userData.sail,
    })).sort((a, b) => a.id - b.id || a.kind.localeCompare(b.kind) || a.route.localeCompare(b.route)); },
    dispose,
  };
}
