import * as THREE from "three";
import { waterSurfaceGLSL } from "./water-surface";
import { coastalReefs } from "./coastal-environment";
import { seaComposition } from "./seascape";

// The same height field drives geometry and lighting. Unequal directions,
// wavelengths and speeds prevent a repeating, synchronized wallpaper motion.
const waves = waterSurfaceGLSL();
const reefWash = coastalReefs.map(({ x, z, radius }) =>
  `wash=max(wash,shoreBreak(vWorld.xz,vec2(${x.toFixed(1)},${z.toFixed(1)}),${radius.toFixed(1)},wave.x));`).join('\n');
export function createOcean() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      sunPosition: { value: seaComposition.sun.clone() },
    },
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
      uniform vec3 sunPosition;
      float fifth(float x) { float x2=x*x;return x2*x2*x; }
      float windHash(vec2 p) {
        vec3 h=fract(vec3(p.xyx)*.1031);
        h+=dot(h,h.yzx+33.33);
        return fract((h.x+h.y)*h.z);
      }
      vec3 windGrain(vec2 p) {
        vec2 cell=floor(p),f=fract(p),u=f*f*(3.-2.*f),du=6.*f*(1.-f);
        float a=windHash(cell),b=windHash(cell+vec2(1.,0.));
        float c=windHash(cell+vec2(0.,1.)),d=windHash(cell+1.);
        return vec3(mix(mix(a,b,u.x),mix(c,d,u.x),u.y),
          mix(b-a,d-c,u.y)*du.x,mix(c-a,d-b,u.x)*du.y);
      }
      float shoreBreak(vec2 p, vec2 centre, float radius, float height) {
        vec2 q=(p-centre)/radius;
        float edge=length(q)+.13*sin(q.x*4.+q.y*3.)+.09*sin(q.y*7.-q.x*2.);
        float shallows=smoothstep(.57,.82,edge)*(1.-smoothstep(.95,1.38,edge));
        float broken=smoothstep(.24,.84,.5+.5*sin(q.x*13.+q.y*8.-time*1.1));
        return shallows*broken*smoothstep(-.38,.65,height)*.42;
      }
      void main() {
        float footprint=max(length(dFdx(vWorld.xz)),length(dFdy(vWorld.xz)));
        vec3 wave=surface(vWorld.xz,footprint);
        vec3 grain=windGrain(vWorld.xz*.37+vec2(time*.018,-time*.011));
        float grainFilter=1.-smoothstep(.35,1.25,footprint*.37);
        vec2 slope=wave.yz+grain.yz*(.07*grainFilter);
        vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));
        vec3 viewDir=normalize(cameraPosition-vWorld);
        vec3 lightDir=normalize(sunPosition-vWorld);
        float nv=max(dot(normal,viewDir),.001);
        float nl=max(dot(normal,lightDir),.001);
        // Rough water averages sky reflection over a family of tiny normals.
        // The mean limits pale outlines on every intersecting swell.
        float reflectedView=mix(nv,max(viewDir.y,.001),.32);
        float fresnel=.0204+.9796*fifth(1.-reflectedView);

        // Deep blue-green body colour is seen through the water; grazing waves
        // reflect the pale horizon and the bluer sky, rather than a white coat.
        vec3 water=mix(vec3(.009,.065,.105),vec3(.028,.18,.205),clamp(.46+wave.x*.3,0.,1.));
        vec3 reflected=reflect(-viewDir,normal);
        vec3 sky=mix(vec3(.41,.59,.67),vec3(.13,.32,.44),smoothstep(0.,.65,reflected.y));
        vec3 reflection=mix(vec3(.055,.15,.20),sky,smoothstep(-.12,.13,reflected.y));
        vec3 color=mix(water,reflection,fresnel);

        // A rough-water GGX lobe forms a broken trail below the visible sun.
        // Pixel footprint broadens distant highlights, suppressing moire and
        // single-pixel flashes while retaining soft silver/gold on nearby crests.
        vec3 halfway=normalize(lightDir+viewDir);
        float nh=max(dot(normal,halfway),0.);
        float vh=max(dot(viewDir,halfway),0.);
        float roughness=mix(.275,.39,smoothstep(.05,.7,footprint))+(grain.x-.5)*.045*grainFilter;
        float alpha=roughness*roughness,alpha2=alpha*alpha;
        float denominator=nh*nh*(alpha2-1.)+1.;
        float distribution=alpha2/(3.141593*denominator*denominator);
        float visibility=.5/(nl*sqrt(nv*nv*(1.-alpha2)+alpha2)+nv*sqrt(nl*nl*(1.-alpha2)+alpha2)+.0001);
        float sunFresnel=.0204+.9796*fifth(1.-vh);
        float glint=distribution*visibility*sunFresnel*nl;
        // Compress the peak smoothly instead of clipping a large white patch.
        color+=vec3(1.,.94,.82)*(.28*glint/(.7+glint));
        float crest=smoothstep(.46,.81,wave.x)*smoothstep(.25,.55,length(wave.yz));
        color=mix(color,vec3(.60,.74,.72),crest*.085);
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
