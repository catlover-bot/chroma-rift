import { act, fireEvent, render } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import * as THREE from 'three';
import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { advanceController, beginStageHoldController, commandController, controllerSnapshot, flushControllerPresentationFeedback, interactController, syncCamera, worldForController } from '../../rendering/firstPerson/runtimeController';
import { stageModule } from '../../domain/stageKit/modules';
import { carriedKeyEntry } from '../../domain/stages/departure-control-v1/session';
import { CONTROL_SAFE, STAFF_EXIT_SAFE } from '../../domain/stages/departure-control-v1/definition';
import { WINCH_SAFE } from '../../domain/stages/mirror-corridor-v1/definition';
import type { InteractableId } from '../../domain/firstPerson/types';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../types/application';
import { FirstPersonScreen } from '../FirstPersonScreen';

// Native readiness is a UI fixture; the actual screen/controller/codec run.
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => ({ FirstPersonCanvas: jest.fn(({ onReady, controller }: FirstPersonCanvasProps) => {
  const React = require('react');
  React.useEffect(() => { Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true }); onReady(); }, [controller, onReady]);
  return null;
}) }));
jest.mock('../../rendering/firstPerson/RawGLProof', () => ({ RawGLProof: jest.fn(() => null) }));
jest.mock('expo-haptics', () => ({ selectionAsync: jest.fn(async () => undefined) }));
jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) }));
const canvas = jest.mocked(FirstPersonCanvas);
const current = () => canvas.mock.calls.at(-1)![0];
const camera = () => new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
const module = stageModule('departure-control-v1')!;
function checkpoint(completed = false) {
  const restored = module.restore({ ...module.checkpoint(module.create()), stageData: { ...carriedKeyEntry(),
    keyAvailable: false, keyInstalled: true, procedureRead: completed, isolated: completed, stopped: completed,
    staffDoorOpened: completed, pose: completed ? STAFF_EXIT_SAFE : CONTROL_SAFE } });
  if (!restored) throw new Error('QA checkpoint rejected');
  return restored.checkpoint;
}
async function open(completed = false, simple = false) {
  const onCheckpoint = jest.fn(), onComplete = jest.fn();
  const view = await render(<FirstPersonScreen chapterId="departure-control-v1" checkpoint={checkpoint(completed)}
    settings={DEFAULT_SETTINGS} controls={{ ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: simple ? 'simple' : 'standard' }} preferredColor="neutral"
    onSettingsChange={jest.fn()} onControlsChange={jest.fn()} onCheckpoint={onCheckpoint} onComplete={onComplete}
    onRestart={jest.fn()} onExit={jest.fn()} />);
  return { view, onCheckpoint, onComplete };
}
async function aim(id: InteractableId) {
  await act(() => {
    const { controller, onSnapshot } = current();
    const target = worldForController(controller).interactables.find(item => item.id === id);
    if (!target) throw new Error('Missing authored target');
    const position = id === 'departure-procedure' ? { x: CONTROL_SAFE.position.x, y: 1.6, z: target.center.z + .3 } : CONTROL_SAFE.position;
    const dx = target.center.x - position.x, dz = target.center.z - position.z;
    controller.runtime.pose = { position, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(target.center.y - position.y, Math.hypot(dx, dz)) };
    syncCamera(controller, camera());
    expect(controllerSnapshot(controller).target?.id).toBe(id);
    onSnapshot(controllerSnapshot(controller));
  });
}
const originalDimensions = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
beforeEach(async () => {
  canvas.mockClear();
  jest.mocked(Haptics.selectionAsync).mockClear();
  await act(() => Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 1 }, screen: { width: 390, height: 844, scale: 3, fontScale: 1 } }));
});
afterEach(() => Dimensions.set(originalDimensions));

test('the screen shows the current procedure objective with a disabled premature stop action', async () => {
  const { view } = await open();
  await aim('departure-stop');
  expect(view.getByTestId('current-objective')).toHaveTextContent(/収容手順を読む/);
  expect(view.getByRole('button', { name: '停止盤：収容と隔離が先' })).toBeDisabled();
  expect(view.getByTestId('target-context')).toHaveTextContent(/先に巡回体の収容と隔離を行う/);
  await view.unmount();
});

test('enlarged stage action copy keeps its reason and reserves three lines in the real touch layout', async () => {
  await act(() => Dimensions.set({ window: { width: 320, height: 568, scale: 2, fontScale: 2 }, screen: { width: 320, height: 568, scale: 2, fontScale: 2 } }));
  const { view } = await open();
  await aim('departure-stop');
  expect(view.getByRole('button', { name: '停止盤：収容と隔離が先' })).toBeDisabled();
  expect(view.getByTestId('target-context')).toHaveTextContent('先に巡回体の収容と隔離を行う。');
  const label = view.getByText('停止盤：収容と隔離が先');
  expect(label.props.numberOfLines).toBeUndefined();
  expect(label.props.maxFontSizeMultiplier).toBeUndefined();
  const look = StyleSheet.flatten(view.getByTestId('look-region').props.style);
  const context = StyleSheet.flatten(view.getByTestId('target-context').props.style);
  const actionHeight = 18 * 2 * 3 + 24;
  expect(context.bottom).toBeGreaterThanOrEqual(actionHeight + 28);
  expect(look.top + look.height).toBeLessThanOrEqual(568 - 47 - 34 - 12 - actionHeight - 12);
  await view.unmount();
});

test('a published new progress revision clears old guidance even while the same procedure stays targeted', async () => {
  const { view } = await open();
  await aim('departure-procedure');
  await fireEvent.press(view.getByRole('button', { name: '収容手順を読む' }));
  await act(() => flushControllerPresentationFeedback(current().controller));
  expect(view.getByTestId('current-notice')).toHaveTextContent(/呼び鈴で収容区画へ誘導/);
  await act(() => {
    // A validated completed-state fixture isolates the HUD revision contract.
    const { controller } = current(), oldPose = controller.runtime.pose;
    controller.runtime = module.create(checkpoint(true), controller.runtime.session);
    controller.runtime.pose = oldPose;
    syncCamera(controller, camera());
    expect(controllerSnapshot(controller).target?.id).toBe('departure-procedure');
    current().onSnapshot(controllerSnapshot(controller));
  });
  expect(view.queryByTestId('current-notice')).toBeNull();
  expect(view.getByTestId('current-objective')).toHaveTextContent(/屋外/);
  expect(view.getByRole('button', { name: '職員出口は開放済み' })).toBeDisabled();
  await view.unmount();
});

test('walking outside publishes the saved completion before the harmless presentation tail ends', async () => {
  const { view, onCheckpoint, onComplete } = await open(true, true);
  await act(() => {
    const { controller, onSnapshot } = current(), viewCamera = camera();
    for (let step = 0; step < 600 && !controller.runtime.progress.cleared; step++) {
      controller.input.forward = 1;
      advanceController(controller, 1 / 60, viewCamera);
    }
    expect(controller.runtime.progress.cleared).toBe(true);
    expect(module.completionTail?.(controller.runtime)).toBeGreaterThan(0);
    onSnapshot(controllerSnapshot(controller));
  });
  expect(onCheckpoint).toHaveBeenCalledWith(expect.objectContaining({ progress: expect.objectContaining({ cleared: true }) }));
  expect(onComplete).not.toHaveBeenCalled();
  const saved = module.checkpoint(current().controller.runtime), saves = onCheckpoint.mock.calls.length;
  expect(view.getByTestId('interact')).toBeDisabled();
  expect(view.getByTestId('step-forward')).not.toBeDisabled();
  const before = current().controller.runtime.pose;
  await fireEvent.press(view.getByRole('button', { name: '左を向く' }));
  expect(current().controller.runtime.pose.yaw).not.toBe(before.yaw);
  await fireEvent.press(view.getByTestId('step-forward'));
  await act(() => {
    const { controller, onSnapshot } = current();
    advanceController(controller, 1 / 60, camera());
    expect(controller.runtime.pose.position).not.toEqual(before.position);
    expect(interactController(controller, 'departure-outdoor')).toBe(false);
    expect(module.checkpoint(controller.runtime)).toEqual(saved);
    onSnapshot(controllerSnapshot(controller));
    const pausedPose = controller.runtime.pose, tail = module.completionTail?.(controller.runtime);
    commandController(controller, { type: 'pause' });
    advanceController(controller, .05, camera());
    expect(module.completionTail?.(controller.runtime)).toBe(tail);
    expect(controller.runtime.pose).toEqual(pausedPose);
    commandController(controller, { type: 'resume' });
  });
  await act(() => {
    const { controller, onSnapshot } = current(), viewCamera = camera();
    controller.input.forward = 1;
    for (let step = 0; step < 250; step++) advanceController(controller, 1 / 60, viewCamera);
    expect(module.completionTail?.(controller.runtime)).toBe(0);
    expect(module.checkpoint(controller.runtime)).toEqual(saved);
    expect(controller.pendingActorEvents).toEqual([]);
    onSnapshot(controllerSnapshot(controller));
  });
  expect(onCheckpoint).toHaveBeenCalledTimes(saves);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(view.getByTestId('step-forward')).toBeDisabled();
  await view.unmount();
});

test.each([true, false])('ratchets vibrate once per presented tooth, without cold/repeated/failed-frame replay (haptics=%s)', async haptics => {
  const mirror = stageModule('mirror-corridor-v1')!, base = mirror.checkpoint(mirror.create());
  const checkpoint = mirror.restore({ ...base, stageData: { ...base.stageData as object,
    keyTaken: true, practiced: true, ratchets: 1, pose: WINCH_SAFE } })!.checkpoint;
  const view = await render(<FirstPersonScreen chapterId="mirror-corridor-v1" checkpoint={checkpoint}
    settings={{ ...DEFAULT_SETTINGS, haptics, horrorIntensity: 'subdued' }} controls={DEFAULT_FIRST_PERSON_CONTROLS} preferredColor="neutral"
    onSettingsChange={jest.fn()} onControlsChange={jest.fn()} onCheckpoint={jest.fn()} onComplete={jest.fn()}
    onRestart={jest.fn()} onExit={jest.fn()}/>);
  await act(() => {
    const { controller, onSnapshot } = current(), cam = camera();
    onSnapshot(controllerSnapshot(controller)); flushControllerPresentationFeedback(controller);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    controller.runtime.pose = { position: { x: -2.45, y: 1.6, z: 9.6 }, yaw: Math.PI, pitch: -.12 };
    syncCamera(controller, cam);
    expect(beginStageHoldController(controller, 'mirror-corridor-winch', 8)).toBe(true);
    for (let frame = 0; frame < 119; frame++) advanceController(controller, 1 / 60, cam);
    const beforeRejected = controller.runtime;
    advanceController(controller, 1 / 60, cam);
    expect(controller.runtime.stageSession?.value).toMatchObject({ ratchets: 2 });
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    // The existing frame rollback restores this speculative runtime without publishing it.
    controller.runtime = beforeRejected;
    advanceController(controller, 1 / 60, cam);
    onSnapshot(controllerSnapshot(controller));
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    flushControllerPresentationFeedback(controller);
    onSnapshot(controllerSnapshot(controller)); flushControllerPresentationFeedback(controller);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(haptics ? 1 : 0);
    for (let frame = 0; frame < 120; frame++) advanceController(controller, 1 / 60, cam);
    onSnapshot(controllerSnapshot(controller)); flushControllerPresentationFeedback(controller);
    expect(controller.runtime.stageSession?.value).toMatchObject({ ratchets: 3 });
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(haptics ? 2 : 0);
  });
  await view.unmount();
});
