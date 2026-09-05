import { generateCalibrationTrials } from '../trials';

describe('generateCalibrationTrials', () => {
  it('generates exactly 12 balanced pattern/background/role combinations', () => {
    const trials = generateCalibrationTrials(42);
    expect(trials).toHaveLength(12);
    expect(new Set(trials.map((trial) => trial.id)).size).toBe(12);
    for (const pattern of ['rings', 'crossingRails', 'dotFields']) {
      expect(trials.filter((trial) => trial.patternFamily === pattern)).toHaveLength(4);
    }
    for (const background of ['dark', 'light']) {
      expect(trials.filter((trial) => trial.background === background)).toHaveLength(6);
    }
    for (const assignment of ['primaryRed', 'primaryBlue']) {
      expect(trials.filter((trial) => trial.colorRoleAssignment === assignment)).toHaveLength(6);
    }
  });

  it('uses a repeatable seeded shuffle', () => {
    expect(generateCalibrationTrials(123)).toEqual(generateCalibrationTrials(123));
    expect(generateCalibrationTrials(123).map(({ id }) => id)).not.toEqual(
      generateCalibrationTrials(124).map(({ id }) => id),
    );
  });

  it('keeps a different seed balanced', () => {
    expect(new Set(generateCalibrationTrials(999).map(({ id }) => id)).size).toBe(12);
  });

  it('keeps all conditions and avoids consecutive families across many seeds', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const trials = generateCalibrationTrials(seed);
      expect(trials).toHaveLength(12);
      expect(new Set(trials.map((trial) => `${trial.patternFamily}-${trial.background}-${trial.colorRoleAssignment}`)).size).toBe(12);
      expect(trials.every((trial) => trial.stimulusVersion === 2)).toBe(true);
      expect(trials.slice(1).every((trial, index) => trial.patternFamily !== trials[index]?.patternFamily)).toBe(true);
    }
  });
});
