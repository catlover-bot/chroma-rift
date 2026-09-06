import { getWorld } from '../firstPerson/chapter';
import { cameraMatchesPose, projectWithCamera } from '../firstPerson/alignment';
import { clamp, MAX_FRAME_DELTA, segmentOccluded } from '../firstPerson/geometry';
import { occlusionCertificate } from '../firstPerson/runtime';
import type { CameraMatrices, ChapterRuntime, CollisionVolume, Vec3, WorldGeometry } from '../firstPerson/types';
import { GALLERY_DISPLAY_POSITION } from './definition';
import { galleryPowerCount, isGalleryExitThreshold } from './selectors';
import type { GalleryActor, GalleryProgress, HorrorIntensity } from './types';

export const ACTOR_TELEGRAPH_SECONDS = 2.75;
export const GALLERY_ACTOR_STEP_DISTANCE = .48;
export const ACTOR_CONTACT_DISTANCE = .68;
export const ACTOR_COLLISION_RADIUS = .44;
export const ACTOR_MODEL_BOUNDS = { halfWidth: .52, halfDepth: .52, height: 2.24 } as const;
/** One continuous route: display, framed crossing, staging before the closed
 * shutter, and four patrol points. The final point is subdued off-lane rest. */
export const GALLERY_ACTOR_ROUTE: readonly Vec3[] = [
  GALLERY_DISPLAY_POSITION, { x: .28, y: 0, z: 9 }, { x: 4, y: 0, z: 9 }, { x: 4, y: 0, z: 10.25 },
  { x: 4, y: 0, z: 12 }, { x: 4, y: 0, z: 15.5 }, { x: 4, y: 0, z: 17.5 }, { x: 4, y: 0, z: 20.5 }, { x: 4.4, y: 0, z: 21.3 },
];
export function actorCrossingPoint(seed: number): Vec3 { return { x: [.18, .28, .38][seed % 3]!, y: 0, z: 9 }; }
export type GalleryActorEvent = 'foreshadow' | 'absence' | 'crossing' | 'warning' | 'caught';
export type GalleryActorStep = { runtime: ChapterRuntime; caught: boolean; movedDistance: number; events: GalleryActorEvent[] };
export function initialGalleryActor(progress: GalleryProgress): GalleryActor {
  const position = progress.story.crossingStarted ? GALLERY_ACTOR_ROUTE[progress.wiring.solved ? 7 : 3]! : GALLERY_DISPLAY_POSITION;
  return { position: { ...position }, yaw: 0, phase: progress.story.resolved ? 'resolved' : 'dormant', phaseTime: 0,
    routeIndex: progress.wiring.solved ? 6 : 1, routeDirection: -1, startupGrace: ACTOR_TELEGRAPH_SECONDS,
    contactCooldown: ACTOR_TELEGRAPH_SECONDS, travelledDistance: 0, visible: true, intensity: 'standard' };
}
export function actorVolume(runtime: ChapterRuntime): CollisionVolume | undefined { return runtime.gallery ? volumeAt(runtime.gallery.actor.position) : undefined; }
function volumeAt(position: Vec3): CollisionVolume {
  return { id: 'gallery-actor-visible-volume', kind: 'device', opaque: true,
    min: { x: position.x - ACTOR_MODEL_BOUNDS.halfWidth, y: -.04, z: position.z - ACTOR_MODEL_BOUNDS.halfDepth },
    max: { x: position.x + ACTOR_MODEL_BOUNDS.halfWidth, y: ACTOR_MODEL_BOUNDS.height, z: position.z + ACTOR_MODEL_BOUNDS.halfDepth } };
}
export function actorVolumeOccluded(runtime: ChapterRuntime, position: Vec3, world = getWorld(runtime)): boolean {
  return !!occlusionCertificate(runtime.pose, volumeAt(position), world.solids);
}
function servicePosition(position: Vec3): boolean {
  return position.z >= 8.7 && position.z <= 21.7 && (position.x >= 3.35 && position.x <= 4.6 || position.z <= 10.35 && position.x >= -.6 && position.x <= 4.6);
}
function playerInDanger(runtime: ChapterRuntime): boolean {
  const p = runtime.pose.position;
  return !!runtime.progress.gallery?.wiring.solved && p.z >= 11.6 && p.z < 22.4 && p.x >= 3.15 && p.x <= 4.85;
}
function actorEye(actor: GalleryActor): Vec3 { return { x: actor.position.x, y: 1.82, z: actor.position.z }; }
export function actorCanSeePlayer(runtime: ChapterRuntime): boolean {
  const actor = runtime.gallery?.actor;
  if (!actor || !playerInDanger(runtime) || !runtime.progress.gallery?.powerConnected) return false;
  const dx = runtime.pose.position.x - actor.position.x, dz = runtime.pose.position.z - actor.position.z, distance = Math.hypot(dx, dz);
  if (distance > 5.4 || distance < 1e-8) return distance < 1e-8;
  return (-Math.sin(actor.yaw) * dx - Math.cos(actor.yaw) * dz) / distance >= Math.cos(52 * Math.PI / 180) &&
    !segmentOccluded(actorEye(actor), runtime.pose.position, getWorld(runtime));
}
/** This records possible on-screen presentation, never awareness or fear. A
 * camera outside the authored pose cannot mark the event as presented. */
function crossingPossiblyPresented(runtime: ChapterRuntime, matrices?: CameraMatrices): boolean {
  if (!matrices || !cameraMatchesPose(runtime.pose, matrices)) return false;
  const actor = runtime.gallery!.actor, world = getWorld(runtime);
  return [-.18, 0, .18].some(dx => [1.55, 1.9, 2.08].some(y => {
    const point = { x: actor.position.x + dx, y, z: actor.position.z };
    return !!projectWithCamera(point, matrices) && !segmentOccluded(runtime.pose.position, point, world);
  }));
}
function allowed(position: Vec3, world: WorldGeometry): boolean {
  if (![position.x, position.y, position.z].every(Number.isFinite) || !servicePosition(position)) return false;
  // The same rendered floor union must support the actor's wider footprint.
  for (let i = -1; i < 16; i++) {
    const x = position.x + (i < 0 ? 0 : Math.cos(i * Math.PI / 8) * ACTOR_COLLISION_RADIUS);
    const z = position.z + (i < 0 ? 0 : Math.sin(i * Math.PI / 8) * ACTOR_COLLISION_RADIUS);
    if (!world.floors.some(floor => x >= floor.minX && x <= floor.maxX && z >= floor.minZ && z <= floor.maxZ)) return false;
  }
  return !world.solids.some(solid => {
    if (solid.id === 'gallery-actor-body') return false;
    if (solid.min.y >= ACTOR_MODEL_BOUNDS.height || solid.max.y <= -.04) return false;
    const dx = position.x - clamp(position.x, solid.min.x, solid.max.x);
    const dz = position.z - clamp(position.z, solid.min.z, solid.max.z);
    return dx * dx + dz * dz < ACTOR_COLLISION_RADIUS ** 2 - 1e-7;
  });
}
export function actorRouteEdgeOpen(from: Vec3, to: Vec3, world: WorldGeometry): boolean {
  const length = Math.hypot(to.x - from.x, to.z - from.z), steps = Math.max(1, Math.ceil(length / (ACTOR_COLLISION_RADIUS / 4)));
  for (let i = 0; i <= steps; i++) if (!allowed({ x: from.x + (to.x - from.x) * i / steps, y: 0, z: from.z + (to.z - from.z) * i / steps }, world)) return false;
  return true;
}
function move(actor: GalleryActor, target: Vec3, speed: number, dt: number, world: WorldGeometry): { actor: GalleryActor; distance: number } {
  const dx = target.x - actor.position.x, dz = target.z - actor.position.z, length = Math.hypot(dx, dz);
  if (length < 1e-7 || dt <= 0) return { actor, distance: 0 };
  const total = Math.min(length, speed * dt), steps = Math.max(1, Math.ceil(total / (ACTOR_COLLISION_RADIUS / 4)));
  let position = actor.position, moved = 0;
  for (let i = 0; i < steps; i++) {
    const next = { x: position.x + dx / length * total / steps, y: 0, z: position.z + dz / length * total / steps };
    if (!actorRouteEdgeOpen(position, next, world)) break;
    moved += Math.hypot(next.x - position.x, next.z - position.z); position = next;
  }
  return { actor: { ...actor, position, yaw: Math.atan2(-dx, -dz), travelledDistance: actor.travelledDistance + moved }, distance: moved };
}
function nearestRoute(position: Vec3): number {
  return [4, 5, 6, 7].sort((a, b) => Math.hypot(GALLERY_ACTOR_ROUTE[a]!.x - position.x, GALLERY_ACTOR_ROUTE[a]!.z - position.z) - Math.hypot(GALLERY_ACTOR_ROUTE[b]!.x - position.x, GALLERY_ACTOR_ROUTE[b]!.z - position.z))[0]!;
}
function presentationPhase(actor: GalleryActor): boolean { return actor.phase === 'departing' || actor.phase === 'crossing-pause'; }
export function resumeGalleryActor(runtime: ChapterRuntime): ChapterRuntime {
  const actor = runtime.gallery?.actor;
  if (!actor) return runtime;
  const keepPhase = actor.phase === 'dormant' || actor.phase === 'resolved' || actor.phase === 'telegraph' || presentationPhase(actor);
  return { ...runtime, gallery: { ...runtime.gallery!, actor: { ...actor,
    phase: keepPhase ? actor.phase : 'patrol', phaseTime: keepPhase ? actor.phaseTime : 0,
    routeIndex: keepPhase ? actor.routeIndex : nearestRoute(actor.position), lastSeen: undefined,
    startupGrace: Math.max(actor.startupGrace, ACTOR_TELEGRAPH_SECONDS), contactCooldown: Math.max(actor.contactCooldown, ACTOR_TELEGRAPH_SECONDS) } } };
}
export function advanceGalleryActor(runtime: ChapterRuntime, dt: number, options: { intensity: HorrorIntensity; matrices?: CameraMatrices }): GalleryActorStep {
  const initial = { runtime, caught: false, movedDistance: 0, events: [] as GalleryActorEvent[] };
  const gallery = runtime.progress.gallery, live = runtime.gallery;
  if (!gallery || !live || runtime.paused || runtime.progress.cleared || live.mode !== 'explore' || !Number.isFinite(dt) || dt <= 0) return initial;
  const elapsed = Math.min(MAX_FRAME_DELTA, dt), events: GalleryActorEvent[] = [];
  let story = gallery.story, actor: GalleryActor = { ...live.actor, startupGrace: Math.max(0, live.actor.startupGrace - elapsed), contactCooldown: Math.max(0, live.actor.contactCooldown - elapsed), phaseTime: live.actor.phaseTime + elapsed };
  let movedDistance = 0;
  if (options.intensity !== actor.intensity) {
    const keep = actor.phase === 'dormant' || actor.phase === 'resolved' || presentationPhase(actor);
    actor = { ...actor, intensity: options.intensity, phase: keep ? actor.phase : 'patrol', phaseTime: keep ? actor.phaseTime : 0,
      routeIndex: keep ? actor.routeIndex : nearestRoute(actor.position), lastSeen: undefined, startupGrace: ACTOR_TELEGRAPH_SECONDS, contactCooldown: ACTOR_TELEGRAPH_SECONDS };
  }
  if (gallery.emergencyLit && !story.foreshadowed) {
    story = { ...story, foreshadowed: true };
    // No explanation of either static illusion is announced before observation.
  }
  const player = runtime.pose.position;
  if (!story.crossingStarted && galleryPowerCount(gallery) > 0 && player.z >= -1 && player.z <= 13 && Math.abs(player.x) <= 2.6) {
    story = { ...story, crossingStarted: true, foreshadowed: true, absence: true };
    actor = { ...actor, phase: 'departing', phaseTime: 0, routeIndex: 1 }; events.push('crossing');
  }
  if (presentationPhase(actor)) {
    if (actor.phase === 'crossing-pause') {
      if (actor.phaseTime >= 1.6) actor = { ...actor, phase: 'departing', phaseTime: 0, routeIndex: 2 };
    } else {
      const target = actor.routeIndex === 1 ? actorCrossingPoint(gallery.seed) : GALLERY_ACTOR_ROUTE[actor.routeIndex]!;
      const moved = move(actor, target, .62, elapsed, getWorld(runtime)); actor = moved.actor; movedDistance += moved.distance;
      if (Math.hypot(actor.position.x - target.x, actor.position.z - target.z) < 1e-7) {
        if (actor.routeIndex === 1) actor = { ...actor, phase: 'crossing-pause', phaseTime: 0 };
        else if (actor.routeIndex === 3) actor = { ...actor, phase: 'dormant', phaseTime: 0, routeIndex: 4, routeDirection: 1 };
        else actor = { ...actor, routeIndex: actor.routeIndex + 1 };
      }
    }
    if (!story.crossingPresented && crossingPossiblyPresented({ ...runtime, gallery: { ...live, actor } }, options.matrices)) story = { ...story, crossingPresented: true };
  }
  if (gallery.wiring.solved && story.crossingStarted && !story.resolved && actor.phase === 'dormant' && player.x > 1.1 && player.z > 8.2) {
    actor = { ...actor, phase: 'telegraph', phaseTime: 0, startupGrace: Math.max(actor.startupGrace, ACTOR_TELEGRAPH_SECONDS) };
    if (!story.serviceWarned) { story = { ...story, serviceWarned: true }; events.push('warning'); }
  }
  if (actor.phase === 'telegraph' && actor.phaseTime >= ACTOR_TELEGRAPH_SECONDS) actor = { ...actor, phase: 'patrol', phaseTime: 0 };
  let next = { ...runtime, progress: { ...runtime.progress, gallery: { ...gallery, story } }, gallery: { ...live, actor } };
  if (['patrol', 'noticed', 'approach', 'search'].includes(actor.phase) && !story.resolved && gallery.wiring.solved) {
    const world = getWorld(next), subdued = options.intensity === 'subdued', sees = actorCanSeePlayer(next);
    if (subdued) {
      const target = actor.position.z < 20.3 ? GALLERY_ACTOR_ROUTE[7]! : GALLERY_ACTOR_ROUTE[8]!;
      const moved = move({ ...actor, phase: 'patrol', lastSeen: undefined }, target, .68, elapsed, world); actor = moved.actor; movedDistance += moved.distance;
    } else if (actor.startupGrace <= 0) {
      if ((actor.phase === 'patrol' || actor.phase === 'search') && sees) actor = { ...actor, phase: 'noticed', phaseTime: 0, lastSeen: { ...player } };
      if (actor.phase === 'noticed') {
        if (sees) actor = { ...actor, lastSeen: { ...player } };
        if (!sees) actor = { ...actor, phase: 'search', phaseTime: 0 };
        else if (actor.phaseTime >= .85) actor = { ...actor, phase: 'approach', phaseTime: 0 };
      }
      if (actor.phase === 'approach') {
        if (!sees) actor = { ...actor, phase: 'search', phaseTime: 0 };
        else { const moved = move({ ...actor, lastSeen: { ...player } }, player, 1.25, elapsed, world); actor = moved.actor; movedDistance += moved.distance; }
      }
      if (actor.phase === 'search') {
        if (actor.phaseTime >= 3.2) actor = { ...actor, phase: 'patrol', phaseTime: 0, routeIndex: nearestRoute(actor.position), lastSeen: undefined };
        else if (actor.lastSeen) {
          const moved = move(actor, actor.lastSeen, .58, elapsed, world); actor = moved.actor; movedDistance += moved.distance;
        }
      }
      if (actor.phase === 'patrol') {
        const target = GALLERY_ACTOR_ROUTE[actor.routeIndex]!;
        if (Math.hypot(target.x - actor.position.x, target.z - actor.position.z) < .025) {
          if (actor.routeIndex <= 4) actor.routeDirection = 1;
          if (actor.routeIndex >= 7) actor.routeDirection = -1;
          actor = { ...actor, routeIndex: Math.max(4, Math.min(7, actor.routeIndex + actor.routeDirection)) };
        }
        const moved = move(actor, GALLERY_ACTOR_ROUTE[actor.routeIndex]!, .84, elapsed, world); actor = moved.actor; movedDistance += moved.distance;
      }
    }
    next = { ...next, gallery: { ...next.gallery!, actor } };
    if (!subdued && actor.startupGrace <= 0 && actor.contactCooldown <= 0 && playerInDanger(next) &&
      Math.hypot(actor.position.x - player.x, actor.position.z - player.z) <= ACTOR_CONTACT_DISTANCE &&
      !segmentOccluded(actorEye(actor), player, world)) {
      actor = { ...actor, phase: 'search', phaseTime: 0, routeIndex: nearestRoute(actor.position), lastSeen: undefined, startupGrace: ACTOR_TELEGRAPH_SECONDS, contactCooldown: 4 };
      const safe = live.lastSafePose;
      next = { ...next, pose: { ...safe, position: { ...safe.position } }, gallery: { ...next.gallery!, actor } };
      events.push('caught'); return { runtime: next, caught: true, movedDistance, events };
    }
  }
  // The safe threshold stops detection through playerInDanger; only the actual
  // closing operation sets resolved and freezes the actor behind the same door.
  if (isGalleryExitThreshold(runtime.pose)) actor.lastSeen = undefined;
  return { runtime: next, caught: false, movedDistance, events };
}
