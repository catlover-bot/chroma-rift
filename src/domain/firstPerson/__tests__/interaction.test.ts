import { PerspectiveCamera } from 'three';
import { createInitialRuntime, evaluateInteraction, findInteraction, getWorld, GUIDE_FIXTURE, interact, INTERACTION_CONE_DEGREES, interactionCue, objectiveForRuntime, OBSERVATION_POSE, raySphereDistance, forwardVector } from '..';
import type { ChapterRuntime, InteractableDefinition, PlayerPose, Vec3, WorldGeometry } from '..';

function aim(pose: PlayerPose, center: Vec3): PlayerPose {
  const dx = center.x - pose.position.x;
  const dz = center.z - pose.position.z;
  return { ...pose, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(center.y - pose.position.y, Math.hypot(dx, dz)) };
}
function matrices(pose: PlayerPose, fov = 65) {
  const camera = new PerspectiveCamera(fov, 390 / 844, 0.08, 60);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  return { view: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] };
}
function nearGuide(): ChapterRuntime {
  const initial = createInitialRuntime();
  const pose = aim({ ...initial.pose, position: { x: 0, y: 1.6, z: 1.65 } }, GUIDE_FIXTURE.center);
  return { ...initial, pose: { ...pose, yaw: pose.yaw + 5.8 * Math.PI / 180 } };
}

describe('shared visible interaction acquisition (real Three projection, no GPU)', () => {
  it('allows a guide inside the documented six-degree cone when its exact ray misses, in HUD and action', () => {
    const runtime = nearGuide();
    const world = getWorld(runtime);
    const guide = world.interactables[0]!;
    expect(INTERACTION_CONE_DEGREES).toBe(6);
    expect(raySphereDistance(runtime.pose.position, forwardVector(runtime.pose), guide.center, guide.radius)).toBeUndefined();
    expect(interactionCue(world, runtime.pose, matrices(runtime.pose), runtime.progress)).toMatchObject({ kind: 'ready', target: { id: 'guide' }, actionLabel: 'しるべを調べる' });
    expect(findInteraction(world, runtime.pose)?.id).toBe('guide');
    expect(interact(runtime, 'guide', matrices(runtime.pose)).progress.guideExamined).toBe(true);
  });
  it('rejects off-frustum cone candidates and stale or malformed camera matrices', () => {
    const runtime = nearGuide();
    const world = getWorld(runtime);
    world.interactables = [world.interactables[0]!];
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, matrices(runtime.pose, 3))).toEqual({ kind: 'none' });
    const oldCamera = matrices({ ...runtime.pose, yaw: runtime.pose.yaw + 0.2 });
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, oldCamera)).toEqual({ kind: 'none' });
    expect(interact(runtime, 'guide', oldCamera)).toBe(runtime);
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, { ...matrices(runtime.pose), view: Array(16).fill(NaN) })).toEqual({ kind: 'none' });
  });
  it.each([6.3, 12, 180])('cannot acquire a missed target at %s degrees off its center', (degrees) => {
    const runtime = nearGuide();
    const direct = aim(runtime.pose, GUIDE_FIXTURE.center);
    runtime.pose = { ...direct, yaw: direct.yaw + degrees * Math.PI / 180 };
    expect(findInteraction(getWorld(runtime), runtime.pose)).toBeUndefined();
    expect(interact(runtime, 'guide', matrices(runtime.pose))).toBe(runtime);
  });
  it('shows a distant visible guide without granting reach and never reveals it through an opaque door', () => {
    const runtime = nearGuide();
    runtime.pose = aim({ ...runtime.pose, position: { ...runtime.pose.position, z: 2 } }, GUIDE_FIXTURE.center);
    const world = getWorld(runtime);
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, matrices(runtime.pose))).toMatchObject({ kind: 'approach', target: { id: 'guide' } });
    expect(interact(runtime, 'guide', matrices(runtime.pose))).toBe(runtime);
    world.solids = [...world.solids, { id: 'closed-door', kind: 'door', opaque: true, min: { x: -3, y: 0, z: 0.2 }, max: { x: 3, y: 3.2, z: 0.4 } }];
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, matrices(runtime.pose))).toEqual({ kind: 'none' });
  });
  it('rejects cone candidates whose visible fixture center is behind a wall edge', () => {
    const runtime = nearGuide();
    const world = getWorld(runtime);
    world.interactables = [world.interactables[0]!];
    world.solids = [{ id: 'cover-guide', kind: 'wall', opaque: true, min: { x: -0.05, y: 0, z: 0.2 }, max: { x: 0.05, y: 3.2, z: 0.4 } }];
    expect(findInteraction(world, runtime.pose)).toBeUndefined();
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, matrices(runtime.pose))).toEqual({ kind: 'none' });
  });
  it('favors an exact reticle hit over a nearer cone candidate, with deterministic cone ties', () => {
    const pose: PlayerPose = { position: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0 };
    const guide: InteractableDefinition = { id: 'guide', label: 'guide', center: { x: 0.1, y: 1.6, z: -1.5 }, radius: 0.02, maxDistance: 2.2 };
    const device: InteractableDefinition = { ...guide, id: 'floor-device', center: { x: 0, y: 1.6, z: -1.9 } };
    const world: WorldGeometry = { ...getWorld(createInitialRuntime()), solids: [], interactables: [guide, device] };
    expect(evaluateInteraction(world, pose)).toMatchObject({ kind: 'ready', target: { id: 'floor-device' } });
    world.interactables = [guide, { ...guide, id: 'floor-device' }];
    const selected = evaluateInteraction(world, pose);
    world.interactables = [...world.interactables].reverse();
    expect(evaluateInteraction(world, pose)).toEqual(selected);
    expect(selected.target?.id).toBe('floor-device');
  });
  it('gives a meaningful prerequisite reason and only unlocks the same candidate after real progress', () => {
    const runtime = createInitialRuntime();
    runtime.pose = aim({ ...runtime.pose, position: { x: 1.6, y: 1.6, z: -6 } }, { x: 1.6, y: 1.3, z: -7.4 });
    const evaluate = () => evaluateInteraction(getWorld(runtime), runtime.pose, runtime.progress, matrices(runtime.pose));
    expect(evaluate()).toMatchObject({ kind: 'locked', reason: '入口の光のしるべを先に調べよう。' });
    expect(interact(runtime, 'floor-device', matrices(runtime.pose))).toBe(runtime);
    runtime.progress.guideExamined = true;
    expect(evaluate()).toMatchObject({ kind: 'locked', reason: '床の輪に入ると、装置の封印が解けます。' });
    runtime.progress.markActivated = true;
    expect(evaluate()).toMatchObject({ kind: 'ready', actionLabel: '装置を動かす' });
    const solved = interact(runtime, 'floor-device', matrices(runtime.pose));
    expect(solved.progress.sealA).toBe(true);
    expect(interact(solved, 'floor-device', matrices(solved.pose))).toBe(solved);
  });
  it('rechecks a stale HUD target and changes progress at most once under rapid taps', () => {
    let runtime = nearGuide();
    const id = evaluateInteraction(getWorld(runtime), runtime.pose, runtime.progress, matrices(runtime.pose)).target!.id;
    const turned = { ...runtime, pose: { ...runtime.pose, yaw: Math.PI } };
    expect(interact(turned, id, matrices(turned.pose))).toBe(turned);
    let transitions = 0;
    for (let tap = 0; tap < 20; tap += 1) {
      const next = interact(runtime, id, matrices(runtime.pose));
      if (next !== runtime) transitions += 1;
      runtime = next;
    }
    expect(transitions).toBe(1);
  });
  it('never gives the key a cone or bypasses actual projection alignment with an exact hit', () => {
    const initial = createInitialRuntime();
    const runtime = { ...initial, pose: { ...OBSERVATION_POSE, yaw: 5.8 * Math.PI / 180 }, progress: { ...initial.progress, guideExamined: true, markActivated: true, sealA: true }, doorAOpen: 1 };
    expect(findInteraction(getWorld(runtime), runtime.pose)).toBeUndefined();
    expect(interact(runtime, 'key', matrices(runtime.pose))).toBe(runtime);
    runtime.pose = aim({ ...OBSERVATION_POSE, position: { ...OBSERVATION_POSE.position, x: 8.8 } }, getWorld(runtime).keyFrame.center);
    expect(findInteraction(getWorld(runtime), runtime.pose)?.id).toBe('key');
    expect(evaluateInteraction(getWorld(runtime), runtime.pose, runtime.progress, matrices(runtime.pose))).toMatchObject({ kind: 'locked' });
    expect(interact(runtime, 'key', matrices(runtime.pose))).toBe(runtime);
  });
  it('rejects malformed poses and keeps post-guide objectives tied to floor progress', () => {
    const initial = createInitialRuntime();
    expect(evaluateInteraction(getWorld(initial), { ...initial.pose, yaw: NaN })).toEqual({ kind: 'none' });
    initial.progress.guideExamined = true;
    expect(objectiveForRuntime(initial)).toBe('床の輪に入ろう。');
    initial.progress.markActivated = true;
    expect(objectiveForRuntime(initial)).toBe('輪の先の装置を調べよう。');
  });
});
