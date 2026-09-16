import { stageBinding } from './binding';
import { createStageSession, advanceStage, cancelStageHold, checkpointStage } from './session';
import { WINCH_SAFE } from './definition';

test('each committed tooth lifts its real collision volume for .9s and survives release/cold resume', () => {
  let live = { ...createStageSession('lift'), pose: WINCH_SAFE, keyTaken: true, practiced: true,
    holding: 'winch' as const, holdSeconds: 1.95 } as ReturnType<typeof createStageSession>;
  live = advanceStage(live, .05);
  expect(live).toMatchObject({ ratchets: 1, gateLift: 0, holdSeconds: 0 });
  live = cancelStageHold(live);
  for (let i = 0; i < 9; i++) live = advanceStage(live, .05);
  expect(live.gateLift).toBeCloseTo(.45);
  const runtime = { ...stageBinding.create(), stageSession: { stageId: live.stageId, value: live } };
  expect(stageBinding.world(runtime).solids.find(s => s.id === 'isolation-grate')!.min.y).toBe(live.gateLift);
  const cold = createStageSession('cold', checkpointStage(live));
  expect(cold).toMatchObject({ ratchets: 1, gateLift: .9, holding: null, holdSeconds: 0 });
  for (let i = 0; i < 10; i++) live = advanceStage(live, .05);
  expect(live.gateLift).toBe(.9);
  expect(advanceStage(live, 0)).toBe(live);
});
