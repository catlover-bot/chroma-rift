import { fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { SupportInformation } from '../SupportInformation';
import { SettingsScreen } from '../SettingsScreen';
import { ChapterOneHomeScreen } from '../ChapterOneHomeScreen';
import { DEFAULT_SETTINGS } from '../../types/application';
import { rememberFailureSnapshot, resetFailureSnapshotsForTest } from '../../rendering/firstPerson/failureLedger';

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => undefined) }));

const settingsProps = { settings: DEFAULT_SETTINGS, onChange: jest.fn(), onRecalibrate: jest.fn(), onQuickSetup: jest.fn(), onReset: jest.fn(), onBack: jest.fn() };
const originalDev = __DEV__;
const originalProfile = process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE;
afterEach(() => { Object.defineProperty(globalThis, '__DEV__', { value: originalDev, configurable: true }); if (originalProfile === undefined) delete process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE; else process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = originalProfile; resetFailureSnapshotsForTest(); jest.clearAllMocks(); });

it.each(['preview', 'production'])('keeps %s support closed and retains a failure only behind explicit details', async profile => {
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true }); process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = profile;
  rememberFailureSnapshot(JSON.stringify({ label: 'FIRST_FAILURE', schemaVersion: 1, firstFailure: { reasonCode: 'MAIN_RENDER', message: 'fixture /home/private/project file:///private/key token=secret' }, events: ['PRIVATE_EVENT'] }));
  const devAction = jest.fn();
  const view = await render(<SettingsScreen {...settingsProps} onDeveloperLab={devAction} onLegacyMaze={devAction} />);
  expect(view.queryByTestId('render-diagnostic-record')).toBeNull();
  expect(view.queryByText(/goal-014/)).toBeNull();
  expect(view.queryByText('開発者ラボ')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: 'サポート' }));
  expect(view.queryByTestId('render-diagnostic-record')).toBeNull();
  await fireEvent.press(view.getByRole('button', { name: '詳しい情報' }));
  expect(view.getByTestId('render-diagnostic-record').props.children).toContain('MAIN_RENDER');
  await fireEvent.press(view.getByRole('button', { name: '情報をコピー' }));
  const copied = jest.mocked(Clipboard.setStringAsync).mock.calls.at(-1)![0];
  expect(copied).toContain('goal-014-2-fair-escape-r1'); expect(copied).toContain('MAIN_RENDER');
  expect(copied).not.toContain('/home/private'); expect(copied).not.toContain('token=secret');
  if (profile === 'production') expect(copied).not.toContain('PRIVATE_EVENT');
  else expect(copied).toContain('PRIVATE_EVENT');
  await fireEvent.press(view.getByRole('button', { name: '詳しい情報を閉じる' }));
  expect(view.queryByTestId('render-diagnostic-record')).toBeNull(); expect(view.queryByText(/MAIN_RENDER/)).toBeNull();
  expect(devAction).not.toHaveBeenCalled();
});

it('keeps the preview home free of build identity and raw migration terminology', async () => {
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true }); process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = 'preview';
  const noop = jest.fn();
  const view = await render(<ChapterOneHomeScreen loading={false} migration={{ status: 'blocked', source: 'gallery' }} replayable={[]} showAreas={false} showDiscoveries={false} discoveries={{}} onContinue={noop} onNew={noop} onImport={noop} onAreas={noop} onDiscoveries={noop} onHome={noop} onReplay={noop} onEnding={noop} onSettings={noop} />);
  expect(view.queryByTestId('home-build-identity')).toBeNull(); expect(view.queryByText(/原文/)).toBeNull();
  expect(view.getByText(/以前のプレイ記録/)).toBeTruthy();
});

it('copies a fresh additive GL record and audio snapshot without translating diagnostic keys', async () => {
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true }); process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = 'preview';
  let frame = 3;
  const provider = jest.fn(() => JSON.stringify({ label: 'FIRST_FAILURE', schemaVersion: 1, firstFailure: { reasonCode: 'MAIN_RENDER' }, frames: { sequence: frame }, gl: { framebufferStatus: 'complete' } }));
  const view = await render(<SupportInformation renderDiagnostics={provider} />);
  expect(provider).not.toHaveBeenCalled();
  await fireEvent.press(view.getByRole('button', { name: '詳しい情報' }));
  expect(provider).toHaveBeenCalledTimes(1);
  frame = 7;
  await fireEvent.press(view.getByRole('button', { name: '情報をコピー' }));
  const copied = JSON.parse(jest.mocked(Clipboard.setStringAsync).mock.calls.at(-1)![0]);
  expect(copied).toMatchObject({ label: 'FIRST_FAILURE', schemaVersion: 1, firstFailure: { reasonCode: 'MAIN_RENDER' }, frames: { sequence: 7 }, gl: { framebufferStatus: 'complete' }, support: { schemaVersion: 1, audio: { schemaVersion: 1, hearingVerified: false } } });
  await fireEvent.press(view.getByRole('button', { name: '詳しい情報を閉じる' }));
  expect(JSON.stringify(view.toJSON())).not.toContain('MAIN_RENDER');
});

it('does not label sound off or all volumes at zero as an audio failure', async () => {
  const view = await render(<SettingsScreen {...settingsProps} settings={{ ...DEFAULT_SETTINGS, audio: { ...DEFAULT_SETTINGS.audio!, enabled: false } }} />);
  expect(view.queryByText(/音を再生できませんでした/)).toBeNull();
  await view.rerender(<SettingsScreen {...settingsProps} settings={{ ...DEFAULT_SETTINGS, audio: { enabled: true, musicVolume: 0, environmentVolume: 0, effectsVolume: 0 } }} />);
  expect(view.queryByText(/音を再生できませんでした/)).toBeNull();
  expect(view.getByRole('switch', { name: '音' })).toBeTruthy();
});

it('keeps production healthy details distinct from failure and summarizes the actual nested GL error', async () => {
  Object.defineProperty(globalThis, '__DEV__', { value: false, configurable: true }); process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = 'production';
  const provider = jest.fn(() => JSON.stringify({ schemaVersion: 1, firstFailure: null, frames: { sequence: 8 } }));
  const view = await render(<SupportInformation renderDiagnostics={provider} />);
  await fireEvent.press(view.getByRole('button', { name: '詳しい情報' }));
  expect(view.getByTestId('render-diagnostic-record').props.children).not.toContain('FIRST_FAILURE');
  provider.mockImplementation(() => JSON.stringify({ label: 'FIRST_FAILURE', schemaVersion: 1, firstFailure: { reasonCode: 'MAIN_RENDER', error: { phase: 'render', message: 'fixture failure', stack: 'PRIVATE_STACK' } }, gl: { trace: ['PRIVATE_TRACE'] } }));
  await fireEvent.press(view.getByRole('button', { name: '情報をコピー' }));
  const record = jest.mocked(Clipboard.setStringAsync).mock.calls.at(-1)![0];
  expect(JSON.parse(record)).toMatchObject({ label: 'FIRST_FAILURE', schemaVersion: 1, firstFailure: { reasonCode: 'MAIN_RENDER', phase: 'render', message: 'fixture failure' } });
  expect(record).not.toMatch(/PRIVATE_STACK|PRIVATE_TRACE/);
});
