export type AudioPreferences = {
  enabled: boolean;
  illusionEnabled?: boolean;
  musicVolume: number;
  effectsVolume: number;
};

/** The ambient channel is deliberately quiet; gameplay never raises these settings. */
export const DEFAULT_AUDIO_PREFERENCES: Readonly<AudioPreferences> = Object.freeze({
  enabled: true, illusionEnabled: true, musicVolume: 0.18, effectsVolume: 0.35,
});

export function normalizeAudioPreferences(value: unknown): AudioPreferences {
  const raw = value && typeof value === 'object' ? value as Partial<AudioPreferences> : {};
  const volume = (candidate: unknown, fallback: number) => typeof candidate === 'number' && Number.isFinite(candidate)
    ? Math.max(0, Math.min(1, candidate)) : fallback;
  return {
    illusionEnabled: typeof raw.illusionEnabled === 'boolean' ? raw.illusionEnabled : true,
    enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_AUDIO_PREFERENCES.enabled,
    musicVolume: volume(raw.musicVolume, DEFAULT_AUDIO_PREFERENCES.musicVolume),
    effectsVolume: volume(raw.effectsVolume, DEFAULT_AUDIO_PREFERENCES.effectsVolume),
  };
}
