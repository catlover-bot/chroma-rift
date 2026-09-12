import { ACTOR_MOTION, actorMotionEye, advanceActorMotion, createActorMotion, type ActorFootPlant, type ActorGait, type ActorMotionState } from '../../actorMotion';
import { segmentOccluded } from '../../firstPerson/geometry';
import type { Vec3, WorldGeometry } from '../../firstPerson/types';
import { VAULT_AI, vaultActorEdgeOpen } from '../../vault/actorPolicy';
import { WINCH_SAFE, stageWorld } from './definition';
import type { StageSession } from './session';

export type MirrorNoise = { sequence: number; position: Vec3; strength: number; kind: 'mechanism' | 'footstep' };
export type MirrorActorPhase = 'patrol' | 'investigate' | 'notice' | 'pursue' | 'windup' | 'attack' | 'recover' | 'search' | 'return';
export type MirrorActor = {
  motion: ActorMotionState; visible: boolean; phase: MirrorActorPhase; phaseTime: number;
  recognition: number; startupGrace: number; contactCooldown: number; routeIndex: number;
  lastSeen?: Vec3; lastHeard?: Vec3; lastNoiseSequence: number; searchSeconds: number;
  attackTarget?: Vec3; intensity: 'standard' | 'subdued';
};
export type MirrorActorStep = { session: StageSession; caught: boolean; movedDistance: number; footPlants: ActorFootPlant[];
  events: ('noticed' | 'windup' | 'caught')[]; soundSources: Vec3[] };

/** The body stays in the corridor on either side of the winch. Each edge is
 * checked against the same floor, walls and gate used by the player. */
export const MIRROR_PATROL: readonly Vec3[] = [
  { x: 1.05, y: 0, z: 14.25 }, { x: 1.5, y: 0, z: 15.7 }, { x: -.8, y: 0, z: 15.7 },
  { x: -1.45, y: 0, z: 13.4 }, { x: .85, y: 0, z: 12.8 },
];
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
    typeof actor.visible === 'boolean' &&
    [actor.phaseTime, actor.recognition, actor.startupGrace, actor.contactCooldown, actor.routeIndex, actor.lastNoiseSequence, actor.searchSeconds,
      motion.yaw, motion.speed, motion.headYaw, motion.headPitch, motion.chestYaw, motion.chestLean, motion.pelvisShift].every(value => typeof value === 'number' && Number.isFinite(value)) &&
    (!actor.lastSeen || finitePoint(actor.lastSeen)) && (!actor.lastHeard || finitePoint(actor.lastHeard)) &&
    (!actor.attackTarget || finitePoint(actor.attackTarget)) && (actor.intensity === 'standard' || actor.intensity === 'subdued');
}

export function createMirrorActor(): MirrorActor {
  return { motion: createActorMotion(MIRROR_PATROL[0]!, Math.PI), visible: true, phase: 'patrol', phaseTime: 0,
    recognition: 0, startupGrace: 2.4, contactCooldown: 2.4, routeIndex: 1,
    lastNoiseSequence: -1, searchSeconds: 0, intensity: 'standard' };
}

function phase(actor: MirrorActor, next: MirrorActorPhase): MirrorActor {
  return actor.phase === next ? actor : { ...actor, phase: next, phaseTime: 0, searchSeconds: next === 'search' ? 0 : actor.searchSeconds };
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

/** One deterministic update. Only real visibility and authored physical noise
 * can update memory; the mirror image and HUD do not feed this AI. */
export function advanceMirrorActor(session: StageSession, dt: number, options: { intensity: 'standard' | 'subdued'; movedDistance: number }): MirrorActorStep {
  const unchanged: MirrorActorStep = { session, caught: false, movedDistance: 0, footPlants: [], events: [], soundSources: [] };
  if (session.cleared || !Number.isFinite(dt) || dt <= 0) return unchanged;
  const elapsed = Math.min(dt, .05), world = stageWorld(session.ratchets, session.keyTaken, session.practiced, session.holding);
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
    if (audible(actor, noise, world)) { actor = { ...actor, lastHeard: copy(noise.position) }; heard = true; }
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
  if (actor.phase === 'investigate' && actor.lastHeard && (distance(actor.motion.position, actor.lastHeard) < .28 || actor.phaseTime >= 5)) actor = phase(actor, 'search');
  if (actor.phase === 'search' && actor.searchSeconds >= VAULT_AI.searchSeconds) actor = { ...phase(actor, 'return'), routeIndex: nearestPatrol(actor.motion.position) };
  if (actor.phase === 'return' && distance(actor.motion.position, MIRROR_PATROL[actor.routeIndex]!) < .15) actor = phase(actor, 'patrol');

  let destination: Vec3 | undefined, lookTarget: Vec3 | undefined, speed = 0;
  if (actor.phase === 'patrol') {
    if (distance(actor.motion.position, MIRROR_PATROL[actor.routeIndex]!) < .15) actor = { ...actor, routeIndex: (actor.routeIndex + 1) % MIRROR_PATROL.length };
    destination = MIRROR_PATROL[actor.routeIndex]; speed = VAULT_AI.patrolSpeed;
  } else if (actor.phase === 'investigate') { destination = actor.lastHeard; lookTarget = actor.lastHeard; speed = VAULT_AI.investigateSpeed; }
  else if (actor.phase === 'pursue') { destination = actor.lastSeen; lookTarget = actor.lastSeen; speed = VAULT_AI.pursueSpeed; }
  else if (actor.phase === 'attack') { destination = actor.attackTarget; lookTarget = actor.attackTarget; speed = VAULT_AI.pursueSpeed; }
  else if (actor.phase === 'search') { destination = actor.lastSeen ?? actor.lastHeard; lookTarget = destination; speed = VAULT_AI.searchSpeed; actor = { ...actor, searchSeconds: actor.searchSeconds + elapsed }; }
  else if (actor.phase === 'return') { destination = MIRROR_PATROL[actor.routeIndex]; speed = VAULT_AI.patrolSpeed; }
  else if (actor.phase === 'notice' || actor.phase === 'windup') lookTarget = actor.lastSeen;
  const gait: ActorGait = actor.phase;
  const motion = advanceActorMotion(actor.motion, { ...(destination ? { target: destination } : {}), ...(lookTarget ? { lookTarget } : {}),
    maxSpeed: speed, gait }, elapsed,
  (from, to) => vaultActorEdgeOpen(from, to, world) && (actor.phase === 'attack' || distance(to, player) >= .71 || distance(to, player) > distance(from, player) + 1e-7));
  actor = { ...actor, motion: motion.state };
  if (!quiet && actor.phase === 'attack' && actor.startupGrace <= 0 && actor.contactCooldown <= 0 &&
    distance(actor.motion.position, player) <= VAULT_AI.contactDistance &&
    !segmentOccluded(actorMotionEye(actor.motion).position, player, world)) {
    actor = { ...phase(actor, 'recover'), contactCooldown: VAULT_AI.coldGrace, startupGrace: VAULT_AI.coldGrace, recognition: 0,
      routeIndex: nearestPatrol(actor.motion.position) };
    const safe = { ...WINCH_SAFE, position: copy(WINCH_SAFE.position) };
    const recovered = { ...session, pose: safe, actor, holding: null, holdSeconds: 0, noise: undefined,
      noiseSequence, footstepDistance };
    events.push('caught');
    return { session: recovered, caught: true, movedDistance: motion.movedDistance, footPlants: motion.footPlants, events, soundSources };
  }
  return { session: { ...session, actor, noiseSequence, footstepDistance }, caught: false, movedDistance: motion.movedDistance,
    footPlants: motion.footPlants, events, soundSources };
}
