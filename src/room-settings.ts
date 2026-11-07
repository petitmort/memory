import "./room-settings.css";

/** A disclosure for the existing room tools, without owning their settings. */
export function createRoomSettings(button: HTMLButtonElement, menu: HTMLElement, closeTools: () => void) {
  const events = new AbortController();
  let available = false, disposed = false;
  const room = button.closest<HTMLElement>(".room-ui")!;
  button.setAttribute("aria-controls", menu.id);
  button.setAttribute("aria-expanded", "false");
  menu.hidden = true;

  function fitMusic() {
    const panel = room.querySelector<HTMLElement>(".record-panel");
    const content = panel?.querySelector<HTMLElement>(".record-panel-content");
    if (!panel || !content || panel.classList.contains("hidden")) return;
    // Music shares the same room-action clearance as the light/time dialogs.
    // It can also appear independently when a manual playback attempt fails.
    const bounds = room.getBoundingClientRect(), panelBounds = panel.getBoundingClientRect();
    content.style.maxHeight = panelBounds.left >= bounds.right + 8 || panelBounds.right <= bounds.left - 8
      ? "" : `${Math.max(132, bounds.top - panelBounds.top - 12)}px`;
  }
  function close(focus = false) {
    closeTools();
    if (menu.hidden) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (focus && available) button.focus({ preventScroll: true });
  }
  button.addEventListener("click", () => {
    if (disposed || !available) return;
    if (!menu.hidden) { close(true); return; }
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    fitMusic();
  }, { signal: events.signal });
  document.addEventListener("keydown", event => {
    // Child dialogs handle the first Escape and return to their own trigger.
    if (event.key !== "Escape" || event.defaultPrevented || menu.hidden) return;
    event.preventDefault(); close(true);
  }, { signal: events.signal });
  function outside(event: Event) {
    if (menu.hidden || !(event.target instanceof Element)) return;
    if (button.contains(event.target) || menu.contains(event.target)
      || event.target.closest(".room-light-panel,.time-flow-panel,.record-panel,#record-file")) return;
    close();
  }
  // Collapsing this in-flow disclosure moves the primary action row. Wait
  // until click has a fixed target so pointerup still reaches the same button.
  document.addEventListener("click", outside, { capture: true, signal: events.signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) close(); }, { signal: events.signal });
  window.addEventListener("resize", fitMusic, { signal: events.signal });
  const size = new ResizeObserver(fitMusic); size.observe(room);
  const music = new MutationObserver(fitMusic);
  const panel = room.querySelector(".record-panel");
  if (panel) music.observe(panel, { attributes: true, attributeFilter: ["class"] });
  return {
    setAvailable(value: boolean) {
      if (disposed) return;
      available = value; button.disabled = !value;
      if (!value) close();
    },
    dispose() {
      if (disposed) return;
      close(); disposed = true; events.abort(); size.disconnect(); music.disconnect();
    },
  };
}
