/** Metres in the same X/Z sea used by water-surface.ts. The bow points along +X. */
export const vesselKinds = ["wood-sail", "twin-mast", "fishing", "catamaran", "motor-yacht", "ferry"] as const;
export type VesselKind = typeof vesselKinds[number];
export type VesselWind = { windSpeed: number; windDirection: number };
export const isSailingVessel = (kind: VesselKind) => kind === "wood-sail" || kind === "twin-mast" || kind === "catamaran";
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
  { x: -96, z: -223, rx: 35, rz: 8 },
  { x: -12, z: -233, rx: 49, rz: 7 },
  { x: 55, z: -237, rx: 20, rz: 6 },
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
  /** Wind is sampled at departure, so changing weather never teleports a voyage. */
  wind?: VesselWind; reverse?: boolean; sailEligible?: boolean; motorAssisted?: boolean;
};
export type VesselScheduleOptions = {
  forcedRoute?: VesselRoute; forcedKind?: VesselKind;
  windSpeed?: number; windDirection?: number;
  departureWind?: (timestampMs: number) => VesselWind;
};
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
const WIND_LOOKBACK = 16;

/** A quiet landscape polar: no direct upwind sailing or unlimited gale speed. */
export function sailingPolar(kind: VesselKind, windCosine: number) {
  const tail = clamp(windCosine, -1, 1);
  if (!isSailingVessel(kind)) return 1;
  const noGo = kind === "wood-sail" ? -.3 : -.66;
  if (tail < noGo) return 0;
  return kind === "wood-sail"
    ? (.66 + .34 * smooth((tail + .3) / 1.3))
    : (.68 + .4 * Math.exp(-(((tail - .2) / .7) ** 2)));
}

function windCourse(kind: VesselKind, route: VesselRoute, reverse: boolean, wind: VesselWind) {
  let minimum = 1, total = 0;
  for (let i = 0; i <= 24; i++) {
    const point = sampleVesselRoute(route, i / 24), sign = reverse ? -1 : 1;
    const cosine = sign * (point.dx * Math.cos(wind.windDirection) + point.dz * Math.sin(wind.windDirection)) / Math.hypot(point.dx, point.dz);
    const polar = sailingPolar(kind, cosine);
    minimum = Math.min(minimum, polar); total += polar;
  }
  return { eligible: minimum > 0 && wind.windSpeed >= 1, efficiency: total / 25 };
}

/** Current wind trims cloth; the departure polar above controls the voyage. */
export function sampleSailTrim(kind: VesselKind, yaw: number, wind: VesselWind, motorAssisted = false) {
  // A slight preferred tack keeps a directly following wind from collapsing
  // both sides into the centre plane; a gybe still crosses continuously.
  const relative = wind.windDirection + yaw, side = Math.tanh(Math.sin(relative) * 4 + .6);
  const offBow = Math.acos(clamp(-Math.cos(relative), -1, 1));
  return {
    brace: clamp(-Math.atan2(Math.sin(relative), Math.max(.25, Math.cos(relative))), -1.15, 1.15),
    trim: side * (.14 + .95 * smooth((offBow - .6) / 2.2)),
    fullness: clamp(wind.windSpeed / 7, .04, 1) * (motorAssisted ? .2 : 1),
    reef: motorAssisted ? .18 : 1 - .65 * smooth((wind.windSpeed - 8) / 12),
    side,
    square: kind === "wood-sail",
  };
}

/** No elapsed counter: the same absolute timestamp always yields the same voyage. */
export function createVesselJourney(id: number, options: VesselScheduleOptions = {}): VesselJourney {
  const kind = options.forcedKind ?? vesselKinds[((id % 6) + 6) % 6];
  let route = options.forcedRoute ?? vesselRoutes[Math.floor(vesselRandom(id + 173) * vesselRoutes.length)];
  if (!options.forcedRoute && kind === "ferry") route = vesselRandom(id + 29) < .5 ? "right-to-left" : "arc";
  const baseSpeed = speeds[kind] * (.92 + vesselRandom(id + 91) * .16);
  const supplied = options.departureWind?.(id * vesselDepartureInterval)
    ?? (options.windDirection !== undefined ? { windSpeed: options.windSpeed ?? 3, windDirection: options.windDirection } : undefined);
  const wind = supplied && Number.isFinite(supplied.windSpeed + supplied.windDirection)
    ? { windSpeed: clamp(supplied.windSpeed, 0, 30), windDirection: supplied.windDirection } : undefined;
  let speed = baseSpeed, reverse = false, sailEligible = true, motorAssisted = false;
  if (wind) {
    if (isSailingVessel(kind)) {
      if (!options.forcedRoute) {
        const courses = vesselRoutes.flatMap(candidate => [false, true].map(backwards => ({
          route: candidate, reverse: backwards, ...windCourse(kind, candidate, backwards, wind),
          variation: vesselRandom(id + vesselRoutes.indexOf(candidate) * 173 + (backwards ? 9001 : 0)) * .14,
        }))).filter(candidate => candidate.eligible).sort((a, b) => (b.efficiency + b.variation) - (a.efficiency + a.variation));
        if (courses.length) { route = courses[0].route; reverse = courses[0].reverse; }
        else sailEligible = false;
      }
      const course = windCourse(kind, route, reverse, wind);
      sailEligible &&= course.eligible;
      // Explicit route previews retain their requested direction using auxiliary
      // propulsion and a furled sail; automatic traffic never uses this escape.
      motorAssisted = !!options.forcedRoute && !sailEligible;
      if (motorAssisted) sailEligible = true;
      const windPower = Math.min(1.55, .35 + wind.windSpeed * .115);
      speed = Math.max(.26, baseSpeed * (motorAssisted ? .7 : windPower * course.efficiency));
    } else speed *= 1 - .26 * smooth((wind.windSpeed - 5) / 17);
  }
  return {
    id, kind, route, startMs: id * vesselDepartureInterval,
    durationMs: lengths[route] / speed * 1000,
    admission: vesselRandom(id + 537), speed,
    ...(wind ? { wind, reverse, sailEligible, motorAssisted } : {}),
  };
}

/** Fixed global slot, not a midnight restart, so crossing dates is continuous. */
export function sampleVesselJourney(journey: VesselJourney, timestampMs: number) {
  const progress = (timestampMs - journey.startMs) / journey.durationMs;
  const point = sampleVesselRoute(journey.route, journey.reverse ? 1 - progress : progress);
  if (journey.reverse) { point.dx *= -1; point.dz *= -1; point.yaw = Math.atan2(-point.dz, point.dx); }
  return { ...point, progress };
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
  const lookback = options.departureWind || options.windDirection !== undefined ? WIND_LOOKBACK : 7;
  const cache = new Map<number, VesselJourney>();
  const candidate = (id: number) => {
    let journey = cache.get(id);
    if (!journey) { journey = createVesselJourney(id, options); cache.set(id, journey); }
    return journey;
  };
  for (let id = slot - lookback; id <= slot; id++) {
    const journey = candidate(id);
    if (journey.sailEligible === false) continue;
    if (timestampMs < journey.startMs || timestampMs >= journey.startMs + journey.durationMs) continue;
    // Against potential prior reservations as well as admitted traffic: the
    // decision stays reproducible after refresh, regardless of pool history.
    let safe = true;
    for (let previous = id - lookback; previous < id; previous++) {
      const other = candidate(previous);
      if (other.sailEligible !== false && conflict(journey, other)) { safe = false; break; }
    }
    if (safe || options.forcedRoute) journeys.push(journey);
  }
  return journeys;
}
