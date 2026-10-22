import * as THREE from "three";
import { dimensions as D } from "./dimensions";

/** One wall, one vignette: furniture and accessories share the same coordinate frame. */
export const consoleLayout = {
  x: -2.105,
  z: -1.45,
  rotation: Math.PI / 2,
  height: D.console.height,
};
export function consolePoint(x: number, z: number, above = .0003) {
  const c = Math.cos(consoleLayout.rotation), s = Math.sin(consoleLayout.rotation);
  return new THREE.Vector3(consoleLayout.x + c*x + s*z, consoleLayout.height + above, consoleLayout.z - s*x + c*z);
}
