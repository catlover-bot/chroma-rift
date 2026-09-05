import { evaluateKeyAlignment } from './alignment';
import { CHANGED_REGION, CHAPTER, EYE_HEIGHT, FLOOR_MARK, FLOOR_PUZZLE, getWorld, KEY_PUZZLE, OBSERVATION_POSE, PLAYER_RADIUS } from './chapter';
import { clamp, forwardVector, isSafePose, MAX_FRAME_DELTA, rayBoxDistance, raySphereDistance, segmentOccluded, updatePlayer } from './geometry';
import type { CameraMatrices, ChapterRuntime, CheckpointState, CollisionVolume, HintStage, InteractableDefinition, InteractableId, MovementInput, PlayerPose, PuzzleDefinition, PuzzleState, Vec3, WorldGeometry } from './types';

export function initialProgress(): PuzzleState {
  return { guideExamined: false, markActivated: false, sealA: false, sealB: false, variant: 'entrance', exitDoorOpen: false, cleared: false, hintStage: 0, usedLookAssist: false };
}
export function createInitialRuntime(checkpoint?: CheckpointState, session = 1): ChapterRuntime {
  const progress = checkpoint ? { ...checkpoint.progress } : initialProgress();
  return { pose: checkpoint ? { ...checkpoint.pose, position: { ...checkpoint.pose.position } } : { ...CHAPTER.spawn, position: { ...CHAPTER.spawn.position } },
    progress, session, paused: false, alignment: false, doorAOpen: progress.sealA ? 1 : 0, doorBOpen: progress.sealB ? 1 : 0, doorExitOpen: progress.exitDoorOpen ? 1 : 0 };
}
export function findInteraction(world: WorldGeometry, pose: PlayerPose, _progress?: PuzzleState): InteractableDefinition | undefined {
  const ray = forwardVector(pose);
  const candidates = world.interactables.flatMap((target) => {
    const distance = raySphereDistance(pose.position, ray, target.center, target.radius);
    if (distance === undefined || distance > target.maxDistance) return [];
    const blocked = world.solids.some((volume) => {
      if (!volume.opaque || volume.id === `${target.id}-body`) return false;
      const obstacle = rayBoxDistance(pose.position, ray, volume);
      return obstacle !== undefined && obstacle < distance - 0.02;
    });
    return blocked ? [] : [{ target, distance }];
  });
  return candidates.sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id))[0]?.target;
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
  const markActivated = runtime.progress.markActivated || Math.hypot(pose.position.x - FLOOR_MARK.x, pose.position.z - FLOOR_MARK.z) <= 0.66;
  const progress = markActivated === runtime.progress.markActivated ? runtime.progress : { ...runtime.progress, markActivated };
  const elapsed = Number.isFinite(dt) ? clamp(dt, 0, MAX_FRAME_DELTA) : 0;
  let next: ChapterRuntime = { ...runtime, pose, progress,
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
  const target = findInteraction(getWorld(runtime), runtime.pose, runtime.progress);
  if (target?.id !== expectedId) return runtime;
  const progress = runtime.progress;
  switch (expectedId) {
    case 'guide':
      return progress.guideExamined ? runtime : { ...runtime, progress: { ...progress, guideExamined: true } };
    case 'floor-device':
      return progress[FLOOR_PUZZLE.success.seal] || !prerequisitesMet(FLOOR_PUZZLE, progress) ? runtime : { ...runtime, progress: { ...progress, [FLOOR_PUZZLE.success.seal]: true, hintStage: 0 } };
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
export function pauseRuntime(runtime: ChapterRuntime): ChapterRuntime { return runtime.paused ? runtime : { ...runtime, paused: true }; }
export function resumeRuntime(runtime: ChapterRuntime): ChapterRuntime { return runtime.paused ? { ...runtime, paused: false } : runtime; }
export function setHintStage(runtime: ChapterRuntime, stage: HintStage): ChapterRuntime { return { ...runtime, progress: { ...runtime.progress, hintStage: stage } }; }

export function hintForRuntime(runtime: ChapterRuntime): { text: string; target?: Vec3 } {
  const { progress } = runtime;
  const stage = Math.max(1, progress.hintStage) - 1;
  if (!progress.guideExamined) return { text: ['入口の先の、小さな光に注目しよう。', FLOOR_PUZZLE.clues[0]!, '光のしるべに近づき、照準を合わせて「調べる」。'][stage]!, target: { x: 0, y: 1.05, z: -0.7 } };
  if (!progress.markActivated) return { text: ['色の床の上にある、中立色の輪を探そう。', FLOOR_PUZZLE.clues[1]!, '自分で前へ歩き、床の中央の輪に入ろう。'][stage]!, target: { ...FLOOR_MARK, y: 0.05 } };
  if (!progress.sealA) return { text: FLOOR_PUZZLE.hints[stage]!, target: { x: 1.6, y: 1.3, z: -7.4 } };
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
  if (p.markActivated && p.guideExamined) return '輪の先の装置を調べよう。';
  return p.guideExamined ? FLOOR_PUZZLE.clues[0]! : '入口の光のしるべを調べよう。';
}
/** An explicit, local aim aid. It never moves the player or solves a puzzle. */
export function assistAim(runtime: ChapterRuntime): ChapterRuntime {
  if (runtime.paused || runtime.progress.hintStage < 3 || runtime.progress.cleared) return runtime;
  const world = getWorld(runtime);
  let target: Vec3;
  if (runtime.progress.sealA && !runtime.progress.sealB) {
    if (Math.hypot(runtime.pose.position.x - OBSERVATION_POSE.position.x, runtime.pose.position.z - OBSERVATION_POSE.position.z) > 0.55) return runtime;
    target = world.keyFrame.center;
  } else {
    const hint = hintForRuntime(runtime);
    if (!hint.target || Math.hypot(hint.target.x - runtime.pose.position.x, hint.target.z - runtime.pose.position.z) > 2.4) return runtime;
    target = hint.target;
  }
  if (segmentOccluded(runtime.pose.position, target, world, 'floor-device-body')) return runtime;
  const dx = target.x - runtime.pose.position.x;
  const dz = target.z - runtime.pose.position.z;
  const pose = { ...runtime.pose, yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(target.y - runtime.pose.position.y, Math.hypot(dx, dz)), -1.1, 1.1) };
  return { ...runtime, pose, progress: { ...runtime.progress, usedLookAssist: true } };
}
