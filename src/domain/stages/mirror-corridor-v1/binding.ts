import { createBaseRuntime, initialProgress } from '../../firstPerson/baseRuntime';
import type { ChapterRuntime, CheckpointState, InteractableId } from '../../firstPerson/types';
import type { StageModule } from '../../stageKit/modules';
import { SPAWN, STAGE_ID, stageWorld, type TargetId } from './definition';
import { advanceStage, cancelStageHold, checkpointStage, commandStage, createStageSession, isStageSession, type StageCommand, type StageSession } from './session';
import { parseStageCheckpoint } from './checkpoint';
import { advanceMirrorActor } from './actor';

const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
function session(runtime:ChapterRuntime):StageSession|undefined {
  const entry=runtime.stageSession;
  return entry?.stageId===STAGE_ID&&isStageSession(entry.value)?entry.value:undefined;
}
function create(checkpoint?:CheckpointState,number?:number):ChapterRuntime {
  if(checkpoint&&checkpoint.chapterId!==STAGE_ID)throw new RangeError('Foreign stage checkpoint');
  const base=createBaseRuntime(STAGE_ID,SPAWN,initialProgress(),number);
  const current=createStageSession(String(base.session),checkpoint?.stageData);
  return {...base,pose:{...current.pose,position:{...current.pose.position}},progress:{...base.progress,cleared:current.cleared},stageSession:{stageId:STAGE_ID,value:current}};
}
function command(runtime:ChapterRuntime,packet:StageCommand,context:{rendererReady:boolean;foreground:boolean;targetId:string|null}) {
  const live=session(runtime);
  if(!live||runtime.paused||!context.rendererReady||!context.foreground||context.targetId!==packet.targetId)return {runtime,accepted:false,stopInput:false,message:''};
  const result=commandStage({...live,pose:runtime.pose},packet);
  const message = result.accepted ? packet.type === 'inspect' ? '顔と顔の間にも、輪郭がある。' : packet.type === 'take-key' ? '隔離キーを取った。' : packet.type === 'start-hold' ? 'レバーを保持する。' : packet.type === 'release-hold' ? '歯止めが残った。' : '制御室への前室へ進む。'
    : result.reason === 'tooFar' ? '近づいてから操作する。' : result.reason === 'prerequisiteMissing' ? '隔離キーと練習を確認する。' : '';
  return {runtime:{...runtime,progress:{...runtime.progress,cleared:result.session.cleared},stageSession:{stageId:STAGE_ID,value:result.session}},accepted:result.accepted,stopInput:false,message};
}
export const stageBinding:StageModule<StageCommand,ReturnType<typeof command>>={
  id:STAGE_ID,create,
  advance:(runtime,dt)=>{const live=session(runtime);return live?{...runtime,stageSession:{stageId:STAGE_ID,value:advanceStage({...live,pose:{...runtime.pose,position:{...runtime.pose.position}}},dt)}}:runtime;},
  world:runtime=>stageWorld(session(runtime)?.ratchets??0,session(runtime)?.keyTaken??false,session(runtime)?.practiced??false,session(runtime)?.holding??null,
    session(runtime)?.actor.motion.position),
  present:runtime=>{const live=session(runtime);return {objective:live?.cleared?'制御室への前室に着いた。':!live?.keyTaken?'隔離キーを取り、巻き上げ位置へ進む。':!live.practiced?'練習レバーで保持を確かめる。':live.ratchets<3?`レバーを保持し、格子を巻き上げる。歯止め ${live.ratchets}/3。`:'開いた格子の先へ進む。',hint:{text:'中央の鍵形を狙える。歯止めは離しても残る。'}};},
  command,
  interact:(runtime,targetId:InteractableId)=>{
    const live=session(runtime);if(!live)return runtime;
    const target=stageWorld(live.ratchets,live.keyTaken,live.practiced,live.holding).interactables.find(item=>item.id===targetId);
    if(!target)return runtime;
    if(target.id==='mirror-corridor-practice'||target.id==='mirror-corridor-winch')return runtime;
    const type:StageCommand['type']=target.id==='mirror-corridor-figure'?'inspect':target.id==='mirror-corridor-key'?'take-key':'exit';
    const packet:StageCommand={sessionId:live.sessionId,seq:live.lastSeq+1,targetId:target.id as TargetId,type};
    const result=command(runtime,packet,{rendererReady:true,foreground:true,targetId:target.id});
    return result.accepted?result.runtime:runtime;
  },
  hold:{
    targets:['mirror-corridor-practice','mirror-corridor-winch'],
    activeTarget:runtime=>session(runtime)?.holding==='practice'?'mirror-corridor-practice':session(runtime)?.holding==='winch'?'mirror-corridor-winch':undefined,
    start:(runtime,targetId)=>{
      const live=session(runtime);
      if(!live||(targetId!=='mirror-corridor-practice'&&targetId!=='mirror-corridor-winch'))return runtime;
      const packet:StageCommand={sessionId:live.sessionId,seq:live.lastSeq+1,targetId,type:'start-hold'};
      const result=command(runtime,packet,{rendererReady:true,foreground:true,targetId});
      return result.accepted?result.runtime:runtime;
    },
    release:(runtime,targetId)=>{
      const live=session(runtime);
      if(!live||(targetId!=='mirror-corridor-practice'&&targetId!=='mirror-corridor-winch'))return runtime;
      const packet:StageCommand={sessionId:live.sessionId,seq:live.lastSeq+1,targetId,type:'release-hold'};
      const result=command(runtime,packet,{rendererReady:true,foreground:true,targetId});
      return result.accepted?result.runtime:runtime;
    },
  },
  cancel:runtime=>{
    const live=session(runtime);if(!live)return runtime;
    const cancelled=cancelStageHold(live);
    return cancelled===live?runtime:{...runtime,stageSession:{stageId:STAGE_ID,value:cancelled}};
  },
  actor:{usesGalleryBody:true,advance:(runtime,dt,context)=>{
    const live=session(runtime);
    if(!live)return {runtime,caught:false,movedDistance:0,footPlants:[],events:[],soundSources:[]};
    const result=advanceMirrorActor({...live,pose:{...runtime.pose,position:{...runtime.pose.position}}},dt,context);
    return {runtime:{...runtime,pose:result.session.pose,stageSession:{stageId:STAGE_ID,value:result.session}},
      caught:result.caught,movedDistance:result.movedDistance,footPlants:result.footPlants,events:result.events,soundSources:result.soundSources};
  }},
  checkpoint:runtime=>{
    const live=session(runtime);if(!live)throw new RangeError('Missing mirror corridor session');
    const data=checkpointStage({...live,pose:runtime.pose});
    return {schemaVersion:1,chapterId:STAGE_ID,levelVersion:1,pose:{...data.pose,position:{...data.pose.position}},progress:{...initialProgress(),cleared:data.cleared},stageData:data};
  },
  restore:value=>{
    if(!record(value)||value.schemaVersion!==1||value.chapterId!==STAGE_ID||value.levelVersion!==1)return;
    const data=parseStageCheckpoint(value.stageData);if(!data)return;
    return {checkpoint:{schemaVersion:1,chapterId:STAGE_ID,levelVersion:1,pose:{...data.pose,position:{...data.pose.position}},progress:{...initialProgress(),cleared:data.cleared},stageData:data},recovered:false};
  },
  canReplaceCheckpoint:(previous,next)=>{
    const old=parseStageCheckpoint(previous.stageData),fresh=parseStageCheckpoint(next.stageData);
    return !!old&&!!fresh&&(!old.figureInspected||fresh.figureInspected)&&(!old.keyTaken||fresh.keyTaken)&&
      (!old.practiced||fresh.practiced)&&fresh.ratchets>=old.ratchets&&(!old.cleared||fresh.cleared);
  },
  renderKind:'simple',inputPolicy:runtime=>session(runtime)?.holding==='winch'
    ? {move:false,look:false,pointer:'exclusive',dangerAdvances:true,end:'release'}
    : session(runtime)?.holding==='practice'
    ? {move:false,look:false,pointer:'exclusive',dangerAdvances:false,end:'release'}
    : {move:true,look:true,pointer:'none',dangerAdvances:true,end:'release'},
};
