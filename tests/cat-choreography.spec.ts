import { test, expect } from '@playwright/test';
import { CAT_REACTION_DURATION, sampleCatReaction } from '../src/cat-choreography';

test('the cat remains engaged through the recorded meow and settles after its voice', () => {
  expect(sampleCatReaction(0, false)).toEqual({ head: 0, ears: 0, stretch: 0, tail: 0, done: false });
  const nuzzle = sampleCatReaction(.58, false);
  const beforeMeow = sampleCatReaction(2.36, false);
  const meow = sampleCatReaction(2.88, false);
  const voiceFinished = sampleCatReaction(3.312, false);
  expect(nuzzle.head).toBeGreaterThan(.5);
  expect(beforeMeow.head).toBeGreaterThan(.2);
  expect(meow.head).toBeGreaterThan(beforeMeow.head + .4);
  expect(meow.ears).toBeGreaterThan(.4);
  expect(voiceFinished.head).toBeGreaterThan(.4);
  expect(voiceFinished.done).toBe(false);
  expect(sampleCatReaction(3.8, false).head).toBeLessThan(voiceFinished.head);
  expect(sampleCatReaction(CAT_REACTION_DURATION, false)).toEqual({ head: 0, ears: 0, stretch: 0, tail: 0, done: true });
  expect(sampleCatReaction(CAT_REACTION_DURATION + 10, false)).toEqual({ head: 0, ears: 0, stretch: 0, tail: 0, done: true });
});

test('all pose changes are continuous and reduced motion retains the sound timing', () => {
  const step = .001;
  let previous = sampleCatReaction(0, false);
  let largestHeadStep = 0, largestEarStep = 0;
  let largestHead = 0, largestEars = 0;
  let smallestPose = Infinity, largestReducedError = 0, timingMismatch = false;
  let headVelocity = 0, earVelocity = 0, largestVelocityStep = 0;
  for (let time = step; time <= CAT_REACTION_DURATION + step; time += step) {
    const normal = sampleCatReaction(time, false), reduced = sampleCatReaction(time, true);
    largestHeadStep = Math.max(largestHeadStep, Math.abs(normal.head - previous.head));
    largestEarStep = Math.max(largestEarStep, Math.abs(normal.ears - previous.ears));
    largestHead = Math.max(largestHead, normal.head);
    largestEars = Math.max(largestEars, normal.ears);
    smallestPose = Math.min(smallestPose, normal.head, normal.ears);
    largestReducedError = Math.max(largestReducedError, Math.abs(reduced.head - normal.head * .16), Math.abs(reduced.ears - normal.ears * .22));
    timingMismatch ||= reduced.done !== normal.done;
    const nextHeadVelocity = (normal.head - previous.head) / step;
    const nextEarVelocity = (normal.ears - previous.ears) / step;
    largestVelocityStep = Math.max(largestVelocityStep, Math.abs(nextHeadVelocity - headVelocity), Math.abs(nextEarVelocity - earVelocity));
    headVelocity = nextHeadVelocity; earVelocity = nextEarVelocity;
    previous = normal;
  }
  expect(smallestPose).toBeGreaterThanOrEqual(0);
  expect(largestReducedError).toBeLessThan(1e-12);
  expect(timingMismatch).toBe(false);
  expect(largestHead).toBeLessThanOrEqual(1); expect(largestEars).toBeLessThanOrEqual(.85);
  // At 1 ms intervals, these bounds reject a snapped pose while leaving room
  // for a naturally brisk, small ear movement near the meow.
  expect(largestHeadStep).toBeLessThan(.003);
  expect(largestEarStep).toBeLessThan(.004);
  expect(largestVelocityStep).toBeLessThan(.03);
  expect(sampleCatReaction(2.88, true).head).toBeGreaterThan(.08);
  expect(sampleCatReaction(3.312, true).done).toBe(false);

  // The quiet endpoints have no sudden initial movement or hard landing.
  const epsilon = 1e-4;
  expect(sampleCatReaction(epsilon, false).head / epsilon).toBeLessThan(.001);
  expect(sampleCatReaction(CAT_REACTION_DURATION - epsilon, false).head / epsilon).toBeLessThan(.001);
});

test('shoulder and tail responses vary without snapping, shifting the vocal cue or extending the reaction', () => {
  const factors={head:.16,ears:.22,stretch:.12,tail:.14};
  const channels=Object.keys(factors) as (keyof typeof factors)[];
  const peaks=[0,1,2].map(variant=>{
    const peaks={head:0,ears:0,stretch:0,tail:0};
    let minimum=Infinity,largestStep=0,reducedError=0,timingMismatch=false;
    let previous=sampleCatReaction(0,false,variant);
    for(let time=.002;time<=CAT_REACTION_DURATION+.002;time+=.002) {
      const pose=sampleCatReaction(time,false,variant),reduced=sampleCatReaction(time,true,variant);
      timingMismatch ||= pose.done!==reduced.done;
      for(const key of channels) {
        peaks[key]=Math.max(peaks[key],pose[key]);
        minimum=Math.min(minimum,pose[key]);
        largestStep=Math.max(largestStep,Math.abs(pose[key]-previous[key]));
        reducedError=Math.max(reducedError,Math.abs(reduced[key]-pose[key]*factors[key]));
      }
      previous=pose;
    }
    expect(minimum).toBeGreaterThanOrEqual(0);
    expect(Math.max(...Object.values(peaks))).toBeLessThanOrEqual(1);
    expect(largestStep).toBeLessThan(.007);
    expect(reducedError).toBeLessThan(1e-12);
    expect(timingMismatch).toBe(false);
    expect(sampleCatReaction(2.88,false,variant).head).toBe(1);
    expect(sampleCatReaction(CAT_REACTION_DURATION,false,variant)).toEqual({head:0,ears:0,stretch:0,tail:0,done:true});
    return peaks;
  });
  expect(peaks[0].stretch).toBeGreaterThan(.6);
  expect(peaks[1].stretch).toBeGreaterThan(peaks[0].stretch+.25);
  expect(peaks[2].tail).toBeGreaterThan(peaks[0].tail+.25);
  expect(peaks[0].head).toBeCloseTo(peaks[1].head,10);
  expect(peaks[0].ears).toBeCloseTo(peaks[2].ears,10);
});
