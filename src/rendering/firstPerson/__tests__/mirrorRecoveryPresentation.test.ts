import * as THREE from 'three';
import { createActorMotion } from '../../../domain/actorMotion';
import { isSafePose } from '../../../domain/firstPerson/geometry';
import { isStageSession } from '../../../domain/stages/mirror-corridor-v1/session';
import { SHELTER_SAFE } from '../../../domain/stages/mirror-corridor-v1/definition';
import { advanceController, commandController, controllerCanInteract, controllerSnapshot, createController,
  presentControllerRecovery, setControllerForeground, syncCamera, worldForController } from '../runtimeController';
import { beginStick, endPointer } from '../touchInput';
import { observeSceneTouchRelease } from '../touchAdapter';

/** Deliberate contacts isolate recovery; successful routes never inject these. */
function contact() {
  const c = createController(undefined, false, true, 'mirror-corridor-v1');
  const camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
  Object.assign(c.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false, renderReturns: 1, presentationReturns: 1 });
  const handle = c.runtime.stageSession!;
  if (!isStageSession(handle.value)) throw new Error('Missing mirror session');
  const pose = { position: { x: -1.8, y: 1.6, z: 10 }, yaw: Math.PI, pitch: 0 };
  c.runtime.pose = pose;
  c.runtime.stageSession = { ...handle, value: { ...handle.value, keyTaken: true, practiced: true, ratchets: 1,
    gateLift: .9, pose, actor: { ...handle.value.actor, phase: 'attack', phaseTime: 0, recognition: 1,
      startupGrace: 0, contactCooldown: 0, motion: createActorMotion({ x: -1.14, y: 0, z: 10 }, Math.PI / 2),
      attackTarget: pose.position, lastSeen: pose.position } } };
  syncCamera(c, camera);
  return { c, camera };
}
const state = (c: ReturnType<typeof createController>) => {
  const live = c.runtime.stageSession?.value;
  if (!isStageSession(live)) throw new Error('Missing mirror state');
  return live;
};

test.each([30, 60])('capture at simulated %s Hz waits for a presented view then returns safe input within 1–2 seconds', hz => {
  const { c, camera } = contact(), dt = 1 / hz;
  beginStick(c.input, 1, 40, 600);
  advanceController(c, dt, camera);
  expect(c.pendingActorEvents).toContain('caught');
  expect(c.runtime.pose).toEqual(SHELTER_SAFE);
  expect(isSafePose(c.runtime.pose, worldForController(c))).toBe(true);
  expect(c.captureRecovery).toMatchObject({ presented: false, remaining: 1.2 });
  expect(controllerCanInteract(c)).toBe(false);
  const grace = state(c).actor.startupGrace;
  const pose = c.runtime.pose;
  // Simulation without a successful presentation cannot spend either clock.
  for (let i = 0; i < hz * 3; i++) advanceController(c, dt, camera);
  expect(c.captureRecovery?.remaining).toBe(1.2);
  expect(state(c).actor.startupGrace).toBe(grace);
  endPointer(c.input, 1);
  let elapsed = 0;
  for (let i = 0; c.captureRecovery && i < hz * 2; i++) {
    commandController(c, { type: 'step', forward: 1 });
    advanceController(c, dt, camera);
    presentControllerRecovery(c, dt);
    elapsed += dt;
  }
  expect(elapsed).toBeGreaterThanOrEqual(1);
  expect(elapsed).toBeLessThanOrEqual(1.3);
  expect(c.runtime.pose).toEqual(pose);
  expect(controllerCanInteract(c)).toBe(true);
  expect(controllerSnapshot(c).recovering).toBe(false);
  expect(state(c).actor.startupGrace).toBe(grace);
  commandController(c, { type: 'step', forward: 1 });
  advanceController(c, dt, camera);
  expect(c.runtime.pose.position.z).toBeLessThan(pose.position.z);
  // The fresh steering command already consumed the old queue. No recapture.
  expect(c.pendingActorEvents).not.toContain('caught');
});

test('pause, background and failed presentation do not consume recovery; retained fingers cannot revive movement', () => {
  const { c, camera } = contact();
  beginStick(c.input, 1, 40, 600);
  advanceController(c, 1 / 60, camera);
  presentControllerRecovery(c, 1 / 60);
  const grace = state(c).actor.startupGrace;
  commandController(c, { type: 'pause' });
  for (let i = 0; i < 90; i++) { advanceController(c, 1 / 30, camera); presentControllerRecovery(c, 1 / 30); }
  expect(c.captureRecovery?.remaining).toBe(1.2);
  commandController(c, { type: 'resume' });
  setControllerForeground(c, false);
  for (let i = 0; i < 90; i++) presentControllerRecovery(c, 1 / 30);
  expect(c.captureRecovery?.remaining).toBe(1.2);
  setControllerForeground(c, true); commandController(c, { type: 'resume' });
  c.diagnostics.stage = 'failed';
  for (let i = 0; i < 90; i++) presentControllerRecovery(c, 1 / 30);
  expect(c.captureRecovery?.remaining).toBe(1.2);
  c.diagnostics.stage = 'ready';
  for (let i = 0; i < 90; i++) { advanceController(c, 1 / 30, camera); presentControllerRecovery(c, 1 / 30); }
  expect(c.captureRecovery?.remaining).toBe(0);
  expect(state(c).actor.startupGrace).toBe(grace);
  expect(controllerCanInteract(c)).toBe(false);
  endPointer(c.input, 1); presentControllerRecovery(c, 1 / 30);
  expect(controllerCanInteract(c)).toBe(true);
});

test('a retired hold view can release through the stable scene ancestor without bypassing the full contact barrier', () => {
  const { c, camera } = contact();
  c.input.releaseBarrier = [7, 8];
  advanceController(c, 1 / 60, camera);
  const p = (identifier: number) => ({ identifier, pageX: 320, pageY: 700 });
  for (let i = 0; i < 80; i++) presentControllerRecovery(c, 1 / 60);
  observeSceneTouchRelease(c.input, { changedTouches: [p(7)], touches: [p(8)] });
  presentControllerRecovery(c, 1 / 60);
  expect(c.captureRecovery).toBeDefined();
  expect(c.input.releaseBarrier).toEqual([8]);
  observeSceneTouchRelease(c.input, { changedTouches: [p(8)], touches: [] });
  presentControllerRecovery(c, 1 / 60);
  expect(c.captureRecovery).toBeUndefined();
  expect(c.input.stickPointer).toBeNull();
  expect(c.input.lookX).toBe(0);
});

test.each([.53, .35])('the actual controller retreats out of a dynamic diagonal offset %s while static walls stay strict', offset => {
  const { c, camera } = contact(), handle = c.runtime.stageSession!;
  const live = state(c);
  c.runtime.pose = { position: { x: 0, y: 1.6, z: 10 }, yaw: Math.PI, pitch: 0 };
  c.runtime.stageSession = { ...handle, value: { ...live, actor: { ...live.actor, phase: 'patrol', startupGrace: 2.4,
    contactCooldown: 2.4, motion: createActorMotion({ x: -offset, y: 0, z: 10 - offset }, 0) } } };
  c.input.forward = 1;
  for (let i = 0; i < 8; i++) advanceController(c, 1 / 60, camera);
  expect(c.runtime.pose.position.z).toBeGreaterThan(10.2);
  expect(c.captureRecovery).toBeUndefined();
  expect(isSafePose(c.runtime.pose, worldForController(c))).toBe(true);
});
