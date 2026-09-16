import type { PlayerPose } from '../../firstPerson/types';
import { CONTROL_KEY_ENTRY, CONTROL_SAFE, LEGACY_CONTROL_KEY_ENTRY, LEGACY_CONTROL_SAFE, OUTDOOR, STAFF_EXIT_SAFE, STAGE_ID } from './definition';

export type StageCheckpoint = { schemaVersion: 1; stageId: typeof STAGE_ID; keyAvailable: boolean; keyInstalled: boolean;
  procedureRead: boolean; isolated: boolean; stopped: boolean; staffDoorOpened: boolean; cleared: boolean; pose: PlayerPose };
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function parseStageCheckpoint(value: unknown): StageCheckpoint | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.stageId !== STAGE_ID ||
    !['keyAvailable', 'keyInstalled', 'procedureRead', 'isolated', 'stopped', 'staffDoorOpened', 'cleared'].every(key => typeof value[key] === 'boolean') ||
    !record(value.pose) || !record(value.pose.position) ||
    value.keyInstalled && value.keyAvailable || value.procedureRead && !value.keyInstalled ||
    value.isolated && !value.procedureRead || value.stopped && !value.isolated ||
    value.staffDoorOpened && !value.stopped || value.cleared && !value.staffDoorOpened) return;
  const pose = value.pose as Record<string, unknown>, position = pose.position as Record<string, unknown>;
  if (![position.x, position.y, position.z, pose.yaw, pose.pitch].every(n => typeof n === 'number' && Number.isFinite(n))) return;
  const safe = [CONTROL_KEY_ENTRY, CONTROL_SAFE, LEGACY_CONTROL_KEY_ENTRY, LEGACY_CONTROL_SAFE, STAFF_EXIT_SAFE, OUTDOOR].find(point => point.position.x === position.x &&
    point.position.y === position.y && point.position.z === position.z && point.yaw === pose.yaw && point.pitch === pose.pitch);
  if (!safe || safe === STAFF_EXIT_SAFE && !value.staffDoorOpened || safe === OUTDOOR && !value.cleared) return;
  return { schemaVersion: 1, stageId: STAGE_ID, keyAvailable: value.keyAvailable as boolean, keyInstalled: value.keyInstalled as boolean,
    procedureRead: value.procedureRead as boolean, isolated: value.isolated as boolean, stopped: value.stopped as boolean,
    staffDoorOpened: value.staffDoorOpened as boolean, cleared: value.cleared as boolean,
    pose: { ...safe, position: { ...safe.position } } };
}
