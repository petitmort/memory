import { test,expect } from '@playwright/test';
import { CAT_REACTION_DURATION,CAT_REDUCED_WEIGHT,sampleCatReaction } from '../src/cat-choreography';

const channels=['head','yaw','roll','ears','earOuter','stretch','tail','tailCurl'] as const;
const resting={head:0,yaw:0,roll:0,ears:0,earOuter:0,stretch:0,tail:0,tailCurl:0};

test('the cat stays awake through the existing meow and has a quiet, complete settle',()=>{
  expect(sampleCatReaction(0,false)).toEqual({...resting,done:false});
  const before=sampleCatReaction(2.36,false),meow=sampleCatReaction(2.88,false),voiceEnd=sampleCatReaction(3.312,false);
  expect(sampleCatReaction(.58,false).head).toBeGreaterThan(.5);
  expect(meow.head).toBeGreaterThan(before.head+.3);
  expect(meow.head).toBeGreaterThan(.95);
  expect(voiceEnd.head).toBeGreaterThan(.6);expect(voiceEnd.done).toBe(false);
  expect(sampleCatReaction(4.2,false).head).toBeLessThan(.1);
  expect(sampleCatReaction(CAT_REACTION_DURATION,false)).toEqual({...resting,done:true});
  expect(sampleCatReaction(CAT_REACTION_DURATION+20,false)).toEqual({...resting,done:true});
});

test('all axes stay continuous and reduced motion preserves timing and relative phase',()=>{
  let previous=sampleCatReaction(0,false),largestStep=0,largestReducedError=0,timingMismatch=false,largestMagnitude=0;
  for(let time=.001;time<=CAT_REACTION_DURATION+.001;time+=.001){
    const normal=sampleCatReaction(time,false),reduced=sampleCatReaction(time,true);
    timingMismatch ||=normal.done!==reduced.done;
    for(const key of channels){
      largestStep=Math.max(largestStep,Math.abs(normal[key]-previous[key]));
      largestMagnitude=Math.max(largestMagnitude,Math.abs(normal[key]));
      largestReducedError=Math.max(largestReducedError,Math.abs(reduced[key]-normal[key]*CAT_REDUCED_WEIGHT));
    }
    previous=normal;
  }
  expect(largestStep).toBeLessThan(.007);
  expect(largestMagnitude).toBeLessThanOrEqual(1);
  expect(largestReducedError).toBeLessThan(1e-12);expect(timingMismatch).toBe(false);
  const epsilon=1e-4;
  for(const key of channels){
    expect(Math.abs(sampleCatReaction(epsilon,false)[key])/epsilon).toBeLessThan(.002);
    expect(Math.abs(sampleCatReaction(CAT_REACTION_DURATION-epsilon,false)[key])/epsilon).toBeLessThan(.01);
  }
});

test('passing head poses retain velocity while ears and articulated tail follow at different phases',()=>{
  const epsilon=.0001;
  const velocity=(time:number,key:typeof channels[number])=>(sampleCatReaction(time+epsilon,false)[key]-sampleCatReaction(time-epsilon,false)[key])/(2*epsilon);
  // These used to be fully stopped quintic keyframes. A passing pose must
  // carry momentum rather than forcing an artificial pause at every landmark.
  for(const time of [.36,1.12,2.36,3.12])expect(Math.abs(velocity(time,'head'))).toBeGreaterThan(.05);
  expect(velocity(1.12,'head')).toBeLessThan(0);expect(velocity(2.36,'head')).toBeGreaterThan(0);
  expect(Math.abs(velocity(.9,'yaw'))).toBeGreaterThan(.5);
  expect(sampleCatReaction(1.2,false).yaw).toBeLessThan(-.4);
  expect(sampleCatReaction(2.88,false).yaw).toBeGreaterThan(.5);
  expect(sampleCatReaction(2.70,false).ears).toBeGreaterThan(sampleCatReaction(2.70,false).earOuter+.4);
  expect(sampleCatReaction(2.86,false).earOuter).toBeGreaterThan(.5);
  expect(sampleCatReaction(1.12,false).tail).toBeGreaterThan(.4);
  expect(sampleCatReaction(2.88,false).tail).toBeLessThan(-.3);
  expect(sampleCatReaction(1.72,false).tailCurl).toBeGreaterThan(.4);
});

test('three distinct response emphases share the vocal cue and all finish in the same bind pose',()=>{
  const peaks=[0,1,2].map(variant=>{
    let shoulder=0,tail=0;
    for(let time=0;time<CAT_REACTION_DURATION;time+=.005){
      const pose=sampleCatReaction(time,false,variant);
      shoulder=Math.max(shoulder,pose.stretch);tail=Math.max(tail,Math.abs(pose.tail));
    }
    expect(sampleCatReaction(2.88,false,variant).head).toBe(1);
    expect(sampleCatReaction(CAT_REACTION_DURATION,true,variant)).toEqual({...resting,done:true});
    return{shoulder,tail};
  });
  expect(peaks[1].shoulder).toBeGreaterThan(peaks[0].shoulder+.12);
  expect(peaks[2].tail).toBeGreaterThan(peaks[0].tail+.12);
  expect(sampleCatReaction(-10,false)).toEqual({...resting,done:false});
  expect(sampleCatReaction(Number.NaN,false)).toEqual({...resting,done:false});
});
