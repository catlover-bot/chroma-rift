import { act, fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { AccessibilityInfo, AppState, Dimensions } from 'react-native';
import * as THREE from 'three';

import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import * as diagnostics from '../../rendering/firstPerson/diagnostics';
import { advanceController, commandController, controllerSnapshot, stopController, worldForController } from '../../rendering/firstPerson/runtimeController';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_FIRST_PERSON_ONBOARDING, DEFAULT_SETTINGS } from '../../types/application';
import { FirstPersonScreen, type FirstPersonScreenProps } from '../FirstPersonScreen';
import { createCheckpoint, MOVE_SPEED, VERTICAL_FOV, type InteractableId } from '../../domain/firstPerson';
import { createSealStimulus, GLYPHS, GLYPH_LABELS, sealDescription, sealHint } from '../../domain/emblem';

// This UI contract fixture represents a completed first-frame signal, not
// native onCreated or GPU proof. Tests can withhold it to exercise startup.
let mockSubmittedFrame = true;
jest.mock('../../rendering/firstPerson/RawGLProof', () => ({ RawGLProof: jest.fn(() => null) }));
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => ({ FirstPersonCanvas: jest.fn(({ onReady, controller }: FirstPersonCanvasProps) => {
  const React = require('react');
  React.useEffect(() => {
    if (mockSubmittedFrame) {
      Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true });
      onReady();
    }
  }, [controller, onReady]);
  return null;
}) }));
jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), useSafeAreaInsets: jest.fn(() => ({ top: 47, bottom: 34, left: 0, right: 0 })) }));
const canvas = jest.mocked(FirstPersonCanvas);
const originalDimensions = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
const scene = (): FirstPersonCanvasProps => canvas.mock.calls[canvas.mock.calls.length - 1]![0];
function props(overrides: Partial<FirstPersonScreenProps> = {}): FirstPersonScreenProps {
  return { settings: { ...DEFAULT_SETTINGS }, controls: { ...DEFAULT_FIRST_PERSON_CONTROLS }, preferredColor: 'neutral', onSettingsChange: jest.fn(), onControlsChange: jest.fn(), onCheckpoint: jest.fn(), onComplete: jest.fn(), onRestart: jest.fn(), onExit: jest.fn(), ...overrides };
}
const touches = (identifier: number, locationX: number, locationY: number) => ({ nativeEvent: { changedTouches: [{ identifier, locationX, locationY, pageX: locationX, pageY: locationY }] } });
async function frame() {
  await act(() => {
    const current = scene();
    advanceController(current.controller, 1 / 60, new THREE.PerspectiveCamera(65, 390 / 740, 0.08, 60));
    current.onSnapshot(controllerSnapshot(current.controller));
  });
}

async function walkTo(x: number, z: number) {
  await act(() => {
    const current = scene(), controller = current.controller;
    const camera = new THREE.PerspectiveCamera(VERTICAL_FOV, 390 / 740, 0.08, 60);
    for (let frame = 0; frame < 1000; frame += 1) {
      const dx = x - controller.runtime.pose.position.x, dz = z - controller.runtime.pose.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.001) break;
      commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz) - controller.runtime.pose.yaw, pitch: -controller.runtime.pose.pitch });
      controller.input.forward = 1;
      advanceController(controller, Math.min(1 / 60, distance / MOVE_SPEED), camera);
      if (frame === 999) throw new Error('Blocked test walk');
    }
    stopController(controller);
    current.onSnapshot(controllerSnapshot(controller));
  });
}
async function aimAt(id: InteractableId) {
  await act(() => {
    const current = scene(), controller = current.controller;
    const target = worldForController(controller).interactables.find((item) => item.id === id)!;
    const pose = controller.runtime.pose;
    const dx = target.center.x - pose.position.x, dz = target.center.z - pose.position.z;
    commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz) - pose.yaw,
      pitch: Math.atan2(target.center.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch });
    advanceController(controller, 0, new THREE.PerspectiveCamera(VERTICAL_FOV, 390 / 740, 0.08, 60));
    current.onSnapshot(controllerSnapshot(controller));
  });
}
async function approachEmblem(view: Awaited<ReturnType<typeof render>>, inspect = true) {
  await walkTo(0, -6);
  await walkTo(1.6, -6);
  await aimAt('emblem-panel');
  if (inspect) await fireEvent.press(view.getByRole('button', { name: '紋章を調べる' }));
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
    await approachEmblem(view);
    const stick = view.getByTestId('movement-stick');
    const look = view.getByTestId('look-region');
    await fireEvent(look, 'layout', { nativeEvent: { layout: { width: 200, height: 400 } } });
    await fireEvent(stick, 'touchStart', touches(1, 62, 60));
    expect(scene().controller.input.forward).toBe(0);
    await fireEvent(stick, 'touchMove', touches(1, 62, 10));
    await fireEvent(look, 'touchStart', touches(2, 50, 100));
    await fireEvent(look, 'touchMove', touches(2, 80, 110));
    expect(scene().controller.input.forward).toBeGreaterThan(0.9);
    expect(scene().controller.input.lookX).toBe(30);
    await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
    expect(scene().controller.input.lookX).toBe(30);
    expect(scene().controller.runtime.emblem.presentation).toBe('neutral');
    await fireEvent(stick, 'touchCancel', touches(1, 62, 10));
    expect(scene().controller.input.forward).toBe(0);
    expect(scene().controller.input.lookX).toBe(30);
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
    const stickTouch = { identifier: 1, locationX: 62, locationY: 60, pageX: 62, pageY: 60, target: 101 };
    const lookTouch = { identifier: 2, locationX: 100, locationY: 250, pageX: 100, pageY: 250, target: 102 };
    const changedTouches = [stickTouch, lookTouch];
    await fireEvent(look, 'touchStart', { nativeEvent: { ...stickTouch, changedTouches, targetTouches: [lookTouch] } });
    await fireEvent(stick, 'touchStart', { nativeEvent: { ...stickTouch, changedTouches, targetTouches: [stickTouch] } });
    expect(scene().controller.input.lookPointer).toBe(2);
    expect(scene().controller.input.stickPointer).toBe(1);
    expect(scene().controller.input.forward).toBe(0);
    const changedMove = [{ ...stickTouch, locationY: 10, pageY: 10 }, { ...lookTouch, locationX: 130, pageX: 130 }];
    await fireEvent(look, 'touchMove', { nativeEvent: { ...changedMove[0], changedTouches: changedMove, targetTouches: [changedMove[1]] } });
    expect(scene().controller.input.lookX).toBe(30);
    await fireEvent(stick, 'touchEnd', { nativeEvent: { ...stickTouch, changedTouches, targetTouches: [stickTouch] } });
    expect(scene().controller.input.forward).toBe(0);
    expect(scene().controller.input.lookPointer).toBe(2);
  });
  it('retains drag controls for reduced motion without overwriting persisted preferences', async () => {
    const original = props({ settings: { ...DEFAULT_SETTINGS, reducedMotion: true } });
    const view = await render(<FirstPersonScreen {...original} />);
    expect(view.getByTestId('movement-stick')).toBeTruthy();
    expect(view.queryByTestId('button-movement-controls')).toBeNull();
    const startZ = scene().controller.runtime.pose.position.z;
    await fireEvent(view.getByTestId('movement-stick'), 'touchStart', touches(1, 62, 100));
    await fireEvent(view.getByTestId('movement-stick'), 'touchMove', touches(1, 62, 50));
    await frame();
    expect(scene().controller.runtime.pose.position.z).toBeLessThan(startZ);
    expect(original.onControlsChange).not.toHaveBeenCalled();
  });
  it('keeps panel color comparison independent of movement, geometry and unlocking and rate-limits repeated taps', async () => {
    let now = 1000;
    jest.spyOn(performance, 'now').mockImplementation(() => now);
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    await approachEmblem(view);
    const runtime = scene().controller.runtime;
    const controller = scene().controller;
    const pose = runtime.pose;
    const seed = runtime.emblem.seed;
    jest.mocked(original.onCheckpoint).mockClear();
    await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
    expect(controller.runtime.pose).toBe(pose);
    expect(controller.runtime.emblem).toMatchObject({ seed, phase: 'observing', presentation: 'neutral', compared: true });
    expect(controller.runtime.progress.sealA).toBe(false);
    expect(controller.input.forward).toBe(0);
    expect(controller.input.lookX).toBe(0);
    expect(view.getByText('色だけを外した。輪郭も、壁も変わっていない。')).toBeTruthy();
    expect(original.onCheckpoint).toHaveBeenCalledTimes(1);
    await fireEvent.press(view.getByRole('button', { name: '色を戻す' }));
    expect(controller.runtime.emblem.presentation).toBe('neutral');
    expect(view.getByText('ゆっくり見比べよう。')).toBeTruthy();
    now += 1001;
    await fireEvent.press(view.getByRole('button', { name: '色を戻す' }));
    expect(controller.runtime.emblem.presentation).toBe('color');
    expect(controller.runtime.pose).toBe(pose);
    expect(controller.runtime.progress.sealA).toBe(false);
  });
  it('offers three voluntary contour hints and assistance without moving or unlocking', async () => {
    const view = await render(<FirstPersonScreen {...props({ settings: { ...DEFAULT_SETTINGS, reducedMotion: true } })} />);
    const position = { ...scene().controller.runtime.pose.position };
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: 'ヒント' }));
    expect(scene().controller.runtime.progress.hintStage).toBe(1);
    expect(view.getByText(sealHint({ hintTier: 1 }))).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '次のヒント' }));
    expect(view.getByText(sealHint({ hintTier: 2 }))).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '次のヒント' }));
    expect(view.getByText(sealHint({ hintTier: 3 }))).toBeTruthy();
    expect(scene().controller.runtime.progress.hintStage).toBe(3);
    expect(view.queryByRole('button', { name: '近くで視点を合わせる' })).toBeNull();
    await fireEvent(view.getByRole('switch', { name: '輪郭ガイド' }), 'valueChange', true);
    expect(scene().controller.runtime.emblem).toMatchObject({ phase: 'unexamined', hintTier: 3, assist: true });
    expect(scene().controller.runtime.progress.sealA).toBe(false);
    expect(scene().controller.runtime.pose.position).toEqual(position);
    expect(scene().reducedMotion).toBe(true);
  });
  it('keeps major controls scrollable at 320×568 with large text', async () => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    await act(() => Dimensions.set({ window: { width: 320, height: 568, scale: 2, fontScale: 2 }, screen: { width: 320, height: 568, scale: 2, fontScale: 2 } }));
    try {
      const view = await render(<FirstPersonScreen {...props({ controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' } })} />);
      expect(view.getByTestId('compact-first-person-controls')).toBeTruthy();
      expect(view.getByRole('button', { name: '前へ一歩' })).toHaveStyle({ minHeight: 48, minWidth: 44 });
      expect(view.getByRole('button', { name: '調べる' })).toHaveStyle({ minHeight: 48 });
      await view.unmount();
    } finally { await act(() => Dimensions.set({ window, screen })); }
  });
  it('shows a clear GL failure route and returns home', async () => {
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
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
    expect(scene().paused).toBe(true);
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
    await act(() => { Object.assign(scene().controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true }); scene().onReady(); });
    expect(view.getByRole('button', { name: '前へ一歩' })).toBeEnabled();
  });

  it('retries with a fresh controller, preserves progress/palette and rejects old callbacks, with a two-retry bound', async () => {
    const original = props({ controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' }, settings: { ...DEFAULT_SETTINGS, emblemPalette: 'muted' } });
    const view = await render(<FirstPersonScreen {...original} />);
    await approachEmblem(view);
    const old = scene();
    const expectedPose = createCheckpoint(old.controller.runtime).pose;
    await fireEvent.press(view.getByRole('button', { name: '色をほどく' }));
    const checkpointCalls = jest.mocked(original.onCheckpoint).mock.calls.length;
    await act(() => scene().onError('描画が止まりました。'));
    await fireEvent.press(view.getByRole('button', { name: '表示を再試行' }));
    const fresh = scene();
    expect(fresh.controller).not.toBe(old.controller);
    expect(fresh.controller.runtime.emblem.phase).toBe('observing');
    expect(fresh.controller.runtime.pose).toEqual(expectedPose);
    expect(fresh.emblemPalette).toBe('muted');
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
      expect(payload.effectiveControls).toEqual({ mode: 'standard', reason: '保存したドラッグ操作の希望' });
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
    expect(view.getByText('現在の操作：ドラッグ操作。理由：保存したドラッグ操作の希望。')).toBeTruthy();
    expect(view.getByRole('switch', { name: 'ボタン操作' }).props.value).toBe(false);
    expect(original.onControlsChange).not.toHaveBeenCalled();
  });

  it('isolates proof sessions from chapter saves and restores the chapter when returning', async () => {
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    await approachEmblem(view);
    const chapter = scene();
    const expectedPose = createCheckpoint(chapter.controller.runtime).pose;
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
    expect(scene().controller.runtime.emblem.phase).toBe('observing');
    expect(scene().controller.runtime.pose).toEqual(expectedPose);
    expect(original.onCheckpoint).toHaveBeenCalledTimes(writes);
    expect(original.onComplete).not.toHaveBeenCalled();
  });

  it('reaches the actual panel, inspects it, handles wrong/correct physical glyphs and leaves old prerequisites inert', async () => {
    const original = props({ controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' } });
    const view = await render(<FirstPersonScreen {...original} />);
    expect(view.getByTestId('current-objective')).toHaveTextContent('壁の紋章を調べる');
    expect(view.getByTestId('interact')).toBeDisabled();
    const startZ = scene().controller.runtime.pose.position.z;
    await fireEvent.press(view.getByRole('button', { name: '前へ一歩' }));
    await frame();
    expect(scene().controller.runtime.pose.position.z).toBeLessThan(startZ);
    await approachEmblem(view);
    expect(scene().controller.runtime.emblem.phase).toBe('observing');
    expect(view.getByTestId('current-objective')).toHaveTextContent('切れずにつながる輪郭を探す');
    expect(view.getByText('触れた指は、壁で止まる。')).toBeTruthy();
    const answer = createSealStimulus(scene().controller.runtime.emblem.seed).answer;
    const wrong = GLYPHS.find((glyph) => glyph !== answer)!;
    await aimAt(`emblem-${wrong}`);
    await fireEvent.press(view.getByRole('button', { name: GLYPH_LABELS[wrong] + 'の印を押す' }));
    expect(scene().controller.runtime.emblem.attempts).toBe(1);
    expect(scene().controller.runtime.progress.sealA).toBe(false);
    expect(view.getByText('印は戻った。色ではなく、切れ目を確かめよう。')).toBeTruthy();
    await aimAt(`emblem-${answer}`);
    await fireEvent.press(view.getByRole('button', { name: GLYPH_LABELS[answer] + 'の印を押す' }));
    expect(scene().controller.runtime.progress).toMatchObject({ sealA: true, guideExamined: false, markActivated: false });
    expect(scene().controller.runtime.emblem.phase).toBe('released');
    expect(view.getByTestId('current-objective')).toHaveTextContent('欠けた鍵を探す');
    expect(original.onCheckpoint).toHaveBeenCalled();
  });
  it.each([[320, 568, 2], [390, 844, 1], [430, 932, 2]])('keeps standard drag actions available at %i×%i, font %i', async (width, height, fontScale) => {
    await act(() => Dimensions.set({ window: { width, height, fontScale, scale: 3 }, screen: { width, height, fontScale, scale: 3 } }));
    const view = await render(<FirstPersonScreen {...props()} />);
    expect(view.getByTestId('movement-stick')).toBeTruthy();
    expect(view.queryByTestId('button-movement-controls')).toBeNull();
    expect(view.getByTestId('interact')).toHaveStyle({ minHeight: 48, minWidth: 44 });
    expect(view.getByTestId('pause-control')).toHaveStyle({ minHeight: 44, minWidth: 44 });
    expect(view.getByTestId('current-objective').props.numberOfLines).toBeUndefined();
    expect(view.getByTestId('compare-colors')).toBeTruthy();
    await view.unmount();
  });

  it('offers the old simple preference choice on first pause and switches without replacing the controller', async () => {
    const original = props({ controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' }, onboarding: DEFAULT_FIRST_PERSON_ONBOARDING, onOnboardingChange: jest.fn() });
    const view = await render(<FirstPersonScreen {...original} />);
    const initial = scene().controller;
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    expect(view.getByRole('button', { name: 'ドラッグ操作' })).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'ドラッグ操作を試す' }));
    expect(original.onControlsChange).toHaveBeenCalledWith(expect.objectContaining({ movementMode: 'standard' }));
    expect(original.onOnboardingChange).toHaveBeenCalledWith(expect.objectContaining({ controlChoiceAcknowledged: true }));
    await view.rerender(<FirstPersonScreen {...original} controls={{ ...original.controls, movementMode: 'standard' }} />);
    expect(scene().controller).toBe(initial);
    expect(initial.input.forward).toBe(0);
    expect(view.getByTestId('movement-stick')).toBeTruthy();
    expect(initial.runtime.progress.sealA).toBe(false);
  });

  it('presents semantic VoiceOver buttons, explains them, then restores saved drag mode', async () => {
    const listener = jest.spyOn(AccessibilityInfo, 'addEventListener');
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    const callback = (listener.mock.calls as unknown as [string, (enabled: boolean) => void][]).filter(([name]) => name === 'screenReaderChanged').at(-1)![1];
    const initial = scene().controller;
    await approachEmblem(view, false);
    expect(view.queryByTestId('accessible-emblem-objects')).toBeNull();
    // Turning VoiceOver on while idle must expose nearby physical objects
    // without needing a movement frame to publish the new reader state.
    await act(() => callback(true));
    expect(view.getByTestId('accessible-emblem-objects').props.accessibilityActions).toContainEqual({ name: 'emblem-panel', label: '紋章を調べる' });
    expect(view.getByRole('button', { name: '前へ一歩' })).toBeTruthy();
    expect(view.queryByTestId('movement-stick')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    expect(view.getByText(/読み上げ中は移動/)).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    await act(() => callback(false));
    expect(view.getByTestId('movement-stick')).toBeTruthy();
    expect(scene().controller).toBe(initial);
    expect(original.onControlsChange).not.toHaveBeenCalled();
  });

  it('lets VoiceOver inspect the physical panel and choose visible glyphs without aiming or revealing the answer beforehand', async () => {
    jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
    const view = await render(<FirstPersonScreen {...props()} />);
    expect(view.queryByTestId('accessible-emblem-objects')).toBeNull();
    await approachEmblem(view, false);
    const panel = view.getByTestId('accessible-emblem-objects');
    expect(panel.props.accessibilityActions).toContainEqual({ name: 'emblem-panel', label: '紋章を調べる' });
    expect(panel.props.accessibilityLabel).not.toContain('切れず');
    const panelPose = scene().controller.runtime.pose;
    await fireEvent(panel, 'accessibilityAction', { nativeEvent: { actionName: 'emblem-panel' } });
    expect(scene().controller.runtime.emblem.phase).toBe('observing');
    expect(scene().controller.runtime.pose).toBe(panelPose);
    expect(view.getByTestId('accessible-emblem-objects').props.accessibilityLabel).toBe(sealDescription(scene().controller.runtime.emblem.seed));

    const answer = createSealStimulus(scene().controller.runtime.emblem.seed).answer;
    const wrong = GLYPHS.find((glyph) => glyph !== answer)!;
    await aimAt(`emblem-${wrong}`);
    const switches = view.getByTestId('accessible-emblem-objects');
    expect(switches.props.accessibilityActions).toContainEqual({ name: `emblem-${wrong}`, label: GLYPH_LABELS[wrong] + 'の印を押す' });
    const switchPose = scene().controller.runtime.pose;
    await fireEvent(switches, 'accessibilityAction', { nativeEvent: { actionName: `emblem-${wrong}` } });
    expect(scene().controller.runtime.emblem.attempts).toBe(1);
    expect(scene().controller.runtime.progress.sealA).toBe(false);
    expect(scene().controller.runtime.pose).toBe(switchPose);
    await aimAt(`emblem-${answer}`);
    const answerPose = scene().controller.runtime.pose;
    await fireEvent(view.getByTestId('accessible-emblem-objects'), 'accessibilityAction', { nativeEvent: { actionName: `emblem-${answer}` } });
    expect(scene().controller.runtime.emblem.phase).toBe('released');
    expect(scene().controller.runtime.progress.sealA).toBe(true);
    expect(scene().controller.runtime.pose).toBe(answerPose);
  });

  it('revalidates cached VoiceOver object actions after leaving range, pausing and retrying the renderer', async () => {
    jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    await approachEmblem(view);
    const answer = createSealStimulus(scene().controller.runtime.emblem.seed).answer;
    const action = { nativeEvent: { actionName: `emblem-${answer}` } };
    await aimAt(`emblem-${answer}`);
    const old = scene();
    const cachedAction = view.getByTestId('accessible-emblem-objects').props.onAccessibilityAction;
    const saved = jest.mocked(original.onCheckpoint);
    const beforeUnknown = saved.mock.calls.length;
    await act(() => cachedAction({ nativeEvent: { actionName: 'key' } }));
    expect(old.controller.runtime.progress.sealA).toBe(false);
    expect(saved).toHaveBeenCalledTimes(beforeUnknown);

    await walkTo(0, -6);
    await walkTo(0, -3);
    expect(view.queryByTestId('accessible-emblem-objects')).toBeNull();
    const beforeFar = saved.mock.calls.length;
    await act(() => cachedAction(action));
    expect(old.controller.runtime.emblem.phase).toBe('observing');
    expect(saved).toHaveBeenCalledTimes(beforeFar);

    await approachEmblem(view, false);
    await aimAt(`emblem-${answer}`);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    const beforePaused = saved.mock.calls.length;
    await act(() => cachedAction(action));
    expect(old.controller.runtime.progress.sealA).toBe(false);
    expect(saved).toHaveBeenCalledTimes(beforePaused);
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));

    await act(() => old.onError('描画が止まりました。'));
    await fireEvent.press(view.getByRole('button', { name: '表示を再試行' }));
    const fresh = scene();
    const beforeRetired = saved.mock.calls.length;
    await act(() => cachedAction(action));
    expect(fresh.controller).not.toBe(old.controller);
    expect(old.controller.retired).toBe(true);
    expect(fresh.controller.runtime.emblem.phase).toBe('observing');
    expect(fresh.controller.runtime.progress.sealA).toBe(false);
    expect(saved).toHaveBeenCalledTimes(beforeRetired);
    await approachEmblem(view, false);
    await aimAt(`emblem-${answer}`);
    await fireEvent(view.getByTestId('accessible-emblem-objects'), 'accessibilityAction', action);
    expect(fresh.controller.runtime.progress.sealA).toBe(true);
  });

  it('requires fresh touch ownership after pause and rejects cached callbacks after mode replacement', async () => {
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    const stick = view.getByTestId('movement-stick');
    const oldStart = stick.props.onTouchStart;
    await fireEvent(stick, 'touchStart', touches(1, 70, 130));
    await fireEvent(stick, 'touchMove', touches(1, 70, 80));
    expect(scene().controller.input.forward).toBe(1);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    await fireEvent(view.getByTestId('movement-stick'), 'touchMove', touches(1, 70, 50));
    expect(scene().controller.input.forward).toBe(0);
    await view.rerender(<FirstPersonScreen {...original} controls={{ ...original.controls, movementMode: 'simple' }} />);
    await act(() => oldStart(touches(3, 70, 80)));
    expect(scene().controller.input.stickPointer).toBeNull();
  });

  it('retires callbacks immediately while an asynchronous chapter restart is pending', async () => {
    const original = props();
    const view = await render(<FirstPersonScreen {...original} />);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    const old = scene();
    await fireEvent.press(view.getByRole('button', { name: '章を最初から' }));
    const writes = jest.mocked(original.onCheckpoint).mock.calls.length;
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    await act(() => { old.onReady(); old.onSnapshot(controllerSnapshot(old.controller)); });
    expect(original.onRestart).toHaveBeenCalledTimes(1);
    expect(old.controller.runtime.paused).toBe(true);
    expect(original.onCheckpoint).toHaveBeenCalledTimes(writes);
  });

  it('lets a third native pointer compare colors and pause while both thumb owners remain independent', async () => {
    const view = await render(<FirstPersonScreen {...props()} />);
    await approachEmblem(view);
    const left = { identifier: 10, pageX: 70, pageY: 400 };
    const right = { identifier: 20, pageX: 250, pageY: 300 };
    const button = { identifier: 30, pageX: 75, pageY: 710 };
    await fireEvent(view.getByTestId('movement-stick'), 'touchStart', { nativeEvent: { changedTouches: [left, right], targetTouches: [left] } });
    await fireEvent(view.getByTestId('look-region'), 'touchStart', { nativeEvent: { changedTouches: [left, right], targetTouches: [right] } });
    await fireEvent(view.getByTestId('movement-stick'), 'touchMove', { nativeEvent: { changedTouches: [{ ...left, pageY: 350 }] } });
    const color = view.getByTestId('compare-colors');
    await fireEvent(color, 'touchStart', { nativeEvent: { changedTouches: [left, button], targetTouches: [button], touches: [left, right, button] } });
    await fireEvent(color, 'touchMove', { nativeEvent: { changedTouches: [{ ...left, pageX: 500 }], targetTouches: [button], touches: [left, right, button] } });
    await fireEvent(color, 'touchEnd', { nativeEvent: { changedTouches: [button], targetTouches: [], touches: [left, right] } });
    expect(scene().controller.runtime.emblem.presentation).toBe('neutral');
    expect(scene().controller.input.stickPointer).toBe(10);
    expect(scene().controller.input.lookPointer).toBe(20);
    expect(scene().controller.input.forward).toBe(1);
    // A scene-owned drag ending over the action has no button ownership.
    await fireEvent(view.getByTestId('compare-colors'), 'touchEnd', { nativeEvent: { changedTouches: [right], targetTouches: [] } });
    expect(scene().controller.runtime.emblem.presentation).toBe('neutral');
    const pause = view.getByTestId('pause-control');
    const third = { identifier: 40, pageX: 25, pageY: 25 };
    await fireEvent(pause, 'touchStart', { nativeEvent: { changedTouches: [third], targetTouches: [third], touches: [left, right, third] } });
    await fireEvent(pause, 'touchEnd', { nativeEvent: { changedTouches: [third], targetTouches: [], touches: [left, right] } });
    expect(scene().paused).toBe(true);
    expect(scene().controller.input.stickPointer).toBeNull();
    expect(scene().controller.input.lookPointer).toBeNull();
    expect(scene().controller.input.forward).toBe(0);
  });

});
