import { applyGalleryCommand, createContourSpec, SAMPLE_IDS, SHADOW_HIT_SLOP, SHADOW_SAMPLE_SIZE, SHADOW_SLOT_POSITIONS, shadowSlotAt, type GalleryAction, type GalleryCommand, type GalleryPuzzle } from '../../domain/gallery';
import type { InteractableDefinition } from '../../domain/firstPerson/types';
import { evaluateInteraction } from '../../domain/firstPerson/interaction';
import { clearTouchInput } from './touchInput';
import { fixtureFullyVisible, pointOnFixture, type PanelPoint } from './manipulationProjection';
import { controllerCanInteract, soundForControllerTransition, worldForController, type RuntimeController } from './runtimeController';

export function galleryPanelTarget(controller: RuntimeController, puzzle: GalleryPuzzle): InteractableDefinition | undefined {
  const world = worldForController(controller), target = world.interactables.find(t => t.id === puzzle + '-panel');
  return target && fixtureFullyVisible(controller.runtime.pose, controller.matrices, world, target) ? target : undefined;
}
export function galleryCommand(controller: RuntimeController, action: GalleryAction, nowMs = performance.now()): GalleryCommand {
  return { sessionId: String(controller.runtime.session), seq: ++controller.commandSequence, nowMs, action };
}
export function dispatchGalleryController(controller: RuntimeController, command: GalleryCommand, accessible = false): boolean {
  if (controller.retired || command.sessionId !== String(controller.runtime.session) || !Number.isSafeInteger(command.seq) ||
    command.seq <= controller.lastReceivedSequence || !Number.isFinite(command.nowMs)) return false;
  controller.lastReceivedSequence = command.seq;
  controller.commandSequence = Math.max(command.seq, controller.commandSequence);
  const action = command.action, live = controller.runtime.gallery;
  if (!live) return false;
  const puzzle = action.type === 'enter' ? action.puzzle : action.type === 'compare' ? 'shadow' : action.type === 'guide' ? 'contour' : live.mode === 'explore' ? undefined : live.mode;
  let target = puzzle && galleryPanelTarget(controller, puzzle);
  if (action.type === 'enter' && !(accessible && controller.screenReader)) {
    const cue = evaluateInteraction(worldForController(controller), controller.runtime.pose, controller.runtime.progress, controller.matrices, controller.runtime.alignment);
    if (cue.kind !== 'ready' || cue.target.id !== target?.id) target = undefined;
  }
  const previous = controller.runtime;
  const result = applyGalleryCommand(previous, command, { rendererReady: controllerCanInteract(controller), foreground: controller.diagnostics.appActive !== false, targetId: target?.id ?? null });
  controller.runtime = result.runtime;
  controller.feedbackMessage = result.effects.filter(e => e.type === 'message').map(e => e.text).join(' ');
  if (result.effects.some(e => e.type === 'stop-input')) {
    clearTouchInput(controller.input); controller.simpleStep = 0; controller.pendingFootstepDistance = 0;
  }
  if (result.accepted && result.effects.some(e => e.type === 'gallery-released' || e.type === 'manipulated')) soundForControllerTransition(controller, previous);
  if (!result.accepted && action.type === 'enter') controller.feedbackMessage = '床の輪から、装置全体が見える位置で調べよう。';
  return result.accepted;
}
export function galleryAction(controller: RuntimeController, action: GalleryAction, accessible = false): boolean {
  return dispatchGalleryController(controller, galleryCommand(controller, action), accessible);
}
export function galleryPointer(controller: RuntimeController, phase: 'start' | 'move' | 'end' | 'cancel', pointerId: number, point: PanelPoint, width: number, height: number): boolean {
  const live = controller.runtime.gallery, saved = controller.runtime.progress.gallery;
  if (!live || !saved || live.mode === 'explore' || !Number.isSafeInteger(pointerId)) return false;
  const drag = live.activeDrag;
  if (phase !== 'start' && drag?.pointerId !== pointerId) return false;
  if (phase === 'cancel') return galleryAction(controller, { type: 'cancel' });
  if (!controllerCanInteract(controller)) return false;
  const target = galleryPanelTarget(controller, live.mode);
  const local = target && pointOnFixture(controller.runtime.pose, controller.matrices, worldForController(controller), target, point, width, height);
  if (phase === 'start') {
    if (drag || !local) return false;
    if (live.mode === 'shadow') {
      const sampleId = SAMPLE_IDS.find(id => {
        const p = SHADOW_SLOT_POSITIONS[saved.shadow.assignments[id]];
        return Math.abs(local.x - p.x) <= SHADOW_SAMPLE_SIZE / 2 + SHADOW_HIT_SLOP && Math.abs(local.y - p.y) <= SHADOW_SAMPLE_SIZE / 2 + SHADOW_HIT_SLOP;
      });
      return !!sampleId && galleryAction(controller, { type: 'shadow-start', sampleId, pointerId, point: local });
    }
    const disc = createContourSpec(saved.contour.seed).discs.find(d => Math.hypot(local.x - d.center.x, local.y - d.center.y) <= d.radius * 1.2);
    return !!disc && galleryAction(controller, { type: 'contour-start', discId: disc.id, pointerId, point: local });
  }
  if (!drag) return false;
  if (phase === 'move') {
    if (!local) return false; // retain ownership until release/cancel; reentry is continuous
    return galleryAction(controller, drag.kind === 'shadow' ? { type: 'shadow-move', pointerId, point: local } : { type: 'contour-move', pointerId, point: local });
  }
  if (!local) return galleryAction(controller, { type: 'cancel' });
  if (drag.kind === 'shadow') {
    galleryAction(controller, { type: 'shadow-move', pointerId, point: local });
    const final = controller.runtime.gallery?.activeDrag;
    return galleryAction(controller, { type: 'shadow-drop', pointerId, slotId: final?.kind === 'shadow' ? shadowSlotAt(final.point) : null });
  }
  // Include the final native event delta before committing the displayed angle.
  galleryAction(controller, { type: 'contour-move', pointerId, point: local });
  return galleryAction(controller, { type: 'contour-end', pointerId });
}
