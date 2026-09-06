import { render } from '@testing-library/react-native';

import { DEFAULT_FIRST_PERSON_CONTROLS } from '../../types/application';
import { PlayInstructionsScreen } from '../PlayInstructionsScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

describe('play instructions match the saved movement behavior', () => {
  it.each([false, true])('explains drag movement even when reduced motion is %s', async (reducedMotion) => {
    const view = await render(<PlayInstructionsScreen controls={DEFAULT_FIRST_PERSON_CONTROLS} reducedMotion={reducedMotion} onStart={jest.fn()} onBack={jest.fn()} />);
    expect(view.getByText('左側をドラッグして歩き、右側をドラッグして見回そう。')).toBeTruthy();
    expect(view.queryByText('歩く・向くボタンで、少しずつ進もう。')).toBeNull();
  });

  it('explains the mirrored drag surface and deliberately saved button surface', async () => {
    const view = await render(<PlayInstructionsScreen controls={{ ...DEFAULT_FIRST_PERSON_CONTROLS, handedness: 'left' }} reducedMotion={false} onStart={jest.fn()} onBack={jest.fn()} />);
    expect(view.getByText('右側をドラッグして歩き、左側をドラッグして見回そう。')).toBeTruthy();
    await view.rerender(<PlayInstructionsScreen controls={{ ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' }} reducedMotion={false} onStart={jest.fn()} onBack={jest.fn()} />);
    expect(view.getByText('歩く・向くボタンで、少しずつ進もう。')).toBeTruthy();
  });
});
