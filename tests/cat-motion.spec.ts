import { test, expect } from '@playwright/test';
import { createCatMotion } from '../src/cat-motion';
import { sampleCatResponse } from '../src/cat-choreography';

const axes = ['head','yaw','roll','ears','earOuter','stretch','tail','tailCurl'] as const;
const atRest = (pose: ReturnType<ReturnType<typeof createCatMotion>['update']>) => axes.every(axis=>pose[axis]===0);

test('touching during an ear twitch blends from the last visible pose into the existing response clock', () => {
  const motion=createCatMotion(()=>0);
  motion.update(0,false);
  const start=10.196, sleeping={...motion.update(start,false)};
  expect(sleeping.ears).toBeCloseTo(.12,6);
  expect(motion.pet(start,false)).toBe(true);
  const profile=motion.getReaction()!;
  expect(motion.pet(start,false)).toBe(false);
  const first={...motion.update(start,false)};
  for(const axis of axes)expect(first[axis]).toBe(sleeping[axis]);
  let previous=first, maxStep=0;
  for(let step=1;step<=180;step++) {
    const elapsed=step/1000, pose={...motion.update(start+elapsed,false)};
    for(const axis of axes)maxStep=Math.max(maxStep,Math.abs(pose[axis]-previous[axis]));
    // Only the sleeping axes blend; the face/shoulder trajectory keeps its phase.
    const target=sampleCatResponse(elapsed,false,profile);
    for(const axis of ['head','yaw','roll','stretch','tail'] as const)
      expect(pose[axis]).toBeCloseTo(target[axis],10);
    previous=pose;
  }
  expect(maxStep).toBeLessThan(.007);
  for(const axis of axes)
    expect(previous[axis]).toBeCloseTo(sampleCatResponse(.18,false,profile)[axis],10);
  for(const cue of profile.cues) {
    const time=cue.peak!;
    const actual=motion.update(start+time,false), expected=sampleCatResponse(time,false,profile);
    for(const axis of axes)expect(actual[axis]).toBeCloseTo(expected[axis],10);
  }
});

test('the captured audio clock drives the gesture even when scene frames are slow or a clock sample rewinds', () => {
  const motion=createCatMotion(()=>0);
  motion.update(0,false);
  expect(motion.pet(0,false)).toBe(true);
  const profile=motion.getReaction()!;
  let audioTime=0;
  motion.setReactionClock(()=>audioTime);
  motion.update(0,false);
  audioTime=profile.cues[0].peak!;
  const accent={...motion.update(100,false)}, expected=sampleCatResponse(audioTime,false,profile);
  for(const axis of axes)expect(accent[axis]).toBeCloseTo(expected[axis],10);
  audioTime=.5;
  expect(motion.update(101,false)).toEqual(accent);
  audioTime=Number.NaN;
  expect(motion.update(102,false)).toEqual(accent);
  audioTime=profile.duration;
  expect(atRest(motion.update(103,false))).toBe(true);
  expect(motion.isPetting()).toBe(false);
  expect(motion.pet(103.1,false)).toBe(false);
  expect(atRest(motion.update(113,false))).toBe(true);
});

test('silent and reduced-motion gestures finish on time, cancel cleanly and keep all six nonrepeating profiles', () => {
  const motion=createCatMotion(()=>.999);
  motion.update(0,true);
  const seen=new Set<string>();
  for(let gesture=0;gesture<6;gesture++) {
    const start=gesture*5;
    expect(motion.pet(start,true)).toBe(true);
    const profile=motion.getReaction()!;seen.add(profile.id);
    motion.update(start,true);
    const actual=motion.update(start+1,true), expected=sampleCatResponse(1,true,profile);
    for(const axis of axes)expect(actual[axis]).toBeCloseTo(expected[axis],10);
    expect(atRest(motion.update(start+profile.duration+.000001,true))).toBe(true);
    expect(motion.isPetting()).toBe(false);
    expect(atRest(motion.update(start+4.8,true))).toBe(true);
  }
  expect(seen.size).toBe(6);
  expect(motion.pet(30,true)).toBe(true);
  motion.update(30,true);motion.update(30.6,true);
  expect(atRest(motion.cancel())).toBe(true);
  expect(motion.isPetting()).toBe(false);expect(motion.getReaction()).toBeUndefined();
  expect(atRest(motion.update(40.59,true))).toBe(true);
  expect(motion.pet(40.6,true)).toBe(true);
});

test('the real sleeping-cat factory updates its native bones only when a pose changes and clears sleep on cancellation', async ({ page }) => {
  await page.addInitScript(()=>{Math.random=()=>0;});
  await page.route('**/__sleeping-cat-factory', route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Sleeping cat</title>'}));
  await page.goto('/__sleeping-cat-factory');
  const result=await page.evaluate(async()=>{
    const path='/src/sleeping-cat.ts';
    const {createSleepingCat}=await import(path), cat=createSleepingCat();
    await cat.ready;
    let mesh:any;cat.group.traverse((object:any)=>{if(object.isSkinnedMesh)mesh=object;});
    const buffers=Object.values(mesh.geometry.attributes).map((attribute:any)=>attribute.array);
    const bones=()=>Object.fromEntries(mesh.skeleton.bones.map((bone:any)=>[bone.name,bone.quaternion.toArray()]));
    const rest=bones(), quiet=cat.update(0,false), twitch=cat.update(10.196,false), sleeping=bones();
    const held=cat.update(10.196,false), accepted=cat.pet(10.196,false), repeat=cat.pet(10.196,false);
    let voiceTime=0;cat.setReactionClock(()=>voiceTime);
    const transition=cat.update(10.196,false), first=bones();
    voiceTime=.12;const responding=cat.update(10.3,false);
    voiceTime=4.4;cat.update(15,false);
    const finished=bones(), finishedActive=cat.isPetting();
    const resting=cat.update(15.1,false);
    cat.update(25.3,false);const cancelChanged=cat.cancelPet(), cancelled=bones();
    const afterCancel=cat.update(25.3,false);
    const late=cat.update(100,false), afterLate=cat.update(100.1,false);
    const reused=Object.values(mesh.geometry.attributes).every((attribute:any,index)=>attribute.array===buffers[index]);
    cat.dispose();
    return {rest,sleeping,first,finished,cancelled,quiet,twitch,held,accepted,repeat,transition,responding,
      finishedActive,resting,cancelChanged,afterCancel,late,afterLate,reused,disposedUpdate:cat.update(101,false),disposedPet:cat.pet(101,false)};
  });
  expect(result.quiet).toBe(false);expect(result.twitch).toBe(true);expect(result.held).toBe(false);
  expect(result.sleeping['cat-ear-inner']).not.toEqual(result.rest['cat-ear-inner']);
  expect(result.first).toEqual(result.sleeping);expect(result.transition).toBe(false);
  expect(result.accepted).toBe(true);expect(result.repeat).toBe(false);expect(result.responding).toBe(true);
  const sameSleepingPose=(actual:Record<string,number[]>)=>{
    for(const [name,quaternion] of Object.entries(result.rest) as [string,number[]][])
      quaternion.forEach((value,index)=>expect(actual[name][index]).toBeCloseTo(value,12));
  };
  sameSleepingPose(result.finished);expect(result.finishedActive).toBe(false);
  expect(result.resting).toBe(false);expect(result.cancelChanged).toBe(true);
  sameSleepingPose(result.cancelled);expect(result.afterCancel).toBe(false);
  expect(result.late).toBe(false);expect(result.afterLate).toBe(false);expect(result.reused).toBe(true);
  expect(result.disposedUpdate).toBe(false);expect(result.disposedPet).toBe(false);
});
