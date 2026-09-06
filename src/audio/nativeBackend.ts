import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';
import type { AudioMode } from 'expo-audio';

import { AUDIO_SOURCES } from './sources';
import type { AudioAvailability, AudioBackend } from './types';

// Confirmed against installed expo-audio 57.0.4/src/AudioModule.ts.
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
  } catch { return 'unavailable'; }
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
    return {
      availability,
      prepare: () => audio.setAudioModeAsync(GALLERY_AUDIO_MODE),
      createPlayer: (source) => audio.createAudioPlayer(AUDIO_SOURCES[source], { updateInterval: 1000, keepAudioSessionActive: false }),
    };
  } catch {
    return { availability: 'unavailable', prepare: async () => undefined, createPlayer: () => { throw new Error('Audio module could not initialize'); } };
  }
}
