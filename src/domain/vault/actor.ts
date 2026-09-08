import { ACTOR_MOTION, actorMotionEye, advanceActorMotion, createActorMotion, type ActorFootPlant, type ActorGait } from '../actorMotion';
import { cameraMatchesPose, projectWithCamera } from '../firstPerson/alignment';
import { clamp, segmentOccluded } from '../firstPerson/geometry';
import type { CameraMatrices, ChapterRuntime, Vec3, WorldGeometry } from '../firstPerson/types';
import { ACTOR_COLLISION_RADIUS, ACTOR_MODEL_BOUNDS } from '../gallery/actor';
import { getVaultWorld } from './world';
import type { VaultActor, VaultActorPhase, VaultNoise, VaultProgress } from './types';

export const VAULT_AI = Object.freeze({
  patrolSpeed: .72, investigateSpeed: 1.0, pursueSpeed: 2.35, searchSpeed: .62,
  visionRange: 6.4, visionHalfAngle: 52 * Math.PI / 180, recognitionSeconds: .45,
  noiseThreshold: .22, noiseRange: 7, occludedNoiseGain: .28,
  revealSeconds: 1.4, noticeSeconds: .65, windupSeconds: .75, attackSeconds: .42, recoverSeconds: .95,
  searchSeconds: 4.2, returnPause: .6, contactDistance: .68, coldGrace: 3, repathSeconds: .35,
});
/** A small authored graph around both sides of the real central rack. Edges are
 * checked against the same body footprint and currently closed world doors. */
export const VAULT_ACTOR_ROUTE: readonly Vec3[] = [
  { x: 2.5, y: 0, z: 8.5 }, { x: 0, y: 0, z: 8 }, { x: -2.2, y: 0, z: 8 },
  { x: -2.2, y: 0, z: 11.5 }, { x: -2.2, y: 0, z: 15.5 }, { x: -3.1, y: 0, z: 18.5 },
  { x: 0, y: 0, z: 18.5 }, { x: 2.3, y: 0, z: 18.5 }, { x: 2.3, y: 0, z: 14 },
  { x: 2.3, y: 0, z: 11.5 }, { x: 3, y: 0, z: 22 }, { x: 3, y: 0, z: 26 },
];
const GRAPH: readonly (readonly [number, number])[] = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [5, 6], [6, 7], [7, 8], [8, 9], [9, 0], [7, 10], [10, 11]];
const PATROL = [0, 1, 2, 3, 4, 6, 7, 8, 9] as const;
export type VaultActorEvent = 'reveal' | 'noticed' | 'windup' | 'caught' | 'final-warning';
export type VaultActorStep = { runtime: ChapterRuntime; caught: boolean; movedDistance: number; footPlants: ActorFootPlant[]; events: VaultActorEvent[] };
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const point = (p: Vec3): Vec3 => ({ x: p.x, y: p.y, z: p.z });
/** Cold initialization only. In-session pause never invokes this function. */
export function initialVaultActor(progress: VaultProgress): VaultActor {
  const position = progress.rod.solved ? { x: 3, y: 0, z: 25 } : VAULT_ACTOR_ROUTE[0]!;
  return { motion: createActorMotion(position, Math.PI / 2), visible: true,
    phase: progress.finalDoorClosed ? 'resolved' : 'idle', phaseTime: 0,
    recognition: 0, routeIndex: 0, searchIndex: 0, startupGrace: VAULT_AI.coldGrace, contactCooldown: VAULT_AI.coldGrace,
    attackCommitted: false, attackHit: false, lastNoiseSequence: -1, intensity: 'standard', navigationPath: [], repathSeconds: 0, searchDwellSeconds: 0,
    revealTime: progress.story.revealStarted ? VAULT_AI.revealSeconds : 0 };
}
function bodyAllowed(position: Vec3, world: WorldGeometry): boolean {
  if (![position.x, position.y, position.z].every(Number.isFinite)) return false;
  for (let i = -1; i < 16; i++) {
    const x = position.x + (i < 0 ? 0 : Math.cos(i * Math.PI / 8) * ACTOR_COLLISION_RADIUS);
    const z = position.z + (i < 0 ? 0 : Math.sin(i * Math.PI / 8) * ACTOR_COLLISION_RADIUS);
    if (!world.floors.some(floor => x >= floor.minX && x <= floor.maxX && z >= floor.minZ && z <= floor.maxZ)) return false;
  }
  return !world.solids.some(solid => {
    if (solid.id === 'vault-actor-body' || solid.max.y <= 0 || solid.min.y >= ACTOR_MODEL_BOUNDS.height) return false;
    const dx = position.x - clamp(position.x, solid.min.x, solid.max.x), dz = position.z - clamp(position.z, solid.min.z, solid.max.z);
    return dx * dx + dz * dz < ACTOR_COLLISION_RADIUS ** 2 - 1e-8;
  });
}
export function vaultActorEdgeOpen(from: Vec3, to: Vec3, world: WorldGeometry): boolean {
  const steps = Math.max(1, Math.ceil(distance(from, to) / (ACTOR_COLLISION_RADIUS / 4)));
  for (let i = 0; i <= steps; i++) if (!bodyAllowed({ x: from.x + (to.x - from.x) * i / steps, y: 0, z: from.z + (to.z - from.z) * i / steps }, world)) return false;
  return true;
}
export function vaultActorCanSeePlayer(runtime: ChapterRuntime): boolean {
  const actor = runtime.vault?.actor;
  if (!actor || !runtime.progress.vault?.length.solved || !actor.visible) return false;
  const eye = actorMotionEye(actor.motion), p = runtime.pose.position;
  const dx = p.x - eye.position.x, dy = p.y - eye.position.y, dz = p.z - eye.position.z, length = Math.hypot(dx, dy, dz);
  return length <= VAULT_AI.visionRange && (length < 1e-7 || (eye.direction.x * dx + eye.direction.y * dy + eye.direction.z * dz) / length >= Math.cos(VAULT_AI.visionHalfAngle)) &&
    !segmentOccluded(eye.position, p, getVaultWorld(runtime));
}
/** A game event, never an audio preference or microphone observation. */
export function vaultNoiseAudibility(actor: VaultActor, noise: VaultNoise, world: WorldGeometry): number {
  if (!Number.isSafeInteger(noise.sequence) || noise.sequence < 0 || !['footstep', 'metal'].includes(noise.kind) || ![noise.position.x, noise.position.y, noise.position.z, noise.strength].every(Number.isFinite) || noise.strength <= 0) return 0;
  const ear = actorMotionEye(actor.motion).position, range = distance(ear, noise.position);
  if (range > VAULT_AI.noiseRange) return 0;
  return Math.min(1.2, noise.strength) / (1 + range * .6) * (segmentOccluded(ear, noise.position, world) ? VAULT_AI.occludedNoiseGain : 1);
}
function safePlayer(runtime: ChapterRuntime): boolean {
  const p = runtime.pose.position;
  return p.z < 3 || p.z >= 28.05 || p.x < -4.35 && p.z > 16.5 && p.z < 20.5;
}
function setPhase(actor: VaultActor, phase: VaultActorPhase): VaultActor {
  return actor.phase === phase ? actor : { ...actor, phase, phaseTime: 0, navigationPath: [], navigationTarget: undefined, repathSeconds: 0, searchDwellSeconds: 0 };
}
/** Searches an authored graph, then stops at its reachable edge if an observed
 * target is behind a closed door. It never substitutes the hidden player pose. */
function findPath(from: Vec3, target: Vec3, world: WorldGeometry): readonly Vec3[] {
  if (vaultActorEdgeOpen(from, target, world)) return [point(target)];
  const count = VAULT_ACTOR_ROUTE.length;
  const costs = Array.from({ length: count }, () => Infinity), parents = Array.from({ length: count }, () => -1), done = new Set<number>();
  for (let i = 0; i < count; i++) if (vaultActorEdgeOpen(from, VAULT_ACTOR_ROUTE[i]!, world)) costs[i] = distance(from, VAULT_ACTOR_ROUTE[i]!);
  for (let step = 0; step < count; step++) {
    let current = -1;
    for (let i = 0; i < count; i++) if (!done.has(i) && (current < 0 || costs[i]! < costs[current]!)) current = i;
    if (current < 0 || !Number.isFinite(costs[current]!)) break;
    done.add(current);
    for (const [a, b] of GRAPH) {
      const other = current === a ? b : current === b ? a : -1;
      if (other < 0 || done.has(other) || !vaultActorEdgeOpen(VAULT_ACTOR_ROUTE[current]!, VAULT_ACTOR_ROUTE[other]!, world)) continue;
      const cost = costs[current]! + distance(VAULT_ACTOR_ROUTE[current]!, VAULT_ACTOR_ROUTE[other]!);
      if (cost < costs[other]!) { costs[other] = cost; parents[other] = current; }
    }
  }
  let last = -1, best = Infinity, reaches = false;
  for (let i = 0; i < count; i++) {
    if (!Number.isFinite(costs[i]!)) continue;
    const open = vaultActorEdgeOpen(VAULT_ACTOR_ROUTE[i]!, target, world);
    const cost = open ? costs[i]! + distance(VAULT_ACTOR_ROUTE[i]!, target) : distance(VAULT_ACTOR_ROUTE[i]!, target) + 1000;
    if (cost < best) { best = cost; last = i; reaches = open; }
  }
  if (last < 0) return [];
  const result: Vec3[] = [];
  for (let index = last; index >= 0; index = parents[index]!) result.push(VAULT_ACTOR_ROUTE[index]!);
  result.reverse(); if (reaches) result.push(point(target));
  return result;
}
function routeToward(actor: VaultActor, target: Vec3, world: WorldGeometry): { actor: VaultActor; target?: Vec3 } {
  let next = actor;
  if (!next.navigationTarget || distance(next.navigationTarget, target) > .4 || next.repathSeconds <= 0 && next.navigationPath.length === 0) {
    next = { ...next, navigationTarget: point(target), navigationPath: findPath(next.motion.position, target, world), repathSeconds: VAULT_AI.repathSeconds };
  }
  while (next.navigationPath.length && distance(next.motion.position, next.navigationPath[0]!) < .045) next = { ...next, navigationPath: next.navigationPath.slice(1) };
  return { actor: next, ...(next.navigationPath[0] ? { target: next.navigationPath[0] } : {}) };
}
function presented(runtime: ChapterRuntime, matrices?: CameraMatrices): boolean {
  if (!matrices || !cameraMatchesPose(runtime.pose, matrices)) return false;
  const p = runtime.vault!.actor.motion.position, world = getVaultWorld(runtime);
  return [-.16, 0, .16].some(dx => [1.55, 1.95, 2.1].some(y => {
    const target = { x: p.x + dx, y, z: p.z };
    return !!projectWithCamera(target, matrices) && !segmentOccluded(runtime.pose.position, target, world);
  }));
}
function nearestPatrol(actor: VaultActor): number {
  return PATROL.reduce((best, index) => distance(actor.motion.position, VAULT_ACTOR_ROUTE[index]!) < distance(actor.motion.position, VAULT_ACTOR_ROUTE[best]!) ? index : best, 0 as number);
}
export function advanceVaultActor(runtime: ChapterRuntime, dt: number, options: { intensity: 'standard' | 'subdued'; noise?: VaultNoise; matrices?: CameraMatrices }): VaultActorStep {
  const initial: VaultActorStep = { runtime, caught: false, movedDistance: 0, footPlants: [], events: [] };
  const live = runtime.vault, saved = runtime.progress.vault;
  if (!live || !saved || runtime.paused || runtime.progress.cleared || live.mode !== 'explore' || !Number.isFinite(dt) || dt <= 0) return initial;
  const elapsed = Math.min(.05, dt), world = getVaultWorld(runtime), events: VaultActorEvent[] = [];
  let actor: VaultActor = { ...live.actor, phaseTime: live.actor.phaseTime + elapsed, startupGrace: Math.max(0, live.actor.startupGrace - elapsed),
    contactCooldown: Math.max(0, live.actor.contactCooldown - elapsed), repathSeconds: Math.max(0, live.actor.repathSeconds - elapsed) };
  let story = saved.story;
  if (actor.intensity !== options.intensity) {
    actor = { ...setPhase(actor, 'return'), intensity: options.intensity, recognition: 0, attackCommitted: false, attackHit: false,
      startupGrace: Math.max(actor.startupGrace, VAULT_AI.coldGrace), contactCooldown: Math.max(actor.contactCooldown, VAULT_AI.coldGrace), routeIndex: nearestPatrol(actor) };
  }
  if (!saved.length.solved) return initial;
  if (!story.revealStarted) {
    story = { ...story, revealStarted: true }; actor = { ...setPhase(actor, 'listen'), revealTime: 0 }; events.push('reveal');
  }
  actor.revealTime = Math.min(VAULT_AI.revealSeconds, actor.revealTime + elapsed);
  let next: ChapterRuntime = { ...runtime, progress: { ...runtime.progress, vault: { ...saved, story } }, vault: { ...live, actor } };
  const sees = vaultActorCanSeePlayer(next), safe = safePlayer(next), player = runtime.pose.position;
  if (sees) actor = { ...actor, lastSeen: point(player), recognition: Math.min(1, actor.recognition + elapsed / VAULT_AI.recognitionSeconds) };
  else actor = { ...actor, recognition: Math.max(0, actor.recognition - elapsed / .7) };
  let heard = false;
  const noise = options.noise;
  if (noise && Number.isSafeInteger(noise.sequence) && noise.sequence >= 0 && noise.sequence > actor.lastNoiseSequence) {
    actor = { ...actor, lastNoiseSequence: noise.sequence };
    if (vaultNoiseAudibility(actor, noise, world) >= VAULT_AI.noiseThreshold) {
      actor = { ...actor, lastHeard: point(noise.position) }; heard = true;
    }
  }
  if (saved.rod.solved && !story.finalPursuitStarted) {
    story = { ...story, finalPursuitStarted: true }; events.push('final-warning');
    actor = { ...setPhase(actor, 'listen'), phaseTime: 0, routeIndex: 10 };
  }
  const reveal = actor.revealTime < VAULT_AI.revealSeconds, quiet = options.intensity === 'subdued';
  let destination: Vec3 | undefined, lookTarget: Vec3 | undefined, speed = 0, gait: ActorGait = actor.phase === 'resolved' ? 'idle' : actor.phase;
  if (reveal) {
    gait = 'listen'; lookTarget = sees ? point(player) : { x: (saved.seed % 3 - 1) * .2, y: 1.6, z: 3.9 };
  } else {
    const interruptible = ['idle', 'listen', 'patrol', 'investigate', 'search', 'return'].includes(actor.phase);
    if (!quiet && !safe && sees && actor.recognition >= 1 && actor.startupGrace <= 0 && interruptible) { actor = setPhase(actor, 'notice'); events.push('noticed'); }
    else if (!quiet && heard && interruptible) actor = setPhase(actor, 'investigate');
    if (quiet) {
      actor = setPhase(actor, 'patrol');
      // The same visible individual strolls the storage ring; no pursuit/hits.
    } else if (actor.phase === 'notice' && actor.phaseTime >= VAULT_AI.noticeSeconds) actor = setPhase(actor, sees && !safe ? 'pursue' : 'search');
    if (actor.phase === 'idle' || actor.phase === 'listen' && actor.phaseTime >= .85) actor = setPhase(actor, 'patrol');
    if (actor.phase === 'pursue') {
      if (!sees || safe) actor = { ...setPhase(actor, 'search'), searchOrigin: actor.lastSeen ? point(actor.lastSeen) : point(actor.motion.position), searchIndex: 0 };
      else {
        const stopDistance = actor.motion.speed ** 2 / (2 * ACTOR_MOTION.linearDeceleration);
        if (distance(actor.motion.position, player) <= .9 + stopDistance && actor.contactCooldown <= 0 && actor.startupGrace <= 0) {
          actor = { ...setPhase(actor, 'windup'), attackCommitted: false, attackHit: false, attackTarget: undefined }; events.push('windup');
        }
      }
    }
    if (actor.phase === 'windup' && actor.phaseTime >= VAULT_AI.windupSeconds && actor.startupGrace <= 0) {
      if (!actor.lastSeen || safe) actor = setPhase(actor, 'recover');
      else {
        actor = { ...setPhase(actor, 'attack'), attackTarget: point(actor.lastSeen), attackCommitted: true, attackHit: false,
          motion: { ...actor.motion, launchAge: ACTOR_MOTION.startAnticipation, movingIntent: true } };
      }
    }
    if (actor.phase === 'attack' && actor.phaseTime >= VAULT_AI.attackSeconds) actor = { ...setPhase(actor, 'recover'), contactCooldown: VAULT_AI.recoverSeconds, attackCommitted: false };
    if (actor.phase === 'recover' && actor.phaseTime >= VAULT_AI.recoverSeconds) actor = { ...setPhase(actor, 'search'), searchOrigin: actor.lastSeen ? point(actor.lastSeen) : point(actor.motion.position), searchIndex: 0 };
    if (actor.phase === 'search' && actor.searchDwellSeconds >= VAULT_AI.searchSeconds) actor = { ...setPhase(actor, 'return'), routeIndex: nearestPatrol(actor) };
    if (actor.phase === 'investigate' && actor.lastHeard && (distance(actor.motion.position, actor.lastHeard) < .25 || actor.phaseTime >= 5)) actor = { ...setPhase(actor, 'search'), searchOrigin: point(actor.lastHeard), searchIndex: 0 };
    if (actor.phase === 'return' && actor.phaseTime >= VAULT_AI.returnPause && distance(actor.motion.position, VAULT_ACTOR_ROUTE[actor.routeIndex]!) < .1) actor = setPhase(actor, 'patrol');
    if (actor.phase === 'patrol') {
      if (distance(actor.motion.position, VAULT_ACTOR_ROUTE[actor.routeIndex]!) < .12) {
        const index = PATROL.indexOf(actor.routeIndex as typeof PATROL[number]);
        actor = { ...actor, routeIndex: saved.rod.solved && actor.routeIndex >= 10 ? actor.routeIndex === 10 ? 11 : 10 : PATROL[(index + 1) % PATROL.length]! };
      }
      destination = VAULT_ACTOR_ROUTE[actor.routeIndex]!; speed = VAULT_AI.patrolSpeed;
    } else if (actor.phase === 'investigate') { destination = actor.lastHeard; lookTarget = actor.lastHeard; speed = VAULT_AI.investigateSpeed; }
    else if (actor.phase === 'notice' || actor.phase === 'windup') lookTarget = actor.lastSeen;
    else if (actor.phase === 'pursue') { destination = actor.lastSeen; lookTarget = actor.lastSeen; speed = VAULT_AI.pursueSpeed; }
    else if (actor.phase === 'attack') { destination = actor.attackTarget; lookTarget = actor.attackTarget; speed = VAULT_AI.pursueSpeed; }
    else if (actor.phase === 'search') {
      const remembered = actor.searchOrigin ?? actor.lastSeen ?? actor.lastHeard ?? actor.motion.position;
      actor = { ...actor, searchOrigin: actor.searchOrigin ?? point(remembered), searchIndex: Math.min(2, Math.floor(actor.searchDwellSeconds / 1.2)) };
      destination = remembered; speed = VAULT_AI.searchSpeed;
      // Look at three explicit edges around the remembered position, not at a
      // hidden current player. The root can walk only the reachable path.
      const yaw = [.65, -.75, .1][actor.searchIndex]!;
      lookTarget = { x: remembered.x - Math.sin(yaw) * 1.8, y: 1.65, z: remembered.z - Math.cos(yaw) * 1.8 };
    } else if (actor.phase === 'return' && actor.phaseTime >= VAULT_AI.returnPause) { destination = VAULT_ACTOR_ROUTE[actor.routeIndex]!; speed = VAULT_AI.patrolSpeed; }
    gait = actor.phase === 'resolved' ? 'idle' : actor.phase;
  }
  let target: Vec3 | undefined;
  if (destination) {
    if (actor.phase === 'attack') target = destination;
    else {
      const planned = routeToward(actor, destination, world); actor = planned.actor; target = planned.target;
      if (actor.phase === 'search' && (!target || distance(actor.motion.position, destination) < .25)) {
        actor = { ...actor, searchDwellSeconds: actor.searchDwellSeconds + elapsed };
      }
    }
  }
  if (target && actor.phase !== 'attack') {
    const separation = distance(actor.motion.position, player);
    if (separation > 1e-6 && separation < .74) {
      // A player can stand beside the physical body. Take one collision-checked
      // courtesy step away before continuing the graph instead of pinning both
      // bodies against their separation guards. This is local collision data,
      // never a lastSeen/lastHeard observation or a hidden pursuit target.
      const away = { x: actor.motion.position.x + (actor.motion.position.x - player.x) / separation * .28, y: 0,
        z: actor.motion.position.z + (actor.motion.position.z - player.z) / separation * .28 };
      if (vaultActorEdgeOpen(actor.motion.position, away, world)) target = away;
    }
  }
  const desiredHeading = target ? undefined : lookTarget ? Math.atan2(-(lookTarget.x - actor.motion.position.x), -(lookTarget.z - actor.motion.position.z)) : actor.motion.desiredHeading;
  const motion = advanceActorMotion(actor.motion, { ...(target ? { target } : {}), ...(lookTarget ? { lookTarget } : {}), ...(desiredHeading === undefined ? {} : { desiredHeading }), maxSpeed: speed, gait }, elapsed,
    (from, to) => vaultActorEdgeOpen(from, to, world) && (actor.phase === 'attack' || distance(to, player) >= .71 || distance(to, player) > distance(from, player) + 1e-7));
  actor = { ...actor, motion: motion.state };
  next = { ...next, progress: { ...next.progress, vault: { ...saved, story } }, vault: { ...live, actor } };
  if (reveal && !story.revealPresented && presented(next, options.matrices)) {
    story = { ...story, revealPresented: true }; next = { ...next, progress: { ...next.progress, vault: { ...saved, story } } };
  }
  if (!quiet && !safe && actor.phase === 'attack' && actor.attackCommitted && !actor.attackHit && actor.startupGrace <= 0 && actor.contactCooldown <= 0 &&
      distance(actor.motion.position, player) <= VAULT_AI.contactDistance && !segmentOccluded(actorMotionEye(actor.motion).position, player, getVaultWorld(next))) {
    actor = { ...setPhase(actor, 'recover'), attackHit: true, attackCommitted: false, contactCooldown: VAULT_AI.coldGrace, startupGrace: VAULT_AI.coldGrace,
      recognition: 0, routeIndex: nearestPatrol(actor) };
    next = { ...next, pose: { ...live.lastSafePose, position: point(live.lastSafePose.position) }, vault: { ...next.vault!, actor } };
    events.push('caught'); return { runtime: next, caught: true, movedDistance: motion.movedDistance, footPlants: motion.footPlants, events };
  }
  return { runtime: next, caught: false, movedDistance: motion.movedDistance, footPlants: motion.footPlants, events };
}
