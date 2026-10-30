import { test, expect } from '@playwright/test';
import { CAT_REACTIONS, createCatReactionPicker } from '../src/cat-reactions';
import { CAT_REACTION_DURATION } from '../src/cat-choreography';

test('a random sequence explores every response without immediate repetitions', () => {
  let seed = 139;
  const picker = createCatReactionPicker(() => ((seed = seed * 16807 % 2147483647) - 1) / 2147483646);
  const profiles = Array.from({ length: 60 }, () => picker.next());
  for (let i = 1; i < profiles.length; i++) expect(profiles[i].id).not.toBe(profiles[i - 1].id);
  for (let start = 0; start < profiles.length; start += 6)
    expect(new Set(profiles.slice(start, start + 6).map(profile => profile.id)).size).toBe(6);
  expect(profiles.slice(0, 6).map(profile => profile.id)).not.toEqual(profiles.slice(6, 12).map(profile => profile.id));
  expect(new Set(profiles.map(profile => profile.variation!.amplitude)).size).toBeGreaterThan(20);
  for (const profile of profiles) {
    expect(profile.variation!.amplitude).toBeGreaterThanOrEqual(.92);
    expect(profile.variation!.amplitude).toBeLessThanOrEqual(1);
    expect([-1, 1]).toContain(profile.variation!.direction);
  }
});

test('all vocal cues fit their response and repeated identical random input remains safe', () => {
  for (const profile of CAT_REACTIONS) {
    expect(profile.duration).toBe(CAT_REACTION_DURATION);
    let previousEnd = 0;
    for (const cue of profile.cues) {
      expect(cue.start).toBeGreaterThan(previousEnd);
      expect(cue.end).toBeGreaterThan(cue.start);
      expect(cue.end).toBeLessThan(profile.duration - .4);
      expect(cue.peak).toBeGreaterThan(cue.start);
      expect(cue.peak).toBeLessThan(cue.end);
      previousEnd = cue.end;
    }
  }
  for (const random of [() => 0, () => 1, () => Number.NaN]) {
    const picker = createCatReactionPicker(random);
    let previous = '';
    for (let i = 0; i < 30; i++) {
      const profile = picker.next();
      expect(profile.id).not.toBe(previous);
      previous = profile.id;
    }
  }
});
