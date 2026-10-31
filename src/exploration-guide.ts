/** One invitation after six visible seconds, only while the room is unexplored. */
export function createExplorationGuide() {
  const element = document.getElementById("explore-guide")!;
  const scope = new AbortController();
  let timer: number | undefined, hideTimer: number | undefined;
  let entered = false, active = false, pending = false, feedbackActive = false, disposed = false;
  let remaining = 6000, startedAt = 0;
  let seen = false;
  try { seen = localStorage.getItem("tideline-exploration-seen") === "1"; } catch {}
  function hideElement() {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
    element.classList.add("hidden");
  }
  function pause() {
    if (timer === undefined) return;
    window.clearTimeout(timer);
    timer = undefined;
    remaining = Math.max(0, remaining - (performance.now() - startedAt));
  }
  function remember() {
    seen = true;
    try { localStorage.setItem("tideline-exploration-seen", "1"); } catch {}
  }
  function showIfReady() {
    if (disposed || !active || !pending || document.hidden || feedbackActive || remaining > 0) return;
    pending = false;
    remember();
    element.classList.remove("hidden");
    hideTimer = window.setTimeout(hideElement, 4000);
  }
  function resume() {
    if (disposed || !active || !pending || document.hidden || timer !== undefined) return;
    if (remaining <= 0) { showIfReady(); return; }
    startedAt = performance.now();
    timer = window.setTimeout(() => {
      pause();
      // A background transition may reach the event queue with the timer.
      // Only foreground time is allowed to release the pending invitation.
      // Browsers can release a timeout just before its fractional deadline.
      // Keep the remaining visible time scheduled instead of stranding it.
      if (!document.hidden) resume();
    }, remaining);
  }
  function hide() {
    pause();
    active = pending = false;
    hideElement();
  }
  function dismiss() {
    if (!entered || disposed) return;
    hide();
    remember();
  }
  for (const type of ["pointerdown", "keydown", "click"] as const)
    document.addEventListener(type, () => { if (active) dismiss(); }, { capture: true, signal: scope.signal });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { pause(); hideElement(); }
    else resume();
  }, { signal: scope.signal });
  return {
    enterRoom() {
      if (entered || disposed) return;
      entered = true;
      active = pending = !seen;
      resume();
    },
    setFeedbackActive(value: boolean) {
      feedbackActive = value;
      if (value) hideElement();
      else showIfReady();
    },
    hide,
    dismiss,
    dispose() { scope.abort(); hide(); disposed = true; },
  };
}
