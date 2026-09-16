import { act, fireEvent, render } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';
import { ChapterOneEndingScreen } from '../ChapterOneEndingScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

const heading = '第一章「最後の退館者」 完';
let changeState: (state: AppStateStatus) => void;
let removeListener: jest.Mock;
const originalAppState = AppState.currentState;

beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  removeListener = jest.fn();
  jest.spyOn(AppState, 'addEventListener').mockImplementation((event, listener) => {
    expect(event).toBe('change');
    changeState = listener as (state: AppStateStatus) => void;
    return { remove: removeListener };
  });
});
afterEach(() => { AppState.currentState = originalAppState; jest.restoreAllMocks(); jest.useRealTimers(); });

const props = () => ({ onHome: jest.fn(), onAreas: jest.fn(), onDiscoveries: jest.fn(), onShown: jest.fn() });

test('the actual ending keeps twelve foreground seconds and acknowledges credits once', async () => {
  const callbacks = props(), view = await render(<ChapterOneEndingScreen {...callbacks}/>);
  expect(view.getByText('外の空気が流れている。')).toBeTruthy();
  await act(() => jest.advanceTimersByTime(4000));
  await act(() => changeState('background'));
  await act(() => jest.advanceTimersByTime(60000));
  expect(view.queryByText(heading)).toBeNull();
  expect(callbacks.onShown).not.toHaveBeenCalled();
  await act(() => changeState('active'));
  await act(() => jest.advanceTimersByTime(7999));
  expect(view.queryByText(heading)).toBeNull();
  await act(() => jest.advanceTimersByTime(1));
  expect(view.getByText(heading)).toBeTruthy();
  expect(callbacks.onShown).toHaveBeenCalledTimes(1);
  await act(() => jest.advanceTimersByTime(30000));
  expect(callbacks.onShown).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(removeListener).toHaveBeenCalledTimes(1);
});

test('an inherited touch release cannot skip; background cancels an armed press and a fresh press works', async () => {
  const callbacks = props(), view = await render(<ChapterOneEndingScreen {...callbacks}/>);
  const skip = () => view.getByRole('button', { name: 'クレジットを表示' });
  // A release from the outdoor interaction arrives without a press begun here.
  await fireEvent.press(skip());
  expect(view.queryByText(heading)).toBeNull();
  await fireEvent(skip(), 'pressIn');
  await act(() => changeState('inactive'));
  await act(() => changeState('active'));
  await fireEvent.press(skip());
  expect(view.queryByText(heading)).toBeNull();
  expect(callbacks.onShown).not.toHaveBeenCalled();
  await fireEvent(skip(), 'pressIn');
  await fireEvent.press(skip());
  expect(view.getByText(heading)).toBeTruthy();
  expect(callbacks.onShown).toHaveBeenCalledTimes(1);
});

test('mounting while backgrounded consumes none of the introduction, and an explicit accessibility tap skips', async () => {
  AppState.currentState = 'background';
  const callbacks = props(), view = await render(<ChapterOneEndingScreen {...callbacks}/>);
  await act(() => jest.advanceTimersByTime(60000));
  const skip = view.getByRole('button', { name: 'クレジットを表示' });
  await fireEvent(skip, 'accessibilityTap');
  expect(view.queryByText(heading)).toBeNull();
  await act(() => changeState('active'));
  await act(() => jest.advanceTimersByTime(11999));
  expect(view.queryByText(heading)).toBeNull();
  await fireEvent(skip, 'accessibilityTap');
  expect(view.getByText(heading)).toBeTruthy();
  expect(callbacks.onShown).toHaveBeenCalledTimes(1);
});
