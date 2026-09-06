import type { PaletteId } from '../emblem/color';
import { getSealRasterPair } from '../emblem/presentation';
import { STIMULUS_VERSION } from '../emblem/stimulus';
import type { PreferredForegroundColor } from './types';

export const QUICK_SETUP_ANSWERS = ['redFront', 'blueFront', 'unclear'] as const;
export type QuickSetupAnswer = (typeof QUICK_SETUP_ANSWERS)[number];
export const QUICK_EMBLEM_SEEDS = [21, 22, 23] as const;
export const QUICK_EMBLEM_RESOLUTION = 512;

/** A record of what was displayed; a later palette/preference change cannot rewrite it. */
export type QuickSetupStimulusSpec = {
  kind: 'emblem';
  version: typeof STIMULUS_VERSION;
  seeds: readonly [21, 22, 23];
  paletteId: PaletteId;
  resolution: 512;
  preference: 'unknown';
  assistance: false;
};
export type QuickSetupSession = { id: string; responses: QuickSetupAnswer[]; stimulus?: QuickSetupStimulusSpec };
type QuickSetupCommon = {
  kind: 'quick';
  status: 'completed' | 'skipped';
  answers: QuickSetupAnswer[];
  provisionalColor: PreferredForegroundColor;
  suggestDepthAssist: boolean;
  completedAt: string;
};
/** Old separated-shape answers remain distinguishable from shared-emblem answers. */
export type QuickSetupResult = QuickSetupCommon & ({
  schemaVersion: 1;
  stimulusVersion: 2;
} | {
  schemaVersion: 2;
  stimulusVersion: typeof STIMULUS_VERSION;
  stimulus: QuickSetupStimulusSpec;
});

export function createQuickSetupStimulusSpec(paletteId: PaletteId = 'baseline'): QuickSetupStimulusSpec {
  return { kind: 'emblem', version: STIMULUS_VERSION, seeds: QUICK_EMBLEM_SEEDS, paletteId,
    resolution: QUICK_EMBLEM_RESOLUTION, preference: 'unknown', assistance: false };
}

export function quickSetupRasterPair(spec: QuickSetupStimulusSpec, index: number) {
  const seed = spec.seeds[index];
  if (seed === undefined) throw new RangeError('Quick setup trial index must be 0..2');
  return getSealRasterPair(seed, spec.paletteId, spec.preference, spec.resolution);
}

/** Product defaults from three taps; never a scientific confidence or score. */
export function quickPreference(answers: readonly QuickSetupAnswer[]) {
  const red = answers.filter((answer) => answer === 'redFront').length;
  const blue = answers.filter((answer) => answer === 'blueFront').length;
  const provisionalColor: PreferredForegroundColor = red >= 2 && blue === 0 ? 'red' : blue >= 2 && red === 0 ? 'blue' : 'neutral';
  return { provisionalColor, suggestDepthAssist: provisionalColor === 'neutral' };
}

export function completeQuickSetup(answers: QuickSetupAnswer[], completedAt: string, stimulus = createQuickSetupStimulusSpec()): QuickSetupResult {
  if (answers.length !== 3 || !answers.every((answer) => QUICK_SETUP_ANSWERS.includes(answer))) throw new Error('Quick setup requires exactly three valid answers');
  return {
    schemaVersion: 2, stimulusVersion: STIMULUS_VERSION, stimulus,
    kind: 'quick', status: 'completed', answers: [...answers], ...quickPreference(answers), completedAt,
  };
}

export function skipQuickSetup(completedAt: string, stimulus = createQuickSetupStimulusSpec()): QuickSetupResult {
  return {
    schemaVersion: 2, stimulusVersion: STIMULUS_VERSION, stimulus,
    kind: 'quick', status: 'skipped', answers: [],
    provisionalColor: 'neutral', suggestDepthAssist: true, completedAt,
  };
}
