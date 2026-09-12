import { createBaseRuntime, initialProgress } from '../../firstPerson/baseRuntime';
import type { ChapterRuntime, CheckpointState, InteractableId } from '../../firstPerson/types';
import type { StageModule } from '../../stageKit/modules';
import { SPAWN, STAGE_ID, stageWorld } from './definition';
import { checkpointStage, commandStage, createStageSession, isStageSession, type StageCommand, type StageSession } from './session';
import { parseStageCheckpoint } from './checkpoint';

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
  return {runtime:{...runtime,progress:{...runtime.progress,cleared:result.session.cleared},stageSession:{stageId:STAGE_ID,value:result.session}},accepted:result.accepted,stopInput:false,message:result.accepted?'装置が動いた。':''};
}
export const stageBinding:StageModule<StageCommand,ReturnType<typeof command>>={
  id:STAGE_ID,create,
  advance:runtime=>{const live=session(runtime);return live?{...runtime,stageSession:{stageId:STAGE_ID,value:{...live,pose:{...runtime.pose,position:{...runtime.pose.position}}}}}:runtime;},
  world:runtime=>stageWorld(session(runtime)?.activated??false),
  present:runtime=>({objective:session(runtime)?.cleared?'確認室を出た。':session(runtime)?.activated?'開いた扉から出口へ。':'装置を押し、扉を開こう。',hint:{text:'中央の装置を押してから奥へ進もう。'}}),
  command,
  interact:(runtime,targetId:InteractableId)=>{
    const live=session(runtime);if(!live)return runtime;
    const target=stageWorld(live.activated).interactables.find(item=>item.id===targetId);
    if(!target||target.id===`${STAGE_ID}-door`)return runtime;
    const packet:StageCommand={sessionId:live.sessionId,seq:live.lastSeq+1,targetId:target.id,type:target.id===`${STAGE_ID}-device`?'activate':'exit'};
    const result=command(runtime,packet,{rendererReady:true,foreground:true,targetId:target.id});
    return result.accepted?result.runtime:runtime;
  },
  checkpoint:runtime=>{
    const live=session(runtime);if(!live)throw new RangeError('Missing probe session');
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
    return !!old&&!!fresh&&(!old.activated||fresh.activated)&&(!old.cleared||fresh.cleared);
  },
  renderKind:'simple',inputPolicy:()=>({move:true,look:true,pointer:'none',dangerAdvances:true,end:'release'}),
};
