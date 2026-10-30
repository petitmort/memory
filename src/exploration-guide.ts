/** A brief first visit invitation; all direct controls remain available. */
export function createExplorationGuide() {
  const element = document.getElementById("explore-guide")!;
  const scope = new AbortController();
  let timer: number | undefined, shown = false;
  let seen = false;
  try { seen = localStorage.getItem("tideline-exploration-seen") === "1"; } catch {}
  function hide() {
    window.clearTimeout(timer);
    element.classList.add("hidden");
  }
  document.addEventListener("pointerdown", hide, { signal: scope.signal, passive: true });
  document.addEventListener("keydown", hide, { signal: scope.signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) hide(); }, { signal: scope.signal });
  return {
    enterRoom() {
      if (seen || shown || document.hidden) return;
      shown = true;
      element.classList.remove("hidden");
      try { localStorage.setItem("tideline-exploration-seen", "1"); } catch {}
      timer = window.setTimeout(hide, 5000);
    },
    hide,
    dispose() { scope.abort(); hide(); },
  };
}
