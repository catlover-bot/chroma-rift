import { render } from '@testing-library/react-native';
import { Box3, Matrix4, Quaternion, Vector3, type BufferGeometry } from 'three';
import { isSafePose, updatePlayer } from '../firstPerson/geometry';
import type { PlayerPose } from '../firstPerson/types';
import { vaultActorEdgeOpen } from '../vault/actorPolicy';
import { stageBinding } from '../stages/departure-control-v1/binding';
import { parseStageCheckpoint, type StageCheckpoint } from '../stages/departure-control-v1/checkpoint';
import { CONTROL_SAFE, STAFF_EXIT_SAFE, stageWorld as departureWorld } from '../stages/departure-control-v1/definition';
import { advanceContainmentActor } from '../stages/departure-control-v1/actor';
import { advanceStage, checkpointStage, createStageSession, type StageSession } from '../stages/departure-control-v1/session';
import { stageWorld as mirrorWorld, PRACTICE_CENTER, WINCH_CENTER } from '../stages/mirror-corridor-v1/definition';
import { WinchModel } from '../../rendering/firstPerson/MechanicalDevices';
import { createSceneResources } from '../../rendering/firstPerson/resources';
import { actorShutdownPose } from '../../rendering/firstPerson/actorArtRig';

jest.mock('@react-three/fiber/native', () => ({ useFrame: jest.fn() }));

// Literal coordinates from the r8 checkpoint format, independent of current
// authored spawn constants. These raw saved values must keep their meaning.
const legacyPoses: PlayerPose[] = [
  { position: { x: -3.75, y: 1.6, z: 10 }, yaw: Math.PI, pitch: 0 },
  { position: { x: -3.75, y: 1.6, z: 10 }, yaw: Math.PI / 4, pitch: Math.atan2(-.2, Math.SQRT2) },
];
function checkpoint(progress: number, pose: PlayerPose = CONTROL_SAFE): StageCheckpoint {
  return { schemaVersion: 1, stageId: 'departure-control-v1', keyAvailable: progress === 1,
    keyInstalled: progress >= 2, procedureRead: progress >= 3, isolated: progress >= 4,
    stopped: progress >= 5, staffDoorOpened: progress >= 6, cleared: progress >= 7, pose };
}

test.each(legacyPoses.flatMap((pose, poseIndex) => Array.from({ length: 8 }, (_, progress) => ({ pose, poseIndex, progress }))))(
  'literal r8 pose $poseIndex preserves progress $progress without recovery or raw mutation', ({ pose, progress }) => {
    const raw = JSON.stringify(checkpoint(progress, pose)), data: unknown = JSON.parse(raw);
    expect(parseStageCheckpoint(data)).toEqual(data);
    const fresh = stageBinding.checkpoint(stageBinding.create());
    const restored = stageBinding.restore({ ...fresh, stageData: data });
    expect(restored?.recovered).toBe(false);
    expect(restored?.checkpoint.stageData).toEqual(data);
    const session = createStageSession('r8-cold', data);
    const { schemaVersion, ...savedState } = checkpoint(progress, pose);
    expect(schemaVersion).toBe(1);
    expect(session).toMatchObject(savedState);
    expect(isSafePose(session.pose, departureWorld(session.doorProgress, session.staffDoorOpened,
      session.actor.motion.position, session.keyInstalled, session.stopped, session.staffDoorProgress))).toBe(true);
    expect(JSON.stringify(data)).toBe(raw);
  },
);

test.each([
  { name: 'area-04 practice', world: mirrorWorld(0), x: (-2.55 - 1.84) / 2, from: 5.9, to: 6.85, width: .71 },
  { name: 'area-05 control bay', world: departureWorld(), x: (-4.1 - 3.4) / 2, from: 7.4, to: 8.8, width: .7 },
])('$name gap physically passes the player but rejects every actor center across its opening', ({ world, x, from, to, width }) => {
  let pose: PlayerPose = { position: { x, y: 1.6, z: from }, yaw: Math.PI, pitch: 0 };
  expect(isSafePose(pose, world)).toBe(true);
  for (let i = 0; i < 60 && pose.position.z < to; i++) pose = updatePlayer(pose, { forward: 1, strafe: 0 }, 1 / 60, world);
  expect(pose.position.z).toBeGreaterThanOrEqual(to);
  for (let i = 0; i <= 20; i++) {
    const actorX = x - width / 2 + width * i / 20;
    expect(vaultActorEdgeOpen({ x: actorX, y: 0, z: from }, { x: actorX, y: 0, z: to }, world)).toBe(false);
  }
});

test.each([true, false])('collision encloses the actual authored mechanical body (practice=%s)', async practice => {
  const resources = createSceneResources(true, null), center = practice ? PRACTICE_CENTER : WINCH_CENTER;
  const view = await render(<WinchModel resources={resources} practice={practice}
    state={() => ({ holding: false, progress: 0, ratchets: 0, complete: false })}/>);
  try {
    const body = view.root?.children.find(node => typeof node !== 'string' && node.props.name === 'mechanism-fixed-body');
    if (!body || typeof body === 'string') throw new Error('The actual WinchModel has no physical body mesh');
    const props = body.props as {
      geometry: BufferGeometry; position: [number, number, number]; scale: [number, number, number] };
    props.geometry.computeBoundingBox();
    const position = new Vector3(...props.position).add(new Vector3(center.x, center.y, center.z));
    const rendered = props.geometry.boundingBox!.clone().applyMatrix4(new Matrix4().compose(position, new Quaternion(), new Vector3(...props.scale)));
    const world = mirrorWorld(0), core = world.solids.find(solid => solid.id === (practice ? 'practice-bench-core' : 'winch-core'))!;
    expect(core).toBeDefined();
    const collider = new Box3(new Vector3(core.min.x, core.min.y, core.min.z), new Vector3(core.max.x, core.max.y, core.max.z));
    expect(collider.clone().expandByScalar(1e-6).containsBox(rendered)).toBe(true);
    const bodyCenter = rendered.getCenter(new Vector3());
    expect(isSafePose({ position: { x: bodyCenter.x, y: 1.6, z: bodyCenter.z }, yaw: 0, pitch: 0 }, world)).toBe(false);
    expect(isSafePose({ position: { x: -2, y: 1.6, z: center.z }, yaw: 0, pitch: 0 }, world)).toBe(true);
  } finally { await view.unmount(); resources.dispose(); }
});

test.each(['standard', 'subdued'] as const)('confirmed isolation suppresses stale attack, recognition, search and new noise in %s', intensity => {
  let session: StageSession = createStageSession('isolated', checkpoint(4));
  session = { ...session, footstepDistance: .64, noiseSequence: 19,
    noise: { sequence: 19, kind: 'bell', strength: 1.2, position: { ...CONTROL_SAFE.position } },
    actor: { ...session.actor, phase: 'attack', phaseTime: .2, recognition: 1, searchSeconds: 3,
      startupGrace: 0, contactCooldown: 0, lastSeen: { x: 4, y: 1.6, z: 16 }, attackTarget: { ...CONTROL_SAFE.position } } };
  let otherPlayer = { ...session, pose: { ...session.pose, position: { x: 2.4, y: 1.6, z: 18 } } };
  for (let frame = 0; frame < 120; frame++) {
    const first = advanceContainmentActor(session, 1 / 60, { intensity, movedDistance: 2 });
    const second = advanceContainmentActor(otherPlayer, 1 / 60, { intensity, movedDistance: 2 });
    expect(first).toMatchObject({ caught: false, movedDistance: 0, footPlants: [], events: [], soundSources: [] });
    expect(first.session.actor).toMatchObject({ visible: true, phase: 'investigate', recognition: 0, searchSeconds: 0 });
    expect(first.session.noise).toBeUndefined();
    expect(first.session.noiseSequence).toBe(19);
    expect(first.session.actor.motion).toEqual(second.session.actor.motion);
    session = first.session; otherPlayer = second.session;
  }
});

test('shutdown and staff-door clocks advance physically but cold checkpoints restore their settled state', () => {
  let live = createStageSession('stopped-live', checkpoint(5));
  live = { ...live, shutdownSeconds: 0, staffDoorOpened: true, staffDoorProgress: 0 };
  const pausedClock = advanceStage(live, 0);
  expect(pausedClock).toBe(live);
  for (let i = 0; i < 30; i++) live = advanceStage(live, 1 / 60);
  expect(live.shutdownSeconds).toBeCloseTo(.5);
  expect(live.staffDoorProgress).toBeCloseTo(.5 / 1.2);
  const movingDoor = departureWorld(1, true, undefined, true, true, live.staffDoorProgress).solids.find(s => s.id === 'staff-door')!;
  expect(movingDoor.min.y).toBeCloseTo(3.6 * live.staffDoorProgress);
  const raw = checkpointStage({ ...live, pose: STAFF_EXIT_SAFE });
  expect(raw).not.toHaveProperty('shutdownSeconds');
  expect(raw).not.toHaveProperty('staffDoorProgress');
  expect(raw).not.toHaveProperty('exitAftermathSeconds');
  const cold = createStageSession('stopped-cold', JSON.parse(JSON.stringify(raw)));
  expect(cold).toMatchObject({ isolated: true, stopped: true, staffDoorOpened: true, shutdownSeconds: 1.6,
    staffDoorProgress: 1, exitAftermathSeconds: 0, actor: { phase: 'stopped', visible: true } });
  expect(actorShutdownPose(cold.shutdownSeconds)).toEqual({ hands: 1, shoulders: 1, head: 1 });
  expect(advanceContainmentActor(cold, 1 / 60, { intensity: 'standard', movedDistance: 1 }).session).toBe(cold);
});
