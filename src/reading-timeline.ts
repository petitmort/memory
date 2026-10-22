const ramp = (start: number, end: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
  return t*t*(3-2*t);
};

/** One clock for the moving camera, printed paper, readable paper and room light. */
export function readingBlend(progress: number, opening: boolean) {
  const paper = opening ? ramp(.60,.72,progress) : 1-ramp(.24,.38,progress);
  return {
    paper,
    book: 1-paper,
    // Keep both printed layers on the same quad throughout their handoff.
    layout: opening ? ramp(.72,1,progress) : 1-ramp(0,.24,progress),
    // Blur the room after the readable paper fully covers the physical print.
    shade: opening ? ramp(.72,1,progress) : 1-ramp(0,.24,progress),
    controls: opening ? ramp(.90,1,progress) : 1-ramp(0,.12,progress),
    binding: opening ? ramp(.93,1,progress) : 1-ramp(0,.07,progress),
    // Clear the room's dark corners before the DOM ink starts replacing it.
    vignette: opening ? 1-ramp(0,.55,progress) : ramp(.38,1,progress),
    clip: opening ? ramp(.88,1,progress) : 1-ramp(0,.22,progress),
  };
}
