// One height field for the GPU water and the boat's physical waterline.
const swells = [
  [.92, .392, .36, .65, -.7, .3],
  [-.45, .893, .69, .32, .93, 2.1],
  [.24, .971, 1.43, .085, -1.3, 4.7],
  [.98, -.199, 4.15, .016, 1.7, 1.4],
  [.68, .733, 7.34, .008, -2.1, 3.8],
  [-.85, .527, 11.13, .005, 2.6, 5.2],
];
export function sampleWaterHeight(x: number, z: number, time: number) {
  let height = 0;
  for (let i = 0; i < swells.length; i++) {
    const [dx, dz, k, amplitude, speed, phase] = swells[i];
    const modulation = i === 0 ? .88 + .12 * Math.sin(time * .21) : 1;
    height += Math.sin((x * dx + z * dz) * k + time * speed + phase) * amplitude * modulation;
  }
  return height;
}

export function waterSurfaceGLSL() {
  const f = (n: number) => n.toFixed(3);
  const calls = swells.map(([dx, dz, k, amplitude, speed, phase], i) =>
    `swell(s,p,vec2(${f(dx)},${f(dz)}),${f(k)},${f(amplitude)}${i === 0 ? '*(.88+.12*sin(time*.21))' : ''},${f(speed)},${f(phase)},footprint);`).join('\n');
  return `
    uniform float time;
    void swell(inout vec3 s, vec2 p, vec2 direction, float k, float amplitude, float speed, float phase, float footprint) {
      float a=dot(p,direction)*k+time*speed+phase;
      // Subpixel ripples contribute roughness instead of unresolved bright dots.
      // Height remains unchanged, so the boat and displaced mesh share one sea.
      float slope=amplitude*k*cos(a)*(1.-smoothstep(.45,2.4,k*footprint));
      s+=vec3(amplitude*sin(a),slope*direction.x,slope*direction.y);
    }
    vec3 surface(vec2 p, float footprint) {
      vec3 s=vec3(0.);
      ${calls}
      return s;
    }
    vec3 surface(vec2 p) { return surface(p,0.); }
  `;
}
