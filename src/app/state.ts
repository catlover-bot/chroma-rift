import { calculateCalibrationProfile } from '../domain/calibration/scoring';
import { generateCalibrationTrials } from '../domain/calibration/trials';
import { completeQuickSetup, skipQuickSetup, QUICK_SETUP_ANSWERS, type QuickSetupAnswer, type QuickSetupSession } from '../domain/calibration/quickSetup';
import {
  DEFAULT_CALIBRATION_ENVIRONMENT,
  type CalibrationEnvironment,
  type CalibrationResponse,
} from '../domain/calibration/types';
import type { MazeScore } from '../domain/maze/types';
import { createDefaultApplication } from '../storage/applicationStorage';
import type {
  AppSettings,
  DeveloperLabParameters,
  PersistedApplication,
  JourneyStageSummary,
  FirstPersonChapterSummary,
  ScreenName,
} from '../types/application';

export type AppState = PersistedApplication & {
  screen: ScreenName;
  hydrated: boolean;
  latestMazeScore?: MazeScore;
  quickSetupSession?: QuickSetupSession | undefined;
  quickSessionRevision: number;
  stageIndex: 0 | 1;
  journeySummaries: JourneyStageSummary[];
  journeyRun: number;
  firstPersonSummary?: FirstPersonChapterSummary | undefined;
};

export type AppAction =
  | { type: 'HYDRATE'; persisted: PersistedApplication; systemReducedMotion: boolean }
  | { type: 'NAVIGATE'; screen: ScreenName }
  | { type: 'PLAY'; sessionId?: string }
  | { type: 'START_QUICK_SETUP'; sessionId: string }
  | { type: 'SKIP_QUICK_SETUP'; completedAt?: string }
  | { type: 'ADD_QUICK_RESPONSE'; sessionId: string; index: number; answer: QuickSetupAnswer; respondedAt: string }
  | { type: 'BEGIN_JOURNEY' }
  | { type: 'BEGIN_LEGACY_JOURNEY' }
  | { type: 'COMPLETE_CHAPTER'; summary: FirstPersonChapterSummary; journeyRun: number }
  | { type: 'COMPLETE_STAGE'; summary: JourneyStageSummary; journeyRun: number }
  | { type: 'START_CALIBRATION'; seed: number; startedAt: string }
  | { type: 'ADD_CALIBRATION_RESPONSE'; response: CalibrationResponse }
  | { type: 'UPDATE_SETTINGS'; settings: AppSettings }
  | { type: 'FINISH_MAZE'; score: MazeScore }
  | { type: 'UPDATE_LAB'; parameters: DeveloperLabParameters }
  | { type: 'UPDATE_ENVIRONMENT'; environment: CalibrationEnvironment }
  | { type: 'RESET'; defaults: PersistedApplication };

export const initialAppState: AppState = {
  ...createDefaultApplication(false),
  screen: 'welcome',
  hydrated: false,
  quickSessionRevision: 0,
  stageIndex: 0,
  journeySummaries: [],
  journeyRun: 0,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'HYDRATE': {
      const settings = action.persisted.settings.reducedMotionOverridden
        ? action.persisted.settings
        : { ...action.persisted.settings, reducedMotion: action.systemReducedMotion };
      return { ...state, ...action.persisted, settings, screen: 'welcome', hydrated: true };
    }
    case 'NAVIGATE':
      if ((action.screen === 'developerLab' || action.screen === 'firstPersonLab') && !__DEV__) return state;
      return { ...state, screen: action.screen };
    case 'PLAY':
      if (state.quickSetupResult || state.calibrationProfile) return { ...state, screen: 'playInstructions' };
      return {
        ...state, screen: 'quickSetup', quickSessionRevision: state.quickSessionRevision + 1,
        quickSetupSession: { id: action.sessionId ?? `quick-${state.quickSessionRevision + 1}`, responses: [] },
      };
    case 'START_QUICK_SETUP':
      return {
        ...state, screen: 'quickSetup', quickSessionRevision: state.quickSessionRevision + 1,
        quickSetupSession: { id: action.sessionId, responses: [] },
      };
    case 'SKIP_QUICK_SETUP':
      return {
        ...state, screen: 'playInstructions', onboardingComplete: true, quickSetupSession: undefined,
        quickSetupResult: state.quickSetupResult ?? skipQuickSetup(action.completedAt ?? ''),
        activeSetupSource: state.activeSetupSource ?? (state.calibrationProfile ? 'detailed' : 'quick'),
        settings: state.settings.depthAssistOverridden || state.quickSetupResult || state.calibrationProfile
          ? state.settings : { ...state.settings, depthAssist: true },
      };
    case 'ADD_QUICK_RESPONSE': {
      const session = state.quickSetupSession;
      if (state.screen !== 'quickSetup' || !session || session.id !== action.sessionId ||
        session.responses.length !== action.index || action.index >= 3 || !QUICK_SETUP_ANSWERS.includes(action.answer)) return state;
      const responses = [...session.responses, action.answer];
      if (responses.length < 3) return { ...state, quickSetupSession: { ...session, responses } };
      const result = completeQuickSetup(responses, action.respondedAt);
      return {
        ...state, screen: 'playInstructions', onboardingComplete: true, quickSetupSession: undefined,
        quickSetupResult: result,
        activeSetupSource: 'quick',
        settings: state.settings.depthAssistOverridden ? state.settings : { ...state.settings, depthAssist: result.suggestDepthAssist },
      };
    }
    case 'BEGIN_JOURNEY':
      return { ...state, screen: 'firstPerson', firstPersonSummary: undefined, journeyRun: state.journeyRun + 1 };
    case 'BEGIN_LEGACY_JOURNEY':
      return { ...state, screen: 'illusionMaze', stageIndex: 0, journeySummaries: [], journeyRun: state.journeyRun + 1 };
    case 'COMPLETE_CHAPTER':
      if (state.screen !== 'firstPerson' || action.journeyRun !== state.journeyRun ||
        action.summary.chapterId !== 'returnless-entrance' || action.summary.seals !== 2) return state;
      return { ...state, screen: 'firstPersonResult', firstPersonSummary: action.summary };
    case 'COMPLETE_STAGE': {
      const expectedLevel = state.stageIndex === 0 ? 'floating-corridor' : 'impossible-bridge';
      if (state.screen !== 'illusionMaze' || action.journeyRun !== state.journeyRun ||
        action.summary.levelId !== expectedLevel || action.summary.collectibleCount !== 2 ||
        state.journeySummaries.some((item) => item.levelId === action.summary.levelId)) return state;
      const journeySummaries = [...state.journeySummaries, action.summary];
      return state.stageIndex === 0
        ? { ...state, journeySummaries, stageIndex: 1 }
        : { ...state, journeySummaries, screen: 'journeyResult' };
    }
    case 'START_CALIBRATION':
      return {
        ...state,
        screen: 'calibration',
        ...(state.calibrationSession && state.calibrationSession.responses.length > 0 ? {
          calibrationHistory: [...(state.calibrationHistory ?? []), state.calibrationSession],
        } : {}),
        calibrationSession: {
          schemaVersion: 1,
          stimulusVersion: 2,
          seed: action.seed,
          startedAt: action.startedAt,
          environment:
            state.calibrationSession?.environment ??
            state.developerLab?.environment ??
            DEFAULT_CALIBRATION_ENVIRONMENT,
          trials: generateCalibrationTrials(action.seed),
          responses: [],
        },
      };
    case 'ADD_CALIBRATION_RESPONSE': {
      const session = state.calibrationSession;
      const currentTrial = session?.trials[session.responses.length];
      if (state.screen !== 'calibration' || !session || !currentTrial ||
        currentTrial.id !== action.response.trialId || session.seed !== action.response.sessionSeed ||
        currentTrial.patternFamily !== action.response.patternFamily || currentTrial.background !== action.response.background ||
        currentTrial.colorRoleAssignment !== action.response.colorRoleAssignment ||
        session.responses.some((response) => response.trialId === action.response.trialId)) {
        return state;
      }
      const responses = [...session.responses, action.response];
      if (responses.length < 12) return { ...state, calibrationSession: { ...session, responses } };
      const calibrationProfile = calculateCalibrationProfile(responses, 12);
      return {
        ...state,
        screen: 'calibrationResult',
        calibrationSession: { ...session, responses, completedAt: action.response.respondedAt },
        calibrationProfile,
        activeSetupSource: 'detailed',
        onboardingComplete: true,
        settings: state.settings.depthAssistOverridden ? state.settings : { ...state.settings, depthAssist: calibrationProfile.depthAssistDefault },
      };
    }
    case 'UPDATE_SETTINGS':
      return {
        ...state,
        settings: {
          ...action.settings,
          depthAssistOverridden: action.settings.depthAssistOverridden || state.settings.depthAssistOverridden || action.settings.depthAssist !== state.settings.depthAssist,
        },
      };
    case 'FINISH_MAZE':
      return {
        ...state,
        screen: 'stageResult',
        latestMazeScore: action.score,
        bestMazeScore: Math.max(state.bestMazeScore, action.score.score),
      };
    case 'UPDATE_LAB':
      return __DEV__ ? { ...state, developerLab: action.parameters } : state;
    case 'UPDATE_ENVIRONMENT':
      return state.calibrationSession
        ? { ...state, calibrationSession: { ...state.calibrationSession, environment: action.environment } }
        : state;
    case 'RESET':
      return { ...action.defaults, screen: 'welcome', hydrated: true, quickSessionRevision: state.quickSessionRevision + 1, stageIndex: 0, journeySummaries: [], journeyRun: state.journeyRun + 1 };
  }
}

export function persistedFromState(state: AppState): PersistedApplication {
  return {
    schemaVersion: 2,
    settings: state.settings,
    bestMazeScore: state.bestMazeScore,
    onboardingComplete: state.onboardingComplete,
    ...(state.quickSetupResult ? { quickSetupResult: state.quickSetupResult } : {}),
    ...(state.activeSetupSource ? { activeSetupSource: state.activeSetupSource } : {}),
    ...(state.calibrationProfile ? { calibrationProfile: state.calibrationProfile } : {}),
    ...(state.calibrationSession ? { calibrationSession: state.calibrationSession } : {}),
    ...(state.calibrationHistory ? { calibrationHistory: state.calibrationHistory } : {}),
    ...(state.developerLab ? { developerLab: state.developerLab } : {}),
  };
}
