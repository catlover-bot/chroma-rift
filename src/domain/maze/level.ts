import type { DepthPreference } from '../calibration/types';
import type { MazeLevel, RailColor } from './types';

export function targetSequenceForProfile(
  preference: DepthPreference | undefined,
): readonly [RailColor, RailColor, RailColor] {
  if (preference === 'RED_FRONT') return ['red', 'red', 'red'];
  if (preference === 'BLUE_FRONT') return ['blue', 'blue', 'blue'];
  return ['red', 'blue', 'red'];
}

export function createValidationLevel(preference?: DepthPreference): MazeLevel {
  return {
    id: 'validation-stage',
    junctionCount: 3,
    targetSequence: targetSequenceForProfile(preference),
  };
}
