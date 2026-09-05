import * as THREE from 'three';

import { CAMERA_FAR, CAMERA_NEAR, getWorld, VERTICAL_FOV } from '../../domain/firstPerson/chapter';
import { adjustLook, updatePlayer } from '../../domain/firstPerson/geometry';
import { assistAim, createInitialRuntime, evaluateRuntime, findInteraction, interact, objectiveForRuntime, pauseRuntime, resumeRuntime, setHintStage } from '../../domain/firstPerson/runtime';
import { interactionCue } from '../../domain/firstPerson/interactionCue';
import type { CameraMatrices, ChapterRuntime, CheckpointState, HintStage, InteractableDefinition, InteractableId } from '../../domain/firstPerson/types';
import { getLabWorld } from './labRuntime';
import { clearTouchInput, consumeLook, createTouchInput, type FirstPersonInput } from './touchInput';
import { createFirstPersonDiagnostics, type FirstPersonDiagnostics } from './diagnostics';

export type RuntimeController = {
  runtime: ChapterRuntime;
  input: FirstPersonInput;
  lab: boolean;
  sensitivity: number;
  simpleStep: number;
  viewCommandRevision: number;
  matrices: CameraMatrices | undefined;
  diagnostics: FirstPersonDiagnostics;
  metrics: { frames: number; elapsed: number; drawCalls: number; geometries: number; textures: number };
};
export type RuntimeSnapshot = { runtime: ChapterRuntime; target: InteractableDefinition | undefined; cue: ReturnType<typeof interactionCue>; objective: string; direction: string; key: string };
export function createController(checkpoint?: CheckpointState, lab = false): RuntimeController {
  const runtime = createInitialRuntime(lab ? undefined : checkpoint);
  if (lab) runtime.pose = { position: { x: 0, y: 1.6, z: 2.6 }, yaw: 0, pitch: 0 };
  return { runtime, input: createTouchInput(), lab, sensitivity: 1, simpleStep: 0, viewCommandRevision: 0, matrices: undefined, diagnostics: createFirstPersonDiagnostics(lab ? 'lab' : 'chapter'), metrics: { frames: 0, elapsed: 0, drawCalls: 0, geometries: 0, textures: 0 } };
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
  controller.simpleStep = 0;
}
export type ControllerAction = { type: 'pause' | 'resume' | 'aim' } | { type: 'turn'; yaw: number; pitch: number } | { type: 'step'; forward: number } | { type: 'hint'; stage: HintStage } | { type: 'sensitivity'; value: number };
/** Explicit commands are the only UI mutation boundary of the simulation store.
 * React holds immutable event snapshots; this small store advances independently. */
export function commandController(controller: RuntimeController, action: ControllerAction): void {
  stopController(controller);
  switch (action.type) {
    case 'pause': controller.runtime = pauseRuntime(controller.runtime); break;
    case 'resume': controller.runtime = resumeRuntime(controller.runtime); break;
    case 'sensitivity': controller.sensitivity = action.value; break;
    case 'hint': controller.runtime = setHintStage(controller.runtime, action.stage); break;
    case 'aim': {
      const paused = controller.runtime.paused;
      const aimed = assistAim(resumeRuntime(controller.runtime));
      controller.runtime = paused ? pauseRuntime(aimed) : aimed;
      controller.matrices = undefined;
      controller.viewCommandRevision += 1;
      break;
    }
    case 'step': if (!controller.runtime.paused) controller.simpleStep = action.forward; break;
    case 'turn':
      if (!controller.runtime.paused) {
        controller.runtime = { ...controller.runtime, pose: adjustLook(controller.runtime.pose, action.yaw, action.pitch) };
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
  if (controller.runtime.paused || controller.runtime.progress.cleared) { stopController(controller); return; }
  const look = consumeLook(controller.input);
  const looked = adjustLook(controller.runtime.pose, -look.x * 0.003 * controller.sensitivity, -look.y * 0.003 * controller.sensitivity);
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.05)) : 0;
  const world = worldForController(controller);
  const pose = controller.simpleStep
    ? updatePlayer(looked, { strafe: 0, forward: controller.simpleStep }, 0.25, world)
    : updatePlayer(looked, { strafe: controller.input.right, forward: controller.input.forward }, dt, world);
  controller.simpleStep = 0;
  controller.runtime = { ...controller.runtime, pose };
  const matrices = syncCamera(controller, camera);
  controller.runtime = controller.lab
    ? { ...controller.runtime, doorAOpen: controller.runtime.progress.sealA ? Math.min(1, controller.runtime.doorAOpen + dt / 1.25) : 0 }
    : evaluateRuntime(controller.runtime, pose, dt, matrices);
}
export function controllerSnapshot(controller: RuntimeController): RuntimeSnapshot {
  const target = findInteraction(worldForController(controller), controller.runtime.pose, controller.runtime.progress);
  const cue = interactionCue(worldForController(controller), controller.runtime.pose, controller.matrices);
  const directions = ['北', '北西', '西', '南西', '南', '南東', '東', '北東'];
  const direction = directions[(Math.round(controller.runtime.pose.yaw / (Math.PI / 4)) + 8) % 8]!;
  const objective = controller.lab ? '壁を確かめ、扉へ近づいて調べよう。' : objectiveForRuntime(controller.runtime);
  // Screen publishes explicit view commands before fresh camera matrices exist.
  // Their next presented cue must publish even when it matches the last frame's
  // semantic bucket. Continuous movement and idle frames do not advance this.
  const key = `${JSON.stringify(controller.runtime.progress)}|${controller.runtime.alignment}|${target?.id ?? ''}|${target?.label ?? ''}|${cue.kind}|${cue.target?.id ?? ''}|${direction}|${controller.runtime.paused}|${controller.viewCommandRevision}`;
  return { runtime: controller.runtime, target, cue, objective, direction, key };
}
export function interactController(controller: RuntimeController, expectedId: InteractableId): boolean {
  if (controller.runtime.paused || controller.runtime.progress.cleared) return false;
  const target = findInteraction(worldForController(controller), controller.runtime.pose, controller.runtime.progress);
  if (target?.id !== expectedId) return false;
  const previous = controller.runtime;
  if (controller.lab) {
    if (expectedId !== 'guide' || previous.progress.sealA) return false;
    controller.runtime = { ...previous, progress: { ...previous.progress, guideExamined: true, sealA: true } };
  } else controller.runtime = interact(previous, expectedId, controller.matrices);
  return controller.runtime !== previous;
}
