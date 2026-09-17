import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { AudioMode } from 'expo-audio';

import { AUDIO_SOURCES } from './sources';
import { recordAudioFailure } from './diagnostics';
import { createAudioSessionCoordinator } from './nativeSession';
import type { AudioAvailability, AudioBackend, AudioPlayerStatus } from './types';

let sharedSession: ReturnType<typeof createAudioSessionCoordinator> | undefined;

// Confirmed against installed expo-audio 57.0.5/src/AudioModule.ts.
// expo publicly re-exports requireOptionalNativeModule from expo-modules-core.
export const EXPO_AUDIO_NATIVE_MODULE_NAME = 'ExpoAudio';
export const GALLERY_AUDIO_MODE: Readonly<Partial<AudioMode>> = Object.freeze({
  playsInSilentMode: false,
  allowsRecording: false,
  allowsBackgroundRecording: false,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
  interruptionMode: 'mixWithOthers',
});

export function getGalleryAudioAvailability(): AudioAvailability {
  try {
    if (Platform.OS === 'web') return 'available';
    return requireOptionalNativeModule(EXPO_AUDIO_NATIVE_MODULE_NAME) ? 'available' : 'missing-native';
  } catch (error) { recordAudioFailure(0, error, 'native-module-probe'); return 'unavailable'; }
}

export function createNativeAudioBackend(): AudioBackend {
  const availability = getGalleryAudioAvailability();
  if (availability !== 'available') {
    return { availability, prepare: async () => undefined, createPlayer: () => { throw new Error('Audio backend is not available'); } };
  }
  try {
    // A static top-level value import would execute requireNativeModule before
    // the public optional probe, crashing pre-audio Development Builds.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const audio = require('expo-audio') as typeof import('expo-audio');
    sharedSession ??= createAudioSessionCoordinator({ prepare: () => audio.setAudioModeAsync(GALLERY_AUDIO_MODE), setActive: active => audio.setIsAudioActiveAsync(active) });
    return {
      availability,
      prepare: () => audio.setAudioModeAsync(GALLERY_AUDIO_MODE),
      acquireSession: ownerId => sharedSession!.acquire(ownerId),
      createPlayer(source) {
        const player = audio.createAudioPlayer(AUDIO_SOURCES[source], { updateInterval: 1000, keepAudioSessionActive: true });
        const normalize = (status: Partial<import('expo-audio').AudioStatus>): AudioPlayerStatus => ({
          isLoaded: status.isLoaded === true, playing: status.playing === true,
          currentTime: Number.isFinite(status.currentTime) ? Math.max(0, status.currentTime!) : 0,
          duration: Number.isFinite(status.duration) ? Math.max(0, status.duration!) : 0,
          isBuffering: status.isBuffering === true, didJustFinish: status.didJustFinish === true,
          error: typeof status.error === 'string' ? status.error : null,
        });
        return {
          get isLoaded() { return player.isLoaded; },
          get volume() { return player.volume; }, set volume(value) { player.volume = value; },
          get loop() { return player.loop; }, set loop(value) { player.loop = value; },
          play() { player.play(); }, pause() { player.pause(); }, seekTo(seconds) { return player.seekTo(seconds); }, release() { player.release(); },
          getStatus() { return normalize(player.currentStatus); },
          subscribe(listener) { const subscription = player.addListener('playbackStatusUpdate', status => listener(normalize(status))); return () => subscription.remove(); },
        };
      },
    };
  } catch (error) {
    recordAudioFailure(0, error, 'native-module-import');
    return { availability: 'unavailable', prepare: async () => undefined, createPlayer: () => { throw new Error('Audio module could not initialize'); } };
  }
}
