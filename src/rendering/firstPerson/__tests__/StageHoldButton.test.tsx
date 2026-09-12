import { fireEvent, render } from '@testing-library/react-native';

import { StageHoldButton, createStageHoldTouchAdapter } from '../StageHoldButton';

const point = (identifier: number, pageX = 300, pageY = 700) => ({ identifier, pageX, pageY });

test('a hold owns its emitting contact through global multi-touch batches and releases once', () => {
  const adapter = createStageHoldTouchAdapter();
  const begin = jest.fn(() => true);
  const end = jest.fn();
  const stick = point(1, 40, 600), look = point(2, 350, 300), lever = point(3);
  adapter.handle('start', { changedTouches: [stick, look, lever], targetTouches: [lever] }, begin, end);
  expect(begin).toHaveBeenCalledTimes(1);
  expect(begin).toHaveBeenCalledWith(3);
  adapter.handle('end', { changedTouches: [stick], targetTouches: [] }, begin, end);
  expect(end).not.toHaveBeenCalled();
  adapter.handle('end', { changedTouches: [lever], targetTouches: [] }, begin, end);
  adapter.handle('end', { changedTouches: [lever], targetTouches: [] }, begin, end);
  expect(end).toHaveBeenCalledTimes(1);
  expect(end).toHaveBeenCalledWith(3);
});

test('rejected starts, cancellation, and disposed callbacks cannot leave a hold active', () => {
  const adapter = createStageHoldTouchAdapter();
  const begin = jest.fn().mockReturnValueOnce(false).mockReturnValue(true);
  const end = jest.fn();
  adapter.handle('start', { changedTouches: [point(1)] }, begin, end);
  adapter.handle('end', { changedTouches: [point(1)] }, begin, end);
  expect(end).not.toHaveBeenCalled();
  adapter.handle('start', { changedTouches: [point(2)] }, begin, end);
  adapter.handle('cancel', { changedTouches: [] }, begin, end);
  expect(end).toHaveBeenCalledWith(2);
  adapter.handle('start', { changedTouches: [point(3)] }, begin, end);
  adapter.dispose();
  adapter.handle('end', { changedTouches: [point(3)] }, begin, end);
  expect(end).toHaveBeenCalledTimes(1);
});

test('semantic activation starts then releases the same domain hold without native duplicate press', async () => {
  const begin = jest.fn(() => true), end = jest.fn();
  const view = await render(<StageHoldButton label="レバーを保持" holding={false} onBegin={begin} onEnd={end} testID="hold" />);
  await fireEvent.press(view.getByTestId('hold'));
  expect(begin).toHaveBeenCalledWith();
  await view.rerender(<StageHoldButton label="レバーを放す" holding onBegin={begin} onEnd={end} testID="hold" />);
  await fireEvent.press(view.getByTestId('hold'));
  expect(end).toHaveBeenCalledWith();
  const native = { changedTouches: [point(4)], targetTouches: [point(4)] };
  await fireEvent(view.getByTestId('hold'), 'touchStart', { nativeEvent: native });
  await fireEvent(view.getByTestId('hold'), 'touchEnd', { nativeEvent: { changedTouches: [point(4)], targetTouches: [] } });
  await fireEvent.press(view.getByTestId('hold'), { nativeEvent: { changedTouches: [point(4)] } });
  expect(begin).toHaveBeenCalledTimes(2);
  expect(end).toHaveBeenCalledTimes(2);
});
