import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Dimensions } from 'react-native';
import * as THREE from 'three';

import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { advanceController, controllerSnapshot } from '../../rendering/firstPerson/runtimeController';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../types/application';
import { FirstPersonScreen, type FirstPersonScreenProps } from '../FirstPersonScreen';

jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => ({ FirstPersonCanvas: jest.fn(({ onReady }: { onReady: () => void }) => {
  const React = require('react');
  React.useEffect(() => onReady(), [onReady]);
  return null;
}) }));
const canvas = jest.mocked(FirstPersonCanvas);
const originalDimensions = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
const scene = (): FirstPersonCanvasProps => canvas.mock.calls[canvas.mock.calls.length - 1]![0];
function props(overrides: Partial<FirstPersonScreenProps> = {}): FirstPersonScreenProps {
  return { settings: { ...DEFAULT_SETTINGS }, controls: { ...DEFAULT_FIRST_PERSON_CONTROLS }, preferredColor: 'neutral', onSettingsChange: jest.fn(), onControlsChange: jest.fn(), onCheckpoint: jest.fn(), onComplete: jest.fn(), onRestart: jest.fn(), onExit: jest.fn(), ...overrides };
}
const touches = (identifier: number, locationX: number, locationY: number) => ({ nativeEvent: { changedTouches: [{ identifier, locationX, locationY }] } });
async function frame() {
  await act(() => {
    const current = scene();
    advanceController(current.controller, 1 / 60, new THREE.PerspectiveCamera(65, 390 / 740, 0.08, 60));
    current.onSnapshot(controllerSnapshot(current.controller));
  });
}

describe('first-person control surface and lifecycle', () => {
  beforeEach(async () => {
    canvas.mockClear();
    await act(() => Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 1 }, screen: { width: 390, height: 844, scale: 3, fontScale: 1 } }));
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  });
  afterEach(async () => { jest.restoreAllMocks(); await act(() => Dimensions.set(originalDimensions)); });

  it('routes two separate touch pointers and keeps button taps out of look input', async () => {
    const view = await render(<FirstPersonScreen {...props()} />);
    const stick = view.getByTestId('movement-stick');
    const look = view.getByTestId('look-region');
    await fireEvent(look, 'layout', { nativeEvent: { layout: { width: 200, height: 400 } } });
    await fireEvent(stick, 'touchStart', touches(1, 62, 10));
    await fireEvent(look, 'touchStart', touches(2, 50, 100));
    await fireEvent(look, 'touchMove', touches(2, 80, 110));
    expect(scene().controller.input.forward).toBeGreaterThan(0.9);
    expect(scene().controller.input.lookX).toBe(30);
    await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
    expect(scene().controller.input.lookX).toBe(30);
    expect(scene().neutralColors).toBe(true);
    await fireEvent(stick, 'touchCancel', touches(1, 62, 10));
    expect(scene().controller.input.forward).toBe(0);
    expect(scene().controller.input.lookX).toBe(0);
  });
  it('pauses and checkpoints on background, zeros inputs and rejects a stale snapshot', async () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    await fireEvent(view.getByTestId('movement-stick'), 'touchStart', touches(1, 62, 10));
    const old = scene();
    const callbacks = listener.mock.calls.filter(([event]) => event === 'change').map(([, callback]) => callback);
    await act(() => callbacks.forEach((callback) => callback('background')));
    expect(scene().paused).toBe(true);
    expect(scene().controller.input.forward).toBe(0);
    expect(original.onCheckpoint).toHaveBeenCalled();
    await act(() => old.onSnapshot(old.snapshot));
    expect(scene().paused).toBe(true);
    await act(() => callbacks.forEach((callback) => callback('active')));
    expect(scene().paused).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    expect(scene().paused).toBe(false);
  });
  it('routes globally batched Fabric touches using each sibling targetTouches', async () => {
    const view = await render(<FirstPersonScreen {...props()} />);
    const stick = view.getByTestId('movement-stick');
    const look = view.getByTestId('look-region');
    await fireEvent(look, 'layout', { nativeEvent: { layout: { width: 200, height: 400 } } });
    const stickTouch = { identifier: 1, locationX: 62, locationY: 10, target: 101 };
    const lookTouch = { identifier: 2, locationX: 100, locationY: 250, target: 102 };
    const changedTouches = [stickTouch, lookTouch];
    await fireEvent(look, 'touchStart', { nativeEvent: { ...stickTouch, changedTouches, targetTouches: [lookTouch] } });
    await fireEvent(stick, 'touchStart', { nativeEvent: { ...stickTouch, changedTouches, targetTouches: [stickTouch] } });
    expect(scene().controller.input.lookPointer).toBe(2);
    expect(scene().controller.input.stickPointer).toBe(1);
    expect(scene().controller.input.forward).toBeGreaterThan(0.9);
    const changedMove = [{ ...stickTouch, locationY: 62 }, { ...lookTouch, locationX: 130 }];
    await fireEvent(look, 'touchMove', { nativeEvent: { ...changedMove[0], changedTouches: changedMove, targetTouches: [changedMove[1]] } });
    expect(scene().controller.input.lookX).toBe(30);
    await fireEvent(stick, 'touchEnd', { nativeEvent: { ...stickTouch, changedTouches, targetTouches: [stickTouch] } });
    expect(scene().controller.input.forward).toBe(0);
    expect(scene().controller.input.lookPointer).toBe(2);
  });
  it('derives simple controls for reduced motion without overwriting persisted preferences', async () => {
    const original = props({ settings: { ...DEFAULT_SETTINGS, reducedMotion: true } });
    const view = await render(<FirstPersonScreen {...original} />);
    expect(view.queryByTestId('movement-stick')).toBeNull();
    const startZ = scene().controller.runtime.pose.position.z;
    await fireEvent.press(view.getByRole('button', { name: '前へ一歩' }));
    await frame();
    expect(scene().controller.runtime.pose.position.z).toBeLessThan(startZ);
    expect(original.onControlsChange).not.toHaveBeenCalled();
  });
  it('keeps color comparison independent of world progress and camera', async () => {
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    const runtime = scene().controller.runtime;
    await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
    expect(scene().controller.runtime).toBe(runtime);
    expect(view.getByText('模様だけをグレーにしました。床とつながりは同じです。')).toBeTruthy();
    expect(original.onCheckpoint).not.toHaveBeenCalled();
    await fireEvent.press(view.getByRole('button', { name: '色を戻す' }));
    expect(scene().controller.runtime).toBe(runtime);
  });
  it('offers three optional hint stages and never moves a distant player with aim assistance', async () => {
    const view = await render(<FirstPersonScreen {...props()} />);
    const position = { ...scene().controller.runtime.pose.position };
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: 'ヒント' }));
    expect(scene().controller.runtime.progress.hintStage).toBe(1);
    await fireEvent.press(view.getByRole('button', { name: '次のヒント' }));
    await fireEvent.press(view.getByRole('button', { name: '次のヒント' }));
    expect(scene().controller.runtime.progress.hintStage).toBe(3);
    await fireEvent.press(view.getByRole('button', { name: '近くで視点を合わせる' }));
    expect(scene().controller.runtime.pose.position).toEqual(position);
    expect(view.getByText('目印や対象の近くまで、自分で歩こう。')).toBeTruthy();
  });
  it('keeps major controls scrollable at 320×568 with large text', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(() => Dimensions.set({ window: { width: 320, height: 568, scale: 2, fontScale: 2 }, screen: { width: 320, height: 568, scale: 2, fontScale: 2 } }));
    try {
      const view = await render(<FirstPersonScreen {...props()} />);
      expect(view.getByTestId('compact-first-person-controls')).toBeTruthy();
      expect(view.getByRole('button', { name: '前へ一歩' })).toHaveStyle({ minHeight: 48, minWidth: 44 });
      expect(view.getByRole('button', { name: '調べる' })).toHaveStyle({ minHeight: 48 });
      await view.unmount();
    } finally { await act(() => Dimensions.set({ window, screen })); }
  });
  it('shows a clear GL failure route and delegates restart before replacing the current session', async () => {
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: '章を最初から' }));
    expect(original.onRestart).toHaveBeenCalledTimes(1);
    expect(scene().controller.runtime.paused).toBe(true);
    await act(() => scene().onError('GLの初期化に失敗しました。'));
    expect(view.getByText('3Dを表示できませんでした')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
    expect(original.onExit).toHaveBeenCalledTimes(1);
  });
});
