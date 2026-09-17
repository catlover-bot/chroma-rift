import { canAdvancePlayerPose, isSafePose, updatePlayer } from '../geometry';
import type { CollisionVolume, PlayerPose, WorldGeometry } from '../types';
import { stageWorld } from '../../stages/mirror-corridor-v1/definition';

const pose = (x: number, z: number): PlayerPose => ({ position: { x, y: 1.6, z }, yaw: Math.PI, pitch: 0 });
const bodyWorld = () => stageWorld(0, false, false, null, { x: 0, y: 0, z: 0 });
const wall: CollisionVolume = { id: 'static-wall', min: { x: -1, y: 0, z: .7 }, max: { x: 1, y: 3, z: .9 }, kind: 'wall', opaque: true };

test('only retreating directions can reduce a pre-existing moving-body overlap', () => {
  const world = bodyWorld(), start = pose(.35, .35);
  expect(isSafePose(start, world)).toBe(false);
  expect(updatePlayer(start, { forward: 1, strafe: 0 }, 1 / 60, world).position.z).toBeGreaterThan(.35);
  expect(updatePlayer(start, { forward: 0, strafe: -1 }, 1 / 60, world).position.x).toBeGreaterThan(.35);
  expect(updatePlayer(start, { forward: -1, strafe: 0 }, 1 / 60, world)).toBe(start);
  expect(updatePlayer(start, { forward: 0, strafe: 1 }, 1 / 60, world)).toBe(start);
  expect(updatePlayer(start, { forward: 0, strafe: 0 }, .05, world)).toBe(start);
  let escaped = start;
  for (let i = 0; i < 20; i += 1) escaped = updatePlayer(escaped, { forward: 1, strafe: 0 }, 1 / 60, world);
  expect(isSafePose(escaped, world)).toBe(true);
});

test('dynamic retreat never crosses a wall, but an open lateral route remains available', () => {
  const world: WorldGeometry = { ...bodyWorld(), solids: [...bodyWorld().solids, wall] };
  let player = pose(.35, .35);
  for (let frame = 0; frame < 30; frame += 1) player = updatePlayer(player, { forward: 1, strafe: 0 }, 1 / 60, world);
  expect(player.position.z).toBeGreaterThan(.35);
  expect(player.position.z).toBeLessThanOrEqual(.46);
  const blocked = player;
  for (let frame = 0; frame < 30; frame += 1) player = updatePlayer(player, { forward: 0, strafe: -1 }, 1 / 60, world);
  expect(player.position.x).toBeGreaterThan(blocked.position.x + .5);
  expect(isSafePose(player, world)).toBe(true);
});

test('an invalid static starting pose or unsupported floor cannot use dynamic escape', () => {
  const world: WorldGeometry = { ...bodyWorld(), solids: [...bodyWorld().solids, wall] };
  for (const start of [pose(.35, .6), pose(2.9, 0)]) {
    expect(canAdvancePlayerPose(start, pose(start.position.x, start.position.z - .05), world)).toBe(false);
    expect(updatePlayer(start, { forward: -1, strafe: 0 }, .05, world)).toBe(start);
  }
});

test('escaping one body cannot enter a different body or treat malformed metadata as safe', () => {
  const first = bodyWorld(), other = stageWorld(0, false, false, null, { x: 1.3, y: 0, z: .35 }).solids.find(s => s.dynamicBody)!;
  const world = { ...first, solids: [...first.solids, { ...other, id: 'second-body' }] };
  let player = pose(.35, .35);
  for (let frame = 0; frame < 60; frame += 1) player = updatePlayer(player, { forward: 0, strafe: -1 }, 1 / 60, world);
  expect(player.position.x).toBeGreaterThan(.35);
  expect(player.position.x).toBeLessThanOrEqual(.62);
  const bad = { ...first, solids: first.solids.map(s => s.dynamicBody ? { ...s, dynamicBody: { radius: Number.NaN } } : s) };
  expect(updatePlayer(pose(.35, .35), { forward: 1, strafe: 0 }, .05, bad).position).toEqual(pose(.35, .35).position);
});
