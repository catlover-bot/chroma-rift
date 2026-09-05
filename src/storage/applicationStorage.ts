import AsyncStorage from '@react-native-async-storage/async-storage';

import { completeQuickSetup, QUICK_SETUP_ANSWERS, type QuickSetupResult } from '../domain/calibration/quickSetup';

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

export const LEGACY_APPLICATION_STORAGE_KEY = 'chroma-rift.application.v1';
export const APPLICATION_STORAGE_KEY = 'chroma-rift.application.v2';

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
    (value.stimulusVersion === undefined || value.stimulusVersion === 2) &&
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
    (value.stimulusVersion === undefined || value.stimulusVersion === 2) &&
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
    (value.stimulusVersion !== undefined && value.stimulusVersion !== 2) ||
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
    responseIds.every((trialId) => trialIds.has(trialId)) &&
    value.responses.every((response) => {
      const trial = (value.trials as CalibrationTrial[]).find((candidate) => candidate.id === response.trialId);
      return trial && response.sessionSeed === value.seed && response.patternFamily === trial.patternFamily &&
        response.background === trial.background && response.colorRoleAssignment === trial.colorRoleAssignment;
    })
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

function isSettings(value: unknown): value is Omit<AppSettings, 'depthAssistOverridden'> & { depthAssistOverridden?: boolean } {
  return (
    isRecord(value) &&
    typeof value.depthAssist === 'boolean' &&
    (value.depthAssistOverridden === undefined || typeof value.depthAssistOverridden === 'boolean') &&
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
    schemaVersion: 2,
    settings: { ...DEFAULT_SETTINGS, reducedMotion: systemReducedMotion },
    bestMazeScore: 0,
    onboardingComplete: false,
    ...(__DEV__ ? { developerLab: { ...DEFAULT_LAB_PARAMETERS } } : {}),
  };
}

function isQuickSetup(value: unknown): value is QuickSetupResult {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.stimulusVersion !== 2 ||
    value.kind !== 'quick' || !oneOf(['completed', 'skipped'] as const, value.status) ||
    !Array.isArray(value.answers) || !value.answers.every((answer) => oneOf(QUICK_SETUP_ANSWERS, answer)) ||
    !isString(value.completedAt) || typeof value.suggestDepthAssist !== 'boolean') return false;
  if (value.status === 'skipped') {
    return value.answers.length === 0 && value.provisionalColor === 'neutral' && value.suggestDepthAssist;
  }
  if (value.answers.length !== 3) return false;
  const expected = completeQuickSetup(value.answers, value.completedAt);
  return value.provisionalColor === expected.provisionalColor && value.suggestDepthAssist === expected.suggestDepthAssist;
}

export type ApplicationLoadResult = {
  application: PersistedApplication;
  status: 'empty' | 'loaded' | 'migrated' | 'blocked';
  message?: string;
};

/** v1 is validated before copying. Old raw responses, profiles and scores remain intact. */
export function decodePersistedApplication(raw: string | null, systemReducedMotion = false): ApplicationLoadResult {
  const fallback = createDefaultApplication(systemReducedMotion);
  if (raw === null) return { application: fallback, status: 'empty' };
  try {
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      !oneOf([1, 2] as const, value.schemaVersion) ||
      !isSettings(value.settings) ||
      (value.schemaVersion === 2 && typeof value.settings.depthAssistOverridden !== 'boolean') ||
      !isFiniteNumber(value.bestMazeScore) || value.bestMazeScore < 0 ||
      typeof value.onboardingComplete !== 'boolean' ||
      (value.calibrationProfile !== undefined && !isProfile(value.calibrationProfile)) ||
      (value.calibrationSession !== undefined && !isSession(value.calibrationSession)) ||
      (value.calibrationHistory !== undefined && (!Array.isArray(value.calibrationHistory) || !value.calibrationHistory.every(isSession))) ||
      (value.developerLab !== undefined && !isLabParameters(value.developerLab)) ||
      (value.quickSetupResult !== undefined && !isQuickSetup(value.quickSetupResult)) ||
      (value.activeSetupSource !== undefined && !oneOf(['quick', 'detailed'] as const, value.activeSetupSource)) ||
      (value.activeSetupSource === 'quick' && value.quickSetupResult === undefined) ||
      (value.activeSetupSource === 'detailed' && value.calibrationProfile === undefined)
    ) return { application: fallback, status: 'blocked', message: '保存データを読み込めませんでした。元のデータは保持しています。この起動中の変更は保存されません。' };
    return {
      status: value.schemaVersion === 1 ? 'migrated' : 'loaded',
      application: {
        schemaVersion: 2,
        // v1 cannot tell whether the user explicitly chose assist: preserve it conservatively.
        settings: { ...value.settings, depthAssistOverridden: value.settings.depthAssistOverridden ?? true },
        bestMazeScore: value.bestMazeScore,
        onboardingComplete: value.onboardingComplete,
        ...(value.calibrationProfile ? { calibrationProfile: value.calibrationProfile } : {}),
        ...(value.calibrationSession ? { calibrationSession: value.calibrationSession } : {}),
        ...(value.calibrationHistory ? { calibrationHistory: value.calibrationHistory as CalibrationSession[] } : {}),
        ...(value.developerLab ? { developerLab: value.developerLab } : {}),
        ...(value.quickSetupResult ? { quickSetupResult: value.quickSetupResult } : {}),
        ...(value.activeSetupSource ? { activeSetupSource: value.activeSetupSource } :
          value.calibrationProfile ? { activeSetupSource: 'detailed' as const } :
            value.quickSetupResult ? { activeSetupSource: 'quick' as const } : {}),
      },
    };
  } catch {
    return { application: fallback, status: 'blocked', message: '保存データを読み込めませんでした。元のデータは保持しています。この起動中の変更は保存されません。' };
  }
}

export function parsePersistedApplication(
  raw: string | null,
  systemReducedMotion = false,
): PersistedApplication {
  return decodePersistedApplication(raw, systemReducedMotion).application;
}

let persistenceAllowed = true;
let writeEpoch = 0;
let mutations: Promise<unknown> = Promise.resolve();

function serializeMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = mutations.then(operation, operation);
  mutations = result.catch(() => undefined);
  return result;
}

export async function loadApplication(systemReducedMotion = false): Promise<ApplicationLoadResult> {
  let readEpoch = writeEpoch;
  try {
    await mutations;
    readEpoch = writeEpoch;
    const current = await AsyncStorage.getItem(APPLICATION_STORAGE_KEY);
    const legacy = current === null ? await AsyncStorage.getItem(LEGACY_APPLICATION_STORAGE_KEY) : null;
    if (readEpoch !== writeEpoch) return {
      application: createDefaultApplication(systemReducedMotion), status: 'blocked',
      message: '読み込み中に保存データがリセットされました。',
    };
    const result = decodePersistedApplication(current ?? legacy, systemReducedMotion);
    persistenceAllowed = result.status !== 'blocked';
    if (result.status === 'migrated') {
      const saved = await saveApplication(result.application);
      if (!saved) {
        if (readEpoch === writeEpoch) persistenceAllowed = false;
        return { ...result, status: 'blocked', message: '設定の移行を保存できませんでした。以前のデータは保持しています。' };
      }
    }
    return result;
  } catch {
    if (readEpoch === writeEpoch) persistenceAllowed = false;
    return { application: createDefaultApplication(systemReducedMotion), status: 'blocked', message: '保存領域を読み込めませんでした。この起動中の変更は保存されません。' };
  }
}

export function saveApplication(value: PersistedApplication): Promise<boolean> {
  const epoch = writeEpoch;
  const raw = JSON.stringify(value);
  return serializeMutation(async () => {
    if (!persistenceAllowed || epoch !== writeEpoch || decodePersistedApplication(raw).status !== 'loaded') return false;
    try {
      await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, raw);
      return true;
    } catch {
      return false;
    }
  });
}

export function resetApplicationStorage(): Promise<boolean> {
  writeEpoch += 1;
  persistenceAllowed = false;
  return serializeMutation(async () => {
    try {
      await AsyncStorage.multiRemove([APPLICATION_STORAGE_KEY, LEGACY_APPLICATION_STORAGE_KEY]);
      persistenceAllowed = true;
      return true;
    } catch {
      return false;
    }
  });
}
