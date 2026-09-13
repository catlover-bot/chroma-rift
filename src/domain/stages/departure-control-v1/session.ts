import { updatePlayer } from '../../firstPerson/geometry';
import type { MovementInput, PlayerPose } from '../../firstPerson/types';
import { createContainmentActor, isContainmentActor, type ContainmentActor, type ContainmentNoise } from './actor';
import { parseStageCheckpoint, type StageCheckpoint } from './checkpoint';
import { actorFullyContained, BELL_RECEIVER, CONTROL_KEY_ENTRY, CONTROL_SAFE, DOOR_CLOSE_SECONDS, doorSweepClear, OUTDOOR,
  STAFF_EXIT_SAFE, STAGE_ID, stageWorld, type TargetId } from './definition';

export type StageSession = { stageId: typeof STAGE_ID; sessionId: string; lastSeq: number; pose: PlayerPose;
  keyAvailable: boolean; keyInstalled: boolean; procedureRead: boolean; bellCooldown: number;
  noiseSequence: number; noise?: ContainmentNoise | undefined; footstepDistance: number;
  doorProgress: number; doorMode: 'idle' | 'closing' | 'opening'; isolated: boolean;
  stopped: boolean; staffDoorOpened: boolean; cleared: boolean; actor: ContainmentActor };
export type StageCommand = { sessionId: string; seq: number; targetId: TargetId;
  type: 'install-key' | 'read-procedure' | 'ring-bell' | 'close-door' | 'reopen-door' |
    'stop-control' | 'open-staff-door' | 'outdoor-exit' };
export type CommandResult = { session: StageSession; accepted: boolean;
  reason: 'ready' | 'stale' | 'wrong-target' | 'tooFar' | 'prerequisiteMissing' | 'coolingDown' |
    'actorOutside' | 'sweepOccupied' | 'unsafeSide' };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function isStageSession(value: unknown): value is StageSession {
  if (!record(value) || value.stageId !== STAGE_ID || typeof value.sessionId !== 'string' ||
    !Number.isSafeInteger(value.lastSeq) || Number(value.lastSeq) < 0 || !record(value.pose) || !record(value.pose.position) ||
    !['keyAvailable','keyInstalled','procedureRead','isolated','stopped','staffDoorOpened','cleared'].every(key => typeof value[key] === 'boolean') ||
    !['bellCooldown','noiseSequence','footstepDistance','doorProgress'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && Number(value[key]) >= 0) ||
    value.doorMode !== 'idle' && value.doorMode !== 'closing' && value.doorMode !== 'opening' ||
    Number(value.doorProgress) > 1 || !isContainmentActor(value.actor)) return false;
  const pose = value.pose as Record<string, unknown>, position = pose.position as Record<string, unknown>;
  if (![position.x,position.y,position.z,pose.yaw,pose.pitch].every(n => typeof n === 'number' && Number.isFinite(n))) return false;
  if (value.noise !== undefined && (!record(value.noise) || !Number.isSafeInteger(value.noise.sequence) ||
    !record(value.noise.position) || ![value.noise.position.x,value.noise.position.y,value.noise.position.z,value.noise.strength].every(n=>typeof n==='number'&&Number.isFinite(n)) ||
    value.noise.kind !== 'bell' && value.noise.kind !== 'footstep')) return false;
  return true;
}

export function createStageSession(sessionId: string, raw?: unknown): StageSession {
  const checkpoint = raw === undefined ? undefined : parseStageCheckpoint(raw);
  if (!sessionId.trim() || raw !== undefined && !checkpoint) throw new RangeError('Unsupported departure-control checkpoint');
  const pose = checkpoint?.pose ?? CONTROL_SAFE;
  return { stageId: STAGE_ID, sessionId, lastSeq: 0, pose: { ...pose, position: { ...pose.position } },
    keyAvailable: checkpoint?.keyAvailable ?? false, keyInstalled: checkpoint?.keyInstalled ?? false,
    procedureRead: checkpoint?.procedureRead ?? false, bellCooldown: 0, noiseSequence: 0, footstepDistance: 0,
    doorProgress: checkpoint?.isolated ? 1 : 0, doorMode: 'idle', isolated: checkpoint?.isolated ?? false,
    stopped: checkpoint?.stopped ?? false, staffDoorOpened: checkpoint?.staffDoorOpened ?? false,
    cleared: checkpoint?.cleared ?? false,
    actor: createContainmentActor(checkpoint?.isolated ?? false, checkpoint?.stopped ?? false) };
}

/** The campaign can issue this entry only after verifying area's 04 key bit.
 * A standalone cold entry has no key and cannot bypass containment. */
export function carriedKeyEntry(): StageCheckpoint {
  return { schemaVersion: 1, stageId: STAGE_ID, keyAvailable: true, keyInstalled: false,
    procedureRead: false, isolated: false, stopped: false, staffDoorOpened: false, cleared: false,
    pose: { ...CONTROL_KEY_ENTRY, position: { ...CONTROL_KEY_ENTRY.position } } };
}

export function stepStage(session: StageSession, input: MovementInput, dt: number): StageSession {
  if (session.cleared || !Number.isFinite(dt) || dt <= 0) return session;
  const pose = updatePlayer(session.pose, input, dt, stageWorld(session.doorProgress, session.staffDoorOpened, session.actor.motion.position,
    session.keyInstalled, session.stopped));
  return { ...session, pose };
}

/** One frame-clock advance. A body approaching the sweep reverses the door
 * through physical positions; it is never displaced or teleported. */
export function advanceStage(session: StageSession, dt: number): StageSession {
  if (session.cleared || !Number.isFinite(dt) || dt <= 0 || dt > .1) return session;
  const bellCooldown = Math.max(0, session.bellCooldown - dt);
  if (session.doorMode === 'closing') {
    if (!actorFullyContained(session.actor.motion.position) || !doorSweepClear(session.actor.motion.position))
      return { ...session, bellCooldown, doorMode: 'opening', isolated: false };
    const doorProgress = Math.min(1, session.doorProgress + dt / DOOR_CLOSE_SECONDS);
    return { ...session, bellCooldown, doorProgress, doorMode: doorProgress === 1 ? 'idle' : 'closing',
      isolated: doorProgress === 1 };
  }
  if (session.doorMode === 'opening') {
    const doorProgress = Math.max(0, session.doorProgress - dt / DOOR_CLOSE_SECONDS);
    return { ...session, bellCooldown, doorProgress, doorMode: doorProgress === 0 ? 'idle' : 'opening', isolated: false };
  }
  return bellCooldown === session.bellCooldown ? session : { ...session, bellCooldown };
}

export function commandStage(session: StageSession, command: StageCommand): CommandResult {
  const refuse = (reason: CommandResult['reason'], current = session): CommandResult => ({ session: current, accepted: false, reason });
  if (command.sessionId !== session.sessionId || !Number.isSafeInteger(command.seq) || command.seq <= session.lastSeq) return refuse('stale');
  const consumed = { ...session, lastSeq: command.seq };
  const target = stageWorld(session.doorProgress, session.staffDoorOpened, undefined, session.keyInstalled, session.stopped)
    .interactables.find(item => item.id === command.targetId);
  if (!target) return refuse('wrong-target', consumed);
  if (Math.hypot(session.pose.position.x - target.center.x, session.pose.position.z - target.center.z) > target.maxDistance)
    return refuse('tooFar', consumed);
  const accept = (patch: Partial<StageSession>): CommandResult => ({ session: { ...consumed, ...patch }, accepted: true, reason: 'ready' });
  if (command.type === 'install-key' && command.targetId === 'departure-key')
    return session.keyAvailable && !session.keyInstalled ? accept({ keyAvailable: false, keyInstalled: true }) : refuse('prerequisiteMissing', consumed);
  if (command.type === 'read-procedure' && command.targetId === 'departure-procedure')
    return session.keyInstalled ? accept({ procedureRead: true }) : refuse('prerequisiteMissing', consumed);
  if (command.type === 'ring-bell' && command.targetId === 'departure-bell') {
    if (!session.procedureRead || session.stopped || session.isolated || session.doorMode !== 'idle' || session.doorProgress > 0)
      return refuse('prerequisiteMissing', consumed);
    if (session.bellCooldown > 0) return refuse('coolingDown', consumed);
    const sequence = session.noiseSequence + 1;
    return accept({ bellCooldown: 6, noiseSequence: sequence,
      noise: { sequence, position: { ...BELL_RECEIVER }, strength: 1.2, kind: 'bell' } });
  }
  if (command.type === 'close-door' && command.targetId === 'departure-door') {
    if (!session.procedureRead || session.stopped || session.isolated || session.doorMode !== 'idle' || session.doorProgress > 0)
      return refuse('prerequisiteMissing', consumed);
    if (session.pose.position.x > -2.55 || session.pose.position.z < 8.2 || session.pose.position.z > 13.8) return refuse('unsafeSide', consumed);
    if (!actorFullyContained(session.actor.motion.position)) return refuse('actorOutside', consumed);
    if (!doorSweepClear(session.actor.motion.position)) return refuse('sweepOccupied', consumed);
    return accept({ doorMode: 'closing' });
  }
  if (command.type === 'reopen-door' && command.targetId === 'departure-reopen')
    return !session.stopped && session.doorProgress > 0 ? accept({ doorMode: 'opening', isolated: false }) : refuse('prerequisiteMissing', consumed);
  if (command.type === 'stop-control' && command.targetId === 'departure-stop')
    return session.isolated && session.doorProgress === 1 && actorFullyContained(session.actor.motion.position) && !session.stopped
      ? accept({ stopped: true, actor: { ...session.actor, phase: 'stopped', phaseTime: 0 } })
      : refuse('prerequisiteMissing', consumed);
  if (command.type === 'open-staff-door' && command.targetId === 'departure-staff-door')
    return session.stopped && !session.staffDoorOpened ? accept({ staffDoorOpened: true }) : refuse('prerequisiteMissing', consumed);
  if (command.type === 'outdoor-exit' && command.targetId === 'departure-outdoor')
    return session.stopped && session.staffDoorOpened && session.pose.position.z >= 22.35
      ? accept({ cleared: true }) : refuse('prerequisiteMissing', consumed);
  return refuse('wrong-target', consumed);
}

export function checkpointStage(session: StageSession): StageCheckpoint {
  const pose = session.cleared ? OUTDOOR : session.staffDoorOpened && session.pose.position.z > 14.4 ? STAFF_EXIT_SAFE :
    session.keyInstalled ? CONTROL_SAFE : CONTROL_KEY_ENTRY;
  return { schemaVersion: 1, stageId: STAGE_ID, keyAvailable: session.keyAvailable, keyInstalled: session.keyInstalled,
    procedureRead: session.procedureRead, isolated: session.isolated, stopped: session.stopped,
    staffDoorOpened: session.staffDoorOpened, cleared: session.cleared,
    pose: { ...pose, position: { ...pose.position } } };
}
