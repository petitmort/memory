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
  windDirection?: number;
  precipitation?: number;
  waveScale?: number;
  thunder?: number;
  birdDensity?: number;
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
  const windDegrees = numeric(params.get("envWindDirection"), 0, 360);
  options.windDirection = windDegrees === undefined ? undefined : windDegrees * Math.PI / 180;
  options.precipitation = numeric(params.get("envPrecipitation"), 0, 1);
  options.waveScale = numeric(params.get("envWaves"), .2, 1.6);
  options.thunder = numeric(params.get("envThunder"), 0, 1);
  options.birdDensity = numeric(params.get("envBirdDensity"), 0, 2);
  options.vesselDensity = numeric(params.get("envDensity"), 0, 3);
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
  windSpeed?: number; windDirection?: number; waveScale?: number; precipitation?: number;
  reduced?: boolean;
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
export function createEnvironmentDebug(options: EnvironmentOverrides, onChange: (patch: Partial<EnvironmentOverrides>) => void, onLightningPreview?: () => void) {
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
  const lightning = document.createElement('button');lightning.type='button';lightning.id='env-preview-lightning';
  lightning.className='environment-debug-preview';lightning.textContent='转为雷雨 · 预览一次闪电';
  lightning.disabled=!onLightningPreview;content.append(lightning);
  const lightningNote=document.createElement('p');lightningNote.className='environment-debug-preview-note';
  lightningNote.textContent='约7秒后在窗外闪一次，再按距离传来雷声。';content.append(lightningNote);
  lightning.addEventListener('click',()=>{
    apply({weather:'thunderstorm',cloudCover:1,precipitation:1,windSpeed:11.2,thunder:1});
    fill();onLightningPreview?.();panel.open=false;
  },{signal:events.signal});
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
  const cloud = number("云量（0–1，留空自动）", "env-cloud", 0, 1, ".01");
  const wind = number("风速（m/s，留空自动）", "env-wind", 0, 20, ".1");
  const windDirection = number("风吹向（世界角度：0° +X / 90° +Z）", "env-wind-direction", 0, 360, "1");
  const precipitation = number("雨 / 雪量（0–1，随当前天气类型）", "env-precipitation", 0, 1, ".01");
  const waves = number("波浪强度（0.2–1.6，留空随天气）", "env-waves", .2, 1.6, ".05");
  const thunder = number("雷雨活跃度（0–1，仅湿厚云中有效）", "env-thunder", 0, 1, ".05");
  const birdDensity = number("单鸟经过频度（0–2，始终最多1只）", "env-bird-density", 0, 2, ".05");
  const kind = select("船只类型", "env-vessel", [["", "自动调度"], ...vesselKinds.map(value => [value, vesselNames[value]] as const)]);
  const route = select("航行方向", "env-route", [["", "自动航线"], ...vesselRoutes.map(value => [value, routeNames[value]] as const)]);
  const density = number("船只密度（0–3，留空自动）", "env-density", 0, 3, ".05");
  const levels: { input: HTMLInputElement; menu: HTMLSelectElement; key: keyof EnvironmentOverrides; factor: number }[] = [];
  const addLevels = (input: HTMLInputElement, key: keyof EnvironmentOverrides, values: readonly number[], factor = 1, labels?: readonly string[]) => {
    const menu = document.createElement('select'); menu.id = input.id+'-level'; menu.setAttribute('aria-label', input.parentElement!.textContent+'等级');
    for (const [value, label] of [['', '自动'], ...values.map((n,i)=>[String(n),labels?.[i]??`${i+1}档 · ${n}`]), ['custom', '自定义精确值']]) {
      const item=document.createElement('option'); item.value=value; item.textContent=label; menu.append(item);
    }
    input.before(menu); levels.push({input,menu,key,factor});
    change(menu,()=>{
      if(menu.value==='custom'){input.focus();return;}
      input.value=menu.value; input.dispatchEvent(new Event('change'));
    });
  };
  const fractions=Array.from({length:11},(_,i)=>i/10);
  addLevels(cloud,'cloudCover',fractions);
  addLevels(wind,'windSpeed',[0,.8,2.5,4.5,6.5,9,12,15.5,19.5],1,
    ['0级 · 无风','1级 · 软风','2级 · 轻风','3级 · 微风','4级 · 和风','5级 · 清劲风','6级 · 强风','7级 · 疾风','8级 · 大风']);
  addLevels(windDirection,'windDirection',[0,45,90,135,180,225,270,315],180/Math.PI);
  addLevels(precipitation,'precipitation',fractions);
  addLevels(waves,'waveScale',[.2,.35,.5,.65,.8,1,1.2,1.4,1.6]);
  addLevels(thunder,'thunder',[0,.1,.25,.4,.6,.8,1]);
  addLevels(birdDensity,'birdDensity',[0,.1,.25,.5,.75,1,1.25,1.5,2]);
  addLevels(density,'vesselDensity',[0,.1,.25,.5,.75,1,1.5,2,3]);
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
    windDirection.value = state.windDirection === undefined ? "" : String(Math.round(state.windDirection*180/Math.PI));
    precipitation.value = state.precipitation === undefined ? "" : String(state.precipitation);
    waves.value = state.waveScale === undefined ? "" : String(state.waveScale);
    thunder.value = state.thunder === undefined ? "" : String(state.thunder);
    birdDensity.value = state.birdDensity === undefined ? "" : String(state.birdDensity);
    density.value = state.vesselDensity === undefined ? "" : String(state.vesselDensity);
    kind.value = state.vesselKind ?? ""; route.value = state.vesselRoute ?? ""; paths.checked = state.paths;
    quality.value = state.quality === undefined ? "auto" : state.quality ? "low" : "normal";
    for(const {input,menu} of levels) menu.value=Array.from(menu.options).some(option=>option.value===input.value)?input.value:'custom';
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
  change(windDirection,()=>{const degrees=numeric(windDirection.value,0,360);apply({windDirection:degrees===undefined?undefined:degrees*Math.PI/180});});
  change(precipitation,()=>apply({precipitation:numeric(precipitation.value,0,1)}));
  change(waves,()=>apply({waveScale:numeric(waves.value,.2,1.6)}));
  change(thunder,()=>apply({thunder:numeric(thunder.value,0,1)}));
  change(birdDensity,()=>apply({birdDensity:numeric(birdDensity.value,0,2)}));
  change(density, () => { apply({ vesselDensity: numeric(density.value, 0, 3) }); density.value = state.vesselDensity === undefined ? "" : String(state.vesselDensity); });
  for(const {input,menu}of levels) change(input,()=>{menu.value=Array.from(menu.options).some(option=>option.value===input.value)?input.value:'custom';});
  change(kind, () => apply({ vesselKind: option(kind.value, vesselKinds) }));
  change(route, () => apply({ vesselRoute: option(route.value, vesselRoutes) }));
  change(paths, () => apply({ paths: paths.checked }));
  change(quality, () => apply({ quality: quality.value === "auto" ? undefined : quality.value === "low" }));
  reset.addEventListener("click", () => {
    apply({ timestamp: undefined, timeMode: "local-clock", weather: undefined, moonPhase: undefined, cloudCover: undefined,
      windSpeed: undefined, windDirection:undefined, precipitation:undefined, waveScale:undefined, thunder:undefined, birdDensity:undefined,
      vesselDensity: undefined, vesselRoute: undefined, vesselKind: undefined, paths: false, quality: undefined });
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
      lightning.disabled=!onLightningPreview || !!info.reduced;
      lightningNote.textContent=info.reduced ? '已启用减少动态效果：雷闪视觉关闭，雷声仍可播放。' : '约7秒后在窗外闪一次，再按距离传来雷声。';
      const snapshot = calendarAt(info.timestamp, info.timeZone);
      const hours = String(Math.floor(snapshot.secondsOfDay / 3600)).padStart(2, "0");
      const minutes = String(Math.floor(snapshot.secondsOfDay / 60) % 60).padStart(2, "0");
      const wallTime = `${snapshot.dayKey}T${hours}:${minutes}`;
      if (document.activeElement !== date) date.value = wallTime;
      if (state.moonPhase === undefined && document.activeElement !== moon) moon.value = String(info.moonPhase);
      const label = WEATHER_LABELS[info.weather as WeatherKind] ?? info.weather;
      const windText=info.windSpeed===undefined?'':`\n风 ${info.windSpeed.toFixed(1)}m/s → ${Math.round((info.windDirection??0)*180/Math.PI)}° · 波浪 ${(info.waveScale??1).toFixed(2)}`;
      const text = `${snapshot.dayKey} ${hours}:${minutes} · ${info.timeZone}\n模拟天气：${label}${windText}\n太阳高度 ${(info.sunAltitude * 180 / Math.PI).toFixed(1)}° · 月相 ${(info.moonPhase * 100).toFixed(1)}%\n航行 ${info.vessels} 艘 · ${info.low ? "省电" : "普通"}画质\n飞鸟 ${info.birds ?? 0} 只 · ${frontNames[info.front ?? ""] ?? info.front ?? "自然演变"}`;
      if (text !== lastStatus) { status.textContent = text; lastStatus = text; }
    },
    dispose() {
      if (disposed) return;
      disposed = true; events.abort(); panel.remove();
    },
  };
}
