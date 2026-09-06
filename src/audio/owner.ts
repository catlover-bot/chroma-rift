import { normalizeAudioPreferences } from './preferences';
import type { AudioBackend, AudioPlayerPort, AudioPosition, AudioSourceId, GalleryAudio, GalleryAudioOptions, GallerySoundEvent } from './types';

export const FOOTSTEP_DISTANCE_METERS = 0.65;
export const MAX_AUDIO_TRAVEL_PER_UPDATE = 1;
export const MAX_EVENT_START_DELAY_MS = 250;
export const AUDIO_POOL_SIZE: Readonly<Record<AudioSourceId, number>> = Object.freeze({ footstep: 2, interaction: 2, mechanism: 2, ambience: 1 });
const SOURCE_GAIN: Readonly<Record<AudioSourceId, number>> = { footstep: 0.6, interaction: 0.8, mechanism: 1, ambience: 0.6 };
type Slot = { source: AudioSourceId; player: AudioPlayerPort; token: number; gain: number };
const validPosition = (p: AudioPosition) => [p.x, p.y, p.z].every(Number.isFinite);

/** One screen-session owns a fixed pool. There is no timer, deferred cue queue,
 * global audio activation toggle, or dependency on game success in this owner. */
export function createGalleryAudioOwner(options: GalleryAudioOptions, backend: AudioBackend): GalleryAudio {
  let preferences = normalizeAudioPreferences(options.preferences);
  let availability = backend.availability;
  let disposed = false;
  let active = false;
  let configured = false;
  let preparation: Promise<void> | undefined;
  let slots: Slot[] = [];
  let epoch = 0;
  let lastSequence = -1;
  let walked = 0;
  let ambiencePlaying = false;
  let listener: AudioPosition | undefined;
  let playedEvents = 0;
  let droppedEvents = 0;
  const nextSlot: Record<AudioSourceId, number> = { footstep: 0, interaction: 0, mechanism: 0, ambience: 0 };
  const playable = () => !disposed && active && preferences.enabled && availability === 'available';
  const volumeFor = (slot: Slot) => slot.gain * (slot.source === 'ambience' ? preferences.musicVolume : preferences.effectsVolume);
  function reportAvailability() {
    // Presentation callbacks cannot break playback cleanup or the game loop.
    try { options.onAvailability?.(availability); } catch { /* UI reports are optional. */ }
  }
  function stopAll() {
    epoch += 1;
    walked = 0;
    ambiencePlaying = false;
    for (const slot of slots) {
      slot.token += 1;
      try { slot.player.pause(); } catch { /* Continue releasing the remaining players. */ }
    }
  }
  function releaseAll() {
    stopAll();
    for (const slot of slots) {
      try { slot.player.release(); } catch { /* A broken player must not leak its siblings. */ }
    }
    slots = [];
  }
  function failAudio() {
    if (!disposed && availability !== 'unavailable') {
      availability = 'unavailable';
      releaseAll();
      reportAvailability();
    }
  }
  function syncAmbience() {
    if (!playable()) return;
    const ambient = slots.find((slot) => slot.source === 'ambience');
    if (!ambient) return;
    try {
      ambient.player.volume = volumeFor(ambient);
      if (preferences.musicVolume > 0 && !ambiencePlaying) {
        // Current ambient state may buffer; transient event sounds never queue while unloaded.
        ambient.player.play();
        ambiencePlaying = true;
      } else if (preferences.musicVolume === 0 && ambiencePlaying) {
        ambient.player.pause();
        ambiencePlaying = false;
      }
    } catch { failAudio(); }
  }
  function prepare() {
    if (!playable() || slots.length > 0 || preparation) return;
    preparation = (async () => {
      try {
        if (!configured) { await backend.prepare(); configured = true; }
        if (!playable()) return;
        for (const source of Object.keys(AUDIO_POOL_SIZE) as AudioSourceId[]) {
          for (let count = 0; count < AUDIO_POOL_SIZE[source]; count += 1) {
            const player = backend.createPlayer(source);
            // Register ownership before configuring, so a throwing setter still gets released.
            const slot: Slot = { source, player, token: 0, gain: SOURCE_GAIN[source] };
            slots.push(slot);
            player.volume = 0;
            player.loop = source === 'ambience';
            player.volume = volumeFor(slot);
          }
        }
        syncAmbience();
      } catch { failAudio(); }
    })().finally(() => { preparation = undefined; });
  }
  function emit(source: Exclude<AudioSourceId, 'ambience'>, gain = 1): boolean {
    if (!playable() || preferences.effectsVolume === 0 || slots.length === 0 || gain <= 0) { droppedEvents += 1; return false; }
    const pool = slots.filter((slot) => slot.source === source);
    const slot = pool[nextSlot[source] % pool.length];
    if (!slot) { droppedEvents += 1; return false; }
    nextSlot[source] += 1;
    const currentEpoch = epoch;
    const requestedAt = Date.now();
    const token = ++slot.token;
    try {
      if (!slot.player.isLoaded) { droppedEvents += 1; return false; }
      slot.player.pause();
      slot.gain = SOURCE_GAIN[source] * gain;
      slot.player.volume = volumeFor(slot);
      // A seek may finish after pause, mute, a reused pool slot, or screen disposal.
      void slot.player.seekTo(0).then(() => {
        const delay = Date.now() - requestedAt;
        if (!playable() || epoch !== currentEpoch || slot.token !== token || preferences.effectsVolume === 0 || delay < 0 || delay > MAX_EVENT_START_DELAY_MS) return;
        try { slot.player.play(); playedEvents += 1; } catch { failAudio(); }
      }).catch(() => { if (epoch === currentEpoch && slot.token === token) failAudio(); });
      return true;
    } catch { failAudio(); return false; }
  }
  function attenuation(position: AudioPosition | undefined): number {
    if (!position) return 1;
    if (!validPosition(position)) return 0;
    if (!listener) return 1;
    // Only attenuation, never boosting above the user's chosen effect level.
    const distance = Math.hypot(position.x - listener.x, position.y - listener.y, position.z - listener.z);
    return Math.max(0, Math.min(1, (10 - distance) / 8));
  }
  reportAvailability();
  return {
    setActive(next) {
      if (disposed || active === next) return;
      active = next;
      if (!active) stopAll();
      else { prepare(); syncAmbience(); }
    },
    updatePreferences(next) {
      if (disposed) return;
      const previous = preferences;
      preferences = normalizeAudioPreferences(next);
      if (!preferences.enabled) { stopAll(); return; }
      if (previous.effectsVolume > 0 && preferences.effectsVolume === 0) {
        walked = 0;
        for (const slot of slots) {
          if (slot.source === 'ambience') continue;
          slot.token += 1;
          try { slot.player.pause(); } catch { /* Muting is still applied below. */ }
        }
      }
      try { for (const slot of slots) slot.player.volume = volumeFor(slot); } catch { failAudio(); }
      prepare();
      syncAmbience();
    },
    event(event: GallerySoundEvent) {
      if (disposed || event.sessionId !== options.sessionId || !Number.isSafeInteger(event.sequence) || event.sequence < 0 || event.sequence <= lastSequence) return false;
      if (!['interaction', 'unlock', 'door'].includes(event.type)) return false;
      // Consume even silent/paused/unready events: resuming never replays missed work.
      lastSequence = event.sequence;
      return emit(event.type === 'interaction' ? 'interaction' : 'mechanism', attenuation(event.position));
    },
    movement(distanceMeters, sessionId) {
      if (sessionId !== options.sessionId || !playable() || slots.length === 0 || preferences.effectsVolume === 0) { walked = 0; return; }
      if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > MAX_AUDIO_TRAVEL_PER_UPDATE) { walked = 0; return; }
      if (distanceMeters === 0) return;
      walked += distanceMeters;
      if (walked >= FOOTSTEP_DISTANCE_METERS) {
        walked %= FOOTSTEP_DISTANCE_METERS;
        emit('footstep');
      }
    },
    setListenerPosition(position) { if (!disposed && validPosition(position)) listener = { ...position }; },
    dispose() { if (!disposed) { disposed = true; active = false; releaseAll(); } },
    whenReady() { return preparation ?? Promise.resolve(); },
    getDiagnostics() { return { availability, active, ready: slots.length > 0, players: slots.length, playedEvents, droppedEvents }; },
  };
}
