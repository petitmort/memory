import * as THREE from 'three';

export type ReadingPose = { p: THREE.Vector3; t: THREE.Vector3; fov: number };
/** Derivatives per millisecond, rather than per remaining-path fraction. */
export type ReadingVelocity = ReadingPose;
export type ReadingSample = ReadingPose & { velocity: ReadingVelocity };
export type ReadingPath = { sample(progress: number): ReadingSample };
export type ReadingClock = { elapsed: number; duration: number; lastDrawAt: number | null };

/** Even a last-moment screen rotation needs several visible frames to settle. */
export function readingRetargetDuration(clock: Pick<ReadingClock,'elapsed' | 'duration'>) {
  return Math.max(300,clock.duration-clock.elapsed);
}

/** A new movement begins on its first drawn frame, even after a long read. */
export function advanceReadingClock(clock: ReadingClock, now: number) {
  const delta = clock.lastDrawAt === null ? 0 : THREE.MathUtils.clamp(now-clock.lastDrawAt,0,100);
  clock.lastDrawAt = now;
  clock.elapsed = Math.min(clock.duration,clock.elapsed+delta);
  return clock.elapsed/clock.duration;
}

/** Preserve the established approach and its gentle shoulder-height arc. */
export function createReadingPath(from: ReadingPose, to: ReadingPose, duration: number): ReadingPath {
  const shoulder = from.p.clone().lerp(to.p,.5); shoulder.y += .035;
  const curve = new THREE.CatmullRomCurve3([from.p.clone(),shoulder,to.p.clone()],false,'centripetal');
  return {
    sample(progress) {
      const a = THREE.MathUtils.clamp(progress,0,1);
      const ease = a*a*(3-2*a), rate = 6*a*(1-a)/duration;
      // CatmullRom's public tangent is normalized; sample its actual parametric
      // derivative so a replacement path retains speed as well as direction.
      const before = Math.max(0,ease-.00001), after = Math.min(1,ease+.00001);
      const velocity = curve.getPoint(after).sub(curve.getPoint(before)).multiplyScalar(rate/(after-before));
      return {
        p:curve.getPoint(ease),t:from.t.clone().lerp(to.t,ease),fov:THREE.MathUtils.lerp(from.fov,to.fov,ease),
        velocity:{p:velocity,t:to.t.clone().sub(from.t).multiplyScalar(rate),fov:(to.fov-from.fov)*rate},
      };
    },
  };
}

/** Redirect a moving eye without pausing it; arrive at the new pose at rest. */
export function retargetReadingPath(from: ReadingSample, to: ReadingPose, duration: number): ReadingPath {
  return {
    sample(progress) {
      const a = THREE.MathUtils.clamp(progress,0,1), a2 = a*a, a3 = a2*a;
      const start = 2*a3-3*a2+1, tangent = a3-2*a2+a, end = -2*a3+3*a2;
      const startRate = (6*a2-6*a)/duration, tangentRate = 3*a2-4*a+1, endRate = (-6*a2+6*a)/duration;
      const vector = (initial: THREE.Vector3, velocity: THREE.Vector3, final: THREE.Vector3) =>
        initial.clone().multiplyScalar(start).addScaledVector(velocity,duration*tangent).addScaledVector(final,end);
      const derivative = (initial: THREE.Vector3, velocity: THREE.Vector3, final: THREE.Vector3) =>
        initial.clone().multiplyScalar(startRate).addScaledVector(velocity,tangentRate).addScaledVector(final,endRate);
      return {
        p:vector(from.p,from.velocity.p,to.p),t:vector(from.t,from.velocity.t,to.t),
        fov:from.fov*start+from.velocity.fov*duration*tangent+to.fov*end,
        velocity:{
          p:derivative(from.p,from.velocity.p,to.p),t:derivative(from.t,from.velocity.t,to.t),
          fov:from.fov*startRate+from.velocity.fov*tangentRate+to.fov*endRate,
        },
      };
    },
  };
}
