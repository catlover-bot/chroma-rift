import { act, fireEvent, render, within } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Dimensions, StyleSheet } from 'react-native';
import { Matrix4, PerspectiveCamera, Vector3 } from 'three';

import { createCheckpoint, VERTICAL_FOV, type InteractableId } from '../../domain/firstPerson';
import { createContourSpec, createGalleryRuntime, createShadowSpec, fixtureForPuzzle, GALLERY_CONTOUR_OBSERVATION_POSE, GALLERY_SHADOW_OBSERVATION_POSE, migrateGalleryV1Checkpoint, normalizeAngle, SAMPLE_IDS, SHADOW_SLOT_POSITIONS, type GalleryPuzzle, type Point2, type SampleId, type ShadowSlotId } from '../../domain/gallery';
import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { advanceController, commandController, controllerSnapshot, flushControllerAudioFrame, worldForController } from '../../rendering/firstPerson/runtimeController';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../types/application';
import { originalV1 } from '../../storage/testFixtures/galleryV1';
import { FirstPersonScreen, type FirstPersonScreenProps } from '../FirstPersonScreen';

// The sole rendering substitution supplies a completed native presentation.
// Screen, touch layer, controller projection, gallery state and checkpoints are real.
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
const scene = (): FirstPersonCanvasProps => canvas.mock.calls.at(-1)![0];
type TestView = Awaited<ReturnType<typeof render>>;
let viewport = { width: 390, height: 740 };
function screenProps(puzzle: GalleryPuzzle, overrides: Partial<FirstPersonScreenProps> = {}): FirstPersonScreenProps {
  const runtime = createGalleryRuntime();
  runtime.pose = puzzle === 'shadow' ? GALLERY_SHADOW_OBSERVATION_POSE : GALLERY_CONTOUR_OBSERVATION_POSE;
  return { chapterId: 'perception-gallery-v1', checkpoint: createCheckpoint(runtime),
    settings: { ...DEFAULT_SETTINGS }, controls: { ...DEFAULT_FIRST_PERSON_CONTROLS }, preferredColor: 'neutral',
    onSettingsChange: jest.fn(), onControlsChange: jest.fn(), onCheckpoint: jest.fn(), onComplete: jest.fn(), onRestart: jest.fn(), onExit: jest.fn(), ...overrides };
}
async function aim(view: TestView, puzzle: GalleryPuzzle) { return aimTarget(view, (puzzle + '-panel') as InteractableId); }
async function aimTarget(view: TestView, id: InteractableId) {
  await fireEvent(view.getByTestId('first-person-play'), 'layout', { nativeEvent: { layout: viewport } });
  await act(() => {
    const current = scene(), controller = current.controller;
    const target = worldForController(controller).interactables.find(item => item.id === id)!;
    const pose = controller.runtime.pose, dx = target.center.x - pose.position.x, dz = target.center.z - pose.position.z;
    commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz) - pose.yaw,
      pitch: Math.atan2(target.center.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch });
    advanceController(controller, 0, new PerspectiveCamera(VERTICAL_FOV, viewport.width / viewport.height, 0.08, 60));
    current.onSnapshot(controllerSnapshot(controller));
  });
}
async function enter(view: TestView, puzzle: GalleryPuzzle) {
  await aim(view, puzzle);
  expect(scene().snapshot.target?.id).toBe(puzzle + '-panel');
  await fireEvent.press(view.getByTestId('interact'));
  expect(scene().controller.runtime.gallery?.mode).toBe(puzzle);
  expect(view.queryByTestId('movement-stick')).toBeNull();
  expect(view.queryByTestId('look-region')).toBeNull();
}
function nativePoint(puzzle: GalleryPuzzle, local: Point2, identifier = 1) {
  const fixture = fixtureForPuzzle(puzzle), matrices = scene().controller.matrices!;
  const p = new Vector3(fixture.center.x + local.x, fixture.center.y + local.y, fixture.center.z)
    .applyMatrix4(new Matrix4().fromArray(matrices.view)).applyMatrix4(new Matrix4().fromArray(matrices.projection));
  const locationX = (p.x + 1) * viewport.width / 2, locationY = (1 - p.y) * viewport.height / 2;
  return { identifier, locationX, locationY, pageX: locationX, pageY: locationY, target: 100 };
}
const touch = (point: ReturnType<typeof nativePoint>) => ({ nativeEvent: { ...point, changedTouches: [point], targetTouches: [point], touches: [point] } });
async function dragSample(view: TestView, sample: SampleId, slot: ShadowSlotId, pointerId = 1) {
  const layer = view.getByTestId('gallery-device-touch');
  const from = scene().controller.runtime.progress.gallery!.shadow.assignments[sample];
  await fireEvent(layer, 'touchStart', touch(nativePoint('shadow', SHADOW_SLOT_POSITIONS[from], pointerId)));
  expect(scene().controller.runtime.gallery!.activeDrag).toMatchObject({ kind: 'shadow', sampleId: sample, pointerId });
  await fireEvent(layer, 'touchMove', touch(nativePoint('shadow', SHADOW_SLOT_POSITIONS[slot], pointerId)));
  expect(scene().controller.runtime.progress.gallery!.shadow.assignments[sample]).toBe(from);
  expect(view.getByRole('button', { name: '比べる' })).toBeDisabled();
  await fireEvent(layer, 'touchEnd', touch(nativePoint('shadow', SHADOW_SLOT_POSITIONS[slot], pointerId)));
  expect(scene().controller.runtime.progress.gallery!.shadow.assignments[sample]).toBe(slot);
}

beforeEach(async () => {
  canvas.mockClear(); mockSubmittedFrame = true; viewport = { width: 390, height: 740 };
  await act(() => Dimensions.set({ window: { width: 390, height: 844, scale: 3, fontScale: 1 }, screen: { width: 390, height: 844, scale: 3, fontScale: 1 } }));
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
});
afterEach(async () => { jest.restoreAllMocks(); await act(() => Dimensions.set(originalDimensions)); });

it('drags the real B samples onto sockets and requires an independent commit after comparison', async () => {
  const original = screenProps('shadow'), view = await render(<FirstPersonScreen {...original} />);
  await enter(view, 'shadow');
  const controller = scene().controller, pose = JSON.stringify(controller.runtime.pose), world = worldForController(controller);
  const shadow = controller.runtime.progress.gallery!.shadow;
  const pair = createShadowSpec(shadow.seed, shadow.variant).samples.filter(sample => sample.color === '#808080');
  await fireEvent.press(view.getByRole('button', { name: '背景をそろえる' }));
  expect(controller.runtime.gallery!.shadowCompare).toBe(true);
  expect(controller.runtime.progress.gallery!.shadow.solved).toBe(false);
  expect(view.getByTestId('device-instruction')).toHaveTextContent('見本を1枚、下の枠へドラッグ');
  expect(view.getByRole('button', { name: '比べる' })).toBeDisabled();
  await dragSample(view, pair[0]!.id, 'socket-left');
  expect(view.getByTestId('device-instruction')).toHaveTextContent('もう1枚を、隣の枠へ');
  await dragSample(view, pair[1]!.id, 'socket-right', 2);
  expect(view.getByTestId('device-instruction')).toHaveTextContent('同じ灰色か確かめて「比べる」');
  expect(view.getByRole('button', { name: '比べる' })).toBeEnabled();
  expect(controller.runtime.progress.gallery!.shadow.solved).toBe(false);
  expect(controller.runtime.progress.gallery!.order).toEqual([]);
  expect(JSON.stringify(controller.runtime.pose)).toBe(pose);
  expect(worldForController(controller).solids).toEqual(world.solids);
  expect(controller.input.forward).toBe(0); expect(controller.input.lookX).toBe(0);
  await fireEvent.press(view.getByRole('button', { name: '比べる' }));
  expect(controller.runtime.progress.gallery!.shadow.solved).toBe(true);
  expect(controller.runtime.progress.gallery!.order).toEqual(['B']);
  expect(controller.runtime.progress.gallery!.powerTaken.shadow).toBe(false);
  const takeButton = view.getByRole('button', { name: '電源を取る' });
  const take = takeButton.props.onAccessibilityAction;
  await fireEvent.press(takeButton);
  expect(view.getByTestId('gallery-power-stock').props.accessibilityLabel).toBe('予備電源 1/2');
  await act(() => take({ nativeEvent: { actionName: 'activate' } }));
  expect(controller.runtime.progress.gallery!.powerTaken).toEqual({ shadow: true, contour: false });
  expect(view.queryByRole('button', { name: '電源を取る' })).toBeNull();
  expect(controller.runtime.progress.gallery!.contour.solved).toBe(false);
  expect(controller.runtime.progress.sealB).toBe(false); expect(original.onComplete).not.toHaveBeenCalled();
  expect(original.onCheckpoint).toHaveBeenLastCalledWith(expect.objectContaining({ progress: expect.objectContaining({ gallery: expect.objectContaining({ shadow: expect.objectContaining({ solved: true }) }) }) }));
});

it('rotates all C discs through projected native drags, keeps guides separate and commits displayed angles only', async () => {
  const view = await render(<FirstPersonScreen {...screenProps('contour')} />);
  await enter(view, 'contour');
  const controller = scene().controller, seed = controller.runtime.progress.gallery!.contour.seed;
  await fireEvent.press(view.getByRole('button', { name: '輪郭ガイド' }));
  expect(controller.runtime.gallery!.contourGuide).toBe(true);
  expect(controller.runtime.progress.gallery!.contour.solved).toBe(false);
  expect(view.getByTestId('contour-count')).toHaveTextContent('中心を向いた円盤 0/3');
  for (const disc of createContourSpec(seed).discs) {
    const layer = view.getByTestId('gallery-device-touch');
    const angle = controller.runtime.progress.gallery!.contour.angles[disc.id];
    const delta = normalizeAngle(disc.targetAngle - angle);
    const start = { x: disc.center.x + disc.radius * .8, y: disc.center.y };
    const end = { x: disc.center.x + Math.cos(delta) * disc.radius * .8, y: disc.center.y + Math.sin(delta) * disc.radius * .8 };
    await fireEvent(layer, 'touchStart', touch(nativePoint('contour', start, disc.id + 1)));
    await fireEvent(layer, 'touchMove', touch(nativePoint('contour', end, disc.id + 1)));
    expect(controller.runtime.progress.gallery!.contour.angles[disc.id]).toBe(angle);
    expect(view.getByRole('button', { name: '引き出しを開く' })).toBeDisabled();
    await fireEvent(layer, 'touchEnd', touch(nativePoint('contour', end, disc.id + 1)));
    expect(normalizeAngle(controller.runtime.progress.gallery!.contour.angles[disc.id] - disc.targetAngle)).toBeCloseTo(0, 8);
    expect(view.getByTestId('contour-count')).toHaveTextContent(`中心を向いた円盤 ${disc.id + 1}/3`);
  }
  expect(controller.runtime.progress.gallery!.contour.solved).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: '引き出しを開く' }));
  expect(controller.runtime.progress.gallery!.contour.solved).toBe(true);
  expect(controller.runtime.progress.gallery!.order).toEqual(['C']);
  expect(controller.runtime.progress.gallery!.powerTaken.contour).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: '電源を取る' }));
  expect(controller.runtime.progress.gallery!.powerTaken).toEqual({ shadow: false, contour: true });
});

it('keeps B mismatch instructions visible until a sample is replaced', async () => {
  const view = await render(<FirstPersonScreen {...screenProps('shadow')} />); await enter(view, 'shadow');
  const controller = scene().controller, shadow = controller.runtime.progress.gallery!.shadow;
  const samples = createShadowSpec(shadow.seed, shadow.variant).samples;
  const wrong = samples.find(sample => sample.color !== '#808080')!, right = samples.find(sample => sample.color === '#808080')!;
  await dragSample(view, wrong.id, 'socket-left'); await dragSample(view, right.id, 'socket-right', 2);
  await fireEvent.press(view.getByRole('button', { name: '比べる' }));
  expect(view.getByTestId('device-instruction')).toHaveTextContent('明るさが違う。どちらかを入れ替えよう。');
  expect(controller.runtime.progress.gallery!.shadow).toMatchObject({ solved: false, attempts: 1 });
  expect(controller.runtime.progress.gallery!.powerTaken.shadow).toBe(false);
  expect(view.queryByTestId('current-objective')).toBeNull();
  expect(view.queryByText('調べました。')).toBeNull();
});

it('lights the emergency switch and inspects the exit through actual scene actions without old A or D', async () => {
  const original = screenProps('shadow', { checkpoint: createCheckpoint(createGalleryRuntime()) });
  const view = await render(<FirstPersonScreen {...original} />);
  const controller = scene().controller;
  expect(view.getByTestId('current-objective')).toHaveTextContent('出口を探す');
  expect(worldForController(controller).interactables.some(target => target.id.startsWith('emblem-') || target.id === 'key')).toBe(false);
  await aimTarget(view, 'gallery-light');
  await fireEvent.press(view.getByRole('button', { name: '非常灯を点ける' }));
  expect(controller.runtime.progress.gallery!.emergencyLit).toBe(true);
  expect(controller.runtime.progress.sealA).toBe(false); expect(controller.runtime.progress.sealB).toBe(false);
  await aimTarget(view, 'gallery-exit-panel'); await fireEvent.press(view.getByTestId('interact'));
  expect(controller.runtime.progress.gallery!.exitInspected).toBe(true);
  expect(view.getByTestId('current-objective')).toHaveTextContent('予備電源を探す 0/2');
  expect(controller.runtime.progress.gallery!.powerConnected).toBe(false);
  expect(original.onCheckpoint).toHaveBeenCalled();
});

it('changes horror intensity in pause settings without replacing the controller or changing other preferences', async () => {
  const original = screenProps('shadow'), view = await render(<FirstPersonScreen {...original} />);
  await enter(view, 'shadow'); const controller = scene().controller, pose = JSON.stringify(controller.runtime.pose), matrices = controller.matrices;
  await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
  await fireEvent.press(view.getByRole('button', { name: '操作と快適設定' }));
  expect(view.queryByRole('switch', { name: '輪郭ガイド' })).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '控えめな怖さ' }));
  expect(original.onSettingsChange).toHaveBeenCalledWith({ ...original.settings, horrorIntensity: 'subdued' });
  await view.rerender(<FirstPersonScreen {...original} settings={{ ...original.settings, horrorIntensity: 'subdued' }} />);
  expect(scene().controller).toBe(controller); expect(controller.horrorIntensity).toBe('subdued');
  expect(controller.matrices).toBe(matrices); expect(JSON.stringify(controller.runtime.pose)).toBe(pose);
  expect(original.onControlsChange).not.toHaveBeenCalled();
});

it('assigns drag ownership only to this layer when Fabric batches a sibling button touch', async () => {
  const view = await render(<FirstPersonScreen {...screenProps('shadow')} />);
  await enter(view, 'shadow');
  const layer = view.getByTestId('gallery-device-touch');
  const sibling = { ...nativePoint('shadow', SHADOW_SLOT_POSITIONS['source-a'], 9), target: 900 };
  const own = nativePoint('shadow', SHADOW_SLOT_POSITIONS['source-c'], 2);
  await fireEvent(layer, 'touchStart', { nativeEvent: { ...sibling, changedTouches: [sibling, own], targetTouches: [own], touches: [sibling, own] } });
  expect(scene().controller.runtime.gallery!.activeDrag).toMatchObject({ pointerId: 2, sampleId: 'sample-c' });
  await fireEvent(layer, 'touchEnd', touch({ ...sibling, ...nativePoint('shadow', SHADOW_SLOT_POSITIONS['socket-left'], 9) }));
  expect(scene().controller.runtime.gallery!.activeDrag).toMatchObject({ pointerId: 2 });
  expect(scene().controller.runtime.progress.gallery!.shadow.assignments['sample-a']).toBe('source-a');
  await fireEvent(layer, 'touchEnd', touch(nativePoint('shadow', SHADOW_SLOT_POSITIONS['socket-right'], 2)));
  expect(scene().controller.runtime.progress.gallery!.shadow.assignments['sample-c']).toBe('socket-right');
  expect(scene().controller.runtime.progress.gallery!.shadow.solved).toBe(false);
});

it('cancels a C rotation without saving its live angle and retains the three-finger pause route', async () => {
  const view = await render(<FirstPersonScreen {...screenProps('contour')} />);
  await enter(view, 'contour');
  const controller = scene().controller, before = [...controller.runtime.progress.gallery!.contour.angles];
  const disc = createContourSpec(controller.runtime.progress.gallery!.contour.seed).discs[0]!;
  const layer = view.getByTestId('gallery-device-touch');
  const start = nativePoint('contour', { x: disc.center.x + disc.radius * .8, y: disc.center.y });
  const moved = nativePoint('contour', { x: disc.center.x, y: disc.center.y + disc.radius * .8 });
  await fireEvent(layer, 'touchStart', touch(start)); await fireEvent(layer, 'touchMove', touch(moved));
  expect(controller.runtime.gallery!.contourAngles).not.toEqual(before);
  await fireEvent(layer, 'touchCancel', touch(moved));
  expect(controller.runtime.gallery!.activeDrag).toBeNull();
  expect(controller.runtime.gallery!.contourAngles).toEqual(before);
  expect(controller.runtime.progress.gallery!.contour.angles).toEqual(before);
  const fingers = [start, { ...start, identifier: 2 }, { ...start, identifier: 3 }];
  await fireEvent(layer, 'touchStart', { nativeEvent: { ...start, changedTouches: fingers, targetTouches: fingers, touches: fingers } });
  expect(controller.runtime.paused).toBe(true); expect(controller.runtime.gallery!.activeDrag).toBeNull();
  expect(view.getByRole('button', { name: '再開する' })).toBeEnabled();
});

it('withholds manipulation until a completed renderer presentation arrives', async () => {
  mockSubmittedFrame = false;
  const original = screenProps('shadow'), view = await render(<FirstPersonScreen {...original} />);
  expect(view.getByTestId('interact')).toBeDisabled();
  await fireEvent.press(view.getByTestId('interact'));
  expect(scene().controller.runtime.gallery!.mode).toBe('explore');
  expect(scene().controller.runtime.progress.gallery!.shadow.inspected).toBe(false);
  expect(view.queryByTestId('gallery-device-touch')).toBeNull();
  await act(() => {
    Object.assign(scene().controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true });
    scene().onReady();
  });
  await enter(view, 'shadow');
  expect(view.getByTestId('gallery-device-touch')).toBeTruthy();
});

it('cancels an owned drag on background and ignores its old callbacks after explicit resume', async () => {
  const listener = jest.spyOn(AppState, 'addEventListener');
  const original = screenProps('shadow'), view = await render(<FirstPersonScreen {...original} />);
  await enter(view, 'shadow');
  const layer = view.getByTestId('gallery-device-touch'), oldStart = layer.props.onTouchStart, oldEnd = layer.props.onTouchEnd;
  const controller = scene().controller, before = { ...controller.runtime.progress.gallery!.shadow.assignments };
  const from = touch(nativePoint('shadow', SHADOW_SLOT_POSITIONS['source-a']));
  const end = touch(nativePoint('shadow', SHADOW_SLOT_POSITIONS['socket-left']));
  await fireEvent(layer, 'touchStart', from); await fireEvent(layer, 'touchMove', end);
  const callbacks = listener.mock.calls.filter(([event]) => event === 'change').map(([, callback]) => callback);
  await act(() => callbacks.forEach(callback => callback('background')));
  expect(controller.runtime.paused).toBe(true); expect(controller.runtime.gallery!.activeDrag).toBeNull();
  expect(controller.runtime.progress.gallery!.shadow.assignments).toEqual(before);
  await act(() => callbacks.forEach(callback => callback('active')));
  expect(controller.runtime.paused).toBe(true);
  await fireEvent.press(view.getByRole('button', { name: '再開する' }));
  await act(() => { oldStart(from); oldEnd(end); });
  expect(controller.runtime.gallery!.activeDrag).toBeNull();
  expect(controller.runtime.progress.gallery!.shadow.assignments).toEqual(before);
  expect(original.onCheckpoint).toHaveBeenCalled();
});

it('retires manipulation and readiness callbacks across renderer retry and unmount', async () => {
  const original = screenProps('shadow'), view = await render(<FirstPersonScreen {...original} />);
  await enter(view, 'shadow');
  const oldScene = scene(), oldStart = view.getByTestId('gallery-device-touch').props.onTouchStart;
  const start = touch(nativePoint('shadow', SHADOW_SLOT_POSITIONS['source-a']));
  await act(() => oldStart(start));
  expect(oldScene.controller.runtime.gallery!.activeDrag).not.toBeNull();
  await act(() => oldScene.onError('test presentation failure'));
  await fireEvent.press(view.getByRole('button', { name: '表示を再試行' }));
  const fresh = scene();
  expect(fresh.controller).not.toBe(oldScene.controller);
  const saved = createCheckpoint(fresh.controller.runtime);
  await act(() => { oldStart(start); oldScene.onReady(); oldScene.onSnapshot(oldScene.snapshot); });
  expect(oldScene.controller.retired).toBe(true);
  expect(createCheckpoint(fresh.controller.runtime)).toEqual(saved);
  await view.unmount();
  jest.mocked(original.onCheckpoint).mockClear();
  await act(() => { fresh.onReady(); fresh.onSnapshot(fresh.snapshot); oldStart(start); });
  expect(fresh.controller.retired).toBe(true); expect(original.onCheckpoint).not.toHaveBeenCalled();
});

it('supports the same B selection and explicit commit through simple controls', async () => {
  const view = await render(<FirstPersonScreen {...screenProps('shadow', { controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' } })} />);
  await enter(view, 'shadow');
  expect(view.queryByTestId('gallery-device-touch')).toBeNull();
  const controller = scene().controller, shadow = controller.runtime.progress.gallery!.shadow;
  await fireEvent.press(view.getByRole('button', { name: '比べる' }));
  expect(controller.runtime.progress.gallery!.shadow).toMatchObject({ solved: false, attempts: 0 });
  expect(view.getByRole('button', { name: '比べる' })).toBeDisabled();
  const pair = createShadowSpec(shadow.seed, shadow.variant).samples.filter(sample => sample.color === '#808080');
  for (const [index, sample] of pair.entries()) {
    await fireEvent.press(view.getByRole('button', { name: '見本' + (SAMPLE_IDS.indexOf(sample.id) + 1) }));
    await fireEvent.press(view.getByRole('button', { name: index === 0 ? '左の四角い枠へ' : '右の四角い枠へ' }));
  }
  expect(controller.runtime.progress.gallery!.shadow.solved).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: '比べる' }));
  expect(controller.runtime.progress.gallery!.shadow.solved).toBe(true);
});

it('uses VoiceOver adjustments on C without changing saved touch preferences and rejects obsolete actions', async () => {
  jest.mocked(AccessibilityInfo.isScreenReaderEnabled).mockResolvedValue(true);
  const original = screenProps('contour'), view = await render(<FirstPersonScreen {...original} />);
  await aim(view, 'contour');
  await fireEvent.press(view.getByRole('button', { name: '円盤を動かす' }));
  const controller = scene().controller, before = [...controller.runtime.progress.gallery!.contour.angles];
  const oldAdjust = view.getByRole('adjustable', { name: '上の円盤' }).props.onAccessibilityAction;
  await act(() => oldAdjust({ nativeEvent: { actionName: 'activate' } }));
  expect(controller.runtime.progress.gallery!.contour.angles).toEqual(before);
  await fireEvent.press(view.getByRole('button', { name: '探索へ戻る' }));
  await fireEvent.press(view.getByRole('button', { name: '円盤を動かす' }));
  await act(() => oldAdjust({ nativeEvent: { actionName: 'increment' } }));
  expect(controller.runtime.progress.gallery!.contour.angles).toEqual(before);
  const names = ['上の円盤', '左下の円盤', '右下の円盤'] as const;
  for (const disc of createContourSpec(controller.runtime.progress.gallery!.contour.seed).discs) {
    const delta = normalizeAngle(disc.targetAngle - controller.runtime.progress.gallery!.contour.angles[disc.id]);
    for (let step = 0; step < Math.round(Math.abs(delta) / (Math.PI / 36)); step += 1) {
      await fireEvent(view.getByRole('adjustable', { name: names[disc.id] }), 'accessibilityAction', { nativeEvent: { actionName: delta > 0 ? 'increment' : 'decrement' } });
    }
    expect(view.getByRole('adjustable', { name: names[disc.id] }).props.accessibilityValue.text).toBe('切り欠きが内側を向いています');
  }
  expect(controller.runtime.progress.gallery!.contour.solved).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: '引き出しを開く' }));
  expect(controller.runtime.progress.gallery!.contour.solved).toBe(true);
  expect(original.onControlsChange).not.toHaveBeenCalled();
});

it('keeps the key alignment hint out of unfinished B and C manipulation', async () => {
  const view = await render(<FirstPersonScreen {...screenProps('shadow')} />);
  await enter(view, 'shadow');
  await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
  await fireEvent.press(view.getByRole('button', { name: 'ヒント' }));
  await fireEvent.press(view.getByRole('button', { name: '次のヒント' }));
  await fireEvent.press(view.getByRole('button', { name: '次のヒント' }));
  expect(view.queryByRole('button', { name: '近くで視点を合わせる' })).toBeNull();
  expect(scene().controller.runtime.progress.gallery!.shadow.solved).toBe(false);
});

it.each([320, 375, 390, 430].flatMap(width => [1, 2].map(fontScale => ({ width, fontScale }))))('keeps simple C controls in a reachable container at $width points and font scale $fontScale', async ({ width, fontScale }) => {
  const height = width === 320 ? 568 : 844;
  viewport = { width, height: height - 81 };
  await act(() => Dimensions.set({ window: { width, height, scale: 3, fontScale }, screen: { width, height, scale: 3, fontScale } }));
  const view = await render(<FirstPersonScreen {...screenProps('contour', { controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' } })} />);
  await enter(view, 'contour');
  const commit = view.getByRole('button', { name: '引き出しを開く' });
  expect(commit).toBeDisabled();
  expect(StyleSheet.flatten(commit.props.style)).toMatchObject({ minHeight: 48, minWidth: 48 });
  const scroll = view.getByTestId('gallery-device-scroll');
  expect(StyleSheet.flatten(scroll.props.style).maxHeight).toBeGreaterThanOrEqual(48);
  expect(within(scroll).getByRole('button', { name: '引き出しを開く' })).toBe(commit);
  await fireEvent.press(view.getByRole('button', { name: '輪郭ガイド' }));
  expect(scene().controller.runtime.gallery!.contourGuide).toBe(true);
  await fireEvent.press(view.getByRole('button', { name: '探索へ戻る' }));
  expect(view.getByTestId('step-forward')).toBeEnabled();
  await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
  expect(view.getByRole('button', { name: '再開する' })).toBeEnabled();
  // React Native test rendering proves reachability/scroll/minimum-target contracts,
  // not native text measurement or physical iPhone overlap at these dimensions.
});


it('publishes real actor notices only after presentation and stops the actor across background and explicit resume', async () => {
  const listener = jest.spyOn(AppState, 'addEventListener');
  const original = screenProps('shadow', { checkpoint: createCheckpoint(createGalleryRuntime()),
    settings: { ...DEFAULT_SETTINGS, audio: { enabled: false, musicVolume: 0, effectsVolume: 0 } } });
  const view = await render(<FirstPersonScreen {...original} />);
  await aimTarget(view, 'gallery-light'); await fireEvent.press(view.getByRole('button', { name: '非常灯を点ける' }));
  const controller = scene().controller, camera = new PerspectiveCamera(VERTICAL_FOV, viewport.width / viewport.height, .08, 60);
  await act(() => { advanceController(controller, .05, camera); scene().onSnapshot(controllerSnapshot(controller)); });
  expect(controller.runtime.progress.gallery!.story.foreshadowed).toBe(true);
  expect(controller.pendingActorEvents).toEqual(['foreshadow']);
  expect(view.queryByText('格子の奥に、展示体が立っている。')).toBeNull();
  await act(() => { flushControllerAudioFrame(controller); scene().onSnapshot(controllerSnapshot(controller)); });
  expect(view.getByText('格子の奥に、展示体が立っている。')).toBeTruthy();
  expect(controller.actorNotice?.sequence).toBe(1); expect(controller.pendingActorEvents).toEqual([]);
  const callbacks = listener.mock.calls.filter(([event]) => event === 'change').map(([, callback]) => callback);
  await act(() => callbacks.forEach(callback => callback('background')));
  const frozenActor = JSON.stringify(controller.runtime.gallery!.actor);
  await act(() => { for (let frame = 0; frame < 20; frame++) advanceController(controller, .05, camera); });
  expect(JSON.stringify(controller.runtime.gallery!.actor)).toBe(frozenActor);
  await act(() => callbacks.forEach(callback => callback('active')));
  expect(controller.runtime.paused).toBe(true);
  await fireEvent.press(view.getByRole('button', { name: '再開する' }));
  expect(controller.runtime.gallery!.actor.startupGrace).toBeGreaterThanOrEqual(2.75);
  expect(view.queryByText('格子の奥に、展示体が立っている。')).toBeNull();
  await act(() => { advanceController(controller, .05, camera); flushControllerAudioFrame(controller); scene().onSnapshot(controllerSnapshot(controller)); });
  expect(controller.actorNotice?.sequence).toBe(1);
  expect(view.queryByText('格子の奥に、展示体が立っている。')).toBeNull();
  const last = scene(); await view.unmount(); jest.mocked(original.onCheckpoint).mockClear();
  const retiredActor = JSON.stringify(controller.runtime.gallery!.actor);
  await act(() => { advanceController(controller, .05, camera); flushControllerAudioFrame(controller); last.onSnapshot(controllerSnapshot(controller)); });
  expect(JSON.stringify(controller.runtime.gallery!.actor)).toBe(retiredActor); expect(original.onCheckpoint).not.toHaveBeenCalled();
});

it('resumes migrated story progress without replaying its introductory or warning notices', async () => {
  const migrated = migrateGalleryV1Checkpoint(originalV1('D'))!;
  const view = await render(<FirstPersonScreen {...screenProps('shadow', { checkpoint: migrated.checkpoint })} />);
  const controller = scene().controller, camera = new PerspectiveCamera(VERTICAL_FOV, viewport.width / viewport.height, .08, 60);
  await act(() => { for (let frame = 0; frame < 80; frame++) { advanceController(controller, .05, camera); flushControllerAudioFrame(controller); } scene().onSnapshot(controllerSnapshot(controller)); });
  expect(controller.runtime.progress.gallery!.story).toEqual({ foreshadowed: true, absence: true, serviceWarned: true, resolved: false });
  expect(controller.actorNotice).toBeUndefined(); expect(controller.pendingActorEvents).toEqual([]);
  expect(view.queryByText('格子の奥に、展示体が立っている。')).toBeNull();
  expect(view.queryByText('通路に何かいる。棚の陰でやり過ごそう。')).toBeNull();
  expect(view.getByTestId('gallery-power-stock').props.accessibilityLabel).toBe('予備電源 2/2 接続済み');
});


it('removes the exploration reticle from both device surfaces and restores it without replacing the camera or controller', async () => {
  for (const puzzle of ['shadow', 'contour'] as const) {
    const view = await render(<FirstPersonScreen {...screenProps(puzzle)} />);
    await aim(view, puzzle);
    const controller = scene().controller, camera = controller.matrices, pose = JSON.stringify(controller.runtime.pose);
    expect(view.getByTestId('first-person-reticle')).toBeTruthy();
    await fireEvent.press(view.getByTestId('interact'));
    expect(controller.runtime.gallery!.mode).toBe(puzzle);
    expect(view.queryByTestId('first-person-reticle')).toBeNull();
    expect(scene().controller).toBe(controller); expect(controller.matrices).toBe(camera);
    expect(JSON.stringify(controller.runtime.pose)).toBe(pose);
    await fireEvent.press(view.getByRole('button', { name: '探索へ戻る' }));
    expect(view.getByTestId('first-person-reticle')).toBeTruthy();
    expect(scene().controller).toBe(controller); expect(controller.matrices).toBe(camera);
    await view.unmount();
  }
});
