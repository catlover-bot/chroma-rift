import type { AudioSourceId } from '../types';

const FILES: Record<AudioSourceId, string> = {
  footstep: 'footstep.wav', interaction: 'interaction.wav', mechanism: 'mechanism.wav', ambience: 'ambience.wav', cloth: 'cloth.wav', 'door-impact': 'door-impact.wav', shepard: 'shepard.wav',
  title_theme: 'music/title_theme.m4a', exploration: 'music/exploration.m4a', suspicion: 'music/suspicion.m4a', pursuit: 'music/pursuit.m4a', release: 'music/release.m4a', chapter_end: 'music/chapter_end.m4a',
  grip: 'physical/grip.wav', key: 'physical/key.wav', ratchet: 'physical/ratchet.wav', bell: 'physical/bell.wav', isolation: 'physical/isolation.wav', power: 'physical/power.wav',
  'step-a': 'physical/step-a.wav', 'step-b': 'physical/step-b.wav', 'cloth-metal': 'physical/cloth-metal.wav', outdoor: 'physical/outdoor.wav', 'room-gallery': 'physical/room-gallery.wav',
  'room-vault': 'physical/room-vault.wav', 'room-theatre': 'physical/room-theatre.wav', 'room-mirror': 'physical/room-mirror.wav', 'room-control': 'physical/room-control.wav',
};

/** The installed Jest asset transform returns 1 for every file. These local-only
 * mocks distinguish the actual literal files; the production source registry is used unchanged. */
export function mockStaticAudioAssets() {
  for (const [source, file] of Object.entries(FILES)) jest.doMock(`../../../assets/audio/${file}`, () => source);
}

export function deferredAudioOperation() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
type Deferred = ReturnType<typeof deferredAudioOperation>;
export type FakeAudioStatus = {
  isLoaded: boolean; playing: boolean; currentTime: number; duration: number;
  isBuffering: boolean; didJustFinish: boolean; error: string | null;
  playbackState: string; timeControlStatus: string; mediaServicesDidReset?: boolean;
};
export type SharedAudioPlayer = {
  source: AudioSourceId; isLoaded: boolean; playing: boolean; currentTime: number; duration: number;
  isBuffering: boolean; volume: number; loop: boolean; released: boolean; requested: boolean; wasPlaying: boolean;
  keepAudioSessionActive: boolean; currentStatus: FakeAudioStatus; error: string | null;
  play: jest.Mock<void, []>; pause: jest.Mock<void, []>; release: jest.Mock<void, []>;
  seekTo: jest.Mock<Promise<void>, [number]>;
  addListener(event: string, listener: (status: FakeAudioStatus) => void): { remove(): void };
  notify(patch?: Partial<FakeAudioStatus>): void;
};
const durations: Partial<Record<AudioSourceId, number>> = { title_theme: 54, exploration: 88, suspicion: 56, pursuit: 38, release: 10, chapter_end: 62, shepard: 12, ambience: 4 };

/** Contract fixture, not AVFoundation execution. Corresponds to installed
 * expo-audio 57.0.5 AudioModule.swift: play activates; pause/finite completion
 * schedule a 100ms no-playing-registry check unless keepAudioSessionActive;
 * global false pauses all; route removal pauses; interruption resumes only when allowed.
 * Buffering models the conditional no-playing window, not a proven device failure. */
export function createSharedNativeAudioHarness(options: {
  immediateSeeks?: boolean; initiallyLoaded?: boolean;
  sources?: Readonly<Record<AudioSourceId, unknown>>;
} = {}) {
  let time = 0, active = true, maximum = 0;
  const players: SharedAudioPlayer[] = [];
  const events: { time: number; operation: string; source?: AudioSourceId; active?: boolean }[] = [];
  const delayedOff: number[] = [];
  const pendingPrepare: Deferred[] = [], pendingActivation: Deferred[] = [], pendingSeek: Deferred[] = [];
  const listeners = new Map<SharedAudioPlayer, Set<(status: FakeAudioStatus) => void>>();
  const record = (operation: string, player?: SharedAudioPlayer) => events.push({ time, operation, ...(player ? { source: player.source } : {}), active });
  const live = () => players.filter(p => !p.released);
  const scheduleOff = (player: SharedAudioPlayer) => { if (!player.keepAudioSessionActive) delayedOff.push(time + .1); };
  const identify = (value: unknown): AudioSourceId => {
    const entries = options.sources ? Object.entries(options.sources).filter(([, asset]) => asset === value) : Object.keys(FILES).filter(source => source === value).map(source => [source]);
    if (entries.length !== 1) throw new Error('Fixture requires distinct static audio asset identities');
    return entries[0]![0] as AudioSourceId;
  };
  function pauseAll() {
    for (const p of live()) if (p.playing) { p.wasPlaying = true; p.playing = false; p.requested = false; p.notify(); }
  }
  const module = {
    setAudioModeAsync: jest.fn(async (_mode: unknown) => { record('mode'); await pendingPrepare.shift()?.promise; }),
    setIsAudioActiveAsync: jest.fn(async (next: boolean) => {
      record(next ? 'activate-request' : 'deactivate-request');
      await pendingActivation.shift()?.promise;
      if (!next) pauseAll();
      active = next; record(next ? 'activate-return' : 'deactivate-return');
    }),
    createAudioPlayer: jest.fn((asset: unknown, opts: { keepAudioSessionActive?: boolean } = {}) => {
      const source = identify(asset);
      const p: SharedAudioPlayer = {
        source, isLoaded: options.initiallyLoaded !== false, playing: false, currentTime: 0, duration: durations[source] ?? 1,
        isBuffering: false, volume: 1, loop: false, released: false, requested: false, wasPlaying: false,
        keepAudioSessionActive: opts.keepAudioSessionActive === true, error: null,
        get currentStatus() { return { isLoaded: p.isLoaded, playing: p.playing, currentTime: p.currentTime, duration: p.duration, isBuffering: p.isBuffering,
          didJustFinish: false, error: null, playbackState: p.error ? 'failed' : p.isLoaded ? 'readyToPlay' : 'unknown', timeControlStatus: p.playing ? 'playing' : p.isBuffering ? 'waitingToPlayAtSpecifiedRate' : 'paused' }; },
        play: jest.fn(() => {
          if (p.released) throw new Error('Released player');
          active = true; p.requested = true; p.playing = p.isLoaded && !p.isBuffering; record('play', p); p.notify();
        }),
        pause: jest.fn(() => { p.playing = p.requested = false; record('pause', p); p.notify(); scheduleOff(p); }),
        release: jest.fn(() => { p.playing = p.requested = false; p.released = true; listeners.delete(p); record('release', p); }),
        seekTo: jest.fn((seconds: number) => {
          record('seek', p);
          const deferred = pendingSeek.shift();
          if (deferred) return deferred.promise.then(() => { p.currentTime = seconds; p.notify(); });
          p.currentTime = seconds; p.notify();
          if (!options.immediateSeeks) return Promise.resolve();
          // Explicit integration-only zero-latency completion, never native timing evidence.
          return Object.assign(Promise.resolve(), { then: (fulfilled?: ((value: void) => unknown) | null) => {
            try { return Promise.resolve(fulfilled?.()); } catch (error) { return Promise.reject(error); }
          } });
        }),
        addListener(_event, listener) {
          const set = listeners.get(p) ?? new Set(); listeners.set(p, set); set.add(listener);
          return { remove() { set.delete(listener); if (!set.size) listeners.delete(p); } };
        },
        notify(patch = {}) { for (const listener of listeners.get(p) ?? []) listener({ ...p.currentStatus, ...(p.error ? { error: p.error } : {}), ...patch }); },
      };
      players.push(p); maximum = Math.max(maximum, live().length); record('create', p); return p;
    }),
  };
  return {
    module, players, events, live,
    get activeSession() { return active; }, get maxLivePlayers() { return maximum; },
    get subscriptions() { return [...listeners.values()].reduce((n, set) => n + set.size, 0); },
    get pendingNativeDeactivations() { return delayedOff.length; },
    advanceSeconds(dt: number) {
      time += dt;
      for (const p of live()) if (p.playing && active) {
        p.currentTime += dt;
        if (p.currentTime >= p.duration) {
          if (p.loop) p.currentTime %= p.duration;
          else { p.currentTime = p.duration; p.playing = p.requested = false; scheduleOff(p); p.notify({ didJustFinish: true }); continue; }
        }
        p.notify();
      }
      for (let i = delayedOff.length - 1; i >= 0; i--) if (delayedOff[i]! <= time) {
        delayedOff.splice(i, 1);
        if (!live().some(p => p.playing)) { active = false; record('automatic-deactivate'); }
      }
    },
    completeBuffering(p: SharedAudioPlayer) { p.isLoaded = true; p.isBuffering = false; p.playing = p.requested && active; p.notify(); },
    deferNextPrepare() { const d = deferredAudioOperation(); pendingPrepare.push(d); return d; },
    deferNextActivation() { const d = deferredAudioOperation(); pendingActivation.push(d); return d; },
    deferNextSeek() { const d = deferredAudioOperation(); pendingSeek.push(d); return d; },
    interrupt({ resume }: { resume: boolean }) {
      const interrupted = live().filter(p => p.playing); pauseAll();
      // Models interruption begin followed by end: end activates even without shouldResume.
      active = true;
      if (resume) { for (const p of interrupted) { p.requested = p.playing = true; p.wasPlaying = false; p.notify(); } }
      record(resume ? 'interruption-resumed' : 'interruption-paused');
    },
    disconnectRoute() { pauseAll(); record('old-device-unavailable'); },
  };
}
