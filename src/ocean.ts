import * as THREE from "three";
import { waterSurfaceGLSL } from "./water-surface";
import { coastalReefs } from "./coastal-environment";

// The same height field drives geometry and lighting. Unequal directions,
// wavelengths and speeds prevent a repeating, synchronized wallpaper motion.
const waves = waterSurfaceGLSL();
const reefWash = coastalReefs.map(({ x, z, radius }) =>
  `wash=max(wash,shoreBreak(vWorld.xz,vec2(${x.toFixed(1)},${z.toFixed(1)}),${radius.toFixed(1)},wave.x));`).join('\n');
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
      float shoreBreak(vec2 p, vec2 centre, float radius, float height) {
        vec2 q=(p-centre)/radius;
        float edge=length(q)+.13*sin(q.x*4.+q.y*3.)+.09*sin(q.y*7.-q.x*2.);
        float shallows=smoothstep(.57,.82,edge)*(1.-smoothstep(.95,1.38,edge));
        float broken=smoothstep(.24,.84,.5+.5*sin(q.x*13.+q.y*8.-time*1.1));
        return shallows*broken*smoothstep(-.38,.65,height)*.42;
      }
      void main() {
        vec3 wave=surface(vWorld.xz);
        vec3 normal=normalize(vec3(-wave.y,1.,-wave.z));
        vec3 viewDir=normalize(cameraPosition-vWorld);
        vec3 lightDir=normalize(vec3(-.4,.8,-.35));
        float fresnel=pow(1.-max(dot(normal,viewDir),0.),4.);
        float sky=.5+.5*normal.z;
        vec3 water=mix(vec3(.018,.09,.14),vec3(.035,.24,.29),clamp(.5+wave.x*.65,0.,1.));
        vec3 reflection=mix(vec3(.09,.25,.34),vec3(.35,.56,.66),sky);
        vec3 color=mix(water,reflection,.22+fresnel*.5);
        float sun=pow(max(dot(normal,normalize(lightDir+viewDir)),0.),110.);
        color+=sun*vec3(.8,.69,.45)*.8;
        float crest=smoothstep(.15,.235,wave.x)*smoothstep(.05,.27,length(wave.yz));
        color=mix(color,vec3(.60,.74,.72),crest*.1);
        float wash=0.;
        ${reefWash}
        color=mix(color,vec3(.78,.86,.81),wash);
        float distanceToEye=length(cameraPosition-vWorld);
        color=mix(color,vec3(.50,.68,.74),smoothstep(55.,235.,distanceToEye)*.75);
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 240, 320, 288),
    material,
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -8, -122.9);
  ocean.frustumCulled = false; // Shader displacement is not represented by the flat CPU bounds.
  return ocean;
}
