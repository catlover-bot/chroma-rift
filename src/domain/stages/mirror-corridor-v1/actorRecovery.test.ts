import { actorMotionEye, createActorMotion } from '../../actorMotion';
import { ACTOR_COLLISION_RADIUS } from '../../actorMotion/envelope';
import { PLAYER_RADIUS } from '../../firstPerson/constants';
import { isSafePose, segmentOccluded, updatePlayer } from '../../firstPerson/geometry';
import { vaultActorEdgeOpen } from '../../vault/actorPolicy';
import { advanceMirrorActor, createMirrorActor, MIRROR_PATROL, resumeMirrorRecovery } from './actor';
import { KEY_SAFE, POST_GATE, SHELTER_SAFE, SPAWN, WINCH_CENTER, stageWorld } from './definition';
import { createStageSession, type StageSession } from './session';

// These deliberately injected attack contacts test the recovery boundary, not
// a successful route. The player and actor each occupy legal static floor.
function contact(progress: Partial<StageSession> = {}): StageSession {
  const session = { ...createStageSession('capture-fixture'), ...progress };
  const pose = session.pose;
  const enemy = { x: pose.position.x + .66, y: 0, z: pose.position.z };
  expect(isSafePose(pose, stageWorld(session.ratchets, session.keyTaken, session.practiced, null, undefined, session.gateLift))).toBe(true);
  expect(vaultActorEdgeOpen(enemy, enemy, stageWorld(session.ratchets, session.keyTaken, session.practiced, null, undefined, session.gateLift))).toBe(true);
  return { ...session, holding: 'winch', holdSeconds: .8, footstepDistance: .5, noiseSequence: 4,
    noise: { sequence: 4, position: { ...WINCH_CENTER }, strength: 1.2, kind: 'mechanism' },
    actor: { ...session.actor, phase: 'attack', phaseTime: 0, startupGrace: 0, contactCooldown: 0,
      motion: createActorMotion(enemy, Math.PI / 2), recognition: 1, lastNoiseSequence: 3,
      lastSeen: { ...pose.position }, lastHeard: { ...WINCH_CENTER }, attackTarget: { ...pose.position } } };
}

test.each([
  ['entrance', {}, SPAWN],
  ['key before practice', { keyTaken: true, pose: KEY_SAFE }, KEY_SAFE],
  ['working', { keyTaken: true, practiced: true, ratchets: 1, gateLift: .9, pose: { position: { x: -1.8, y: 1.6, z: 10 }, yaw: Math.PI, pitch: 0 } }, SHELTER_SAFE],
  ['open but not crossed', { keyTaken: true, practiced: true, ratchets: 3, gateLift: 3.6, pose: { position: { x: -1.8, y: 1.6, z: 10 }, yaw: Math.PI, pitch: 0 } }, SHELTER_SAFE],
  ['actually crossed', { keyTaken: true, practiced: true, ratchets: 3, gateLift: 3.6, gateCrossed: true, pose: POST_GATE }, POST_GATE],
] as const)('capture restores the %s landmark without stale memories or sound', (_name, progress, expected) => {
  const session = contact(progress);
  const result = advanceMirrorActor(session, 1 / 60, { intensity: 'standard', movedDistance: 0 });
  expect(result.caught).toBe(true);
  expect(result.session.pose).toEqual(expected);
  expect(result.session).toMatchObject({ keyTaken: session.keyTaken, practiced: session.practiced, ratchets: session.ratchets,
    gateLift: session.gateLift, holding: null, holdSeconds: 0, footstepDistance: 0, noiseSequence: 4 });
  expect(result.session.noise).toBeUndefined();
  expect(result.session.actor.motion.position).toEqual(MIRROR_PATROL[0]);
  expect(result.session.actor).toMatchObject({ phase: 'patrol', recoveryPending: true, recognition: 0 });
  for (const memory of ['lastSeen', 'lastHeard', 'attackTarget', 'investigationTarget'] as const)
    expect(result.session.actor[memory]).toBeUndefined();
  const world = stageWorld(result.session.ratchets, result.session.keyTaken, result.session.practiced, null, result.session.actor.motion.position, result.session.gateLift);
  expect(isSafePose(result.session.pose, world)).toBe(true);
  expect(Math.hypot(expected.position.x - MIRROR_PATROL[0]!.x, expected.position.z - MIRROR_PATROL[0]!.z))
    .toBeGreaterThan(ACTOR_COLLISION_RADIUS + PLAYER_RADIUS);
  expect(result.footPlants).toEqual([]);
  expect(result.soundSources).toEqual([]);
  expect(result.events).toEqual(['caught']);
});

test('recovery grace and perception stay frozen until an explicit presentation/input boundary', () => {
  const caught = advanceMirrorActor(contact(), 1 / 60, { intensity: 'standard', movedDistance: 0 }).session;
  let session = caught;
  for (let frame = 0; frame < 600; frame++) session = advanceMirrorActor(session, 1 / 30, { intensity: 'standard', movedDistance: 1 }).session;
  expect(session).toBe(caught);
  expect(session.actor.startupGrace).toBeGreaterThan(2);
  session = resumeMirrorRecovery(session);
  expect(session.actor.recoveryPending).toBe(false);
  expect(resumeMirrorRecovery(session)).toBe(session);
  const stepped = advanceMirrorActor(session, 1 / 30, { intensity: 'standard', movedDistance: 0 }).session;
  expect(stepped.actor.startupGrace).toBeCloseTo(session.actor.startupGrace - 1 / 30);
  expect(createMirrorActor().recoveryPending).toBe(false);
});

test('a mechanism inside the winch has a reachable observation target and returns to patrol', () => {
  const cold = createStageSession('investigation');
  const world = stageWorld(0, false, false);
  expect(vaultActorEdgeOpen(WINCH_CENTER, WINCH_CENTER, world)).toBe(false);
  let session: StageSession = { ...cold, noiseSequence: 1,
    noise: { sequence: 1, position: { ...WINCH_CENTER }, strength: 1.2, kind: 'mechanism' } };
  session = advanceMirrorActor(session, 1 / 60, { intensity: 'standard', movedDistance: 0 }).session;
  const target = session.actor.investigationTarget;
  expect(target).toBeDefined();
  expect(session.actor.lastHeard).toEqual(WINCH_CENTER);
  expect(vaultActorEdgeOpen(cold.actor.motion.position, target!, world)).toBe(true);
  expect(Math.hypot(target!.x - WINCH_CENTER.x, target!.z - WINCH_CENTER.z)).toBeLessThan(1.2);
  let reached = false, returned = false;
  for (let frame = 0; frame < 2400; frame++) {
    session = advanceMirrorActor(session, 1 / 60, { intensity: 'standard', movedDistance: 0 }).session;
    reached ||= Math.hypot(session.actor.motion.position.x - target!.x, session.actor.motion.position.z - target!.z) < .3;
    returned ||= reached && session.actor.phase === 'patrol';
    expect(session.actor.lastSeen).toBeUndefined();
    expect(vaultActorEdgeOpen(session.actor.motion.position, session.actor.motion.position, world)).toBe(true);
  }
  expect(reached).toBe(true);
  expect(returned).toBe(true);
});

test('the recovery shelf hides the player from every patrol waypoint without a hidden-state exemption', () => {
  const hidden = { x: -4.05, y: 1.6, z: 10.7 }, world = stageWorld(0, true, true);
  for (const point of MIRROR_PATROL) {
    expect(segmentOccluded(actorMotionEye(createActorMotion(point, 0)).position, hidden, world)).toBe(true);
  }
});

test.each([9.85, 12.3])('both shelf exits remain walkable from recovery through z=%s', z => {
  const world = stageWorld(0, true, true);
  let pose = { position: { x: -4.05, y: 1.6, z: 10.7 }, yaw: 0, pitch: 0 };
  for (const point of [{ x: -4.05, z }, { x: -2.45, z }]) {
    for (let frame = 0; frame < 300; frame++) {
      const distance = Math.hypot(point.x - pose.position.x, point.z - pose.position.z);
      if (distance < .001) break;
      pose = { ...pose, yaw: Math.atan2(pose.position.x - point.x, pose.position.z - point.z) };
      pose = updatePlayer(pose, { forward: 1, strafe: 0 }, Math.min(1 / 60, distance / 2.15), world);
      expect(isSafePose(pose, world)).toBe(true);
    }
    expect(Math.hypot(point.x - pose.position.x, point.z - pose.position.z)).toBeLessThan(.001);
  }
});

test('the visible rack ends admit the player body but physically exclude the wider actor', () => {
  const world = stageWorld(0, true, true);
  // The old0.95m gaps let the0.88m actor follow a remembered retreat. The
  // authored0.75m gaps still admit the0.48m player, without an AI safe flag.
  for (const z of [9.85, 12.25]) {
    const outside = { x: -2.2, y: 0, z }, inside = { x: -4.05, y: 0, z };
    expect(vaultActorEdgeOpen(outside, inside, world)).toBe(false);
  }
});

test('searching an old observation cannot distinguish two currently hidden player positions', () => {
  const fresh = createStageSession('hidden-memory');
  const actor = { ...fresh.actor, phase: 'search' as const, startupGrace: 0,
    motion: createActorMotion({ x: -.9, y: 0, z: 13.1 }, 0), lastSeen: { x: -2.45, y: 1.6, z: 9.6 } };
  let a = { ...fresh, pose: { position: { x: -4.05, y: 1.6, z: 10.7 }, yaw: 0, pitch: 0 }, actor };
  let b = { ...fresh, pose: { position: { x: -3.75, y: 1.6, z: 10.7 }, yaw: 0, pitch: 0 }, actor };
  for (let frame = 0; frame < 100; frame++) {
    a = advanceMirrorActor(a, 1 / 60, { intensity: 'standard', movedDistance: 0 }).session as typeof a;
    b = advanceMirrorActor(b, 1 / 60, { intensity: 'standard', movedDistance: 0 }).session as typeof b;
    expect(a.actor.motion.position).toEqual(b.actor.motion.position);
    expect(a.actor.lastSeen).toEqual(actor.lastSeen);
    expect(b.actor.lastSeen).toEqual(actor.lastSeen);
  }
});

test('a committed attack does not retarget a visible sidestep', () => {
  const fresh = createStageSession('fixed-attack');
  const fixed = { x: 0, y: 1.6, z: 11.3 };
  let session: StageSession = { ...fresh, pose: { position: { x: 1.3, y: 1.6, z: 11.3 }, yaw: 0, pitch: 0 },
    actor: { ...fresh.actor, phase: 'attack', phaseTime: 0, startupGrace: 0, contactCooldown: 0,
      motion: createActorMotion({ x: 0, y: 0, z: 12 }, 0), attackTarget: fixed, lastSeen: fixed } };
  for (let frame = 0; frame < 20; frame++) {
    const step = advanceMirrorActor(session, 1 / 60, { intensity: 'standard', movedDistance: 0 });
    expect(step.caught).toBe(false);
    session = step.session;
    expect(session.actor.attackTarget).toEqual(fixed);
  }
  expect(session.actor.motion.position.x).toBeCloseTo(0, 6);
});

test('return from the observed south shelf corner walks around the winch instead of blocking the exit', () => {
  const fresh = createStageSession('return-corner');
  // With the longer rack the former measured corner is no longer body-safe;
  // retain the same blocked-return contract at its legal southern approach.
  const position = { x: -2.6, y: 0, z: 9.75 };
  let session: StageSession = { ...fresh, pose: { position: { x: -4.05, y: 1.6, z: 10.7 }, yaw: 0, pitch: 0 },
    actor: { ...fresh.actor, phase: 'return', routeIndex: 4, startupGrace: 0,
      motion: createActorMotion(position, Math.PI), lastSeen: { x: -2.45, y: 1.6, z: 9.85 } } };
  const world = stageWorld(0, false, false);
  expect(vaultActorEdgeOpen(position, position, world)).toBe(true);
  expect(vaultActorEdgeOpen(position, MIRROR_PATROL[4]!, world)).toBe(false);
  let patrol = false;
  for (let frame = 0; frame < 1800; frame++) {
    session = advanceMirrorActor(session, 1 / 60, { intensity: 'standard', movedDistance: 0 }).session;
    expect(vaultActorEdgeOpen(session.actor.motion.position, session.actor.motion.position, world)).toBe(true);
    if (session.actor.phase === 'patrol') { patrol = true; break; }
  }
  expect(patrol).toBe(true);
  expect(Math.hypot(position.x - session.actor.motion.position.x, position.z - session.actor.motion.position.z)).toBeGreaterThan(2);
});
