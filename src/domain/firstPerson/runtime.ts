import { createBaseRuntime, initialProgress } from './baseRuntime';
import { stageModule, STAGE_MODULES } from '../stageKit/modules';
import { cancelTheatreManipulation } from '../theatre/state';
import { THEATRE_BELLS, THEATRE_SHUTTER } from '../theatre/environment';
import type { TheatreAction } from '../theatre/types';
import { cancelVaultManipulation } from '../vault/state';
import { applyGalleryCommand, cancelGalleryManipulation } from '../gallery/state';
import { galleryPowerCount } from '../gallery/selectors';
import type { GalleryAction } from '../gallery/types';
import { checkpointSeal, reduceSeal, sealHint, type SealResult } from '../emblem/puzzle';
import type { Glyph } from '../emblem/stimulus';
import { EMBLEM_FIXTURE, EMBLEM_SWITCH_FEEDBACK_SECONDS } from './emblemFixture';
import { evaluateKeyAlignment } from './alignment';
import { getWorld } from './chapter';
import { CHANGED_REGION, CHAPTER, KEY_PUZZLE, OBSERVATION_POSE } from './legacyDefinition';
import { EYE_HEIGHT, PLAYER_RADIUS } from './constants';
import { occlusionCertificate } from './occlusion';
import { clamp, isSafePose, MAX_FRAME_DELTA, segmentOccluded, updatePlayer } from './geometry';
import { evaluateInteraction } from './interaction';
import type { CameraMatrices, ChapterRuntime, CheckpointState, HintStage, InteractableDefinition, InteractableId, MovementInput, PlayerPose, PuzzleDefinition, PuzzleState, Vec3, WorldGeometry } from './types';

export { occlusionCertificate } from './occlusion';

export { initialProgress, emblemCheckpointForProgress } from './baseRuntime';
export function createInitialRuntime(checkpoint?: CheckpointState, session?: number, chapterId = CHAPTER.id): ChapterRuntime {
  const selectedChapter = checkpoint?.chapterId ?? chapterId;
  const module = stageModule(selectedChapter);
  if (module) return module.create(checkpoint, session);
  if (selectedChapter !== CHAPTER.id) throw new RangeError(`Unknown stage: ${selectedChapter}`);
  const progress = checkpoint ? { ...checkpoint.progress } : initialProgress();
  delete progress.gallery;
  return createBaseRuntime(selectedChapter, checkpoint?.pose ?? CHAPTER.spawn, progress, session);
}
/** A reducer result and the existing door gate commit together in one runtime
 * value. Rejected/replayed results never produce another host transition. */
export function commitEmblemResult(runtime: ChapterRuntime, result: SealResult): ChapterRuntime {
  if (runtime.progress.gallery || runtime.progress.vault || runtime.progress.theatre) return runtime;
  if (!result.accepted || result.state.sessionId !== runtime.emblem.sessionId || result.state.seed !== runtime.emblem.seed || result.state.lastSeq <= runtime.emblem.lastSeq) return runtime;
  const emblem = runtime.progress.sealA && result.state.phase !== 'released' ? { ...result.state, phase: 'released' as const } : result.state;
  return { ...runtime, emblem, progress: { ...runtime.progress, emblem: checkpointSeal(emblem), sealA: runtime.progress.sealA || emblem.phase === 'released', hintStage: runtime.progress.sealA ? runtime.progress.hintStage : emblem.phase === 'released' ? 0 : emblem.hintTier } };
}
export function findInteraction(world: WorldGeometry, pose: PlayerPose, progress?: PuzzleState): InteractableDefinition | undefined {
  const candidate = evaluateInteraction(world, pose, progress);
  return candidate.kind === 'ready' || candidate.kind === 'locked' ? candidate.target : undefined;
}

export function canApplyReturnVariant(runtime: ChapterRuntime): boolean {
  if (runtime.progress.gallery || runtime.progress.vault || runtime.progress.theatre) return false;
  if (!runtime.progress.sealA || !runtime.progress.sealB || runtime.progress.variant === 'exit') return false;
  const { position } = runtime.pose;
  const changed = CHANGED_REGION;
  if (position.x >= changed.min.x - PLAYER_RADIUS && position.x <= changed.max.x + PLAYER_RADIUS && position.z >= changed.min.z - PLAYER_RADIUS && position.z <= changed.max.z + PLAYER_RADIUS) return false;
  const world = getWorld(runtime);
  if (!isSafePose(runtime.pose, world) || !occlusionCertificate(runtime.pose, changed, world.solids)) return false;
  const variant = { ...runtime, progress: { ...runtime.progress, variant: 'exit' as const } };
  return isSafePose(runtime.pose, getWorld(variant));
}
export function evaluateRuntime(runtime: ChapterRuntime, nextPose: PlayerPose, dt: number, matrices?: CameraMatrices): ChapterRuntime {
  if (runtime.paused || runtime.progress.cleared) return runtime;
  const world = getWorld(runtime);
  const pose = (runtime.gallery && runtime.gallery.mode !== 'explore' || runtime.vault && runtime.vault.mode !== 'explore' || runtime.theatre && (runtime.theatre.mode !== 'explore' || runtime.theatre.projectorArmed)) ? runtime.pose : isSafePose(nextPose, world) ? nextPose : runtime.pose;
  const progress = runtime.progress;
  const elapsed = Number.isFinite(dt) ? clamp(dt, 0, MAX_FRAME_DELTA) : 0;
  const remaining = runtime.switchFeedback ? Math.max(0, runtime.switchFeedback.remainingSeconds - elapsed) : 0;
  let next: ChapterRuntime = { ...runtime, pose, progress,
    switchFeedback: runtime.switchFeedback && remaining > 0 ? { ...runtime.switchFeedback, remainingSeconds: remaining } : undefined,
    doorAOpen: runtime.progress.sealA ? Math.min(1, runtime.doorAOpen + elapsed / 1.25) : 0,
    doorBOpen: runtime.progress.sealB ? Math.min(1, runtime.doorBOpen + elapsed / 1.25) : 0,
    doorExitOpen: runtime.progress.gallery ? runtime.progress.gallery.finalDoorClosed ? 0 : 1 : runtime.progress.exitDoorOpen ? Math.min(1, runtime.doorExitOpen + elapsed / 1.25) : 0,
  };
  const module = stageModule(runtime.chapterId);
  if (module) return { ...module.advance(next, elapsed), alignment: false };
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
  const stageInteraction=stageModule(runtime.chapterId)?.interact;
  if(stageInteraction)return stageInteraction(runtime,expectedId);
  const progress = runtime.progress;
  if (progress.gallery && runtime.gallery && matrices) {
    const action: GalleryAction | undefined = expectedId === 'gallery-light' ? { type: 'light-on' } :
      expectedId === 'gallery-exit-panel' ? { type: galleryPowerCount(progress.gallery) === 2 ? 'connect-power' : 'inspect-exit' } :
      expectedId === 'chromatic-exhibit' ? { type: 'chromatic-compare' } :
      expectedId === 'shadow-power' || expectedId === 'contour-power' ? { type: 'take-power', puzzle: expectedId === 'shadow-power' ? 'shadow' : 'contour' } :
      expectedId === 'mask-exhibit' ? { type: 'mask-inspect' } : expectedId === 'mask-window' ? { type: 'mask-window' } : expectedId === 'hybrid-exhibit' ? { type: 'hybrid-inspect' } :
      expectedId === 'exit' ? { type: 'close-exit' } : undefined;
    if (action) return applyGalleryCommand(runtime, { sessionId: runtime.gallery.sessionId, seq: runtime.gallery.lastSeq + 1, nowMs: runtime.gallery.lastNowMs + 1001, action }, { rendererReady: true, foreground: true, targetId: expectedId }).runtime;
  }
  switch (expectedId) {
    case 'theatre-light': case 'theatre-inspection': case 'theatre-ames-side': case 'theatre-bypass': case 'theatre-projector': case 'theatre-curtain': {
      if (!runtime.theatre || !matrices) return runtime;
      const type: TheatreAction['type'] = expectedId === 'theatre-light' ? 'enter-light' : expectedId === 'theatre-inspection' ? 'open-inspection' : expectedId === 'theatre-ames-side' ? 'inspect-depth' : expectedId === 'theatre-bypass' ? 'open-bypass' : expectedId === 'theatre-projector' ? 'enter-projector' : 'lower-curtain';
      const action = { type } as TheatreAction;
      return STAGE_MODULES['shadow-theatre-v1'].command(runtime, {sessionId:runtime.theatre.sessionId,seq:runtime.theatre.lastSeq+1,nowMs:runtime.theatre.lastNowMs+1,action}, {rendererReady:true,foreground:true,targetId:expectedId}).runtime;
    }
    case 'theatre-bell-a': case 'theatre-bell-b': case 'theatre-shutter-south': case 'theatre-shutter-north': {
      if(!runtime.theatre||!matrices)return runtime;
      const bell=THEATRE_BELLS.find(item=>item.instanceId===expectedId);
      const action: TheatreAction={type:'activate-instance',instanceId:bell?.instanceId??THEATRE_SHUTTER.instanceId};
      return STAGE_MODULES['shadow-theatre-v1'].command(runtime,{sessionId:runtime.theatre.sessionId,seq:runtime.theatre.lastSeq+1,nowMs:runtime.theatre.lastNowMs+1,action},
        {rendererReady:true,foreground:true,targetId:expectedId}).runtime;
    }
    case 'vault-length': case 'vault-rod': case 'vault-cafe': case 'vault-partition': case 'vault-exit': {
      if (!runtime.vault || !matrices) return runtime;
      const action = expectedId === 'vault-length' || expectedId === 'vault-rod'
        ? { type: 'enter' as const, puzzle: expectedId === 'vault-length' ? 'length' as const : 'rod' as const }
        : { type: expectedId === 'vault-cafe' ? 'cafe-inspect' as const : expectedId === 'vault-partition' ? 'close-partition' as const : 'close-exit' as const };
      return STAGE_MODULES['uncanny-vault-v1'].command(runtime, { sessionId: runtime.vault.sessionId, seq: runtime.vault.lastSeq + 1, nowMs: runtime.vault.lastNowMs + 1, action },
        { rendererReady: true, foreground: true, targetId: expectedId }).runtime;
    }
    case 'shadow-panel':
    case 'contour-panel':
    case 'wiring-panel': {
      if (!runtime.gallery || !matrices) return runtime;
      return applyGalleryCommand(runtime, { sessionId: runtime.gallery.sessionId, seq: runtime.gallery.lastSeq + 1, nowMs: runtime.gallery.lastNowMs + 1, action: { type: 'enter', puzzle: expectedId === 'shadow-panel' ? 'shadow' : expectedId === 'contour-panel' ? 'contour' : 'wiring' } }, { rendererReady: true, foreground: true, targetId: expectedId }).runtime;
    }
    case 'mask-exhibit': case 'mask-window': case 'hybrid-exhibit':
    case 'gallery-light': case 'gallery-exit-panel': case 'chromatic-exhibit': case 'shadow-power': case 'contour-power':
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
      if (progress.gallery) return runtime;
      const actualAlignment = !!matrices && evaluateKeyAlignment(runtime.pose, getWorld(runtime), matrices, runtime.alignment).aligned;
      if (progress[KEY_PUZZLE.success.seal] || !prerequisitesMet(KEY_PUZZLE, progress, actualAlignment)) return runtime;
      const solved = { ...runtime, alignment: true, progress: { ...progress, [KEY_PUZZLE.success.seal]: true, hintStage: 0 as const } };
      return canApplyReturnVariant(solved) ? { ...solved, progress: { ...solved.progress, variant: 'exit' } } : solved;
    }
    case 'exit':
      return progress.exitDoorOpen || progress.variant !== 'exit' || !progress.sealA || !progress.sealB ? runtime : { ...runtime, progress: { ...progress, exitDoorOpen: true } };
  }
  return runtime;
}
export function pauseRuntime(runtime: ChapterRuntime): ChapterRuntime {
  const stopped = cancelTheatreManipulation(cancelVaultManipulation(cancelGalleryManipulation(runtime, true), true), true);
  const quieted=stopped.theatre?.environmentNoise?{...stopped,theatre:{...stopped.theatre,environmentNoise:undefined}}:stopped;
  return quieted.paused ? quieted : { ...quieted, paused: true, emblem: { ...quieted.emblem, paused: true } };
}
export function resumeRuntime(runtime: ChapterRuntime): ChapterRuntime { return runtime.paused ? { ...runtime, paused: false, emblem: { ...runtime.emblem, paused: false } } : runtime; }
export function setHintStage(runtime: ChapterRuntime, stage: HintStage): ChapterRuntime {
  if (runtime.progress.gallery || runtime.progress.vault || runtime.progress.theatre || runtime.progress.sealA) return { ...runtime, progress: { ...runtime.progress, hintStage: stage } };
  let next = runtime;
  while (next.emblem.hintTier < stage) {
    next = commitEmblemResult(next, reduceSeal(next.emblem, { sessionId: next.emblem.sessionId, seq: next.emblem.lastSeq + 1, nowMs: next.emblem.lastNowMs + 1, action: { type: 'hint' } }, { rendererReady: false, foreground: false, targetId: null }));
  }
  return next;
}

export function hintForRuntime(runtime: ChapterRuntime): { text: string; target?: Vec3 } {
  const { progress } = runtime;
  const module=stageModule(runtime.chapterId);
  if(module)return module.present(runtime).hint;
  const stage = Math.max(1, progress.hintStage) - 1;
  if (!progress.sealA) return { text: sealHint(runtime.emblem), target: EMBLEM_FIXTURE.center };
  if (!progress.sealB) return { text: KEY_PUZZLE.hints[stage]!, target: OBSERVATION_POSE.position };
  if (progress.variant !== 'exit') return { text: '鍵の部屋の観察の輪へ戻ろう。帰り道の準備が整います。', target: OBSERVATION_POSE.position };
  if (progress.exitDoorOpen) return { text: '開いた最後の扉を、自分の足で通り抜けよう。', target: { x: 0, y: EYE_HEIGHT, z: 15.5 } };
  return { text: ['覚えのある入口へ戻ってみよう。', '二つ目の扉から帰ると、回廊を短く戻れる。', '最初にいた小さな扉の向こうへ進み、奥の最後の扉を調べよう。'][stage]!, target: { x: 0, y: EYE_HEIGHT, z: 12 } };
}
export function objectiveForRuntime(runtime: ChapterRuntime): string {
  const p = runtime.progress;
  const module=stageModule(runtime.chapterId);
  if(module)return module.present(runtime).objective;
  if (p.cleared) return '帰り道のない入口から脱出した。';
  if (p.exitDoorOpen) return '開いた扉の外へ歩こう。';
  if (p.sealB) return '覚えのある入口へ戻ろう。';
  if (p.sealA) return KEY_PUZZLE.clues[0]!;
  return runtime.emblem.phase === 'unexamined' ? '壁の紋章を調べる' : '切れずにつながる輪郭を探す';
}
/** An explicit, local aim aid. It never moves the player or solves a puzzle. */
export function assistAim(runtime: ChapterRuntime): ChapterRuntime {
  if (runtime.progress.gallery || runtime.progress.vault || runtime.progress.theatre) return runtime;
  if (runtime.paused || runtime.progress.hintStage < 3 || runtime.progress.cleared) return runtime;
  if (!runtime.progress.sealA || runtime.progress.sealB) return runtime;
  const world = getWorld(runtime);
  const observation = world.keyObservationPose ?? OBSERVATION_POSE;
  if (Math.hypot(runtime.pose.position.x - observation.position.x, runtime.pose.position.z - observation.position.z) > 0.55) return runtime;
  const target = world.keyFrame.center;
  if (segmentOccluded(runtime.pose.position, target, world)) return runtime;
  const dx = target.x - runtime.pose.position.x;
  const dz = target.z - runtime.pose.position.z;
  const pose = { ...runtime.pose, yaw: Math.atan2(-dx, -dz), pitch: clamp(Math.atan2(target.y - runtime.pose.position.y, Math.hypot(dx, dz)), -1.1, 1.1) };
  return { ...runtime, pose, progress: { ...runtime.progress, usedLookAssist: true } };
}
