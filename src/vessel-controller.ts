import * as THREE from "three";
import { sampleWaterHeight } from "./water-surface";
import { createVesselModels } from "./vessel-models";
import { getVesselSchedule, sampleVesselJourney, sampleVesselRoute, vesselDepartureInterval, vesselKinds, vesselRoutes, type VesselKind, type VesselJourney, type VesselRoute } from "./vessel-navigation";

export type VesselOptions = {
  low: boolean; reduced: boolean; daylight: number; windSpeed: number; severity: number;
  density?: number; forcedRoute?: VesselRoute; forcedKind?: VesselKind; waveScale?: number;
  /** Stable simulation at departure; a changing dawn must not spawn a boat midway. */
  departureState?: (timestampMs: number) => { daylight: number; severity: number };
  /** Invalidate cached departure conditions after an explicit debug override. */
  departureRevision?: number;
};
const smooth = (x: number) => { const a = THREE.MathUtils.clamp(x, 0, 1); return a * a * (3 - 2 * a); };

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
    const models = {} as Record<VesselKind, THREE.Group>;
    for (const kind of vesselKinds) {
      const model = index === 0 && kind === "wood-sail" ? templates[kind] : templates[kind].clone(true);
      model.name = kind === "wood-sail" && index === 0 ? "mythic-sailing-ship" : `pooled-${kind}`;
      model.traverse(object => {
        if (object.name === "near-vessel-details" || object.name === "galley-fixed-fittings") warmObjects.push(object);
        if (!(object instanceof THREE.Mesh)) return;
        object.castShadow = object.receiveShadow = false;
        const copy = (source: THREE.Material) => {
          let material = materials.get(source);
          if (!material) { material = source.clone(); material.transparent = true; materials.set(source, material); }
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
    return { root, models, materials, wake, light, journey: null as VesselJourney | null, opacity: 0 };
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
  let departureStates = new Map<number, { daylight: number; severity: number }>();

  function update(timestampMs: number, waterTime: number, options: VesselOptions) {
    if (disposed || !Number.isFinite(timestampMs + waterTime)) return;
    const restoring = previousTime === undefined || timestampMs - previousTime > 1000 || timestampMs < previousTime;
    const dt = previousTime === undefined ? 0 : THREE.MathUtils.clamp((timestampMs - previousTime) / 1000, 0, .1);
    previousTime = timestampMs;
    const key = `${Math.floor(timestampMs / vesselDepartureInterval)}:${options.forcedRoute ?? ""}:${options.forcedKind ?? ""}:${options.departureRevision ?? 0}`;
    if (scheduleKey !== key) {
      schedule = getVesselSchedule(timestampMs, options); scheduleKey = key;
      departureStates = new Map(schedule.map(journey => [journey.id,
        options.departureState?.(journey.startMs) ?? { daylight: options.daylight, severity: options.severity },
      ]));
    }
    const available = schedule.filter(journey => timestampMs < journey.startMs + journey.durationMs);
    const limit = options.low ? 3 : 5;
    const density = THREE.MathUtils.clamp(options.density ?? 1, 0, 2);
    const wanted = available.filter(journey => {
      const state = options.departureState ? departureStates.get(journey.id)! : options;
      const probability = THREE.MathUtils.clamp((.4 + .38 * state.daylight) * (1 - .8 * state.severity) * density * (options.low ? .7 : 1), 0, 1);
      return options.forcedRoute || options.forcedKind || journey.admission < probability;
    }).slice(-limit);
    const identity = (journey: VesselJourney) => `${journey.id}:${journey.kind}:${journey.route}`;
    const ids = new Set(wanted.map(identity));
    // Sleeping scenes must release obsolete assignments before filling the
    // current schedule, even when all five actors belonged to old voyages.
    if (restoring) for (const actor of actors) if (actor.journey && !ids.has(identity(actor.journey))) {
      actor.journey = null; actor.opacity = 0; actor.root.visible = false;
    }
    for (const journey of wanted) if (!actors.some(actor => actor.journey?.id === journey.id && actor.journey.route === journey.route && actor.journey.kind === journey.kind)) {
      // Assignments made earlier in this pass still have zero opacity. They
      // already reserve an actor for a wanted voyage and must not be replaced.
      const actor = actors.find(actor => !actor.journey || (actor.opacity < .004 && !ids.has(identity(actor.journey))));
      if (!actor) continue;
      for (const model of Object.values(actor.models)) model.visible = false;
      actor.journey = journey; actor.models[journey.kind].visible = true; actor.opacity = 0;
    }
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
      const height = sampleWaterHeight(point.x, point.z, waterTime) * scale;
      const half = journey.kind === "ferry" ? 5.5 : journey.kind === "wood-sail" ? 3.8 : 3;
      const x = Math.cos(point.yaw) * half, z = -Math.sin(point.yaw) * half;
      const bow = sampleWaterHeight(point.x + x, point.z + z, waterTime) * scale;
      const stern = sampleWaterHeight(point.x - x, point.z - z, waterTime) * scale;
      const tilt = THREE.MathUtils.clamp((bow - stern) / (half * 2), -.065, .065) * (options.reduced ? .25 : .7);
      actor.root.position.set(point.x, -8 + height - .09, point.z);
      const roll = THREE.MathUtils.clamp(.004 + options.windSpeed * .00055, .004, .018) * (options.reduced ? .22 : 1);
      actor.root.rotation.set(Math.sin(waterTime * .4 + journey.id) * roll, point.yaw, tilt, "YXZ");
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
    })).sort((a, b) => a.id - b.id || a.kind.localeCompare(b.kind) || a.route.localeCompare(b.route)); },
    dispose,
  };
}
