import * as THREE from 'three';

import { forwardVector } from '../../../domain/firstPerson/geometry';
import { advanceController, commandController, controllerSnapshot, createController, interactController, syncCamera, worldForController } from '../runtimeController';

const camera = () => new THREE.PerspectiveCamera(65, 390 / 740, 0.08, 60);
describe('native scene runtime integration without GL', () => {
  it('uses the exact yaw/pitch convention in the actual Three camera', () => {
    const controller = createController();
    commandController(controller, { type: 'turn', yaw: 0.7, pitch: 0.3 });
    const view = camera();
    syncCamera(controller, view);
    const actual = view.getWorldDirection(new THREE.Vector3());
    const expected = forwardVector(controller.runtime.pose);
    expect(actual.x).toBeCloseTo(expected.x);
    expect(actual.y).toBeCloseTo(expected.y);
    expect(actual.z).toBeCloseTo(expected.z);
    expect(view.position.y).toBe(1.6);
  });
  it('keeps a stable UI snapshot key while idle and moving within the same semantic state', () => {
    const controller = createController(undefined, true);
    expect(controllerSnapshot(controller).cue.kind).toBe('none');
    syncCamera(controller, camera());
    expect(controllerSnapshot(controller).cue.kind).toBe('approach');
    const initial = controllerSnapshot(controller).key;
    for (let index = 0; index < 120; index += 1) advanceController(controller, 1 / 60, camera());
    expect(controllerSnapshot(controller).key).toBe(initial);
    controller.input.right = 0.3;
    for (let index = 0; index < 5; index += 1) advanceController(controller, 1 / 60, camera());
    expect(controllerSnapshot(controller).key).toBe(initial);
    expect(controller.runtime.pose.position.x).toBeGreaterThan(0);
  });
  it('simple steps use the same walls and open-door collision as continuous walking in the retained lab', () => {
    const controller = createController(undefined, true);
    const view = camera();
    for (let index = 0; index < 30; index += 1) {
      commandController(controller, { type: 'step', forward: 1 });
      advanceController(controller, 1 / 60, view);
    }
    expect(controller.runtime.pose.position.z).toBeGreaterThan(-2.67);
    expect(controllerSnapshot(controller).target?.id).toBe('guide');
    expect(interactController(controller, 'guide')).toBe(true);
    expect(interactController(controller, 'guide')).toBe(false);
    for (let index = 0; index < 100; index += 1) advanceController(controller, 1 / 60, view);
    expect(worldForController(controller).solids.find((solid) => solid.id === 'seal-a-door')!.min.y).toBe(3.3);
    for (let index = 0; index < 4; index += 1) {
      commandController(controller, { type: 'step', forward: 1 });
      advanceController(controller, 1 / 60, view);
    }
    expect(controller.runtime.pose.position.z).toBeLessThan(-3.2);
    expect(controller.runtime.pose.position.z).toBeGreaterThan(-4.8);
  });
  it('rechecks the displayed target ID and current ray before operating', () => {
    const controller = createController(undefined, true);
    const view = camera();
    for (let index = 0; index < 7; index += 1) {
      commandController(controller, { type: 'step', forward: 1 });
      advanceController(controller, 1 / 60, view);
    }
    expect(controllerSnapshot(controller).target?.id).toBe('guide');
    expect(interactController(controller, 'exit')).toBe(false);
    commandController(controller, { type: 'turn', yaw: Math.PI, pitch: 0 });
    expect(interactController(controller, 'guide')).toBe(false);
    expect(controller.runtime.progress.sealA).toBe(false);
  });
  it('pause and resume clear held movement, pending steps and look deltas including large resume dt', () => {
    const controller = createController(undefined, true);
    controller.input.forward = 1;
    controller.input.lookX = 200;
    controller.simpleStep = 1;
    const pose = controller.runtime.pose;
    commandController(controller, { type: 'pause' });
    advanceController(controller, 20, camera());
    commandController(controller, { type: 'resume' });
    advanceController(controller, 20, camera());
    expect(controller.runtime.pose).toEqual(pose);
    expect(controller.input.forward).toBe(0);
    expect(controller.input.lookX).toBe(0);
    expect(controller.simpleStep).toBe(0);
  });
});
