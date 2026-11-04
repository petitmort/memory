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

function previewFrame(timestamp: number, event: StormEvent, weather: WeatherState, reduced: boolean): StormFrame {
  const strength = stormStrength(weather), flash = pulse(timestamp - event.strikeTime) * event.energy * strength;
  if(strength<=0)return {flash:0,eventId:null,strikeTime:0,thunderTime:0,distance:0,direction:0,energy:0,bolt:false};
  return { flash: reduced ? 0 : flash, eventId: event.eventId, strikeTime: event.strikeTime,
    thunderTime: event.thunderTime, distance: event.distance, direction: event.direction,
    energy: strength * event.energy, bolt: !reduced && event.bolt && flash > .001 };
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

/** Two prewarmed primitives; one ribbon holds its white core and soft halo. */
export function createStormController() {
  const group = new THREE.Group(); group.name = "offshore-convective-storm";
  const mainSegments = 18, maximumSegments = 36;
  const positions = new Float32Array(maximumSegments * 18);
  const attribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", attribute);
  const edges = new Float32Array(maximumSegments * 6);
  for (let i = 0; i < maximumSegments; i++) edges.set([-1, 1, -1, 1, 1, -1], i * 6);
  geometry.setAttribute('channelEdge', new THREE.BufferAttribute(edges, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 30, -355), 155);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    toneMapped: false, fog: false, forceSinglePass:true, uniforms: { opacity: { value: 0 } },
    vertexShader: `attribute float channelEdge;varying float vEdge;
      void main(){vEdge=channelEdge;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying float vEdge;uniform float opacity;
      void main(){float d=abs(vEdge);
        float core=1.-smoothstep(.14,.36,d);
        float halo=exp(-d*d*4.)*(1.-smoothstep(.72,1.,d));
        gl_FragColor=vec4(mix(vec3(.61,.77,1.),vec3(1.),core),opacity*(core+halo*.3));
        #include <colorspace_fragment>
      }`,
  });
  const bolt = new THREE.Mesh(geometry, material); bolt.name = "distant-lightning-channel";
  // Room/window depth still occludes both primitives; the glow never draws over HTML.
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { glow: { value: 0 } },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec2 vUv;uniform float glow;
      void main(){vec2 q=(vUv-.5)*2.;float fade=1.-smoothstep(.08,1.,length(q));
      gl_FragColor=vec4(vec3(.85,.91,1.),fade*glow);
      #include <colorspace_fragment>
      }`,
  });
  const cloud = new THREE.Mesh(new THREE.PlaneGeometry(155, 84), cloudMaterial);
  cloud.name = "subtle-intracloud-light";
  group.add(bolt, cloud);
  let disposed = false, lastGeometryId: string | null = null;
  let preview: StormEvent | undefined;
  const source = new THREE.Vector3(0, 45, -350);
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
    const segment = (a: readonly number[], b: readonly number[], width: number) => {
      const dx=b[0]-a[0], dy=b[1]-a[1], length=Math.hypot(dx,dy);
      const nx=-dy/length*width, ny=dx/length*width;
      const vertex=(point:readonly number[], side:number, index:number)=>positions.set(
        [point[0]+nx*side,point[1]+ny*side,point[2]], count*18+index*3);
      vertex(a,-1,0);vertex(a,1,1);vertex(b,-1,2);
      vertex(a,1,3);vertex(b,1,4);vertex(b,-1,5);count++;
    };
    for (let i = 0; i < mainSegments; i++) segment(nodes[i], nodes[i + 1], .95);
    for (const node of [4, 7, 10, 12, 14, 16]) {
      let previous = nodes[node]; const sign = random() < .5 ? -1 : 1;
      for (let branch = 0; branch < 3; branch++) {
        const next: [number, number, number] = [previous[0] + sign * (1 + random() * 2.7),
          previous[1] - 1.5 - random() * 2.8, previous[2] + (random() - .5) * 2];
        segment(previous, next, .48); previous = next;
      }
    }
    attribute.needsUpdate = true;
    cloud.position.set(event.x, event.height * .6, event.z - 1);
    source.set(event.x, event.height * .55, event.z);
    lastGeometryId = event.eventId;
  }
  writeBolt(stormEventForSlot(0)); geometry.setDrawRange(0, 6);
  return {
    group, source, warmObjects: [group, bolt, cloud],
    previewOnce(timestampMs: number, delayMs = 0) {
      if (disposed || !Number.isFinite(timestampMs + delayMs)) return;
      const event=stormEventForSlot(Math.floor(timestampMs/THUNDERSTORM_SLOT_MS),true);
      const x=-30+(event.x+90)/180*35, z=-330, height=64;
      const distance=Math.hypot(x,height/2-1.65,z),strikeTime=timestampMs+Math.max(0,Math.min(7000,delayMs));
      preview={...event,eventId:`preview:${timestampMs}`,x,z,height,distance,bolt:true,energy:1,
        direction:Math.atan2(x,-z),strikeTime,thunderTime:strikeTime+distance/SPEED_OF_SOUND*1000};
    },
    cancelPreview() { preview=undefined; },
    update(timestampMs: number, weather: WeatherState, low: boolean, reduced: boolean, daylight: number): StormFrame {
      if (disposed) return { ...lastFrame, flash: 0, bolt: false };
      if(preview && (timestampMs>preview.thunderTime+1500 || timestampMs<preview.strikeTime-7100)) preview=undefined;
      const showingPreview=preview && timestampMs>=preview.strikeTime ? preview : undefined;
      lastFrame = showingPreview ? previewFrame(timestampMs,showingPreview,weather,reduced) : sampleStorm(timestampMs, weather, reduced);
      const visual = showingPreview ? {event:showingPreview} : visibleEvent(timestampMs,weather);
      if (lastFrame.flash > 0 && visual.event.eventId !== lastGeometryId) writeBolt(visual.event);
      // Give daylight a legible white core, without an extra light or strobe.
      const activity = clamp(weather.thunder ?? 0);
      material.uniforms.opacity.value = lastFrame.bolt ? Math.min(.95,lastFrame.flash * (1.2+activity*.5)) : 0;
      cloudMaterial.uniforms.glow.value = lastFrame.flash * (.24+activity*.28) * (.8+.2*clamp(daylight));
      geometry.setDrawRange(0, (low ? mainSegments : maximumSegments) * 6);
      bolt.visible = material.uniforms.opacity.value > .0001;
      cloud.visible = cloudMaterial.uniforms.glow.value > .0001;
      group.userData.frame = lastFrame;
      return lastFrame;
    },
    snapshot() { return { ...lastFrame }; },
    dispose() {
      if (disposed) return;
      disposed = true; preview=undefined; material.uniforms.opacity.value = 0; cloudMaterial.uniforms.glow.value = 0;
      group.removeFromParent(); geometry.dispose(); material.dispose(); cloud.geometry.dispose(); cloudMaterial.dispose(); group.clear();
    },
  };
}
