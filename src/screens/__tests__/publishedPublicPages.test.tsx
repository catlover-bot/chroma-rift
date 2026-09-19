import { fireEvent, render } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { PUBLIC_PAGES } from '../../app/publicPages';
import { DEFAULT_SETTINGS } from '../../types/application';
import { SettingsScreen } from '../SettingsScreen';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

afterEach(() => jest.restoreAllMocks());

it('connects the actual SettingsScreen to both published URLs from the unmocked product configuration', async () => {
  // HTTP availability is checked separately; this proves the shipped configuration
  // reaches the native boundary through actual screen buttons, without opening a browser.
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const unrelatedAction = jest.fn();
  expect(PUBLIC_PAGES).toEqual({
    privacy: 'https://catlover-bot.github.io/chroma-rift/privacy.html',
    support: 'https://catlover-bot.github.io/chroma-rift/support.html',
  });
  const view = await render(<SettingsScreen settings={DEFAULT_SETTINGS} onChange={unrelatedAction}
    onRecalibrate={unrelatedAction} onQuickSetup={unrelatedAction} onReset={unrelatedAction}
    onResetChapter={unrelatedAction} onBack={unrelatedAction} />);
  expect(open).not.toHaveBeenCalled();
  expect(view.queryByTestId('render-diagnostic-record')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'プライバシーポリシー' }));
  expect(open).toHaveBeenNthCalledWith(1, PUBLIC_PAGES.privacy);
  await fireEvent.press(view.getByRole('button', { name: 'お問い合わせ' }));
  expect(open).toHaveBeenNthCalledWith(2, PUBLIC_PAGES.support);
  expect(open).toHaveBeenCalledTimes(2);
  expect(alert).not.toHaveBeenCalled();
  expect(unrelatedAction).not.toHaveBeenCalled();
  expect(view.queryByTestId('render-diagnostic-record')).toBeNull();
});
