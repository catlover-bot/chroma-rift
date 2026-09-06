import { PerspectiveCamera } from 'three';
import { createInitialRuntime, evaluateInteraction, findInteraction, getWorld, interactionCue, OBSERVATION_POSE, projectWithCamera, segmentOccluded } from '..';
import type { CameraMatrices, InteractableDefinition, PlayerPose, Vec3, WorldGeometry } from '..';

const origin: PlayerPose = { position: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0 };
const panel: InteractableDefinition = {
  id: 'emblem-panel', label: '触れない紋章', center: { x: 0, y: 1.6, z: -2 }, radius: 0.01, maxDistance: 2.2,
  rectangle: { width: 4, height: 1.6, normal: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 } },
};
function worldFor(target: InteractableDefinition = panel): WorldGeometry {
  return { ...getWorld(createInitialRuntime()), solids: [], interactables: [target] };
}
function aim(point: Vec3, pose = origin): PlayerPose {
  const dx = point.x - pose.position.x;
  const dz = point.z - pose.position.z;
  return { ...pose, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(point.y - pose.position.y, Math.hypot(dx, dz)) };
}
function camera(pose: PlayerPose, aspect = 390 / 844): CameraMatrices {
  const view = new PerspectiveCamera(65, aspect, 0.08, 60);
  view.position.set(pose.position.x, pose.position.y, pose.position.z);
  view.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  view.updateMatrixWorld(true);
  return { view: [...view.matrixWorldInverse.elements], projection: [...view.projectionMatrix.elements] };
}

describe('whole visible emblem rectangle acquisition (real Three math, no GPU)', () => {
  it('uses an exact visible plate edge even when its center is outside the portrait camera and the sphere misses', () => {
    const pose = { ...origin, position: { ...origin.position, x: 1.9 } };
    const matrices = camera(pose);
    expect(projectWithCamera(panel.center, matrices)).toBeUndefined();
    expect(interactionCue(worldFor(), pose, matrices)).toMatchObject({ kind: 'ready', target: { id: 'emblem-panel' }, actionLabel: '紋章を調べる' });
    expect(findInteraction(worldFor(), pose)?.id).toBe('emblem-panel');
    // A rectangle never inherits its compatibility sphere's size or reach.
    expect(evaluateInteraction(worldFor({ ...panel, radius: NaN }), pose, undefined, matrices).kind).toBe('ready');
  });
  it.each([[-2, 0.8], [-2, -0.8], [2, 0.8], [2, -0.8]])('includes actual plate corner %s,%s', (x, y) => {
    const pose = aim({ x: x!, y: panel.center.y + y!, z: panel.center.z });
    expect(evaluateInteraction(worldFor({ ...panel, maxDistance: 4 }), pose, undefined, camera(pose)).kind).toBe('ready');
  });
  it.each([[2.01, 0], [-2.01, 0], [0, 0.81], [0, -0.81]])('does not expand the plate beyond edge %s,%s', (x, y) => {
    const pose = aim({ x: x!, y: panel.center.y + y!, z: panel.center.z });
    expect(findInteraction(worldFor({ ...panel, maxDistance: 4, radius: 100 }), pose)).toBeUndefined();
    expect(evaluateInteraction(worldFor({ ...panel, maxDistance: 4, radius: 100 }), pose, undefined, camera(pose)).kind).not.toBe('ready');
  });
  it('measures distance to the actual touched surface point instead of the center or bounding sphere', () => {
    const pose = aim({ x: 1.8, y: 1.6, z: -2 });
    const target = { ...panel, maxDistance: 2.05, radius: 100 };
    expect(evaluateInteraction(worldFor(target), pose, undefined, camera(pose))).toMatchObject({ kind: 'approach', target: { id: 'emblem-panel' } });
    expect(findInteraction(worldFor(target), pose)).toBeUndefined();
    const beside = { ...origin, position: { ...origin.position, x: 1.8 } };
    expect(evaluateInteraction(worldFor(target), beside, undefined, camera(beside)).kind).toBe('ready');
  });
  it('accepts an unoccluded surface point when another object covers the plate center', () => {
    const pose = aim({ x: 0.8, y: 1.6, z: -2 });
    const world = worldFor();
    world.solids = [{ id: 'center-cover', kind: 'wall', opaque: true, min: { x: -0.06, y: 0, z: -1.02 }, max: { x: 0.06, y: 3.2, z: -0.98 } }];
    expect(segmentOccluded(pose.position, panel.center, world)).toBe(true);
    expect(projectWithCamera(panel.center, camera(pose, 1))).toBeDefined();
    expect(evaluateInteraction(world, pose, undefined, camera(pose, 1)).kind).toBe('ready');
  });
  it('rejects a reticle surface point occluded by a wall even when the plate center is visible', () => {
    const pose = aim({ x: 0.8, y: 1.6, z: -2 });
    const world = worldFor();
    world.solids = [{ id: 'hit-cover', kind: 'wall', opaque: true, min: { x: 0.34, y: 0, z: -1.02 }, max: { x: 0.46, y: 3.2, z: -0.98 } }];
    expect(segmentOccluded(pose.position, panel.center, world)).toBe(false);
    expect(findInteraction(world, pose)).toBeUndefined();
    expect(evaluateInteraction(world, pose, undefined, camera(pose, 1)).kind).toBe('aim');
  });
  it('keeps a closed door opaque and never shows an entirely hidden plate', () => {
    const world = worldFor();
    world.solids = [{ id: 'closed-door', kind: 'door', opaque: true, min: { x: -3, y: 0, z: -1.1 }, max: { x: 3, y: 3.2, z: -0.9 } }];
    expect(evaluateInteraction(world, origin, undefined, camera(origin))).toEqual({ kind: 'none' });
    expect(findInteraction(world, origin)).toBeUndefined();
  });
  it.each([
    { ...origin, position: { ...origin.position, z: -3 }, yaw: Math.PI },
    { ...origin, position: { ...origin.position, z: -2 } },
    { ...origin, yaw: Math.PI },
  ])('rejects the back, plane itself, or behind-camera rectangle', (pose) => {
    expect(evaluateInteraction(worldFor(), pose, undefined, camera(pose))).toEqual({ kind: 'none' });
    expect(findInteraction(worldFor(), pose)).toBeUndefined();
  });
  it('supports a wall with another normal using the same plain-vector basis', () => {
    const eastPanel = { ...panel, center: { x: 2, y: 1.6, z: 0 }, rectangle: { ...panel.rectangle!, normal: { x: -1, y: 0, z: 0 }, right: { x: 0, y: 0, z: 1 } } };
    const pose = { ...origin, position: { ...origin.position, z: 1.9 }, yaw: -Math.PI / 2 };
    expect(projectWithCamera(eastPanel.center, camera(pose))).toBeUndefined();
    expect(evaluateInteraction(worldFor(eastPanel), pose, undefined, camera(pose)).kind).toBe('ready');
  });
  it.each([
    { width: 0 }, { height: -1 }, { width: Infinity },
    { normal: { x: 0, y: 0, z: NaN } }, { normal: { x: 0, y: 0, z: 0 } },
    { right: { x: 0, y: 0, z: 1 } }, { right: { x: 2, y: 0, z: 0 } },
  ])('rejects malformed authored rectangle data %j', (value) => {
    const target = { ...panel, rectangle: { ...panel.rectangle!, ...value } };
    expect(evaluateInteraction(worldFor(target), origin, undefined, camera(origin))).toEqual({ kind: 'none' });
  });
  it('rejects malformed centers/ranges and mismatched live-camera matrices', () => {
    expect(evaluateInteraction(worldFor({ ...panel, center: { ...panel.center, x: Infinity } }), origin)).toEqual({ kind: 'none' });
    expect(evaluateInteraction(worldFor({ ...panel, maxDistance: NaN }), origin)).toEqual({ kind: 'none' });
    expect(evaluateInteraction(worldFor(), origin, undefined, camera({ ...origin, yaw: 0.2 }))).toEqual({ kind: 'none' });
  });
  it('retains exact-hit priority and ordinary glyph cone acquisition', () => {
    const glyph: InteractableDefinition = { id: 'emblem-circle', label: '丸', center: { x: 0.1, y: 1.6, z: -1.5 }, radius: 0.01, maxDistance: 2 };
    const world = worldFor();
    world.interactables = [glyph, panel];
    expect(evaluateInteraction(world, origin).target?.id).toBe('emblem-panel');
    world.interactables = [glyph];
    expect(evaluateInteraction(world, origin)).toMatchObject({ kind: 'ready', actionLabel: '丸の印を押す' });
  });
  it.each([
    ['emblem-circle', '丸の印を押す'], ['emblem-diamond', 'ひし形の印を押す'], ['emblem-square', '四角の印を押す'],
  ] as const)('names the physical glyph action for %s and respects an already released seal', (id, actionLabel) => {
    const glyph: InteractableDefinition = { id, label: id, center: { x: 0, y: 1.6, z: -1 }, radius: 0.1, maxDistance: 2 };
    const initial = createInitialRuntime().progress;
    const progress = { ...initial, emblem: { ...initial.emblem!, phase: 'observing' as const } };
    expect(evaluateInteraction(worldFor(glyph), origin, progress)).toMatchObject({ kind: 'ready', actionLabel });
    expect(evaluateInteraction(worldFor(glyph), origin, { ...progress, sealA: true })).toMatchObject({ kind: 'locked' });
  });
  it('does not grant a rectangular shortcut to the key exact-ray requirement', () => {
    const runtime = createInitialRuntime();
    const world = getWorld(runtime);
    world.interactables = world.interactables.filter((target) => target.id === 'key').map((target) => ({ ...target, rectangle: { ...panel.rectangle!, width: 10, height: 10 } }));
    const pose = { ...OBSERVATION_POSE, yaw: 5.8 * Math.PI / 180 };
    expect(findInteraction(world, pose)).toBeUndefined();
    expect(evaluateInteraction(world, pose, runtime.progress, camera(pose)).kind).not.toBe('ready');
  });
});
