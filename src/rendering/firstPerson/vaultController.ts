import { evaluateInteraction } from '../../domain/firstPerson/interaction';
import type { InteractableDefinition } from '../../domain/firstPerson/types';
import { applyVaultCommand, isVaultExitThreshold } from '../../domain/vault/state';
import type { VaultAction, VaultCommand, VaultDevice } from '../../domain/vault/types';
import { controllerCanInteract, soundForControllerTransition, worldForController, type RuntimeController } from './runtimeController';
import { fixtureFullyVisible, fixtureScreenBounds, pointOnFixture, type PanelPoint } from './manipulationProjection';
import { clearTouchInput, requireAllPointersReleased } from './touchInput';

export function vaultDeviceScreenBounds(controller: RuntimeController, puzzle?: VaultDevice) {
  const mode = puzzle ?? controller.runtime.vault?.mode, size = controller.viewport;
  if (!mode || mode === 'explore' || !size) return;
  const target = worldForController(controller).interactables.find(t => t.id === 'vault-' + mode);
  if (!target?.rectangle) return;
  return fixtureScreenBounds({ ...target, rectangle: { ...target.rectangle, width: target.rectangle.width + .16, height: target.rectangle.height + .16 } },
    controller.matrices, size.width, size.height);
}
export function vaultPanelTarget(controller: RuntimeController, puzzle: VaultDevice): InteractableDefinition | undefined {
  const world = worldForController(controller), target = world.interactables.find(t => t.id === 'vault-' + puzzle);
  if (!target || !fixtureFullyVisible(controller.runtime.pose, controller.matrices, world, target)) return;
  if (controller.viewport) {
    const b = vaultDeviceScreenBounds(controller, puzzle), s = controller.viewport;
    if (!b || b.left < 10 || b.right > s.width - 10 || b.top < 70 || b.bottom > s.height - 90) return;
  }
  return target;
}
export function canCloseVaultExitController(controller: RuntimeController): boolean {
  const runtime = controller.runtime;
  if (!runtime.vault || runtime.vault.mode !== 'explore' || !runtime.progress.vault?.rod.solved ||
    !isVaultExitThreshold(runtime.pose) || !controllerCanInteract(controller)) return false;
  const world = worldForController(controller);
  return evaluateInteraction({ ...world, interactables: world.interactables.filter(t => t.id === 'vault-exit') }, runtime.pose, runtime.progress, controller.matrices).kind === 'ready';
}
export function dispatchVaultController(controller: RuntimeController, command: VaultCommand, accessible = false): boolean {
  const live = controller.runtime.vault;
  if (!live || controller.retired || command.sessionId !== live.sessionId || !Number.isSafeInteger(command.seq) || command.seq <= controller.lastReceivedSequence) return false;
  controller.lastReceivedSequence = command.seq; controller.commandSequence = Math.max(command.seq, controller.commandSequence);
  const a = command.action, previous = controller.runtime;
  const world = worldForController(controller);
  const cue = evaluateInteraction(world, previous.pose, previous.progress, controller.matrices);
  let target = cue.kind === 'ready' ? cue.target : undefined;
  if (a.type === 'enter') {
    const panel = vaultPanelTarget(controller, a.puzzle);
    target = panel && (accessible && controller.screenReader || cue.kind === 'ready' && cue.target.id === panel.id) ? panel : undefined;
  }
  if (a.type === 'close-exit' && !canCloseVaultExitController(controller)) target = undefined;
  const result = applyVaultCommand(previous, command, { rendererReady: controllerCanInteract(controller), foreground: controller.diagnostics.appActive !== false, targetId: target?.id ?? null });
  controller.runtime = result.runtime; controller.feedbackMessage = result.message;
  if (result.stopInput) {
    requireAllPointersReleased(controller.input);
    if (live.activeDrag && !controller.input.releaseBarrier.includes(live.activeDrag.pointerId)) controller.input.releaseBarrier.push(live.activeDrag.pointerId);
    clearTouchInput(controller.input); controller.simpleStep = 0;
    controller.pendingFootstepDistance = controller.pendingActorFootstepDistance = 0;
    controller.pendingActorPlants = []; controller.pendingActorEvents = [];
    controller.audio?.stopMovement();
  }
  if (result.accepted && ['commit', 'drag-end', 'adjust', 'close-exit', 'close-partition'].includes(a.type)) soundForControllerTransition(controller, previous);
  if (!result.accepted && a.type === 'enter') controller.feedbackMessage = '装置全体と取っ手が見える床の目印へ。視点は自分で動かせます。';
  return result.accepted;
}
export function vaultAction(controller: RuntimeController, action: VaultAction, accessible = false): boolean {
  return dispatchVaultController(controller, { sessionId: String(controller.runtime.session), seq: ++controller.commandSequence,
    nowMs: Math.max(controller.runtime.vault?.lastNowMs ?? 0, performance.now()), action }, accessible);
}
/** Existing ray/plate projection and exclusive pointer ownership; release
 * consumes its final position before the committed value is exposed. */
export function vaultPointer(controller: RuntimeController, phase: 'start' | 'move' | 'end' | 'cancel', pointerId: number, point: PanelPoint, width: number, height: number): boolean {
  const live = controller.runtime.vault;
  if (!live || live.mode === 'explore' || !Number.isSafeInteger(pointerId)) return false;
  if (controller.input.releaseBarrier.length) {
    if (phase === 'start' && !controller.input.releaseBarrier.includes(pointerId)) controller.input.releaseBarrier.push(pointerId);
    return false;
  }
  if (phase !== 'start' && live.activeDrag?.pointerId !== pointerId) return false;
  if (phase === 'cancel') return vaultAction(controller, { type: 'cancel' });
  if (!controllerCanInteract(controller)) return false;
  const target = vaultPanelTarget(controller, live.mode), world = worldForController(controller);
  const local = target && pointOnFixture(controller.runtime.pose, controller.matrices, world, target, point, width, height);
  if (phase === 'start') return !live.activeDrag && !!local && vaultAction(controller, { type: 'drag-start', pointerId, point: local });
  if (phase === 'move') return !!local && vaultAction(controller, { type: 'drag-move', pointerId, point: local });
  if (local) vaultAction(controller, { type: 'drag-move', pointerId, point: local });
  return vaultAction(controller, { type: 'drag-end', pointerId, inside: !!local });
}
