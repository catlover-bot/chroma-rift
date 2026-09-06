import { PerspectiveCamera } from 'three';
import { createSealStimulus } from '../../emblem/stimulus';
import { EMBLEM_FIXTURE, EMBLEM_SWITCHES } from '../emblemFixture';
import { createInitialRuntime, evaluateInteraction, findInteraction, getWorld, interact, INTERACTION_CONE_DEGREES, interactionCue, objectiveForRuntime, OBSERVATION_POSE, rayBoxDistance, raySphereDistance, segmentOccluded, forwardVector } from '..';
import type { ChapterRuntime, InteractableDefinition, PlayerPose, Vec3, WorldGeometry } from '..';

function aim(pose: PlayerPose, center: Vec3): PlayerPose {
  const dx = center.x - pose.position.x, dz = center.z - pose.position.z;
  return { ...pose, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(center.y - pose.position.y, Math.hypot(dx, dz)) };
}
function matrices(pose: PlayerPose, fov = 65) {
  const camera = new PerspectiveCamera(fov, 390 / 844, 0.08, 60);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
  return { view: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] };
}
function nearGlyph(): ChapterRuntime {
  const initial = createInitialRuntime();
  const point = EMBLEM_SWITCHES.find((item) => item.glyph === createSealStimulus(initial.emblem.seed).answer)!.center;
  const pose = aim({ ...initial.pose, position: { x: point.x, y: 1.6, z: -5.6 } }, point);
  return { ...initial, emblem: { ...initial.emblem, phase: 'observing' }, progress: { ...initial.progress, emblem: { ...initial.progress.emblem!, phase: 'observing' } }, pose: { ...pose, yaw: pose.yaw + 5.8 * Math.PI / 180 } };
}
function glyphWorld(runtime: ChapterRuntime): WorldGeometry {
  const world = getWorld(runtime);
  world.interactables = world.interactables.filter((item) => item.id === `emblem-${createSealStimulus(runtime.emblem.seed).answer}`);
  return world;
}

describe('shared visible interaction acquisition (real Three projection, no GPU)', () => {
  it('allows a physical glyph inside the six-degree cone when its exact ray misses, in HUD and action', () => {
    const runtime = nearGlyph(), world = glyphWorld(runtime), glyph = world.interactables[0]!;
    expect(INTERACTION_CONE_DEGREES).toBe(6);
    expect(raySphereDistance(runtime.pose.position, forwardVector(runtime.pose), glyph.center, glyph.radius)).toBeUndefined();
    expect(interactionCue(world, runtime.pose, matrices(runtime.pose), runtime.progress)).toMatchObject({ kind: 'ready', target: { id: glyph.id } });
    expect(findInteraction(world, runtime.pose)?.id).toBe(glyph.id);
    expect(interact(runtime, glyph.id, matrices(runtime.pose)).progress.sealA).toBe(true);
  });
  it('rejects off-frustum cone candidates and stale or malformed camera matrices', () => {
    const runtime = nearGlyph(), world = glyphWorld(runtime), id = world.interactables[0]!.id;
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, matrices(runtime.pose, 3))).toEqual({ kind: 'none' });
    const oldCamera = matrices({ ...runtime.pose, yaw: runtime.pose.yaw + 0.2 });
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, oldCamera)).toEqual({ kind: 'none' });
    expect(interact(runtime, id, oldCamera)).toBe(runtime);
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, { ...matrices(runtime.pose), view: Array(16).fill(NaN) })).toEqual({ kind: 'none' });
  });
  it.each([6.8, 12, 180])('cannot acquire a missed glyph at %s degrees yaw from its center', (degrees) => {
    const runtime = nearGlyph(), world = glyphWorld(runtime), target = world.interactables[0]!;
    const direct = aim(runtime.pose, target.center);
    runtime.pose = { ...direct, yaw: direct.yaw + degrees * Math.PI / 180 };
    expect(findInteraction(world, runtime.pose)).toBeUndefined();
    expect(interact(runtime, target.id, matrices(runtime.pose))).toBe(runtime);
  });
  it('shows a distant visible glyph without granting reach and never reveals it through an opaque door', () => {
    const runtime = nearGlyph(), target = glyphWorld(runtime).interactables[0]!;
    runtime.pose = aim({ ...runtime.pose, position: { ...runtime.pose.position, z: -5.2 } }, target.center);
    const world = glyphWorld(runtime);
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, matrices(runtime.pose))).toMatchObject({ kind: 'approach', target: { id: target.id } });
    expect(interact(runtime, target.id, matrices(runtime.pose))).toBe(runtime);
    world.solids = [...world.solids, { id: 'closed-door', kind: 'door', opaque: true, min: { x: -3, y: 0, z: -6.1 }, max: { x: 3, y: 3.2, z: -6 } }];
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, matrices(runtime.pose))).toEqual({ kind: 'none' });
  });
  it('rejects cone candidates whose fixture center is behind a wall edge', () => {
    const runtime = nearGlyph(), world = glyphWorld(runtime), x = world.interactables[0]!.center.x;
    world.solids = [...world.solids, { id: 'cover', kind: 'wall', opaque: true, min: { x: x - 0.05, y: 0, z: -6.1 }, max: { x: x + 0.05, y: 3.2, z: -6 } }];
    expect(findInteraction(world, runtime.pose)).toBeUndefined();
    expect(evaluateInteraction(world, runtime.pose, runtime.progress, matrices(runtime.pose))).toEqual({ kind: 'none' });
  });
  it('favors exact hits over nearer cone candidates, with stable tie breaking', () => {
    const pose: PlayerPose = { position: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0 };
    const guide: InteractableDefinition = { id: 'guide', label: 'lab guide', center: { x: 0.1, y: 1.6, z: -1.5 }, radius: 0.02, maxDistance: 2.2 };
    const glyph: InteractableDefinition = { ...guide, id: 'emblem-circle', center: { x: 0, y: 1.6, z: -1.9 } };
    const world: WorldGeometry = { ...getWorld(createInitialRuntime()), solids: [], interactables: [guide, glyph] };
    expect(evaluateInteraction(world, pose).target?.id).toBe('emblem-circle');
    world.interactables = [guide, { ...guide, id: 'emblem-circle' }];
    const selected = evaluateInteraction(world, pose);
    world.interactables = [...world.interactables].reverse();
    expect(evaluateInteraction(world, pose)).toEqual(selected);
    expect(selected.target?.id).toBe('emblem-circle');
  });
  it('requires actual plate inspection, then permits a glyph with no legacy floor/device flags', () => {
    const initial = createInitialRuntime();
    const glyph = EMBLEM_SWITCHES.find((item) => item.glyph === createSealStimulus(initial.emblem.seed).answer)!;
    let runtime = { ...initial, pose: aim({ ...initial.pose, position: { x: 1.95, y: 1.6, z: -5.8 } }, glyph.center) };
    expect(evaluateInteraction(getWorld(runtime), runtime.pose, runtime.progress, matrices(runtime.pose))).toMatchObject({ kind: 'locked', reason: 'まず壁の紋章を調べよう。' });
    expect(interact(runtime, glyph.id, matrices(runtime.pose))).toBe(runtime);
    runtime.pose = aim(runtime.pose, EMBLEM_FIXTURE.center);
    runtime = interact(runtime, 'emblem-panel', matrices(runtime.pose));
    runtime.pose = aim(runtime.pose, glyph.center);
    expect(evaluateInteraction(getWorld(runtime), runtime.pose, runtime.progress, matrices(runtime.pose)).kind).toBe('ready');
    expect(interact(runtime, glyph.id, matrices(runtime.pose)).progress).toMatchObject({ sealA: true, guideExamined: false, markActivated: false });
  });
  it('rechecks a stale HUD target and releases at most once under rapid taps', () => {
    let runtime = nearGlyph();
    const id = glyphWorld(runtime).interactables[0]!.id;
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
    const runtime = { ...initial, pose: { ...OBSERVATION_POSE, yaw: 5.8 * Math.PI / 180 }, progress: { ...initial.progress, sealA: true }, doorAOpen: 1 };
    expect(findInteraction(getWorld(runtime), runtime.pose)).toBeUndefined();
    expect(interact(runtime, 'key', matrices(runtime.pose))).toBe(runtime);
    runtime.pose = aim({ ...OBSERVATION_POSE, position: { ...OBSERVATION_POSE.position, x: 8.8 } }, getWorld(runtime).keyFrame.center);
    expect(findInteraction(getWorld(runtime), runtime.pose)?.id).toBe('key');
    expect(evaluateInteraction(getWorld(runtime), runtime.pose, runtime.progress, matrices(runtime.pose))).toMatchObject({ kind: 'locked' });
    expect(interact(runtime, 'key', matrices(runtime.pose))).toBe(runtime);
  });
  it.each([
    { min: { x: 1, y: 0, z: -1.1 }, max: { x: -1, y: 3.2, z: -0.9 } },
    { min: { x: -1, y: NaN, z: -1.1 }, max: { x: 1, y: 3.2, z: -0.9 } },
    { min: { x: -1, y: 0, z: -1.1 }, max: { x: 1, y: Infinity, z: -0.9 } },
    // Validate every axis before a valid but off-ray slab could return a miss.
    { min: { x: 4, y: 0, z: NaN }, max: { x: 5, y: 3.2, z: -0.9 } },
  ])('fails closed for malformed opaque blockers %p before authorizing a glyph or plate', (bounds) => {
    const pose: PlayerPose = { position: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0 };
    const glyph: InteractableDefinition = { id: 'emblem-circle', label: '丸', center: { x: 0, y: 1.6, z: -2 }, radius: 0.1, maxDistance: 3 };
    const plate: InteractableDefinition = { ...glyph, id: 'emblem-panel', rectangle: {
      width: 1.6, height: 1.6, normal: { x: 0, y: 0, z: 1 }, right: { x: 1, y: 0, z: 0 },
    } };
    const world: WorldGeometry = { ...getWorld(createInitialRuntime()), solids: [], interactables: [glyph] };
    const blocker = { id: 'damaged-wall', kind: 'wall' as const, opaque: true, ...bounds };
    expect(evaluateInteraction(world, pose).kind).toBe('ready');
    world.solids = [blocker];
    expect(rayBoxDistance(pose.position, forwardVector(pose), blocker)).toBe(0);
    expect(segmentOccluded(pose.position, glyph.center, world)).toBe(true);
    for (const target of [glyph, plate]) {
      world.interactables = [target];
      expect(evaluateInteraction(world, pose)).toEqual({ kind: 'none' });
      expect(evaluateInteraction(world, pose, undefined, matrices(pose))).toEqual({ kind: 'none' });
    }
  });
  it('keeps a valid opaque wall behind a target from blocking its interaction', () => {
    const pose: PlayerPose = { position: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0 };
    const glyph: InteractableDefinition = { id: 'emblem-circle', label: '丸', center: { x: 0, y: 1.6, z: -2 }, radius: 0.1, maxDistance: 3 };
    const world: WorldGeometry = { ...getWorld(createInitialRuntime()), interactables: [glyph], solids: [
      { id: 'rear-wall', kind: 'wall', opaque: true, min: { x: -1, y: 0, z: -3.1 }, max: { x: 1, y: 3.2, z: -2.9 } },
    ] };
    expect(segmentOccluded(pose.position, glyph.center, world)).toBe(false);
    expect(evaluateInteraction(world, pose, undefined, matrices(pose))).toMatchObject({ kind: 'ready', target: { id: glyph.id } });
  });
  it('rejects malformed poses and keeps the objective tied to actual inspection', () => {
    const initial = createInitialRuntime();
    expect(evaluateInteraction(getWorld(initial), { ...initial.pose, yaw: NaN })).toEqual({ kind: 'none' });
    expect(objectiveForRuntime(initial)).toBe('壁の紋章を調べる');
    expect(objectiveForRuntime({ ...initial, emblem: { ...initial.emblem, phase: 'observing' } })).toBe('切れずにつながる輪郭を探す');
  });
});
