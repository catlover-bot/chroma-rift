import { parseSealCheckpoint } from '../emblem/puzzle';
import { CHAPTER, CHAPTER_ID, getWorld, LEVEL_VERSION } from './chapter';
import { isSafePose } from './geometry';
import { createInitialRuntime, emblemCheckpointForProgress, initialProgress } from './runtime';
import type { ChapterRuntime, CheckpointState, PlayerPose, PuzzleState } from './types';

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export type EmblemCheckpointStatus = 'valid' | 'migrated' | 'invalid' | 'unsupported';
function parseProgress(value: unknown): { progress: PuzzleState; emblemStatus: EmblemCheckpointStatus } | undefined {
  if (!record(value)) return undefined;
  for (const key of ['guideExamined', 'markActivated', 'sealA', 'sealB', 'exitDoorOpen', 'cleared', 'usedLookAssist']) if (typeof value[key] !== 'boolean') return undefined;
  if (value.variant !== 'entrance' && value.variant !== 'exit') return undefined;
  if (!Number.isInteger(value.hintStage) || Number(value.hintStage) < 0 || Number(value.hintStage) > 3) return undefined;
  if (value.sealB && !value.sealA) return undefined;
  if (value.variant === 'exit' && !value.sealB) return undefined;
  if (value.exitDoorOpen && value.variant !== 'exit') return undefined;
  if (value.cleared && !value.exitDoorOpen) return undefined;
  const progress: PuzzleState = { guideExamined: value.guideExamined as boolean, markActivated: value.markActivated as boolean, sealA: value.sealA as boolean, sealB: value.sealB as boolean,
    variant: value.variant, exitDoorOpen: value.exitDoorOpen as boolean, cleared: value.cleared as boolean, hintStage: value.hintStage as PuzzleState['hintStage'], usedLookAssist: value.usedLookAssist as boolean };
  const parsed = parseSealCheckpoint(value.emblem);
  let emblemStatus: EmblemCheckpointStatus = parsed ? 'valid' : value.emblem === undefined ? 'migrated' : record(value.emblem) && Number.isInteger(value.emblem.schemaVersion) && Number(value.emblem.schemaVersion) > 1 ? 'unsupported' : 'invalid';
  if (parsed) {
    progress.emblem = parsed;
    if (progress.sealA && parsed.phase !== 'released') emblemStatus = 'migrated';
    if (!progress.sealA && parsed.phase === 'released') emblemStatus = 'invalid';
  }
  progress.emblem = emblemCheckpointForProgress(progress);
  if (!progress.sealA) progress.hintStage = progress.emblem.hintTier;
  return { progress, emblemStatus };
}
function parsePose(value: unknown): PlayerPose | undefined {
  if (!record(value) || !record(value.position)) return undefined;
  const { x, y, z } = value.position;
  if (![x, y, z, value.yaw, value.pitch].every((number) => typeof number === 'number' && Number.isFinite(number))) return undefined;
  return { position: { x: x as number, y: y as number, z: z as number }, yaw: value.yaw as number, pitch: value.pitch as number };
}
function checkpointUnlocked(pose: PlayerPose, progress: PuzzleState): boolean {
  if (!progress.sealA && pose.position.z < -8) return false;
  if (!progress.sealB && pose.position.x >= 10 && pose.position.z < -8) return false;
  if (!progress.exitDoorOpen && pose.position.z > 14) return false;
  if (progress.cleared && pose.position.z < 14.75) return false;
  return true;
}
function safeCheckpointPose(runtime: ChapterRuntime): PlayerPose {
  const world = getWorld(runtime);
  const valid = CHAPTER.checkpoints.filter((pose) => isSafePose(pose, world));
  // Named poses only; saving cannot encode a wall contact or intermediate door.
  // Unsolved gates also keep their downstream checkpoints out of consideration.
  const unlocked = valid.filter((pose) => checkpointUnlocked(pose, runtime.progress));
  const nearest = unlocked.sort((a, b) => Math.hypot(a.position.x - runtime.pose.position.x, a.position.z - runtime.pose.position.z) - Math.hypot(b.position.x - runtime.pose.position.x, b.position.z - runtime.pose.position.z))[0] ?? CHAPTER.spawn;
  return { ...nearest, position: { ...nearest.position } };
}
export function createCheckpoint(runtime: ChapterRuntime): CheckpointState {
  return { schemaVersion: 1, chapterId: CHAPTER_ID, levelVersion: LEVEL_VERSION, pose: safeCheckpointPose(runtime), progress: { ...runtime.progress, emblem: emblemCheckpointForProgress(runtime.progress) } };
}
export function restoreCheckpoint(value: unknown): { checkpoint: CheckpointState; recovered: boolean; emblemStatus: EmblemCheckpointStatus } | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.chapterId !== CHAPTER_ID || !Number.isInteger(value.levelVersion) || Number(value.levelVersion) < 0 || Number(value.levelVersion) > LEVEL_VERSION) return undefined;
  const parsed = parseProgress(value.progress);
  if (!parsed) return undefined;
  const { progress, emblemStatus } = parsed;
  const pose = parsePose(value.pose);
  const runtime = createInitialRuntime();
  runtime.progress = progress;
  runtime.doorAOpen = progress.sealA ? 1 : 0;
  runtime.doorBOpen = progress.sealB ? 1 : 0;
  runtime.doorExitOpen = progress.exitDoorOpen ? 1 : 0;
  const oldLayout = value.levelVersion !== LEVEL_VERSION;
  const named = pose && CHAPTER.checkpoints.some((checkpoint) => Math.hypot(checkpoint.position.x - pose.position.x, checkpoint.position.z - pose.position.z) < 0.001);
  const safe = pose && named && checkpointUnlocked(pose, progress) && isSafePose(pose, getWorld(runtime));
  if (safe && !oldLayout) runtime.pose = pose;
  else {
    // Version 0 was the draft of this chapter. Only its validated monotonic
    // puzzle flags survive; coordinates never cross layout-version boundaries.
    runtime.pose = progress.cleared ? CHAPTER.checkpoints[CHAPTER.checkpoints.length - 1]! : progress.sealA ? CHAPTER.checkpoints[4]! : CHAPTER.spawn;
  }
  return { checkpoint: { schemaVersion: 1, chapterId: CHAPTER_ID, levelVersion: LEVEL_VERSION, pose: runtime.pose, progress }, recovered: !safe || oldLayout, emblemStatus };
}
export const INITIAL_CHECKPOINT: CheckpointState = { schemaVersion: 1, chapterId: CHAPTER_ID, levelVersion: LEVEL_VERSION, pose: CHAPTER.spawn, progress: initialProgress() };
