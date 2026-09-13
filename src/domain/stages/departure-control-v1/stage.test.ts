import { isSafePose, segmentOccluded } from '../../firstPerson/geometry';
import { vaultActorEdgeOpen } from '../../vault/actorPolicy';
import { actorFullyContained, BELL_RECEIVER, CONTROL_KEY_ENTRY, CONTROL_SAFE, doorSweepClear, stageWorld } from './definition';
import { carriedKeyEntry, advanceStage, checkpointStage, commandStage, createStageSession } from './session';
import { parseStageCheckpoint } from './checkpoint';

test('control bay, both patrol lanes, and independent staff route have physical geometry', () => {
  expect(isSafePose(CONTROL_SAFE, stageWorld())).toBe(true);
  expect(isSafePose(CONTROL_KEY_ENTRY, stageWorld())).toBe(true);
  expect(vaultActorEdgeOpen({ x: -1.2, y: 0, z: 4 }, { x: -1.2, y: 0, z: 10 }, stageWorld())).toBe(true);
  expect(vaultActorEdgeOpen({ x: 1.2, y: 0, z: 4 }, { x: 1.2, y: 0, z: 10 }, stageWorld())).toBe(true);
  expect(vaultActorEdgeOpen({ x: -3.75, y: 0, z: 7.1 }, { x: -3.75, y: 0, z: 9 }, stageWorld())).toBe(false);
  expect(vaultActorEdgeOpen({ x: 2.4, y: 0, z: 14 }, { x: 2.4, y: 0, z: 17 }, stageWorld())).toBe(true);
  expect(vaultActorEdgeOpen({ x: 2.4, y: 0, z: 14 }, { x: 2.4, y: 0, z: 17 }, stageWorld(1))).toBe(false);
  expect(vaultActorEdgeOpen({ x: -3.7, y: 0, z: 13.2 }, { x: -3.7, y: 0, z: 16 }, stageWorld(1, false))).toBe(false);
  expect(vaultActorEdgeOpen({ x: -3.7, y: 0, z: 13.2 }, { x: -3.7, y: 0, z: 16 }, stageWorld(1, true))).toBe(true);
});

test('key-facing cold entry keeps the original exit-facing checkpoint valid', () => {
  const entry = carriedKeyEntry();
  expect(entry.pose).toEqual(CONTROL_KEY_ENTRY);
  expect(parseStageCheckpoint(entry)?.pose).toEqual(CONTROL_KEY_ENTRY);
  const legacy = { ...entry, pose: CONTROL_SAFE };
  expect(parseStageCheckpoint(legacy)?.pose).toEqual(CONTROL_SAFE);
  expect(checkpointStage(createStageSession('before-key', entry)).pose).toEqual(CONTROL_KEY_ENTRY);
  const installed = commandStage(createStageSession('after-key', entry),
    { sessionId: 'after-key', seq: 1, targetId: 'departure-key', type: 'install-key' });
  expect(installed.accepted).toBe(true);
  expect(checkpointStage(installed.session).pose).toEqual(CONTROL_SAFE);
});

test('control-bay glass exposes the contained body while outdoor completion lies beyond the facade', () => {
  const world = stageWorld(0, true);
  expect(segmentOccluded({ x: -3.75, y: 1.6, z: 12 }, { x: 2.36, y: 1.6, z: 16.5 }, world)).toBe(false);
  expect(isSafePose({ position: { x: .7, y: 1.6, z: 16.5 }, yaw: Math.PI, pitch: 0 }, world)).toBe(false);
  expect(isSafePose({ position: { x: -3.75, y: 1.6, z: 22.45 }, yaw: Math.PI, pitch: 0 }, world)).toBe(true);
  expect(world.floors.some(floor => floor.id === 'outdoor-paving' && floor.minZ < 22.45)).toBe(true);
});

test('only a carried key enables the control sequence; one accepted bell has one remote noise source', () => {
  let session = createStageSession('finale');
  expect(commandStage(session, { sessionId: 'finale', seq: 1, targetId: 'departure-key', type: 'install-key' }).accepted).toBe(false);
  session = createStageSession('finale', carriedKeyEntry());
  const command = (seq: number, targetId: Parameters<typeof commandStage>[1]['targetId'], type: Parameters<typeof commandStage>[1]['type']) => {
    const result = commandStage(session, { sessionId: 'finale', seq, targetId, type });
    session = result.session;
    return result;
  };
  expect(command(1, 'departure-stop', 'stop-control').accepted).toBe(false);
  expect(command(2, 'departure-key', 'install-key').accepted).toBe(true);
  expect(command(3, 'departure-procedure', 'read-procedure').accepted).toBe(true);
  expect(command(4, 'departure-bell', 'ring-bell').accepted).toBe(true);
  expect(session.noise).toMatchObject({ sequence: 1, position: BELL_RECEIVER, kind: 'bell' });
  expect(command(5, 'departure-bell', 'ring-bell')).toMatchObject({ accepted: false, reason: 'coolingDown' });
  expect(session.noiseSequence).toBe(1);
  expect(command(5, 'departure-bell', 'ring-bell')).toMatchObject({ accepted: false, reason: 'stale' });
  expect(command(6, 'departure-door', 'close-door')).toMatchObject({ accepted: false, reason: 'actorOutside' });
});

test('whole-body and sweep checks govern closing; latch, stop and outdoor exit are separate', () => {
  let session = createStageSession('latch', carriedKeyEntry());
  session = commandStage(session, { sessionId: 'latch', seq: 1, targetId: 'departure-key', type: 'install-key' }).session;
  session = commandStage(session, { sessionId: 'latch', seq: 2, targetId: 'departure-procedure', type: 'read-procedure' }).session;
  const nearDoor = { x: BELL_RECEIVER.x, y: 0, z: 15.42 };
  expect(actorFullyContained(nearDoor)).toBe(false);
  expect(doorSweepClear(nearDoor)).toBe(false);
  expect(actorFullyContained({ x: BELL_RECEIVER.x, y: 0, z: BELL_RECEIVER.z })).toBe(true);
  const body = { ...session.actor, motion: { ...session.actor.motion, position: { x: BELL_RECEIVER.x, y: 0, z: BELL_RECEIVER.z } } };
  session = { ...session, actor: body, pose: { ...CONTROL_SAFE, position: { x: -3.75, y: 1.6, z: 11 } } };
  const close = commandStage(session, { sessionId: 'latch', seq: 3, targetId: 'departure-door', type: 'close-door' });
  expect(close.accepted).toBe(true);
  session = close.session;
  expect(commandStage(session, { sessionId: 'latch', seq: 4, targetId: 'departure-stop', type: 'stop-control' }).accepted).toBe(false);
  for (let frame = 0; frame < 90; frame += 1) session = advanceStage(session, 1 / 60);
  expect(session.isolated).toBe(true);
  expect(session.doorProgress).toBe(1);
  expect(commandStage(session, { sessionId: 'latch', seq: 5, targetId: 'departure-outdoor', type: 'outdoor-exit' }).accepted).toBe(false);
  const stop = commandStage(session, { sessionId: 'latch', seq: 6, targetId: 'departure-stop', type: 'stop-control' });
  expect(stop.accepted).toBe(true);
  expect(stop.session.actor.phase).toBe('stopped');
  expect(stop.session.cleared).toBe(false);
  expect(parseStageCheckpoint(checkpointStage(stop.session))).toBeDefined();
});
