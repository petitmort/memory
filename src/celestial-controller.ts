import { calendarAt, DEFAULT_LOCATION, positiveModulo, timestampFromZonedInput, type CalendarLocation } from "./calendar-seed";

export type Direction3 = [number, number, number];
export type CelestialPosition = {
  /** Geometric altitude and clockwise azimuth from geographic north, radians. */
  altitude: number;
  azimuth: number;
  direction: Direction3;
};
export type CelestialState = {
  sun: CelestialPosition;
  moon: CelestialPosition;
  /** 0=new, .25=first quarter, .5=full, .75=last quarter; continuous phase. */
  moonPhase: number;
  moonIllumination: number;
  /** Moon-disc coordinates: +X screen right, +Y up, +Z toward the observer. */
  moonLightDirection: Direction3;
  daylight: number;
  twilight: number;
  night: number;
  sunrise: number | null;
  sunset: number | null;
  dayLengthHours: number;
};

const RAD = Math.PI / 180, TAU = Math.PI * 2, DAY = 86400000;
const sin = (degrees: number) => Math.sin(degrees * RAD);
const cos = (degrees: number) => Math.cos(degrees * RAD);
const clamp = (value: number, low = -1, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (a: number, b: number, value: number) => {
  const x = clamp((value - a) / (b - a), 0, 1); return x * x * (3 - 2 * x);
};
const dot = (a: Direction3, b: Direction3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Direction3, b: Direction3): Direction3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normalized = (a: Direction3): Direction3 => {
  const length = Math.hypot(...a); return [a[0] / length, a[1] / length, a[2] / length];
};

/** Standard low-order solar orbital elements, with obliquity and aberration. */
function solarOrbit(days: number) {
  const t = days / 36525;
  const meanLongitude = 280.46646 + 36000.76983 * t + .0003032 * t * t;
  const meanAnomaly = 357.52911 + 35999.05029 * t - .0001537 * t * t;
  const centre = (1.914602 - .004817 * t - .000014 * t * t) * sin(meanAnomaly)
    + (.019993 - .000101 * t) * sin(2 * meanAnomaly) + .000289 * sin(3 * meanAnomaly);
  const omega = 125.04 - 1934.136 * t;
  const longitude = (meanLongitude + centre - .00569 - .00478 * sin(omega)) * RAD;
  const obliquity = (23.439291 - .0130042 * t + .00256 * cos(omega)) * RAD;
  return {
    longitude, obliquity,
    rightAscension: Math.atan2(Math.cos(obliquity) * Math.sin(longitude), Math.cos(longitude)),
    declination: Math.asin(Math.sin(obliquity) * Math.sin(longitude)),
  };
}

/**
 * Keplerian lunar orbit with the principal longitude/latitude perturbations.
 * The approximation is for a landscape, not navigation or eclipse prediction.
 * No remote ephemeris, textures or fixed eight-phase lookup are involved.
 */
function lunarOrbit(daysJ2000: number, obliquity: number) {
  const d = daysJ2000 + 1.5;
  const node = 125.1228 - .0529538083 * d, inclination = 5.1454;
  const perigee = 318.0634 + .1643573223 * d, anomaly = 115.3654 + 13.0649929509 * d;
  const eccentricity = .0549, mean = positiveModulo(anomaly * RAD, TAU);
  let eccentric = mean + eccentricity * Math.sin(mean) * (1 + eccentricity * Math.cos(mean));
  for (let n = 0; n < 4; n++) eccentric -= (eccentric - eccentricity * Math.sin(eccentric) - mean) / (1 - eccentricity * Math.cos(eccentric));
  const x = 60.2666 * (Math.cos(eccentric) - eccentricity);
  const y = 60.2666 * Math.sqrt(1 - eccentricity * eccentricity) * Math.sin(eccentric);
  const trueAnomaly = Math.atan2(y, x) / RAD;
  let distance = Math.hypot(x, y);
  const orbital = trueAnomaly + perigee;
  const ecliptic: Direction3 = [
    cos(node) * cos(orbital) - sin(node) * sin(orbital) * cos(inclination),
    sin(node) * cos(orbital) + cos(node) * sin(orbital) * cos(inclination),
    sin(orbital) * sin(inclination),
  ];
  let longitude = Math.atan2(ecliptic[1], ecliptic[0]) / RAD;
  let latitude = Math.atan2(ecliptic[2], Math.hypot(ecliptic[0], ecliptic[1])) / RAD;
  const solarAnomaly = 356.0470 + .9856002585 * d;
  const solarLongitude = 282.9404 + .0000470935 * d + solarAnomaly;
  const lunarLongitude = node + perigee + anomaly;
  const elongation = lunarLongitude - solarLongitude, argument = lunarLongitude - node;
  longitude += -1.274 * sin(anomaly - 2 * elongation) + .658 * sin(2 * elongation) - .186 * sin(solarAnomaly)
    - .059 * sin(2 * anomaly - 2 * elongation) - .057 * sin(anomaly - 2 * elongation + solarAnomaly)
    + .053 * sin(anomaly + 2 * elongation) + .046 * sin(2 * elongation - solarAnomaly)
    + .041 * sin(anomaly - solarAnomaly) - .035 * sin(elongation) - .031 * sin(anomaly + solarAnomaly)
    - .015 * sin(2 * argument - 2 * elongation) + .011 * sin(anomaly - 4 * elongation);
  latitude += -.173 * sin(argument - 2 * elongation) - .055 * sin(anomaly - argument - 2 * elongation)
    - .046 * sin(anomaly + argument - 2 * elongation) + .033 * sin(argument + 2 * elongation)
    + .017 * sin(2 * anomaly + argument);
  distance += -.58 * cos(anomaly - 2 * elongation) - .46 * cos(2 * elongation);
  const e = [cos(longitude) * cos(latitude), sin(longitude) * cos(latitude), sin(latitude)];
  const equatorialY = e[1] * Math.cos(obliquity) - e[2] * Math.sin(obliquity);
  const equatorialZ = e[1] * Math.sin(obliquity) + e[2] * Math.cos(obliquity);
  return { longitude: longitude * RAD, distance, rightAscension: Math.atan2(equatorialY, e[0]), declination: Math.asin(clamp(equatorialZ)) };
}

function position(
  rightAscension: number, declination: number, sidereal: number,
  location: CalendarLocation, distance?: number,
): CelestialPosition {
  const latitude = location.latitude * RAD;
  const hourAngle = sidereal + location.longitude * RAD - rightAscension;
  let altitude = Math.asin(clamp(Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)));
  // Lunar horizontal parallax matters near the horizon; the Sun is effectively infinite.
  if (distance) altitude = Math.atan2(Math.sin(altitude) - 1 / distance, Math.cos(altitude));
  const azimuth = positiveModulo(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude)) + Math.PI, TAU);
  const x = Math.sin(azimuth) * Math.cos(altitude), z = -Math.cos(azimuth) * Math.cos(altitude);
  const yaw = location.northYaw ?? 0;
  return { altitude, azimuth, direction: [Math.cos(yaw) * x + Math.sin(yaw) * z, Math.sin(altitude), -Math.sin(yaw) * x + Math.cos(yaw) * z] };
}

function orbitalState(timestamp: number, location: CalendarLocation) {
  const days = timestamp / DAY - 10957.5;
  const t = days / 36525;
  const sidereal = (280.46061837 + 360.98564736629 * days + .000387933 * t * t - t * t * t / 38710000) * RAD;
  const sun = solarOrbit(days), moon = lunarOrbit(days, sun.obliquity);
  return { sun, moon, sidereal, sunPosition: position(sun.rightAscension, sun.declination, sidereal, location) };
}

const solarDays = new Map<string, { sunrise: number | null; sunset: number | null; dayLengthHours: number }>();
function dayTimes(timestamp: number, location: CalendarLocation) {
  const calendar = calendarAt(timestamp, location.timeZone);
  const key = `${calendar.dayKey}/${location.latitude}/${location.longitude}/${location.timeZone}`;
  const cached = solarDays.get(key); if (cached) return cached;
  const start = timestampFromZonedInput(`${calendar.dayKey}T00:00`, location.timeZone);
  const nextDate = new Date(Date.UTC(calendar.year, calendar.month - 1, calendar.day + 1)).toISOString().slice(0, 10);
  const end = timestampFromZonedInput(`${nextDate}T00:00`, location.timeZone);
  const height = (at: number) => orbitalState(at, location).sunPosition.altitude + .833 * RAD;
  let previousTime = start, previousHeight = height(start), sunrise: number | null = null, sunset: number | null = null;
  const steps = 120;
  for (let step = 1; step <= steps; step++) {
    const at = start + (end - start) * step / steps, h = height(at);
    if ((previousHeight < 0) !== (h < 0)) {
      let low = previousTime, high = at;
      for (let n = 0; n < 14; n++) {
        const middle = (low + high) / 2;
        if ((height(middle) < 0) === (previousHeight < 0)) low = middle; else high = middle;
      }
      if (previousHeight < 0) sunrise = (low + high) / 2; else sunset = (low + high) / 2;
    }
    previousTime = at; previousHeight = h;
  }
  const dayLengthHours = sunrise !== null && sunset !== null ? positiveModulo(sunset - sunrise, DAY) / 3600000
    : height(start + (end - start) / 2) >= 0 ? 24 : 0;
  const result = { sunrise, sunset, dayLengthHours };
  if (solarDays.size >= 64) solarDays.delete(solarDays.keys().next().value!);
  solarDays.set(key, result); return result;
}

export function calculateCelestial(
  timestamp: number,
  location: CalendarLocation = DEFAULT_LOCATION,
  phaseOverride?: number,
): CelestialState {
  if (!Number.isFinite(timestamp) || !Number.isFinite(location.latitude) || Math.abs(location.latitude) > 90
    || !Number.isFinite(location.longitude) || Math.abs(location.longitude) > 180 || !Number.isFinite(location.northYaw ?? 0))
    throw new RangeError("Use a finite timestamp and valid geographic coordinates.");
  const orbit = orbitalState(timestamp, location);
  const sun = orbit.sunPosition;
  const moon = position(orbit.moon.rightAscension, orbit.moon.declination, orbit.sidereal, location, orbit.moon.distance);
  const front: Direction3 = [-moon.direction[0], -moon.direction[1], -moon.direction[2]];
  const right = normalized(cross(Math.abs(front[1]) > .999 ? [0, 0, 1] : [0, 1, 0], front));
  const up = cross(front, right);
  let moonLightDirection: Direction3 = normalized([dot(sun.direction, right), dot(sun.direction, up), dot(sun.direction, front)]);
  let moonPhase = positiveModulo(orbit.moon.longitude - orbit.sun.longitude, TAU) / TAU;
  if (phaseOverride !== undefined && Number.isFinite(phaseOverride)) {
    moonPhase = positiveModulo(phaseOverride, 1);
    moonLightDirection = [Math.sin(moonPhase * TAU), 0, -Math.cos(moonPhase * TAU)];
  }
  const daylight = smooth(-6 * RAD, 8 * RAD, sun.altitude), night = 1 - smooth(-18 * RAD, -4 * RAD, sun.altitude);
  return {
    sun, moon, moonPhase, moonLightDirection,
    moonIllumination: clamp((1 + moonLightDirection[2]) / 2, 0, 1),
    daylight, twilight: (1 - daylight) * (1 - night), night,
    ...dayTimes(timestamp, location),
  };
}
