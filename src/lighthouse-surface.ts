import * as THREE from "three";
import { LIGHTHOUSE_BEAM, type LighthouseBeaconState } from "./lighthouse-beacon";

/** A Lambert receiver on the existing opaque land, not an overlay or a lamp.
 * Both land materials share one shader variant and one set of mutable uniforms.
 * Resource ownership remains with the scene's existing material collection.
 */
export function createLighthouseSurface(materials: THREE.MeshStandardMaterial[]) {
  const uniforms = {
    coastBeaconOrigin: { value: new THREE.Vector3() },
    coastBeaconDirection: { value: new THREE.Vector3(0, -LIGHTHOUSE_BEAM.slope, -1) },
    coastBeaconStrength: { value: 0 },
  };
  for (const material of materials) {
    material.customProgramCacheKey = () => "coastal-lighthouse-surface-v1";
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = `varying vec3 vCoastWorld;\n${shader.vertexShader}`
        .replace("#include <worldpos_vertex>", `#include <worldpos_vertex>
          vCoastWorld = (modelMatrix * vec4(transformed, 1.)).xyz;`);
      shader.fragmentShader = `uniform vec3 coastBeaconOrigin, coastBeaconDirection;
        uniform float coastBeaconStrength; varying vec3 vCoastWorld;\n${shader.fragmentShader}`
        .replace("#include <opaque_fragment>", `
          if (coastBeaconStrength > .0001 && vCoastWorld.z < -5.) {
            vec3 offset = vCoastWorld - coastBeaconOrigin;
            float along = dot(offset.xz, coastBeaconDirection.xz);
            if (along > 0. && along < ${LIGHTHOUSE_BEAM.reach.toFixed(1)}) {
              vec2 across = vec2(offset.x * coastBeaconDirection.z - offset.z * coastBeaconDirection.x,
                offset.y - coastBeaconDirection.y * along);
              float radius = .035 + ${LIGHTHOUSE_BEAM.radius.toFixed(1)} * along / ${LIGHTHOUSE_BEAM.reach.toFixed(1)};
              float cone = 1. - smoothstep(.24, 1., length(across) / radius);
              float reach = smoothstep(.6, 3., along) * (1. - smoothstep(${(LIGHTHOUSE_BEAM.reach * .78).toFixed(2)}, ${LIGHTHOUSE_BEAM.reach.toFixed(1)}, along));
              vec3 towardSource = normalize((viewMatrix * vec4(-offset, 0.)).xyz);
              float facing = max(0., dot(normal, towardSource));
              float shore = 1. - smoothstep(-18., -5., vCoastWorld.z);
              // Albedo and the actual slope retain green foliage / dark backs;
              // the scene's tone mapping and atmospheric fog still apply below.
              outgoingLight += diffuseColor.rgb * vec3(1., .86, .61)
                * (6. * coastBeaconStrength * cone * reach * facing * shore);
            }
          }
          #include <opaque_fragment>
        `);
    };
  }
  return {
    update(state?: LighthouseBeaconState) {
      uniforms.coastBeaconStrength.value = state?.beamStrength ?? 0;
      if (state) {
        uniforms.coastBeaconOrigin.value.set(state.origin.x, state.origin.y, state.origin.z);
        uniforms.coastBeaconDirection.value.set(state.direction.x, state.direction.y, state.direction.z);
      }
    },
    snapshot() {
      return { strength: uniforms.coastBeaconStrength.value,
        origin: uniforms.coastBeaconOrigin.value.toArray(), direction: uniforms.coastBeaconDirection.value.toArray() };
    },
  };
}
