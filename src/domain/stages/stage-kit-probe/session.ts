import { updatePlayer } from '../../firstPerson/geometry';
import type { MovementInput, PlayerPose } from '../../firstPerson/types';
import { EXIT, SPAWN, STAGE_ID, stageWorld, type TargetId } from './definition';
import { parseStageCheckpoint, type StageCheckpoint } from './checkpoint';
export type StageSession={stageId:typeof STAGE_ID;sessionId:string;lastSeq:number;pose:PlayerPose;activated:boolean;cleared:boolean};
export type StageCommand={sessionId:string;seq:number;targetId:TargetId;type:'activate'|'exit'};
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
export function isStageSession(value:unknown):value is StageSession{
  if(!record(value)||value.stageId!==STAGE_ID||typeof value.sessionId!=='string'||!Number.isSafeInteger(value.lastSeq)||Number(value.lastSeq)<0||
    typeof value.activated!=='boolean'||typeof value.cleared!=='boolean'||value.cleared&&!value.activated||!record(value.pose)||!record(value.pose.position))return false;
  const pose=value.pose,position=pose.position as Record<string,unknown>;
  return [position.x,position.y,position.z,pose.yaw,pose.pitch].every(n=>typeof n==='number'&&Number.isFinite(n));
}
export function createStageSession(sessionId:string,raw?:unknown):StageSession{
  const checkpoint=raw===undefined?undefined:parseStageCheckpoint(raw);
  if(raw!==undefined&&!checkpoint)throw new RangeError('Unsupported stage checkpoint');
  const pose=checkpoint?.pose??SPAWN;
  return {stageId:STAGE_ID,sessionId,lastSeq:0,pose:{...pose,position:{...pose.position}},activated:checkpoint?.activated??false,cleared:checkpoint?.cleared??false};
}
export function stepStage(session:StageSession,input:MovementInput,dt:number):StageSession{
  if(session.cleared||!Number.isFinite(dt)||dt<=0)return session;
  const pose=updatePlayer(session.pose,input,dt,stageWorld(session.activated));
  return {...session,pose};
}
export function commandStage(session:StageSession,command:StageCommand):{session:StageSession;accepted:boolean;reason:'ready'|'stale'|'tooFar'|'prerequisiteMissing'}{
  if(command.sessionId!==session.sessionId||!Number.isSafeInteger(command.seq)||command.seq<=session.lastSeq)return {session,accepted:false,reason:'stale'};
  const consumed={...session,lastSeq:command.seq};
  if(command.type==='activate'&&command.targetId==='stage-kit-probe-device'&&!session.activated){
    if(Math.hypot(session.pose.position.x,session.pose.position.z)>2.5)return {session:consumed,accepted:false,reason:'tooFar'};
    return {session:{...consumed,activated:true},accepted:true,reason:'ready'};
  }
  if(command.type==='exit'&&command.targetId==='stage-kit-probe-exit'&&session.activated&&session.pose.position.z>=5.1)
    return {session:{...consumed,cleared:true},accepted:true,reason:'ready'};
  return {session:consumed,accepted:false,reason:'prerequisiteMissing'};
}
export function checkpointStage(session:StageSession):StageCheckpoint{
  return {schemaVersion:1,stageId:STAGE_ID,activated:session.activated,cleared:session.cleared,
    pose:session.cleared?{position:{...EXIT.position},yaw:EXIT.yaw,pitch:EXIT.pitch}:session.activated&&session.pose.position.z>=3.6?{position:{x:0,y:1.6,z:4},yaw:Math.PI,pitch:0}:{position:{...SPAWN.position},yaw:SPAWN.yaw,pitch:SPAWN.pitch}};
}
