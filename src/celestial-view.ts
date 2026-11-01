import type { CelestialPosition, Direction3 } from "./celestial-controller";

export type CelestialView = "window" | "astronomical";
const RAD = Math.PI / 180;

/**
 * A fixed world-space composition shared by both room camera poses.
 * Astronomical rise/set and phase stay upstream; this is an artistic sky map.
 * Nothing is clamped to screen edges or recomputed from the viewing camera.
 */
export function celestialDisplayDirection(
  position: CelestialPosition, view: CelestialView = "window", out: Direction3 = [0, 0, -1],
): Direction3 {
  if (view === "astronomical") {
    out[0] = position.direction[0]; out[1] = position.direction[1]; out[2] = position.direction[2];
    return out;
  }
  // At Santorini, the above-horizon arc passes east -> south -> west.
  // Its only angular seam is below the horizon, behind the rise/set mask.
  const meridian = Math.atan2(Math.sin(position.azimuth - Math.PI), Math.cos(position.azimuth - Math.PI));
  const yaw = (-9 + 10.5 * Math.sin(meridian / 2)) * RAD;
  const altitude = 7.5 * RAD * Math.sin(position.altitude);
  const horizontal = Math.cos(altitude);
  out[0] = Math.sin(yaw) * horizontal;
  out[1] = Math.sin(altitude);
  out[2] = -Math.cos(yaw) * horizontal;
  return out;
}
