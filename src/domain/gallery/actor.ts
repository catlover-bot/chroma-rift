import { getWorld } from '../firstPerson/chapter';
import { clamp, MAX_FRAME_DELTA, segmentOccluded } from '../firstPerson/geometry';
import { occlusionCertificate } from '../firstPerson/runtime';
import type { CameraMatrices, ChapterRuntime, CollisionVolume, Vec3, WorldGeometry } from '../firstPerson/types';
import { GALLERY_DISPLAY_POSITION, GALLERY_SERVICE_CHECKPOINT } from './definition';
import { galleryPowerCount } from './selectors';
import type { GalleryActor, GalleryProgress, HorrorIntensity } from './types';

export const ACTOR_TELEGRAPH_SECONDS = 2.75;
export const ACTOR_CONTACT_DISTANCE = .56;
/** Body collision is independent of the player capsule and the conservative
 * sight envelope. It covers the walking sculpture at every yaw. */
export const ACTOR_COLLISION_RADIUS = .44;
export const ACTOR_MODEL_BOUNDS = { halfWidth: .52, halfDepth: .52, height: 2.24 } as const;
/** Six hand-authored points, including the display and an off-center subdued
 * rest position. There is no graph edge into the puzzle wings or shelters. */
export const GALLERY_ACTOR_ROUTE: readonly Vec3[] = [
  { x: 0, y: 0, z: 9 }, { x: 4, y: 0, z: 9 }, { x: 4, y: 0, z: 11 },
  { x: 4, y: 0, z: 13 }, { x: 4, y: 0, z: 15.6 }, { x: 4.45, y: 0, z: 15.8 },
];
export type GalleryActorEvent = 'foreshadow' | 'absence' | 'warning' | 'caught';
export type GalleryActorStep = { runtime: ChapterRuntime; caught: boolean; movedDistance: number; events: GalleryActorEvent[] };
export function initialGalleryActor(progress: GalleryProgress): GalleryActor {
  return { position: { ...(progress.story.absence ? GALLERY_ACTOR_ROUTE[4]! : GALLERY_DISPLAY_POSITION) }, yaw: 0,
    phase: progress.story.resolved ? 'resolved' : 'dormant', phaseTime: 0, routeIndex: progress.story.absence ? 3 : 1, routeDirection: -1,
    startupGrace: ACTOR_TELEGRAPH_SECONDS, contactCooldown: ACTOR_TELEGRAPH_SECONDS, travelledDistance: 0,
    visible: progress.emergencyLit || progress.story.foreshadowed || progress.powerConnected, intensity: 'standard' };
}
export function actorVolume(runtime: ChapterRuntime): CollisionVolume | undefined {
  const actor = runtime.gallery?.actor;
  if (!actor) return undefined;
  return volumeAt(actor.position);
}
function volumeAt(position: Vec3): CollisionVolume {
  return { id: 'gallery-actor-visible-volume', kind: 'device', opaque: true,
    min: { x: position.x - ACTOR_MODEL_BOUNDS.halfWidth, y: -.04, z: position.z - ACTOR_MODEL_BOUNDS.halfDepth },
    max: { x: position.x + ACTOR_MODEL_BOUNDS.halfWidth, y: ACTOR_MODEL_BOUNDS.height, z: position.z + ACTOR_MODEL_BOUNDS.halfDepth } };
}
/** A single opaque face must hide every corner of the entire actor envelope.
 * Turning away or merely hiding its center cannot authorize disappearance. */
export function actorVolumeOccluded(runtime: ChapterRuntime, position: Vec3, world = getWorld(runtime)): boolean {
  return !!occlusionCertificate(runtime.pose, volumeAt(position), world.solids);
}
function servicePosition(position: Vec3): boolean {
  return position.z >= 8.72 && position.z <= 16.25 && (
    position.x >= 3.35 && position.x <= 4.6 || position.z <= 9.35 && position.x >= -.6 && position.x <= 4.6);
}
function playerInDanger(runtime: ChapterRuntime): boolean {
  const p = runtime.pose.position;
  return p.z >= 8.55 && p.z < 16.6 && p.x >= 3.15 && p.x <= 4.85;
}
function actorEye(actor: GalleryActor): Vec3 { return { x: actor.position.x, y: 1.82, z: actor.position.z }; }
export function actorCanSeePlayer(runtime: ChapterRuntime): boolean {
  const actor = runtime.gallery?.actor;
  if (!actor || !playerInDanger(runtime) || !runtime.progress.gallery?.powerConnected) return false;
  const dx = runtime.pose.position.x - actor.position.x, dz = runtime.pose.position.z - actor.position.z, distance = Math.hypot(dx, dz);
  if (distance > 4.6 || distance < 1e-8) return distance < 1e-8;
  const facing = (-Math.sin(actor.yaw) * dx - Math.cos(actor.yaw) * dz) / distance;
  return facing >= Math.cos(50 * Math.PI / 180) && !segmentOccluded(actorEye(actor), runtime.pose.position, getWorld(runtime));
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
  return [1, 2, 3, 4].sort((a, b) => Math.hypot(GALLERY_ACTOR_ROUTE[a]!.x - position.x, GALLERY_ACTOR_ROUTE[a]!.z - position.z) - Math.hypot(GALLERY_ACTOR_ROUTE[b]!.x - position.x, GALLERY_ACTOR_ROUTE[b]!.z - position.z))[0]!;
}
/** Pause/GL retry/manipulation recovery never teleports the actor. */
export function resumeGalleryActor(runtime: ChapterRuntime): ChapterRuntime {
  const actor = runtime.gallery?.actor;
  if (!actor) return runtime;
  return { ...runtime, gallery: { ...runtime.gallery!, actor: { ...actor,
    phase: actor.phase === 'dormant' || actor.phase === 'departing' || actor.phase === 'resolved' || actor.phase === 'telegraph' ? actor.phase : 'patrol',
    phaseTime: actor.phase === 'telegraph' ? actor.phaseTime : 0, routeIndex: nearestRoute(actor.position), lastSeen: undefined,
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
    actor = { ...actor, intensity: options.intensity, phase: actor.phase === 'dormant' || actor.phase === 'departing' || actor.phase === 'resolved' ? actor.phase : 'patrol', phaseTime: 0,
      routeIndex: nearestRoute(actor.position), lastSeen: undefined, startupGrace: ACTOR_TELEGRAPH_SECONDS, contactCooldown: ACTOR_TELEGRAPH_SECONDS };
  }
  if (gallery.emergencyLit && !story.foreshadowed) {
    story = { ...story, foreshadowed: true }; actor.visible = true;
    if (galleryPowerCount(gallery) === 0) events.push('foreshadow');
  }
  if (story.foreshadowed && !story.absence && galleryPowerCount(gallery) > 0 && actorVolumeOccluded(runtime, actor.position)) {
    // Once the full body is hidden, begin a real departure. Every subsequent
    // frame walks the same entity along the corridor, including if seen again.
    story = { ...story, absence: true }; actor = { ...actor, phase: 'departing', routeIndex: 1, phaseTime: 0 }; events.push('absence');
  }
  if (actor.phase === 'departing') {
    const moved = move(actor, GALLERY_ACTOR_ROUTE[actor.routeIndex]!, .72, elapsed, getWorld(runtime)); actor = moved.actor; movedDistance += moved.distance;
    const target = GALLERY_ACTOR_ROUTE[actor.routeIndex]!;
    if (Math.hypot(actor.position.x - target.x, actor.position.z - target.z) < .035) actor = actor.routeIndex === 4 ?
      { ...actor, phase: 'dormant', phaseTime: 0, routeIndex: 3 } : { ...actor, routeIndex: actor.routeIndex + 1 };
  }
  if (gallery.powerConnected && runtime.pose.position.z >= 16.6 && runtime.pose.position.x >= 3 && runtime.pose.position.x <= 5) {
    story = { ...story, resolved: true }; actor = { ...actor, phase: 'resolved', lastSeen: undefined };
  }
  if (gallery.powerConnected && runtime.pose.position.z > 6.5 && !story.resolved && (actor.phase === 'dormant' || actor.phase === 'departing')) {
    actor = { ...actor, visible: true, phase: 'telegraph', phaseTime: 0, startupGrace: Math.max(actor.startupGrace, ACTOR_TELEGRAPH_SECONDS) };
    if (!story.serviceWarned) { story = { ...story, serviceWarned: true }; events.push('warning'); }
  }
  if (actor.phase === 'telegraph' && actor.phaseTime >= ACTOR_TELEGRAPH_SECONDS) actor = { ...actor, phase: 'patrol', phaseTime: 0 };
  let next = { ...runtime, progress: { ...runtime.progress, gallery: { ...gallery, story } }, gallery: { ...live, actor } };
  if (['patrol', 'noticed', 'approach', 'search'].includes(actor.phase) && !story.resolved) {
    const world = getWorld(next), subdued = options.intensity === 'subdued';
    const sees = actorCanSeePlayer(next);
    if (subdued) {
      // Walk out of the main lane instead of disappearing on a mode change.
      const target = actor.position.x < 3.4 ? GALLERY_ACTOR_ROUTE[1]! : actor.position.z < 15.3 ? { x: 4, y: 0, z: 15.6 } : GALLERY_ACTOR_ROUTE[5]!;
      const moved = move({ ...actor, phase: 'patrol', lastSeen: undefined }, target, .62, elapsed, world); actor = moved.actor; movedDistance += moved.distance;
    } else if (actor.startupGrace <= 0) {
      if (actor.phase === 'patrol' && sees) actor = { ...actor, phase: 'noticed', phaseTime: 0, lastSeen: { ...runtime.pose.position } };
      if (actor.phase === 'noticed') {
        if (!sees) actor = { ...actor, phase: 'search', phaseTime: 0 };
        else if (actor.phaseTime >= .8) actor = { ...actor, phase: 'approach', phaseTime: 0 };
      }
      if (actor.phase === 'approach') {
        if (!sees) actor = { ...actor, phase: 'search', phaseTime: 0 };
        else {
          const moved = move({ ...actor, lastSeen: { ...runtime.pose.position } }, runtime.pose.position, 1.15, elapsed, world); actor = moved.actor; movedDistance += moved.distance;
        }
      }
      if (actor.phase === 'search') {
        if (actor.phaseTime >= 1.6) actor = { ...actor, phase: 'patrol', phaseTime: 0, routeIndex: nearestRoute(actor.position), lastSeen: undefined };
        else if (actor.lastSeen && servicePosition(actor.lastSeen)) { const moved = move(actor, actor.lastSeen, .45, elapsed, world); actor = moved.actor; movedDistance += moved.distance; }
      }
      if (actor.phase === 'patrol') {
        const target = GALLERY_ACTOR_ROUTE[actor.routeIndex]!;
        if (Math.hypot(target.x - actor.position.x, target.z - actor.position.z) < .035) {
          if (actor.routeIndex === 1) actor.routeDirection = 1;
          if (actor.routeIndex === 4) actor.routeDirection = -1;
          actor = { ...actor, routeIndex: actor.routeIndex + actor.routeDirection };
        }
        const moved = move(actor, GALLERY_ACTOR_ROUTE[actor.routeIndex]!, .72, elapsed, world); actor = moved.actor; movedDistance += moved.distance;
      }
    }
    next = { ...next, gallery: { ...next.gallery!, actor } };
    if (!subdued && actor.startupGrace <= 0 && actor.contactCooldown <= 0 && playerInDanger(next) &&
      Math.hypot(actor.position.x - runtime.pose.position.x, actor.position.z - runtime.pose.position.z) < ACTOR_CONTACT_DISTANCE &&
      !segmentOccluded(actorEye(actor), runtime.pose.position, world)) {
      actor = { ...actor, phase: 'search', phaseTime: 0, routeIndex: nearestRoute(actor.position), lastSeen: undefined,
        startupGrace: ACTOR_TELEGRAPH_SECONDS, contactCooldown: 4 };
      next = { ...next, pose: { ...GALLERY_SERVICE_CHECKPOINT, position: { ...GALLERY_SERVICE_CHECKPOINT.position } }, gallery: { ...next.gallery!, actor } };
      events.push('caught'); return { runtime: next, caught: true, movedDistance, events };
    }
  }
  return { runtime: next, caught: false, movedDistance, events };
}
