import { createActorMotion } from '../../actorMotion';
import { isSafePose, segmentOccluded } from '../../firstPerson/geometry';
import { vaultActorEdgeOpen } from '../../vault/actorPolicy';
import { advanceMirrorActor, MIRROR_PATROL } from './actor';
import { RATCHET_COUNT, SHELTER_SAFE, WINCH_CENTER, stageWorld } from './definition';
import { advanceStage, checkpointStage, commandStage, createStageSession } from './session';

const atWinch = { position: { x: -2.45, y: 1.6, z: 9.6 }, yaw: Math.PI, pitch: 0 };

beforeEach(() => {
  expect(isSafePose(atWinch, stageWorld(0, true, true))).toBe(true);
});

test('the same embodied patrol hears the real winch source, turns and moves toward it', () => {
  let session = createStageSession('hear');
  session = { ...session, pose: atWinch, keyTaken: true, practiced: true };
  const start = commandStage(session, { sessionId: 'hear', seq: 1, targetId: 'mirror-corridor-winch', type: 'start-hold' });
  expect(start.accepted).toBe(true);
  const first = advanceMirrorActor(start.session, 1 / 60, { intensity: 'standard', movedDistance: 0 });
  expect(first.session.actor).toMatchObject({ phase: 'investigate', lastHeard: WINCH_CENTER });
  expect(first.session.actor.lastSeen).toBeUndefined();
  expect(first.soundSources).toEqual([WINCH_CENTER]);
  const origin = first.session.actor.motion.position;
  session = first.session;
  for (let frame = 0; frame < 120; frame += 1) {
    session = advanceStage(session, 1 / 60);
    session = advanceMirrorActor(session, 1 / 60, { intensity: 'standard', movedDistance: 0 }).session;
  }
  expect(Math.hypot(session.actor.motion.position.x - WINCH_CENTER.x, session.actor.motion.position.z - WINCH_CENTER.z))
    .toBeLessThan(Math.hypot(origin.x - WINCH_CENTER.x, origin.z - WINCH_CENTER.z));
  expect(session.ratchets).toBeGreaterThanOrEqual(1);
  expect(session.actor.motion.feet.length).toBe(2);
});

test('an invalid movement sample cannot corrupt the transient footstep accumulator', () => {
  const session = createStageSession('invalid-sample');
  const next = advanceMirrorActor(session, 1 / 60, { intensity: 'standard', movedDistance: Number.NaN }).session;
  expect(next.footstepDistance).toBe(0);
  expect(next.noiseSequence).toBe(0);
});

test('direct sight takes precedence over a bell-like noise and keeps lastSeen separate from lastHeard', () => {
  let session = createStageSession('sight');
  session = { ...session, pose: atWinch, keyTaken: true, practiced: true,
    actor: { ...session.actor, motion: createActorMotion({ x: -1.4, y: 0, z: 13.2 }, 0), startupGrace: 0, recognition: .99 },
    noiseSequence: 1, noise: { sequence: 1, position: { x: 1.1, y: 1.4, z: 15 }, strength: 1.2, kind: 'mechanism' } };
  const step = advanceMirrorActor(session, 1 / 60, { intensity: 'standard', movedDistance: 0 });
  expect(step.session.actor.phase).toBe('notice');
  expect(step.session.actor.lastSeen).toEqual(atWinch.position);
  expect(step.session.actor.lastHeard).toEqual({ x: 1.1, y: 1.4, z: 15 });
});

test('quiet mode keeps the same teeth, key and actor body without chase or capture', () => {
  let session = createStageSession('quiet');
  session = { ...session, pose: atWinch, keyTaken: true, practiced: true };
  session = commandStage(session, { sessionId: 'quiet', seq: 1, targetId: 'mirror-corridor-winch', type: 'start-hold' }).session;
  for (let frame = 0; frame < 370; frame += 1) {
    session = advanceStage(session, 1 / 60);
    const step = advanceMirrorActor(session, 1 / 60, { intensity: 'subdued', movedDistance: 0 });
    expect(step.caught).toBe(false);
    session = step.session;
  }
  expect(session.ratchets).toBe(RATCHET_COUNT);
  expect(session.actor.visible).toBe(true);
  expect(['notice', 'pursue', 'windup', 'attack']).not.toContain(session.actor.phase);
  const checkpoint = checkpointStage(session);
  expect(checkpoint).toMatchObject({ keyTaken: true, practiced: true, ratchets: 3 });
  const coldA = createStageSession('cold-a', checkpoint), coldB = createStageSession('cold-b', checkpoint);
  coldA.actor.motion.feet[0].position.x += .3;
  expect(coldB.actor.motion.feet[0].position.x).not.toBe(coldA.actor.motion.feet[0].position.x);
  expect(coldA.holding).toBeNull();
  expect(coldB.actor.startupGrace).toBeGreaterThan(0);
});

test('closed grate blocks the actor body and the final raised height opens the same path', () => {
  const from = { x: 0, y: 0, z: 16.1 }, to = { x: 0, y: 0, z: 18.4 };
  expect(vaultActorEdgeOpen(from, to, stageWorld(0, true, true))).toBe(false);
  expect(vaultActorEdgeOpen(from, to, stageWorld(3, true, true))).toBe(true);
  expect(MIRROR_PATROL.every(point => vaultActorEdgeOpen(point, point, stageWorld(0, true, true)))).toBe(true);
});

test('the shelf recess has a walkable entrance and physically occludes a hidden player', () => {
  const world = stageWorld(0, true, true);
  for (const position of [
    { x: -2.45, y: 1.6, z: 12.3 }, { x: -3.05, y: 1.6, z: 12.3 },
    { x: -3.75, y: 1.6, z: 12.3 }, { x: -3.75, y: 1.6, z: 11.15 },
  ]) expect(isSafePose({ position, yaw: 0, pitch: 0 }, world)).toBe(true);
  expect(segmentOccluded({ x: -.9, y: 1.95, z: 13.1 }, { x: -3.75, y: 1.6, z: 11.15 }, world)).toBe(true);
  expect(vaultActorEdgeOpen({ x: -.9, y: 0, z: 13.1 }, { x: -3.75, y: 0, z: 11.15 }, world)).toBe(false);
});

test('a caught standard-mode hold returns behind the shelf without erasing settled teeth', () => {
  let session = createStageSession('caught');
  session = { ...session, pose: atWinch, keyTaken: true, practiced: true };
  session = commandStage(session, { sessionId: 'caught', seq: 1, targetId: 'mirror-corridor-winch', type: 'start-hold' }).session;
  let caught = false;
  for (let frame = 0; frame < 900 && !caught; frame += 1) {
    session = advanceStage(session, 1 / 60);
    const step = advanceMirrorActor(session, 1 / 60, { intensity: 'standard', movedDistance: 0 });
    session = step.session;
    caught = step.caught;
  }
  expect(caught).toBe(true);
  expect(session).toMatchObject({ holding: null, holdSeconds: 0, keyTaken: true, practiced: true });
  expect(session.ratchets).toBeGreaterThan(0);
  expect(session.pose).toEqual(SHELTER_SAFE);
  expect(session.actor.contactCooldown).toBeGreaterThan(0);
});
