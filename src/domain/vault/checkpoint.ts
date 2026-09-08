import { parseSealCheckpoint } from '../emblem/puzzle';
import type { ChapterRuntime, CheckpointState, PlayerPose, PuzzleState } from '../firstPerson/types';
import { VAULT_CHAPTER_ID, VAULT_CHECKPOINTS, VAULT_LEVEL_VERSION, VAULT_ROD_FIXTURE } from './definition';
import { LENGTH_SPEC, lengthMatches, rodMatches, rodTargetAngle, VAULT_SPEC_VERSION } from './specs';
import type { VaultCheckpointId, VaultProgress } from './types';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const uint = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const attempts = (value: unknown): value is number => uint(value) && value <= 999;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const DISCOVERIES = ['length', 'rod', 'cafe'] as const;
const AIDS = ['finsHidden', 'lengthGuide', 'frameHidden', 'plumb', 'cafeNeutral'] as const;
const STORY = ['revealStarted', 'revealPresented', 'finalPursuitStarted'] as const;
const clonePose = (pose: PlayerPose): PlayerPose => ({ position: { ...pose.position }, yaw: pose.yaw, pitch: pose.pitch });

/** One strict versioned document. Display aids are independent of puzzle
 * correctness; discovery records inspection, never a perceptual judgement. */
export function parseVaultProgress(value: unknown): VaultProgress | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.specVersion !== VAULT_SPEC_VERSION || !uint(value.seed) ||
    !record(value.length) || !record(value.rod) || !record(value.discoveries) || !record(value.aids) || !record(value.story) ||
    typeof value.finalDoorClosed !== 'boolean') return undefined;
  const length = value.length, rod = value.rod;
  if (!finite(length.length) || length.length < LENGTH_SPEC.minLength || length.length > LENGTH_SPEC.maxLength ||
    typeof length.solved !== 'boolean' || !attempts(length.attempts) || !finite(rod.angle) ||
    rod.angle < -Math.PI / 2 || rod.angle >= Math.PI / 2 || typeof rod.solved !== 'boolean' || !attempts(rod.attempts)) return undefined;
  if (DISCOVERIES.some(key => typeof (value.discoveries as Record<string, unknown>)[key] !== 'boolean') ||
    AIDS.some(key => typeof (value.aids as Record<string, unknown>)[key] !== 'boolean') ||
    STORY.some(key => typeof (value.story as Record<string, unknown>)[key] !== 'boolean')) return undefined;
  const n = VAULT_ROD_FIXTURE.normal, r = VAULT_ROD_FIXTURE.right;
  const target = rodTargetAngle(r, { x: n.y * r.z - n.z * r.y, y: n.z * r.x - n.x * r.z, z: n.x * r.y - n.y * r.x });
  if (length.solved && (!lengthMatches(length.length) || length.attempts === 0)) return undefined;
  if (rod.solved && (!length.solved || !rodMatches(rod.angle, target) || rod.attempts === 0)) return undefined;
  if ((rod.attempts > 0 || value.discoveries.rod) && !length.solved) return undefined;
  if (value.story.revealStarted && !length.solved || value.story.revealPresented && !value.story.revealStarted ||
    value.story.finalPursuitStarted && !rod.solved || value.finalDoorClosed && !rod.solved) return undefined;
  return { schemaVersion: 1, specVersion: 1, seed: value.seed,
    length: { length: length.length, solved: length.solved, attempts: length.attempts },
    rod: { angle: rod.angle, solved: rod.solved, attempts: rod.attempts },
    discoveries: Object.fromEntries(DISCOVERIES.map(key => [key, (value.discoveries as Record<string, unknown>)[key]])) as VaultProgress['discoveries'],
    aids: Object.fromEntries(AIDS.map(key => [key, (value.aids as Record<string, unknown>)[key]])) as VaultProgress['aids'],
    story: Object.fromEntries(STORY.map(key => [key, (value.story as Record<string, unknown>)[key]])) as VaultProgress['story'],
    finalDoorClosed: value.finalDoorClosed };
}
function parseHost(value: unknown): PuzzleState | undefined {
  if (!record(value) || value.gallery !== undefined || value.guideExamined !== false || value.markActivated !== false ||
    value.sealA !== false || value.sealB !== false || value.variant !== 'entrance' ||
    typeof value.exitDoorOpen !== 'boolean' || typeof value.cleared !== 'boolean' || typeof value.usedLookAssist !== 'boolean' ||
    !uint(value.hintStage) || value.hintStage > 3) return undefined;
  const emblem = parseSealCheckpoint(value.emblem), vault = parseVaultProgress(value.vault);
  if (!emblem || emblem.phase === 'released' || !vault || value.exitDoorOpen !== vault.rod.solved || value.cleared !== vault.finalDoorClosed) return undefined;
  return { emblem, vault, guideExamined: false, markActivated: false, sealA: false, sealB: false, variant: 'entrance',
    exitDoorOpen: value.exitDoorOpen, cleared: value.cleared, hintStage: value.hintStage as PuzzleState['hintStage'], usedLookAssist: value.usedLookAssist };
}
function checkpointId(value: unknown): VaultCheckpointId | undefined {
  if (!record(value) || !record(value.position) || ![value.position.x, value.position.y, value.position.z, value.yaw, value.pitch].every(finite)) return undefined;
  const { position } = value;
  return (Object.keys(VAULT_CHECKPOINTS) as VaultCheckpointId[]).find(id => {
    const pose = VAULT_CHECKPOINTS[id];
    return Math.abs(Number(position.x) - pose.position.x) <= 1e-6 && Math.abs(Number(position.y) - pose.position.y) <= 1e-6 &&
      Math.abs(Number(position.z) - pose.position.z) <= 1e-6 && Math.abs(Number(value.yaw) - pose.yaw) <= 1e-6 && Math.abs(Number(value.pitch) - pose.pitch) <= 1e-6;
  });
}
function allowed(id: VaultCheckpointId | undefined, progress: VaultProgress): id is VaultCheckpointId {
  return id !== undefined && (id !== 'brake' || progress.length.solved) && (id !== 'exit' || progress.rod.solved) && (!progress.finalDoorClosed || id === 'exit');
}
/** Save the last authorized refuge, not the player's current enemy corridor.
 * Every nested field is copied; pointers, actor memory and native owners cannot
 * hitchhike into the checkpoint through a spread of runtime/progress. */
export function createVaultCheckpoint(runtime: ChapterRuntime): CheckpointState {
  const progress = parseHost(runtime.progress);
  if (runtime.chapterId !== VAULT_CHAPTER_ID || !runtime.vault || !progress?.vault) throw new RangeError('Vault checkpoint requires consistent vault progress.');
  const id = checkpointId(runtime.vault.lastSafePose);
  const safeId = allowed(id, progress.vault) ? id : progress.cleared ? 'exit' : 'entry';
  return { schemaVersion: 1, chapterId: VAULT_CHAPTER_ID, levelVersion: VAULT_LEVEL_VERSION, progress, pose: clonePose(VAULT_CHECKPOINTS[safeId]) };
}
export type VaultRestoreResult = { checkpoint: CheckpointState; recovered: boolean; emblemStatus: 'valid' };
export function restoreVaultCheckpoint(value: unknown): VaultRestoreResult | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.chapterId !== VAULT_CHAPTER_ID || value.levelVersion !== VAULT_LEVEL_VERSION) return undefined;
  const progress = parseHost(value.progress);
  if (!progress?.vault) return undefined;
  const id = checkpointId(value.pose), safe = allowed(id, progress.vault);
  // Corruption never awards an unvisited downstream refuge. Completion itself
  // proves the final safe area was reached, so a clear record stays outside.
  const safeId = safe ? id : progress.cleared ? 'exit' : 'entry';
  return { checkpoint: { schemaVersion: 1, chapterId: VAULT_CHAPTER_ID, levelVersion: VAULT_LEVEL_VERSION, progress, pose: clonePose(VAULT_CHECKPOINTS[safeId]) }, recovered: !safe, emblemStatus: 'valid' };
}
