import { test, expect } from '@playwright/test';
import { createCatSleepMotion } from '../src/cat-sleep-motion';
import { CAT_REDUCED_WEIGHT, type CatReactionPose } from '../src/cat-choreography';

const seeded = (initial: number) => {
  let seed = initial;
  return () => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646;
};
const moving = (pose: CatReactionPose) =>
  [pose.ears, pose.earOuter, pose.tailCurl].findIndex(value => value !== 0);
const values = (pose: CatReactionPose) =>
  [pose.head, pose.yaw, pose.roll, pose.ears, pose.earOuter, pose.stretch, pose.tail, pose.tailCurl];
const isRest = (pose: CatReactionPose) => values(pose).every(value => value === 0) && !pose.done;

test('sleep gestures are sparse, varied and leave the body and tail root planted', () => {
  const sleep = createCatSleepMotion(seeded(431));
  const episodes: { kind: number; first: number; last: number; peak: number }[] = [];
  let episode: typeof episodes[number] | undefined, violations = 0;
  // Starting at a nonzero room time must still allow a full quiet interval.
  for (let i = 0; i <= 60000; i++) {
    const time = 50 + i / 100, pose = sleep.sample(time, false), kind = moving(pose);
    if (pose.head || pose.yaw || pose.roll || pose.stretch || pose.tail || pose.done) violations++;
    if ([pose.ears,pose.earOuter,pose.tailCurl].filter(value => value !== 0).length > 1) violations++;
    if (kind < 0) { episode = undefined; continue; }
    if (!episode) { episode = { kind, first:time, last:time, peak:0 }; episodes.push(episode); }
    episode.last = time;
    episode.peak = Math.max(episode.peak, Math.abs([pose.ears,pose.earOuter,pose.tailCurl][kind]));
  }
  expect(violations).toBe(0);
  expect(episodes.length).toBeGreaterThan(20);
  expect(episodes.length).toBeLessThan(60);
  expect(new Set(episodes.map(episode => episode.kind)).size).toBe(3);
  expect(episodes[0].first - 50).toBeGreaterThanOrEqual(10);
  expect(episodes[0].first - 50).toBeLessThanOrEqual(24.02);
  for (let i=0; i<episodes.length; i++) {
    const episode = episodes[i], duration = episode.last - episode.first;
    expect(duration).toBeGreaterThanOrEqual(.68);
    expect(duration).toBeLessThanOrEqual(1.5);
    expect(episode.peak).toBeGreaterThanOrEqual(episode.kind === 2 ? .039 : .119);
    expect(episode.peak).toBeLessThanOrEqual(episode.kind === 2 ? .08 : .22);
    if (i === 0) continue;
    const previous = episodes[i-1], quiet = episode.first - previous.last;
    expect(quiet).toBeGreaterThanOrEqual(10);
    expect(quiet).toBeLessThanOrEqual(24.03);
    expect(episode.kind).not.toBe(previous.kind);
  }
});

test('each isolated twitch eases out of and back into exactly the sleeping pose', () => {
  for (const kindRandom of [0,.4,.9]) {
    let call = 0;
    const sleep = createCatSleepMotion(() => call++ === 0 ? kindRandom : 0);
    expect(isRest(sleep.sample(0,false))).toBe(true);
    expect(isRest(sleep.sample(10,false))).toBe(true);
    const early = { ...sleep.sample(10.001,false) };
    expect(Math.max(...values(early).map(Math.abs))).toBeLessThan(.000001);
    const peak = 10 + .7 * (kindRandom > .8 ? .48 : .28);
    const before = { ...sleep.sample(peak-.001,false) };
    const centre = { ...sleep.sample(peak,false) };
    const after = { ...sleep.sample(peak+.001,false) };
    expect(moving(centre)).toBe(Math.floor(kindRandom*3));
    expect(Math.abs(values(centre)[[3,4,7][moving(centre)]])).toBeCloseTo(kindRandom > .8 ? .04 : .12,8);
    for (let axis=0; axis<8; axis++) {
      expect(Math.abs(values(centre)[axis]-values(before)[axis])/.001).toBeLessThan(.01);
      expect(Math.abs(values(after)[axis]-values(centre)[axis])/.001).toBeLessThan(.01);
    }
    const late = sleep.sample(10.699,false);
    expect(Math.max(...values(late).map(Math.abs))).toBeLessThan(.000001);
    expect(isRest(sleep.sample(10.700001,false))).toBe(true);
  }
});

test('reduced motion uses the same sparse schedule with sixteen percent of the motion', () => {
  const normal = createCatSleepMotion(seeded(762)), gentle = createCatSleepMotion(seeded(762));
  let activeSamples = 0, maxDifference = 0;
  for (let i=0; i<=18000; i++) {
    const time = i / 100, full = normal.sample(time,false), small = gentle.sample(time,true);
    if (moving(full)>=0) activeSamples++;
    for (let axis=0; axis<8; axis++)
      maxDifference=Math.max(maxDifference,Math.abs(values(small)[axis]-values(full)[axis]*CAT_REDUCED_WEIGHT));
  }
  expect(activeSamples).toBeGreaterThan(200);
  expect(maxDifference).toBeLessThan(1e-12);
});

test('reset, rewinds and long gaps discard old gestures without queuing an immediate one', () => {
  const sleep = createCatSleepMotion(() => 0);
  sleep.sample(0,false);
  expect(moving(sleep.sample(10.2,false))).toBe(0);
  sleep.reset(10.2);
  expect(isRest(sleep.sample(10.21,false))).toBe(true);
  expect(isRest(sleep.sample(20.199,false))).toBe(true);
  expect(moving(sleep.sample(20.4,false))).toBe(1);

  expect(isRest(sleep.sample(100,false))).toBe(true);
  expect(isRest(sleep.sample(100,false))).toBe(true);
  expect(isRest(sleep.sample(109.999,false))).toBe(true);
  expect(moving(sleep.sample(110.2,false))).toBe(0);
  expect(isRest(sleep.sample(2,false))).toBe(true);
  expect(isRest(sleep.sample(11.999,false))).toBe(true);
  expect(moving(sleep.sample(12.2,false))).toBe(1);
  for (const time of [Number.NaN,Infinity,-Infinity]) {
    const pose=sleep.sample(time,false);
    expect(isRest(pose)).toBe(true);
    expect(values(pose).every(Number.isFinite)).toBe(true);
  }
});

test('invalid random samples stay finite and holding the clock does not generate new motion', () => {
  for (const constant of [0,1,Number.NaN,-1,Infinity]) {
    let calls=0;
    const sleep=createCatSleepMotion(()=>{calls++;return constant;});
    sleep.sample(0,false);
    const scheduled=calls;
    for (let i=0;i<100;i++) expect(isRest(sleep.sample(0,false))).toBe(true);
    expect(calls).toBe(scheduled);
    for (let i=1;i<=600;i++) expect(values(sleep.sample(i/2,false)).every(Number.isFinite)).toBe(true);
  }
});
