import { calendarAt, DEFAULT_LOCATION, timestampFromZonedInput, type CalendarLocation } from "./calendar-seed";
import { WEATHER_KINDS, WEATHER_LABELS, type WeatherKind } from "./weather-controller";
import { vesselKinds, vesselRoutes, type VesselKind, type VesselRoute } from "./vessel-navigation";
import "./environment-debug.css";

export type EnvironmentOverrides = {
  enabled: boolean;
  location: CalendarLocation;
  timeMode: "local-clock" | "scene";
  timestamp?: number;
  weather?: WeatherKind;
  moonPhase?: number;
  cloudCover?: number;
  windSpeed?: number;
  vesselDensity?: number;
  vesselRoute?: VesselRoute;
  vesselKind?: VesselKind;
  paths: boolean;
  /** undefined = automatic, false = normal, true = low. Never persisted. */
  quality?: boolean;
};

function option<T extends string>(value: string | null, choices: readonly T[]): T | undefined {
  return choices.includes(value as T) ? value as T : undefined;
}
function numeric(value: string | null, min: number, max: number): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : undefined;
}
const PREVIEW_DATE_ERROR = "请选择 1900–2100 年之间的有效日期和时间。";
function previewTimestamp(value: string, timeZone: string) {
  const timestamp = timestampFromZonedInput(value, timeZone);
  const year = calendarAt(timestamp, timeZone).year;
  if (year < 1900 || year > 2100) throw new RangeError(PREVIEW_DATE_ERROR);
  return timestamp;
}

/** Debug query parameters are inert unless the visitor explicitly requests debugEnv=1. */
export function readEnvironmentOptions(search = typeof window === "undefined" ? "" : window.location.search): EnvironmentOverrides {
  const params = new URLSearchParams(search);
  const options: EnvironmentOverrides = {
    enabled: params.get("debugEnv") === "1", location: { ...DEFAULT_LOCATION }, timeMode: "local-clock", paths: false,
  };
  if (!options.enabled) return options;
  options.timeMode = option(params.get("envTimeMode"), ["scene", "local-clock"]) ?? "local-clock";
  const date = params.get("envDate");
  if (date) {
    try { options.timestamp = previewTimestamp(date, options.location.timeZone); }
    catch { /* A malformed preview link must not stop the room from loading. */ }
  }
  options.weather = option(params.get("envWeather"), WEATHER_KINDS);
  options.moonPhase = numeric(params.get("envPhase"), 0, 1);
  options.cloudCover = numeric(params.get("envCloud"), 0, 1);
  options.windSpeed = numeric(params.get("envWind"), 0, 20);
  options.vesselDensity = numeric(params.get("envDensity"), 0, 2);
  options.vesselRoute = option(params.get("envRoute"), vesselRoutes);
  options.vesselKind = option(params.get("envVessel"), vesselKinds);
  options.paths = params.get("envPaths") === "1";
  const quality = params.get("envQuality");
  options.quality = quality === "low" ? true : quality === "normal" ? false : undefined;
  return options;
}

type DebugInfo = {
  timestamp: number; timeZone: string; weather: string; sunAltitude: number;
  moonPhase: number; vessels: number; low: boolean;
  birds?: number; front?: string;
};
const vesselNames: Record<VesselKind, string> = {
  "wood-sail": "木质帆船", "twin-mast": "双桅帆船", fishing: "渔船",
  catamaran: "双体帆船", "motor-yacht": "机动游艇", ferry: "远景渡船",
};
const routeNames: Record<VesselRoute, string> = {
  "left-to-right": "从左往右", "right-to-left": "从右往左", approach: "远处驶近",
  depart: "近处驶远", diagonal: "斜向横穿", arc: "弧线驶离",
};
const frontNames: Record<string, string> = {
  settled: "天气平稳", gathering: "积云起风", "rain-arriving": "降水渐入",
  "rain-clearing": "雨势渐弱", clearing: "雨后散云", "cloud-transition": "云层渐变",
};

/** Small DOM-only tools; the scene owns its update clock and all rendering. */
export function createEnvironmentDebug(options: EnvironmentOverrides, onChange: (patch: Partial<EnvironmentOverrides>) => void) {
  if (!options.enabled) return { update(_info: DebugInfo) {}, dispose() {} };
  const state = { ...options }, events = new AbortController();
  const panel = document.createElement("details");
  panel.className = "environment-debug";
  const summary = document.createElement("summary"); summary.textContent = "环境调试"; panel.append(summary);
  const content = document.createElement("div"); content.className = "environment-debug-content"; panel.append(content);
  const note = document.createElement("p"); note.className = "environment-debug-note";
  note.textContent = "开发预览 · 独立模拟天气 · 设置仅在本页有效"; content.append(note);
  const status = document.createElement("output"); status.className = "environment-debug-status";
  status.setAttribute("aria-label", "当前环境状态"); status.setAttribute("aria-live", "off"); content.append(status);
  const field = <T extends HTMLElement>(name: string, input: T) => {
    const label = document.createElement("label"); label.className = "environment-debug-field";
    const text = document.createElement("span"); text.textContent = name; label.append(text, input); content.append(label);
    return input;
  };
  const select = (name: string, id: string, entries: readonly (readonly [string, string])[]) => {
    const input = document.createElement("select"); input.id = id;
    for (const [value, label] of entries) {
      const item = document.createElement("option"); item.value = value; item.textContent = label; input.append(item);
    }
    return field(name, input);
  };
  const change = (input: HTMLElement, callback: () => void) => input.addEventListener("change", callback, { signal: events.signal });
  const apply = (patch: Partial<EnvironmentOverrides>) => { Object.assign(state, patch); onChange(patch); };
  const date = document.createElement("input"); date.type = "datetime-local"; date.id = "env-date";
  date.min = "1900-01-01T00:00"; date.max = "2100-12-31T23:59";
  field("模拟日期与时间（场景时区，1900–2100 年）", date);
  const dateError = document.createElement("span"); dateError.className = "environment-debug-error";
  dateError.setAttribute("role", "alert"); content.append(dateError);
  const mode = select("时间模式", "env-time-mode", [["local-clock", "与设备本地时钟一致"], ["scene", "场景所在地时间"]]);
  const weather = select("模拟天气", "env-weather", [["", "季节随机演变（含渐变）"], ...WEATHER_KINDS.map(kind => [kind, WEATHER_LABELS[kind]] as const)]);
  const phase = select("月相", "env-phase", [["", "按真实日期计算"], ["0", "新月"], ["0.25", "上弦月"], ["0.5", "满月"], ["0.75", "下弦月"], ["custom", "连续月相"]]);
  const moon = document.createElement("input"); moon.type = "range"; moon.id = "env-phase-range";
  moon.min = "0"; moon.max = "1"; moon.step = ".005"; moon.value = String(state.moonPhase ?? .5);
  field("连续月相（0 新月 · 0.5 满月 · 1 新月）", moon);
  const number = (name: string, id: string, min: number, max: number, step: string) => {
    const input = document.createElement("input"); input.type = "number"; input.id = id;
    input.min = String(min); input.max = String(max); input.step = step; input.placeholder = "自动";
    return field(name, input);
  };
  const cloud = number("云量（0–1，留空自动）", "env-cloud", 0, 1, ".05");
  const wind = number("风速（m/s，留空自动）", "env-wind", 0, 20, ".5");
  const kind = select("船只类型", "env-vessel", [["", "自动调度"], ...vesselKinds.map(value => [value, vesselNames[value]] as const)]);
  const route = select("航行方向", "env-route", [["", "自动航线"], ...vesselRoutes.map(value => [value, routeNames[value]] as const)]);
  const density = number("船只密度（0–2，留空自动）", "env-density", 0, 2, ".1");
  const paths = document.createElement("input"); paths.type = "checkbox"; paths.id = "env-paths";
  field("显示航线与方向", paths).parentElement!.classList.add("environment-debug-toggle");
  const quality = select("画质", "env-quality", [["auto", "自动调整"], ["normal", "普通画质"], ["low", "省电画质"]]);
  const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "恢复真实时间与自动环境";
  reset.className = "environment-debug-reset"; content.append(reset);

  function fill() {
    mode.value = state.timeMode; weather.value = state.weather ?? "";
    const value = String(state.moonPhase);
    phase.value = state.moonPhase === undefined ? "" : ["0", "0.25", "0.5", "0.75"].includes(value) ? value : "custom";
    if (state.moonPhase !== undefined) moon.value = value;
    cloud.value = state.cloudCover === undefined ? "" : String(state.cloudCover);
    wind.value = state.windSpeed === undefined ? "" : String(state.windSpeed);
    density.value = state.vesselDensity === undefined ? "" : String(state.vesselDensity);
    kind.value = state.vesselKind ?? ""; route.value = state.vesselRoute ?? ""; paths.checked = state.paths;
    quality.value = state.quality === undefined ? "auto" : state.quality ? "low" : "normal";
  }
  fill();
  change(date, () => {
    dateError.textContent = "";
    if (!date.value) { apply({ timestamp: undefined }); return; }
    try { apply({ timestamp: previewTimestamp(date.value, state.location.timeZone) }); }
    catch { dateError.textContent = PREVIEW_DATE_ERROR; }
  });
  change(mode, () => apply({ timeMode: mode.value as EnvironmentOverrides["timeMode"] }));
  change(weather, () => apply({ weather: option(weather.value, WEATHER_KINDS) }));
  change(phase, () => {
    const value = phase.value === "custom" ? Number(moon.value) : numeric(phase.value, 0, 1);
    if (value !== undefined) moon.value = String(value);
    apply({ moonPhase: value });
  });
  change(moon, () => { phase.value = "custom"; apply({ moonPhase: Number(moon.value) }); });
  change(cloud, () => { apply({ cloudCover: numeric(cloud.value, 0, 1) }); cloud.value = state.cloudCover === undefined ? "" : String(state.cloudCover); });
  change(wind, () => { apply({ windSpeed: numeric(wind.value, 0, 20) }); wind.value = state.windSpeed === undefined ? "" : String(state.windSpeed); });
  change(density, () => { apply({ vesselDensity: numeric(density.value, 0, 2) }); density.value = state.vesselDensity === undefined ? "" : String(state.vesselDensity); });
  change(kind, () => apply({ vesselKind: option(kind.value, vesselKinds) }));
  change(route, () => apply({ vesselRoute: option(route.value, vesselRoutes) }));
  change(paths, () => apply({ paths: paths.checked }));
  change(quality, () => apply({ quality: quality.value === "auto" ? undefined : quality.value === "low" }));
  reset.addEventListener("click", () => {
    apply({ timestamp: undefined, timeMode: "local-clock", weather: undefined, moonPhase: undefined, cloudCover: undefined,
      windSpeed: undefined, vesselDensity: undefined, vesselRoute: undefined, vesselKind: undefined, paths: false, quality: undefined });
    dateError.textContent = ""; date.value = ""; fill();
  }, { signal: events.signal });
  // Keep controls out of the scene's bubbling raycast and pointer handlers.
  for (const event of ["pointerdown", "pointerup", "click", "dblclick", "wheel", "touchstart", "touchend"])
    panel.addEventListener(event, event => event.stopPropagation(), { signal: events.signal });
  document.body.append(panel);
  let disposed = false, lastStatus = "";
  return {
    update(info: DebugInfo) {
      if (disposed || !Number.isFinite(info.timestamp)) return;
      const snapshot = calendarAt(info.timestamp, info.timeZone);
      const hours = String(Math.floor(snapshot.secondsOfDay / 3600)).padStart(2, "0");
      const minutes = String(Math.floor(snapshot.secondsOfDay / 60) % 60).padStart(2, "0");
      const wallTime = `${snapshot.dayKey}T${hours}:${minutes}`;
      if (document.activeElement !== date) date.value = wallTime;
      if (state.moonPhase === undefined && document.activeElement !== moon) moon.value = String(info.moonPhase);
      const label = WEATHER_LABELS[info.weather as WeatherKind] ?? info.weather;
      const text = `${snapshot.dayKey} ${hours}:${minutes} · ${info.timeZone}\n模拟天气：${label}\n太阳高度 ${(info.sunAltitude * 180 / Math.PI).toFixed(1)}° · 月相 ${(info.moonPhase * 100).toFixed(1)}%\n航行 ${info.vessels} 艘 · ${info.low ? "省电" : "普通"}画质\n飞鸟 ${info.birds ?? 0} 只 · ${frontNames[info.front ?? ""] ?? info.front ?? "自然演变"}`;
      if (text !== lastStatus) { status.textContent = text; lastStatus = text; }
    },
    dispose() {
      if (disposed) return;
      disposed = true; events.abort(); panel.remove();
    },
  };
}
