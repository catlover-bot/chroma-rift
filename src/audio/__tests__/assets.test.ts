export {};
declare const __dirname: string;
type Binary = Uint8Array & { subarray(begin: number, end?: number): Binary };
const { Buffer: ByteBuffer } = require('node:buffer') as { Buffer: { from(data: Uint8Array): Binary } };
const fs = require('node:fs') as { readFileSync(path: string): Binary; readFileSync(path: string, encoding: 'utf8'): string };
const path = require('node:path') as { resolve(...parts: string[]): string; join(...parts: string[]): string };
const { SPECS, generateAssets, inspectWav } = require('../../../scripts/generate-audio.cjs') as {
  SPECS: Record<string, { duration: number; peak: number }>;
  generateAssets(directory: string, checkOnly: boolean): Record<string, { duration: number; sampleRate: number; format: string; channels: number; peak: number; dc: number; clippedSamples: number; rms: number; loopBoundaryDelta: number }>;
  inspectWav(buffer: Binary): unknown;
};
const directory = path.resolve(__dirname, '../../../assets/audio');

it('ships all four deterministic PCM assets with restrained peaks, duration, zero clipping and negligible DC', () => {
  const result = generateAssets(directory, true);
  expect(Object.keys(result).sort()).toEqual(['ambience', 'footstep', 'interaction', 'mechanism']);
  for (const [name, stats] of Object.entries(result)) {
    expect(stats).toMatchObject({ duration: SPECS[name]!.duration, sampleRate: 24000, format: 'PCM16LE', channels: 1, clippedSamples: 0 });
    expect(stats.peak).toBeLessThanOrEqual(SPECS[name]!.peak + 1 / 32768);
    expect(Math.abs(stats.dc)).toBeLessThan(0.0001);
    expect(stats.rms).toBeGreaterThan(0.001);
  }
  expect(result.ambience!.loopBoundaryDelta).toBeLessThan(0.005);
});

it('records exact asset hashes and explicitly keeps listening unverified', () => {
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'analysis.json'), 'utf8'));
  expect(report.listeningVerified).toBe(false);
  expect(report.sources).toEqual(generateAssets(directory, true));
});

it('rejects damaged header, truncated data, non-PCM and the wrong sample rate', () => {
  const original = fs.readFileSync(path.join(directory, 'footstep.wav'));
  expect(() => inspectWav(original.subarray(0, 40))).toThrow();
  for (const offset of [0, 20, 24, 40]) {
    const bad = ByteBuffer.from(original); bad[offset] = 0;
    expect(() => inspectWav(bad)).toThrow();
  }
});

it('configures only playback and disables microphone/background plugin features', () => {
  const app = require('../../../app.json');
  expect(app.expo.plugins).toContainEqual(['expo-audio', { microphonePermission: false, recordAudioAndroid: false, enableBackgroundRecording: false, enableBackgroundPlayback: false }]);
  expect(app.expo.ios.infoPlist.NSMicrophoneUsageDescription).toBeUndefined();
  expect(app.expo.ios.infoPlist.UIBackgroundModes).toBeUndefined();
});
