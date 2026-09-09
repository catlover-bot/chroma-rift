import type * as THREE from 'three';
import { CAMERA_FAR, CAMERA_NEAR, VERTICAL_FOV } from '../../domain/firstPerson/constants';
import { getWorld } from '../../domain/firstPerson/chapter';
import type { CameraMatrices } from '../../domain/firstPerson/types';
import { getLabWorld } from './labRuntime';
import type { RuntimeController } from './controllerTypes';

/** Current world/camera/readiness services shared by stage handlers.
 * This module does not import controller orchestration or a stage handler. */
export function worldForController(controller: RuntimeController) {
  return controller.lab ? getLabWorld(controller.runtime) : getWorld(controller.runtime);
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

/** Presentation readiness comes from the existing native render/present gate. */
export function controllerCanInteract(controller: RuntimeController): boolean {
  const d = controller.diagnostics;
  return !controller.retired && !controller.runtime.paused && !controller.runtime.progress.cleared &&
    d.stage === 'ready' && d.rendererOwnership === 'live' && d.appActive !== false && !d.paused && !d.open &&
    (d.sceneMode === 'chapter' || d.sceneMode === 'lab') && !!controller.matrices;
}
