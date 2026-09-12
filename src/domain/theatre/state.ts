import { clamp } from '../firstPerson/geometry';
import { beginLinearDrag, previewLinearDrag, type LinearSpec } from '../stageKit/linearDrag';
import type { ChapterRuntime, PlayerPose } from '../firstPerson/types';
import { initialTheatreActor } from './actor';
import { THEATRE_CHECKPOINTS, THEATRE_CURTAIN, THEATRE_PROJECTOR, THEATRE_SEED, THEATRE_SPAWN } from './definition';
import { clampRail, evaluateLight, lightHandlePoint, LIGHT_SPEC } from './lightGate';
import { activateAction, advanceActionState, type ActionAvailability } from '../stageKit/actionInstance';
import { initialTheatreEnvironment, THEATRE_BELLS, THEATRE_SHUTTER } from './environment';
import type { TheatreCheckpointId, TheatreCommand, TheatreProgress, TheatreTransient } from './types';
const LIGHT_DRAG_SPEC: LinearSpec = { min: LIGHT_SPEC.minRail, max: LIGHT_SPEC.maxRail, handleRadius: LIGHT_SPEC.hitRadius, axis: 'x', scale: LIGHT_SPEC.railHalfLength, direction: -1 };
export function initialTheatreProgress(seed=THEATRE_SEED):TheatreProgress {
  return { schemaVersion:1,specVersion:1,seed:Number.isSafeInteger(seed)&&seed>=0&&seed<=0xffffffff?seed:THEATRE_SEED,
    light:{ rail:0,accepted:false,attempts:0 },inspectionShutterOpen:false,bypassOpen:false,discoveries:{ shadow:false,depth:false },
    story:{ crossingStarted:false,crossingPresented:false,projectorUsed:false },curtainAccepted:false,passageSealed:false,completed:false };
}
const samePlace=(a:PlayerPose,b:PlayerPose)=>Math.hypot(a.position.x-b.position.x,a.position.z-b.position.z)<1e-6;
export function initialTheatreTransient(saved:TheatreProgress,sessionId:string,pose=THEATRE_SPAWN):TheatreTransient {
  const checkpointId:TheatreCheckpointId = saved.completed?'exit':saved.light.accepted&&samePlace(pose,THEATRE_CHECKPOINTS.booth)?'booth':saved.light.accepted&&samePlace(pose,THEATRE_CHECKPOINTS.projector)?'projector':'entry';
  return { sessionId,lastSeq:0,lastNowMs:0,mode:'explore',rail:saved.light.rail,lightDragCompleted:false,activeDrag:null,actor:initialTheatreActor(saved),lastSafePose:THEATRE_CHECKPOINTS[checkpointId],checkpointId,
    lightGateOpen:Number(saved.light.accepted),curtainOpenness:Number(!saved.curtainAccepted),curtainSeconds:0,projectorSeconds:0,projectorCooldown:0,projectorPulseSeconds:0,projectorArmed:false,projectorCrankTravel:0,projectorAngle:0,noiseSequence:0,noiseDistance:0,
    environment:initialTheatreEnvironment() };
}
export function theatreSafeArea(runtime:ChapterRuntime):TheatreCheckpointId|undefined {
  const p=runtime.pose.position,saved=runtime.progress.theatre;
  if(!saved)return undefined;
  if(saved.light.accepted && Math.abs(p.x)<1.65&&p.z>=19.7&&p.z<24.3)return saved.completed?'exit':'booth';
  if(saved.light.accepted&&p.x>-5.65&&p.x<-4.35&&p.z>14.2&&p.z<17)return 'projector';
  if(p.z<-1.6&&p.z>-4.8&&p.x>-3.7&&p.x<3.7)return 'entry';
  return undefined;
}
export function canLowerTheatreCurtain(runtime:ChapterRuntime):boolean {
  const p=runtime.progress.theatre,v=runtime.theatre;
  if(!p||!v||!p.light.accepted||p.curtainAccepted||theatreSafeArea(runtime)!=='booth')return false;
  const a=v.actor.motion.position;
  return !v.actor.visible||a.x+.52<THEATRE_CURTAIN.minX||a.x-.52>THEATRE_CURTAIN.maxX||Math.abs(a.z-THEATRE_CURTAIN.z)>.52+THEATRE_CURTAIN.depth/2;
}
export function theatreShutterAvailability(runtime:ChapterRuntime):ActionAvailability {
  const v=runtime.theatre,p=runtime.progress.theatre;
  if(!v||!p||!p.light.accepted)return 'prerequisiteMissing';
  if(runtime.paused||p.completed||v.mode!=='explore'||v.activeDrag)return 'busy';
  const shutter=v.environment.shutter;
  if(shutter.progress!==Number(shutter.closed))return 'busy';
  if(shutter.closed)return 'ready';
  const movingZone=(point:{x:number;z:number},radius:number)=>point.x>=THEATRE_SHUTTER.minX-radius&&point.x<=THEATRE_SHUTTER.maxX+radius&&Math.abs(point.z-THEATRE_SHUTTER.z)<radius+.08;
  return movingZone(runtime.pose.position,.28)||v.actor.visible&&movingZone(v.actor.motion.position,.54)?'busy':'ready';
}
export function cancelTheatreManipulation(runtime:ChapterRuntime,leave=false):ChapterRuntime {
  const v=runtime.theatre,p=runtime.progress.theatre;
  if(!v||!p||!v.activeDrag&&!v.projectorArmed&&(!leave||v.mode==='explore'))return runtime;
  return { ...runtime,theatre:{ ...v,activeDrag:null,projectorArmed:false,projectorCrankTravel:0,projectorAngle:v.activeDrag?.kind==='projector'?v.activeDrag.startValue:v.projectorAngle,rail:p.light.rail,...(leave?{mode:'explore' as const}:{}) } };
}
export function advanceTheatre(runtime:ChapterRuntime,dt:number):ChapterRuntime {
  const p=runtime.progress.theatre,v=runtime.theatre;
  if(!p||!v||runtime.paused||p.completed||!Number.isFinite(dt)||dt<=0)return runtime;
  const elapsed=clamp(dt,0,.05),safe=theatreSafeArea(runtime);
  const curtainSeconds=Math.max(0,v.curtainSeconds-elapsed),curtainOpenness=p.curtainAccepted?curtainSeconds/THEATRE_CURTAIN.duration:1;
  const passageSealed=p.passageSealed||p.curtainAccepted&&curtainSeconds===0;
  const completed=passageSealed&&Math.abs(runtime.pose.position.x)<1.65&&runtime.pose.position.z>=23.3&&runtime.pose.position.z<24.3;
  const projectorSeconds=Math.max(0,v.projectorSeconds-elapsed),projectorCooldown=Math.max(0,v.projectorCooldown-elapsed);
  const bells={...v.environment.bells};
  for(const bell of THEATRE_BELLS)bells[bell.instanceId]=advanceActionState(bells[bell.instanceId],elapsed);
  let shutter=v.environment.shutter;
  if(shutter.progress!==Number(shutter.closed)){
    const movingZone=(point:{x:number;z:number},radius:number)=>point.x>=THEATRE_SHUTTER.minX-radius&&point.x<=THEATRE_SHUTTER.maxX+radius&&Math.abs(point.z-THEATRE_SHUTTER.z)<radius+.08;
    const blocked=shutter.closed&&(movingZone(runtime.pose.position,.28)||v.actor.visible&&movingZone(v.actor.motion.position,.54));
    shutter=blocked?{...shutter,closed:false}:{...shutter,progress:clamp(shutter.progress+(shutter.closed?1:-1)*elapsed/THEATRE_SHUTTER.duration,0,1)};
  }
  let pulse=Math.max(0,v.projectorPulseSeconds-elapsed),sequence=v.noiseSequence,noise=v.projectorNoise;
  if(projectorSeconds>0&&pulse===0){ sequence++;noise={ sequence,position:{ ...THEATRE_PROJECTOR.position },strength:THEATRE_PROJECTOR.strength,kind:'projector' as const };pulse=THEATRE_PROJECTOR.pulseInterval; }
  const feedbackSeconds=Math.max(0,(v.feedback?.remainingSeconds??0)-elapsed);
  return { ...runtime,progress:{ ...runtime.progress,theatre:{ ...p,passageSealed,completed },exitDoorOpen:p.light.accepted,cleared:completed },theatre:{ ...v,
    curtainSeconds,curtainOpenness,lightGateOpen:Math.min(1,v.lightGateOpen+(p.light.accepted?elapsed/.85:0)),
    projectorSeconds,projectorCooldown,projectorPulseSeconds:pulse,projectorNoise:noise,noiseSequence:sequence,
    environment:{bells,shutter},
    ...(completed?{ checkpointId:'exit' as const,lastSafePose:THEATRE_CHECKPOINTS.exit }:safe?{ checkpointId:safe,lastSafePose:THEATRE_CHECKPOINTS[safe] }:{}),
    feedback:v.feedback&&feedbackSeconds>0?{...v.feedback,remainingSeconds:feedbackSeconds}:undefined } };
}
const finitePoint=(p:{x:number;y:number})=>Number.isFinite(p.x)&&Number.isFinite(p.y);
export function applyTheatreCommand(runtime:ChapterRuntime,command:TheatreCommand,context:{rendererReady:boolean;foreground:boolean;targetId:string|null}) {
  const live=runtime.theatre,saved=runtime.progress.theatre;
  const reject=(next=runtime)=>({runtime:next,accepted:false,stopInput:false,message:''});
  if(!live||!saved||command.sessionId!==live.sessionId||!Number.isSafeInteger(command.seq)||command.seq<=live.lastSeq||!Number.isFinite(command.nowMs)||command.nowMs<live.lastNowMs)return reject();
  const consumed={...runtime,theatre:{...live,lastSeq:command.seq,lastNowMs:command.nowMs}};
  if(!context.rendererReady||!context.foreground||runtime.paused||saved.completed)return reject(consumed);
  let v=consumed.theatre,p=saved,stopInput=false,message='';const a=command.action;
  const startProjector=()=>{
    const sequence=v.noiseSequence+1;
    v={...v,activeDrag:null,projectorArmed:false,projectorCrankTravel:0,projectorSeconds:THEATRE_PROJECTOR.duration,projectorCooldown:THEATRE_PROJECTOR.duration+THEATRE_PROJECTOR.cooldown,projectorPulseSeconds:THEATRE_PROJECTOR.pulseInterval,noiseSequence:sequence,
      projectorNoise:{sequence,position:{...THEATRE_PROJECTOR.position},strength:THEATRE_PROJECTOR.strength,kind:'projector'}};
    p={...p,story:{...p.story,projectorUsed:true}};stopInput=true;message='映写機が動き始めた。音はここから響く。';
  };
  if(a.type==='enter-light') {
    if(v.mode!=='explore'||context.targetId!=='theatre-light'||p.curtainAccepted)return reject(consumed);
    v={...v,mode:'light',activeDrag:null};p={...p,discoveries:{...p.discoveries,shadow:true}};stopInput=true;
  } else if(a.type==='enter-projector') {
    if(v.mode!=='explore'||v.projectorArmed||v.activeDrag||context.targetId!=='theatre-projector'||!p.light.accepted||v.projectorCooldown>0)return reject(consumed);
    v={...v,projectorArmed:true,projectorCrankTravel:0};stopInput=true;
  } else if(a.type==='leave'||a.type==='cancel') {
    return {runtime:cancelTheatreManipulation(consumed,a.type==='leave'),accepted:true,stopInput:a.type==='leave',message};
  } else if(a.type==='open-inspection'||a.type==='inspect-depth'||a.type==='open-bypass') {
    if(v.mode!=='explore'||v.activeDrag||!p.light.accepted)return reject(consumed);
    if(a.type==='open-inspection') {if(context.targetId!=='theatre-inspection'||p.inspectionShutterOpen)return reject(consumed);p={...p,inspectionShutterOpen:true};message='点検窓が開いた。側面の歩廊から構造を見られる。';}
    else if(a.type==='inspect-depth') {if(context.targetId!=='theatre-ames-side'||!p.inspectionShutterOpen)return reject(consumed);p={...p,discoveries:{...p.discoveries,depth:true}};}
    else {if(context.targetId!=='theatre-bypass'||!p.inspectionShutterOpen||p.bypassOpen)return reject(consumed);p={...p,bypassOpen:true};message='保守通路の戸が開いた。';}
  } else if(a.type==='lower-curtain') {
    if(v.mode!=='explore'||v.activeDrag||context.targetId!=='theatre-curtain'||!canLowerTheatreCurtain(runtime))return reject(consumed);
    p={...p,curtainAccepted:true};v={...v,curtainSeconds:THEATRE_CURTAIN.duration,curtainOpenness:1,actor:{...v.actor,phase:'resolved'},checkpointId:'booth',lastSafePose:THEATRE_CHECKPOINTS.booth};stopInput=true;
    message='防火幕を下ろした。幕が止まったら、奥のサービス出口へ。';
  } else if(a.type==='activate-instance') {
    if(v.mode!=='explore'||v.activeDrag||!p.light.accepted)return reject(consumed);
    const bell=THEATRE_BELLS.find(item=>item.instanceId===a.instanceId);
    if(bell){
      if(context.targetId!==bell.instanceId)return reject(consumed);
      const activation=activateAction(bell,v.environment.bells[bell.instanceId],'ready');
      if(!activation.accepted)return reject(consumed);
      const sequence=v.noiseSequence+1;
      v={...v,environment:{...v.environment,bells:{...v.environment.bells,[bell.instanceId]:activation.state}},noiseSequence:sequence,
        environmentNoise:{sequence,position:{...bell.receiver},strength:1.45,kind:'bell'}};
      message=`呼び鈴${bell.number}の受鈴器が鳴った。`;
    }else if(a.instanceId===THEATRE_SHUTTER.instanceId){
      if(context.targetId!=='theatre-shutter-south'&&context.targetId!=='theatre-shutter-north')return reject(consumed);
      if(theatreShutterAvailability(runtime)!=='ready')return reject(consumed);
      const shutter=v.environment.shutter;
      v={...v,environment:{...v.environment,shutter:{...shutter,closed:!shutter.closed}}};
      message=shutter.closed?'仕切りを上げた。':'仕切りを下ろした。';
    }else return reject(consumed);
  } else if(a.type==='adjust-light') {
    if(v.mode!=='light'||v.activeDrag||p.light.accepted||!Number.isFinite(a.delta)||Math.abs(a.delta)>.2)return reject(consumed);
    const rail=clampRail(v.rail+a.delta);v={...v,rail};p={...p,light:{...p.light,rail}};
  } else if(a.type==='commit-light') {
    if(v.mode!=='light'||v.activeDrag||p.light.accepted||v.rail!==p.light.rail)return reject(consumed);
    const correct=evaluateLight(v.rail).canLock;
    p={...p,light:{...p.light,accepted:correct,attempts:Math.min(999,p.light.attempts+1)}};
    v={...v,feedback:{correct,sequence:command.seq,remainingSeconds:1}};
    message=correct?'灯りを固定した。2つの受光窓が灯り、映写室の戸が開く。':'影が受光窓にかかっている。灯りの位置を変えよう。';
  } else if(a.type==='crank-step') {
    if(v.mode!=='explore'||!v.projectorArmed||v.activeDrag||context.targetId!=='theatre-projector'||!p.light.accepted||v.projectorCooldown>0||!Number.isFinite(a.delta)||a.delta<=0||a.delta>Math.PI/2)return reject(consumed);
    // Accessible increments accumulate the same physical crank travel as drag.
    v={...v,projectorCrankTravel:v.projectorCrankTravel+a.delta,projectorAngle:v.projectorAngle+a.delta};
    if(v.projectorCrankTravel>=THEATRE_PROJECTOR.minimumTravel)startProjector();
  } else if(a.type==='drag-start') {
    if(v.activeDrag||!Number.isSafeInteger(a.pointerId)||!finitePoint(a.point))return reject(consumed);
    if(a.kind==='light') {
      if(v.mode!=='light'||p.light.accepted)return reject(consumed);
      if(!beginLinearDrag(a.pointerId,a.point,lightHandlePoint(v.rail),v.rail,LIGHT_DRAG_SPEC))return reject(consumed);
    } else if(v.mode!=='explore'||!v.projectorArmed||!p.light.accepted||context.targetId!=='theatre-projector'||v.projectorCooldown>0||Math.hypot(a.point.x-THEATRE_PROJECTOR.crankRadius*Math.cos(v.projectorAngle),a.point.y-THEATRE_PROJECTOR.crankRadius*Math.sin(v.projectorAngle))>THEATRE_PROJECTOR.hitRadius)return reject(consumed);
    v={...v,activeDrag:{kind:a.kind,pointerId:a.pointerId,startValue:a.kind==='light'?v.rail:v.projectorAngle,startPoint:{...a.point},lastPointerAngle:Math.atan2(a.point.y,a.point.x),crankTravel:0}};
  } else if(a.type==='drag-move') {
    const d=v.activeDrag;if(!d||d.pointerId!==a.pointerId||!finitePoint(a.point))return reject(consumed);
    if(d.kind==='light')v={...v,rail:previewLinearDrag(d,a.pointerId,a.point,LIGHT_DRAG_SPEC)!};
    else {
      if(context.targetId!=='theatre-projector'||Math.hypot(a.point.x,a.point.y)<.04)return reject(consumed);
      const angle=Math.atan2(a.point.y,a.point.x),delta=Math.atan2(Math.sin(angle-d.lastPointerAngle),Math.cos(angle-d.lastPointerAngle));
      v={...v,projectorAngle:v.projectorAngle+delta,activeDrag:{...d,lastPointerAngle:angle,crankTravel:d.crankTravel+Math.abs(delta)}};
    }
  } else if(a.type==='drag-end') {
    const d=v.activeDrag;if(!d||d.pointerId!==a.pointerId)return reject(consumed);
    if(!a.inside)return {runtime:cancelTheatreManipulation(consumed),accepted:true,stopInput:false,message};
    if(d.kind==='light'){p={...p,light:{...p.light,rail:v.rail}};v={...v,activeDrag:null,lightDragCompleted:v.lightDragCompleted||Math.abs(v.rail-d.startValue)>1e-9};}
    else {if(context.targetId!=='theatre-projector')return reject(consumed);if(d.crankTravel>=THEATRE_PROJECTOR.minimumTravel)startProjector();else {v={...v,activeDrag:null};message='もう少し取っ手を回すと動きます。';}}
  }
  return {runtime:{...consumed,theatre:v,progress:{...runtime.progress,theatre:p,exitDoorOpen:p.light.accepted,cleared:p.completed}},accepted:true,stopInput,message};
}
