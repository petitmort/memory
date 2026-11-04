import { normalizeRoomLightSettings, ROOM_LIGHT_STORAGE_KEY, type RoomLightSettings } from "./room-light";
import "./room-light-controls.css";

/** Non-modal room tools; the caller owns scene availability and light rendering. */
export function createRoomLightControls(
  button: HTMLButtonElement,
  initial: RoomLightSettings,
  onChange: (state: RoomLightSettings) => void,
) {
  let settings = normalizeRoomLightSettings(initial);
  let available = !button.disabled, disposed = false;
  const events = new AbortController();
  const original = {
    disabled: button.disabled,
    controls: button.getAttribute("aria-controls"),
    expanded: button.getAttribute("aria-expanded"),
    popup: button.getAttribute("aria-haspopup"),
  };
  const panel = document.createElement("section");
  panel.id = "room-light-panel";
  panel.className = "room-light-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "room-light-title");
  button.setAttribute("aria-controls", panel.id);
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-haspopup", "dialog");

  const heading = document.createElement("div"); heading.className = "room-light-heading";
  const title = document.createElement("h2"); title.id = "room-light-title"; title.textContent = "室内灯光";
  const closeButton = document.createElement("button");
  closeButton.type = "button"; closeButton.id = "room-light-close"; closeButton.className = "room-light-close";
  closeButton.textContent = "×"; closeButton.setAttribute("aria-label", "关闭室内灯光设置");
  heading.append(title, closeButton); panel.append(heading);

  const powerRow = document.createElement("div"); powerRow.className = "room-light-power";
  const powerLabel = document.createElement("span"); powerLabel.id = "room-light-power-label"; powerLabel.textContent = "房间照明";
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.id = "room-light-toggle"; toggle.className = "room-light-toggle";
  toggle.setAttribute("role", "switch"); toggle.setAttribute("aria-labelledby", powerLabel.id);
  powerRow.append(powerLabel, toggle); panel.append(powerRow);

  const colorRow = document.createElement("div"); colorRow.className = "room-light-color-row";
  const colorLabel = document.createElement("label"); colorLabel.htmlFor = "room-light-color"; colorLabel.textContent = "灯光颜色";
  const color = document.createElement("input"); color.type = "color"; color.id = "room-light-color";
  colorRow.append(colorLabel, color); panel.append(colorRow);

  const presets = document.createElement("div"); presets.className = "room-light-presets";
  presets.setAttribute("role", "group"); presets.setAttribute("aria-label", "灯光色温预设");
  const presetButtons = [
    ["暖色", "#ffd6a3"], ["自然", "#fff1da"], ["冷色", "#d7e7ff"],
  ].map(([label, value]) => {
    const preset = document.createElement("button"); preset.type = "button";
    preset.className = "room-light-preset"; preset.textContent = label;
    preset.dataset.color = value; preset.style.setProperty("--light-swatch", value);
    preset.addEventListener("click", () => change({ color: value }), { signal: events.signal });
    presets.append(preset); return preset;
  });
  panel.append(presets);

  const brightnessRow = document.createElement("div"); brightnessRow.className = "room-light-brightness-row";
  const brightnessLabel = document.createElement("label"); brightnessLabel.htmlFor = "room-light-brightness"; brightnessLabel.textContent = "亮度";
  const percentage = document.createElement("output"); percentage.id = "room-light-percentage";
  percentage.htmlFor.add("room-light-brightness");
  brightnessRow.append(brightnessLabel, percentage); panel.append(brightnessRow);
  const brightness = document.createElement("input");
  brightness.id = "room-light-brightness"; brightness.type = "range";
  brightness.min = "0"; brightness.max = "100"; brightness.step = "1";
  brightness.setAttribute("aria-describedby", percentage.id); panel.append(brightness);
  (document.querySelector("main") ?? document.body).append(panel);

  function render() {
    toggle.setAttribute("aria-checked", String(settings.enabled));
    toggle.textContent = settings.enabled ? "已开启" : "已关闭";
    color.value = settings.color;
    brightness.value = String(settings.brightness);
    brightness.setAttribute("aria-valuetext", `${settings.brightness}%`);
    percentage.value = `${settings.brightness}%`;
    for (const preset of presetButtons)
      preset.setAttribute("aria-pressed", String(preset.dataset.color === settings.color));
  }
  function change(patch: Partial<RoomLightSettings>) {
    if (disposed || !available) return;
    settings = normalizeRoomLightSettings({ ...settings, ...patch });
    render();
    try { window.localStorage.setItem(ROOM_LIGHT_STORAGE_KEY, JSON.stringify(settings)); }
    catch { /* Private browsing or full storage must not disable the controls. */ }
    onChange({ ...settings });
  }
  function close(restoreFocus: boolean) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus && available && !button.disabled) button.focus({ preventScroll: true });
  }
  button.addEventListener("click", () => {
    if (disposed || !available || button.disabled) return;
    if (!panel.hidden) { close(true); return; }
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    toggle.focus({ preventScroll: true });
  }, { signal: events.signal });
  closeButton.addEventListener("click", () => close(true), { signal: events.signal });
  toggle.addEventListener("click", () => change({ enabled: !settings.enabled }), { signal: events.signal });
  color.addEventListener("input", () => change({ color: color.value }), { signal: events.signal });
  brightness.addEventListener("input", () => change({ brightness: Number(brightness.value) }), { signal: events.signal });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || panel.hidden) return;
    event.preventDefault(); event.stopPropagation(); close(true);
  }, { signal: events.signal });
  document.addEventListener("pointerdown", event => {
    if (panel.hidden || !(event.target instanceof Node) || panel.contains(event.target) || button.contains(event.target)) return;
    close(false);
  }, { capture: true, signal: events.signal });
  // Native controls must not bubble into the room's scene and touch gestures.
  for (const event of ["pointerdown", "pointerup", "click", "dblclick", "wheel", "touchstart", "touchend"])
    panel.addEventListener(event, event => event.stopPropagation(), { signal: events.signal });
  render();

  return {
    getSettings(): RoomLightSettings { return { ...settings }; },
    setAvailable(value: boolean) {
      if (disposed) return;
      available = value; button.disabled = !value;
      if (!value) close(false);
    },
    dispose() {
      if (disposed) return;
      close(false); disposed = true; events.abort(); panel.remove();
      button.disabled = original.disabled;
      for (const [name, value] of [["aria-controls", original.controls], ["aria-expanded", original.expanded], ["aria-haspopup", original.popup]]) {
        if (value === null) button.removeAttribute(name!);
        else button.setAttribute(name!, value!);
      }
    },
  };
}
