import * as THREE from "three";
import { seaComposition } from "./seascape";
import { waterSurfaceGLSL } from "./water-surface";

// The same height field drives geometry and lighting. Unequal directions,
// wavelengths and speeds prevent a repeating, synchronized wallpaper motion.
const waves = waterSurfaceGLSL(seaComposition.kraken);
export function createOcean() {
  const material = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `${waves}
      varying vec3 vWorld;
      void main() {
        vec4 world=modelMatrix*vec4(position,1.);
        world.y+=surface(world.xz).x;
        vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: `${waves}
      varying vec3 vWorld;
      void main() {
        vec3 wave=surface(vWorld.xz);
        vec3 normal=normalize(vec3(-wave.y,1.,-wave.z));
        vec3 viewDir=normalize(cameraPosition-vWorld);
        vec3 lightDir=normalize(vec3(-.4,.8,-.35));
        float fresnel=pow(1.-max(dot(normal,viewDir),0.),4.);
        float sky=.5+.5*normal.z;
        vec3 water=mix(vec3(.025,.16,.24),vec3(.05,.36,.43),.5+wave.x);
        vec3 reflection=mix(vec3(.20,.49,.65),vec3(.60,.77,.84),sky);
        vec3 color=mix(water,reflection,.3+fresnel*.55);
        float sun=pow(max(dot(normal,normalize(lightDir+viewDir)),0.),110.);
        color+=sun*vec3(.8,.69,.45)*.8;
        float crest=smoothstep(.15,.235,wave.x)*smoothstep(.05,.27,length(wave.yz));
        color=mix(color,vec3(.72,.82,.77),crest*.23);
        vec2 whirlOffset=vWorld.xz-vec2(${seaComposition.kraken.x.toFixed(1)},${seaComposition.kraken.z.toFixed(1)});
        float whirlRadius=length(whirlOffset);
        float whirlFunnel=exp(-dot(whirlOffset,whirlOffset)/32.);
        float whirlPhase=atan(whirlOffset.y,whirlOffset.x)*3.+whirlRadius*1.8+time*.9;
        float foamBand=pow(max(0.,sin(whirlPhase+.15*sin(whirlRadius*4.1-time*.4))),18.);
        foamBand*=smoothstep(1.4,3.,whirlRadius)*(1.-smoothstep(6.,9.,whirlRadius));
        color=mix(color,vec3(.035,.18,.23),whirlFunnel*.62);
        color=mix(color,vec3(.77,.88,.84),foamBand*.62);
        float distanceToEye=length(cameraPosition-vWorld);
        color=mix(color,vec3(.60,.76,.81),smoothstep(55.,235.,distanceToEye)*.85);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 240, 208, 192),
    material,
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -8, -122.9);
  ocean.frustumCulled = false; // Shader displacement is not represented by the flat CPU bounds.
  return ocean;
}
