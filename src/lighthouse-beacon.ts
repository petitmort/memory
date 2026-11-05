import * as THREE from "three";
import { PIER_SEA_LEVEL, samplePierPath } from "./pier-layout";
import type { WeatherState } from "./weather-controller";

/** Shared dimensions for the visible cone and the land receiving its light. */
export const LIGHTHOUSE_BEAM = { periodMs: 28000, reach: 145, radius: 2.8, slope: .068 } as const;
const TAU = Math.PI * 2, { periodMs: PERIOD, reach: REACH, radius: RADIUS, slope: SLOPE } = LIGHTHOUSE_BEAM;
const radians = Math.PI / 180;
const clamp = THREE.MathUtils.clamp;
type Position = Readonly<{ x: number; y: number; z: number }>;
export type BeaconWeather = Pick<WeatherState, "visibility" | "precipitation">;
export type LighthouseBeaconState = {
  timestamp: number; angle: number; twilight: number; seaward: number;
  beamStrength: number; lanternIntensity: number;
  origin: { x: number; y: number; z: number };
  direction: { x: number; y: number; z: number };
  seaIntersection: { x: number; y: number; z: number };
};

/** Absolute calendar phase survives reading pauses and background suspension. */
export function sampleLighthouseBeacon(timestamp: number, sunAltitude: number, weather: BeaconWeather,
  origin: Position, reduced = false, low = false): LighthouseBeaconState {
  const path = samplePierPath(1), seawardAngle = Math.atan2(path.tangentZ, path.tangentX);
  const angle = reduced ? seawardAngle : ((timestamp % PERIOD + PERIOD) % PERIOD) / PERIOD * TAU;
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const dot = dx * path.tangentX + dz * path.tangentZ;
  // Coastal housing attenuates the shoreward sweep without extinguishing an
  // entire half-turn. The air/sea shaders fade the actual near-shore boundary.
  const seaward = THREE.MathUtils.smoothstep(dot, -.16, .24);
  const twilight = 1 - THREE.MathUtils.smoothstep(sunAltitude, -3 * radians, 8 * radians);
  const haze = clamp(1 - weather.visibility + weather.precipitation * .22, 0, 1);
  const beamStrength = twilight * (.4 + .6 * seaward) * (.6 + haze * .4) * (reduced ? .55 : 1) * (low ? .8 : 1);
  const horizontal = Math.max(0, origin.y - PIER_SEA_LEVEL) / SLOPE;
  return {
    timestamp, angle, twilight, seaward, beamStrength, origin: { ...origin },
    lanternIntensity: twilight * 1.2,
    direction: { x: dx, y: -SLOPE, z: dz },
    seaIntersection: { x: origin.x + dx * horizontal, y: PIER_SEA_LEVEL, z: origin.z + dz * horizontal },
  };
}

/** A soft-cored atmospheric beam; one pooled mesh, no extra light or shadow. */
export function createLighthouseBeacon(origin: Position) {
  const group = new THREE.Group(); group.name = "rotating-lighthouse-beacon";
  group.position.set(origin.x, origin.y, origin.z);
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const around = 12, sections = 16;
  for (let row = 0; row <= sections; row++) for (let column = 0; column <= around; column++) {
    const t = row / sections, angle = column / around * TAU, radius = .035 + RADIUS * t;
    positions.push(Math.cos(angle) * radius, Math.sin(angle) * radius - t * REACH * SLOPE, -t * REACH);
    normals.push(Math.cos(angle), Math.sin(angle), -RADIUS / REACH);
    uvs.push(column / around, t);
    if (row < sections && column < around) {
      const a = row * (around + 1) + column, b = a + around + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices);
  const material = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true, toneMapped: false, blending: THREE.AdditiveBlending,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), strength: { value: 0 }, seaLevel: { value: PIER_SEA_LEVEL } },
    vertexShader: `varying vec2 vUv;varying vec3 vNormal,vView;varying float vHeight,vWorldZ;
      #include <fog_pars_vertex>
      void main(){vUv=uv;vec4 world=modelMatrix*vec4(position,1.);vHeight=world.y;vWorldZ=world.z;
        vec4 mvPosition=viewMatrix*world;vNormal=normalMatrix*normal;vView=-mvPosition.xyz;
        gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float strength,seaLevel;varying vec2 vUv;varying vec3 vNormal,vView;varying float vHeight,vWorldZ;
      #include <fog_pars_fragment>
      void main(){if(vHeight<seaLevel+.025||vWorldZ>-5.||strength<.001)discard;
        float facing=pow(abs(dot(normalize(vNormal),normalize(vView))),1.35);
        float envelope=smoothstep(.001,.012,vUv.y)*(1.-smoothstep(.55,1.,vUv.y));
        float waterFade=smoothstep(seaLevel+.025,seaLevel+.5,vHeight);
        float shoreFade=1.-smoothstep(-18.,-5.,vWorldZ);
        float core=pow(facing,4.);
        float alpha=strength*(.045*facing+.32*core)*envelope*waterFade*shoreFade*mix(1.,.6,vUv.y);
        vec3 color=mix(vec3(.95,.76,.46),vec3(1.,.93,.76),pow(facing,3.));
        if(alpha<.0008)discard;gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const beam = new THREE.Mesh(geometry, material); beam.name = "lighthouse-narrow-air-beam";
  beam.frustumCulled = false; beam.renderOrder = 1; group.add(beam);
  let state: LighthouseBeaconState | undefined, disposed = false;
  return {
    group, warmObjects: [group, beam],
    update(timestamp: number, sunAltitude: number, weather: BeaconWeather, reduced = false, low = false) {
      if (disposed) return state;
      state = sampleLighthouseBeacon(timestamp, sunAltitude, weather, origin, reduced, low);
      group.rotation.y = Math.atan2(-state.direction.x, -state.direction.z);
      material.uniforms.strength.value = state.beamStrength;
      return state;
    },
    snapshot() { return state; },
    dispose() { if (disposed) return; disposed = true; geometry.dispose(); material.dispose(); group.clear(); },
  };
}
