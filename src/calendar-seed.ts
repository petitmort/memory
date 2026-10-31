/** Dates are scene wall-clock dates, not locale-formatted strings or frame counts. */
export type CalendarLocation = {
  latitude: number;
  longitude: number;
  timeZone: string;
  /** Rotate geographic north (-Z) around world +Y. The sea window faces south. */
  northYaw?: number;
};
export const DEFAULT_LOCATION: Readonly<CalendarLocation> = Object.freeze({
  latitude: 36.3932, longitude: 25.4615, timeZone: "Europe/Athens", northYaw: Math.PI,
});
export type Season = "spring" | "summer" | "autumn" | "winter";
export type CalendarSnapshot = {
  timestamp: number;
  dayKey: string;
  year: number;
  month: number;
  day: number;
  dayOfYear: number;
  secondsOfDay: number;
  season: Season;
  seed: number;
};

const formatters = new Map<string, Intl.DateTimeFormat>();
export const positiveModulo = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;

export function seedFromString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

/** Mulberry32: reproducible across browser, refresh and operating-system locale. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ state >>> 15, state | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

function formatter(timeZone: string) {
  let value = formatters.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    if (formatters.size >= 16) formatters.delete(formatters.keys().next().value!);
    formatters.set(timeZone, value);
  }
  return value;
}

function wallParts(timestamp: number, timeZone: string) {
  if (!Number.isFinite(timestamp)) throw new RangeError("The calendar timestamp must be finite.");
  const values: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(timestamp)) {
    if (part.type !== "literal") values[part.type] = Number(part.value);
  }
  return {
    year: values.year, month: values.month, day: values.day,
    hour: values.hour, minute: values.minute, second: values.second,
  };
}

function utcOf(parts: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number }) {
  // setUTCFullYear avoids Date.UTC's special treatment of years 0 through 99.
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0, 0);
  return date.getTime();
}

const pad = (value: number, width = 2) => String(value).padStart(width, "0");
export function calendarAt(timestamp: number, timeZone = DEFAULT_LOCATION.timeZone): CalendarSnapshot {
  const parts = wallParts(timestamp, timeZone);
  const { year, month, day } = parts;
  const dayKey = `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  const season: Season = month >= 3 && month <= 5 ? "spring" : month >= 6 && month <= 8 ? "summer"
    : month >= 9 && month <= 11 ? "autumn" : "winter";
  return {
    timestamp, dayKey, year, month, day,
    dayOfYear: Math.round((utcOf({ year, month, day }) - utcOf({ year, month: 1, day: 1 })) / 86400000) + 1,
    secondsOfDay: parts.hour * 3600 + parts.minute * 60 + parts.second + positiveModulo(timestamp, 1000) / 1000,
    season, seed: seedFromString(dayKey),
  };
}

/**
 * Interpret an ISO wall-clock value in an IANA zone. DST overlaps use the earlier
 * instant; a spring-forward gap advances by the gap (Temporal's compatible rule).
 * This conversion does not assume that Athens is always UTC+2 or UTC+3.
 */
export function timestampFromZonedInput(value: string, timeZone = DEFAULT_LOCATION.timeZone): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new RangeError("Use a date and time in YYYY-MM-DDTHH:mm format.");
  const [, y, m, d, h, min, sec = "0", fraction = "0"] = match;
  const desired = { year: +y, month: +m, day: +d, hour: +h, minute: +min, second: +sec };
  const milliseconds = +(fraction + "00").slice(0, 3);
  const naive = utcOf(desired), checked = new Date(naive);
  if (desired.year < 1 || checked.getUTCFullYear() !== desired.year || checked.getUTCMonth() + 1 !== desired.month
    || checked.getUTCDate() !== desired.day || checked.getUTCHours() !== desired.hour
    || checked.getUTCMinutes() !== desired.minute || checked.getUTCSeconds() !== desired.second)
    throw new RangeError("The calendar date or time is invalid.");
  const offsets = new Set<number>();
  // Sample both sides of a possible DST transition, including UTC+/-14 zones.
  for (const hours of [-36, -12, 0, 12, 36]) {
    const probe = naive + hours * 3600000;
    offsets.add(utcOf(wallParts(probe, timeZone)) - probe);
  }
  const exact: number[] = [], forward: { timestamp: number; gap: number }[] = [];
  for (const offset of offsets) {
    const candidate = naive - offset;
    const gap = utcOf(wallParts(candidate, timeZone)) - naive;
    if (gap === 0) exact.push(candidate);
    else if (gap > 0) forward.push({ timestamp: candidate, gap });
  }
  if (exact.length) return Math.min(...exact) + milliseconds;
  forward.sort((a, b) => a.gap - b.gap || a.timestamp - b.timestamp);
  if (forward.length) return forward[0].timestamp + milliseconds;
  throw new RangeError("This local time could not be resolved in the chosen time zone.");
}

const LOCAL_CLOCK_DAY = 86400000, LOCAL_CLOCK_NOON = LOCAL_CLOCK_DAY / 2;
const localClockOffsets = new Map<string, number>();
function localClockOffset(anchor: number, sceneTimeZone: string, userTimeZone: string) {
  const key = `${anchor}/${sceneTimeZone}/${userTimeZone}`;
  const cached = localClockOffsets.get(key);
  if (cached !== undefined) return cached;
  const p = wallParts(anchor, userTimeZone);
  const mapped = timestampFromZonedInput(`${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`, sceneTimeZone);
  const offset = mapped - anchor;
  if (localClockOffsets.size >= 64) localClockOffsets.delete(localClockOffsets.keys().next().value!);
  localClockOffsets.set(key, offset);
  return offset;
}

/**
 * Match the user's wall clock on ordinary dates. Between fixed daily UTC-noon
 * anchors, blend zone offsets so either zone's DST cannot jump the landscape.
 * A transition day can differ from the wall clock by up to about one hour;
 * absolute scene time and explicit date input retain exact IANA/DST semantics.
 */
export function timestampForLocalClock(
  timestamp: number,
  sceneTimeZone = DEFAULT_LOCATION.timeZone,
  userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): number {
  if (!Number.isFinite(timestamp)) throw new RangeError("The calendar timestamp must be finite.");
  if (sceneTimeZone === userTimeZone) return timestamp;
  const anchor = Math.floor((timestamp - LOCAL_CLOCK_NOON) / LOCAL_CLOCK_DAY) * LOCAL_CLOCK_DAY + LOCAL_CLOCK_NOON;
  const before = localClockOffset(anchor, sceneTimeZone, userTimeZone);
  const after = localClockOffset(anchor + LOCAL_CLOCK_DAY, sceneTimeZone, userTimeZone);
  return timestamp + before + (after - before) * ((timestamp - anchor) / LOCAL_CLOCK_DAY);
}
