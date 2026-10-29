import { test, expect } from '@playwright/test';
import { CAT_REACTION_DURATION, sampleCatReaction } from '../src/cat-choreography';

test('the cat remains engaged through the recorded meow and settles after its voice', () => {
  expect(sampleCatReaction(0, false)).toEqual({ head: 0, ears: 0, done: false });
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
  expect(sampleCatReaction(CAT_REACTION_DURATION, false)).toEqual({ head: 0, ears: 0, done: true });
  expect(sampleCatReaction(CAT_REACTION_DURATION + 10, false)).toEqual({ head: 0, ears: 0, done: true });
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
  expect(largestEarStep).toBeLessThan(.003);
  expect(largestVelocityStep).toBeLessThan(.03);
  expect(sampleCatReaction(2.88, true).head).toBeGreaterThan(.08);
  expect(sampleCatReaction(3.312, true).done).toBe(false);

  // The quiet endpoints have no sudden initial movement or hard landing.
  const epsilon = 1e-4;
  expect(sampleCatReaction(epsilon, false).head / epsilon).toBeLessThan(.001);
  expect(sampleCatReaction(CAT_REACTION_DURATION - epsilon, false).head / epsilon).toBeLessThan(.001);
});
