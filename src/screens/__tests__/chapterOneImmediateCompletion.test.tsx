import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { PerspectiveCamera } from 'three';
import App from '../../../App';
import { CHAPTER_ONE } from '../../domain/campaign/definition';
import { parseChapterOneSession } from '../../domain/campaign/checkpoint';
import { createChapterOneSession, type ChapterOneSession } from '../../domain/campaign/session';
import { stageBinding } from '../../domain/stages/departure-control-v1/binding';
import { STAFF_EXIT_SAFE } from '../../domain/stages/departure-control-v1/definition';
import { isStageSession } from '../../domain/stages/departure-control-v1/session';
import type { FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { advanceController, commandController, controllerSnapshot } from '../../rendering/firstPerson/runtimeController';
import { CHAPTER_ONE_STORAGE_KEY } from '../../storage/chapterOneStorage';
import { resetAllApplicationStorage } from '../../storage/firstPersonStorage';

const mockLatestCanvas: { current: FirstPersonCanvasProps | undefined } = { current: undefined };
const originalWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: jest.fn(() => ({})) }));
// The native GL boundary is replaced. App, Screen, controller, stage codec and
// queued campaign storage are real; no completion callback is called by hand.
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { FirstPersonCanvas: (props: FirstPersonCanvasProps) => {
    mockLatestCanvas.current = props;
    const ready = React.useRef(props.onReady);
    React.useEffect(() => {
      Object.assign(props.controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true });
      ready.current();
    }, [props.controller]);
    return React.createElement(View, { testID: 'immediate-completion-canvas' });
  } };
});

beforeEach(async () => {
  mockLatestCanvas.current = undefined;
  await resetAllApplicationStorage();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => { jest.mocked(AsyncStorage.setItem).mockImplementation(originalWrite); jest.restoreAllMocks(); });

async function enterFinale() {
  const fresh = stageBinding.checkpoint(stageBinding.create());
  const checkpoint = stageBinding.restore({ ...fresh, stageData: { schemaVersion: 1, stageId: 'departure-control-v1',
    keyAvailable: false, keyInstalled: true, procedureRead: true, isolated: true, stopped: true,
    staffDoorOpened: true, cleared: false, pose: STAFF_EXIT_SAFE } })!.checkpoint;
  const before: ChapterOneSession = { ...createChapterOneSession('TEST-goal014-immediate-save', 'TEST'),
    revision: 20, currentArea: 'chapter-1-area-05', completedAreas: CHAPTER_ONE.areas.slice(0, 4).map(area => area.id),
    checkpoint, keyLocation: 'installed', finale: { contained: true, isolated: true, stopped: true, outdoorExited: false },
    storyFired: ['isolation-key', 'containment-bell', 'attendance-identified'],
    storyPresented: ['isolation-key', 'containment-bell', 'attendance-identified'] };
  expect(parseChapterOneSession(before)).toBeDefined();
  await AsyncStorage.setItem(CHAPTER_ONE_STORAGE_KEY, JSON.stringify(before));
  const view = await render(<App/>);
  await fireEvent.press(await view.findByRole('button', { name: '続きから' }));
  const setup = view.queryByText('あとで調整して遊ぶ');
  if (setup) await fireEvent.press(setup);
  await fireEvent.press(await view.findByText('退館制御室へ入る'));
  await view.findByTestId('immediate-completion-canvas');
  const canvas = mockLatestCanvas.current!, controller = canvas.controller;
  expect(isStageSession(controller.runtime.stageSession?.value)).toBe(true);
  return { before, view, canvas, controller };
}

async function crossOutdoor(canvas: FirstPersonCanvasProps) {
  const controller = canvas.controller;
  // Start just inside the outdoor crossing. The real controller supplies the
  // completion and its four-second tail; the real Screen publishes its save.
  await act(() => {
    commandController(controller, { type: 'resume' });
    controller.runtime = { ...controller.runtime, pose: { position: { x: -3.75, y: 1.6, z: 22.36 }, yaw: Math.PI, pitch: 0 } };
    advanceController(controller, 1 / 60, new PerspectiveCamera());
    canvas.onSnapshot(controllerSnapshot(controller));
  });
}

async function finishTail(canvas: FirstPersonCanvasProps) {
  await act(() => {
    const camera = new PerspectiveCamera();
    for (let frame = 0; frame < 81; frame++) advanceController(canvas.controller, .05, camera);
    canvas.onSnapshot(controllerSnapshot(canvas.controller));
  });
}

test('App durably records the real outdoor snapshot while four seconds of Canvas tail remain, before any credits acknowledgement', async () => {
  const { before, view, canvas, controller } = await enterFinale();
  await crossOutdoor(canvas);
  expect(controller.runtime.progress.cleared).toBe(true);
  expect(stageBinding.completionTail!(controller.runtime)).toBe(4);
  await waitFor(async () => {
    const saved = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
    expect(saved).toMatchObject({ runId: before.runId, campaignCompleted: true,
      completedAreas: CHAPTER_ONE.areas.map(area => area.id),
      finale: { contained: true, isolated: true, stopped: true, outdoorExited: true } });
  });
  expect(view.getByTestId('immediate-completion-canvas')).toBeTruthy();
  expect(view.queryByRole('button', { name: 'クレジットを表示' })).toBeNull();
  expect(view.queryByText('第一章「最後の退館者」 完')).toBeNull();
  expect(stageBinding.completionTail!(controller.runtime)).toBe(4);
  const completedRaw = (await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!;
  const saved = JSON.parse(completedRaw);
  expect(saved.storyFired).toContain('outdoor-exit');
  expect(saved.storyPresented).not.toContain('outdoor-exit');
  // Simulate the process ending before the tail or cinematic gets a frame.
  await view.unmount();
  const cold = await render(<App/>);
  expect(await cold.findByRole('button', { name: 'エンディングを見る' })).toBeTruthy();
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(completedRaw);
  await cold.unmount();
});

test.each(['saved', 'pending', 'retried'] as const)('the ending reuses a %s outdoor save without writing its revision twice', async mode => {
  const { view, canvas } = await enterFinale();
  let attempts = 0, reject = mode === 'retried';
  let releaseWrite: (() => Promise<void>) | undefined;
  jest.mocked(AsyncStorage.setItem).mockImplementation((key, raw) => {
    if (key !== CHAPTER_ONE_STORAGE_KEY || !JSON.parse(raw).campaignCompleted) return originalWrite(key, raw);
    attempts++;
    if (reject) return Promise.reject(new Error('TEST storage full'));
    if (mode === 'pending') return new Promise<void>(resolve => {
      releaseWrite = async () => { await originalWrite(key, raw); resolve(); };
    });
    return originalWrite(key, raw);
  });
  await crossOutdoor(canvas);
  if (mode === 'retried') {
    expect(await view.findByText('進行を保存できませんでした')).toBeTruthy();
    reject = false;
    await fireEvent.press(view.getByRole('button', { name: '保存を再試行' }));
    await waitFor(() => expect(view.queryByText('進行を保存できませんでした')).toBeNull());
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
  }
  if (mode === 'pending') await waitFor(() => expect(releaseWrite).toBeDefined());
  else await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).campaignCompleted).toBe(true));
  await finishTail(canvas);
  if (mode === 'pending') {
    expect(view.queryByRole('button', { name: 'クレジットを表示' })).toBeNull();
    expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).campaignCompleted).toBe(false);
    await act(() => releaseWrite!());
  }
  expect(await view.findByRole('button', { name: 'クレジットを表示' })).toBeTruthy();
  expect(view.queryByText('エリアの移動を保存できませんでした')).toBeNull();
  expect(view.queryByText('進行を保存できませんでした')).toBeNull();
  expect(attempts).toBe(mode === 'retried' ? 2 : 1);
  await view.unmount();
});
