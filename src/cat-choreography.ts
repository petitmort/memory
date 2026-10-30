/** The final quiet settle follows the existing 2.760–3.312 s vocal response. */
export const CAT_REACTION_DURATION = 4.4;
export const CAT_REDUCED_WEIGHT = .16;

export type CatReactionPose = {
  head: number; yaw: number; roll: number; ears: number; earOuter: number;
  stretch: number; tail: number; tailCurl: number; done: boolean;
};
type Key = readonly [time: number, value: number];

/** Shape-preserving Hermite tangents carry velocity through passing poses. */
function trajectory(keys: readonly Key[]) {
  const slopes=keys.slice(1).map((key,i)=>(key[1]-keys[i][1])/(key[0]-keys[i][0]));
  const tangents=keys.map((_,i)=>{
    if(i===0||i===keys.length-1||slopes[i-1]*slopes[i]<=0)return 0;
    const before=keys[i][0]-keys[i-1][0],after=keys[i+1][0]-keys[i][0];
    const a=2*after+before,b=after+2*before;
    return (a+b)/(a/slopes[i-1]+b/slopes[i]);
  });
  return (time:number)=>{
    for(let i=1;i<keys.length;i++)if(time<=keys[i][0]){
      const width=keys[i][0]-keys[i-1][0],t=Math.max(0,(time-keys[i-1][0])/width),t2=t*t,t3=t2*t;
      const value=(2*t3-3*t2+1)*keys[i-1][1]+(t3-2*t2+t)*width*tangents[i-1]+
        (-2*t3+3*t2)*keys[i][1]+(t3-t2)*width*tangents[i];
      return Math.max(Math.min(keys[i-1][1],keys[i][1]),Math.min(Math.max(keys[i-1][1],keys[i][1]),value));
    }
    return keys[keys.length-1][1];
  };
}
const headAt=trajectory([[0,0],[.36,.38],[.9,.64],[1.5,.54],[2.25,.56],[2.88,1],[3.25,.85],[3.65,.48],[CAT_REACTION_DURATION,0]]);
const yawAt=trajectory([[0,0],[.55,.38],[1.2,-.55],[2,-.18],[2.88,.64],[3.48,.32],[CAT_REACTION_DURATION,0]]);
const rollAt=trajectory([[0,0],[.6,-.28],[1.35,.38],[2.2,.05],[3,.30],[CAT_REACTION_DURATION,0]]);
const shoulderAt=trajectory([[0,0],[.28,.24],[.72,.68],[1.25,.77],[1.95,.45],[2.65,.44],[3.05,.61],[3.8,.16],[CAT_REACTION_DURATION,0]]);

function ease(value:number) {
  const t=Math.max(0,Math.min(1,value));
  return t*t*(3-2*t);
}
function pulse(time:number,start:number,peak:number,end:number) {
  if(time<=start||time>=end)return 0;
  return time<peak?ease((time-start)/(peak-start)):1-ease((time-peak)/(end-peak));
}
function envelope(time:number,start:number,awake:number,settle:number,end:number) {
  return ease((time-start)/(awake-start))*(1-ease((time-settle)/(end-settle)));
}

/** Independent axes and delayed ears/tail avoid moving the whole cat in lockstep. */
export function sampleCatReaction(elapsed:number,reduced:boolean,variant=0):CatReactionPose {
  const time=Number.isFinite(elapsed)?Math.max(0,elapsed):0;
  const done=time>=CAT_REACTION_DURATION;
  if(done||time===0)return {head:0,yaw:0,roll:0,ears:0,earOuter:0,stretch:0,tail:0,tailCurl:0,done};
  const emphasis=Number.isFinite(variant)?((Math.trunc(variant)%3)+3)%3:0;
  const weight=reduced?CAT_REDUCED_WEIGHT:1;
  const tailWeight=emphasis===2?1:emphasis===1?.67:.8;
  const tail=envelope(time,.28,.85,3.55,CAT_REACTION_DURATION)*
    (.58*Math.sin((time-.28)*2.05)+.22*Math.sin((time-.28)*3.6));
  const curl=envelope(time,.4,1.1,3.7,CAT_REACTION_DURATION)*.68*Math.sin((time-.5)*1.85);
  return {
    head:headAt(time)*weight,
    yaw:yawAt(time)*(emphasis===1?.72:emphasis===2?.86:1)*weight,
    roll:rollAt(time)*(emphasis===2?.8:1)*weight,
    ears:(.65*pulse(time,.24,.40,.75)+.7*pulse(time,2.54,2.70,3.09))*weight,
    earOuter:(.42*pulse(time,.34,.54,.92)+.55*pulse(time,2.65,2.86,3.28))*weight,
    stretch:shoulderAt(time)*(emphasis===1?1:emphasis===2?.70:.82)*weight,
    tail:tail*tailWeight*weight,
    tailCurl:curl*tailWeight*weight,
    done:false,
  };
}
import type { CatReactionProfile } from "./cat-reactions";


type MotionShape = {
  head: (time: number) => number;
  yaw: (time: number) => number;
  roll: (time: number) => number;
  shoulder: (time: number) => number;
  tailSpeed: number;
  tailAmount: number;
  curlAmount: number;
  innerEar: number;
  outerEar: number;
  vocalHead: number;
};

// Normalized reaction time leaves the physical pose independent of how long
// each recording takes. Vocal accents below use the actual cue timestamps.
const responseShapes: Record<CatReactionProfile["id"], MotionShape> = {
  content: {
    head: trajectory([[0,0],[.12,.30],[.25,.60],[.43,.38],[.64,.34],[.82,.22],[1,0]]),
    yaw: trajectory([[0,0],[.15,.35],[.34,-.55],[.54,-.15],[.78,.40],[1,0]]),
    roll: trajectory([[0,0],[.18,-.30],[.40,.25],[.70,.10],[1,0]]),
    shoulder: trajectory([[0,0],[.10,.28],[.25,.58],[.48,.40],[.80,.18],[1,0]]),
    tailSpeed: 1.95, tailAmount: .68, curlAmount: .60, innerEar: .28, outerEar: .22, vocalHead: .92,
  },
  curious: {
    head: trajectory([[0,0],[.12,.48],[.25,.72],[.48,.60],[.72,.42],[.88,.20],[1,0]]),
    yaw: trajectory([[0,0],[.22,.76],[.40,.32],[.56,-.35],[.78,.24],[1,0]]),
    roll: trajectory([[0,0],[.27,.42],[.58,-.20],[.80,.15],[1,0]]),
    shoulder: trajectory([[0,0],[.16,.36],[.38,.46],[.68,.30],[1,0]]),
    tailSpeed: 2.55, tailAmount: .54, curlAmount: .45, innerEar: .60, outerEar: .42, vocalHead: 1,
  },
  affectionate: {
    head: trajectory([[0,0],[.13,.38],[.25,.64],[.38,.32],[.52,.62],[.74,.36],[1,0]]),
    yaw: trajectory([[0,0],[.20,.70],[.38,-.68],[.58,.48],[.80,-.22],[1,0]]),
    roll: trajectory([[0,0],[.22,-.42],[.43,.44],[.68,-.20],[1,0]]),
    shoulder: trajectory([[0,0],[.14,.48],[.28,.76],[.48,.64],[.70,.45],[1,0]]),
    tailSpeed: 2.15, tailAmount: .78, curlAmount: .70, innerEar: .32, outerEar: .48, vocalHead: .86,
  },
  sleepy: {
    head: trajectory([[0,0],[.20,.25],[.40,.38],[.66,.24],[.84,.12],[1,0]]),
    yaw: trajectory([[0,0],[.32,.24],[.62,-.26],[.84,-.12],[1,0]]),
    roll: trajectory([[0,0],[.30,-.18],[.64,.22],[1,0]]),
    shoulder: trajectory([[0,0],[.22,.60],[.42,.86],[.62,.72],[.84,.26],[1,0]]),
    tailSpeed: 1.20, tailAmount: .36, curlAmount: .50, innerEar: .20, outerEar: .15, vocalHead: .62,
  },
  playful: {
    head: trajectory([[0,0],[.14,.48],[.25,.70],[.37,.32],[.53,.68],[.72,.40],[1,0]]),
    yaw: trajectory([[0,0],[.18,.62],[.36,-.66],[.56,.55],[.78,-.24],[1,0]]),
    roll: trajectory([[0,0],[.24,.34],[.46,-.36],[.72,.22],[1,0]]),
    shoulder: trajectory([[0,0],[.16,.48],[.34,.40],[.54,.54],[.78,.28],[1,0]]),
    tailSpeed: 2.85, tailAmount: 1, curlAmount: .84, innerEar: .54, outerEar: .44, vocalHead: .98,
  },
  stretch: {
    head: trajectory([[0,0],[.18,.22],[.34,.42],[.49,.72],[.68,.44],[.86,.18],[1,0]]),
    yaw: trajectory([[0,0],[.20,-.22],[.44,.38],[.68,.18],[.84,-.12],[1,0]]),
    roll: trajectory([[0,0],[.30,.20],[.52,-.28],[.78,-.10],[1,0]]),
    shoulder: trajectory([[0,0],[.18,.70],[.32,.96],[.48,.88],[.68,.62],[.86,.22],[1,0]]),
    tailSpeed: 1.65, tailAmount: .90, curlAmount: .92, innerEar: .34, outerEar: .24, vocalHead: .82,
  },
};

function restingPose(done: boolean): CatReactionPose {
  return { head:0, yaw:0, roll:0, ears:0, earOuter:0, stretch:0, tail:0, tailCurl:0, done };
}

/** A complete action and its vocal accents are sampled from the same clock. */
export function sampleCatResponse(elapsed: number, reduced: boolean, profile: CatReactionProfile): CatReactionPose {
  const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
  const duration = profile.duration;
  const done = time >= duration;
  if (done || time === 0) return restingPose(done);
  const shape = responseShapes[profile.id];
  const phase = time / duration;
  const variation = profile.variation;
  const amplitude = Math.max(.85, Math.min(1, variation?.amplitude ?? 1));
  const direction = (variation?.direction ?? 1) < 0 ? -1 : 1;
  const tailPhase = Math.max(-.15, Math.min(.15, variation?.tailPhase ?? 0));
  const weight = amplitude * (reduced ? CAT_REDUCED_WEIGHT : 1);

  // Product blending keeps overlapping calls smooth and bounded. The head
  // anticipates each call, stays raised through it, then quietly releases.
  let headQuiet = 1, innerQuiet = 1, outerQuiet = 1;
  for (const cue of profile.cues) {
    const width = Math.max(.08, cue.end - cue.start);
    const anticipation = Math.max(0, cue.start - .24);
    const voicePeak = Math.max(cue.start + .02, Math.min(cue.end - .02, cue.peak ?? cue.start + Math.min(.16, width * .30)));
    const release = Math.min(duration, cue.end + .46);
    const voiceEnvelope = envelope(time, anticipation, voicePeak, cue.end, release);
    headQuiet *= 1 - shape.vocalHead * voiceEnvelope;
    innerQuiet *= 1 - .78 * pulse(time, Math.max(0, cue.start - .12), cue.start + .08, Math.min(duration, cue.end + .22));
    outerQuiet *= 1 - .68 * pulse(time, cue.start + .01, cue.start + Math.min(.24, width * .5), Math.min(duration, cue.end + .35));
  }
  const headBase = shape.head(phase);
  const innerBase = shape.innerEar * pulse(time, .20, .52, 1.03);
  const outerBase = shape.outerEar * pulse(time, .32, .74, 1.30);
  const wake = envelope(time, .15, duration * .20, duration * .80, duration);
  const curlWake = envelope(time, .28, duration * .26, duration * .84, duration);
  const tailClock = time - .32 + tailPhase;
  const tail = wake * (.65 * Math.sin(tailClock * shape.tailSpeed) + .18 * Math.sin(tailClock * shape.tailSpeed * 1.7));
  const curl = curlWake * (.68 * Math.sin((tailClock - .23) * shape.tailSpeed * .75) + .10 * Math.sin(tailClock * shape.tailSpeed * 1.35));
  return {
    head: (1 - (1 - headBase) * headQuiet) * weight,
    yaw: shape.yaw(phase) * direction * weight,
    roll: shape.roll(phase) * direction * weight,
    ears: (1 - (1 - innerBase) * innerQuiet) * weight,
    earOuter: (1 - (1 - outerBase) * outerQuiet) * weight,
    stretch: shape.shoulder(phase) * weight,
    tail: tail * shape.tailAmount * direction * weight,
    tailCurl: curl * shape.curlAmount * direction * weight,
    done: false,
  };
}
