/* Metro requires literal asset requires to bundle local audio in an offline build. */
import type { AudioSourceId } from './types';

export const AUDIO_SOURCES: Readonly<Record<AudioSourceId, number>> = Object.freeze({
  footstep: require('../../assets/audio/footstep.wav'),
  interaction: require('../../assets/audio/interaction.wav'),
  mechanism: require('../../assets/audio/mechanism.wav'),
  ambience: require('../../assets/audio/ambience.wav'),
  cloth: require('../../assets/audio/cloth.wav'),
  'door-impact': require('../../assets/audio/door-impact.wav'),
  shepard: require('../../assets/audio/shepard.wav'),
});
