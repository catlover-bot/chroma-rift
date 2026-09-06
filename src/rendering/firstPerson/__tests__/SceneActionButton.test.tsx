import { act, fireEvent, render } from '@testing-library/react-native';
import { Text, UIManager, View } from 'react-native';

import { SceneActionButton, createActionTouchAdapter } from '../SceneActionButton';
import { TouchControls } from '../TouchControls';
import { controlLayout } from '../controlLayout';
import { createTouchInput } from '../touchInput';

const point = (identifier: number, pageX: number, pageY: number) => ({ identifier, pageX, pageY });
const layout = controlLayout(390, 763);

describe('native HUD action ownership during two-thumb play (GPU excluded)', () => {
  it('activates a third-finger action once while both other thumbs move and preserves both controls', async () => {
    const input = createTouchInput();
    const press = jest.fn();
    const view = await render(<View>
      <TouchControls input={input} enabled handedness="right" layout={layout} />
      <SceneActionButton label="調べる" onPress={press} testID="action" style={layout.action}><Text>調べる</Text></SceneActionButton>
    </View>);
    const stick = view.getByTestId('movement-stick');
    const look = view.getByTestId('look-region');
    const action = view.getByTestId('action');
    const left = point(1, 40, 600);
    const right = point(2, 300, 300);
    const button = point(3, 320, 720);
    const starts = [left, right, button];
    const measure = jest.spyOn(UIManager, 'measure').mockImplementation((_tag, callback) => callback(0, 0, layout.action.width, layout.action.height, layout.action.left, layout.action.top));
    await fireEvent(action, 'responderGrant', { currentTarget: 42, persist: jest.fn(), nativeEvent: { changedTouches: starts, touches: starts } });
    await fireEvent(stick, 'touchStart', { nativeEvent: { changedTouches: starts, targetTouches: [left], touches: starts } });
    await fireEvent(look, 'touchStart', { nativeEvent: { changedTouches: starts, targetTouches: [right], touches: starts } });
    await fireEvent(action, 'touchStart', { nativeEvent: { ...left, changedTouches: starts, targetTouches: [button], touches: starts } });
    const movedLeft = point(1, 40, 550);
    const movedRight = point(2, 340, 300);
    const moves = [movedLeft, movedRight];
    await fireEvent(stick, 'touchMove', { nativeEvent: { changedTouches: moves, targetTouches: [movedLeft], touches: [...moves, button] } });
    await fireEvent(look, 'touchMove', { nativeEvent: { changedTouches: moves, targetTouches: [movedRight], touches: [...moves, button] } });
    // The responder may see the entire global batch with a different lead thumb.
    await fireEvent(action, 'touchMove', { nativeEvent: { changedTouches: moves, targetTouches: [button], touches: [...moves, button] } });
    await fireEvent(action, 'responderMove', { persist: jest.fn(), nativeEvent: { changedTouches: moves, touches: [...moves, button] } });
    expect(press).not.toHaveBeenCalled();
    const ending = { persist: jest.fn(), nativeEvent: { ...button, changedTouches: [button], targetTouches: [], touches: moves } };
    await fireEvent(action, 'responderRelease', ending);
    expect(press).not.toHaveBeenCalled();
    await fireEvent(action, 'touchEnd', ending);
    expect(press).toHaveBeenCalledTimes(1);
    measure.mockRestore();
    expect(input.forward).toBe(1);
    expect(input.lookX).toBe(40);
    expect(input.lookPointer).toBe(2);
    // Pressability's own native onPress, if emitted, must not duplicate success.
    await fireEvent.press(action, ending);
    expect(press).toHaveBeenCalledTimes(1);
  });
  it('ignores scene-to-button release and cancels a real button drag or system cancellation', () => {
    const adapter = createActionTouchAdapter();
    const end = { changedTouches: [point(1, 320, 720)], targetTouches: [] };
    expect(adapter.handle('end', end)).toBe(false);
    adapter.handle('start', { changedTouches: [point(3, 320, 720)] });
    adapter.handle('move', { changedTouches: [point(3, 320, 680)] });
    expect(adapter.handle('end', { changedTouches: [point(3, 320, 720)], targetTouches: [] })).toBe(false);
    adapter.handle('start', { changedTouches: [point(4, 320, 720)] });
    adapter.handle('cancel', { changedTouches: [point(4, 320, 720)], targetTouches: [] });
    expect(adapter.handle('end', { changedTouches: [point(4, 320, 720)], targetTouches: [] })).toBe(false);
    adapter.handle('start', { changedTouches: [point(5, 320, 720)] });
    adapter.handle('move', { changedTouches: [point(5, NaN, 720)] });
    expect(adapter.handle('end', { changedTouches: [point(5, 320, 720)] })).toBe(false);
  });
  it('preserves semantic activation and invalidates captured callbacks when disabled or replaced', async () => {
    const press = jest.fn();
    const view = await render(<SceneActionButton label="一時停止" onPress={press} testID="pause"><Text>休止</Text></SceneActionButton>);
    await fireEvent.press(view.getByTestId('pause'));
    await fireEvent(view.getByTestId('pause'), 'accessibilityTap');
    await fireEvent(view.getByTestId('pause'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(press).toHaveBeenCalledTimes(3);
    const oldEnd = view.getByTestId('pause').props.onTouchEnd;
    const oldActivate = view.getByTestId('pause').props.onAccessibilityTap;
    await fireEvent(view.getByTestId('pause'), 'touchStart', { nativeEvent: { changedTouches: [point(1, 30, 30)] } });
    await view.rerender(<SceneActionButton label="一時停止" disabled onPress={press} testID="pause" />);
    await act(() => {
      oldEnd({ nativeEvent: { changedTouches: [point(1, 30, 30)], targetTouches: [] } });
      oldActivate();
    });
    expect(press).toHaveBeenCalledTimes(3);
    await view.rerender(<SceneActionButton label="一時停止" onPress={press} testID="pause" sessionKey="fresh" />);
    await fireEvent(view.getByTestId('pause'), 'touchEnd', { nativeEvent: { changedTouches: [point(1, 30, 30)], targetTouches: [] } });
    expect(press).toHaveBeenCalledTimes(3);
  });
  it('can finish a valid tap after a semantic React update with a fresh action callback', async () => {
    const oldPress = jest.fn();
    const nextPress = jest.fn();
    const view = await render(<SceneActionButton label="調べる" onPress={oldPress} testID="action" />);
    await fireEvent(view.getByTestId('action'), 'touchStart', { nativeEvent: { changedTouches: [point(3, 320, 720)] } });
    await view.rerender(<SceneActionButton label="しるべを調べる" onPress={nextPress} testID="action" />);
    await fireEvent(view.getByTestId('action'), 'touchEnd', { nativeEvent: { changedTouches: [point(3, 320, 720)], targetTouches: [] } });
    expect(oldPress).not.toHaveBeenCalled();
    expect(nextPress).toHaveBeenCalledTimes(1);
  });
});
