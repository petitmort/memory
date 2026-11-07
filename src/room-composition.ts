import * as THREE from "three";
import { dimensions as D } from "./dimensions";

/** Shared destination for entry, cat return, album return and resize.
 * Keep a standing eye and the original 50° lens; frame the room by stepping
 * back, rather than shrinking its furniture or widening the lens. Phones
 * retain the closer, readable desk/window composition.
 */
export function roomComposition(mobile: boolean) {
  return mobile
    ? { p: new THREE.Vector3(.55, D.eye, 1.7), t: new THREE.Vector3(0, 1.05, -1.4) }
    : { p: new THREE.Vector3(.85, D.eye, 1.25), t: new THREE.Vector3(-.5, 1, -1.35) };
}
