import { projectWithCamera } from '../../domain/firstPerson/alignment';
import { lightHandlePoint } from '../../domain/theatre/lightGate';
import { evaluateInteraction } from '../../domain/firstPerson/interaction';
import { advanceTheatreActor } from '../../domain/theatre/actor';
import { THEATRE_METAL_FLOORS, THEATRE_PROJECTOR } from '../../domain/theatre/definition';
import { applyTheatreCommand } from '../../domain/theatre/state';
import type { TheatreAction, TheatreCommand, TheatreNoise } from '../../domain/theatre/types';
import { acquisitionResult, fixtureAcquisition, fixtureScreenBounds, fixturePointInWorld, pointOnFixture, type PanelPoint } from './manipulationProjection';
import { controllerCanInteract, soundForControllerTransition, syncCamera, worldForController, type RuntimeController } from './runtimeController';
import { clearTouchInput, requireAllPointersReleased } from './touchInput';
import type * as THREE from 'three';

export function theatreDeviceAcquisition(controller: RuntimeController, device: 'light'|'projector') {
  const id = device==='light'?'theatre-light':'theatre-projector', world=worldForController(controller);
  const target=world.interactables.find(t=>t.id===id);
  if(!target||!controllerCanInteract(controller))return acquisitionResult(id,'busy');
  const result=fixtureAcquisition(controller.runtime.pose,controller.matrices,world,target,controller.viewport?{...controller.viewport,top:80,bottom:110,side:10}:undefined);
  if(result.kind!=='ready')return result;
  if(controller.runtime.theatre?.mode==='explore'&&!controller.runtime.theatre.projectorArmed&&!controller.screenReader) {
    const cue=evaluateInteraction(world,controller.runtime.pose,controller.runtime.progress,controller.matrices);
    if(cue.kind!=='ready'||cue.target.id!==id)return acquisitionResult(id,'busy','装置の取っ手に中央の照準を向けよう。');
  }
  if(device==='projector'&&(controller.runtime.theatre?.projectorCooldown??0)>0)return acquisitionResult(id,'busy','映写機が止まると、もう一度回せます。');
  return result;
}
export function theatreDeviceScreenBounds(controller:RuntimeController) {
  const live=controller.runtime.theatre,viewport=controller.viewport;
  if(!live||!viewport||live.mode!=='light'&&!live.projectorArmed)return;
  const target=worldForController(controller).interactables.find(t=>t.id===(live.mode==='light'?'theatre-light':'theatre-projector'));
  const bounds=target&&fixtureScreenBounds(target,controller.matrices,viewport.width,viewport.height);
  return bounds?{left:Math.max(0,bounds.left-22),right:Math.min(viewport.width,bounds.right+22),top:Math.max(0,bounds.top-22),bottom:Math.min(viewport.height,bounds.bottom+22)}:undefined;
}
export function theatreCommand(controller:RuntimeController,action:TheatreAction,nowMs=performance.now()):TheatreCommand {
  return {sessionId:String(controller.runtime.session),seq:++controller.commandSequence,nowMs,action};
}
export function dispatchTheatreController(controller:RuntimeController,command:TheatreCommand,accessible=false):boolean {
  const live=controller.runtime.theatre;
  if(!live||controller.retired||command.sessionId!==live.sessionId||!Number.isSafeInteger(command.seq)||command.seq<=controller.lastReceivedSequence)return false;
  controller.lastReceivedSequence=command.seq;controller.commandSequence=Math.max(controller.commandSequence,command.seq);
  const world=worldForController(controller),cue=evaluateInteraction(world,controller.runtime.pose,controller.runtime.progress,controller.matrices);
  let target=cue.kind==='ready'?cue.target:undefined;
  const action=command.action;
  const deviceAction=action.type==='enter-light'||action.type==='enter-projector'||(live.mode==='light'||live.projectorArmed)&&action.type!=='cancel'&&action.type!=='leave';
  if(deviceAction) {
    const device=action.type==='enter-projector'||live.projectorArmed?'projector':'light',result=theatreDeviceAcquisition(controller,device);
    const panel=result.kind==='ready'?world.interactables.find(t=>t.id===result.targetId):undefined;
    target=panel&&(accessible&&controller.screenReader||live.mode==='light'||live.projectorArmed||cue.kind==='ready'&&cue.target.id===panel.id)?panel:undefined;
  }
  const previous=controller.runtime;
  const result=applyTheatreCommand(previous,command,{rendererReady:controllerCanInteract(controller)&&(!deviceAction||!!target),foreground:controller.diagnostics.appActive!==false,targetId:target?.id??null});
  controller.runtime=result.runtime;controller.feedbackMessage=result.message;
  if(result.stopInput) {
    requireAllPointersReleased(controller.input);
    if(live.activeDrag&&!controller.input.releaseBarrier.includes(live.activeDrag.pointerId))controller.input.releaseBarrier.push(live.activeDrag.pointerId);
    clearTouchInput(controller.input);controller.simpleStep=0;
    controller.pendingFootstepDistance=controller.pendingActorFootstepDistance=0;
    controller.audio?.stopMovement();
  }
  if(result.accepted&&['commit-light','open-inspection','open-bypass','lower-curtain'].includes(action.type))soundForControllerTransition(controller,previous);
  if(result.accepted&&!previous.theatre?.projectorSeconds&&controller.runtime.theatre!.projectorSeconds>0)controller.pendingProjectorPulse=true;
  if(!result.accepted&&(action.type==='enter-light'||action.type==='enter-projector'))controller.feedbackMessage=theatreDeviceAcquisition(controller,action.type==='enter-light'?'light':'projector').message;
  return result.accepted;
}
export function theatreAction(controller:RuntimeController,action:TheatreAction,accessible=false):boolean {
  return dispatchTheatreController(controller,theatreCommand(controller,action),accessible);
}
export function theatrePointer(controller:RuntimeController,phase:'start'|'move'|'end'|'cancel',pointerId:number,point:PanelPoint,width:number,height:number):boolean {
  const live=controller.runtime.theatre;
  if(!live||live.mode!=='light'&&!live.projectorArmed||!Number.isSafeInteger(pointerId))return false;
  if(controller.input.releaseBarrier.length) {if(phase==='start'&&!controller.input.releaseBarrier.includes(pointerId))controller.input.releaseBarrier.push(pointerId);return false;}
  if(phase!=='start'&&live.activeDrag?.pointerId!==pointerId)return false;
  if(phase==='cancel')return theatreAction(controller,{type:'cancel'});
  if(!controllerCanInteract(controller))return false;
  const device=live.mode==='light'?'light':'projector',acquisition=theatreDeviceAcquisition(controller,device);
  const world=worldForController(controller),target=acquisition.kind==='ready'?world.interactables.find(t=>t.id===acquisition.targetId):undefined;
  const local=target&&pointOnFixture(controller.runtime.pose,controller.matrices,world,target,point,width,height,.5);
  if(phase==='start') {
    if(!target||!local||!controller.matrices)return false;
    const handle=device==='light'?lightHandlePoint(live.rail):{x:THEATRE_PROJECTOR.crankRadius*Math.cos(live.projectorAngle),y:THEATRE_PROJECTOR.crankRadius*Math.sin(live.projectorAngle)};
    const handleWorld=fixturePointInWorld(target,handle),projected=handleWorld&&projectWithCamera(handleWorld,controller.matrices);
    // A 44 logical-point target around the actual visible handle. The world
    // plane point (including grab offset) stays authoritative for later deltas.
    if(!projected||Math.hypot(point.x-(projected.x+1)*width/2,point.y-(1-projected.y)*height/2)>22+1e-7)return false;
    return theatreAction(controller,{type:'drag-start',kind:device,pointerId,point:local});
  }
  if(phase==='move')return !!local&&theatreAction(controller,{type:'drag-move',pointerId,point:local});
  if(local)theatreAction(controller,{type:'drag-move',pointerId,point:local});
  return theatreAction(controller,{type:'drag-end',pointerId,inside:!!local});
}
/** Quick crank capture suppresses locomotion, but still advances this actor.
 * Hearing receives the actual domain noise, including when output is muted. */
export function advanceTheatreControllerActor(controller:RuntimeController,dt:number,moved:number,speed:number,camera:THREE.PerspectiveCamera) {
  const live=controller.runtime.theatre;if(!live||!controllerCanInteract(controller))return;
  const position=controller.runtime.pose.position,cumulative=live.noiseDistance+moved;
  let noise:TheatreNoise|undefined;
  if(moved>0&&cumulative>=.65) {
    const metal=THEATRE_METAL_FLOORS.some(f=>position.x>=f.minX&&position.x<=f.maxX&&position.z>=f.minZ&&position.z<=f.maxZ);
    noise={sequence:live.noiseSequence+1,position:{...position,y:.08},strength:Math.min(1.2,(speed<=.65?.1:speed>1.4?.8:.4)*(metal?1.35:1)),kind:metal?'metal':'footstep'};
  }
  if(live.projectorNoise)controller.pendingProjectorPulse=true;
  controller.runtime={...controller.runtime,theatre:{...live,noiseDistance:cumulative%.65,noiseSequence:noise?.sequence??live.noiseSequence}};
  const actor=advanceTheatreActor(controller.runtime,dt,{intensity:controller.horrorIntensity,matrices:controller.matrices!,...(noise?{noise}:{})});
  controller.runtime=actor.runtime;controller.pendingActorPlants.push(...actor.footPlants);
  controller.pendingActorEvents=[...controller.pendingActorEvents,...actor.events].slice(-4);
  if(actor.caught){requireAllPointersReleased(controller.input);clearTouchInput(controller.input);controller.simpleStep=0;controller.pendingFootstepDistance=0;syncCamera(controller,camera);}
}
