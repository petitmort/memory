import "./interaction-feedback.css";

export type InteractionKind = "bouquet" | "book" | "cat" | "record" | "door";
type FeedbackPhase = "hover" | "press" | "activate" | "hint";
const names: Record<InteractionKind, string> = {
  bouquet: "花束", book: "纪念册", cat: "小猫", record: "唱片机", door: "门",
};

/** Screen-space feedback never changes a scene material or intercepts a tap. */
export function createInteractionFeedback(container: HTMLElement, onVisibilityChange?: (visible: boolean) => void) {
  const element = document.createElement("div");
  element.className = "scene-object-feedback";
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  const label = document.createElement("span");
  label.className = "scene-object-feedback-label";
  const point = document.createElement("span");
  point.className = "scene-object-feedback-point";
  point.hidden = true;
  element.append(label, point);
  container.append(element);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visibleKind: InteractionKind | undefined, visiblePhase: FeedbackPhase | undefined;
  const used = new Set<InteractionKind>();
  let disposed = false;

  function hide() {
    clearTimeout(timer);
    timer = undefined;
    visibleKind = visiblePhase = undefined;
    const wasVisible = !element.hidden;
    element.hidden = true;
    if (wasVisible) onVisibilityChange?.(false);
  }

  return {
    show(kind: InteractionKind, text: string, x: number, y: number, phase: FeedbackPhase, duration?: number) {
      if (disposed || !Number.isFinite(x + y)) return;
      const familiar = kind !== "door" && used.has(kind);
      const quiet = familiar && (phase === "press" || phase === "activate");
      const message = quiet ? "" : familiar && phase === "hover" ? names[kind] : text;
      if (visibleKind === kind && visiblePhase === phase && phase === "hover" && label.textContent === message) return;
      clearTimeout(timer);
      visibleKind = kind; visiblePhase = phase;
      label.textContent = message;
      label.hidden = quiet;
      point.hidden = !quiet;
      element.dataset.object = kind;
      element.dataset.phase = phase;
      element.dataset.quiet = String(quiet);
      const margin = quiet ? 14 : Math.min(110, innerWidth / 2);
      element.style.left = `${Math.max(margin, Math.min(innerWidth - margin, x))}px`;
      element.style.top = `${Math.max(96, Math.min(innerHeight - 100, y - 18))}px`;
      const wasHidden = element.hidden;
      element.hidden = false;
      if (duration !== undefined) timer = setTimeout(hide, duration);
      if (wasHidden) onVisibilityChange?.(true);
    },
    // Keep the first accepted response visible; the next encounter is quieter.
    markUsed(kind: InteractionKind) { if (!disposed) used.add(kind); },
    hide,
    dispose() { disposed = true; hide(); element.remove(); },
  };
}
