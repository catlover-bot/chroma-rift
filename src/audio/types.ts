import type { AudioPreferences } from './preferences';

export type AudioAvailability = 'available' | 'missing-native' | 'unavailable';
export type AudioEffectBus = 'footstep' | 'interaction' | 'mechanism' | 'ambience' | 'cloth' | 'door-impact' | 'shepard';
export type MusicState = 'silent' | 'title_theme' | 'exploration' | 'suspicion' | 'pursuit' | 'release' | 'chapter_end';
export type PhysicalSound = 'grip' | 'key' | 'ratchet' | 'bell' | 'isolation' | 'power';
export type AudioSourceId = AudioEffectBus | Exclude<MusicState, 'silent'> | PhysicalSound | 'step-a' | 'step-b' | 'cloth-metal' | 'outdoor' | 'room-gallery' | 'room-vault' | 'room-theatre' | 'room-mirror' | 'room-control';
export type AudioPosition = Readonly<{ x: number; y: number; z: number }>;
export type GallerySoundEvent = {
  sessionId: string;
  sequence: number;
  type: 'interaction' | 'unlock' | 'door' | 'door-close' | 'actor-plant' | PhysicalSound;
  /** Taken from the same world fixture/door definition used for drawing and collision. */
  position?: AudioPosition;
};
export type AudioPlayerPort = {
  readonly isLoaded: boolean;
  getStatus?(): AudioPlayerStatus;
  subscribe?(listener: (status: AudioPlayerStatus) => void): () => void;
  volume: number;
  loop: boolean;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  release(): void;
};
export type AudioPlayerStatus = { isLoaded: boolean; playing: boolean; currentTime: number; duration: number; isBuffering: boolean; didJustFinish: boolean; error: string | null };
export type AudioSessionLease = { activate(): Promise<boolean>; deactivate(reason: string): void; dispose(): void };
export type AudioStopReason = 'active' | 'paused' | 'background' | 'unready' | 'notes' | 'settings' | 'ending' | 'render-failure' | 'leave' | 'user' | 'muted' | 'all-zero';
export type AudioBackend = {
  availability: AudioAvailability;
  prepare(): Promise<void>;
  createPlayer(source: AudioSourceId): AudioPlayerPort;
  acquireSession?(ownerId: number): AudioSessionLease;
};
export type GalleryAudioOptions = {
  sessionId: string;
  preferences?: AudioPreferences;
  /** Area-specific prepared effect variants; no extra voices. */
  areaId?: string;
  campaignAreaId?: string;
  campaignSessionId?: string;
  runtimeSession?: number;
  /** Title/credits owner allocates only the two music voices. */
  musicOnly?: boolean;
  onAvailability?: (availability: AudioAvailability) => void;
};
export type GalleryAudio = {
  /** Set false synchronously on pause/background/render failure/leave. */
  setActive(active: boolean, reason?: AudioStopReason): void;
  /** Explicit foreground/user intent only; at most two recovery attempts per owner. */
  recover(reason: 'foreground' | 'user'): Promise<boolean>;
  /** Paused notebook playback uses the same pool, without ambient/game sounds. */
  setPreviewActive(active: boolean): void;
  setMusicState(state: MusicState, sessionId: string): void;
  advanceMusic(deltaSeconds: number, sessionId: string): void;
  duckMusic(seconds: number, gain: number): void;
  setEnvironment(environment: 'indoor' | 'outdoor' | 'silent'): void;
  /** Returns request acceptance; onStarted follows a successful native play request, never proof of hearing. */
  playIllusion(sessionId: string, intensity: 'standard' | 'subdued', onStarted?: () => void): boolean;
  stopIllusion(): void;
  /** Silence the accepted ending immediately; its impact waits for presentation. */
  beginEnding(): void;
  updatePreferences(preferences?: AudioPreferences): void;
  event(event: GallerySoundEvent): boolean;
  /** Actual collision-resolved travel, never intended input or a teleport delta. */
  movement(distanceMeters: number, sessionId: string): void;
  /** Actual movement of the single exhibit, using the same fixed footstep pool. */
  stopMovement(): void;
  actorMovement(distanceMeters: number, position: AudioPosition, sessionId: string): void;
  setListenerPosition(position: AudioPosition): void;
  dispose(): void;
  whenReady(): Promise<void>;
  getDiagnostics(): { availability: AudioAvailability; active: boolean; ready: boolean; players: number; playedEvents: number; droppedEvents: number; musicPlayers: number; musicState: MusicState };
};
