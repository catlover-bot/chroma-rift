import * as THREE from 'three';
import { createGalleryAudioOwner } from '../../../audio/owner';
import { DEFAULT_AUDIO_PREFERENCES } from '../../../audio/preferences';
import { createCheckpoint,MOVE_SPEED,projectWithCamera,segmentOccluded,type CheckpointState,type Vec3 } from '../../../domain/firstPerson';
import { actorMotionEye } from '../../../domain/actorMotion';
import { THEATRE_AI,theatreActorCanSeePlayer,theatreNoiseAudibility } from '../../../domain/theatre/actor';
import { restoreTheatreCheckpoint } from '../../../domain/theatre/checkpoint';
import { THEATRE_CHAPTER_ID,THEATRE_CHECKPOINTS,THEATRE_CURTAIN_FIXTURE,THEATRE_INSPECTION_FIXTURE,THEATRE_AMES_SIDE_FIXTURE,THEATRE_BYPASS_FIXTURE,THEATRE_LIGHT_FIXTURE,THEATRE_PROJECTOR_FIXTURE,THEATRE_PROJECTOR } from '../../../domain/theatre/definition';
import { lightHandlePoint } from '../../../domain/theatre/lightGate';
import { beginStick,endPointer } from '../touchInput';
import { createCanvasLifecycle } from '../canvasLifecycle';
import { theatreAction,theatreDeviceAcquisition,theatrePointer } from '../theatreController';
import { advanceController,commandController,createController,interactController,syncCamera,worldForController,type RuntimeController } from '../runtimeController';
const WIDTH=390,HEIGHT=844;
function setup(intensity:'standard'|'subdued',muted:boolean,checkpoint?:CheckpointState) {
  const controller=createController(checkpoint,false,true,THEATRE_CHAPTER_ID),camera=new THREE.PerspectiveCamera(65,WIDTH/HEIGHT,.08,60);
  controller.horrorIntensity=intensity;controller.viewport={width:WIDTH,height:HEIGHT};syncCamera(controller,camera);
  const renderer={dispose:jest.fn()},lifecycle=createCanvasLifecycle(controller,jest.fn());
  lifecycle.ownRenderer(renderer as unknown as THREE.WebGLRenderer);lifecycle.attachRoot({setFrameloop:jest.fn()});lifecycle.commitScene();expect(lifecycle.markReady(true)).toBe(false);
  controller.diagnostics.renderReturns=1;controller.diagnostics.presentationReturns=1;expect(lifecycle.markReady(true)).toBe(true);controller.diagnostics.appActive=true;
  controller.audio=createGalleryAudioOwner({sessionId:String(controller.runtime.session),preferences:{...DEFAULT_AUDIO_PREFERENCES,enabled:!muted}},{availability:'available',prepare:async()=>undefined,createPlayer:()=>({isLoaded:true,volume:0,loop:false,play:jest.fn(),pause:jest.fn(),seekTo:async()=>undefined,release:jest.fn()})});controller.audio.setActive(true);
  return{controller,camera,lifecycle,renderer};
}
function lookAt(c:RuntimeController,camera:THREE.PerspectiveCamera,target:Vec3) {
  const p=c.runtime.pose,dx=target.x-p.position.x,dz=target.z-p.position.z,desired=Math.atan2(-dx,-dz),change=Math.atan2(Math.sin(desired-p.yaw),Math.cos(desired-p.yaw));
  commandController(c,{type:'turn',yaw:change,pitch:Math.atan2(target.y-p.position.y,Math.hypot(dx,dz))-p.pitch});syncCamera(c,camera);
}
function track(c:RuntimeController,phases:Set<string>) {
  const a=c.runtime.theatre!.actor;phases.add(a.phase);if(a.phase==='search'&&a.lastSeen&&segmentOccluded(actorMotionEye(a.motion).position,c.runtime.pose.position,worldForController(c)))phases.add('occluded-search');
  if(a.phase==='investigate'&&a.lastHeard&&Math.hypot(a.lastHeard.x-THEATRE_PROJECTOR.position.x,a.lastHeard.z-THEATRE_PROJECTOR.position.z)<.001)phases.add('projector-investigation');
}
/** All walking uses the real controller, camera and static/dynamic collisions.
 * Only native presentation/audio players are mocked; actual WebGL is separate. */
function walk(c:RuntimeController,camera:THREE.PerspectiveCamera,x:number,z:number,phases:Set<string>) {
  for(let frame=0;frame<1800;frame++){
    const p=c.runtime.pose.position,d=Math.hypot(x-p.x,z-p.z);if(d<.02||c.runtime.progress.cleared){c.input.forward=0;return;}
    lookAt(c,camera,{x,y:p.y,z});c.input.forward=1;const before=c.runtime.pose.position;advanceController(c,Math.min(1/60,d/MOVE_SPEED),camera);track(c,phases);
    const after=c.runtime.pose.position;if(Math.hypot(after.x-before.x,after.z-before.z)>MOVE_SPEED/60+.001)throw new Error('Caught from '+JSON.stringify(before)+' while heading to '+x+','+z);
  }
  throw new Error('Blocked '+JSON.stringify(c.runtime.pose.position)+' heading to '+x+','+z+' actor '+JSON.stringify({phase:c.runtime.theatre!.actor.phase,position:c.runtime.theatre!.actor.motion.position}));
}
function wait(c:RuntimeController,camera:THREE.PerspectiveCamera,seconds:number,phases:Set<string>) {
  c.input.forward=0;const p=c.runtime.pose;for(let i=0;i<seconds*60;i++){advanceController(c,1/60,camera);track(c,phases);expect(c.runtime.pose).toEqual(p);}
}
function point(c:RuntimeController,kind:'light'|'projector',x:number,y:number) {
  const f=kind==='light'?THEATRE_LIGHT_FIXTURE:THEATRE_PROJECTOR_FIXTURE,n=f.normal,r=f.right,u={x:n.y*r.z-n.z*r.y,y:n.z*r.x-n.x*r.z,z:n.x*r.y-n.y*r.x};
  const p=projectWithCamera({x:f.center.x+r.x*x+u.x*y,y:f.center.y+r.y*x+u.y*y,z:f.center.z+r.z*x+u.z*y},c.matrices!);expect(p).toBeDefined();return{x:(p!.x+1)*WIDTH/2,y:(1-p!.y)*HEIGHT/2};
}
function solve(c:RuntimeController,camera:THREE.PerspectiveCamera) {
  lookAt(c,camera,THEATRE_LIGHT_FIXTURE.center);expect(theatreDeviceAcquisition(c,'light').kind).toBe('ready');expect(interactController(c,'theatre-light')).toBe(true);
  expect(theatreAction(c,{type:'commit-light'})).toBe(true);expect(c.runtime.progress.theatre!.light.accepted).toBe(false);
  const start=point(c,'light',0,0),end=point(c,'light',lightHandlePoint(.8).x,0);
  expect(theatrePointer(c,'start',17,start,WIDTH,HEIGHT)).toBe(true);expect(theatrePointer(c,'move',17,end,WIDTH,HEIGHT)).toBe(true);expect(c.runtime.progress.theatre!.light.rail).toBe(0);
  expect(theatrePointer(c,'cancel',17,end,WIDTH,HEIGHT)).toBe(true);expect(c.runtime.theatre!.rail).toBe(0);
  expect(theatrePointer(c,'start',18,start,WIDTH,HEIGHT)).toBe(true);expect(theatrePointer(c,'move',18,end,WIDTH,HEIGHT)).toBe(true);expect(theatreAction(c,{type:'commit-light'})).toBe(false);
  expect(theatrePointer(c,'end',18,end,WIDTH,HEIGHT)).toBe(true);expect(theatreAction(c,{type:'commit-light'})).toBe(true);expect(c.runtime.progress.theatre!.light.accepted).toBe(true);expect(c.runtime.progress.cleared).toBe(false);expect(theatreAction(c,{type:'leave'})).toBe(true);
}
function crank(c:RuntimeController,camera:THREE.PerspectiveCamera) {
  lookAt(c,camera,THEATRE_PROJECTOR_FIXTURE.center);expect(theatreDeviceAcquisition(c,'projector').kind).toBe('ready');expect(interactController(c,'theatre-projector')).toBe(true);expect(c.runtime.theatre!.mode).toBe('explore');
  const r=THEATRE_PROJECTOR.crankRadius,start=point(c,'projector',r,0);expect(theatrePointer(c,'start',29,start,WIDTH,HEIGHT)).toBe(true);
  for(const angle of [.7,1.4,2.1,2.8])expect(theatrePointer(c,'move',29,point(c,'projector',r*Math.cos(angle),r*Math.sin(angle)),WIDTH,HEIGHT)).toBe(true);
  expect(c.runtime.theatre!.projectorSeconds).toBe(0);expect(theatrePointer(c,'end',29,point(c,'projector',r*Math.cos(2.8),r*Math.sin(2.8)),WIDTH,HEIGHT)).toBe(true);
  expect(c.input.releaseBarrier).toContain(29);endPointer(c.input,29);expect(c.input.releaseBarrier).toEqual([]);
  expect(c.runtime.theatre!.projectorSeconds).toBe(5);expect(c.runtime.theatre!.projectorNoise!.position).toEqual(THEATRE_PROJECTOR.position);expect(c.runtime.theatre!.projectorArmed).toBe(false);expect(interactController(c,'theatre-projector')).toBe(false);
}
describe('theatre full routes through shared controller and actual world',()=>{
  it('a naturally reached hidden safe bay decoy changes the same-start actor evidence and gives an actual alternate exit',()=>{
    const run=setup('standard',true),{controller:c,camera}=run,phases=new Set<string>();solve(c,camera);
    for(const[x,z]of[[2,-2],[2,3],[2,4.6],[-2.6,6],[-2.6,10.5],[-2.6,14.75],[-5.37,14.75],[-5.37,14.38]])walk(c,camera,x!,z!,phases);
    c.input.forward=0;
    const candidate={sequence:c.runtime.theatre!.noiseSequence+1,position:{...THEATRE_PROJECTOR.position},strength:THEATRE_PROJECTOR.strength,kind:'projector' as const};
    let heard=false;for(let i=0;i<45*60;i++){
      if(c.runtime.theatre!.actor.phase==='patrol'&&!theatreActorCanSeePlayer(c.runtime)&&theatreNoiseAudibility(c.runtime.theatre!.actor,candidate,worldForController(c))>=THEATRE_AI.noiseThreshold){heard=true;break;}
      advanceController(c,1/60,camera);track(c,phases);
    }
    expect(heard).toBe(true);lookAt(c,camera,THEATRE_PROJECTOR_FIXTURE.center);const before=c.runtime;
    // The contrast starts from the same naturally reached runtime and actor
    // memory, not a relocated enemy; each branch owns its own native session.
    const baseline=setup('standard',true),session=baseline.controller.runtime.session;
    baseline.controller.runtime={...before,session,theatre:{...before.theatre!,sessionId:String(session)}};syncCamera(baseline.controller,baseline.camera);
    advanceController(baseline.controller,1/60,baseline.camera);expect(baseline.controller.runtime.theatre!.actor.phase).toBe('patrol');expect(baseline.controller.runtime.theatre!.actor.lastHeard).not.toEqual(THEATRE_PROJECTOR.position);baseline.lifecycle.close();
    crank(c,camera);advanceController(c,1/60,camera);track(c,phases);
    expect(c.runtime.theatre!.actor.phase).toBe('investigate');expect(c.runtime.theatre!.actor.lastHeard).toEqual(THEATRE_PROJECTOR.position);expect(c.runtime.pose).toEqual(before.pose);
    wait(c,camera,3.5,phases);
    for(const[x,z]of[[-4.55,14.38],[-4.55,14.75],[-2.6,14.75],[0,14.75],[2.55,16.7],[0,17.4],[0,19.6],[0,21.3]])walk(c,camera,x!,z!,phases);
    expect(phases.has('projector-investigation')).toBe(true);lookAt(c,camera,THEATRE_CURTAIN_FIXTURE.center);expect(interactController(c,'theatre-curtain')).toBe(true);wait(c,camera,1.1,phases);walk(c,camera,0,23.6,phases);expect(c.runtime.progress.cleared).toBe(true);run.lifecycle.close();
  });
  it('an actual telegraphed capture preserves puzzle progress, requires finger release, and permits an east-lane retry',()=>{
    const run=setup('standard',false),{controller:c,camera}=run,phases=new Set<string>();solve(c,camera);
    for(const[x,z]of[[2,-2],[2,3],[2,4.6],[-2.6,6],[-2.6,10.5],[-2.6,14.75]])walk(c,camera,x!,z!,phases);
    c.input.forward=0;beginStick(c.input,77,80,700);const saved=JSON.stringify(c.runtime.progress.theatre!.light);let caught=false;
    for(let i=0;i<45*60;i++){
      advanceController(c,1/60,camera);track(c,phases);
      if(c.runtime.pose.position.z<0){caught=true;break;}
    }
    expect(caught).toBe(true);expect([...phases]).toEqual(expect.arrayContaining(['notice','pursue','windup','attack','recover']));expect(c.runtime.pose).toEqual(THEATRE_CHECKPOINTS.entry);expect(JSON.stringify(c.runtime.progress.theatre!.light)).toBe(saved);expect(c.runtime.theatre!.actor.startupGrace).toBeGreaterThan(2.9);
    expect(c.input.releaseBarrier).toContain(77);const yaw=c.runtime.pose.yaw;commandController(c,{type:'turn',yaw:.2,pitch:0});expect(c.runtime.pose.yaw).toBe(yaw);endPointer(c.input,77);
    for(const[x,z]of[[2,-2],[2,3],[2,4.6],[2.9,5.5],[2.9,7.6],[2.55,13.8],[2.55,16.7],[0,17.4],[0,19.6],[0,21.3]])walk(c,camera,x!,z!,phases);
    lookAt(c,camera,THEATRE_CURTAIN_FIXTURE.center);expect(interactController(c,'theatre-curtain')).toBe(true);wait(c,camera,1.1,phases);walk(c,camera,0,23.6,phases);expect(c.runtime.progress.cleared).toBe(true);run.lifecycle.close();
  });
  it.each([
    [false,false,'standard',false,false], [true,true,'standard',false,false], [true,false,'standard',true,false],
    [false,true,'standard',true,false], [false,false,'subdued',false,false], [true,true,'subdued',true,true],
  ] as const)('completes inspect=%s decoy=%s intensity=%s muted=%s cold=%s',(inspect,decoy,intensity,muted,cold)=>{
    let run=setup(intensity,muted),{controller:c,camera}=run;const phases=new Set<string>();
    expect(worldForController(c).interactables.map(t=>t.id)).not.toEqual(expect.arrayContaining(['emblem-panel','key','vault-length','wiring-panel']));
    solve(c,camera);walk(c,camera,2,-2,phases);walk(c,camera,2,3,phases);walk(c,camera,2,4.6,phases);
    expect(c.runtime.progress.theatre!.story.crossingStarted).toBe(true);expect(c.runtime.progress.theatre!.discoveries.depth).toBe(false);
    if(inspect){
      for(const [x,z]of[[0,5.2],[-2.7,5.9],[-3.6,7]])walk(c,camera,x!,z!,phases);
      lookAt(c,camera,THEATRE_INSPECTION_FIXTURE.center);expect(interactController(c,'theatre-inspection')).toBe(true);expect(c.runtime.progress.theatre!.discoveries.depth).toBe(false);
      walk(c,camera,-4.7,9.45,phases);walk(c,camera,-11.45,10.3,phases);lookAt(c,camera,THEATRE_AMES_SIDE_FIXTURE.center);expect(interactController(c,'theatre-ames-side')).toBe(true);
      walk(c,camera,-5.2,9.6,phases);lookAt(c,camera,THEATRE_BYPASS_FIXTURE.center);expect(interactController(c,'theatre-bypass')).toBe(true);walk(c,camera,-5.2,11.1,phases);walk(c,camera,-5.2,14.38,phases);
    } else if(decoy){
      for(const [x,z]of[[-2.6,6],[-2.6,10.5],[-2.6,14.75],[-5.37,14.75],[-5.37,14.38]])walk(c,camera,x!,z!,phases);
    } else for(const [x,z]of[[2.9,5.5],[2.9,7.6],[2.55,13.8],[2.55,16.7]])walk(c,camera,x!,z!,phases);
    if(inspect||decoy){
      walk(c,camera,THEATRE_CHECKPOINTS.projector.position.x,THEATRE_CHECKPOINTS.projector.position.z,phases);expect(c.runtime.theatre!.checkpointId).toBe('projector');
      if(cold){const cp=restoreTheatreCheckpoint(createCheckpoint(c.runtime))!.checkpoint;run.lifecycle.close();run=setup(intensity,muted,cp);c=run.controller;camera=run.camera;expect(c.runtime.theatre!.actor.startupGrace).toBe(3);}
      if(decoy){crank(c,camera);wait(c,camera,2,phases);}
      for(const[x,z]of[[-4.55,14.38],[-4.55,14.75],[-2.6,14.75],[0,14.75],[2.55,16.7]])walk(c,camera,x!,z!,phases);
    }
    for(const[x,z]of[[0,17.4],[0,19.6],[0,21.3]])walk(c,camera,x!,z!,phases);
    expect(c.runtime.progress.cleared).toBe(false);expect(c.runtime.theatre!.checkpointId).toBe('booth');expect(interactController(c,'theatre-curtain')).toBe(false);
    lookAt(c,camera,THEATRE_CURTAIN_FIXTURE.center);expect(interactController(c,'theatre-curtain')).toBe(true);expect(c.runtime.progress.theatre!.curtainAccepted).toBe(true);expect(c.runtime.progress.cleared).toBe(false);expect(c.runtime.progress.theatre!.passageSealed).toBe(false);
    const closing=restoreTheatreCheckpoint(createCheckpoint(c.runtime))!.checkpoint,coldClosing=createController(closing);expect(coldClosing.runtime.progress.cleared).toBe(false);expect(worldForController(coldClosing).solids.find(s=>s.id==='theatre-fire-curtain')!.min.y).toBe(0);
    wait(c,camera,1.1,phases);expect(c.runtime.progress.theatre!.passageSealed).toBe(true);expect(c.runtime.progress.cleared).toBe(false);walk(c,camera,0,23.6,phases);
    expect(c.runtime.progress).toMatchObject({sealA:false,sealB:false,variant:'entrance',cleared:true});expect(c.runtime.progress.theatre!.discoveries.depth).toBe(inspect);expect(c.runtime.progress.theatre!.bypassOpen).toBe(inspect);expect(c.runtime.progress.theatre!.story.projectorUsed).toBe(decoy);
    const cp=restoreTheatreCheckpoint(createCheckpoint(c.runtime))!.checkpoint;expect(createController(cp).runtime.progress.cleared).toBe(true);expect(createController(undefined,false,true,THEATRE_CHAPTER_ID).runtime.progress.theatre!.light.accepted).toBe(false);
    if(intensity==='subdued')expect([...phases].some(p=>['notice','pursue','attack'].includes(p))).toBe(false);
    run.lifecycle.close();expect(run.renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
