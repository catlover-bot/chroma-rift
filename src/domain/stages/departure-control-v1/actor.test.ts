import { actorFullyContained, BELL_RECEIVER } from './definition';
import { advanceContainmentActor } from './actor';
import { advanceStage, carriedKeyEntry, commandStage, createStageSession } from './session';

test.each(['standard', 'subdued'] as const)('%s bell sends the same embodied actor into the physical enclosure', intensity => {
  let session = createStageSession(`bell-${intensity}`, carriedKeyEntry());
  session = commandStage(session, { sessionId: session.sessionId, seq: 1, targetId: 'departure-key', type: 'install-key' }).session;
  session = commandStage(session, { sessionId: session.sessionId, seq: 2, targetId: 'departure-procedure', type: 'read-procedure' }).session;
  const ring = commandStage(session, { sessionId: session.sessionId, seq: 3, targetId: 'departure-bell', type: 'ring-bell' });
  expect(ring.accepted).toBe(true);
  session = ring.session;
  const first = advanceContainmentActor(session, 1 / 60, { intensity, movedDistance: 0 });
  expect(first.soundSources).toEqual([BELL_RECEIVER]);
  expect(first.session.actor.lastHeard).toEqual(BELL_RECEIVER);
  expect(first.session.actor.phase).toBe('investigate');
  session = first.session;
  let contained = false;
  for (let frame = 0; frame < 780 && !contained; frame += 1) {
    session = advanceStage(session, 1 / 60);
    session = advanceContainmentActor(session, 1 / 60, { intensity, movedDistance: 0 }).session;
    contained = actorFullyContained(session.actor.motion.position);
  }
  expect(contained).toBe(true);
  expect(session.actor.visible).toBe(true);
  if (intensity === 'subdued') expect(['notice', 'pursue', 'windup', 'attack']).not.toContain(session.actor.phase);
});

test('stop makes the actor update inert without erasing its body or memory', () => {
  let session = createStageSession('stopped', carriedKeyEntry());
  session = { ...session, actor: { ...session.actor, phase: 'stopped' }, stopped: true, isolated: true, doorProgress: 1,
    keyAvailable: false, keyInstalled: true, procedureRead: true };
  const result = advanceContainmentActor(session, 1 / 60, { intensity: 'standard', movedDistance: 1 });
  expect(result.session).toBe(session);
  expect(result.movedDistance).toBe(0);
  expect(result.session.actor.visible).toBe(true);
});
