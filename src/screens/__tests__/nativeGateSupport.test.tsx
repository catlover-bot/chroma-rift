import { fireEvent, render } from '@testing-library/react-native';
import { requireOptionalNativeModule } from 'expo';
import * as Clipboard from 'expo-clipboard';
import { NativeFirstPersonGate } from '../NativeFirstPersonGate';
import { SupportInformation } from '../SupportInformation';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_SETTINGS } from '../../types/application';
import { recentFailureSnapshots, resetFailureSnapshotsForTest } from '../../rendering/firstPerson/failureLedger';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo', () => ({ requireOptionalNativeModule: jest.fn(() => null) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));
jest.mock('../FirstPersonScreen', () => ({ FirstPersonScreen: () => { throw new Error('fixture mount failure /home/private/app token=secret'); } }));
const originalDev = __DEV__, originalProfile = process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE;
afterEach(() => { Object.defineProperty(globalThis, '__DEV__', { value: originalDev, configurable: true }); if (originalProfile === undefined) delete process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE; else process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = originalProfile; resetFailureSnapshotsForTest(); jest.restoreAllMocks(); });

it.each([false, true])('retains a sanitized native gate failure after exit, module present=%s', async present => {
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true }); process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = 'preview';
  jest.mocked(requireOptionalNativeModule).mockReturnValue(present ? {} as ReturnType<typeof requireOptionalNativeModule> : null);
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  const onExit = jest.fn();
  const view = await render(<NativeFirstPersonGate preferredColor="neutral" settings={DEFAULT_SETTINGS} controls={DEFAULT_FIRST_PERSON_CONTROLS} onSettingsChange={jest.fn()} onControlsChange={jest.fn()} onCheckpoint={jest.fn()} onComplete={jest.fn()} onRestart={jest.fn()} onExit={onExit} />);
  expect(await view.findByText('画面を表示できませんでした。')).toBeTruthy();
  expect(view.queryByTestId('render-diagnostic-record')).toBeNull();
  expect(JSON.stringify(view.toJSON())).not.toMatch(/ExpoGL|native|fixture|goal-014|token=secret/);
  await fireEvent.press(view.getByRole('button', { name: 'ホームへ戻る' })); expect(onExit).toHaveBeenCalledTimes(1);
  await view.unmount();
  expect(recentFailureSnapshots()).toHaveLength(1);
  const support = await render(<SupportInformation />);
  await fireEvent.press(support.getByRole('button', { name: '詳しい情報' }));
  await fireEvent.press(support.getByRole('button', { name: '情報をコピー' }));
  const record = jest.mocked(Clipboard.setStringAsync).mock.calls.at(-1)![0];
  expect(record).toContain(present ? 'NATIVE_SCREEN' : 'MISSING_NATIVE_GL');
  expect(record).not.toMatch(/\/home\/private|token=secret/);
  if (present) expect(consoleError).toHaveBeenCalled();
});
