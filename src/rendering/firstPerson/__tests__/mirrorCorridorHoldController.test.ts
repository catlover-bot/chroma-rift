import * as THREE from 'three';

import { createCheckpoint } from '../../../domain/firstPerson';
import { MIRROR_CENTER, WINCH_SAFE } from '../../../domain/stages/mirror-corridor-v1/definition';
import { parseStageCheckpoint } from '../../../domain/stages/mirror-corridor-v1/checkpoint';
import { isStageSession } from '../../../domain/stages/mirror-corridor-v1/session';
import { observedCampaignDiscoveries } from '../../../domain/campaign/discoveries';
import { stageModule } from '../../../domain/stageKit/modules';
import { beginStageHoldController, commandController, advanceController, controllerSnapshot, createController, endStageHoldController, interactController, syncCamera } from '../runtimeController';
import { endPointer } from '../touchInput';

const camera = () => new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);

test('looking at the physical mirror and pressing inspect records only that explicit observation', () => {
  const module = stageModule('mirror-corridor-v1')!;
  const fresh = module.checkpoint(module.create());
  const data = parseStageCheckpoint(fresh.stageData)!;
  const entry = module.restore({ ...fresh, stageData: { ...data, keyTaken: true, practiced: true, pose: WINCH_SAFE } })?.checkpoint;
  expect(entry).toBeDefined();
  if (!entry) return;
  const controller = createController(entry, false, true, 'mirror-corridor-v1'), view = camera();
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false });
  controller.horrorIntensity = 'subdued';
  const pose = controller.runtime.pose;
  const dx = MIRROR_CENTER.x - pose.position.x, dz = MIRROR_CENTER.z - pose.position.z;
  const yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(MIRROR_CENTER.y - pose.position.y, Math.hypot(dx, dz));
  commandController(controller, { type: 'turn', yaw: yaw - pose.yaw, pitch: pitch - pose.pitch });
  syncCamera(controller, view);
  expect(controllerSnapshot(controller).target?.id).toBe('mirror-corridor-mirror');
  expect(observedCampaignDiscoveries('chapter-1-area-04', createCheckpoint(controller.runtime))).not.toContain('mirror');
  expect(interactController(controller, 'mirror-corridor-mirror')).toBe(true);
  const observed = createCheckpoint(controller.runtime);
  expect(parseStageCheckpoint(observed.stageData)?.mirrorInspected).toBe(true);
  expect(observedCampaignDiscoveries('chapter-1-area-04', observed)).toContain('mirror');
  expect(createController(observed, false, true, 'mirror-corridor-v1').runtime.stageSession?.value)
    .toMatchObject({ mirrorInspected: true });
  expect(module.canReplaceCheckpoint?.(observed, entry)).toBe(false);
});

test('mirror winch uses current ray, held pointer barrier, frame time, and settled checkpoint through pause', () => {
  const controller = createController(undefined, false, true, 'mirror-corridor-v1');
  const view = camera();
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true, sceneMode: 'chapter', paused: false, open: false });
  controller.runtime.pose = { position: { x: -2.45, y: 1.6, z: 9.6 }, yaw: Math.PI, pitch: -.12 };
  const entry = controller.runtime.stageSession!;
  if (!isStageSession(entry.value)) throw new Error('Mirror corridor session missing');
  controller.runtime.stageSession = { ...entry, value: { ...entry.value, keyTaken: true, practiced: true } };
  syncCamera(controller, view);
  expect(controllerSnapshot(controller).target?.id).toBe('mirror-corridor-winch');
  expect(beginStageHoldController(controller, 'mirror-corridor-practice', 3)).toBe(false);
  controller.input.stickPointer = 1;
  controller.input.lookPointer = 2;
  expect(beginStageHoldController(controller, 'mirror-corridor-winch', 3)).toBe(true);
  expect(controller.input.releaseBarrier).toEqual([1, 2, 3]);
  commandController(controller, { type: 'step', forward: 1 });
  expect(controller.runtime.stageSession?.value).toMatchObject({ holding: 'winch', ratchets: 0 });
  const before = controller.runtime.pose;
  for (let index = 0; index < 120; index += 1) advanceController(controller, 1 / 60, view);
  expect(controller.runtime.pose.position).toEqual(before.position);
  expect(controller.runtime.pose.pitch).toBeCloseTo(before.pitch);
  expect(Math.cos(controller.runtime.pose.yaw)).toBeCloseTo(Math.cos(before.yaw));
  expect(controller.runtime.stageSession?.value).toMatchObject({ holding: 'winch', ratchets: 1, holdSeconds: 0 });
  expect(endStageHoldController(controller, 'mirror-corridor-winch', 3)).toBe(true);
  expect(controller.input.releaseBarrier).toEqual([1, 2]);
  expect(createCheckpoint(controller.runtime).stageData).toMatchObject({ ratchets: 1 });
  endPointer(controller.input, 1);
  endPointer(controller.input, 2);
  expect(controller.input.releaseBarrier).toEqual([]);
  expect(beginStageHoldController(controller, 'mirror-corridor-winch', 4)).toBe(true);
  for (let index = 0; index < 30; index += 1) advanceController(controller, 1 / 60, view);
  commandController(controller, { type: 'pause' });
  expect(controller.runtime.stageSession?.value).toMatchObject({ holding: null, holdSeconds: 0, ratchets: 1 });
  expect(createCheckpoint(controller.runtime).stageData).toMatchObject({ ratchets: 1 });
  expect(endStageHoldController(controller, 'mirror-corridor-winch', 4)).toBe(false);
});

test('standard patrol capture cancels a held winch without losing its key or settled tooth on cold restart', () => {
  const module = stageModule('mirror-corridor-v1')!;
  const fresh = module.checkpoint(module.create());
  const data = parseStageCheckpoint(fresh.stageData)!;
  const start = module.restore({ ...fresh, stageData: { ...data, keyTaken: true, practiced: true,
    ratchets: 0, pose: WINCH_SAFE } })?.checkpoint;
  expect(start).toBeDefined();
  if (!start) throw new Error('Valid winch checkpoint missing');
  const controller = createController(start, false, true, 'mirror-corridor-v1'), view = camera();
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false });
  controller.horrorIntensity = 'standard';
  const aim = (x: number, z: number, pitch = 0) => {
    const pose = controller.runtime.pose, desired = Math.atan2(-(x - pose.position.x), -(z - pose.position.z));
    commandController(controller, { type: 'turn', yaw: desired - pose.yaw, pitch: pitch - pose.pitch });
    syncCamera(controller, view);
  };
  const target = { x: -2.45, z: 9.6 };
  for (let frame = 0; frame < 240; frame += 1) {
    const position = controller.runtime.pose.position;
    if (Math.hypot(target.x - position.x, target.z - position.z) < .06) break;
    aim(target.x, target.z);
    controller.input.forward = 1;
    advanceController(controller, 1 / 60, view);
  }
  controller.input.forward = 0;
  expect(Math.hypot(target.x - controller.runtime.pose.position.x,
    target.z - controller.runtime.pose.position.z)).toBeLessThan(.07);
  aim(-2.45, 11.3, -.12);
  expect(controllerSnapshot(controller).target?.id).toBe('mirror-corridor-winch');
  expect(beginStageHoldController(controller, 'mirror-corridor-winch', 7)).toBe(true);
  for (let frame = 0; frame < 120; frame += 1) advanceController(controller, 1 / 60, view);
  expect(controller.runtime.stageSession?.value).toMatchObject({ ratchets: 1, holding: 'winch' });
  expect(endStageHoldController(controller, 'mirror-corridor-winch', 7)).toBe(true);
  for (let frame = 0; frame < 60; frame += 1) advanceController(controller, 1 / 60, view);
  aim(-2.45, 11.3, -.12);
  expect(beginStageHoldController(controller, 'mirror-corridor-winch', 8)).toBe(true);
  let caught = false;
  for (let frame = 0; frame < 900 && !caught; frame += 1) {
    advanceController(controller, 1 / 60, view);
    caught = controller.pendingActorEvents.includes('caught');
  }
  expect(caught).toBe(true);
  const live = controller.runtime.stageSession?.value;
  expect(live).toMatchObject({ holding: null, holdSeconds: 0, keyTaken: true, practiced: true });
  if (!isStageSession(live)) throw new Error('Mirror session missing after capture');
  expect(live.ratchets).toBeGreaterThanOrEqual(1);
  expect(controller.runtime.pose.position).toEqual(WINCH_SAFE.position);
  expect(controller.input.releaseBarrier).toContain(8);
  expect(endStageHoldController(controller, 'mirror-corridor-winch', 8)).toBe(false);
  expect(controller.input.releaseBarrier).not.toContain(8);
  const checkpoint = createCheckpoint(controller.runtime);
  expect(module.restore(checkpoint)?.checkpoint.stageData).toMatchObject({
    keyTaken: true, practiced: true, ratchets: live.ratchets, cleared: false,
  });
  const resumed = createController(checkpoint, false, true, 'mirror-corridor-v1');
  expect(resumed.runtime.stageSession?.value).toMatchObject({
    holding: null, holdSeconds: 0, keyTaken: true, practiced: true, ratchets: live.ratchets,
  });
  Object.assign(resumed.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false });
  resumed.horrorIntensity = 'standard';
  const resumedView = camera();
  const walkTo = (x: number, z: number) => {
    for (let frame = 0; frame < 900; frame += 1) {
      const pose = resumed.runtime.pose, distance = Math.hypot(x - pose.position.x, z - pose.position.z);
      if (distance < .06) { resumed.input.forward = 0; return; }
      const desired = Math.atan2(-(x - pose.position.x), -(z - pose.position.z));
      commandController(resumed, { type: 'turn', yaw: desired - pose.yaw, pitch: -pose.pitch });
      resumed.input.forward = 1;
      advanceController(resumed, 1 / 60, resumedView);
    }
    throw new Error(`Recovered route blocked before ${x},${z}`);
  };
  walkTo(-1.8, 8.5);
  walkTo(0, 8.5);
  walkTo(0, 22.5);
  const pose = resumed.runtime.pose;
  commandController(resumed, { type: 'turn', yaw: Math.PI - pose.yaw, pitch: -.06 - pose.pitch });
  syncCamera(resumed, resumedView);
  expect(controllerSnapshot(resumed).target?.id).toBe('mirror-corridor-exit');
  expect(interactController(resumed, 'mirror-corridor-exit')).toBe(true);
  expect(resumed.runtime.progress.cleared).toBe(true);
});
