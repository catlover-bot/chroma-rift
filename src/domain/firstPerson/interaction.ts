import { cameraMatchesPose, evaluateKeyAlignment, projectWithCamera } from './alignment';
import { clamp, forwardVector, rayBoxDistance, raySphereDistance, segmentOccluded } from './geometry';
import type { CameraMatrices, InteractableDefinition, PlayerPose, PuzzleState, WorldGeometry } from './types';

/** Product tuning in radians. Only authored, visible guide/device/door fixtures
 * gain this central acquisition area. The overlapping key keeps its exact ray. */
export const INTERACTION_CONE_DEGREES = 6;
export const INTERACTION_CONE_RADIANS = INTERACTION_CONE_DEGREES * Math.PI / 180;

export type InteractionEvaluation = {
  kind: 'ready' | 'locked' | 'approach' | 'aim';
  target: InteractableDefinition;
  actionLabel: string;
  reason?: string;
} | { kind: 'none'; target?: undefined; actionLabel?: undefined; reason?: undefined };

function actionLabel(target: InteractableDefinition): string {
  switch (target.id) {
    case 'guide': return 'しるべを調べる';
    case 'floor-device': return '装置を動かす';
    case 'key': return '鍵を重ねる';
    case 'exit': return '扉を開く';
  }
}

function lockedReason(target: InteractableDefinition, progress: PuzzleState | undefined, aligned: boolean): string | undefined {
  if (!progress) return undefined;
  switch (target.id) {
    case 'guide': return progress.guideExamined ? 'しるべは調べました。' : undefined;
    case 'floor-device':
      if (progress.sealA) return '装置は動いています。奥の回廊へ進もう。';
      if (!progress.guideExamined) return '入口の光のしるべを先に調べよう。';
      return progress.markActivated ? undefined : '床の輪に入ると、装置の封印が解けます。';
    case 'key':
      if (progress.sealB) return '鍵は重なりました。入口へ戻ろう。';
      if (!progress.sealA) return '先に床の装置を動かそう。';
      return aligned ? undefined : '観察の輪から、欠けた鍵の形を重ねよう。';
    case 'exit':
      if (progress.exitDoorOpen) return '扉は開いています。外へ歩こう。';
      return progress.variant === 'exit' && progress.sealA && progress.sealB ? undefined : '二つの封印を解くと開きます。';
  }
}

/** Shared HUD and action eligibility. A fresh press runs this again; labels
 * never authorize an action by themselves. Projection is required for broad
 * visibility cues, while central ray/cone checks use the current world pose. */
export function evaluateInteraction(world: WorldGeometry, pose: PlayerPose, progress?: PuzzleState, matrices?: CameraMatrices, previouslyAligned = false): InteractionEvaluation {
  if (![pose.position.x, pose.position.y, pose.position.z, pose.yaw, pose.pitch].every(Number.isFinite)) return { kind: 'none' };
  const ray = forwardVector(pose);
  const matchingCamera = !!matrices && cameraMatchesPose(pose, matrices);
  if (matrices && !matchingCamera) return { kind: 'none' };
  const candidates = world.interactables.flatMap((target) => {
    const difference = { x: target.center.x - pose.position.x, y: target.center.y - pose.position.y, z: target.center.z - pose.position.z };
    const distance = Math.hypot(difference.x, difference.y, difference.z);
    if (![distance, target.radius, target.maxDistance].every(Number.isFinite) || distance <= 0 || target.radius <= 0 || target.maxDistance <= 0) return [];
    const cosine = (difference.x * ray.x + difference.y * ray.y + difference.z * ray.z) / distance;
    if (cosine <= 0) return [];
    const angle = Math.acos(clamp(cosine, -1, 1));
    if (matchingCamera && !projectWithCamera(target.center, matrices!)) return [];
    const exactDistance = raySphereDistance(pose.position, ray, target.center, target.radius);
    // Never acquire an unseen fixture by clipping an enlarged hotspot around a
    // wall edge. Exact hits also retain their original opaque-ray check.
    if (segmentOccluded(pose.position, target.center, world, `${target.id}-body`)) return [];
    const exact = exactDistance !== undefined && !world.solids.some((solid) => {
      if (!solid.opaque || solid.id === `${target.id}-body`) return false;
      const obstacle = rayBoxDistance(pose.position, ray, solid);
      return obstacle !== undefined && obstacle < exactDistance - 0.02;
    });
    const central = target.id !== 'key' && angle <= INTERACTION_CONE_RADIANS;
    const acquired = exact || central;
    if (!acquired && (!matchingCamera || !projectWithCamera(target.center, matrices!))) return [];
    // Preserve near-surface reach for exact hits. Cone acquisition measures the
    // same authored sphere along its center ray, never an expanded hidden one.
    const reachDistance = exact ? exactDistance! : Math.max(0, distance - target.radius);
    return [{ target, angle, distance, exact, acquired, reachable: reachDistance <= target.maxDistance }];
  });
  const acquired = candidates.filter((candidate) => candidate.acquired && candidate.reachable).sort((a, b) =>
    Number(b.exact) - Number(a.exact) || (a.exact && b.exact ? a.distance - b.distance : a.angle - b.angle || a.distance - b.distance) || a.target.id.localeCompare(b.target.id));
  const selected = acquired[0];
  if (selected) {
    const aligned = selected.target.id === 'key' && !!matrices && evaluateKeyAlignment(pose, world, matrices, previouslyAligned).aligned;
    const reason = lockedReason(selected.target, progress, aligned);
    return { kind: reason ? 'locked' : 'ready', target: selected.target, actionLabel: actionLabel(selected.target), ...(reason ? { reason } : {}) };
  }
  // These cues explain a visible object; they cannot become an action target.
  // Require the real camera for distant cues as in the renderer readiness path.
  const visible = matchingCamera ? candidates.filter((candidate) => !!projectWithCamera(candidate.target.center, matrices!)).sort((a, b) => a.distance - b.distance || a.angle - b.angle || a.target.id.localeCompare(b.target.id))[0] : undefined;
  return visible ? { kind: visible.reachable ? 'aim' : 'approach', target: visible.target, actionLabel: actionLabel(visible.target) } : { kind: 'none' };
}
