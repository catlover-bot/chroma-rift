import { appReducer, initialAppState, persistedFromState } from '../state';
import * as detailedScoring from '../../domain/calibration/scoring';
import type { QuickSetupAnswer } from '../../domain/calibration/quickSetup';
import type { CalibrationResponse } from '../../domain/calibration/types';
import { createDefaultApplication } from '../../storage/applicationStorage';

const started = appReducer(initialAppState, {
  type: 'START_CALIBRATION',
  seed: 7,
  startedAt: '2026-01-01T00:00:00.000Z',
});

const quickStarted = () => appReducer(initialAppState, { type: 'PLAY', sessionId: 'quick-a' });
const quickAnswer = (state = quickStarted(), answer: QuickSetupAnswer = 'unclear') => ({
  type: 'ADD_QUICK_RESPONSE' as const,
  sessionId: state.quickSetupSession?.id ?? '', index: state.quickSetupSession?.responses.length ?? 0,
  answer, respondedAt: '2026-09-05T00:00:00Z',
});

describe('quick setup and retained legacy journey', () => {
  it('starts first play with quick setup and ends after exactly three taps without detailed scoring', () => {
    const classifier = jest.spyOn(detailedScoring, 'calculateCalibrationProfile');
    let state = quickStarted();
    expect(state.screen).toBe('quickSetup');
    for (let index = 0; index < 3; index += 1) state = appReducer(state, quickAnswer(state));
    expect(state.screen).toBe('playInstructions');
    expect(state.quickSetupResult?.answers).toHaveLength(3);
    expect(state.quickSetupResult?.provisionalColor).toBe('neutral');
    expect(state.settings.depthAssist).toBe(true);
    expect(state.calibrationProfile).toBeUndefined();
    expect(classifier).not.toHaveBeenCalled();
    expect(appReducer(state, quickAnswer())).toBe(state);
    classifier.mockRestore();
  });

  it('ignores duplicate, out of sequence and previous-session taps', () => {
    const start = quickStarted();
    const action = quickAnswer(start, 'redFront');
    const next = appReducer(start, action);
    expect(appReducer(next, action)).toBe(next);
    expect(appReducer(start, { ...action, index: 2 })).toBe(start);
    const restart = appReducer(next, { type: 'START_QUICK_SETUP', sessionId: 'quick-b' });
    expect(appReducer(restart, action)).toBe(restart);
  });

  it('persists skip so relaunch goes directly to instructions', () => {
    const skipped = appReducer(quickStarted(), { type: 'SKIP_QUICK_SETUP', completedAt: '2026-09-05' });
    expect(skipped.quickSetupResult?.status).toBe('skipped');
    expect(skipped.settings.depthAssist).toBe(true);
    const hydrated = appReducer(initialAppState, { type: 'HYDRATE', persisted: persistedFromState(skipped), systemReducedMotion: true });
    expect(appReducer(hydrated, { type: 'PLAY' }).screen).toBe('playInstructions');
    expect(hydrated.settings.reducedMotion).toBe(true);
  });

  it('uses a completed saved quick setting after relaunch', () => {
    let state = quickStarted();
    for (let index = 0; index < 3; index += 1) state = appReducer(state, quickAnswer(state, 'blueFront'));
    const saved = persistedFromState(state);
    expect(saved.quickSetupResult?.provisionalColor).toBe('blue');
    expect(saved).not.toHaveProperty('quickSetupSession');
    state = appReducer(initialAppState, { type: 'HYDRATE', persisted: saved, systemReducedMotion: false });
    expect(appReducer(state, { type: 'PLAY' }).screen).toBe('playInstructions');
  });

  it('restarts interrupted setup from a valid first question', () => {
    const once = appReducer(quickStarted(), quickAnswer());
    const hydrated = appReducer(initialAppState, { type: 'HYDRATE', persisted: persistedFromState(once), systemReducedMotion: false });
    const replay = appReducer(hydrated, { type: 'PLAY' });
    expect(replay.quickSetupSession?.responses).toEqual([]);
    expect(replay.screen).toBe('quickSetup');
  });

  it('preserves explicit assist through quick results, skip and detailed results', () => {
    const explicit = appReducer(quickStarted(), { type: 'UPDATE_SETTINGS', settings: { ...initialAppState.settings, depthAssist: false } });
    expect(explicit.settings.depthAssistOverridden).toBe(true);
    let quick = explicit;
    for (let index = 0; index < 3; index += 1) quick = appReducer(quick, quickAnswer(quick));
    expect(quick.settings.depthAssist).toBe(false);
    expect(appReducer(explicit, { type: 'SKIP_QUICK_SETUP' }).settings.depthAssist).toBe(false);
    let detailed = appReducer(explicit, { type: 'START_CALIBRATION', seed: 12, startedAt: 'now' });
    for (let index = 0; index < 12; index += 1) detailed = appReducer(detailed, { type: 'ADD_CALIBRATION_RESPONSE', response: answerFor(detailed) });
    expect(detailed.settings.depthAssist).toBe(false);
    expect(appReducer(detailed, { type: 'PLAY' }).screen).toBe('playInstructions');
    expect(detailed.calibrationSession?.stimulusVersion).toBe(2);
  });

  it('uses the latest explicitly completed setup while retaining older detailed data', () => {
    let detailed = started;
    for (let index = 0; index < 12; index += 1) detailed = appReducer(detailed, { type: 'ADD_CALIBRATION_RESPONSE', response: answerFor(detailed) });
    expect(detailed.activeSetupSource).toBe('detailed');
    let quick = appReducer(detailed, { type: 'START_QUICK_SETUP', sessionId: 'retake' });
    for (let index = 0; index < 3; index += 1) quick = appReducer(quick, quickAnswer(quick, 'blueFront'));
    expect(quick.activeSetupSource).toBe('quick');
    expect(quick.quickSetupResult?.provisionalColor).toBe('blue');
    expect(quick.calibrationProfile).toBe(detailed.calibrationProfile);
    expect(quick.calibrationSession).toBe(detailed.calibrationSession);
    expect(persistedFromState(quick).activeSetupSource).toBe('quick');
    const skip = appReducer(appReducer(quick, { type: 'START_QUICK_SETUP', sessionId: 'aborted' }), { type: 'SKIP_QUICK_SETUP' });
    expect(skip.activeSetupSource).toBe('quick');
    expect(skip.quickSetupResult).toBe(quick.quickSetupResult);
    expect(appReducer(detailed, { type: 'SKIP_QUICK_SETUP' }).activeSetupSource).toBe('detailed');
  });

  it('advances through two stages once, without scores or profile changes, then replays', () => {
    const prepared = appReducer(quickStarted(), { type: 'SKIP_QUICK_SETUP' });
    let state = appReducer(prepared, { type: 'BEGIN_LEGACY_JOURNEY' });
    const first = { levelId: 'floating-corridor', collectibleCount: 2, discoveredMechanisms: ['color'] };
    const second = { levelId: 'impossible-bridge', collectibleCount: 2, discoveredMechanisms: ['projection'] };
    const run = state.journeyRun;
    expect(appReducer(state, { type: 'COMPLETE_STAGE', summary: second, journeyRun: run })).toBe(state);
    state = appReducer(state, { type: 'COMPLETE_STAGE', summary: first, journeyRun: run });
    expect(state.stageIndex).toBe(1);
    expect(appReducer(state, { type: 'COMPLETE_STAGE', summary: first, journeyRun: run })).toBe(state);
    state = appReducer(state, { type: 'COMPLETE_STAGE', summary: second, journeyRun: run });
    expect(state.screen).toBe('journeyResult');
    expect(state.journeySummaries).toEqual([first, second]);
    expect(state.quickSetupResult).toBe(prepared.quickSetupResult);
    expect(state.bestMazeScore).toBe(0);
    const replay = appReducer(state, { type: 'BEGIN_LEGACY_JOURNEY' });
    expect(replay.stageIndex).toBe(0);
    expect(replay.journeySummaries).toEqual([]);
    expect(appReducer(replay, { type: 'COMPLETE_STAGE', summary: first, journeyRun: run })).toBe(replay);
  });
});

describe('normal first-person chapter navigation', () => {
  it('enters first person after three setup answers', () => {
    let state = quickStarted();
    for (let index = 0; index < 3; index += 1) state = appReducer(state, quickAnswer(state));
    expect(state.screen).toBe('playInstructions');
    expect(appReducer(state, { type: 'BEGIN_JOURNEY' }).screen).toBe('firstPerson');
  });

  it('enters first person after skip without modifying explicit settings', () => {
    const settings = { ...initialAppState.settings, depthAssist: false, depthAssistOverridden: true, reducedMotion: true, reducedMotionOverridden: true, haptics: false };
    const configured = appReducer(initialAppState, { type: 'UPDATE_SETTINGS', settings });
    const skipped = appReducer(configured, { type: 'SKIP_QUICK_SETUP' });
    const chapter = appReducer(skipped, { type: 'BEGIN_JOURNEY' });
    expect(chapter.screen).toBe('firstPerson');
    expect(chapter.settings).toEqual(settings);
    expect(persistedFromState(chapter)).not.toHaveProperty('pose');
  });

  it('accepts this chapter once and ignores incomplete, wrong-chapter and stale completion callbacks', () => {
    const chapter = appReducer(initialAppState, { type: 'BEGIN_JOURNEY' });
    const summary = { chapterId: 'returnless-entrance', seals: 2, discoveredMechanisms: ['消えない床', '重なる鍵', '帰路の変化'] };
    const action = { type: 'COMPLETE_CHAPTER' as const, summary, journeyRun: chapter.journeyRun };
    expect(appReducer(chapter, { ...action, summary: { ...summary, seals: 1 } })).toBe(chapter);
    expect(appReducer(chapter, { ...action, summary: { ...summary, chapterId: 'future' } })).toBe(chapter);
    const result = appReducer(chapter, action);
    expect(result.screen).toBe('firstPersonResult');
    expect(result.firstPersonSummary).toEqual(summary);
    expect(appReducer(result, action)).toBe(result);
    const replay = appReducer(result, { type: 'BEGIN_JOURNEY' });
    expect(replay.firstPersonSummary).toBeUndefined();
    expect(appReducer(replay, action)).toBe(replay);
    expect(replay.bestMazeScore).toBe(initialAppState.bestMazeScore);
  });

  it('keeps legacy exploration results separate from chapter results', () => {
    const chapter = appReducer(initialAppState, { type: 'BEGIN_JOURNEY' });
    expect(appReducer(chapter, { type: 'COMPLETE_STAGE', summary: { levelId: 'floating-corridor', collectibleCount: 2, discoveredMechanisms: [] }, journeyRun: chapter.journeyRun })).toBe(chapter);
    expect(appReducer(chapter, { type: 'BEGIN_LEGACY_JOURNEY' }).screen).toBe('illusionMaze');
  });
});

function answerFor(state = started): CalibrationResponse {
  const trial = state.calibrationSession?.trials[state.calibrationSession.responses.length];
  if (!trial || !state.calibrationSession) throw new Error('missing trial');
  return {
    schemaVersion: 1,
    trialId: trial.id,
    patternFamily: trial.patternFamily,
    background: trial.background,
    colorRoleAssignment: trial.colorRoleAssignment,
    answer: 'same',
    respondedAt: '2026-01-01T00:00:00.000Z',
    sessionSeed: state.calibrationSession.seed,
  };
}

describe('application calibration flow', () => {
  it('advances calibration exactly once and ignores duplicate responses', () => {
    const response = answerFor();
    const once = appReducer(started, { type: 'ADD_CALIBRATION_RESPONSE', response });
    const duplicate = appReducer(once, { type: 'ADD_CALIBRATION_RESPONSE', response });
    expect(once.calibrationSession?.responses).toHaveLength(1);
    expect(duplicate).toBe(once);
  });

  it('reaches the result screen after 12 accepted responses', () => {
    let state = started;
    for (let index = 0; index < 12; index += 1) {
      state = appReducer(state, { type: 'ADD_CALIBRATION_RESPONSE', response: answerFor(state) });
    }
    expect(state.screen).toBe('calibrationResult');
    expect(state.calibrationProfile?.totalTrials).toBe(12);
  });

  it('returns to a valid initial screen on reset', () => {
    const reset = appReducer(started, { type: 'RESET', defaults: createDefaultApplication(false) });
    expect(reset.screen).toBe('welcome');
    expect(reset.calibrationSession).toBeUndefined();
    expect(reset.hydrated).toBe(true);
  });

  it('archives existing raw detailed answers before a retake, including incomplete sessions', () => {
    const previous = appReducer(started, { type: 'ADD_CALIBRATION_RESPONSE', response: answerFor() });
    const retake = appReducer(previous, { type: 'START_CALIBRATION', seed: 11, startedAt: 'later' });
    expect(retake.calibrationHistory).toEqual([previous.calibrationSession]);
    expect(retake.calibrationHistory?.[0]?.responses[0]?.stimulusVersion).toBeUndefined();
    expect(retake.calibrationSession?.responses).toEqual([]);
    expect(persistedFromState(retake).calibrationHistory).toEqual([previous.calibrationSession]);
  });
});
