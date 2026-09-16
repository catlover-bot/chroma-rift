import { createMusicDirector } from '../musicDirector';
import { createGalleryAudioOwner } from '../owner';
import { DEFAULT_AUDIO_PREFERENCES } from '../preferences';
import { selectChapterMusicState } from '../musicState';
import type { AudioBackend, AudioPlayerPort, AudioSourceId } from '../types';

function backendHarness() {
  const players: (AudioPlayerPort & { source: AudioSourceId; play: jest.Mock; pause: jest.Mock; release: jest.Mock })[] = [];
  let maximum = 0;
  const backend: AudioBackend = { availability: 'available', prepare: jest.fn(async () => undefined), createPlayer: jest.fn((source) => {
    const player = { source, isLoaded: true, volume: 0, loop: false, play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => undefined), release: jest.fn() };
    players.push(player); maximum = Math.max(maximum, players.filter((p) => !p.release.mock.calls.length).length); return player;
  }) };
  return { backend, players, maximum: () => maximum, live: () => players.filter((p) => !p.release.mock.calls.length) };
}
function harness() {
  const h = backendHarness(); const failed = jest.fn();
  const music = createMusicDirector(h.backend, () => true, failed);
  music.setVolume(.4); music.setEnabled(true);
  const advance = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds * 10); i += 1) music.advance(.1); };
  return { ...h, failed, music, advance };
}

it('uses composed prepared mixes, holds short suspicion flicker, and crossfades with at most two voices', () => {
  const h = harness(); h.music.setState('exploration'); h.advance(5);
  h.music.setState('suspicion'); h.advance(.5); h.music.setState('exploration'); h.advance(.5);
  expect(h.players.map((p) => p.source)).toEqual(['exploration']);
  h.music.setState('pursuit'); h.advance(.3);
  expect(h.live()).toHaveLength(2);
  expect(h.live().reduce((sum, p) => sum + p.volume, 0)).toBeCloseTo(.4, 2);
  h.advance(2); expect(h.live().map((p) => p.source)).toEqual(['pursuit']);
  for (let i = 0; i < 100; i += 1) { h.music.setState(i % 2 ? 'suspicion' : 'exploration'); h.music.advance(.02); }
  expect(h.maximum()).toBeLessThanOrEqual(2); expect(h.failed).not.toHaveBeenCalled();
});

it('contains pursuit immediately, plays the finite safety phrase once, and then resumes exploration', () => {
  const h = harness(); h.music.setState('pursuit'); h.advance(1);
  const pursuit = h.players[0]!;
  h.music.setState('release'); expect(pursuit.pause).toHaveBeenCalled(); expect(pursuit.release).toHaveBeenCalledTimes(1);
  h.advance(.1); expect(h.live()[0]!.source).toBe('release'); expect(h.live()[0]!.loop).toBe(false);
  h.music.setState('exploration'); h.advance(8); expect(h.live()[0]!.source).toBe('release');
  h.advance(3); expect(h.live()[0]!.source).toBe('exploration');
  const end = harness(); end.music.setState('chapter_end'); end.advance(65);
  expect(end.live()).toHaveLength(0); end.music.setState('chapter_end'); end.advance(10);
  expect(end.players).toHaveLength(1);
});

it('ducks immediately then recovers without raising the chosen volume; mute/pause forget previous threat', () => {
  const h = harness(); h.music.setState('pursuit'); h.advance(1);
  h.music.duck(1,.25); expect(h.live()[0]!.volume).toBeCloseTo(.1, 3);
  h.advance(.5); expect(h.live()[0]!.volume).toBeCloseTo(.1, 3);
  h.advance(2); expect(h.live()[0]!.volume).toBeCloseTo(.4, 3);
  h.music.setEnabled(false); expect(h.live()).toHaveLength(0);
  h.music.setEnabled(true); h.advance(8); expect(h.live()).toHaveLength(0);
  h.music.setState('exploration'); h.advance(1); h.music.setVolume(0);
  expect(h.live()).toHaveLength(0); h.music.setVolume(.4); h.advance(1); expect(h.live()).toHaveLength(0);
});

it('does not start an unloaded music voice late after disposal or queue a seek callback', () => {
  const h = harness(); h.music.setState('exploration'); h.music.advance(0);
  h.music.setState('release'); h.music.advance(0);
  const voice = h.live()[0]!; Object.assign(voice, { isLoaded: false });
  h.music.dispose(); Object.assign(voice, { isLoaded: true }); h.advance(8);
  expect(voice.release).toHaveBeenCalledTimes(1); expect(h.live()).toHaveLength(0);
  expect(h.players.every((p) => (p.seekTo as jest.Mock).mock.calls.length === 0)).toBe(true);
});

it('times out unloaded sources and owns players before a native setter throws', () => {
  const h = harness(); h.music.setState('exploration');
  (h.backend.createPlayer as jest.Mock).mockImplementationOnce(() => {
    const player = { isLoaded: false, volume: 0, loop: false, play: jest.fn(), pause: jest.fn(), release: jest.fn(), seekTo: jest.fn() };
    h.players.push({ ...player, source: 'exploration' }); return h.players[h.players.length - 1];
  });
  h.advance(6); expect(h.failed).toHaveBeenCalledTimes(1); expect(h.live()).toHaveLength(0);
  const broken = harness(); const release = jest.fn();
  (broken.backend.createPlayer as jest.Mock).mockReturnValue({ set volume(_value: number) { throw new Error('native setter'); }, pause: jest.fn(), release });
  broken.music.setState('title_theme'); broken.advance(.1);
  expect(release).toHaveBeenCalledTimes(1); expect(broken.failed).toHaveBeenCalledTimes(1);
});

it('keeps ten area effect voices plus at most two music voices and releases all over ten entries', async () => {
  const h = backendHarness();
  for (let visit = 0; visit < 10; visit += 1) {
    const id = String(visit); const owner = createGalleryAudioOwner({ sessionId: id, areaId: 'departure-control-v1' }, h.backend);
    owner.setActive(true); await owner.whenReady(); owner.setMusicState('exploration', id);
    for (let i = 0; i < 50; i += 1) owner.advanceMusic(.1, id);
    owner.setMusicState('pursuit', id); for (let i = 0; i < 3; i += 1) owner.advanceMusic(.1, id);
    expect(owner.getDiagnostics().players).toBeLessThanOrEqual(12);
    owner.setEnvironment('outdoor'); expect(h.live()).toHaveLength(12);
    owner.setActive(false); owner.dispose(); expect(h.live()).toHaveLength(0);
  }
  expect(h.maximum()).toBeLessThanOrEqual(12);
  expect(h.players.every((p) => p.release.mock.calls.length === 1)).toBe(true);
});

it('allocates only music for the title and respects zero/mute/stale session during async readiness', async () => {
  const h = backendHarness(); const owner = createGalleryAudioOwner({ sessionId: 'title', musicOnly: true }, h.backend);
  owner.setActive(true); owner.setMusicState('title_theme', 'title'); await owner.whenReady();
  expect(h.live().map((p) => p.source)).toEqual(['title_theme']);
  owner.setMusicState('pursuit', 'old'); owner.advanceMusic(.1, 'old'); expect(h.live()[0]!.source).toBe('title_theme');
  owner.updatePreferences({ ...DEFAULT_AUDIO_PREFERENCES, enabled: false }); expect(h.live()).toHaveLength(0);
  owner.setMusicState('title_theme', 'title'); owner.advanceMusic(.1, 'title'); expect(h.live()).toHaveLength(0);
  owner.dispose();
});

it('selects safety from authoritative containment before any stale pursuit indication', () => {
  expect(selectChapterMusicState({ surface: 'game', threat: 'pursuit', actorContained: true })).toBe('exploration');
  expect(selectChapterMusicState({ surface: 'game', threat: 'pursuit', actorContained: true, safetyJustEarned: true })).toBe('release');
  expect(selectChapterMusicState({ surface: 'ending', threat: 'none' })).toBe('chapter_end');
  expect(selectChapterMusicState({ surface: 'title', threat: 'none', suspended: true })).toBe('silent');
});

it('uses the area-specific physical slot without growing the pool and replaces room sound with outdoor air', async () => {
  const h = backendHarness(); const owner = createGalleryAudioOwner({ sessionId: 'control', areaId: 'departure-control-v1' }, h.backend);
  owner.setActive(true); await owner.whenReady();
  for (const [index, type] of (['grip', 'key', 'bell', 'isolation', 'power'] as const).entries()) {
    expect(owner.event({ sessionId: 'control', sequence: index, type })).toBe(true);
    await Promise.resolve();
    expect(h.players.find((p) => p.source === type)!.play).toHaveBeenCalledTimes(1);
  }
  expect(h.live()).toHaveLength(10); owner.beginEnding(); owner.setEnvironment('outdoor');
  expect(h.players.find((p) => p.source === 'room-control')!.release).toHaveBeenCalledTimes(1);
  expect(h.live().find((p) => p.source === 'outdoor')!.play).toHaveBeenCalledTimes(1);
  expect(h.live()).toHaveLength(10); owner.dispose(); expect(h.live()).toHaveLength(0);
});

it('keeps music and environment sliders independent while preserving a legacy explicit environmental zero', async () => {
  const h = backendHarness(); const owner = createGalleryAudioOwner({ sessionId: 'preferences', areaId: 'mirror-corridor-v1', preferences: { enabled: true, musicVolume: 0, effectsVolume: .35 } }, h.backend);
  owner.setActive(true); await owner.whenReady(); owner.setMusicState('exploration', 'preferences');
  const room = h.players.find((p) => p.source === 'room-mirror')!;
  expect(room.play).not.toHaveBeenCalled(); expect(owner.getDiagnostics().musicPlayers).toBe(0);
  owner.updatePreferences({ ...DEFAULT_AUDIO_PREFERENCES, environmentVolume: 0 }); owner.setMusicState('exploration', 'preferences');
  expect(owner.getDiagnostics().musicPlayers).toBe(1); expect(room.play).not.toHaveBeenCalled();
  owner.updatePreferences({ ...DEFAULT_AUDIO_PREFERENCES, musicVolume: 0, environmentVolume: .2 });
  expect(owner.getDiagnostics().musicPlayers).toBe(0); expect(room.play).toHaveBeenCalledTimes(1); expect(room.volume).toBeCloseTo(.12, 3);
  owner.dispose();
});
