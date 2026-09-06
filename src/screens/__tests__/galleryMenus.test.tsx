import { fireEvent, render } from '@testing-library/react-native';
import { requireOptionalNativeModule } from 'expo';
import { Alert } from 'react-native';
import { DEFAULT_SETTINGS } from '../../types/application';
import { SettingsScreen } from '../SettingsScreen';
import { FirstPersonResultScreen } from '../FirstPersonResultScreen';
import { WelcomeScreen } from '../WelcomeScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ ...jest.requireActual('expo'), requireOptionalNativeModule: jest.fn(() => null) }));

it('keeps new gallery and old chapter actions distinct and presents saved gallery progress', async () => {
  const gallery = jest.fn(), old = jest.fn();
  const view = await render(<WelcomeScreen hasSetup onPlay={gallery} onSkip={jest.fn()} onSettings={jest.fn()}
    onLegacyContinue={old} legacySaved gallerySaved gallerySolved={3} />);
  expect(view.getByText('展示室の封印 3 / 4')).toBeTruthy();
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
  await fireEvent.press(view.getByText('効果音 0%'));
  expect(onChange).toHaveBeenLastCalledWith({ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio, effectsVolume: 0 } });
});

it('makes current-chapter and full-data reset scope explicit before either action', async () => {
  const alert = jest.spyOn(Alert, 'alert'), current = jest.fn(), all = jest.fn();
  const view = await render(<SettingsScreen settings={DEFAULT_SETTINGS} onChange={jest.fn()} onRecalibrate={jest.fn()}
    onQuickSetup={jest.fn()} onReset={all} onResetChapter={current} currentChapterName="不確かな展示室" onBack={jest.fn()} />);
  await fireEvent.press(view.getByText('不確かな展示室だけを最初から'));
  expect(alert.mock.calls.at(-1)?.[1]).toContain('他の章、表示と音の設定、調整結果は残ります');
  expect(current).not.toHaveBeenCalled(); expect(all).not.toHaveBeenCalled();
  alert.mock.calls.at(-1)?.[2]?.find(button => button.text === 'この章だけリセット')?.onPress?.();
  expect(current).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByText('保存データをリセット'));
  expect(alert.mock.calls.at(-1)?.[1]).toContain('旧章と展示室の進行、音の設定');
  alert.mockRestore();
});

it('shows four discoveries for gallery completion while preserving the old result and optional new chapter action', async () => {
  const mechanisms = ['触れない紋章', '影の見本', '描かれていない形', '重なる鍵'];
  const view = await render(<FirstPersonResultScreen summary={{ chapterId: 'perception-gallery-v1', seals: 4, discoveredMechanisms: mechanisms }} onReplay={jest.fn()} onHome={jest.fn()} />);
  expect(view.getByText('展示室の、その先へ')).toBeTruthy();
  mechanisms.forEach(name => expect(view.getByText(name)).toBeTruthy());
  expect(view.getByText('展示室を最初から遊ぶ')).toBeTruthy();
  const newGallery = jest.fn();
  await view.rerender(<FirstPersonResultScreen summary={{ chapterId: 'returnless-entrance', seals: 2, discoveredMechanisms: ['紋章', '鍵'] }} onReplay={jest.fn()} onHome={jest.fn()} onNewGallery={newGallery} />);
  expect(view.getByText('帰り道のない入口から脱出')).toBeTruthy();
  await fireEvent.press(view.getByText('新しい展示室を始める'));
  expect(newGallery).toHaveBeenCalledTimes(1);
});
