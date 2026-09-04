import {
  DEFAULT_CALIBRATION_ENVIRONMENT,
  type CalibrationEnvironment,
  type CalibrationProfile,
  type CalibrationSession,
} from '../domain/calibration/types';

export type ScreenName =
  | 'welcome'
  | 'calibrationInstructions'
  | 'calibration'
  | 'calibrationResult'
  | 'microMaze'
  | 'stageResult'
  | 'settings'
  | 'developerLab';

export type EffectStrength = 'low' | 'medium' | 'high';

export type AppSettings = {
  depthAssist: boolean;
  reducedMotion: boolean;
  reducedMotionOverridden: boolean;
  effectStrength: EffectStrength;
  haptics: boolean;
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
  schemaVersion: 1;
  calibrationProfile?: CalibrationProfile;
  calibrationSession?: CalibrationSession;
  settings: AppSettings;
  bestMazeScore: number;
  onboardingComplete: boolean;
  developerLab?: DeveloperLabParameters;
};

export const DEFAULT_SETTINGS: AppSettings = {
  depthAssist: true,
  reducedMotion: false,
  reducedMotionOverridden: false,
  effectStrength: 'medium',
  haptics: true,
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
