import * as THREE from 'three';

import { createCheckpoint } from '../../../domain/firstPerson';
import { isStageSession } from '../../../domain/stages/mirror-corridor-v1/session';
import { beginStageHoldController, commandController, advanceController, controllerSnapshot, createController, endStageHoldController, syncCamera } from '../runtimeController';
import { endPointer } from '../touchInput';

const camera = () => new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);

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
