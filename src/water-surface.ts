// One height field for the GPU water and the boat's physical waterline.
const swells = [
  [.92, .392, .36, .65, -.7, .3],
  [-.45, .893, .69, .32, .93, 2.1],
  [.24, .971, 1.43, .13, -1.3, 4.7],
  [.98, -.199, 4.15, .016, 1.7, 1.4],
  [.68, .733, 7.34, .008, -2.1, 3.8],
  [-.85, .527, 11.13, .005, 2.6, 5.2],
];
type Point = { x: number; z: number };
export function sampleWaterHeight(x: number, z: number, time: number, vortex: Point) {
  let height = 0;
  for (let i = 0; i < swells.length; i++) {
    const [dx, dz, k, amplitude, speed, phase] = swells[i];
    const modulation = i === 0 ? .88 + .12 * Math.sin(time * .21) : 1;
    height += Math.sin((x * dx + z * dz) * k + time * speed + phase) * amplitude * modulation;
  }
  const qx = x - vortex.x, qz = z - vortex.z, squared = qx * qx + qz * qz;
  height -= 1.7 * Math.exp(-squared / 23);
  height += .16 * Math.sin(Math.atan2(qz, qx) * 3 + Math.sqrt(squared) * 2 + time * 1.2) * Math.exp(-squared / 95);
  return height;
}

export function waterSurfaceGLSL(vortex: Point) {
  const f = (n: number) => n.toFixed(3);
  const calls = swells.map(([dx, dz, k, amplitude, speed, phase], i) =>
    `swell(s,p,vec2(${f(dx)},${f(dz)}),${f(k)},${f(amplitude)}${i === 0 ? '*(.88+.12*sin(time*.21))' : ''},${f(speed)},${f(phase)});`).join('\n');
  return `
    uniform float time;
    void swell(inout vec3 s, vec2 p, vec2 direction, float k, float amplitude, float speed, float phase) {
      float a=dot(p,direction)*k+time*speed+phase;
      s+=vec3(amplitude*sin(a),amplitude*k*direction.x*cos(a),amplitude*k*direction.y*cos(a));
    }
    vec3 surface(vec2 p) {
      vec3 s=vec3(0.);
      ${calls}
      vec2 q=p-vec2(${f(vortex.x)},${f(vortex.z)});
      float radius=length(q),funnel=exp(-dot(q,q)/23.);
      s.x-=1.7*funnel;
      s.yz+=q*(3.4/23.)*funnel;
      s.x+=.16*sin(atan(q.y,q.x)*3.+radius*2.+time*1.2)*exp(-dot(q,q)/95.);
      return s;
    }
  `;
}
