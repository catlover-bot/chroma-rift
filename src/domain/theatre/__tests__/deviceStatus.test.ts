import type { ChapterRuntime, PlayerPose, Vec3 } from '../../firstPerson/types';
import { createCheckpoint } from '../../firstPerson/checkpoint';
import { evaluateInteraction } from '../../firstPerson/interaction';
import { THEATRE_BYPASS_FIXTURE, THEATRE_CHECKPOINTS, THEATRE_CURTAIN_FIXTURE, THEATRE_INSPECTION_FIXTURE, THEATRE_PROJECTOR } from '../definition';
import { theatreLightStatus, theatreProjectorStatus } from '../deviceStatus';
import { evaluateLight, lightHandlePoint } from '../lightGate';
import { createTheatreRuntime } from '../runtime';
import { advanceTheatre, applyTheatreCommand } from '../state';
import { getTheatreWorld } from '../world';
import type { TheatreAction } from '../types';

function command(runtime: ChapterRuntime, action: TheatreAction, targetId = 'theatre-light') {
  const live = runtime.theatre!;
  return applyTheatreCommand(runtime, { sessionId: live.sessionId, seq: live.lastSeq + 1, nowMs: live.lastNowMs + 1, action }, { rendererReady: true, foreground: true, targetId });
}
function tick(runtime: ChapterRuntime, seconds: number) {
  for (let i = 0; i < Math.round(seconds * 60); i++) runtime = advanceTheatre(runtime, 1 / 60);
  return runtime;
}
function opened() {
  let runtime = command(createTheatreRuntime(), { type: 'enter-light' }).runtime;
  for (let i = 0; i < 4; i++) runtime = command(runtime, { type: 'adjust-light', delta: .2 }).runtime;
  runtime = command(runtime, { type: 'commit-light' }).runtime;
  return command(runtime, { type: 'leave' }).runtime;
}
function aim(runtime: ChapterRuntime, position: Vec3, target: Vec3): ChapterRuntime {
  const dx = target.x - position.x, dz = target.z - position.z;
  const pose: PlayerPose = { position, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(target.y - position.y, Math.hypot(dx, dz)) };
  return { ...runtime, pose };
}
function label(runtime: ChapterRuntime, id: string) { return getTheatreWorld(runtime).interactables.find(target => target.id === id)!.label; }

describe('theatre device status follows actual progress and released operations', () => {
  test.each([[0, 0, ['影', '影']], [.3, 1, ['光', '影']], [.8, 2, ['光', '光']]] as const)(
    'rail %s reports %s lit windows from unchanged optical areas', (rail, count, states) => {
      const initial = createTheatreRuntime(), runtime = { ...initial, theatre: { ...initial.theatre!, rail } };
      const before = JSON.stringify(runtime), optical = evaluateLight(rail), status = theatreLightStatus(runtime);
      expect(status.optical).toBe(optical); expect(status.count).toBe(count);
      expect(status.windows.map(window => [window.id, window.number])).toEqual([['left', 1], ['right', 2]]);
      expect(status.windows.map(window => window.state)).toEqual(states);
      status.windows.forEach(window => expect(window.lit).toBe(optical.windows.find(source => source.id === window.id)!.lit));
      expect(JSON.stringify(runtime)).toBe(before);
    },
  );
  test('lit preview still requires release and explicit fixed-light acceptance', () => {
    let runtime = command(createTheatreRuntime(), { type: 'enter-light' }).runtime;
    runtime = command(runtime, { type: 'drag-start', kind: 'light', pointerId: 1, point: lightHandlePoint(0) }).runtime;
    runtime = command(runtime, { type: 'drag-move', pointerId: 1, point: lightHandlePoint(.8) }).runtime;
    expect(theatreLightStatus(runtime)).toMatchObject({ count: 2, released: false, canCommit: false });
    expect(theatreLightStatus(runtime).instruction).toContain('指を離して');
    expect(command(runtime, { type: 'commit-light' }).accepted).toBe(false);
    expect(createCheckpoint(runtime).progress.theatre!.light.rail).toBe(0);
    runtime = command(runtime, { type: 'drag-end', pointerId: 1, inside: true }).runtime;
    expect(theatreLightStatus(runtime)).toMatchObject({ count: 2, released: true, canCommit: true, showDragCue: false });
    expect(runtime.progress.theatre!.light.accepted).toBe(false);
    const worldBefore = getTheatreWorld(runtime);
    runtime = command(runtime, { type: 'commit-light' }).runtime;
    expect(runtime.progress.theatre!.light.accepted).toBe(true);
    expect(getTheatreWorld(runtime)).not.toBe(worldBefore);
    expect(getTheatreWorld(runtime).solids).toEqual(worldBefore.solids); // Accepted before any gate animation.
    expect(label(runtime, 'theatre-light')).toContain('任意');
  });
  test('only a moved, inside-released drag dismisses the first-use cue; taps, cancel, time and accessible steps do not', () => {
    let runtime = command(createTheatreRuntime(), { type: 'enter-light' }).runtime;
    runtime = tick(runtime, 5); expect(theatreLightStatus(runtime).showDragCue).toBe(true);
    runtime = command(runtime, { type: 'drag-start', kind: 'light', pointerId: 2, point: lightHandlePoint(0) }).runtime;
    runtime = command(runtime, { type: 'drag-end', pointerId: 2, inside: true }).runtime;
    runtime = command(runtime, { type: 'adjust-light', delta: .1 }).runtime;
    expect(theatreLightStatus(runtime).showDragCue).toBe(true);
    for (const end of ['cancel', 'outside'] as const) {
      runtime = command(runtime, { type: 'drag-start', kind: 'light', pointerId: 3, point: lightHandlePoint(.1) }).runtime;
      runtime = command(runtime, { type: 'drag-move', pointerId: 3, point: lightHandlePoint(.8) }).runtime;
      runtime = command(runtime, end === 'cancel' ? { type: 'cancel' } : { type: 'drag-end', pointerId: 3, inside: false }).runtime;
      expect(runtime.theatre!.rail).toBeCloseTo(.1); expect(theatreLightStatus(runtime).showDragCue).toBe(true);
    }
    runtime = command(runtime, { type: 'drag-start', kind: 'light', pointerId: 4, point: lightHandlePoint(.1) }).runtime;
    runtime = command(runtime, { type: 'drag-move', pointerId: 4, point: lightHandlePoint(.3) }).runtime;
    runtime = command(runtime, { type: 'drag-end', pointerId: 4, inside: true }).runtime;
    expect(theatreLightStatus(runtime).showDragCue).toBe(false);
    const checkpoint = createCheckpoint(runtime);
    expect(JSON.stringify(checkpoint)).not.toContain('lightDragCompleted');
    expect(theatreLightStatus(createTheatreRuntime(checkpoint)).showDragCue).toBe(true);
  });
  test('fixed light remains optional inspection and cannot change a solved gate or saved rail', () => {
    let runtime = tick(opened(), 1);
    const saved = JSON.stringify(runtime.progress.theatre!.light), gate = runtime.theatre!.lightGateOpen;
    runtime = command(runtime, { type: 'enter-light' }).runtime;
    expect(theatreLightStatus(runtime)).toMatchObject({ canCommit: false, showDragCue: false });
    expect(theatreLightStatus(runtime).instruction).toContain('固定済み');
    for (const action of [{ type: 'adjust-light', delta: -.2 }, { type: 'commit-light' }, { type: 'drag-start', kind: 'light', pointerId: 8, point: lightHandlePoint(.8) }] as TheatreAction[]) {
      const result = command(runtime, action); expect(result.accepted).toBe(false); runtime = result.runtime;
    }
    expect(JSON.stringify(runtime.progress.theatre!.light)).toBe(saved); expect(runtime.theatre!.lightGateOpen).toBe(gate);
    const cold = createTheatreRuntime(createCheckpoint(runtime));
    expect(label(cold, 'theatre-light')).toContain('任意'); expect(theatreLightStatus(cold).canCommit).toBe(false);
  });
  test('open inspection and maintenance remain status cues while depth reinspection stays available', () => {
    let runtime = aim(opened(), { x: -3.6, y: 1.6, z: 7 }, THEATRE_INSPECTION_FIXTURE.center);
    expect(evaluateInteraction(getTheatreWorld(runtime), runtime.pose, runtime.progress).kind).toBe('ready');
    runtime = command(runtime, { type: 'open-inspection' }, 'theatre-inspection').runtime;
    const inspectionCue = evaluateInteraction(getTheatreWorld(runtime), runtime.pose, runtime.progress);
    expect(inspectionCue).toMatchObject({ kind: 'locked', actionLabel: '点検窓は開放済み' });
    expect(command(runtime, { type: 'open-inspection' }, 'theatre-inspection').accepted).toBe(false);
    runtime = aim(runtime, { x: -5.2, y: 1.6, z: 9.6 }, THEATRE_BYPASS_FIXTURE.center);
    expect(evaluateInteraction(getTheatreWorld(runtime), runtime.pose, runtime.progress).kind).toBe('ready');
    runtime = command(runtime, { type: 'open-bypass' }, 'theatre-bypass').runtime;
    expect(evaluateInteraction(getTheatreWorld(runtime), runtime.pose, runtime.progress)).toMatchObject({ kind: 'locked', actionLabel: '保守通路は開通済み' });
    const saved = JSON.stringify(runtime.progress);
    const repeated = command(runtime, { type: 'open-bypass' }, 'theatre-bypass');
    expect(repeated.accepted).toBe(false); expect(JSON.stringify(repeated.runtime.progress)).toBe(saved);
    expect(runtime.progress.theatre!.discoveries.depth).toBe(false);
    expect(getTheatreWorld(runtime).interactables.some(target => target.id === 'theatre-ames-side')).toBe(true);
    runtime = command(runtime, { type: 'inspect-depth' }, 'theatre-ames-side').runtime;
    const again = command(runtime, { type: 'inspect-depth' }, 'theatre-ames-side');
    expect(again.accepted).toBe(true); expect(again.runtime.progress).toEqual(runtime.progress);
    const cold = createTheatreRuntime(createCheckpoint(runtime));
    expect(label(cold, 'theatre-bypass')).toBe('保守通路は開通済み');
    expect(label(cold, 'theatre-inspection')).toBe('点検窓は開放済み');
  });
  test('curtain labels change at acceptance before geometry moves, then reflect physical closure and cold reconstruction', () => {
    let runtime = aim(opened(), THEATRE_CHECKPOINTS.booth.position, THEATRE_CURTAIN_FIXTURE.center);
    const world = getTheatreWorld(runtime);
    runtime = command(runtime, { type: 'lower-curtain' }, 'theatre-curtain').runtime;
    expect(getTheatreWorld(runtime)).not.toBe(world); expect(getTheatreWorld(runtime).solids).toEqual(world.solids);
    expect(evaluateInteraction(getTheatreWorld(runtime), runtime.pose, runtime.progress)).toMatchObject({ kind: 'locked', actionLabel: '防火幕を下ろしています' });
    expect(command(runtime, { type: 'lower-curtain' }, 'theatre-curtain').accepted).toBe(false);
    const cold = createTheatreRuntime(createCheckpoint(runtime)); expect(label(cold, 'theatre-curtain')).toBe('防火幕は閉鎖済み');
    runtime = tick(runtime, 1.1); expect(label(runtime, 'theatre-curtain')).toBe('防火幕は閉鎖済み');
    expect(runtime.progress.cleared).toBe(false); expect(cold.progress.cleared).toBe(false);
  });
  test('duplicate arm cannot discard actual crank travel, and accepted motor/noise has explicit finite display phases', () => {
    let runtime = opened(); expect(theatreProjectorStatus(runtime)).toMatchObject({ phase: 'idle', available: true });
    runtime = command(runtime, { type: 'enter-projector' }, 'theatre-projector').runtime;
    expect(theatreProjectorStatus(runtime)).toMatchObject({ phase: 'armed', available: false });
    runtime = command(runtime, { type: 'crank-step', delta: Math.PI / 2 }, 'theatre-projector').runtime;
    const repeated = command(runtime, { type: 'enter-projector' }, 'theatre-projector');
    expect(repeated.accepted).toBe(false); expect(repeated.runtime.theatre!.projectorCrankTravel).toBe(Math.PI / 2);
    runtime = command(repeated.runtime, { type: 'crank-step', delta: Math.PI / 2 }, 'theatre-projector').runtime;
    expect(theatreProjectorStatus(runtime)).toMatchObject({ phase: 'starting', available: false, seconds: 5 });
    expect(runtime.theatre!.projectorNoise!.position).toEqual(THEATRE_PROJECTOR.position);
    expect(runtime.theatre!.projectorSeconds).toBe(5); expect(runtime.theatre!.projectorCooldown).toBe(6.2);
    expect(command(runtime, { type: 'enter-projector' }, 'theatre-projector').accepted).toBe(false);
    runtime = tick(runtime, .9); expect(theatreProjectorStatus(runtime).phase).toBe('running');
    const cold = createTheatreRuntime(createCheckpoint(runtime));
    expect(theatreProjectorStatus(cold)).toMatchObject({ phase: 'idle', available: true });
    expect(cold.theatre!.projectorNoise).toBeUndefined(); expect(cold.progress.theatre!.story.projectorUsed).toBe(true);
    runtime = tick(runtime, 4.2); expect(theatreProjectorStatus(runtime)).toMatchObject({ phase: 'cooldown', available: false, seconds: 2 });
    const cooling = getTheatreWorld(runtime), pose = runtime.pose;
    runtime = tick(runtime, .4); expect(theatreProjectorStatus(runtime)).toMatchObject({ phase: 'cooldown', seconds: 1 });
    expect(runtime.pose).toBe(pose); expect(getTheatreWorld(runtime)).not.toBe(cooling);
    expect(getTheatreWorld(runtime).solids).toEqual(cooling.solids); expect(label(runtime, 'theatre-projector')).toBe('再使用まで約1秒');
    runtime = tick(runtime, .8); expect(theatreProjectorStatus(runtime)).toMatchObject({ phase: 'idle', available: true, seconds: 0 });
    const before = JSON.stringify(runtime); for (let i = 0; i < 20; i++) theatreProjectorStatus(runtime);
    expect(JSON.stringify(runtime)).toBe(before); expect(runtime.progress.cleared).toBe(false);
  });
});
