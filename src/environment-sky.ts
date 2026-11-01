import * as THREE from "three";
import type { CelestialState } from "./celestial-controller";
import type { WeatherState } from "./weather-controller";
import { DEFAULT_LOCATION, type CalendarLocation } from "./calendar-seed";
import { createNightSky } from "./night-sky";

/** Sky and moon use shared uniforms, never an external image or another light. */
export function createEnvironmentSky(sunGroup: THREE.Group, location: CalendarLocation = DEFAULT_LOCATION) {
  const group = new THREE.Group(); group.name = "calendar-sky";
  const horizon = new THREE.Color(), zenith = new THREE.Color();
  const nightSky = createNightSky(location);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { horizon: { value: horizon }, zenith: { value: zenith }, galaxyMap: { value: nightSky.galaxyMap },
      worldToGalactic: { value: nightSky.worldToGalactic }, galaxyStrength: nightSky.galaxyStrength },
    vertexShader: "varying vec3 vDirection;void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec3 vDirection;uniform vec3 horizon,zenith;
      uniform sampler2D galaxyMap;uniform mat3 worldToGalactic;uniform float galaxyStrength;
      void main(){vec3 direction=normalize(vDirection);float h=direction.y;
        vec3 color=mix(horizon,zenith,smoothstep(-.035,.32,h));
        if(galaxyStrength>.00001&&h>-.015){
          vec3 g=normalize(worldToGalactic*direction);
          vec2 uv=vec2(atan(g.y,g.x)/6.28318530718+.5,asin(clamp(g.z,-1.,1.))/3.14159265359+.5);
          color+=texture2D(galaxyMap,uv).rgb*galaxyStrength*smoothstep(-.015,.12,h);
        }
        gl_FragColor=vec4(color,1.);
      #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(350, 24, 12), material);
  dome.name = "continuous-day-night-sky"; dome.position.y = -8; dome.renderOrder = -10; group.add(dome);
  const moonMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, toneMapped: false,
    uniforms: { light: { value: new THREE.Vector3(0, 0, 1) }, opacity: { value: 1 } },
    vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: `varying vec2 vUv;uniform vec3 light;uniform float opacity;
      void main(){vec2 q=vUv*2.-1.;float r=dot(q,q);if(r>1.)discard;
        vec3 n=vec3(q,sqrt(max(0.,1.-r)));float lit=max(0.,dot(n,light));
        float maria=.9+.05*sin(q.x*21.+sin(q.y*13.))+.04*sin(q.y*37.+q.x*9.);
        vec3 col=vec3(.82,.86,.88)*maria*(.0015+.9985*sqrt(lit));
        gl_FragColor=vec4(col,opacity*(1.-smoothstep(.97,1.,r)));
        #include <colorspace_fragment>
      }`,
  });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), moonMaterial);
  moon.name = "continuous-phase-moon"; group.add(moon);
  group.add(nightSky.stars);
  const nightHorizon = new THREE.Color("#162538"), dayHorizon = new THREE.Color("#a4cbdc");
  const nightZenith = new THREE.Color("#071426"), dayZenith = new THREE.Color("#4b95be");
  const sunset = new THREE.Color("#e1a17b"), gray = new THREE.Color("#899aa5"), cold = new THREE.Color("#96aebb");
  const solarWhite = new THREE.Color("#fff9e8"), solarWarm = new THREE.Color("#ffd18a");
  const lightningWhite = new THREE.Color("#d9e7f1");
  let disposed = false;
  return {
    group, horizon, zenith, moon, warmObjects: [group, moon, nightSky.stars, sunGroup],
    update(celestial: CelestialState, weather: WeatherState, camera: THREE.Camera, flash = 0, timestamp = 946728000000, low = false, reduced = false) {
      if (disposed) return;
      const d = celestial.daylight, overcast = THREE.MathUtils.smoothstep(weather.cloudCover, .12, .98);
      horizon.copy(nightHorizon).lerp(dayHorizon, d);
      zenith.copy(nightZenith).lerp(dayZenith, d);
      const dusk = Math.exp(-Math.pow(celestial.sun.altitude / .17, 2)) * (1 - overcast * .85) * .6;
      horizon.lerp(sunset, dusk);
      horizon.lerp(gray, overcast * d * .94).lerp(cold, weather.snow * .16 * d);
      zenith.lerp(gray, overcast * d * .98).lerp(cold, weather.snow * .15 * d);
      // A single restrained cloud-light pulse; no new light or post-processing.
      horizon.lerp(lightningWhite, flash * (.28 + d * .2));
      zenith.lerp(lightningWhite, flash * (.23 + d * .19));
      sunGroup.position.fromArray(celestial.sun.direction).multiplyScalar(235);
      sunGroup.position.y -= 8;
      sunGroup.lookAt(camera.position);
      const sunOpacity = THREE.MathUtils.smoothstep(celestial.sun.altitude, -.035, .035)
        * (1 - THREE.MathUtils.smoothstep(weather.cloudCover, .64, .995)) * (1 - weather.cloudCover * .3);
      sunGroup.visible = sunOpacity > .001;
      sunGroup.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return;
        const m = object.material as THREE.Material & { opacity: number; color: THREE.Color };
        m.opacity = sunOpacity * (object.name === "solar-disc" ? 1 : .25);
        if (object.name === "solar-disc") m.color.copy(solarWarm).lerp(solarWhite, THREE.MathUtils.smoothstep(celestial.sun.altitude, .025, .35));
        m.transparent = true;
      });
      moon.position.fromArray(celestial.moon.direction).multiplyScalar(240); moon.position.y -= 8;
      moon.lookAt(camera.position);
      moonMaterial.uniforms.light.value.fromArray(celestial.moonLightDirection);
      moonMaterial.uniforms.opacity.value = THREE.MathUtils.smoothstep(celestial.moon.altitude, -.035, .025) * (1 - weather.cloudCover * .88) * (.18 + .82 * (1 - d));
      nightSky.update(celestial, weather, timestamp, low, flash, reduced);
      group.userData.daylight = d; group.userData.moonPhase = celestial.moonPhase;
      group.userData.timestamp = timestamp; group.userData.galaxyStrength = nightSky.galaxyStrength.value;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent(); dome.geometry.dispose(); material.dispose(); moon.geometry.dispose(); moonMaterial.dispose(); nightSky.dispose(); group.clear();
    },
  };
}
