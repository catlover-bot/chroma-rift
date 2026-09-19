import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { PUBLIC_PAGES } from '../../app/publicPages';
import { DEFAULT_SETTINGS } from '../../types/application';
import { SettingsScreen } from '../SettingsScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));
jest.mock('../../app/publicPages', () => ({ PUBLIC_PAGES: { privacy: null, support: null } }));

const props = {
  settings: DEFAULT_SETTINGS, onChange: jest.fn(), onRecalibrate: jest.fn(),
  onQuickSetup: jest.fn(), onReset: jest.fn(), onResetChapter: jest.fn(), onBack: jest.fn(),
};
// Isolated fixtures only; these addresses are never included in the product configuration.
const privacyUrl = 'https://public-pages.test/privacy.html';
const supportUrl = 'https://public-pages.test/support.html';

beforeEach(() => {
  jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); jest.clearAllMocks(); });

it('hides both unconfigured links and preserves offline privacy and support', async () => {
  expect(PUBLIC_PAGES).toEqual({ privacy: null, support: null });
  const view = await render(<SettingsScreen {...props} />);
  expect(view.queryByRole('button', { name: 'プライバシーポリシー' })).toBeNull();
  expect(view.queryByRole('button', { name: 'お問い合わせ' })).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'プライバシー' }));
  expect(view.getByText(/プレイの進行、観察履歴、設定、表示の調整結果を端末内に保存/)).toBeTruthy();
  await fireEvent.press(view.getByRole('button', { name: 'サポート' }));
  expect(view.getByRole('button', { name: '詳しい情報' })).toBeTruthy();
  expect(Linking.openURL).not.toHaveBeenCalled();
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
});

it.each([
  ['privacy', privacyUrl, 'プライバシーポリシー', 'お問い合わせ'],
  ['support', supportUrl, 'お問い合わせ', 'プライバシーポリシー'],
] as const)('opens only the configured %s page after an explicit press', async (key, url, label, absentLabel) => {
  jest.replaceProperty(PUBLIC_PAGES, key, url);
  const view = await render(<SettingsScreen {...props} />);
  expect(view.queryByRole('button', { name: absentLabel })).toBeNull();
  expect(Linking.openURL).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: label }));
  expect(Linking.openURL).toHaveBeenCalledTimes(1);
  expect(Linking.openURL).toHaveBeenCalledWith(url);
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(Clipboard.setStringAsync).not.toHaveBeenCalled();
  for (const callback of [props.onChange, props.onReset, props.onResetChapter, props.onBack]) expect(callback).not.toHaveBeenCalled();
});

it.each(['rejection', 'synchronous throw'])('reports an opening failure in Japanese without exposing native details: %s', async failure => {
  jest.replaceProperty(PUBLIC_PAGES, 'privacy', privacyUrl);
  const error = new Error('PRIVATE_NATIVE_FAILURE');
  if (failure === 'rejection') jest.mocked(Linking.openURL).mockRejectedValueOnce(error);
  else jest.mocked(Linking.openURL).mockImplementationOnce(() => { throw error; });
  const view = await render(<SettingsScreen {...props} />);
  await fireEvent.press(view.getByRole('button', { name: 'プライバシーポリシー' }));
  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('ページを開けませんでした', '通信状況を確認して、もう一度お試しください。'));
  expect(Alert.alert).toHaveBeenCalledTimes(1);
  expect(props.onReset).not.toHaveBeenCalled();
});

it('keeps both external links independent from diagnostic copy and confirmed reset', async () => {
  jest.replaceProperty(PUBLIC_PAGES, 'privacy', privacyUrl);
  jest.replaceProperty(PUBLIC_PAGES, 'support', supportUrl);
  const view = await render(<SettingsScreen {...props} />);
  await fireEvent.press(view.getByRole('button', { name: 'サポート' }));
  await fireEvent.press(view.getByRole('button', { name: '詳しい情報' }));
  await fireEvent.press(view.getByRole('button', { name: '情報をコピー' }));
  expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
  expect(Linking.openURL).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: '保存データをリセット' }));
  expect(props.onReset).not.toHaveBeenCalled();
  expect(Linking.openURL).not.toHaveBeenCalled();
  jest.mocked(Alert.alert).mock.calls.at(-1)?.[2]?.find(button => button.text === 'リセット')?.onPress?.();
  expect(props.onReset).toHaveBeenCalledTimes(1);
  await fireEvent.press(view.getByRole('button', { name: 'プライバシーポリシー' }));
  await fireEvent.press(view.getByRole('button', { name: 'お問い合わせ' }));
  expect(Linking.openURL).toHaveBeenNthCalledWith(1, privacyUrl);
  expect(Linking.openURL).toHaveBeenNthCalledWith(2, supportUrl);
  expect(Clipboard.setStringAsync).toHaveBeenCalledTimes(1);
  expect(props.onReset).toHaveBeenCalledTimes(1);
});
