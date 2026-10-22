import * as THREE from "three";

// The same height field drives geometry and lighting. Unequal directions,
// wavelengths and speeds prevent a repeating, synchronized wallpaper motion.
const waves = `
  uniform float time;
  void swell(inout vec3 s, vec2 p, vec2 direction, float k, float amplitude, float speed, float phase) {
    float a=dot(p,direction)*k+time*speed+phase;
    s+=vec3(amplitude*sin(a), amplitude*k*direction.x*cos(a), amplitude*k*direction.y*cos(a));
  }
  vec3 surface(vec2 p) {
    vec3 s=vec3(0.);
    swell(s,p,vec2(.92,.392),.75,.12*(.88+.12*sin(time*.21)),-.7,.3);
    swell(s,p,vec2(-.45,.893),1.27,.075,.93,2.1);
    swell(s,p,vec2(.24,.971),2.43,.037,-1.3,4.7);
    swell(s,p,vec2(.98,-.199),4.15,.016,1.7,1.4);
    swell(s,p,vec2(.68,.733),7.34,.008,-2.1,3.8);
    swell(s,p,vec2(-.85,.527),11.13,.005,2.6,5.2);
    return s;
  }
`;
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
        vec3 water=mix(vec3(.12,.32,.35),vec3(.27,.49,.49),.5+wave.x);
        vec3 reflection=mix(vec3(.49,.67,.68),vec3(.79,.83,.75),sky);
        vec3 color=mix(water,reflection,.3+fresnel*.55);
        float sun=pow(max(dot(normal,normalize(lightDir+viewDir)),0.),110.);
        color+=sun*vec3(.8,.69,.45)*.8;
        float crest=smoothstep(.15,.235,wave.x)*smoothstep(.05,.27,length(wave.yz));
        color=mix(color,vec3(.72,.82,.77),crest*.23);
        float distanceToEye=length(cameraPosition-vWorld);
        color=mix(color,vec3(.75,.8,.73),smoothstep(55.,235.,distanceToEye)*.85);
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
  ocean.position.set(0, -0.32, -122.9);
  ocean.frustumCulled = false; // Shader displacement is not represented by the flat CPU bounds.
  return ocean;
}
