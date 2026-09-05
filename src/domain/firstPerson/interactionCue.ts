import { cameraMatchesPose, projectWithCamera } from './alignment';
import { segmentOccluded } from './geometry';
import { findInteraction } from './runtime';
import type { CameraMatrices, InteractableDefinition, PlayerPose, WorldGeometry } from './types';

export type InteractionCue = { kind: 'ready' | 'approach' | 'aim'; target: InteractableDefinition } | { kind: 'none'; target?: undefined };

/** Explanation only. All actions still use findInteraction/interact, including
 * their original range and wall tests; a visible distant object is not usable. */
export function interactionCue(world: WorldGeometry, pose: PlayerPose, matrices?: CameraMatrices): InteractionCue {
  const ready = findInteraction(world, pose);
  if (ready) return { kind: 'ready', target: ready };
  if (!matrices || !cameraMatchesPose(pose, matrices)) return { kind: 'none' };
  const visible = world.interactables.flatMap((target) => {
    if (!projectWithCamera(target.center, matrices) || segmentOccluded(pose.position, target.center, world, `${target.id}-body`)) return [];
    const distance = Math.hypot(target.center.x - pose.position.x, target.center.y - pose.position.y, target.center.z - pose.position.z);
    // The established interaction rule measures the near surface of its sphere,
    // not the center. Looking exactly at the target can reach this distance.
    return [{ target, distance, reachable: Math.max(0, distance - target.radius) <= target.maxDistance }];
  }).sort((a, b) => a.distance - b.distance || a.target.id.localeCompare(b.target.id));
  const nearest = visible[0];
  return nearest ? { kind: nearest.reachable ? 'aim' : 'approach', target: nearest.target } : { kind: 'none' };
}
