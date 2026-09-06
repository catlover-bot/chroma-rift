import { evaluateInteraction, type InteractionEvaluation } from './interaction';
import type { CameraMatrices, PlayerPose, PuzzleState, WorldGeometry } from './types';

export type InteractionCue = InteractionEvaluation;

/** Backwards-compatible cue entry point, backed by the authoritative evaluator. */
export function interactionCue(world: WorldGeometry, pose: PlayerPose, matrices?: CameraMatrices, progress?: PuzzleState, previouslyAligned = false): InteractionCue {
  return evaluateInteraction(world, pose, progress, matrices, previouslyAligned);
}
