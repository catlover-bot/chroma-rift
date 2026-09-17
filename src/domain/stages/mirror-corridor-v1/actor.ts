import { ACTOR_MOTION, actorMotionEye, advanceActorMotion, createActorMotion, type ActorFootPlant, type ActorGait, type ActorMotionState } from '../../actorMotion';
import { ACTOR_COLLISION_RADIUS } from '../../actorMotion/envelope';
import { PLAYER_RADIUS } from '../../firstPerson/constants';
import { segmentOccluded } from '../../firstPerson/geometry';
import type { Vec3, WorldGeometry } from '../../firstPerson/types';
import { VAULT_AI, vaultActorEdgeOpen } from '../../vault/actorPolicy';
import { mirrorRecoveryPose, stageWorld } from './definition';
import type { StageSession } from './session';

export type MirrorNoise = { sequence: number; position: Vec3; strength: number; kind: 'mechanism' | 'footstep' };
export type MirrorActorPhase = 'patrol' | 'investigate' | 'notice' | 'pursue' | 'windup' | 'attack' | 'recover' | 'search' | 'return';
export type MirrorActor = {
  motion: ActorMotionState; visible: boolean; phase: MirrorActorPhase; phaseTime: number;
  recognition: number; startupGrace: number; contactCooldown: number; routeIndex: number;
  lastSeen?: Vec3; lastHeard?: Vec3; lastNoiseSequence: number; searchSeconds: number;
  attackTarget?: Vec3; investigationTarget?: Vec3; recoveryPending: boolean; intensity: 'standard' | 'subdued';
  pathTarget?: Vec3 | undefined; pathWaypoint?: Vec3 | undefined;
};
export type MirrorActorStep = { session: StageSession; caught: boolean; movedDistance: number; footPlants: ActorFootPlant[];
  events: ('noticed' | 'windup' | 'caught')[]; soundSources: Vec3[] };

/** The body stays in the corridor on either side of the winch. Each edge is
 * checked against the same floor, walls and gate used by the player. */
export const MIRROR_PATROL: readonly Vec3[] = [
  { x: 1.05, y: 0, z: 14.25 }, { x: 1.5, y: 0, z: 15.7 }, { x: -.8, y: 0, z: 15.7 },
  { x: -1.45, y: 0, z: 13.4 }, { x: .85, y: 0, z: 12.8 },
];
/** Local timings only: investigating the physical handle includes turning and
 * walking to its reachable side. Other chapter policies are unchanged. */
export const MIRROR_AI = Object.freeze({ ...VAULT_AI, investigationSeconds: 10,
  contactDistance: ACTOR_COLLISION_RADIUS + PLAYER_RADIUS,
  separationDistance: ACTOR_COLLISION_RADIUS + PLAYER_RADIUS + .01 });
const copy = (point: Vec3): Vec3 => ({ x: point.x, y: point.y, z: point.z });
const distance = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.z - b.z);
const finitePoint = (value: unknown): value is Vec3 => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const point = value as Partial<Vec3>;
  return typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y) &&
    typeof point.z === 'number' && Number.isFinite(point.z);
};

export function isMirrorActor(value: unknown): value is MirrorActor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actor = value as Partial<MirrorActor>;
  const motion = actor.motion;
  return !!motion && finitePoint(motion.position) && finitePoint(motion.velocity) &&
    ['patrol', 'investigate', 'notice', 'pursue', 'windup', 'attack', 'recover', 'search', 'return'].includes(String(actor.phase)) &&
    typeof actor.visible === 'boolean' && typeof actor.recoveryPending === 'boolean' &&
    [actor.phaseTime, actor.recognition, actor.startupGrace, actor.contactCooldown, actor.routeIndex, actor.lastNoiseSequence, actor.searchSeconds,
      motion.yaw, motion.speed, motion.headYaw, motion.headPitch, motion.chestYaw, motion.chestLean, motion.pelvisShift].every(value => typeof value === 'number' && Number.isFinite(value)) &&
    (!actor.lastSeen || finitePoint(actor.lastSeen)) && (!actor.lastHeard || finitePoint(actor.lastHeard)) &&
    (!actor.attackTarget || finitePoint(actor.attackTarget)) && (!actor.investigationTarget || finitePoint(actor.investigationTarget)) &&
    (!actor.pathTarget || finitePoint(actor.pathTarget)) && (!actor.pathWaypoint || finitePoint(actor.pathWaypoint)) &&
    (actor.intensity === 'standard' || actor.intensity === 'subdued');
}

export function createMirrorActor(): MirrorActor {
  return { motion: createActorMotion(MIRROR_PATROL[0]!, Math.PI), visible: true, phase: 'patrol', phaseTime: 0,
    recognition: 0, startupGrace: 2.4, contactCooldown: 2.4, routeIndex: 1,
    lastNoiseSequence: -1, searchSeconds: 0, recoveryPending: false, intensity: 'standard' };
}

/** Called by the host only after the recovered view was presented and its
 * input gate is ready. A paused/failed frame cannot consume this grace. */
export function resumeMirrorRecovery(session: StageSession): StageSession {
  return session.actor.recoveryPending ? { ...session, actor: { ...session.actor, recoveryPending: false } } : session;
}

function phase(actor: MirrorActor, next: MirrorActorPhase): MirrorActor {
  return actor.phase === next ? actor : { ...actor, phase: next, phaseTime: 0, pathTarget: undefined, pathWaypoint: undefined,
    searchSeconds: next === 'search' ? 0 : actor.searchSeconds };
}
function canSee(actor: MirrorActor, player: Vec3, world: WorldGeometry): boolean {
  const eye = actorMotionEye(actor.motion), vector = { x: player.x - eye.position.x, y: player.y - eye.position.y, z: player.z - eye.position.z };
  const range = Math.hypot(vector.x, vector.y, vector.z);
  return range <= VAULT_AI.visionRange && range > 1e-6 &&
    (eye.direction.x * vector.x + eye.direction.y * vector.y + eye.direction.z * vector.z) / range >= Math.cos(VAULT_AI.visionHalfAngle) &&
    !segmentOccluded(eye.position, player, world);
}
function audible(actor: MirrorActor, noise: MirrorNoise, world: WorldGeometry): boolean {
  if (!Number.isSafeInteger(noise.sequence) || noise.sequence < 0 || !Number.isFinite(noise.strength) || noise.strength <= 0 || !finitePoint(noise.position)) return false;
  const ear = actorMotionEye(actor.motion).position, range = distance(ear, noise.position);
  if (range > VAULT_AI.noiseRange) return false;
  const gain = segmentOccluded(ear, noise.position, world) ? VAULT_AI.occludedNoiseGain : 1;
  return Math.min(1.2, noise.strength) / (1 + range * .6) * gain >= VAULT_AI.noiseThreshold;
}
function nearestPatrol(point: Vec3): number {
  return MIRROR_PATROL.reduce((best, next, index) => distance(point, next) < distance(point, MIRROR_PATROL[best]!) ? index : best, 0);
}

/** Keep the factual sound position separate from a body-sized observation
 * point. Every candidate and the complete approach edge uses physical walls.
 * No candidate is derived from an unseen player's current position. */
function observationPoint(from: Vec3, source: Vec3, world: WorldGeometry): Vec3 | undefined {
  for (const radius of [0, .72, .96, 1.25, 1.6]) {
    const candidates = Array.from({ length: radius === 0 ? 1 : 16 }, (_, index) => ({
      x: source.x + Math.cos(index * Math.PI / 8) * radius, y: 0,
      z: source.z + Math.sin(index * Math.PI / 8) * radius,
    })).sort((a, b) => distance(from, a) - distance(from, b));
    const reachable = candidates.find(point => vaultActorEdgeOpen(from, point, world));
    if (reachable) return reachable;
  }
  return undefined;
}

// A small authored route around the core and both rack ends. These are
// steering corners, never teleport destinations or knowledge of the player.
const FIXTURE_CORNERS: readonly Vec3[] = [
  { x: -1.7, y: 0, z: 9.75 }, { x: -1.7, y: 0, z: 12.25 },
  { x: -2.5, y: 0, z: 12.25 }, { x: -3.95, y: 0, z: 12.25 },
  { x: -3.95, y: 0, z: 9.85 }, { x: -2.6, y: 0, z: 9.85 },
];
function firstPhysicalCorner(from: Vec3, target: Vec3, world: WorldGeometry): Vec3 | undefined {
  const points = [from, ...FIXTURE_CORNERS, target], end = points.length - 1;
  const costs = points.map(() => Infinity), previous = points.map(() => -1), visited = new Set<number>();
  costs[0] = 0;
  for (let attempt = 0; attempt < points.length; attempt++) {
    let current = -1;
    for (let index = 0; index < points.length; index++)
      if (!visited.has(index) && (current < 0 || costs[index]! < costs[current]!)) current = index;
    if (current < 0 || !Number.isFinite(costs[current]!)) return undefined;
    if (current === end) {
      let first = end;
      while (previous[first]! > 0) first = previous[first]!;
      return points[first];
    }
    visited.add(current);
    for (let next = 1; next < points.length; next++) {
      const cost = costs[current]! + distance(points[current]!, points[next]!);
      if (visited.has(next) || cost >= costs[next]! || !vaultActorEdgeOpen(points[current]!, points[next]!, world)) continue;
      costs[next] = cost; previous[next] = current;
    }
  }
  return undefined;
}

/** One deterministic update. Only real visibility and authored physical noise
 * can update memory; the mirror image and HUD do not feed this AI. */
export function advanceMirrorActor(session: StageSession, dt: number, options: { intensity: 'standard' | 'subdued'; movedDistance: number }): MirrorActorStep {
  const unchanged: MirrorActorStep = { session, caught: false, movedDistance: 0, footPlants: [], events: [], soundSources: [] };
  if (session.cleared || session.actor.recoveryPending || !Number.isFinite(dt) || dt <= 0) return unchanged;
  const elapsed = Math.min(dt, .05), world = stageWorld(session.ratchets, session.keyTaken, session.practiced, session.holding, undefined, session.gateLift);
  const player = session.pose.position, events: MirrorActorStep['events'] = [], soundSources: Vec3[] = [];
  let actor: MirrorActor = { ...session.actor, phaseTime: session.actor.phaseTime + elapsed,
    startupGrace: Math.max(0, session.actor.startupGrace - elapsed), contactCooldown: Math.max(0, session.actor.contactCooldown - elapsed) };
  if (actor.intensity !== options.intensity) actor = { ...phase(actor, 'return'), intensity: options.intensity,
    startupGrace: Math.max(actor.startupGrace, VAULT_AI.coldGrace), contactCooldown: Math.max(actor.contactCooldown, VAULT_AI.coldGrace), recognition: 0,
    routeIndex: nearestPatrol(actor.motion.position) };
  const sees = canSee(actor, player, world);
  actor = sees ? { ...actor, lastSeen: copy(player), recognition: Math.min(1, actor.recognition + elapsed / VAULT_AI.recognitionSeconds) }
    : { ...actor, recognition: Math.max(0, actor.recognition - elapsed / .7) };

  const movedDistance = Number.isFinite(options.movedDistance) ? Math.max(0, options.movedDistance) : 0;
  let noiseSequence = session.noiseSequence, footstepDistance = session.footstepDistance + movedDistance;
  const noises: MirrorNoise[] = session.noise ? [session.noise] : [];
  if (footstepDistance >= .65) {
    footstepDistance %= .65;
    noises.push({ sequence: ++noiseSequence, position: { ...player, y: .08 }, strength: .9, kind: 'footstep' });
  }
  let heard = false;
  for (const noise of noises.sort((a, b) => a.sequence - b.sequence)) {
    if (noise.sequence <= actor.lastNoiseSequence) continue;
    actor = { ...actor, lastNoiseSequence: noise.sequence };
    if (noise.kind === 'mechanism') soundSources.push(copy(noise.position));
    if (audible(actor, noise, world)) {
      const { investigationTarget: _previous, ...rest } = actor;
      const target = observationPoint(actor.motion.position, noise.position, world);
      actor = { ...rest, lastHeard: copy(noise.position), ...(target ? { investigationTarget: target } : {}) };
      heard = true;
    }
  }
  const quiet = options.intensity === 'subdued';
  const interruptible = ['patrol', 'investigate', 'search', 'return'].includes(actor.phase);
  if (!quiet && sees && actor.recognition >= 1 && actor.startupGrace <= 0 && interruptible) {
    actor = phase(actor, 'notice'); events.push('noticed');
  } else if (heard && !sees && interruptible) actor = phase(actor, 'investigate');
  if (quiet && ['notice', 'pursue', 'windup', 'attack'].includes(actor.phase)) actor = phase(actor, 'return');
  if (actor.phase === 'notice' && actor.phaseTime >= VAULT_AI.noticeSeconds) actor = phase(actor, sees ? 'pursue' : 'search');
  if (actor.phase === 'pursue' && !sees) actor = phase(actor, 'search');
  if (actor.phase === 'pursue' && sees && distance(actor.motion.position, player) <= .9 + actor.motion.speed ** 2 / (2 * ACTOR_MOTION.linearDeceleration) && actor.contactCooldown <= 0) {
    actor = phase(actor, 'windup'); events.push('windup');
  }
  if (actor.phase === 'windup' && actor.phaseTime >= VAULT_AI.windupSeconds) actor = actor.lastSeen ? { ...phase(actor, 'attack'), attackTarget: copy(actor.lastSeen) } : phase(actor, 'search');
  if (actor.phase === 'attack' && actor.phaseTime >= VAULT_AI.attackSeconds) actor = { ...phase(actor, 'recover'), contactCooldown: VAULT_AI.recoverSeconds };
  if (actor.phase === 'recover' && actor.phaseTime >= VAULT_AI.recoverSeconds) actor = phase(actor, 'search');
  if (actor.phase === 'investigate' && (!actor.investigationTarget || distance(actor.motion.position, actor.investigationTarget) < .28 ||
    actor.phaseTime >= MIRROR_AI.investigationSeconds)) actor = phase(actor, 'search');
  if (actor.phase === 'search' && actor.searchSeconds >= VAULT_AI.searchSeconds) actor = { ...phase(actor, 'return'), routeIndex: nearestPatrol(actor.motion.position) };
  if (actor.phase === 'return' && distance(actor.motion.position, MIRROR_PATROL[actor.routeIndex]!) < .15) actor = phase(actor, 'patrol');

  let destination: Vec3 | undefined, lookTarget: Vec3 | undefined, speed = 0;
  if (actor.phase === 'patrol') {
    if (distance(actor.motion.position, MIRROR_PATROL[actor.routeIndex]!) < .15) actor = { ...actor, routeIndex: (actor.routeIndex + 1) % MIRROR_PATROL.length };
    destination = MIRROR_PATROL[actor.routeIndex]; speed = VAULT_AI.patrolSpeed;
  } else if (actor.phase === 'investigate') { destination = actor.investigationTarget; lookTarget = actor.lastHeard; speed = VAULT_AI.investigateSpeed; }
  else if (actor.phase === 'pursue') { destination = actor.lastSeen; lookTarget = actor.lastSeen; speed = VAULT_AI.pursueSpeed; }
  else if (actor.phase === 'attack') { destination = actor.attackTarget; lookTarget = actor.attackTarget; speed = VAULT_AI.pursueSpeed; }
  else if (actor.phase === 'search') {
    // The observed location is fixed until a new sight/noise changes phase;
    // reuse its selected body-sized point instead of resampling every frame.
    destination = actor.pathTarget ?? (actor.lastSeen ? observationPoint(actor.motion.position, actor.lastSeen, world) : actor.investigationTarget);
    lookTarget = actor.lastSeen ?? actor.lastHeard; speed = VAULT_AI.searchSpeed;
    actor = { ...actor, searchSeconds: actor.searchSeconds + elapsed };
  }
  else if (actor.phase === 'return') { destination = MIRROR_PATROL[actor.routeIndex]; speed = VAULT_AI.patrolSpeed; }
  else if (actor.phase === 'notice' || actor.phase === 'windup') lookTarget = actor.lastSeen;
  if (destination && ['investigate', 'search', 'return'].includes(actor.phase)) {
    const cached = actor.pathTarget && actor.pathWaypoint && distance(actor.pathTarget, destination) < .05 &&
      distance(actor.motion.position, actor.pathWaypoint) > .01 && vaultActorEdgeOpen(actor.motion.position, actor.pathWaypoint, world);
    if (cached) destination = actor.pathWaypoint;
    else {
      const target = destination, waypoint = firstPhysicalCorner(actor.motion.position, target, world);
      actor = { ...actor, pathTarget: copy(target), pathWaypoint: waypoint };
      destination = waypoint;
    }
  }
  const gait: ActorGait = actor.phase;
  const motion = advanceActorMotion(actor.motion, { ...(destination ? { target: destination } : {}), ...(lookTarget ? { lookTarget } : {}),
    maxSpeed: speed, gait }, elapsed,
  (from, to) => vaultActorEdgeOpen(from, to, world) && (actor.phase === 'attack' || distance(to, player) >= MIRROR_AI.separationDistance || distance(to, player) > distance(from, player) + 1e-7));
  actor = { ...actor, motion: motion.state };
  if (!quiet && actor.phase === 'attack' && actor.startupGrace <= 0 && actor.contactCooldown <= 0 &&
    distance(actor.motion.position, player) <= MIRROR_AI.contactDistance &&
    !segmentOccluded(actorMotionEye(actor.motion).position, player, world)) {
    actor = { ...createMirrorActor(), recoveryPending: true, intensity: options.intensity,
      contactCooldown: VAULT_AI.coldGrace, startupGrace: VAULT_AI.coldGrace, lastNoiseSequence: noiseSequence };
    const safe = mirrorRecoveryPose(session);
    const recovered = { ...session, pose: safe, actor, holding: null, holdSeconds: 0, noise: undefined,
      noiseSequence, footstepDistance: 0 };
    return { session: recovered, caught: true, movedDistance: 0, footPlants: [], events: ['caught'], soundSources: [] };
  }
  return { session: { ...session, actor, noiseSequence, footstepDistance }, caught: false, movedDistance: motion.movedDistance,
    footPlants: motion.footPlants, events, soundSources };
}
