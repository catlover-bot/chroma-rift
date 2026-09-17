import { createBaseRuntime, initialProgress } from '../../firstPerson/baseRuntime';
import type { ChapterRuntime, CheckpointState, InteractableId } from '../../firstPerson/types';
import type { StageModule } from '../../stageKit/modules';
import { SPAWN, STAGE_ID, stageWorld, type TargetId } from './definition';
import { advanceStage, cancelStageHold, checkpointStage, commandStage, createStageSession, isStageSession, type StageCommand, type StageSession } from './session';
import { parseStageCheckpoint } from './checkpoint';
import { advanceMirrorActor, resumeMirrorRecovery } from './actor';
import { selectMirrorAction, selectMirrorPresentation } from './selectors';

const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
function session(runtime:ChapterRuntime):StageSession|undefined {
  const entry=runtime.stageSession;
  return entry?.stageId===STAGE_ID&&isStageSession(entry.value)?entry.value:undefined;
}
function holdMessage(action:'start'|'release',targetId:InteractableId):string {
  if(targetId==='mirror-corridor-winch')return action==='start'?'隔離キーを差し、レバーを保持する。':'隔離キーを戻した。確定した歯止めは残る。';
  return action==='start'?'練習レバーを保持する。':'練習レバーを離した。';
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
  const message = result.accepted ? packet.type === 'inspect' ? selectMirrorAction(result.session, packet.targetId).message
    : packet.type === 'take-key' ? '隔離キーを取った。前室の練習レバーへ。' : packet.type === 'start-hold' ? holdMessage('start',packet.targetId) : packet.type === 'release-hold' ? holdMessage('release',packet.targetId) : '制御室への前室へ進む。'
    : result.reason === 'tooFar' ? '近づいてから操作する。' : selectMirrorAction(live, packet.targetId).message;
  return {runtime:{...runtime,progress:{...runtime.progress,cleared:result.session.cleared},stageSession:{stageId:STAGE_ID,value:result.session}},accepted:result.accepted,stopInput:false,message};
}
export const stageBinding:StageModule<StageCommand,ReturnType<typeof command>>={
  id:STAGE_ID,create,
  advance:(runtime,dt)=>{
    const live=session(runtime);if(!live)return runtime;
    const next=advanceStage({...live,pose:{...runtime.pose,position:{...runtime.pose.position}}},dt);
    return {...runtime,progress:{...runtime.progress,cleared:next.cleared},stageSession:{stageId:STAGE_ID,value:next}};
  },
  world:runtime=>stageWorld(session(runtime)?.ratchets??0,session(runtime)?.keyTaken??false,session(runtime)?.practiced??false,session(runtime)?.holding??null,
    session(runtime)?.actor.motion.position,session(runtime)?.gateLift),
  present:runtime=>{const live=session(runtime);return live?selectMirrorPresentation(live):{objective:'鏡の回廊を確かめる。',hint:{text:''}};},
  targetPresentation:(runtime,targetId)=>{
    const live=session(runtime);if(!live)return;
    const target=stageWorld(live.ratchets,live.keyTaken,live.practiced,live.holding).interactables.find(item=>item.id===targetId);
    return target?selectMirrorAction({...live,pose:runtime.pose},target.id):undefined;
  },
  command,
  interactResult:(runtime,targetId:InteractableId)=>{
    const live=session(runtime);if(!live)return {runtime,message:''};
    const target=stageWorld(live.ratchets,live.keyTaken,live.practiced,live.holding).interactables.find(item=>item.id===targetId);
    if(!target)return {runtime,message:''};
    if(target.id==='mirror-corridor-practice'||target.id==='mirror-corridor-winch')return {runtime,message:selectMirrorAction(live,target.id).message};
    const type:StageCommand['type']=target.id==='mirror-corridor-figure'||target.id==='mirror-corridor-mirror'?'inspect':target.id==='mirror-corridor-key'?'take-key':'exit';
    const packet:StageCommand={sessionId:live.sessionId,seq:live.lastSeq+1,targetId:target.id as TargetId,type};
    const result=command(runtime,packet,{rendererReady:true,foreground:true,targetId:target.id});
    return {runtime:result.accepted?result.runtime:runtime,message:result.message};
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
    message:holdMessage,
  },
  cancel:runtime=>{
    const live=session(runtime);if(!live)return runtime;
    const cancelled=cancelStageHold(live);
    return cancelled===live?runtime:{...runtime,stageSession:{stageId:STAGE_ID,value:cancelled}};
  },
  actor:{usesGalleryBody:true,recovery:{
    pending:runtime=>session(runtime)?.actor.recoveryPending===true,
    resume:runtime=>{
      const live=session(runtime);if(!live)return runtime;
      const resumed=resumeMirrorRecovery(live);
      return resumed===live?runtime:{...runtime,pose:resumed.pose,stageSession:{stageId:STAGE_ID,value:resumed}};
    },
  },advance:(runtime,dt,context)=>{
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
    return !!old&&!!fresh&&(!old.figureInspected||fresh.figureInspected)&&(!old.mirrorInspected||fresh.mirrorInspected)&&(!old.keyTaken||fresh.keyTaken)&&
      (!old.practiced||fresh.practiced)&&fresh.ratchets>=old.ratchets&&(!old.gateCrossed||fresh.gateCrossed===true)&&(!old.cleared||fresh.cleared);
  },
  renderKind:'simple',inputPolicy:runtime=>session(runtime)?.holding==='winch'
    ? {move:false,look:false,pointer:'exclusive',dangerAdvances:true,end:'release'}
    : session(runtime)?.holding==='practice'
    ? {move:false,look:false,pointer:'exclusive',dangerAdvances:false,end:'release'}
    : {move:true,look:true,pointer:'none',dangerAdvances:true,end:'release'},
};
