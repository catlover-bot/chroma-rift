import type { AudioBackend, AudioPlayerPort, MusicState } from './types';

export const MUSIC_DURATION_SECONDS = { title_theme: 54, exploration: 88, suspicion: 56, pursuit: 38, release: 10, chapter_end: 62 } as const;
const FADE_SECONDS = 1.6;
const MIN_RESIDENCE_SECONDS = 4;
type Voice = { state: Exclude<MusicState, 'silent'>; player: AudioPlayerPort; gain: number; started: boolean; age: number; waiting: number; appliedVolume: number };

/** One prepared mix per voice: two players maximum, no runtime stems or seek callbacks.
 * The owning presentation clock advances envelopes; suspension never accrues catch-up time. */
export function createMusicDirector(backend: AudioBackend, ready: () => boolean, onFailure: () => void) {
  let enabled = false;
  let volume = 0;
  let requested: MusicState = 'silent';
  let current: MusicState = 'silent';
  let requestedAge = 0;
  let residence = 0;
  let completed: MusicState | undefined;
  let voices: Voice[] = [];
  let fade = 0;
  let duckRemaining = 0;
  let duckGain = 1;
  let duckLevel = 1;
  function release(voice: Voice) {
    try { voice.player.pause(); } catch { /* Release all siblings even on native failure. */ }
    try { voice.player.release(); } catch { /* Ownership still ends here. */ }
  }
  function silence() { voices.forEach(release); voices = []; current = 'silent'; residence = fade = 0; }
  function fail() { enabled = false; requested = 'silent'; silence(); onFailure(); }
  function applyVolumes() {
    try { for (const voice of voices) {
      const next = enabled ? volume * voice.gain * duckLevel : 0;
      if (Math.abs(voice.appliedVolume - next) >= .001 || next === 0 && voice.appliedVolume !== 0) { voice.player.volume = next; voice.appliedVolume = next; }
    } }
    catch { fail(); }
  }
  function start(state: Exclude<MusicState, 'silent'>) {
    if (voices.length >= 2) return;
    try {
      const player = backend.createPlayer(state);
      const voice: Voice = { state, player, gain: voices.length ? 0 : 1, started: false, age: 0, waiting: 0, appliedVolume: 0 };
      voices.push(voice); // Own before a native property setter can throw.
      player.volume = 0;
      player.loop = state !== 'release' && state !== 'chapter_end';
      current = state; residence = fade = 0;
    } catch { fail(); }
  }
  return {
    setEnabled(next: boolean) {
      enabled = next;
      if (!next) { silence(); requested = 'silent'; completed = undefined; requestedAge = duckRemaining = 0; duckGain = duckLevel = 1; }
    },
    setVolume(next: number) {
      if (next === volume) return;
      volume = Math.max(0, Math.min(1, Number.isFinite(next) ? next : 0));
      if (volume === 0) { silence(); requested = 'silent'; completed = undefined; }
      else applyVolumes();
    },
    setState(next: MusicState) {
      if (!enabled || volume === 0 || requested === next) return;
      requested = next; requestedAge = 0; completed = undefined;
      // Safety/ending must never leave a pursuit bed sounding behind a contained actor.
      if (next === 'silent' || next === 'release' || next === 'chapter_end') silence();
    },
    duck(seconds: number, gain: number) {
      if (!Number.isFinite(seconds) || !Number.isFinite(gain) || seconds <= 0) return;
      duckRemaining = Math.max(duckRemaining, Math.min(10, seconds));
      duckGain = Math.min(duckGain, Math.max(0, Math.min(1, gain)));
      duckLevel = Math.min(duckLevel, duckGain); applyVolumes();
    },
    advance(deltaSeconds: number) {
      if (!enabled || volume === 0 || !ready() || !Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 1) return;
      const dt = deltaSeconds;
      requestedAge += dt; residence += dt;
      duckRemaining = Math.max(0, duckRemaining - dt);
      if (duckRemaining > 0) duckLevel = duckGain;
      else { duckGain = 1; duckLevel = Math.min(1, duckLevel + dt / .8); }
      const urgent = requested === 'release' || requested === 'chapter_end';
      const delay = requested === 'pursuit' ? .2 : requested === 'suspicion' ? 1.2 : 2.8;
      const finishingRelease = current === 'release' && voices.some((voice) => voice.state === 'release' && voice.age < MUSIC_DURATION_SECONDS.release) && requested === 'exploration';
      if (!finishingRelease && requested !== 'silent' && requested !== current && requested !== completed && voices.length < 2 &&
          (current === 'silent' || urgent || requestedAge >= delay && residence >= (requested === 'pursuit' ? 1 : MIN_RESIDENCE_SECONDS))) start(requested);
      try {
        for (const voice of voices) {
          if (!voice.started) {
            voice.waiting += dt;
            if (voice.player.isLoaded) { voice.player.play(); voice.started = true; }
            else if (voice.waiting > 5) throw new Error('Music load deadline exceeded');
          } else voice.age += dt;
        }
        if (voices.length === 2 && voices[1]!.started) {
          fade = Math.min(FADE_SECONDS, fade + dt);
          voices[0]!.gain = 1 - fade / FADE_SECONDS; voices[1]!.gain = fade / FADE_SECONDS;
          if (fade >= FADE_SECONDS) { release(voices[0]!); voices.shift(); }
        }
        const latest = voices[voices.length - 1];
        if (latest && (latest.state === 'release' || latest.state === 'chapter_end') && latest.age >= MUSIC_DURATION_SECONDS[latest.state]) {
          completed = latest.state; silence();
        }
        applyVolumes();
      } catch { fail(); }
    },
    dispose() { enabled = false; silence(); requested = 'silent'; },
    getDiagnostics() { return { state: current, requested, players: voices.length, duckGain: duckLevel, completed }; },
  };
}
