import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { PerspectiveCamera } from 'three';

import App from '../../../App';
import { CHAPTER_ONE_BACKUP_KEY, CHAPTER_ONE_STORAGE_KEY } from '../../storage/chapterOneStorage';
import { GALLERY_CHECKPOINT_KEY, GALLERY_V1_CHECKPOINT_KEY, STAGE_JOURNAL_KEY, VAULT_CHECKPOINT_KEY, resetAllApplicationStorage } from '../../storage/firstPersonStorage';
import { originalV1 } from '../../storage/testFixtures/galleryV1';
import { vaultCheckpoint } from '../../storage/testFixtures/vault';
import { theatreCheckpoint } from '../../storage/testFixtures/theatre';
import { chapterCompletionSummary } from '../../app/chapterSummary';
import { createActorMotion } from '../../domain/actorMotion';
import { CHAPTER_ONE } from '../../domain/campaign/definition';
import { CHAPTER_ONE_BEATS, CHAPTER_ONE_COPY } from '../../domain/campaign/story';
import { recordGalleryDiscovery } from '../../domain/gallery';
import { migrateGalleryV1Checkpoint } from '../../domain/gallery/checkpoint';
import { THEATRE_BELLS } from '../../domain/theatre/environment';
import { attachNaturalRun, playNaturalArea } from '../../../test-support/naturalChapterRoute';
import { createCheckpoint } from '../../domain/firstPerson';
import type { CheckpointState } from '../../domain/firstPerson/types';
import { EXIT, FIGURE_CENTER, KEY_CENTER } from '../../domain/stages/mirror-corridor-v1/definition';
import { OUTDOOR } from '../../domain/stages/departure-control-v1/definition';
import { parseStageCheckpoint as parseMirrorCheckpoint } from '../../domain/stages/mirror-corridor-v1/checkpoint';
import { parseStageCheckpoint as parseDepartureCheckpoint } from '../../domain/stages/departure-control-v1/checkpoint';
import { recordCampaignReplayDiscoveries } from '../../domain/campaign/session';
import { mergeCampaignDiscoveries } from '../../domain/campaign/discoveries';
import type { FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { advanceController, commandController, controllerSnapshot, interactController, syncCamera } from '../../rendering/firstPerson/runtimeController';
import type { FirstPersonScreenProps } from '../FirstPersonScreen';
import * as gateModule from '../NativeFirstPersonGate';
import * as endingModule from '../ChapterOneEndingScreen';
import { recentFailureSnapshots, resetFailureSnapshotsForTest } from '../../rendering/firstPerson/failureLedger';
import { recordFirstFailure } from '../../rendering/firstPerson/diagnostics';

const mockLatestCanvas: { current: FirstPersonCanvasProps | undefined } = { current: undefined };
const mockCanvasOwners = { active: 0, peak: 0 };
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: jest.fn(() => ({})) }));
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { FirstPersonCanvas: (props: FirstPersonCanvasProps) => {
    mockLatestCanvas.current = props;
    const initialReady = React.useRef(props.onReady);
    React.useEffect(() => {
      mockCanvasOwners.active += 1;
      mockCanvasOwners.peak = Math.max(mockCanvasOwners.peak, mockCanvasOwners.active);
      return () => { mockCanvasOwners.active -= 1; };
    }, [props.controller]);
    React.useEffect(() => {
      Object.assign(props.controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true });
      initialReady.current();
    }, [props.controller]);
    return React.createElement(View, { testID: 'campaign-native-canvas' });
  } };
});
const originalAsyncStorageWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;

beforeEach(async () => {
  resetFailureSnapshotsForTest();
  mockLatestCanvas.current = undefined;
  mockCanvasOwners.active = 0;
  mockCanvasOwners.peak = 0;
  await resetAllApplicationStorage();
  jest.mocked(requireOptionalNativeModule).mockReturnValue({} as ReturnType<typeof requireOptionalNativeModule>);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => { jest.mocked(AsyncStorage.setItem).mockImplementation(originalAsyncStorageWrite); jest.restoreAllMocks(); });
const campaignEntryLabel = (index: number) => ['展示室へ入る', '収蔵庫へ入る', '映写室へ入る'][index]
  ?? `${CHAPTER_ONE.areas[index]!.title}へ入る`;

test.each([
  ['standard', 'standard', ['shadow', 'contour'], false],
  ['subdued', 'subdued', ['contour', 'shadow'], false],
  ['standard-cold', 'standard', ['shadow', 'contour'], true],
] as const)('one fresh %s campaign advances all five mounted controllers and persists the outdoor ending', async (caseName, intensity, order, cold) => {
  const trace: { area: string; runId: string; revision: number; completedAreas: string[];
    campaignCompleted: boolean; canvasOwners: number }[] = [];
  const reentries: { area: string; visit: number; revision: number; canvasOwners: number }[] = [];
  const coldTransitions: { from: string; to: string; revision: number; canvasOwners: number }[] = [];
  const transitionStories: { from: string; beat: string; canvasOwners: number }[] = [];
  const reverseReplays: { area: string; stageId: string; completed: boolean;
    discoveriesAdded: string[]; canvasOwnersAfterExit: number }[] = [];
  let entryCount = 1;
  let coldRestores = 0;
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  let view = await render(<App/>);
  if (intensity === 'subdued') {
    await fireEvent.press(await view.findByRole('button', { name: '設定' }));
    await fireEvent.press(view.getByRole('button', { name: '控えめな怖さ' }));
    await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
  }
  await fireEvent.press(await view.findByRole('button', { name: '第一章をはじめる' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  await act(() => latest!.onValidatedEntry?.(latest!.checkpoint!));
  await fireEvent.press(await view.findByRole('button', { name: '点検を続ける' }));
  const first = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
  const runId = first.runId;
  expect(first.currentArea).toBe('chapter-1-area-01');
  for (let index = 0; index < CHAPTER_ONE.areas.length; index++) {
    const area = CHAPTER_ONE.areas[index]!;
    await waitFor(() => expect(latest?.chapterId).toBe(area.stageId));
    for (let i = 0; i < 4; i++) {
      const resume = view.queryByRole('button', { name: '探索へ戻る' }) ?? view.queryByRole('button', { name: '点検を続ける' });
      if (!resume) break;
      await fireEvent.press(resume);
    }
    await waitFor(() => expect(mockLatestCanvas.current?.controller.runtime.chapterId).toBe(area.stageId));
    if (cold) for (let visit = 0; visit < 2; visit++) {
      const oldGate = latest!;
      await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
      await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
      expect(mockCanvasOwners.active).toBe(0);
      const rawBeforeStale = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
      await act(() => oldGate.onCheckpoint(oldGate.checkpoint!));
      expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(rawBeforeStale);
      await fireEvent.press(view.getByRole('button', { name: '続きから' }));
      await fireEvent.press(view.getByText(campaignEntryLabel(index)));
      for (let i = 0; i < 4; i++) {
        const resume = view.queryByRole('button', { name: '探索へ戻る' }) ?? view.queryByRole('button', { name: '点検を続ける' });
        if (!resume) break;
        await fireEvent.press(resume);
      }
      await view.findByTestId('campaign-native-canvas');
      entryCount++;
      expect(mockCanvasOwners.active).toBe(1);
      expect(mockCanvasOwners.peak).toBe(1);
      expect(latest!.chapterId).toBe(area.stageId);
      const savedAtReentry = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
      expect(savedAtReentry.runId).toBe(runId);
      expect(savedAtReentry.currentArea).toBe(area.id);
      reentries.push({ area: area.id, visit: visit + 1, revision: savedAtReentry.revision,
        canvasOwners: mockCanvasOwners.active });
    }
    const gate = latest!;
    const run = attachNaturalRun(mockLatestCanvas.current!.controller);
    expect(run.controller.horrorIntensity).toBe(intensity);
    let stopped: CheckpointState | undefined;
    let cleared: CheckpointState | undefined;
    await act(() => { cleared = playNaturalArea(run, index, order, () => { stopped = createCheckpoint(run.controller.runtime); }); });
    expect(cleared?.progress.cleared).toBe(true);
    if (stopped) {
      expect(stopped.stageData).toMatchObject({ keyInstalled: true, isolated: true, stopped: true, cleared: false });
      await act(() => gate.onCheckpoint(stopped!));
    }
    // The mock Canvas has no native frame callback. Deliver the checkpoint
    // produced by this mounted controller through the screen's real host lease.
    await act(() => {
      gate.onCheckpoint(cleared!);
      gate.onComplete(chapterCompletionSummary(area.stageId, cleared!.progress));
    });
    await waitFor(async () => {
      const saved = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
      expect(saved.runId).toBe(runId);
      expect(saved.completedAreas).toEqual(CHAPTER_ONE.areas.slice(0, index + 1).map(item => item.id));
      expect(saved.campaignCompleted).toBe(index === 4);
      if (index < 4) expect(saved.currentArea).toBe(CHAPTER_ONE.areas[index + 1]!.id);
    });
    const saved = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
    trace.push({ area: area.id, runId: saved.runId, revision: saved.revision,
      completedAreas: saved.completedAreas, campaignCompleted: saved.campaignCompleted,
      canvasOwners: mockCanvasOwners.active });
    expect(mockCanvasOwners.peak).toBeLessThanOrEqual(1);
    if (index < CHAPTER_ONE.areas.length - 1) {
      const pending = CHAPTER_ONE_BEATS.filter(beat => beat.area === area.id &&
        saved.storyFired.includes(beat.id) && !saved.storyPresented.includes(beat.id));
      for (const beat of pending) {
        expect(await view.findByText(beat.text)).toBeTruthy();
        expect(latest!.chapterId).toBe(area.stageId);
        await fireEvent.press(view.getByRole('button', { name: '点検を続ける' }));
        await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyPresented)
          .toContain(beat.id));
        transitionStories.push({ from: area.id, beat: beat.id, canvasOwners: mockCanvasOwners.active });
      }
    }
    if (cold && index < CHAPTER_ONE.areas.length - 1) {
      const rawBeforeCold = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
      await view.unmount();
      expect(mockCanvasOwners.active).toBe(0);
      view = await render(<App/>);
      const next = CHAPTER_ONE.areas[index + 1]!;
      expect(await view.findByText(new RegExp(`エリア ${next.number} / 05`))).toBeTruthy();
      expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(rawBeforeCold);
      await fireEvent.press(view.getByRole('button', { name: '続きから' }));
      await fireEvent.press(view.getByText(campaignEntryLabel(index + 1)));
      for (let i = 0; i < 4; i++) {
        const resume = view.queryByRole('button', { name: '探索へ戻る' }) ?? view.queryByRole('button', { name: '点検を続ける' });
        if (!resume) break;
        await fireEvent.press(resume);
      }
      await view.findByTestId('campaign-native-canvas');
      entryCount++;
      coldRestores++;
      expect(latest!.chapterId).toBe(next.stageId);
      expect(mockCanvasOwners.active).toBe(1);
      expect(mockCanvasOwners.peak).toBe(1);
      const savedAtCold = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
      expect(savedAtCold.runId).toBe(runId);
      expect(savedAtCold.currentArea).toBe(next.id);
      const rawBeforeStale = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
      await act(() => gate.onCheckpoint(gate.checkpoint!));
      expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(rawBeforeStale);
      coldTransitions.push({ from: area.id, to: next.id, revision: savedAtCold.revision,
        canvasOwners: mockCanvasOwners.active });
    }
  }
  if (cold) { expect(entryCount).toBe(15); expect(coldRestores).toBe(4);
    expect(reentries).toHaveLength(10); expect(coldTransitions).toHaveLength(4); }
  const credits = await view.findByRole('button', { name: 'クレジットを表示' });
  await fireEvent(credits, 'pressIn');
  await fireEvent.press(credits);
  expect(await view.findByText('第一章「最後の退館者」 完')).toBeTruthy();
  expect(view.getByText(CHAPTER_ONE_COPY.containmentInstruction)).toBeTruthy();
  expect(view.getByText(CHAPTER_ONE_COPY.attendanceIdentified)).toBeTruthy();
  expect(view.getByText(`${CHAPTER_ONE_COPY.attendance01} → ${CHAPTER_ONE_COPY.attendance00}`)).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyPresented)
    .toEqual(expect.arrayContaining(['containment-bell', 'attendance-identified', 'outdoor-exit'])));
  await view.unmount();
  expect(mockCanvasOwners.active).toBe(0);
  const resumed = await render(<App/>);
  expect(await resumed.findByRole('button', { name: 'エンディングを見る' })).toBeTruthy();
  expect(resumed.getByRole('button', { name: '第一章をはじめから' })).toBeTruthy();
  const completedRaw = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
  await fireEvent.press(resumed.getByRole('button', { name: 'エンディングを見る' }));
  const replayCredits = await resumed.findByRole('button', { name: 'クレジットを表示' });
  await fireEvent(replayCredits, 'pressIn');
  await fireEvent.press(replayCredits);
  expect(await resumed.findByText(CHAPTER_ONE_COPY.attendanceIdentified)).toBeTruthy();
  expect(resumed.queryByText(CHAPTER_ONE_COPY.containmentInstruction)).toBeNull();
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(completedRaw);
  await fireEvent.press(resumed.getByRole('button', { name: 'ホームへ戻る' }));
  if (cold) for (let index = CHAPTER_ONE.areas.length - 1; index >= 0; index--) {
    const area = CHAPTER_ONE.areas[index]!;
    const savedBeforeReplay = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
    const replayLabel = `${area.title}を振り返る`;
    if (!resumed.queryByRole('button', { name: replayLabel }))
      await fireEvent.press(resumed.getByRole('button', { name: 'エリアを振り返る' }));
    await fireEvent.press(resumed.getByRole('button', { name: replayLabel }));
    await resumed.findByTestId('campaign-native-canvas');
    entryCount++;
    expect(latest!.chapterId).toBe(area.stageId);
    expect(latest!.checkpoint?.progress.cleared).toBe(false);
    expect(mockCanvasOwners.active).toBe(1);
    expect(mockCanvasOwners.peak).toBe(1);
    const replayGate = latest!;
    const replayRun = attachNaturalRun(mockLatestCanvas.current!.controller);
    let replayCleared: CheckpointState | undefined;
    await act(() => { replayCleared = playNaturalArea(replayRun, index, order); });
    expect(replayCleared?.progress.cleared).toBe(true);
    await act(() => {
      replayGate.onCheckpoint(replayCleared!);
      replayGate.onComplete(chapterCompletionSummary(area.stageId, replayCleared!.progress));
    });
    expect(await resumed.findByText(`${area.title}を振り返った`)).toBeTruthy();
    expect(mockCanvasOwners.active).toBe(0);
    const expectedDiscoveries = mergeCampaignDiscoveries(savedBeforeReplay.discoveryHistory, area.id, replayCleared!);
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).discoveryHistory)
      .toEqual(expectedDiscoveries));
    const afterReplay = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
    for (const key of ['runId', 'currentArea', 'completedAreas', 'checkpoint', 'keyLocation',
      'storyFired', 'storyPresented', 'finale', 'campaignCompleted'] as const)
      expect(afterReplay[key]).toEqual(savedBeforeReplay[key]);
    if (expectedDiscoveries === savedBeforeReplay.discoveryHistory) expect(afterReplay).toEqual(savedBeforeReplay);
    else expect(afterReplay.revision).toBeGreaterThan(savedBeforeReplay.revision);
    await act(() => replayGate.onCheckpoint(replayCleared!));
    expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(JSON.stringify(afterReplay));
    reverseReplays.push({ area: area.id, stageId: area.stageId, completed: true,
      discoveriesAdded: (expectedDiscoveries[area.id] ?? []).filter(id =>
        !(savedBeforeReplay.discoveryHistory[area.id] ?? []).includes(id)), canvasOwnersAfterExit: mockCanvasOwners.active });
    await fireEvent.press(resumed.getByRole('button', { name: 'エリア一覧へ' }));
  }
  if (cold) { expect(entryCount).toBe(20); expect(reverseReplays).toHaveLength(5); }
  await resumed.unmount();
  expect(mockCanvasOwners.active).toBe(0);
  if (process.env.CHROMA_QA_TRACE_DIR) {
    const fs = require('node:fs') as { mkdirSync(path: string, options: { recursive: boolean }): void;
      writeFileSync(path: string, data: string): void };
    const path = require('node:path') as { resolve(path: string): string; join(...parts: string[]): string };
    const directory = path.resolve(process.env.CHROMA_QA_TRACE_DIR);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `app-natural-route-${caseName}.json`), JSON.stringify({
      boundary: 'Jest React Native App and screen host, actual mounted controllers, collision, campaign codec and AsyncStorage mock; Canvas GL-ready boundary and audio are mocked; no native video or device',
      intensity, order, runId, trace, reentries, coldTransitions, transitionStories, reverseReplays,
      entryCount, coldRestores, canvasPeak: mockCanvasOwners.peak,
      canvasAfterUnmount: mockCanvasOwners.active,
      coldEndingAvailable: true,
    }, null, 2) + '\n');
  }
  if (caseName === 'standard') {
    const restartHome = await render(<App/>);
    const alert = jest.spyOn(Alert, 'alert');
    const oldRaw = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
    await fireEvent.press(await restartHome.findByRole('button', { name: '第一章をはじめから' }));
    const confirmation = alert.mock.calls.at(-1)!;
    expect(confirmation[0]).toBe('第一章を最初から');
    expect(confirmation[1]).toContain('現在の第一章の進行を新しい周回に置き換えます');
    expect(confirmation[2]?.some(button => button.text === 'キャンセル')).toBe(true);
    expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(oldRaw);
    await act(() => confirmation[2]?.find(button => button.text === '最初から始める')?.onPress?.());
    const skipSetup = restartHome.queryByText('あとで調整して遊ぶ');
    if (skipSetup) await fireEvent.press(skipSetup);
    await fireEvent.press(await restartHome.findByText('展示室へ入る'));
    await restartHome.findByTestId('campaign-native-canvas');
    const newRaw = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
    expect(await AsyncStorage.getItem(CHAPTER_ONE_BACKUP_KEY)).toBe(oldRaw);
    expect(newRaw.runId).not.toBe(runId);
    expect(newRaw.resetGeneration).toBe(JSON.parse(oldRaw!).resetGeneration + 1);
    expect(newRaw).toMatchObject({ currentArea: 'chapter-1-area-01', completedAreas: [], campaignCompleted: false });
    await restartHome.unmount();
    expect(mockCanvasOwners.active).toBe(0);
  }
}, 90_000);

test('product home starts one campaign envelope and resumes the same first area', async () => {
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  const view = await render(<App />);
  expect(await view.findByText('最後の退館者')).toBeTruthy();
  expect(view.getByText('今後のアップデートで追加予定')).toBeTruthy();
  expect(view.queryByTestId('select-returnless-entrance')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '第一章をはじめる' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  await act(() => latest!.onValidatedEntry?.(latest!.checkpoint!));
  expect(await view.findByText('残っている職員は、私ひとりのはずだ。')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '点検を続ける' }));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!))
    .toMatchObject({ storyFired: ['closing-interrupted'], storyPresented: ['closing-interrupted'] }));
  const first = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
  expect(first).toMatchObject({ currentArea: 'chapter-1-area-01', completedAreas: [], campaignCompleted: false });
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
  await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
  expect(view.getByText(/エリア 01 \/ 05/)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '続きから' }));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).runId).toBe(first.runId);
});

test('first-chapter reset warning describes the record that will be replaced at entry', async () => {
  const alert = jest.spyOn(Alert, 'alert');
  const view = await render(<App />);
  await fireEvent.press(await view.findByRole('button', { name: '第一章をはじめる' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  const before = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
  await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
  await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
  await fireEvent.press(view.getByRole('button', { name: '設定' }));
  await fireEvent.press(view.getByRole('button', { name: '第一章「最後の退館者」だけを最初から' }));
  const confirmation = alert.mock.calls.at(-1)!;
  expect(confirmation[1]).toContain('進行・発見・物語の提示記録を置き換えます');
  expect(confirmation[1]).toContain('以前のエリアのプレイ記録');
  expect(confirmation[1]).not.toContain('過去の脱出・発見');
  await act(() => confirmation[2]?.find(button => button.text === '入場の準備へ')?.onPress?.());
  expect(await view.findByRole('button', { name: '展示室へ入る' })).toBeTruthy();
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(before);
  await view.unmount();
});

test('the discovery record shows observed notes and replay unions notes without moving the campaign', async () => {
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  const view = await render(<App />);
  await fireEvent.press(await view.findByRole('button', { name: '第一章をはじめる' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  const first = latest!;
  const gallery = first.checkpoint!.progress.gallery!;
  const observed = { ...first.checkpoint!, progress: { ...first.checkpoint!.progress,
    gallery: { ...gallery, discoveries: { ...gallery.discoveries, chromatic: true } } } };
  await act(() => first.onCheckpoint(observed));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).discoveryHistory)
    .toEqual({ 'chapter-1-area-01': ['chromatic'] }));
  await fireEvent.press(view.getByRole('button', { name: '一時停止' }));
  await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
  await fireEvent.press(view.getByRole('button', { name: '発見の記録' }));
  expect(view.getByText('・色の奥行き')).toBeTruthy();
  expect(view.queryByText('・明暗の対比')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '第一章のホームへ' }));
  await fireEvent.press(view.getByRole('button', { name: 'エリアを振り返る' }));
  await fireEvent.press(view.getByRole('button', { name: '閉館後の展示室を振り返る' }));
  await view.findByTestId('campaign-native-canvas');
  const replay = latest!;
  expect(replay.checkpoint?.progress.gallery?.discoveries.chromatic).toBe(false);
  const replayGallery = replay.checkpoint!.progress.gallery!;
  const replayObserved = { ...replay.checkpoint!, progress: { ...replay.checkpoint!.progress,
    gallery: { ...replayGallery, discoveries: { ...replayGallery.discoveries, shadow: true } } } };
  expect(recordCampaignReplayDiscoveries(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!),
    'chapter-1-area-01', replayObserved)).toMatchObject({ accepted: true, changed: true });
  await act(() => replay.onCheckpoint(replayObserved));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!))
    .toMatchObject({ currentArea: 'chapter-1-area-01', checkpoint: observed,
      discoveryHistory: { 'chapter-1-area-01': ['chromatic', 'shadow'] }, storyPresented: [] }));
  const invalidClear = { ...replay.checkpoint!, progress: { ...replay.checkpoint!.progress, cleared: true } };
  await act(() => {
    replay.onCheckpoint(invalidClear);
    replay.onComplete(chapterCompletionSummary(invalidClear.chapterId, invalidClear.progress));
  });
  expect(view.queryByText('閉館後の展示室を振り返った')).toBeNull();
  const clearedFixture = migrateGalleryV1Checkpoint(originalV1('cleared'))!.checkpoint;
  const clearedGallery = clearedFixture.progress.gallery!;
  const replayCleared = { ...clearedFixture, progress: { ...clearedFixture.progress,
    gallery: { ...clearedGallery, discoveries: { ...clearedGallery.discoveries, contour: true } } } };
  await act(() => {
    replay.onCheckpoint(replayCleared);
    replay.onComplete(chapterCompletionSummary(replayCleared.chapterId, replayCleared.progress));
  });
  expect(await view.findByText('閉館後の展示室を振り返った')).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!))
    .toMatchObject({ currentArea: 'chapter-1-area-01', checkpoint: observed,
      discoveryHistory: { 'chapter-1-area-01': ['chromatic', 'shadow', 'contour'] }, storyPresented: [] }));
  expect(mockCanvasOwners.active).toBe(0);
  const savedAfterReplay = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
  await act(() => replay.onCheckpoint(replayObserved));
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(savedAfterReplay);
});

test('old cleared gallery proposes an indoor area-02 entry without changing old bytes', async () => {
  const raw = JSON.stringify(originalV1('cleared'));
  await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, raw);
  const view = await render(<App />);
  expect(await view.findByRole('button', { name: '記録を引き継ぐ' })).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '記録を引き継ぐ' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('収蔵庫へ入る'));
  await view.findByTestId('campaign-native-canvas');
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!)).toMatchObject({
    currentArea: 'chapter-1-area-02', completedAreas: ['chapter-1-area-01'], migrationSource: 'legacy-prefix',
  }));
  expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(raw);
});

test('an out-of-order legacy vault record can be replayed to its exit without starting a campaign', async () => {
  const oldVault = JSON.stringify(vaultCheckpoint('clear'));
  await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, oldVault);
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  const view = await render(<App/>);
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBeNull();
  await fireEvent.press(await view.findByRole('button', { name: 'エリアを振り返る' }));
  expect(view.getAllByText('未到達')).toHaveLength(4);
  await fireEvent.press(view.getByRole('button', { name: '測れない収蔵庫を振り返る' }));
  await view.findByTestId('campaign-native-canvas');
  expect(latest!.chapterId).toBe('uncanny-vault-v1');
  const replay = latest!;
  const run = attachNaturalRun(mockLatestCanvas.current!.controller);
  let cleared: CheckpointState | undefined;
  await act(() => { cleared = playNaturalArea(run, 1, ['shadow', 'contour']); });
  expect(cleared?.progress.cleared).toBe(true);
  await act(() => {
    replay.onCheckpoint(cleared!);
    replay.onComplete(chapterCompletionSummary('uncanny-vault-v1', cleared!.progress));
  });
  expect(await view.findByText('測れない収蔵庫を振り返った')).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(STAGE_JOURNAL_KEY))!).history)
    .toMatchObject({ 'uncanny-vault-v1': { everCleared: true } }));
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(oldVault);
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBeNull();
  expect(mockCanvasOwners.active).toBe(0);
  await fireEvent.press(view.getByRole('button', { name: 'エリア一覧へ' }));
  expect(view.getAllByText('未到達')).toHaveLength(4);
  expect(view.getByRole('button', { name: '測れない収蔵庫を振り返る' })).toBeTruthy();
});

test('a mounted area-03 actor investigation fires and presents its equipment-noise story once', async () => {
  await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, JSON.stringify(originalV1('cleared')));
  await AsyncStorage.setItem('chroma-rift.uncanny-vault.v1', JSON.stringify(vaultCheckpoint('clear')));
  await AsyncStorage.setItem('chroma-rift.shadow-theatre.v1', JSON.stringify(theatreCheckpoint('light')));
  const view = await render(<App />);
  await fireEvent.press(await view.findByRole('button', { name: '記録を引き継ぐ' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('映写室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  const canvas = mockLatestCanvas.current!;
  const controller = canvas.controller;
  const bell = THEATRE_BELLS[0]!;
  const position = { x: bell.fixture.center.x + bell.fixture.normal.x * .65,
    y: 1.6, z: bell.fixture.center.z };
  const dx = bell.fixture.center.x - position.x, dz = bell.fixture.center.z - position.z;
  controller.runtime = { ...controller.runtime,
    pose: { position, yaw: Math.atan2(-dx, -dz),
      pitch: Math.atan2(bell.fixture.center.y - position.y, Math.hypot(dx, dz)) },
    progress: { ...controller.runtime.progress, theatre: { ...controller.runtime.progress.theatre!,
      story: { ...controller.runtime.progress.theatre!.story, crossingStarted: true } } },
    theatre: { ...controller.runtime.theatre!, actor: { ...controller.runtime.theatre!.actor, phase: 'patrol',
      motion: createActorMotion({ x: bell.receiver.x, y: 0, z: bell.receiver.z - .7 }, 0) } } };
  const camera = new PerspectiveCamera(65, 390 / 844, .08, 60);
  syncCamera(controller, camera);
  expect(interactController(controller, bell.instanceId)).toBe(true);
  expect(controller.runtime.theatre!.environmentNoise?.position).toEqual(bell.receiver);
  expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyFired).not.toContain('noise-route');
  await act(() => {
    advanceController(controller, 1 / 60, camera);
    canvas.onSnapshot(controllerSnapshot(controller));
  });
  expect(controller.runtime.theatre!.environmentNoise).toBeUndefined();
  expect(controller.runtime.theatre!.actor.phase).toBe('investigate');
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyFired)
    .toContain('noise-route'));
  expect(await view.findByText(CHAPTER_ONE_BEATS.find(beat => beat.id === 'noise-route')!.text)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '探索へ戻る' }));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyPresented)
    .toContain('noise-route'));
  await act(() => canvas.onSnapshot(controllerSnapshot(controller)));
  const saved = JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!);
  expect(saved.storyFired.filter((beat: string) => beat === 'noise-route')).toHaveLength(1);
  expect(saved.storyPresented.filter((beat: string) => beat === 'noise-route')).toHaveLength(1);
  await view.unmount();
});

test('unknown campaign raw requires explicit new-game choice and receives exact backup', async () => {
  const raw = '{"schemaVersion":99,"future":"retained"}';
  await AsyncStorage.setItem(CHAPTER_ONE_STORAGE_KEY, raw);
  const alert = jest.spyOn(Alert, 'alert');
  const view = await render(<App />);
  expect(await view.findByText(/以前のプレイ記録/)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '第一章をはじめる' }));
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(raw);
  await act(() => alert.mock.calls.at(-1)?.[2]?.find(button => button.text === '最初から始める')?.onPress?.());
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  expect(await AsyncStorage.getItem(CHAPTER_ONE_BACKUP_KEY)).toBe(raw);
  expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).currentArea).toBe('chapter-1-area-01');
});

test('verified area-03 through area-05 host callbacks survive a cold exit before the ending is shown', async () => {
  await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, JSON.stringify(originalV1('cleared')));
  const oldVault = JSON.stringify(vaultCheckpoint('clear'));
  const oldTheatre = JSON.stringify(theatreCheckpoint('initial'));
  await AsyncStorage.setItem('chroma-rift.uncanny-vault.v1', oldVault);
  await AsyncStorage.setItem('chroma-rift.shadow-theatre.v1', oldTheatre);
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  let view = await render(<App/>);
  await fireEvent.press(await view.findByRole('button', { name: '記録を引き継ぐ' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('映写室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  const theatreGate = latest!;
  expect(theatreGate.chapterId).toBe('shadow-theatre-v1');
  const theatreClear = theatreCheckpoint('completed');
  await act(() => {
    theatreGate.onCheckpoint(theatreClear);
    theatreGate.onComplete(chapterCompletionSummary('shadow-theatre-v1', theatreClear.progress));
  });
  await waitFor(async () => {
    expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!)).toMatchObject({
      currentArea: 'chapter-1-area-04', campaignCompleted: false,
    });
    expect(latest!.chapterId).toBe('mirror-corridor-v1');
  });
  await view.unmount();
  view = await render(<App/>);
  expect(await view.findByText(/エリア 04 \/ 05/)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '続きから' }));
  await fireEvent.press(view.getByText('鏡越しの回廊へ入る'));
  await view.findByTestId('campaign-native-canvas');
  const mirrorGate = latest!;
  expect(mirrorGate.chapterId).toBe('mirror-corridor-v1');
  const mirror = parseMirrorCheckpoint(mirrorGate.checkpoint!.stageData)!;
  const clearedMirror = { ...mirrorGate.checkpoint!, pose: EXIT,
    progress: { ...mirrorGate.checkpoint!.progress, cleared: true }, stageData: { ...mirror, keyTaken: true,
    practiced: true, ratchets: 3, gateCrossed: true, cleared: true, pose: EXIT } };
  await act(() => {
    mirrorGate.onCheckpoint(clearedMirror);
    mirrorGate.onComplete(chapterCompletionSummary('mirror-corridor-v1', { ...clearedMirror.progress, cleared: true }));
  });
  await waitFor(async () => {
    expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!)).toMatchObject({
      currentArea: 'chapter-1-area-05', keyLocation: 'carried', campaignCompleted: false,
    });
  });
  expect(await view.findByText(CHAPTER_ONE_COPY.faceClue)).toBeTruthy();
  expect(latest!.chapterId).toBe('mirror-corridor-v1');
  await view.unmount();
  view = await render(<App/>);
  expect(await view.findByText(/エリア 05 \/ 05/)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '続きから' }));
  await fireEvent.press(view.getByText('退館制御室へ入る'));
  expect(await view.findByText('顔と顔の間にも、輪郭がある。')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '探索へ戻る' }));
  await view.findByTestId('campaign-native-canvas');
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyPresented)
    .toContain('isolation-key'));
  const controlGate = latest!;
  expect(controlGate.checkpoint!.stageData).toMatchObject({keyAvailable:true,keyInstalled:false});
  const beforeStale = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
  await act(() => mirrorGate.onCheckpoint(mirrorGate.checkpoint!));
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(beforeStale);
  const control = parseDepartureCheckpoint(controlGate.checkpoint!.stageData)!;
  const stopped = { ...controlGate.checkpoint!, stageData: { ...control, keyAvailable: false,
    keyInstalled: true, procedureRead: true, isolated: true, stopped: true } };
  await act(() => controlGate.onCheckpoint(stopped));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!)).toMatchObject({
    keyLocation: 'installed', finale: {isolated:true,stopped:true,outdoorExited:false},
  }));
  const outdoor = { ...stopped, pose: OUTDOOR, progress: { ...stopped.progress, cleared: true }, stageData: { ...stopped.stageData,
    staffDoorOpened: true, cleared: true, pose: OUTDOOR } };
  const ending = jest.spyOn(endingModule, 'ChapterOneEndingScreen').mockImplementation(() => <></>);
  await act(() => {
    controlGate.onCheckpoint(outdoor);
    controlGate.onComplete(chapterCompletionSummary('departure-control-v1', { ...outdoor.progress, cleared: true }));
  });
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!)).toMatchObject({
    campaignCompleted: true, finale: { contained:true, isolated:true, stopped:true, outdoorExited:true },
  }));
  expect(ending).toHaveBeenCalled();
  const completedRaw = (await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!;
  const completed = JSON.parse(completedRaw);
  expect(completed.storyFired).toEqual(expect.arrayContaining(['attendance-identified', 'outdoor-exit']));
  expect(completed.storyPresented).not.toContain('attendance-identified');
  expect(completed.storyPresented).not.toContain('outdoor-exit');
  await view.unmount();
  ending.mockRestore();
  const resumed = await render(<App/>);
  expect(await resumed.findByRole('button', { name: 'エンディングを見る' })).toBeTruthy();
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(completedRaw);
  await fireEvent.press(resumed.getByRole('button', { name: 'エンディングを見る' }));
  const restoredCredits = await resumed.findByRole('button', { name: 'クレジットを表示' });
  await fireEvent(restoredCredits, 'pressIn');
  await fireEvent.press(restoredCredits);
  expect(await resumed.findByText(CHAPTER_ONE_COPY.containmentInstruction)).toBeTruthy();
  expect(await resumed.findByText(CHAPTER_ONE_COPY.attendanceIdentified)).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyPresented)
    .toEqual(expect.arrayContaining(['containment-bell', 'attendance-identified', 'outdoor-exit'])));
  expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!)).toMatchObject({
    runId: completed.runId, completedAreas: completed.completedAreas, campaignCompleted: true,
    finale: completed.finale,
  });
  expect(await AsyncStorage.getItem('chroma-rift.uncanny-vault.v1')).toBe(oldVault);
  expect(await AsyncStorage.getItem('chroma-rift.shadow-theatre.v1')).toBe(oldTheatre);
});

test('area-04 render retries and a cold home continue retain the accepted isolation key', async () => {
  await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, JSON.stringify(originalV1('cleared')));
  await AsyncStorage.setItem('chroma-rift.uncanny-vault.v1', JSON.stringify(vaultCheckpoint('clear')));
  await AsyncStorage.setItem('chroma-rift.shadow-theatre.v1', JSON.stringify(theatreCheckpoint('initial')));
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  let view = await render(<App/>);
  await fireEvent.press(await view.findByRole('button', { name: '記録を引き継ぐ' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('映写室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  const theatreClear = theatreCheckpoint('completed');
  await act(() => { latest!.onCheckpoint(theatreClear); latest!.onComplete(chapterCompletionSummary('shadow-theatre-v1', theatreClear.progress)); });
  await waitFor(() => expect(latest!.chapterId).toBe('mirror-corridor-v1'));
  const first = mockLatestCanvas.current!;
  const controller = first.controller, camera = new PerspectiveCamera(65, 390 / 844, .08, 60);
  controller.horrorIntensity = 'subdued';
  for (let frame = 0; frame < 90 && controller.runtime.pose.position.z < -1.05; frame += 1) {
    controller.input.forward = 1; advanceController(controller, 1 / 60, camera);
  }
  controller.input.forward = 0;
  expect(controller.runtime.pose.position.z).toBeGreaterThan(-1.1);
  const aimAt = (target: { x: number; y: number; z: number }) => {
    const pose = controller.runtime.pose, dx = target.x - pose.position.x,
      dy = target.y - pose.position.y, dz = target.z - pose.position.z;
    commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz) - pose.yaw,
      pitch: Math.atan2(dy, Math.hypot(dx, dz)) - pose.pitch });
    syncCamera(controller, camera);
  };
  aimAt(FIGURE_CENTER);
  expect(controllerSnapshot(controller).target?.id).toBe('mirror-corridor-figure');
  expect(interactController(controller, 'mirror-corridor-figure')).toBe(true);
  aimAt(KEY_CENTER);
  expect(controllerSnapshot(controller).target?.id).toBe('mirror-corridor-key');
  expect(interactController(controller, 'mirror-corridor-key')).toBe(true);
  await act(() => first.onSnapshot(controllerSnapshot(controller)));
  await waitFor(async () => expect(parseMirrorCheckpoint(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).checkpoint.stageData))
    .toMatchObject({ keyTaken: true, practiced: false, ratchets: 0 }));
  const savedBeforeFailure = await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY);
  recordFirstFailure(controller.diagnostics, new Error('TEST/FIXTURE: first native failure'), 'presentation', 'NATIVE_PRESENTATION');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const old = mockLatestCanvas.current!;
    await act(() => old.onError('部屋の描画を確認できませんでした。再試行するか、ホームへ戻ってください。'));
    if (attempt < 2) {
      await fireEvent.press(view.getByRole('button', { name: '表示を再試行' }));
      await waitFor(() => expect(mockLatestCanvas.current!.controller).not.toBe(old.controller));
      expect(mockLatestCanvas.current!.controller.runtime.stageSession?.value).toMatchObject({ keyTaken: true, practiced: false, ratchets: 0 });
      expect(mockCanvasOwners.peak).toBe(1);
    }
  }
  expect(view.getByRole('button', { name: '表示を再試行' })).toBeDisabled();
  await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
  expect(mockCanvasOwners.active).toBe(0);
  expect(recentFailureSnapshots()).toHaveLength(3);
  expect(view.queryByTestId('render-diagnostic-record')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '設定' }));
  await fireEvent.press(view.getByRole('button', { name: 'サポート' }));
  expect(view.queryByTestId('render-diagnostic-record')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '詳しい情報' }));
  expect(view.getByTestId('render-diagnostic-record').props.children).toContain('TEST/FIXTURE: first native failure');
  await fireEvent.press(view.getByRole('button', { name: '詳しい情報を閉じる' }));
  expect(view.queryByTestId('render-diagnostic-record')).toBeNull();
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(savedBeforeFailure);
  await view.unmount();
  view = await render(<App/>);
  await fireEvent.press(await view.findByRole('button', { name: '続きから' }));
  await fireEvent.press(view.getByText('鏡越しの回廊へ入る'));
  for (let i = 0; i < 3; i++) {
    const resume = view.queryByRole('button', { name: '探索へ戻る' }) ?? view.queryByRole('button', { name: '点検を続ける' });
    if (!resume) break;
    await fireEvent.press(resume);
  }
  await view.findByTestId('campaign-native-canvas');
  expect(mockLatestCanvas.current!.controller.runtime.stageSession?.value).toMatchObject({ keyTaken: true, practiced: false, ratchets: 0 });
  expect(mockCanvasOwners.active).toBe(1); expect(mockCanvasOwners.peak).toBe(1);
  await view.unmount();
  expect(mockCanvasOwners.active).toBe(0);
});

test('a failed area handoff keeps the old scene until an explicit save retry succeeds', async () => {
  await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, JSON.stringify(originalV1('cleared')));
  await AsyncStorage.setItem('chroma-rift.uncanny-vault.v1', JSON.stringify(vaultCheckpoint('clear')));
  await AsyncStorage.setItem('chroma-rift.shadow-theatre.v1', JSON.stringify(theatreCheckpoint('initial')));
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  const view = await render(<App/>);
  await fireEvent.press(await view.findByRole('button', { name: '記録を引き継ぐ' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('映写室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  const theatreGate = latest!;
  const original = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  let fail = true;
  jest.mocked(AsyncStorage.setItem).mockImplementation((key, raw) => {
    if (key === CHAPTER_ONE_STORAGE_KEY && JSON.parse(raw).currentArea === 'chapter-1-area-04' && fail)
      return Promise.reject(new Error('storage full'));
    return original(key, raw);
  });
  const clear = theatreCheckpoint('completed');
  await act(() => {
    theatreGate.onCheckpoint(clear);
    theatreGate.onComplete(chapterCompletionSummary('shadow-theatre-v1', clear.progress));
  });
  expect(await view.findByText('エリアの移動を保存できませんでした')).toBeTruthy();
  expect(latest!.chapterId).toBe('shadow-theatre-v1');
  expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).currentArea).toBe('chapter-1-area-03');
  fail = false;
  await fireEvent.press(view.getByRole('button', { name: '保存を再試行' }));
  await waitFor(async () => {
    expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).currentArea).toBe('chapter-1-area-04');
    expect(latest!.chapterId).toBe('mirror-corridor-v1');
  });
});

test.each(['retry', 'session-only'] as const)('an area story acknowledgement waits for %s before the next Canvas enters', async choice => {
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  const view = await render(<App/>);
  await fireEvent.press(await view.findByRole('button', { name: '第一章をはじめる' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  await act(() => latest!.onValidatedEntry?.(latest!.checkpoint!));
  await fireEvent.press(await view.findByRole('button', { name: '点検を続ける' }));
  const gate = latest!;
  const run = attachNaturalRun(mockLatestCanvas.current!.controller);
  let cleared: CheckpointState | undefined;
  await act(() => { cleared = playNaturalArea(run, 0, ['shadow', 'contour']); });
  const originalWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  let rejectAcknowledgement = true;
  jest.mocked(AsyncStorage.setItem).mockImplementation((key, raw) =>
    key === CHAPTER_ONE_STORAGE_KEY && JSON.parse(raw).storyPresented.includes('emergency-circuit') && rejectAcknowledgement
      ? Promise.reject(new Error('storage full')) : originalWrite(key, raw));
  await act(() => {
    gate.onCheckpoint(cleared!);
    gate.onComplete(chapterCompletionSummary('perception-gallery-v1', cleared!.progress));
  });
  expect(await view.findByText('非常回路が戻った。収蔵庫の職員通路へ進む。')).toBeTruthy();
  expect(latest!.chapterId).toBe('perception-gallery-v1');
  expect(mockCanvasOwners.active).toBe(1);
  const before = (await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!;
  expect(JSON.parse(before)).toMatchObject({ currentArea: 'chapter-1-area-02', storyPresented: ['closing-interrupted'] });
  const acknowledge = view.getByRole('button', { name: '点検を続ける' });
  await fireEvent.press(acknowledge);
  expect(await view.findByText('エリアの移動を保存できませんでした')).toBeTruthy();
  expect(latest!.chapterId).toBe('perception-gallery-v1');
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(before);
  const writesAfterFailure = jest.mocked(AsyncStorage.setItem).mock.calls.length;
  await fireEvent.press(acknowledge);
  expect(jest.mocked(AsyncStorage.setItem).mock.calls.length).toBe(writesAfterFailure);
  if (choice === 'retry') {
    rejectAcknowledgement = false;
    await fireEvent.press(view.getByRole('button', { name: '保存を再試行' }));
    await waitFor(async () => {
      expect(latest!.chapterId).toBe('uncanny-vault-v1');
      expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyPresented)
        .toContain('emergency-circuit');
    });
  } else {
    await fireEvent.press(view.getByRole('button', { name: 'この起動中だけ続ける' }));
    await waitFor(() => expect(latest!.chapterId).toBe('uncanny-vault-v1'));
    expect(view.getByText(/この起動中だけ進行しています/)).toBeTruthy();
    expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(before);
  }
  expect(mockCanvasOwners.peak).toBe(1);
});

test.each(['retry', 'session-only'] as const)('a failed checkpoint save pauses play and allows %s without claiming it was saved', async choice => {
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  const view = await render(<App/>);
  await fireEvent.press(await view.findByRole('button', { name: '第一章をはじめる' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  const controller = mockLatestCanvas.current!.controller;
  const originalRaw = (await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!;
  const originalWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  let rejectCampaignWrite = true;
  jest.mocked(AsyncStorage.setItem).mockImplementation((key, raw) =>
    key === CHAPTER_ONE_STORAGE_KEY && rejectCampaignWrite ? Promise.reject(new Error('storage full')) : originalWrite(key, raw));
  controller.runtime = recordGalleryDiscovery(controller.runtime, 'chromatic');
  await act(() => latest!.onCheckpoint(createCheckpoint(controller.runtime)));
  expect(await view.findByText('進行を保存できませんでした')).toBeTruthy();
  await waitFor(() => expect(controller.runtime.paused).toBe(true));
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(originalRaw);
  if (choice === 'retry') {
    await fireEvent.press(view.getByRole('button', { name: '保存を再試行' }));
    expect(await view.findByText('進行を保存できませんでした')).toBeTruthy();
    expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(originalRaw);
    rejectCampaignWrite = false;
    await fireEvent.press(view.getByRole('button', { name: '保存を再試行' }));
    await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).discoveryHistory)
      .toEqual({ 'chapter-1-area-01': ['chromatic'] }));
    expect(view.queryByText('進行を保存できませんでした')).toBeNull();
    await fireEvent.press(view.getByRole('button', { name: '再開する' }));
    expect(controller.runtime.paused).toBe(false);
  } else {
    await fireEvent.press(view.getByRole('button', { name: 'この起動中だけ続ける' }));
    expect(view.getByText(/この起動中だけ進行しています/)).toBeTruthy();
    expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(originalRaw);
    await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
    await fireEvent.press(view.getByRole('button', { name: '発見の記録' }));
    expect(view.getByText('・色の奥行き')).toBeTruthy();
    expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(originalRaw);
  }
  jest.mocked(AsyncStorage.setItem).mockImplementation(originalWrite);
});

test('a checkpoint write failure still reaches the home screen after the playing view exits', async () => {
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  const view = await render(<App/>);
  await fireEvent.press(await view.findByRole('button', { name: '第一章をはじめる' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  const controller = mockLatestCanvas.current!.controller;
  const originalRaw = (await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!;
  const originalWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  let rejectCampaignWrite = true;
  jest.mocked(AsyncStorage.setItem).mockImplementation((key, raw) =>
    key === CHAPTER_ONE_STORAGE_KEY && rejectCampaignWrite ? Promise.reject(new Error('storage full')) : originalWrite(key, raw));
  controller.runtime = recordGalleryDiscovery(controller.runtime, 'chromatic');
  await act(() => {
    latest!.onCheckpoint(createCheckpoint(controller.runtime));
    latest!.onExit();
  });
  expect(await view.findByText('進行を保存できませんでした')).toBeTruthy();
  expect(mockCanvasOwners.active).toBe(0);
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(originalRaw);
  rejectCampaignWrite = false;
  await fireEvent.press(view.getByRole('button', { name: '保存を再試行' }));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).discoveryHistory)
    .toEqual({ 'chapter-1-area-01': ['chromatic'] }));
  expect(view.getByText('最後の退館者')).toBeTruthy();
  jest.mocked(AsyncStorage.setItem).mockImplementation(originalWrite);
});

test('an unacknowledged opening beat survives a failed presentation write and an explicit retry', async () => {
  const Gate = gateModule.NativeFirstPersonGate;
  let latest: FirstPersonScreenProps | undefined;
  jest.spyOn(gateModule, 'NativeFirstPersonGate').mockImplementation(props => { latest = props; return <Gate {...props}/>; });
  const view = await render(<App/>);
  await fireEvent.press(await view.findByRole('button', { name: '第一章をはじめる' }));
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  await act(() => latest!.onValidatedEntry?.(latest!.checkpoint!));
  expect(await view.findByText(CHAPTER_ONE_COPY.openingThought)).toBeTruthy();
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyFired)
    .toContain('closing-interrupted'));
  const originalWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  let rejectCampaignWrite = true;
  jest.mocked(AsyncStorage.setItem).mockImplementation((key, raw) =>
    key === CHAPTER_ONE_STORAGE_KEY && rejectCampaignWrite ? Promise.reject(new Error('storage full')) : originalWrite(key, raw));
  await fireEvent.press(view.getByRole('button', { name: '点検を続ける' }));
  expect(await view.findByText('進行を保存できませんでした')).toBeTruthy();
  expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyPresented).not.toContain('closing-interrupted');
  rejectCampaignWrite = false;
  await fireEvent.press(view.getByRole('button', { name: '保存を再試行' }));
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).storyPresented)
    .toContain('closing-interrupted'));
  expect(view.queryByText('進行を保存できませんでした')).toBeNull();
  jest.mocked(AsyncStorage.setItem).mockImplementation(originalWrite);
});
