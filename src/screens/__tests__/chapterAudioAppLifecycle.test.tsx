import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, AppState, type AppStateStatus } from 'react-native';
import App from '../../../App';
import { CHAPTER_ONE } from '../../domain/campaign/definition';
import { CHAPTER_ONE_STORAGE_KEY } from '../../storage/chapterOneStorage';
import { resetAllApplicationStorage } from '../../storage/firstPersonStorage';
import { createSharedNativeAudioHarness } from '../../audio/testFixtures/sharedNativeAudio';
import { getAudioSupportSnapshot } from '../../audio/diagnostics';
import { attachNaturalRun, playNaturalArea } from '../../../test-support/naturalChapterRoute';
import { presentChapterAudio } from '../../rendering/firstPerson/chapterAudio';
import { advanceController, controllerSnapshot, flushControllerAudioFrame, flushControllerPresentationFeedback } from '../../rendering/firstPerson/runtimeController';
import type { FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';

let mockNative: ReturnType<typeof createSharedNativeAudioHarness>;
const mockCanvas: { current?: FirstPersonCanvasProps } = {};
const mockOwners = { live: 0, peak: 0, entries: 0 };
const appStateListeners = new Set<(state: AppStateStatus) => void>();
const animationFrames = new Map<number, FrameRequestCallback>();
let frameId = 0, simulationSeconds = 0;

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: () => ({}) }));
jest.mock('../../audio/sources', () => {
  const { mockStaticAudioAssets } = jest.requireActual('../../audio/testFixtures/sharedNativeAudio');
  mockStaticAudioAssets();
  return jest.requireActual('../../audio/sources');
});
jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: Parameters<typeof mockNative.module.createAudioPlayer>) => mockNative.module.createAudioPlayer(...args),
  setAudioModeAsync: (mode: unknown) => mockNative.module.setAudioModeAsync(mode),
  setIsAudioActiveAsync: (active: boolean) => mockNative.module.setIsAudioActiveAsync(active),
}));
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { FirstPersonCanvas: (props: FirstPersonCanvasProps) => {
    mockCanvas.current = props;
    const initial = React.useRef(props);
    React.useEffect(() => {
      mockOwners.live++; mockOwners.entries++; mockOwners.peak = Math.max(mockOwners.peak, mockOwners.live);
      const current = initial.current;
      // Substitute only the successful GL presentation boundary. App, gate,
      // Screen, controller, audio owner/director/backend/session remain real.
      require('../../../test-support/naturalChapterRoute').attachNaturalRun(current.controller);
      Object.assign(current.controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true });
      current.onReady();
      return () => { mockOwners.live--; };
    }, [props.controller]);
    return React.createElement(View, { testID: 'audio-app-canvas' });
  } };
});

type View = Awaited<ReturnType<typeof render>>;
const musicSources = ['title_theme', 'exploration', 'suspicion', 'pursuit', 'release', 'chapter_end'];
const environmentSources = ['room-gallery', 'room-vault', 'room-theatre', 'room-mirror', 'room-control', 'outdoor'];
const entryLabel = (index: number) => ['展示室へ入る', '収蔵庫へ入る', '映写室へ入る'][index] ?? `${CHAPTER_ONE.areas[index]!.title}へ入る`;
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function advanceNative(seconds: number) {
  simulationSeconds += seconds; mockNative.advanceSeconds(seconds);
  const callbacks = [...animationFrames.values()]; animationFrames.clear();
  callbacks.forEach(callback => callback(simulationSeconds * 1000));
}
function present(current: FirstPersonCanvasProps, dt: number) {
  advanceNative(dt);
  presentChapterAudio(current.controller, dt);
  flushControllerAudioFrame(current.controller);
  current.onSnapshot(controllerSnapshot(current.controller));
  flushControllerPresentationFeedback(current.controller);
}
async function acknowledge(view: View) {
  for (let i = 0; i < 8; i++) {
    await act(settle);
    const button = view.queryByRole('button', { name: '探索へ戻る' }) ?? view.queryByRole('button', { name: '点検を続ける' });
    if (!button) break;
    await fireEvent.press(button);
  }
  await act(settle);
}
async function ready(view: View, index: number) {
  await view.findByTestId('audio-app-canvas');
  await acknowledge(view);
  await waitFor(() => expect(mockCanvas.current?.controller.runtime.chapterId).toBe(CHAPTER_ONE.areas[index]!.stageId));
  await act(async () => { await mockCanvas.current!.controller.audio!.whenReady(); await settle(); });
  expect(mockCanvas.current!.controller.runtime.paused).toBe(false);
  const current = mockCanvas.current!, run = attachNaturalRun(current.controller);
  await act(() => { advanceController(run.controller, .05, run.camera); present(current, .05); });
  await act(settle);
  expect(current.controller.audio!.getDiagnostics()).toMatchObject({ availability: 'available', active: true, ready: true });
  expect(mockNative.live().some(player => player.source === environmentSources[index] && player.playing)).toBe(true);
  expect(mockNative.live().some(player => musicSources.includes(player.source) && player.playing)).toBe(true);
  expect(getAudioSupportSnapshot().owners).toEqual([expect.objectContaining({
    campaignAreaId: CHAPTER_ONE.areas[index]!.id, stageId: CHAPTER_ONE.areas[index]!.stageId,
    runtimeSession: current.controller.runtime.session,
  })]);
}
async function walkFromEntry(view: View) {
  const current = mockCanvas.current!, run = attachNaturalRun(current.controller);
  const start = { ...current.controller.runtime.pose.position }, eventStart = mockNative.events.length;
  const stick = view.getByTestId('movement-stick');
  const touch = (y: number) => ({ nativeEvent: { changedTouches: [{ identifier: 51, locationX: 62, locationY: y, pageX: 62, pageY: y }] } });
  await fireEvent(stick, 'touchStart', touch(60));
  await fireEvent(stick, 'touchMove', touch(10));
  await act(() => { for (let frame = 0; frame < 36; frame++) { advanceController(run.controller, 1 / 60, run.camera); present(current, 1 / 60); } });
  await fireEvent(stick, 'touchEnd', touch(10));
  expect(Math.hypot(current.controller.runtime.pose.position.x - start.x, current.controller.runtime.pose.position.z - start.z)).toBeGreaterThan(.65);
  expect(mockNative.events.slice(eventStart).some(event => event.operation === 'play' && ['step-a', 'step-b'].includes(event.source!))).toBe(true);
}
async function pauseMenusAndForeground(view: View, index: number) {
  const owner = mockCanvas.current!.controller.audio!;
  await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
  expect(mockNative.live().some(player => player.playing)).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: '操作と快適設定' }));
  expect(owner.getDiagnostics().active).toBe(false);
  expect(view.getByRole('switch', { name: '音' }).props.value).toBe(true);
  await fireEvent(view.getByRole('switch', { name: '音' }), 'valueChange', false);
  expect(view.getByRole('switch', { name: '音' }).props.value).toBe(false);
  expect(mockNative.live().some(player => player.playing)).toBe(false);
  expect(view.queryByText(/音を再生できませんでした/)).toBeNull();
  await fireEvent(view.getByRole('switch', { name: '音' }), 'valueChange', true);
  await fireEvent.press(view.getByRole('button', { name: '一時停止メニュー' }));
  await fireEvent.press(view.getByRole('button', { name: '発見メモ' }));
  expect(mockNative.live().some(player => player.playing)).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: '一時停止へ戻る' }));
  await fireEvent.press(view.getByRole('button', { name: '再開する' }));
  await ready(view, index);
  if (index === 1) {
    const current = mockCanvas.current!, run = attachNaturalRun(current.controller);
    mockNative.disconnectRoute();
    const playRequests = mockNative.events.filter(event => event.operation === 'play').length;
    await act(() => { for (let frame = 0; frame < 60; frame++) { advanceController(run.controller, 1 / 60, run.camera); present(current, 1 / 60); } });
    expect(mockNative.live().some(player => player.playing)).toBe(false);
    expect(mockNative.events.filter(event => event.operation === 'play')).toHaveLength(playRequests);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    await ready(view, index);
  }
  await act(() => { for (const callback of [...appStateListeners]) callback('background'); });
  await act(settle);
  expect(mockNative.live().some(player => player.playing)).toBe(false);
  expect(mockNative.activeSession).toBe(false);
  await act(() => { for (const callback of [...appStateListeners]) callback('active'); });
  expect(mockNative.live().some(player => player.playing)).toBe(false);
  await fireEvent.press(view.getByRole('button', { name: '再開する' }));
  await ready(view, index);
}

beforeEach(async () => {
  await resetAllApplicationStorage();
  mockNative = createSharedNativeAudioHarness({ immediateSeeks: true });
  delete mockCanvas.current; Object.assign(mockOwners, { live: 0, peak: 0, entries: 0 });
  animationFrames.clear(); appStateListeners.clear(); simulationSeconds = frameId = 0;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    appStateListeners.add(callback); return { remove() { appStateListeners.delete(callback); } };
  });
  jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(callback => { animationFrames.set(++frameId, callback); return frameId; });
  jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(id => { if (typeof id === 'number') animationFrames.delete(id); });
});
afterEach(async () => { await act(settle); jest.restoreAllMocks(); });

it('carries sound through the actual App natural route, ending, cold resumes, menus, replay and twelve reentries', async () => {
  const trace: object[] = [];
  const directSaves: string[] = [];
  let view = await render(<App />);
  try {
    await view.findByRole('button', { name: '第一章をはじめる' });
    await act(async () => { await settle(); advanceNative(.05); await settle(); });
    expect(mockNative.live().some(player => player.source === 'title_theme' && player.playing)).toBe(true);
    // Let the actual title owner survive its 54-second track boundary before
    // beginning the uninterrupted route. This is simulated time, not listening.
    await act(() => { for (let frame = 0; frame < 1120; frame++) advanceNative(.05); });
    expect(mockNative.live().find(player => player.source === 'title_theme')!.currentTime).toBeLessThan(3);
    trace.push({ screen: 'home', audio: getAudioSupportSnapshot() });
    await fireEvent.press(view.getByRole('button', { name: '第一章をはじめる' }));
    await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
    await fireEvent.press(view.getByText(entryLabel(0)));
    for (let index = 0; index < CHAPTER_ONE.areas.length; index++) {
      await ready(view, index);
      directSaves.push((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
      const current = mockCanvas.current!, owner = current.controller.audio!;
      const eventStart = mockNative.events.length;
      const run = attachNaturalRun(current.controller);
      run.onAdvance = (_run, dt) => present(current, dt);
      run.onCommand = () => present(current, 0);
      await act(() => { expect(playNaturalArea(run, index, ['shadow', 'contour']).progress.cleared).toBe(true); });
      await acknowledge(view);
      // Finish the scene-owned closing tail through the same presentation hook.
      for (let frame = 0; frame < 700 && !current.controller.retired && mockCanvas.current?.controller === current.controller; frame++) {
        await act(() => { advanceController(current.controller, 1 / 60, run.camera); present(current, 1 / 60); });
        if (view.queryByRole('button', { name: '点検を続ける' }) || view.queryByRole('button', { name: '探索へ戻る' })) await acknowledge(view);
      }
      await act(settle);
      const played = mockNative.events.slice(eventStart).filter(event => event.operation === 'play').map(event => event.source!);
      expect(played.some(source => !musicSources.includes(source) && !environmentSources.includes(source))).toBe(true);
      trace.push({ area: CHAPTER_ONE.areas[index]!.id, elapsedSimulationSeconds: simulationSeconds,
        playedSources: [...new Set(played)], audio: getAudioSupportSnapshot(), oldOwner: owner.getDiagnostics() });
      await acknowledge(view);
      await waitFor(async () => {
        const saved = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
        expect(saved.completedAreas).toEqual(CHAPTER_ONE.areas.slice(0, index + 1).map(area => area.id));
      });
    }
    await act(async () => { await settle(); advanceNative(.05); await settle(); });
    expect(mockNative.live().some(player => player.source === 'chapter_end' && player.playing)).toBe(true);
    expect(mockOwners.peak).toBe(1); expect(mockOwners.entries).toBe(5); expect(mockOwners.live).toBe(0);
    expect(mockNative.maxLivePlayers).toBeLessThanOrEqual(12);
    expect(simulationSeconds).toBeGreaterThan(180);
    trace.push({ screen: 'ending', audio: getAudioSupportSnapshot() });
    // These are genuine saves produced by the uninterrupted route above. Cold
    // entry restores them in isolated test storage, without fabricating area
    // checkpoints or replacing the App transition with a new controller.
    for (let index = 1; index < CHAPTER_ONE.areas.length; index++) {
      await view.unmount(); await act(settle);
      expect(mockNative.live()).toHaveLength(0); expect(mockNative.subscriptions).toBe(0);
      await AsyncStorage.setItem(CHAPTER_ONE_STORAGE_KEY, directSaves[index]!);
      view = await render(<App />);
      await fireEvent.press(await view.findByRole('button', { name: '続きから' }));
      await fireEvent.press(view.getByText(entryLabel(index)));
      await ready(view, index); await walkFromEntry(view);
      await pauseMenusAndForeground(view, index);
      trace.push({ path: 'cold-resume-and-menus', area: CHAPTER_ONE.areas[index]!.id, audio: getAudioSupportSnapshot() });
      for (let visit = 0; visit < 2; visit++) {
        const oldPlayers = mockNative.live();
        await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
        await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
        expect(oldPlayers.every(player => player.released)).toBe(true);
        await fireEvent.press(await view.findByRole('button', { name: '続きから' }));
        await fireEvent.press(view.getByText(entryLabel(index)));
        await ready(view, index);
        expect(getAudioSupportSnapshot().liveOwners).toBe(1);
        expect(mockNative.live().length).toBeLessThanOrEqual(12);
        expect(mockNative.subscriptions).toBe(mockNative.live().length);
        trace.push({ path: 'home-continue', area: CHAPTER_ONE.areas[index]!.id, visit, audio: getAudioSupportSnapshot() });
      }
    }
    expect(mockOwners.entries).toBe(17);
    // Replay a reached area and return to the still-saved campaign area05.
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
    const beforeReplay = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
    await fireEvent.press(view.getByRole('button', { name: 'エリアを振り返る' }));
    await fireEvent.press(view.getByRole('button', { name: `${CHAPTER_ONE.areas[0]!.title}を振り返る` }));
    await ready(view, 0); await walkFromEntry(view);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
    expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(beforeReplay);
    await fireEvent.press(view.getByRole('button', { name: '第一章のホームへ' }));
    await fireEvent.press(view.getByRole('button', { name: '続きから' }));
    await fireEvent.press(view.getByText(entryLabel(4)));
    await ready(view, 4);
    expect(mockOwners.entries).toBe(19); expect(mockOwners.peak).toBe(1);
    expect(mockNative.maxLivePlayers).toBeLessThanOrEqual(12);
    trace.push({ path: 'replay-home-campaign-continue', audio: getAudioSupportSnapshot() });
  } finally { await view.unmount(); await act(settle); }
  expect(mockNative.live()).toHaveLength(0); expect(mockNative.subscriptions).toBe(0);
  expect(mockNative.pendingNativeDeactivations).toBe(0); expect(animationFrames.size).toBe(0); expect(appStateListeners.size).toBe(0);
  expect(getAudioSupportSnapshot()).toMatchObject({ liveOwners: 0, livePlayers: 0, session: { leases: 0, pendingOperations: 0, desiredActive: false, appliedActive: false } });
  if (process.env.CHROMA_QA_AUDIO_TRACE) {
    const fs = require('node:fs') as { writeFileSync(path: string, contents: string): void };
    fs.writeFileSync(process.env.CHROMA_QA_AUDIO_TRACE, JSON.stringify({ schemaVersion: 1, nativeExecution: false,
      presentation: 'successful GL boundary substitute', audio: 'installed native shared-session contract fake; synchronous seeks for route only',
      simulationSeconds, trace, nativeEvents: mockNative.events }, null, 2));
  }
}, 120000);

it('repairs a failed music source through actual pause/resume after activating the Screen owner', async () => {
  const view = await render(<App />);
  try {
    await fireEvent.press(await view.findByRole('button', { name: '第一章をはじめる' }));
    await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
    await fireEvent.press(view.getByText(entryLabel(0)));
    await ready(view, 0);
    const current = mockCanvas.current!, owner = current.controller.audio!;
    const ambience = mockNative.live().find(player => player.source === 'room-gallery')!;
    const music = mockNative.live().find(player => player.source === 'exploration')!;
    music.error = 'fixture music load failure'; music.notify();
    await act(() => present(current, .05));
    expect(music.released).toBe(true);
    expect(owner.getDiagnostics()).toMatchObject({ availability: 'available', musicPlayers: 0, players: 10 });
    expect(ambience.playing).toBe(true);
    await walkFromEntry(view);
    await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    await ready(view, 0);
    expect(current.controller.audio).toBe(owner);
    expect(ambience.released).toBe(false);
    expect(mockNative.live().find(player => player.source === 'exploration')).not.toBe(music);
    expect(getAudioSupportSnapshot().firstAudioFailure).toMatchObject({ message: 'fixture music load failure' });
  } finally { await view.unmount(); await act(settle); }
  expect(mockNative.live()).toHaveLength(0); expect(mockNative.subscriptions).toBe(0);
});
