import type { PlayerPose } from '../../firstPerson/types';
import { EXIT, KEY_SAFE, LEGACY_EXIT, POST_GATE, RATCHET_COUNT, SHELTER_SAFE, SPAWN, STAGE_ID, WINCH_SAFE } from './definition';

export type StageCheckpoint = { schemaVersion: 1; stageId: typeof STAGE_ID; figureInspected: boolean; mirrorInspected: boolean; keyTaken: boolean; practiced: boolean; ratchets: number; gateCrossed?: boolean; cleared: boolean; pose: PlayerPose };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
export function parseStageCheckpoint(value: unknown): StageCheckpoint | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.stageId !== STAGE_ID ||
    typeof value.figureInspected !== 'boolean' || value.mirrorInspected !== undefined && typeof value.mirrorInspected !== 'boolean' ||
    typeof value.keyTaken !== 'boolean' || typeof value.practiced !== 'boolean' ||
    typeof value.ratchets !== 'number' || !Number.isSafeInteger(value.ratchets) || value.ratchets < 0 || value.ratchets > RATCHET_COUNT ||
    value.gateCrossed !== undefined && typeof value.gateCrossed !== 'boolean' ||
    typeof value.cleared !== 'boolean' || !record(value.pose) || !record(value.pose.position) ||
    value.ratchets !== 0 && (!value.keyTaken || !value.practiced) ||
    value.cleared && (value.ratchets !== RATCHET_COUNT || !value.keyTaken)) return;
  const pose = value.pose as Record<string, unknown>, position = pose.position as Record<string, unknown>;
  if (![position.x, position.y, position.z, pose.yaw, pose.pitch].every(n => typeof n === 'number' && Number.isFinite(n))) return;
  const safe = [SPAWN, KEY_SAFE, WINCH_SAFE, SHELTER_SAFE, POST_GATE, EXIT, LEGACY_EXIT].find(point =>
    point.position.x === position.x && point.position.y === position.y && point.position.z === position.z &&
    point.yaw === pose.yaw && point.pitch === pose.pitch);
  const completedPose = safe === EXIT || safe === LEGACY_EXIT;
  if (!safe || safe === POST_GATE && value.ratchets !== RATCHET_COUNT || completedPose && !value.cleared) return;
  // Old schema-1 saves never carried this field. Only their authored far-side
  // landmark or already-cleared state proves they had crossed the grate.
  const gateCrossed = value.gateCrossed ?? (safe === POST_GATE || value.cleared);
  if (gateCrossed && value.ratchets !== RATCHET_COUNT || !gateCrossed && (safe === POST_GATE || value.cleared)) return;
  return { schemaVersion: 1, stageId: STAGE_ID, figureInspected: value.figureInspected, mirrorInspected: value.mirrorInspected === true,
    keyTaken: value.keyTaken, practiced: value.practiced,
    ratchets: value.ratchets, gateCrossed: gateCrossed as boolean, cleared: value.cleared, pose: { ...safe, position: { ...safe.position } } };
}
