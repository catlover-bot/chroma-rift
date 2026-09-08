import { GALLERY_ACTOR_STEP_DISTANCE } from '../domain/gallery/actor';
import { normalizeAudioPreferences } from './preferences';
import type { AudioBackend, AudioPlayerPort, AudioPosition, AudioSourceId, GalleryAudio, GalleryAudioOptions, GallerySoundEvent } from './types';

export const FOOTSTEP_DISTANCE_METERS = 0.65;
export const MAX_AUDIO_TRAVEL_PER_UPDATE = 1;
export const MAX_EVENT_START_DELAY_MS = 250;
export const AUDIO_POOL_SIZE: Readonly<Record<AudioSourceId, number>> = Object.freeze({ footstep: 2, interaction: 2, mechanism: 2, ambience: 1, cloth: 1, 'door-impact': 1, shepard: 1 });
const SOURCE_GAIN: Readonly<Record<AudioSourceId, number>> = { footstep: 0.6, interaction: 0.8, mechanism: 1, ambience: 0.6, cloth: .35, 'door-impact': .7, shepard: .45 };
type Slot = { source: AudioSourceId; player: AudioPlayerPort; token: number; gain: number };
const validPosition = (p: AudioPosition) => [p.x, p.y, p.z].every(Number.isFinite);

/** One screen-session owns a fixed pool. There is no timer, deferred cue queue,
 * global audio activation toggle, or dependency on game success in this owner. */
export function createGalleryAudioOwner(options: GalleryAudioOptions, backend: AudioBackend): GalleryAudio {
  let preferences = normalizeAudioPreferences(options.preferences);
  let availability = backend.availability;
  let disposed = false;
  let active = false;
  let previewActive = false;
  let ending = false;
  let configured = false;
  let preparation: Promise<void> | undefined;
  let slots: Slot[] = [];
  let epoch = 0;
  let lastSequence = -1;
  let walked = 0;
  let actorWalked = 0;
  let ambiencePlaying = false;
  let listener: AudioPosition | undefined;
  let playedEvents = 0;
  let droppedEvents = 0;
  const nextSlot: Record<AudioSourceId, number> = { footstep: 0, interaction: 0, mechanism: 0, ambience: 0, cloth: 0, 'door-impact': 0, shepard: 0 };
  const playable = () => !disposed && active && preferences.enabled && availability === 'available';
  const preparable = () => !disposed && (active || previewActive) && preferences.enabled && availability === 'available';
  const canEmit = (source: AudioSourceId) => source === 'shepard' ? preparable() && preferences.illusionEnabled !== false : playable();
  function stopIllusion() {
    for (const slot of slots) if (slot.source === 'shepard') {
      slot.token += 1;
      try { slot.player.pause(); } catch { /* Still invalidate all pending callbacks. */ }
    }
  }
  const volumeFor = (slot: Slot) => slot.gain * (slot.source === 'ambience' ? preferences.musicVolume : preferences.effectsVolume);
  function reportAvailability() {
    // Presentation callbacks cannot break playback cleanup or the game loop.
    try { options.onAvailability?.(availability); } catch { /* UI reports are optional. */ }
  }
  function stopAll() {
    epoch += 1;
    walked = actorWalked = 0;
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
    if (!playable() || ending) return;
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
    if (!preparable() || slots.length > 0 || preparation) return;
    preparation = (async () => {
      try {
        if (!configured) { await backend.prepare(); configured = true; }
        if (!preparable()) return;
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
  function emit(source: Exclude<AudioSourceId, 'ambience'>, gain = 1, onStarted?: () => void): boolean {
    if (!canEmit(source) || preferences.effectsVolume === 0 || slots.length === 0 || gain <= 0) { droppedEvents += 1; return false; }
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
        if (!canEmit(source) || epoch !== currentEpoch || slot.token !== token || preferences.effectsVolume === 0 || delay < 0 || delay > MAX_EVENT_START_DELAY_MS) return;
        try { slot.player.play(); playedEvents += 1; } catch { failAudio(); return; }
        try { onStarted?.(); } catch { /* Optional reporting must not break playback cleanup. */ }
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
      if (disposed || active === next && !previewActive) return;
      if (previewActive) stopAll();
      previewActive = false;
      active = next;
      if (!active) stopAll();
      else { prepare(); syncAmbience(); }
    },
    setPreviewActive(next) {
      if (disposed || previewActive === next) return;
      stopAll();
      active = false; previewActive = next;
      if (next) prepare();
    },
    playIllusion(sessionId, intensity, onStarted) {
      if (sessionId !== options.sessionId || intensity !== 'standard' || preferences.illusionEnabled === false) return false;
      // One finite 12 s WAV per explicit request; no runtime infinite loop.
      return emit('shepard', 1, onStarted);
    },
    stopIllusion,
    beginEnding() { if (!disposed) { stopAll(); ending = true; } },
    updatePreferences(next) {
      if (disposed) return;
      const previous = preferences;
      preferences = normalizeAudioPreferences(next);
      if (preferences.illusionEnabled === false) stopIllusion();
      if (!preferences.enabled) { stopAll(); return; }
      if (previous.effectsVolume > 0 && preferences.effectsVolume === 0) {
        walked = actorWalked = 0;
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
      if (!['interaction', 'unlock', 'door', 'door-close', 'actor-plant'].includes(event.type)) return false;
      // Consume even silent/paused/unready events: resuming never replays missed work.
      lastSequence = event.sequence;
      if (event.type === 'door-close') { stopAll(); ending = true; }
      if (event.type === 'actor-plant') {
        if (!event.position || !validPosition(event.position)) return false;
        const gain = attenuation(event.position);
        const accepted = emit('footstep', gain);
        emit('cloth', gain);
        return accepted;
      }
      return emit(event.type === 'interaction' ? 'interaction' : event.type === 'door-close' ? 'door-impact' : 'mechanism', attenuation(event.position));
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
    stopMovement() {
      walked = actorWalked = 0;
      for (const slot of slots) if (slot.source === 'footstep' || slot.source === 'cloth') {
        slot.token += 1;
        try { slot.player.pause(); } catch { /* Continue stopping other movement slots. */ }
      }
    },
    actorMovement(distanceMeters, position, sessionId) {
      if (sessionId !== options.sessionId || !playable() || slots.length === 0 || preferences.effectsVolume === 0) { actorWalked = 0; return; }
      if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > MAX_AUDIO_TRAVEL_PER_UPDATE || !validPosition(position)) { actorWalked = 0; return; }
      actorWalked += distanceMeters;
      if (actorWalked >= GALLERY_ACTOR_STEP_DISTANCE) {
        actorWalked %= GALLERY_ACTOR_STEP_DISTANCE;
        emit('footstep', attenuation(position));
        emit('cloth', attenuation(position));
      }
    },
    setListenerPosition(position) { if (!disposed && validPosition(position)) listener = { ...position }; },
    dispose() { if (!disposed) { disposed = true; active = previewActive = false; releaseAll(); } },
    whenReady() { return preparation ?? Promise.resolve(); },
    getDiagnostics() { return { availability, active, ready: slots.length > 0, players: slots.length, playedEvents, droppedEvents }; },
  };
}
