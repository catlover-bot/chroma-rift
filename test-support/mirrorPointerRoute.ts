import { MOVE_SPEED, inspectPoseSafety, isSafePose } from '../src/domain/firstPerson/geometry';
import type { Vec3 } from '../src/domain/firstPerson/types';
import { isStageSession } from '../src/domain/stages/mirror-corridor-v1/session';
import { controllerSnapshot, worldForController, type RuntimeController } from '../src/rendering/firstPerson/runtimeController';
import type { NativeTouchBatch, TouchPhase } from '../src/rendering/firstPerson/touchAdapter';

export type MirrorPointerPort = {
  controller: RuntimeController;
  /** Each port must use actual rendered Screen event handlers. */
  touch(region: 'movement-stick' | 'look-region' | 'interact', phase: TouchPhase, event: NativeTouchBatch): Promise<void>;
  press(): Promise<void>;
  frames(count: number, dt: number): Promise<void>;
};
const point = (identifier: number, pageX: number, pageY: number) => ({ identifier, pageX, pageY });
export function mirrorPointerRoute(port: MirrorPointerPort, dt = 1 / 60) {
  const c = port.controller;
  let id = 100;
  const contacts = new Map<number, ReturnType<typeof point>>();
  const live = () => {
    const state = c.runtime.stageSession?.value;
    if (!isStageSession(state)) throw new Error('Missing actual mirror session');
    return state;
  };
  const send = async (region: 'movement-stick' | 'look-region' | 'interact', phase: TouchPhase,
    identifier: number, x: number, y: number) => {
    const p = point(identifier, x, y);
    if (phase === 'end' || phase === 'cancel') contacts.delete(identifier); else contacts.set(identifier, p);
    await port.touch(region, phase, { changedTouches: [p], targetTouches: phase === 'end' || phase === 'cancel' ? [] : [p], touches: [...contacts.values()] });
  };
  const wait = async (seconds: number) => {
    const frames = Math.ceil(seconds / dt);
    await port.frames(frames, seconds / frames);
  };
  const aim = async (target: Vec3) => {
    const p = c.runtime.pose, dx = target.x - p.position.x, dz = target.z - p.position.z;
    const desired = Math.atan2(-dx, -dz), raw = desired - p.yaw;
    const yaw = Math.atan2(Math.sin(raw), Math.cos(raw));
    const pitch = Math.atan2(target.y - p.position.y, Math.hypot(dx, dz)) - p.pitch;
    const pointer = ++id;
    await send('look-region', 'start', pointer, 300, 300);
    await send('look-region', 'move', pointer, 300 - yaw / (.003 * c.sensitivity), 300 - pitch / (.003 * c.sensitivity * c.verticalSensitivity));
    await send('look-region', 'end', pointer, 300 - yaw / (.003 * c.sensitivity), 300 - pitch / (.003 * c.sensitivity * c.verticalSensitivity));
    await port.frames(1, dt);
  };
  const walk = async (x: number, z: number) => {
    if (!isSafePose(c.runtime.pose, worldForController(c))) throw new Error(`Illegal route origin ${JSON.stringify(inspectPoseSafety(c.runtime.pose, worldForController(c)))}`);
    await aim({ x, y: c.runtime.pose.position.y, z });
    const pointer = ++id;
    await send('movement-stick', 'start', pointer, 40, 600);
    await send('movement-stick', 'move', pointer, 40, 550);
    let lastDistance = Infinity, stalled = 0;
    for (let pass = 0; pass < 350; pass++) {
      const p = c.runtime.pose.position, distance = Math.hypot(x - p.x, z - p.z);
      if (distance < .035 || c.runtime.progress.cleared) break;
      if (distance >= lastDistance - .001) stalled++; else stalled = 0;
      if (stalled > 12 || c.captureRecovery) throw new Error(`Route stopped toward ${x},${z}: ${JSON.stringify({ pose: p, actor: live().actor.phase, safety: inspectPoseSafety(c.runtime.pose, worldForController(c)), paused: c.runtime.paused, input: c.input })}`);
      lastDistance = distance;
      const frames = Math.max(1, Math.min(12, Math.floor(distance / (MOVE_SPEED * dt))));
      await port.frames(frames, Math.min(dt, distance / MOVE_SPEED));
    }
    await send('movement-stick', 'end', pointer, 40, 550);
    const p = c.runtime.pose.position;
    if (!c.runtime.progress.cleared && Math.hypot(x - p.x, z - p.z) >= .04) throw new Error(`Failed waypoint ${x},${z}`);
  };
  const press = async (targetId: string, target: Vec3) => {
    await aim(target);
    if (controllerSnapshot(c).target?.id !== targetId) throw new Error(`Cannot acquire ${targetId}: ${JSON.stringify(controllerSnapshot(c).cue)}`);
    await port.press();
    await port.frames(1, dt);
  };
  let holdId: number | undefined;
  const hold = async (target: Vec3) => {
    await aim(target);
    holdId = ++id;
    await send('interact', 'start', holdId, 320, 700);
    if (!live().holding) throw new Error('Screen hold not acquired');
  };
  const release = async (phase: 'end' | 'cancel' = 'end') => {
    if (holdId === undefined) throw new Error('No held pointer');
    // A completed hold can have disappeared from the action slot. The contact's
    // original handler must still retire its owner; the port retains that ref.
    await send('interact', phase, holdId, 320, 700);
    holdId = undefined;
  };
  return { live, aim, walk, press, hold, release, wait, send };
}
