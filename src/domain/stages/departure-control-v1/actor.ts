import { ACTOR_MOTION, actorMotionEye, advanceActorMotion, createActorMotion,
  type ActorFootPlant, type ActorGait, type ActorMotionState } from '../../actorMotion';
import { segmentOccluded } from '../../firstPerson/geometry';
import type { Vec3, WorldGeometry } from '../../firstPerson/types';
import { VAULT_AI, vaultActorEdgeOpen } from '../../vault/actorPolicy';
import { ACTOR_START, BELL_RECEIVER, CONTROL_SAFE, stageWorld } from './definition';
import type { StageSession } from './session';

export type ContainmentActorPhase = 'patrol' | 'investigate' | 'notice' | 'pursue' | 'windup' | 'attack' |
  'recover' | 'search' | 'return' | 'stopped';
export type ContainmentActor = {
  motion: ActorMotionState; visible: true; phase: ContainmentActorPhase; phaseTime: number;
  recognition: number; startupGrace: number; contactCooldown: number;
  routeIndex: number; lastNoiseSequence: number; searchSeconds: number;
  lastSeen?: Vec3; lastHeard?: Vec3; attackTarget?: Vec3;
  intensity: 'standard' | 'subdued';
};
export type ContainmentNoise = { sequence: number; position: Vec3; strength: number; kind: 'bell' | 'footstep' };
export type ContainmentActorStep = { session: StageSession; caught: boolean; movedDistance: number;
  footPlants: ActorFootPlant[]; events: ('noticed' | 'windup' | 'caught')[]; soundSources: Vec3[] };

/** Two physically walkable lanes join north of the baffle. The receiver is
 * reached through the east lane, not by walking through a wall. */
export const CONTROL_PATROL: readonly Vec3[] = [ACTOR_START,
  { x: 2.15, y: 0, z: 9.4 }, { x: -1.15, y: 0, z: 9.4 },
  { x: -1.15, y: 0, z: 12.2 }, { x: 2.15, y: 0, z: 12.2 }];
const copy = (point: Vec3): Vec3 => ({ x: point.x, y: point.y, z: point.z });
const distance = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);
const finitePoint = (point: unknown): point is Vec3 => {
  if (typeof point !== 'object' || point === null || Array.isArray(point)) return false;
  const p = point as Partial<Vec3>;
  return [p.x, p.y, p.z].every(value => typeof value === 'number' && Number.isFinite(value));
};
export function isContainmentActor(value: unknown): value is ContainmentActor {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const actor = value as Partial<ContainmentActor>, motion = actor.motion;
  return !!motion && finitePoint(motion.position) && finitePoint(motion.velocity) && actor.visible === true &&
    ['patrol', 'investigate', 'notice', 'pursue', 'windup', 'attack', 'recover', 'search', 'return', 'stopped'].includes(String(actor.phase)) &&
    [actor.phaseTime, actor.recognition, actor.startupGrace, actor.contactCooldown, actor.routeIndex,
      actor.lastNoiseSequence, actor.searchSeconds, motion.yaw, motion.speed, motion.headYaw,
      motion.headPitch, motion.chestYaw, motion.chestLean, motion.pelvisShift].every(n => typeof n === 'number' && Number.isFinite(n)) &&
    (!actor.lastSeen || finitePoint(actor.lastSeen)) && (!actor.lastHeard || finitePoint(actor.lastHeard)) &&
    (!actor.attackTarget || finitePoint(actor.attackTarget)) && (actor.intensity === 'standard' || actor.intensity === 'subdued');
}

export function createContainmentActor(contained = false, stopped = false): ContainmentActor {
  return { motion: createActorMotion(contained ? { x: BELL_RECEIVER.x, y: 0, z: BELL_RECEIVER.z } : ACTOR_START, Math.PI),
    visible: true, phase: stopped ? 'stopped' : contained ? 'investigate' : 'patrol', phaseTime: 0, recognition: 0,
    startupGrace: 2.4, contactCooldown: 2.4, routeIndex: 0, lastNoiseSequence: -1,
    searchSeconds: 0, intensity: 'standard', ...(contained ? { lastHeard: { ...BELL_RECEIVER } } : {}) };
}

function phase(actor: ContainmentActor, next: ContainmentActorPhase): ContainmentActor {
  return actor.phase === next ? actor : { ...actor, phase: next, phaseTime: 0,
    searchSeconds: next === 'search' ? 0 : actor.searchSeconds };
}
function canSee(actor: ContainmentActor, player: Vec3, world: WorldGeometry): boolean {
  const eye = actorMotionEye(actor.motion), vector = { x: player.x - eye.position.x,
    y: player.y - eye.position.y, z: player.z - eye.position.z };
  const range = Math.hypot(vector.x, vector.y, vector.z);
  return range <= VAULT_AI.visionRange && range > 1e-6 &&
    (eye.direction.x * vector.x + eye.direction.y * vector.y + eye.direction.z * vector.z) / range >= Math.cos(VAULT_AI.visionHalfAngle) &&
    !segmentOccluded(eye.position, player, world);
}
function audible(actor: ContainmentActor, noise: ContainmentNoise, world: WorldGeometry): boolean {
  const ear = actorMotionEye(actor.motion).position, range = distance(ear, noise.position);
  if (range > VAULT_AI.noiseRange || !Number.isFinite(noise.strength) || noise.strength <= 0) return false;
  const gain = segmentOccluded(ear, noise.position, world) ? VAULT_AI.occludedNoiseGain : 1;
  return Math.min(1.2, noise.strength) / (1 + range * .6) * gain >= VAULT_AI.noiseThreshold;
}
function nearestPatrol(point: Vec3): number {
  return CONTROL_PATROL.reduce((best, current, index) => distance(point, current) < distance(point, CONTROL_PATROL[best]!) ? index : best, 0);
}

/** Bell and footsteps enter as world noise. Speaker volume, HUD state and
 * mirror pixels never substitute for hearing or direct sight. */
export function advanceContainmentActor(session: StageSession, dt: number,
  options: { intensity: 'standard' | 'subdued'; movedDistance: number }): ContainmentActorStep {
  const unchanged: ContainmentActorStep = { session, caught: false, movedDistance: 0, footPlants: [], events: [], soundSources: [] };
  if (session.cleared || session.stopped || !Number.isFinite(dt) || dt <= 0) return unchanged;
  const elapsed = Math.min(dt, .05), world = stageWorld(session.doorProgress, session.staffDoorOpened);
  const player = session.pose.position, events: ContainmentActorStep['events'] = [], soundSources: Vec3[] = [];
  let actor: ContainmentActor = { ...session.actor, phaseTime: session.actor.phaseTime + elapsed,
    startupGrace: Math.max(0, session.actor.startupGrace - elapsed),
    contactCooldown: Math.max(0, session.actor.contactCooldown - elapsed) };
  if (actor.intensity !== options.intensity) actor = { ...phase(actor, 'return'), intensity: options.intensity,
    startupGrace: Math.max(actor.startupGrace, VAULT_AI.coldGrace),
    contactCooldown: Math.max(actor.contactCooldown, VAULT_AI.coldGrace), recognition: 0,
    routeIndex: nearestPatrol(actor.motion.position) };
  const sees = canSee(actor, player, world);
  actor = sees ? { ...actor, lastSeen: copy(player), recognition: Math.min(1, actor.recognition + elapsed / VAULT_AI.recognitionSeconds) }
    : { ...actor, recognition: Math.max(0, actor.recognition - elapsed / .7) };
  const movedDistance = Number.isFinite(options.movedDistance) ? Math.max(0, options.movedDistance) : 0;
  let noiseSequence = session.noiseSequence, footstepDistance = session.footstepDistance + movedDistance;
  const noises: ContainmentNoise[] = session.noise ? [session.noise] : [];
  if (footstepDistance >= .65) {
    footstepDistance %= .65;
    noises.push({ sequence: ++noiseSequence, position: { ...player, y: .08 }, strength: .9, kind: 'footstep' });
  }
  let heard = false;
  for (const noise of noises.sort((a, b) => a.sequence - b.sequence)) {
    if (noise.sequence <= actor.lastNoiseSequence) continue;
    actor = { ...actor, lastNoiseSequence: noise.sequence };
    if (noise.kind === 'bell') soundSources.push(copy(noise.position));
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
  if (actor.phase === 'windup' && actor.phaseTime >= VAULT_AI.windupSeconds)
    actor = actor.lastSeen ? { ...phase(actor, 'attack'), attackTarget: copy(actor.lastSeen) } : phase(actor, 'search');
  if (actor.phase === 'attack' && actor.phaseTime >= VAULT_AI.attackSeconds) actor = { ...phase(actor, 'recover'), contactCooldown: VAULT_AI.recoverSeconds };
  if (actor.phase === 'recover' && actor.phaseTime >= VAULT_AI.recoverSeconds) actor = phase(actor, 'search');
  // The observed receiver holds attention briefly so a correct first attempt
  // can close the door. Search/return bounds prevent a permanent decoy trap.
  if (actor.phase === 'investigate' && actor.lastHeard && actor.phaseTime >= 10) actor = phase(actor, 'search');
  if (actor.phase === 'search' && actor.searchSeconds >= VAULT_AI.searchSeconds)
    actor = { ...phase(actor, 'return'), routeIndex: nearestPatrol(actor.motion.position) };
  if (actor.phase === 'return' && distance(actor.motion.position, CONTROL_PATROL[actor.routeIndex]!) < .15)
    actor = phase(actor, 'patrol');

  let destination: Vec3 | undefined, lookTarget: Vec3 | undefined, speed = 0;
  if (actor.phase === 'patrol') {
    if (distance(actor.motion.position, CONTROL_PATROL[actor.routeIndex]!) < .15)
      actor = { ...actor, routeIndex: (actor.routeIndex + 1) % CONTROL_PATROL.length };
    destination = CONTROL_PATROL[actor.routeIndex]; speed = VAULT_AI.patrolSpeed;
  } else if (actor.phase === 'investigate') { destination = actor.lastHeard; lookTarget = actor.lastHeard; speed = VAULT_AI.investigateSpeed; }
  else if (actor.phase === 'pursue') { destination = actor.lastSeen; lookTarget = actor.lastSeen; speed = VAULT_AI.pursueSpeed; }
  else if (actor.phase === 'attack') { destination = actor.attackTarget; lookTarget = actor.attackTarget; speed = VAULT_AI.pursueSpeed; }
  else if (actor.phase === 'search') { destination = actor.lastSeen ?? actor.lastHeard; lookTarget = destination;
    speed = VAULT_AI.searchSpeed; actor = { ...actor, searchSeconds: actor.searchSeconds + elapsed }; }
  else if (actor.phase === 'return') { destination = CONTROL_PATROL[actor.routeIndex]; speed = VAULT_AI.patrolSpeed; }
  else if (actor.phase === 'notice' || actor.phase === 'windup') lookTarget = actor.lastSeen;
  const gait: ActorGait = actor.phase === 'stopped' ? 'recover' : actor.phase;
  const motion = advanceActorMotion(actor.motion,
    { ...(destination ? { target: destination } : {}), ...(lookTarget ? { lookTarget } : {}), maxSpeed: speed, gait }, elapsed,
    (from, to) => vaultActorEdgeOpen(from, to, world) &&
      (actor.phase === 'attack' || distance(to, player) >= .71 || distance(to, player) > distance(from, player) + 1e-7));
  actor = { ...actor, motion: motion.state };
  if (!quiet && actor.phase === 'attack' && actor.startupGrace <= 0 && actor.contactCooldown <= 0 &&
    distance(actor.motion.position, player) <= VAULT_AI.contactDistance &&
    !segmentOccluded(actorMotionEye(actor.motion).position, player, world)) {
    actor = { ...phase(actor, 'recover'), contactCooldown: VAULT_AI.coldGrace,
      startupGrace: VAULT_AI.coldGrace, recognition: 0, routeIndex: nearestPatrol(actor.motion.position) };
    const safe = { ...CONTROL_SAFE, position: { ...CONTROL_SAFE.position } };
    events.push('caught');
    return { session: { ...session, pose: safe, actor, noise: undefined, noiseSequence, footstepDistance },
      caught: true, movedDistance: motion.movedDistance, footPlants: motion.footPlants, events, soundSources };
  }
  return { session: { ...session, actor, noise: undefined, noiseSequence, footstepDistance },
    caught: false, movedDistance: motion.movedDistance, footPlants: motion.footPlants, events, soundSources };
}
