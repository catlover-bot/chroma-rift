const mockOptionalModule = jest.fn();
const mockCreatePlayer = jest.fn();
const mockSetAudioMode = jest.fn(async (_mode: unknown) => undefined);
const mockAudioImport = jest.fn();
jest.mock('expo', () => ({ requireOptionalNativeModule: (...args: unknown[]) => mockOptionalModule(...args) }));
jest.mock('expo-audio', () => {
  mockAudioImport();
  return { createAudioPlayer: (...args: unknown[]) => mockCreatePlayer(...args), setAudioModeAsync: (mode: unknown) => mockSetAudioMode(mode) };
});

beforeEach(() => {
  jest.resetModules();
  mockOptionalModule.mockReset(); mockCreatePlayer.mockReset(); mockAudioImport.mockClear(); mockSetAudioMode.mockClear();
});

it('loads the public app audio boundary on a pre-audio build without evaluating expo-audio', () => {
  mockOptionalModule.mockReturnValue(null);
  const boundary = require('../index') as typeof import('../index');
  expect(mockAudioImport).not.toHaveBeenCalled();
  expect(boundary.getGalleryAudioAvailability()).toBe('missing-native');
  const owner = boundary.createGalleryAudio({ sessionId: 'old-build' });
  owner.setActive(true);
  expect(owner.getDiagnostics()).toMatchObject({ availability: 'missing-native', players: 0 });
  expect(mockOptionalModule).toHaveBeenCalledWith('ExpoAudio');
  expect(mockAudioImport).not.toHaveBeenCalled();
});

it('checks the installed module name before importing the package and requests playback-only silent-respecting mode', async () => {
  mockOptionalModule.mockReturnValue({});
  const boundary = require('../nativeBackend') as typeof import('../nativeBackend');
  expect(mockAudioImport).not.toHaveBeenCalled();
  const backend = boundary.createNativeAudioBackend();
  expect(mockAudioImport).toHaveBeenCalledTimes(1);
  expect(mockOptionalModule.mock.invocationCallOrder[0]).toBeLessThan(mockAudioImport.mock.invocationCallOrder[0]!);
  await backend.prepare(); backend.createPlayer('interaction');
  expect(mockSetAudioMode).toHaveBeenCalledWith({ playsInSilentMode: false, allowsRecording: false, allowsBackgroundRecording: false, shouldPlayInBackground: false, shouldRouteThroughEarpiece: false, interruptionMode: 'mixWithOthers' });
  expect(mockCreatePlayer).toHaveBeenCalledWith(expect.anything(), { updateInterval: 1000, keepAudioSessionActive: false });
});

it('turns a failed probe into an unavailable audio backend without throwing or importing it', () => {
  mockOptionalModule.mockImplementation(() => { throw new Error('Native registry unavailable'); });
  const boundary = require('../nativeBackend') as typeof import('../nativeBackend');
  expect(boundary.getGalleryAudioAvailability()).toBe('unavailable');
  expect(boundary.createNativeAudioBackend().availability).toBe('unavailable');
  expect(mockAudioImport).not.toHaveBeenCalled();
});
