import * as THREE from 'three';
import { cancelGalleryManipulation } from '../../domain/gallery';
import { galleryAction } from './galleryController';
import type { createGalleryAudio } from '../../audio';

import { reduceSeal, type SealAction, type SealCommand, type SealResult } from '../../domain/emblem';

import { EMBLEM_SWITCH_FEEDBACK_SECONDS } from '../../domain/firstPerson/emblemFixture';
import { CAMERA_FAR, CAMERA_NEAR, getWorld, VERTICAL_FOV } from '../../domain/firstPerson/chapter';
import { cameraMatchesPose, projectWithCamera } from '../../domain/firstPerson/alignment';
import { adjustLook, segmentOccluded, updatePlayer } from '../../domain/firstPerson/geometry';
import { assistAim, commitEmblemResult, createInitialRuntime, evaluateRuntime, interact, objectiveForRuntime, pauseRuntime, resumeRuntime, setHintStage } from '../../domain/firstPerson/runtime';
import { createTutorial, recordTutorialGuide, recordTutorialMotion, type TutorialMilestones, type TutorialTracker } from '../../domain/firstPerson/tutorial';
import { evaluateInteraction } from '../../domain/firstPerson/interaction';
import { interactionCue } from '../../domain/firstPerson/interactionCue';
import type { CameraMatrices, ChapterRuntime, CheckpointState, HintStage, InteractableDefinition, InteractableId } from '../../domain/firstPerson/types';
import { getLabWorld } from './labRuntime';
import { clearTouchInput, consumeLook, createTouchInput, type FirstPersonInput } from './touchInput';
import { createFirstPersonDiagnostics, type FirstPersonDiagnostics } from './diagnostics';

export type RuntimeController = {
  runtime: ChapterRuntime;
  audio?: ReturnType<typeof createGalleryAudio>;
  audioSequence: number;
  pendingFootstepDistance: number;
  retired: boolean;
  screenReader: boolean;
  commandSequence: number;
  lastReceivedSequence: number;
  feedbackMessage: string;
  lastCompareMs: number;
  input: FirstPersonInput;
  lab: boolean;
  sensitivity: number;
  verticalSensitivity: number;
  tutorial: TutorialTracker;
  simpleStep: number;
  viewCommandRevision: number;
  matrices: CameraMatrices | undefined;
  diagnostics: FirstPersonDiagnostics;
  metrics: { frames: number; elapsed: number; drawCalls: number; geometries: number; textures: number };
};
export type RuntimeSnapshot = { runtime: ChapterRuntime; tutorial: TutorialMilestones; target: InteractableDefinition | undefined; cue: ReturnType<typeof interactionCue>; objective: string; direction: string; key: string };
export function createController(checkpoint?: CheckpointState, lab = false, tutorialCompleted = false, chapterId?: string): RuntimeController {
  const runtime = createInitialRuntime(lab ? undefined : checkpoint, undefined, chapterId);
  if (lab) runtime.pose = { position: { x: 0, y: 1.6, z: 2.6 }, yaw: 0, pitch: 0 };
  return { runtime, audioSequence: 0, pendingFootstepDistance: 0, retired: false, screenReader: false, commandSequence: 0, lastReceivedSequence: -1, feedbackMessage: '', lastCompareMs: -Infinity, input: createTouchInput(), lab, sensitivity: 1, verticalSensitivity: 1, tutorial: createTutorial(runtime.pose, tutorialCompleted || lab, runtime.progress.guideExamined), simpleStep: 0, viewCommandRevision: 0, matrices: undefined, diagnostics: createFirstPersonDiagnostics(lab ? 'lab' : 'chapter'), metrics: { frames: 0, elapsed: 0, drawCalls: 0, geometries: 0, textures: 0 } };
}
export function recordFrameStats(controller: RuntimeController, delta: number, info: THREE.WebGLInfo): void {
  if (controller.runtime.paused || delta <= 0 || delta > 0.5 || !Number.isFinite(delta)) return;
  controller.metrics.frames += 1;
  controller.metrics.elapsed += delta;
  controller.metrics.drawCalls = info.render.calls;
  controller.metrics.geometries = info.memory.geometries;
  controller.metrics.textures = info.memory.textures;
}
export function worldForController(controller: RuntimeController) {
  return controller.lab ? getLabWorld(controller.runtime) : getWorld(controller.runtime);
}
export function stopController(controller: RuntimeController): void {
  clearTouchInput(controller.input);
  controller.runtime = cancelGalleryManipulation(controller.runtime);
  controller.simpleStep = 0;
  controller.pendingFootstepDistance = 0;
}
export type ControllerAction = { type: 'pause' | 'resume' | 'aim' } | { type: 'turn'; yaw: number; pitch: number } | { type: 'step'; forward: number } | { type: 'hint'; stage: HintStage } | { type: 'sensitivity'; value: number; vertical?: number } | { type: 'verticalSensitivity'; value: number };
/** Explicit commands are the only UI mutation boundary of the simulation store.
 * React holds immutable event snapshots; this small store advances independently. */
export function commandController(controller: RuntimeController, action: ControllerAction): void {
  stopController(controller);
  if (controller.retired) return;
  switch (action.type) {
    case 'pause': controller.audio?.setActive(false); controller.runtime = pauseRuntime(controller.runtime); break;
    case 'resume':
      if (controller.diagnostics.appActive !== false && !['failed', 'closed'].includes(controller.diagnostics.stage)) controller.runtime = resumeRuntime(controller.runtime);
      break;
    case 'sensitivity':
      if (Number.isFinite(action.value) && action.value >= 0.5 && action.value <= 2) controller.sensitivity = action.value;
      if (action.vertical !== undefined && Number.isFinite(action.vertical) && action.vertical >= 0.5 && action.vertical <= 2) controller.verticalSensitivity = action.vertical;
      break;
    case 'verticalSensitivity': if (Number.isFinite(action.value) && action.value >= 0.5 && action.value <= 2) controller.verticalSensitivity = action.value; break;
    case 'hint':
      if (!controller.lab && !controller.runtime.progress.sealA) {
        // Each voluntary tap advances exactly one tier in the supplied reducer.
        if (action.stage > controller.runtime.emblem.hintTier) dispatchEmblemController(controller, createEmblemCommand(controller, { type: 'hint' }));
      } else controller.runtime = setHintStage(controller.runtime, action.stage);
      break;
    case 'aim': {
      const paused = controller.runtime.paused;
      const aimed = assistAim(resumeRuntime(controller.runtime));
      controller.runtime = paused ? pauseRuntime(aimed) : aimed;
      controller.matrices = undefined;
      controller.viewCommandRevision += 1;
      break;
    }
    case 'step': if ((!controller.runtime.gallery || controller.runtime.gallery.mode === 'explore') && !controller.runtime.paused) controller.simpleStep = action.forward; break;
    case 'turn':
      if (!controller.runtime.paused && (!controller.runtime.gallery || controller.runtime.gallery.mode === 'explore')) {
        const before = controller.runtime.pose;
        controller.runtime = { ...controller.runtime, pose: adjustLook(before, action.yaw, action.pitch) };
        recordTutorialMotion(controller.tutorial, before, controller.runtime.pose, true);
        controller.matrices = undefined;
        controller.viewCommandRevision += 1;
      }
  }
}
export function syncCamera(controller: RuntimeController, camera: THREE.PerspectiveCamera): CameraMatrices {
  const pose = controller.runtime.pose;
  camera.fov = VERTICAL_FOV;
  camera.near = CAMERA_NEAR;
  camera.far = CAMERA_FAR;
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  const matrices = { view: camera.matrixWorldInverse.elements, projection: camera.projectionMatrix.elements };
  controller.matrices = matrices;
  return matrices;
}
export function advanceController(controller: RuntimeController, delta: number, camera: THREE.PerspectiveCamera): void {
  if (controller.retired || controller.runtime.paused || controller.runtime.progress.cleared) { stopController(controller); return; }
  if (controller.runtime.gallery && controller.runtime.gallery.mode !== 'explore') {
    clearTouchInput(controller.input); controller.simpleStep = 0;
    const matrices = syncCamera(controller, camera);
    controller.runtime = evaluateRuntime(controller.runtime, controller.runtime.pose, delta, matrices);
    return;
  }
  const before = controller.runtime.pose;
  const look = consumeLook(controller.input);
  const looked = adjustLook(controller.runtime.pose, -look.x * 0.003 * controller.sensitivity, -look.y * 0.003 * controller.sensitivity * controller.verticalSensitivity);
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
  const world = worldForController(controller);
  const pose = controller.simpleStep
    ? updatePlayer(looked, { strafe: 0, forward: controller.simpleStep }, 0.25, world)
    : updatePlayer(looked, { strafe: controller.input.right, forward: controller.input.forward }, dt, world, true);
  recordTutorialMotion(controller.tutorial, before, pose, look.x !== 0 || look.y !== 0);
  controller.pendingFootstepDistance += Math.hypot(pose.position.x - before.position.x, pose.position.z - before.position.z);
  controller.simpleStep = 0;
  controller.runtime = { ...controller.runtime, pose };
  const matrices = syncCamera(controller, camera);
  controller.runtime = controller.lab
    ? { ...controller.runtime, doorAOpen: controller.runtime.progress.sealA ? Math.min(1, controller.runtime.doorAOpen + dt / 1.25) : 0 }
    : evaluateRuntime(controller.runtime, pose, dt, matrices);
}
export function controllerSnapshot(controller: RuntimeController): RuntimeSnapshot {
  const cue = interactionCue(worldForController(controller), controller.runtime.pose, controller.matrices, controller.lab ? undefined : controller.runtime.progress, controller.runtime.alignment);
  const target = cue.kind === 'ready' || cue.kind === 'locked' ? cue.target : undefined;
  const tutorial = controller.tutorial.milestones;
  const directions = ['北', '北西', '西', '南西', '南', '南東', '東', '北東'];
  const direction = directions[(Math.round(controller.runtime.pose.yaw / (Math.PI / 4)) + 8) % 8]!;
  const objective = controller.lab ? '壁を確かめ、扉へ近づいて調べよう。' : objectiveForRuntime(controller.runtime);
  // Screen publishes explicit view commands before fresh camera matrices exist.
  // Their next presented cue must publish even when it matches the last frame's
  // semantic bucket. Continuous movement and idle frames do not advance this.
  const gallery = controller.runtime.gallery;
  const galleryKey = gallery ? [gallery.mode, gallery.shadowCompare, gallery.contourGuide, gallery.activeDrag?.pointerId ?? '', gallery.feedback?.sequence ?? 0].join(':') : '';
  const key = `${galleryKey}|${JSON.stringify(controller.runtime.progress)}|${controller.runtime.alignment}|${target?.id ?? ''}|${target?.label ?? ''}|${cue.kind}|${cue.reason ?? ''}|${JSON.stringify(tutorial)}|${cue.target?.id ?? ''}|${direction}|${controller.runtime.paused}|${controller.viewCommandRevision}|${controller.runtime.emblem.presentation}|${controller.runtime.switchFeedback?.sequence ?? 0}|${controller.screenReader}|${accessibleEmblemTargets(controller).map((item) => item.id).join(',')}`;
  return { runtime: controller.runtime, tutorial, target, cue, objective, direction, key };
}
export function interactController(controller: RuntimeController, expectedId: InteractableId): boolean {
  controller.feedbackMessage = '';
  if (!controllerCanInteract(controller)) return false;
  if (expectedId === 'shadow-panel' || expectedId === 'contour-panel') return galleryAction(controller, { type: 'enter', puzzle: expectedId === 'shadow-panel' ? 'shadow' : 'contour' });
  if (!controller.lab && expectedId.startsWith('emblem-')) {
    const action: SealAction = expectedId === 'emblem-panel' ? { type: 'inspect' } :
      { type: 'choose', glyph: expectedId.slice(7) as 'circle' | 'diamond' | 'square' };
    return dispatchEmblemController(controller, createEmblemCommand(controller, action)).accepted;
  }
  const cue = interactionCue(worldForController(controller), controller.runtime.pose, controller.matrices, controller.lab ? undefined : controller.runtime.progress, controller.runtime.alignment);
  if (cue.kind !== 'ready' || cue.target.id !== expectedId) return false;
  const previous = controller.runtime;
  if (controller.lab) {
    if (expectedId !== 'guide' || previous.progress.sealA) return false;
    controller.runtime = { ...previous, progress: { ...previous.progress, guideExamined: true, sealA: true } };
  } else controller.runtime = interact(previous, expectedId, controller.matrices);
  if (controller.runtime !== previous && expectedId === 'guide') recordTutorialGuide(controller.tutorial);
  if (controller.runtime !== previous) soundForControllerTransition(controller, previous);
  return controller.runtime !== previous;
}

/** Presentation readiness comes from the existing native render/present gate. */
export function controllerCanInteract(controller: RuntimeController): boolean {
  const d = controller.diagnostics;
  return !controller.retired && !controller.runtime.paused && !controller.runtime.progress.cleared &&
    d.stage === 'ready' && d.rendererOwnership === 'live' && d.appActive !== false && !d.paused && !d.open &&
    (d.sceneMode === 'chapter' || d.sceneMode === 'lab') && !!controller.matrices;
}
export function retireController(controller: RuntimeController): void {
  stopController(controller);
  controller.runtime = pauseRuntime(controller.runtime);
  controller.retired = true;
  controller.audio?.dispose();
}
export function setControllerForeground(controller: RuntimeController, active: boolean): void {
  controller.diagnostics.appActive = active;
  if (!active) {
    controller.audio?.setActive(false);
    stopController(controller);
    controller.runtime = pauseRuntime(controller.runtime);
  }
}
export function createEmblemCommand(controller: RuntimeController, action: SealAction, nowMs = performance.now()): SealCommand {
  return { sessionId: controller.runtime.emblem.sessionId, seq: ++controller.commandSequence,
    nowMs: Math.max(controller.runtime.emblem.lastNowMs, nowMs), action };
}
/** The host recomputes target/range/occlusion from its current camera. No UI can
 * supply a PlayContext or claim that a selected glyph is reachable. */
export function dispatchEmblemController(controller: RuntimeController, command: SealCommand): SealResult {
  return applyEmblemControllerCommand(controller, command);
}
function applyEmblemControllerCommand(controller: RuntimeController, command: SealCommand, requestedAccessibleTarget?: InteractableId): SealResult {
  const state = controller.runtime.emblem;
  const rejected = (reason: SealResult['reason']): SealResult => ({ state, effects: [], accepted: false, reason });
  if (controller.retired || command.sessionId !== state.sessionId || !Number.isSafeInteger(command.seq) ||
      command.seq <= controller.lastReceivedSequence) return rejected('stale');
  // Consume even a rejected packet; background taps cannot replay after resume.
  controller.lastReceivedSequence = command.seq;
  controller.commandSequence = Math.max(controller.commandSequence, command.seq);
  if (controller.lab || ['failed', 'closed'].includes(controller.diagnostics.stage)) return rejected('blocked');
  const auxiliary = command.action.type === 'hint' || command.action.type === 'assist';
  if (!auxiliary && !controllerCanInteract(controller)) return rejected('blocked');
  const cue = interactionCue(worldForController(controller), controller.runtime.pose, controller.matrices, controller.runtime.progress, controller.runtime.alignment);
  const context = {
    rendererReady: controllerCanInteract(controller),
    foreground: controller.diagnostics.appActive !== false,
    targetId: requestedAccessibleTarget
      ? accessibleEmblemTargets(controller).find((target) => target.id === requestedAccessibleTarget)?.id ?? null
      : cue.kind === 'ready' || cue.kind === 'locked' ? cue.target.id : null,
  };
  const result = reduceSeal(state, command, context);
  controller.feedbackMessage = result.effects.filter((effect) => effect.type === 'message').map((effect) => effect.text).join(' ');
  if (result.accepted) {
    const previous = controller.runtime;
    controller.runtime = commitEmblemResult(controller.runtime, result);
    if (command.action.type === 'choose') controller.runtime = { ...controller.runtime,
      switchFeedback: { glyph: command.action.glyph, correct: result.state.phase === 'released', sequence: command.seq, remainingSeconds: EMBLEM_SWITCH_FEEDBACK_SECONDS } };
    if (result.effects.some((effect) => effect.type === 'stop-input')) stopController(controller);
    if (!auxiliary) soundForControllerTransition(controller, previous);
  }
  return result;
}
/** Legacy lab comparison is still bounded; the chapter comparison is panel-authorized. */
export function compareController(controller: RuntimeController, nowMs = performance.now()): boolean {
  if (!controllerCanInteract(controller)) return false;
  if (controller.runtime.gallery) {
    const cue = controllerSnapshot(controller).cue;
    if (controller.runtime.gallery.mode === 'shadow' || cue.target?.id === 'shadow-panel') return galleryAction(controller, { type: 'compare' });
    if (controller.runtime.gallery.mode === 'contour' || cue.target?.id === 'contour-panel') return galleryAction(controller, { type: 'guide', enabled: !controller.runtime.gallery.contourGuide });
  }
  if (!controller.lab) {
    return dispatchEmblemController(controller, createEmblemCommand(controller, { type: 'compare' }, nowMs)).accepted;
  }
  if (!Number.isFinite(nowMs) || nowMs - controller.lastCompareMs < 1000) return false;
  controller.lastCompareMs = nowMs;
  return true;
}

/** VoiceOver selects a visible physical fixture, with the same reach/occlusion.
 * It never turns the camera, selects the key, or trusts the requested ID. */
export function accessibleEmblemTargets(controller: RuntimeController): InteractableDefinition[] {
  const matrices = controller.matrices, pose = controller.runtime.pose;
  if (!controller.screenReader || !controllerCanInteract(controller) || !matrices || !cameraMatchesPose(pose, matrices)) return [];
  const world = worldForController(controller);
  return world.interactables.filter((target) => {
    if (!target.id.startsWith('emblem-')) return false;
    if (target.rectangle) {
      const candidate = evaluateInteraction({ ...world, interactables: [target] }, pose, controller.runtime.progress, matrices, controller.runtime.alignment);
      return candidate.kind === 'ready' || candidate.kind === 'locked' || candidate.kind === 'aim';
    }
    if (!projectWithCamera(target.center, matrices)) return false;
    const d = { x: pose.position.x - target.center.x, y: pose.position.y - target.center.y, z: pose.position.z - target.center.z };
    const distance = Math.hypot(d.x, d.y, d.z) - target.radius;
    return distance <= target.maxDistance && !segmentOccluded(pose.position, target.center, world, target.id + '-body');
  });
}
export function interactAccessibleEmblem(controller: RuntimeController, requestedId: InteractableId): boolean {
  controller.feedbackMessage = '';
  if (!accessibleEmblemTargets(controller).some((target) => target.id === requestedId)) return false;
  const action: SealAction = requestedId === 'emblem-panel' ? { type: 'inspect' } :
    { type: 'choose', glyph: requestedId.slice(7) as 'circle' | 'diamond' | 'square' };
  return applyEmblemControllerCommand(controller, createEmblemCommand(controller, action), requestedId).accepted;
}

export function setControllerScreenReader(controller: RuntimeController, enabled: boolean): void {
  stopController(controller);
  controller.screenReader = enabled;
}

/** Emit movement only after a successful native presentation, never a failed
 * speculative simulation frame. Sources/players belong to the scene owner. */
export function flushControllerAudioFrame(controller: RuntimeController): void {
  const distance = controller.pendingFootstepDistance;
  controller.pendingFootstepDistance = 0;
  if (!controllerCanInteract(controller)) return;
  controller.audio?.setListenerPosition(controller.runtime.pose.position);
  if (distance > 0) controller.audio?.movement(distance, String(controller.runtime.session));
}
export function soundForControllerTransition(controller: RuntimeController, previous: ChapterRuntime): void {
  const before = previous.progress, after = controller.runtime.progress;
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

/** The controller owns this mutable audio handle outside React state snapshots. */
export function attachControllerAudio(controller: RuntimeController, owner: NonNullable<RuntimeController['audio']>): () => void {
  controller.audio?.dispose();
  controller.audio = owner;
  return () => { owner.dispose(); if (controller.audio === owner) delete controller.audio; };
}
