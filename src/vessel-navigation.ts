/** Metres in the same X/Z sea used by water-surface.ts. The bow points along +X. */
export const vesselKinds = ["wood-sail", "twin-mast", "fishing", "catamaran", "motor-yacht", "ferry"] as const;
export type VesselKind = typeof vesselKinds[number];
export const vesselRoutes = ["left-to-right", "right-to-left", "approach", "depart", "diagonal", "arc"] as const;
export type VesselRoute = typeof vesselRoutes[number];
type Point = readonly [number, number];
type Route = readonly [Point, Point, Point, Point];

export const vesselRoutePoints: Record<VesselRoute, Route> = {
  "left-to-right": [[-145, -48], [-60, -46], [65, -42], [145, -46]],
  "right-to-left": [[145, -114], [65, -121], [-65, -116], [-145, -125]],
  approach: [[120, -238], [65, -210], [10, -45], [-145, -24]],
  depart: [[-145, -24], [10, -45], [65, -210], [120, -238]],
  diagonal: [[145, -160], [80, -80], [-60, -22], [-145, -38]],
  arc: [[145, -140], [55, -65], [-70, -120], [-145, -144]],
};

/** Conservative footprints include the visible rock clusters, not just centres. */
export const vesselExclusionZones = [
  { x: -4, z: -76, rx: 5.5, rz: 5.5 },
  { x: -44, z: -85, rx: 6, rz: 6 },
  { x: -55, z: -160, rx: 28, rz: 16 },
  { x: -7, z: -185, rx: 22, rz: 14 },
] as const;

export function vesselRandom(seed: number) {
  let value = Math.imul(seed ^ (seed >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function sampleVesselRoute(route: VesselRoute, progress: number) {
  const p = Math.max(0, Math.min(1, progress)), q = 1 - p;
  const [a, b, c, d] = vesselRoutePoints[route];
  const x = q * q * q * a[0] + 3 * q * q * p * b[0] + 3 * q * p * p * c[0] + p * p * p * d[0];
  const z = q * q * q * a[1] + 3 * q * q * p * b[1] + 3 * q * p * p * c[1] + p * p * p * d[1];
  const dx = 3 * q * q * (b[0] - a[0]) + 6 * q * p * (c[0] - b[0]) + 3 * p * p * (d[0] - c[0]);
  const dz = 3 * q * q * (b[1] - a[1]) + 6 * q * p * (c[1] - b[1]) + 3 * p * p * (d[1] - c[1]);
  return { x, z, dx, dz, yaw: Math.atan2(-dz, dx) };
}

const lengths = Object.fromEntries(vesselRoutes.map(route => {
  let previous = sampleVesselRoute(route, 0), length = 0;
  for (let i = 1; i <= 96; i++) {
    const point = sampleVesselRoute(route, i / 96);
    length += Math.hypot(point.x - previous.x, point.z - previous.z); previous = point;
  }
  return [route, length];
})) as Record<VesselRoute, number>;

const speeds: Record<VesselKind, number> = {
  "wood-sail": .85, "twin-mast": .95, fishing: 1.2, catamaran: 1.12, "motor-yacht": 1.85, ferry: 1.5,
};
export const vesselDepartureInterval = 90_000;
export type VesselJourney = {
  id: number; kind: VesselKind; route: VesselRoute; startMs: number; durationMs: number;
  admission: number; speed: number;
};
export type VesselScheduleOptions = { forcedRoute?: VesselRoute; forcedKind?: VesselKind };

/** No elapsed counter: the same absolute timestamp always yields the same voyage. */
export function createVesselJourney(id: number, options: VesselScheduleOptions = {}): VesselJourney {
  const kind = options.forcedKind ?? vesselKinds[((id % 6) + 6) % 6];
  let route = options.forcedRoute ?? vesselRoutes[Math.floor(vesselRandom(id + 173) * vesselRoutes.length)];
  if (!options.forcedRoute && kind === "ferry") route = vesselRandom(id + 29) < .5 ? "right-to-left" : "arc";
  const speed = speeds[kind] * (.92 + vesselRandom(id + 91) * .16);
  return {
    id, kind, route, startMs: id * vesselDepartureInterval,
    durationMs: lengths[route] / speed * 1000,
    admission: vesselRandom(id + 537), speed,
  };
}

/** Fixed global slot, not a midnight restart, so crossing dates is continuous. */
export function sampleVesselJourney(journey: VesselJourney, timestampMs: number) {
  const progress = (timestampMs - journey.startMs) / journey.durationMs;
  return { ...sampleVesselRoute(journey.route, progress), progress };
}

function conflict(a: VesselJourney, b: VesselJourney) {
  const start = Math.max(a.startMs, b.startMs), end = Math.min(a.startMs + a.durationMs, b.startMs + b.durationMs);
  if (end <= start) return false;
  // Check relative motion between 4 s samples, including the closest point
  // between samples. A 15 m margin exceeds both boats' combined half lengths.
  let before = sampleVesselJourney(a, start), other = sampleVesselJourney(b, start);
  let px = before.x - other.x, pz = before.z - other.z;
  for (let time = start + 4000; time < end + 4000; time += 4000) {
    before = sampleVesselJourney(a, Math.min(time, end)); other = sampleVesselJourney(b, Math.min(time, end));
    const x = before.x - other.x, z = before.z - other.z, dx = x - px, dz = z - pz;
    const alpha = Math.max(0, Math.min(1, -(px * dx + pz * dz) / Math.max(.0001, dx * dx + dz * dz)));
    if (Math.hypot(px + dx * alpha, pz + dz * alpha) < 15) return true;
    px = x; pz = z;
  }
  return false;
}

/** Conservative slot reservations avoid crossings without random steering. */
export function getVesselSchedule(timestampMs: number, options: VesselScheduleOptions = {}): VesselJourney[] {
  const slot = Math.floor(timestampMs / vesselDepartureInterval), journeys: VesselJourney[] = [];
  for (let id = slot - 7; id <= slot; id++) {
    const journey = createVesselJourney(id, options);
    if (timestampMs < journey.startMs || timestampMs >= journey.startMs + journey.durationMs) continue;
    // Against potential prior reservations as well as admitted traffic: the
    // decision stays reproducible after refresh, regardless of pool history.
    let safe = true;
    for (let previous = id - 7; previous < id; previous++)
      if (conflict(journey, createVesselJourney(previous, options))) { safe = false; break; }
    if (safe || options.forcedRoute) journeys.push(journey);
  }
  return journeys;
}
