import { EYE_HEIGHT, PLAYER_HEIGHT, PLAYER_RADIUS } from './chapter';
import type { CollisionVolume, MovementInput, PlayerPose, Vec3, WorldGeometry } from './types';

export const MOVE_SPEED = 2.15;
export const INPUT_DEAD_ZONE = 0.14;
export const MAX_FRAME_DELTA = 0.25;
export const MAX_PITCH = 1.1;
export function clamp(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
export function forwardVector(pose: Pick<PlayerPose, 'yaw' | 'pitch'>): Vec3 {
  return { x: -Math.sin(pose.yaw) * Math.cos(pose.pitch), y: Math.sin(pose.pitch), z: -Math.cos(pose.yaw) * Math.cos(pose.pitch) };
}
export function adjustLook(pose: PlayerPose, deltaYaw: number, deltaPitch: number): PlayerPose {
  if (!Number.isFinite(deltaYaw) || !Number.isFinite(deltaPitch)) return pose;
  const yaw = ((pose.yaw + deltaYaw + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return { ...pose, yaw, pitch: clamp(pose.pitch + deltaPitch, -MAX_PITCH, MAX_PITCH) };
}
export function normalizedInput(input: MovementInput): MovementInput {
  if (!Number.isFinite(input.strafe) || !Number.isFinite(input.forward)) return { strafe: 0, forward: 0 };
  const length = Math.hypot(input.strafe, input.forward);
  if (length <= INPUT_DEAD_ZONE) return { strafe: 0, forward: 0 };
  const magnitude = (Math.min(1, length) - INPUT_DEAD_ZONE) / (1 - INPUT_DEAD_ZONE);
  return { strafe: input.strafe / length * magnitude, forward: input.forward / length * magnitude };
}
export function circleIntersectsBox(position: Vec3, volume: CollisionVolume, radius = PLAYER_RADIUS): boolean {
  if (volume.min.y >= PLAYER_HEIGHT || volume.max.y <= 0.04) return false;
  const x = clamp(position.x, volume.min.x, volume.max.x);
  const z = clamp(position.z, volume.min.z, volume.max.z);
  return (position.x - x) ** 2 + (position.z - z) ** 2 < radius ** 2 - 0.0000001;
}
function floorSupports(position: Vec3, world: WorldGeometry): boolean {
  // Union of the same flat room rectangles that the renderer draws. Checking
  // the footprint, rather than only its center, keeps toes inside the chapter.
  for (let i = -1; i < 8; i += 1) {
    const x = position.x + (i < 0 ? 0 : Math.cos(i * Math.PI / 4) * PLAYER_RADIUS);
    const z = position.z + (i < 0 ? 0 : Math.sin(i * Math.PI / 4) * PLAYER_RADIUS);
    if (!world.floors.some((floor) => x >= floor.minX && x <= floor.maxX && z >= floor.minZ && z <= floor.maxZ)) return false;
  }
  return true;
}
export function isSafePose(pose: PlayerPose, world: WorldGeometry): boolean {
  const { position, yaw, pitch } = pose;
  if (![position.x, position.y, position.z, yaw, pitch].every(Number.isFinite) || Math.abs(position.y - EYE_HEIGHT) > 0.001 || Math.abs(pitch) > MAX_PITCH) return false;
  return floorSupports(position, world) && !world.solids.some((volume) => circleIntersectsBox(position, volume));
}
export function updatePlayer(pose: PlayerPose, input: MovementInput, dt: number, world: WorldGeometry): PlayerPose {
  if (!Number.isFinite(dt) || dt <= 0 || !isSafePose(pose, world)) return pose;
  const motion = normalizedInput(input);
  const elapsed = Math.min(MAX_FRAME_DELTA, dt);
  const distance = MOVE_SPEED * elapsed;
  const dx = (Math.cos(pose.yaw) * motion.strafe - Math.sin(pose.yaw) * motion.forward) * distance;
  const dz = (-Math.sin(pose.yaw) * motion.strafe - Math.cos(pose.yaw) * motion.forward) * distance;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (PLAYER_RADIUS / 3)));
  let position = pose.position;
  for (let i = 0; i < steps; i += 1) {
    const xCandidate = { ...position, x: position.x + dx / steps };
    if (isSafePose({ ...pose, position: xCandidate }, world)) position = xCandidate;
    const zCandidate = { ...position, z: position.z + dz / steps };
    if (isSafePose({ ...pose, position: zCandidate }, world)) position = zCandidate;
  }
  return position === pose.position ? pose : { ...pose, position };
}

export function rayBoxDistance(origin: Vec3, direction: Vec3, volume: CollisionVolume): number | undefined {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (const axis of ['x', 'y', 'z'] as const) {
    if (Math.abs(direction[axis]) < 0.0000001) {
      if (origin[axis] < volume.min[axis] || origin[axis] > volume.max[axis]) return undefined;
    } else {
      const a = (volume.min[axis] - origin[axis]) / direction[axis];
      const b = (volume.max[axis] - origin[axis]) / direction[axis];
      near = Math.max(near, Math.min(a, b));
      far = Math.min(far, Math.max(a, b));
      if (near > far) return undefined;
    }
  }
  return far >= 0 ? near : undefined;
}
export function raySphereDistance(origin: Vec3, direction: Vec3, center: Vec3, radius: number): number | undefined {
  const offset = { x: origin.x - center.x, y: origin.y - center.y, z: origin.z - center.z };
  const along = offset.x * direction.x + offset.y * direction.y + offset.z * direction.z;
  const discriminant = along * along - (offset.x ** 2 + offset.y ** 2 + offset.z ** 2 - radius ** 2);
  if (discriminant < 0) return undefined;
  const near = -along - Math.sqrt(discriminant);
  const far = -along + Math.sqrt(discriminant);
  return near >= 0 ? near : far >= 0 ? 0 : undefined;
}
export function segmentOccluded(origin: Vec3, target: Vec3, world: WorldGeometry, ignoreId?: string): boolean {
  const difference = { x: target.x - origin.x, y: target.y - origin.y, z: target.z - origin.z };
  const length = Math.hypot(difference.x, difference.y, difference.z);
  if (length < 0.00001) return false;
  const direction = { x: difference.x / length, y: difference.y / length, z: difference.z / length };
  return world.solids.some((volume) => {
    if (!volume.opaque || volume.id === ignoreId) return false;
    const distance = rayBoxDistance(origin, direction, volume);
    return distance !== undefined && distance < length - 0.025;
  });
}

/** Any occlusion along a whole line fragment, not only its end points. The
 * camera and line form a triangle; clip it against each opaque box. A remaining
 * polygon certifies that some ray towards the visible line meets the wall. */
export function shapeSegmentOccluded(origin: Vec3, start: Vec3, end: Vec3, world: WorldGeometry): boolean {
  return world.solids.some((volume) => {
    if (!volume.opaque) return false;
    let polygon = [origin, start, end];
    for (const axis of ['x', 'y', 'z'] as const) {
      for (const side of ['min', 'max'] as const) {
        if (!polygon.length) return false;
        const boundary = volume[side][axis];
        const sign = side === 'min' ? 1 : -1;
        const input = polygon;
        polygon = [];
        for (let i = 0; i < input.length; i += 1) {
          const a = input[i]!;
          const b = input[(i + 1) % input.length]!;
          const da = sign * (a[axis] - boundary);
          const db = sign * (b[axis] - boundary);
          if (da >= 0) polygon.push(a);
          if ((da >= 0) !== (db >= 0)) {
            const t = da / (da - db);
            polygon.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
          }
        }
      }
    }
    return polygon.length > 0;
  });
}
