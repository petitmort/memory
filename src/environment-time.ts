export type TimeFlowSettings = { mode: "realtime" | "free"; speed: number };
export type SavedTimeFlow = TimeFlowSettings & { calendar?: number; wall?: number };
export type TimeFlowFrame = TimeFlowSettings & {
  timestamp: number; motionTimestamp: number; timeZone: string; limited: boolean;
};
export const TIME_FLOW_STORAGE_KEY = "tideline-time-flow-v1";
export const TIME_SPEEDS = [0, 1, 10, 60, 300, 900, 3600] as const;
export const DEFAULT_TIME_FLOW: Readonly<TimeFlowSettings> = Object.freeze({ mode: "realtime", speed: 60 });
export const MIN_CALENDAR_TIME = Date.UTC(1900, 0, 1);
export const MAX_CALENDAR_TIME = Date.UTC(2101, 0, 1) - 1;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clampDate = (value: number) => Math.max(MIN_CALENDAR_TIME, Math.min(MAX_CALENDAR_TIME, value));

export function normalizeTimeFlow(value: unknown): TimeFlowSettings {
  const input = value && typeof value === "object" ? value as Partial<TimeFlowSettings> : {};
  return {
    mode: input.mode === "free" ? "free" : "realtime",
    speed: finite(input.speed) ? Math.round(Math.max(0, Math.min(3600, input.speed)) * 10) / 10 : DEFAULT_TIME_FLOW.speed,
  };
}

export function loadTimeFlow(): SavedTimeFlow | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(TIME_FLOW_STORAGE_KEY) ?? "null") as SavedTimeFlow | null;
    if (!saved || typeof saved !== "object") return;
    const settings = normalizeTimeFlow(saved);
    if (settings.mode === "free" && (!finite(saved.calendar) || !finite(saved.wall)
      || saved.calendar < MIN_CALENDAR_TIME || saved.calendar > MAX_CALENDAR_TIME || saved.wall < 0)) return;
    return { ...settings, calendar: saved.calendar, wall: saved.wall };
  } catch { /* Storage is optional, including in private browsing. */ }
}
export function saveTimeFlow(value: SavedTimeFlow) {
  try { localStorage.setItem(TIME_FLOW_STORAGE_KEY, JSON.stringify(value)); }
  catch { /* Keep the current session usable if storage is blocked or full. */ }
}

/** Calendar rate changes never alter the caller's one-times motion timeline. */
export function createTimeFlowClock(realtime: number, wall: number, saved?: SavedTimeFlow) {
  let settings = normalizeTimeFlow(saved);
  let anchorCalendar = finite(saved?.calendar) ? clampDate(saved.calendar) : clampDate(realtime);
  let anchorWall = finite(saved?.wall) ? saved.wall : wall;
  const sample = (real: number, at: number) => {
    const raw = settings.mode === "free" ? anchorCalendar + Math.max(0, at - anchorWall) * settings.speed : real;
    return { ...settings, timestamp: clampDate(raw), motionTimestamp: real, limited: raw >= MAX_CALENDAR_TIME || raw < MIN_CALENDAR_TIME };
  };
  return {
    sample,
    getSettings(): TimeFlowSettings { return { ...settings }; },
    set(patch: Partial<TimeFlowSettings>, real: number, at: number) {
      const current = sample(real, at);
      settings = normalizeTimeFlow({ ...settings, ...patch });
      anchorCalendar = current.timestamp; anchorWall = at;
      return sample(real, at);
    },
    seek(timestamp: number, at: number) {
      if (settings.mode === "free" && finite(timestamp)) { anchorCalendar = clampDate(timestamp); anchorWall = at; }
    },
    saved(): SavedTimeFlow { return { ...settings, calendar: anchorCalendar, wall: anchorWall }; },
  };
}
