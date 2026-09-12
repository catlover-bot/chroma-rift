import type { PlayerPose, WorldGeometry } from '../../firstPerson/types';
export const STAGE_ID="stage-kit-probe" as const;
export const STAGE_TITLE="Stage Kit 確認室";
export type TargetId='stage-kit-probe-device'|'stage-kit-probe-door'|'stage-kit-probe-exit';
export const SPAWN:PlayerPose={position:{x:0,y:1.6,z:-2.5},yaw:Math.PI,pitch:0};
export const POST_DOOR:PlayerPose={position:{x:0,y:1.6,z:4},yaw:Math.PI,pitch:0};
export const EXIT:PlayerPose={position:{x:0,y:1.6,z:5.3},yaw:Math.PI,pitch:0};
export function stageWorld(activated:boolean):WorldGeometry<TargetId>{
  return {chapterId:STAGE_ID,variant:'entrance',floors:[{id:'room',minX:-2,maxX:2,minZ:-3,maxZ:6}],
    solids:[{id:'west',min:{x:-2.12,y:0,z:-3},max:{x:-2,y:3.5,z:6},kind:'wall',opaque:true},
      {id:'east',min:{x:2,y:0,z:-3},max:{x:2.12,y:3.5,z:6},kind:'wall',opaque:true},
      {id:'door',min:{x:-.7,y:activated?3.6:0,z:3.15},max:{x:.7,y:activated?7.1:3.5,z:3.3},kind:'door',opaque:true}],
    interactables:[{id:'stage-kit-probe-device',label:'装置を押す',center:{x:0,y:1.4,z:0},radius:.3,maxDistance:2.5},
      {id:'stage-kit-probe-door',label:'開いた扉',center:{x:0,y:1.4,z:3.15},radius:.3,maxDistance:2.5},
      {id:'stage-kit-probe-exit',label:'出口へ進む',center:{x:0,y:1.4,z:5.8},radius:.3,maxDistance:2.5}],
    colorPanels:[],keyFragments:[],keyFrame:{center:{x:0,y:0,z:0},width:0,height:0,outline:[]}};
}
