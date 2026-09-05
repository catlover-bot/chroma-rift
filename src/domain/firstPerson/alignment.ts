import { OBSERVATION_POSE } from './chapter';
import { forwardVector, segmentOccluded, shapeSegmentOccluded } from './geometry';
import type { CameraMatrices, PlayerPose, Vec3, WorldGeometry } from './types';

type ClipPoint = { x: number; y: number; z: number; w: number };
function multiply(matrix: readonly number[], p: ClipPoint): ClipPoint {
  return {
    x: matrix[0]! * p.x + matrix[4]! * p.y + matrix[8]! * p.z + matrix[12]! * p.w,
    y: matrix[1]! * p.x + matrix[5]! * p.y + matrix[9]! * p.z + matrix[13]! * p.w,
    z: matrix[2]! * p.x + matrix[6]! * p.y + matrix[10]! * p.z + matrix[14]! * p.w,
    w: matrix[3]! * p.x + matrix[7]! * p.y + matrix[11]! * p.z + matrix[15]! * p.w,
  };
}
/** Column-major matrices taken directly from the live Three PerspectiveCamera. */
export function projectWithCamera(point: Vec3, camera: CameraMatrices): Vec3 | undefined {
  if (camera.view.length !== 16 || camera.projection.length !== 16 || ![...camera.view, ...camera.projection].every(Number.isFinite)) return undefined;
  const clip = multiply(camera.projection, multiply(camera.view, { ...point, w: 1 }));
  if (clip.w <= 0.00001) return undefined;
  const projected = { x: clip.x / clip.w, y: clip.y / clip.w, z: clip.z / clip.w };
  return Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1 ? projected : undefined;
}

export type AlignmentResult = { aligned: boolean; error: number; reason: 'aligned' | 'position' | 'frame' | 'occluded' | 'shape' | 'aim' | 'camera' };
export function evaluateKeyAlignment(pose: PlayerPose, world: WorldGeometry, camera: CameraMatrices, previouslyAligned = false): AlignmentResult {
  const fail = (reason: AlignmentResult['reason'], error = Infinity): AlignmentResult => ({ aligned: false, error, reason });
  if (camera.view.length !== 16 || camera.projection.length !== 16 || ![...camera.view, ...camera.projection].every(Number.isFinite)) return fail('camera');
  const cameraOrigin = multiply(camera.view, { ...pose.position, w: 1 });
  const cameraForward = multiply(camera.view, { ...forwardVector(pose), w: 0 });
  if (Math.hypot(cameraOrigin.x, cameraOrigin.y, cameraOrigin.z) > 0.0001 || Math.hypot(cameraForward.x, cameraForward.y, cameraForward.z + 1) > 0.0001) return fail('camera');
  // This broad observation bay is only a precondition. Actual displayed shape
  // agreement, aim, view-frustum inclusion and occlusion decide success below.
  if (Math.hypot(pose.position.x - OBSERVATION_POSE.position.x, pose.position.z - OBSERVATION_POSE.position.z) > 1.2) return fail('position');
  const { center, width, height } = world.keyFrame;
  const corners = [
    { x: center.x - width / 2, y: center.y - height / 2, z: center.z },
    { x: center.x + width / 2, y: center.y - height / 2, z: center.z },
    { x: center.x + width / 2, y: center.y + height / 2, z: center.z },
    { x: center.x - width / 2, y: center.y + height / 2, z: center.z },
  ].map((point) => projectWithCamera(point, camera));
  const frame = projectWithCamera(center, camera);
  if (!frame || corners.some((point) => !point)) return fail('frame');
  const points = corners as Vec3[];
  const frameWidth = Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x));
  const frameHeight = Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y));
  if (frameWidth <= 0.001 || frameHeight <= 0.001) return fail('frame');
  if (Math.abs(frame.x) / frameWidth > (previouslyAligned ? 0.23 : 0.19) || Math.abs(frame.y) / frameHeight > (previouslyAligned ? 0.23 : 0.19)) return fail('aim');
  let error = 0;
  for (let i = 0; i < world.keyFragments.length; i += 1) {
    const fragment = world.keyFragments[i]!;
    const outline = world.keyFrame.outline[i]!;
    for (let j = 0; j < fragment.points.length; j += 1) {
      const point = fragment.points[j]!;
      const target = outline[j]!;
      const rendered = projectWithCamera(point, camera);
      const expected = projectWithCamera(target, camera);
      if (!rendered || !expected) return fail('frame');
      if (segmentOccluded(pose.position, point, world) || segmentOccluded(pose.position, target, world)) return fail('occluded');
      if (j > 0 && (shapeSegmentOccluded(pose.position, fragment.points[j - 1]!, point, world) || shapeSegmentOccluded(pose.position, outline[j - 1]!, target, world))) return fail('occluded');
      error = Math.max(error, Math.hypot((rendered.x - expected.x) / frameWidth, (rendered.y - expected.y) / frameHeight));
    }
  }
  return error <= (previouslyAligned ? 0.095 : 0.075) ? { aligned: true, error, reason: 'aligned' } : fail('shape', error);
}
