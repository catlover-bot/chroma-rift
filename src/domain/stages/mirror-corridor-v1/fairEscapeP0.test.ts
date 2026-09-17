import { isSafePose, segmentOccluded, updatePlayer } from '../../firstPerson/geometry';
import { stepRuntime } from '../../firstPerson/runtime';
import type { PlayerPose } from '../../firstPerson/types';
import { stageBinding } from './binding';
import { EXIT, GATE_Z, KEY_SAFE, LEGACY_EXIT, MIRROR_LAYOUT, POST_GATE, SHELTER_SAFE, SPAWN, WINCH_SAFE, stageWorld } from './definition';
import { parseStageCheckpoint } from './checkpoint';
import { advanceStage, checkpointStage, createStageSession, isStageSession } from './session';

const pose = (x: number, z: number): PlayerPose => ({ position: { x, y: 1.6, z }, yaw: Math.PI, pitch: 0 });
const forward = { strafe: 0, forward: 1 };

// These are deliberately injected local regression states, not successful
// campaign routes. Every walking sample still uses the production geometry.
test('an open gate has supported walking floor through the visible doorway, including z24', () => {
  const world = stageWorld(3, true, true);
  let player = pose(0, 16);
  expect(isSafePose(player, world)).toBe(true);
  for (let frame = 0; frame < 900 && player.position.z < 31.6; frame += 1) {
    player = updatePlayer(player, forward, 1 / 60, world);
    expect(isSafePose(player, world)).toBe(true);
  }
  expect(player.position.z).toBeGreaterThan(31.5);
});

test.each([0, .9, 1.8])('gate lift %s still blocks a standing body', lift => {
  const world = stageWorld(3, true, true, null, undefined, lift);
  let player = pose(0, 16);
  for (let frame = 0; frame < 90; frame += 1) player = updatePlayer(player, forward, 1 / 60, world);
  expect(player.position.z).toBeLessThan(GATE_Z);
});

test('closed grate gaps pass sight while the same opening still blocks a body', () => {
  const world = stageWorld(0, true, true);
  const across = (x: number) => segmentOccluded({ x, y: 1.6, z: 16.5 }, { x, y: 1.6, z: 18 }, world);
  expect(across(.13)).toBe(false);
  expect(across(0)).toBe(true);
  expect(isSafePose(pose(.13, GATE_Z + .09), world)).toBe(false);
});

test('the third tooth ends holding once while the committed physical lift continues', () => {
  let live = { ...createStageSession('last-tooth'), pose: WINCH_SAFE, keyTaken: true, practiced: true,
    ratchets: 2, gateLift: 1.8, holding: 'winch' as const, holdSeconds: 1.95 } as ReturnType<typeof createStageSession>;
  live = advanceStage(live, .05);
  expect(live).toMatchObject({ ratchets: 3, holding: null, holdSeconds: 0, gateLift: 1.8, cleared: false });
  for (let frame = 0; frame < 18; frame += 1) live = advanceStage(live, .05);
  expect(live.gateLift).toBeCloseTo(3.6);
  expect(live.cleared).toBe(false);
});

test('the actor square corner cannot trap a separated circular player body', () => {
  const world = stageWorld(0, false, false, null, { x: 0, y: 0, z: 0 });
  const player = pose(.53, .53);
  expect(isSafePose(player, world)).toBe(true);
  expect(updatePlayer(player, forward, .05, world).position.z).toBeGreaterThan(player.position.z);
});

test('an injected dynamic overlap can retreat through stepRuntime without weakening static walls', () => {
  let runtime = stageBinding.create();
  const live = runtime.stageSession?.value;
  if (!isStageSession(live)) throw new Error('Missing mirror session');
  runtime = { ...runtime, pose: pose(.35, .35), stageSession: { stageId: live.stageId,
    value: { ...live, actor: { ...live.actor, motion: { ...live.actor.motion, position: { x: 0, y: 0, z: 0 } } } } } };
  const before = runtime.pose;
  runtime = stepRuntime(runtime, forward, 1 / 60);
  expect(runtime.pose.position.z).toBeGreaterThan(before.position.z);
  // A single small sample remains overlapping: escape must be incremental.
  expect(isSafePose(runtime.pose, stageBinding.world(runtime))).toBe(false);
  const staticWorld = stageWorld(0, true, true);
  const insideCore = pose(-2.45, 11.3);
  expect(isSafePose(insideCore, staticWorld)).toBe(false);
  expect(updatePlayer(insideCore, forward, .05, staticWorld)).toBe(insideCore);
});

test('real movement across the visible threshold clears the runtime without an exit command', () => {
  let runtime = stageBinding.create();
  const live = createStageSession('committed-fixture');
  runtime = { ...runtime, pose: pose(0, 16), stageSession: { stageId: live.stageId,
    value: { ...live, keyTaken: true, practiced: true, ratchets: 3, gateLift: 3.6 } } };
  expect(stageBinding.world(runtime).interactables.some(target => target.id === 'mirror-corridor-exit')).toBe(false);
  let crossed = false;
  for (let frame = 0; frame < 900 && !runtime.progress.cleared; frame += 1) {
    runtime = stepRuntime(runtime, forward, 1 / 60);
    const current = runtime.stageSession?.value;
    if (!isStageSession(current)) throw new Error('Missing updated session');
    crossed ||= current.gateCrossed;
    if (runtime.pose.position.z < MIRROR_LAYOUT.doorway.thresholdZ) expect(runtime.progress.cleared).toBe(false);
  }
  expect(crossed).toBe(true);
  expect(runtime.progress.cleared).toBe(true);
  expect(runtime.pose.position.z).toBeGreaterThanOrEqual(MIRROR_LAYOUT.doorway.thresholdZ);
  expect(runtime.pose.position.z).toBeLessThan(MIRROR_LAYOUT.doorway.thresholdZ + .04);
  expect(stageBinding.checkpoint(runtime).stageData).toMatchObject({ gateCrossed: true, cleared: true, pose: EXIT });
});

test.each([1.819, 1.82])('standing clearance is decided by the opening height %s', lift => {
  const world = stageWorld(3, true, true, null, undefined, lift);
  let player = pose(.13, 16.5);
  for (let frame = 0; frame < 90; frame += 1) player = updatePlayer(player, forward, 1 / 60, world);
  expect(player.position.z > GATE_Z + .5).toBe(lift >= 1.82);
});

test.each([SPAWN, KEY_SAFE, WINCH_SAFE, POST_GATE, LEGACY_EXIT])('schema-1 checkpoint keeps its old authored pose %j', oldPose => {
  const base = checkpointStage(createStageSession('old'));
  const { gateCrossed: omitted, ...old } = base;
  expect(omitted).toBe(false);
  const farSide = oldPose === POST_GATE || oldPose === LEGACY_EXIT;
  const raw = { ...old, pose: oldPose, keyTaken: oldPose !== SPAWN, practiced: oldPose !== SPAWN && oldPose !== KEY_SAFE,
    ratchets: farSide ? 3 : 0, cleared: oldPose === LEGACY_EXIT };
  const parsed = parseStageCheckpoint(raw);
  expect(parsed).toMatchObject({ pose: oldPose, gateCrossed: farSide });
  const cold = createStageSession('cold', raw);
  expect(cold.pose).toEqual(oldPose);
  expect(isSafePose(cold.pose, stageWorld(cold.ratchets, cold.keyTaken, cold.practiced, null, cold.actor.motion.position))).toBe(true);
});

test('work resumes behind the shelf and far-side progress is earned and monotonic', () => {
  const base = createStageSession('recovery');
  const work = { ...base, keyTaken: true, practiced: true, ratchets: 3, gateLift: 3.6 };
  expect(checkpointStage(work)).toMatchObject({ gateCrossed: false, pose: SHELTER_SAFE });
  expect(parseStageCheckpoint({ ...checkpointStage(work), gateCrossed: true, ratchets: 2 })).toBeUndefined();
  expect(parseStageCheckpoint({ ...checkpointStage(work), gateCrossed: false, pose: POST_GATE })).toBeUndefined();
  const crossed = advanceStage({ ...work, pose: pose(0, GATE_Z + .18 + .24 + .01) }, .05);
  expect(crossed.gateCrossed).toBe(true);
  expect(checkpointStage({ ...crossed, pose: WINCH_SAFE })).toMatchObject({ gateCrossed: true, pose: POST_GATE });
  const shell = stageBinding.checkpoint(stageBinding.create());
  expect(stageBinding.canReplaceCheckpoint?.({ ...shell, stageData: checkpointStage(crossed) },
    { ...shell, stageData: checkpointStage(work) })).toBe(false);
});
