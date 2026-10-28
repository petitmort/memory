import * as THREE from "three";

/** Depth-tested banks of coastal mist between the courtyard and the human eye. */
export function createCourtyardFog() {
  const group = new THREE.Group();
  group.name = "courtyard-coastal-fog";
  const cloudMap = createCloudNoise();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      cloudMap: { value: cloudMap },
      time: { value: 0 },
      clearance: { value: 0 },
      mistTint: { value: new THREE.Color("#9eb7ba") },
      mistLight: { value: new THREE.Color("#dce3de") },
    },
    vertexShader: `
      attribute vec4 fogParameters;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec4 vFog;
      void main() {
        vUv=uv;
        vFog=fogParameters;
        vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);
        vWorld=world.xyz;
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudMap;
      uniform float time;
      uniform float clearance;
      uniform vec3 mistTint;
      uniform vec3 mistLight;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec4 vFog;
      void main() {
        float layer=vFog.x;
        // Each bank moves at a different rate. The second sample gently bends
        // the broad cloud lobes; it never resolves into particles or sharp tiles.
        vec2 drift=vec2(time*(.018+layer*.012),time*(.003-layer*.005));
        vec2 gust=vec2(clearance*clearance*(.70+layer*.65),clearance*.08);
        vec2 uv=vWorld.xy*vFog.y+vec2(vFog.z,layer*1.93)-drift-gust;
        vec3 warp=texture2D(cloudMap,uv*.63+vec2(.31,-time*.007)).rgb;
        vec3 cloud=texture2D(cloudMap,uv+(warp.gb-.5)*.22).rgb;
        float billow=smoothstep(.25,.76,cloud.r*.82+cloud.g*.18);
        float thread=smoothstep(.34,.79,cloud.g)*.11;
        float opacity=(.095+billow*.48+thread)*vFog.w;

        // Wind opens an irregular, soft window at the doorway first. The last
        // wisps travel sideways and dissolve instead of switching off at once.
        vec2 fromDoor=(vWorld.xy-vec2(.55,1.35))*vec2(.78,.93);
        float edge=length(fromDoor)+(warp.r-.5)*.82+(cloud.b-.5)*.34;
        float radius=mix(-.65,3.7,smoothstep(.015,1.,clearance));
        float opening=(1.-smoothstep(radius-.38,radius+.56,edge))
          *smoothstep(.0,.22,clearance);
        opacity*=1.-opening;
        opacity*=1.-smoothstep(.63,1.,clearance);
        // The quad edges live outside the courtyard view; this falloff also
        // keeps a softened boundary if a future entry viewpoint is widened.
        vec2 border=smoothstep(vec2(0.),vec2(.09),vUv)
          *(1.-smoothstep(vec2(.91),vec2(1.),vUv));
        opacity*=border.x*border.y;
        if(opacity<.002) discard;
        float light=.19+cloud.r*.47+warp.b*.13;
        vec3 color=mix(mistTint,mistLight,light);
        // A shallow shaded underside gives the banks a soft, rounded volume.
        color*=.965+.035*cloud.g;
        gl_FragColor=vec4(color,opacity);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const geometry = new THREE.PlaneGeometry(12,7);
  // Far-to-near ordering matters inside the one transparent instanced draw.
  // None of the banks crosses the entry eye (Z=6.3) or the door (Z=2.7).
  const banks = [
    { z: 3.00, scale: .35, seed: .17, weight: .92 },
    { z: 3.60, scale: .42, seed: 1.43, weight: .90 },
    { z: 4.25, scale: .56, seed: 2.71, weight: .96 },
    { z: 4.95, scale: .84, seed: 4.23, weight: .94 },
    { z: 5.65, scale: 1.38, seed: 5.89, weight: .78 },
  ];
  const parameters: number[]=[];
  const mesh = new THREE.InstancedMesh(geometry,material,banks.length);
  mesh.name = "courtyard-fog-depth-banks";
  mesh.renderOrder = 8;
  // Decorative transparent density never becomes a door/book hit surface.
  mesh.raycast=()=>{};
  const transform = new THREE.Matrix4();
  banks.forEach((bank,index)=>{
    transform.makeTranslation(.55,1.65,bank.z);
    mesh.setMatrixAt(index,transform);
    parameters.push(index/(banks.length-1),bank.scale,bank.seed,bank.weight);
  });
  geometry.setAttribute("fogParameters",new THREE.InstancedBufferAttribute(new Float32Array(parameters),4));
  mesh.instanceMatrix.needsUpdate=true;
  mesh.computeBoundingBox();mesh.computeBoundingSphere();
  group.add(mesh);
  group.userData.clearance=0;
  group.userData.layers=banks.length;
  return {
    group,
    update(time:number,clearance:number,reduced:boolean) {
      const progress=THREE.MathUtils.clamp(clearance,0,1);
      group.visible=progress<1;
      group.userData.clearance=progress;
      material.uniforms.time.value=time*(reduced?.12:1);
      material.uniforms.clearance.value=progress;
    },
    dispose() {
      geometry.dispose();material.dispose();cloudMap.dispose();
      group.clear();
    },
  };
}

/** A seamless scalar density field generated once, not a new canvas every frame. */
function createCloudNoise() {
  const size=256,data=new Uint8Array(size*size*4);
  const hash=(x:number,y:number,period:number,seed:number)=>{
    let value=Math.imul((x%period+period)%period,374761393)
      +Math.imul((y%period+period)%period,668265263)+seed;
    value=Math.imul(value^(value>>>13),1274126177);
    return ((value^(value>>>16))>>>0)/4294967295;
  };
  function noise(u:number,v:number,cells:number,seed:number) {
    const x=u*cells,y=v*cells,ix=Math.floor(x),iy=Math.floor(y);
    const fx=x-ix,fy=y-iy,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    const a=hash(ix,iy,cells,seed),b=hash(ix+1,iy,cells,seed);
    const c=hash(ix,iy+1,cells,seed),d=hash(ix+1,iy+1,cells,seed);
    return (a+(b-a)*sx)*(1-sy)+(c+(d-c)*sx)*sy;
  }
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size,v=y/size,offset=(y*size+x)*4;
    const broad=noise(u,v,4,1731)*.60+noise(u,v,8,9731)*.28+noise(u,v,16,5197)*.12;
    const detail=noise(u,v,16,9127)*.50+noise(u,v,32,7531)*.32+noise(u,v,64,3779)*.18;
    const curl=noise(u,v,8,7193)*.68+noise(u,v,16,3319)*.32;
    data[offset]=Math.round(broad*255);data[offset+1]=Math.round(detail*255);
    data[offset+2]=Math.round(curl*255);data[offset+3]=255;
  }
  const texture=new THREE.DataTexture(data,size,size,THREE.RGBAFormat,THREE.UnsignedByteType);
  texture.name="courtyard-fog-seamless-density";
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;
  texture.needsUpdate=true;
  return texture;
}
