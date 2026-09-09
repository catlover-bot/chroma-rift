import { PLAYER_RADIUS } from './constants';
import type { CollisionVolume, PlayerPose, Vec3 } from './types';

function regionCorners(region: CollisionVolume): Vec3[] {
  return [region.min.x, region.max.x].flatMap((x) => [region.min.y, region.max.y].flatMap((y) => [region.min.z, region.max.z].map((z) => ({ x, y, z }))));
}
/** Certifies an entire convex changed volume lies behind one opaque rectangle.
 * Every ray to that volume crosses the same wall plane within its rectangle;
 * fractional-linear extrema occur at box vertices. This does not depend on yaw
 * or a one-point frustum test, so a simultaneous turn cannot expose a swap. */
export function occlusionCertificate(pose: PlayerPose, changed: CollisionVolume, blockers: readonly CollisionVolume[]): string | undefined {
  for (const wall of blockers) {
    if (!wall.opaque || wall.kind !== 'wall') continue;
    const xThin = wall.max.x - wall.min.x <= 0.25;
    const zThin = wall.max.z - wall.min.z <= 0.25;
    if (!xThin && !zThin) continue;
    const axis = xThin ? 'x' : 'z';
    const across = axis === 'x' ? 'z' : 'x';
    const plane = (wall.min[axis] + wall.max[axis]) / 2;
    const cameraSide = pose.position[axis] - plane;
    if (Math.abs(cameraSide) < PLAYER_RADIUS) continue;
    const hidden = regionCorners(changed).every((point) => {
      const targetSide = point[axis] - plane;
      if (cameraSide * targetSide >= 0) return false;
      const t = (plane - pose.position[axis]) / (point[axis] - pose.position[axis]);
      const horizontal = pose.position[across] + (point[across] - pose.position[across]) * t;
      const vertical = pose.position.y + (point.y - pose.position.y) * t;
      return horizontal > wall.min[across] + 0.03 && horizontal < wall.max[across] - 0.03 && vertical > wall.min.y + 0.03 && vertical < wall.max.y - 0.03;
    });
    if (hidden) return wall.id;
  }
  return undefined;
}
