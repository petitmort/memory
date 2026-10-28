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
      windowRadius: { value: -.65 },
      openingStrength: { value: 0 },
      opacityFade: { value: 1 },
      mistTint: { value: new THREE.Color("#9eb7ba") },
      mistLight: { value: new THREE.Color("#dce3de") },
    },
    vertexShader: `
      attribute vec4 fogParameters;
      uniform float time;
      uniform float clearance;
      varying vec2 vUv;
      varying vec2 vWorldXY;
      varying vec2 vCloudUV;
      varying vec2 vWarpUV;
      varying float vWeight;
      void main() {
        vUv=uv;
        float layer=fogParameters.x;
        vWeight=fogParameters.w;
        vec4 world=modelMatrix*instanceMatrix*vec4(position,1.);
        vWorldXY=world.xy;
        // These coordinates are affine in world XY. Perspective-correct
        // interpolation is the same field as evaluating them per fragment.
        vec2 drift=vec2(time*(.018+layer*.012),time*(.003-layer*.005));
        vec2 gust=vec2(clearance*clearance*(.70+layer*.65),clearance*.08);
        vCloudUV=world.xy*fogParameters.y+vec2(fogParameters.z,layer*1.93)-drift-gust;
        vWarpUV=vCloudUV*.63+vec2(.31,-time*.007);
        gl_Position=projectionMatrix*viewMatrix*world;
      }
    `,
    fragmentShader: `
      uniform sampler2D cloudMap;
      uniform float clearance;
      uniform float windowRadius;
      uniform float openingStrength;
      uniform float opacityFade;
      uniform vec3 mistTint;
      uniform vec3 mistLight;
      varying vec2 vUv;
      varying vec2 vWorldXY;
      varying vec2 vCloudUV;
      varying vec2 vWarpUV;
      varying float vWeight;
      void main() {
        if(opacityFade<=0.) discard;
        vec2 fromDoor=(vWorldXY-vec2(.55,1.35))*vec2(.78,.93);
        float distanceFromDoor=length(fromDoor);
        // Both filtered density channels remain in [0,1], so their combined
        // edge displacement is bounded by (.82+.34)/2 = .58. Once the opening
        // has full strength, distance+.58 < radius-.38 guarantees zero alpha.
        // The extra .0001 is a conservative margin for floating-point error.
        if(clearance>=.22 && distanceFromDoor<windowRadius-.9601) discard;
        vec3 warp=texture2D(cloudMap,vWarpUV).rgb;
        vec3 cloud=texture2D(cloudMap,vCloudUV+(warp.gb-.5)*.22).rgb;
        float billow=smoothstep(.25,.76,cloud.r*.82+cloud.g*.18);
        float thread=smoothstep(.34,.79,cloud.g)*.11;
        float opacity=(.095+billow*.48+thread)*vWeight;

        float edge=distanceFromDoor+(warp.r-.5)*.82+(cloud.b-.5)*.34;
        float opening=(1.-smoothstep(windowRadius-.38,windowRadius+.56,edge))*openingStrength;
        opacity*=1.-opening;
        opacity*=opacityFade;
        vec2 border=smoothstep(vec2(0.),vec2(.09),vUv)
          *(1.-smoothstep(vec2(.91),vec2(1.),vUv));
        opacity*=border.x*border.y;
        if(opacity<.002) discard;
        float light=.19+cloud.r*.47+warp.b*.13;
        vec3 color=mix(mistTint,mistLight,light);
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
  group.userData.activeLayers=banks.length;
  const rayOrigin=new THREE.Vector3();
  const cornerCoordinates=[[-1,-1],[1,-1],[1,1],[-1,1]] as const;
  const cornerDirections=cornerCoordinates.map(()=>new THREE.Vector3());
  function bankIsFullyClear(z:number,innerRadius:number) {
    // A perspective frustum intersects each fixed Z bank in a convex
    // quadrilateral. The scaled Euclidean distance is convex, so its maximum
    // over that quadrilateral occurs at a corner. Requiring all four corners
    // inside the guaranteed transparent circle therefore covers every pixel.
    for(let i=0;i<cornerDirections.length;i++) {
      const direction=cornerDirections[i];
      const distance=(z-rayOrigin.z)/direction.z;
      if(!Number.isFinite(distance)||distance<=0)return false;
      const x=rayOrigin.x+direction.x*distance;
      const y=rayOrigin.y+direction.y*distance;
      if(!Number.isFinite(x)||!Number.isFinite(y)
        ||Math.hypot((x-.55)*.78,(y-1.35)*.93)>=innerRadius)return false;
    }
    return true;
  }
  return {
    group,
    update(time:number,clearance:number,reduced:boolean,camera?:THREE.PerspectiveCamera) {
      const progress=THREE.MathUtils.clamp(clearance,0,1);
      const windowRadius=THREE.MathUtils.lerp(-.65,3.7,THREE.MathUtils.smoothstep(progress,.015,1));
      let activeLayers=banks.length;
      // No camera keeps the original API and all five banks. Recompute from
      // the full prefix every update so resize can safely restore edge wisps.
      if(camera&&progress>=.22&&windowRadius>.9602) {
        rayOrigin.setFromMatrixPosition(camera.matrixWorld);
        let validRays=Number.isFinite(rayOrigin.x)&&Number.isFinite(rayOrigin.y)&&Number.isFinite(rayOrigin.z);
        for(let i=0;i<cornerDirections.length;i++) {
          const direction=cornerDirections[i].set(cornerCoordinates[i][0],cornerCoordinates[i][1],.5)
            .unproject(camera).sub(rayOrigin);
          if(!Number.isFinite(direction.x)||!Number.isFinite(direction.y)
            ||!Number.isFinite(direction.z)||Math.abs(direction.z)<1e-8)validRays=false;
        }
        // The shader's transparent bound is radius-.9601; one further .0001
        // makes this whole-bank decision conservative around floating error.
        if(validRays)while(activeLayers>0&&bankIsFullyClear(banks[activeLayers-1].z,windowRadius-.9602))activeLayers--;
      }
      mesh.count=activeLayers;
      group.visible=progress<1&&activeLayers>0;
      group.userData.clearance=progress;
      group.userData.activeLayers=activeLayers;
      material.uniforms.time.value=time*(reduced?.12:1);
      material.uniforms.clearance.value=progress;
      // Shared by every pixel and bank; evaluate only once per update.
      material.uniforms.windowRadius.value=windowRadius;
      material.uniforms.openingStrength.value=THREE.MathUtils.smoothstep(progress,0,.22);
      material.uniforms.opacityFade.value=1-THREE.MathUtils.smoothstep(progress,.63,1);
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
