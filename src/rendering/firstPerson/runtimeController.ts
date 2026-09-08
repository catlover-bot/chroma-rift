import { cancelTheatreManipulation } from '../../domain/theatre/state';
import { THEATRE_CURTAIN_FIXTURE, THEATRE_PROJECTOR } from '../../domain/theatre/definition';
import { evaluateLight } from '../../domain/theatre/lightGate';
import { theatreAction, theatreDeviceAcquisition, advanceTheatreControllerActor } from './theatreController';
import type { DeviceAcquisition } from './manipulationProjection';
import { advanceVaultActor, type VaultActorEvent } from '../../domain/vault/actor';
import { cancelVaultManipulation } from '../../domain/vault/state';
import { VAULT_EXIT_FIXTURE, VAULT_METAL_FLOORS } from '../../domain/vault/definition';
import type { VaultNoise } from '../../domain/vault/types';
import { canCloseVaultExitController, vaultAction, vaultDeviceAcquisition } from './vaultController';
import type { ActorFootPlant } from '../../domain/actorMotion';
import * as THREE from 'three';
import { validNotebookWindow, type NotebookMaskPreview } from './notebookCamera';
import { advanceGalleryActor, recordGalleryDiscovery, canCloseGalleryExit, resumeGalleryActor, cancelGalleryManipulation, contourAlignedCount, type GalleryActorEvent } from '../../domain/gallery';
import { galleryAction, galleryDeviceAcquisition } from './galleryController';
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
import { clearTouchInput, requireAllPointersReleased, consumeLook, createTouchInput, type FirstPersonInput } from './touchInput';
import { createFirstPersonDiagnostics, type FirstPersonDiagnostics } from './diagnostics';

export type RuntimeController = {
  runtime: ChapterRuntime;
  notebookPreview?: NotebookMaskPreview | undefined;
  viewport?: { width: number; height: number };
  horrorIntensity: 'standard' | 'subdued';
  audio?: ReturnType<typeof createGalleryAudio>;
  audioSequence: number;
  pendingFootstepDistance: number;
  pendingActorFootstepDistance: number;
  pendingActorPlants: ActorFootPlant[];
  pendingActorEvents: (GalleryActorEvent | VaultActorEvent)[];
  pendingExitImpact: boolean;
  pendingProjectorPulse: boolean;
  actorNotice?: { sequence: number; text: string };
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
export type RuntimeSnapshot = { acquisition?: DeviceAcquisition; actorNotice?: { sequence: number; text: string }; runtime: ChapterRuntime; tutorial: TutorialMilestones; target: InteractableDefinition | undefined; cue: ReturnType<typeof interactionCue>; objective: string; direction: string; key: string };
export function createController(checkpoint?: CheckpointState, lab = false, tutorialCompleted = false, chapterId?: string): RuntimeController {
  const runtime = createInitialRuntime(lab ? undefined : checkpoint, undefined, chapterId);
  if (lab) runtime.pose = { position: { x: 0, y: 1.6, z: 2.6 }, yaw: 0, pitch: 0 };
  return { runtime, horrorIntensity: 'standard', audioSequence: 0, pendingFootstepDistance: 0, pendingActorFootstepDistance: 0, pendingActorPlants: [], pendingActorEvents: [], pendingExitImpact: false, pendingProjectorPulse: false, retired: false, screenReader: false, commandSequence: 0, lastReceivedSequence: -1, feedbackMessage: '', lastCompareMs: -Infinity, input: createTouchInput(), lab, sensitivity: 1, verticalSensitivity: 1, tutorial: createTutorial(runtime.pose, tutorialCompleted || lab, runtime.progress.guideExamined), simpleStep: 0, viewCommandRevision: 0, matrices: undefined, diagnostics: createFirstPersonDiagnostics(lab ? 'lab' : 'chapter'), metrics: { frames: 0, elapsed: 0, drawCalls: 0, geometries: 0, textures: 0 } };
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
  controller.runtime = cancelTheatreManipulation(cancelVaultManipulation(cancelGalleryManipulation(controller.runtime)));
  controller.simpleStep = 0;
  controller.pendingFootstepDistance = 0;
  controller.pendingActorFootstepDistance = 0; controller.pendingActorPlants = []; controller.pendingActorEvents = [];
  controller.pendingExitImpact = false; controller.pendingProjectorPulse = false;
}
export type ControllerAction = { type: 'pause' | 'resume' | 'aim' } | { type: 'turn'; yaw: number; pitch: number } | { type: 'step'; forward: number } | { type: 'hint'; stage: HintStage } | { type: 'sensitivity'; value: number; vertical?: number } | { type: 'verticalSensitivity'; value: number };
/** Explicit commands are the only UI mutation boundary of the simulation store.
 * React holds immutable event snapshots; this small store advances independently. */
export function commandController(controller: RuntimeController, action: ControllerAction): void {
  // Ordinary steering does not cancel an accepted curtain's pending impact.
  // Pause, background, menus and failed presentation still discard it.
  const preserveCurtainImpact = (action.type === 'step' || action.type === 'turn') && !controller.runtime.paused &&
    !!controller.runtime.progress.theatre?.curtainAccepted && controller.pendingExitImpact;
  stopController(controller);
  if (preserveCurtainImpact) controller.pendingExitImpact = true;
  if (controller.retired) return;
  switch (action.type) {
    case 'pause': controller.audio?.setActive(false); controller.runtime = pauseRuntime(controller.runtime); break;
    case 'resume':
      if (controller.diagnostics.appActive !== false && !['failed', 'closed'].includes(controller.diagnostics.stage)) controller.runtime = resumeGalleryActor(resumeRuntime(controller.runtime));
      break;
    case 'sensitivity':
      if (Number.isFinite(action.value) && action.value >= 0.5 && action.value <= 2) controller.sensitivity = action.value;
      if (action.vertical !== undefined && Number.isFinite(action.vertical) && action.vertical >= 0.5 && action.vertical <= 2) controller.verticalSensitivity = action.vertical;
      break;
    case 'verticalSensitivity': if (Number.isFinite(action.value) && action.value >= 0.5 && action.value <= 2) controller.verticalSensitivity = action.value; break;
    case 'hint':
      if (!controller.lab && !controller.runtime.gallery && !controller.runtime.vault && !controller.runtime.theatre && !controller.runtime.progress.sealA) {
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
    case 'step': if (!controller.input.releaseBarrier.length && (!controller.runtime.gallery || controller.runtime.gallery.mode === 'explore') && (!controller.runtime.vault || controller.runtime.vault.mode === 'explore') && (!controller.runtime.theatre || controller.runtime.theatre.mode === 'explore' && !controller.runtime.theatre.projectorArmed) && !controller.runtime.paused) controller.simpleStep = action.forward; break;
    case 'turn':
      if (!controller.input.releaseBarrier.length && !controller.runtime.paused && (!controller.runtime.gallery || controller.runtime.gallery.mode === 'explore') && (!controller.runtime.vault || controller.runtime.vault.mode === 'explore') && (!controller.runtime.theatre || controller.runtime.theatre.mode === 'explore' && !controller.runtime.theatre.projectorArmed)) {
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
  if (!controller.retired && !controller.runtime.paused && controller.runtime.progress.cleared && controller.runtime.vault?.exitClosureSeconds) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, .05)) : 0;
    controller.runtime = { ...controller.runtime, vault: { ...controller.runtime.vault, exitClosureSeconds: Math.max(0, controller.runtime.vault.exitClosureSeconds - dt) } };
    clearTouchInput(controller.input); controller.simpleStep = 0;
    controller.pendingFootstepDistance = controller.pendingActorFootstepDistance = 0;
    syncCamera(controller, camera);
    return;
  }
  if (!controller.retired && !controller.runtime.paused && controller.runtime.progress.cleared && controller.runtime.gallery?.exitClosureSeconds) {
    const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, .05)) : 0;
    controller.runtime = { ...controller.runtime, gallery: { ...controller.runtime.gallery, exitClosureSeconds: Math.max(0, controller.runtime.gallery.exitClosureSeconds - dt) } };
    clearTouchInput(controller.input); controller.simpleStep = 0;
    controller.pendingFootstepDistance = controller.pendingActorFootstepDistance = 0;
    syncCamera(controller, camera);
    return;
  }
  if (controller.retired || controller.runtime.paused || controller.runtime.progress.cleared) { stopController(controller); return; }
  if (controller.runtime.gallery && controller.runtime.gallery.mode !== 'explore' || controller.runtime.vault && controller.runtime.vault.mode !== 'explore' || controller.runtime.theatre?.mode === 'light') {
    clearTouchInput(controller.input); controller.simpleStep = 0;
    const matrices = syncCamera(controller, camera);
    controller.runtime = evaluateRuntime(controller.runtime, controller.runtime.pose, delta, matrices);
    return;
  }
  if (controller.runtime.theatre?.projectorArmed) { clearTouchInput(controller.input); controller.simpleStep = 0; }
  const before = controller.runtime.pose;
  const look = consumeLook(controller.input);
  const looked = adjustLook(controller.runtime.pose, -look.x * 0.003 * controller.sensitivity, -look.y * 0.003 * controller.sensitivity * controller.verticalSensitivity);
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
  const world = worldForController(controller);
  const stepped = controller.simpleStep !== 0;
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
  if (controller.runtime.theatre && controllerCanInteract(controller)) {
    const moved = Math.hypot(controller.runtime.pose.position.x - before.position.x, controller.runtime.pose.position.z - before.position.z);
    advanceTheatreControllerActor(controller, dt, moved, moved / (stepped ? .25 : Math.max(dt, 1e-6)), camera);
  }
  if (controller.runtime.vault && controllerCanInteract(controller)) {
    const live = controller.runtime.vault, position = pose.position;
    const moved = Math.hypot(position.x - before.position.x, position.z - before.position.z);
    const speed = moved / (stepped ? .25 : Math.max(dt, 1e-6));
    const cumulative = live.noiseDistance + moved;
    let noise: VaultNoise | undefined;
    if (moved > 0 && cumulative >= .65) {
      const metal = VAULT_METAL_FLOORS.some(f => position.x >= f.minX && position.x <= f.maxX && position.z >= f.minZ && position.z <= f.maxZ);
      noise = { sequence: live.noiseSequence + 1, position: { ...position, y: .08 },
        strength: Math.min(1.2, (speed <= .65 ? .1 : speed > 1.4 ? .8 : .4) * (metal ? 1.35 : 1)), kind: metal ? 'metal' : 'footstep' };
    }
    controller.runtime = { ...controller.runtime, vault: { ...live, noiseDistance: cumulative % .65, noiseSequence: noise?.sequence ?? live.noiseSequence } };
    const actor = advanceVaultActor(controller.runtime, dt, { intensity: controller.horrorIntensity, matrices, ...(noise ? { noise } : {}) });
    controller.runtime = actor.runtime;
    controller.pendingActorPlants.push(...actor.footPlants);
    controller.pendingActorEvents = [...controller.pendingActorEvents, ...actor.events].slice(-4);
    if (actor.caught) {
      requireAllPointersReleased(controller.input); clearTouchInput(controller.input);
      controller.simpleStep = 0; controller.pendingFootstepDistance = 0;
      syncCamera(controller, camera);
    }
  }
  if (controller.runtime.gallery && controllerCanInteract(controller)) {
    const actor = advanceGalleryActor(controller.runtime, dt, { intensity: controller.horrorIntensity, matrices });
    controller.runtime = actor.runtime;
    controller.pendingActorFootstepDistance += actor.movedDistance;
    controller.pendingActorPlants.push(...actor.footPlants);
    controller.pendingActorEvents = [...controller.pendingActorEvents, ...actor.events].slice(-4);
    if (actor.caught) {
      requireAllPointersReleased(controller.input);
      controller.simpleStep = 0; controller.pendingFootstepDistance = 0;
      syncCamera(controller, camera);
    }
  }
}
export function controllerSnapshot(controller: RuntimeController): RuntimeSnapshot {
  const cue = interactionCue(worldForController(controller), controller.runtime.pose, controller.matrices, controller.lab ? undefined : controller.runtime.progress, controller.runtime.alignment);
  const target = cue.kind === 'ready' || cue.kind === 'locked' ? cue.target : undefined;
  const candidate = cue.target?.id;
  const acquisition = candidate === 'vault-length' || candidate === 'vault-rod' ? vaultDeviceAcquisition(controller, candidate === 'vault-length' ? 'length' : 'rod')
    : candidate === 'shadow-panel' || candidate === 'contour-panel' || candidate === 'wiring-panel' ? galleryDeviceAcquisition(controller, candidate === 'shadow-panel' ? 'shadow' : candidate === 'contour-panel' ? 'contour' : 'wiring') : candidate === 'theatre-light' || candidate === 'theatre-projector' ? theatreDeviceAcquisition(controller, candidate === 'theatre-light' ? 'light' : 'projector') : undefined;
  const tutorial = controller.tutorial.milestones;
  const directions = ['北', '北西', '西', '南西', '南', '南東', '東', '北東'];
  const direction = directions[(Math.round(controller.runtime.pose.yaw / (Math.PI / 4)) + 8) % 8]!;
  const objective = controller.lab ? '壁を確かめ、扉へ近づいて調べよう。' : objectiveForRuntime(controller.runtime);
  // Screen publishes explicit view commands before fresh camera matrices exist.
  // Their next presented cue must publish even when it matches the last frame's
  // semantic bucket. Continuous movement and idle frames do not advance this.
  const vault = controller.runtime.vault;
  const vaultKey = vault ? [canCloseVaultExitController(controller), vault.mode, vault.checkpointId, vault.exitClosureSeconds > 0, vault.partitionClosed, vault.activeDrag?.pointerId ?? '', vault.feedback?.sequence ?? 0].join(':') : '';
  const gallery = controller.runtime.gallery;
  const galleryKey = gallery ? [canCloseGalleryExit(controller.runtime), JSON.stringify(gallery.lastSafePose), gallery.mode, gallery.exitClosureSeconds > 0, gallery.shadowCompare, gallery.contourGuide, gallery.activeDrag?.pointerId ?? '', gallery.feedback?.sequence ?? 0, contourAlignedCount(controller.runtime.progress.gallery!.contour.seed, gallery.contourAngles)].join(':') : '';
  const theatre = controller.runtime.theatre;
  const theatreKey = theatre ? [theatre.mode, theatre.projectorArmed, theatre.checkpointId, theatre.activeDrag?.pointerId ?? '', theatre.feedback?.sequence ?? 0,
    theatre.projectorSeconds > 0, theatre.projectorCooldown > 0, ...evaluateLight(theatre.rail).windows.map(w => w.lit)].join(':') : '';
  const key = `${acquisition?.kind ?? ''}|${acquisition?.message ?? ''}|${objective}|${controller.actorNotice?.sequence ?? 0}|${galleryKey}|${vaultKey}|${theatreKey}|${JSON.stringify(controller.runtime.progress)}|${controller.runtime.alignment}|${target?.id ?? ''}|${target?.label ?? ''}|${cue.kind}|${cue.reason ?? ''}|${JSON.stringify(tutorial)}|${cue.target?.id ?? ''}|${direction}|${controller.runtime.paused}|${controller.viewCommandRevision}|${controller.runtime.emblem.presentation}|${controller.runtime.switchFeedback?.sequence ?? 0}|${controller.screenReader}|${accessibleEmblemTargets(controller).map((item) => item.id).join(',')}`;
  return { ...(acquisition ? { acquisition } : {}), ...(controller.actorNotice ? { actorNotice: controller.actorNotice } : {}), runtime: controller.runtime, tutorial, target, cue, objective, direction, key };
}
export function interactController(controller: RuntimeController, expectedId: InteractableId): boolean {
  controller.feedbackMessage = '';
  if (!controllerCanInteract(controller)) return false;
  if (controller.runtime.theatre) {
    if (expectedId === 'theatre-light') return theatreAction(controller, { type: 'enter-light' });
    if (expectedId === 'theatre-projector') return theatreAction(controller, { type: 'enter-projector' });
    if (expectedId === 'theatre-inspection') return theatreAction(controller, { type: 'open-inspection' });
    if (expectedId === 'theatre-ames-side') return theatreAction(controller, { type: 'inspect-depth' });
    if (expectedId === 'theatre-bypass') return theatreAction(controller, { type: 'open-bypass' });
    if (expectedId === 'theatre-curtain') return theatreAction(controller, { type: 'lower-curtain' });
    return false;
  }
  if (controller.runtime.vault) {
    if (expectedId === 'vault-length' || expectedId === 'vault-rod') return vaultAction(controller, { type: 'enter', puzzle: expectedId === 'vault-length' ? 'length' : 'rod' });
    if (expectedId === 'vault-cafe') return vaultAction(controller, { type: 'cafe-inspect' });
    if (expectedId === 'vault-partition') return vaultAction(controller, { type: 'close-partition' });
    if (expectedId === 'vault-exit') return vaultAction(controller, { type: 'close-exit' });
    return false;
  }
  if (expectedId === 'shadow-panel' || expectedId === 'contour-panel' || expectedId === 'wiring-panel') return galleryAction(controller, { type: 'enter', puzzle: expectedId === 'shadow-panel' ? 'shadow' : expectedId === 'contour-panel' ? 'contour' : 'wiring' });
  if (controller.runtime.gallery) {
    if (expectedId === 'gallery-light') return galleryAction(controller, { type: 'light-on' });
    if (expectedId === 'gallery-exit-panel') return galleryAction(controller, { type: controller.runtime.progress.gallery!.powerTaken.shadow && controller.runtime.progress.gallery!.powerTaken.contour ? 'connect-power' : 'inspect-exit' });
    if (expectedId === 'shadow-power' || expectedId === 'contour-power') return galleryAction(controller, { type: 'take-power', puzzle: expectedId === 'shadow-power' ? 'shadow' : 'contour' });
    if (expectedId === 'chromatic-exhibit') return galleryAction(controller, { type: 'chromatic-compare' });
    if (expectedId === 'mask-exhibit') return galleryAction(controller, { type: 'mask-inspect' });
    if (expectedId === 'mask-window') return galleryAction(controller, { type: 'mask-window' });
    if (expectedId === 'hybrid-exhibit') return galleryAction(controller, { type: 'hybrid-inspect' });
    if (expectedId === 'exit') return canCloseGalleryExit(controller.runtime) && galleryAction(controller, { type: 'close-exit' });
    return false;
  }
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
  if (controller.lab || controller.runtime.vault || controller.runtime.gallery || controller.runtime.theatre || ['failed', 'closed'].includes(controller.diagnostics.stage)) return rejected('blocked');
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
  if (controller.runtime.theatre) return false;
  if (controller.runtime.vault) {
    const live = controller.runtime.vault, p = controller.runtime.progress.vault!;
    if (live.mode === 'length') return vaultAction(controller, { type: 'aid', aid: 'finsHidden', enabled: !p.aids.finsHidden });
    if (live.mode === 'rod') return vaultAction(controller, { type: 'aid', aid: 'frameHidden', enabled: !p.aids.frameHidden });
    return vaultAction(controller, { type: 'cafe-inspect' });
  }
  if (controller.runtime.gallery) {
    const cue = controllerSnapshot(controller).cue;
    if (controller.runtime.gallery.mode === 'shadow' || cue.target?.id === 'shadow-panel') return galleryAction(controller, { type: 'compare' });
    if (controller.runtime.gallery.mode === 'contour' || cue.target?.id === 'contour-panel') return galleryAction(controller, { type: 'guide', enabled: !controller.runtime.gallery.contourGuide });
    if (cue.target?.id === 'chromatic-exhibit') return galleryAction(controller, { type: 'chromatic-compare' });
    return false;
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
  const distance = controller.pendingFootstepDistance, actorPlants = controller.pendingActorPlants, actorEvents = controller.pendingActorEvents;
  controller.pendingActorPlants = [];
  controller.pendingFootstepDistance = 0; controller.pendingActorFootstepDistance = 0; controller.pendingActorPlants = []; controller.pendingActorEvents = [];
  if (controller.pendingProjectorPulse) {
    controller.pendingProjectorPulse = false;
    if (controllerCanInteract(controller) && controller.runtime.theatre?.projectorSeconds) controller.audio?.event({
      sessionId: String(controller.runtime.session), sequence: ++controller.audioSequence, type: 'interaction', position: THEATRE_PROJECTOR.position });
  }
  if (controller.pendingExitImpact && (!controller.runtime.theatre || controller.runtime.progress.theatre?.passageSealed) && (!controller.runtime.vault || controller.runtime.vault.exitClosureSeconds <= 1.15)) {
    controller.pendingExitImpact = false;
    if (!controller.retired && !controller.runtime.paused && (controller.runtime.progress.gallery?.finalDoorClosed || controller.runtime.progress.vault?.finalDoorClosed || controller.runtime.progress.theatre?.passageSealed && controller.horrorIntensity === 'standard') && controller.diagnostics.stage === 'ready' && controller.diagnostics.appActive !== false) {
      controller.audio?.event({ sessionId: String(controller.runtime.session), sequence: ++controller.audioSequence, type: 'door-close', position: controller.runtime.theatre ? THEATRE_CURTAIN_FIXTURE.center : controller.runtime.vault ? VAULT_EXIT_FIXTURE.center : { x: 4, y: 1.45, z: 23 } });
    }
  }
  if (!controllerCanInteract(controller)) return;
  const messages = { reveal: '隔壁の奥で頭が動いた。格子の先では棚を使おう。', noticed: 'こちらに気づいた。棚の陰へ。', windup: '肩を引いた。横へ避けよう。', 'final-warning': '搬出口の方へ足音。通路の仕切りで視線を切れる。', foreshadow: '格子の奥に、展示体が立っている。', absence: '奥で足音。', crossing: '格子の向こうを、展示体が横切る。', warning: '通路に何かいる。棚の陰でやり過ごそう。', caught: '最後の安全な場所へ戻された。' };
  if (actorEvents.includes('warning') && controller.audio) {
    const owner = controller.audio, session = controller.runtime.session;
    owner.playIllusion(String(session), controller.horrorIntensity, () => {
      if (controller.audio === owner && controller.runtime.session === session && controllerCanInteract(controller) && controller.runtime.gallery?.mode === 'explore' && controller.horrorIntensity === 'standard') {
        controller.runtime = recordGalleryDiscovery(controller.runtime, 'shepard');
      }
    });
  }
  if (actorEvents.length) controller.actorNotice = { sequence: (controller.actorNotice?.sequence ?? 0) + 1, text: actorEvents.map(event => controller.runtime.theatre && event === 'crossing' ? '通路の向こうを、展示体が横切った。' : messages[event]).join(' ') };
  controller.audio?.setListenerPosition(controller.runtime.pose.position);
  if (controller.runtime.gallery?.mode === 'explore' || controller.runtime.vault?.mode === 'explore' || controller.runtime.theatre?.mode === 'explore') {
    for (const plant of actorPlants) controller.audio?.event({ sessionId: String(controller.runtime.session), sequence: ++controller.audioSequence, type: 'actor-plant', position: plant.position });
  }
  if (distance > 0) controller.audio?.movement(distance, String(controller.runtime.session));
}
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

/** The controller owns this mutable audio handle outside React state snapshots. */
export function attachControllerAudio(controller: RuntimeController, owner: NonNullable<RuntimeController['audio']>): () => void {
  controller.audio?.dispose();
  controller.audio = owner;
  return () => { owner.dispose(); if (controller.audio === owner) delete controller.audio; };
}

export function setControllerViewport(controller: RuntimeController, width: number, height: number): void {
  if (controller.retired || ![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return;
  controller.viewport = { width, height };
}
export function setControllerHorrorIntensity(controller: RuntimeController, intensity: 'standard' | 'subdued'): void {
  if (controller.retired || (intensity !== 'standard' && intensity !== 'subdued')) return;
  controller.horrorIntensity = intensity;
  if (intensity === 'subdued') controller.audio?.stopIllusion();
}

/** Explicit paused comparison. Main pose/matrices and actor are never changed. */
export function setControllerNotebookPreview(controller: RuntimeController, preview: NotebookMaskPreview | undefined): boolean {
  if (controller.retired) return false;
  if (preview && (!controller.runtime.paused || !controller.runtime.gallery || controller.diagnostics.stage !== 'ready' || controller.diagnostics.appActive === false || !Number.isFinite(preview.yaw))) return false;
  prepareControllerNotebook(controller);
  stopController(controller);
  controller.notebookPreview = preview ? { kind: 'mask', yaw: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, preview.yaw)), ...(validNotebookWindow(preview.window) ? { window: { ...preview.window } } : {}) } : undefined;
  controller.viewCommandRevision += 1;
  return true;
}

/** Called before pausing so no owned pointer is lost before suppression. */
export function prepareControllerNotebook(controller: RuntimeController): void {
  if (controller.retired) return;
  const pointer = controller.runtime.theatre?.activeDrag?.pointerId ?? controller.runtime.vault?.activeDrag?.pointerId ?? controller.runtime.gallery?.activeDrag?.pointerId;
  if (pointer !== undefined && !controller.input.releaseBarrier.includes(pointer)) controller.input.releaseBarrier.push(pointer);
  requireAllPointersReleased(controller.input);
}
