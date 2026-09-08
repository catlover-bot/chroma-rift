import * as THREE from 'three';
import { createGalleryAudioOwner } from '../../../audio/owner';
import { DEFAULT_AUDIO_PREFERENCES } from '../../../audio/preferences';
import { createCheckpoint, MOVE_SPEED, projectWithCamera, segmentOccluded, type CheckpointState, type Vec3 } from '../../../domain/firstPerson';
import { actorMotionEye } from '../../../domain/actorMotion';
import { restoreVaultCheckpoint } from '../../../domain/vault/checkpoint';
import { VAULT_CHAPTER_ID, VAULT_LENGTH_FIXTURE, VAULT_ROD_FIXTURE, VAULT_EXIT_FIXTURE, VAULT_PARTITION_FIXTURE, vaultFixture } from '../../../domain/vault/definition';
import { LENGTH_SPEC, ROD_SPEC } from '../../../domain/vault/specs';
import type { VaultDevice } from '../../../domain/vault/types';
import { createCanvasLifecycle } from '../canvasLifecycle';
import { vaultAction, vaultPointer } from '../vaultController';
import { advanceController, commandController, createController, interactController, syncCamera, worldForController, type RuntimeController } from '../runtimeController';

const WIDTH = 390, HEIGHT = 844;
function setup(intensity: 'standard' | 'subdued', muted: boolean, checkpoint?: CheckpointState) {
  const controller = createController(checkpoint, false, true, VAULT_CHAPTER_ID), camera = new THREE.PerspectiveCamera(65, WIDTH / HEIGHT, .08, 60);
  controller.horrorIntensity = intensity; controller.viewport = { width: WIDTH, height: HEIGHT }; syncCamera(controller, camera);
  const renderer = { dispose: jest.fn() }, lifecycle = createCanvasLifecycle(controller, jest.fn());
  lifecycle.ownRenderer(renderer as unknown as THREE.WebGLRenderer); lifecycle.attachRoot({ setFrameloop: jest.fn() }); lifecycle.commitScene();
  expect(lifecycle.markReady(true)).toBe(false);
  controller.diagnostics.renderReturns = 1; controller.diagnostics.presentationReturns = 1;
  expect(lifecycle.markReady(true)).toBe(true); controller.diagnostics.appActive = true;
  controller.audio = createGalleryAudioOwner({ sessionId: String(controller.runtime.session), preferences: { ...DEFAULT_AUDIO_PREFERENCES, enabled: !muted } }, {
    availability: 'available', prepare: async () => undefined,
    createPlayer: () => ({ isLoaded: true, volume: 0, loop: false, play: jest.fn(), pause: jest.fn(), seekTo: async () => undefined, release: jest.fn() }),
  });
  controller.audio.setActive(true);
  return { controller, camera, lifecycle, renderer };
}
function lookAt(controller: RuntimeController, camera: THREE.PerspectiveCamera, target: Vec3) {
  const pose = controller.runtime.pose, dx = target.x - pose.position.x, dz = target.z - pose.position.z;
  const desired = Math.atan2(-dx, -dz), change = Math.atan2(Math.sin(desired - pose.yaw), Math.cos(desired - pose.yaw));
  commandController(controller, { type: 'turn', yaw: change, pitch: Math.atan2(target.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch }); syncCamera(controller, camera);
}
/** Real continuous controller input, player collision, camera, AI and hearing.
 * Only successful GL presentation is mocked here; WebGL clips are separate. */
function track(controller: RuntimeController, phases: Set<string>) {
  const actor = controller.runtime.vault!.actor;
  phases.add(actor.phase);
  if (actor.phase === 'search' && actor.lastSeen && segmentOccluded(actorMotionEye(actor.motion).position, controller.runtime.pose.position, worldForController(controller))) phases.add('occluded-search');
}
function walk(controller: RuntimeController, camera: THREE.PerspectiveCamera, x: number, z: number, phases: Set<string>, speed = 1) {
  for (let frame = 0; frame < 1800; frame++) {
    const p = controller.runtime.pose.position, remaining = Math.hypot(x - p.x, z - p.z);
    if (remaining < .02) { controller.input.forward = 0; return; }
    lookAt(controller, camera, { x, y: p.y, z }); controller.input.forward = speed;
    const before = controller.runtime.pose.position;
    advanceController(controller, Math.min(1 / 60, remaining / (MOVE_SPEED * speed)), camera);
    track(controller, phases);
    const after = controller.runtime.pose.position;
    if (Math.hypot(after.x - before.x, after.z - before.z) > MOVE_SPEED / 60 + .001) throw new Error(`Caught at ${JSON.stringify(before)} while walking to ${x},${z}`);
  }
  throw new Error(`Blocked at ${JSON.stringify(controller.runtime.pose.position)} toward ${x},${z}; actor=${JSON.stringify({ phase: controller.runtime.vault!.actor.phase, position: controller.runtime.vault!.actor.motion.position })}`);
}
function wait(controller: RuntimeController, camera: THREE.PerspectiveCamera, seconds: number, phases: Set<string>) {
  controller.input.forward = 0;
  const pose = controller.runtime.pose;
  for (let frame = 0; frame < seconds * 60; frame++) {
    advanceController(controller, 1 / 60, camera); track(controller, phases);
    expect(controller.runtime.pose).toEqual(pose);
  }
}
function pointerPoint(controller: RuntimeController, puzzle: VaultDevice, x: number, y: number) {
  const f = vaultFixture(puzzle), n = f.normal, r = f.right, up = { x: n.y * r.z - n.z * r.y, y: n.z * r.x - n.x * r.z, z: n.x * r.y - n.y * r.x };
  const projected = projectWithCamera({ x: f.center.x + r.x * x + up.x * y, y: f.center.y + r.y * x + up.y * y, z: f.center.z + r.z * x + up.z * y }, controller.matrices!);
  expect(projected).toBeDefined(); return { x: (projected!.x + 1) * WIDTH / 2, y: (1 - projected!.y) * HEIGHT / 2 };
}
function solve(controller: RuntimeController, camera: THREE.PerspectiveCamera, puzzle: VaultDevice, aids: boolean) {
  lookAt(controller, camera, puzzle === 'length' ? VAULT_LENGTH_FIXTURE.center : VAULT_ROD_FIXTURE.center);
  expect(interactController(controller, puzzle === 'length' ? 'vault-length' : 'vault-rod')).toBe(true);
  expect(controller.runtime.vault!.mode).toBe(puzzle);
  if (aids) for (const aid of puzzle === 'length' ? ['finsHidden', 'lengthGuide'] as const : ['frameHidden', 'plumb'] as const) expect(vaultAction(controller, { type: 'aid', aid, enabled: true })).toBe(true);
  const live = controller.runtime.vault!;
  const start = puzzle === 'length' ? pointerPoint(controller, puzzle, LENGTH_SPEC.left + live.length, LENGTH_SPEC.sliderY) : pointerPoint(controller, puzzle, Math.sin(live.angle) * ROD_SPEC.length / 2, Math.cos(live.angle) * ROD_SPEC.length / 2);
  const end = puzzle === 'length' ? pointerPoint(controller, puzzle, LENGTH_SPEC.left + LENGTH_SPEC.targetLength, LENGTH_SPEC.sliderY) : pointerPoint(controller, puzzle, 0, ROD_SPEC.length / 2);
  expect(vaultPointer(controller, 'start', 17, start, WIDTH, HEIGHT)).toBe(true);
  expect(vaultPointer(controller, 'move', 17, end, WIDTH, HEIGHT)).toBe(true);
  expect(controller.runtime.progress.vault![puzzle].solved).toBe(false);
  expect(vaultAction(controller, { type: 'commit' })).toBe(false);
  expect(vaultPointer(controller, 'end', 17, end, WIDTH, HEIGHT)).toBe(true);
  expect(vaultAction(controller, { type: 'commit' })).toBe(true);
  expect(controller.runtime.progress.vault![puzzle].solved).toBe(true);
  expect(vaultAction(controller, { type: 'commit' })).toBe(false);
  expect(vaultAction(controller, { type: 'leave' })).toBe(true);
}

describe('vault full routes through the shared controller and real geometry', () => {
  it('physically evades an observed pursuit, waits through remembered-position search and return inside the actual brake grille', () => {
    const run = setup('standard', false), { controller, camera } = run, phases = new Set<string>();
    solve(controller, camera, 'length', false);
    for (const [x, z] of [[.65, 2.9], [.65, 4.5], [0, 6.5], [-2.2, 7.2], [-2.2, 11.5], [-2.2, 15.5], [-3.1, 18.5], [-4.6, 18.5]]) walk(controller, camera, x!, z!, phases);
    expect([...phases]).toEqual(expect.arrayContaining(['notice', 'pursue', 'occluded-search']));
    const safe = controller.runtime.pose, searchIndices = new Set<number>();
    controller.input.forward = 0;
    for (let frame = 0; frame < 1800 && !phases.has('return'); frame++) {
      advanceController(controller, 1 / 60, camera); track(controller, phases);
      const actor = controller.runtime.vault!.actor;
      if (actor.phase === 'search' && actor.searchDwellSeconds > 0) searchIndices.add(actor.searchIndex);
      expect(controller.runtime.pose).toEqual(safe);
      expect(actor.motion.position.x).toBeGreaterThan(-4);
    }
    expect(phases.has('return')).toBe(true); expect([...searchIndices]).toEqual([0, 1, 2]);
    expect(controller.runtime.vault!.checkpointId).toBe('brake');
    expect(controller.runtime.progress.vault!.rod.solved).toBe(false);
    run.lifecycle.close(); expect(run.renderer.dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['west', 'standard', false, false, false], ['east', 'standard', true, true, false],
    ['west', 'subdued', true, false, false], ['east', 'subdued', false, true, false],
    ['west', 'standard', true, true, true], ['east', 'standard', false, false, true],
  ] as const)('completes %s route (%s, muted=%s, aids=%s, cold brake resume=%s)', (lane, intensity, muted, aids, resume) => {
    let run = setup(intensity, muted), { controller, camera } = run;
    const phases = new Set<string>(), initialWorld = worldForController(controller);
    expect(initialWorld.interactables.map(t => t.id)).not.toEqual(expect.arrayContaining(['emblem-panel', 'shadow-panel', 'contour-panel', 'wiring-panel', 'key']));
    solve(controller, camera, 'length', aids);
    expect(controller.runtime.progress.vault!.story.revealStarted).toBe(false);
    walk(controller, camera, .65, 2.9, phases); walk(controller, camera, .65, 4.5, phases); walk(controller, camera, 0, 6.5, phases);
    expect(controller.runtime.progress.vault!.story.revealStarted).toBe(true);
    if (lane === 'west') {
      walk(controller, camera, -2.2, 7.2, phases); walk(controller, camera, -2.2, 11.5, phases); walk(controller, camera, -2.2, 15.5, phases);
      walk(controller, camera, -3.1, 18.5, phases);
    } else {
      walk(controller, camera, 4.2, 6.5, phases); walk(controller, camera, 4.2, 9, phases); walk(controller, camera, 2.3, 9, phases);
      walk(controller, camera, 2.3, 11.5, phases); walk(controller, camera, 2.3, 17.8, phases); walk(controller, camera, 0, 18.5, phases); walk(controller, camera, -3.1, 18.5, phases);
    }
    walk(controller, camera, -4.6, 18.5, phases);
    expect(controller.runtime.vault!.checkpointId).toBe('brake');
    expect(controller.runtime.progress.vault!.rod.solved).toBe(false);
    if (resume) {
      const saved = restoreVaultCheckpoint(createCheckpoint(controller.runtime))!.checkpoint;
      run.lifecycle.close(); run = setup(intensity, muted, saved); controller = run.controller; camera = run.camera;
      expect(controller.runtime.vault!.actor.startupGrace).toBeGreaterThan(2.5);
      expect(controller.runtime.vault!.actor.lastSeen).toBeUndefined();
    }
    solve(controller, camera, 'rod', aids);
    expect(controller.runtime.progress.vault!.finalDoorClosed).toBe(false);
    // A physically narrow grille protects this working bay even while the
    // actor remembers and investigates the sound outside it.
    wait(controller, camera, 1, phases);
    walk(controller, camera, -3.1, 18.5, phases); walk(controller, camera, 0, 18.5, phases); walk(controller, camera, 3, 18.5, phases);
    walk(controller, camera, 3, 21, phases); walk(controller, camera, 3, 24.3, phases);
    lookAt(controller, camera, VAULT_PARTITION_FIXTURE.center);
    expect(interactController(controller, 'vault-partition')).toBe(true);
    const eye = actorMotionEye(controller.runtime.vault!.actor.motion);
    expect(segmentOccluded(eye.position, controller.runtime.pose.position, worldForController(controller))).toBe(true);
    walk(controller, camera, 3, 29, phases);
    expect(controller.runtime.progress.cleared).toBe(false); expect(controller.runtime.vault!.checkpointId).toBe('exit');
    expect(interactController(controller, 'vault-exit')).toBe(false);
    lookAt(controller, camera, VAULT_EXIT_FIXTURE.center);
    expect(interactController(controller, 'vault-exit')).toBe(true); expect(interactController(controller, 'vault-exit')).toBe(false);
    expect(controller.runtime.progress).toMatchObject({ sealA: false, sealB: false, variant: 'entrance', cleared: true });
    expect(controller.runtime.vault!.actor.phase).toBe('resolved'); expect(controller.runtime.vault!.exitClosureSeconds).toBe(1.4);
    const after = restoreVaultCheckpoint(createCheckpoint(controller.runtime))!.checkpoint;
    const coldClear = createController(after);
    expect(coldClear.runtime.progress).toEqual(controller.runtime.progress);
    expect(worldForController(coldClear).solids.find(s => s.id === 'vault-final-door')!.min.y).toBe(0);
    expect(worldForController(controller).solids.find(s => s.id === 'vault-final-door')!.min.y).toBeCloseTo(3.3, 8);
    wait(controller, camera, .25, phases);
    expect(worldForController(controller).solids.find(s => s.id === 'vault-final-door')!.min.y).toBeCloseTo(0, 8);
    expect(controller.runtime.progress).toEqual(after.progress);
    wait(controller, camera, 1.2, phases); expect(controller.runtime.vault!.exitClosureSeconds).toBe(0);
    if (intensity === 'standard' && lane === 'west' && !resume) expect([...phases]).toEqual(expect.arrayContaining(['notice', 'pursue', 'occluded-search']));
    if (intensity === 'subdued') expect([...phases].some(phase => ['notice', 'pursue', 'attack'].includes(phase))).toBe(false);
    run.lifecycle.close(); expect(run.renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
