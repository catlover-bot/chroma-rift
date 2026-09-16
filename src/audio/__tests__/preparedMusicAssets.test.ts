import { MUSIC_DURATION_SECONDS } from '../musicDirector';
declare const __dirname: string;
const fs = require('node:fs') as { readFileSync(path: string): Uint8Array; readFileSync(path: string, encoding: 'utf8'): string };
const path = require('node:path') as { resolve(...parts: string[]): string };
const crypto = require('node:crypto') as { createHash(name: string): { update(data: Uint8Array): { digest(format: 'hex'): string } } };
const root = path.resolve(__dirname, '../../..');
const hash = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(path.resolve(root, file))).digest('hex');

type Measurement = { durationSeconds: number; sha256: string; bytes: number; integratedLufs: number; truePeakDbtp: number; monoRmsRelativeDb: number; clippedSamples: number };
it('ships the six measured compressed compositions with current score/renderer provenance and an honest listening label', () => {
  const report = JSON.parse(fs.readFileSync(path.resolve(root, 'docs/qa-goal014/audio/music-analysis.json'), 'utf8')) as {
    artisticListeningVerified: boolean; tracks: Record<string, Measurement>; scoreSha256: string; rendererSha256: string; sourceManifestSha256: string;
  };
  expect(report.artisticListeningVerified).toBe(false);
  expect(Object.keys(report.tracks).sort()).toEqual(['chapter_end', 'exploration', 'pursuit', 'release', 'suspicion', 'title_theme']);
  expect(report.scoreSha256).toBe(hash('scripts/audio/chapter-one-score.json'));
  expect(report.rendererSha256).toBe(hash('scripts/audio/render-chapter-music.py'));
  expect(report.sourceManifestSha256).toBe(hash('scripts/audio/instrument-sources.json'));
  for (const [name, track] of Object.entries(report.tracks)) {
    expect(hash(`assets/audio/music/${name}.m4a`)).toBe(track.sha256);
    expect(Math.abs(track.durationSeconds - MUSIC_DURATION_SECONDS[name as keyof typeof MUSIC_DURATION_SECONDS])).toBeLessThan(.05);
    expect(track.integratedLufs).toBeGreaterThanOrEqual(-24); expect(track.integratedLufs).toBeLessThanOrEqual(-20);
    expect(track.truePeakDbtp).toBeLessThanOrEqual(-1); expect(track.clippedSamples).toBe(0);
    expect(track.monoRmsRelativeDb).toBeGreaterThan(-3);
  }
});

it('ships each measured physical variation/environment and only the small licensed rendered sample subset', () => {
  const report = JSON.parse(fs.readFileSync(path.resolve(root, 'docs/qa-goal014/audio/physical-analysis.json'), 'utf8')) as {
    artisticListeningVerified: boolean; rendererSha256: string; sources: Record<string, Measurement>;
  };
  expect(report.artisticListeningVerified).toBe(false);
  expect(Object.keys(report.sources)).toHaveLength(15);
  expect(report.rendererSha256).toBe(hash('scripts/audio/render-physical-sounds.py'));
  for (const [name, cue] of Object.entries(report.sources)) {
    expect(hash(`assets/audio/physical/${name}.wav`)).toBe(cue.sha256); expect(cue.clippedSamples).toBe(0);
  }
  const sources = JSON.parse(fs.readFileSync(path.resolve(root, 'scripts/audio/instrument-sources.json'), 'utf8')) as { licenseSha256: string; samples: { license: string }[] };
  expect(sources.licenseSha256).toBe(hash('scripts/audio/VSCO-CC0-LICENSE.txt'));
  expect(sources.samples).toHaveLength(8); expect(sources.samples.every((sample) => sample.license === 'CC0-1.0')).toBe(true);
});
