import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  CALIBRATION_ANSWERS,
  COLOR_ROLE_ASSIGNMENTS,
  PATTERN_FAMILIES,
  STIMULUS_BACKGROUNDS,
  type CalibrationProfile,
  type CalibrationResponse,
  type CalibrationSession,
  type CalibrationTrial,
} from '../domain/calibration/types';
import {
  DEFAULT_LAB_PARAMETERS,
  DEFAULT_SETTINGS,
  type AppSettings,
  type DeveloperLabParameters,
  type PersistedApplication,
} from '../types/application';

export const APPLICATION_STORAGE_KEY = 'chroma-rift.application.v1';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const oneOf = <T extends string | number>(values: readonly T[], value: unknown): value is T =>
  (typeof value === 'string' || typeof value === 'number') && values.includes(value as T);

function isTrial(value: unknown): value is CalibrationTrial {
  return (
    isRecord(value) &&
    isString(value.id) &&
    oneOf(PATTERN_FAMILIES, value.patternFamily) &&
    oneOf(STIMULUS_BACKGROUNDS, value.background) &&
    oneOf(COLOR_ROLE_ASSIGNMENTS, value.colorRoleAssignment) &&
    oneOf([0, 90, 180, 270] as const, value.rotation) &&
    typeof value.mirrored === 'boolean'
  );
}

function isResponse(value: unknown): value is CalibrationResponse {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    isString(value.trialId) &&
    oneOf(PATTERN_FAMILIES, value.patternFamily) &&
    oneOf(STIMULUS_BACKGROUNDS, value.background) &&
    oneOf(COLOR_ROLE_ASSIGNMENTS, value.colorRoleAssignment) &&
    oneOf(CALIBRATION_ANSWERS, value.answer) &&
    ((value.answer === 'redFront' || value.answer === 'blueFront')
      ? oneOf([1, 2, 3] as const, value.strength)
      : value.strength === undefined) &&
    isString(value.respondedAt) &&
    isFiniteNumber(value.sessionSeed)
  );
}

function isEnvironment(value: unknown): boolean {
  return (
    isRecord(value) &&
    oneOf(['low', 'medium', 'high', 'unknown'] as const, value.brightness) &&
    oneOf(['on', 'off', 'unknown'] as const, value.trueTone) &&
    oneOf(['on', 'off', 'unknown'] as const, value.nightShift) &&
    oneOf(['20-30cm', '30-40cm', '40-50cm', 'unknown'] as const, value.viewingDistance)
  );
}

function isSession(value: unknown): value is CalibrationSession {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !isFiniteNumber(value.seed) ||
    !isString(value.startedAt) ||
    (value.completedAt !== undefined && !isString(value.completedAt)) ||
    !isEnvironment(value.environment) ||
    !Array.isArray(value.trials) ||
    !value.trials.every(isTrial) ||
    !Array.isArray(value.responses) ||
    !value.responses.every(isResponse)
  ) {
    return false;
  }
  const trialIds = new Set(value.trials.map((trial) => trial.id));
  const responseIds = value.responses.map((response) => response.trialId);
  return (
    value.trials.length === 12 &&
    trialIds.size === 12 &&
    value.responses.length <= 12 &&
    new Set(responseIds).size === responseIds.length &&
    responseIds.every((trialId) => trialIds.has(trialId))
  );
}

function isProfile(value: unknown): value is CalibrationProfile {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  const numericKeys = [
    'totalTrials',
    'decisiveCount',
    'unclearCount',
    'sameCount',
    'redWeight',
    'blueWeight',
    'decisiveRate',
    'meanDecisiveStrength',
    'direction',
    'confidence',
  ];
  return (
    oneOf(['RED_FRONT', 'BLUE_FRONT', 'VARIABLE', 'SOFT_DEPTH'] as const, value.preference) &&
    oneOf(['red', 'blue', 'neutral'] as const, value.preferredForegroundColor) &&
    typeof value.depthAssistDefault === 'boolean' &&
    numericKeys.every((key) => isFiniteNumber(value[key])) &&
    isRecord(value.dark) &&
    isFiniteNumber(value.dark.decisiveCount) &&
    isFiniteNumber(value.dark.direction) &&
    isRecord(value.light) &&
    isFiniteNumber(value.light.decisiveCount) &&
    isFiniteNumber(value.light.direction) &&
    typeof value.backgroundReversalObserved === 'boolean' &&
    value.totalTrials === 12 &&
    isFiniteNumber(value.decisiveCount) &&
    isFiniteNumber(value.decisiveRate) &&
    isFiniteNumber(value.direction) &&
    isFiniteNumber(value.confidence) &&
    value.decisiveCount >= 0 &&
    value.decisiveCount <= 12 &&
    value.decisiveRate >= 0 &&
    value.decisiveRate <= 1 &&
    value.direction >= -1 &&
    value.direction <= 1 &&
    value.confidence >= 0 &&
    value.confidence <= 1 &&
    value.dark.direction >= -1 &&
    value.dark.direction <= 1 &&
    value.light.direction >= -1 &&
    value.light.direction <= 1
  );
}

function isSettings(value: unknown): value is AppSettings {
  return (
    isRecord(value) &&
    typeof value.depthAssist === 'boolean' &&
    typeof value.reducedMotion === 'boolean' &&
    typeof value.reducedMotionOverridden === 'boolean' &&
    oneOf(['low', 'medium', 'high'] as const, value.effectStrength) &&
    typeof value.haptics === 'boolean'
  );
}

function isLabParameters(value: unknown): value is DeveloperLabParameters {
  return (
    isRecord(value) &&
    oneOf(PATTERN_FAMILIES, value.patternFamily) &&
    oneOf(STIMULUS_BACKGROUNDS, value.background) &&
    isString(value.redColor) &&
    isString(value.blueColor) &&
    isFiniteNumber(value.strokeWidth) &&
    isFiniteNumber(value.spacing) &&
    oneOf(COLOR_ROLE_ASSIGNMENTS, value.colorRoleAssignment) &&
    oneOf([0, 90, 180, 270] as const, value.rotation) &&
    typeof value.mirrored === 'boolean' &&
    oneOf(['calibration', 'game'] as const, value.mode) &&
    isFiniteNumber(value.glow) &&
    isFiniteNumber(value.motion) &&
    typeof value.reducedMotion === 'boolean' &&
    typeof value.depthAssist === 'boolean' &&
    isEnvironment(value.environment)
  );
}

export function createDefaultApplication(systemReducedMotion = false): PersistedApplication {
  return {
    schemaVersion: 1,
    settings: { ...DEFAULT_SETTINGS, reducedMotion: systemReducedMotion },
    bestMazeScore: 0,
    onboardingComplete: false,
    ...(__DEV__ ? { developerLab: { ...DEFAULT_LAB_PARAMETERS } } : {}),
  };
}

export function parsePersistedApplication(
  raw: string | null,
  systemReducedMotion = false,
): PersistedApplication {
  if (raw === null) return createDefaultApplication(systemReducedMotion);
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      value.schemaVersion !== 1 ||
      !isSettings(value.settings) ||
      !isFiniteNumber(value.bestMazeScore) ||
      typeof value.onboardingComplete !== 'boolean' ||
      (value.calibrationProfile !== undefined && !isProfile(value.calibrationProfile)) ||
      (value.calibrationSession !== undefined && !isSession(value.calibrationSession)) ||
      (value.developerLab !== undefined && !isLabParameters(value.developerLab))
    ) {
      return createDefaultApplication(systemReducedMotion);
    }

    return {
      schemaVersion: 1,
      settings: value.settings,
      bestMazeScore: Math.max(0, value.bestMazeScore),
      onboardingComplete: value.onboardingComplete,
      ...(value.calibrationProfile ? { calibrationProfile: value.calibrationProfile } : {}),
      ...(value.calibrationSession ? { calibrationSession: value.calibrationSession } : {}),
      ...(__DEV__ && value.developerLab ? { developerLab: value.developerLab } : {}),
    };
  } catch {
    return createDefaultApplication(systemReducedMotion);
  }
}

export async function loadApplication(systemReducedMotion = false): Promise<PersistedApplication> {
  try {
    return parsePersistedApplication(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY), systemReducedMotion);
  } catch {
    return createDefaultApplication(systemReducedMotion);
  }
}

export async function saveApplication(value: PersistedApplication): Promise<void> {
  try {
    await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Local persistence is best-effort; the in-memory session remains usable.
  }
}

export async function resetApplicationStorage(): Promise<void> {
  try {
    await AsyncStorage.removeItem(APPLICATION_STORAGE_KEY);
  } catch {
    // A reset still succeeds in memory if storage is unavailable.
  }
}
