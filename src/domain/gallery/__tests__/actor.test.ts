import { createCheckpoint, getWorld, isSafePose, pauseRuntime, segmentOccluded, type ChapterRuntime, type Vec3 } from '../../firstPerson';
import { ACTOR_COLLISION_RADIUS, ACTOR_TELEGRAPH_SECONDS, actorCanSeePlayer, actorRouteEdgeOpen, actorVolume, actorVolumeOccluded, advanceGalleryActor, applyGalleryCommand, createContourSpec, createGalleryRuntime, createShadowSpec, GALLERY_ACTOR_ROUTE, GALLERY_SAFE_RETREATS, GALLERY_SERVICE_CHECKPOINT, normalizeAngle, restoreGalleryCheckpoint, resumeGalleryActor, type GalleryAction, type HorrorIntensity } from '..';

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
function tick(runtime: ChapterRuntime, seconds: number, intensity: HorrorIntensity = 'standard') {
  let next = runtime; const events: string[] = [];
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += .05) {
    const result = advanceGalleryActor(next, Math.min(.05, seconds - elapsed), { intensity }); next = result.runtime; events.push(...result.events);
  }
  return { runtime: next, events };
}
function introduced() {
  const runtime = command(createGalleryRuntime(), { type: 'light-on' }, 'gallery-light');
  return advanceGalleryActor(runtime, .05, { intensity: 'standard' }).runtime;
}
function powered() {
  let runtime = take(take(introduced(), 'shadow'), 'contour');
  runtime.pose = { position: { x: -7, y: 1.6, z: -10.7 }, yaw: 0, pitch: 0 };
  runtime = tick(runtime, 20).runtime;
  runtime = command(runtime, { type: 'connect-power' }, 'gallery-exit-panel');
  runtime.pose = { ...GALLERY_SERVICE_CHECKPOINT, position: { ...GALLERY_SERVICE_CHECKPOINT.position } };
  return runtime;
}
const actorPose = (position: Vec3) => ({ position: { ...position, y: 1.6 }, yaw: 0, pitch: 0 });

describe('one gallery actor in the authored world, without an AI mock', () => {
  it('requires full-volume occlusion before departure and walks continuously even when visible again', () => {
    let runtime = introduced();
    const original = { ...runtime.gallery!.actor.position };
    const box = actorVolume(runtime)!;
    expect(box.max.x - box.min.x).toBeCloseTo(1.04, 12); expect(box.max.z - box.min.z).toBeCloseTo(1.04, 12); expect(box.max.y).toBeGreaterThanOrEqual(2.2);
    runtime = take(runtime, 'shadow');
    expect(actorVolumeOccluded(runtime, original)).toBe(false);
    expect(tick(runtime, 1).events).not.toContain('absence');
    runtime.pose = { ...runtime.pose, yaw: 0 }; // Merely turning away is insufficient.
    expect(tick(runtime, 1).events).not.toContain('absence');
    runtime.pose = { position: { x: -7, y: 1.6, z: -10.7 }, yaw: 0, pitch: 0 };
    expect(actorVolumeOccluded(runtime, original)).toBe(true);
    const start = advanceGalleryActor(runtime, .05, { intensity: 'standard' }); runtime = start.runtime;
    expect(start.events).toEqual(['absence']); expect(runtime.gallery!.actor.phase).toBe('departing');
    expect(Math.hypot(runtime.gallery!.actor.position.x - original.x, runtime.gallery!.actor.position.z - original.z)).toBeLessThan(.1);
    expect(start.movedDistance).toBeGreaterThan(0);
    runtime.pose = { position: { x: 0, y: 1.6, z: 2 }, yaw: Math.PI, pitch: 0 };
    const previous = runtime.gallery!.actor.position;
    runtime = tick(runtime, 2).runtime;
    expect(runtime.gallery!.actor.position.x).toBeGreaterThan(previous.x);
    expect(runtime.progress.gallery!.powerConnected).toBe(false);
    expect(runtime.pose.position).toEqual({ x: 0, y: 1.6, z: 2 });
    const later = tick(runtime, 30); expect(later.events).not.toContain('absence');
    expect(later.runtime.gallery!.actor.position.z).toBeCloseTo(15.6, 1);
    expect(later.runtime.gallery!.actor.phase).toBe('dormant');
  });
  it('does not mistake a hidden center for a hidden whole body, including the walking feet envelope', () => {
    const runtime = introduced(), position = runtime.gallery!.actor.position, world = getWorld(runtime);
    const volume = actorVolume(runtime)!;
    expect(volume.min.y).toBeLessThanOrEqual(-.04);
    const partial = { id: 'partial-display-occluder', kind: 'wall' as const, opaque: true, min: { x: -1, y: 1, z: 4.95 }, max: { x: 1, y: 2, z: 5.05 } };
    const withPartial = { ...world, solids: [partial] };
    expect(segmentOccluded(runtime.pose.position, { ...position, y: 1.2 }, withPartial)).toBe(true);
    expect(actorVolumeOccluded(runtime, position, withPartial)).toBe(false);
    const withFull = { ...world, solids: [{ ...partial, min: { ...partial.min, y: 0 }, max: { ...partial.max, y: 3.2 } }] };
    expect(actorVolumeOccluded(runtime, position, withFull)).toBe(true);
  });
  it('uses six safe waypoint edges, rejects a closed-door edge and contains movement at very low frame rates', () => {
    let runtime = powered();
    expect(GALLERY_ACTOR_ROUTE.length).toBeLessThanOrEqual(12);
    const world = getWorld(runtime);
    for (let i = 1; i < GALLERY_ACTOR_ROUTE.length; i++) expect(actorRouteEdgeOpen(GALLERY_ACTOR_ROUTE[i - 1]!, GALLERY_ACTOR_ROUTE[i]!, world)).toBe(true);
    const blocked = { ...world, solids: [...world.solids, { id: 'test-closed-service-door', kind: 'door' as const, opaque: true, min: { x: 3, y: 0, z: 11.9 }, max: { x: 5, y: 3.2, z: 12.1 } }] };
    expect(actorRouteEdgeOpen(GALLERY_ACTOR_ROUTE[2]!, GALLERY_ACTOR_ROUTE[3]!, blocked)).toBe(false);
    runtime = tick(runtime, ACTOR_TELEGRAPH_SECONDS + .1).runtime;
    runtime.pose = { position: { x: -7, y: 1.6, z: -10.7 }, yaw: 0, pitch: 0 };
    const before = runtime.gallery!.actor.position;
    const slow = advanceGalleryActor(runtime, 20, { intensity: 'standard' }); runtime = slow.runtime;
    expect(slow.movedDistance).toBeLessThanOrEqual(.72 * .25 + 1e-8);
    expect(Math.hypot(runtime.gallery!.actor.position.x - before.x, runtime.gallery!.actor.position.z - before.z)).toBeLessThan(.2);
    for (let i = 0; i < 500; i++) {
      runtime = advanceGalleryActor(runtime, .1, { intensity: 'standard' }).runtime;
      expect(isSafePose(actorPose(runtime.gallery!.actor.position), getWorld(runtime))).toBe(true);
      expect(runtime.gallery!.actor.position.z).toBeGreaterThanOrEqual(9);
      expect(runtime.gallery!.actor.position.z).toBeLessThanOrEqual(15.65);
    }
    expect(runtime.gallery!.actor.travelledDistance).toBeGreaterThan(12);
  });
  it('reserves the whole walking body around shelves, floor edges and overhead obstacles independently of the player', () => {
    const world = getWorld(powered()), nearShelf = { x: 3.45, y: 0, z: 12.1 };
    expect(ACTOR_COLLISION_RADIUS).toBeGreaterThan(.42);
    expect(isSafePose(actorPose(nearShelf), world)).toBe(true);
    expect(actorRouteEdgeOpen(nearShelf, nearShelf, world)).toBe(false);
    const point = { x: 4, y: 0, z: 11 }, edgeWorld = { ...world, floors: [{ id: 'narrow-floor', minX: 3.7, maxX: 4.3, minZ: 10, maxZ: 12 }] };
    expect(isSafePose(actorPose(point), edgeWorld)).toBe(true);
    expect(actorRouteEdgeOpen(point, point, edgeWorld)).toBe(false);
    const headOnly = { ...world, solids: [...world.solids, { id: 'overhead-obstacle', kind: 'device' as const, opaque: true, min: { x: 3.8, y: 1.95, z: 10.8 }, max: { x: 4.2, y: 2.1, z: 11.2 } }] };
    expect(isSafePose(actorPose(point), headOnly)).toBe(true);
    expect(actorRouteEdgeOpen(point, point, headOnly)).toBe(false);
    const rest = GALLERY_ACTOR_ROUTE[5]!;
    expect(actorRouteEdgeOpen(GALLERY_ACTOR_ROUTE[4]!, rest, world)).toBe(true);
    expect(actorRouteEdgeOpen(rest, GALLERY_ACTOR_ROUTE[4]!, world)).toBe(true);
  });
  it('has no contact before a visible warning interval and catches only in the service area while preserving power', () => {
    let runtime = powered();
    const first = advanceGalleryActor(runtime, .05, { intensity: 'standard' }); runtime = first.runtime;
    expect(first.events).toEqual(['warning']); expect(runtime.gallery!.actor.phase).toBe('telegraph');
    runtime.pose = actorPose(runtime.gallery!.actor.position);
    const protectedTime = tick(runtime, 2.5);
    expect(protectedTime.events).not.toContain('caught'); runtime = protectedTime.runtime;
    const before = runtime.progress.gallery!;
    const caught = tick(runtime, 1);
    expect(caught.events.filter(e => e === 'caught')).toHaveLength(1);
    expect(caught.runtime.pose).toEqual(GALLERY_SERVICE_CHECKPOINT);
    expect(caught.runtime.progress.gallery).toEqual(before);
    expect(caught.runtime.gallery!.actor.contactCooldown).toBeGreaterThan(3);
    expect(tick(caught.runtime, 1).events).not.toContain('caught');
  });
  it('uses facing and real shelf occlusion; loss of sight exits pursuit instead of following into safe rooms', () => {
    let runtime = tick(powered(), 3).runtime;
    runtime.gallery!.actor = { ...runtime.gallery!.actor, phase: 'patrol', position: { x: 4, y: 0, z: 12.1 }, yaw: 0, startupGrace: 0 };
    runtime.pose = { position: { x: 4, y: 1.6, z: 10.8 }, yaw: Math.PI, pitch: 0 };
    expect(actorCanSeePlayer(runtime)).toBe(true);
    const noticed = advanceGalleryActor(runtime, .05, { intensity: 'standard' }); runtime = noticed.runtime;
    expect(runtime.gallery!.actor.phase).toBe('noticed');
    runtime = tick(runtime, .9).runtime; expect(runtime.gallery!.actor.phase).toBe('approach');
    runtime.pose = GALLERY_SAFE_RETREATS[0]!;
    expect(segmentOccluded({ ...runtime.gallery!.actor.position, y: 1.82 }, runtime.pose.position, getWorld(runtime))).toBe(true);
    expect(actorCanSeePlayer(runtime)).toBe(false);
    runtime = advanceGalleryActor(runtime, .05, { intensity: 'standard' }).runtime;
    expect(runtime.gallery!.actor.phase).toBe('search');
    runtime = tick(runtime, 2).runtime; expect(runtime.gallery!.actor.phase).toBe('patrol');
    expect(runtime.gallery!.actor.position.x).toBeGreaterThan(3.3);
    runtime.gallery!.actor.yaw = Math.PI;
    runtime.pose = { position: { x: 4, y: 1.6, z: runtime.gallery!.actor.position.z - 1 }, yaw: 0, pitch: 0 };
    expect(actorCanSeePlayer(runtime)).toBe(false);
  });
  it('freezes during pause and manipulation, then resumes without teleporting or immediate pursuit', () => {
    let runtime = tick(powered(), 3).runtime;
    const paused = pauseRuntime(runtime);
    expect(advanceGalleryActor(paused, 30, { intensity: 'standard' }).runtime).toBe(paused);
    const manipulating = { ...runtime, gallery: { ...runtime.gallery!, mode: 'shadow' as const } };
    expect(advanceGalleryActor(manipulating, 30, { intensity: 'standard' }).runtime).toBe(manipulating);
    runtime.gallery!.actor.phase = 'approach';
    const oldPosition = runtime.gallery!.actor.position;
    runtime = resumeGalleryActor(runtime);
    expect(runtime.gallery!.actor.position).toBe(oldPosition);
    expect(runtime.gallery!.actor.phase).toBe('patrol');
    expect(runtime.gallery!.actor.startupGrace).toBeGreaterThanOrEqual(2.5);
    runtime.pose = actorPose(runtime.gallery!.actor.position);
    expect(tick(runtime, 2.5).events).not.toContain('caught');
  });
  it('subdued never pursues or resets, changes modes without disappearing, and keeps the final door area safe', () => {
    let runtime = tick(powered(), 3).runtime;
    runtime.gallery!.actor.phase = 'approach'; const position = runtime.gallery!.actor.position;
    runtime.pose = actorPose(position);
    const changed = advanceGalleryActor(runtime, .05, { intensity: 'subdued' }); runtime = changed.runtime;
    expect(changed.caught).toBe(false); expect(runtime.gallery!.actor.visible).toBe(true);
    expect(Math.hypot(runtime.gallery!.actor.position.x - position.x, runtime.gallery!.actor.position.z - position.z)).toBeLessThan(.04);
    expect(tick(runtime, 10, 'subdued').events).not.toContain('caught');
    runtime.pose = { position: { x: 4, y: 1.6, z: 17 }, yaw: Math.PI, pitch: 0 };
    runtime = advanceGalleryActor(runtime, .05, { intensity: 'standard' }).runtime;
    expect(runtime.progress.gallery!.story.resolved).toBe(true); expect(runtime.gallery!.actor.phase).toBe('resolved');
    expect(tick(runtime, 20).events).not.toContain('caught');
  });
  it('prevents repeated capture across contact, restoration, huge elapsed time and mode changes', () => {
    let runtime = tick(powered(), 3).runtime;
    runtime.pose = actorPose(runtime.gallery!.actor.position);
    const caught = advanceGalleryActor(runtime, .05, { intensity: 'standard' });
    expect(caught.caught).toBe(true); runtime = caught.runtime;
    const saved = createCheckpoint(runtime), restored = createGalleryRuntime(restoreGalleryCheckpoint(saved)!.checkpoint);
    const huge = advanceGalleryActor(restored, 3600, { intensity: 'standard' });
    expect(huge.caught).toBe(false); expect(huge.runtime.gallery!.actor.startupGrace).toBeGreaterThanOrEqual(2.5);
    expect(tick(huge.runtime, 30).events).not.toContain('caught');
    runtime.pose = actorPose(runtime.gallery!.actor.position);
    expect(tick(runtime, 2.5).events).not.toContain('caught');
    runtime = advanceGalleryActor(runtime, .05, { intensity: 'subdued' }).runtime;
    const switched = advanceGalleryActor(runtime, .05, { intensity: 'standard' });
    expect(switched.caught).toBe(false); expect(switched.runtime.gallery!.actor.startupGrace).toBeGreaterThanOrEqual(2.5);
    expect(switched.runtime.progress.gallery!.powerConnected).toBe(true);
    const gateWorld = getWorld(createGalleryRuntime());
    expect(actorRouteEdgeOpen({ x: 0, y: 0, z: 5 }, { x: 0, y: 0, z: 9 }, gateWorld)).toBe(false);
  });
  it('rejects unknown schemas and malformed or impossible story bits without accepting pursuit timers', () => {
    const checkpoint = createCheckpoint(powered()), gallery = checkpoint.progress.gallery!;
    for (const story of [undefined, {}, { ...gallery.story, absence: 'yes' }, { ...gallery.story, foreshadowed: false, absence: true }]) {
      expect(restoreGalleryCheckpoint({ ...checkpoint, progress: { ...checkpoint.progress, gallery: { ...gallery, story } } })).toBeUndefined();
    }
    expect(restoreGalleryCheckpoint({ ...checkpoint, schemaVersion: 2 })).toBeUndefined();
    expect(restoreGalleryCheckpoint({ ...checkpoint, progress: { ...checkpoint.progress, gallery: { ...gallery, schemaVersion: 99 } } })).toBeUndefined();
    const initial = createCheckpoint(createGalleryRuntime());
    expect(restoreGalleryCheckpoint({ ...initial, progress: { ...initial.progress, gallery: { ...initial.progress.gallery, story: { foreshadowed: true, absence: true, serviceWarned: false, resolved: false } } } })).toBeUndefined();
    expect(restoreGalleryCheckpoint({ ...initial, progress: { ...initial.progress, gallery: { ...initial.progress.gallery, story: { foreshadowed: false, absence: false, serviceWarned: true, resolved: false } } } })).toBeUndefined();
  });
  it('persists only one-shot semantics and authorized safe poses; reload arms a grace period without replay', () => {
    let runtime = tick(powered(), 3).runtime;
    runtime.pose = { position: { x: 4, y: 1.6, z: 15 }, yaw: 0, pitch: 0 };
    const checkpoint = createCheckpoint(runtime);
    expect(checkpoint.pose).toEqual(GALLERY_SERVICE_CHECKPOINT);
    expect(JSON.stringify(checkpoint)).not.toMatch(/phaseTime|startupGrace|contactCooldown|travelledDistance|lastSeen|activeDrag/);
    const restored = createGalleryRuntime(restoreGalleryCheckpoint(checkpoint)!.checkpoint);
    expect(restored.progress.gallery!.story).toEqual(runtime.progress.gallery!.story);
    expect(restored.gallery!.actor.startupGrace).toBeGreaterThanOrEqual(2.5);
    const events = tick(restored, 3).events;
    expect(events).not.toContain('absence'); expect(events).not.toContain('foreshadow'); expect(events).not.toContain('warning');
  });
});
