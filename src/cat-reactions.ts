export type CatReactionId = "content" | "curious" | "affectionate" | "sleepy" | "playful" | "stretch";
export type CatReactionProfile = {
  id: CatReactionId;
  label: string;
  hint: string;
  duration: number;
  cues: readonly { start: number; end: number; peak?: number }[];
  variation?: { amplitude: number; direction: number; tailPhase: number };
};

/** Each profile pairs one prepared recording with the very same vocal cues. */
export const CAT_REACTIONS: readonly CatReactionProfile[] = [
  { id: "content", label: "满足", hint: "小猫眯着眼轻轻蹭了蹭", duration: 4.4,
    cues: [{ start: 2.760, end: 3.312018140589569, peak: 2.975 }] },
  { id: "curious", label: "好奇", hint: "小猫抬起头，轻声回应你", duration: 4.4,
    cues: [{ start: 1.20, end: 1.7307936507936508, peak: 1.365002 }] },
  { id: "affectionate", label: "亲昵", hint: "小猫靠过来，软软地叫了两声", duration: 4.4,
    cues: [{ start: 1.65, end: 2.202018140589569, peak: 1.821577 }, { start: 2.38, end: 2.9432879818594104, peak: 2.555067 }] },
  { id: "sleepy", label: "困倦", hint: "小猫懒懒地伸展，又慢慢放松", duration: 4.4,
    cues: [{ start: 2.40, end: 3.207120181405896, peak: 2.651518 }] },
  { id: "playful", label: "轻快", hint: "小猫摆摆耳朵，尾尖跟着轻轻摇", duration: 4.4,
    cues: [{ start: 1.10, end: 1.6207709750566894, peak: 1.261901 }, { start: 1.95, end: 2.6795238095238094, peak: 2.177395 }] },
  { id: "stretch", label: "慵懒", hint: "小猫舒展肩颈，轻声回应", duration: 4.4,
    cues: [{ start: 2.72, end: 3.478684807256236, peak: 2.956463 }] },
];

/** Shuffle in small bags, avoiding a repeated mood at a bag boundary too. */
export function createCatReactionPicker(random: () => number = Math.random) {
  let remaining: CatReactionProfile[] = [], previous: CatReactionId | undefined;
  const sample = () => {
    const value = random();
    return Number.isFinite(value) ? Math.max(0, Math.min(1 - Number.EPSILON, value)) : .5;
  };
  return {
    next(): CatReactionProfile {
      if (!remaining.length) {
        remaining = [...CAT_REACTIONS];
        for (let i = remaining.length - 1; i > 0; i--) {
          const index = Math.floor(sample() * (i + 1));
          [remaining[i], remaining[index]] = [remaining[index], remaining[i]];
        }
        if (remaining[0].id === previous)
          [remaining[0], remaining[1]] = [remaining[1], remaining[0]];
      }
      const profile = remaining.shift()!;
      previous = profile.id;
      return { ...profile, variation: {
        amplitude: .92 + sample() * .08,
        direction: sample() < .5 ? -1 : 1,
        tailPhase: (sample() - .5) * .2,
      } };
    },
  };
}
