import { calculateCalibrationProfile } from '../scoring';
import type { CalibrationAnswer, CalibrationResponse, PerceivedStrength, StimulusBackground } from '../types';

function response(
  index: number,
  answer: CalibrationAnswer,
  strength?: PerceivedStrength,
  background: StimulusBackground = index % 2 === 0 ? 'dark' : 'light',
): CalibrationResponse {
  return {
    schemaVersion: 1,
    trialId: `trial-${index}`,
    patternFamily: 'rings',
    background,
    colorRoleAssignment: index % 2 === 0 ? 'primaryRed' : 'primaryBlue',
    answer,
    ...(strength ? { strength } : {}),
    respondedAt: '2026-01-01T00:00:00.000Z',
    sessionSeed: 1,
  };
}

describe('calculateCalibrationProfile', () => {
  it('classifies strong red responses as RED_FRONT', () => {
    expect(calculateCalibrationProfile(Array.from({ length: 12 }, (_, i) => response(i, 'redFront', 3))).preference).toBe('RED_FRONT');
  });

  it('classifies strong blue responses as BLUE_FRONT', () => {
    expect(calculateCalibrationProfile(Array.from({ length: 12 }, (_, i) => response(i, 'blueFront', 3))).preference).toBe('BLUE_FRONT');
  });

  it('classifies conflicting decisive responses as VARIABLE', () => {
    const responses = Array.from({ length: 12 }, (_, i) => response(i, i < 6 ? 'redFront' : 'blueFront', 3));
    expect(calculateCalibrationProfile(responses).preference).toBe('VARIABLE');
  });

  it('classifies mostly same or unclear responses as SOFT_DEPTH', () => {
    const responses = Array.from({ length: 12 }, (_, i) => response(i, i % 2 ? 'same' : 'unclear'));
    expect(calculateCalibrationProfile(responses).preference).toBe('SOFT_DEPTH');
  });

  it('classifies weak decisive responses as SOFT_DEPTH', () => {
    expect(calculateCalibrationProfile(Array.from({ length: 12 }, (_, i) => response(i, 'redFront', 1))).preference).toBe('SOFT_DEPTH');
  });

  it('bounds confidence between zero and one', () => {
    const profiles = [
      calculateCalibrationProfile([]),
      calculateCalibrationProfile(Array.from({ length: 12 }, (_, i) => response(i, 'redFront', 3))),
    ];
    profiles.forEach((profile) => {
      expect(profile.confidence).toBeGreaterThanOrEqual(0);
      expect(profile.confidence).toBeLessThanOrEqual(1);
    });
  });

  it('detects a strong dark/light reversal', () => {
    const responses = [
      ...Array.from({ length: 6 }, (_, i) => response(i, 'redFront', 3, 'dark')),
      ...Array.from({ length: 6 }, (_, i) => response(i + 6, 'blueFront', 3, 'light')),
    ];
    expect(calculateCalibrationProfile(responses).backgroundReversalObserved).toBe(true);
  });

  it('does not report reversal with insufficient evidence', () => {
    const responses = [response(0, 'redFront', 3, 'dark'), response(1, 'blueFront', 3, 'light')];
    expect(calculateCalibrationProfile(responses, 12).backgroundReversalObserved).toBe(false);
  });
});
