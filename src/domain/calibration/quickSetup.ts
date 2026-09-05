import type { PreferredForegroundColor } from './types';

export const QUICK_SETUP_ANSWERS = ['redFront', 'blueFront', 'unclear'] as const;
export type QuickSetupAnswer = (typeof QUICK_SETUP_ANSWERS)[number];
export type QuickSetupSession = { id: string; responses: QuickSetupAnswer[] };
export type QuickSetupResult = {
  schemaVersion: 1;
  stimulusVersion: 2;
  kind: 'quick';
  status: 'completed' | 'skipped';
  answers: QuickSetupAnswer[];
  provisionalColor: PreferredForegroundColor;
  suggestDepthAssist: boolean;
  completedAt: string;
};

/** Product defaults from three taps, deliberately independent of the 12-trial classifier. */
export function completeQuickSetup(answers: QuickSetupAnswer[], completedAt: string): QuickSetupResult {
  if (answers.length !== 3) throw new Error('Quick setup requires exactly three answers');
  const red = answers.filter((answer) => answer === 'redFront').length;
  const blue = answers.filter((answer) => answer === 'blueFront').length;
  const provisionalColor = red >= 2 && blue === 0 ? 'red' : blue >= 2 && red === 0 ? 'blue' : 'neutral';
  return {
    schemaVersion: 1, stimulusVersion: 2, kind: 'quick', status: 'completed',
    answers: [...answers], provisionalColor, suggestDepthAssist: provisionalColor === 'neutral', completedAt,
  };
}

export function skipQuickSetup(completedAt: string): QuickSetupResult {
  return {
    schemaVersion: 1, stimulusVersion: 2, kind: 'quick', status: 'skipped', answers: [],
    provisionalColor: 'neutral', suggestDepthAssist: true, completedAt,
  };
}
