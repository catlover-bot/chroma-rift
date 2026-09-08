import type { Vec3 } from '../firstPerson/types';
import { ACTOR_MOTION as C } from './config';
import { rotateActorXZ, wrapActorAngle } from './pose';
import type { ActorFoot, ActorFootPlant, ActorMotionIntent, ActorMotionState, ActorMotionStep, ActorMotionTraversal } from './types';
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
const toward = (value: number, target: number, amount: number) => value + clamp(target - value, -amount, amount);
const copy = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
const finitePoint = (p: Vec3) => [p.x, p.y, p.z].every(Number.isFinite);
function nominalFoot(position: Vec3, yaw: number, index: 0 | 1, forward = 0): Vec3 {
  const local = rotateActorXZ({ x: (index === 0 ? -1 : 1) * C.footHalfSpacing, y: 0, z: -forward }, yaw);
  return { x: position.x + local.x, y: 0, z: position.z + local.z };
}
function initialFoot(position: Vec3, yaw: number, index: 0 | 1): ActorFoot {
  const point = nominalFoot(position, yaw, index);
  return { name: index === 0 ? 'left' : 'right', position: point, anchor: copy(point), from: copy(point), yaw, fromYaw: yaw, stance: true, swingTime: 0, swingDuration: .3 };
}
/** Cold initialization and explicit safe recovery only, never a normal turn. */
export function createActorMotion(position: Vec3, yaw = 0): ActorMotionState {
  const safe = finitePoint(position) ? copy(position) : { x: 0, y: 0, z: 0 }, angle = Number.isFinite(yaw) ? wrapActorAngle(yaw) : 0;
  return { position: safe, yaw: angle, desiredHeading: angle, angularVelocity: 0, velocity: { x: 0, y: 0, z: 0 }, speed: 0, travelledDistance: 0, accumulator: 0,
    headYaw: 0, headPitch: 0, chestYaw: 0, chestLean: 0, pelvisShift: 0, turnAge: 1, launchAge: 0, movingIntent: false, gait: 'idle', gaitTime: 0,
    feet: [initialFoot(safe, angle, 0), initialFoot(safe, angle, 1)], swingFoot: null, nextFoot: 0, plantSequence: 0 };
}
function advanceFeet(state: ActorMotionState, distance: number, dt: number, plants: ActorFootPlant[], anticipatedSpeed: number) {
  const stride = C.stride[state.gait], moving = distance > 1e-9, turning = Math.abs(state.angularVelocity) > .12;
  if (state.swingFoot === null && (moving || turning || state.movingIntent)) {
    const distances = state.feet.map(foot => Math.hypot(foot.anchor.x - state.position.x, foot.anchor.z - state.position.z));
    const index: 0 | 1 = Math.max(...distances) > C.footReach * .85 ? distances[0]! > distances[1]! ? 0 : 1 : state.nextFoot;
    const foot = state.feet[index], nominal = nominalFoot(state.position, state.yaw, index);
    const strained = Math.hypot(foot.anchor.x - nominal.x, foot.anchor.z - nominal.z) > stride * .42;
    if (moving || strained || Math.abs(wrapActorAngle(state.yaw - foot.yaw)) >= C.turnReplantAngle) {
      const duration = moving ? clamp(stride / Math.max(state.speed, anticipatedSpeed, .2), .13, .42) : .26;
      state.feet[index] = { ...foot, stance: false, from: copy(foot.position), fromYaw: foot.yaw, swingTime: 0, swingDuration: duration };
      state.swingFoot = index;
    }
  }
  if (state.swingFoot !== null) {
    const index = state.swingFoot, foot = state.feet[index], time = Math.min(foot.swingDuration, foot.swingTime + dt), t = time / foot.swingDuration;
    const remaining = foot.swingDuration - time;
    // Only the airborne foot predicts its landing. Stance anchors never move.
    const future = { x: state.position.x + state.velocity.x * remaining, y: 0, z: state.position.z + state.velocity.z * remaining };
    const target = nominalFoot(future, state.yaw, index, state.speed > .03 ? stride * .48 : 0);
    const blend = t * t * (3 - 2 * t);
    const point = { x: foot.from.x + (target.x - foot.from.x) * blend, y: Math.sin(Math.PI * t) * C.footLift, z: foot.from.z + (target.z - foot.from.z) * blend };
    const reach = Math.hypot(point.x - state.position.x, point.z - state.position.z);
    if (reach > C.footReach) { point.x = state.position.x + (point.x - state.position.x) / reach * C.footReach; point.z = state.position.z + (point.z - state.position.z) / reach * C.footReach; }
    const yaw = wrapActorAngle(foot.fromYaw + wrapActorAngle(state.yaw - foot.fromYaw) * blend);
    if (t >= 1 - 1e-9) {
      point.y = 0; state.feet[index] = { ...foot, position: point, anchor: copy(point), yaw, stance: true, swingTime: 0 };
      state.plantSequence++; plants.push({ foot: foot.name, sequence: state.plantSequence, position: copy(point) });
      state.swingFoot = null; state.nextFoot = index === 0 ? 1 : 0;
    } else state.feet[index] = { ...foot, position: point, yaw, swingTime: time };
  }
  for (const foot of state.feet) if (foot.stance) foot.position = copy(foot.anchor);
}
function substep(previous: ActorMotionState, intent: ActorMotionIntent, dt: number, canTraverse: ActorMotionTraversal, plants: ActorFootPlant[]): ActorMotionState {
  const state: ActorMotionState = { ...previous, feet: previous.feet.map(foot => ({ ...foot, position: copy(foot.position), anchor: copy(foot.anchor), from: copy(foot.from) })) as [ActorFoot, ActorFoot] };
  const dx = intent.target ? intent.target.x - state.position.x : 0, dz = intent.target ? intent.target.z - state.position.z : 0, length = Math.hypot(dx, dz);
  const desired = Number.isFinite(intent.desiredHeading) ? wrapActorAngle(intent.desiredHeading!) : length > 1e-7 ? Math.atan2(-dx, -dz) : state.desiredHeading;
  state.turnAge = Math.abs(wrapActorAngle(desired - state.desiredHeading)) > .15 ? 0 : state.turnAge + dt;
  state.desiredHeading = desired;
  const movingIntent = !!intent.target && length > 1e-7 && intent.maxSpeed > 0;
  state.launchAge = movingIntent ? state.movingIntent ? state.launchAge + dt : 0 : 0; state.movingIntent = movingIntent;
  state.gaitTime = state.gait === intent.gait ? state.gaitTime + dt : 0; state.gait = intent.gait;
  const attention = intent.lookTarget ? Math.atan2(-(intent.lookTarget.x - state.position.x), -(intent.lookTarget.z - state.position.z)) : desired;
  const headTarget = clamp(wrapActorAngle(attention - state.yaw), -C.headYawLimit, C.headYawLimit);
  state.headYaw = toward(state.headYaw, headTarget, C.headMaxYawRate * dt);
  const pitch = intent.lookTarget ? Math.atan2(intent.lookTarget.y - (state.position.y + 1.95), Math.hypot(intent.lookTarget.x - state.position.x, intent.lookTarget.z - state.position.z)) : 0;
  state.headPitch = toward(state.headPitch, clamp(pitch, -C.headPitchLimit, C.headPitchLimit), 1.4 * dt);
  const chestTarget = state.turnAge >= C.chestDelay ? clamp(wrapActorAngle(attention - state.yaw), -C.chestYawLimit, C.chestYawLimit) : 0;
  state.chestYaw = toward(state.chestYaw, chestTarget, 1.4 * dt);
  const error = wrapActorAngle(desired - state.yaw);
  const desiredVelocity = state.turnAge >= C.pelvisDelay ? Math.sign(error) * Math.min(C.bodyMaxYawRate, Math.sqrt(2 * C.bodyMaxYawAcceleration * Math.abs(error)) * .72) : 0;
  const oldVelocity = state.angularVelocity;
  state.angularVelocity = toward(oldVelocity, desiredVelocity, C.bodyMaxYawAcceleration * dt);
  state.yaw = wrapActorAngle(state.yaw + (oldVelocity + state.angularVelocity) * .5 * dt);
  state.headYaw = clamp(state.headYaw - wrapActorAngle(state.yaw - previous.yaw), -C.headYawLimit, C.headYawLimit);
  const alignment = Math.max(0, Math.cos(wrapActorAngle(desired - state.yaw)));
  const targetSpeed = movingIntent && state.launchAge >= C.startAnticipation ? Math.min(intent.maxSpeed, Math.sqrt(2 * C.linearDeceleration * length)) * alignment * alignment : 0;
  state.speed = toward(state.speed, targetSpeed, (targetSpeed >= state.speed ? C.linearAcceleration : C.linearDeceleration) * dt);
  const coasting = !intent.target && !movingIntent && Math.hypot(previous.velocity.x, previous.velocity.z) > 1e-8;
  const distance = movingIntent ? Math.min(length, state.speed * dt) : coasting ? state.speed * dt : 0;
  const directionLength = movingIntent ? length : Math.hypot(previous.velocity.x, previous.velocity.z);
  const travelX = movingIntent ? dx : previous.velocity.x, travelZ = movingIntent ? dz : previous.velocity.z;
  const next = distance > 0 ? { x: state.position.x + travelX / directionLength * distance, y: state.position.y, z: state.position.z + travelZ / directionLength * distance } : state.position;
  const supportsReach = state.feet.every(foot => !foot.stance || Math.hypot(foot.anchor.x - next.x, foot.anchor.z - next.z) <= C.footReach + 1e-9);
  if (distance > 0 && supportsReach && canTraverse(state.position, next)) {
    state.velocity = { x: (next.x - state.position.x) / dt, y: 0, z: (next.z - state.position.z) / dt }; state.position = next; state.travelledDistance += distance;
  } else { state.velocity = { x: 0, y: 0, z: 0 }; state.speed = 0; }
  if (movingIntent && distance >= length - 1e-9) { state.speed = 0; state.velocity = { x: 0, y: 0, z: 0 }; }
  const moved = Math.hypot(state.position.x - previous.position.x, state.position.z - previous.position.z);
  const leanTarget = intent.gait === 'pursue' ? .065 : intent.gait === 'windup' ? -.035 : intent.gait === 'attack' ? .09 : intent.gait === 'notice' ? .025 : state.speed > .1 ? .022 : 0;
  state.chestLean += (leanTarget - state.chestLean) * (1 - Math.exp(-7 * dt));
  const support = state.swingFoot === 0 ? 1 : state.swingFoot === 1 ? -1 : 0;
  state.pelvisShift += (support * .012 - state.pelvisShift) * (1 - Math.exp(-8 * dt));
  advanceFeet(state, moved, dt, plants, intent.maxSpeed);
  return state;
}
export function advanceActorMotion(previous: ActorMotionState, intent: ActorMotionIntent, dt: number, canTraverse: ActorMotionTraversal): ActorMotionStep {
  if (!Number.isFinite(dt) || dt <= 0 || !Number.isFinite(intent.maxSpeed) || intent.maxSpeed < 0 || (intent.target && !finitePoint(intent.target)) || (intent.lookTarget && !finitePoint(intent.lookTarget))) return { state: previous, movedDistance: 0, footPlants: [] };
  let state = previous, remaining = previous.accumulator + Math.min(C.maxDelta, dt);
  const plants: ActorFootPlant[] = [], before = previous.travelledDistance;
  while (remaining + 1e-12 >= C.fixedStep) { state = substep(state, intent, C.fixedStep, canTraverse, plants); remaining -= C.fixedStep; }
  state = { ...state, accumulator: Math.max(0, remaining) };
  return { state, movedDistance: state.travelledDistance - before, footPlants: plants };
}
