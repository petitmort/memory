import * as THREE from 'three';
import type { ReadingPath, ReadingPose } from './reading-motion';

/** Follow the established doorway route by distance, with a soft start/stop. */
export function createEntryPath(
  from: ReadingPose, to: ReadingPose, doorway: { x: number; y: number; z: number }, duration: number,
): ReadingPath {
  const curve = new THREE.CatmullRomCurve3([
    from.p.clone(),
    new THREE.Vector3(doorway.x, doorway.y, doorway.z + .6),
    new THREE.Vector3(doorway.x, doorway.y, doorway.z - .6),
    to.p.clone(),
  ], false, 'centripetal');
  curve.arcLengthDivisions = 300;
  curve.updateArcLengths();
  return {
    sample(progress) {
      const a = THREE.MathUtils.clamp(progress, 0, 1);
      // Zero velocity and acceleration at both ends, rather than a sudden
      // change of acceleration as the camera starts and settles.
      const ease = a * a * a * (a * (a * 6 - 15) + 10);
      const rate = 30 * a * a * (1 - a) * (1 - a) / duration;
      const before = Math.max(0, ease - .00001), after = Math.min(1, ease + .00001);
      const velocity = curve.getPointAt(after).sub(curve.getPointAt(before)).multiplyScalar(rate / (after - before));
      return {
        p: curve.getPointAt(ease), t: from.t.clone().lerp(to.t, ease),
        fov: THREE.MathUtils.lerp(from.fov, to.fov, ease),
        velocity: {
          p: velocity, t: to.t.clone().sub(from.t).multiplyScalar(rate),
          fov: (to.fov - from.fov) * rate,
        },
      };
    },
  };
}
