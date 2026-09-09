import { checkpointSeal, EMBLEM_SEED, parseSealCheckpoint, startSealSession, type SealCheckpoint } from '../emblem/puzzle';
import type { ChapterRuntime, PlayerPose, PuzzleState } from './types';

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
/** One session counter serves both chapter dispatch and direct stage factories.
 * Constructors call this initializer once; it never selects another chapter. */
export function createBaseRuntime(chapterId: string, pose: PlayerPose, sourceProgress: PuzzleState = initialProgress(), session = ++runtimeSession, syncEmblemHint = true): ChapterRuntime {
  runtimeSession = Math.max(runtimeSession, session);
  const savedEmblem = emblemCheckpointForProgress(sourceProgress);
  const progress = { ...sourceProgress, emblem: savedEmblem };
  if (syncEmblemHint && !progress.sealA) progress.hintStage = savedEmblem.hintTier;
  const emblem = startSealSession(savedEmblem.seed, String(session), savedEmblem);
  return { chapterId, pose: { ...pose, position: { ...pose.position } }, progress, emblem, session,
    paused: false, alignment: false, doorAOpen: progress.sealA ? 1 : 0, doorBOpen: progress.sealB ? 1 : 0, doorExitOpen: progress.exitDoorOpen ? 1 : 0 };
}
