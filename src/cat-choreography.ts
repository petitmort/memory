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
