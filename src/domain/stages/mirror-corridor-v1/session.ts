import { updatePlayer } from '../../firstPerson/geometry';
import type { MovementInput, PlayerPose } from '../../firstPerson/types';
import { EXIT, KEY_SAFE, POST_GATE, RATCHET_COUNT, RATCHET_SECONDS, SPAWN, STAGE_ID, WINCH_CENTER, WINCH_SAFE, grateY, stageWorld, type TargetId } from './definition';
import { parseStageCheckpoint, type StageCheckpoint } from './checkpoint';
import { createMirrorActor, isMirrorActor, type MirrorActor, type MirrorNoise } from './actor';
import { selectMirrorAction } from './selectors';

export type StageSession = { stageId: typeof STAGE_ID; sessionId: string; lastSeq: number; pose: PlayerPose;
  figureInspected: boolean; mirrorInspected: boolean; keyTaken: boolean; practiced: boolean; ratchets: number;
  holding: 'practice' | 'winch' | null; holdSeconds: number; gateLift: number; cleared: boolean;
  actor: MirrorActor; noiseSequence: number; noise?: MirrorNoise | undefined; footstepDistance: number };
export type StageCommand = { sessionId: string; seq: number; targetId: TargetId; type: 'inspect' | 'take-key' | 'start-hold' | 'release-hold' | 'exit' };
export type CommandResult = { session: StageSession; accepted: boolean; reason: 'ready' | 'stale' | 'tooFar' | 'prerequisiteMissing' | 'wrong-target' };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function isStageSession(value: unknown): value is StageSession {
  if (!record(value) || value.stageId !== STAGE_ID || typeof value.sessionId !== 'string' ||
    !Number.isSafeInteger(value.lastSeq) || Number(value.lastSeq) < 0 || !record(value.pose) || !record(value.pose.position) ||
    typeof value.figureInspected !== 'boolean' || typeof value.mirrorInspected !== 'boolean' ||
    typeof value.keyTaken !== 'boolean' || typeof value.practiced !== 'boolean' ||
    !Number.isSafeInteger(value.ratchets) || Number(value.ratchets) < 0 || Number(value.ratchets) > RATCHET_COUNT ||
    value.holding !== null && value.holding !== 'practice' && value.holding !== 'winch' ||
    typeof value.holdSeconds !== 'number' || !Number.isFinite(value.holdSeconds) || value.holdSeconds < 0 || value.holdSeconds > RATCHET_SECONDS ||
    !isMirrorActor(value.actor) || !Number.isSafeInteger(value.noiseSequence) || Number(value.noiseSequence) < 0 ||
    typeof value.footstepDistance !== 'number' || !Number.isFinite(value.footstepDistance) || value.footstepDistance < 0 || value.footstepDistance >= .65 ||
    typeof value.gateLift !== 'number' || !Number.isFinite(value.gateLift) || value.gateLift < 0 || value.gateLift > grateY(Number(value.ratchets)) ||
    typeof value.cleared !== 'boolean' || value.ratchets !== 0 && (!value.keyTaken || !value.practiced) ||
    value.cleared && value.ratchets !== RATCHET_COUNT) return false;
  const pose = value.pose as Record<string, unknown>, position = pose.position as Record<string, unknown>;
  if (value.noise !== undefined && (!record(value.noise) || !Number.isSafeInteger(value.noise.sequence) || Number(value.noise.sequence) > Number(value.noiseSequence) ||
    !record(value.noise.position) || ![value.noise.position.x,value.noise.position.y,value.noise.position.z,value.noise.strength].every(n=>typeof n==='number'&&Number.isFinite(n)) ||
    value.noise.kind !== 'mechanism' && value.noise.kind !== 'footstep')) return false;
  return [position.x, position.y, position.z, pose.yaw, pose.pitch].every(n => typeof n === 'number' && Number.isFinite(n));
}
export function createStageSession(sessionId: string, raw?: unknown): StageSession {
  const checkpoint = raw === undefined ? undefined : parseStageCheckpoint(raw);
  if (raw !== undefined && !checkpoint) throw new RangeError('Unsupported mirror corridor checkpoint');
  const pose = checkpoint?.pose ?? SPAWN;
  return { stageId: STAGE_ID, sessionId, lastSeq: 0, pose: { ...pose, position: { ...pose.position } },
    figureInspected: checkpoint?.figureInspected ?? false, mirrorInspected: checkpoint?.mirrorInspected ?? false,
    keyTaken: checkpoint?.keyTaken ?? false,
    practiced: checkpoint?.practiced ?? false, ratchets: checkpoint?.ratchets ?? 0,
    holding: null, holdSeconds: 0, gateLift: grateY(checkpoint?.ratchets ?? 0), cleared: checkpoint?.cleared ?? false,
    actor: createMirrorActor(), noiseSequence: 0, footstepDistance: 0 };
}
export function stepStage(session: StageSession, input: MovementInput, dt: number): StageSession {
  if (session.cleared || session.holding || !Number.isFinite(dt) || dt <= 0) return session;
  const pose = updatePlayer(session.pose, input, dt, stageWorld(session.ratchets, session.keyTaken, session.practiced, session.holding, session.actor.motion.position, session.gateLift));
  return { ...session, pose };
}
/** Frame-clock progress only. Release/cancel keeps completed teeth and drops
 * just the unfinished fraction. This owns no timer, pointer or renderer. */
export function advanceStage(session: StageSession, dt: number): StageSession {
  if (session.cleared || !Number.isFinite(dt) || dt <= 0 || dt > .1) return session;
  // The committed tooth owns both the physical and visible 0.9-second lift.
  // Releasing the handle drops only its unfinished hold, never this motion.
  const target = grateY(session.ratchets);
  const speed = (target - grateY(Math.max(0, session.ratchets - 1))) / .9;
  const gateLift = Math.min(target, session.gateLift + speed * dt);
  if (gateLift !== session.gateLift) session = { ...session, gateLift };
  if (!session.holding) return session;
  const seconds = session.holdSeconds + dt;
  if (session.holding === 'practice') return session.practiced ? session : seconds >= .55
    ? { ...session, practiced: true, holdSeconds: 0 }
    : { ...session, holdSeconds: seconds };
  if (session.ratchets === RATCHET_COUNT) return session;
  if (seconds + 1e-9 < RATCHET_SECONDS) return { ...session, holdSeconds: seconds };
  const ratchets = Math.min(RATCHET_COUNT, session.ratchets + 1);
  const noiseSequence = session.noiseSequence + 1;
  return { ...session, ratchets, holdSeconds: 0, noiseSequence,
    noise: { sequence: noiseSequence, position: { ...WINCH_CENTER }, strength: 1.2, kind: 'mechanism' } };
}
export function cancelStageHold(session: StageSession): StageSession {
  return session.holding === null && !session.noise ? session : { ...session, holding: null, holdSeconds: 0, noise: undefined };
}
export function commandStage(session: StageSession, command: StageCommand): CommandResult {
  if (command.sessionId !== session.sessionId || !Number.isSafeInteger(command.seq) || command.seq <= session.lastSeq)
    return { session, accepted: false, reason: 'stale' };
  const consumed = { ...session, lastSeq: command.seq };
  if (command.type === 'release-hold') {
    const heldTarget = session.holding === 'practice' ? 'mirror-corridor-practice' : session.holding === 'winch' ? 'mirror-corridor-winch' : undefined;
    return heldTarget === command.targetId
      ? { session: cancelStageHold(consumed), accepted: true, reason: 'ready' }
      : { session: consumed, accepted: false, reason: 'wrong-target' };
  }
  const target = stageWorld(session.ratchets, session.keyTaken, session.practiced, session.holding).interactables.find(item => item.id === command.targetId);
  if (!target) return { session: consumed, accepted: false, reason: 'wrong-target' };
  if (Math.hypot(session.pose.position.x - target.center.x, session.pose.position.z - target.center.z) > target.maxDistance)
    return { session: consumed, accepted: false, reason: 'tooFar' };
  const action = selectMirrorAction(session, command.targetId);
  if (action.state === 'locked' || action.state === 'operating')
    return { session: consumed, accepted: false, reason: 'prerequisiteMissing' };
  if (command.type === 'inspect' && command.targetId === 'mirror-corridor-figure')
    return { session: { ...consumed, figureInspected: true }, accepted: true, reason: 'ready' };
  if (command.type === 'inspect' && command.targetId === 'mirror-corridor-mirror')
    return { session: { ...consumed, mirrorInspected: true }, accepted: true, reason: 'ready' };
  if (command.type === 'take-key' && command.targetId === 'mirror-corridor-key' && !session.keyTaken)
    return { session: { ...consumed, keyTaken: true }, accepted: true, reason: 'ready' };
  if (command.type === 'start-hold' && !session.holding && command.targetId === 'mirror-corridor-practice' && !session.practiced)
    return { session: { ...consumed, holding: 'practice', holdSeconds: 0 }, accepted: true, reason: 'ready' };
  if (command.type === 'start-hold' && !session.holding && command.targetId === 'mirror-corridor-winch' &&
    session.keyTaken && session.practiced && session.ratchets < RATCHET_COUNT)
    return { session: { ...consumed, holding: 'winch', holdSeconds: 0, noiseSequence: session.noiseSequence + 1,
      noise: { sequence: session.noiseSequence + 1, position: { ...WINCH_CENTER }, strength: 1.2, kind: 'mechanism' } }, accepted: true, reason: 'ready' };
  if (command.type === 'exit' && command.targetId === 'mirror-corridor-exit' && !session.holding && session.ratchets === RATCHET_COUNT &&
    session.pose.position.z >= 21.2)
    return { session: { ...consumed, cleared: true, holding: null, holdSeconds: 0 }, accepted: true, reason: 'ready' };
  return { session: consumed, accepted: false, reason: 'prerequisiteMissing' };
}
export function checkpointStage(session: StageSession): StageCheckpoint {
  const pose = session.cleared ? EXIT : session.ratchets === RATCHET_COUNT && session.pose.position.z > 17.5
    ? POST_GATE : session.practiced || session.ratchets > 0 ? WINCH_SAFE : session.keyTaken ? KEY_SAFE : SPAWN;
  return { schemaVersion: 1, stageId: STAGE_ID, figureInspected: session.figureInspected, mirrorInspected: session.mirrorInspected,
    keyTaken: session.keyTaken, practiced: session.practiced, ratchets: session.ratchets,
    cleared: session.cleared, pose: { ...pose, position: { ...pose.position } } };
}
