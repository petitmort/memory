import { CAT_REDUCED_WEIGHT, type CatReactionPose } from "./cat-choreography";

type SleepGesture = { kind: number; start: number; duration: number; amplitude: number };

/** Rare ear twitches and tail-tip curls, driven only by the room's visible time. */
export function createCatSleepMotion(random: () => number = Math.random) {
  // The returned pose is reused. Copy it before retaining a transition origin.
  const pose: CatReactionPose = {
    head: 0, yaw: 0, roll: 0, ears: 0, earOuter: 0,
    stretch: 0, tail: 0, tailCurl: 0, done: false,
  };
  let gesture: SleepGesture | undefined;
  let lastTime: number | undefined, previousKind: number | undefined;

  function unit() {
    const value = random();
    return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : .5;
  }
  function rest() {
    pose.ears = pose.earOuter = pose.tailCurl = 0;
    return pose;
  }
  function schedule(time: number) {
    let kind = Math.floor(unit() * (previousKind === undefined ? 3 : 2));
    if (previousKind !== undefined && kind >= previousKind) kind++;
    gesture = {
      kind, start: time + 10 + unit() * 14, duration: .7 + unit() * .8,
      amplitude: kind === 2 ? (.04 + unit() * .04) * (unit() < .5 ? -1 : 1) : .12 + unit() * .10,
    };
  }
  function reset(time: number) {
    const now = Number.isFinite(time) ? Math.max(0, time) : lastTime ?? 0;
    rest();
    lastTime = now;
    schedule(now);
  }
  // Zero velocity and acceleration at the start, peak and end of each twitch.
  function ease(value: number) {
    return value * value * value * (value * (value * 6 - 15) + 10);
  }

  return {
    reset,
    sample(time: number, reduced: boolean): CatReactionPose {
      rest();
      if (!Number.isFinite(time)) return pose;
      const now = Math.max(0, time);
      if (lastTime === undefined || now < lastTime) {
        reset(now);
        return pose;
      }
      lastTime = now;
      const active = gesture!;
      const elapsed = now - active.start;
      if (elapsed <= 0) return pose;
      if (elapsed >= active.duration) {
        // A long pause skips stale gestures instead of replaying a backlog.
        schedule(now);
        return pose;
      }
      previousKind = active.kind;
      const progress = elapsed / active.duration, peak = active.kind === 2 ? .48 : .28;
      const weight = ease(progress < peak ? progress / peak : (1 - progress) / (1 - peak));
      const amount = active.amplitude * weight * (reduced ? CAT_REDUCED_WEIGHT : 1);
      if (active.kind === 0) pose.ears = amount;
      else if (active.kind === 1) pose.earOuter = amount;
      else pose.tailCurl = amount;
      return pose;
    },
  };
}
