import * as THREE from 'three';
import type { InteractableId } from '../../../domain/firstPerson/types';
import { stageModule } from '../../../domain/stageKit/modules';
import { WINCH_SAFE } from '../../../domain/stages/mirror-corridor-v1/definition';
import { carriedKeyEntry, isStageSession as isDepartureSession } from '../../../domain/stages/departure-control-v1/session';
import { stageBinding as departureBinding } from '../../../domain/stages/departure-control-v1/binding';
import { CONTROL_SAFE, BELL_RECEIVER } from '../../../domain/stages/departure-control-v1/definition';
import { beginStageHoldController, controllerSnapshot, createController, endStageHoldController, interactController, syncCamera, worldForController } from '../runtimeController';
import { createTouchAdapter } from '../touchAdapter';

function aim(controller: ReturnType<typeof createController>, id: InteractableId, relocate = false) {
  const target = worldForController(controller).interactables.find(value => value.id === id);
  if (!target) throw new Error(`Missing target ${id}`);
  if (relocate) controller.runtime.pose = { position: id === 'mirror-corridor-figure'
    ? { x: target.center.x, y: 1.6, z: target.center.z - 1.2 } : id === 'departure-procedure'
    ? { x: CONTROL_SAFE.position.x, y: 1.6, z: target.center.z + .3 }
    : { x: target.center.x + 1.2, y: 1.6, z: target.center.z }, yaw: 0, pitch: 0 };
  const position = controller.runtime.pose.position;
  const dx = target.center.x - position.x, dz = target.center.z - position.z;
  const aimY = target.center.y;
  controller.runtime.pose = { position, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(aimY - position.y, Math.hypot(dx, dz)) };
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true });
  syncCamera(controller, new THREE.PerspectiveCamera(65, 390 / 844, .08, 60));
  expect(controllerSnapshot(controller).target?.id).toBe(id);
}

test('the real mirror inspection returns its observation through the controller', () => {
  const controller = createController(undefined, false, true, 'mirror-corridor-v1');
  aim(controller, 'mirror-corridor-figure', true);
  expect(interactController(controller, 'mirror-corridor-figure')).toBe(true);
  expect(controller.feedbackMessage).toMatch(/輪郭/);
});

test('the stop panel is visibly locked before containment and shares the command explanation', () => {
  const module = stageModule('departure-control-v1')!;
  const fresh = module.checkpoint(module.create());
  const restored = module.restore({ ...fresh, stageData: { ...carriedKeyEntry(), keyAvailable: false, keyInstalled: true } });
  if (!restored) throw new Error('QA checkpoint rejected');
  const controller = createController(restored.checkpoint, false, true, 'departure-control-v1');
  aim(controller, 'departure-stop', true);
  const cue = controllerSnapshot(controller).cue;
  expect(cue.kind).toBe('locked');
  expect(cue.reason).toMatch(/収容|隔離/);
  expect(interactController(controller, 'departure-stop')).toBe(false);
  expect(controller.feedbackMessage).toBe(cue.reason);
});

test('the open staff exit never requests the procedure or key again', () => {
  const module = stageModule('departure-control-v1')!;
  const fresh = module.checkpoint(module.create());
  const restored = module.restore({ ...fresh, stageData: { ...carriedKeyEntry(), keyAvailable: false, keyInstalled: true,
    procedureRead: true, isolated: true, stopped: true, staffDoorOpened: true } });
  if (!restored) throw new Error('QA completed checkpoint rejected');
  const controller = createController(restored.checkpoint, false, true, 'departure-control-v1');
  aim(controller, 'departure-procedure', true);
  interactController(controller, 'departure-procedure');
  expect(controller.feedbackMessage).not.toMatch(/手順と隔離キー|呼び鈴で収容/);
  expect(controller.feedbackMessage).toMatch(/屋外|出口|完了/);
  expect(module.present(controller.runtime).hint.text).toMatch(/屋外|出口/);
});

test('releasing a winch permits a fresh left retreat touch while an old look contact stays suppressed', () => {
  const module = stageModule('mirror-corridor-v1')!;
  const fresh = module.checkpoint(module.create());
  const restored = module.restore({ ...fresh, stageData: { schemaVersion: 1, stageId: 'mirror-corridor-v1',
    figureInspected: false, mirrorInspected: false, keyTaken: true, practiced: true, ratchets: 1, cleared: false, pose: WINCH_SAFE } });
  if (!restored) throw new Error('QA winch checkpoint rejected');
  const controller = createController(restored.checkpoint, false, true, 'mirror-corridor-v1');
  aim(controller, 'mirror-corridor-winch');
  controller.input.lookPointer = 2;
  expect(beginStageHoldController(controller, 'mirror-corridor-winch', 3)).toBe(true);
  expect(endStageHoldController(controller, 'mirror-corridor-winch', 3)).toBe(true);
  expect(controller.input.releaseBarrier).toContain(2);
  const adapter = createTouchAdapter(controller.input);
  const old = { identifier: 2, pageX: 250, pageY: 100 }, freshTouch = { identifier: 4, pageX: 50, pageY: 50 };
  adapter.bind('stick', 'start')({ changedTouches: [freshTouch], targetTouches: [freshTouch], touches: [old, freshTouch] });
  adapter.bind('stick', 'move')({ changedTouches: [{ ...freshTouch, pageY: 100 }], touches: [old, freshTouch] });
  adapter.bind('look', 'start')({ changedTouches: [old], targetTouches: [old], touches: [old, freshTouch] });
  expect(controller.input.stickPointer).toBe(4);
  expect(controller.input.forward).toBeLessThan(0);
  expect(controller.input.lookPointer).toBeNull();
  expect(controller.runtime.stageSession?.value).toMatchObject({ holding: null, ratchets: 1 });
});

// Deliberate body/pose fixtures exercise the real acquisition and command
// boundary; the natural route tests separately supply the AI approach.
test.each([
  { name: 'outside the volume', actor: { x: 2.45, y: 0, z: 12.4 }, unsafe: false, ready: false, reason: /全身が床の収容境界/ },
  { name: 'center inside but shoulders outside', actor: { x: .95, y: 0, z: 18.1 }, unsafe: false, ready: false, reason: /全身が床の収容境界/ },
  { name: 'body in the moving-door sweep', actor: { x: 2.45, y: 0, z: 15.12 }, unsafe: false, ready: false, reason: /扉の可動範囲/ },
  { name: 'whole body clear of the sweep', actor: { ...BELL_RECEIVER, y: 0 }, unsafe: false, ready: true, reason: /全身の収容を確認/ },
  { name: 'player on the unsafe side', actor: { ...BELL_RECEIVER, y: 0 }, unsafe: true, ready: false, reason: /安全側へ戻る/ },
])('containment HUD and real command agree for $name', ({ actor, unsafe, ready, reason }) => {
  const checkpoint = departureBinding.restore({ ...departureBinding.checkpoint(departureBinding.create()),
    stageData: { ...carriedKeyEntry(), keyAvailable: false, keyInstalled: true, procedureRead: true } })?.checkpoint;
  if (!checkpoint) throw new Error('QA control checkpoint rejected');
  const controller = createController(checkpoint, false, true, 'departure-control-v1');
  const live = controller.runtime.stageSession?.value;
  if (!isDepartureSession(live)) throw new Error('Missing departure session');
  controller.runtime.stageSession = { stageId: 'departure-control-v1', value: { ...live,
    actor: { ...live.actor, motion: { ...live.actor.motion, position: actor } } } };
  controller.runtime.pose = { ...CONTROL_SAFE, position: unsafe ? { x: -1.8, y: 1.6, z: 13.18 } : CONTROL_SAFE.position };
  aim(controller, 'departure-door');
  const snapshot = controllerSnapshot(controller);
  expect(snapshot.cue.kind).toBe(ready ? 'ready' : 'locked');
  expect(snapshot.stageTarget?.message).toMatch(reason);
  const direct = departureBinding.command(controller.runtime, { sessionId: live.sessionId, seq: live.lastSeq + 1,
    targetId: 'departure-door', type: 'close-door' }, { rendererReady: true, foreground: true, targetId: 'departure-door' });
  expect(direct.accepted).toBe(ready);
  if (!ready) expect(direct.message).toBe(snapshot.cue.reason);
  expect(interactController(controller, 'departure-door')).toBe(ready);
  if (!ready) expect(controller.feedbackMessage).toBe(snapshot.cue.reason);
  expect(controller.runtime.stageSession?.value).toMatchObject({ doorProgress: 0, doorMode: ready ? 'closing' : 'idle', isolated: false });
});
