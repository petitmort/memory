/** Seconds from the shared presentation clock, including the final soft settle. */
export const CAT_REACTION_DURATION = 4;

export type CatReactionPose = { head: number; ears: number; stretch: number; tail: number; done: boolean };

// The recording purrs until 2.600 s, pauses until 2.760 s, then meows until
// 3.312 s. Keep the cat awake through that response, and let its head settle
// only after the voice has finished. Values stay within the authored scan pose.
const headPoses = [
  [0, 0],
  [.58, .78],
  [1.12, .35],
  [1.72, .64],
  [2.36, .38],
  [2.88, 1],
  [3.12, .85],
  [CAT_REACTION_DURATION, 0],
] as const;

/** Quintic easing has zero velocity and acceleration at both ends. */
function ease(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return Math.max(0, Math.min(1, t * t * t * (t * (t * 6 - 15) + 10)));
}

function headAt(time: number) {
  for (let i = 1; i < headPoses.length; i++) {
    const [end, to] = headPoses[i];
    if (time <= end) {
      const [start, from] = headPoses[i - 1];
      return from + (to - from) * ease((time - start) / (end - start));
    }
  }
  return 0;
}

function flick(time: number, start: number, peak: number, end: number) {
  if (time <= start || time >= end) return 0;
  return time < peak ? ease((time - start) / (peak - start)) : 1 - ease((time - peak) / (end - peak));
}

/** Sample the entire response without stretching reduced-motion timing. */
export function sampleCatReaction(elapsed: number, reduced: boolean, variant = 0): CatReactionPose {
  const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  if (time >= CAT_REACTION_DURATION) return { head: 0, ears: 0, stretch: 0, tail: 0, done: true };
  // Rotate emphasis between a nuzzle, a shoulder stretch and a tail response.
  // All share the same vocal cue and return to exactly the same sleeping pose.
  const emphasis = ((Math.trunc(variant) % 3) + 3) % 3;
  const head = headAt(time);
  const ears = .54 * flick(time, .22, .60, 1.15) + .24 * flick(time, 1.35, 1.65, 2.10) + .72 * flick(time, 2.46, 2.89, 3.38);
  const stretch = (emphasis === 1 ? 1 : .68) * flick(time, .12, 1.04, 2.36) + .28 * flick(time, 2.46, 2.98, 3.84);
  const tail = (emphasis === 2 ? 1 : .72) * flick(time, .34, 1.12, 1.94) + .64 * flick(time, 2.05, 2.80, 3.72);
  return {
    head: head * (reduced ? .16 : 1),
    ears: ears * (reduced ? .22 : 1),
    stretch: stretch * (reduced ? .12 : 1),
    tail: tail * (reduced ? .14 : 1),
    done: false,
  };
}
