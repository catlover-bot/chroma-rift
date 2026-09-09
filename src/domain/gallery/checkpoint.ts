import { parseSealCheckpoint } from '../emblem';
import { isSafePose } from '../firstPerson/geometry';
import { getGalleryWorld } from './world';
import { emblemCheckpointForProgress } from '../firstPerson/baseRuntime';
import type { ChapterRuntime, CheckpointState, PlayerPose, PuzzleState } from '../firstPerson/types';
import { contourAligned, normalizeAngle } from './contour';
import { GALLERY_CHAPTER_ID, GALLERY_CHECKPOINT_POSES, GALLERY_FINAL_CHECKPOINT, GALLERY_LEVEL_VERSION, GALLERY_OUTSIDE_POSE, GALLERY_SAFE_RETREATS, GALLERY_SERVICE_CHECKPOINT, GALLERY_SPAWN, GALLERY_WIRING_OBSERVATION_POSE } from './definition';
import { createGalleryRuntime } from './runtime';
import { isGalleryExitThreshold } from './selectors';
import { DISCOVERY_IDS, initialDiscoveries } from './state';
import { initialWiring, wiringAligned, WIRING_COVER_LIMITS, WIRING_OFFSET_LIMITS } from './wiring';
import { SAMPLE_IDS, shadowPairMatches, validShadowAssignments } from './shadow';
import type { DiscAngles, GalleryProgress, GalleryV2Progress, LegacyGalleryProgress, SampleId, ShadowSlotId } from './types';

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const uint = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const attempts = (value: unknown): value is number => uint(value) && value <= 999;
function puzzleProgress(value: unknown): Omit<LegacyGalleryProgress, 'schemaVersion'> | undefined {
  if (!record(value) || !uint(value.seed) || !record(value.shadow) || !record(value.contour) || !Array.isArray(value.order)) return undefined;
  const b = value.shadow, c = value.contour;
  if (b.seed !== value.seed || c.seed !== value.seed || !uint(b.variant) || b.variant > 5 || typeof b.inspected !== 'boolean' || typeof b.solved !== 'boolean' || !attempts(b.attempts) || !record(b.assignments) || typeof c.inspected !== 'boolean' || typeof c.solved !== 'boolean' || !attempts(c.attempts) || !Array.isArray(c.angles) || c.angles.length !== 3 || !c.angles.every(x => typeof x === 'number' && Number.isFinite(x))) return undefined;
  const assignments = Object.fromEntries(SAMPLE_IDS.map(id => [id, (b.assignments as Record<string, unknown>)[id]])) as Record<SampleId, ShadowSlotId>;
  if (!validShadowAssignments(assignments)) return undefined;
  const result: Omit<LegacyGalleryProgress, 'schemaVersion'> = { seed: value.seed,
    shadow: { seed: value.seed, variant: b.variant, inspected: b.inspected, solved: b.solved, attempts: b.attempts, assignments },
    contour: { seed: value.seed, inspected: c.inspected, solved: c.solved, attempts: c.attempts, angles: c.angles.map(normalizeAngle) as DiscAngles }, order: [...value.order] };
  if (result.shadow.solved && (!result.shadow.inspected || !shadowPairMatches(result.shadow))) return undefined;
  if (result.contour.solved && (!result.contour.inspected || !contourAligned(result.contour.seed, result.contour.angles))) return undefined;
  if (result.order.length > 2 || new Set(result.order).size !== result.order.length || result.order.some(id => id !== 'B' && id !== 'C') || result.order.includes('B') !== result.shadow.solved || result.order.includes('C') !== result.contour.solved) return undefined;
  return result;
}
export function parseLegacyGalleryProgress(value: unknown): LegacyGalleryProgress | undefined {
  const puzzles = puzzleProgress(value);
  return record(value) && value.schemaVersion === 1 && puzzles ? { schemaVersion: 1, ...puzzles } : undefined;
}
export function parseGalleryV2Progress(value: unknown): GalleryV2Progress | undefined {
  const puzzles = puzzleProgress(value);
  if (!puzzles || !record(value) || value.schemaVersion !== 2 || !record(value.powerTaken) || !record(value.story)) return undefined;
  for (const key of ['emergencyLit', 'exitInspected', 'powerConnected', 'completedFromV1']) if (typeof value[key] !== 'boolean') return undefined;
  for (const key of ['foreshadowed', 'absence', 'serviceWarned', 'resolved']) if (typeof value.story[key] !== 'boolean') return undefined;
  if (value.story.absence && !value.story.foreshadowed) return undefined;
  if (value.story.serviceWarned && !value.powerConnected) return undefined;
  if (value.story.resolved && !value.powerConnected) return undefined;
  if (value.story.absence && !value.powerTaken.shadow && !value.powerTaken.contour) return undefined;
  if (typeof value.powerTaken.shadow !== 'boolean' || typeof value.powerTaken.contour !== 'boolean' ||
    (value.powerTaken.shadow && !puzzles.shadow.solved) || (value.powerTaken.contour && !puzzles.contour.solved) ||
    (value.powerConnected && (!value.powerTaken.shadow || !value.powerTaken.contour || !value.exitInspected))) return undefined;
  return { schemaVersion: 2, ...puzzles, emergencyLit: value.emergencyLit as boolean, exitInspected: value.exitInspected as boolean,
    powerTaken: { shadow: value.powerTaken.shadow, contour: value.powerTaken.contour }, powerConnected: value.powerConnected as boolean, completedFromV1: value.completedFromV1 as boolean, story: { foreshadowed: value.story.foreshadowed as boolean, absence: value.story.absence as boolean, serviceWarned: value.story.serviceWarned as boolean, resolved: value.story.resolved as boolean } };
}
export function parseGalleryProgress(value: unknown): GalleryProgress | undefined {
  if (!record(value) || value.schemaVersion !== 3 || !record(value.wiring) || !record(value.discoveries) || !record(value.story)) return undefined;
  const previous = parseGalleryV2Progress({ ...value, schemaVersion: 2 });
  if (!previous) return undefined;
  if (typeof value.story.crossingStarted !== 'boolean' || typeof value.story.crossingPresented !== 'boolean' || (value.story.crossingPresented && !value.story.crossingStarted) || (value.story.crossingStarted && !previous.powerTaken.shadow && !previous.powerTaken.contour)) return undefined;
  const w = value.wiring;
  if (typeof w.offset !== 'number' || !Number.isFinite(w.offset) || w.offset < WIRING_OFFSET_LIMITS[0] || w.offset > WIRING_OFFSET_LIMITS[1] ||
    typeof w.cover !== 'number' || !Number.isFinite(w.cover) || w.cover < WIRING_COVER_LIMITS[0] || w.cover > WIRING_COVER_LIMITS[1] || !attempts(w.attempts)) return undefined;
  for (const key of ['inspected', 'solved', 'compatibleBypass']) if (typeof w[key] !== 'boolean') return undefined;
  for (const key of ['maskWindowOpen', 'finalDoorClosed', 'completedFromV2']) if (typeof value[key] !== 'boolean') return undefined;
  for (const id of DISCOVERY_IDS) if (typeof value.discoveries[id] !== 'boolean') return undefined;
  if (w.solved && (!previous.powerConnected || !wiringAligned(w.offset) || (!w.inspected && !w.compatibleBypass))) return undefined;
  if (w.compatibleBypass && !w.solved) return undefined;
  if (value.finalDoorClosed && !w.solved) return undefined;
  if (value.completedFromV2 && (!value.finalDoorClosed || previous.completedFromV1)) return undefined;
  return { ...previous, schemaVersion: 3, story: { ...previous.story, crossingStarted: value.story.crossingStarted, crossingPresented: value.story.crossingPresented },
    wiring: { offset: w.offset, cover: w.cover, inspected: w.inspected as boolean, solved: w.solved as boolean, attempts: w.attempts, compatibleBypass: w.compatibleBypass as boolean },
    discoveries: Object.fromEntries(DISCOVERY_IDS.map(id => [id, (value.discoveries as Record<string, unknown>)[id]])) as GalleryProgress['discoveries'],
    maskWindowOpen: value.maskWindowOpen as boolean, finalDoorClosed: value.finalDoorClosed as boolean, completedFromV2: value.completedFromV2 as boolean };
}
function upgradeProgress(old: GalleryV2Progress, cleared: boolean): GalleryProgress {
  return { ...old, schemaVersion: 3, story: { ...old.story, crossingStarted: false, crossingPresented: false }, wiring: initialWiring(old.powerConnected), discoveries: initialDiscoveries(),
    maskWindowOpen: false, finalDoorClosed: cleared, completedFromV2: cleared && !old.completedFromV1 };
}
function hostProgress(value: unknown): Omit<PuzzleState, 'gallery'> | undefined {
  if (!record(value)) return undefined;
  const emblem = parseSealCheckpoint(value.emblem);
  if (!emblem || (value.variant !== 'entrance' && value.variant !== 'exit') || !uint(value.hintStage) || value.hintStage > 3) return undefined;
  for (const key of ['guideExamined', 'markActivated', 'sealA', 'sealB', 'exitDoorOpen', 'cleared', 'usedLookAssist']) if (typeof value[key] !== 'boolean') return undefined;
  return { emblem, guideExamined: value.guideExamined as boolean, markActivated: value.markActivated as boolean,
    sealA: value.sealA as boolean, sealB: value.sealB as boolean, variant: value.variant, exitDoorOpen: value.exitDoorOpen as boolean,
    cleared: value.cleared as boolean, hintStage: value.hintStage as PuzzleState['hintStage'], usedLookAssist: value.usedLookAssist as boolean };
}
function parsePose(value: unknown): PlayerPose | undefined {
  if (!record(value) || !record(value.position)) return undefined;
  const position = value.position;
  if (![position.x, position.y, position.z, value.yaw, value.pitch].every(n => typeof n === 'number' && Number.isFinite(n))) return undefined;
  return { position: { x: Number(position.x), y: Number(position.y), z: Number(position.z) }, yaw: Number(value.yaw), pitch: Number(value.pitch) };
}
function unlocked(pose: PlayerPose, progress: PuzzleState): boolean {
  if (pose.position.z > 6 && !progress.gallery?.powerConnected) return false;
  if (pose.position.z >= 11.3 && pose.position.x > 1 && !progress.gallery?.wiring.solved) return false;
  if (progress.cleared && !isGalleryExitThreshold(pose)) return false;
  return true;
}
function named(pose: PlayerPose): boolean { return GALLERY_CHECKPOINT_POSES.some(p => Math.hypot(p.position.x - pose.position.x, p.position.z - pose.position.z) < .001); }
/** Persist only authored safe poses. Mid-corridor saves resume before danger,
 * never jump forward into a safe final area that the player has not reached. */
export function gallerySafeCheckpointPose(runtime: ChapterRuntime): PlayerPose {
  const p = runtime.pose.position;
  let candidates = GALLERY_CHECKPOINT_POSES.filter(pose => pose.position.z < 6);
  if (runtime.progress.cleared) candidates = [GALLERY_OUTSIDE_POSE];
  else if (isGalleryExitThreshold(runtime.pose)) candidates = [GALLERY_FINAL_CHECKPOINT];
  else if (p.z > 6) {
    const retreat = GALLERY_SAFE_RETREATS.find(pose => Math.abs(pose.position.x - p.x) < .65 && Math.abs(pose.position.z - p.z) < .75);
    candidates = [retreat ?? (p.x < -.3 && p.z <= 13 ? GALLERY_WIRING_OBSERVATION_POSE : runtime.gallery?.lastSafePose ?? GALLERY_SERVICE_CHECKPOINT)];
  }
  const valid = candidates.filter(pose => unlocked(pose, runtime.progress) && isSafePose(pose, getGalleryWorld(runtime)));
  const nearest = valid.sort((a, b) => Math.hypot(a.position.x - p.x, a.position.z - p.z) - Math.hypot(b.position.x - p.x, b.position.z - p.z))[0] ?? GALLERY_SPAWN;
  return { ...nearest, position: { ...nearest.position } };
}
export function createGalleryCheckpoint(runtime: ChapterRuntime): CheckpointState {
  const gallery = runtime.progress.gallery;
  if (!gallery) throw new RangeError('Gallery checkpoint requires gallery progress.');
  return { schemaVersion: 1, chapterId: GALLERY_CHAPTER_ID, levelVersion: GALLERY_LEVEL_VERSION, pose: gallerySafeCheckpointPose(runtime),
    progress: { ...runtime.progress, emblem: emblemCheckpointForProgress(runtime.progress), gallery: { ...gallery,
      wiring: { ...gallery.wiring }, discoveries: { ...gallery.discoveries }, powerTaken: { ...gallery.powerTaken }, story: { ...gallery.story }, shadow: { ...gallery.shadow, assignments: { ...gallery.shadow.assignments } },
      contour: { ...gallery.contour, angles: [...gallery.contour.angles] }, order: [...gallery.order] } } };
}
export type GalleryRestoreResult = { checkpoint: CheckpointState; recovered: boolean; emblemStatus: 'valid' | 'migrated' };
/** V3 documents never fall through to a more permissive legacy parser. */
export function restoreGalleryCheckpoint(value: unknown): GalleryRestoreResult | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.chapterId !== GALLERY_CHAPTER_ID || value.levelVersion !== GALLERY_LEVEL_VERSION || !record(value.progress)) return undefined;
  const host = hostProgress(value.progress), gallery = parseGalleryProgress(value.progress.gallery);
  if (!host || !gallery || (host.exitDoorOpen && !gallery.powerConnected) || (host.cleared !== gallery.finalDoorClosed) || ((gallery.completedFromV1 || gallery.completedFromV2) && !host.cleared)) return undefined;
  const progress: PuzzleState = { ...host, gallery };
  const pose = parsePose(value.pose);
  const runtime = createGalleryRuntime({ schemaVersion: 1, chapterId: GALLERY_CHAPTER_ID, levelVersion: GALLERY_LEVEL_VERSION, progress, pose: GALLERY_SPAWN });
  const safe = !!pose && named(pose) && unlocked(pose, progress) && isSafePose(pose, getGalleryWorld(runtime));
  runtime.pose = safe ? pose! : progress.cleared ? GALLERY_OUTSIDE_POSE : gallery.powerConnected ? GALLERY_SERVICE_CHECKPOINT : GALLERY_SPAWN;
  return { checkpoint: { schemaVersion: 1, chapterId: GALLERY_CHAPTER_ID, levelVersion: GALLERY_LEVEL_VERSION, progress, pose: runtime.pose }, recovered: !safe, emblemStatus: 'valid' };
}
/** Pure, strict v1 migration. The storage owner must preserve the source raw
 * before writing this new document, and never overwrite the v1 key. */
export function migrateGalleryV1Checkpoint(value: unknown): (GalleryRestoreResult & { migrated: true }) | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.chapterId !== GALLERY_CHAPTER_ID || value.levelVersion !== 1 || !record(value.progress)) return undefined;
  const host = hostProgress(value.progress), old = parseLegacyGalleryProgress(value.progress.gallery);
  if (!host || !old || (host.sealB && (!host.sealA || !old.shadow.solved || !old.contour.solved)) ||
    ((old.shadow.inspected || old.contour.inspected) && !host.sealA) || (host.variant === 'exit' && !host.sealB) ||
    (host.exitDoorOpen && host.variant !== 'exit') || (host.cleared && !host.exitDoorOpen) || host.sealA !== (host.emblem!.phase === 'released')) return undefined;
  const versionTwo: GalleryV2Progress = { ...old, schemaVersion: 2, emergencyLit: host.sealA || host.guideExamined,
    exitInspected: host.sealA || host.guideExamined, powerTaken: { shadow: old.shadow.solved, contour: old.contour.solved },
    powerConnected: host.sealB || host.variant === 'exit' || host.cleared, completedFromV1: host.cleared,
    story: { foreshadowed: host.sealA || host.guideExamined || old.shadow.solved || old.contour.solved, absence: old.shadow.solved || old.contour.solved, serviceWarned: host.sealB || host.variant === 'exit' || host.cleared, resolved: host.cleared } };
  const gallery = upgradeProgress(versionTwo, host.cleared);
  const progress: PuzzleState = { ...host, gallery };
  // All v1 coordinates belonged to a different level. Retain semantic progress
  // and choose one safe new checkpoint; do not replay completed puzzles.
  const pose = host.cleared ? GALLERY_OUTSIDE_POSE : gallery.powerConnected ? GALLERY_SERVICE_CHECKPOINT : GALLERY_SPAWN;
  const checkpoint: CheckpointState = { schemaVersion: 1, chapterId: GALLERY_CHAPTER_ID, levelVersion: GALLERY_LEVEL_VERSION, progress, pose: { ...pose, position: { ...pose.position } } };
  return { checkpoint, recovered: true, emblemStatus: 'valid', migrated: true };
}

/** Strict v2 migration, used only when the v3 storage key is absent. The caller
 * preserves the untouched source raw before persisting this result. */
export function migrateGalleryV2Checkpoint(value: unknown): (GalleryRestoreResult & { migrated: true }) | undefined {
  if (!record(value) || value.schemaVersion !== 1 || value.chapterId !== GALLERY_CHAPTER_ID || value.levelVersion !== 2 || !record(value.progress)) return undefined;
  const host = hostProgress(value.progress), old = parseGalleryV2Progress(value.progress.gallery);
  if (!host || !old || (host.exitDoorOpen && !old.powerConnected) || (host.cleared && !host.exitDoorOpen) || (old.completedFromV1 && !host.cleared)) return undefined;
  const gallery = upgradeProgress(old, host.cleared), progress: PuzzleState = { ...host, gallery };
  const oldPose = parsePose(value.pose);
  const atLastSafeArea = old.powerConnected && oldPose && oldPose.position.x >= 3 && oldPose.position.x <= 5 && oldPose.position.z >= 16.6;
  const pose = host.cleared ? GALLERY_OUTSIDE_POSE : atLastSafeArea ? GALLERY_FINAL_CHECKPOINT : old.powerConnected ? GALLERY_SERVICE_CHECKPOINT : GALLERY_SPAWN;
  return { checkpoint: { schemaVersion: 1, chapterId: GALLERY_CHAPTER_ID, levelVersion: GALLERY_LEVEL_VERSION, progress, pose: { ...pose, position: { ...pose.position } } }, recovered: true, emblemStatus: 'valid', migrated: true };
}
