import type * as THREE from 'three';

export type NotebookWindow = { x: number; y: number; width: number; height: number };
export type NotebookMaskPreview = { kind: 'mask'; yaw: number; window?: NotebookWindow };
const DEFAULT_WINDOW: NotebookWindow = { x: .04, y: .15, width: .92, height: .43 };
export function validNotebookWindow(window?: NotebookWindow): window is NotebookWindow {
  return !!window && Object.values(window).every(Number.isFinite) && window.x >= 0 && window.y >= 0 &&
    window.width > 0 && window.height > 0 && window.x + window.width <= 1.001 && window.y + window.height <= 1.001;
}
/** Off-axis camera fits the measured transparent note window, never the game
 * camera or mesh. Conservative bounds enclose the normalized bundled face;
 * a projection test checks every actual vertex over the full orbit. */
export function configureNotebookCamera(camera: THREE.PerspectiveCamera, width: number, height: number, preview: NotebookMaskPreview): void {
  const window = validNotebookWindow(preview.window) ? preview.window : DEFAULT_WINDOW;
  const aspect = width / Math.max(1, height), tanHalf = Math.tan(19 * Math.PI / 180);
  const yaw = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, preview.yaw));
  const sin = Math.sin(yaw), cos = Math.cos(yaw), centerZ = -.2775;
  const tanX = tanHalf * aspect * window.width * .85, tanY = tanHalf * window.height * .85;
  let distance = 1;
  for (const x of [-.401, .401]) for (const z of [-.556, .001]) {
    const dz = z - centerZ, viewX = cos * x - sin * dz, towardCamera = sin * x + cos * dz;
    distance = Math.max(distance, Math.abs(viewX) / tanX + towardCamera, .501 / tanY + towardCamera);
  }
  camera.fov = 38; camera.near = .05; camera.far = Math.max(10, distance + 2); camera.aspect = aspect;
  camera.position.set(distance * sin, 0, centerZ + distance * cos);
  camera.lookAt(0, 0, centerZ);
  camera.setViewOffset(width, height, width * (.5 - window.x - window.width / 2), height * (.5 - window.y - window.height / 2), width, height);
  camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
}
