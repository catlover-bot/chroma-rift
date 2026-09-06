import * as THREE from 'three';
import { createSealStimulus } from '../../../domain/emblem';
import { createCheckpoint, isSafePose, MOVE_SPEED, occlusionCertificate, type Vec3 } from '../../../domain/firstPerson';
import { createContourSpec, createGalleryRuntime, createShadowSpec, GALLERY_A_OBSERVATION_POSE, GALLERY_CHANGED_REGION, GALLERY_CONTOUR_FIXTURE, GALLERY_EMBLEM_FIXTURE, GALLERY_EMBLEM_SWITCHES, GALLERY_OBSERVATION_POSE, GALLERY_SHADOW_FIXTURE, normalizeAngle, restoreGalleryCheckpoint, type GalleryPuzzle } from '../../../domain/gallery';
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
function walk(controller: RuntimeController, camera: THREE.PerspectiveCamera, x: number, z: number) {
  for (let frame = 0; frame < 2200; frame++) {
    const pose = controller.runtime.pose, distance = Math.hypot(x - pose.position.x, z - pose.position.z);
    if (distance < 0.02 || controller.runtime.progress.cleared) { controller.input.forward = 0; return; }
    lookAt(controller, camera, { x, y: pose.position.y, z });
    controller.input.forward = 1;
    advanceController(controller, Math.min(1 / 60, distance / MOVE_SPEED), camera);
  }
  throw new Error(`Controller route blocked at ${JSON.stringify(controller.runtime.pose.position)} toward ${x},${z}`);
}
function solveWing(controller: RuntimeController, puzzle: GalleryPuzzle) {
  expect(interactController(controller, puzzle === 'shadow' ? 'shadow-panel' : 'contour-panel')).toBe(true);
  expect(controller.runtime.gallery!.mode).toBe(puzzle);
  if (puzzle === 'shadow') {
    const state = controller.runtime.progress.gallery!.shadow;
    const pair = createShadowSpec(state.seed, state.variant).samples.filter(sample => sample.color === '#808080');
    expect(galleryAction(controller, { type: 'shadow-place', sampleId: pair[0]!.id, slotId: 'socket-left' })).toBe(true);
    expect(galleryAction(controller, { type: 'shadow-place', sampleId: pair[1]!.id, slotId: 'socket-right' })).toBe(true);
    expect(controller.runtime.progress.gallery!.shadow.solved).toBe(false);
    expect(galleryAction(controller, { type: 'shadow-commit' })).toBe(true);
  } else {
    const spec = createContourSpec(controller.runtime.progress.gallery!.contour.seed);
    for (const disc of spec.discs) expect(galleryAction(controller, { type: 'contour-adjust', discId: disc.id, delta: normalizeAngle(disc.targetAngle - controller.runtime.gallery!.contourAngles[disc.id]) })).toBe(true);
    expect(controller.runtime.progress.gallery!.contour.solved).toBe(false);
    expect(galleryAction(controller, { type: 'contour-commit' })).toBe(true);
  }
  expect(galleryAction(controller, { type: 'leave' })).toBe(true);
}

describe('gallery full chapter in the shared live camera/controller with a mocked GL-ready boundary', () => {
  it.each([['shadow', 'contour'], ['contour', 'shadow']] as const)('walks A → %s → %s → D → return → exit without teleporting or bypassing a gate', (first, second) => {
    const controller = createController(createCheckpoint(createGalleryRuntime())), camera = new THREE.PerspectiveCamera(65, 390 / 844, 0.08, 60);
    syncCamera(controller, camera);
    const renderer = { dispose: jest.fn() }, lifecycle = createCanvasLifecycle(controller, jest.fn());
    lifecycle.ownRenderer(renderer as unknown as THREE.WebGLRenderer); lifecycle.attachRoot({ setFrameloop: jest.fn() }); lifecycle.commitScene();
    expect(lifecycle.markReady(true)).toBe(false);
    controller.diagnostics.renderReturns = 1; controller.diagnostics.presentationReturns = 1;
    expect(lifecycle.markReady(true)).toBe(true); controller.diagnostics.appActive = true;
    walk(controller, camera, 0, 2); walk(controller, camera, GALLERY_A_OBSERVATION_POSE.position.x, GALLERY_A_OBSERVATION_POSE.position.z);
    lookAt(controller, camera, GALLERY_EMBLEM_FIXTURE.center);
    expect(interactController(controller, 'emblem-panel')).toBe(true);
    const correct = GALLERY_EMBLEM_SWITCHES.find(item => item.glyph === createSealStimulus(controller.runtime.emblem.seed).answer)!;
    lookAt(controller, camera, correct.center);
    expect(interactController(controller, correct.id)).toBe(true); expect(controller.runtime.progress.sealA).toBe(true);
    expect(controller.runtime.progress).toMatchObject({ guideExamined: false, markActivated: false });
    walk(controller, camera, 0, -6); walk(controller, camera, 0, -10);
    for (const [index, puzzle] of [first, second].entries()) {
      if (puzzle === 'shadow') { walk(controller, camera, -3, -9.6); walk(controller, camera, -7, -9.6); walk(controller, camera, -7, -10.7); }
      else { walk(controller, camera, 9, -10); walk(controller, camera, 9, -10.7); }
      lookAt(controller, camera, puzzle === 'shadow' ? GALLERY_SHADOW_FIXTURE.center : GALLERY_CONTOUR_FIXTURE.center);
      solveWing(controller, puzzle);
      if (puzzle === 'shadow') { walk(controller, camera, -7, -12.6); walk(controller, camera, -2, -12.6); walk(controller, camera, 0, -10); }
      else { walk(controller, camera, 9, -13); walk(controller, camera, 5, -13); walk(controller, camera, 0, -10); }
      if (index === 0) {
        expect(controller.runtime.gallery!.doorDOpen).toBe(0);
        walk(controller, camera, 2, -13); lookAt(controller, camera, { x: 2, y: 1.6, z: -20 });
        controller.input.forward = 1;
        for (let frame = 0; frame < 120; frame++) advanceController(controller, 1 / 60, camera);
        expect(controller.runtime.pose.position.z).toBeGreaterThan(-14);
        expect(controller.runtime.progress.sealB).toBe(false);
        walk(controller, camera, 0, -10);
      }
    }
    expect(controller.runtime.progress.gallery!.order).toEqual(first === 'shadow' ? ['B', 'C'] : ['C', 'B']);
    walk(controller, camera, 2, -13); walk(controller, camera, 2, -18.5); walk(controller, camera, GALLERY_OBSERVATION_POSE.position.x, GALLERY_OBSERVATION_POSE.position.z);
    lookAt(controller, camera, worldForController(controller).keyFrame.center); advanceController(controller, 1 / 60, camera);
    expect(controller.runtime.alignment).toBe(true);
    expect(occlusionCertificate(controller.runtime.pose, GALLERY_CHANGED_REGION, worldForController(controller).solids)).toBeDefined();
    const unchangedPosition = controller.runtime.pose.position;
    expect(interactController(controller, 'key')).toBe(true);
    expect(controller.runtime.progress).toMatchObject({ sealB: true, variant: 'exit' }); expect(controller.runtime.pose.position).toBe(unchangedPosition);
    expect(isSafePose(controller.runtime.pose, worldForController(controller))).toBe(true);
    walk(controller, camera, 0, -21); walk(controller, camera, 5, -21); walk(controller, camera, 5, -4); walk(controller, camera, 0, -4); walk(controller, camera, 0, 12);
    lookAt(controller, camera, worldForController(controller).interactables.find(item => item.id === 'exit')!.center);
    expect(interactController(controller, 'exit')).toBe(true);
    walk(controller, camera, 0, 15.5);
    expect(controller.runtime.progress.cleared).toBe(true); expect(controller.runtime.pose.position.z).toBeGreaterThanOrEqual(14.75);
    const checkpoint = createCheckpoint(controller.runtime);
    expect(createController(restoreGalleryCheckpoint(checkpoint)!.checkpoint).runtime.progress).toEqual(checkpoint.progress);
    expect(renderer.dispose).not.toHaveBeenCalled(); lifecycle.close(); expect(renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
