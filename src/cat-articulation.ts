import type { CatReactionPose } from "./cat-choreography";

/** Metre-scale bind pivots on the adapted, curled scan; root/legs stay planted. */
export const CAT_JOINTS = [
  {name:"cat-root",parent:-1,position:[0,0,0]},
  {name:"cat-shoulder",parent:0,position:[.015,.038,-.055]},
  {name:"cat-neck",parent:1,position:[-.045,.040,-.055]},
  {name:"cat-head",parent:2,position:[-.085,.048,-.040]},
  {name:"cat-ear-inner",parent:3,position:[-.114,.076,.018]},
  {name:"cat-ear-outer",parent:3,position:[-.176,.032,.007]},
  {name:"cat-tail-01",parent:0,position:[.187,.036,.070]},
  {name:"cat-tail-02",parent:6,position:[.181,.028,.098]},
  {name:"cat-tail-03",parent:7,position:[.155,.022,.126]},
  {name:"cat-tail-04",parent:8,position:[.121,.019,.145]},
] as const;
export type CatJointTransform={rotation:[number,number,number];offset:[number,number,number]};

/** Shared by the offline GLB clips and exact-pose numerical checks. */
export function catJointTransforms(pose:CatReactionPose):CatJointTransform[] {
  const {head,yaw,roll,ears,earOuter,stretch,tail,tailCurl}=pose;
  return [
    {rotation:[0,0,0],offset:[0,0,0]},
    {rotation:[.010*stretch,0,-.018*stretch],offset:[-.0025*stretch,.002*stretch,0]},
    {rotation:[.018*roll,.025*yaw,-.065*head],offset:[0,0,0]},
    {rotation:[.065*roll,.12*yaw,-.215*head],offset:[0,0,0]},
    {rotation:[.34*ears,-.06*ears,.025*ears],offset:[0,0,0]},
    {rotation:[.05*earOuter,.10*earOuter,-.24*earOuter],offset:[0,0,0]},
    {rotation:[0,.07*tail,0],offset:[0,0,0]},
    {rotation:[-.09*tailCurl,.17*tail,0],offset:[0,0,0]},
    {rotation:[-.14*tailCurl,.22*tail-.05*tailCurl,0],offset:[0,0,0]},
    {rotation:[-.18*tailCurl,.25*tail-.10*tailCurl,0],offset:[0,0,0]},
  ];
}
