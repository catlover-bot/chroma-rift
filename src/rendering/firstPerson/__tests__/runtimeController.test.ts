import * as THREE from 'three';

import { createCheckpoint, MOVE_SPEED, OBSERVATION_POSE } from '../../../domain/firstPerson';
import { EMBLEM_FIXTURE } from '../../../domain/firstPerson/emblemFixture';
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
    Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true }); // Mocked native presentation boundary.
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


describe('tutorial milestones from actual controller input, without GL', () => {
  it('records user look before movement and never counts idle, menu, or assisted camera changes', () => {
    const controller = createController();
    const view = camera();
    commandController(controller, { type: 'hint', stage: 3 });
    commandController(controller, { type: 'aim' });
    commandController(controller, { type: 'sensitivity', value: 1.5, vertical: 0.5 });
    commandController(controller, { type: 'pause' });
    advanceController(controller, 1 / 60, view);
    commandController(controller, { type: 'resume' });
    for (let i = 0; i < 20; i += 1) advanceController(controller, 1 / 60, view);
    expect(controllerSnapshot(controller).tutorial).toEqual({ moved: false, looked: false, guideExamined: false, complete: false });
    controller.input.lookX = 70;
    advanceController(controller, 1 / 60, view);
    expect(controllerSnapshot(controller).tutorial).toMatchObject({ moved: false, looked: true, complete: false });
    controller.input.forward = 1;
    for (let i = 0; i < 30; i += 1) advanceController(controller, 1 / 60, view);
    expect(controllerSnapshot(controller).tutorial).toMatchObject({ moved: true, looked: true, complete: true });
  });
  it('requires meaningful collision-resolved displacement instead of walking against a wall', () => {
    const initial = createController();
    initial.runtime.pose = { ...initial.runtime.pose, position: { x: 0.65, y: 1.6, z: 7 } };
    const controller = createController(createCheckpoint(initial.runtime));
    controller.input.right = 1;
    for (let i = 0; i < 120; i += 1) advanceController(controller, 1 / 60, camera());
    expect(controller.runtime.pose.position.x).toBeLessThanOrEqual(0.66);
    expect(controllerSnapshot(controller).tutorial.moved).toBe(false);
    controller.input.right = 0;
    controller.input.forward = 1;
    for (let i = 0; i < 30; i += 1) advanceController(controller, 1 / 60, camera());
    expect(controllerSnapshot(controller).tutorial.moved).toBe(true);
  });
  it('inspection does not replace the two motion lessons, and stored completion still bypasses them', () => {
    const controller = createController();
    const position = { x: 1.95, y: 1.6, z: -5.7 };
    controller.runtime.pose = { position, yaw: 0, pitch: Math.atan2(EMBLEM_FIXTURE.center.y - position.y, position.z - EMBLEM_FIXTURE.center.z) };
    syncCamera(controller, camera());
    Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true }); // Mocked native presentation boundary.
    expect(interactController(controller, 'emblem-panel')).toBe(true);
    expect(controllerSnapshot(controller).tutorial).toMatchObject({ moved: false, looked: false, complete: false });
    expect(controllerSnapshot(createController(createCheckpoint(controller.runtime))).tutorial.complete).toBe(false);
    expect(controllerSnapshot(createController(undefined, false, true)).tutorial.complete).toBe(true);
    const legacy = createCheckpoint(controller.runtime);
    legacy.progress.guideExamined = true;
    expect(controllerSnapshot(createController(legacy)).tutorial.complete).toBe(true);
  });
  it('counts explicit user turns, preserves actual pitch limits and ignores automatic aim assist', () => {
    const controller = createController();
    controller.runtime.progress.sealA = true;
    controller.runtime.pose = { ...OBSERVATION_POSE, yaw: 0.5, pitch: 0.4 };
    commandController(controller, { type: 'hint', stage: 3 });
    commandController(controller, { type: 'aim' });
    expect(controller.runtime.pose.pitch).toBeCloseTo(0);
    expect(controller.runtime.pose.yaw).toBeCloseTo(0);
    expect(controllerSnapshot(controller).tutorial.looked).toBe(false);
    commandController(controller, { type: 'turn', yaw: 0.3, pitch: 0 });
    expect(controllerSnapshot(controller).tutorial.looked).toBe(true);
  });
});

describe('time-based movement and displacement-based look integration, without GL', () => {
  it.each([30, 60, 120])('moves and looks comparably at %s Hz without replay or a second dead zone', (hz) => {
    const controller = createController();
    controller.input.forward = 0.1;
    const initialZ = controller.runtime.pose.position.z;
    for (let frame = 0; frame < hz; frame += 1) advanceController(controller, 1 / hz, camera());
    expect(initialZ - controller.runtime.pose.position.z).toBeCloseTo(MOVE_SPEED * 0.1, 8);
    controller.input.forward = 0;
    commandController(controller, { type: 'sensitivity', value: 1.2, vertical: 0.5 });
    for (let frame = 0; frame < hz; frame += 1) {
      controller.input.lookX += 100 / hz;
      controller.input.lookY += 80 / hz;
      advanceController(controller, 1 / hz, camera());
    }
    expect(controller.runtime.pose.yaw).toBeCloseTo(-0.36, 8);
    expect(controller.runtime.pose.pitch).toBeCloseTo(-0.144, 8);
    const stopped = controller.runtime.pose;
    advanceController(controller, 1 / hz, camera());
    expect(controller.runtime.pose).toEqual(stopped);
  });
  it('rejects nonfinite sensitivity commands without corrupting the camera', () => {
    const controller = createController();
    commandController(controller, { type: 'sensitivity', value: NaN, vertical: Infinity });
    expect(controller.sensitivity).toBe(1);
    expect(controller.verticalSensitivity).toBe(1);
    controller.input.lookX = 20;
    advanceController(controller, 1 / 60, camera());
    expect(Number.isFinite(controller.runtime.pose.yaw)).toBe(true);
  });
});
