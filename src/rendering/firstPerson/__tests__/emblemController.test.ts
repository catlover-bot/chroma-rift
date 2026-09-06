import * as THREE from 'three';

import { createSealStimulus } from '../../../domain/emblem';
import { EMBLEM_FIXTURE, EMBLEM_SWITCHES } from '../../../domain/firstPerson/emblemFixture';
import type { Vec3 } from '../../../domain/firstPerson/types';
import { createCanvasLifecycle } from '../canvasLifecycle';
import { accessibleEmblemTargets, advanceController, commandController, compareController, controllerSnapshot, createController, createEmblemCommand, dispatchEmblemController, interactAccessibleEmblem, interactController, retireController, setControllerForeground, syncCamera, type RuntimeController } from '../runtimeController';

const camera = () => new THREE.PerspectiveCamera(65, 390 / 740, 0.08, 60);
function aim(controller: RuntimeController, target: Vec3, position = { x: 1.95, y: 1.6, z: -5.7 }) {
  const dx = target.x - position.x, dz = target.z - position.z;
  controller.runtime = { ...controller.runtime, pose: { position, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(target.y - position.y, Math.hypot(dx, dz)) } };
  syncCamera(controller, camera());
}
/** Exercise the real lifecycle gate with mocked GL ownership, never a device-frame claim. */
function present(controller: RuntimeController) {
  const lifecycle = createCanvasLifecycle(controller, jest.fn());
  lifecycle.ownRenderer({ dispose: jest.fn() } as unknown as THREE.WebGLRenderer);
  lifecycle.attachRoot({ setFrameloop: jest.fn() });
  lifecycle.commitScene();
  expect(lifecycle.markReady(true)).toBe(false);
  controller.diagnostics.renderReturns = 1; controller.diagnostics.presentationReturns = 1;
  expect(lifecycle.markReady(true)).toBe(true);
  controller.diagnostics.appActive = true;
  return lifecycle;
}
function activeController() {
  const controller = createController();
  aim(controller, EMBLEM_FIXTURE.center); present(controller);
  return controller;
}

describe('native controller host verification with real Three matrices, mocked presentation boundary', () => {
  it('rejects observation before actual lifecycle readiness and consumes the rejected packet', () => {
    const c = createController(); aim(c, EMBLEM_FIXTURE.center);
    const packet = createEmblemCommand(c, { type: 'inspect' });
    expect(dispatchEmblemController(c, packet).reason).toBe('blocked');
    expect(c.runtime.emblem.phase).toBe('unexamined');
    present(c);
    expect(dispatchEmblemController(c, packet).reason).toBe('stale');
    expect(interactController(c, 'emblem-panel')).toBe(true);
    expect(c.runtime.progress.emblem?.phase).toBe('observing');
    expect(c.runtime.progress.sealA).toBe(false);
  });
  it('rejects requested wrong target, old camera, far and occluded targets instead of trusting a HUD ID', () => {
    const c = activeController();
    expect(interactController(c, 'emblem-circle')).toBe(false);
    const current = c.runtime;
    c.runtime = { ...c.runtime, pose: { ...c.runtime.pose, yaw: Math.PI } };
    expect(interactController(c, 'emblem-panel')).toBe(false);
    expect(c.runtime.emblem).toBe(current.emblem);
    aim(c, EMBLEM_FIXTURE.center, { x: 1.95, y: 1.6, z: 1 });
    expect(interactController(c, 'emblem-panel')).toBe(false);
    aim(c, EMBLEM_FIXTURE.center, { x: 4, y: 1.6, z: -7 });
    expect(interactController(c, 'emblem-panel')).toBe(false);
  });
  it('commits wrong switch return, then one release into the existing door without legacy guide/ring work', () => {
    const c = activeController();
    expect(interactController(c, 'emblem-panel')).toBe(true);
    const before = c.runtime.emblem.seed;
    const wrong = EMBLEM_SWITCHES.find((item) => item.glyph !== createSealStimulus(before).answer)!;
    aim(c, wrong.center);
    expect(interactController(c, wrong.id)).toBe(true);
    expect(c.runtime.switchFeedback).toMatchObject({ glyph: wrong.glyph, correct: false });
    expect(c.runtime.progress).toMatchObject({ sealA: false, guideExamined: false, markActivated: false });
    for (let i = 0; i < 30; i++) advanceController(c, 1 / 60, camera());
    expect(c.runtime.switchFeedback).toBeUndefined();
    const correct = EMBLEM_SWITCHES.find((item) => item.glyph === createSealStimulus(before).answer)!;
    aim(c, correct.center);
    const packet = createEmblemCommand(c, { type: 'choose', glyph: correct.glyph });
    const result = dispatchEmblemController(c, packet);
    expect(result.effects.filter((effect) => effect.type === 'seal-released')).toHaveLength(1);
    expect(c.runtime.progress).toMatchObject({ sealA: true, emblem: { phase: 'released', seed: before }, guideExamined: false, markActivated: false });
    expect(c.runtime.doorAOpen).toBe(0);
    const released = c.runtime;
    expect(dispatchEmblemController(c, packet).reason).toBe('stale');
    expect(interactController(c, correct.id)).toBe(false);
    expect(c.runtime).toBe(released);
    for (let i = 0; i < 90; i++) advanceController(c, 1 / 60, camera());
    expect(c.runtime.doorAOpen).toBe(1);
  });
  it.each(['pause', 'background', 'failure', 'retire', 'diagnostics'] as const)('rejects %s observations and glyph packets', (mode) => {
    const c = activeController();
    const old = c.runtime.emblem;
    if (mode === 'pause') commandController(c, { type: 'pause' });
    if (mode === 'background') setControllerForeground(c, false);
    if (mode === 'failure') c.diagnostics.stage = 'failed';
    if (mode === 'retire') retireController(c);
    if (mode === 'diagnostics') c.diagnostics.open = true;
    expect(interactController(c, 'emblem-panel')).toBe(false);
    expect(c.runtime.emblem.phase).toBe(old.phase);
    expect(c.runtime.progress.sealA).toBe(false);
  });
  it('rejects an old-session command after retry, even with a larger sequence number', () => {
    const old = activeController(), replacement = activeController();
    const packet = createEmblemCommand(old, { type: 'inspect' });
    expect(old.runtime.emblem.sessionId).not.toBe(replacement.runtime.emblem.sessionId);
    expect(dispatchEmblemController(replacement, { ...packet, seq: 9999 }).reason).toBe('stale');
    retireController(old);
    commandController(old, { type: 'resume' });
    expect(old.runtime.paused).toBe(true);
    expect(interactController(old, 'emblem-panel')).toBe(false);
  });
  it('keeps comparison camera/geometry fixed, publishes both directions, and does not unlock with all hints/assistance', () => {
    const c = activeController(), pose = c.runtime.pose, original = controllerSnapshot(c).key;
    expect(compareController(c, 1000)).toBe(true);
    const neutral = controllerSnapshot(c).key;
    expect(neutral).not.toBe(original);
    expect(compareController(c, 1999)).toBe(false);
    expect(compareController(c, 2000)).toBe(true);
    expect(controllerSnapshot(c).key).not.toBe(neutral);
    expect(c.runtime.pose).toBe(pose);
    commandController(c, { type: 'pause' });
    for (const stage of [1, 2, 3] as const) commandController(c, { type: 'hint', stage });
    dispatchEmblemController(c, createEmblemCommand(c, { type: 'assist', enabled: true }));
    expect(c.runtime.emblem).toMatchObject({ hintTier: 3, assist: true, phase: 'unexamined', seed: 21 });
    expect(c.runtime.progress.hintStage).toBe(3);
    expect(c.runtime.progress.sealA).toBe(false);
  });
  it('VoiceOver semantic choices verify visible fixture/range without turning or bypassing the key', () => {
    const c = activeController();
    expect(accessibleEmblemTargets(c)).toEqual([]);
    c.screenReader = true;
    expect(accessibleEmblemTargets(c).map((target) => target.id)).toContain('emblem-panel');
    expect(interactAccessibleEmblem(c, 'emblem-panel')).toBe(true);
    const pose = c.runtime.pose;
    const correct = EMBLEM_SWITCHES.find((item) => item.glyph === createSealStimulus(c.runtime.emblem.seed).answer)!;
    expect(interactAccessibleEmblem(c, 'key')).toBe(false);
    expect(interactAccessibleEmblem(c, correct.id)).toBe(true);
    expect(c.runtime.pose).toBe(pose);
    expect(c.runtime.progress.sealA).toBe(true);
    expect(c.runtime.progress.sealB).toBe(false);
    setControllerForeground(c, false);
    expect(accessibleEmblemTargets(c)).toEqual([]);
  });
});
