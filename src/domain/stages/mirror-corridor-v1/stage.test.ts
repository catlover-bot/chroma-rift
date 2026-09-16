import { advanceStage, cancelStageHold, createStageSession, commandStage, checkpointStage } from './session';
import { parseStageCheckpoint } from './checkpoint';
import { EXIT, KEY_SAFE, RATCHET_COUNT, STAGE_ID, stageWorld } from './definition';
import { stageBinding } from './binding';

test('area-04 guidance follows key, safe practice, and settled winch progress', () => {
  let runtime = stageBinding.create();
  expect(stageBinding.present(runtime).objective).toContain('隔離キー');
  runtime = { ...runtime, pose: KEY_SAFE };
  runtime = stageBinding.interactResult!(runtime, 'mirror-corridor-key').runtime;
  expect(stageBinding.present(runtime)).toMatchObject({ objective: '前室の練習レバーを一度保持する。',
    hint: { text: '低い台の短い取っ手が練習用。本機へ進む前に一度試す。' } });
  runtime = { ...runtime, pose: { position: { x: -2, y: 1.6, z: 7.5 }, yaw: Math.PI, pitch: 0 } };
  runtime = stageBinding.hold!.start(runtime, 'mirror-corridor-practice');
  for (let frame = 0; frame < 36; frame += 1) runtime = stageBinding.advance(runtime, 1 / 60);
  runtime = stageBinding.hold!.release(runtime, 'mirror-corridor-practice');
  expect(stageBinding.present(runtime).objective).toContain('歯止め 0/3');
});

test('a figure is optional to inspect; taking its actual center key is explicit', () => {
  let session = createStageSession('first');
  expect(session.stageId).toBe(STAGE_ID);
  session = { ...session, pose: KEY_SAFE };
  const key = commandStage(session, { sessionId: 'first', seq: 1, targetId: 'mirror-corridor-key', type: 'take-key' });
  expect(key.accepted).toBe(true);
  expect(key.session.figureInspected).toBe(false);
  expect(stageWorld(key.session.ratchets, key.session.keyTaken).interactables.some(target => target.id === 'mirror-corridor-key')).toBe(false);
  expect(commandStage(key.session, { sessionId: 'first', seq: 1, targetId: 'mirror-corridor-key', type: 'take-key' }).reason).toBe('stale');
});

test('an older mirror checkpoint stays valid without inventing an observation', () => {
  const fresh = checkpointStage(createStageSession('legacy'));
  const { mirrorInspected: omitted, ...older } = fresh;
  expect(omitted).toBe(false);
  expect(parseStageCheckpoint(older)).toMatchObject({ mirrorInspected: false });
  expect(createStageSession('restored', older).mirrorInspected).toBe(false);
  expect(parseStageCheckpoint({ ...older, mirrorInspected: 'true' })).toBeUndefined();
});

test('practice is safe; unfinished winch fraction resets while three settled teeth survive cold restore', () => {
  let session = createStageSession('ratchet');
  session = { ...session, pose: { position: { x: -2, y: 1.6, z: 11.3 }, yaw: Math.PI, pitch: 0 } };
  expect(commandStage(session, { sessionId: 'ratchet', seq: 1, targetId: 'mirror-corridor-winch', type: 'start-hold' }).accepted).toBe(false);
  session = { ...session, pose: KEY_SAFE };
  session = commandStage(session, { sessionId: 'ratchet', seq: 2, targetId: 'mirror-corridor-key', type: 'take-key' }).session;
  session = { ...session, pose: { position: { x: -2, y: 1.6, z: 7.5 }, yaw: Math.PI, pitch: 0 } };
  session = commandStage(session, { sessionId: 'ratchet', seq: 3, targetId: 'mirror-corridor-practice', type: 'start-hold' }).session;
  for (let frame = 0; frame < 36; frame += 1) session = advanceStage(session, 1 / 60);
  expect(session).toMatchObject({ practiced: true, holding: 'practice', ratchets: 0 });
  session = commandStage(session, { sessionId: 'ratchet', seq: 4, targetId: 'mirror-corridor-practice', type: 'release-hold' }).session;
  expect(stageWorld(session.ratchets, session.keyTaken, session.practiced, session.holding).interactables.some(target => target.id === 'mirror-corridor-practice')).toBe(false);
  session = { ...session, pose: { position: { x: -2, y: 1.6, z: 11.3 }, yaw: Math.PI, pitch: 0 } };
  session = commandStage(session, { sessionId: 'ratchet', seq: 5, targetId: 'mirror-corridor-winch', type: 'start-hold' }).session;
  for (let frame = 0; frame < 60; frame += 1) session = advanceStage(session, 1 / 60);
  session = commandStage(session, { sessionId: 'ratchet', seq: 6, targetId: 'mirror-corridor-winch', type: 'release-hold' }).session;
  expect(session).toMatchObject({ ratchets: 0, holdSeconds: 0, holding: null });
  session = commandStage(session, { sessionId: 'ratchet', seq: 7, targetId: 'mirror-corridor-winch', type: 'start-hold' }).session;
  for (let frame = 0; frame < 120; frame += 1) session = advanceStage(session, 1 / 60);
  expect(session.ratchets).toBe(1);
  const raw = checkpointStage(session),restored = parseStageCheckpoint(raw)!;
  expect(restored.ratchets).toBe(1);
  let cold = createStageSession('cold',restored);
  expect(cold).toMatchObject({ ratchets: 1, holding: null, holdSeconds: 0 });
  for (let remaining = 1; remaining < RATCHET_COUNT; remaining += 1) {
    const active = remaining === 1 ? commandStage(cold, { sessionId: 'cold', seq: 1, targetId: 'mirror-corridor-winch', type: 'start-hold' }).session : cold;
    cold = active;
    for (let frame = 0; frame < 120; frame += 1) cold = advanceStage(cold, 1 / 60);
  }
  expect(cold.ratchets).toBe(RATCHET_COUNT);
  expect(cold.holding).toBe('winch');
  expect(stageWorld(cold.ratchets,cold.keyTaken).solids.find(solid => solid.id === 'isolation-grate')?.min.y).toBe(3.6);
  expect(cold.cleared).toBe(false);
  expect(commandStage({ ...cold, pose: EXIT }, { sessionId: 'cold', seq: 2, targetId: 'mirror-corridor-exit', type: 'exit' }).accepted).toBe(false);
  cold = commandStage(cold, { sessionId: 'cold', seq: 3, targetId: 'mirror-corridor-winch', type: 'release-hold' }).session;
  expect(stageWorld(cold.ratchets,cold.keyTaken,cold.practiced,cold.holding).interactables.some(target => target.id === 'mirror-corridor-winch')).toBe(false);
  const atExit = { ...cold, pose: EXIT };
  const complete = commandStage(atExit, { sessionId: 'cold', seq: 4, targetId: 'mirror-corridor-exit', type: 'exit' });
  expect(complete.accepted).toBe(true);
  expect(parseStageCheckpoint(checkpointStage(complete.session))?.cleared).toBe(true);
  expect(parseStageCheckpoint({ ...raw, schemaVersion: 99 })).toBeUndefined();
});

test('release works after a pose change, wrong lever cannot release, and cancel preserves settled teeth', () => {
  let session = createStageSession('release');
  session = { ...session, keyTaken: true, practiced: true, ratchets: 1, pose: { position: { x: -2, y: 1.6, z: 11.3 }, yaw: Math.PI, pitch: 0 } };
  session = commandStage(session, { sessionId: 'release', seq: 1, targetId: 'mirror-corridor-winch', type: 'start-hold' }).session;
  session = advanceStage(session, 1 / 60);
  const moved = { ...session, pose: KEY_SAFE };
  const wrong = commandStage(moved, { sessionId: 'release', seq: 2, targetId: 'mirror-corridor-practice', type: 'release-hold' });
  expect(wrong).toMatchObject({ accepted: false, reason: 'wrong-target' });
  expect(wrong.session.holding).toBe('winch');
  expect(commandStage(wrong.session, { sessionId: 'release', seq: 3, targetId: 'mirror-corridor-winch', type: 'release-hold' }).session)
    .toMatchObject({ holding: null, holdSeconds: 0, ratchets: 1 });
  expect(cancelStageHold(session)).toMatchObject({ holding: null, holdSeconds: 0, ratchets: 1, keyTaken: true });
});
