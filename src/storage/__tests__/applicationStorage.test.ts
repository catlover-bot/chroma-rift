import AsyncStorage from '@react-native-async-storage/async-storage';
import { calculateCalibrationProfile } from '../../domain/calibration/scoring';
import { generateCalibrationTrials } from '../../domain/calibration/trials';
import { DEFAULT_CALIBRATION_ENVIRONMENT, type CalibrationResponse } from '../../domain/calibration/types';
import { completeQuickSetup } from '../../domain/calibration/quickSetup';
import { APPLICATION_STORAGE_KEY, LEGACY_APPLICATION_STORAGE_KEY, createDefaultApplication, decodePersistedApplication, loadApplication, parsePersistedApplication, resetApplicationStorage, saveApplication } from '../applicationStorage';

describe('persisted application parsing', () => {
  it('falls back safely for malformed JSON', () => {
    expect(parsePersistedApplication('{broken')).toEqual(createDefaultApplication(false));
  });

  it('falls back safely for unsupported schema versions', () => {
    expect(parsePersistedApplication(JSON.stringify({ schemaVersion: 99 }))).toEqual(
      createDefaultApplication(false),
    );
  });

  it('honors the initial OS reduced-motion preference', () => {
    expect(parsePersistedApplication(null, true).settings.reducedMotion).toBe(true);
  });
});

function legacyData() {
  const defaults = createDefaultApplication();
  const { depthAssist, reducedMotion, reducedMotionOverridden, effectStrength, haptics } = defaults.settings;
  const trials = generateCalibrationTrials(9).map((trial) => {
    const legacy = { ...trial };
    delete legacy.stimulusVersion;
    return legacy;
  });
  const responses: CalibrationResponse[] = trials.map((trial) => ({
    schemaVersion: 1, trialId: trial.id, patternFamily: trial.patternFamily, background: trial.background,
    colorRoleAssignment: trial.colorRoleAssignment, answer: 'blueFront', strength: 2, respondedAt: '2026-01-01', sessionSeed: 9,
  }));
  return {
    schemaVersion: 1,
    settings: { depthAssist, reducedMotion, reducedMotionOverridden, effectStrength, haptics },
    bestMazeScore: 432, onboardingComplete: true,
    calibrationProfile: calculateCalibrationProfile(responses, 12),
    calibrationSession: { schemaVersion: 1, seed: 9, startedAt: '2026-01-01', completedAt: '2026-01-01', environment: DEFAULT_CALIBRATION_ENVIRONMENT, trials, responses },
  };
}

describe('versioned persistence', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await resetApplicationStorage();
    jest.clearAllMocks();
  });

  it('validates and migrates v1 without losing raw answers, profile or legacy score', async () => {
    const original = legacyData();
    const raw = JSON.stringify(original);
    await AsyncStorage.setItem(LEGACY_APPLICATION_STORAGE_KEY, raw);
    const loaded = await loadApplication();
    expect(loaded.status).toBe('migrated');
    expect(loaded.application.schemaVersion).toBe(2);
    expect(loaded.application.calibrationSession).toEqual(original.calibrationSession);
    expect(loaded.application.calibrationProfile).toEqual(original.calibrationProfile);
    expect(loaded.application.bestMazeScore).toBe(432);
    expect(loaded.application.settings.depthAssistOverridden).toBe(true);
    expect(loaded.application.activeSetupSource).toBe('detailed');
    expect(loaded.application.calibrationSession?.responses.every((response) => response.stimulusVersion === undefined)).toBe(true);
    expect(await AsyncStorage.getItem(LEGACY_APPLICATION_STORAGE_KEY)).toBe(raw);
    expect(decodePersistedApplication(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).status).toBe('loaded');
  });

  it('loads completed and skipped setup as their own format', async () => {
    const application = { ...createDefaultApplication(), quickSetupResult: completeQuickSetup(['redFront', 'redFront', 'unclear'], 'now') };
    expect(await saveApplication(application)).toBe(true);
    expect((await loadApplication()).application).toEqual({ ...application, activeSetupSource: 'quick' });
    expect((await loadApplication()).application.calibrationProfile).toBeUndefined();
  });

  it.each(['{broken', '{"schemaVersion":99}', JSON.stringify({ ...createDefaultApplication(), settings: {} })])('blocks autosave and preserves invalid or future data: %s', async (raw) => {
    await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, raw);
    await AsyncStorage.setItem(LEGACY_APPLICATION_STORAGE_KEY, JSON.stringify(legacyData()));
    const loaded = await loadApplication();
    expect(loaded.status).toBe('blocked');
    expect(await saveApplication(createDefaultApplication())).toBe(false);
    expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBe(raw);
    expect(await AsyncStorage.getItem(LEGACY_APPLICATION_STORAGE_KEY)).not.toBeNull();
  });

  it('leaves an invalid v1 untouched and does not create a v2 fallback', async () => {
    const raw = JSON.stringify({ ...legacyData(), calibrationSession: { bad: true } });
    await AsyncStorage.setItem(LEGACY_APPLICATION_STORAGE_KEY, raw);
    expect((await loadApplication()).status).toBe('blocked');
    expect(await saveApplication(createDefaultApplication())).toBe(false);
    expect(await AsyncStorage.getItem(LEGACY_APPLICATION_STORAGE_KEY)).toBe(raw);
    expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBeNull();
  });

  it('rejects inconsistent quick results and unknown stimulus versions', () => {
    const application = { ...createDefaultApplication(), quickSetupResult: { ...completeQuickSetup(['unclear', 'unclear', 'unclear'], 'now'), provisionalColor: 'red' } };
    expect(decodePersistedApplication(JSON.stringify(application)).status).toBe('blocked');
    const original = legacyData();
    expect(decodePersistedApplication(JSON.stringify({ ...original, calibrationSession: { ...original.calibrationSession, stimulusVersion: 99 } })).status).toBe('blocked');
  });

  it('rejects mismatched raw trial conditions and unknown versions inside history', () => {
    const original = legacyData();
    const session = original.calibrationSession;
    const mismatched = { ...session, responses: session.responses.map((response, index) => index === 0 ? { ...response, sessionSeed: 99 } : response) };
    expect(decodePersistedApplication(JSON.stringify({ ...original, calibrationSession: mismatched })).status).toBe('blocked');
    expect(decodePersistedApplication(JSON.stringify({ ...original, calibrationHistory: [{ ...session, schemaVersion: 99 }] })).status).toBe('blocked');
    const decoded = decodePersistedApplication(JSON.stringify({ ...original, calibrationHistory: [session] }));
    expect(decoded.application.calibrationHistory).toEqual([session]);
  });

  it('validates an explicit setup source and preserves it over a historical detailed profile', () => {
    const original = legacyData();
    const quickSetupResult = completeQuickSetup(['blueFront', 'blueFront', 'blueFront'], 'now');
    const migrated = decodePersistedApplication(JSON.stringify(original)).application;
    const selected = { ...migrated, quickSetupResult, activeSetupSource: 'quick' };
    expect(decodePersistedApplication(JSON.stringify(selected)).application.activeSetupSource).toBe('quick');
    expect(decodePersistedApplication(JSON.stringify({ ...createDefaultApplication(), activeSetupSource: 'quick' })).status).toBe('blocked');
    expect(decodePersistedApplication(JSON.stringify({ ...createDefaultApplication(), activeSetupSource: 'detailed' })).status).toBe('blocked');
    expect(decodePersistedApplication(JSON.stringify({ ...selected, activeSetupSource: 'future' })).status).toBe('blocked');
  });

  it('reports read and write failures without deleting existing data', async () => {
    await AsyncStorage.setItem(LEGACY_APPLICATION_STORAGE_KEY, JSON.stringify(legacyData()));
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('read failed'));
    expect((await loadApplication()).status).toBe('blocked');
    expect(await saveApplication(createDefaultApplication())).toBe(false);
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('write failed'));
    const result = await loadApplication();
    expect(result.status).toBe('blocked');
    expect(result.application.bestMazeScore).toBe(432);
    expect(await AsyncStorage.getItem(LEGACY_APPLICATION_STORAGE_KEY)).not.toBeNull();
    expect(await saveApplication(createDefaultApplication())).toBe(false);
  });

  it('serializes reset after in-flight writes and cancels queued stale saves', async () => {
    let release: (() => void) | undefined;
    let reportStarted: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { reportStarted = resolve; });
    const write = jest.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; reportStarted?.(); }));
    const first = saveApplication(createDefaultApplication());
    await entered;
    const stale = saveApplication({ ...createDefaultApplication(), bestMazeScore: 100 });
    const reset = resetApplicationStorage();
    release?.();
    expect(await first).toBe(true);
    expect(await stale).toBe(false);
    expect(await reset).toBe(true);
    expect(write).toHaveBeenCalledTimes(1);
    expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(LEGACY_APPLICATION_STORAGE_KEY)).toBeNull();
    expect(await saveApplication(createDefaultApplication())).toBe(true);
  });

  it('reports reset failure and prevents overwriting data afterward', async () => {
    jest.mocked(AsyncStorage.multiRemove).mockRejectedValueOnce(new Error('remove failed'));
    expect(await resetApplicationStorage()).toBe(false);
    expect(await saveApplication(createDefaultApplication())).toBe(false);
  });
});
