import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

import App from '../../../App';
import { CHAPTER_ONE_BACKUP_KEY, CHAPTER_ONE_STORAGE_KEY } from '../../storage/chapterOneStorage';
import { GALLERY_CHECKPOINT_KEY, GALLERY_V1_CHECKPOINT_KEY, resetAllApplicationStorage } from '../../storage/firstPersonStorage';
import { originalV1 } from '../../storage/testFixtures/galleryV1';
import { vaultCheckpoint } from '../../storage/testFixtures/vault';
import { theatreCheckpoint } from '../../storage/testFixtures/theatre';
import { chapterCompletionSummary } from '../../app/chapterSummary';
import { EXIT } from '../../domain/stages/mirror-corridor-v1/definition';
import { OUTDOOR } from '../../domain/stages/departure-control-v1/definition';
import { parseStageCheckpoint as parseMirrorCheckpoint } from '../../domain/stages/mirror-corridor-v1/checkpoint';
import { parseStageCheckpoint as parseDepartureCheckpoint } from '../../domain/stages/departure-control-v1/checkpoint';
import { recordCampaignReplayDiscoveries } from '../../domain/campaign/session';
import type { FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import type { FirstPersonScreenProps } from '../FirstPersonScreen';
import * as gateModule from '../NativeFirstPersonGate';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: jest.fn(() => ({})) }));
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { FirstPersonCanvas: (props: FirstPersonCanvasProps) => {
    const initialReady = React.useRef(props.onReady);
    React.useEffect(() => {
      Object.assign(props.controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true });
      initialReady.current();
    }, [props.controller]);
    return React.createElement(View, { testID: 'campaign-native-canvas' });
  } };
});

beforeEach(async () => {
  await resetAllApplicationStorage();
  jest.mocked(requireOptionalNativeModule).mockReturnValue({} as ReturnType<typeof requireOptionalNativeModule>);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

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

test('unknown campaign raw requires explicit new-game choice and receives exact backup', async () => {
  const raw = '{"schemaVersion":99,"future":"retained"}';
  await AsyncStorage.setItem(CHAPTER_ONE_STORAGE_KEY, raw);
  const alert = jest.spyOn(Alert, 'alert');
  const view = await render(<App />);
  expect(await view.findByText(/原文を保持/)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '第一章をはじめる' }));
  expect(await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY)).toBe(raw);
  await act(() => alert.mock.calls.at(-1)?.[2]?.find(button => button.text === '最初から始める')?.onPress?.());
  await fireEvent.press(view.getByText('あとで調整して遊ぶ'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  await view.findByTestId('campaign-native-canvas');
  expect(await AsyncStorage.getItem(CHAPTER_ONE_BACKUP_KEY)).toBe(raw);
  expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!).currentArea).toBe('chapter-1-area-01');
});

test('verified area-03 through area-05 host callbacks commit each handoff before mounting the next scene', async () => {
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
    practiced: true, ratchets: 3, cleared: true, pose: EXIT } };
  await act(() => {
    mirrorGate.onCheckpoint(clearedMirror);
    mirrorGate.onComplete(chapterCompletionSummary('mirror-corridor-v1', { ...clearedMirror.progress, cleared: true }));
  });
  await waitFor(async () => {
    expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!)).toMatchObject({
      currentArea: 'chapter-1-area-05', keyLocation: 'carried', campaignCompleted: false,
    });
    expect(latest!.chapterId).toBe('departure-control-v1');
  });
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
  await act(() => {
    controlGate.onCheckpoint(outdoor);
    controlGate.onComplete(chapterCompletionSummary('departure-control-v1', { ...outdoor.progress, cleared: true }));
  });
  await waitFor(async () => expect(JSON.parse((await AsyncStorage.getItem(CHAPTER_ONE_STORAGE_KEY))!)).toMatchObject({
    campaignCompleted: true, finale: { contained:true, isolated:true, stopped:true, outdoorExited:true },
  }));
  expect(await view.findByText('第一章「最後の退館者」 完')).toBeTruthy();
  await view.unmount();
  const resumed = await render(<App/>);
  expect(await resumed.findByRole('button', { name: 'エンディングを見る' })).toBeTruthy();
  expect(await AsyncStorage.getItem('chroma-rift.uncanny-vault.v1')).toBe(oldVault);
  expect(await AsyncStorage.getItem('chroma-rift.shadow-theatre.v1')).toBe(oldTheatre);
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
