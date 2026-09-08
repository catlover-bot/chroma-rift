import { fireEvent, render } from '@testing-library/react-native';
import { requireOptionalNativeModule } from 'expo';
import { Alert } from 'react-native';
import { chapterCompletionSummary } from '../../app/chapterSummary';
import { createGalleryRuntime, migrateGalleryV2Checkpoint } from '../../domain/gallery';
import { originalV2 } from '../../storage/testFixtures/galleryV2';
import { DEFAULT_SETTINGS } from '../../types/application';
import { SettingsScreen } from '../SettingsScreen';
import { FirstPersonResultScreen } from '../FirstPersonResultScreen';
import { WelcomeScreen } from '../WelcomeScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: jest.fn(() => null) }));

it('keeps new gallery and old chapter actions distinct and presents saved gallery progress', async () => {
  const gallery = jest.fn(), old = jest.fn();
  const view = await render(<WelcomeScreen hasSetup onPlay={gallery} onSkip={jest.fn()} onSettings={jest.fn()}
    onLegacyContinue={old} legacySaved gallerySaved galleryPowerCount={1} />);
  expect(view.getByText('予備電源 1 / 2')).toBeTruthy();
  await fireEvent.press(view.getByText('展示室の続きから')); expect(gallery).toHaveBeenCalledTimes(1); expect(old).not.toHaveBeenCalled();
  await fireEvent.press(view.getByText('旧章の続きから')); expect(old).toHaveBeenCalledTimes(1);
});

it('adjusts independent audio preferences without changing visual or accessibility settings', async () => {
  const onChange = jest.fn();
  const view = await render(<SettingsScreen settings={DEFAULT_SETTINGS} onChange={onChange} onRecalibrate={jest.fn()}
    onQuickSetup={jest.fn()} onReset={jest.fn()} onBack={jest.fn()} />);
  expect(requireOptionalNativeModule).toHaveBeenCalledWith('ExpoAudio');
  expect(view.getAllByText(/音の再生には新しいDevelopment Build/)).toHaveLength(1);
  await fireEvent(view.getByRole('switch', { name: 'サウンド' }), 'valueChange', false);
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, enabled: false } });
  await fireEvent.press(view.getByText('環境音 25%'));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, musicVolume: 0.25 } });
  await fireEvent(view.getByRole('switch', { name: '演出音' }), 'valueChange', false);
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, illusionEnabled: false } });
  await fireEvent.press(view.getByText('効果音 0%'));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, effectsVolume: 0 } });
});

it('makes current-chapter and full-data reset scope explicit before either action', async () => {
  const alert = jest.spyOn(Alert, 'alert'), current = jest.fn(), all = jest.fn();
  const view = await render(<SettingsScreen settings={DEFAULT_SETTINGS} onChange={jest.fn()} onRecalibrate={jest.fn()}
    onQuickSetup={jest.fn()} onReset={all} onResetChapter={current} currentChapterName="閉館後の展示室" onBack={jest.fn()} />);
  await fireEvent.press(view.getByText('閉館後の展示室だけを最初から'));
  expect(alert.mock.calls.at(-1)?.[1]).toContain('他の章、表示と音の設定、調整結果は残ります');
  expect(current).not.toHaveBeenCalled(); expect(all).not.toHaveBeenCalled();
  alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'この章だけリセット')?.onPress?.();
  expect(current).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByText('保存データをリセット'));
  expect(alert.mock.calls.at(-1)?.[1]).toContain('旧章と展示室の進行、音の設定');
  alert.mockRestore();
});

it('shows the revised power-and-exit discoveries for gallery completion while preserving the old result and optional new chapter action', async () => {
  const mechanisms = ['影の見本', '描かれていない形', '二つの予備電源', '非常扉からの脱出'];
  const view = await render(<FirstPersonResultScreen summary={{ chapterId: 'perception-gallery-v1', powerCount: 2, chapterVersion: 3, discoveredMechanisms: mechanisms }} onReplay={jest.fn()} onHome={jest.fn()} />);
  expect(view.getByText('閉館後の展示室から脱出')).toBeTruthy();
  mechanisms.forEach(name => expect(view.getByText(name)).toBeTruthy());
  expect(view.getByText('展示室を最初から遊ぶ')).toBeTruthy();
  const newGallery = jest.fn();
  await view.rerender(<FirstPersonResultScreen summary={{ chapterId: 'returnless-entrance', seals: 2, discoveredMechanisms: ['紋章', '鍵'] }} onReplay={jest.fn()} onHome={jest.fn()} onNewGallery={newGallery} />);
  expect(view.getByText('帰り道のない入口から脱出')).toBeTruthy();
  await fireEvent(view.getByRole('button', { name: '新しい展示室を始める' }), 'accessibilityAction', { nativeEvent: { actionName: 'activate' } });
  expect(newGallery).toHaveBeenCalledTimes(1);
});


it('keeps horror intensity independent from sound, motion, colors and input preferences', async () => {
  const onChange = jest.fn(), settings = { ...DEFAULT_SETTINGS, reducedMotion: true, audio: { enabled: false, musicVolume: .1, effectsVolume: .2 } };
  const view = await render(<SettingsScreen settings={settings} onChange={onChange} onRecalibrate={jest.fn()} onQuickSetup={jest.fn()} onReset={jest.fn()} onBack={jest.fn()} />);
  await fireEvent.press(view.getByRole('button', { name: '控えめな怖さ' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...settings, horrorIntensity: 'subdued' });
  await fireEvent.press(view.getByRole('button', { name: '標準の怖さ' }));
  expect(onChange).toHaveBeenLastCalledWith({ ...settings, horrorIntensity: 'standard' });
});

it('preserves an old cleared gallery result without claiming the player experienced the revised route', async () => {
  const view = await render(<FirstPersonResultScreen summary={{ chapterId: 'perception-gallery-v1', chapterVersion: 3, powerCount: 2, migratedCompletion: true, discoveredMechanisms: [] }} onReplay={jest.fn()} onHome={jest.fn()} />);
  expect(view.getByText('展示室のクリア記録')).toBeTruthy();
  expect(view.getByText(/以前の展示室のクリア記録を保持/)).toBeTruthy();
  expect(view.queryByText('触れない紋章')).toBeNull(); expect(view.queryByText('重なる鍵')).toBeNull();
  expect(view.queryByText(/サービス通路の先の非常扉から外へ出ました/)).toBeNull();
  expect(view.getByRole('button', { name: '展示室を最初から遊ぶ' })).toBeEnabled();
});


it('provides offline credits for the actual CC BY face without revealing undiscovered notebook entries', async () => {
  const view = await render(<SettingsScreen settings={DEFAULT_SETTINGS} onChange={jest.fn()} onRecalibrate={jest.fn()} onQuickSetup={jest.fn()} onReset={jest.fn()} onBack={jest.fn()} />);
  await fireEvent.press(view.getByRole('button', { name: '出典と素材クレジット' }));
  expect(view.getByText(/Hollow face illusion.stl \/ Wael Tsar/)).toBeTruthy();
  expect(view.getByText('https://creativecommons.org/licenses/by/4.0/')).toBeTruthy();
  expect(view.queryByRole('button', { name: '隠れた配線' })).toBeNull();
});

it('does not claim a bypassed migration wiring puzzle was experienced when the revised ending is completed', async () => {
  const runtime = createGalleryRuntime(migrateGalleryV2Checkpoint(originalV2('connected'))!.checkpoint);
  runtime.progress.cleared = true; runtime.progress.gallery!.finalDoorClosed = true; runtime.progress.gallery!.story.resolved = true;
  const summary = chapterCompletionSummary('perception-gallery-v1', runtime.progress);
  expect(summary.migratedCompletion).toBe(false); expect(summary.discoveredMechanisms).not.toContain('隠れた配線');
  const view = await render(<FirstPersonResultScreen summary={summary} onReplay={jest.fn()} onHome={jest.fn()} />);
  expect(view.getByText('最後の扉を閉めて、展示室から脱出しました。')).toBeTruthy(); expect(view.queryByText('隠れた配線')).toBeNull();
  const fresh = createGalleryRuntime(); fresh.progress.gallery!.wiring.solved = true; fresh.progress.gallery!.discoveries.wiring = true;
  expect(chapterCompletionSummary('perception-gallery-v1', fresh.progress).discoveredMechanisms).toContain('隠れた配線');
});
