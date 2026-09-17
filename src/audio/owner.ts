import { GALLERY_ACTOR_STEP_DISTANCE } from '../domain/gallery/actor';
import { createMusicDirector } from './musicDirector';
import { normalizeAudioPreferences } from './preferences';
import { recordAudioEvent, recordAudioFailure, registerAudioOwner, retireAudioOwner, updateAudioOwner } from './diagnostics';
import type { AudioBackend, AudioEffectBus, AudioPlayerPort, AudioPlayerStatus, AudioPosition, AudioSourceId, MusicState, PhysicalSound, GalleryAudio, GalleryAudioOptions, GallerySoundEvent } from './types';

export const FOOTSTEP_DISTANCE_METERS = 0.65;
export const MAX_AUDIO_TRAVEL_PER_UPDATE = 1;
export const MAX_EVENT_START_DELAY_MS = 250;
export const AUDIO_POOL_SIZE: Readonly<Record<AudioEffectBus, number>> = Object.freeze({ footstep: 2, interaction: 2, mechanism: 2, ambience: 1, cloth: 1, 'door-impact': 1, shepard: 1 });
const SOURCE_GAIN: Readonly<Record<AudioEffectBus, number>> = { footstep: 0.6, interaction: 0.8, mechanism: 1, ambience: 0.6, cloth: .35, 'door-impact': .7, shepard: .45 };
type Slot = { source: AudioEffectBus; asset: AudioSourceId; player: AudioPlayerPort; token: number; gain: number };
const validPosition = (p: AudioPosition) => [p.x, p.y, p.z].every(Number.isFinite);

/** One screen-session owns a fixed pool. There is no timer, deferred cue queue,
 * global audio activation toggle, or dependency on game success in this owner. */
export function createGalleryAudioOwner(options: GalleryAudioOptions, backend: AudioBackend): GalleryAudio {
  const ownerId = registerAudioOwner(options);
  const lease = backend.acquireSession?.(ownerId);
  let playerCount = 0, recoveryAttempts = 0, activation = 0;
  let preferences = normalizeAudioPreferences(options.preferences);
  let availability = backend.availability;
  let disposed = false;
  let active = false;
  let previewActive = false;
  let ending = false;
  let configured = false;
  let sessionReady = !lease;
  let intendedMusic: MusicState = 'silent';
  let preparation: Promise<void> | undefined;
  let recovery: Promise<boolean> | undefined;
  let slots: Slot[] = [];
  let epoch = 0;
  let lastSequence = -1;
  let walked = 0;
  let actorWalked = 0;
  let ambiencePlaying = false;
  let environment: 'indoor' | 'outdoor' | 'silent' = 'indoor';
  const room: AudioSourceId = options.areaId?.includes('gallery') ? 'room-gallery' : options.areaId?.includes('vault') ? 'room-vault' : options.areaId?.includes('theatre') ? 'room-theatre' : options.areaId?.includes('mirror') ? 'room-mirror' : 'room-control';
  function assetFor(source: AudioEffectBus, index: number): AudioSourceId {
    if (source === 'ambience') return environment === 'outdoor' ? 'outdoor' : options.areaId ? room : 'ambience';
    if (!options.areaId) return source;
    if (source === 'footstep') return index % 2 ? 'step-b' : 'step-a';
    if (source === 'interaction') return index % 2 ? 'key' : 'grip';
    if (source === 'mechanism') return options.areaId.includes('departure') ? index % 2 ? 'power' : 'bell' : options.areaId.includes('theatre') ? index % 2 ? 'ratchet' : 'bell' : index % 2 ? 'power' : 'ratchet';
    // Legacy gallery/vault/theatre tails finish within one second; retain their short impact.
    if (source === 'door-impact') return options.areaId.includes('departure') ? 'isolation' : 'door-impact';
    if (source === 'cloth') return 'cloth-metal';
    return source;
  }
  let listener: AudioPosition | undefined;
  let playedEvents = 0;
  let droppedEvents = 0;
  const nextSlot: Record<AudioEffectBus, number> = { footstep: 0, interaction: 0, mechanism: 0, ambience: 0, cloth: 0, 'door-impact': 0, shepard: 0 };
  const hasVolume = () => options.musicOnly ? preferences.musicVolume > 0 : preferences.musicVolume > 0 || (preferences.environmentVolume ?? preferences.musicVolume) > 0 || preferences.effectsVolume > 0;
  const playable = () => !disposed && active && preferences.enabled && availability === 'available' && sessionReady;
  const preparable = () => !disposed && (active || previewActive) && preferences.enabled && availability === 'available';
  const canEmit = (source: AudioEffectBus) => source === 'shepard' ? preparable() && sessionReady && preferences.illusionEnabled !== false : playable();
  const event = (phase: string, fields: Parameters<typeof recordAudioEvent>[2] = {}) => recordAudioEvent(ownerId, phase, { generation: activation, ...fields });
  function createPlayer(source: AudioSourceId): AudioPlayerPort {
    const player = backend.createPlayer(source);
    playerCount++; updateAudioOwner(ownerId, { players: playerCount }); event('player-created', { source, players: playerCount });
    let released = false, lastStatus = '', lastSample = -Infinity;
    let statusError: string | null = null;
    const listeners = new Set<(status: AudioPlayerStatus) => void>();
    let unsubscribe: (() => void) | undefined;
    try { unsubscribe = player.subscribe?.(next => {
      if (released || disposed) { event('obsolete-status', { source }); return; }
      const key = [next.isLoaded, next.playing, next.isBuffering, next.didJustFinish, next.error].join(':');
      if (key !== lastStatus || Date.now() - lastSample >= 1000) {
        lastStatus = key; lastSample = Date.now();
        event('native-status', { source, isLoaded: next.isLoaded, playing: next.playing, currentTime: next.currentTime, isBuffering: next.isBuffering, didJustFinish: next.didJustFinish });
      }
      if (next.error) { statusError = next.error; recordAudioFailure(ownerId, new Error(next.error), 'player-status', source); }
      for (const listener of listeners) listener(next);
    }); } catch (error) {
      try { player.release(); } finally { playerCount--; updateAudioOwner(ownerId, { players: playerCount }); }
      throw error;
    }
    return {
      get isLoaded() { return player.isLoaded; }, get volume() { return player.volume; }, set volume(value) { player.volume = value; },
      get loop() { return player.loop; }, set loop(value) { player.loop = value; },
      play() { player.play(); event('play-request', { source }); }, pause() { player.pause(); }, seekTo(seconds) { return player.seekTo(seconds); },
      ...(player.getStatus ? { getStatus: () => {
        const current = player.getStatus!();
        // Swift currentStatus returns error:nil; retain failure emitted only by updateStatus.
        return statusError ? { ...current, error: statusError } : current;
      } } : {}),
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      release() {
        if (released) return;
        released = true;
        try { unsubscribe?.(); } catch (error) { recordAudioFailure(ownerId, error, 'subscription-release', source); }
        listeners.clear();
        try { player.release(); } finally { playerCount--; updateAudioOwner(ownerId, { players: playerCount }); event('player-released', { source, players: playerCount }); }
      },
    };
  }
  const music = createMusicDirector({ ...backend, createPlayer }, () => configured && playable(), (error, phase, source) => {
    recordAudioFailure(ownerId, error, phase, source); event('music-isolated', { source });
  }, (phase, fields) => event(phase, fields));
  function syncMusic() { music.setVolume(preferences.musicVolume); music.setEnabled(!disposed && active && preferences.enabled && availability === 'available'); }
  function stopIllusion() {
    for (const slot of slots) if (slot.source === 'shepard') {
      slot.token += 1;
      try { slot.player.pause(); } catch { /* Still invalidate all pending callbacks. */ }
    }
  }
  const volumeFor = (slot: Slot) => slot.gain * (slot.source === 'ambience' ? (preferences.environmentVolume ?? preferences.musicVolume) : preferences.effectsVolume);
  function reportAvailability() {
    event('backend-availability', { availability });
    // Presentation callbacks cannot break playback cleanup or the game loop.
    try { options.onAvailability?.(availability); } catch { /* UI reports are optional. */ }
  }
  function stopAll() {
    music.setEnabled(false);
    epoch += 1;
    walked = actorWalked = 0;
    ambiencePlaying = false;
    for (const slot of slots) {
      slot.token += 1;
      try { slot.player.volume = 0; slot.player.pause(); } catch { /* Continue releasing the remaining players. */ }
    }
  }
  function releaseAll() {
    stopAll();
    for (const slot of slots) {
      try { slot.player.release(); } catch { /* A broken player must not leak its siblings. */ }
    }
    slots = [];
  }
  function failAudio(error: unknown = new Error('Audio backend failed'), phase = 'backend') {
    if (!disposed && availability !== 'unavailable') {
      recordAudioFailure(ownerId, error, phase);
      availability = 'unavailable';
      sessionReady = false; activation++; lease?.deactivate('failure');
      releaseAll();
      reportAvailability();
    }
  }
  function syncAmbience() {
    if (!playable() || ending && environment !== 'outdoor' || environment === 'silent') return;
    const ambient = slots.find((slot) => slot.source === 'ambience');
    if (!ambient) return;
    try {
      ambient.player.volume = volumeFor(ambient);
      if ((preferences.environmentVolume ?? preferences.musicVolume) > 0 && !ambiencePlaying) {
        // Current ambient state may buffer; transient event sounds never queue while unloaded.
        ambient.player.play();
        ambiencePlaying = true;
      } else if ((preferences.environmentVolume ?? preferences.musicVolume) === 0 && ambiencePlaying) {
        ambient.player.pause();
        ambiencePlaying = false;
      }
    } catch (error) { failAudio(error, 'environment'); }
  }
  function prepare() {
    if (!preparable() || !hasVolume() || (slots.length > 0 || configured && options.musicOnly) && sessionReady || preparation) return;
    const generation = activation;
    event('prepare-start');
    preparation = (async () => {
      try {
        if (lease) sessionReady = await lease.activate();
        else if (!configured) await backend.prepare();
        if (!preparable() || generation !== activation || !sessionReady) { event('obsolete-prepare'); return; }
        configured = true;
        for (const source of (options.musicOnly || slots.length ? [] : Object.keys(AUDIO_POOL_SIZE)) as AudioEffectBus[]) {
          for (let count = 0; count < AUDIO_POOL_SIZE[source]; count += 1) {
            const asset = assetFor(source, count);
            const player = createPlayer(asset);
            // Register ownership before configuring, so a throwing setter still gets released.
            const slot: Slot = { source, asset, player, token: 0, gain: SOURCE_GAIN[source] };
            slots.push(slot);
            player.volume = 0;
            player.loop = source === 'ambience';
            player.volume = volumeFor(slot);
          }
        }
        syncAmbience();
        syncMusic(); music.advance(0);
        event('prepare-complete', { players: playerCount });
      } catch (error) { if (!disposed && generation === activation) failAudio(error, 'prepare'); else event('obsolete-prepare-failure'); }
    })().finally(() => { preparation = undefined; if (preparable() && generation !== activation) prepare(); });
  }
  function emit(source: Exclude<AudioEffectBus, 'ambience'>, gain = 1, onStarted?: () => void, variant?: PhysicalSound): boolean {
    if (!canEmit(source) || preferences.effectsVolume === 0 || slots.length === 0 || gain <= 0) { droppedEvents += 1; event('effect-dropped', { source, reason: 'inactive-muted-unready-or-distance' }); return false; }
    const pool = slots.filter((slot) => slot.source === source);
    const slot = variant ? slots.find((candidate) => candidate.asset === variant) ?? pool[nextSlot[source] % pool.length] : pool[nextSlot[source] % pool.length];
    if (!slot) { droppedEvents += 1; return false; }
    nextSlot[source] += 1;
    const currentEpoch = epoch;
    const requestedAt = Date.now();
    const token = ++slot.token;
    try {
      if (!slot.player.isLoaded) { droppedEvents += 1; event('effect-dropped', { source, reason: 'unloaded' }); return false; }
      slot.player.pause();
      slot.gain = SOURCE_GAIN[source] * gain;
      slot.player.volume = volumeFor(slot);
      // A seek may finish after pause, mute, a reused pool slot, or screen disposal.
      void slot.player.seekTo(0).then(() => {
        const delay = Date.now() - requestedAt;
        if (!canEmit(source) || epoch !== currentEpoch || slot.token !== token || preferences.effectsVolume === 0 || delay < 0 || delay > MAX_EVENT_START_DELAY_MS) { event('obsolete-seek', { source, delay }); return; }
        try { slot.player.play(); playedEvents += 1; } catch (error) { failAudio(error, 'effect-play'); return; }
        try { onStarted?.(); } catch { /* Optional reporting must not break playback cleanup. */ }
      }).catch(error => { if (epoch === currentEpoch && slot.token === token) failAudio(error, 'effect-seek'); else event('obsolete-seek-failure', { source }); });
      event('effect-accepted', { source, asset: slot.asset });
      return true;
    } catch (error) { failAudio(error, 'effect-request'); return false; }
  }
  function attenuation(position: AudioPosition | undefined): number {
    if (!position) return 1;
    if (!validPosition(position)) return 0;
    if (!listener) return 1;
    // Only attenuation, never boosting above the user's chosen effect level.
    const distance = Math.hypot(position.x - listener.x, position.y - listener.y, position.z - listener.z);
    return Math.max(0, Math.min(1, (10 - distance) / 8));
  }
  async function waitUntilReady() { while (preparation) await preparation; }
  reportAvailability();
  return {
    setActive(next, reason = next ? 'active' : 'paused') {
      if (disposed || active === next && !previewActive) return;
      if (previewActive) stopAll();
      previewActive = false;
      active = next;
      activation++; updateAudioOwner(ownerId, { active, generation: activation }); event('owner-active', { active, reason });
      if (!active) { stopAll(); sessionReady = !lease; lease?.deactivate(reason); }
      else { syncMusic(); prepare(); syncAmbience(); }
    },
    setPreviewActive(next) {
      if (disposed || previewActive === next) return;
      stopAll();
      active = false; previewActive = next;
      activation++; sessionReady = !lease; updateAudioOwner(ownerId, { active: next, generation: activation });
      if (!next) lease?.deactivate('notes');
      if (next) prepare();
    },
    setMusicState(state, sessionId) {
      if (disposed || sessionId !== options.sessionId) return;
      intendedMusic = state;
      syncMusic(); music.setState(state); music.advance(0);
    },
    advanceMusic(deltaSeconds, sessionId) { if (!disposed && sessionId === options.sessionId) music.advance(deltaSeconds); },
    duckMusic(seconds, gain) { if (!disposed) music.duck(seconds, gain); },
    setEnvironment(next) {
      if (disposed || next === environment) return;
      environment = next;
      const ambient = slots.find((slot) => slot.source === 'ambience');
      if (!ambient) return;
      ambiencePlaying = false; ambient.token += 1;
      try { ambient.player.pause(); } catch { /* Still retire the previous environment. */ }
      if (next === 'silent') return;
      const asset = assetFor('ambience', 0);
      if (ambient.asset !== asset) {
        try { ambient.player.release(); } catch { /* Do not overlap two environments. */ }
        slots = slots.filter((slot) => slot !== ambient);
        try {
          const player = createPlayer(asset);
          const replacement: Slot = { source: 'ambience', asset, player, token: 0, gain: SOURCE_GAIN.ambience };
          slots.push(replacement); player.volume = 0; player.loop = true;
        } catch (error) { failAudio(error, 'environment-replace'); return; }
      }
      syncAmbience();
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
      event('preferences', { ...preferences });
      if (preferences.illusionEnabled === false) stopIllusion();
      syncMusic();
      if (!preferences.enabled || !hasVolume()) { stopAll(); activation++; sessionReady = !lease; lease?.deactivate(preferences.enabled ? 'all-zero' : 'muted'); return; }
      if (previous.effectsVolume > 0 && preferences.effectsVolume === 0) {
        walked = actorWalked = 0;
        for (const slot of slots) {
          if (slot.source === 'ambience') continue;
          slot.token += 1;
          try { slot.player.pause(); } catch { /* Muting is still applied below. */ }
        }
      }
      try { for (const slot of slots) slot.player.volume = volumeFor(slot); } catch (error) { failAudio(error, 'preferences-volume'); }
      prepare();
      syncAmbience();
    },
    event(cue: GallerySoundEvent) {
      if (disposed || cue.sessionId !== options.sessionId || !Number.isSafeInteger(cue.sequence) || cue.sequence < 0 || cue.sequence <= lastSequence) { event('effect-dropped', { reason: disposed ? 'disposed' : cue.sessionId !== options.sessionId ? 'stale-session' : 'stale-sequence' }); return false; }
      if (!['interaction', 'unlock', 'door', 'door-close', 'actor-plant', 'grip', 'key', 'ratchet', 'bell', 'isolation', 'power'].includes(cue.type)) return false;
      // Consume even silent/paused/unready events: resuming never replays missed work.
      lastSequence = cue.sequence;
      if (cue.type === 'door-close') { stopAll(); ending = true; }
      if (cue.type === 'actor-plant') {
        if (!cue.position || !validPosition(cue.position)) return false;
        const gain = attenuation(cue.position);
        const accepted = emit('footstep', gain);
        emit('cloth', gain);
        return accepted;
      }
      const physical = ['grip', 'key', 'ratchet', 'bell', 'isolation', 'power'].includes(cue.type) ? cue.type as PhysicalSound : undefined;
      const source = physical === 'grip' || physical === 'key' || cue.type === 'interaction' ? 'interaction' : physical === 'isolation' || cue.type === 'door-close' ? 'door-impact' : 'mechanism';
      const accepted = emit(source, attenuation(cue.position), undefined, physical);
      if (accepted) music.duck(physical === 'bell' ? 1.6 : .7, .42);
      return accepted;
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
    recover(reason) {
      if (recovery) return recovery;
      recovery = (async () => {
        if (disposed || !(active || previewActive) || !preferences.enabled || !hasVolume() || backend.availability !== 'available') return false;
        // An already running preparation owns readiness; do not consume recovery budget.
        await waitUntilReady();
        if (disposed || !(active || previewActive) || !preferences.enabled || !hasVolume()) return false;
        const ambient = slots.find(slot => slot.source === 'ambience');
        let ambientStopped = false;
        try {
          const status = ambient?.player.getStatus?.();
          ambientStopped = ambiencePlaying && !!status?.isLoaded && (!status.playing && !status.isBuffering || status.error !== null);
        } catch { ambientStopped = true; }
        const musicBroken = music.getDiagnostics().needsRecovery;
        if (availability === 'available' && configured && sessionReady && !musicBroken && !ambientStopped) return true;
        if (recoveryAttempts >= 2) { event('recovery-limit', { reason }); return false; }
        recoveryAttempts++; activation++; event('recovery-start', { reason, attempt: recoveryAttempts });
        if (availability === 'available' && configured && sessionReady && !ambientStopped) {
          music.recover(); syncMusic(); music.setState(intendedMusic); music.advance(0);
        } else {
          releaseAll(); music.recover(); configured = false; sessionReady = !lease; availability = 'available'; reportAvailability();
          prepare(); await waitUntilReady();
          if (preparable() && configured && sessionReady) { syncMusic(); music.setState(intendedMusic); music.advance(0); syncAmbience(); }
        }
        const recovered = preparable() && configured && sessionReady && !music.getDiagnostics().needsRecovery;
        event('recovery-complete', { reason, recovered }); return recovered;
      })().finally(() => { recovery = undefined; });
      return recovery;
    },
    dispose() { if (!disposed) { disposed = true; activation++; active = previewActive = false; releaseAll(); music.dispose(); lease?.dispose(); retireAudioOwner(ownerId); } },
    whenReady: waitUntilReady,
    getDiagnostics() { return { availability, active, ready: configured && sessionReady && (options.musicOnly === true || slots.length > 0), players: slots.length + music.getDiagnostics().players, playedEvents, droppedEvents, musicPlayers: music.getDiagnostics().players, musicState: music.getDiagnostics().state }; },
  };
}
