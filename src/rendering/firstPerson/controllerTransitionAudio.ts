import type { ChapterRuntime } from '../../domain/firstPerson/types';
import type { RuntimeController } from './controllerTypes';
import { worldForController } from './controllerContext';

/** Classify an accepted transition using the same current world.
 * Audio ownership remains on the caller's controller; no dispatcher import. */
export function soundForControllerTransition(controller: RuntimeController, previous: ChapterRuntime): void {
  const before = previous.progress, after = controller.runtime.progress;
  if (before.theatre && after.theatre) {
    const b = before.theatre, a = after.theatre;
    if (!b.curtainAccepted && a.curtainAccepted) { controller.audio?.beginEnding(); controller.pendingExitImpact = true; return; }
    const unlocked = !b.light.accepted && a.light.accepted;
    controller.audio?.event({ sessionId: String(controller.runtime.session), sequence: ++controller.audioSequence, type: unlocked ? 'unlock' : 'interaction',
      position: worldForController(controller).interactables.find(t => t.id === (unlocked ? 'theatre-light' : !b.bypassOpen && a.bypassOpen ? 'theatre-bypass' : 'theatre-inspection'))?.center ?? controller.runtime.pose.position });
    return;
  }
  if (before.vault && after.vault) {
    const b = before.vault, a = after.vault;
    if (!b.finalDoorClosed && a.finalDoorClosed) { controller.audio?.beginEnding(); controller.pendingExitImpact = true; return; }
    const released = !b.length.solved && a.length.solved || !b.rod.solved && a.rod.solved;
    const partition = previous.vault?.partitionClosed !== controller.runtime.vault?.partitionClosed;
    const id = partition ? 'vault-partition' : controller.runtime.vault?.mode === 'rod' ? 'vault-rod' : 'vault-length';
    controller.audio?.event({ sessionId: String(controller.runtime.session), sequence: ++controller.audioSequence, type: released ? 'unlock' : partition ? 'door' : 'interaction',
      position: worldForController(controller).interactables.find(t => t.id === id)?.center ?? controller.runtime.pose.position });
    return;
  }
  if (before.gallery && after.gallery) {
    const b = before.gallery, a = after.gallery;
    if (!b.finalDoorClosed && a.finalDoorClosed) { controller.audio?.beginEnding(); controller.pendingExitImpact = true; return; }
    const released = !b.wiring.solved && a.wiring.solved || !b.shadow.solved && a.shadow.solved || !b.contour.solved && a.contour.solved;
    const door = !b.powerConnected && a.powerConnected || !before.exitDoorOpen && after.exitDoorOpen;
    const sourceId = !b.wiring.solved && a.wiring.solved ? 'wiring-panel' : !b.emergencyLit && a.emergencyLit ? 'gallery-light' : !b.powerConnected && a.powerConnected ? 'gallery-exit-panel' :
      !before.exitDoorOpen && after.exitDoorOpen ? 'exit' : !b.powerTaken.shadow && a.powerTaken.shadow ? 'shadow-panel' :
      !b.powerTaken.contour && a.powerTaken.contour ? 'contour-panel' : controller.runtime.gallery?.mode === 'shadow' ? 'shadow-panel' : 'contour-panel';
    controller.audio?.event({ sessionId: String(controller.runtime.session), sequence: ++controller.audioSequence,
      type: released ? 'unlock' : door ? 'door' : 'interaction', position: worldForController(controller).interactables.find(t => t.id === sourceId)?.center ?? controller.runtime.pose.position });
    return;
  }
  const released = !before.sealA && after.sealA || !before.sealB && after.sealB ||
    !!after.gallery && !!before.gallery && (!before.gallery.shadow.solved && after.gallery.shadow.solved || !before.gallery.contour.solved && after.gallery.contour.solved);
  const sourceId = !before.sealA && after.sealA ? 'emblem-panel' : !before.sealB && after.sealB ? 'key' :
    !before.exitDoorOpen && after.exitDoorOpen ? 'exit' : controller.runtime.gallery?.mode === 'shadow' ? 'shadow-panel' :
    controller.runtime.gallery?.mode === 'contour' ? 'contour-panel' : !after.sealA ? 'emblem-panel' : 'key';
  const source = worldForController(controller).interactables.find(target => target.id === sourceId)?.center;
  controller.audio?.event({ sessionId: String(controller.runtime.session), sequence: ++controller.audioSequence,
    type: released ? 'unlock' : !before.exitDoorOpen && after.exitDoorOpen ? 'door' : 'interaction',
    position: source ?? controller.runtime.pose.position });
}
