import type { Vec3 } from '../firstPerson/types';
import type { ActorMotionState, ActorPose } from './types';
export const wrapActorAngle = (angle: number): number => Math.atan2(Math.sin(angle), Math.cos(angle));
export function rotateActorXZ(point: Vec3, yaw: number): Vec3 {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { x: c * point.x + s * point.z, y: point.y, z: -s * point.x + c * point.z };
}
export function actorFootLocal(state: ActorMotionState, index: 0 | 1) {
  const foot = state.feet[index];
  return { position: rotateActorXZ({ x: foot.position.x - state.position.x, y: foot.position.y, z: foot.position.z - state.position.z }, -state.yaw), yaw: wrapActorAngle(foot.yaw - state.yaw), stance: foot.stance };
}
export function sampleActorPose(state: ActorMotionState): ActorPose {
  const swing = state.swingFoot === null ? 0 : Math.sin(Math.PI * Math.min(1, state.feet[state.swingFoot].swingTime / state.feet[state.swingFoot].swingDuration));
  const side = state.swingFoot === 0 ? 1 : -1, energy = Math.min(1, state.speed / 1.3);
  const attention = state.gait === 'notice' || state.gait === 'windup';
  return { pelvisShift: state.pelvisShift, chestYaw: state.chestYaw, chestLean: state.chestLean,
    headPosition: { x: state.pelvisShift + .015, y: 1.95, z: -.015 - state.chestLean * .52 },
    headYaw: state.headYaw, headPitch: state.headPitch, headRoll: -.06,
    leftArm: -.025 - side * swing * .12 * energy - (attention ? .055 : 0),
    rightArm: .012 + side * swing * .065 * energy - (state.gait === 'pursue' ? .045 : 0),
    leftElbow: .07 + swing * .05 * energy, rightElbow: .04 + swing * .025 * energy,
    leftFoot: actorFootLocal(state, 0), rightFoot: actorFootLocal(state, 1) };
}
/** Exactly the center and direction of the rendered face. Head and chest are
 * siblings, so a delayed chest does not silently change the eyes' LOS. */
export function actorMotionEye(state: ActorMotionState): { position: Vec3; yaw: number; pitch: number; direction: Vec3 } {
  const pose = sampleActorPose(state), head = rotateActorXZ(pose.headPosition, state.yaw);
  const yaw = wrapActorAngle(state.yaw + pose.headYaw), pitch = pose.headPitch;
  const direction = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
  return { position: { x: state.position.x + head.x + direction.x * .085, y: state.position.y + head.y + direction.y * .085, z: state.position.z + head.z + direction.z * .085 }, yaw, pitch, direction };
}

/** Flat-floor two-link IK. The foot target is the authoritative world anchor
 * transformed into body-local space; this calculation never moves the root. */
export function actorLegKnee(hip: Vec3, ankle: Vec3): Vec3 {
  const dx = ankle.x - hip.x, dy = ankle.y - hip.y, dz = ankle.z - hip.z;
  const distance = Math.max(1e-7, Math.hypot(dx, dy, dz)), ux = dx / distance, uy = dy / distance, uz = dz / distance;
  const length = .42, along = Math.min(distance, length * 2) * .5;
  const bend = Math.sqrt(Math.max(0, length * length - along * along));
  // Project body-forward onto the plane normal to hip -> ankle.
  const px = uz * ux, py = uz * uy, pz = -1 + uz * uz, pole = Math.max(1e-7, Math.hypot(px, py, pz));
  return { x: hip.x + ux * along + px / pole * bend, y: hip.y + uy * along + py / pole * bend, z: hip.z + uz * along + pz / pole * bend };
}
