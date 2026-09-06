import { applyGalleryCommand, resumeGalleryActor, createContourSpec, SAMPLE_IDS, SHADOW_HIT_SLOP, SHADOW_SAMPLE_SIZE, SHADOW_SLOT_POSITIONS, shadowSlotAt, type GalleryAction, type GalleryCommand, type GalleryPuzzle } from '../../domain/gallery';
import type { InteractableDefinition } from '../../domain/firstPerson/types';
import { projectWithCamera } from '../../domain/firstPerson/alignment';
import { evaluateInteraction } from '../../domain/firstPerson/interaction';
import { clearTouchInput } from './touchInput';
import { fixtureFullyVisible, fixtureScreenBounds, pointOnFixture, type PanelPoint } from './manipulationProjection';
import { controllerCanInteract, soundForControllerTransition, worldForController, type RuntimeController } from './runtimeController';

export function galleryPanelTarget(controller: RuntimeController, puzzle: GalleryPuzzle): InteractableDefinition | undefined {
  const world = worldForController(controller), target = world.interactables.find(t => t.id === puzzle + '-panel');
  if (!target || !fixtureFullyVisible(controller.runtime.pose, controller.matrices, world, target)) return;
  const viewport = controller.viewport ?? (typeof controller.diagnostics.rnLayout === 'object' ? controller.diagnostics.rnLayout : undefined);
  if (viewport) {
    const bounds = deviceBounds(controller, target, viewport);
    if (!bounds || bounds.top < 64 || bounds.bottom > viewport.height - 72) return;
  }
  return target;
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
  const puzzle = (action.type === 'enter' || action.type === 'take-power') ? action.puzzle : action.type === 'compare' ? 'shadow' : action.type === 'guide' ? 'contour' : live.mode === 'explore' ? undefined : live.mode;
  let target = puzzle && galleryPanelTarget(controller, puzzle);
  if (action.type === 'enter' && !(accessible && controller.screenReader)) {
    const cue = evaluateInteraction(worldForController(controller), controller.runtime.pose, controller.runtime.progress, controller.matrices, controller.runtime.alignment);
    if (cue.kind !== 'ready' || cue.target.id !== target?.id) target = undefined;
  }
  if (['light-on', 'inspect-exit', 'connect-power', 'open-exit', 'chromatic-compare'].includes(action.type) || action.type === 'take-power' && live.mode === 'explore') {
    const cue = evaluateInteraction(worldForController(controller), controller.runtime.pose, controller.runtime.progress, controller.matrices, controller.runtime.alignment);
    target = cue.kind === 'ready' ? cue.target : undefined;
  }
  const previous = controller.runtime;
  const result = applyGalleryCommand(previous, command, { rendererReady: controllerCanInteract(controller), foreground: controller.diagnostics.appActive !== false, targetId: target?.id ?? null });
  controller.runtime = result.accepted && action.type === 'leave' ? resumeGalleryActor(result.runtime) : result.runtime;
  controller.feedbackMessage = result.effects.filter(e => e.type === 'message').map(e => e.text).join(' ');
  if (result.effects.some(e => e.type === 'stop-input')) {
    controller.audio?.stopMovement();
    controller.pendingActorFootstepDistance = 0; controller.pendingActorEvents = [];
    clearTouchInput(controller.input); controller.simpleStep = 0; controller.pendingFootstepDistance = 0;
  }
  if (result.accepted && result.effects.some(e => e.type === 'gallery-released' || e.type === 'manipulated' || e.type === 'light-on' || e.type === 'power-taken' || e.type === 'power-connected' || e.type === 'exit-opened')) soundForControllerTransition(controller, previous);
  if (!result.accepted && action.type === 'enter') {
    const panel = worldForController(controller).interactables.find(t => t.id === action.puzzle + '-panel');
    const eye = controller.runtime.pose.position;
    const far = panel && Math.hypot(panel.center.x - eye.x, panel.center.y - eye.y, panel.center.z - eye.z) > panel.maxDistance;
    controller.feedbackMessage = far ? '少し近づくと、装置を操作できます。' : '板全体が見える位置へ。床の輪が目印です。';
  }
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

export function galleryDeviceScreenBounds(controller: RuntimeController) {
  const mode = controller.runtime.gallery?.mode, viewport = controller.viewport;
  if (!mode || mode === 'explore' || !viewport) return;
  const target = worldForController(controller).interactables.find(t => t.id === mode + '-panel');
  return target && deviceBounds(controller, target, viewport);
}


/** Reserve the projected full-open drawer and its power as well as the plate.
 * This is a HUD exclusion envelope, never an expanded interaction hit plane. */
function deviceBounds(controller: RuntimeController, target: InteractableDefinition, viewport: { width: number; height: number }) {
  const panel = fixtureScreenBounds(target, controller.matrices, viewport.width, viewport.height);
  if (!panel || !controller.matrices) return;
  const points = [-.45, .45].flatMap(x => [.56, .97].flatMap(y => [-.03, .49].map(z =>
    projectWithCamera({ x: target.center.x + x, y, z: target.center.z + z }, controller.matrices!))));
  if (points.some(point => !point)) return;
  return {
    left: Math.min(panel.left, ...points.map(point => (point!.x + 1) * viewport.width / 2)),
    right: Math.max(panel.right, ...points.map(point => (point!.x + 1) * viewport.width / 2)),
    top: Math.min(panel.top, ...points.map(point => (1 - point!.y) * viewport.height / 2)),
    bottom: Math.max(panel.bottom, ...points.map(point => (1 - point!.y) * viewport.height / 2)),
  };
}
