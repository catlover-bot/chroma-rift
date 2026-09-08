import { actorMotionEye,createActorMotion } from '../../actorMotion';
import { pauseRuntime,resumeRuntime } from '../../firstPerson/runtime';
import { segmentOccluded,updatePlayer } from '../../firstPerson/geometry';
import type { ChapterRuntime,Vec3 } from '../../firstPerson/types';
import { advanceTheatreActor,THEATRE_AI,theatreActorCanSeePlayer,theatreActorEdgeOpen,theatreNoiseAudibility } from '../actor';
import { THEATRE_CHECKPOINTS,THEATRE_PATROL,THEATRE_PROJECTOR } from '../definition';
import { createTheatreRuntime } from '../runtime';
import { getTheatreWorld } from '../world';
function active(position:Vec3={x:-2.6,y:0,z:14.1},yaw=0):ChapterRuntime {
  const r=createTheatreRuntime();return {...r,pose:{position:{x:2.55,y:1.6,z:14.1},yaw:0,pitch:0},progress:{...r.progress,exitDoorOpen:true,theatre:{...r.progress.theatre!,light:{rail:.8,accepted:true,attempts:1},story:{...r.progress.theatre!.story,crossingStarted:true}}},theatre:{...r.theatre!,lightGateOpen:1,actor:{...r.theatre!.actor,motion:createActorMotion(position,yaw),phase:'patrol',startupGrace:0,contactCooldown:0}}};
}
function step(r:ChapterRuntime,seconds:number,intensity:'standard'|'subdued'='standard') {for(let i=0;i<Math.ceil(seconds*60);i++)r=advanceTheatreActor(r,1/60,{intensity}).runtime;return r;}
describe('theatre reuses actual eye, body, sound and grounded locomotion',()=>{
  test('the nine-waypoint loop has no closed collision edge',()=>{
    const r=active(),w=getTheatreWorld(r);expect(THEATRE_PATROL.length).toBeLessThanOrEqual(12);
    THEATRE_PATROL.forEach((p,i)=>expect(theatreActorEdgeOpen(p,THEATRE_PATROL[(i+1)%THEATRE_PATROL.length]!,w)).toBe(true));
  });
  test.each([
    [{x:2,y:0,z:3},{x:2,y:0,z:5},Math.PI],
    [{x:-3.4,y:0,z:14.75},{x:-4.7,y:0,z:14.75},Math.PI/2],
    [{x:-3.4,y:0,z:16.55},{x:-4.7,y:0,z:16.55},Math.PI/2],
    [{x:0,y:0,z:18},{x:0,y:0,z:19.5},Math.PI],
  ])('opened work/projector/booth passages admit player but physically exclude actor (%#)',(from,to,yaw)=>{
    const r=active(),w=getTheatreWorld(r);expect(theatreActorEdgeOpen(from,to,w)).toBe(false);
    let pose={position:{...from,y:1.6},yaw,pitch:0};for(let i=0;i<Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/2.15*60);i++)pose=updatePlayer(pose,{strafe:0,forward:1},1/60,w);
    expect(Math.hypot(pose.position.x-from.x,pose.position.z-from.z)).toBeGreaterThan(Math.hypot(to.x-from.x,to.z-from.z)-.12);
  });
  test('the open Ames walkway remains subject to real sight and contact rather than a coordinate-based immunity',()=>{
    let r=active({x:-3,y:0,z:8.5},Math.PI/2);r={...r,pose:{position:{x:-4.7,y:1.6,z:8.5},yaw:0,pitch:0},theatre:{...r.theatre!,actor:{...r.theatre!.actor,recognition:1}}};
    expect(theatreActorCanSeePlayer(r)).toBe(true);expect(advanceTheatreActor(r,1/60,{intensity:'standard'}).runtime.theatre!.actor.phase).toBe('notice');
    r={...r,theatre:{...r.theatre!,actor:{...r.theatre!.actor,motion:createActorMotion({x:-4.1,y:0,z:8.5},Math.PI/2),phase:'attack',attackCommitted:true,attackTarget:{...r.pose.position}}}};
    expect(advanceTheatreActor(r,1/60,{intensity:'standard'}).caught).toBe(true);
  });
  test('first crossing moves one individual continuously, cannot wait forever for a camera and never awards unseen presentation',()=>{
    let r=active({x:2.8,y:0,z:6.55},Math.PI/2);r={...r,pose:{position:{x:3.3,y:1.6,z:4.6},yaw:Math.PI,pitch:0},progress:{...r.progress,theatre:{...r.progress.theatre!,story:{...r.progress.theatre!.story,crossingStarted:false}}}};
    let crossings=0,travel=0;for(let i=0;i<15*60;i++){const before=r.theatre!.actor.motion.position,out=advanceTheatreActor(r,1/60,{intensity:'standard'});crossings+=out.events.filter(e=>e==='crossing').length;travel+=out.movedDistance;r=out.runtime;expect(Math.hypot(r.theatre!.actor.motion.position.x-before.x,r.theatre!.actor.motion.position.z-before.z)).toBeLessThanOrEqual(THEATRE_AI.pursueSpeed/60+.0001);expect(out.caught).toBe(false);}
    expect(crossings).toBe(1);expect(travel).toBeGreaterThan(5);expect(r.theatre!.actor.phase).not.toBe('crossing');expect(r.progress.theatre!.story.crossingPresented).toBe(false);
  });
  test('projector audibility uses its physical source, shared wall attenuation and remembered source only',()=>{
    const r=active(),noise={sequence:2,position:{...THEATRE_PROJECTOR.position},strength:THEATRE_PROJECTOR.strength,kind:'projector' as const};
    expect(theatreActorCanSeePlayer(r)).toBe(false);expect(theatreNoiseAudibility(r.theatre!.actor,noise,getTheatreWorld(r))).toBeGreaterThan(THEATRE_AI.noiseThreshold);
    expect(theatreNoiseAudibility(r.theatre!.actor,{...noise,position:{x:-5.37,y:1.3,z:12}},getTheatreWorld(r))).toBeLessThan(THEATRE_AI.noiseThreshold);
    const before=JSON.stringify(r),out=advanceTheatreActor(r,1/60,{intensity:'standard',noise});expect(out.runtime.theatre!.actor.phase).toBe('investigate');expect(out.runtime.theatre!.actor.lastHeard).toEqual(noise.position);expect(out.runtime.theatre!.actor.lastSeen).toBeUndefined();expect(JSON.stringify(r)).toBe(before);
    const replay=advanceTheatreActor(out.runtime,1/60,{intensity:'standard',noise:{...noise,position:r.pose.position}});expect(replay.runtime.theatre!.actor.lastHeard).toEqual(noise.position);
  });
  test('legitimate visual contact beats a decoy instead of forcing a blind turn',()=>{
    let r=active();r={...r,pose:{position:{x:-2.6,y:1.6,z:12.5},yaw:0,pitch:0},theatre:{...r.theatre!,actor:{...r.theatre!.actor,recognition:1}}};expect(theatreActorCanSeePlayer(r)).toBe(true);
    const out=advanceTheatreActor(r,1/60,{intensity:'standard',noise:{sequence:1,position:{...THEATRE_PROJECTOR.position},strength:1.12,kind:'projector'}});
    expect(out.runtime.theatre!.actor.phase).toBe('notice');expect(out.runtime.theatre!.actor.lastSeen).toEqual(r.pose.position);expect(out.events).toContain('noticed');
  });
  test('fast hidden footsteps can be heard while the same quiet step cannot',()=>{
    const r=active(),noise={sequence:1,position:{x:-2.6,y:.08,z:16},strength:.8,kind:'footstep' as const};
    expect(theatreNoiseAudibility(r.theatre!.actor,noise,getTheatreWorld(r))).toBeGreaterThan(THEATRE_AI.noiseThreshold);
    expect(theatreNoiseAudibility(r.theatre!.actor,{...noise,strength:.1},getTheatreWorld(r))).toBeLessThan(THEATRE_AI.noiseThreshold);
  });
  test('windup commits a fixed observed attack point, then recovers instead of homing during the lunge',()=>{
    let r=active({x:2.55,y:0,z:16.25},Math.PI);r={...r,pose:{position:{x:2.55,y:1.6,z:17.35},yaw:0,pitch:0},theatre:{...r.theatre!,actor:{...r.theatre!.actor,phase:'windup',phaseTime:THEATRE_AI.windupSeconds-.01,lastSeen:{x:2.55,y:1.6,z:17.35}}}};
    r=advanceTheatreActor(r,.02,{intensity:'standard'}).runtime;const target=r.theatre!.actor.attackTarget;expect(r.theatre!.actor.phase).toBe('attack');
    r={...r,pose:{...r.pose,position:{x:3.4,y:1.6,z:17.35}}};r=advanceTheatreActor(r,.02,{intensity:'standard'}).runtime;expect(r.theatre!.actor.attackTarget).toEqual(target);
    r=step(r,.5);expect(r.theatre!.actor.phase).toBe('recover');
  });
  test('closed world and safe booth prevent contact; caught outside restores only the last earned safe pose',()=>{
    let r=active({x:2.55,y:0,z:16.9},Math.PI);r={...r,pose:{position:{x:2.55,y:1.6,z:17.35},yaw:0,pitch:0},theatre:{...r.theatre!,lastSafePose:THEATRE_CHECKPOINTS.projector,checkpointId:'projector',actor:{...r.theatre!.actor,phase:'attack',attackCommitted:true,attackTarget:{x:2.55,y:1.6,z:17.35}}}};
    const oldProgress=JSON.stringify(r.progress),out=advanceTheatreActor(r,1/60,{intensity:'standard'});expect(out.caught).toBe(true);expect(out.runtime.pose).toEqual(THEATRE_CHECKPOINTS.projector);expect(JSON.stringify(out.runtime.progress)).toBe(oldProgress);expect(out.runtime.theatre!.actor.startupGrace).toBe(3);
    const closed={...r,pose:THEATRE_CHECKPOINTS.booth,progress:{...r.progress,theatre:{...r.progress.theatre!,curtainAccepted:true,passageSealed:true}},theatre:{...r.theatre!,curtainOpenness:0}};
    expect(segmentOccluded(actorMotionEye(closed.theatre.actor.motion).position,closed.pose.position,getTheatreWorld(closed))).toBe(true);expect(advanceTheatreActor(closed,1/60,{intensity:'standard'}).caught).toBe(false);
  });
  test('a fully paused session preserves memory/timers, while armed quick crank still advances the enemy',()=>{
    let r=active();r={...r,theatre:{...r.theatre!,projectorArmed:true,actor:{...r.theatre!.actor,phase:'search',phaseTime:1.5,lastSeen:{x:-2.6,y:1.6,z:12.5},searchOrigin:{x:-2.6,y:1.6,z:12.5}}}};
    expect(advanceTheatreActor(r,1/60,{intensity:'standard'}).runtime.theatre!.actor.phaseTime).toBeGreaterThan(1.5);
    const paused=pauseRuntime(r);expect(advanceTheatreActor(paused,10,{intensity:'standard'}).runtime).toBe(paused);expect(resumeRuntime(paused).theatre!.actor).toBe(r.theatre!.actor);
  });
  test('subdued retains continuous presence without pursuit, attack or catch',()=>{
    let r=active();const seen=new Set<string>();for(let i=0;i<8*60;i++){const out=advanceTheatreActor(r,1/60,{intensity:'subdued'});r=out.runtime;seen.add(r.theatre!.actor.phase);expect(out.caught).toBe(false);}
    expect(r.theatre!.actor.visible).toBe(true);expect(r.theatre!.actor.motion.travelledDistance).toBeGreaterThan(1);expect([...seen].some(p=>['notice','pursue','windup','attack'].includes(p))).toBe(false);
  });
});
