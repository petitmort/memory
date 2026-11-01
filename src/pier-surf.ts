import * as THREE from "three";
import { createSeededRandom } from "./calendar-seed";
import { PIER_FOOT_WIDTH, PIER_SEA_LEVEL, PIER_WIDTH, samplePierEdge, type PierSide } from "./pier-layout";
import { sampleWaterHeight } from "./water-surface";
import type { WeatherState } from "./weather-controller";

const CONTACTS_PER_SIDE = 12, DROPS_PER_CONTACT = 14;
const CAPACITY = CONTACTS_PER_SIDE * 2, DROP_CAPACITY = CAPACITY * DROPS_PER_CONTACT;
const STEP = .2, HISTORY = 3.6, LIFETIME = 3.2;
const clamp = THREE.MathUtils.clamp;
const smooth = (x: number) => { const t = clamp(x, 0, 1); return t * t * (3 - 2 * t); };
export type PierSurfWeather = Pick<WeatherState, "windSpeed" | "windDirection" | "waveScale">;
export type PierImpact = {
  amount: number; side: PierSide; x: number; z: number;
  tangentX: number; tangentZ: number; normalX: number; normalZ: number;
  crossingTime: number; baseHeight: number; height: number; energy: number; width: number;
};

function contact(amount: number, side: PierSide) {
  const p = samplePierEdge(amount, side), nx = p.normalX * side, nz = p.normalZ * side;
  // The footing is wider than the deck. Water starts beyond its actual face.
  const footing = (PIER_FOOT_WIDTH - PIER_WIDTH) * .5 + .045;
  return { amount, side, x: p.x + nx * footing, z: p.z + nz * footing,
    tangentX: p.tangentX, tangentZ: p.tangentZ, normalX: nx, normalZ: nz };
}

function crossing(point: ReturnType<typeof contact>, before: number, after: number, weather: PierSurfWeather): PierImpact | null {
  const threshold = .04 + weather.waveScale * .055;
  const h0 = sampleWaterHeight(point.x, point.z, before, weather) * weather.waveScale;
  const h1 = sampleWaterHeight(point.x, point.z, after, weather) * weather.waveScale;
  const velocity = (h1 - h0) / (after - before);
  if (h0 >= threshold || h1 < threshold || velocity < .035) return null;
  const crossingTime = before + (after - before) * (threshold - h0) / (h1 - h0);
  const gust = smooth(weather.windSpeed / 18);
  const incoming = Math.max(0, -Math.cos(weather.windDirection) * point.normalX - Math.sin(weather.windDirection) * point.normalZ);
  // A sheltered face retains scattered reflection; the windward face receives
  // the arriving train's momentum. Reversing wind exchanges these faces.
  const exposure = .25 + .75 * incoming;
  const energy = clamp((.2 + velocity * 1.2 + gust * .35) * exposure, .04, 1);
  // Local masonry and interference break a long arriving crest into unequal
  // plumes rather than a row of identical arches along the entire wall.
  const pocket = .74 + .26 * Math.sin(point.x * .73 + point.z * 1.19 + crossingTime * .47) ** 2;
  const height = (.36 + 2.55 * gust) * (.38 + .62 * energy) * exposure * pocket;
  const baseHeight = PIER_SEA_LEVEL + sampleWaterHeight(point.x, point.z, crossingTime + .23, weather) * weather.waveScale;
  const spread = .77 + .23 * Math.cos(point.x * 1.31 - point.z * .57) ** 2;
  return { ...point, crossingTime, baseHeight, height, energy, width: (1.3 + energy * 1.45) * spread };
}

/**
 * Bounded absolute-time reconstruction from the same crest field as the ocean.
 * Fixed buckets make initialization, frame-rate changes and resumed views agree.
 */
export function samplePierImpact(amount: number, side: PierSide, time: number, weather: PierSurfWeather): PierImpact | null {
  const point = contact(amount, side), bucket = Math.floor(time / STEP);
  let result: PierImpact | null = null;
  for (let i = bucket - Math.ceil(HISTORY / STEP); i <= bucket; i++) {
    const found = crossing(point, (i - 1) * STEP, i * STEP, weather);
    if (found && found.crossingTime <= time) result = found;
  }
  return result && time - result.crossingTime < LIFETIME ? result : null;
}

export function samplePierImpactShape(impact: PierImpact, time: number, reduced = false) {
  const age = time - impact.crossingTime;
  const rise = smooth(age / .42), drain = 1 - smooth((age - .54) / 1.05);
  const runup = impact.height * rise * drain * (reduced ? .55 : 1);
  return { age, runup, curl: smooth((age - .32) / .68),
    sheetAlpha: smooth(age / .12) * (1 - smooth((age - .7) / .78)) * (.3 + .55 * impact.energy),
    foamAlpha: smooth((age - .15) / .4) * (1 - smooth((age - 1.2) / 1.8)) * (.16 + .5 * impact.energy),
    foamSpread: .3 + smooth((age - .3) / 1.9) * (1.15 + impact.height * .42) };
}

const random = createSeededRandom(731993);
const dropSeeds = Array.from({ length: DROPS_PER_CONTACT }, () => ({
  launch: .22 + random() * .25, lift: .72 + random() * .28,
  along: random() * 2 - 1, spread: random() * 2 - 1,
  outward: .28 + random() * .55, size: .045 + random() * .07,
}));

/** Ballistic, outward-only splash droplets; never pass through the wall/deck. */
export function samplePierDroplet(impact: PierImpact, index: number, time: number, weather: PierSurfWeather, reduced = false) {
  const seed = dropSeeds[((index % DROPS_PER_CONTACT) + DROPS_PER_CONTACT) % DROPS_PER_CONTACT];
  const age = time - impact.crossingTime - seed.launch, gravity = 5.8;
  // Most pooled particles have not launched or have already landed. Avoid a
  // full six-train sea sample for those dormant particles on every frame.
  if (age < 0 || age >= 1.65) return { x: impact.x, y: impact.baseHeight, z: impact.z, age, size: seed.size, alpha: 0 };
  const height = impact.height * (reduced ? .45 : 1);
  const vy = Math.sqrt(2 * gravity * Math.max(.04, height)) * seed.lift;
  const outward = Math.max(.055, .07 + seed.outward * Math.max(0, age) * (.6 + height * .4));
  const along = seed.spread * impact.width * .4 + seed.along * Math.max(0, age) * .36;
  const x = impact.x + impact.normalX * outward + impact.tangentX * along;
  const z = impact.z + impact.normalZ * outward + impact.tangentZ * along;
  const y = impact.baseHeight + .13 + vy * age - gravity * age * age * .5;
  const sea = PIER_SEA_LEVEL + sampleWaterHeight(x, z, time, weather) * weather.waveScale;
  const alive = y > sea + .025;
  return { x, y, z, age, size: seed.size, alpha: alive ? smooth(age / .08) * (1 - smooth((age - .82) / .8)) * (.24 + impact.energy * .65) : 0 };
}

// Three.js expands includes only when the directive occupies its own line.
const fogVertex = "\n#include <fog_pars_vertex>\n";
const fogFragment = "\n#include <fog_pars_fragment>\n";
const surfNoise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}`;

/** Three fixed draws: a peeling water sheet, broken surface foam and spray. */
export function createPierSurf() {
  const group = new THREE.Group(); group.name = "pier-wave-surf";
  const common = () => ({ ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), daylight: { value: 1 }, time: { value: 0 } });
  const sheetGeometry = new THREE.PlaneGeometry(1, 1, 8, 10);
  const sheetStates = new Float32Array(CAPACITY * 4), sheetStyles = new Float32Array(CAPACITY * 4);
  const stateAttribute = new THREE.InstancedBufferAttribute(sheetStates, 4).setUsage(THREE.DynamicDrawUsage);
  const styleAttribute = new THREE.InstancedBufferAttribute(sheetStyles, 4).setUsage(THREE.DynamicDrawUsage);
  sheetGeometry.setAttribute("surfState", stateAttribute); sheetGeometry.setAttribute("surfStyle", styleAttribute);
  const sheetMaterial = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true, toneMapped: false,
    uniforms: common(),
    vertexShader: `attribute vec4 surfState,surfStyle;varying vec2 vUv;varying vec2 vSurf;${fogVertex}
      void main(){vUv=uv;vSurf=vec2(surfState.w,surfStyle.y);float u=uv.x-.5,v=uv.y;
        float angle=v*mix(1.27,2.22,surfState.z);
        float scallop=.82+.14*sin(uv.x*5.1+surfStyle.y)+.10*sin(uv.x*12.7+surfStyle.y*1.7);
        vec3 p=vec3(u*surfStyle.x,surfState.x+surfState.y*sin(angle)*scallop,
          .045+surfState.y*.23*(1.-cos(angle)));
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float daylight,time;varying vec2 vUv;varying vec2 vSurf;${fogFragment}${surfNoise}
      void main(){float lace=noise(vec2(vUv.x*17.+vSurf.y,vUv.y*12.-time*.45));
        float edge=smoothstep(0.,.12,vUv.x)*(1.-smoothstep(.88,1.,vUv.x));
        float lip=smoothstep(.68,.95,vUv.y);float broken=smoothstep(.28,.72,lace);
        float alpha=vSurf.x*edge*(.045+broken*.10+lip*broken*.65)*(1.-smoothstep(.96,1.,vUv.y));
        if(alpha<.005)discard;
        vec3 water=mix(vec3(.065,.11,.15),vec3(.22,.43,.49),daylight);
        vec3 froth=mix(vec3(.13,.2,.24),vec3(.81,.89,.87),daylight);
        vec3 color=mix(water,froth,lip*.88+broken*.12);
        gl_FragColor=vec4(color,alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const sheets = new THREE.InstancedMesh(sheetGeometry, sheetMaterial, CAPACITY);
  sheets.name = "pier-curling-wave-sheets"; sheets.frustumCulled = false; sheets.instanceMatrix.setUsage(THREE.DynamicDrawUsage); sheets.renderOrder = 1;
  group.add(sheets);

  const foamGeometry = new THREE.PlaneGeometry(1, 1, 8, 3);
  const foamStates = new Float32Array(CAPACITY * 4), foamAttribute = new THREE.InstancedBufferAttribute(foamStates, 4).setUsage(THREE.DynamicDrawUsage);
  foamGeometry.setAttribute("foamState", foamAttribute);
  const foamMaterial = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: true, toneMapped: false,
    uniforms: common(),
    vertexShader: `attribute vec4 foamState;varying vec2 vUv;varying vec2 vFoam;${fogVertex}
      void main(){vUv=uv;vFoam=foamState.zw;
        vec3 p=vec3((uv.x-.5)*foamState.x,foamState.y,.065+uv.y*(.4+foamState.w));
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(p,1.);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float daylight,time;varying vec2 vUv;varying vec2 vFoam;${fogFragment}${surfNoise}
      void main(){vec2 q=vec2((vUv.x-.5)*2.,vUv.y);float edge=(1.-smoothstep(.55,1.,abs(q.x)))*(1.-smoothstep(.12,1.,q.y));
        float cells=noise(vec2(vUv.x*22.,vUv.y*12.)+vec2(time*.06,-time*.18));
        float alpha=vFoam.x*edge*smoothstep(.29,.72,cells);if(alpha<.005)discard;
        gl_FragColor=vec4(mix(vec3(.13,.2,.24),vec3(.73,.84,.82),daylight),alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const foam = new THREE.InstancedMesh(foamGeometry, foamMaterial, CAPACITY);
  foam.name = "pier-broken-sea-foam"; foam.frustumCulled = false; foam.instanceMatrix.setUsage(THREE.DynamicDrawUsage); foam.renderOrder = 1; group.add(foam);

  const dropGeometry = new THREE.BufferGeometry(), positions = new Float32Array(DROP_CAPACITY * 3), dropStyles = new Float32Array(DROP_CAPACITY * 2);
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage), dropAttribute = new THREE.BufferAttribute(dropStyles, 2).setUsage(THREE.DynamicDrawUsage);
  dropGeometry.setAttribute("position", positionAttribute); dropGeometry.setAttribute("dropStyle", dropAttribute);
  const dropMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: true, toneMapped: false,
    uniforms: common(),
    vertexShader: `attribute vec2 dropStyle;varying float vAlpha;${fogVertex}
      void main(){vAlpha=dropStyle.y;vec4 mvPosition=modelViewMatrix*vec4(position,1.);
        gl_PointSize=clamp(dropStyle.x*900./max(10.,-mvPosition.z),.6,3.2);gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `uniform float daylight;varying float vAlpha;${fogFragment}
      void main(){vec2 p=gl_PointCoord*2.-1.;float r=dot(p,p);if(r>1.||vAlpha<.005)discard;
        float alpha=vAlpha*(1.-smoothstep(.15,1.,r));gl_FragColor=vec4(mix(vec3(.18,.26,.3),vec3(.84,.9,.88),daylight),alpha);
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const drops = new THREE.Points(dropGeometry, dropMaterial); drops.name = "pier-airborne-spray"; drops.frustumCulled = false; drops.renderOrder = 2; group.add(drops);
  const points = Array.from({ length: CAPACITY }, (_, i) => contact(.1 + .76 * (i % CONTACTS_PER_SIDE) / (CONTACTS_PER_SIDE - 1), i < CONTACTS_PER_SIDE ? 1 : -1));
  const impacts: (PierImpact | null)[] = points.map(() => null), matrix = new THREE.Matrix4();
  let lastBucket = -Infinity, lastTime = -Infinity, lastLow = false, lastReduced = false;
  let disposed = false, activeSheets = 0, activeFoam = 0, activeDrops = 0;
  const pose = (index: number, point: typeof points[number]) => {
    matrix.set(point.tangentX, 0, point.normalX, point.x, 0, 1, 0, 0, point.tangentZ, 0, point.normalZ, point.z, 0, 0, 0, 1);
    sheets.setMatrixAt(index, matrix); foam.setMatrixAt(index, matrix);
  };
  points.forEach((point, i) => pose(i, point));
  sheets.instanceMatrix.needsUpdate = foam.instanceMatrix.needsUpdate = true;
  return {
    group, warmObjects: [group, sheets, foam, drops],
    update(time: number, weather: PierSurfWeather, low = false, reduced = false, daylight = 1) {
      if (disposed) return;
      const bucket = Math.floor(time / STEP), reset = !Number.isFinite(lastBucket) || time < lastTime || time - lastTime > .65;
      activeSheets = activeFoam = activeDrops = 0;
      let packed = 0;
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (reset) impacts[i] = samplePierImpact(point.amount, point.side, time, weather);
        else if (bucket > lastBucket) for (let step = lastBucket + 1; step <= bucket; step++) {
          const hit = crossing(point, (step - 1) * STEP, step * STEP, weather);
          if (hit) impacts[i] = hit;
        }
        if (low && i % CONTACTS_PER_SIDE % 2) continue;
        if (low !== lastLow) pose(packed, point);
        const impact = impacts[i], currentHeight = PIER_SEA_LEVEL + sampleWaterHeight(point.x, point.z, time, weather) * weather.waveScale;
        let shape: ReturnType<typeof samplePierImpactShape> | undefined;
        if (impact) shape = samplePierImpactShape(impact, time, reduced);
        const alpha = shape?.sheetAlpha ?? 0, foamAlpha = shape?.foamAlpha ?? 0;
        sheetStates.set([currentHeight, shape?.runup ?? 0, shape?.curl ?? 0, alpha], packed * 4);
        sheetStyles.set([impact?.width ?? 2, i * 1.713, 0, 0], packed * 4);
        foamStates.set([(impact?.width ?? 2) * 1.13, currentHeight + .035, foamAlpha, shape?.foamSpread ?? 0], packed * 4);
        if (alpha > .015) activeSheets++; if (foamAlpha > .015) activeFoam++;
        for (let j = 0; j < DROPS_PER_CONTACT; j++) {
          const index = packed * DROPS_PER_CONTACT + j;
          const drop = impact && !(reduced || low && j % 3) ? samplePierDroplet(impact, j, time, weather, reduced) : null;
          positions[index * 3] = drop?.x ?? point.x; positions[index * 3 + 1] = drop?.y ?? PIER_SEA_LEVEL; positions[index * 3 + 2] = drop?.z ?? point.z;
          dropStyles[index * 2] = drop?.size ?? .05; dropStyles[index * 2 + 1] = drop?.alpha ?? 0;
          if (drop && drop.alpha > .01) activeDrops++;
        }
        packed++;
      }
      sheets.count = foam.count = packed; dropGeometry.setDrawRange(0, packed * DROPS_PER_CONTACT);
      if (low !== lastLow) sheets.instanceMatrix.needsUpdate = foam.instanceMatrix.needsUpdate = true;
      stateAttribute.needsUpdate = styleAttribute.needsUpdate = foamAttribute.needsUpdate = positionAttribute.needsUpdate = dropAttribute.needsUpdate = true;
      for (const material of [sheetMaterial, foamMaterial, dropMaterial]) { material.uniforms.time.value = time; material.uniforms.daylight.value = clamp(daylight, 0, 1); }
      lastBucket = bucket; lastTime = time; lastLow = low; lastReduced = reduced;
    },
    snapshot() { return { sheets: activeSheets, foam: activeFoam, droplets: activeDrops, time: lastTime,
      contacts: impacts.filter((impact): impact is PierImpact => !!impact && lastTime - impact.crossingTime < LIFETIME).map(impact => ({ ...impact, ...samplePierImpactShape(impact, lastTime, lastReduced) })) }; },
    dispose() {
      if (disposed) return; disposed = true;
      sheets.dispose(); foam.dispose();
      for (const geometry of [sheetGeometry, foamGeometry, dropGeometry]) geometry.dispose();
      for (const material of [sheetMaterial, foamMaterial, dropMaterial]) material.dispose();
      group.clear();
    },
  };
}
