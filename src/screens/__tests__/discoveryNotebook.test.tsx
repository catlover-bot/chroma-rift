import { act, fireEvent, render, within } from '@testing-library/react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Dimensions, StyleSheet } from 'react-native';
import { Skia } from '@shopify/react-native-skia';
import { createGalleryRuntime } from '../../domain/gallery';
import { ILLUSION_NOTES } from '../../content/illusionNotes';
import { DEFAULT_SETTINGS } from '../../types/application';
import { ComparisonSlider, DiscoveryNotebook, type DiscoveryNotebookProps } from '../DiscoveryNotebook';
jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })) }));
const props = (): DiscoveryNotebookProps => ({ progress: createGalleryRuntime().progress.gallery!, completed: false, settings: { ...DEFAULT_SETTINGS }, onSettingsChange: jest.fn(), onClose: jest.fn(), onPreview: jest.fn(), onPlaySound: jest.fn(), onStopSound: jest.fn() });
it('keeps registered but undiscovered items and puzzle answers out of an ordinary notebook', async () => {
  const p = props(), view = await render(<DiscoveryNotebook {...p} />);
  expect(view.getByText('まだ発見メモはありません。')).toBeTruthy();
  for (const note of ILLUSION_NOTES) expect(view.queryByRole('button', { name: note.title })).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '出典と素材クレジット' }));
  expect(view.getByText('https://creativecommons.org/licenses/by/4.0/')).toBeTruthy(); expect(p.onPlaySound).not.toHaveBeenCalled();
});
it('allows all seven post-completion comparisons without changing the discovery record or swapping a magnified hybrid', async () => {
  const p = { ...props(), completed: true }, before = JSON.stringify(p.progress), view = await render(<DiscoveryNotebook {...p} />);
  expect(view.getAllByRole('button').filter(button => String(button.props.accessibilityLabel).includes('自由比較'))).toHaveLength(7);
  await fireEvent.press(view.getByRole('button', { name: '近づくと変わる掲示（自由比較）' }));
  const source = view.getByTestId('notebook-hybrid-image').props.source;
  await fireEvent(view.getByRole('adjustable', { name: '画像の倍率' }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(view.getByTestId('notebook-hybrid-image').props.source).toBe(source);
  await fireEvent.press(view.getByRole('button', { name: '補助：大きい成分' })); expect(view.getByTestId('notebook-hybrid-image').props.source).not.toBe(source);
  expect(view.getByText('成分だけを表示する補助です。本編の画像は入れ替わりません。')).toBeTruthy(); expect(JSON.stringify(p.progress)).toBe(before);
});
it('moves only the mask comparison view and clears it when the note closes', async () => {
  const p = { ...props(), completed: true }, view = await render(<DiscoveryNotebook {...p} />);
  await fireEvent.press(view.getByRole('button', { name: '凹面の仮面（自由比較）' })); expect(p.onPreview).toHaveBeenLastCalledWith({ kind: 'mask', yaw: 0 });
  await fireEvent(view.getByRole('adjustable', { name: '仮面を見る位置' }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(p.onPreview).toHaveBeenLastCalledWith({ kind: 'mask', yaw: Math.PI / 18 });
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' })); expect(p.onPreview).toHaveBeenLastCalledWith(undefined);
  await view.unmount(); expect(p.onStopSound).toHaveBeenCalled();
});
it.each(['subdued', 'mute', 'disabled'] as const)('prevents the optional sound when %s', async mode => {
  const p = { ...props(), completed: true }, audio = { enabled: mode !== 'mute', illusionEnabled: mode !== 'disabled', effectsVolume: .3, musicVolume: .2 };
  p.settings = { ...p.settings, audio, horrorIntensity: mode === 'subdued' ? 'subdued' : 'standard' };
  const view = await render(<DiscoveryNotebook {...p} />); await fireEvent.press(view.getByRole('button', { name: '音の錯覚（自由比較）' }));
  expect(view.getByRole('button', { name: '短い音を再生' })).toBeDisabled(); await fireEvent.press(view.getByRole('button', { name: '短い音を再生' })); expect(p.onPlaySound).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: '音を止める' })); expect(p.onStopSound).toHaveBeenCalled();
});
it('disposes note raster images across repeated open/close and ignores retired slider callbacks', async () => {
  const p = { ...props(), completed: true }, view = await render(<DiscoveryNotebook {...p} />), before = jest.mocked(Skia.Image.MakeImage).mock.results.length;
  for (let i = 0; i < 10; i++) { await fireEvent.press(view.getByRole('button', { name: '色の奥行き（自由比較）' })); await fireEvent.press(view.getByRole('button', { name: i % 2 === 0 ? '無彩色で比べる' : 'カラーに戻す' })); await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' })); }
  await view.unmount(); for (const result of jest.mocked(Skia.Image.MakeImage).mock.results.slice(before)) expect(result.value.dispose).toHaveBeenCalledTimes(1);
  const change = jest.fn(), slider = await render(<ComparisonSlider label="比較" value={0} min={-1} max={1} step={.1} onChange={change} />), old = slider.getByRole('adjustable').props.onAccessibilityAction;
  await slider.unmount(); await act(() => old({ nativeEvent: { actionName: 'increment' } })); expect(change).not.toHaveBeenCalled();
}, 30000);

it.each([{ width: 320, fontScale: 2 }, { width: 430, fontScale: 1 }])('keeps comparison controls, credits and closing reachable in a scroll container at $width/$fontScale', async metrics => {
  const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
  await act(() => Dimensions.set({ window: { width: metrics.width, height: 740, scale: 3, fontScale: metrics.fontScale }, screen: { width: metrics.width, height: 740, scale: 3, fontScale: metrics.fontScale } }));
  const view = await render(<DiscoveryNotebook {...props()} completed />);
  await fireEvent.press(view.getByRole('button', { name: '隠れた配線（自由比較）' }));
  const scroll = view.getByTestId('notebook-comparison-scroll');
  for (const label of ['線の高さ', 'カバーの位置']) {
    const slider = within(scroll).getByRole('adjustable', { name: label }); expect(StyleSheet.flatten(slider.props.style).minHeight).toBeGreaterThanOrEqual(44);
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  }
  expect(within(scroll).getByText('素材クレジット')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' })); expect(view.getByRole('button', { name: '結果へ戻る' })).toBeEnabled();
  await view.unmount(); await act(() => Dimensions.set(original));
  // This proves scroll and touch-target contracts, not native font layout or physical iPhone occlusion.
}, 15000);

it('normalizes the measured mask opening to SafeArea content rather than the whole device', async () => {
  const mockedInsets = jest.mocked(useSafeAreaInsets); mockedInsets.mockReturnValue({ top: 47, bottom: 34, left: 12, right: 8 });
  const p = { ...props(), completed: true }, view = await render(<DiscoveryNotebook {...p} />);
  await fireEvent.press(view.getByRole('button', { name: '凹面の仮面（自由比較）' }));
  expect(p.onPreview).toHaveBeenLastCalledWith({ kind: 'mask', yaw: 0 });
  await fireEvent(view.getByTestId('discovery-notebook'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 844 } } });
  await fireEvent(view.getByTestId('notebook-mask-window'), 'layout', { nativeEvent: { layout: { x: 12, y: 147, width: 370, height: 360 } } });
  expect(p.onPreview).toHaveBeenLastCalledWith({ kind: 'mask', yaw: 0, window: { x: 0, y: 100 / 763, width: 1, height: 460 / 763 - 100 / 763 } });
  await view.unmount(); mockedInsets.mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
});


it('keeps background comparisons independent and labels every active aid without claiming natural perception', async () => {
  const p = { ...props(), completed: true }, before = JSON.stringify(p.progress), view = await render(<DiscoveryNotebook {...p} />);
  await fireEvent.press(view.getByRole('button', { name: '色の奥行き（自由比較）' }));
  await fireEvent.press(view.getByRole('button', { name: '無彩色で比べる' }));
  expect(view.getByText('表示：無彩色（比較の補助）')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' }));
  await fireEvent.press(view.getByRole('button', { name: '明暗の対比（自由比較）' }));
  expect(view.getByText('背景：元の展示')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '同じ背景で比べる' }));
  expect(view.getByText('背景：共通（比較の補助）')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' }));
  await fireEvent.press(view.getByRole('button', { name: '主観的輪郭（自由比較）' }));
  expect(view.getByText('輪郭ガイド：オフ')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '補助の輪郭ガイド' }));
  expect(view.getByText('補助の輪郭ガイド使用中')).toBeTruthy();
  expect(view.getByText('補助を使った比較です。自然な見え方を確認した記録にはしません。')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' }));
  await fireEvent.press(view.getByRole('button', { name: '隠れた配線（自由比較）' }));
  expect(view.getByText('カバー：元の位置')).toBeTruthy();
  await fireEvent(view.getByRole('adjustable', { name: 'カバーの位置' }), 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(view.getByText('カバー：移動した比較位置（補助）')).toBeTruthy();
  expect(JSON.stringify(p.progress)).toBe(before);
});

it('opens a specific observed structural comparison and rejects the same shortcut for an unobserved item', async () => {
  const p = props(), hidden = await render(<DiscoveryNotebook {...p} initialSelection="hybrid" />);
  expect(hidden.getByText('まだ発見メモはありません。')).toBeTruthy();
  expect(hidden.queryByTestId('notebook-hybrid-image')).toBeNull(); await hidden.unmount();
  p.progress.discoveries.hybrid = true;
  const known = await render(<DiscoveryNotebook {...p} initialSelection="hybrid" />);
  expect(known.getByTestId('notebook-hybrid-image')).toBeTruthy();
  await fireEvent.press(known.getByRole('button', { name: '補助：大きい成分' }));
  expect(known.getByText('成分だけを表示する補助です。本編の画像は入れ替わりません。')).toBeTruthy();
});
