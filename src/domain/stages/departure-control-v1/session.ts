import { selectDepartureAction, type DepartureActionReason } from './selectors';
import { updatePlayer } from '../../firstPerson/geometry';
import type { MovementInput, PlayerPose } from '../../firstPerson/types';
import { createContainmentActor, isContainmentActor, type ContainmentActor, type ContainmentNoise } from './actor';
import { parseStageCheckpoint, type StageCheckpoint } from './checkpoint';
import { actorFullyContained, BELL_RECEIVER, CONTROL_KEY_ENTRY, CONTROL_SAFE, DOOR_CLOSE_SECONDS, doorSweepClear, OUTDOOR,
  STAFF_EXIT_SAFE, STAFF_DOOR_SECONDS, STAGE_ID, stageWorld, type TargetId } from './definition';

export type StageSession = { stageId: typeof STAGE_ID; sessionId: string; lastSeq: number; pose: PlayerPose;
  keyAvailable: boolean; keyInstalled: boolean; procedureRead: boolean; bellCooldown: number;
  noiseSequence: number; noise?: ContainmentNoise | undefined; footstepDistance: number;
  doorProgress: number; doorMode: 'idle' | 'closing' | 'opening'; isolated: boolean;
  stopped: boolean; shutdownSeconds: number; staffDoorProgress: number; exitAftermathSeconds: number; staffDoorOpened: boolean; cleared: boolean; actor: ContainmentActor };
export type StageCommand = { sessionId: string; seq: number; targetId: TargetId;
  type: 'install-key' | 'read-procedure' | 'ring-bell' | 'close-door' | 'reopen-door' |
    'stop-control' | 'open-staff-door' | 'outdoor-exit' };
export type CommandResult = { session: StageSession; accepted: boolean;
  reason: DepartureActionReason | 'stale' | 'wrong-target' | 'tooFar' };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function isStageSession(value: unknown): value is StageSession {
  if (!record(value) || value.stageId !== STAGE_ID || typeof value.sessionId !== 'string' ||
    !Number.isSafeInteger(value.lastSeq) || Number(value.lastSeq) < 0 || !record(value.pose) || !record(value.pose.position) ||
    !['keyAvailable','keyInstalled','procedureRead','isolated','stopped','staffDoorOpened','cleared'].every(key => typeof value[key] === 'boolean') ||
    !['bellCooldown','noiseSequence','footstepDistance','doorProgress','shutdownSeconds','staffDoorProgress','exitAftermathSeconds'].every(key => typeof value[key] === 'number' && Number.isFinite(value[key]) && Number(value[key]) >= 0) ||
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
    shutdownSeconds: checkpoint?.stopped ? 1.6 : 0, staffDoorProgress: checkpoint?.staffDoorOpened ? 1 : 0, exitAftermathSeconds: 0,
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
  if (session.cleared && session.exitAftermathSeconds <= 0 || !Number.isFinite(dt) || dt <= 0) return session;
  const pose = updatePlayer(session.pose, input, dt, stageWorld(session.doorProgress, session.staffDoorOpened, session.actor.motion.position,
    session.keyInstalled, session.stopped, session.staffDoorProgress));
  return { ...session, pose };
}

/** One frame-clock advance. A body approaching the sweep reverses the door
 * through physical positions; it is never displaced or teleported. */
export function advanceStage(session: StageSession, dt: number): StageSession {
  if (!Number.isFinite(dt) || dt <= 0 || dt > .1) return session;
  if (session.cleared) return session.exitAftermathSeconds > 0 ? { ...session, exitAftermathSeconds: Math.max(0, session.exitAftermathSeconds - dt) } : session;
  if (session.stopped && session.staffDoorOpened && session.staffDoorProgress === 1 && session.pose.position.z >= 22.35)
    return { ...session, cleared: true, exitAftermathSeconds: 4 };
  session = { ...session,
    shutdownSeconds: session.stopped ? Math.min(1.6, session.shutdownSeconds + dt) : 0,
    staffDoorProgress: session.staffDoorOpened ? Math.min(1, session.staffDoorProgress + dt / STAFF_DOOR_SECONDS) : 0,
  };
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
  const action = selectDepartureAction(session, command.targetId);
  if (action.command !== command.type) return refuse('wrong-target', consumed);
  if (action.state === 'completed') return { session: consumed, accepted: true, reason: 'completed' };
  if (action.state !== 'ready') return refuse(action.reason, consumed);
  switch (command.type) {
    case 'install-key': return accept({ keyAvailable: false, keyInstalled: true });
    case 'read-procedure': return accept({ procedureRead: true });
    case 'ring-bell': {
      const sequence = session.noiseSequence + 1;
      return accept({ bellCooldown: 6, noiseSequence: sequence,
        noise: { sequence, position: { ...BELL_RECEIVER }, strength: 1.2, kind: 'bell' } });
    }
    case 'close-door': return accept({ doorMode: 'closing' });
    case 'reopen-door': return accept({ doorMode: 'opening', isolated: false });
    case 'stop-control': return accept({ stopped: true, shutdownSeconds: 0, actor: { ...session.actor, phase: 'stopped', phaseTime: 0 } });
    case 'open-staff-door': return accept({ staffDoorOpened: true });
    case 'outdoor-exit': return accept({ cleared: true, exitAftermathSeconds: 4 });
  }

}

export function checkpointStage(session: StageSession): StageCheckpoint {
  const pose = session.cleared ? OUTDOOR : session.staffDoorOpened && session.pose.position.z > 14.4 ? STAFF_EXIT_SAFE :
    session.keyInstalled ? CONTROL_SAFE : CONTROL_KEY_ENTRY;
  return { schemaVersion: 1, stageId: STAGE_ID, keyAvailable: session.keyAvailable, keyInstalled: session.keyInstalled,
    procedureRead: session.procedureRead, isolated: session.isolated, stopped: session.stopped,
    staffDoorOpened: session.staffDoorOpened, cleared: session.cleared,
    pose: { ...pose, position: { ...pose.position } } };
}
