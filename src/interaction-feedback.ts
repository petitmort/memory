import "./interaction-feedback.css";

export type InteractionKind = "bouquet" | "book" | "cat" | "record" | "door";
type FeedbackPhase = "hover" | "press" | "activate" | "hint";

/** Screen-space feedback never changes a scene material or intercepts a tap. */
export function createInteractionFeedback(container: HTMLElement) {
  const element = document.createElement("div");
  element.className = "scene-object-feedback";
  element.setAttribute("aria-hidden", "true");
  element.hidden = true;
  const label = document.createElement("span");
  label.className = "scene-object-feedback-label";
  element.append(label);
  container.append(element);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let visibleKind: InteractionKind | undefined, visiblePhase: FeedbackPhase | undefined;
  let disposed = false;

  function hide() {
    clearTimeout(timer);
    timer = undefined;
    visibleKind = visiblePhase = undefined;
    element.hidden = true;
  }

  return {
    show(kind: InteractionKind, text: string, x: number, y: number, phase: FeedbackPhase, duration?: number) {
      if (disposed || !Number.isFinite(x + y)) return;
      if (visibleKind === kind && visiblePhase === phase && phase === "hover") return;
      clearTimeout(timer);
      visibleKind = kind; visiblePhase = phase;
      label.textContent = text;
      element.dataset.object = kind;
      element.dataset.phase = phase;
      element.style.left = `${Math.max(110, Math.min(innerWidth - 110, x))}px`;
      element.style.top = `${Math.max(96, Math.min(innerHeight - 100, y - 18))}px`;
      element.hidden = false;
      if (duration !== undefined) timer = setTimeout(hide, duration);
    },
    hide,
    dispose() { disposed = true; hide(); element.remove(); },
  };
}
