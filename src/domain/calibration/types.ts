export const PATTERN_FAMILIES = ['rings', 'crossingRails', 'dotFields'] as const;
export type PatternFamily = (typeof PATTERN_FAMILIES)[number];

export const STIMULUS_BACKGROUNDS = ['dark', 'light'] as const;
export type StimulusBackground = (typeof STIMULUS_BACKGROUNDS)[number];

export const COLOR_ROLE_ASSIGNMENTS = ['primaryRed', 'primaryBlue'] as const;
export type ColorRoleAssignment = (typeof COLOR_ROLE_ASSIGNMENTS)[number];

export const CALIBRATION_ANSWERS = ['redFront', 'blueFront', 'same', 'unclear'] as const;
export type CalibrationAnswer = (typeof CALIBRATION_ANSWERS)[number];
export type PerceivedStrength = 1 | 2 | 3;
export type DepthPreference = 'RED_FRONT' | 'BLUE_FRONT' | 'VARIABLE' | 'SOFT_DEPTH';
export type PreferredForegroundColor = 'red' | 'blue' | 'neutral';

export type CalibrationTrial = {
  /** Absent on original stimuli; never backfilled onto old answers. */
  stimulusVersion?: 2;
  id: string;
  patternFamily: PatternFamily;
  background: StimulusBackground;
  colorRoleAssignment: ColorRoleAssignment;
  rotation: 0 | 90 | 180 | 270;
  mirrored: boolean;
};

export type CalibrationResponse = {
  schemaVersion: 1;
  stimulusVersion?: 2;
  trialId: string;
  patternFamily: PatternFamily;
  background: StimulusBackground;
  colorRoleAssignment: ColorRoleAssignment;
  answer: CalibrationAnswer;
  strength?: PerceivedStrength;
  respondedAt: string;
  sessionSeed: number;
};

export type CalibrationEnvironment = {
  brightness: 'low' | 'medium' | 'high' | 'unknown';
  trueTone: 'on' | 'off' | 'unknown';
  nightShift: 'on' | 'off' | 'unknown';
  viewingDistance: '20-30cm' | '30-40cm' | '40-50cm' | 'unknown';
};

export type CalibrationSession = {
  schemaVersion: 1;
  stimulusVersion?: 2;
  seed: number;
  startedAt: string;
  completedAt?: string;
  environment: CalibrationEnvironment;
  trials: CalibrationTrial[];
  responses: CalibrationResponse[];
};

export type BackgroundMetrics = {
  decisiveCount: number;
  direction: number;
};

export type CalibrationProfile = {
  schemaVersion: 1;
  preference: DepthPreference;
  preferredForegroundColor: PreferredForegroundColor;
  depthAssistDefault: boolean;
  totalTrials: number;
  decisiveCount: number;
  unclearCount: number;
  sameCount: number;
  redWeight: number;
  blueWeight: number;
  decisiveRate: number;
  meanDecisiveStrength: number;
  direction: number;
  confidence: number;
  dark: BackgroundMetrics;
  light: BackgroundMetrics;
  backgroundReversalObserved: boolean;
};

export const DEFAULT_CALIBRATION_ENVIRONMENT: CalibrationEnvironment = {
  brightness: 'unknown',
  trueTone: 'unknown',
  nightShift: 'unknown',
  viewingDistance: 'unknown',
};
