import { PerspectiveCamera } from 'three';
import {
  adjustLook, assistAim, canApplyReturnVariant, CEILING_BASE_Y, CEILING_THICKNESS, CHANGED_REGION, CHAPTER, createCheckpoint,
  createInitialRuntime, evaluateKeyAlignment, evaluateRuntime, findInteraction, forwardVector,
  FLOOR_THICKNESS, getWorld, hintForRuntime, interact, isSafePose, MAX_PITCH, MOVE_SPEED, OBSERVATION_POSE,
  occlusionCertificate, pauseRuntime, PLAYER_RADIUS, projectWithCamera, restoreCheckpoint,
  resumeRuntime, setHintStage, stepRuntime, updatePlayer, VERTICAL_FOV,
} from '..';
import type { CameraMatrices, ChapterRuntime, PlayerPose, Vec3, WorldGeometry } from '..';

function matrices(pose: PlayerPose, aspect = 390 / 844, fov = VERTICAL_FOV): CameraMatrices {
  const camera = new PerspectiveCamera(fov, aspect, 0.08, 60);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return { view: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] };
}
function emptyWorld(): WorldGeometry {
  return { ...getWorld(createInitialRuntime()), floors: [{ id: 'test-floor', minX: -20, maxX: 20, minZ: -20, maxZ: 20 }], solids: [], interactables: [] };
}
const origin: PlayerPose = { position: { x: 0, y: 1.6, z: 0 }, yaw: 0, pitch: 0 };
function aim(runtime: ChapterRuntime, point: Vec3): ChapterRuntime {
  const dx = point.x - runtime.pose.position.x;
  const dz = point.z - runtime.pose.position.z;
  return { ...runtime, pose: { ...runtime.pose, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(point.y - runtime.pose.position.y, Math.hypot(dx, dz)) } };
}
function inspect(runtime: ChapterRuntime, id: 'guide' | 'floor-device' | 'key' | 'exit'): ChapterRuntime {
  const target = getWorld(runtime).interactables.find((candidate) => candidate.id === id)!;
  const looking = aim(runtime, target.center);
  expect(findInteraction(getWorld(looking), looking.pose)?.id).toBe(id);
  return interact(looking, id, matrices(looking.pose));
}
function waitDoors(runtime: ChapterRuntime): ChapterRuntime {
  let next = runtime;
  for (let i = 0; i < 8; i += 1) next = evaluateRuntime(next, next.pose, 0.2, matrices(next.pose));
  return next;
}
// This walks using the very same dt/circle collision path as the native runtime.
// Tests never teleport to the next chapter milestone to claim a playable route.
function walkTo(runtime: ChapterRuntime, x: number, z: number): ChapterRuntime {
  let next = runtime;
  for (let i = 0; i < 900; i += 1) {
    const dx = x - next.pose.position.x;
    const dz = z - next.pose.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.025) return next;
    const looking = { ...next, pose: { ...next.pose, yaw: Math.atan2(-dx, -dz), pitch: 0 } };
    const dt = Math.min(1 / 60, distance / MOVE_SPEED);
    const pose = updatePlayer(looking.pose, { strafe: 0, forward: 1 }, dt, getWorld(looking));
    next = evaluateRuntime(looking, pose, dt, matrices(pose));
    if (next.progress.cleared) return next;
  }
  throw new Error(`Blocked walking from ${JSON.stringify(runtime.pose.position)} to ${x},${z}; stopped at ${JSON.stringify(next.pose.position)}`);
}
function solveA(): ChapterRuntime {
  let runtime = walkTo(createInitialRuntime(), 0, 1);
  runtime = inspect(runtime, 'guide');
  runtime = walkTo(runtime, 0, -4);
  runtime = walkTo(runtime, 1.6, -6);
  runtime = inspect(runtime, 'floor-device');
  return waitDoors(runtime);
}
function toKey(runtime: ChapterRuntime): ChapterRuntime {
  let next = walkTo(runtime, 0, -6);
  for (const [x, z] of [[0, -9], [0, -11], [5, -11], [5, -13.5], [8, -13.5]]) next = walkTo(next, x!, z!);
  return { ...next, pose: { ...next.pose, yaw: 0, pitch: 0 } };
}

describe('continuous first-person movement', () => {
  it.each([
    [0, 1, 0, 0, -1], [0, -1, 0, 0, 1], [1, 0, 0, 1, 0], [-1, 0, 0, -1, 0],
    [0, 1, Math.PI / 2, -1, 0], [1, 0, Math.PI / 2, 0, -1],
  ])('moves strafe=%s forward=%s with yaw=%s in the camera horizontal plane', (strafe, forward, yaw, x, z) => {
    const pose = updatePlayer({ ...origin, yaw: yaw! }, { strafe: strafe!, forward: forward! }, 0.1, emptyWorld());
    expect(pose.position.x).toBeCloseTo(x! * MOVE_SPEED * 0.1);
    expect(pose.position.z).toBeCloseTo(z! * MOVE_SPEED * 0.1);
  });
  it('keeps eye height and horizontal travel unchanged when looking up or down', () => {
    const level = updatePlayer(origin, { strafe: 0, forward: 1 }, 0.1, emptyWorld());
    for (const pitch of [-MAX_PITCH, MAX_PITCH]) expect(updatePlayer({ ...origin, pitch }, { strafe: 0, forward: 1 }, 0.1, emptyWorld()).position).toEqual(level.position);
  });
  it('normalizes diagonals, filters tiny joystick drift, and caps pitch without roll', () => {
    const diagonal = updatePlayer(origin, { strafe: 1, forward: 1 }, 0.1, emptyWorld());
    expect(Math.hypot(diagonal.position.x, diagonal.position.z)).toBeCloseTo(MOVE_SPEED * 0.1);
    expect(updatePlayer(origin, { strafe: 0.02, forward: 0.02 }, 0.1, emptyWorld()).position).toEqual(origin.position);
    expect(adjustLook(origin, 20, 20).pitch).toBe(MAX_PITCH);
    expect(adjustLook(origin, -20, -20).pitch).toBe(-MAX_PITCH);
    expect(Object.keys(adjustLook(origin, 1, 1)).sort()).toEqual(['pitch', 'position', 'yaw']);
  });
  it('moves the same distance at 30, 60 and 120 Hz', () => {
    const world = emptyWorld();
    for (const hz of [30, 60, 120]) {
      let pose = origin;
      for (let frame = 0; frame < hz; frame += 1) pose = updatePlayer(pose, { strafe: 0, forward: 1 }, 1 / hz, world);
      expect(pose.position.z).toBeCloseTo(-MOVE_SPEED, 7);
    }
  });
  it('substeps thin walls and inside corners, and clamps long-resume deltas', () => {
    const world = emptyWorld();
    world.solids = [
      { id: 'thin-x', min: { x: 0.35, y: 0, z: -10 }, max: { x: 0.36, y: 3, z: 10 }, kind: 'wall', opaque: true },
      { id: 'thin-z', min: { x: -10, y: 0, z: -0.36 }, max: { x: 10, y: 3, z: -0.35 }, kind: 'wall', opaque: true },
    ];
    const pose = updatePlayer(origin, { strafe: 1, forward: 1 }, 100, world);
    expect(pose.position.x).toBeLessThanOrEqual(0.35 - PLAYER_RADIUS + 0.001);
    expect(pose.position.z).toBeGreaterThanOrEqual(-0.35 + PLAYER_RADIUS - 0.001);
    expect(isSafePose(pose, world)).toBe(true);
    const noWall = updatePlayer(origin, { strafe: 1, forward: 0 }, 100, emptyWorld());
    expect(noWall.position.x).toBeCloseTo(MOVE_SPEED * 0.25);
  });
  it('cannot walk off supported floors or through a closed door but uses its real lifted clearance', () => {
    const runtime = createInitialRuntime();
    const pose = { ...origin, position: { x: 0, y: 1.6, z: -7.4 } };
    const closed = updatePlayer(pose, { strafe: 0, forward: 1 }, 0.25, getWorld(runtime));
    expect(closed.position.z).toBeGreaterThan(-7.92 + PLAYER_RADIUS - 0.01);
    const open = updatePlayer(pose, { strafe: 0, forward: 1 }, 0.25, getWorld({ ...runtime, doorAOpen: 1 }));
    expect(open.position.z).toBeLessThan(-7.9);
    const unsupported = { ...emptyWorld(), floors: [{ id: 'tiny', minX: -0.5, maxX: 0.5, minZ: -0.5, maxZ: 0.5 }] };
    expect(updatePlayer(origin, { strafe: 1, forward: 0 }, 0.25, unsupported).position.x).toBeLessThanOrEqual(0.5 - PLAYER_RADIUS);
  });
  it('pause halts motion and progress and resume does not replay any old input', () => {
    const runtime = pauseRuntime(createInitialRuntime());
    expect(stepRuntime(runtime, { strafe: 1, forward: 1 }, 10)).toBe(runtime);
    expect(interact(runtime, 'guide')).toBe(runtime);
    const resumed = resumeRuntime(runtime);
    expect(stepRuntime(resumed, { strafe: 0, forward: 0 }, 0.25).pose.position).toEqual(runtime.pose.position);
  });
});

describe('ray interaction and flat-floor puzzle', () => {
  it('rejects remote, behind-camera, and wall-occluded targets', () => {
    const runtime = createInitialRuntime();
    expect(findInteraction(getWorld(runtime), runtime.pose)).toBeUndefined();
    const near = { ...runtime, pose: { ...origin, position: { x: 0, y: 1.6, z: 1 } } };
    const target = getWorld(near).interactables[0]!;
    const facing = aim(near, target.center);
    expect(findInteraction(getWorld(facing), facing.pose)?.id).toBe('guide');
    expect(findInteraction(getWorld(facing), { ...facing.pose, yaw: facing.pose.yaw + Math.PI })).toBeUndefined();
    const world = getWorld(facing);
    world.solids = [...world.solids, { id: 'cover', min: { x: -1, y: 0, z: 0.3 }, max: { x: 1, y: 3, z: 0.4 }, kind: 'wall', opaque: true }];
    expect(findInteraction(world, facing.pose)).toBeUndefined();
  });
  it('only operates the ID currently displayed by the same sight rule', () => {
    const runtime = aim({ ...createInitialRuntime(), pose: { ...origin, position: { x: 0, y: 1.6, z: 1 } } }, { x: 0, y: 1.05, z: -0.7 });
    expect(interact(runtime, 'floor-device')).toBe(runtime);
    const operated = interact(runtime, findInteraction(getWorld(runtime), runtime.pose)!.id);
    expect(operated.progress.guideExamined).toBe(true);
    expect(interact(operated, 'guide')).toBe(operated);
  });
  it('requires guide, physically stepping on the mark, and a nearby device interaction', () => {
    const initial = createInitialRuntime();
    const atDevice = aim({ ...initial, pose: { ...origin, position: { x: 1.6, y: 1.6, z: -6 } } }, { x: 1.6, y: 1.3, z: -7.4 });
    expect(interact(atDevice, 'floor-device')).toBe(atDevice);
    const solved = solveA();
    expect(solved.progress).toMatchObject({ guideExamined: true, markActivated: true, sealA: true, sealB: false });
    expect(solved.doorAOpen).toBe(1);
    expect(inspect(solved, 'floor-device').progress).toEqual(solved.progress);
  });
  it('retains an earlier floor visit if the player examines the guide afterwards', () => {
    let runtime = walkTo(createInitialRuntime(), 0, -4);
    expect(runtime.progress.markActivated).toBe(true);
    runtime = walkTo(runtime, 0, 1);
    runtime = inspect(runtime, 'guide');
    runtime = walkTo(runtime, 0, -4);
    runtime = walkTo(runtime, 1.6, -6);
    expect(inspect(runtime, 'floor-device').progress.sealA).toBe(true);
  });
});

describe('actual perspective key alignment', () => {
  it.each([[320, 568], [390, 844], [430, 932]])('aligns separated fragments using real Three matrices at %ix%i', (width, height) => {
    const runtime = createInitialRuntime();
    const world = getWorld(runtime);
    const camera = matrices(OBSERVATION_POSE, width / height);
    expect(new Set(world.keyFragments.map((fragment) => fragment.points[0]!.z)).size).toBe(3);
    for (let i = 0; i < world.keyFragments.length; i += 1) {
      for (let j = 0; j < world.keyFragments[i]!.points.length; j += 1) {
        const actual = projectWithCamera(world.keyFragments[i]!.points[j]!, camera)!;
        const expected = projectWithCamera(world.keyFrame.outline[i]![j]!, camera)!;
        expect(actual.x).toBeCloseTo(expected.x, 10);
        expect(actual.y).toBeCloseTo(expected.y, 10);
      }
    }
    expect(evaluateKeyAlignment(OBSERVATION_POSE, world, camera).aligned).toBe(true);
  });
  it('requires the frame to be aimed at and visible, not merely the correct floor position', () => {
    const world = getWorld(createInitialRuntime());
    for (const yaw of [0.22, Math.PI]) {
      const pose = { ...OBSERVATION_POSE, yaw };
      expect(evaluateKeyAlignment(pose, world, matrices(pose)).aligned).toBe(false);
    }
    const wrong = { ...OBSERVATION_POSE, position: { ...OBSERVATION_POSE.position, x: 8.8 } };
    expect(evaluateKeyAlignment(wrong, world, matrices(wrong)).aligned).toBe(false);
  });
  it('rejects stale camera matrices after a move or look update', () => {
    const world = getWorld(createInitialRuntime());
    const previous = matrices(OBSERVATION_POSE);
    const moved = { ...OBSERVATION_POSE, position: { ...OBSERVATION_POSE.position, x: 8.05 } };
    expect(evaluateKeyAlignment(moved, world, previous)).toMatchObject({ aligned: false, reason: 'camera' });
    expect(evaluateKeyAlignment({ ...OBSERVATION_POSE, yaw: 0.05 }, world, previous)).toMatchObject({ aligned: false, reason: 'camera' });
  });
  it('rejects a wall between the camera and any fragment or its intended outline', () => {
    const world = getWorld(createInitialRuntime());
    world.solids = [...world.solids, { id: 'cover-key', min: { x: 6, y: 0, z: -15.1 }, max: { x: 10, y: 3, z: -15 }, kind: 'wall', opaque: true }];
    expect(evaluateKeyAlignment(OBSERVATION_POSE, world, matrices(OBSERVATION_POSE))).toMatchObject({ aligned: false, reason: 'occluded' });
  });
  it('rejects partial occlusion in the middle of a shaft even when its vertices remain visible', () => {
    const world = getWorld(createInitialRuntime());
    world.solids = [...world.solids, { id: 'small-cover', min: { x: 7.98, y: 1.50, z: -15.01 }, max: { x: 8.02, y: 1.52, z: -15 }, kind: 'wall', opaque: true }];
    expect(evaluateKeyAlignment(OBSERVATION_POSE, world, matrices(OBSERVATION_POSE))).toMatchObject({ aligned: false, reason: 'occluded' });
  });
  it('uses frame-relative tolerances and hysteresis rather than screen pixels', () => {
    const world = getWorld(createInitialRuntime());
    const pose = { ...OBSERVATION_POSE, position: { ...OBSERVATION_POSE.position, x: 8.215 } };
    for (const aspect of [320 / 568, 390 / 844]) {
      const camera = matrices(pose, aspect);
      expect(evaluateKeyAlignment(pose, world, camera, false).aligned).toBe(false);
      expect(evaluateKeyAlignment(pose, world, camera, true).aligned).toBe(true);
    }
  });
  it('offers explicit local aim help without moving, waiting, or solving on the player’s behalf', () => {
    const runtime = setHintStage({ ...createInitialRuntime(), pose: { ...OBSERVATION_POSE, yaw: 0.3 }, progress: { ...createInitialRuntime().progress, guideExamined: true, markActivated: true, sealA: true }, doorAOpen: 1 }, 3);
    const assisted = assistAim(runtime);
    expect(assisted.pose.position).toEqual(runtime.pose.position);
    expect(assisted.pose.yaw).toBeCloseTo(0);
    expect(assisted.progress.sealB).toBe(false);
    expect(evaluateKeyAlignment(assisted.pose, getWorld(assisted), matrices(assisted.pose)).aligned).toBe(true);
    expect(assistAim({ ...runtime, pose: CHAPTER.spawn })).toEqual({ ...runtime, pose: CHAPTER.spawn });
  });
});

describe('occluded world transaction, checkpoints, and full escape', () => {
  it('defers a swap without both seals, outside a safe location, or without an opaque whole-volume certificate', () => {
    const initial = createInitialRuntime();
    const progress = { ...initial.progress, guideExamined: true, markActivated: true, sealA: true, sealB: true };
    const hidden = { ...initial, pose: OBSERVATION_POSE, progress, doorAOpen: 1, doorBOpen: 1 };
    expect(canApplyReturnVariant(hidden)).toBe(true);
    expect(occlusionCertificate(hidden.pose, CHANGED_REGION, getWorld(hidden).solids)).toBe('boundary-z--12-6-10');
    for (const yaw of [0, 1, 2, 3]) expect(canApplyReturnVariant({ ...hidden, pose: { ...hidden.pose, yaw } })).toBe(true);
    expect(canApplyReturnVariant({ ...hidden, progress: { ...progress, sealB: false } })).toBe(false);
    expect(canApplyReturnVariant({ ...hidden, pose: CHAPTER.spawn })).toBe(false);
    expect(occlusionCertificate(hidden.pose, CHANGED_REGION, [])).toBeUndefined();
    const nearEntrance = { ...origin, position: { x: 0, y: 1.6, z: 2 }, yaw: 0 };
    expect(canApplyReturnVariant({ ...hidden, pose: nearEntrance })).toBe(false);
  });
  it('switches rendering and collision from one variant and restores it without reversing', () => {
    const initial = createInitialRuntime();
    const runtime = { ...initial, pose: OBSERVATION_POSE, progress: { ...initial.progress, guideExamined: true, markActivated: true, sealA: true, sealB: true }, doorAOpen: 1, doorBOpen: 1 };
    const changed = evaluateRuntime(runtime, runtime.pose, 0);
    expect(changed.progress.variant).toBe('exit');
    expect(getWorld(changed).variant).toBe('exit');
    expect(getWorld(changed).floors.some((floor) => floor.id === 'expanded-exit')).toBe(true);
    expect(getWorld(changed).solids.some((wall) => wall.id === 'boundary-z-8--1-1')).toBe(false);
    const checkpoint = createCheckpoint(changed);
    const restored = createInitialRuntime(restoreCheckpoint(checkpoint)!.checkpoint);
    expect(restored.progress.variant).toBe('exit');
    expect(getWorld(restored).floors).toEqual(getWorld(changed).floors);
    expect(canApplyReturnVariant(restored)).toBe(false);
  });
  it('contains every replaced wall and the full rendered floor/ceiling thickness inside the certified changed region', () => {
    const runtime = createInitialRuntime();
    const before = getWorld(runtime);
    const after = getWorld({ ...runtime, progress: { ...runtime.progress, variant: 'exit' } });
    const contains = (min: Vec3, max: Vec3) => {
      for (const axis of ['x', 'y', 'z'] as const) {
        expect(min[axis]).toBeGreaterThanOrEqual(CHANGED_REGION.min[axis]);
        expect(max[axis]).toBeLessThanOrEqual(CHANGED_REGION.max[axis]);
      }
    };
    const idsBefore = new Set(before.solids.map((wall) => wall.id));
    const idsAfter = new Set(after.solids.map((wall) => wall.id));
    for (const wall of [...before.solids.filter((item) => !idsAfter.has(item.id)), ...after.solids.filter((item) => !idsBefore.has(item.id))]) contains(wall.min, wall.max);
    const floorsBefore = new Set(before.floors.map((floor) => floor.id));
    const floorsAfter = new Set(after.floors.map((floor) => floor.id));
    for (const floor of [...before.floors.filter((item) => !floorsAfter.has(item.id)), ...after.floors.filter((item) => !floorsBefore.has(item.id))]) {
      contains({ x: floor.minX, y: -FLOOR_THICKNESS, z: floor.minZ }, { x: floor.maxX, y: CEILING_BASE_Y + CEILING_THICKNESS, z: floor.maxZ });
    }
  });
  it('rejects invalid schemas/semantic flags and recovers bad or obsolete poses to supported checkpoints', () => {
    const checkpoint = createCheckpoint(createInitialRuntime());
    expect(restoreCheckpoint({ ...checkpoint, schemaVersion: 42 })).toBeUndefined();
    expect(restoreCheckpoint({ ...checkpoint, levelVersion: 20 })).toBeUndefined();
    expect(restoreCheckpoint({ ...checkpoint, progress: { ...checkpoint.progress, sealB: true } })).toBeUndefined();
    for (const value of [{ ...checkpoint, pose: { ...origin, position: { x: -3, y: 1.6, z: 3 } } }, { ...checkpoint, pose: { ...origin, position: { x: NaN, y: 1.6, z: 3 } } }, { ...checkpoint, levelVersion: 0 }]) {
      const restored = restoreCheckpoint(value)!;
      expect(restored.recovered).toBe(true);
      expect(isSafePose(restored.checkpoint.pose, getWorld(createInitialRuntime(restored.checkpoint)))).toBe(true);
    }
  });
  it('rejects supported checkpoint coordinates beyond a still-locked puzzle gate', () => {
    const checkpoint = createCheckpoint(createInitialRuntime());
    expect(isSafePose(OBSERVATION_POSE, getWorld(createInitialRuntime()))).toBe(true);
    const restored = restoreCheckpoint({ ...checkpoint, pose: OBSERVATION_POSE })!;
    expect(restored.recovered).toBe(true);
    expect(restored.checkpoint.pose).toEqual(CHAPTER.spawn);
  });
  it('physically walks the whole chapter, branches into a reversible alcove, solves both seals, returns, opens and exits', () => {
    let runtime = toKey(solveA());
    runtime = walkTo(runtime, 5, -13.5);
    runtime = walkTo(runtime, 5, -17);
    runtime = walkTo(runtime, 3, -17);
    runtime = walkTo(runtime, 5, -17);
    runtime = walkTo(runtime, 5, -13.5);
    runtime = walkTo(runtime, 8, -13.5);
    runtime = inspect(runtime, 'key');
    expect(runtime.progress).toMatchObject({ sealA: true, sealB: true, variant: 'exit', cleared: false });
    const again = inspect(runtime, 'key');
    expect(again.progress).toEqual(runtime.progress);
    runtime = waitDoors(runtime);
    for (const [x, z] of [[11, -13.5], [11, -6], [11, -4], [2, -4], [0, -4], [0, 7], [0, 12.3]]) runtime = walkTo(runtime, x!, z!);
    runtime = inspect(runtime, 'exit');
    expect(runtime.progress.exitDoorOpen).toBe(true);
    expect(runtime.progress.cleared).toBe(false);
    runtime = waitDoors(runtime);
    runtime = walkTo(runtime, 0, 15.5);
    expect(runtime.progress.cleared).toBe(true);
    expect(runtime.pose.position.z).toBeGreaterThanOrEqual(14.75);
    const restored = createInitialRuntime(restoreCheckpoint(createCheckpoint(runtime))!.checkpoint);
    expect(restored.progress).toEqual(runtime.progress);
    expect(restored.doorExitOpen).toBe(1);
  });
  it('all intermediate milestones retain coherent three-stage hints and a route to the next mechanism', () => {
    const first = createInitialRuntime();
    const a = solveA();
    const b = toKey(a);
    for (const runtime of [first, a, b]) {
      for (const stage of [1, 2, 3] as const) {
        const hinted = setHintStage(runtime, stage);
        expect(hintForRuntime(hinted).text.length).toBeGreaterThan(5);
        expect(hinted.progress.sealA).toBe(runtime.progress.sealA);
        expect(hinted.progress.sealB).toBe(runtime.progress.sealB);
        expect(hinted.pose).toBe(runtime.pose);
      }
    }
    expect(inspect(b, 'key').progress.sealB).toBe(true);
  });
  it('every restorable named checkpoint has a collision-valid state-graph route to its next mechanism or the exit', () => {
    const initial = createInitialRuntime();
    const a = { ...initial.progress, guideExamined: true, markActivated: true, sealA: true };
    const b = { ...a, sealB: true };
    const changed = { ...b, variant: 'exit' as const };
    const open = { ...changed, exitDoorOpen: true };
    const states = [
      { progress: initial.progress, target: { x: 0, z: 1 } },
      { progress: a, target: { x: 8, z: -13.5 } },
      { progress: b, target: { x: 8, z: -13.5 } },
      { progress: changed, target: { x: 0, z: 12.5 } },
      { progress: open, target: { x: 0, z: 15.5 } },
    ];
    for (const state of states) {
      const runtime = { ...initial, progress: state.progress, doorAOpen: state.progress.sealA ? 1 : 0, doorBOpen: state.progress.sealB ? 1 : 0, doorExitOpen: state.progress.exitDoorOpen ? 1 : 0 };
      const world = getWorld(runtime);
      const safety = new Map<string, boolean>();
      const safe = (x: number, z: number) => {
        const key = `${x},${z}`;
        if (!safety.has(key)) safety.set(key, isSafePose({ ...origin, position: { x, y: 1.6, z } }, world));
        return safety.get(key)!;
      };
      const reached = new Set([`${state.target.x},${state.target.z}`]);
      const queue = [state.target];
      for (let i = 0; i < queue.length; i += 1) {
        const point = queue[i]!;
        for (const [dx, dz] of [[0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]]) {
          const next = { x: point.x + dx!, z: point.z + dz! };
          const key = `${next.x},${next.z}`;
          if (reached.has(key) || ![0.25, 0.5, 0.75, 1].every((t) => safe(point.x + dx! * t, point.z + dz! * t))) continue;
          reached.add(key); queue.push(next);
        }
      }
      for (const pose of CHAPTER.checkpoints) {
        const saved = { ...createCheckpoint(runtime), pose };
        const restored = restoreCheckpoint(saved)!;
        if (!restored.recovered) expect(reached.has(`${pose.position.x},${pose.position.z}`)).toBe(true);
      }
    }
  });
  it('has no perceptual profile or neutral-color input in collision, projection or success rules', () => {
    const runtime = createInitialRuntime();
    const world = getWorld(runtime);
    const expected = updatePlayer(runtime.pose, { strafe: 0, forward: 1 }, 0.1, world);
    for (const profile of ['red', 'blue', 'neutral']) for (const neutralColors of [false, true]) {
      const displayOnly = { ...runtime, profile, neutralColors };
      expect(getWorld(displayOnly)).toEqual(world);
      expect(updatePlayer(displayOnly.pose, { strafe: 0, forward: 1 }, 0.1, getWorld(displayOnly))).toEqual(expected);
    }
    expect(forwardVector(OBSERVATION_POSE)).toEqual({ x: -0, y: 0, z: -1 });
  });
});
