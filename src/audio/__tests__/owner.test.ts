import { AUDIO_POOL_SIZE, createGalleryAudioOwner, FOOTSTEP_DISTANCE_METERS } from '../owner';
import { DEFAULT_AUDIO_PREFERENCES, normalizeAudioPreferences } from '../preferences';
import type { AudioBackend, AudioPlayerPort, AudioSourceId, GalleryAudioOptions } from '../types';

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness(options: Partial<GalleryAudioOptions> = {}) {
  const players: (AudioPlayerPort & { source: AudioSourceId; play: jest.Mock; pause: jest.Mock; seekTo: jest.Mock; release: jest.Mock })[] = [];
  const backend: AudioBackend = {
    availability: 'available', prepare: jest.fn(async () => undefined),
    createPlayer: jest.fn((source) => {
      const player = { source, isLoaded: true, volume: 1, loop: false, play: jest.fn(), pause: jest.fn(), seekTo: jest.fn(async () => undefined), release: jest.fn() };
      players.push(player);
      return player;
    }),
  };
  const audio = createGalleryAudioOwner({ sessionId: 'visit-1', ...options }, backend);
  const of = (source: AudioSourceId) => players.filter((player) => player.source === source);
  const count = (source: AudioSourceId) => of(source).reduce((n, player) => n + player.play.mock.calls.length, 0);
  const event = (sequence: number, type: 'interaction' | 'unlock' | 'door' = 'unlock') => audio.event({ sessionId: 'visit-1', sequence, type });
  return { audio, backend, players, of, count, event };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

it('normalizes old/malformed preferences without changing valid explicit zero or mute', () => {
  expect(normalizeAudioPreferences(undefined)).toEqual(DEFAULT_AUDIO_PREFERENCES);
  expect(normalizeAudioPreferences({ enabled: false, musicVolume: 0, effectsVolume: 0 })).toEqual({ enabled: false, musicVolume: 0, effectsVolume: 0 });
  expect(normalizeAudioPreferences({ enabled: 'yes', musicVolume: Infinity, effectsVolume: -2 })).toEqual({ ...DEFAULT_AUDIO_PREFERENCES, effectsVolume: 0 });
  expect(normalizeAudioPreferences({ musicVolume: 2, effectsVolume: 0.25 })).toEqual({ ...DEFAULT_AUDIO_PREFERENCES, musicVolume: 1, effectsVolume: 0.25 });
});

it('owns exactly seven reusable players with one loop, without allocation on movement/HUD/settings updates', async () => {
  const h = harness();
  expect(h.backend.prepare).not.toHaveBeenCalled();
  h.audio.setActive(true);
  await h.audio.whenReady();
  expect(h.players).toHaveLength(7);
  for (const source of Object.keys(AUDIO_POOL_SIZE) as AudioSourceId[]) expect(h.of(source)).toHaveLength(AUDIO_POOL_SIZE[source]);
  expect(h.players.filter((p) => p.loop)).toEqual(h.of('ambience'));
  for (let frame = 0; frame < 120; frame += 1) {
    h.audio.setActive(true);
    h.audio.movement(0.03, 'visit-1');
    h.audio.updatePreferences({ ...DEFAULT_AUDIO_PREFERENCES });
  }
  expect(h.backend.createPlayer).toHaveBeenCalledTimes(7);
  expect(h.count('ambience')).toBe(1);
  h.audio.dispose(); h.audio.dispose();
  expect(h.players.every((player) => player.release.mock.calls.length === 1)).toBe(true);
  expect(h.audio.getDiagnostics().players).toBe(0);
});

it('accepts completion sequence once, rejects stale sessions/order/malformed sequence, and allows two different unlocks', async () => {
  const h = harness(); h.audio.setActive(true); await h.audio.whenReady();
  expect(h.event(3)).toBe(true);
  expect(h.event(3)).toBe(false);
  expect(h.event(2)).toBe(false);
  expect(h.audio.event({ sessionId: 'old-visit', sequence: 100, type: 'unlock' })).toBe(false);
  for (const sequence of [NaN, Infinity, -1, 2.5]) expect(h.event(sequence)).toBe(false);
  expect(h.event(4)).toBe(true);
  await flush();
  expect(h.count('mechanism')).toBe(2);
  expect(h.audio.getDiagnostics().playedEvents).toBe(2);
});

it('consumes paused/unready/unloaded events without replaying them after readiness or resume', async () => {
  const h = harness();
  expect(h.event(1)).toBe(false);
  const ready = deferred(); h.backend.prepare = () => ready.promise;
  h.audio.setActive(true);
  expect(h.event(2)).toBe(false);
  ready.resolve(); await h.audio.whenReady();
  for (const player of h.of('mechanism')) Object.assign(player, { isLoaded: false });
  expect(h.event(3)).toBe(false);
  for (const player of h.of('mechanism')) Object.assign(player, { isLoaded: true });
  h.audio.setActive(false);
  expect(h.event(4)).toBe(false);
  h.audio.setActive(true);
  expect(h.event(4)).toBe(false);
  await flush();
  expect(h.count('mechanism')).toBe(0);
  expect(h.event(5)).toBe(true);
  await flush(); expect(h.count('mechanism')).toBe(1);
});

it.each(['pause', 'background', 'render failure', 'screen leave'])('cancels pending native seeks immediately on %s', async (reason) => {
  const h = harness(); h.audio.setActive(true); await h.audio.whenReady();
  const seek = deferred(); h.of('mechanism')[0]!.seekTo.mockImplementation(() => seek.promise);
  h.event(1);
  if (reason === 'screen leave') h.audio.dispose(); else h.audio.setActive(false);
  expect(h.players.every((player) => player.pause.mock.calls.length > 0)).toBe(true);
  if (reason !== 'screen leave') h.audio.setActive(true);
  seek.resolve(); await flush();
  expect(h.count('mechanism')).toBe(0);
  expect(h.audio.event({ sessionId: 'visit-1', sequence: 1, type: 'unlock' })).toBe(false);
});

it('only uses actual traveled distance: stationary wall pushes, stale sessions, invalid deltas, and teleport jumps are silent', async () => {
  const h = harness(); h.audio.setActive(true); await h.audio.whenReady();
  for (let i = 0; i < 100; i += 1) h.audio.movement(0, 'visit-1');
  h.audio.movement(0.7, 'old-visit');
  for (const distance of [NaN, Infinity, -1, 4]) h.audio.movement(distance, 'visit-1');
  await flush(); expect(h.count('footstep')).toBe(0);
  h.audio.movement(FOOTSTEP_DISTANCE_METERS / 2, 'visit-1');
  await flush(); expect(h.count('footstep')).toBe(0);
  h.audio.movement(FOOTSTEP_DISTANCE_METERS / 2, 'visit-1');
  await flush(); expect(h.count('footstep')).toBe(1);
  h.audio.movement(0.6, 'visit-1'); h.audio.setActive(false); h.audio.setActive(true);
  h.audio.movement(0.1, 'visit-1'); await flush();
  expect(h.count('footstep')).toBe(1);
});

it('mutes every player, cancels pending cues and movement, then restores independently selected channel levels', async () => {
  const h = harness(); h.audio.setActive(true); await h.audio.whenReady();
  const seek = deferred(); h.of('interaction')[0]!.seekTo.mockImplementation(() => seek.promise);
  h.event(1, 'interaction');
  h.audio.updatePreferences({ enabled: false, musicVolume: 0.2, effectsVolume: 0.7 });
  h.event(2); h.audio.movement(0.8, 'visit-1');
  seek.resolve(); await flush();
  expect(h.count('interaction')).toBe(0); expect(h.count('footstep')).toBe(0);
  h.audio.updatePreferences({ enabled: true, musicVolume: 0, effectsVolume: 0.4 });
  expect(h.of('ambience')[0]!.volume).toBe(0);
  expect(h.of('mechanism')[0]!.volume).toBe(0.4);
  expect(h.event(2)).toBe(false);
  h.event(3); await flush(); expect(h.count('mechanism')).toBe(1);
  h.audio.updatePreferences({ enabled: true, musicVolume: 0.3, effectsVolume: 0 });
  expect(h.of('ambience')[0]!.volume).toBeCloseTo(0.18);
  expect(h.of('mechanism').every((p) => p.volume === 0)).toBe(true);
  h.event(4); await flush(); expect(h.count('mechanism')).toBe(1);
});

it('invalidates an earlier seek when the same pool slot is reused', async () => {
  const h = harness(); h.audio.setActive(true); await h.audio.whenReady();
  const seek = deferred(); h.of('mechanism')[0]!.seekTo.mockImplementationOnce(() => seek.promise);
  h.event(1); h.event(2); h.event(3);
  await flush(); expect(h.count('mechanism')).toBe(2);
  seek.resolve(); await flush(); expect(h.count('mechanism')).toBe(2);
});

it('drops a stalled seek instead of playing a historical cue much later', async () => {
  const h = harness(); h.audio.setActive(true); await h.audio.whenReady();
  const seek = deferred(); h.of('mechanism')[0]!.seekTo.mockImplementation(() => seek.promise);
  const now = jest.spyOn(Date, 'now').mockReturnValue(1000);
  h.event(1); now.mockReturnValue(2000); seek.resolve(); await flush();
  expect(h.count('mechanism')).toBe(0);
  now.mockRestore();
});

it('a silent initial preference allocates nothing, and late prepare after disposal cannot create players', async () => {
  const muted = harness({ preferences: { ...DEFAULT_AUDIO_PREFERENCES, enabled: false } });
  muted.audio.setActive(true); await muted.audio.whenReady();
  expect(muted.players).toHaveLength(0);
  const h = harness(); const ready = deferred(); h.backend.prepare = () => ready.promise;
  h.audio.setActive(true); const pending = h.audio.whenReady(); h.audio.dispose();
  ready.resolve(); await pending;
  expect(h.players).toHaveLength(0);
});

it('stops partial initialization and releases all owned players even when one release throws', async () => {
  const onAvailability = jest.fn();
  const h = harness({ onAvailability });
  const create = h.backend.createPlayer;
  h.backend.createPlayer = (source) => {
    if (h.players.length === 3) throw new Error('Native allocation failed');
    const player = create(source);
    if (h.players.length === 1) h.players[0]!.release.mockImplementation(() => { throw new Error('Release failed'); });
    return player;
  };
  h.audio.setActive(true); await h.audio.whenReady();
  expect(h.players).toHaveLength(3);
  expect(h.players.every((player) => player.release.mock.calls.length === 1)).toBe(true);
  expect(h.audio.getDiagnostics()).toMatchObject({ availability: 'unavailable', players: 0 });
  expect(onAvailability.mock.calls).toEqual([['available'], ['unavailable']]);
  expect(() => h.event(1)).not.toThrow();
});

it('audio rejection is isolated, while a disposed owner never publishes a late failure', async () => {
  const onAvailability = jest.fn();
  const h = harness({ onAvailability }); h.audio.setActive(true); await h.audio.whenReady();
  const seek = deferred(); h.of('mechanism')[0]!.seekTo.mockImplementation(() => seek.promise);
  h.event(1); h.audio.dispose(); seek.reject(new Error('Old native callback')); await flush();
  expect(onAvailability.mock.calls).toEqual([['available']]);
  const other = harness(); other.audio.setActive(true); await other.audio.whenReady();
  other.of('mechanism')[0]!.play.mockImplementation(() => { throw new Error('Playback failed'); });
  other.event(1); await flush();
  expect(other.audio.getDiagnostics()).toMatchObject({ availability: 'unavailable', players: 0 });
});

it('uses world-source distance attenuation without raising the user effect gain', async () => {
  const h = harness(); h.audio.setActive(true); await h.audio.whenReady();
  h.audio.setListenerPosition({ x: 0, y: 1.6, z: 0 });
  expect(h.audio.event({ sessionId: 'visit-1', sequence: 1, type: 'door', position: { x: 6, y: 1.6, z: 0 } })).toBe(true);
  await flush(); expect(h.of('mechanism')[0]!.volume).toBeCloseTo(DEFAULT_AUDIO_PREFERENCES.effectsVolume * 0.5);
  expect(h.audio.event({ sessionId: 'visit-1', sequence: 2, type: 'door', position: { x: 20, y: 1.6, z: 0 } })).toBe(false);
  expect(h.audio.event({ sessionId: 'visit-1', sequence: 3, type: 'door', position: { x: NaN, y: 1.6, z: 0 } })).toBe(false);
});

it('ten visit/dispose cycles keep the total live player count at zero', async () => {
  const visits = [];
  for (let i = 0; i < 10; i += 1) {
    const h = harness({ sessionId: `visit-${i}` });
    h.audio.setActive(true); await h.audio.whenReady(); h.audio.dispose(); visits.push(h);
  }
  expect(visits.flatMap((h) => h.players).filter((p) => p.release.mock.calls.length !== 1)).toEqual([]);
  expect(visits.reduce((n, h) => n + h.audio.getDiagnostics().players, 0)).toBe(0);
});
