import {
  COLOR_ROLE_ASSIGNMENTS,
  PATTERN_FAMILIES,
  STIMULUS_BACKGROUNDS,
  type CalibrationTrial,
} from './types';

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateCalibrationTrials(seed: number): CalibrationTrial[] {
  const trials: CalibrationTrial[] = [];
  let layoutIndex = 0;

  for (const patternFamily of PATTERN_FAMILIES) {
    for (const background of STIMULUS_BACKGROUNDS) {
      for (const colorRoleAssignment of COLOR_ROLE_ASSIGNMENTS) {
        trials.push({
          stimulusVersion: 2,
          id: `${patternFamily}-${background}-${colorRoleAssignment}`,
          patternFamily,
          background,
          colorRoleAssignment,
          rotation: ([0, 90, 180, 270] as const)[layoutIndex % 4] ?? 0,
          mirrored: layoutIndex % 2 === 1,
        });
        layoutIndex += 1;
      }
    }
  }

  const random = seededRandom(seed);
  for (let index = trials.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = trials[index];
    const swap = trials[swapIndex];
    if (current && swap) {
      trials[index] = swap;
      trials[swapIndex] = current;
    }
  }

  // Shuffle conditions first, then use a deterministic count-aware schedule.
  // Picking the largest remaining family avoids a repeated shape without
  // changing any of the 12 balanced conditions. Shuffle order breaks ties.
  const ordered: CalibrationTrial[] = [];
  while (trials.length > 0) {
    const previous = ordered[ordered.length - 1]?.patternFamily;
    let selected = -1;
    let remaining = -1;
    trials.forEach((trial, index) => {
      const count = trials.filter((other) => other.patternFamily === trial.patternFamily).length;
      if (trial.patternFamily !== previous && count > remaining) {
        selected = index;
        remaining = count;
      }
    });
    const [next] = trials.splice(selected < 0 ? 0 : selected, 1);
    if (next) ordered.push(next);
  }
  return ordered;
}
