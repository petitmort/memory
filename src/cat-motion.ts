import { sampleCatResponse, type CatReactionPose } from "./cat-choreography";
import { createCatReactionPicker, type CatReactionProfile } from "./cat-reactions";
import { createCatSleepMotion } from "./cat-sleep-motion";

/** One scene clock for sleep, and the captured voice clock for each response. */
export function createCatMotion(random: () => number = Math.random) {
  const sleep = createCatSleepMotion(random), reactions = createCatReactionPicker(random);
  const pose: CatReactionPose = {
    head:0, yaw:0, roll:0, ears:0, earOuter:0, stretch:0, tail:0, tailCurl:0, done:false,
  };
  let lastTime = 0, cooldownUntil = -Infinity;
  let reaction: {
    profile: CatReactionProfile; from: CatReactionPose; gentle: boolean;
    elapsed: number; startedAt: number | null; clock?: () => number;
  } | undefined;

  function remember(value: CatReactionPose) { Object.assign(pose, value); return pose; }
  function rest() {
    pose.head=pose.yaw=pose.roll=pose.ears=pose.earOuter=pose.stretch=pose.tail=pose.tailCurl=0;
    pose.done=false;
    return pose;
  }
  return {
    pet(time: number, reduced: boolean) {
      if (reaction || !Number.isFinite(time) || time < cooldownUntil) return false;
      reaction = { profile:reactions.next(), from:{...pose}, gentle:reduced, elapsed:0, startedAt:null };
      // Cancel the sleeping twitch, without clearing its last visible pose.
      sleep.reset(time);
      return true;
    },
    getReaction() { return reaction?.profile; },
    setReactionClock(clock: (()=>number) | undefined) { if (reaction) reaction.clock=clock; },
    isPetting() { return reaction !== undefined; },
    cancel() {
      reaction=undefined;
      cooldownUntil=lastTime+.12;
      sleep.reset(lastTime);
      return rest();
    },
    update(time: number, reduced: boolean): CatReactionPose {
      if (!Number.isFinite(time)) return pose;
      lastTime=time;
      if (!reaction) return remember(sleep.sample(time,reduced));
      if (reaction.startedAt===null) reaction.startedAt=time;
      const elapsed=reaction.clock?.() ?? time-reaction.startedAt;
      if (Number.isFinite(elapsed)) reaction.elapsed=Math.max(reaction.elapsed,elapsed,0);
      const frame=sampleCatResponse(reaction.elapsed,reaction.gentle,reaction.profile);
      if (frame.done) {
        reaction=undefined;
        cooldownUntil=time+.20;
        sleep.reset(time);
        return remember(frame);
      }
      // Ease only the three sleeping axes into the response. Head, shoulder
      // and every vocal accent keep the original recording's absolute time.
      if (reaction.elapsed<.18) {
        const a=reaction.elapsed/.18, weight=a*a*a*(a*(a*6-15)+10);
        for (const axis of ["ears","earOuter","tailCurl"] as const)
          frame[axis]=reaction.from[axis]+(frame[axis]-reaction.from[axis])*weight;
      }
      return remember(frame);
    },
  };
}
