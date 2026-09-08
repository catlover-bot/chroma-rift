import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Dimensions, StyleSheet } from 'react-native';
import { PerspectiveCamera } from 'three';
import { VERTICAL_FOV } from '../../domain/firstPerson';
import { projectWithCamera } from '../../domain/firstPerson/alignment';
import { LENGTH_SPEC, ROD_SPEC } from '../../domain/vault/specs';
import { VAULT_BRAKE_POSE, VAULT_EXIT_POSE } from '../../domain/vault/definition';
import { vaultCheckpoint } from '../../storage/testFixtures/vault';
import type { VaultDevice } from '../../domain/vault/types';
import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { advanceController, commandController, controllerSnapshot, worldForController } from '../../rendering/firstPerson/runtimeController';
import { fixturePointInWorld } from '../../rendering/firstPerson/manipulationProjection';
import { vaultDeviceScreenBounds } from '../../rendering/firstPerson/vaultController';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../types/application';
import { FirstPersonScreen, type FirstPersonScreenProps } from '../FirstPersonScreen';

let mockPresented = true;
// Only native presentation is substituted. Device geometry, projected hit tests,
// screen events, command ownership, progression and checkpoint production are real.
jest.mock('../../rendering/firstPerson/RawGLProof', () => ({ RawGLProof: jest.fn(() => null) }));
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => ({ FirstPersonCanvas: jest.fn(({ controller, onReady }: FirstPersonCanvasProps) => {
  const React = require('react');
  React.useEffect(() => {
    if (mockPresented) { Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true }); onReady(); }
  }, [controller, onReady]); return null;
}) }));
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
const canvas = jest.mocked(FirstPersonCanvas), scene = () => canvas.mock.calls.at(-1)![0];
type TestView = Awaited<ReturnType<typeof render>>;
let viewport = { width: 390, height: 844 };
const originalDimensions = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
function props(puzzle: VaultDevice = 'length', overrides: Partial<FirstPersonScreenProps> = {}): FirstPersonScreenProps {
  return { chapterId: 'uncanny-vault-v1', checkpoint: vaultCheckpoint(puzzle === 'length' ? 'entry' : 'length'),
    settings: { ...DEFAULT_SETTINGS }, controls: { ...DEFAULT_FIRST_PERSON_CONTROLS }, preferredColor: 'neutral',
    onboarding: { schemaVersion: 1, tutorialCompleted: true, controlChoiceAcknowledged: true },
    onSettingsChange: jest.fn(), onControlsChange: jest.fn(), onCheckpoint: jest.fn(), onComplete: jest.fn(), onRestart: jest.fn(), onExit: jest.fn(), ...overrides };
}
async function aim(view: TestView, id: string) {
  await fireEvent(view.getByTestId('first-person-play'), 'layout', { nativeEvent: { layout: viewport } });
  await act(() => {
    const c = scene().controller, t = worldForController(c).interactables.find(target => target.id === id)!;
    const p = c.runtime.pose, dx = t.center.x - p.position.x, dz = t.center.z - p.position.z;
    commandController(c, { type: 'turn', yaw: Math.atan2(-dx, -dz) - p.yaw, pitch: Math.atan2(t.center.y - p.position.y, Math.hypot(dx, dz)) - p.pitch });
    advanceController(c, 0, new PerspectiveCamera(VERTICAL_FOV, viewport.width / viewport.height, .08, 60));
    scene().onSnapshot(controllerSnapshot(c));
  });
}
async function enter(view: TestView, puzzle: VaultDevice) {
  await aim(view, 'vault-' + puzzle);
  expect(scene().snapshot.target?.id).toBe('vault-' + puzzle);
  await fireEvent.press(view.getByTestId('interact'));
  expect(scene().controller.runtime.vault?.mode).toBe(puzzle);
}
function nativePoint(puzzle: VaultDevice, p: { x: number; y: number }, identifier = 1) {
  const c = scene().controller, target = worldForController(c).interactables.find(t => t.id === 'vault-' + puzzle)!;
  const projected = projectWithCamera(fixturePointInWorld(target, p)!, c.matrices!)!, bounds = vaultDeviceScreenBounds(c)!;
  const pageX = (projected.x + 1) * viewport.width / 2, pageY = (1 - projected.y) * viewport.height / 2;
  return { identifier, locationX: pageX - bounds.left, locationY: pageY - bounds.top, pageX, pageY, target: 100 };
}
type Touch = ReturnType<typeof nativePoint>;
const event = (point: Touch, touches: Touch[] = [point]) => ({ nativeEvent: { ...point, changedTouches: [point], targetTouches: touches, touches } });
const activate = (view: TestView, name: string) => fireEvent(view.getByRole('button', { name }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
beforeEach(async () => {
  canvas.mockClear(); mockPresented = true; viewport = { width: 390, height: 844 };
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  await act(() => Dimensions.set({ window: { ...viewport, scale: 3, fontScale: 1 }, screen: { ...viewport, scale: 3, fontScale: 1 } }));
});
afterEach(async () => { jest.restoreAllMocks(); await act(() => Dimensions.set(originalDimensions)); });

it('uses the projected handle, retains the owned finger, and requires release then a separate commit for the length gate', async () => {
  const p = props(), view = await render(<FirstPersonScreen {...p} />);
  await enter(view, 'length'); const c = scene().controller, pose = JSON.stringify(c.runtime.pose);
  expect(view.queryByTestId('first-person-reticle')).toBeNull(); expect(view.queryByTestId('gallery-power-stock')).toBeNull();
  expect(view.getByTestId('vault-device-objective')).toHaveTextContent('固定して格子を開く');
  expect(view.getByText('下の棒を見本と同じ長さに')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '補助' }));
  await fireEvent.press(view.getByRole('button', { name: '端の飾りを畳む' }));
  expect(c.runtime.progress.vault!.aids.finsHidden).toBe(true); expect(c.runtime.progress.vault!.length.solved).toBe(false);
  const layer = view.getByTestId('vault-device-touch'), style = StyleSheet.flatten(layer.props.style);
  expect(style.width).toBeLessThan(viewport.width); expect(style.height).toBeLessThan(viewport.height);
  const from = nativePoint('length', { x: LENGTH_SPEC.left + LENGTH_SPEC.initialLength, y: LENGTH_SPEC.sliderY });
  const to = nativePoint('length', { x: LENGTH_SPEC.left + LENGTH_SPEC.targetLength, y: LENGTH_SPEC.sliderY });
  await fireEvent(layer, 'touchStart', event(from));
  await fireEvent(layer, 'touchMove', event(to));
  expect(c.runtime.vault!.length).toBeCloseTo(LENGTH_SPEC.targetLength);
  expect(c.runtime.progress.vault!.length.length).toBe(LENGTH_SPEC.initialLength);
  expect(view.getByRole('button', { name: '固定する' })).toBeDisabled();
  await fireEvent(layer, 'touchEnd', event({ ...to, identifier: 2 }, [to]));
  expect(c.runtime.vault!.activeDrag?.pointerId).toBe(1);
  await fireEvent(layer, 'touchEnd', event(to, []));
  expect(c.runtime.progress.vault!.length.length).toBeCloseTo(LENGTH_SPEC.targetLength);
  expect(c.runtime.progress.vault!.length.solved).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: '固定する' }));
  expect(c.runtime.progress.vault!.length.solved).toBe(true);
  expect(JSON.stringify(c.runtime.pose)).toBe(pose);
  expect(p.onComplete).not.toHaveBeenCalled();
  expect(view.queryByText('紋章の色表示')).toBeNull();
});

it('uses actual two-degree semantic rod steps and independent frame/plumb helpers before explicit locking', async () => {
  jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
  const p = props('rod'), view = await render(<FirstPersonScreen {...p} />);
  await aim(view, 'vault-rod'); await activate(view, '鉛直の針を動かす');
  const c = scene().controller, before = c.runtime.vault!.angle;
  const slider = view.getByRole('adjustable', { name: '針の向き' });
  await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(c.runtime.vault!.angle - before).toBeCloseTo(Math.PI / 90);
  await activate(view, '補助'); await activate(view, '枠を消す'); await activate(view, '下げ振り');
  expect(c.runtime.progress.vault!.aids).toMatchObject({ frameHidden: true, plumb: true });
  expect(c.runtime.progress.vault!.rod.solved).toBe(false);
  for (let i = 0; i < 5; i++) await fireEvent(view.getByRole('adjustable'), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(Math.abs(c.runtime.vault!.angle)).toBeLessThan(ROD_SPEC.tolerance);
  expect(c.runtime.progress.vault!.rod.solved).toBe(false);
  await activate(view, 'ロックする');
  expect(c.runtime.progress.vault!.rod.solved).toBe(true);
  expect(c.runtime.progress.exitDoorOpen).toBe(true); expect(c.runtime.progress.sealA).toBe(false); expect(c.runtime.progress.sealB).toBe(false);
});

it('rolls back an outside drop and cancels a three-finger pause without reusing old drag callbacks', async () => {
  const p = props(), view = await render(<FirstPersonScreen {...p} />); await enter(view, 'length');
  const c = scene().controller, layer = view.getByTestId('vault-device-touch');
  const from = nativePoint('length', { x: LENGTH_SPEC.left + LENGTH_SPEC.initialLength, y: LENGTH_SPEC.sliderY }, 41);
  const to = nativePoint('length', { x: LENGTH_SPEC.left + LENGTH_SPEC.targetLength, y: LENGTH_SPEC.sliderY }, 41);
  await fireEvent(layer, 'touchStart', event(from)); await fireEvent(layer, 'touchMove', event(to));
  await fireEvent(layer, 'touchEnd', event({ ...to, locationX: -1000 }, []));
  expect(c.runtime.vault!.length).toBe(LENGTH_SPEC.initialLength);
  await fireEvent(layer, 'touchStart', event(from)); const oldMove = layer.props.onTouchMove;
  await fireEvent(layer, 'touchStart', event({ ...from, identifier: 43 }, [from, { ...from, identifier: 42 }, { ...from, identifier: 43 }]));
  expect(c.runtime.paused).toBe(true); expect(c.runtime.vault!.activeDrag).toBeNull();
  expect(c.input.releaseBarrier).toEqual(expect.arrayContaining([41, 42, 43]));
  await act(() => oldMove(event(to)));
  expect(c.runtime.vault!.length).toBe(LENGTH_SPEC.initialLength);
  await fireEvent.press(view.getByRole('button', { name: '再開する' }));
  expect(c.runtime.progress.vault!.length.solved).toBe(false);
});

it('preserves same-session actor memory across pause and opens the independent notebook without adding a gameplay Canvas', async () => {
  const p = props(), view = await render(<FirstPersonScreen {...p} />); await enter(view, 'length');
  await fireEvent.press(view.getByRole('button', { name: '探索へ戻る' }));
  const c = scene().controller, actor = c.runtime.vault!.actor;
  await fireEvent.press(view.getByTestId('pause-control'));
  expect(c.runtime.vault!.actor).toBe(actor);
  await fireEvent.press(view.getByRole('button', { name: '発見メモ' }));
  expect(view.getByTestId('vault-notebook')).toBeTruthy(); expect(view.queryByTestId('discovery-notebook')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '端の飾りと長さ' }));
  await fireEvent.press(view.getByRole('button', { name: '測定ガイド' }));
  expect(c.runtime.progress.vault!.aids.lengthGuide).toBe(false);
  expect(scene().controller).toBe(c); expect(c.runtime.vault!.actor).toBe(actor);
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' }));
  await fireEvent.press(view.getByRole('button', { name: '一時停止へ戻る' }));
  await fireEvent.press(view.getByRole('button', { name: '再開する' }));
  expect(c.runtime.vault!.actor).toBe(actor);
});

it('saves a newly visited safe checkpoint once even when progress is unchanged', async () => {
  const p = props('rod', { checkpoint: vaultCheckpoint('length', 109, 'entry') }); await render(<FirstPersonScreen {...p} />);
  const c = scene().controller; jest.mocked(p.onCheckpoint).mockClear();
  await act(() => {
    c.runtime = { ...c.runtime, pose: structuredClone(VAULT_BRAKE_POSE) };
    advanceController(c, .02, new PerspectiveCamera(VERTICAL_FOV, viewport.width / viewport.height, .08, 60)); scene().onSnapshot(controllerSnapshot(c));
  });
  expect(p.onCheckpoint).toHaveBeenCalledTimes(1);
  expect(jest.mocked(p.onCheckpoint).mock.calls[0]![0].pose).toEqual(VAULT_BRAKE_POSE);
  await act(() => { advanceController(c, .02, new PerspectiveCamera(VERTICAL_FOV, viewport.width / viewport.height, .08, 60)); scene().onSnapshot(controllerSnapshot(c)); });
  expect(p.onCheckpoint).toHaveBeenCalledTimes(1);
});

it('requires the visible exit handle, saves immediately, and keeps the 1.4-second closing tail before one completion', async () => {
  const p = props('rod', { checkpoint: vaultCheckpoint('rod', 109, 'exit') }), view = await render(<FirstPersonScreen {...p} />);
  await aim(view, 'vault-exit'); const c = scene().controller;
  expect(c.runtime.pose.position).toEqual(VAULT_EXIT_POSE.position);
  const old = view.getByRole('button', { name: '扉を閉める' }).props.onAccessibilityAction;
  await act(() => { commandController(c, { type: 'turn', yaw: Math.PI, pitch: 0 }); advanceController(c, 0, new PerspectiveCamera(VERTICAL_FOV, viewport.width / viewport.height, .08, 60)); scene().onSnapshot(controllerSnapshot(c)); });
  expect(view.queryByRole('button', { name: '扉を閉める' })).toBeNull();
  await act(() => old({ nativeEvent: { actionName: 'activate' } })); expect(c.runtime.progress.cleared).toBe(false);
  await aim(view, 'vault-exit'); await fireEvent.press(view.getByRole('button', { name: '扉を閉める' }));
  expect(c.runtime.progress.cleared).toBe(true); expect(c.runtime.vault!.exitClosureSeconds).toBe(1.4);
  expect(jest.mocked(p.onCheckpoint).mock.calls.at(-1)![0].progress.cleared).toBe(true); expect(p.onComplete).not.toHaveBeenCalled();
  await act(() => { for (let i = 0; i < 90; i++) advanceController(c, 1 / 60, new PerspectiveCamera(VERTICAL_FOV, viewport.width / viewport.height, .08, 60)); scene().onSnapshot(controllerSnapshot(c)); });
  expect(p.onComplete).toHaveBeenCalledTimes(1);
  expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ chapterId: 'uncanny-vault-v1', chapterVersion: 1, deviceCount: 2 }));
  await act(() => scene().onSnapshot(controllerSnapshot(c))); expect(p.onComplete).toHaveBeenCalledTimes(1);
});

it('keeps native-not-ready and background commands from acquiring a device', async () => {
  mockPresented = false;
  const listener = jest.spyOn(AppState, 'addEventListener'), p = props(), view = await render(<FirstPersonScreen {...p} />);
  await aim(view, 'vault-length');
  expect(view.getByTestId('interact')).toBeDisabled();
  await fireEvent.press(view.getByTestId('interact')); expect(scene().controller.runtime.vault!.mode).toBe('explore');
  const change = listener.mock.calls.filter(call => call[0] === 'change').at(-1)![1];
  await act(() => change('background'));
  expect(scene().controller.runtime.paused).toBe(true);
  await view.unmount();
  await act(() => scene().onSnapshot(controllerSnapshot(scene().controller)));
  expect(p.onComplete).not.toHaveBeenCalled();
});

it.each([{ width: 320, height: 568, fontScale: 2 }, { width: 390, height: 844, fontScale: 1.5 }, { width: 430, height: 932, fontScale: 1 }])('keeps the actual board hit rectangle clear of a scrolling control rail at $width/$fontScale', async metrics => {
  viewport = { width: metrics.width, height: metrics.height };
  await act(() => Dimensions.set({ window: { ...viewport, fontScale: metrics.fontScale, scale: 3 }, screen: { ...viewport, fontScale: metrics.fontScale, scale: 3 } }));
  const p = props('length', { controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' } }), view = await render(<FirstPersonScreen {...p} />);
  await enter(view, 'length');
  const c = scene().controller, bounds = vaultDeviceScreenBounds(c)!;
  expect(bounds.left).toBeGreaterThanOrEqual(10); expect(bounds.right).toBeLessThanOrEqual(metrics.width - 10);
  const scroll = view.getByTestId('vault-device-scroll'), rail = StyleSheet.flatten(scroll.props.style);
  expect(viewport.height - Number(rail.height) - Number(rail.bottom)).toBeGreaterThan(bounds.bottom);
  const adjust = view.getByRole('adjustable', { name: '棒の長さ' });
  expect(StyleSheet.flatten(adjust.props.style).minHeight).toBeGreaterThanOrEqual(44);
  await fireEvent(adjust, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(c.runtime.progress.vault!.length.length).toBeCloseTo(LENGTH_SPEC.initialLength + .02);
  await activate(view, '補助');
  expect(view.getByRole('button', { name: '測定ガイド' })).toBeEnabled();
  // This verifies actual projection and scroll structure, not native Yoga or subjective legibility.
});

it('rejects device entry when an unusually narrow viewport clips the actual board instead of relaxing the visibility gate', async () => {
  viewport = { width: 320, height: 844 };
  const view = await render(<FirstPersonScreen {...props()} />);
  await aim(view, 'vault-length');
  expect(scene().snapshot.target?.id).toBe('vault-length');
  await fireEvent.press(view.getByTestId('interact'));
  expect(scene().controller.runtime.vault!.mode).toBe('explore');
  expect(scene().controller.runtime.progress.vault!.discoveries.length).toBe(false);
});
