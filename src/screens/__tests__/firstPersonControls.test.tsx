import { act, fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { AccessibilityInfo, AppState, Dimensions } from 'react-native';
import * as THREE from 'three';

import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import * as diagnostics from '../../rendering/firstPerson/diagnostics';
import { advanceController, controllerSnapshot } from '../../rendering/firstPerson/runtimeController';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../types/application';
import { FirstPersonScreen, type FirstPersonScreenProps } from '../FirstPersonScreen';

// This UI contract fixture represents a completed first-frame signal, not
// native onCreated or GPU proof. Tests can withhold it to exercise startup.
let mockSubmittedFrame = true;
jest.mock('../../rendering/firstPerson/RawGLProof', () => ({ RawGLProof: jest.fn(() => null) }));
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => ({ FirstPersonCanvas: jest.fn(({ onReady }: { onReady: () => void }) => {
  const React = require('react');
  React.useEffect(() => { if (mockSubmittedFrame) onReady(); }, [onReady]);
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
    mockSubmittedFrame = true;
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
  it('keeps the first failure, discards late ready/snapshot callbacks and pauses the old session on reentry', async () => {
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    const old = scene();
    old.controller.input.forward = 1;
    await act(() => old.onError('最初の描画エラー。'));
    await act(() => { old.onError('遅れて届いたエラー。'); old.onReady(); old.onSnapshot(controllerSnapshot(old.controller)); });
    expect(view.getByText('最初の描画エラー。')).toBeTruthy();
    expect(view.queryByText('遅れて届いたエラー。')).toBeNull();
    expect(old.controller.runtime.paused).toBe(true);
    expect(old.controller.input.forward).toBe(0);
    expect(original.onCheckpoint).not.toHaveBeenCalled();
    expect(original.onComplete).not.toHaveBeenCalled();
    await view.unmount();
    const freshProps = props();
    const fresh = await render(<FirstPersonScreen {...freshProps} />);
    const current = scene();
    expect(current.controller).not.toBe(old.controller);
    await act(() => { old.onReady(); old.onError('前の章からのエラー。'); old.onSnapshot(controllerSnapshot(old.controller)); });
    expect(fresh.queryByText('3Dを表示できませんでした')).toBeNull();
    expect(current.controller.runtime.paused).toBe(false);
    expect(freshProps.onCheckpoint).not.toHaveBeenCalled();
    expect(freshProps.onComplete).not.toHaveBeenCalled();
    await fresh.unmount();
    expect(current.controller.runtime.paused).toBe(true);
  });

  it('blocks startup input while diagnostics remain available and background/resume can resume initialization', async () => {
    mockSubmittedFrame = false;
    const listener = jest.spyOn(AppState, 'addEventListener');
    const view = await render(<FirstPersonScreen {...props({ controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' } })} />);
    expect(view.getByRole('button', { name: '前へ一歩' })).toBeDisabled();
    await fireEvent.press(view.getByRole('button', { name: '描画の診断' }));
    expect(scene().paused).toBe(false);
    expect(view.getByTestId('render-diagnostic-record')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '診断を閉じる' }));
    const callbacks = listener.mock.calls.filter(([event]) => event === 'change').map(([, callback]) => callback);
    await act(() => callbacks.forEach((callback) => callback('background')));
    expect(scene().appActive).toBe(false);
    expect(scene().paused).toBe(true);
    await act(() => callbacks.forEach((callback) => callback('active')));
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    expect(scene().appActive).toBe(true);
    expect(scene().paused).toBe(false);
    expect(view.getByRole('button', { name: '前へ一歩' })).toBeDisabled();
    await act(() => scene().onReady());
    expect(view.getByRole('button', { name: '前へ一歩' })).toBeEnabled();
  });

  it('retries with a fresh controller, preserves progress/palette and rejects old callbacks, with a two-retry bound', async () => {
    const original = props({ controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' } });
    const view = await render(<FirstPersonScreen {...original} />);
    const old = scene();
    old.controller.runtime = { ...old.controller.runtime, progress: { ...old.controller.runtime.progress, guideExamined: true } };
    await act(() => old.onSnapshot(controllerSnapshot(old.controller)));
    await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
    const checkpointCalls = jest.mocked(original.onCheckpoint).mock.calls.length;
    await act(() => scene().onError('描画が止まりました。'));
    await fireEvent.press(view.getByRole('button', { name: '表示を再試行' }));
    const fresh = scene();
    expect(fresh.controller).not.toBe(old.controller);
    expect(fresh.controller.runtime.progress.guideExamined).toBe(true);
    expect(fresh.controller.runtime.pose).toEqual(old.controller.runtime.pose);
    expect(fresh.neutralColors).toBe(true);
    expect(fresh.controller.input.forward).toBe(0);
    await act(() => { old.onReady(); old.onError('以前のエラー'); old.onSnapshot(controllerSnapshot(old.controller)); });
    expect(view.queryByText('以前のエラー')).toBeNull();
    expect(original.onCheckpoint).toHaveBeenCalledTimes(checkpointCalls);
    expect(original.onRestart).not.toHaveBeenCalled();
    await act(() => scene().onError('再試行後のエラー'));
    await fireEvent.press(view.getByRole('button', { name: '表示を再試行' }));
    await act(() => scene().onError('二度目の再試行後のエラー'));
    expect(view.getByRole('button', { name: '表示を再試行' })).toBeDisabled();
    expect(view.getByRole('button', { name: '描画の診断' })).toBeEnabled();
  });

  it('refreshes diagnostics only while open at most twice per second and copies only on request', async () => {
    jest.useFakeTimers();
    const serialize = jest.spyOn(diagnostics, 'serializeDiagnostics');
    jest.mocked(Clipboard.setStringAsync).mockClear();
    try {
      mockSubmittedFrame = false;
      const view = await render(<FirstPersonScreen {...props()} />);
      await act(() => jest.advanceTimersByTime(1500));
      expect(serialize).not.toHaveBeenCalled();
      await fireEvent.press(view.getByRole('button', { name: '描画の診断' }));
      expect(serialize).toHaveBeenCalledTimes(1);
      await act(() => jest.advanceTimersByTime(999));
      expect(serialize).toHaveBeenCalledTimes(2);
      await act(() => jest.advanceTimersByTime(1));
      expect(serialize).toHaveBeenCalledTimes(3);
      expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
      await fireEvent.press(view.getByRole('button', { name: '診断をコピー' }));
      const payload = JSON.parse(jest.mocked(Clipboard.setStringAsync).mock.calls[0]![0]);
      expect(payload.revision).toBe(diagnostics.DIAGNOSTIC_REVISION);
      expect(payload.effectiveControls).toEqual({ mode: 'standard', reason: '保存した標準操作の希望' });
      await fireEvent.press(view.getByRole('button', { name: '診断を閉じる' }));
      const closedCalls = serialize.mock.calls.length;
      await act(() => jest.advanceTimersByTime(2000));
      expect(serialize).toHaveBeenCalledTimes(closedCalls);
      await view.unmount();
    } finally { jest.useRealTimers(); }
  });

  it('explains the active large-text policy without rewriting the saved standard preference', async () => {
    await act(() => Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 1.5 }, screen: { width: 390, height: 844, scale: 3, fontScale: 1.5 } }));
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: '操作と快適設定' }));
    expect(view.getByText('現在の操作：簡単操作。理由：文字の拡大。')).toBeTruthy();
    expect(view.getByRole('switch', { name: '簡単操作の希望' }).props.value).toBe(false);
    expect(original.onControlsChange).not.toHaveBeenCalled();
  });

  it('isolates proof sessions from chapter saves and restores the chapter when returning', async () => {
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    const chapter = scene();
    chapter.controller.runtime = { ...chapter.controller.runtime, progress: { ...chapter.controller.runtime.progress, guideExamined: true } };
    await act(() => chapter.onSnapshot(controllerSnapshot(chapter.controller)));
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: '描画の診断' }));
    const writes = jest.mocked(original.onCheckpoint).mock.calls.length;
    await fireEvent.press(view.getByRole('button', { name: 'R3Fの箱・床・壁を確認' }));
    expect(scene().sceneMode).toBe('proof');
    expect(view.queryByTestId('movement-stick')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    expect(scene().paused).toBe(true);
    await fireEvent.press(view.getByRole('button', { name: '描画の診断' }));
    await fireEvent.press(view.getByRole('button', { name: '箱が見えない：生のGLを確認' }));
    expect(view.getByText('橙色の三角形が見えるか確認します。')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '探索へ戻る（進行を維持）' }));
    expect(scene().sceneMode).toBe('chapter');
    expect(scene().controller).not.toBe(chapter.controller);
    expect(scene().controller.runtime.progress.guideExamined).toBe(true);
    expect(scene().controller.runtime.pose).toEqual(chapter.controller.runtime.pose);
    expect(original.onCheckpoint).toHaveBeenCalledTimes(writes);
    expect(original.onComplete).not.toHaveBeenCalled();
  });

  it('walks to the guide with real simple steps, explains aiming and shows first-action progress', async () => {
    const original = props({ controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' } });
    const view = await render(<FirstPersonScreen {...original} />);
    expect(view.getByText('「前へ一歩」で、小さな光へ近づこう。')).toBeTruthy();
    await frame();
    expect(view.getByText('光のしるべに、もう少し近づこう。')).toBeTruthy();
    expect(view.getByTestId('interact')).toBeDisabled();
    for (let index = 0; index < 11; index += 1) {
      await fireEvent.press(view.getByRole('button', { name: '前へ一歩' }));
      await frame();
    }
    expect(view.getByText('「下を見る」で、光に中央の照準を合わせよう。')).toBeTruthy();
    for (let index = 0; index < 5; index += 1) await fireEvent.press(view.getByRole('button', { name: '下を見る' }));
    await frame();
    expect(view.getByText('「上を見る」で、光に中央の照準を合わせよう。')).toBeTruthy();
    expect(view.getByTestId('interact')).toBeDisabled();
    for (let index = 0; index < 3; index += 1) await fireEvent.press(view.getByRole('button', { name: '上を見る' }));
    await fireEvent.press(view.getByRole('button', { name: 'しるべを調べる' }));
    expect(scene().controller.runtime.progress.guideExamined).toBe(true);
    expect(scene().controller.runtime.progress.sealA).toBe(false);
    expect(view.getByText('しるべを調べました。足跡をたどり、床の輪へ進もう。')).toBeTruthy();
    expect(original.onCheckpoint).toHaveBeenCalled();
  });
});
