import { checkpointSeal, EMBLEM_SEED, parseSealCheckpoint, reduceSeal, sealHint, startSealSession, type SealCheckpoint, type SealResult } from '../emblem/puzzle';
import type { Glyph } from '../emblem/stimulus';
import { EMBLEM_FIXTURE, EMBLEM_SWITCH_FEEDBACK_SECONDS } from './emblemFixture';
import { evaluateKeyAlignment } from './alignment';
import { CHANGED_REGION, CHAPTER, EYE_HEIGHT, getWorld, KEY_PUZZLE, OBSERVATION_POSE, PLAYER_RADIUS } from './chapter';
import { clamp, isSafePose, MAX_FRAME_DELTA, segmentOccluded, updatePlayer } from './geometry';
import { evaluateInteraction } from './interaction';
import type { CameraMatrices, ChapterRuntime, CheckpointState, CollisionVolume, HintStage, InteractableDefinition, InteractableId, MovementInput, PlayerPose, PuzzleDefinition, PuzzleState, Vec3, WorldGeometry } from './types';

export function initialProgress(): PuzzleState {
  return { emblem: checkpointSeal(startSealSession(EMBLEM_SEED, 'initial')), guideExamined: false, markActivated: false, sealA: false, sealB: false, variant: 'entrance', exitDoorOpen: false, cleared: false, hintStage: 0, usedLookAssist: false };
}
let runtimeSession = 0;
/** The old host seal remains the downstream gate. Optional puzzle state is
 * normalized to it so legacy saves resume without replaying the first room. */
export function emblemCheckpointForProgress(progress: PuzzleState): SealCheckpoint {
  const parsed = parseSealCheckpoint(progress.emblem);
  const fallback = checkpointSeal(startSealSession(EMBLEM_SEED, 'checkpoint'));
  const checkpoint = parsed ?? fallback;
  return { ...checkpoint, phase: progress.sealA ? 'released' : checkpoint.phase === 'released' ? 'observing' : checkpoint.phase };
}
export function createInitialRuntime(checkpoint?: CheckpointState, session = ++runtimeSession): ChapterRuntime {
  runtimeSession = Math.max(runtimeSession, session);
  const progress = checkpoint ? { ...checkpoint.progress } : initialProgress();
  const savedEmblem = emblemCheckpointForProgress(progress);
  progress.emblem = savedEmblem;
  if (!progress.sealA) progress.hintStage = savedEmblem.hintTier;
  const emblem = startSealSession(savedEmblem.seed, String(session), savedEmblem);
  return { pose: checkpoint ? { ...checkpoint.pose, position: { ...checkpoint.pose.position } } : { ...CHAPTER.spawn, position: { ...CHAPTER.spawn.position } },
    progress, emblem, session, paused: false, alignment: false, doorAOpen: progress.sealA ? 1 : 0, doorBOpen: progress.sealB ? 1 : 0, doorExitOpen: progress.exitDoorOpen ? 1 : 0 };
}
/** A reducer result and the existing door gate commit together in one runtime
 * value. Rejected/replayed results never produce another host transition. */
export function commitEmblemResult(runtime: ChapterRuntime, result: SealResult): ChapterRuntime {
  if (!result.accepted || result.state.sessionId !== runtime.emblem.sessionId || result.state.seed !== runtime.emblem.seed || result.state.lastSeq <= runtime.emblem.lastSeq) return runtime;
  const emblem = runtime.progress.sealA && result.state.phase !== 'released' ? { ...result.state, phase: 'released' as const } : result.state;
  return { ...runtime, emblem, progress: { ...runtime.progress, emblem: checkpointSeal(emblem), sealA: runtime.progress.sealA || emblem.phase === 'released', hintStage: runtime.progress.sealA ? runtime.progress.hintStage : emblem.phase === 'released' ? 0 : emblem.hintTier } };
}
export function findInteraction(world: WorldGeometry, pose: PlayerPose, progress?: PuzzleState): InteractableDefinition | undefined {
  const candidate = evaluateInteraction(world, pose, progress);
  return candidate.kind === 'ready' || candidate.kind === 'locked' ? candidate.target : undefined;
}

function regionCorners(region: CollisionVolume): Vec3[] {
  return [region.min.x, region.max.x].flatMap((x) => [region.min.y, region.max.y].flatMap((y) => [region.min.z, region.max.z].map((z) => ({ x, y, z }))));
}
/** Certifies an entire convex changed volume lies behind one opaque rectangle.
 * Every ray to that volume crosses the same wall plane within its rectangle;
 * fractional-linear extrema occur at box vertices. This does not depend on yaw
 * or a one-point frustum test, so a simultaneous turn cannot expose a swap. */
export function occlusionCertificate(pose: PlayerPose, changed: CollisionVolume, blockers: readonly CollisionVolume[]): string | undefined {
  for (const wall of blockers) {
    if (!wall.opaque || wall.kind !== 'wall') continue;
    const xThin = wall.max.x - wall.min.x <= 0.25;
    const zThin = wall.max.z - wall.min.z <= 0.25;
    if (!xThin && !zThin) continue;
    const axis = xThin ? 'x' : 'z';
    const across = axis === 'x' ? 'z' : 'x';
    const plane = (wall.min[axis] + wall.max[axis]) / 2;
    const cameraSide = pose.position[axis] - plane;
    if (Math.abs(cameraSide) < PLAYER_RADIUS) continue;
    const hidden = regionCorners(changed).every((point) => {
      const targetSide = point[axis] - plane;
      if (cameraSide * targetSide >= 0) return false;
      const t = (plane - pose.position[axis]) / (point[axis] - pose.position[axis]);
      const horizontal = pose.position[across] + (point[across] - pose.position[across]) * t;
      const vertical = pose.position.y + (point.y - pose.position.y) * t;
      return horizontal > wall.min[across] + 0.03 && horizontal < wall.max[across] - 0.03 && vertical > wall.min.y + 0.03 && vertical < wall.max.y - 0.03;
    });
    if (hidden) return wall.id;
  }
  return undefined;
}
export function canApplyReturnVariant(runtime: ChapterRuntime): boolean {
  if (!runtime.progress.sealA || !runtime.progress.sealB || runtime.progress.variant === 'exit') return false;
  const { position } = runtime.pose;
  if (position.x >= CHANGED_REGION.min.x - PLAYER_RADIUS && position.x <= CHANGED_REGION.max.x + PLAYER_RADIUS && position.z >= CHANGED_REGION.min.z - PLAYER_RADIUS && position.z <= CHANGED_REGION.max.z + PLAYER_RADIUS) return false;
  const world = getWorld(runtime);
  if (!isSafePose(runtime.pose, world) || !occlusionCertificate(runtime.pose, CHANGED_REGION, world.solids)) return false;
  const variant = { ...runtime, progress: { ...runtime.progress, variant: 'exit' as const } };
  return isSafePose(runtime.pose, getWorld(variant));
}
export function evaluateRuntime(runtime: ChapterRuntime, nextPose: PlayerPose, dt: number, matrices?: CameraMatrices): ChapterRuntime {
  if (runtime.paused || runtime.progress.cleared) return runtime;
  const world = getWorld(runtime);
  const pose = isSafePose(nextPose, world) ? nextPose : runtime.pose;
  const progress = runtime.progress;
  const elapsed = Number.isFinite(dt) ? clamp(dt, 0, MAX_FRAME_DELTA) : 0;
  const remaining = runtime.switchFeedback ? Math.max(0, runtime.switchFeedback.remainingSeconds - elapsed) : 0;
  let next: ChapterRuntime = { ...runtime, pose, progress,
    switchFeedback: runtime.switchFeedback && remaining > 0 ? { ...runtime.switchFeedback, remainingSeconds: remaining } : undefined,
    doorAOpen: runtime.progress.sealA ? Math.min(1, runtime.doorAOpen + elapsed / 1.25) : 0,
    doorBOpen: runtime.progress.sealB ? Math.min(1, runtime.doorBOpen + elapsed / 1.25) : 0,
    doorExitOpen: runtime.progress.exitDoorOpen ? Math.min(1, runtime.doorExitOpen + elapsed / 1.25) : 0,
  };
  next.alignment = runtime.progress.sealB || (!!matrices && runtime.progress.sealA && evaluateKeyAlignment(pose, getWorld(next), matrices, runtime.alignment).aligned);
  if (canApplyReturnVariant(next)) next = { ...next, progress: { ...next.progress, variant: 'exit' } };
  if (next.progress.exitDoorOpen && next.progress.variant === 'exit' && next.pose.position.z >= 14.75) next = { ...next, progress: { ...next.progress, cleared: true } };
  return next;
}
export function stepRuntime(runtime: ChapterRuntime, input: MovementInput, dt: number, matrices?: CameraMatrices): ChapterRuntime {
  if (runtime.paused || runtime.progress.cleared) return runtime;
  return evaluateRuntime(runtime, updatePlayer(runtime.pose, input, dt, getWorld(runtime)), dt, matrices);
}
function prerequisitesMet(puzzle: PuzzleDefinition, progress: PuzzleState, keyAlignment = false): boolean {
  return puzzle.prerequisites.every((requirement) => requirement === 'keyAlignment' ? keyAlignment : progress[requirement]);
}
export function interact(runtime: ChapterRuntime, expectedId: InteractableId, matrices?: CameraMatrices): ChapterRuntime {
  if (runtime.paused || runtime.progress.cleared) return runtime;
  const candidate = evaluateInteraction(getWorld(runtime), runtime.pose, runtime.progress, matrices, runtime.alignment);
  if (candidate.kind !== 'ready' || candidate.target.id !== expectedId) return runtime;
  const progress = runtime.progress;
  switch (expectedId) {
    case 'guide':
    case 'floor-device': return runtime;
    case 'emblem-panel':
    case 'emblem-circle':
    case 'emblem-diamond':
    case 'emblem-square': {
      if (!matrices) return runtime;
      const glyph = expectedId === 'emblem-panel' ? undefined : expectedId.slice('emblem-'.length) as Glyph;
      const result = reduceSeal(runtime.emblem, { sessionId: runtime.emblem.sessionId, seq: runtime.emblem.lastSeq + 1, nowMs: runtime.emblem.lastNowMs + 1,
        action: glyph ? { type: 'choose', glyph } : { type: 'inspect' } }, { rendererReady: true, foreground: true, targetId: candidate.target.id });
      const next = commitEmblemResult(runtime, result);
      return next !== runtime && glyph ? { ...next, switchFeedback: { glyph, correct: next.progress.sealA, sequence: result.state.lastSeq, remainingSeconds: EMBLEM_SWITCH_FEEDBACK_SECONDS } } : next;
    }
    case 'key': {
      const actualAlignment = !!matrices && evaluateKeyAlignment(runtime.pose, getWorld(runtime), matrices, runtime.alignment).aligned;
      if (progress[KEY_PUZZLE.success.seal] || !prerequisitesMet(KEY_PUZZLE, progress, actualAlignment)) return runtime;
      const solved = { ...runtime, alignment: true, progress: { ...progress, [KEY_PUZZLE.success.seal]: true, hintStage: 0 as const } };
      return canApplyReturnVariant(solved) ? { ...solved, progress: { ...solved.progress, variant: 'exit' } } : solved;
    }
    case 'exit':
      return progress.exitDoorOpen || progress.variant !== 'exit' || !progress.sealA || !progress.sealB ? runtime : { ...runtime, progress: { ...progress, exitDoorOpen: true } };
  }
}
export function pauseRuntime(runtime: ChapterRuntime): ChapterRuntime { return runtime.paused ? runtime : { ...runtime, paused: true, emblem: { ...runtime.emblem, paused: true } }; }
export function resumeRuntime(runtime: ChapterRuntime): ChapterRuntime { return runtime.paused ? { ...runtime, paused: false, emblem: { ...runtime.emblem, paused: false } } : runtime; }
export function setHintStage(runtime: ChapterRuntime, stage: HintStage): ChapterRuntime {
  if (runtime.progress.sealA) return { ...runtime, progress: { ...runtime.progress, hintStage: stage } };
  let next = runtime;
  while (next.emblem.hintTier < stage) {
    next = commitEmblemResult(next, reduceSeal(next.emblem, { sessionId: next.emblem.sessionId, seq: next.emblem.lastSeq + 1, nowMs: next.emblem.lastNowMs + 1, action: { type: 'hint' } }, { rendererReady: false, foreground: false, targetId: null }));
  }
  return next;
}

export function hintForRuntime(runtime: ChapterRuntime): { text: string; target?: Vec3 } {
  const { progress } = runtime;
  const stage = Math.max(1, progress.hintStage) - 1;
  if (!progress.sealA) return { text: sealHint(runtime.emblem), target: EMBLEM_FIXTURE.center };
  if (!progress.sealB) return { text: KEY_PUZZLE.hints[stage]!, target: OBSERVATION_POSE.position };
  if (progress.variant !== 'exit') return { text: '鍵の部屋の観察の輪へ戻ろう。帰り道の準備が整います。', target: OBSERVATION_POSE.position };
  if (progress.exitDoorOpen) return { text: '開いた最後の扉を、自分の足で通り抜けよう。', target: { x: 0, y: EYE_HEIGHT, z: 15.5 } };
  return { text: ['覚えのある入口へ戻ってみよう。', '二つ目の扉から帰ると、回廊を短く戻れる。', '最初にいた小さな扉の向こうへ進み、奥の最後の扉を調べよう。'][stage]!, target: { x: 0, y: EYE_HEIGHT, z: 12 } };
}
export function objectiveForRuntime(runtime: ChapterRuntime): string {
  const p = runtime.progress;
  if (p.cleared) return '帰り道のない入口から脱出した。';
  if (p.exitDoorOpen) return '開いた扉の外へ歩こう。';
  if (p.sealB) return '覚えのある入口へ戻ろう。';
  if (p.sealA) return KEY_PUZZLE.clues[0]!;
  return runtime.emblem.phase === 'unexamined' ? '壁の紋章を調べる' : '切れずにつながる輪郭を探す';
}
/** An explicit, local aim aid. It never moves the player or solves a puzzle. */
export function assistAim(runtime: ChapterRuntime): ChapterRuntime {
  if (runtime.paused || runtime.progress.hintStage < 3 || runtime.progress.cleared) return runtime;
  if (!runtime.progress.sealA || runtime.progress.sealB) return runtime;
  const world = getWorld(runtime);
  if (Math.hypot(runtime.pose.position.x - OBSERVATION_POSE.position.x, runtime.pose.position.z - OBSERVATION_POSE.position.z) > 0.55) return runtime;
  const target = world.keyFrame.center;
  if (segmentOccluded(runtime.pose.position, target, world)) return runtime;
  const dx = target.x - runtime.pose.position.x;
  const dz = target.z - runtime.pose.position.z;
  const pose = { ...runtime.pose, yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(target.y - runtime.pose.position.y, Math.hypot(dx, dz)), -1.1, 1.1) };
  return { ...runtime, pose, progress: { ...runtime.progress, usedLookAssist: true } };
}
