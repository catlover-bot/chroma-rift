import * as THREE from 'three';
import reportedFailure from '../../../../docs/qa-goal013-1/r7-device-build2-first-failure.json';
import { createCheckpoint } from '../../../domain/firstPerson/checkpoint';
import { KEY_SAFE, SHELTER_SAFE, WINCH_SAFE } from '../../../domain/stages/mirror-corridor-v1/definition';
import { parseStageCheckpoint } from '../../../domain/stages/mirror-corridor-v1/checkpoint';
import { stageModule } from '../../../domain/stageKit/modules';
import { createCanvasLifecycle } from '../canvasLifecycle';
import { advanceController, beginStageHoldController, commandController, createController, endStageHoldController, syncCamera, worldForController } from '../runtimeController';

// Only the reported camera pose is device evidence. Progress flags below are
// explicitly authored QA checkpoints: the user's diagnostic is not a save.
// This uses the actual controller/lifecycle/codec, without a renderer or GPU.
test('the reported camera pose has an authorized cold-resume location without inferring user progress', () => {
  const module = stageModule('mirror-corridor-v1')!;
  const fresh = module.checkpoint(module.create());
  const data = parseStageCheckpoint(fresh.stageData);
  if (!data) throw new Error('Missing valid mirror checkpoint');
  const pose = { position: { x: reportedFailure.pose.x, y: reportedFailure.pose.y, z: reportedFailure.pose.z },
    yaw: reportedFailure.pose.yaw, pitch: reportedFailure.pose.pitch };
  expect(pose).toEqual(KEY_SAFE);
  const restored = module.restore({ ...fresh, stageData: { ...data, keyTaken: true, pose } });
  if (!restored) throw new Error('Authored QA checkpoint rejected');
  const controller = createController(restored.checkpoint, false, true, 'mirror-corridor-v1');
  expect(controller.runtime.pose).toEqual(pose);
  expect(controller.runtime.stageSession?.value).toMatchObject({ keyTaken: true, practiced: false, ratchets: 0 });
  expect(reportedFailure).not.toHaveProperty('stageData');
  createCanvasLifecycle(controller, jest.fn()).close();
});

test('a settled winch tooth survives a GL failure during the next hold and repeated validated recovery', () => {
  const module = stageModule('mirror-corridor-v1')!;
  const fresh = module.checkpoint(module.create());
  const data = parseStageCheckpoint(fresh.stageData);
  if (!data) throw new Error('Missing valid mirror checkpoint');
  const checkpoint = module.restore({ ...fresh, stageData: { ...data, keyTaken: true, practiced: true, pose: WINCH_SAFE } })?.checkpoint;
  if (!checkpoint) throw new Error('Authored QA winch checkpoint rejected');
  const controller = createController(checkpoint, false, true, 'mirror-corridor-v1');
  const camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true, sceneMode: 'chapter', paused: false, open: false });
  controller.horrorIntensity = 'subdued';
  const target = worldForController(controller).interactables.find(item => item.id === 'mirror-corridor-winch');
  if (!target) throw new Error('Missing physical winch');
  const pose = controller.runtime.pose, dx = target.center.x - pose.position.x, dz = target.center.z - pose.position.z;
  commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz) - pose.yaw,
    pitch: Math.atan2(target.center.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch });
  syncCamera(controller, camera);
  expect(beginStageHoldController(controller, 'mirror-corridor-winch', 31)).toBe(true);
  for (let frame = 0; frame < 120; frame++) advanceController(controller, 1 / 60, camera);
  expect(endStageHoldController(controller, 'mirror-corridor-winch', 31)).toBe(true);
  const accepted = createCheckpoint(controller.runtime);
  expect(accepted.stageData).toMatchObject({ keyTaken: true, practiced: true, ratchets: 1, pose: SHELTER_SAFE });
  expect(beginStageHoldController(controller, 'mirror-corridor-winch', 32)).toBe(true);
  for (let frame = 0; frame < 30; frame++) advanceController(controller, 1 / 60, camera);
  expect(controller.runtime.stageSession?.value).toMatchObject({ holding: 'winch', ratchets: 1 });

  const onError = jest.fn(), lifecycle = createCanvasLifecycle(controller, onError);
  const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  try {
    lifecycle.fail(new Error('TEST/FIXTURE: GL failure during the next unfinished tooth'), 'GL');
    expect(onError).toHaveBeenCalledTimes(1);
    expect(controller.runtime.paused).toBe(true);
    expect(controller.runtime.stageSession?.value).toMatchObject({ holding: null, holdSeconds: 0, keyTaken: true, practiced: true, ratchets: 1 });
    expect(createCheckpoint(controller.runtime)).toEqual(accepted);
    expect(endStageHoldController(controller, 'mirror-corridor-winch', 32)).toBe(false);
    lifecycle.close();
    lifecycle.fail(new Error('TEST/FIXTURE: late callback'), 'initialization timeout');
    expect(controller.diagnostics.firstFailure?.reasonCode).toBe('GL_FRAME');
    expect(onError).toHaveBeenCalledTimes(1);
    advanceController(controller, 1, camera);
    expect(createCheckpoint(controller.runtime)).toEqual(accepted);

    let saved = accepted;
    for (const recovery of ['retry', 'home/cold resume']) {
      const raw: unknown = JSON.parse(JSON.stringify(saved));
      const recovered = module.restore(raw)?.checkpoint;
      if (!recovered) throw new Error(`Validated ${recovery} checkpoint rejected`);
      const next = createController(recovered, false, true, 'mirror-corridor-v1');
      expect(next.runtime.session).not.toBe(controller.runtime.session);
      expect(next.runtime.pose).toEqual(SHELTER_SAFE);
      expect(next.runtime.stageSession?.value).toMatchObject({ holding: null, holdSeconds: 0, keyTaken: true, practiced: true, ratchets: 1 });
      expect(next.diagnostics.firstFailure).toBeNull();
      saved = createCheckpoint(next.runtime);
      createCanvasLifecycle(next, jest.fn()).close();
    }
    expect(saved).toEqual(accepted);
  } finally { lifecycle.close(); errorLog.mockRestore(); }
});
