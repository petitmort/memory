import * as THREE from "three";
import { createSeededRandom, positiveModulo } from "./calendar-seed";
import { sampleWeather, type WeatherKind, type WeatherState } from "./weather-controller";
import { cloudWindVector, createCloudWindIntegrator, type CloudWindVector } from "./cloud-wind";
import { dimensions as D } from "./dimensions";

const CAPACITY = 36, LOW_CAPACITY = 16;
const LAYER_SPEEDS = [.038, .03, .023] as const;
export const CLOUD_LIFETIME = 8 * 3600000, CLOUD_FADE_DURATION = 180000;
export type CloudOptions = { timeZone?: string; weather?: WeatherKind; windSpeed?: number; revision?: number; camera?: THREE.Camera };
type CloudSeed = { phase: number; offset: number; z: number; y: number; width: number; height: number; shade: number; layer: number };
function cloudSeed(index: number): CloudSeed {
  const random = createSeededRandom(893181 + index * 77917), layer = index % 3;
  return {
    phase: random(), offset: index / CAPACITY * CLOUD_LIFETIME + random() * 30000,
    // A low coastal bank stays in the study's shallow sky aperture. The upper
    // part of the old 17 m spread lived almost entirely above the window.
    z: -55 - layer * 55 - random() * 45, y: 5 + layer * 2.8 + random() * 8,
    width: 15 + layer * 14 + random() * 15, height: 7 + layer * 3 + random() * 7,
    shade: .82 + random() * .18, layer,
  };
}

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
function cloudLife(seed: CloudSeed, timestamp: number) {
  const cohort = Math.floor((timestamp + seed.offset) / CLOUD_LIFETIME);
  const birth = cohort * CLOUD_LIFETIME - seed.offset, age = timestamp - birth;
  return { cohort, birth, age, alpha: smooth(age / CLOUD_FADE_DURATION) * smooth((CLOUD_LIFETIME - age) / CLOUD_FADE_DURATION) };
}

function cloudSample(seed: CloudSeed, timestamp: number, displacement: CloudWindVector, reduced: boolean, carry?: CloudWindVector) {
  const life = cloudLife(seed, timestamp), speed = LAYER_SPEEDS[seed.layer] * (reduced ? .2 : 1);
  const rawX = seed.phase * 800 - 400 + displacement.x * speed + (carry?.x ?? 0);
  // Keep three outdoor depth bands. Their low-cost anisotropic projection
  // moves with signed wind in both axes, with gentler depth motion than X.
  const rawZ = seed.z + displacement.z * speed * .16 + (carry?.z ?? 0);
  const near = -55 - seed.layer * 55, far = near - 85;
  const x = positiveModulo(rawX + 400, 800) - 400, z = far + positiveModulo(rawZ - far, 85);
  const edge = smooth((x + 400) / 18) * smooth((400 - x) / 18)
    * smooth((z - far) / 8) * smooth((near - z) / 8);
  const loop = Math.floor((rawX + 400) / 800) + Math.floor((rawZ - far) / 85);
  return { x, y: seed.y, z, width: seed.width, height: seed.height, rawX, rawZ, loop, birth: life.birth, age: life.age, alpha: life.alpha * edge,
    variant: positiveModulo(seed.layer * 3 + life.cohort + loop, 8) };
}

const previewWind = createCloudWindIntegrator();
/** Pure absolute-time positions; optional constant winds support direction QA. */
export function sampleCloudPosition(index: number, timestampMs: number, windSpeed?: number, windDirection = .7, reduced = false, options: CloudOptions = {}) {
  const seed = cloudSeed(index), life = cloudLife(seed, timestampMs);
  const wind = windSpeed === undefined ? previewWind.integral(life.birth, timestampMs, options.timeZone)
    : cloudWindVector(windSpeed * life.age / 1000, windDirection);
  return cloudSample(seed, timestampMs, wind, reduced);
}

function cloudAtlas() {
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 256;
  const context = canvas.getContext("2d")!;
  for (let variant = 0; variant < 8; variant++) {
    const random = createSeededRandom(741 + variant * 7381), left = variant % 4 * 128, top = Math.floor(variant / 4) * 128;
    context.save(); context.beginPath(); context.rect(left, top, 128, 128); context.clip();
    for (let puff = 0; puff < 17; puff++) {
      const x = left + 23 + random() * 82, y = top + 48 + random() * 32;
      const radius = 13 + random() * 20;
      const gradient = context.createRadialGradient(x, y, radius * .12, x, y, radius);
      gradient.addColorStop(0, "rgba(255,255,255,.5)"); gradient.addColorStop(.6, "rgba(255,255,255,.34)"); gradient.addColorStop(.83, "rgba(255,255,255,.12)"); gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient; context.fillRect(Math.max(left, x - radius), Math.max(top, y - radius), Math.min(128, radius * 2), Math.min(128, radius * 2));
    }
    context.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

/** One instanced draw with a tiny original procedural texture atlas. */
export function createCloudController() {
  const group = new THREE.Group(); group.name = "calendar-cloud-layers";
  const geometry = new THREE.PlaneGeometry(1, 1), atlas = cloudAtlas();
  const styles = new Float32Array(CAPACITY * 4);
  const styleAttribute = new THREE.InstancedBufferAttribute(styles, 4).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("cloudStyle", styleAttribute);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true, toneMapped: false,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), cloudMap: { value: atlas }, cloudCover: { value: 0 }, daylight: { value: 1 }, lightDirection: { value: new THREE.Vector3(0, 1, -1) }, cold: { value: 0 },
      cloudLight: { value: new THREE.Color("#f4f3ed") }, cloudShade: { value: new THREE.Color("#859caa") }, cloudNight: { value: new THREE.Color("#192a3a") } },
    vertexShader: `
      attribute vec4 cloudStyle;
      varying vec2 vCloudUv;
      varying vec4 vCloudStyle;
      #include <fog_pars_vertex>
      void main() {
        vCloudUv=uv; vCloudStyle=cloudStyle;
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(position,1.);
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudMap;
      uniform float cloudCover;
      uniform float daylight;
      uniform float cold;
      uniform vec3 lightDirection;
      uniform vec3 cloudLight, cloudShade, cloudNight;
      varying vec2 vCloudUv;
      varying vec4 vCloudStyle;
      #include <fog_pars_fragment>
      void main() {
        float variant=floor(vCloudStyle.x+.1);
        vec2 tile=vec2(mod(variant,4.),floor(variant/4.));
        vec2 uv=vCloudUv;
        if(mod(variant,2.)>0.5) uv.x=1.-uv.x;
        float shape=texture2D(cloudMap,(tile+uv)/vec2(4.,2.)).a;
        float density=smoothstep(vCloudStyle.z-.16,vCloudStyle.z+.16,cloudCover);
        float body=mix(shape,smoothstep(.08,.76,shape),.45);
        float alpha=body*density*(.6+.25*cloudCover)*vCloudStyle.w*(.45+.55*daylight);
        if(alpha<.004) discard;
        float lit=clamp(smoothstep(.15,.85,uv.y)+dot(vec2(uv.x-.5,uv.y-.5),lightDirection.xy)*.16,.12,1.);
        vec3 day=mix(cloudShade,cloudLight,lit)*(1.-cloudCover*.24);
        vec3 night=cloudNight*(.75+lit*.25);
        vec3 color=mix(night,day,daylight)*vCloudStyle.y;
        color=mix(color,color*vec3(.91,.97,1.06),cold*.35);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.name = "wind-carried-clouds"; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  group.add(mesh);
  const seeds = Array.from({ length: CAPACITY }, (_, i) => cloudSeed(i)), dummy = new THREE.Object3D();
  const wind = createCloudWindIntegrator();
  const flowScratch: CloudWindVector = { x: 0, z: 0 };
  type Position = ReturnType<typeof cloudSample>;
  const last: (Position | undefined)[] = new Array(CAPACITY);
  const carry: ({ birth: number; x: number; z: number } | undefined)[] = new Array(CAPACITY);
  const visibleFrustum = new THREE.Frustum(), cloudBounds = new THREE.Box3();
  const expandedProjection = new THREE.Matrix4(), viewProjection = new THREE.Matrix4();
  const scores = new Float64Array(CAPACITY), retained = new Uint8Array(CAPACITY);
  const order = Uint8Array.from({ length: CAPACITY }, (_, index) => index);
  const rank = (a: number, b: number) => scores[b] - scores[a] || a - b;
  type ManualFlow = { key: string; start: number; from: CloudWindVector; to: CloudWindVector; anchors: CloudWindVector[] };
  let manual: ManualFlow | undefined, disposed = false;

  function manualVelocity(flow: ManualFlow, timestamp: number) {
    const amount = smooth((timestamp - flow.start) / 6000);
    return { x: THREE.MathUtils.lerp(flow.from.x, flow.to.x, amount), z: THREE.MathUtils.lerp(flow.from.z, flow.to.z, amount) };
  }
  function manualDisplacement(flow: ManualFlow, timestamp: number): CloudWindVector {
    const seconds = Math.max(0, timestamp - flow.start) / 1000, u = Math.min(1, seconds / 6);
    const curve = 6 * (u * u * u - .5 * u * u * u * u), after = Math.max(0, seconds - 6);
    return { x: flow.from.x * Math.min(seconds, 6) + (flow.to.x - flow.from.x) * curve + flow.to.x * after,
      z: flow.from.z * Math.min(seconds, 6) + (flow.to.z - flow.from.z) * curve + flow.to.z * after };
  }
  return {
    group,
    update(timestampMs: number, weather: WeatherState, low: boolean, reduced: boolean, daylight: number, lightDirection?: readonly [number, number, number], options: CloudOptions = {}) {
      if (disposed) return;
      const zone = options.timeZone ?? "Europe/Athens";
      wind.prepare(timestampMs, zone);
      const forced = options.weather !== undefined || options.windSpeed !== undefined;
      const key = `${zone}:${options.weather ?? ""}:${options.windSpeed ?? ""}:${options.revision ?? 0}`;
      const automatic = (index: number) => {
        const life = cloudLife(seeds[index], timestampMs), offset = carry[index];
        if (offset && offset.birth !== life.birth) carry[index] = undefined;
        return cloudSample(seeds[index], timestampMs, wind.integral(life.birth, timestampMs, zone, flowScratch), reduced, carry[index]);
      };
      if (forced && manual?.key !== key) {
        const state = sampleWeather(timestampMs, { kind: options.weather, windSpeed: options.windSpeed, timeZone: zone });
        const target = cloudWindVector(state.windSpeed, state.windDirection);
        const initial = !last.some(Boolean);
        const from = initial ? target : manual ? manualVelocity(manual, timestampMs) : wind.velocity(timestampMs, zone);
        const anchors = seeds.map((_, index) => {
          const p = last[index] ?? automatic(index);
          return { x: p.rawX, z: p.rawZ };
        });
        manual = { key, start: timestampMs, from, to: target, anchors };
      } else if (!forced && manual) {
        // Developer overrides keep their current position on reset. Only this
        // preview history persists until each cloud's next invisible rebirth.
        for (let i = 0; i < CAPACITY; i++) if (last[i]) {
          carry[i] = undefined;
          const p = automatic(i);
          carry[i] = { birth: p.birth, x: last[i]!.rawX - p.rawX, z: last[i]!.rawZ - p.rawZ };
        }
        manual = undefined;
      }
      const displacement = manual ? manualDisplacement(manual, timestampMs) : undefined;
      mesh.count = low ? LOW_CAPACITY : CAPACITY;
      // Keep all pooled positions current, including temporarily hidden low-
      // quality actors, so a later quality/preview change has a valid anchor.
      for (let i = 0; i < CAPACITY; i++) {
        const seed = seeds[i];
        let p: Position;
        if (manual && displacement) {
          const speed = LAYER_SPEEDS[seed.layer] * (reduced ? .2 : 1);
          const raw = { x: manual.anchors[i].x + displacement.x * speed, z: manual.anchors[i].z + displacement.z * speed * .16 };
          p = cloudSample(seed, timestampMs, { x: 0, z: 0 }, reduced, { x: raw.x - (seed.phase * 800 - 400), z: raw.z - seed.z });
        } else p = automatic(i);
        last[i] = p;
      }
      if (low && options.camera) {
        const camera = options.camera, eye = camera.position;
        // Scene motion updates the camera after environment evaluation. A
        // wider frustum and window margin keep approaching edge clouds pooled.
        expandedProjection.copy(camera.projectionMatrix);
        expandedProjection.elements[0] *= .84; expandedProjection.elements[5] *= .84;
        visibleFrustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(expandedProjection, camera.matrixWorldInverse));
        for (let i = 0; i < CAPACITY; i++) {
          const seed = seeds[i], p = last[i]!, halfWidth = seed.width / 2, halfHeight = seed.height / 2;
          cloudBounds.min.set(p.x - halfWidth, p.y - halfHeight, p.z - .1);
          cloudBounds.max.set(p.x + halfWidth, p.y + halfHeight, p.z + .1);
          const ratio = (-D.room.depth / 2 - eye.z) / (p.z - eye.z);
          const x0 = eye.x + (p.x - halfWidth - eye.x) * ratio, x1 = eye.x + (p.x + halfWidth - eye.x) * ratio;
          const y0 = eye.y + (p.y - halfHeight - eye.y) * ratio, y1 = eye.y + (p.y + halfHeight - eye.y) * ratio;
          const inWindow = ratio > 0 && ratio < 1 && x1 >= -D.window.width / 2 - .15 && x0 <= D.window.width / 2 + .15
            && y1 >= D.window.sill - .12 && y0 <= D.window.sill + D.window.height + .12;
          const threshold = .05 + (i % 12) / 12 * .84;
          const alpha = p.alpha * smooth((weather.cloudCover - threshold + .16) / .32);
          const wanted = inWindow && visibleFrustum.intersectsBox(cloudBounds) && alpha > .015;
          scores[i] = (wanted ? 1000000 : 0) + retained[i] * 1000 + alpha * seed.width * seed.height
            / Math.max(1, eye.distanceToSquared(dummy.position.set(p.x, p.y, p.z)));
        }
        order.sort(rank);
      }
      retained.fill(0);
      for (let slot = 0; slot < mesh.count; slot++) {
        const i = low && options.camera ? order[slot] : slot, seed = seeds[i], p = last[i]!;
        retained[i] = 1;
        dummy.position.set(p.x, p.y, p.z); dummy.scale.set(seed.width, seed.height, 1); dummy.updateMatrix(); mesh.setMatrixAt(slot, dummy.matrix);
        styles[slot * 4] = p.variant;
        styles[slot * 4 + 1] = seed.shade;
        styles[slot * 4 + 2] = .05 + (i % 12) / 12 * .84;
        styles[slot * 4 + 3] = p.alpha;
      }
      mesh.instanceMatrix.needsUpdate = true; styleAttribute.needsUpdate = true;
      material.uniforms.cloudCover.value = weather.cloudCover;
      material.uniforms.daylight.value = Math.max(0, Math.min(1, daylight));
      material.uniforms.cold.value = weather.snow;
      if (lightDirection) material.uniforms.lightDirection.value.fromArray(lightDirection);
      group.userData.count = mesh.count;
      group.userData.windCache = wind.stats();
    },
    dispose() {
      if (disposed) return;
      disposed = true; wind.clear(); group.removeFromParent(); mesh.dispose(); geometry.dispose(); material.dispose(); atlas.dispose(); group.clear();
    },
  };
}
