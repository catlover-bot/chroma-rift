import { parseSealCheckpoint } from '../emblem/puzzle';
import type { ChapterRuntime,CheckpointState,PlayerPose,PuzzleState } from '../firstPerson/types';
import { THEATRE_CHAPTER_ID,THEATRE_CHECKPOINTS,THEATRE_LEVEL_VERSION,THEATRE_SPEC_VERSION } from './definition';
import { evaluateLight } from './lightGate';
import type { TheatreCheckpointId,TheatreProgress } from './types';
const record=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const finite=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v);
const uint=(v:unknown):v is number=>finite(v)&&Number.isSafeInteger(v)&&v>=0&&v<=0xffffffff;
const clonePose=(p:PlayerPose):PlayerPose=>({...p,position:{...p.position}});
export function parseTheatreProgress(value:unknown):TheatreProgress|undefined {
  if(!record(value)||value.schemaVersion!==1||value.specVersion!==THEATRE_SPEC_VERSION||!uint(value.seed)||!record(value.light)||!record(value.discoveries)||!record(value.story))return undefined;
  const light=value.light,discoveries=value.discoveries,story=value.story;
  if(!finite(light.rail)||light.rail<-1||light.rail>1||typeof light.accepted!=='boolean'||!uint(light.attempts)||light.attempts>999)return undefined;
  if(['inspectionShutterOpen','bypassOpen','curtainAccepted','passageSealed','completed'].some(k=>typeof value[k]!=='boolean')||['shadow','depth'].some(k=>typeof discoveries[k]!=='boolean')||['crossingStarted','crossingPresented','projectorUsed'].some(k=>typeof story[k]!=='boolean'))return undefined;
  if(light.accepted&&(!evaluateLight(light.rail).canLock||light.attempts===0)||value.bypassOpen&&!value.inspectionShutterOpen||discoveries.depth&&!value.inspectionShutterOpen||story.crossingPresented&&!story.crossingStarted||value.passageSealed&&!value.curtainAccepted||value.completed&&!value.passageSealed)return undefined;
  if(!light.accepted&&(value.inspectionShutterOpen||value.bypassOpen||discoveries.depth||story.crossingStarted||story.crossingPresented||story.projectorUsed||value.curtainAccepted||value.passageSealed||value.completed))return undefined;
  return {schemaVersion:1,specVersion:1,seed:value.seed,light:{rail:light.rail,accepted:light.accepted,attempts:light.attempts},inspectionShutterOpen:value.inspectionShutterOpen as boolean,bypassOpen:value.bypassOpen as boolean,
    discoveries:{shadow:discoveries.shadow as boolean,depth:discoveries.depth as boolean},story:{crossingStarted:story.crossingStarted as boolean,crossingPresented:story.crossingPresented as boolean,projectorUsed:story.projectorUsed as boolean},
    curtainAccepted:value.curtainAccepted as boolean,passageSealed:value.passageSealed as boolean,completed:value.completed as boolean};
}
function parseHost(value:unknown):PuzzleState|undefined {
  if(!record(value)||value.vault!==undefined||value.gallery!==undefined||value.guideExamined!==false||value.markActivated!==false||value.sealA!==false||value.sealB!==false||value.variant!=='entrance'||typeof value.exitDoorOpen!=='boolean'||typeof value.cleared!=='boolean'||typeof value.usedLookAssist!=='boolean'||!uint(value.hintStage)||value.hintStage>3)return undefined;
  const emblem=parseSealCheckpoint(value.emblem),theatre=parseTheatreProgress(value.theatre);
  if(!emblem||emblem.phase==='released'||!theatre||value.exitDoorOpen!==theatre.light.accepted||value.cleared!==theatre.completed)return undefined;
  return {emblem,theatre,guideExamined:false,markActivated:false,sealA:false,sealB:false,variant:'entrance',exitDoorOpen:value.exitDoorOpen,cleared:value.cleared,hintStage:value.hintStage as PuzzleState['hintStage'],usedLookAssist:value.usedLookAssist};
}
function checkpointId(value:unknown):TheatreCheckpointId|undefined {
  if(!record(value)||!record(value.position)||![value.position.x,value.position.y,value.position.z,value.yaw,value.pitch].every(finite))return undefined;
  return (Object.keys(THEATRE_CHECKPOINTS) as TheatreCheckpointId[]).find(id=>{
    const p=THEATRE_CHECKPOINTS[id],v=value.position as Record<string,number>;
    return Math.abs(v.x!-p.position.x)<=1e-6&&Math.abs(v.y!-p.position.y)<=1e-6&&Math.abs(v.z!-p.position.z)<=1e-6&&Math.abs(Number(value.yaw)-p.yaw)<=1e-6&&Math.abs(Number(value.pitch)-p.pitch)<=1e-6;
  });
}
function allowed(id:TheatreCheckpointId|undefined,p:TheatreProgress):id is TheatreCheckpointId {
  return id!==undefined&&(id==='entry'||p.light.accepted)&&(id!=='exit'||p.completed)&&(!p.curtainAccepted||id==='booth'||id==='exit')&&(!p.completed||id==='exit');
}
export function createTheatreCheckpoint(runtime:ChapterRuntime):CheckpointState {
  const progress=parseHost(runtime.progress);
  if(runtime.chapterId!==THEATRE_CHAPTER_ID||!runtime.theatre||!progress?.theatre)throw new RangeError('Theatre checkpoint requires consistent theatre progress');
  const p=progress.theatre,id=checkpointId(runtime.theatre.lastSafePose),safe=allowed(id,p)?id:p.completed?'exit':p.curtainAccepted?'booth':'entry';
  return {schemaVersion:1,chapterId:THEATRE_CHAPTER_ID,levelVersion:THEATRE_LEVEL_VERSION,progress,pose:clonePose(THEATRE_CHECKPOINTS[safe])};
}
export type TheatreRestoreResult={checkpoint:CheckpointState;recovered:boolean;emblemStatus:'valid'};
export function restoreTheatreCheckpoint(value:unknown):TheatreRestoreResult|undefined {
  if(!record(value)||value.schemaVersion!==1||value.chapterId!==THEATRE_CHAPTER_ID||value.levelVersion!==THEATRE_LEVEL_VERSION)return undefined;
  const progress=parseHost(value.progress);if(!progress?.theatre)return undefined;
  const p=progress.theatre,id=checkpointId(value.pose),ok=allowed(id,p),safe=ok?id:p.completed?'exit':p.curtainAccepted?'booth':'entry';
  // Only accepted closure proves that the protected control booth was visited.
  // Corrupt mid-corridor positions otherwise return to the initial safe bay.
  return {checkpoint:{schemaVersion:1,chapterId:THEATRE_CHAPTER_ID,levelVersion:1,progress,pose:clonePose(THEATRE_CHECKPOINTS[safe])},recovered:!ok,emblemStatus:'valid'};
}
