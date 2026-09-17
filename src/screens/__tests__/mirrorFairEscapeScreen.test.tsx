import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, Dimensions } from 'react-native';
import { PerspectiveCamera } from 'three';
import App from '../../../App';
import { mirrorPointerRoute } from '../../../test-support/mirrorPointerRoute';
import { CHAPTER_ONE } from '../../domain/campaign/definition';
import { parseChapterOneSession } from '../../domain/campaign/checkpoint';
import { createChapterOneSession, type ChapterOneSession } from '../../domain/campaign/session';
import { stageBinding } from '../../domain/stages/mirror-corridor-v1/binding';
import { FIGURE_CENTER, KEY_CENTER, PRACTICE_CENTER, WINCH_CENTER } from '../../domain/stages/mirror-corridor-v1/definition';
import type { FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { advanceController, controllerSnapshot, flushControllerAudioFrame, flushControllerPresentationFeedback,
  presentControllerRecovery, syncCamera, worldForController } from '../../rendering/firstPerson/runtimeController';
import { presentChapterAudio } from '../../rendering/firstPerson/chapterAudio';
import { CHAPTER_ONE_STORAGE_KEY } from '../../storage/chapterOneStorage';
import { resetAllApplicationStorage } from '../../storage/firstPersonStorage';
import type { NativeTouchBatch, TouchPhase } from '../../rendering/firstPerson/touchAdapter';
import { inspectPoseSafety } from '../../domain/firstPerson/geometry';

const fs = require('node:fs') as { writeFileSync(path: string, contents: string): void };
const reports: unknown[] = [];
afterAll(() => {
  if (process.env.MIRROR_SCREEN_REPORT) fs.writeFileSync(process.env.MIRROR_SCREEN_REPORT, JSON.stringify({
    scope: 'Real App, Screen, pointer adapters, controller, physics, checkpoint and campaign writer. Native GL boundary replaced; no physical-device or human response claim.', reports,
  }, null, 2));
});

const mockCanvas: { current?: FirstPersonCanvasProps } = {};
const originalDimensions = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: jest.fn(() => ({})) }));
// Only the native GPU boundary is replaced. The separate visual QA renders
// this same scene/controller; this test owns real App/Screen/input/save flow.
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { FirstPersonCanvas: (props: FirstPersonCanvasProps) => {
    mockCanvas.current = props;
    const ready = React.useRef(props.onReady);
    React.useEffect(() => {
      Object.assign(props.controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
        sceneMode: 'chapter', paused: false, open: false, renderReturns: 1, presentationReturns: 1 });
      ready.current();
    }, [props.controller]);
    return React.createElement(View, { testID: 'fair-escape-canvas' });
  } };
});

beforeEach(async () => {
  delete mockCanvas.current;
  await resetAllApplicationStorage();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(async () => { jest.restoreAllMocks(); await act(() => Dimensions.set(originalDimensions)); });

test.each([
  ['standard', 'straight', 60], ['subdued', 'straight', 30],
  ['standard', 'one-tooth-retreat', 60], ['standard', 'left-held-retreat', 30],
  ['standard', 'capture', 60], ['standard', 'post-gate-capture', 30],
  ['standard', 'lifecycle', 60],
] as const)('%s %s Screen pointers at %s Hz walk across the visible doorway and App saves 05', async (intensity, scenario, hz) => {
  // A valid cold campaign entry at 04, with no 04 solved state injected.
  const saved: ChapterOneSession = { ...createChapterOneSession(`TEST-fair-screen-${intensity}`, 'TEST'),
    currentArea: 'chapter-1-area-04', completedAreas: CHAPTER_ONE.areas.slice(0, 3).map(area => area.id),
    checkpoint: stageBinding.checkpoint(stageBinding.create()), revision: 12 };
  expect(parseChapterOneSession(saved)).toBeDefined();
  await AsyncStorage.setItem(CHAPTER_ONE_STORAGE_KEY, JSON.stringify(saved));
  const appStateListeners = jest.spyOn(AppState, 'addEventListener');
  const accessibilityListeners = jest.spyOn(AccessibilityInfo, 'addEventListener');
  const view = await render(<App />);
  if (intensity === 'subdued' || scenario === 'lifecycle') {
    await fireEvent.press(await view.findByRole('button', { name: '設定' }));
    if (intensity === 'subdued') await fireEvent.press(view.getByRole('button', { name: '控えめな怖さ' }));
    if (scenario === 'lifecycle') await fireEvent.press(view.getByRole('button', { name: '左手で見回す' }));
    await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
  }
  await fireEvent.press(await view.findByRole('button', { name: '続きから' }));
  const calibration = view.queryByText('あとで調整して遊ぶ');
  if (calibration) await fireEvent.press(calibration);
  await fireEvent.press(await view.findByText('鏡越しの回廊へ入る'));
  await view.findByTestId('fair-escape-canvas');
  const canvas = mockCanvas.current!, c = canvas.controller;
  expect(c.horrorIntensity).toBe(intensity);
  const camera = new PerspectiveCamera(65, 390 / 844, .08, 60);
  syncCamera(c, camera);
  const dismissStory = async () => {
    const button = view.queryByRole('button', { name: '探索へ戻る' }) ?? view.queryByRole('button', { name: '点検を続ける' });
    if (button) await fireEvent.press(button);
  };
  await dismissStory();
  let caught = 0;
  let elapsed = 0, firstDangerCue: number | undefined;
  const events: unknown[] = [];
  const report = { intensity, scenario, hz, events, passed: false };
  reports.push(report);
  let released = false, movementMarked = false;
  const mark = (name: string) => {
    const live = route.live();
    events.push({ name, time: elapsed, pose: c.runtime.pose, ratchets: live.ratchets, gateLift: live.gateLift,
      gateCrossed: live.gateCrossed, enemyPhase: live.actor.phase, holding: live.holding,
      pointers: { move: c.input.stickPointer, look: c.input.lookPointer, barrier: [...c.input.releaseBarrier] },
      safety: inspectPoseSafety(c.runtime.pose, worldForController(c)) });
  };
  let heldHandlers: Partial<Record<TouchPhase, (event: { nativeEvent: NativeTouchBatch }) => void>> = {};
  const names = { start: 'onTouchStart', move: 'onTouchMove', end: 'onTouchEnd', cancel: 'onTouchCancel' } as const;
  const route = mirrorPointerRoute({ controller: c,
    touch: async (region, phase, nativeEvent) => {
      if (region === 'interact') {
        if (phase === 'start') {
          const button = view.getByTestId(region);
          heldHandlers = Object.fromEntries(Object.entries(names).map(([key, prop]) => [key, button.props[prop]]));
        }
        await act(() => heldHandlers[phase]?.({ nativeEvent }));
      } else await fireEvent(view.getByTestId(region, { includeHiddenElements: true }), names[phase], { nativeEvent });
      // React Test Renderer does not bubble raw events; the real stable scene
      // ancestor observes the same end/cancel batch after its emitting child.
      if (phase === 'end' || phase === 'cancel') await fireEvent(view.getByTestId('first-person-play', { includeHiddenElements: true }), names[phase], { nativeEvent });
    },
    press: async () => { await fireEvent.press(view.getByTestId('interact')); await dismissStory(); },
    frames: async (count, dt) => {
      await act(() => {
        for (let i = 0; i < count; i++) {
          const previous = route.live(), before = c.runtime.pose.position;
          advanceController(c, dt, camera);
          elapsed += dt;
          if (firstDangerCue === undefined && route.live().holding === 'winch') {
            const p = c.runtime.pose.position;
            if (c.pendingActorPlants.some(plant => Math.hypot(plant.position.x - p.x, plant.position.z - p.z) <= 4.5)) {
              firstDangerCue = elapsed; mark('firstDangerCue');
            }
          }
          if (c.pendingActorEvents.includes('caught')) { caught++; mark('captureConfirmed'); }
          if (previous.gateLift < 1.82 && route.live().gateLift >= 1.82) mark('gatePassable');
          if (!previous.gateCrossed && route.live().gateCrossed) mark('gateCrossed');
          if (released && !movementMarked && Math.hypot(before.x - c.runtime.pose.position.x, before.z - c.runtime.pose.position.z) > .001) {
            movementMarked = true; mark('movementResumed');
          }
          const pending = c.captureRecovery;
          presentControllerRecovery(c, dt);
          if (pending && !pending.presented) throw new Error('The simulated successful frame did not present recovery');
          if (pending && c.captureRecovery?.remaining === 1.2) mark('recoveryPresented');
          if (pending && !c.captureRecovery) mark('recoveryInputReady');
          presentChapterAudio(c, dt); flushControllerAudioFrame(c);
        }
        canvas.onSnapshot(controllerSnapshot(c));
        flushControllerPresentationFeedback(c);
      });
      await dismissStory();
    },
  }, 1 / hz);
  await route.walk(0, -1.5);
  await route.press('mirror-corridor-figure', FIGURE_CENTER);
  await route.press('mirror-corridor-key', KEY_CENTER);
  await route.walk(0, 5.9); await route.walk(-2.16, 5.9); await route.walk(-2.16, 6.9);
  await route.hold(PRACTICE_CENTER); await route.wait(.6); await route.release();
  expect(route.live().practiced).toBe(true);
  await route.walk(-2.16, 5.9); await route.walk(-1.1, 5.9); await route.walk(-1.1, 9.6); await route.walk(-2.45, 9.6);
  if (scenario === 'lifecycle') {
    await route.send('movement-stick', 'start', 1, 340, 600);
    await route.hold(WINCH_CENTER); await route.wait(.4);
    const oldEnd = heldHandlers.end;
    const pause = view.getByTestId('pause-control');
    const p = { identifier: 3, pageX: 360, pageY: 35 };
    await fireEvent(pause, 'touchStart', { nativeEvent: { changedTouches: [p], targetTouches: [p] } });
    await fireEvent(pause, 'touchEnd', { nativeEvent: { changedTouches: [p], targetTouches: [] } });
    expect(c.runtime.paused).toBe(true);
    expect(route.live()).toMatchObject({ holding: null, ratchets: 0 });
    await route.release();
    await route.send('movement-stick', 'end', 1, 340, 600);
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    await route.hold(WINCH_CENTER); await route.wait(.2);
    await act(() => oldEnd?.({ nativeEvent: { changedTouches: [{ identifier: 103, pageX: 320, pageY: 700 }] } }));
    expect(route.live().holding).toBe('winch');
    const oldResizeEnd = heldHandlers.end;
    await act(() => Dimensions.set({ window: { width: 430, height: 932, scale: 3, fontScale: 1 }, screen: { width: 430, height: 932, scale: 3, fontScale: 1 } }));
    expect(route.live()).toMatchObject({ holding: null, ratchets: 0 });
    await route.release();
    await route.hold(WINCH_CENTER); await route.wait(.2);
    await act(() => oldResizeEnd?.({ nativeEvent: { changedTouches: [] } }));
    expect(route.live().holding).toBe('winch');
    const background = appStateListeners.mock.calls.filter(([name]) => name === 'change').map(([, callback]) => callback);
    await act(() => background.forEach(callback => callback('background')));
    expect(c.runtime.paused).toBe(true); expect(route.live().holding).toBeNull();
    await route.release();
    await act(() => background.forEach(callback => callback('active')));
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    await route.aim(WINCH_CENTER);
    const readerCalls = accessibilityListeners.mock.calls as unknown as [string, (enabled: boolean) => void][];
    const reader = readerCalls.find(([name]) => name === 'screenReaderChanged')?.[1];
    if (!reader) throw new Error('Screen did not subscribe to accessibility');
    await act(() => reader(true));
    await fireEvent(view.getByTestId('interact'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(route.live().holding).toBe('winch');
    await route.wait(2.05);
    await fireEvent(view.getByTestId('interact'), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
    expect(route.live()).toMatchObject({ holding: null, ratchets: 1 });
    await act(() => reader(false));
    // Restart this test's interrupted work via actual fresh native input.
  }
  if (scenario === 'left-held-retreat') await route.send('movement-stick', 'start', 1, 40, 600);
  await route.hold(WINCH_CENTER);
  mark('workStart');
  if (scenario === 'one-tooth-retreat' || scenario === 'left-held-retreat' || scenario === 'capture') {
    await route.wait(2.05);
    expect(route.live().ratchets).toBe(1);
    if (scenario !== 'capture') {
      const deadline = elapsed + 4;
      while ((firstDangerCue === undefined || elapsed < firstDangerCue + 1.25) && elapsed < deadline) await route.wait(1 / hz);
      expect(firstDangerCue).toBeDefined();
      expect(elapsed - firstDangerCue!).toBeGreaterThanOrEqual(1.25);
    }
    await route.release();
    released = true; mark('release');
    if (scenario === 'left-held-retreat') {
      const before = c.runtime.pose.position.z;
      await route.wait(1 / hz);
      expect(c.runtime.pose.position.z).toBe(before);
      await route.send('movement-stick', 'move', 1, 40, 650);
      await route.wait(.1);
      expect(c.runtime.pose.position.z).toBeLessThan(before);
      await route.send('movement-stick', 'end', 1, 40, 650);
    }
    if (scenario === 'capture') {
      // Leave the machinery's cover and remain in the visible corridor. This
      // deliberately unsuccessful player input earns a real attack/capture.
      await route.walk(0, 9.6); await route.walk(0, 10.5);
      const deadline = elapsed + 30;
      while (caught === 0 && elapsed < deadline) await route.wait(1 / hz);
      expect(caught).toBe(1);
      expect(view.getByTestId('capture-recovery')).toBeTruthy();
      expect(route.live()).toMatchObject({ keyTaken: true, practiced: true, ratchets: 1, holding: null });
      const confirmed = elapsed;
      while (c.captureRecovery && elapsed < confirmed + 2) await route.wait(1 / hz);
      expect(c.captureRecovery).toBeUndefined();
      expect(elapsed - confirmed).toBeLessThanOrEqual(1.3);
      expect(c.runtime.pose.position).toEqual({ x: -4.05, y: 1.6, z: 10.7 });
    } else {
      await route.walk(-2.45, 9.85); await route.walk(-4.05, 9.85); await route.walk(-4.05, 10.7);
      mark('coverReached');
      await route.wait(16);
    }
    await route.walk(-4.05, 9.85); await route.walk(-2.45, 9.85); await route.walk(-2.45, 9.6);
    await route.hold(WINCH_CENTER); released = false; movementMarked = false; mark('workStart');
    await route.wait(4.05); await route.release();
  } else { await route.wait(scenario === 'lifecycle' ? 4.05 : 6.05); await route.release(); }
  released = true; mark('release');
  expect(route.live()).toMatchObject({ ratchets: 3, holding: null });
  await route.walk(-2.45, 9.3); await route.walk(1.3, 9.3); await route.walk(1.3, 15.9); await route.walk(0, 15.9);
  if (scenario === 'post-gate-capture') {
    await route.walk(0, 19);
    expect(route.live().gateCrossed).toBe(true);
    const deadline = elapsed + 30;
    while (caught === 0 && elapsed < deadline) await route.wait(1 / hz);
    expect(caught).toBe(1);
    expect(c.runtime.pose.position).toEqual({ x: 0, y: 1.6, z: 19 });
    const confirmed = elapsed;
    while (c.captureRecovery && elapsed < confirmed + 2) await route.wait(1 / hz);
    expect(c.captureRecovery).toBeUndefined();
  }
  await route.walk(0, 31.7);
  expect(caught).toBe(scenario === 'capture' || scenario === 'post-gate-capture' ? 1 : 0);
  expect(c.runtime.pose.position.z).toBeGreaterThanOrEqual(31.5);
  expect(c.runtime.progress.cleared).toBe(true);
  await waitFor(async () => {
    const next = parseChapterOneSession(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!));
    expect(next).toMatchObject({ runId: saved.runId, currentArea: 'chapter-1-area-05', keyLocation: 'carried' });
  });
  await dismissStory();
  await waitFor(() => expect(mockCanvas.current?.controller.runtime.chapterId).toBe('departure-control-v1'));
  mark('area05Entered'); report.passed = true;
  await view.unmount();
}, 60000);
