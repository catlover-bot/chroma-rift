import { ACTOR_MOTION,actorMotionEye,advanceActorMotion,createActorMotion,type ActorFootPlant,type ActorGait } from '../actorMotion';
import { cameraMatchesPose,projectWithCamera } from '../firstPerson/alignment';
import { segmentOccluded } from '../firstPerson/geometry';
import type { CameraMatrices,ChapterRuntime,Vec3,WorldGeometry } from '../firstPerson/types';
import { VAULT_AI,vaultActorEdgeOpen,vaultNoiseAudibility } from '../vault/actorPolicy';
import { THEATRE_ACTOR_SPAWN,THEATRE_CROSSING,THEATRE_PATROL } from './definition';
import type { TheatreActor,TheatreNoise,TheatreProgress } from './types';
import { getTheatreWorld } from './world';
/** Reuse the proven body, eye cone, hearing falloff and movement/attack pacing.
 * Only the authored route, initial crossing and projector evidence are new. */
export const THEATRE_AI=Object.freeze({...VAULT_AI,crossingSpeed:.72,crossingGrace:1.6});
export type TheatreActorEvent='crossing'|'noticed'|'windup'|'caught';
export type TheatreActorStep={runtime:ChapterRuntime;caught:boolean;movedDistance:number;footPlants:ActorFootPlant[];events:TheatreActorEvent[]};
const distance=(a:Vec3,b:Vec3)=>Math.hypot(a.x-b.x,a.z-b.z);
const copy=(p:Vec3):Vec3=>({...p});
export function initialTheatreActor(progress:TheatreProgress):TheatreActor {
  return {motion:createActorMotion(THEATRE_ACTOR_SPAWN,Math.PI/2),visible:true,phase:progress.curtainAccepted?'resolved':progress.story.crossingStarted?'patrol':'idle',phaseTime:0,
    recognition:0,routeIndex:progress.story.crossingStarted?8:0,searchIndex:0,startupGrace:THEATRE_AI.coldGrace,contactCooldown:THEATRE_AI.coldGrace,
    attackCommitted:false,attackHit:false,lastNoiseSequence:-1,intensity:'standard',navigationPath:[],repathSeconds:0,searchDwellSeconds:0,revealTime:0,crossingIndex:0};
}
export function theatreActorEdgeOpen(from:Vec3,to:Vec3,world:WorldGeometry):boolean {
  // Shared footprint/floor/closed-door tests; the actor cannot collide with its
  // own dynamic player blocker. No second position integrator is introduced.
  return vaultActorEdgeOpen(from,to,{...world,solids:world.solids.filter(s=>s.id!=='theatre-actor-body')});
}
export function theatreActorCanSeePlayer(runtime:ChapterRuntime):boolean {
  const a=runtime.theatre?.actor;if(!a?.visible||!runtime.progress.theatre?.light.accepted)return false;
  const eye=actorMotionEye(a.motion),p=runtime.pose.position,dx=p.x-eye.position.x,dy=p.y-eye.position.y,dz=p.z-eye.position.z,d=Math.hypot(dx,dy,dz);
  return d<=THEATRE_AI.visionRange&&(d<1e-8||(eye.direction.x*dx+eye.direction.y*dy+eye.direction.z*dz)/d>=Math.cos(THEATRE_AI.visionHalfAngle))&&!segmentOccluded(eye.position,p,getTheatreWorld(runtime));
}
export function theatreNoiseAudibility(actor:TheatreActor,noise:TheatreNoise,world:WorldGeometry):number {
  if(!['footstep','metal','projector','bell'].includes(noise.kind))return 0;
  // Projector is mechanical evidence at its physical emitter. Reclassifying its
  // sound family leaves the exact shared distance/opaque attenuation unchanged.
  return vaultNoiseAudibility({...actor,phase:'patrol'},{...noise,kind:noise.kind==='projector'||noise.kind==='bell'?'metal':noise.kind},world);
}
function protectedPlayer(runtime:ChapterRuntime) {
  const p=runtime.pose.position;
  return p.z<4.35||p.z>=19.7||p.x<-4.35&&p.z>=10.82;
}
function phase(a:TheatreActor,next:TheatreActor['phase']):TheatreActor {
  return a.phase===next?a:{...a,phase:next,phaseTime:0,navigationPath:[],navigationTarget:undefined,repathSeconds:0,searchDwellSeconds:0};
}
function nearest(a:TheatreActor) {let best=0;THEATRE_PATROL.forEach((p,i)=>{if(distance(a.motion.position,p)<distance(a.motion.position,THEATRE_PATROL[best]!))best=i;});return best;}
/** Nine-node loop with real collision-checked edges. Inaccessible remembered
 * sources terminate at a reachable boundary; never substitute player pose. */
function path(from:Vec3,to:Vec3,world:WorldGeometry):readonly Vec3[] {
  if(theatreActorEdgeOpen(from,to,world))return[copy(to)];
  const count=THEATRE_PATROL.length,costs=Array<number>(count).fill(Infinity),parents=Array<number>(count).fill(-1),done=new Set<number>();
  for(let i=0;i<count;i++)if(theatreActorEdgeOpen(from,THEATRE_PATROL[i]!,world))costs[i]=distance(from,THEATRE_PATROL[i]!);
  for(let step=0;step<count;step++){
    let current=-1;for(let i=0;i<count;i++)if(!done.has(i)&&(current<0||costs[i]!<costs[current]!))current=i;
    if(current<0||!Number.isFinite(costs[current]!))break;done.add(current);
    for(const other of [(current+1)%count,(current+count-1)%count])if(!done.has(other)&&theatreActorEdgeOpen(THEATRE_PATROL[current]!,THEATRE_PATROL[other]!,world)){
      const cost=costs[current]!+distance(THEATRE_PATROL[current]!,THEATRE_PATROL[other]!);if(cost<costs[other]!){costs[other]=cost;parents[other]=current;}
    }
  }
  let last=-1,best=Infinity,reaches=false;
  for(let i=0;i<count;i++)if(Number.isFinite(costs[i]!)){
    const open=theatreActorEdgeOpen(THEATRE_PATROL[i]!,to,world),cost=(open?costs[i]!:1000)+distance(THEATRE_PATROL[i]!,to);
    if(cost<best){last=i;best=cost;reaches=open;}
  }
  if(last<0)return[];const result:Vec3[]=[];for(let i=last;i>=0;i=parents[i]!)result.push(THEATRE_PATROL[i]!);result.reverse();if(reaches)result.push(copy(to));return result;
}
function route(a:TheatreActor,target:Vec3,world:WorldGeometry) {
  let actor=a;if(!a.navigationTarget||distance(a.navigationTarget,target)>.4||a.repathSeconds<=0&&!a.navigationPath.length)actor={...a,navigationTarget:copy(target),navigationPath:path(a.motion.position,target,world),repathSeconds:THEATRE_AI.repathSeconds};
  while(actor.navigationPath.length&&distance(actor.motion.position,actor.navigationPath[0]!)<.045)actor={...actor,navigationPath:actor.navigationPath.slice(1)};
  return{actor,target:actor.navigationPath[0]};
}
function presented(runtime:ChapterRuntime,matrices?:CameraMatrices) {
  if(!matrices||!cameraMatchesPose(runtime.pose,matrices))return false;const p=runtime.theatre!.actor.motion.position,world=getTheatreWorld(runtime);
  return[-.16,0,.16].some(dx=>[1.55,1.95,2.1].some(y=>{const target={x:p.x+dx,y,z:p.z};return !!projectWithCamera(target,matrices)&&!segmentOccluded(runtime.pose.position,target,world);}));
}
export function advanceTheatreActor(runtime:ChapterRuntime,dt:number,options:{intensity:'standard'|'subdued';noise?:TheatreNoise;matrices?:CameraMatrices}):TheatreActorStep {
  const initial:TheatreActorStep={runtime,caught:false,movedDistance:0,footPlants:[],events:[]},live=runtime.theatre,saved=runtime.progress.theatre;
  if(!live||!saved||runtime.paused||saved.curtainAccepted||saved.completed||live.mode!=='explore'||!Number.isFinite(dt)||dt<=0||!saved.light.accepted)return initial;
  const elapsed=Math.min(.05,dt),world=getTheatreWorld(runtime),events:TheatreActorEvent[]=[];
  let actor:TheatreActor={...live.actor,phaseTime:live.actor.phaseTime+elapsed,startupGrace:Math.max(0,live.actor.startupGrace-elapsed),contactCooldown:Math.max(0,live.actor.contactCooldown-elapsed),repathSeconds:Math.max(0,live.actor.repathSeconds-elapsed)},story=saved.story;
  if(actor.intensity!==options.intensity)actor={...phase(actor,'return'),intensity:options.intensity,recognition:0,attackCommitted:false,attackHit:false,startupGrace:Math.max(actor.startupGrace,3),contactCooldown:Math.max(actor.contactCooldown,3),routeIndex:nearest(actor)};
  if(!story.crossingStarted){
    if(runtime.pose.position.z<=4.4)return initial;
    story={...story,crossingStarted:true};actor={...phase(actor,'crossing'),crossingIndex:1,revealTime:0};events.push('crossing');
  }
  let next:ChapterRuntime={...runtime,progress:{...runtime.progress,theatre:{...saved,story}},theatre:{...live,actor}};
  const sees=theatreActorCanSeePlayer(next),safe=protectedPlayer(next),player=runtime.pose.position,quiet=options.intensity==='subdued';
  if(sees)actor={...actor,lastSeen:copy(player),recognition:Math.min(1,actor.recognition+elapsed/THEATRE_AI.recognitionSeconds)};
  else actor={...actor,recognition:Math.max(0,actor.recognition-elapsed/.7)};
  let heard=false;
  const noises=[live.projectorNoise,live.environmentNoise,options.noise].filter((n):n is TheatreNoise=>!!n).sort((a,b)=>a.sequence-b.sequence);
  for(const noise of noises)if(Number.isSafeInteger(noise.sequence)&&noise.sequence>=0&&noise.sequence>actor.lastNoiseSequence){
    actor={...actor,lastNoiseSequence:noise.sequence};
    if(theatreNoiseAudibility(actor,noise,world)>=THEATRE_AI.noiseThreshold){actor={...actor,lastHeard:copy(noise.position)};heard=true;}
  }
  let destination:Vec3|undefined,lookTarget:Vec3|undefined,speed=0;
  if(actor.phase==='crossing'){
    actor={...actor,revealTime:actor.revealTime+elapsed};
    if(distance(actor.motion.position,THEATRE_CROSSING[actor.crossingIndex]!)<.08)actor={...actor,crossingIndex:actor.crossingIndex+1};
    if(actor.crossingIndex>=THEATRE_CROSSING.length)actor={...phase(actor,'patrol'),routeIndex:0,startupGrace:Math.max(actor.startupGrace,THEATRE_AI.crossingGrace),recognition:0};
    else{destination=THEATRE_CROSSING[actor.crossingIndex];lookTarget=sees?copy(player):undefined;speed=THEATRE_AI.crossingSpeed;}
  }
  if(actor.phase!=='crossing'){
    const interruptible=['idle','listen','patrol','investigate','search','return'].includes(actor.phase);
    if(!quiet&&!safe&&sees&&actor.recognition>=1&&actor.startupGrace<=0&&interruptible){actor=phase(actor,'notice');events.push('noticed');}
    else if(!quiet&&!sees&&heard&&interruptible)actor=phase(actor,'investigate');
    if(quiet)actor=phase(actor,'patrol');
    if(actor.phase==='idle'||actor.phase==='listen'&&actor.phaseTime>=.85)actor=phase(actor,'patrol');
    if(actor.phase==='notice'&&actor.phaseTime>=THEATRE_AI.noticeSeconds)actor=phase(actor,sees&&!safe?'pursue':'search');
    if(actor.phase==='pursue'){
      if(!sees||safe)actor={...phase(actor,'search'),searchOrigin:actor.lastSeen?copy(actor.lastSeen):copy(actor.motion.position),searchIndex:0};
      else if(distance(actor.motion.position,player)<=.9+actor.motion.speed**2/(2*ACTOR_MOTION.linearDeceleration)&&actor.contactCooldown<=0&&actor.startupGrace<=0){actor={...phase(actor,'windup'),attackCommitted:false,attackHit:false,attackTarget:undefined};events.push('windup');}
    }
    if(actor.phase==='windup'&&actor.phaseTime>=THEATRE_AI.windupSeconds&&actor.startupGrace<=0){
      if(!actor.lastSeen||safe)actor=phase(actor,'recover');
      else actor={...phase(actor,'attack'),attackTarget:copy(actor.lastSeen),attackCommitted:true,attackHit:false,motion:{...actor.motion,launchAge:ACTOR_MOTION.startAnticipation,movingIntent:true}};
    }
    if(actor.phase==='attack'&&actor.phaseTime>=THEATRE_AI.attackSeconds)actor={...phase(actor,'recover'),contactCooldown:THEATRE_AI.recoverSeconds,attackCommitted:false};
    if(actor.phase==='recover'&&actor.phaseTime>=THEATRE_AI.recoverSeconds)actor={...phase(actor,'search'),searchOrigin:actor.lastSeen?copy(actor.lastSeen):copy(actor.motion.position),searchIndex:0};
    if(actor.phase==='search'&&actor.searchDwellSeconds>=THEATRE_AI.searchSeconds)actor={...phase(actor,'return'),routeIndex:nearest(actor)};
    if(actor.phase==='investigate'&&actor.lastHeard&&(distance(actor.motion.position,actor.lastHeard)<.25||actor.phaseTime>=5))actor={...phase(actor,'search'),searchOrigin:copy(actor.lastHeard),searchIndex:0};
    if(actor.phase==='return'&&actor.phaseTime>=THEATRE_AI.returnPause&&distance(actor.motion.position,THEATRE_PATROL[actor.routeIndex]!)<.1)actor=phase(actor,'patrol');
    if(actor.phase==='patrol'){
      if(distance(actor.motion.position,THEATRE_PATROL[actor.routeIndex]!)<.12)actor={...actor,routeIndex:(actor.routeIndex+1)%THEATRE_PATROL.length};
      destination=THEATRE_PATROL[actor.routeIndex];speed=THEATRE_AI.patrolSpeed;
    } else if(actor.phase==='investigate'){destination=actor.lastHeard;lookTarget=actor.lastHeard;speed=THEATRE_AI.investigateSpeed;}
    else if(actor.phase==='notice'||actor.phase==='windup')lookTarget=actor.lastSeen;
    else if(actor.phase==='pursue'){destination=actor.lastSeen;lookTarget=actor.lastSeen;speed=THEATRE_AI.pursueSpeed;}
    else if(actor.phase==='attack'){destination=actor.attackTarget;lookTarget=actor.attackTarget;speed=THEATRE_AI.pursueSpeed;}
    else if(actor.phase==='search'){
      const remembered=actor.searchOrigin??actor.lastSeen??actor.lastHeard??actor.motion.position;
      actor={...actor,searchOrigin:actor.searchOrigin??copy(remembered),searchIndex:Math.min(2,Math.floor(actor.searchDwellSeconds/1.2))};destination=remembered;speed=THEATRE_AI.searchSpeed;
      const yaw=[.65,-.75,.1][actor.searchIndex]!;lookTarget={x:remembered.x-Math.sin(yaw)*1.8,y:1.65,z:remembered.z-Math.cos(yaw)*1.8};
    } else if(actor.phase==='return'&&actor.phaseTime>=THEATRE_AI.returnPause){destination=THEATRE_PATROL[actor.routeIndex];speed=THEATRE_AI.patrolSpeed;}
  }
  let target:Vec3|undefined;
  if(destination){if(actor.phase==='attack')target=destination;else{const planned=route(actor,destination,world);actor=planned.actor;target=planned.target;if(actor.phase==='search'&&(!target||distance(actor.motion.position,destination)<.25))actor={...actor,searchDwellSeconds:actor.searchDwellSeconds+elapsed};}}
  if(target&&actor.phase!=='attack'){
    const d=distance(actor.motion.position,player);
    if(d>1e-6&&d<.74){const away={x:actor.motion.position.x+(actor.motion.position.x-player.x)/d*.28,y:0,z:actor.motion.position.z+(actor.motion.position.z-player.z)/d*.28};if(theatreActorEdgeOpen(actor.motion.position,away,world))target=away;}
  }
  const desiredHeading=target?undefined:lookTarget?Math.atan2(-(lookTarget.x-actor.motion.position.x),-(lookTarget.z-actor.motion.position.z)):actor.motion.desiredHeading;
  const gait:ActorGait=actor.phase==='resolved'?'idle':actor.phase==='crossing'?'patrol':actor.phase;
  const motion=advanceActorMotion(actor.motion,{...(target?{target}:{}),...(lookTarget?{lookTarget}:{}),...(desiredHeading===undefined?{}:{desiredHeading}),maxSpeed:speed,gait},elapsed,
    (from,to)=>theatreActorEdgeOpen(from,to,world)&&(actor.phase==='attack'||distance(to,player)>=.71||distance(to,player)>distance(from,player)+1e-7));
  actor={...actor,motion:motion.state};next={...next,theatre:{...live,actor,projectorNoise:undefined,environmentNoise:undefined}};
  if(!story.crossingPresented&&actor.phase==='crossing'&&presented(next,options.matrices)){story={...story,crossingPresented:true};next={...next,progress:{...next.progress,theatre:{...saved,story}}};}
  if(!quiet&&!safe&&actor.phase==='attack'&&actor.attackCommitted&&!actor.attackHit&&actor.startupGrace<=0&&actor.contactCooldown<=0&&distance(actor.motion.position,player)<=THEATRE_AI.contactDistance&&!segmentOccluded(actorMotionEye(actor.motion).position,player,getTheatreWorld(next))){
    actor={...phase(actor,'recover'),attackHit:true,attackCommitted:false,startupGrace:THEATRE_AI.coldGrace,contactCooldown:THEATRE_AI.coldGrace,recognition:0,routeIndex:nearest(actor)};
    next={...next,pose:{...live.lastSafePose,position:copy(live.lastSafePose.position)},theatre:{...next.theatre!,actor}};events.push('caught');return{runtime:next,caught:true,movedDistance:motion.movedDistance,footPlants:motion.footPlants,events};
  }
  return{runtime:next,caught:false,movedDistance:motion.movedDistance,footPlants:motion.footPlants,events};
}
