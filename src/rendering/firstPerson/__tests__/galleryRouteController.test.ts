import * as THREE from 'three';
import { createCheckpoint, isSafePose, MOVE_SPEED, segmentOccluded, type Vec3 } from '../../../domain/firstPerson';
import { createContourSpec, createGalleryRuntime, createShadowSpec, GALLERY_CONTOUR_FIXTURE, GALLERY_LIGHT_FIXTURE, GALLERY_EXIT_PANEL_FIXTURE, GALLERY_SHADOW_FIXTURE, GALLERY_WIRING_FIXTURE, GALLERY_MASK_FIXTURE, GALLERY_MASK_WINDOW_FIXTURE, GALLERY_HYBRID_FIXTURE, normalizeAngle, restoreGalleryCheckpoint, type GalleryPuzzle } from '../../../domain/gallery';
import { createCanvasLifecycle } from '../canvasLifecycle';
import { galleryAction } from '../galleryController';
import { advanceController, commandController, createController, interactController, syncCamera, worldForController, type RuntimeController } from '../runtimeController';

function lookAt(controller: RuntimeController, camera: THREE.PerspectiveCamera, target: Vec3) {
  const pose = controller.runtime.pose, dx = target.x - pose.position.x, dz = target.z - pose.position.z;
  commandController(controller, { type: 'turn', yaw: normalizeAngle(Math.atan2(-dx, -dz) - pose.yaw), pitch: Math.atan2(target.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch });
  syncCamera(controller, camera);
}
/** Continuous shaped forward input exercises the real controller, camera and
 * collision. Pointer routing itself is covered by the manipulation/touch suites. */
function walk(controller: RuntimeController, camera: THREE.PerspectiveCamera, x: number, z: number, phases?: Set<string>) {
  for (let frame = 0; frame < 2200; frame++) {
    const pose = controller.runtime.pose, distance = Math.hypot(x - pose.position.x, z - pose.position.z);
    if (distance < 0.02 || controller.runtime.progress.cleared) { controller.input.forward = 0; return; }
    lookAt(controller, camera, { x, y: pose.position.y, z });
    controller.input.forward = 1;
    advanceController(controller, Math.min(1 / 60, distance / MOVE_SPEED), camera);
    phases?.add(controller.runtime.gallery!.actor.phase);
    const after = controller.runtime.pose.position;
    if (Math.hypot(after.x - pose.position.x, after.z - pose.position.z) > MOVE_SPEED / 60 + .001) throw new Error('The route was caught instead of safely passing the actor');
  }
  throw new Error(`Controller route blocked at ${JSON.stringify(controller.runtime.pose.position)} toward ${x},${z}`);
}
function waitForPass(controller: RuntimeController, camera: THREE.PerspectiveCamera, beforeZ: number) {
  controller.input.forward = 0; const pose = controller.runtime.pose;
  for (let frame = 0; frame < 2700; frame++) {
    const actor = controller.runtime.gallery!.actor;
    if (actor.phase === 'patrol' && actor.position.z < beforeZ && Math.abs(actor.yaw) < .2) return;
    advanceController(controller, 1 / 60, camera);
    expect(controller.runtime.pose).toEqual(pose);
  }
  throw new Error('Patrol never provided a safe passing window');
}
function evadeObservedPursuit(controller: RuntimeController, camera: THREE.PerspectiveCamera) {
  controller.input.forward = 0;
  // Step out at the south end while the actor approaches from the north. This
  // creates a real detection opportunity without entering its contact range.
  for (let frame = 0; frame < 3000; frame++) {
    const actor = controller.runtime.gallery!.actor;
    if (actor.phase === 'patrol' && actor.position.z >= 15 && actor.position.z <= 15.8 && Math.abs(actor.yaw) < .2) break;
    advanceController(controller, 1 / 60, camera);
    if (frame === 2999) throw new Error('No authored pursuit opportunity');
  }
  const phases = new Set<string>();
  walk(controller, camera, 1.7, 12.5, phases); walk(controller, camera, 4, 12.5, phases);
  controller.input.forward = 0;
  for (let frame = 0; frame < 150 && controller.runtime.gallery!.actor.phase !== 'approach'; frame++) {
    advanceController(controller, 1 / 60, camera); phases.add(controller.runtime.gallery!.actor.phase);
  }
  expect(phases.has('noticed')).toBe(true); expect(controller.runtime.gallery!.actor.phase).toBe('approach');
  walk(controller, camera, 1.7, 12.5, phases); walk(controller, camera, 1.7, 13.8, phases);
  expect(segmentOccluded({ ...controller.runtime.gallery!.actor.position, y: 1.82 }, controller.runtime.pose.position, worldForController(controller))).toBe(true);
  const lastSeen = controller.runtime.gallery!.actor.lastSeen, refuge = controller.runtime.pose;
  expect(lastSeen).toBeDefined(); expect(phases.has('search')).toBe(true);
  controller.input.forward = 0;
  for (let frame = 0; frame < 260 && controller.runtime.gallery!.actor.phase === 'search'; frame++) {
    expect(controller.runtime.gallery!.actor.lastSeen).toEqual(lastSeen);
    advanceController(controller, 1 / 60, camera); phases.add(controller.runtime.gallery!.actor.phase);
    expect(controller.runtime.pose).toEqual(refuge);
  }
  expect(controller.runtime.gallery!.actor.phase).toBe('patrol');
  expect(phases).toEqual(new Set(['patrol', 'noticed', 'approach', 'search']));
}
function solveWing(controller: RuntimeController, puzzle: GalleryPuzzle, assistance: boolean) {
  expect(interactController(controller, puzzle === 'shadow' ? 'shadow-panel' : 'contour-panel')).toBe(true);
  expect(controller.runtime.gallery!.mode).toBe(puzzle);
  if (puzzle === 'shadow') {
    if (assistance) expect(galleryAction(controller, { type: 'compare' })).toBe(true);
    const state = controller.runtime.progress.gallery!.shadow;
    const pair = createShadowSpec(state.seed, state.variant).samples.filter(sample => sample.color === '#808080');
    expect(galleryAction(controller, { type: 'shadow-place', sampleId: pair[0]!.id, slotId: 'socket-left' })).toBe(true);
    expect(galleryAction(controller, { type: 'shadow-place', sampleId: pair[1]!.id, slotId: 'socket-right' })).toBe(true);
    expect(controller.runtime.progress.gallery!.shadow.solved).toBe(false);
    expect(galleryAction(controller, { type: 'shadow-commit' })).toBe(true);
  } else {
    if (assistance) expect(galleryAction(controller, { type: 'guide', enabled: true })).toBe(true);
    const spec = createContourSpec(controller.runtime.progress.gallery!.contour.seed);
    for (const disc of spec.discs) expect(galleryAction(controller, { type: 'contour-adjust', discId: disc.id, delta: normalizeAngle(disc.targetAngle - controller.runtime.gallery!.contourAngles[disc.id]) })).toBe(true);
    expect(controller.runtime.progress.gallery!.contour.solved).toBe(false);
    expect(galleryAction(controller, { type: 'contour-commit' })).toBe(true);
  }
  expect(controller.runtime.progress.gallery!.powerTaken[puzzle]).toBe(false);
  expect(galleryAction(controller, { type: 'take-power', puzzle })).toBe(true);
  expect(galleryAction(controller, { type: 'take-power', puzzle })).toBe(false);
  expect(galleryAction(controller, { type: 'leave' })).toBe(true);
}

describe('revised gallery in the shared live camera/controller with a mocked GL-ready boundary', () => {
  it.each([['shadow', 'contour', 'standard', true], ['contour', 'shadow', 'standard', true], ['shadow', 'contour', 'subdued', true], ['contour', 'shadow', 'subdued', true], ['shadow', 'contour', 'standard', false], ['contour', 'shadow', 'standard', false]] as const)('walks light → %s → %s → two-power gate → wiring → safe retreats → final closed door (%s, light first=%s)', (first, second, intensity, lightFirst) => {
    const controller = createController(createCheckpoint(createGalleryRuntime())), camera = new THREE.PerspectiveCamera(65, 390 / 844, 0.08, 60);
    controller.horrorIntensity = intensity;
    syncCamera(controller, camera);
    const renderer = { dispose: jest.fn() }, lifecycle = createCanvasLifecycle(controller, jest.fn());
    lifecycle.ownRenderer(renderer as unknown as THREE.WebGLRenderer); lifecycle.attachRoot({ setFrameloop: jest.fn() }); lifecycle.commitScene();
    expect(lifecycle.markReady(true)).toBe(false);
    controller.diagnostics.renderReturns = 1; controller.diagnostics.presentationReturns = 1;
    expect(lifecycle.markReady(true)).toBe(true); controller.diagnostics.appActive = true;
    const initial = worldForController(controller);
    expect(initial.interactables.some(t => t.id.startsWith('emblem-') || t.id === 'key')).toBe(false);
    if (lightFirst) {
      lookAt(controller, camera, GALLERY_LIGHT_FIXTURE.center);
      expect(interactController(controller, 'gallery-light')).toBe(true);
      expect(controller.runtime.progress.gallery!.emergencyLit).toBe(true);
      lookAt(controller, camera, GALLERY_EXIT_PANEL_FIXTURE.center);
      expect(interactController(controller, 'gallery-exit-panel')).toBe(true);
      expect(controller.runtime.progress.gallery!.exitInspected).toBe(true);
    }
    if (first === 'shadow' && intensity === 'standard' && lightFirst) {
      walk(controller, camera, 0, -5); lookAt(controller, camera, GALLERY_MASK_FIXTURE.center);
      expect(interactController(controller, 'mask-exhibit')).toBe(true);
      walk(controller, camera, 1.7, -3.6); lookAt(controller, camera, GALLERY_MASK_WINDOW_FIXTURE.center);
      expect(interactController(controller, 'mask-window')).toBe(true);
      expect(controller.runtime.progress.gallery!.maskWindowOpen).toBe(true);
      walk(controller, camera, 0, -6.5); lookAt(controller, camera, GALLERY_HYBRID_FIXTURE.center);
      expect(interactController(controller, 'hybrid-exhibit')).toBe(true);
      expect(controller.runtime.progress.gallery!.discoveries).toMatchObject({ mask: true, hybrid: true });
    }
    walk(controller, camera, 0, -10);
    for (const [index, puzzle] of [first, second].entries()) {
      if (puzzle === 'shadow') { walk(controller, camera, -3, -9.6); walk(controller, camera, -7, -9.6); walk(controller, camera, -7, -10.7); }
      else { walk(controller, camera, 9, -10); walk(controller, camera, 9, -10.7); }
      lookAt(controller, camera, puzzle === 'shadow' ? GALLERY_SHADOW_FIXTURE.center : GALLERY_CONTOUR_FIXTURE.center);
      solveWing(controller, puzzle, index === 0 && lightFirst);
      if (puzzle === 'shadow') { walk(controller, camera, -7, -9.6); walk(controller, camera, -3, -9.6); walk(controller, camera, 0, -10); }
      else { walk(controller, camera, 9, -10); walk(controller, camera, 0, -10); }
      if (index === 0) {
        expect(controller.runtime.gallery!.serviceDoorOpen).toBe(0);
        walk(controller, camera, 0, 2); lookAt(controller, camera, GALLERY_EXIT_PANEL_FIXTURE.center);
        expect(galleryAction(controller, { type: 'connect-power' })).toBe(false);
        lookAt(controller, camera, { x: 0, y: 1.6, z: 9 }); controller.input.forward = 1;
        for (let frame = 0; frame < 150; frame++) advanceController(controller, 1 / 60, camera);
        expect(controller.runtime.pose.position.z).toBeLessThan(6);
        expect(controller.runtime.progress.gallery!.powerConnected).toBe(false);
        walk(controller, camera, 0, -10);
      }
    }
    expect(controller.runtime.progress.gallery!.order).toEqual(first === 'shadow' ? ['B', 'C'] : ['C', 'B']);
    walk(controller, camera, 0, 2); lookAt(controller, camera, GALLERY_EXIT_PANEL_FIXTURE.center);
    expect(interactController(controller, 'gallery-exit-panel')).toBe(true);
    expect(controller.runtime.progress.gallery!.powerConnected).toBe(true);
    expect(controller.runtime.progress.gallery!.emergencyLit).toBe(true);
    expect(controller.runtime.gallery!.actor.visible).toBe(true);
    walk(controller, camera, 0, 7);
    expect(controller.runtime.gallery!.actor.visible).toBe(true);
    expect(worldForController(controller).solids.find(solid => solid.id === 'gallery-wiring-shutter')!.min.y).toBe(0);
    walk(controller, camera, -1.2, 7); walk(controller, camera, -1.2, 9.8);
    lookAt(controller, camera, GALLERY_WIRING_FIXTURE.center);
    expect(interactController(controller, 'wiring-panel')).toBe(true);
    expect(controller.runtime.gallery!.mode).toBe('wiring');
    if (lightFirst) expect(galleryAction(controller, { type: 'wiring-adjust', control: 'cover', delta: -.97 })).toBe(true);
    expect(galleryAction(controller, { type: 'wiring-adjust', control: 'line', delta: -.24 })).toBe(true);
    expect(controller.runtime.progress.gallery!.wiring.solved).toBe(false);
    expect(galleryAction(controller, { type: 'wiring-commit' })).toBe(true);
    expect(galleryAction(controller, { type: 'wiring-commit' })).toBe(false);
    expect(galleryAction(controller, { type: 'leave' })).toBe(true);
    // Both authored shelters are reachable through the opened safe bypass.
    walk(controller, camera, -1.2, 12.5); walk(controller, camera, 1.7, 12.5); walk(controller, camera, 1.7, 13.8);
    expect(isSafePose(controller.runtime.pose, worldForController(controller))).toBe(true);
    if (intensity === 'standard' && first === 'shadow' && lightFirst) evadeObservedPursuit(controller, camera);
    if (intensity === 'standard') waitForPass(controller, camera, 13);
    walk(controller, camera, 1.7, 15.2); walk(controller, camera, 4, 15.2);
    walk(controller, camera, 4, 17.5); walk(controller, camera, 6.3, 17.5); walk(controller, camera, 6.3, 18.8);
    expect(isSafePose(controller.runtime.pose, worldForController(controller))).toBe(true);
    if (intensity === 'standard') waitForPass(controller, camera, 17);
    walk(controller, camera, 6.3, 20.5); walk(controller, camera, 4, 20.5); walk(controller, camera, 4, 24);
    expect(controller.runtime.progress.cleared).toBe(false); expect(controller.runtime.doorExitOpen).toBe(1);
    // Goal009: arrival alone cannot operate an unseen door. A player turn
    // targets the same physical pull handle; no camera movement is forced.
    expect(galleryAction(controller, { type: 'close-exit' })).toBe(false);
    lookAt(controller, camera, { x: 4, y: 1.4, z: 23.08 });
    expect(galleryAction(controller, { type: 'close-exit' })).toBe(true);
    expect(galleryAction(controller, { type: 'close-exit' })).toBe(false);
    expect(controller.runtime.progress.gallery!.finalDoorClosed).toBe(true);
    expect(controller.runtime.gallery!.actor.phase).toBe('resolved');
    expect(worldForController(controller).solids.find(solid => solid.id === 'exit-door')!.min.y).toBe(0);
    expect(controller.runtime.progress).toMatchObject({ sealA: false, sealB: false, variant: 'entrance', cleared: true });
    expect(controller.runtime.pose.position.z).toBeGreaterThanOrEqual(23.3);
    const checkpoint = createCheckpoint(controller.runtime);
    expect(createController(restoreGalleryCheckpoint(checkpoint)!.checkpoint).runtime.progress).toEqual(checkpoint.progress);
    expect(renderer.dispose).not.toHaveBeenCalled(); lifecycle.close(); expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
