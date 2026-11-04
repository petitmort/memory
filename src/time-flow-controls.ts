import { DEFAULT_TIME_FLOW, TIME_SPEEDS, normalizeTimeFlow, type TimeFlowFrame, type TimeFlowSettings } from "./environment-time";
import "./time-flow-controls.css";

/** Uses scene frame notifications; no extra timer, rendering loop or weather data. */
export function createTimeFlowControls(button: HTMLButtonElement, onChange: (patch: Partial<TimeFlowSettings>) => void) {
  let settings = { ...DEFAULT_TIME_FLOW }, available = !button.disabled, disposed = false;
  let latest: TimeFlowFrame | undefined, formatter: Intl.DateTimeFormat | undefined, zone = "";
  const events = new AbortController();
  const panel = document.createElement("section");
  panel.id = "time-flow-panel"; panel.className = "time-flow-panel"; panel.hidden = true;
  panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "false"); panel.setAttribute("aria-labelledby", "time-flow-title");
  panel.innerHTML = `
    <div class="time-flow-heading"><h2 id="time-flow-title">时间设置</h2><button type="button" id="time-flow-close" aria-label="关闭时间设置">×</button></div>
    <fieldset class="time-flow-modes"><legend class="sr-only">时间模式</legend>
      <label><input type="radio" name="time-flow-mode" id="time-flow-realtime" value="realtime">实时模式</label>
      <label><input type="radio" name="time-flow-mode" id="time-flow-free" value="free">自由模式</label>
    </fieldset>
    <p id="time-flow-note"></p>
    <div id="time-flow-speed-controls" hidden>
      <div class="time-flow-speed-row"><label for="time-flow-speed">时间流速</label><output id="time-flow-rate" for="time-flow-speed time-flow-custom"></output></div>
      <input type="range" id="time-flow-speed" min="0" max="6" step="1" aria-label="常用时间流速" aria-describedby="time-flow-rate">
      <div class="time-flow-scale" aria-hidden="true"><span>暂停</span><span>慢</span><span>快 · 3600倍</span></div>
      <label class="time-flow-custom-row" for="time-flow-custom">自定倍速<input type="number" id="time-flow-custom" min="0" max="3600" step="0.1" inputmode="decimal" aria-describedby="time-flow-help"></label>
      <p id="time-flow-help">0为暂停，1为正常速度；最高3600倍。</p>
      <p id="time-flow-equivalent"></p>
      <output id="time-flow-current" aria-label="当前模拟日期与时间" aria-live="off"></output>
      <p class="time-flow-motion-note">只调整昼夜与模拟天气。海浪、船鸟和房间动作仍自然进行。</p>
    </div>`;
  const find = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>(`#${id}`)!;
  const realtime = find<HTMLInputElement>("time-flow-realtime"), free = find<HTMLInputElement>("time-flow-free");
  const speed = find<HTMLInputElement>("time-flow-speed"), custom = find<HTMLInputElement>("time-flow-custom");
  const fields = find("time-flow-speed-controls"), rate = find<HTMLOutputElement>("time-flow-rate"), current = find<HTMLOutputElement>("time-flow-current");
  button.setAttribute("aria-controls", panel.id); button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-haspopup", "dialog");
  (document.querySelector("main") ?? document.body).append(panel);

  function renderDate() {
    if (!latest || panel.hidden || settings.mode !== "free") return;
    if (!formatter || zone !== latest.timeZone) {
      zone = latest.timeZone;
      formatter = new Intl.DateTimeFormat("zh-CN", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    }
    const text = `模拟时间 · ${formatter.format(latest.timestamp)}${latest.limited ? " · 已到日期边界" : ""}`;
    if (current.value !== text) current.value = text;
  }
  function fitPanel() {
    if (panel.hidden) return;
    const room = button.closest<HTMLElement>(".room-ui");
    if (!room) return;
    const roomBounds = room.getBoundingClientRect(), panelBounds = panel.getBoundingClientRect();
    // Landscape uses two columns: the panel may extend beside the room tools.
    if (panelBounds.left >= roomBounds.right + 8 || panelBounds.right <= roomBounds.left - 8) {
      panel.style.maxHeight = ""; return;
    }
    const top = parseFloat(getComputedStyle(panel).top);
    // Keep the room's album and action row reachable while this non-modal
    // panel is open. Short screens scroll the settings, not the whole room.
    panel.style.maxHeight = `${Math.max(132, roomBounds.top - top - 12)}px`;
  }
  function render() {
    const isFree = settings.mode === "free";
    realtime.checked = !isFree; free.checked = isFree; fields.hidden = !isFree;
    for (const input of [speed, custom]) input.disabled = !isFree;
    button.textContent = isFree ? `时间 · ${settings.speed === 0 ? "暂停" : `${settings.speed}倍`}` : "时间 · 实时";
    button.setAttribute("aria-label", isFree ? `时间设置，自由模式，${settings.speed === 0 ? "日历已暂停" : `${settings.speed}倍速`}` : "时间设置，实时模式");
    find("time-flow-note").textContent = isFree ? "桌面时钟已收起，按你喜欢的节奏看昼夜流转。" : "跟随设备日期与时间，桌面时钟实时翻页。";
    rate.value = settings.speed === 0 ? "已暂停" : `${settings.speed}倍`;
    const nearest = TIME_SPEEDS.reduce<number>((best, value, index) => Math.abs(value - settings.speed) < Math.abs(TIME_SPEEDS[best] - settings.speed) ? index : best, 0);
    speed.value = String(nearest); speed.setAttribute("aria-valuetext", settings.speed === 0 ? "暂停日历" : `${settings.speed}倍速`);
    if (document.activeElement !== custom) custom.value = String(settings.speed);
    const minutes = settings.speed;
    find("time-flow-equivalent").textContent = minutes === 0 ? "暂停昼夜与天气，保留此刻。" : minutes < 60
      ? `现实1分钟，窗外经过${minutes}分钟。` : `现实1分钟，窗外经过${+(minutes / 60).toFixed(2)}小时。`;
    renderDate();
    fitPanel();
  }
  function change(patch: Partial<TimeFlowSettings>) {
    if (disposed || !available) return;
    settings = normalizeTimeFlow({ ...settings, ...patch }); render(); onChange(patch);
  }
  function close(focus = false) {
    if (panel.hidden) return;
    panel.hidden = true; button.setAttribute("aria-expanded", "false");
    if (focus && available) button.focus({ preventScroll: true });
  }
  button.addEventListener("click", () => {
    if (disposed || !available || button.disabled) return;
    if (!panel.hidden) { close(true); return; }
    panel.hidden = false; button.setAttribute("aria-expanded", "true"); renderDate(); fitPanel();
    (settings.mode === "free" ? free : realtime).focus({ preventScroll: true });
  }, { signal: events.signal });
  find("time-flow-close").addEventListener("click", () => close(true), { signal: events.signal });
  realtime.addEventListener("change", () => { if (realtime.checked) change({ mode: "realtime" }); }, { signal: events.signal });
  free.addEventListener("change", () => { if (free.checked) change({ mode: "free" }); }, { signal: events.signal });
  speed.addEventListener("input", () => { custom.blur(); change({ speed: TIME_SPEEDS[Number(speed.value)] }); }, { signal: events.signal });
  custom.addEventListener("change", () => {
    if (!custom.value.trim() || !Number.isFinite(custom.valueAsNumber)) { custom.value = String(settings.speed); return; }
    change({ speed: custom.valueAsNumber }); custom.value = String(settings.speed);
  }, { signal: events.signal });
  document.addEventListener("keydown", event => {
    if (panel.hidden || event.key !== "Escape") return;
    event.preventDefault(); event.stopPropagation(); close(true);
  }, { signal: events.signal });
  document.addEventListener("pointerdown", event => {
    if (!(event.target instanceof Node) || panel.contains(event.target) || button.contains(event.target)) return;
    close();
  }, { capture: true, signal: events.signal });
  window.addEventListener("resize", fitPanel, { signal: events.signal });
  for (const type of ["pointerdown", "pointerup", "click", "dblclick", "wheel", "touchstart", "touchend"])
    panel.addEventListener(type, event => event.stopPropagation(), { signal: events.signal });
  render();
  return {
    update(frame: TimeFlowFrame) {
      if (disposed) return;
      latest = frame;
      if (settings.mode !== frame.mode || settings.speed !== frame.speed) { settings = { mode: frame.mode, speed: frame.speed }; render(); }
      else renderDate();
    },
    setAvailable(value: boolean) { if (!disposed) { available = value; button.disabled = !value; if (!value) close(); } },
    dispose() { if (!disposed) { close(); disposed = true; events.abort(); panel.remove(); } },
  };
}
