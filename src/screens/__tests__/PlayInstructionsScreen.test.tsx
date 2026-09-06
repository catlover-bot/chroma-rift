import { fireEvent, render } from '@testing-library/react-native';

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

it('introduces the emergency switch instead of the old emblem and offers one independent horror choice', async () => {
  const onHorrorChange = jest.fn();
  const view = await render(<PlayInstructionsScreen chapterId="perception-gallery-v1" controls={DEFAULT_FIRST_PERSON_CONTROLS} reducedMotion onStart={jest.fn()} onBack={jest.fn()} horrorIntensity="standard" onHorrorChange={onHorrorChange} />);
  expect(view.getByText('閉館後の展示室')).toBeTruthy();
  expect(view.getByText('まず出口を探そう。大きな非常灯スイッチは、近づいて押せます。')).toBeTruthy();
  expect(view.queryByText(/壁の紋章/)).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '控えめな怖さ' }));
  expect(onHorrorChange).toHaveBeenCalledWith('subdued');
});
