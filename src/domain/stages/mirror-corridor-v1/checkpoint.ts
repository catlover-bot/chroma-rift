import type { PlayerPose } from '../../firstPerson/types';
import { EXIT, KEY_SAFE, POST_GATE, RATCHET_COUNT, SPAWN, STAGE_ID, WINCH_SAFE } from './definition';

export type StageCheckpoint = { schemaVersion: 1; stageId: typeof STAGE_ID; figureInspected: boolean; mirrorInspected: boolean; keyTaken: boolean; practiced: boolean; ratchets: number; cleared: boolean; pose: PlayerPose };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function parseStageCheckpoint(value: unknown): StageCheckpoint | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.stageId !== STAGE_ID ||
    typeof value.figureInspected !== 'boolean' || value.mirrorInspected !== undefined && typeof value.mirrorInspected !== 'boolean' ||
    typeof value.keyTaken !== 'boolean' || typeof value.practiced !== 'boolean' ||
    typeof value.ratchets !== 'number' || !Number.isSafeInteger(value.ratchets) || value.ratchets < 0 || value.ratchets > RATCHET_COUNT ||
    typeof value.cleared !== 'boolean' || !record(value.pose) || !record(value.pose.position) ||
    value.ratchets !== 0 && (!value.keyTaken || !value.practiced) ||
    value.cleared && (value.ratchets !== RATCHET_COUNT || !value.keyTaken)) return;
  const pose = value.pose as Record<string, unknown>, position = pose.position as Record<string, unknown>;
  if (![position.x, position.y, position.z, pose.yaw, pose.pitch].every(n => typeof n === 'number' && Number.isFinite(n))) return;
  const safe = [SPAWN, KEY_SAFE, WINCH_SAFE, POST_GATE, EXIT].find(point =>
    point.position.x === position.x && point.position.y === position.y && point.position.z === position.z &&
    point.yaw === pose.yaw && point.pitch === pose.pitch);
  if (!safe || safe === POST_GATE && value.ratchets !== RATCHET_COUNT || safe === EXIT && !value.cleared) return;
  return { schemaVersion: 1, stageId: STAGE_ID, figureInspected: value.figureInspected, mirrorInspected: value.mirrorInspected === true,
    keyTaken: value.keyTaken, practiced: value.practiced,
    ratchets: value.ratchets, cleared: value.cleared, pose: { ...safe, position: { ...safe.position } } };
}
