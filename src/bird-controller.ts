import * as THREE from "three";
import { createSeededRandom } from "./calendar-seed";
import type { WeatherState } from "./weather-controller";

export const BIRD_KINDS = ["small-bird", "gull", "eagle"] as const;
export type BirdKind = typeof BIRD_KINDS[number];
/** Visits have quiet gaps; this grid never restarts at midnight or page load. */
export const BIRD_DEPARTURE_INTERVAL = 210_000;
const CAPACITY = 4;
const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
export type BirdJourney = {
  id: number; kind: BirdKind; count: number; startMs: number; durationMs: number;
  direction: number; phase: number; turns: number; rise: number; retreat: number; admission: number;
};

export function createBirdJourney(id: number): BirdJourney {
  const random = createSeededRandom(Math.imul(id, 7919) + 601031);
  const roll = random(), kind: BirdKind = roll < .17 ? "small-bird" : roll < .84 ? "gull" : "eagle";
  return {
    id, kind, count: kind === "eagle" ? 1 : kind === "small-bird" ? 2 : 1 + Math.floor(random() * 4),
    startMs: id * BIRD_DEPARTURE_INTERVAL + random() * 35_000,
    durationMs: (kind === "small-bird" ? 28 + random() * 10 : kind === "gull" ? 66 + random() * 25 : 100 + random() * 28) * 1000,
    direction: random() < .5 ? -1 : 1, phase: random() * Math.PI * 2,
    turns: 1.7 + random() * .7, rise: kind === "eagle" ? 25 + random() * 7 : 14 + random() * 5,
    retreat: kind === "eagle" ? 205 : 145, admission: random(),
  };
}

/** Analytic flight and tangent: no frame counters, integration drift or reset. */
export function sampleBirdFlight(journey: BirdJourney, timestampMs: number, member = 0, reduced = false) {
  const progress = (timestampMs - journey.startMs - member * 1150) / journey.durationMs;
  const u = Math.max(0, Math.min(1, progress)), angle = journey.phase + u * journey.turns * Math.PI * 2;
  const rate = journey.turns * Math.PI * 2, envelope = Math.sin(Math.PI * u), envelopeD = Math.PI * Math.cos(Math.PI * u);
  const lateral = (member - (journey.count - 1) * .5) * 2.25;
  let x: number, y: number, z: number, dx: number, dy: number, dz: number, ddx: number, ddz: number;
  if (journey.kind === "small-bird") {
    x = journey.direction * (90 - 180 * u) + lateral;
    y = 3 + Math.sin(u * Math.PI) * 1.4 + member * .3;
    z = -39 - u * 39 - member * 1.2;
    dx = -180 * journey.direction; dy = Math.cos(u * Math.PI) * Math.PI * 1.4; dz = -39;
    ddx = ddz = 0;
  } else {
    const radius = journey.kind === "eagle" ? 25 : 20, depth = radius * .55;
    x = journey.direction * (92 * (1 - u) ** 3 - 58 * u ** 4) + radius * envelope * Math.sin(angle) + lateral;
    y = 2.8 + journey.rise * u + .25 * envelope * Math.sin(angle * 2) + member * .35;
    z = -54 - journey.retreat * u * u + depth * envelope * Math.cos(angle) - member * 1.5;
    dx = journey.direction * (-276 * (1 - u) ** 2 - 232 * u ** 3)
      + radius * (envelopeD * Math.sin(angle) + envelope * Math.cos(angle) * rate);
    dy = journey.rise + .25 * (envelopeD * Math.sin(angle * 2) + envelope * Math.cos(angle * 2) * rate * 2);
    dz = -2 * journey.retreat * u + depth * (envelopeD * Math.cos(angle) - envelope * Math.sin(angle) * rate);
    ddx = journey.direction * (552 * (1 - u) - 696 * u * u)
      + radius * (-(Math.PI ** 2) * envelope * Math.sin(angle) + 2 * envelopeD * Math.cos(angle) * rate - envelope * Math.sin(angle) * rate * rate);
    ddz = -2 * journey.retreat + depth * (-(Math.PI ** 2) * envelope * Math.cos(angle) - 2 * envelopeD * Math.sin(angle) * rate - envelope * Math.cos(angle) * rate * rate);
  }
  const seconds = Math.max(0, timestampMs - journey.startMs) / 1000;
  const flapHz = journey.kind === "small-bird" ? 5.8 : journey.kind === "gull" ? 1.8 : .95;
  const burstCycle = journey.kind === "eagle" ? 18 : 11;
  const burst = .5 + .5 * Math.sin(seconds / burstCycle * Math.PI * 2 + journey.phase);
  const flapping = journey.kind === "small-bird" ? 1 : smooth((burst - (journey.kind === "eagle" ? .8 : .55)) / .2);
  const flap = .055 + Math.sin(seconds * flapHz * Math.PI * 2 + member * .8) * .48 * flapping * (reduced ? .18 : 1);
  const yawRate = (dz * ddx - dx * ddz) / Math.max(1, dx * dx + dz * dz);
  return {
    x, y, z, dx, dy, dz, progress, yaw: Math.atan2(-dz, dx), pitch: Math.atan2(dy, Math.hypot(dx, dz)),
    bank: THREE.MathUtils.clamp(yawRate * .15, -.24, .24) * (reduced ? .3 : 1), flap,
    alpha: progress >= 0 && progress < 1 ? smooth(u / .06) * smooth((1 - u) / .17) : 0,
  };
}

export function getBirdSchedule(timestampMs: number): BirdJourney[] {
  if (!Number.isFinite(timestampMs)) return [];
  const slot = Math.floor(timestampMs / BIRD_DEPARTURE_INTERVAL), journeys: BirdJourney[] = [];
  for (let id = slot - 1; id <= slot; id++) {
    const journey = createBirdJourney(id);
    if (journey.admission < .76 && timestampMs >= journey.startMs
      && timestampMs < journey.startMs + journey.durationMs + (journey.count - 1) * 1150) journeys.push(journey);
  }
  return journeys;
}

/** Body and both articulated wings share one tiny instanced draw and material. */
function birdGeometry() {
  const positions: number[] = [], wings: number[] = [], tones: number[] = [];
  type Point = readonly [number, number, number];
  const triangle = (a: Point, b: Point, c: Point, wing = 0, tone = .7) => {
    positions.push(...a, ...b, ...c); wings.push(wing, wing, wing); tones.push(tone, tone, tone);
  };
  const nose: Point = [.35, .025, 0], tail: Point = [-.3, 0, 0];
  const sides: Point[] = [[.04, .085, 0], [.04, 0, .065], [.04, -.055, 0], [.04, 0, -.065]];
  for (let i = 0; i < sides.length; i++) {
    triangle(nose, sides[i], sides[(i + 1) % sides.length]);
    triangle(tail, sides[(i + 1) % sides.length], sides[i]);
  }
  triangle([.3, .035, -.035], [.47, .015, 0], [.3, .035, .035], 0, .25);
  triangle([-.25, .015, 0], [-.49, .015, -.13], [-.49, .015, .13], 0, .35);
  for (const side of [-1, 1]) {
    const origin: Point = [.07, .015, side * .035];
    const rim: Point[] = [[.14, 0, side * .3], [-.01, 0, side * .65], [-.25, 0, side * .98],
      [-.3, 0, side * .79], [-.39, 0, side * .73], [-.31, 0, side * .63], [-.3, 0, side * .4], [-.18, 0, side * .12]];
    for (let index = 0; index < rim.length - 1; index++) triangle(origin, rim[index], rim[index + 1], side, index >= 1 && index <= 4 ? .32 : .76);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("birdWing", new THREE.Float32BufferAttribute(wings, 1));
  geometry.setAttribute("birdTone", new THREE.Float32BufferAttribute(tones, 1));
  geometry.setAttribute("birdPose", new THREE.InstancedBufferAttribute(new Float32Array(CAPACITY * 4), 4).setUsage(THREE.DynamicDrawUsage));
  geometry.computeBoundingSphere();
  return geometry;
}

export function createBirdController() {
  const group = new THREE.Group(); group.name = "coastal-bird-visits";
  const geometry = birdGeometry(), poses = geometry.getAttribute("birdPose") as THREE.InstancedBufferAttribute;
  const brightness = { value: 1 };
  const material = new THREE.MeshBasicMaterial({ color: "#d8d6cb", transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true });
  material.forceSinglePass = true;
  material.onBeforeCompile = shader => {
    shader.uniforms.birdBrightness = brightness;
    shader.vertexShader = shader.vertexShader.replace("#include <common>", `#include <common>
      attribute float birdWing, birdTone;
      attribute vec4 birdPose;
      varying vec3 vBirdAppearance;`);
    shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      if(abs(birdWing)>.5){
        float angle=birdPose.y*birdWing;
        float py=transformed.y;
        transformed.y=cos(angle)*py+sin(angle)*transformed.z;
        transformed.z=-sin(angle)*py+cos(angle)*transformed.z;
        // Broad primary feathers distinguish the distant eagle from a gull.
        if(birdPose.x>1.5)transformed.x-=abs(transformed.z)*.11;
      }
      vBirdAppearance=vec3(birdPose.x,birdPose.z,birdTone);`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>
      uniform float birdBrightness;
      varying vec3 vBirdAppearance;`);
    shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", `#include <color_fragment>
      float shade=vBirdAppearance.x>1.5?.22:(vBirdAppearance.x<.5?.35:vBirdAppearance.z);
      diffuseColor.rgb*=shade*birdBrightness;
      diffuseColor.a*=vBirdAppearance.y;`);
  };
  material.customProgramCacheKey = () => "coastal-instanced-birds-v1";
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY); mesh.name = "pooled-coastal-birds";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  mesh.castShadow = mesh.receiveShadow = false; group.add(mesh);
  const matrix = new THREE.Matrix4(), rotation = new THREE.Quaternion(), euler = new THREE.Euler(0, 0, 0, "YXZ");
  const position = new THREE.Vector3(), scale = new THREE.Vector3();
  const actors = Array.from({ length: CAPACITY }, () => ({ journey: null as BirdJourney | null, member: 0, opacity: 0, point: null as ReturnType<typeof sampleBirdFlight> | null }));
  let disposed = false, previousTime: number | undefined, scheduleSlot = NaN, schedule: BirdJourney[] = [], updates = 0;
  function update(timestampMs: number, weather: WeatherState, low: boolean, reduced: boolean, daylight: number) {
    if (disposed || !Number.isFinite(timestampMs)) return;
    const restoring = previousTime === undefined || timestampMs < previousTime || timestampMs - previousTime > 1000;
    const dt = previousTime === undefined ? 0 : THREE.MathUtils.clamp((timestampMs - previousTime) / 1000, 0, .1);
    previousTime = timestampMs; updates++;
    const slot = Math.floor(timestampMs / BIRD_DEPARTURE_INTERVAL);
    // Starts are jittered within a slot, so cache its candidates, not only the
    // visits already active on the first frame of that slot.
    if (slot !== scheduleSlot) {
      schedule = [createBirdJourney(slot - 1), createBirdJourney(slot)]; scheduleSlot = slot;
    }
    const weatherWeight = smooth((daylight - .12) / .3) * (1 - smooth((weather.precipitation - .015) / .28))
      * (1 - smooth((weather.windSpeed - 6) / 5)) * (1 - smooth(weather.snow / .15));
    const limit = low ? 2 : CAPACITY;
    const wanted: { journey: BirdJourney; member: number }[] = [];
    for (const journey of schedule) if (journey.admission < .76 && timestampMs >= journey.startMs
      && timestampMs < journey.startMs + journey.durationMs + (journey.count - 1) * 1150) {
      for (let member = 0; member < journey.count && wanted.length < limit; member++) wanted.push({ journey, member });
    }
    const wantedActor = (journey: BirdJourney, member: number) => wanted.some(value => value.journey.id === journey.id && value.member === member);
    if (restoring) for (const actor of actors) if (actor.journey && !wantedActor(actor.journey, actor.member)) {
      actor.journey = null; actor.opacity = 0; actor.point = null;
    }
    for (const request of wanted) if (!actors.some(actor => actor.journey?.id === request.journey.id && actor.member === request.member)) {
      const actor = actors.find(value => !value.journey);
      if (actor) { actor.journey = request.journey; actor.member = request.member; actor.opacity = 0; }
    }
    brightness.value = .42 + THREE.MathUtils.clamp(daylight, 0, 1) * .58;
    let visible = 0;
    for (let index = 0; index < CAPACITY; index++) {
      const actor = actors[index], journey = actor.journey;
      let kind = 0, flap = 0;
      if (journey) {
        const point = sampleBirdFlight(journey, timestampMs, actor.member, reduced); actor.point = point;
        const desired = wantedActor(journey, actor.member) ? point.alpha * weatherWeight : 0;
        actor.opacity = restoring ? desired : THREE.MathUtils.damp(actor.opacity, desired, 1.8, dt);
        if (actor.opacity < .001 && desired < .001) { actor.journey = null; actor.opacity = 0; actor.point = null; }
        else {
          kind = BIRD_KINDS.indexOf(journey.kind); flap = point.flap;
          const size = journey.kind === "small-bird" ? .31 : journey.kind === "gull" ? .78 : 1.08;
          position.set(point.x, point.y, point.z); scale.setScalar(size);
          euler.set(point.bank, point.yaw, point.pitch); rotation.setFromEuler(euler);
          matrix.compose(position, rotation, scale); mesh.setMatrixAt(index, matrix);
          visible++;
        }
      }
      poses.setXYZW(index, kind, flap, actor.opacity, 0);
    }
    mesh.instanceMatrix.needsUpdate = true; poses.needsUpdate = true;
    group.userData.visibleBirds = visible; group.userData.capacity = CAPACITY; group.userData.updates = updates;
  }
  return {
    group, warmObjects: [group, mesh] as THREE.Object3D[], update,
    snapshot() {
      return actors.filter(actor => actor.journey && actor.point && actor.opacity >= .001).map(actor => ({
        id: actor.journey!.id, member: actor.member, kind: actor.journey!.kind,
        position: [actor.point!.x, actor.point!.y, actor.point!.z], yaw: actor.point!.yaw, pitch: actor.point!.pitch,
        bank: actor.point!.bank, flap: actor.point!.flap, opacity: actor.opacity,
      })).sort((a, b) => a.id - b.id || a.member - b.member);
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose(); group.clear();
      for (const actor of actors) { actor.journey = null; actor.point = null; }
      schedule = []; group.userData.visibleBirds = 0;
    },
  };
}
