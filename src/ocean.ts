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
      windDirection: { value: 0 }, windSpeed: { value: 0 }, windInfluence: { value: 0 },
      sunPosition: { value: seaComposition.sun.clone() },
      moonPosition: { value: new THREE.Vector3(0, 80, -150) },
      skyHorizon: { value: new THREE.Color(.41, .59, .67) },
      skyZenith: { value: new THREE.Color(.13, .32, .44) },
      waterTint: { value: new THREE.Color(1, 1, 1) },
      lightColor: { value: new THREE.Color(1, .94, .82) },
      lightStrength: { value: 1 }, moonStrength: { value: 0 },
      waveScale: { value: 1 }, rainAmount: { value: 0 }, fogDensity: { value: .005 },
      rainDetail: { value: 1 },
      stormFlash: { value: 0 }, stormSource: { value: new THREE.Vector3(0, 45, -350) },
    },
    vertexShader: `${waves}
      varying vec3 vWorld;
      uniform float waveScale;
      void main() {
        vec4 world=modelMatrix*vec4(position,1.);
        world.y+=surface(world.xz).x*waveScale;
        vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: `${waves}
      varying vec3 vWorld;
      uniform vec3 sunPosition;
      uniform vec3 moonPosition, skyHorizon, skyZenith, waterTint, lightColor;
      uniform float lightStrength, moonStrength, waveScale, rainAmount, fogDensity, rainDetail;
      uniform float stormFlash; uniform vec3 stormSource;
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
      // Four nearby rain impacts form tiny expanding rings on the actual wave
      // surface. Distance filtering prevents sparkling or costly far ripples.
      vec3 rainRipples(vec2 world, float footprint) {
        if(rainAmount<.001 || rainDetail<.001 || footprint>.55) return vec3(0.);
        vec2 p=world*1.4,base=floor(p-.5);vec3 result=vec3(0.);
        for(int y=0;y<2;y++) for(int x=0;x<2;x++) {
          vec2 cell=base+vec2(float(x),float(y));float key=windHash(cell);
          vec2 centre=cell+vec2(.25+.5*key,.25+.5*windHash(cell+17.));
          float age=fract(time*(1.2+key*.5)+key*31.);
          vec2 q=p-centre;float distance=length(q),ring=distance-age*.48;
          float envelope=sin(age*3.141593)*pow(1.-age,2.);
          float crest=exp(-ring*ring/ .00085)*envelope;
          float dropWeight=1.-smoothstep(rainAmount*.85,rainAmount*.85+.15,windHash(cell+83.));
          result.x+=crest*dropWeight;
          result.yz+=q/max(distance,.001)*(-ring/.00085)*crest*dropWeight*.014;
        }
        return result*(1.-smoothstep(.12,.55,footprint))*rainAmount*rainDetail;
      }
      float shoreBreak(vec2 p, vec2 centre, float radius, float height) {
        vec2 q=(p-centre)/radius;
        // Edge distortion is bounded by .22. Outside this conservative ring,
        // the original shallows mask is zero without evaluating its three sines.
        float radius2=dot(q,q);
        if(radius2>2.5921 || radius2<.1156) return 0.;
        float edge=length(q)+.13*sin(q.x*4.+q.y*3.)+.09*sin(q.y*7.-q.x*2.);
        float shallows=smoothstep(.57,.82,edge)*(1.-smoothstep(.95,1.38,edge));
        float broken=smoothstep(.24,.84,.5+.5*sin(q.x*13.+q.y*8.-time*1.1));
        return shallows*broken*smoothstep(-.38,.65,height)*.42;
      }
      void main() {
        float footprint=max(length(dFdx(vWorld.xz)),length(dFdy(vWorld.xz)));
        vec3 wave=surface(vWorld.xz,footprint)*waveScale;
        vec3 grain=windGrain(vWorld.xz*.37+vec2(time*.018,-time*.011));
        vec3 impacts=rainRipples(vWorld.xz,footprint);
        float grainFilter=1.-smoothstep(.35,1.25,footprint*.37);
        float windEnergy=smoothstep(0.,20.,windSpeed)*windInfluence;
        vec2 slope=wave.yz+grain.yz*((mix(.07,.025+.07*windEnergy,windInfluence)+.045*rainAmount)*grainFilter)+impacts.yz;
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
        vec3 water=mix(vec3(.009,.065,.105),vec3(.028,.18,.205),clamp(.46+wave.x*.3,0.,1.))*waterTint;
        vec3 reflected=reflect(-viewDir,normal);
        vec3 sky=mix(skyHorizon,skyZenith,smoothstep(0.,.65,reflected.y));
        vec3 reflection=mix(vec3(.055,.15,.20)*waterTint,sky,smoothstep(-.12,.13,reflected.y));
        vec3 color=mix(water,reflection,fresnel);
        color+=skyHorizon*impacts.x*.035;

        // A rough-water GGX lobe forms a broken trail below the visible sun.
        // Pixel footprint broadens distant highlights, suppressing moire and
        // single-pixel flashes while retaining soft silver/gold on nearby crests.
        vec3 halfway=normalize(lightDir+viewDir);
        float nh=max(dot(normal,halfway),0.);
        float vh=max(dot(viewDir,halfway),0.);
        float roughness=mix(.275,.39,smoothstep(.05,.7,footprint))+(grain.x-.5)*.045*grainFilter+windEnergy*.035;
        float alpha=roughness*roughness,alpha2=alpha*alpha;
        float denominator=nh*nh*(alpha2-1.)+1.;
        float distribution=alpha2/(3.141593*denominator*denominator);
        float visibility=.5/(nl*sqrt(nv*nv*(1.-alpha2)+alpha2)+nv*sqrt(nl*nl*(1.-alpha2)+alpha2)+.0001);
        float sunFresnel=.0204+.9796*fifth(1.-vh);
        float glint=distribution*visibility*sunFresnel*nl;
        // Compress the peak smoothly instead of clipping a large white patch.
        color+=lightColor*(.28*glint/(.7+glint))*lightStrength;
        vec3 moonDir=normalize(moonPosition-vWorld);
        float moonAlignment=pow(max(dot(normal,normalize(moonDir+viewDir)),0.),110.);
        color+=vec3(.48,.62,.79)*moonAlignment*.12*moonStrength;
        float crest=smoothstep(.46,.81,wave.x)*smoothstep(.25,.55,length(wave.yz));
        color=mix(color,skyHorizon*.7,crest*.065);
        float wash=0.;
        ${reefWash}
        color=mix(color,skyHorizon*.88,wash);
        float distanceToEye=length(cameraPosition-vWorld);
        float haze=max(smoothstep(55.,235.,distanceToEye)*.8,1.-exp(-distanceToEye*distanceToEye*fogDensity*fogDensity));
        color=mix(color,skyHorizon,haze);
        // A broad, broken silver reflection follows the same offshore source.
        // This is a short radiance pulse, not a new lamp, mesh or shadow pass.
        if(stormFlash>.0001){
          vec2 sourceBearing=normalize(stormSource.xz-cameraPosition.xz);
          float alignment=max(0.,dot(normalize(vWorld.xz-cameraPosition.xz),sourceBearing));
          float band=pow(alignment,80.);
          float broken=.45+.55*max(0.,dot(normal,normalize(stormSource-vWorld)));
          color+=vec3(.48,.61,.78)*stormFlash*(.035+band*.23)*broken;
        }
        gl_FragColor=vec4(color,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const geometry = new THREE.PlaneGeometry(260, 240, 208, 192);
  // The plane's local Z becomes world Y after rotation. Include all six waves'
  // maximum combined displacement (less than 1.1 m) in its CPU culling bounds.
  geometry.computeBoundingBox();
  geometry.boundingBox!.min.z = -1.8;
  geometry.boundingBox!.max.z = 1.8;
  geometry.boundingSphere = geometry.boundingBox!.getBoundingSphere(new THREE.Sphere());
  const ocean = new THREE.Mesh(geometry, material);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -8, -122.9);
  return ocean;
}
