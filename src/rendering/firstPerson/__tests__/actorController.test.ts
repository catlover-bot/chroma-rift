import * as THREE from 'three';
import { GALLERY_CHAPTER_ID, GALLERY_SERVICE_CHECKPOINT, normalizeAngle } from '../../../domain/gallery';
import { advanceController, commandController, createController, flushControllerAudioFrame, retireController, setControllerForeground, setControllerHorrorIntensity, syncCamera } from '../runtimeController';
import { createTouchAdapter } from '../touchAdapter';

function setup() {
  const c = createController(undefined, false, true, GALLERY_CHAPTER_ID), camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
  Object.assign(c.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true, paused: false, open: false });
  const g = c.runtime.progress.gallery!;
  Object.assign(g, { emergencyLit: true, exitInspected: true, powerTaken: { shadow: true, contour: true }, powerConnected: true,
    story: { foreshadowed: true, absence: true, serviceWarned: true, resolved: false } });
  c.runtime.gallery!.serviceDoorOpen = 1;
  c.runtime.pose = { position: { x: 4, y: 1.6, z: 10.1 }, yaw: Math.PI, pitch: 0 };
  Object.assign(c.runtime.gallery!.actor, { position: { x: 4, y: 0, z: 10.5 }, phase: 'approach', routeIndex: 2, startupGrace: 0, contactCooldown: 0, visible: true, yaw: 0 });
  syncCamera(c, camera);
  const audio = { event: jest.fn(), dispose: jest.fn(), setActive: jest.fn(), updatePreferences: jest.fn(), movement: jest.fn(), actorMovement: jest.fn(), stopMovement: jest.fn(), setListenerPosition: jest.fn(), whenReady: jest.fn().mockResolvedValue(undefined), getDiagnostics: jest.fn() };
  c.audio = audio;
  return { c, camera, audio };
}
it('real contact returns to checkpoint, retains power and waits for every Fabric pointer to lift', () => {
  const { c, camera } = setup(), adapter = createTouchAdapter(c.input);
  const a = { identifier: 1, pageX: 30, pageY: 600 }, b = { identifier: 2, pageX: 310, pageY: 400 };
  adapter.bind('stick', 'start')({ changedTouches: [a], targetTouches: [a] });
  adapter.bind('look', 'start')({ changedTouches: [b], targetTouches: [b] });
  adapter.bind('stick', 'move')({ changedTouches: [{ ...a, pageY: 570 }] });
  const before = structuredClone(c.runtime.progress);
  advanceController(c, .05, camera);
  expect(c.runtime.pose).toEqual(GALLERY_SERVICE_CHECKPOINT);
  expect(c.runtime.progress).toEqual(before);
  expect(c.input.releaseBarrier).toEqual([1, 2]);
  expect(c.actorNotice).toBeUndefined();
  flushControllerAudioFrame(c); expect(c.actorNotice?.text).toBe('通路の手前へ戻された。');
  const sequence = c.actorNotice!.sequence;
  flushControllerAudioFrame(c); expect(c.actorNotice!.sequence).toBe(sequence);
  adapter.bind('stick', 'end')({ changedTouches: [a], touches: [b] });
  commandController(c, { type: 'step', forward: 1 }); advanceController(c, .05, camera);
  expect(c.runtime.pose.position).toEqual(GALLERY_SERVICE_CHECKPOINT.position);
  expect(normalizeAngle(c.runtime.pose.yaw - GALLERY_SERVICE_CHECKPOINT.yaw)).toBe(0);
  adapter.bind('look', 'end')({ changedTouches: [b], touches: [] });
  expect(c.input.releaseBarrier).toEqual([]);
  commandController(c, { type: 'step', forward: 1 }); advanceController(c, .05, camera);
  expect(c.runtime.pose.position.z).toBeGreaterThan(GALLERY_SERVICE_CHECKPOINT.position.z);
  expect(c.runtime.gallery!.actor.contactCooldown).toBeGreaterThan(0);
});
it('freezes the actor and movement sound in background, resumes with grace, and retires old callbacks', () => {
  const { c, camera, audio } = setup();
  const before = structuredClone(c.runtime.gallery!.actor);
  setControllerForeground(c, false);
  for (let frame = 0; frame < 100; frame++) advanceController(c, .05, camera);
  flushControllerAudioFrame(c);
  expect(c.runtime.gallery!.actor).toEqual(before);
  expect(audio.actorMovement).not.toHaveBeenCalled(); expect(audio.setActive).toHaveBeenCalledWith(false);
  setControllerForeground(c, true); advanceController(c, .05, camera);
  expect(c.runtime.paused).toBe(true);
  commandController(c, { type: 'resume' });
  expect(c.runtime.gallery!.actor.startupGrace).toBeGreaterThanOrEqual(2.5);
  const position = structuredClone(c.runtime.gallery!.actor.position);
  setControllerHorrorIntensity(c, 'subdued'); advanceController(c, .05, camera);
  expect(c.runtime.pose.position.z).toBeCloseTo(10.1); expect(c.runtime.gallery!.actor.visible).toBe(true);
  expect(Math.hypot(position.x - c.runtime.gallery!.actor.position.x, position.z - c.runtime.gallery!.actor.position.z)).toBeLessThan(.05);
  retireController(c);
  const actor = structuredClone(c.runtime.gallery!.actor), progress = structuredClone(c.runtime.progress);
  for (let frame = 0; frame < 100; frame++) advanceController(c, .05, camera);
  flushControllerAudioFrame(c); setControllerHorrorIntensity(c, 'standard');
  expect(c.runtime.gallery!.actor).toEqual(actor); expect(c.runtime.progress).toEqual(progress);
  expect(c.horrorIntensity).toBe('subdued'); expect(audio.dispose).toHaveBeenCalledTimes(1);
});
