import * as THREE from 'three';
import { createCheckpoint } from '../../../domain/firstPerson';
import { projectWithCamera } from '../../../domain/firstPerson/alignment';
import { GALLERY_CHAPTER_ID, GALLERY_SHADOW_OBSERVATION_POSE, GALLERY_CONTOUR_OBSERVATION_POSE, SHADOW_SLOT_POSITIONS, SHADOW_HIT_SLOP, SHADOW_SAMPLE_SIZE, createShadowSpec, createContourSpec, normalizeAngle, type GalleryPuzzle } from '../../../domain/gallery';
import { createCanvasLifecycle } from '../canvasLifecycle';
import { galleryAction, galleryCommand, dispatchGalleryController, galleryPointer } from '../galleryController';
import { fixtureFullyVisible, fixturePointInWorld, pointOnFixture } from '../manipulationProjection';
import { advanceController, commandController, createController, syncCamera, worldForController, controllerSnapshot, setControllerForeground, attachControllerAudio, flushControllerAudioFrame } from '../runtimeController';

function setup(puzzle: GalleryPuzzle = 'shadow', width = 390, height = 844, ready = true) {
  const c = createController(undefined, false, true, GALLERY_CHAPTER_ID);
  c.runtime.pose = puzzle === 'shadow' ? GALLERY_SHADOW_OBSERVATION_POSE : GALLERY_CONTOUR_OBSERVATION_POSE;
  c.runtime.progress.sealA = true; c.runtime.doorAOpen = 1;
  const camera = new THREE.PerspectiveCamera(65, width / height, .08, 60);
  syncCamera(c, camera);
  if (ready) {
    const lifecycle = createCanvasLifecycle(c, jest.fn());
    lifecycle.ownRenderer({ dispose: jest.fn() } as unknown as THREE.WebGLRenderer);
    lifecycle.attachRoot({ setFrameloop: jest.fn() }); lifecycle.commitScene();
    c.diagnostics.renderReturns = 1; c.diagnostics.presentationReturns = 1;
    expect(lifecycle.markReady(true)).toBe(true);
    c.diagnostics.appActive = true;
  }
  const target = worldForController(c).interactables.find(t => t.id === puzzle + '-panel')!;
  const screen = (p: { x: number; y: number }) => {
    const ndc = projectWithCamera(fixturePointInWorld(target, p)!, c.matrices!)!;
    expect(ndc).toBeDefined();
    return { x: (ndc.x + 1) * width / 2, y: (1 - ndc.y) * height / 2 };
  };
  const pointer = (phase: Parameters<typeof galleryPointer>[1], id: number, p: { x: number; y: number }) => galleryPointer(c, phase, id, screen(p), width, height);
  return { c, camera, target, screen, pointer, width, height };
}

describe('gallery logical touch points and actual Three camera (presentation contract substituted)', () => {
  it.each([[320, 568], [375, 812], [390, 844], [430, 932]])('round trips every sample/socket/disc at %s × %s logical points', (w, h) => {
    for (const puzzle of ['shadow', 'contour'] as const) {
      const { c, target, screen } = setup(puzzle, w, h);
      const world = worldForController(c);
      expect(fixtureFullyVisible(c.runtime.pose, c.matrices, world, target)).toBe(true);
      const points = [...Object.values(SHADOW_SLOT_POSITIONS), ...createContourSpec(0).discs.map(d => d.center)];
      for (const point of points) {
        const hit = pointOnFixture(c.runtime.pose, c.matrices, world, target, screen(point), w, h)!;
        expect(hit.x).toBeCloseTo(point.x, 9); expect(hit.y).toBeCloseTo(point.y, 9);
      }
    }
  });
  it('rejects stale, absent, singular, near, back-facing, occluded and partially clipped fixtures', () => {
    const { c, camera, target, screen, width, height } = setup();
    const pose = c.runtime.pose, world = worldForController(c), p = screen({ x: 0, y: 0 });
    for (const size of [[0, height], [width, NaN], [-1, height]]) expect(pointOnFixture(pose, c.matrices, world, target, p, size[0]!, size[1]!)).toBeUndefined();
    expect(pointOnFixture(pose, c.matrices, world, target, { x: -1, y: 20 }, width, height)).toBeUndefined();
    expect(fixtureFullyVisible(pose, undefined, world, target)).toBe(false);
    expect(fixtureFullyVisible({ ...pose, yaw: .2 }, c.matrices, world, target)).toBe(false);
    expect(pointOnFixture(pose, { view: c.matrices!.view, projection: Array(16).fill(0) }, world, target, p, width, height)).toBeUndefined();
    expect(fixtureFullyVisible(pose, c.matrices, { ...world, solids: [...world.solids, { id: 'occluder', min: { x: -8, y: 0, z: -14 }, max: { x: -6, y: 3, z: -13.9 }, kind: 'wall', opaque: true }] }, target)).toBe(false);
    for (const z of [-15.73, -16, -14.1]) {
      c.runtime.pose = { ...pose, position: { ...pose.position, z } }; syncCamera(c, camera);
      expect(fixtureFullyVisible(c.runtime.pose, c.matrices, world, target)).toBe(false);
    }
    c.runtime.pose = pose; syncCamera(c, camera);
    const thinBlocker = { id: 'thin-inside-board', min: { x: -7.37, y: 1.79, z: -13.8 }, max: { x: -7.34, y: 1.82, z: -13.77 }, kind: 'wall' as const, opaque: true };
    expect(fixtureFullyVisible(pose, c.matrices, { ...world, solids: [...world.solids, thinBlocker] }, target)).toBe(false);
    c.runtime.pose = { ...pose, yaw: .3 }; syncCamera(c, camera);
    expect(fixtureFullyVisible(c.runtime.pose, c.matrices, world, target)).toBe(false);
  });
  it('consumes a pre-ready packet and keeps entering explicit without moving the camera', () => {
    const { c, camera } = setup('shadow', 390, 844, false);
    const before = c.runtime.pose, packet = galleryCommand(c, { type: 'enter', puzzle: 'shadow' });
    expect(dispatchGalleryController(c, packet)).toBe(false);
    Object.assign(c.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true });
    expect(dispatchGalleryController(c, packet)).toBe(false);
    c.input.forward = 1; c.input.lookX = 100; c.simpleStep = 1;
    expect(galleryAction(c, { type: 'enter', puzzle: 'shadow' })).toBe(true);
    expect(c.runtime.pose).toBe(before);
    expect(c.input.forward).toBe(0); expect(c.input.lookX).toBe(0); expect(c.simpleStep).toBe(0);
    for (let i = 0; i < 60; i++) { c.input.forward = 1; c.input.lookX = 10; advanceController(c, 1 / 60, camera); }
    commandController(c, { type: 'step', forward: 1 }); commandController(c, { type: 'turn', yaw: .2, pitch: .1 });
    expect(c.runtime.pose).toEqual(before);
    expect(galleryAction(c, { type: 'leave' })).toBe(true);
    advanceController(c, 12, camera); expect(c.runtime.pose).toEqual(before);
  });
  it('drags the displayed B center with a grab offset, restores external drops and never auto-commits', () => {
    const { c, pointer, width, height } = setup();
    expect(galleryAction(c, { type: 'enter', puzzle: 'shadow' })).toBe(true);
    const saved = c.runtime.progress.gallery!.shadow;
    const sample = createShadowSpec(saved.seed, saved.variant).samples[0]!, source = SHADOW_SLOT_POSITIONS[saved.assignments[sample.id]];
    expect(pointer('start', 1, { x: source.x + .09, y: source.y })).toBe(true);
    expect(c.runtime.gallery!.activeDrag).toMatchObject({ point: source, offset: { x: expect.any(Number), y: expect.any(Number) } });
    expect(pointer('start', 2, source)).toBe(false);
    const movingKey = controllerSnapshot(c).key;
    const slot = SHADOW_SLOT_POSITIONS['socket-left'];
    expect(pointer('move', 1, { x: slot.x + .09, y: slot.y })).toBe(true);
    expect(controllerSnapshot(c).key).toBe(movingKey);
    expect(pointer('end', 2, slot)).toBe(false);
    expect(pointer('end', 1, { x: slot.x + .09, y: slot.y })).toBe(true);
    expect(c.runtime.progress.gallery!.shadow.assignments[sample.id]).toBe('socket-left');
    expect(c.runtime.progress.gallery!.shadow.solved).toBe(false);
    expect(pointer('start', 3, slot)).toBe(true);
    pointer('move', 3, { x: 0, y: -.3 });
    expect(galleryPointer(c, 'end', 3, { x: -5, y: 2 }, width, height)).toBe(true);
    expect(c.runtime.progress.gallery!.shadow.assignments[sample.id]).toBe('socket-left');
    expect(c.runtime.gallery!.activeDrag).toBeNull();
    expect(pointer('start', 4, slot)).toBe(true);
    expect(pointer('cancel', 4, slot)).toBe(true);
    expect(c.runtime.progress.gallery!.shadow.assignments[sample.id]).toBe('socket-left');
  });
  it('uses the same nonoverlapping B hit margin in camera picking and domain validation', () => {
    const { c, pointer, screen } = setup('shadow', 320, 568);
    expect(galleryAction(c, { type: 'enter', puzzle: 'shadow' })).toBe(true);
    const center = SHADOW_SLOT_POSITIONS['source-b'], halfHit = SHADOW_SAMPLE_SIZE / 2 + SHADOW_HIT_SLOP;
    expect(screen({ x: center.x + halfHit, y: center.y }).x - screen({ x: center.x - halfHit, y: center.y }).x).toBeGreaterThan(44);
    expect(pointer('start', 1, { x: center.x + halfHit - 1e-6, y: center.y })).toBe(true);
    expect(c.runtime.gallery!.activeDrag).toMatchObject({ sampleId: 'sample-b', point: center });
    expect(pointer('cancel', 1, center)).toBe(true);
    expect(pointer('start', 2, { x: center.x + halfHit + 1e-6, y: center.y })).toBe(false);
    expect(c.runtime.gallery!.activeDrag).toBeNull();
  });
  it('commits a manually selected pair only once, independently of compare and sound', () => {
    const { c } = setup();
    const event = jest.fn();
    attachControllerAudio(c, { event, dispose: jest.fn(), setActive: jest.fn(), updatePreferences: jest.fn(), movement: jest.fn(), setListenerPosition: jest.fn(), whenReady: jest.fn().mockResolvedValue(undefined), getDiagnostics: jest.fn() });
    galleryAction(c, { type: 'enter', puzzle: 'shadow' });
    const saved = c.runtime.progress.gallery!.shadow;
    const spec = createShadowSpec(saved.seed, saved.variant), pair = spec.samples.filter(s => s.color === '#808080');
    galleryAction(c, { type: 'compare' });
    expect(c.runtime.progress.gallery!.shadow.assignments).toEqual(saved.assignments);
    pair.forEach((s, i) => expect(galleryAction(c, { type: 'shadow-place', sampleId: s.id, slotId: i ? 'socket-right' : 'socket-left' })).toBe(true));
    expect(c.runtime.progress.gallery!.shadow.solved).toBe(false);
    const packet = galleryCommand(c, { type: 'shadow-commit' });
    expect(dispatchGalleryController(c, packet)).toBe(true);
    expect(dispatchGalleryController(c, packet)).toBe(false);
    expect(galleryAction(c, { type: 'shadow-commit' })).toBe(false);
    expect(c.runtime.progress.gallery!.order).toEqual(['B']);
    expect(event.mock.calls.filter(([e]) => e.type === 'unlock')).toHaveLength(1);
    expect(createCheckpoint(c.runtime).progress.gallery!.shadow.solved).toBe(true);
  });
  it('rotates C through displayed angles across wrap and re-grab; cancel and pause roll back the unfinished turn', () => {
    const { c, pointer, camera } = setup('contour');
    galleryAction(c, { type: 'enter', puzzle: 'contour' });
    const disc = createContourSpec(c.runtime.progress.gallery!.contour.seed).discs[0]!;
    const at = (angle: number) => ({ x: disc.center.x + .16 * Math.cos(angle), y: disc.center.y + .16 * Math.sin(angle) });
    const original = c.runtime.gallery!.contourAngles[0];
    expect(pointer('start', 1, disc.center)).toBe(false);
    expect(pointer('start', 1, at(Math.PI - .1))).toBe(true);
    expect(pointer('move', 1, at(-Math.PI + .2))).toBe(true);
    expect(c.runtime.gallery!.contourAngles[0]).toBeCloseTo(normalizeAngle(original + .3), 8);
    expect(pointer('end', 1, at(-Math.PI + .2))).toBe(true);
    const placed = c.runtime.gallery!.contourAngles[0];
    expect(c.runtime.progress.gallery!.contour.angles[0]).toBe(placed);
    expect(pointer('start', 2, at(0))).toBe(true);
    expect(c.runtime.gallery!.contourAngles[0]).toBe(placed);
    pointer('move', 2, at(.3));
    expect(createCheckpoint(c.runtime).progress.gallery!.contour.angles[0]).toBe(placed);
    commandController(c, { type: 'pause' });
    expect(c.runtime.gallery!.contourAngles[0]).toBe(placed);
    expect(c.runtime.gallery!.activeDrag).toBeNull();
    expect(pointer('move', 2, at(.4))).toBe(false);
    commandController(c, { type: 'resume' }); advanceController(c, 20, camera);
    expect(pointer('move', 2, at(.5))).toBe(false);
  });
  it('C accepts only displayed aligned discs plus an explicit seal press, never guide or matching alone', () => {
    const { c } = setup('contour');
    galleryAction(c, { type: 'enter', puzzle: 'contour' });
    const spec = createContourSpec(c.runtime.progress.gallery!.contour.seed);
    galleryAction(c, { type: 'guide', enabled: true });
    for (const disc of spec.discs) {
      // Accessible adjustment uses the same persisted/displayed angle, in ≤90° increments.
      const delta = normalizeAngle(disc.targetAngle - c.runtime.gallery!.contourAngles[disc.id]);
      expect(galleryAction(c, { type: 'contour-adjust', discId: disc.id, delta })).toBe(true);
    }
    expect(c.runtime.gallery!.contourAngles).toEqual(c.runtime.progress.gallery!.contour.angles);
    expect(c.runtime.progress.gallery!.contour.solved).toBe(false);
    expect(galleryAction(c, { type: 'contour-commit' })).toBe(true);
    expect(galleryAction(c, { type: 'contour-commit' })).toBe(false);
  });
  it('rejects stale sessions, background input and retired callbacks, and sends actual movement only on a presented frame', () => {
    const { c, camera } = setup();
    const movement = jest.fn(), dispose = jest.fn();
    const detach = attachControllerAudio(c, { event: jest.fn(), dispose, setActive: jest.fn(), updatePreferences: jest.fn(), movement, setListenerPosition: jest.fn(), whenReady: jest.fn().mockResolvedValue(undefined), getDiagnostics: jest.fn() });
    expect(dispatchGalleryController(c, { ...galleryCommand(c, { type: 'enter', puzzle: 'shadow' }), sessionId: 'old' })).toBe(false);
    c.input.forward = .1; advanceController(c, 1 / 60, camera);
    expect(movement).not.toHaveBeenCalled();
    flushControllerAudioFrame(c); expect(movement).toHaveBeenCalledTimes(1);
    flushControllerAudioFrame(c); expect(movement).toHaveBeenCalledTimes(1);
    c.input.forward = 0;
    setControllerForeground(c, false);
    expect(galleryAction(c, { type: 'enter', puzzle: 'shadow' })).toBe(false);
    expect(c.pendingFootstepDistance).toBe(0);
    detach(); expect(dispose).toHaveBeenCalledTimes(1); expect(c.audio).toBeUndefined();
  });
});
