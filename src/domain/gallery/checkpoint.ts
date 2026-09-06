import { parseSealCheckpoint } from '../emblem';
import { isSafePose } from '../firstPerson/geometry';
import { getWorld } from '../firstPerson/chapter';
import { emblemCheckpointForProgress } from '../firstPerson/runtime';
import type { ChapterRuntime, CheckpointState, PlayerPose, PuzzleState } from '../firstPerson/types';
import { contourAligned, normalizeAngle } from './contour';
import { GALLERY_CHAPTER_ID, GALLERY_CHECKPOINT_POSES, GALLERY_LEVEL_VERSION, GALLERY_SPAWN } from './definition';
import { createGalleryRuntime } from './runtime';
import { createShadowSpec, SAMPLE_IDS, shadowPairMatches, validShadowAssignments } from './shadow';
import type { DiscAngles, GalleryProgress, SampleId, ShadowSlotId } from './types';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const uint = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const attempts = (value: unknown): value is number => uint(value) && value <= 999;
export function parseGalleryProgress(value: unknown): GalleryProgress | undefined {
  if (!record(value) || value.schemaVersion !== 1 || !uint(value.seed) || !record(value.shadow) || !record(value.contour) || !Array.isArray(value.order)) return undefined;
  const b = value.shadow, c = value.contour;
  if (b.seed !== value.seed || c.seed !== value.seed || !uint(b.variant) || b.variant > 5 || typeof b.inspected !== 'boolean' || typeof b.solved !== 'boolean' || !attempts(b.attempts) || !record(b.assignments) || typeof c.inspected !== 'boolean' || typeof c.solved !== 'boolean' || !attempts(c.attempts) || !Array.isArray(c.angles) || c.angles.length !== 3 || !c.angles.every(x => typeof x === 'number' && Number.isFinite(x))) return undefined;
  const assignments = Object.fromEntries(SAMPLE_IDS.map(id => [id, b.assignments && (b.assignments as Record<string, unknown>)[id]])) as Record<SampleId, ShadowSlotId>;
  if (!validShadowAssignments(assignments)) return undefined;
  const result: GalleryProgress = { schemaVersion: 1, seed: value.seed,
    shadow: { seed: value.seed, variant: b.variant, inspected: b.inspected, solved: b.solved, attempts: b.attempts, assignments },
    contour: { seed: value.seed, inspected: c.inspected, solved: c.solved, attempts: c.attempts, angles: c.angles.map(normalizeAngle) as DiscAngles }, order: [...value.order] };
  createShadowSpec(result.shadow.seed, result.shadow.variant);
  if (result.shadow.solved && (!result.shadow.inspected || !shadowPairMatches(result.shadow))) return undefined;
  if (result.contour.solved && (!result.contour.inspected || !contourAligned(result.contour.seed, result.contour.angles))) return undefined;
  if (result.order.length > 2 || new Set(result.order).size !== result.order.length || result.order.some(id => id !== 'B' && id !== 'C') || result.order.includes('B') !== result.shadow.solved || result.order.includes('C') !== result.contour.solved) return undefined;
  return result;
}
function unlocked(pose: PlayerPose, progress: PuzzleState): boolean {
  if (!progress.sealA && (pose.position.z < -8 || pose.position.x > 3)) return false;
  if (pose.position.z < -18 && pose.position.x < 4 && (!progress.gallery?.shadow.solved || !progress.gallery.contour.solved)) return false;
  if (pose.position.x === 5 && pose.position.z < -16 && !progress.sealB) return false;
  if (pose.position.z > 8 && progress.variant !== 'exit') return false;
  if (pose.position.z > 14 && !progress.exitDoorOpen) return false;
  if (progress.cleared && pose.position.z < 14.75) return false;
  return true;
}
function safePose(runtime: ChapterRuntime): PlayerPose {
  const options = GALLERY_CHECKPOINT_POSES.filter(pose => unlocked(pose, runtime.progress) && isSafePose(pose, getWorld(runtime)));
  const nearest = [...options].sort((a, b) => Math.hypot(a.position.x - runtime.pose.position.x, a.position.z - runtime.pose.position.z) - Math.hypot(b.position.x - runtime.pose.position.x, b.position.z - runtime.pose.position.z))[0] ?? GALLERY_SPAWN;
  return { ...nearest, position: { ...nearest.position } };
}
export function createGalleryCheckpoint(runtime: ChapterRuntime): CheckpointState {
  const gallery = runtime.progress.gallery;
  if (!gallery) throw new RangeError('Gallery checkpoint requires gallery progress.');
  return { schemaVersion: 1, chapterId: GALLERY_CHAPTER_ID, levelVersion: GALLERY_LEVEL_VERSION, pose: safePose(runtime),
    progress: { ...runtime.progress, emblem: emblemCheckpointForProgress(runtime.progress), gallery: { ...gallery,
      shadow: { ...gallery.shadow, assignments: { ...gallery.shadow.assignments } }, contour: { ...gallery.contour, angles: [...gallery.contour.angles] }, order: [...gallery.order] } } };
}
/** Unknown/malformed documents remain rejected for the storage read-only boundary.
 * Only validated chapter progress may recover a non-authored/unsafe pose. */
export function restoreGalleryCheckpoint(value: unknown): { checkpoint: CheckpointState; recovered: boolean; emblemStatus: 'valid' | 'migrated' } | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.chapterId !== GALLERY_CHAPTER_ID || value.levelVersion !== GALLERY_LEVEL_VERSION || !record(value.progress)) return undefined;
  const p = value.progress;
  const gallery = parseGalleryProgress(p.gallery), emblem = parseSealCheckpoint(p.emblem);
  if (!gallery || !emblem) return undefined;
  for (const key of ['guideExamined', 'markActivated', 'sealA', 'sealB', 'exitDoorOpen', 'cleared', 'usedLookAssist']) if (typeof p[key] !== 'boolean') return undefined;
  if ((p.variant !== 'entrance' && p.variant !== 'exit') || !uint(p.hintStage) || p.hintStage > 3 || (p.sealB && (!p.sealA || !gallery.shadow.solved || !gallery.contour.solved)) || ((gallery.shadow.inspected || gallery.contour.inspected) && !p.sealA) || (p.variant === 'exit' && !p.sealB) || (p.exitDoorOpen && p.variant !== 'exit') || (p.cleared && !p.exitDoorOpen) || (!!p.sealA !== (emblem.phase === 'released'))) return undefined;
  const progress: PuzzleState = { gallery, emblem, guideExamined: p.guideExamined as boolean, markActivated: p.markActivated as boolean, sealA: p.sealA as boolean, sealB: p.sealB as boolean,
    variant: p.variant, exitDoorOpen: p.exitDoorOpen as boolean, cleared: p.cleared as boolean, hintStage: p.hintStage as PuzzleState['hintStage'], usedLookAssist: p.usedLookAssist as boolean };
  let pose: PlayerPose | undefined;
  if (record(value.pose) && record(value.pose.position)) {
    const q = value.pose, position = value.pose.position;
    if ([position.x, position.y, position.z, q.yaw, q.pitch].every(n => typeof n === 'number' && Number.isFinite(n))) pose = { position: { x: Number(position.x), y: Number(position.y), z: Number(position.z) }, yaw: Number(q.yaw), pitch: Number(q.pitch) };
  }
  const runtime = createGalleryRuntime({ schemaVersion: 1, chapterId: GALLERY_CHAPTER_ID, levelVersion: GALLERY_LEVEL_VERSION, progress, pose: GALLERY_SPAWN });
  const named = pose && GALLERY_CHECKPOINT_POSES.some(named => Math.hypot(named.position.x - pose!.position.x, named.position.z - pose!.position.z) < 0.001);
  const safe = !!pose && named && unlocked(pose, progress) && isSafePose(pose, getWorld(runtime));
  if (safe) runtime.pose = pose!;
  else {
    runtime.pose = progress.cleared ? GALLERY_CHECKPOINT_POSES.at(-1)! : progress.sealB ? GALLERY_CHECKPOINT_POSES[6]! : progress.sealA ? GALLERY_CHECKPOINT_POSES[3]! : GALLERY_SPAWN;
    runtime.pose = safePose(runtime);
  }
  return { checkpoint: { schemaVersion: 1, chapterId: GALLERY_CHAPTER_ID, levelVersion: GALLERY_LEVEL_VERSION, progress, pose: runtime.pose }, recovered: !safe, emblemStatus: 'valid' };
}
