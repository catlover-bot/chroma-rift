import type { PlayerPose } from '../../firstPerson/types';
import { EXIT, POST_DOOR, SPAWN, STAGE_ID } from './definition';
export type StageCheckpoint={schemaVersion:1;stageId:typeof STAGE_ID;activated:boolean;cleared:boolean;pose:PlayerPose};
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
export function parseStageCheckpoint(value:unknown):StageCheckpoint|undefined{
  if(!record(value)||value.schemaVersion!==1||value.stageId!==STAGE_ID||typeof value.activated!=='boolean'||typeof value.cleared!=='boolean'||!record(value.pose)||!record(value.pose.position))return;
  const p=value.pose,position=p.position as Record<string,unknown>;
  if(value.cleared&&!value.activated||![position.x,position.y,position.z,p.yaw,p.pitch].every(n=>typeof n==='number'&&Number.isFinite(n)))return;
  const safe=[SPAWN,POST_DOOR,EXIT].find(point=>point.position.x===position.x&&point.position.y===position.y&&point.position.z===position.z&&point.yaw===p.yaw&&point.pitch===p.pitch);
  if(!safe||safe===POST_DOOR&&!value.activated||safe===EXIT&&!value.cleared)return;
  return {schemaVersion:1,stageId:STAGE_ID,activated:value.activated,cleared:value.cleared,pose:{...safe,position:{...safe.position}}};
}
