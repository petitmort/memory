// One height field for the GPU water and the boat's physical waterline.
export type WaterWind = {
  /** Direction the wind travels toward in world X/Z, not meteorological "from". */
  windDirection: number;
  windSpeed: number;
};
const swells = [
  [.92, .392, .36, .65, -.7, .3],
  [-.45, .893, .69, .32, .93, 2.1],
  [.24, .971, 1.43, .085, -1.3, 4.7],
  [.98, -.199, 4.15, .016, 1.7, 1.4],
  [.68, .733, 7.34, .008, -2.1, 3.8],
  [-.85, .527, 11.13, .005, 2.6, 5.2],
];
const WIND_DIRECTIONS = 8;
const clampWind = (speed: number) => Math.max(0, Math.min(20, Number.isFinite(speed) ? speed : 0)) / 20;
const windStrength = (speed: number) => { const f = clampWind(speed); return f * f * (3 - 2 * f); };

/**
 * Fixed phases survive changing weather: wind changes spectral energy rather
 * than rotating a running phase or multiplying a long elapsed time by a new
 * speed. Old wave trains fade as the new downwind trains gain energy. Higher
 * wind puts energy into the faster long waves as well as short wind ripples.
 */
const windModes = Array.from({ length: WIND_DIRECTIONS }, (_, i) => {
  const angle = i * Math.PI * 2 / WIND_DIRECTIONS;
  return {
    dx: Math.cos(angle), dz: Math.sin(angle),
    slowK: .32 + .011 * (i % 3), slowSpeed: .35 + .017 * (i % 4),
    longK: .24 + .009 * (i % 3), longSpeed: .83 + .041 * (i % 4),
    rippleK: 3.1 + .19 * (i % 3), rippleSpeed: 1.9 + .1 * (i % 4),
    phase: .3 + i * 2.17,
  };
});

/** Maximum before the existing weather multiplier; 1.011×1.6 < 1.8 m. */
export const WIND_WATER_HEIGHT_BOUND = 1.011;

export function sampleWaterHeight(x: number, z: number, time: number, wind?: WaterWind) {
  if (wind) {
    const strength = windStrength(wind.windSpeed);
    const direction = Number.isFinite(wind.windDirection) ? wind.windDirection : 0;
    const wx = Math.cos(direction), wz = Math.sin(direction);
    let height = 0, weightSum = 0;
    for (const mode of windModes) {
      const aligned = Math.max(0, wx * mode.dx + wz * mode.dz);
      const weight = aligned ** 6;
      if (weight < .000001) continue;
      const distance = x * mode.dx + z * mode.dz;
      // Negative temporal phase makes crests travel in +direction.
      const slow = Math.sin(distance * mode.slowK - time * mode.slowSpeed + mode.phase)
        * .3 * (1 - .55 * strength);
      const long = Math.sin(distance * mode.longK - time * mode.longSpeed + mode.phase * 1.7)
        * (.035 + .79 * strength);
      const ripple = Math.sin(distance * mode.rippleK - time * mode.rippleSpeed + mode.phase * 2.3)
        * (.006 + .045 * strength);
      height += (slow + long + ripple) * weight;
      weightSum += weight;
    }
    return height / Math.max(.000001, weightSum);
  }
  let height = 0;
  for (let i = 0; i < swells.length; i++) {
    const [dx, dz, k, amplitude, speed, phase] = swells[i];
    const modulation = i === 0 ? .88 + .12 * Math.sin(time * .21) : 1;
    height += Math.sin((x * dx + z * dz) * k + time * speed + phase) * amplitude * modulation;
  }
  return height;
}

export function waterSurfaceGLSL() {
  // Enough digits keep boat waterlines and GPU displacement on the same field.
  const f = (n: number) => Number.isInteger(n) ? `${n}.0` : `${n}`;
  const calls = swells.map(([dx, dz, k, amplitude, speed, phase], i) =>
    `swell(s,p,vec2(${f(dx)},${f(dz)}),${f(k)},${f(amplitude)}${i === 0 ? '*(.88+.12*sin(time*.21))' : ''},${f(speed)},${f(phase)},footprint);`).join('\n');
  const windCalls = windModes.map(mode => `
    windSwell(windSurface,weightSum,p,vec2(${f(mode.dx)},${f(mode.dz)}),
      ${f(mode.slowK)},${f(mode.slowSpeed)},${f(mode.longK)},${f(mode.longSpeed)},
      ${f(mode.rippleK)},${f(mode.rippleSpeed)},${f(mode.phase)},strength,footprint);`).join('\n');
  return `
    uniform float time;
    uniform float windDirection, windSpeed, windInfluence;
    void swell(inout vec3 s, vec2 p, vec2 direction, float k, float amplitude, float speed, float phase, float footprint) {
      float a=dot(p,direction)*k+time*speed+phase;
      // Subpixel ripples contribute roughness instead of unresolved bright dots.
      // Height remains unchanged, so the boat and displaced mesh share one sea.
      float slope=amplitude*k*cos(a)*(1.-smoothstep(.45,2.4,k*footprint));
      s+=vec3(amplitude*sin(a),slope*direction.x,slope*direction.y);
    }
    void windSwell(inout vec3 s, inout float weightSum, vec2 p, vec2 direction,
      float slowK, float slowSpeed, float longK, float longSpeed,
      float rippleK, float rippleSpeed, float phase, float strength, float footprint) {
      float aligned=max(0.,dot(vec2(cos(windDirection),sin(windDirection)),direction));
      float weight=aligned*aligned;weight=weight*weight*weight;
      if(weight<.000001) return;
      vec3 train=vec3(0.);
      swell(train,p,direction,slowK,.3*(1.-.55*strength),-slowSpeed,phase,footprint);
      swell(train,p,direction,longK,.035+.79*strength,-longSpeed,phase*1.7,footprint);
      swell(train,p,direction,rippleK,.006+.045*strength,-rippleSpeed,phase*2.3,footprint);
      s+=train*weight;weightSum+=weight;
    }
    vec3 surface(vec2 p, float footprint) {
      vec3 s=vec3(0.);
      if(windInfluence<1.) {
        ${calls}
        s*=1.-windInfluence;
      }
      if(windInfluence>0.) {
        vec3 windSurface=vec3(0.);float weightSum=0.;
        float strength=clamp(windSpeed/20.,0.,1.);strength=strength*strength*(3.-2.*strength);
        ${windCalls}
        s+=windSurface/max(.000001,weightSum)*windInfluence;
      }
      return s;
    }
    vec3 surface(vec2 p) { return surface(p,0.); }
  `;
}
