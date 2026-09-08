import type { AudioPreferences } from './preferences';

export type AudioAvailability = 'available' | 'missing-native' | 'unavailable';
export type AudioSourceId = 'footstep' | 'interaction' | 'mechanism' | 'ambience' | 'cloth' | 'door-impact' | 'shepard';
export type AudioPosition = Readonly<{ x: number; y: number; z: number }>;
export type GallerySoundEvent = {
  sessionId: string;
  sequence: number;
  type: 'interaction' | 'unlock' | 'door' | 'door-close' | 'actor-plant';
  /** Taken from the same world fixture/door definition used for drawing and collision. */
  position?: AudioPosition;
};
export type AudioPlayerPort = {
  readonly isLoaded: boolean;
  volume: number;
  loop: boolean;
  play(): void;
  pause(): void;
  seekTo(seconds: number): Promise<void>;
  release(): void;
};
export type AudioBackend = {
  availability: AudioAvailability;
  prepare(): Promise<void>;
  createPlayer(source: AudioSourceId): AudioPlayerPort;
};
export type GalleryAudioOptions = {
  sessionId: string;
  preferences?: AudioPreferences;
  onAvailability?: (availability: AudioAvailability) => void;
};
export type GalleryAudio = {
  /** Set false synchronously on pause/background/render failure/leave. */
  setActive(active: boolean): void;
  /** Paused notebook playback uses the same pool, without ambient/game sounds. */
  setPreviewActive(active: boolean): void;
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
  getDiagnostics(): { availability: AudioAvailability; active: boolean; ready: boolean; players: number; playedEvents: number; droppedEvents: number };
};
