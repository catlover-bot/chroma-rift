import { Box3, Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three';

import {
  CAMERA_FAR, CAMERA_NEAR, CHAPTER, createCheckpoint, createInitialRuntime, EYE_HEIGHT,
  findInteraction, forwardVector, getWorld, inspectPoseSafety, interact, interactionCue,
  isSafePose, projectWithCamera, restoreCheckpoint, segmentOccluded, VERTICAL_FOV,
  type CameraMatrices, type PlayerPose, type Vec3,
} from '..';

function view(pose: PlayerPose, width = 390, height = 620) {
  const camera = new PerspectiveCamera(VERTICAL_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(true);
  const matrices: CameraMatrices = { view: [...camera.matrixWorldInverse.elements], projection: [...camera.projectionMatrix.elements] };
  const frustum = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  return { camera, matrices, frustum };
}
function lookingAt(pose: PlayerPose, point: Vec3): PlayerPose {
  const dx = point.x - pose.position.x;
  const dz = point.z - pose.position.z;
  return { ...pose, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(point.y - pose.position.y, Math.hypot(dx, dz)) };
}

describe('authored chapter startup camera and first landmark (real Three math, no GPU)', () => {
  it('starts on the complete vestibule floor with an unobscured guide, doorway and floor in the actual canvas frustum', () => {
    const runtime = createInitialRuntime();
    const world = getWorld(runtime);
    expect(world.floors.some((floor) => floor.id === 'small-vestibule')).toBe(true);
    expect(inspectPoseSafety(runtime.pose, world)).toEqual({ finite: true, eyeHeightValid: true, pitchValid: true, supportedFloor: true, intersectingSolidIds: [] });
    const guide = world.interactables.find((item) => item.id === 'guide')!;
    const doorway = world.solids.find((solid) => solid.id === 'floor-room-door-right')!;
    const landmarks = [guide.center, { x: 1.3, y: EYE_HEIGHT, z: doorway.max.z + 0.001 }, { x: 0, y: 0, z: 2 }];
    for (const [width, height] of [[320, 560], [390, 620], [430, 500]]) {
      const { camera, matrices, frustum } = view(runtime.pose, width, height);
      expect(camera.aspect).toBe(width! / height!);
      expect(camera.getWorldDirection(new Vector3()).distanceTo(new Vector3(0, 0, -1))).toBeCloseTo(0, 12);
      for (const landmark of landmarks) {
        expect(projectWithCamera(landmark, matrices)).toBeDefined();
        expect(frustum.containsPoint(new Vector3(landmark.x, landmark.y, landmark.z))).toBe(true);
        expect(segmentOccluded(runtime.pose.position, landmark, world)).toBe(false);
      }
      expect(frustum.intersectsBox(new Box3(new Vector3(doorway.min.x, doorway.min.y, doorway.min.z), new Vector3(doorway.max.x, doorway.max.y, doorway.max.z)))).toBe(true);
      // Visibility alone neither makes the distant guide actionable nor opens a seal.
      expect(interactionCue(world, runtime.pose, matrices)).toMatchObject({ kind: 'approach', target: { id: 'guide' } });
      expect(interact(runtime, 'guide')).toBe(runtime);
    }
  });

  it('matches Three camera forward for both yaw and pitch instead of changing only a compass label', () => {
    for (const [yaw, pitch] of [[0, -0.3], [Math.PI / 2, 0.2], [-Math.PI / 4, -0.4]]) {
      const pose = { ...CHAPTER.spawn, yaw: yaw!, pitch: pitch! };
      const direction = view(pose).camera.getWorldDirection(new Vector3());
      const expected = forwardVector(pose);
      expect(direction.x).toBeCloseTo(expected.x, 12);
      expect(direction.y).toBeCloseTo(expected.y, 12);
      expect(direction.z).toBeCloseTo(expected.z, 12);
    }
  });

  it('explains the close but level-view guide as needing aim, then enables only the existing range/LOS action', () => {
    const runtime = createInitialRuntime();
    const world = getWorld(runtime);
    const pose = { ...runtime.pose, position: { x: 0, y: EYE_HEIGHT, z: 1 } };
    expect(isSafePose(pose, world)).toBe(true);
    expect(findInteraction(world, pose)).toBeUndefined();
    expect(interactionCue(world, pose, view(pose).matrices)).toMatchObject({ kind: 'aim', target: { id: 'guide' } });
    const aimed = lookingAt(pose, world.interactables[0]!.center);
    expect(aimed.pitch).toBeLessThan(0);
    expect(interactionCue(world, aimed, view(aimed).matrices)).toMatchObject({ kind: 'ready', target: { id: 'guide' } });
    expect(interact({ ...runtime, pose: aimed }, 'guide').progress).toMatchObject({ guideExamined: true, markActivated: false, sealA: false });
  });

  it('does not offer visible-target explanations through a wall, behind the camera, or from stale/invalid matrices', () => {
    const runtime = createInitialRuntime();
    const world = getWorld(runtime);
    const initialView = view(runtime.pose).matrices;
    const blocked = { ...world, solids: [...world.solids, { id: 'cover-guide', min: { x: -3, y: 0, z: 1 }, max: { x: 3, y: 3.2, z: 1.1 }, kind: 'wall' as const, opaque: true }] };
    expect(interactionCue(blocked, runtime.pose, initialView)).toEqual({ kind: 'none' });
    const turned = { ...runtime.pose, yaw: Math.PI };
    expect(interactionCue(world, turned, view(turned).matrices)).toEqual({ kind: 'none' });
    expect(interactionCue(world, turned, initialView)).toEqual({ kind: 'none' });
    expect(interactionCue(world, runtime.pose, { ...initialView, projection: Array(16).fill(NaN) })).toEqual({ kind: 'none' });
  });
});

describe('pose-only checkpoint recovery preserves validated chapter progress', () => {
  it('recovers corrupt, unsupported or colliding saved poses without changing seals, variant, hints or aid history', () => {
    const initial = createInitialRuntime();
    const progress = { ...initial.progress, guideExamined: true, markActivated: true, sealA: true, sealB: true, variant: 'exit' as const, hintStage: 2 as const, usedLookAssist: true };
    const checkpoint = createCheckpoint({ ...initial, progress, doorAOpen: 1, doorBOpen: 1 });
    for (const pose of [
      { ...checkpoint.pose, position: { x: NaN, y: EYE_HEIGHT, z: 7 } },
      { ...checkpoint.pose, yaw: Infinity },
      { ...checkpoint.pose, pitch: 2 },
      { ...checkpoint.pose, position: { x: 0, y: 3.3, z: 7 } },
      { ...checkpoint.pose, position: { x: 99, y: EYE_HEIGHT, z: 7 } },
      { ...checkpoint.pose, position: { x: 1.5, y: EYE_HEIGHT, z: 6 } },
    ]) {
      const saved = { ...checkpoint, pose };
      const restored = restoreCheckpoint(saved)!;
      expect(restored.recovered).toBe(true);
      expect(restored.checkpoint.progress).toEqual(progress);
      expect(saved.pose).toBe(pose);
      const resumed = createInitialRuntime(restored.checkpoint);
      expect(isSafePose(resumed.pose, getWorld(resumed))).toBe(true);
      expect(inspectPoseSafety(resumed.pose, getWorld(resumed)).intersectingSolidIds).toEqual([]);
    }
  });

  it('retains a valid named checkpoint and its chosen view across re-entry instead of moving on every mount', () => {
    const checkpoint = { ...createCheckpoint(createInitialRuntime()), pose: { ...CHAPTER.checkpoints[1]!, yaw: 0.23, pitch: -0.2 } };
    const restored = restoreCheckpoint(checkpoint)!;
    expect(restored.recovered).toBe(false);
    expect(restored.checkpoint.pose).toEqual(checkpoint.pose);
    expect(createInitialRuntime(restored.checkpoint).pose).toEqual(checkpoint.pose);
  });
});
