export {};
declare const __dirname: string;
const fs = require('node:fs');
const path = require('node:path');
const { generateAssets } = require('../../../scripts/generate-perceptual-audio.cjs');
const directory = path.resolve(__dirname, '../../../assets/audio');
it('reproduces original cloth, closing impact and octave ascent with bounded acoustic measurements', () => {
  const actual = generateAssets(directory, true);
  expect(actual).toEqual(JSON.parse(fs.readFileSync(path.join(directory, 'perceptual-analysis.json'), 'utf8')));
  expect(actual.listeningVerified).toBe(false);
  expect(Object.keys(actual.sources)).toEqual(['cloth', 'door-impact', 'shepard']);
  for (const stats of Object.values(actual.sources) as { clippedSamples: number; dc: number; loopBoundaryDelta: number; maxAdjacentDelta: number }[]) {
    expect(stats.clippedSamples).toBe(0);
    expect(Math.abs(stats.dc)).toBeLessThan(.0001);
    expect(stats.loopBoundaryDelta).toBeLessThan(.001);
    expect(stats.maxAdjacentDelta).toBeLessThan(.12);
  }
  expect(actual.sources['door-impact'].duration).toBeLessThan(.6); // Finishes before the closing result transition.
  const tone = actual.sources.shepard;
  expect(tone.duration).toBe(12); expect(tone.peak).toBeLessThan(.16);
  expect(tone.rms).toBeCloseTo(.065, 4);
  expect(Math.max(...tone.rmsWindows)).toBeLessThan(.08);
  expect(Math.max(...tone.rmsWindows) / Math.min(...tone.rmsWindows)).toBeLessThan(1.2);
});
