import { act, fireEvent, render, within } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { Skia } from '@shopify/react-native-skia';
import { createVaultRuntime } from '../../domain/vault/runtime';
import { VAULT_NOTES } from '../../content/vaultNotes';
import { VaultNotebook } from '../VaultNotebook';
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
it('keeps unobserved notes hidden and allows completed free comparisons without inventing discovery', async () => {
  const progress = createVaultRuntime().progress.vault!, before = JSON.stringify(progress), view = await render(<VaultNotebook progress={progress} completed={false} onClose={jest.fn()} />);
  expect(view.getByText('まだ発見メモはありません。')).toBeTruthy();
  VAULT_NOTES.forEach(note => expect(view.queryByRole('button', { name: note.title })).toBeNull());
  await view.rerender(<VaultNotebook progress={progress} completed onClose={jest.fn()} />);
  for (const note of VAULT_NOTES) {
    await fireEvent.press(view.getByRole('button', { name: note.title + '（自由比較）' }));
    expect(view.getByText('クリア後の自由比較。本編の発見記録には追加しません。')).toBeTruthy();
    expect(view.getByText('素材クレジット')).toBeTruthy();
    await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' }));
  }
  expect(JSON.stringify(progress)).toBe(before);
});
it('starts from saved aids, changes real comparison rasters, and retains separate helpers across notes without mutating gameplay', async () => {
  const progress = createVaultRuntime().progress.vault!;
  progress.discoveries = { length: true, rod: true, cafe: true }; progress.aids.lengthGuide = true;
  const before = JSON.stringify(progress), view = await render(<VaultNotebook progress={progress} completed={false} onClose={jest.fn()} />);
  await fireEvent.press(view.getByRole('button', { name: '端の飾りと長さ' }));
  expect(view.getByText('端の飾り：あり ／ 測定ガイド：オン')).toBeTruthy();
  const imageCount = jest.mocked(Skia.Image.MakeImage).mock.calls.length;
  await fireEvent(view.getByRole('adjustable', { name: '比較する棒の長さ' }), 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
  expect(jest.mocked(Skia.Image.MakeImage).mock.calls.length).toBeGreaterThan(imageCount);
  await fireEvent.press(view.getByRole('button', { name: '端の飾りを畳む' }));
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' }));
  await fireEvent.press(view.getByRole('button', { name: '傾いた枠と鉛直' }));
  expect(view.getByText('傾いた枠：あり ／ 下げ振り：オフ')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: '下げ振り' }));
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' }));
  await fireEvent.press(view.getByRole('button', { name: '端の飾りと長さ' }));
  expect(view.getByText('端の飾り：なし ／ 測定ガイド：オン')).toBeTruthy();
  expect(view.getByText('補助を使った比較です。自然な見え方を確認した記録にはしません。')).toBeTruthy();
  expect(JSON.stringify(progress)).toBe(before);
});
it('disposes comparison images and rejects a retired note slider callback', async () => {
  const progress = createVaultRuntime().progress.vault!, onChange = jest.fn(), start = jest.mocked(Skia.Image.MakeImage).mock.results.length;
  const view = await render(<VaultNotebook progress={progress} completed onClose={jest.fn()} onComparisonsChange={onChange} />);
  await fireEvent.press(view.getByRole('button', { name: '傾いた枠と鉛直（自由比較）' }));
  const old = view.getByRole('adjustable').props.onAccessibilityAction;
  await view.unmount(); await act(() => old({ nativeEvent: { actionName: 'increment' } }));
  expect(onChange).not.toHaveBeenCalled();
  for (const image of jest.mocked(Skia.Image.MakeImage).mock.results.slice(start)) expect(image.value.dispose).toHaveBeenCalledTimes(1);
});
it.each([{ width: 320, fontScale: 2 }, { width: 390, fontScale: 1.5 }, { width: 430, fontScale: 1 }])('keeps sliders, credits, and 44pt controls in the scroll surface at $width/$fontScale', async metrics => {
  const original = { window: Dimensions.get('window'), screen: Dimensions.get('screen') };
  await act(() => Dimensions.set({ window: { ...metrics, height: 740, scale: 3 }, screen: { ...metrics, height: 740, scale: 3 } }));
  const view = await render(<VaultNotebook progress={createVaultRuntime().progress.vault!} completed onClose={jest.fn()} />);
  await fireEvent.press(view.getByRole('button', { name: '傾いた枠と鉛直（自由比較）' }));
  const scroll = view.getByTestId('vault-notebook-scroll'), slider = within(scroll).getByRole('adjustable');
  expect(StyleSheet.flatten(slider.props.style).minHeight).toBeGreaterThanOrEqual(44);
  await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
  expect(within(scroll).getByText('素材クレジット')).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'メモ一覧へ' }));
  expect(view.getByRole('button', { name: '結果へ戻る' })).toBeEnabled();
  await view.unmount(); await act(() => Dimensions.set(original));
  // React contracts only: actual native font layout and touch occlusion require iPhone QA.
});
