import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo, Alert } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import * as gateModule from '../NativeFirstPersonGate';
import App from '../../../App';
import { createCheckpoint } from '../../domain/firstPerson';
import { createGalleryRuntime } from '../../domain/gallery';
import { skipQuickSetup } from '../../domain/calibration/quickSetup';
import { vaultCheckpoint } from '../../storage/testFixtures/vault';
import { APPLICATION_STORAGE_KEY, createDefaultApplication } from '../../storage/applicationStorage';
import { FIRST_PERSON_CONTROLS_KEY, FIRST_PERSON_ONBOARDING_KEY, GALLERY_CHECKPOINT_KEY, VAULT_CHECKPOINT_KEY, STAGE_JOURNAL_KEY, resetAllApplicationStorage } from '../../storage/firstPersonStorage';
import { FirstPersonCanvas, type FirstPersonCanvasProps } from '../../rendering/firstPerson/FirstPersonCanvas';
import { DEFAULT_FIRST_PERSON_ONBOARDING } from '../../types/application';

let mockReady = true;
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: jest.fn(() => ({})) }));
jest.mock('../../rendering/firstPerson/FirstPersonCanvas', () => ({ FirstPersonCanvas: jest.fn((props: FirstPersonCanvasProps) => {
  const React = require('react'), { PerspectiveCamera } = require('three');
  const { syncCamera } = require('../../rendering/firstPerson/runtimeController');
  const onReady = React.useRef(props.onReady);
  React.useEffect(() => {
    if (!mockReady) return;
    syncCamera(props.controller, new PerspectiveCamera(65, 390 / 844, .08, 60));
    Object.assign(props.controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true });
    onReady.current();
  }, [props.controller, PerspectiveCamera, syncCamera]);
  return React.createElement(require('react-native').View, { testID: 'native-stage-canvas' });
}) }));
const scene = () => jest.mocked(FirstPersonCanvas).mock.calls.at(-1)![0];
const readJournal = async () => JSON.parse((await AsyncStorage.getItem(STAGE_JOURNAL_KEY)) ?? '{"recentEntries":[],"history":{}}');
async function home(view: Awaited<ReturnType<typeof render>>) {
  await fireEvent.press(view.getByTestId('pause-control')); await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' }));
}
beforeEach(async () => {
  await resetAllApplicationStorage(); jest.clearAllMocks(); mockReady = true;
  jest.mocked(requireOptionalNativeModule).mockReturnValue({} as ReturnType<typeof requireOptionalNativeModule>);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  const app = createDefaultApplication(); app.quickSetupResult = skipQuickSetup('2026-09-09T00:00:00Z');
  await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, JSON.stringify(app));
  await AsyncStorage.setItem(FIRST_PERSON_ONBOARDING_KEY, JSON.stringify({ ...DEFAULT_FIRST_PERSON_ONBOARDING, tutorialCompleted: true, controlChoiceAcknowledged: true }));
});
afterEach(() => jest.restoreAllMocks());

it('does not invent a most recent old save, then records only validated entries and resumes the last actual chapter', async () => {
  await AsyncStorage.setItem(GALLERY_CHECKPOINT_KEY, JSON.stringify(createCheckpoint(createGalleryRuntime())));
  await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, JSON.stringify(vaultCheckpoint('length')));
  const view = await render(<App />);
  await view.findByTestId('select-uncanny-vault-v1');
  expect(view.queryByTestId('resume-last-stage')).toBeNull();
  expect((await readJournal()).recentEntries).toEqual([]);
  await fireEvent.press(view.getByTestId('select-uncanny-vault-v1'));
  expect((await readJournal()).recentEntries).toEqual([]);
  await fireEvent.press(view.getByText('ホームへ戻る'));
  expect((await readJournal()).recentEntries).toEqual([]);
  await fireEvent.press(view.getByTestId('select-uncanny-vault-v1'));
  await fireEvent.press(view.getByText('収蔵庫へ入る'));
  await waitFor(async () => expect((await readJournal()).recentEntries).toEqual(['uncanny-vault-v1']));
  const old = scene();
  await home(view);
  expect(view.getByText('前回の続き：測れない収蔵庫')).toBeTruthy();
  await fireEvent.press(view.getByTestId('select-perception-gallery-v1')); await fireEvent.press(view.getByText('展示室へ入る'));
  await waitFor(async () => expect((await readJournal()).recentEntries).toEqual(['perception-gallery-v1', 'uncanny-vault-v1']));
  await act(() => old.onReady());
  expect((await readJournal()).recentEntries[0]).toBe('perception-gallery-v1');
  await home(view); await fireEvent.press(view.getByTestId('resume-last-stage'));
  await fireEvent.press(view.getByText('展示室へ入る'));
  expect(scene().controller.runtime.chapterId).toBe('perception-gallery-v1');
});

it('does not record missing-native, failed-ready, or protected-save trial as a resumable entry', async () => {
  jest.mocked(requireOptionalNativeModule).mockReturnValue(null);
  const view = await render(<App />); await fireEvent.press(await view.findByTestId('select-uncanny-vault-v1'));
  await fireEvent.press(view.getByText('収蔵庫へ入る')); await view.findByText('3D対応の開発版が必要です');
  expect((await readJournal()).recentEntries).toEqual([]); await view.unmount();
  jest.mocked(requireOptionalNativeModule).mockReturnValue({} as ReturnType<typeof requireOptionalNativeModule>);
  mockReady = false;
  const notReady = await render(<App />); await fireEvent.press(await notReady.findByTestId('select-uncanny-vault-v1'));
  await fireEvent.press(notReady.getByText('収蔵庫へ入る')); await notReady.findByTestId('native-stage-canvas');
  expect((await readJournal()).recentEntries).toEqual([]); await notReady.unmount();
  const raw = '{"schemaVersion":99,"future":"untouched"}'; await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, raw); mockReady = true;
  const trial = await render(<App />); await fireEvent.press(await trial.findByTestId('select-uncanny-vault-v1'));
  await fireEvent.press(trial.getByText('収蔵庫へ入る')); await trial.findByTestId('native-stage-canvas');
  expect((await readJournal()).recentEntries).toEqual([]); expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(raw);
});

it('requires replay confirmation, preserves history and other saves, and does not record result-only viewing', async () => {
  const old = vaultCheckpoint('clear'); old.progress.vault!.discoveries.length = true;
  const raw = JSON.stringify(old), gallery = JSON.stringify(createCheckpoint(createGalleryRuntime()));
  await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, raw); await AsyncStorage.setItem(GALLERY_CHECKPOINT_KEY, gallery);
  const alert = jest.spyOn(Alert, 'alert'), view = await render(<App />);
  await fireEvent.press(await view.findByTestId('select-uncanny-vault-v1'));
  expect(alert.mock.calls.at(-1)?.[1]).toContain('過去の脱出・発見');
  expect(view.queryByText('収蔵庫へ入る')).toBeNull(); expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(raw);
  await fireEvent.press(view.getByTestId('review-uncanny-vault-v1')); await fireEvent.press(view.getByText('収蔵庫へ入る'));
  expect(view.queryByTestId('native-stage-canvas')).toBeNull();
  expect((await readJournal()).recentEntries).toEqual([]);
  await fireEvent(view.getByRole('button', { name: 'ホームへ戻る' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  await fireEvent.press(view.getByTestId('select-uncanny-vault-v1'));
  await act(() => alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'もう一度遊ぶ')?.onPress?.());
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(raw);
  await fireEvent.press(view.getByText('収蔵庫へ入る')); await view.findByTestId('native-stage-canvas');
  expect(scene().controller.runtime.progress.cleared).toBe(false);
  expect((await readJournal()).history['uncanny-vault-v1']).toEqual({ everCleared: true, discoveries: ['length'] });
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(gallery);
});

it('changes shared input preferences before entry and returns to preparation without changing progress or calibration', async () => {
  const view = await render(<App />); await fireEvent.press(await view.findByTestId('select-uncanny-vault-v1'));
  const before = await AsyncStorage.getItem(APPLICATION_STORAGE_KEY);
  await fireEvent.press(view.getByText('怖さ・音・見え方・操作の設定'));
  await fireEvent.press(view.getByText('左手で見回す'));
  await fireEvent(view.getByRole('switch', { name: '簡単なボタン操作' }), 'valueChange', true);
  await fireEvent.press(view.getByText('入場前の準備へ戻る'));
  expect(view.getByText('歩く・向くボタンで、少しずつ進もう。')).toBeTruthy();
  await fireEvent.press(view.getByText('収蔵庫へ入る')); await view.findByTestId('native-stage-canvas');
  expect(view.getByTestId('step-forward')).toBeEnabled(); expect(view.queryByTestId('touch-controls')).toBeNull();
  expect(JSON.parse((await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY))!).controls).toMatchObject({ handedness: 'left', movementMode: 'simple' });
  expect(JSON.parse((await AsyncStorage.getItem(APPLICATION_STORAGE_KEY))!).quickSetupResult).toEqual(JSON.parse(before!).quickSetupResult);
  expect(scene().controller.runtime.progress.vault!.length.solved).toBe(false);
});

it('links a preserved vault result to the independent theatre without repeating shared calibration', async () => {
  const raw = JSON.stringify(vaultCheckpoint('clear'));
  await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, raw);
  const view = await render(<App />);
  await fireEvent.press(await view.findByTestId('review-uncanny-vault-v1')); await fireEvent.press(view.getByText('収蔵庫へ入る'));
  const next = view.getByRole('button', { name: '次の章へ：影の映写室' });
  await fireEvent.press(next);
  expect(view.queryByText('映写室へ入る')).toBeNull();
  await fireEvent(next, 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(view.queryByText('同じ・分かりにくい')).toBeNull();
  await fireEvent.press(view.getByText('映写室へ入る')); await view.findByTestId('native-stage-canvas');
  expect(scene().controller.runtime.chapterId).toBe('shadow-theatre-v1');
  expect(scene().controller.runtime.progress.theatre!.light.accepted).toBe(false);
  await waitFor(async () => expect((await readJournal()).recentEntries[0]).toBe('shadow-theatre-v1'));
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(raw);
  await home(view);
  expect(view.getByText('前回の続き：影の映写室')).toBeTruthy();
});


it('rejects an old validated-entry callback after returning home and a canceled replay confirmation', async () => {
  mockReady = false;
  const gate = jest.spyOn(gateModule, 'NativeFirstPersonGate'), view = await render(<App />);
  await fireEvent.press(await view.findByTestId('select-uncanny-vault-v1')); await fireEvent.press(view.getByText('収蔵庫へ入る'));
  await view.findByTestId('native-stage-canvas'); const oldEntry = gate.mock.calls.at(-1)![0].onValidatedEntry!;
  await home(view);
  await act(() => oldEntry(vaultCheckpoint()));
  expect((await readJournal()).recentEntries).toEqual([]);
  await view.unmount();
  await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, JSON.stringify(vaultCheckpoint('clear')));
  const alert = jest.spyOn(Alert, 'alert'), cleared = await render(<App />);
  await fireEvent.press(await cleared.findByTestId('select-uncanny-vault-v1'));
  const buttons = alert.mock.calls.at(-1)![2]!, accept = buttons.find(button => button.text === 'もう一度遊ぶ')!.onPress!;
  await act(() => buttons.find(button => button.text === 'キャンセル')!.onPress?.());
  await act(() => accept());
  expect(cleared.queryByText('収蔵庫へ入る')).toBeNull(); expect((await readJournal()).recentEntries).toEqual([]);
});
