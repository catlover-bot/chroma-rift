import { act, fireEvent, render } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Dimensions } from 'react-native';
import { PerspectiveCamera } from 'three';
import { projectWithCamera } from '../../domain/firstPerson/alignment';
import { VERTICAL_FOV } from '../../domain/firstPerson';
import { lightHandlePoint, THEATRE_PROJECTOR } from '../../domain/theatre';
import { theatreCheckpoint } from '../../storage/testFixtures/theatre';
import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { advanceController, controllerSnapshot, syncCamera, worldForController } from '../../rendering/firstPerson/runtimeController';
import { fixturePointInWorld } from '../../rendering/firstPerson/manipulationProjection';
import { theatreDeviceScreenBounds } from '../../rendering/firstPerson/theatreController';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../types/application';
import { FirstPersonScreen, type FirstPersonScreenProps } from '../FirstPersonScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => ({ FirstPersonCanvas: jest.fn(({ controller, onReady }: FirstPersonCanvasProps) => {
  const React = require('react');
  React.useEffect(() => { Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true }); onReady(); }, [controller, onReady]);
  return null;
}) }));
const canvas = jest.mocked(FirstPersonCanvas), scene = () => canvas.mock.calls.at(-1)![0];
type TestView = Awaited<ReturnType<typeof render>>;
const size = { width: 390, height: 844 }, camera = () => new PerspectiveCamera(VERTICAL_FOV, size.width / size.height, .08, 60);
const props = (checkpoint = theatreCheckpoint(), extra: Partial<FirstPersonScreenProps> = {}): FirstPersonScreenProps => ({
  chapterId: 'shadow-theatre-v1', checkpoint, controls: { ...DEFAULT_FIRST_PERSON_CONTROLS }, settings: { ...DEFAULT_SETTINGS }, preferredColor: 'neutral',
  onboarding: { schemaVersion: 1, tutorialCompleted: true, controlChoiceAcknowledged: true }, onSettingsChange: jest.fn(), onControlsChange: jest.fn(),
  onCheckpoint: jest.fn(), onComplete: jest.fn(), onRestart: jest.fn(), onExit: jest.fn(), ...extra,
});
async function aim(view: TestView, id: string) {
  await fireEvent(view.getByTestId('first-person-play'), 'layout', { nativeEvent: { layout: size } });
  await act(() => {
    const c = scene().controller, target = worldForController(c).interactables.find(t => t.id === id)!;
    const p = c.runtime.pose.position, dx = target.center.x - p.x, dz = target.center.z - p.z;
    c.runtime.pose = { position: p, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(target.center.y - p.y, Math.hypot(dx, dz)) };
    syncCamera(c, camera()); scene().onSnapshot(controllerSnapshot(c));
  });
}
async function enter(view: TestView, id = 'theatre-light') {
  await aim(view, id); expect(view.getByTestId('interact')).toBeEnabled(); await fireEvent.press(view.getByTestId('interact'));
}
function point(local: { x: number; y: number }, identifier = 1) {
  const c = scene().controller, id = c.runtime.theatre!.mode === 'light' ? 'theatre-light' : 'theatre-projector';
  const target = worldForController(c).interactables.find(t => t.id === id)!;
  const projected = projectWithCamera(fixturePointInWorld(target, local)!, c.matrices!)!, bounds = theatreDeviceScreenBounds(c)!;
  const pageX = (projected.x + 1) * size.width / 2, pageY = (1 - projected.y) * size.height / 2;
  return { identifier, pageX, pageY, locationX: pageX - bounds.left, locationY: pageY - bounds.top, target: 100 };
}
type Point = ReturnType<typeof point>;
const event = (p: Point, touches: Point[] = [p]) => ({ nativeEvent: { ...p, changedTouches: [p], targetTouches: touches, touches } });
const activate = (view: TestView, label: string) => fireEvent(view.getByRole('button', { name: label }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
const originalDimensions = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
beforeEach(async () => {
  canvas.mockClear(); jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  await act(() => Dimensions.set({ window: { ...size, scale: 3, fontScale: 1 }, screen: { ...size, scale: 3, fontScale: 1 } }));
});
afterEach(async () => { jest.restoreAllMocks(); await act(() => Dimensions.set(originalDimensions)); });

it('uses actual projected light-handle drag, keeps release separate from lock, and saves only committed state', async () => {
  const p = props(), view = await render(<FirstPersonScreen {...p} />); await enter(view);
  const c = scene().controller, pose = JSON.stringify(c.runtime.pose), layer = view.getByTestId('theatre-device-touch');
  expect(c.runtime.theatre!.mode).toBe('light'); expect(view.queryByTestId('touch-controls')).toBeNull(); expect(view.queryByTestId('first-person-reticle')).toBeNull();
  const from = point(lightHandlePoint(0)), to = point(lightHandlePoint(.65));
  await fireEvent(layer, 'touchStart', event(from)); await fireEvent(layer, 'touchMove', event(to));
  expect(c.runtime.theatre!.rail).toBeCloseTo(.65); expect(c.runtime.progress.theatre!.light.rail).toBe(0);
  expect(view.getByRole('button', { name: '灯りを固定する' })).toBeDisabled();
  await fireEvent(layer, 'touchEnd', event(to, []));
  expect(c.runtime.progress.theatre!.light.rail).toBeCloseTo(.65); expect(c.runtime.progress.theatre!.light.accepted).toBe(false);
  expect(view.getByRole('button', { name: '灯りを固定する' })).toBeEnabled();
  await fireEvent.press(view.getByRole('button', { name: '灯りを固定する' }));
  expect(c.runtime.progress.theatre!.light.accepted).toBe(true); expect(c.runtime.progress.cleared).toBe(false);
  expect(JSON.stringify(c.runtime.pose)).toBe(pose); expect(p.onComplete).not.toHaveBeenCalled();
  expect(jest.mocked(p.onCheckpoint).mock.calls.at(-1)![0].progress.theatre!.light.accepted).toBe(true);
});

it('rolls back outside drop, owns one finger, and preserves the all-finger barrier through three-finger pause', async () => {
  const view = await render(<FirstPersonScreen {...props()} />); await enter(view);
  const c = scene().controller, layer = view.getByTestId('theatre-device-touch'), from = point(lightHandlePoint(0), 41), to = point(lightHandlePoint(.65), 41);
  await fireEvent(layer, 'touchStart', event(from)); await fireEvent(layer, 'touchMove', event(to));
  await fireEvent(layer, 'touchEnd', event({ ...to, identifier: 42 }, [to]));
  expect(c.runtime.theatre!.activeDrag?.pointerId).toBe(41);
  await fireEvent(layer, 'touchEnd', event({ ...to, locationX: -1000 }, []));
  expect(c.runtime.progress.theatre!.light.rail).toBe(0); expect(c.runtime.theatre!.rail).toBe(0);
  await fireEvent(layer, 'touchStart', event(from)); const stale = layer.props.onTouchMove;
  await fireEvent(layer, 'touchStart', event({ ...from, identifier: 43 }, [from, { ...from, identifier: 42 }, { ...from, identifier: 43 }]));
  expect(c.runtime.paused).toBe(true); expect(c.runtime.theatre!.activeDrag).toBeNull();
  expect(c.input.releaseBarrier).toEqual(expect.arrayContaining([41, 42, 43]));
  await act(() => stale(event(to))); expect(c.runtime.progress.theatre!.light.rail).toBe(0);
});

it('allows explicit accessible rail steps and protected locking without changing saved drag preference', async () => {
  jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
  const p = props(), view = await render(<FirstPersonScreen {...p} />); await aim(view, 'theatre-light'); await activate(view, '灯りを動かす');
  const c = scene().controller;
  for (let n = 0; n < 7; n++) await fireEvent(view.getByRole('adjustable', { name: '灯りのレール位置' }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(c.runtime.progress.theatre!.light.rail).toBeCloseTo(.7); expect(c.runtime.progress.theatre!.light.accepted).toBe(false);
  await activate(view, '灯りを固定する'); expect(c.runtime.progress.theatre!.light.accepted).toBe(true);
  expect(p.onControlsChange).not.toHaveBeenCalled(); expect(c.runtime.progress.cleared).toBe(false);
});

it('keeps quick projector world time active, stops pending crank on background, and opens a paused same-controller notebook', async () => {
  let change!: (state: 'background' | 'active') => void;
  const add = AppState.addEventListener;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((name, callback) => {
    if (name === 'change') { change = callback as typeof change; return { remove: jest.fn() }; }
    return add(name, callback);
  });
  const p = props(theatreCheckpoint('light'), { controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' }, settings: { ...DEFAULT_SETTINGS, audio: { enabled: false, effectsVolume: 0, musicVolume: 0 } } });
  const view = await render(<FirstPersonScreen {...p} />); await enter(view, 'theatre-projector');
  const c = scene().controller;
  expect(c.runtime.theatre!.projectorArmed).toBe(true); expect(c.runtime.paused).toBe(false); expect(c.runtime.theatre!.mode).toBe('explore');
  await fireEvent.press(view.getByRole('button', { name: '取っ手を1/4回す' })); await fireEvent.press(view.getByRole('button', { name: '取っ手を1/4回す' }));
  expect(c.runtime.theatre!.projectorSeconds).toBe(THEATRE_PROJECTOR.duration);
  await act(() => { advanceController(c, .05, camera()); scene().onSnapshot(controllerSnapshot(c)); });
  expect(c.runtime.theatre!.projectorSeconds).toBeLessThan(THEATRE_PROJECTOR.duration);
  const emitted = c.runtime.theatre!.noiseSequence;
  await act(() => change('background'));
  expect(c.runtime.paused).toBe(true); expect(c.runtime.theatre!.projectorArmed).toBe(false);
  expect(c.runtime.theatre!.activeDrag).toBeNull();
  await act(() => change('active'));
  expect(c.runtime.theatre!.noiseSequence).toBe(emitted);
  await fireEvent.press(view.getByRole('button', { name: '発見メモ' }));
  expect(view.getByTestId('theatre-notebook')).toBeTruthy(); expect(scene().controller).toBe(c); expect(c.runtime.paused).toBe(true);
  expect(view.queryByText('影の大きさ')).toBeNull(); expect(view.queryByText('部屋の奥行き')).toBeNull();
});

it('saves an explicitly accepted visible curtain, waits for actual sealing, and completes only after walking through the service exit', async () => {
  const cp = theatreCheckpoint('light');
  cp.pose = { position: { x: 0, y: 1.6, z: 21.3 }, yaw: 0, pitch: 0 };
  const p = props(cp), view = await render(<FirstPersonScreen {...p} />); await aim(view, 'theatre-curtain');
  const c = scene().controller;
  expect(view.getByRole('button', { name: '防火幕を下ろす' })).toBeEnabled();
  expect(p.onComplete).not.toHaveBeenCalled();
  await fireEvent.press(view.getByTestId('interact'));
  expect(c.runtime.progress.theatre).toMatchObject({ curtainAccepted: true, passageSealed: false, completed: false });
  expect(jest.mocked(p.onCheckpoint).mock.calls.at(-1)![0].progress.theatre).toMatchObject({ curtainAccepted: true, passageSealed: false, completed: false });
  await act(() => {
    for (let i = 0; i < 24; i++) advanceController(c, .05, camera());
    scene().onSnapshot(controllerSnapshot(c));
  });
  expect(c.runtime.progress.theatre!.passageSealed).toBe(true); expect(c.runtime.progress.cleared).toBe(false);
  expect(p.onComplete).not.toHaveBeenCalled();
  await act(() => {
    // Turn toward the actual exit, then use the real collision/movement update.
    c.runtime.pose = { ...c.runtime.pose, yaw: Math.PI, pitch: 0 }; syncCamera(c, camera());
    c.input.forward = 1;
    for (let i = 0; i < 50; i++) advanceController(c, .05, camera());
    c.input.forward = 0; scene().onSnapshot(controllerSnapshot(c));
  });
  expect(c.runtime.progress.cleared).toBe(true);
  expect(p.onComplete).toHaveBeenCalledTimes(1);
  expect(p.onComplete).toHaveBeenCalledWith(expect.objectContaining({ chapterId: 'shadow-theatre-v1', chapterVersion: 1, deviceCount: 1 }));
  expect(jest.mocked(p.onCheckpoint).mock.calls.at(-1)![0].progress.theatre!.completed).toBe(true);
});
