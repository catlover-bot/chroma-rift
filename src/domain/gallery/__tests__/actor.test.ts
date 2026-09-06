import { PerspectiveCamera } from 'three';
import { createCheckpoint, evaluateRuntime, getWorld, isSafePose, pauseRuntime, segmentOccluded, updatePlayer, type ChapterRuntime, type Vec3 } from '../../firstPerson';
import { ACTOR_COLLISION_RADIUS, ACTOR_TELEGRAPH_SECONDS, actorCanSeePlayer, actorCrossingPoint, actorRouteEdgeOpen, actorVolume, actorVolumeOccluded, advanceGalleryActor, applyGalleryCommand, createContourSpec, createGalleryRuntime, createShadowSpec, GALLERY_ACTOR_ROUTE, GALLERY_FINAL_CHECKPOINT, GALLERY_SAFE_RETREATS, GALLERY_WIRING_OBSERVATION_POSE, normalizeAngle, restoreGalleryCheckpoint, resumeGalleryActor, type GalleryAction, type HorrorIntensity } from '..';

function command(runtime: ChapterRuntime, action: GalleryAction, targetId: string): ChapterRuntime {
  const g = runtime.gallery!;
  const result = applyGalleryCommand(runtime, { sessionId: g.sessionId, seq: g.lastSeq + 1, nowMs: g.lastNowMs + 1001, action }, { rendererReady: true, foreground: true, targetId });
  expect(result.accepted).toBe(true); return result.runtime;
}
function take(runtime: ChapterRuntime, puzzle: 'shadow' | 'contour') {
  let next = command(runtime, { type: 'enter', puzzle }, puzzle + '-panel');
  if (puzzle === 'shadow') {
    const p = next.progress.gallery!.shadow, pair = createShadowSpec(p.seed, p.variant).samples.filter(s => s.color === '#808080');
    next = command(next, { type: 'shadow-place', sampleId: pair[0]!.id, slotId: 'socket-left' }, 'shadow-panel');
    next = command(next, { type: 'shadow-place', sampleId: pair[1]!.id, slotId: 'socket-right' }, 'shadow-panel');
    next = command(next, { type: 'shadow-commit' }, 'shadow-panel');
  } else {
    for (const disc of createContourSpec(next.progress.gallery!.seed).discs) next = command(next, { type: 'contour-adjust', discId: disc.id, delta: normalizeAngle(disc.targetAngle - next.gallery!.contourAngles[disc.id]) }, 'contour-panel');
    next = command(next, { type: 'contour-commit' }, 'contour-panel');
  }
  next = command(next, { type: 'take-power', puzzle }, puzzle + '-panel');
  return command(next, { type: 'leave' }, puzzle + '-panel');
}
function cameraFor(runtime: ChapterRuntime) {
  const camera = new PerspectiveCamera(65, 390 / 844, .08, 60), p = runtime.pose;
  camera.position.set(p.position.x, p.position.y, p.position.z); camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
  return { view: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] };
}
function tick(runtime: ChapterRuntime, seconds: number, intensity: HorrorIntensity = 'standard') {
  let next = runtime; const events: string[] = [];
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += .05) {
    const dt = Math.min(.05, seconds - elapsed); next = evaluateRuntime(next, next.pose, dt);
    const result = advanceGalleryActor(next, dt, { intensity, matrices: cameraFor(next) }); next = result.runtime; events.push(...result.events);
  }
  return { runtime: next, events };
}
const actorPose = (position: Vec3) => ({ position: { ...position, y: 1.6 }, yaw: 0, pitch: 0 });
function introduced() { return command(createGalleryRuntime(), { type: 'light-on' }, 'gallery-light'); }
function staged() {
  const runtime = take(take(introduced(), 'shadow'), 'contour');
  return tick(runtime, 20).runtime;
}
function powered() {
  let runtime = command(staged(), { type: 'connect-power' }, 'gallery-exit-panel');
  runtime.pose = { ...GALLERY_WIRING_OBSERVATION_POSE, position: { ...GALLERY_WIRING_OBSERVATION_POSE.position } };
  runtime = tick(runtime, 2).runtime;
  runtime = command(runtime, { type: 'enter', puzzle: 'wiring' }, 'wiring-panel');
  runtime = command(runtime, { type: 'wiring-adjust', control: 'line', delta: -.24 }, 'wiring-panel');
  runtime = command(runtime, { type: 'wiring-commit' }, 'wiring-panel');
  runtime = command(runtime, { type: 'leave' }, 'wiring-panel');
  return tick(runtime, 1).runtime;
}
function active() {
  const runtime = powered(); runtime.pose = GALLERY_SAFE_RETREATS[0]!;
  return tick(runtime, 3).runtime;
}

describe('one physical gallery actor across presentation, patrol and recovery', () => {
  it('crosses once on the natural return route, holds visibly, and never teleports or waits for camera awareness', () => {
    let runtime = take(introduced(), 'shadow');
    const start = { ...runtime.gallery!.actor.position }, box = actorVolume(runtime)!;
    expect(box.max.x - box.min.x).toBeCloseTo(1.04, 12); expect(box.max.z - box.min.z).toBeCloseTo(1.04, 12);
    runtime.pose = { position: { x: -7, y: 1.6, z: -10.7 }, yaw: 0, pitch: 0 };
    expect(tick(runtime, 2).events).not.toContain('crossing');
    runtime.pose = { position: { x: 0, y: 1.6, z: 2 }, yaw: Math.PI, pitch: 0 };
    const first = advanceGalleryActor(runtime, .05, { intensity: 'standard', matrices: cameraFor(runtime) }); runtime = first.runtime;
    expect(first.events).toEqual(['crossing']); expect(first.movedDistance).toBeGreaterThan(0);
    expect(Math.hypot(runtime.gallery!.actor.position.x - start.x, runtime.gallery!.actor.position.z - start.z)).toBeLessThan(.04);
    for (let frame = 0; frame < 100 && runtime.gallery!.actor.phase !== 'crossing-pause'; frame++) runtime = tick(runtime, .05).runtime;
    expect(runtime.gallery!.actor.phase).toBe('crossing-pause');
    expect(runtime.gallery!.actor.position.x).toBeCloseTo(actorCrossingPoint(runtime.progress.gallery!.seed).x, 2);
    const held = runtime.gallery!.actor.position;
    runtime = tick(runtime, 1.4).runtime; expect(runtime.gallery!.actor.position).toBe(held);
    expect(runtime.progress.gallery!.story.crossingPresented).toBe(true);
    const later = tick(runtime, 30); expect(later.events).not.toContain('crossing');
    expect(later.runtime.gallery!.actor.position).toEqual(GALLERY_ACTOR_ROUTE[3]);
    expect(later.runtime.progress.gallery!.powerConnected).toBe(false);
    const missed = take(introduced(), 'shadow'); missed.pose = { position: { x: 0, y: 1.6, z: 2 }, yaw: 0, pitch: 0 };
    const unseen = tick(missed, 30); expect(unseen.runtime.gallery!.actor.position).toEqual(GALLERY_ACTOR_ROUTE[3]);
    expect(unseen.runtime.progress.gallery!.story).toMatchObject({ crossingStarted: true, crossingPresented: false });
  });
  it('shows the authored head and shoulders through the enlarged window while its real lower rail blocks walking', () => {
    const runtime = introduced(), world = getWorld(runtime);
    for (const seed of [0, 1, 2]) {
      const point = actorCrossingPoint(seed);
      for (const dx of [-.18, 0, .18]) for (const y of [1.55, 1.9, 2.08]) expect(segmentOccluded(runtime.pose.position, { x: point.x + dx, y, z: point.z }, world)).toBe(false);
    }
    let pose = { position: { x: 0, y: 1.6, z: 5 }, yaw: Math.PI, pitch: 0 };
    for (let i = 0; i < 50; i++) pose = updatePlayer(pose, { strafe: 0, forward: 1 }, .1, world);
    expect(pose.position.z).toBeLessThan(5.71);
  });
  it('retains whole-body occlusion rather than confusing a hidden center or a turn with invisible geometry', () => {
    const runtime = introduced(), position = runtime.gallery!.actor.position, world = getWorld(runtime), volume = actorVolume(runtime)!;
    expect(volume.min.y).toBeLessThanOrEqual(-.04); expect(volume.max.y).toBeGreaterThanOrEqual(2.2);
    const partial = { id: 'partial-display-occluder', kind: 'wall' as const, opaque: true, min: { x: -1, y: 1, z: 4.95 }, max: { x: 1, y: 2, z: 5.05 } };
    expect(segmentOccluded(runtime.pose.position, { ...position, y: 1.2 }, { ...world, solids: [partial] })).toBe(true);
    expect(actorVolumeOccluded(runtime, position, { ...world, solids: [partial] })).toBe(false);
    expect(actorVolumeOccluded(runtime, position, { ...world, solids: [{ ...partial, min: { ...partial.min, y: 0 }, max: { ...partial.max, y: 3.2 } }] })).toBe(true);
  });
  it('uses nine continuous route edges, waits at the actual closed shutter and bounds low-frame-rate movement', () => {
    const beforeWire = staged(), closedWorld = getWorld(beforeWire);
    expect(GALLERY_ACTOR_ROUTE.length).toBeLessThanOrEqual(12);
    expect(actorRouteEdgeOpen(GALLERY_ACTOR_ROUTE[3]!, GALLERY_ACTOR_ROUTE[4]!, closedWorld)).toBe(false);
    let runtime = powered(); const world = getWorld(runtime);
    for (let i = 1; i < GALLERY_ACTOR_ROUTE.length; i++) expect(actorRouteEdgeOpen(GALLERY_ACTOR_ROUTE[i - 1]!, GALLERY_ACTOR_ROUTE[i]!, world)).toBe(true);
    runtime = active(); const slow = advanceGalleryActor(runtime, 20, { intensity: 'standard' }); runtime = slow.runtime;
    expect(slow.movedDistance).toBeLessThanOrEqual(1.25 * .25 + 1e-8);
    for (let i = 0; i < 500; i++) {
      runtime = advanceGalleryActor(runtime, .1, { intensity: 'standard' }).runtime;
      expect(actorRouteEdgeOpen(runtime.gallery!.actor.position, runtime.gallery!.actor.position, getWorld(runtime))).toBe(true);
      expect(runtime.gallery!.actor.position.z).toBeGreaterThanOrEqual(10.25); expect(runtime.gallery!.actor.position.z).toBeLessThanOrEqual(20.55);
    }
    expect(runtime.gallery!.actor.travelledDistance).toBeGreaterThan(20);
  });
  it('reserves the whole body around shelves, floor edges and head-height obstacles independently of the player', () => {
    const world = getWorld(powered()), nearShelf = { x: 3.45, y: 0, z: 13.8 };
    expect(ACTOR_COLLISION_RADIUS).toBeGreaterThan(.42); expect(isSafePose(actorPose(nearShelf), world)).toBe(true);
    expect(actorRouteEdgeOpen(nearShelf, nearShelf, world)).toBe(false);
    const point = { x: 4, y: 0, z: 15.5 }, edgeWorld = { ...world, floors: [{ id: 'narrow-floor', minX: 3.7, maxX: 4.3, minZ: 15, maxZ: 16 }] };
    expect(isSafePose(actorPose(point), edgeWorld)).toBe(true); expect(actorRouteEdgeOpen(point, point, edgeWorld)).toBe(false);
    const headOnly = { ...world, solids: [...world.solids, { id: 'overhead-obstacle', kind: 'device' as const, opaque: true, min: { x: 3.8, y: 1.95, z: 15.3 }, max: { x: 4.2, y: 2.1, z: 15.7 } }] };
    expect(isSafePose(actorPose(point), headOnly)).toBe(true); expect(actorRouteEdgeOpen(point, point, headOnly)).toBe(false);
    expect(actorRouteEdgeOpen({ x: -1.2, y: 0, z: 9.8 }, GALLERY_ACTOR_ROUTE[0]!, world)).toBe(false);
  });
  it('cannot walk through the visible body even during grace or subdued play', () => {
    const runtime = powered(); runtime.gallery!.actor.position = { x: 4, y: 0, z: 15.5 };
    let pose = { position: { x: 4, y: 1.6, z: 17 }, yaw: 0, pitch: 0 };
    for (let i = 0; i < 40; i++) pose = updatePlayer(pose, { strafe: 0, forward: 1 }, .1, getWorld(runtime));
    expect(pose.position.z).toBeGreaterThan(16.17); expect(pose.position.z).toBeLessThan(16.24);
  });
  it('warns for at least 2.5 seconds before contact and restores the last visited refuge with all power and wiring', () => {
    let runtime = powered(); runtime.pose = GALLERY_SAFE_RETREATS[0]!;
    const first = advanceGalleryActor(runtime, .05, { intensity: 'standard' }); runtime = first.runtime;
    expect(first.events).toEqual(['warning']); expect(runtime.gallery!.actor.phase).toBe('telegraph');
    runtime.gallery!.actor.position = { x: 4, y: 0, z: 14.8 }; runtime.pose = actorPose(runtime.gallery!.actor.position);
    const protectedTime = tick(runtime, 2.5); expect(protectedTime.events).not.toContain('caught'); runtime = protectedTime.runtime;
    const before = runtime.progress.gallery!;
    const caught = tick(runtime, 1); expect(caught.events.filter(event => event === 'caught')).toHaveLength(1);
    expect(caught.runtime.pose).toEqual(GALLERY_WIRING_OBSERVATION_POSE); expect(caught.runtime.progress.gallery).toEqual(before);
    expect(caught.runtime.gallery!.actor.contactCooldown).toBeGreaterThan(3); expect(tick(caught.runtime, 1).events).not.toContain('caught');
  });
  it('restores the visited final refuge identically after saving or contact, without closing the door or inventing discoveries', () => {
    let runtime = active(); runtime.pose = GALLERY_FINAL_CHECKPOINT;
    runtime = evaluateRuntime(runtime, runtime.pose, .05);
    expect(runtime.gallery!.lastSafePose).toEqual(GALLERY_FINAL_CHECKPOINT);
    // The player deliberately leaves this safe threshold before closing it.
    runtime.pose = { position: { x: 4, y: 1.6, z: 13 }, yaw: 0, pitch: 0 };
    runtime = evaluateRuntime(runtime, runtime.pose, .05);
    runtime.gallery!.actor = { ...runtime.gallery!.actor, position: { x: 4, y: 0, z: 13.6 }, yaw: 0, phase: 'approach', startupGrace: 0, contactCooldown: 0 };
    const before = runtime.progress, saved = createCheckpoint(runtime), restored = restoreGalleryCheckpoint(saved)!;
    expect(restored.recovered).toBe(false); expect(saved.pose).toEqual(GALLERY_FINAL_CHECKPOINT);
    expect(createGalleryRuntime(restored.checkpoint).gallery!.lastSafePose).toEqual(saved.pose);
    expect(before.gallery!.discoveries).toMatchObject({ mask: false, hybrid: false, shepard: false });
    const caught = advanceGalleryActor(runtime, .05, { intensity: 'standard' });
    expect(caught.caught).toBe(true); expect(caught.events).toEqual(['caught']);
    expect(caught.runtime.pose).toEqual(restored.checkpoint.pose); expect(caught.runtime.progress).toEqual(before);
    expect(createCheckpoint(caught.runtime).pose).toEqual(saved.pose);
    runtime = tick(caught.runtime, 1).runtime;
    expect(runtime.progress.cleared).toBe(false); expect(runtime.progress.gallery!.finalDoorClosed).toBe(false);
    expect(getWorld(runtime).solids.find(solid => solid.id === 'exit-door')!.min.y).toBe(3.3);
    runtime = command(runtime, { type: 'close-exit' }, 'exit');
    expect(runtime.progress.cleared).toBe(true); expect(runtime.progress.gallery!.finalDoorClosed).toBe(true);
    expect(getWorld(runtime).solids.find(solid => solid.id === 'exit-door')!.min.y).toBe(0);
    expect(advanceGalleryActor(runtime, 1, { intensity: 'standard' }).caught).toBe(false);
  });
  it('uses facing and closed-door LOS, then searches only the last observed position behind a real shelf', () => {
    let runtime = active(); runtime.gallery!.actor = { ...runtime.gallery!.actor, phase: 'patrol', position: { x: 4, y: 0, z: 13.8 }, yaw: 0, startupGrace: 0 };
    runtime.pose = { position: { x: 4, y: 1.6, z: 12.5 }, yaw: Math.PI, pitch: 0 };
    expect(actorCanSeePlayer(runtime)).toBe(true); runtime = tick(runtime, .05).runtime;
    expect(runtime.gallery!.actor.phase).toBe('noticed');
    runtime.pose = { ...runtime.pose, position: { x: 4, y: 1.6, z: 12.7 } }; runtime = tick(runtime, .05).runtime;
    expect(runtime.gallery!.actor.lastSeen).toEqual(runtime.pose.position);
    runtime = tick(runtime, .9).runtime;
    expect(runtime.gallery!.actor.phase).toBe('approach'); const lastSeen = runtime.gallery!.actor.lastSeen;
    runtime.pose = GALLERY_SAFE_RETREATS[0]!;
    expect(segmentOccluded({ ...runtime.gallery!.actor.position, y: 1.82 }, runtime.pose.position, getWorld(runtime))).toBe(true);
    runtime = tick(runtime, .05).runtime; expect(runtime.gallery!.actor.phase).toBe('search');
    runtime.pose = { ...runtime.pose, position: { x: 1.5, y: 1.6, z: 14.1 } }; runtime = tick(runtime, .5).runtime;
    expect(runtime.gallery!.actor.lastSeen).toEqual(lastSeen); expect(runtime.gallery!.actor.position.x).toBeCloseTo(4, 12);
    runtime = tick(runtime, 3).runtime; expect(runtime.gallery!.actor.phase).toBe('patrol');
    runtime.gallery!.actor = { ...runtime.gallery!.actor, position: { x: 4, y: 0, z: 10.25 }, yaw: Math.PI }; runtime.gallery!.wiringDoorOpen = 0;
    runtime.pose = { position: { x: 4, y: 1.6, z: 12.2 }, yaw: 0, pitch: 0 };
    expect(actorCanSeePlayer(runtime)).toBe(false);
    runtime.gallery!.wiringDoorOpen = 1; expect(actorCanSeePlayer(runtime)).toBe(true);
  });
  it('freezes pause and manipulation, resumes at the same position and grants safe mode-change time', () => {
    let runtime = active(); const paused = pauseRuntime(runtime);
    expect(advanceGalleryActor(paused, 30, { intensity: 'standard' }).runtime).toBe(paused);
    const manipulating = { ...runtime, gallery: { ...runtime.gallery!, mode: 'wiring' as const } };
    expect(advanceGalleryActor(manipulating, 30, { intensity: 'standard' }).runtime).toBe(manipulating);
    runtime.gallery!.actor.phase = 'approach'; const oldPosition = runtime.gallery!.actor.position;
    runtime = resumeGalleryActor(runtime); expect(runtime.gallery!.actor.position).toBe(oldPosition); expect(runtime.gallery!.actor.phase).toBe('patrol');
    expect(runtime.gallery!.actor.startupGrace).toBeGreaterThanOrEqual(2.5);
    runtime.pose = actorPose(runtime.gallery!.actor.position); expect(tick(runtime, 2.5).events).not.toContain('caught');
    runtime = advanceGalleryActor(runtime, .05, { intensity: 'subdued' }).runtime;
    const standard = advanceGalleryActor(runtime, .05, { intensity: 'standard' }); expect(standard.caught).toBe(false); expect(standard.runtime.gallery!.actor.startupGrace).toBe(ACTOR_TELEGRAPH_SECONDS);
  });
  it('subdued keeps one physical presence without pursuit or reset and closing resolves once without delayed capture', () => {
    let runtime = active(); runtime.gallery!.actor.phase = 'approach'; const position = runtime.gallery!.actor.position;
    runtime.pose = actorPose(position); const changed = advanceGalleryActor(runtime, .05, { intensity: 'subdued' }); runtime = changed.runtime;
    expect(changed.caught).toBe(false); expect(runtime.gallery!.actor.visible).toBe(true);
    expect(Math.hypot(runtime.gallery!.actor.position.x - position.x, runtime.gallery!.actor.position.z - position.z)).toBeLessThan(.04);
    const quiet = tick(runtime, 25, 'subdued'); expect(quiet.events).not.toContain('caught'); runtime = quiet.runtime;
    runtime.pose = { position: { x: 4, y: 1.6, z: 24 }, yaw: Math.PI, pitch: 0 };
    runtime = tick(runtime, 1).runtime; expect(runtime.progress.cleared).toBe(false); expect(runtime.progress.gallery!.story.resolved).toBe(false);
    runtime = command(runtime, { type: 'close-exit' }, 'exit');
    expect(runtime.progress.cleared).toBe(true); expect(runtime.gallery!.exitClosureSeconds).toBe(.6); expect(runtime.gallery!.actor.phase).toBe('resolved');
    const closed = getWorld(runtime).solids.find(solid => solid.id === 'exit-door')!; expect(closed.min.y).toBe(0);
    expect(tick(runtime, 20).events).not.toContain('caught');
    expect(advanceGalleryActor(runtime, 1, { intensity: 'standard' }).runtime).toBe(runtime);
    const live = runtime.gallery!; expect(applyGalleryCommand(runtime, { sessionId: live.sessionId, seq: live.lastSeq + 1, nowMs: live.lastNowMs + 1, action: { type: 'close-exit' } }, { rendererReady: true, foreground: true, targetId: 'exit' }).accepted).toBe(false);
  });
  it('does not save pursuit timers, replay crossing, or catch up after a huge elapsed interval', () => {
    let runtime = active(); runtime.gallery!.actor = { ...runtime.gallery!.actor, phase: 'approach', position: { x: 4, y: 0, z: 15 }, startupGrace: 0, contactCooldown: 0 };
    runtime.pose = actorPose(runtime.gallery!.actor.position); const caught = advanceGalleryActor(runtime, .05, { intensity: 'standard' });
    expect(caught.caught).toBe(true); runtime = caught.runtime;
    const saved = createCheckpoint(runtime); expect(JSON.stringify(saved)).not.toContain('phaseTime'); expect(JSON.stringify(saved)).not.toContain('travelledDistance');
    const restored = createGalleryRuntime(restoreGalleryCheckpoint(saved)!.checkpoint), huge = advanceGalleryActor(restored, 3600, { intensity: 'standard' });
    expect(huge.caught).toBe(false); expect(huge.runtime.gallery!.actor.startupGrace).toBeGreaterThanOrEqual(2.5);
    expect(tick(huge.runtime, 30).events).not.toContain('crossing');
    const closedGate = getWorld(createGalleryRuntime()); expect(actorRouteEdgeOpen({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 9 }, closedGate)).toBe(false);
  });
  it('rejects future and impossible semantic story data without normalizing an unknown save', () => {
    const checkpoint = createCheckpoint(powered()), gallery = checkpoint.progress.gallery!;
    for (const story of [undefined, {}, { ...gallery.story, absence: 'yes' }, { ...gallery.story, foreshadowed: false, absence: true }, { ...gallery.story, crossingStarted: false, crossingPresented: true }]) {
      expect(restoreGalleryCheckpoint({ ...checkpoint, progress: { ...checkpoint.progress, gallery: { ...gallery, story } } })).toBeUndefined();
    }
    expect(restoreGalleryCheckpoint({ ...checkpoint, schemaVersion: 2 })).toBeUndefined();
    expect(restoreGalleryCheckpoint({ ...checkpoint, progress: { ...checkpoint.progress, gallery: { ...gallery, schemaVersion: 99 } } })).toBeUndefined();
  });
});
