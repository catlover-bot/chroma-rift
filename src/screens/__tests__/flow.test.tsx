import { fireEvent, render } from '@testing-library/react-native';

import { CalibrationInstructionsScreen } from '../CalibrationInstructionsScreen';
import { CalibrationScreen } from '../CalibrationScreen';
import { generateCalibrationTrials } from '../../domain/calibration/trials';
import { DEFAULT_CALIBRATION_ENVIRONMENT } from '../../domain/calibration/types';

describe('calibration screen flow', () => {
  it('moves from instructions to calibration start', async () => {
    const onStart = jest.fn();
    const view = await render(<CalibrationInstructionsScreen onStart={onStart} onBack={jest.fn()} />);
    await fireEvent.press(view.getByText('12問を始める'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('prevents duplicate response submissions', async () => {
    const onResponse = jest.fn();
    const session = {
      schemaVersion: 1 as const,
      seed: 11,
      startedAt: '2026-01-01T00:00:00.000Z',
      environment: DEFAULT_CALIBRATION_ENVIRONMENT,
      trials: generateCalibrationTrials(11),
      responses: [],
    };
    const view = await render(<CalibrationScreen session={session} onResponse={onResponse} onExit={jest.fn()} />);
    const same = view.getByText('同じくらい');
    await fireEvent.press(same);
    await fireEvent.press(same);
    expect(onResponse).toHaveBeenCalledTimes(1);
  });
});
