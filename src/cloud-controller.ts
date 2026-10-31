import * as THREE from "three";
import { createSeededRandom, positiveModulo } from "./calendar-seed";
import type { WeatherState } from "./weather-controller";

const CAPACITY = 36, LOW_CAPACITY = 16, TRAVEL_PERIOD = 131072;
type CloudSeed = { phase: number; cycles: number; z: number; y: number; width: number; height: number; shade: number };
function cloudSeed(index: number): CloudSeed {
  const random = createSeededRandom(893181 + index * 77917), layer = index % 3;
  return {
    phase: random(), cycles: 14 + Math.floor(random() * 17),
    z: -55 - layer * 55 - random() * 45, y: 7 + layer * 5 + random() * 17,
    width: 15 + layer * 14 + random() * 15, height: 7 + layer * 3 + random() * 7,
    shade: .82 + random() * .18,
  };
}

function cloudSample(seed: CloudSeed, timestampMs: number, windSpeed: number, windDirection: number, reduced: boolean) {
  const seconds = timestampMs / 1000, cycles = reduced ? Math.max(1, Math.round(seed.cycles * .2)) : seed.cycles;
  const travel = seconds / TRAVEL_PERIOD * cycles + seed.phase;
  const loop = Math.floor(travel), phase = positiveModulo(travel, 1);
  // The bounded gust changes with weather without multiplying a new wind
  // speed by the entire Unix clock (which would teleport every cloud).
  const gust = (Math.sin(seconds / 911 + seed.phase * 7) + Math.sin(seconds / 237 + seed.phase * 3) * .2) * windSpeed;
  return { x: phase * 800 - 400 + gust * Math.cos(windDirection), y: seed.y, z: seed.z + gust * Math.sin(windDirection) * .3, loop };
}

export function sampleCloudPosition(index: number, timestampMs: number, windSpeed = 4, windDirection = .7, reduced = false) {
  return cloudSample(cloudSeed(index), timestampMs, windSpeed, windDirection, reduced);
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
      gradient.addColorStop(0, "rgba(255,255,255,.35)"); gradient.addColorStop(.5, "rgba(255,255,255,.18)"); gradient.addColorStop(1, "rgba(255,255,255,0)");
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
  const styles = new Float32Array(CAPACITY * 3);
  const styleAttribute = new THREE.InstancedBufferAttribute(styles, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("cloudStyle", styleAttribute);
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), cloudMap: { value: atlas }, cloudCover: { value: 0 }, daylight: { value: 1 }, lightDirection: { value: new THREE.Vector3(0, 1, -1) }, cold: { value: 0 } },
    vertexShader: `
      attribute vec3 cloudStyle;
      varying vec2 vCloudUv;
      varying vec3 vCloudStyle;
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
      varying vec2 vCloudUv;
      varying vec3 vCloudStyle;
      #include <fog_pars_fragment>
      void main() {
        float variant=floor(vCloudStyle.x+.1);
        vec2 tile=vec2(mod(variant,4.),floor(variant/4.));
        vec2 uv=vCloudUv;
        if(mod(variant,2.)>0.5) uv.x=1.-uv.x;
        float shape=texture2D(cloudMap,(tile+uv)/vec2(4.,2.)).a;
        float density=smoothstep(vCloudStyle.z-.16,vCloudStyle.z+.16,cloudCover);
        float alpha=shape*density*(.48+.35*cloudCover);
        if(alpha<.004) discard;
        float lit=clamp(.72+(uv.y-.45)*.18+dot(vec2(uv.x-.5,uv.y-.5),lightDirection.xy)*.15,.5,1.);
        vec3 day=mix(vec3(.72,.77,.80),vec3(.98,.97,.93),lit)*(1.-cloudCover*.18);
        vec3 night=vec3(.10,.14,.21)*(1.+lit*.25);
        vec3 color=mix(night,day,daylight)*vCloudStyle.y;
        color=mix(color,color*vec3(.91,.97,1.06),cold*.35);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, CAPACITY);
  mesh.name = "wind-carried-clouds"; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false;
  group.add(mesh);
  const seeds = Array.from({ length: CAPACITY }, (_, i) => cloudSeed(i)), dummy = new THREE.Object3D();
  let disposed = false;
  return {
    group,
    update(timestampMs: number, weather: WeatherState, low: boolean, reduced: boolean, daylight: number, lightDirection?: readonly [number, number, number]) {
      if (disposed) return;
      mesh.count = low ? LOW_CAPACITY : CAPACITY;
      for (let i = 0; i < mesh.count; i++) {
        const seed = seeds[i], p = cloudSample(seed, timestampMs, weather.windSpeed, weather.windDirection, reduced);
        dummy.position.set(p.x, p.y, p.z); dummy.scale.set(seed.width, seed.height, 1); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        // A new silhouette is selected only at the far, off-screen wrap edge.
        styles[i * 3] = positiveModulo(i * 3 + p.loop, 8);
        styles[i * 3 + 1] = seed.shade;
        styles[i * 3 + 2] = .05 + (i % 12) / 12 * .84;
      }
      mesh.instanceMatrix.needsUpdate = true; styleAttribute.needsUpdate = true;
      material.uniforms.cloudCover.value = weather.cloudCover;
      material.uniforms.daylight.value = Math.max(0, Math.min(1, daylight));
      material.uniforms.cold.value = weather.snow;
      if (lightDirection) material.uniforms.lightDirection.value.fromArray(lightDirection);
      group.userData.count = mesh.count;
    },
    dispose() {
      if (disposed) return;
      disposed = true; group.removeFromParent(); geometry.dispose(); material.dispose(); atlas.dispose(); group.clear();
    },
  };
}
