import { act, fireEvent, render } from '@testing-library/react-native';
import { FirstPersonResultScreen } from '../FirstPersonResultScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const point = (identifier: number, x = 40) => ({ identifier, pageX: x, pageY: 40, locationX: x, locationY: 40 });
const event = (identifier: number, x = 40) => { const p = point(identifier, x); return { nativeEvent: { ...p, changedTouches: [p], targetTouches: [p], touches: [p] } }; };
const summary = { chapterId: 'perception-gallery-v1', chapterVersion: 3 as const, powerCount: 2 as const, discoveredMechanisms: [] };

it('rejects the closing finger release and Pressability fallback until the result owns a fresh touch pair', async () => {
  const replay = jest.fn(), home = jest.fn(), notes = jest.fn();
  const view = await render(<FirstPersonResultScreen summary={summary} onReplay={replay} onHome={home} onNotes={notes} />);
  for (const button of view.getAllByRole('button')) {
    await fireEvent(button, 'touchEnd', event(7));
    await fireEvent.press(button, event(7));
    // A native onPress payload can omit the touch arrays. It is still not proof
    // that the new result owned a down event.
    await fireEvent.press(button, { nativeEvent: point(7) });
  }
  expect(replay).not.toHaveBeenCalled(); expect(home).not.toHaveBeenCalled(); expect(notes).not.toHaveBeenCalled();
  const button = view.getByRole('button', { name: 'ホームへ戻る' });
  await fireEvent(button, 'touchStart', event(8)); await fireEvent(button, 'touchEnd', event(8));
  await fireEvent.press(button, { nativeEvent: point(8) });
  expect(home).toHaveBeenCalledTimes(1);
});

it('cancels scroll movement, refuses a sibling finger release, and retires result callbacks', async () => {
  const home = jest.fn(), view = await render(<FirstPersonResultScreen summary={summary} onReplay={jest.fn()} onHome={home} />);
  const button = view.getByRole('button', { name: 'ホームへ戻る' });
  await fireEvent(button, 'touchStart', event(1)); await fireEvent(button, 'touchMove', event(1, 80)); await fireEvent(button, 'touchEnd', event(1, 80));
  expect(home).not.toHaveBeenCalled();
  await fireEvent(button, 'touchStart', event(2)); await fireEvent(button, 'touchEnd', event(3)); expect(home).not.toHaveBeenCalled();
  const end = button.props.onTouchEnd, access = button.props.onAccessibilityAction;
  await view.unmount();
  await act(() => { end(event(2)); access({ nativeEvent: { actionName: 'activate' } }); });
  expect(home).not.toHaveBeenCalled();
});

it('preserves explicit VoiceOver and switch activation without requiring a drag gesture', async () => {
  const replay = jest.fn(), notes = jest.fn();
  const view = await render(<FirstPersonResultScreen summary={summary} onReplay={replay} onHome={jest.fn()} onNotes={notes} />);
  await fireEvent(view.getByRole('button', { name: '展示室を最初から遊ぶ' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  await fireEvent(view.getByRole('button', { name: '発見メモを比べる' }), 'accessibilityTap');
  expect(replay).toHaveBeenCalledTimes(1); expect(notes).toHaveBeenCalledTimes(1);
});
