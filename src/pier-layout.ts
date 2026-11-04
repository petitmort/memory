/** Shared world-space pier footprint. Lengths are metres; the sea is Y=-8. */
export const PIER_SEA_LEVEL = -8;
export const PIER_DECK_HEIGHT = -6.15;
export const PIER_WIDTH = 3.4;
export const PIER_PLATFORM_RADIUS = 2.75;
export const PIER_FOOT_WIDTH = 3.9;
export const PIER_TOWER_SITE = Object.freeze({ x: -1, y: PIER_DECK_HEIGHT, z: -58 });
export const PIER_START = Object.freeze({ x: 8, z: -16 });
export const PIER_LENGTH = Math.hypot(PIER_TOWER_SITE.x - PIER_START.x, PIER_TOWER_SITE.z - PIER_START.z);
const tx = (PIER_TOWER_SITE.x - PIER_START.x) / PIER_LENGTH;
const tz = (PIER_TOWER_SITE.z - PIER_START.z) / PIER_LENGTH;
export type PierSide = -1 | 1;

/** +normal faces the study; the opposite face remains exposed to open water. */
export function samplePierPath(amount: number) {
  const t = Math.min(1, Math.max(0, amount));
  return {
    x: PIER_START.x + (PIER_TOWER_SITE.x - PIER_START.x) * t,
    y: PIER_DECK_HEIGHT,
    z: PIER_START.z + (PIER_TOWER_SITE.z - PIER_START.z) * t,
    width: PIER_WIDTH,
    tangentX: tx, tangentZ: tz, normalX: tz, normalZ: -tx,
  };
}

export function samplePierEdge(amount: number, side: PierSide) {
  const p = samplePierPath(amount);
  return { ...p, x: p.x + p.normalX * p.width * .5 * side, z: p.z + p.normalZ * p.width * .5 * side, side };
}

/** Exact horizontal footprint, including the circular lighthouse landing. */
export function distanceToPier(x: number, z: number) {
  const px = x - PIER_START.x, pz = z - PIER_START.z;
  const along = px * tx + pz * tz, across = px * -tz + pz * tx;
  const dx = Math.max(-along, 0, along - PIER_LENGTH), dz = Math.max(Math.abs(across) - PIER_FOOT_WIDTH / 2, 0);
  return Math.min(Math.hypot(dx, dz), Math.max(0, Math.hypot(x - PIER_TOWER_SITE.x, z - PIER_TOWER_SITE.z) - PIER_PLATFORM_RADIUS - .2));
}
