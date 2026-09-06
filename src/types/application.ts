import { DEFAULT_AUDIO_PREFERENCES, type AudioPreferences } from '../audio';
import {
  DEFAULT_CALIBRATION_ENVIRONMENT,
  type CalibrationEnvironment,
  type CalibrationProfile,
  type CalibrationSession,
} from '../domain/calibration/types';
import type { QuickSetupResult } from '../domain/calibration/quickSetup';
import type { PaletteId } from '../domain/emblem/color';

export type ScreenName =
  | 'welcome'
  | 'calibrationInstructions'
  | 'calibration'
  | 'calibrationResult'
  | 'microMaze'
  | 'stageResult'
  | 'settings'
  | 'quickSetup'
  | 'playInstructions'
  | 'firstPerson'
  | 'firstPersonResult'
  | 'firstPersonLab'
  | 'illusionMaze'
  | 'journeyResult'
  | 'developerLab';

export type EffectStrength = 'low' | 'medium' | 'high';

export type AppSettings = {
  depthAssist: boolean;
  depthAssistOverridden: boolean;
  reducedMotion: boolean;
  reducedMotionOverridden: boolean;
  effectStrength: EffectStrength;
  /** Explicit emblem preset, independent from legacy maze effect strength. */
  emblemPalette?: PaletteId;
  haptics: boolean;
  /** Additive local sound preferences; older saves remain valid. */
  audio?: AudioPreferences;
};

export type DeveloperLabParameters = {
  patternFamily: 'rings' | 'crossingRails' | 'dotFields';
  background: 'dark' | 'light';
  redColor: string;
  blueColor: string;
  strokeWidth: number;
  spacing: number;
  colorRoleAssignment: 'primaryRed' | 'primaryBlue';
  rotation: 0 | 90 | 180 | 270;
  mirrored: boolean;
  mode: 'calibration' | 'game';
  glow: number;
  motion: number;
  reducedMotion: boolean;
  depthAssist: boolean;
  environment: CalibrationEnvironment;
};

export type PersistedApplication = {
  schemaVersion: 2;
  quickSetupResult?: QuickSetupResult;
  activeSetupSource?: 'quick' | 'detailed';
  calibrationProfile?: CalibrationProfile;
  calibrationSession?: CalibrationSession;
  calibrationHistory?: CalibrationSession[];
  settings: AppSettings;
  bestMazeScore: number;
  onboardingComplete: boolean;
  developerLab?: DeveloperLabParameters;
};

export type JourneyStageSummary = {
  levelId: string;
  collectibleCount: number;
  discoveredMechanisms: string[];
};

/** First-person comfort preferences have their own persistence document. */
export type FirstPersonControls = {
  sensitivity: number;
  /** Optional in v1 saves; defaults to 1 when absent or malformed. */
  verticalSensitivity?: number;
  movementMode: 'standard' | 'simple';
  handedness: 'left' | 'right';
  quality: 'low' | 'standard';
};

export const DEFAULT_FIRST_PERSON_CONTROLS: FirstPersonControls = {
  sensitivity: 1,
  verticalSensitivity: 1,
  movementMode: 'standard',
  handedness: 'right',
  quality: 'standard',
};

/** Local introduction acknowledgements, independent from calibration and chapter progress. */
export type FirstPersonOnboarding = {
  schemaVersion: 1;
  controlChoiceAcknowledged: boolean;
  tutorialCompleted: boolean;
};

export const DEFAULT_FIRST_PERSON_ONBOARDING: FirstPersonOnboarding = {
  schemaVersion: 1,
  controlChoiceAcknowledged: false,
  tutorialCompleted: false,
};

export type FirstPersonChapterSummary = {
  chapterId: string;
  seals: number;
  discoveredMechanisms: string[];
};

export const DEFAULT_SETTINGS: AppSettings = {
  depthAssist: true,
  depthAssistOverridden: false,
  reducedMotion: false,
  reducedMotionOverridden: false,
  effectStrength: 'medium',
  emblemPalette: 'baseline',
  haptics: true,
  audio: { ...DEFAULT_AUDIO_PREFERENCES },
};

export const DEFAULT_LAB_PARAMETERS: DeveloperLabParameters = {
  patternFamily: 'rings',
  background: 'dark',
  redColor: '#FF2A2A',
  blueColor: '#006BFF',
  strokeWidth: 8,
  spacing: 24,
  colorRoleAssignment: 'primaryRed',
  rotation: 0,
  mirrored: false,
  mode: 'calibration',
  glow: 0,
  motion: 0,
  reducedMotion: false,
  depthAssist: true,
  environment: { ...DEFAULT_CALIBRATION_ENVIRONMENT },
};
