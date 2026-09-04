import { appReducer, initialAppState } from '../state';
import type { CalibrationResponse } from '../../domain/calibration/types';
import { createDefaultApplication } from '../../storage/applicationStorage';

const started = appReducer(initialAppState, {
  type: 'START_CALIBRATION',
  seed: 7,
  startedAt: '2026-01-01T00:00:00.000Z',
});

function answerFor(state = started): CalibrationResponse {
  const trial = state.calibrationSession?.trials[state.calibrationSession.responses.length];
  if (!trial || !state.calibrationSession) throw new Error('missing trial');
  return {
    schemaVersion: 1,
    trialId: trial.id,
    patternFamily: trial.patternFamily,
    background: trial.background,
    colorRoleAssignment: trial.colorRoleAssignment,
    answer: 'same',
    respondedAt: '2026-01-01T00:00:00.000Z',
    sessionSeed: state.calibrationSession.seed,
  };
}

describe('application calibration flow', () => {
  it('advances calibration exactly once and ignores duplicate responses', () => {
    const response = answerFor();
    const once = appReducer(started, { type: 'ADD_CALIBRATION_RESPONSE', response });
    const duplicate = appReducer(once, { type: 'ADD_CALIBRATION_RESPONSE', response });
    expect(once.calibrationSession?.responses).toHaveLength(1);
    expect(duplicate).toBe(once);
  });

  it('reaches the result screen after 12 accepted responses', () => {
    let state = started;
    for (let index = 0; index < 12; index += 1) {
      state = appReducer(state, { type: 'ADD_CALIBRATION_RESPONSE', response: answerFor(state) });
    }
    expect(state.screen).toBe('calibrationResult');
    expect(state.calibrationProfile?.totalTrials).toBe(12);
  });

  it('returns to a valid initial screen on reset', () => {
    const reset = appReducer(started, { type: 'RESET', defaults: createDefaultApplication(false) });
    expect(reset.screen).toBe('welcome');
    expect(reset.calibrationSession).toBeUndefined();
    expect(reset.hydrated).toBe(true);
  });
});
