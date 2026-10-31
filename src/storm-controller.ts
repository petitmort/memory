import * as THREE from "three";
import { createSeededRandom, seedFromString } from "./calendar-seed";
import type { WeatherState } from "./weather-controller";

/** A slot is a candidate, not a repeating playback loop; its strike is jittered. */
export const STORM_SLOT_MS = 110000;
/** Thunderstorms add irregular offshore discharges every 16–40 seconds. */
export const THUNDERSTORM_SLOT_MS = 28000;
export const STORM_FLASH_MS = 550;
export const SPEED_OF_SOUND = 343;
export type StormEvent = {
  eventId: string;
  strikeTime: number;
  thunderTime: number;
  /** Metres from the study to the offshore discharge, matching its scene position. */
  distance: number;
  /** Horizontal angle from the sea window's outward direction (-Z). */
  direction: number;
  x: number;
  z: number;
  height: number;
  energy: number;
  bolt: boolean;
};
export type StormFrame = {
  flash: number;
  eventId: string | null;
  strikeTime: number;
  thunderTime: number;
  distance: number;
  direction: number;
  energy: number;
  bolt: boolean;
};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t * t * (3 - 2 * t); };
const eventCache = new Map<string, StormEvent>();

/** Continuous convective gate: ordinary rain and windy clear weather never flash. */
export function stormStrength(weather: WeatherState): number {
  const rain = weather.precipitation * (1 - weather.snow);
  return smooth((rain - .62) / .3) * smooth((weather.cloudCover - .83) / .15)
    * smooth((weather.windSpeed - 5.3) / 2.5) * (1 - clamp(weather.snow));
}

/** Fixed arithmetic makes a refreshed, resumed or backgrounded world agree. */
export function stormEventForSlot(slot: number, enhanced = false): StormEvent {
  if (!Number.isSafeInteger(slot)) throw new RangeError("A storm slot must be a safe integer.");
  const key = `${enhanced ? 'active' : 'distant'}:${slot}`;
  const cached = eventCache.get(key);
  if (cached) return cached;
  const random = createSeededRandom(seedFromString(`aegean-convection:${slot}`));
  const strikeTime = enhanced ? slot * THUNDERSTORM_SLOT_MS + 4000 + random() * 12000 : slot * STORM_SLOT_MS + 17000 + random() * 46000;
  const x = (random() - .5) * 180, z = -300 - random() * 110;
  const height = 56 + random() * 30;
  // The middle of the channel is the acoustic source, not a distant image plane.
  const distance = Math.hypot(x, height / 2 - 1.65, z);
  const event: StormEvent = {
    eventId: `sea-storm:${enhanced ? 'active:' : ''}${slot}`, strikeTime, thunderTime: strikeTime + distance / SPEED_OF_SOUND * 1000,
    distance, direction: Math.atan2(x, -z), x, z, height,
    energy: .56 + random() * .44,
    // Some lightning remains inside or behind the distant cloud, with no bolt.
    bolt: random() > (enhanced ? .12 : .28),
  };
  if (eventCache.size >= 12) eventCache.delete(eventCache.keys().next().value!);
  eventCache.set(key, event);
  return event;
}

function latestEvent(timestampMs: number, enhanced = false): StormEvent {
  const slot = Math.floor(timestampMs / (enhanced ? THUNDERSTORM_SLOT_MS : STORM_SLOT_MS));
  const current = stormEventForSlot(slot, enhanced);
  return current.strikeTime <= timestampMs ? current : stormEventForSlot(slot - 1, enhanced);
}

function displayedEvent(timestampMs: number, weather: WeatherState) {
  const distant = latestEvent(timestampMs), active = latestEvent(timestampMs, true);
  const extra = clamp(weather.thunder ?? 0);
  return extra > 0 && active.strikeTime > distant.strikeTime
    ? { event: active, weight: extra } : { event: distant, weight: 1 };
}

function pulse(age: number) {
  return age >= 0 && age < STORM_FLASH_MS
    ? smooth(age / 45) * Math.exp(-age / 155) * smooth((STORM_FLASH_MS - age) / 170) : 0;
}

function visibleEvent(timestampMs: number, weather: WeatherState) {
  const distant=latestEvent(timestampMs), active=latestEvent(timestampMs,true);
  const base=pulse(timestampMs-distant.strikeTime)*distant.energy;
  const extra=pulse(timestampMs-active.strikeTime)*active.energy*clamp(weather.thunder??0);
  return {event:extra>base?active:distant, flash:clamp(base+extra)};
}

/**
 * Keep the latest strike's ID through thunder onset. The audio adapter consumes
 * crossings, never all missed events, and resets its baseline after pause/jumps.
 */
export function sampleStorm(timestampMs: number, weather: WeatherState, reduced = false): StormFrame {
  if (!Number.isFinite(timestampMs)) throw new RangeError("The storm timestamp must be finite.");
  const strength = stormStrength(weather);
  if (strength <= 0) return { flash: 0, eventId: null, strikeTime: 0, thunderTime: 0, distance: 0, direction: 0, energy: 0, bolt: false };
  const { event, weight } = displayedEvent(timestampMs, weather);
  const visual=visibleEvent(timestampMs,weather);
  // One smoothly attacked and decayed pulse, with no repeated strobing sub-bursts.
  return {
    flash: reduced ? 0 : visual.flash * strength,
    eventId: event.eventId, strikeTime: event.strikeTime, thunderTime: event.thunderTime,
    distance: event.distance, direction: event.direction, energy: strength * event.energy * weight,
    bolt: !reduced && visual.event.bolt && visual.flash > .001,
  };
}

/** Two prewarmed, shared primitives; no lights, textures, timers or per-drop work. */
export function createStormController() {
  const group = new THREE.Group(); group.name = "offshore-convective-storm";
  const mainSegments = 18, maximumSegments = 36;
  const positions = new Float32Array(maximumSegments * 6);
  const attribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", attribute);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, -355), 155);
  const material = new THREE.LineBasicMaterial({
    color: "#dce8ef", transparent: true, opacity: 0, depthWrite: false,
    toneMapped: false, fog: false,
  });
  const bolt = new THREE.LineSegments(geometry, material); bolt.name = "distant-lightning-channel";
  // Room/window depth still occludes both primitives; the glow never draws over HTML.
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { glow: { value: 0 } },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec2 vUv;uniform float glow;
      void main(){vec2 q=(vUv-.5)*2.;float fade=1.-smoothstep(.15,1.,length(q));
      gl_FragColor=vec4(vec3(.73,.82,.9),fade*fade*glow);
      #include <colorspace_fragment>
      }`,
  });
  const cloud = new THREE.Mesh(new THREE.PlaneGeometry(100, 56), cloudMaterial);
  cloud.name = "subtle-intracloud-light";
  group.add(bolt, cloud);
  let disposed = false, lastGeometryId: string | null = null;
  let lastFrame: StormFrame = { flash: 0, eventId: null, strikeTime: 0, thunderTime: 0, distance: 0, direction: 0, energy: 0, bolt: false };

  function writeBolt(event: StormEvent) {
    const random = createSeededRandom(seedFromString(`lightning-shape:${event.eventId}`));
    let count = 0;
    const nodes: [number, number, number][] = [];
    for (let i = 0; i <= mainSegments; i++) {
      const f = i / mainSegments;
      nodes.push([event.x + (random() - .5) * 3.8 + Math.sin(f * 8) * 1.4,
        event.height * (1 - f) - 7.5 * f, event.z + (random() - .5) * 2]);
    }
    const segment = (a: readonly number[], b: readonly number[]) => {
      positions.set(a, count * 6); positions.set(b, count * 6 + 3); count++;
    };
    for (let i = 0; i < mainSegments; i++) segment(nodes[i], nodes[i + 1]);
    for (const node of [4, 7, 10, 12, 14, 16]) {
      let previous = nodes[node]; const sign = random() < .5 ? -1 : 1;
      for (let branch = 0; branch < 3; branch++) {
        const next: [number, number, number] = [previous[0] + sign * (1 + random() * 2.7),
          previous[1] - 1.5 - random() * 2.8, previous[2] + (random() - .5) * 2];
        segment(previous, next); previous = next;
      }
    }
    attribute.needsUpdate = true;
    cloud.position.set(event.x, event.height * .78, event.z - 1);
    lastGeometryId = event.eventId;
  }
  writeBolt(stormEventForSlot(0)); geometry.setDrawRange(0, 2);
  return {
    group, warmObjects: [group, bolt, cloud],
    update(timestampMs: number, weather: WeatherState, low: boolean, reduced: boolean, daylight: number): StormFrame {
      if (disposed) return { ...lastFrame, flash: 0, bolt: false };
      lastFrame = sampleStorm(timestampMs, weather, reduced);
      const visual = visibleEvent(timestampMs,weather);
      if (lastFrame.flash > 0 && visual.event.eventId !== lastGeometryId) writeBolt(visual.event);
      // Daylight already limits the eye's adaptation; nighttime stays gentle too.
      const activity = clamp(weather.thunder ?? 0);
      material.opacity = lastFrame.bolt ? lastFrame.flash * (.25 + activity * .5 - clamp(daylight) * (.1 + activity * .08)) : 0;
      cloudMaterial.uniforms.glow.value = lastFrame.flash * (.075 + activity * .13 - clamp(daylight) * (.035 + activity * .025));
      geometry.setDrawRange(0, (low ? mainSegments : maximumSegments) * 2);
      bolt.visible = material.opacity > .0001;
      cloud.visible = cloudMaterial.uniforms.glow.value > .0001;
      group.userData.frame = lastFrame;
      return lastFrame;
    },
    snapshot() { return { ...lastFrame }; },
    dispose() {
      if (disposed) return;
      disposed = true; material.opacity = 0; cloudMaterial.uniforms.glow.value = 0;
      group.removeFromParent(); geometry.dispose(); material.dispose(); cloud.geometry.dispose(); cloudMaterial.dispose(); group.clear();
    },
  };
}
