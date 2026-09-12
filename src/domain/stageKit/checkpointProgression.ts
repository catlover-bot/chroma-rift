import type { CheckpointState } from '../firstPerson/types';
import { stageModule } from './modules';

export function galleryDoesNotRewind(previous: CheckpointState | undefined, next: CheckpointState): boolean {
  const old = previous?.progress.gallery, fresh = next.progress.gallery;
  if (!fresh) return false;
  if (!old || !previous) return true;
  // The revised chapter owns power and exit progress. Old A/D flags are not
  // prerequisites, even inside the writer's monotonicity checks.
  return (!previous.progress.exitDoorOpen || next.progress.exitDoorOpen) && (!previous.progress.cleared || next.progress.cleared) &&
    old.seed === fresh.seed && old.shadow.seed === fresh.shadow.seed && old.shadow.variant === fresh.shadow.variant &&
    old.contour.seed === fresh.contour.seed && (!old.shadow.inspected || fresh.shadow.inspected) &&
    (!old.contour.inspected || fresh.contour.inspected) && (!old.shadow.solved || fresh.shadow.solved) &&
    (!old.contour.solved || fresh.contour.solved) && old.shadow.attempts <= fresh.shadow.attempts &&
    old.contour.attempts <= fresh.contour.attempts && old.order.length <= fresh.order.length &&
    old.order.every((puzzle, index) => fresh.order[index] === puzzle) &&
    (!old.emergencyLit || fresh.emergencyLit) && (!old.exitInspected || fresh.exitInspected) &&
    (!old.powerTaken.shadow || fresh.powerTaken.shadow) && (!old.powerTaken.contour || fresh.powerTaken.contour) &&
    (!old.powerConnected || fresh.powerConnected) && old.completedFromV1 === fresh.completedFromV1 &&
    old.completedFromV2 === fresh.completedFromV2 && (!old.finalDoorClosed || fresh.finalDoorClosed) &&
    (!old.wiring.inspected || fresh.wiring.inspected) &&
    (!old.wiring.solved || fresh.wiring.solved) && old.wiring.compatibleBypass === fresh.wiring.compatibleBypass &&
    old.wiring.attempts <= fresh.wiring.attempts &&
    (Object.keys(old.discoveries) as (keyof typeof old.discoveries)[]).every(key => !old.discoveries[key] || fresh.discoveries[key]) &&
    (['foreshadowed', 'absence', 'serviceWarned', 'resolved', 'crossingStarted', 'crossingPresented'] as const).every(key => !old.story[key] || fresh.story[key]);
}

export function vaultDoesNotRewind(previous: CheckpointState | undefined, next: CheckpointState): boolean {
  const old = previous?.progress.vault, fresh = next.progress.vault;
  if (!fresh) return false;
  if (!old || !previous) return true;
  return old.seed === fresh.seed && old.specVersion === fresh.specVersion &&
    (!old.length.solved || fresh.length.solved && old.length.length === fresh.length.length) &&
    (!old.rod.solved || fresh.rod.solved && old.rod.angle === fresh.rod.angle) &&
    old.length.attempts <= fresh.length.attempts && old.rod.attempts <= fresh.rod.attempts &&
    (!old.finalDoorClosed || fresh.finalDoorClosed) && (!previous.progress.cleared || next.progress.cleared) &&
    (Object.keys(old.discoveries) as (keyof typeof old.discoveries)[]).every(key => !old.discoveries[key] || fresh.discoveries[key]) &&
    (Object.keys(old.story) as (keyof typeof old.story)[]).every(key => !old.story[key] || fresh.story[key]);
}
export function theatreDoesNotRewind(previous: CheckpointState | undefined, next: CheckpointState): boolean {
  const old = previous?.progress.theatre, fresh = next.progress.theatre;
  if (!fresh) return false;
  if (!old || !previous) return true;
  return old.seed === fresh.seed && old.specVersion === fresh.specVersion &&
    (!old.light.accepted || fresh.light.accepted && old.light.rail === fresh.light.rail) && old.light.attempts <= fresh.light.attempts &&
    (!old.inspectionShutterOpen || fresh.inspectionShutterOpen) && (!old.bypassOpen || fresh.bypassOpen) &&
    (!old.curtainAccepted || fresh.curtainAccepted) && (!old.passageSealed || fresh.passageSealed) && (!old.completed || fresh.completed) &&
    (Object.keys(old.discoveries) as (keyof typeof old.discoveries)[]).every(key => !old.discoveries[key] || fresh.discoveries[key]) &&
    (Object.keys(old.story) as (keyof typeof old.story)[]).every(key => !old.story[key] || fresh.story[key]);
}
export function campaignCheckpointProgresses(previous: CheckpointState, next: CheckpointState): boolean {
  if (previous.chapterId !== next.chapterId) return false;
  if (next.chapterId === 'perception-gallery-v1') return galleryDoesNotRewind(previous, next);
  if (next.chapterId === 'uncanny-vault-v1') return vaultDoesNotRewind(previous, next);
  if (next.chapterId === 'shadow-theatre-v1') return theatreDoesNotRewind(previous, next);
  return stageModule(next.chapterId)?.canReplaceCheckpoint?.(previous, next) ?? false;
}
