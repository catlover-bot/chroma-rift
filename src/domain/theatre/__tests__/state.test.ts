import { createTheatreRuntime } from '../runtime';
import { advanceTheatre,applyTheatreCommand,cancelTheatreManipulation,canLowerTheatreCurtain } from '../state';
import { THEATRE_CHECKPOINTS,THEATRE_PROJECTOR } from '../definition';
import { LIGHT_SPEC,lightHandlePoint } from '../lightGate';
import { createTheatreCheckpoint,parseTheatreProgress,restoreTheatreCheckpoint } from '../checkpoint';
import { pauseRuntime,resumeRuntime,setHintStage } from '../../firstPerson/runtime';
import { createCheckpoint } from '../../firstPerson/checkpoint';
import type { ChapterRuntime } from '../../firstPerson/types';
import type { TheatreAction } from '../types';
const context={rendererReady:true,foreground:true,targetId:'theatre-light'};
function command(r:ChapterRuntime,action:TheatreAction,target='theatre-light') {return applyTheatreCommand(r,{sessionId:r.theatre!.sessionId,seq:r.theatre!.lastSeq+1,nowMs:r.theatre!.lastNowMs+1,action},{...context,targetId:target});}
function opened() {let r=command(createTheatreRuntime(),{type:'enter-light'}).runtime;for(let i=0;i<4;i++)r=command(r,{type:'adjust-light',delta:.2}).runtime;r=command(r,{type:'commit-light'}).runtime;return command(r,{type:'leave'}).runtime;}
function tick(r:ChapterRuntime,seconds:number){for(let i=0;i<Math.ceil(seconds*60);i++)r=advanceTheatre(r,1/60);return r;}
describe('theatre semantic state and cold save',()=>{
  test('viewing, aids and a wrong committed light never unlock or alter unrelated host flags',()=>{
    let r=createTheatreRuntime();r=tick(r,10);expect(r.progress.theatre!.light.accepted).toBe(false);
    r=command(r,{type:'enter-light'}).runtime;r=setHintStage(r,3);r=command(r,{type:'commit-light'}).runtime;
    expect(r.progress.theatre!.light).toEqual({rail:0,accepted:false,attempts:1});expect(r.progress.sealA).toBe(false);expect(r.progress.sealB).toBe(false);expect(r.progress.variant).toBe('entrance');expect(r.progress.cleared).toBe(false);
  });
  test('light manipulation holds preview outside saved state until pointer release; cancellation rolls back',()=>{
    let r=command(createTheatreRuntime(),{type:'enter-light'}).runtime;
    r=command(r,{type:'drag-start',kind:'light',pointerId:4,point:lightHandlePoint(0)}).runtime;
    r=command(r,{type:'drag-move',pointerId:4,point:{x:-.8*LIGHT_SPEC.railHalfLength,y:0}}).runtime;
    expect(r.theatre!.rail).toBeCloseTo(.8);expect(r.progress.theatre!.light.rail).toBe(0);expect(command(r,{type:'commit-light'}).accepted).toBe(false);
    expect(cancelTheatreManipulation(r).theatre!.rail).toBe(0);
    r=command(r,{type:'drag-end',pointerId:4,inside:true}).runtime;expect(r.progress.theatre!.light.rail).toBeCloseTo(.8);
    r=command(r,{type:'commit-light'}).runtime;expect(r.progress.theatre!.light.accepted).toBe(true);expect(r.progress.cleared).toBe(false);
  });
  test('stale session, replay sequence and failed/background commands cannot generate progress or noise',()=>{
    const r=opened(),action={type:'enter-projector' as const},c={sessionId:r.theatre!.sessionId,seq:r.theatre!.lastSeq+1,nowMs:r.theatre!.lastNowMs+1,action};
    expect(applyTheatreCommand(r,{...c,sessionId:'old'},{...context,targetId:'theatre-projector'}).runtime).toBe(r);
    const accepted=applyTheatreCommand(r,c,{...context,targetId:'theatre-projector'}).runtime;
    expect(applyTheatreCommand(accepted,c,{...context,targetId:'theatre-projector'}).accepted).toBe(false);
    for(const blocked of [{rendererReady:false,foreground:true},{rendererReady:true,foreground:false}]){
      const next=applyTheatreCommand(r,c,{...blocked,targetId:'theatre-projector'});expect(next.accepted).toBe(false);expect(next.runtime.theatre!.projectorNoise).toBeUndefined();
    }
  });
  test('inspection, opening bypass and discovery are separate optional accepted actions',()=>{
    let r=opened();expect(r.progress.theatre!.discoveries.depth).toBe(false);
    expect(command(r,{type:'open-bypass'},'theatre-bypass').accepted).toBe(false);
    r=command(r,{type:'open-inspection'},'theatre-inspection').runtime;expect(r.progress.theatre!.discoveries.depth).toBe(false);
    r=command(r,{type:'open-bypass'},'theatre-bypass').runtime;expect(r.progress.theatre!.bypassOpen).toBe(true);expect(r.progress.theatre!.discoveries.depth).toBe(false);
    r=command(r,{type:'inspect-depth'},'theatre-ames-side').runtime;expect(r.progress.theatre!.discoveries.depth).toBe(true);
  });
  test('the actual crank handle alone acquires; off-center grab has no angular jump and canceled crank is silent',()=>{
    let r=command(opened(),{type:'enter-projector'},'theatre-projector').runtime;
    expect(r.theatre!.mode).toBe('explore');expect(r.theatre!.projectorArmed).toBe(true);
    expect(command(r,{type:'drag-start',kind:'projector',pointerId:2,point:{x:-THEATRE_PROJECTOR.crankRadius,y:0}},'theatre-projector').accepted).toBe(false);
    r=command(r,{type:'drag-start',kind:'projector',pointerId:2,point:{x:THEATRE_PROJECTOR.crankRadius,y:.06}},'theatre-projector').runtime;
    expect(r.theatre!.projectorAngle).toBe(0);
    r=command(r,{type:'drag-move',pointerId:2,point:{x:0,y:.23}},'theatre-projector').runtime;expect(r.theatre!.projectorAngle).toBeGreaterThan(1);
    const stopped=cancelTheatreManipulation(r);expect(stopped.theatre!.projectorAngle).toBe(0);expect(stopped.theatre!.projectorArmed).toBe(false);expect(stopped.theatre!.projectorNoise).toBeUndefined();expect(stopped.progress.theatre!.story.projectorUsed).toBe(false);
  });
  test('bounded accessible turns use the same travel threshold and motor emitter; cooldown is finite',()=>{
    let r=command(opened(),{type:'enter-projector'},'theatre-projector').runtime;
    r=command(r,{type:'crank-step',delta:Math.PI/2},'theatre-projector').runtime;expect(r.theatre!.projectorNoise).toBeUndefined();
    r=command(r,{type:'crank-step',delta:Math.PI/2},'theatre-projector').runtime;
    expect(r.theatre!.projectorNoise!.position).toEqual(THEATRE_PROJECTOR.position);expect(r.theatre!.projectorSeconds).toBe(5);expect(r.theatre!.projectorArmed).toBe(false);expect(r.theatre!.mode).toBe('explore');
    expect(command(r,{type:'enter-projector'},'theatre-projector').accepted).toBe(false);
    const immutable=JSON.stringify(r);r=tick(r,6.3);expect(JSON.stringify(r)).not.toEqual(immutable);expect(r.theatre!.projectorCooldown).toBe(0);expect(command(r,{type:'enter-projector'},'theatre-projector').accepted).toBe(true);
  });
  test('curtain acceptance saves immediately but only physical closure then an exit walk completes',()=>{
    let r=opened();r={...r,pose:THEATRE_CHECKPOINTS.booth};expect(canLowerTheatreCurtain(r)).toBe(true);
    r=command(r,{type:'lower-curtain'},'theatre-curtain').runtime;
    expect(r.progress.theatre!.curtainAccepted).toBe(true);expect(r.progress.theatre!.passageSealed).toBe(false);expect(r.progress.cleared).toBe(false);expect(createCheckpoint(r).progress.theatre!.curtainAccepted).toBe(true);
    r=tick(r,1.1);expect(r.theatre!.curtainOpenness).toBe(0);expect(r.progress.theatre!.passageSealed).toBe(true);expect(r.progress.cleared).toBe(false);
    r=advanceTheatre({...r,pose:THEATRE_CHECKPOINTS.exit},1/60);expect(r.progress.cleared).toBe(true);expect(r.progress.theatre!.completed).toBe(true);
  });
  test('curtain cannot crush a body in the swept volume and cannot be operated from the threat side',()=>{
    const r=opened();expect(canLowerTheatreCurtain(r)).toBe(false);
    const blocked={...r,pose:THEATRE_CHECKPOINTS.booth,theatre:{...r.theatre!,actor:{...r.theatre!.actor,motion:{...r.theatre!.actor.motion,position:{x:0,y:0,z:18.9}}}}};
    expect(command(blocked,{type:'lower-curtain'},'theatre-curtain').accepted).toBe(false);
  });
  test('cold resume completes an accepted closure safely without awarding a walk or optional discoveries',()=>{
    let r=opened();r={...r,pose:THEATRE_CHECKPOINTS.booth};r=command(r,{type:'lower-curtain'},'theatre-curtain').runtime;
    const cp=createTheatreCheckpoint(r),restored=restoreTheatreCheckpoint(JSON.parse(JSON.stringify(cp)))!;
    expect(restored.recovered).toBe(false);const cold=createTheatreRuntime(restored.checkpoint);
    expect(cold.pose).toEqual(THEATRE_CHECKPOINTS.booth);expect(cold.progress.theatre!.passageSealed).toBe(true);expect(cold.theatre!.curtainOpenness).toBe(0);expect(cold.progress.cleared).toBe(false);expect(cold.progress.theatre!.discoveries.depth).toBe(false);
    expect(cold.theatre!.actor.startupGrace).toBe(3);
  });
  test('strict future/corrupt progress rejects and a bad pose recovers only to earned safe space',()=>{
    const cp=createTheatreCheckpoint(opened()),p=cp.progress.theatre!;
    for(const invalid of [{...p,specVersion:2},{...p,light:{...p.light,rail:0}},{...p,bypassOpen:true},{...p,completed:true},{...p,discoveries:{...p.discoveries,depth:'yes'}}])expect(parseTheatreProgress(invalid)).toBeUndefined();
    expect(restoreTheatreCheckpoint({...cp,levelVersion:2})).toBeUndefined();
    const bad=restoreTheatreCheckpoint({...cp,pose:{position:{x:NaN,y:1.6,z:23.6},yaw:0,pitch:0}})!;expect(bad.recovered).toBe(true);expect(bad.checkpoint.pose).toEqual(THEATRE_CHECKPOINTS.entry);
    const raw=JSON.stringify(cp);expect(raw).not.toMatch(/activeDrag|lastSeen|motion|projectorSeconds/);
  });
  test('same-session pause cancels manipulation but preserves the same actor memory and timers',()=>{
    let r=command(opened(),{type:'enter-projector'},'theatre-projector').runtime;
    const actor={...r.theatre!.actor,phase:'search' as const,phaseTime:1.2,lastSeen:{x:2,y:1.6,z:10},startupGrace:.4};r={...r,theatre:{...r.theatre!,actor}};
    const paused=pauseRuntime(r);expect(paused.theatre!.projectorArmed).toBe(false);expect(paused.theatre!.actor).toBe(actor);
    expect(advanceTheatre(paused,10)).toBe(paused);expect(resumeRuntime(paused).theatre!.actor).toBe(actor);
  });
});
