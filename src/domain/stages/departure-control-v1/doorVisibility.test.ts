import { isSafePose, segmentOccluded, updatePlayer } from '../../firstPerson/geometry';
import { vaultActorEdgeOpen } from '../../vault/actorPolicy';
import { stageWorld } from './definition';
import { PLAYER_HEIGHT } from '../../firstPerson/constants';
import { ACTOR_MODEL_BOUNDS } from '../../actorMotion/envelope';

const acrossDoor = (progress: number, x: number, y: number) => segmentOccluded(
  { x, y, z: 14.6 }, { x, y, z: 15.6 }, stageWorld(progress));

test.each([.95, 1])('visible glass passes eye-height sight while its posts block it at progress %s', progress => {
  expect(acrossDoor(progress, 2.55, 1.6)).toBe(false);
  expect(acrossDoor(progress, 1.98, 1.6)).toBe(true);
  expect(acrossDoor(progress, 3.12, 1.6)).toBe(true);
});

test('a descending steel panel blocks eye-height sight only while it crosses that ray', () => {
  expect(acrossDoor(0, 2.55, 1.6)).toBe(false);
  expect(acrossDoor(.75, 2.55, 1.6)).toBe(true);
  expect(acrossDoor(1, 2.55, 1.6)).toBe(false);
  expect(acrossDoor(1, 2.55, .6)).toBe(true);
  expect(acrossDoor(1, 2.55, 3.1)).toBe(true);
});

test.each([0, .25, .5, .75, 1, 1 - PLAYER_HEIGHT / 3.5, 1 - ACTOR_MODEL_BOUNDS.height / 3.5])('sight changes preserve the original physical slab at progress %s', progress => {
  const world = stageWorld(progress), slab = world.solids.find(solid => solid.id === 'containment-door')!;
  expect(slab.min).toEqual({ x: .8, y: 3.5 * (1 - progress), z: 15 });
  expect(slab.max).toEqual({ x: 4.3, y: 3.5 * (1 - progress) + 3.5, z: 15.18 });
  const original = { ...world, solids: world.solids.filter(solid => !solid.id.startsWith('containment-door-part-')) };
  for (const x of [1.2, 1.98, 2.55, 3.12, 3.9]) {
    for (const z of [14.7, 14.79, 14.8, 14.99, 15.09, 15.19, 15.38, 15.39, 15.4]) {
      const pose = { position: { x, y: 1.6, z }, yaw: Math.PI, pitch: 0 };
      expect(isSafePose(pose, world)).toBe(isSafePose(pose, original));
      expect(updatePlayer(pose, { forward: 1, strafe: 0 }, .1, world)).toEqual(updatePlayer(pose, { forward: 1, strafe: 0 }, .1, original));
    }
    expect(vaultActorEdgeOpen({ x, y: 0, z: 14.5 }, { x, y: 0, z: 15.8 }, world))
      .toBe(vaultActorEdgeOpen({ x, y: 0, z: 14.5 }, { x, y: 0, z: 15.8 }, original));
  }
});
