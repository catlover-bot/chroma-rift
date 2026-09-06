import { createNativeAudioBackend } from './nativeBackend';
import { createGalleryAudioOwner } from './owner';
import type { GalleryAudio, GalleryAudioOptions } from './types';

export { DEFAULT_AUDIO_PREFERENCES, normalizeAudioPreferences } from './preferences';
export type { AudioPreferences } from './preferences';
export { getGalleryAudioAvailability } from './nativeBackend';
export type { AudioAvailability, AudioPosition, GalleryAudio, GalleryAudioOptions, GallerySoundEvent } from './types';

export function createGalleryAudio(options: GalleryAudioOptions): GalleryAudio {
  return createGalleryAudioOwner(options, createNativeAudioBackend());
}
