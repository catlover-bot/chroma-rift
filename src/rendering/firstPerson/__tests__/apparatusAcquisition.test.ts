import * as THREE from 'three';
import { createCheckpoint } from '../../../domain/firstPerson/checkpoint';
import { isSafePose } from '../../../domain/firstPerson/geometry';
import { evaluateInteraction } from '../../../domain/firstPerson/interaction';
import type { PlayerPose } from '../../../domain/firstPerson/types';
import { VAULT_CHAPTER_ID, VAULT_LENGTH_FIXTURE } from '../../../domain/vault/definition';
import { createCanvasLifecycle } from '../canvasLifecycle';
import { acquisitionResult, fixtureAcquisition } from '../manipulationProjection';
import { controllerSnapshot, createController, syncCamera, worldForController } from '../runtimeController';
import { vaultAction, vaultDeviceAcquisition } from '../vaultController';

function setup(width = 390, height = 844) {
  const c = createController(undefined, false, true, VAULT_CHAPTER_ID);
  c.viewport = { width, height };
  const camera = new THREE.PerspectiveCamera(65, width / height, .08, 60);
  const lifecycle = createCanvasLifecycle(c, jest.fn());
  lifecycle.ownRenderer({ dispose: jest.fn() } as unknown as THREE.WebGLRenderer);
  lifecycle.attachRoot({ setFrameloop: jest.fn() }); lifecycle.commitScene();
  c.diagnostics.renderReturns = c.diagnostics.presentationReturns = 1;
  expect(lifecycle.markReady(true)).toBe(true); c.diagnostics.appActive = true;
  const pose = (position: PlayerPose['position'], yaw = Math.PI, pitch = 0) => {
    c.runtime.pose = { position, yaw, pitch }; syncCamera(c, camera);
  };
  pose(c.runtime.pose.position);
  return { c, camera, lifecycle, pose };
}

describe('apparatus acquisition matches actual activation', () => {
  it('rejects the video-like partially visible near board and updates the same target snapshot', () => {
    const { c, pose, lifecycle } = setup();
    const ready = controllerSnapshot(c);
    expect(ready.acquisition?.kind).toBe('ready');
    pose({ x: -1.15, y: 1.6, z: .9 });
    expect(evaluateInteraction(worldForController(c), c.runtime.pose, c.runtime.progress, c.matrices).kind).toBe('ready');
    const near = controllerSnapshot(c), before = createCheckpoint(c.runtime), cameraPose = c.runtime.pose;
    expect(near.target?.id).toBe(ready.target?.id);
    expect(near.key).not.toBe(ready.key);
    expect(near.acquisition).toEqual(acquisitionResult('vault-length', 'tooNear'));
    expect(vaultAction(c, { type: 'enter', puzzle: 'length' })).toBe(false);
    expect(c.feedbackMessage).toBe(near.acquisition!.message);
    expect(createCheckpoint(c.runtime)).toEqual(before); expect(c.runtime.pose).toBe(cameraPose);
    lifecycle.close();
  });
  it.each([[320, 568], [390, 844], [430, 932]])('supports a supported 1.2m × 0.6m observation area at %sx%s', (w, h) => {
    const { c, pose, lifecycle } = setup(w, h), world = worldForController(c);
    const original = createCheckpoint(c.runtime);
    // A sampled area, with independent collision checks and small yaw errors;
    // neither board geometry, solution nor camera is changed by acquisition.
    for (const x of [-1.75, -1.15, -.55]) for (const z of [-1.6, -1.3, -1.0]) for (const error of [-.02, 0, .02]) {
      const p = { x, y: 1.6, z }, t = VAULT_LENGTH_FIXTURE.center;
      pose(p, Math.atan2(-(t.x - x), -(t.z - z)) + error);
      expect(isSafePose(c.runtime.pose, world)).toBe(true);
      expect(vaultDeviceAcquisition(c, 'length').kind).toBe('ready');
      expect(vaultAction(c, { type: 'enter', puzzle: 'length' })).toBe(true);
      expect(vaultAction(c, { type: 'leave' })).toBe(true);
    }
    expect(c.runtime.progress.vault?.length).toEqual(original.progress.vault?.length);
    lifecycle.close();
  });
  it('uses the current camera and presentation state and never acquires from a stale result', () => {
    const { c, pose, lifecycle } = setup();
    expect(vaultDeviceAcquisition(c, 'length').kind).toBe('ready');
    c.runtime.pose = { ...c.runtime.pose, yaw: c.runtime.pose.yaw + .1 };
    expect(vaultDeviceAcquisition(c, 'length').kind).toBe('busy');
    expect(vaultAction(c, { type: 'enter', puzzle: 'length' })).toBe(false);
    pose({ x: -1.15, y: 1.6, z: -1.2 });
    c.diagnostics.appActive = false;
    expect(vaultDeviceAcquisition(c, 'length').kind).toBe('busy');
    expect(vaultAction(c, { type: 'enter', puzzle: 'length' })).toBe(false);
    lifecycle.close();
  });
  it('reports far and all four clipped edges without accepting an invisible fixture', () => {
    const { c, pose, lifecycle } = setup();
    const world = { ...worldForController(c), solids: [] };
    const actual = world.interactables.find(t => t.id === 'vault-length')!;
    const target = { ...actual, center: { x: 0, y: 1.6, z: -5 }, rectangle: { ...actual.rectangle!, width: 1.4, right: { x: 1, y: 0, z: 0 }, normal: { x: 0, y: 0, z: 1 } } };
    const check = () => fixtureAcquisition(c.runtime.pose, c.matrices, world, target, { width: 390, height: 844, top: 70, bottom: 90, side: 10, padding: .08 });
    pose({ x: 0, y: 1.6, z: 2 }, 0); expect(check().kind).toBe('tooFar');
    for (const [yaw, pitch, expected] of [
      [-.2, 0, 'offscreenLeft'], [.2, 0, 'offscreenRight'], [0, -.4, 'offscreenTop'], [0, .4, 'offscreenBottom'],
    ] as const) {
      pose({ x: 0, y: 1.6, z: 0 }, yaw, pitch); expect(check().kind).toBe(expected);
    }
    pose({ x: 0, y: 1.6, z: 0 }, 0);
    expect(check().kind).toBe('ready');
    expect(fixtureAcquisition(c.runtime.pose, c.matrices, world, target, { width: 390, height: 844, top: 400 }).kind).toBe('offscreenTop');
    expect(fixtureAcquisition(c.runtime.pose, c.matrices, world, target, { width: NaN, height: 844 }).kind).toBe('busy');
    lifecycle.close();
  });
  it('preserves complete-pyramid occlusion including thin blockers between corner and center rays', () => {
    const { c, lifecycle } = setup(), world = worldForController(c);
    const target = world.interactables.find(t => t.id === 'vault-length')!;
    const thin = { id: 'thin-opaque-obstacle', min: { x: -.78, y: 1.82, z: 1 }, max: { x: -.75, y: 1.85, z: 1.03 }, kind: 'wall' as const, opaque: true };
    expect(fixtureAcquisition(c.runtime.pose, c.matrices, { ...world, solids: [...world.solids, thin] }, target).kind).toBe('occluded');
    expect(fixtureAcquisition(c.runtime.pose, c.matrices, { ...world, solids: [...world.solids, { ...thin, opaque: false }] }, target).kind).toBe('ready');
    lifecycle.close();
  });
});
