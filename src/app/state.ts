import { calculateCalibrationProfile } from '../domain/calibration/scoring';
import { generateCalibrationTrials } from '../domain/calibration/trials';
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
  ScreenName,
} from '../types/application';

export type AppState = PersistedApplication & {
  screen: ScreenName;
  hydrated: boolean;
  latestMazeScore?: MazeScore;
};

export type AppAction =
  | { type: 'HYDRATE'; persisted: PersistedApplication; systemReducedMotion: boolean }
  | { type: 'NAVIGATE'; screen: ScreenName }
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
      if (action.screen === 'developerLab' && !__DEV__) return state;
      return { ...state, screen: action.screen };
    case 'START_CALIBRATION':
      return {
        ...state,
        screen: 'calibration',
        calibrationSession: {
          schemaVersion: 1,
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
      if (!session || session.responses.some((response) => response.trialId === action.response.trialId)) {
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
        onboardingComplete: true,
        settings: { ...state.settings, depthAssist: calibrationProfile.depthAssistDefault },
      };
    }
    case 'UPDATE_SETTINGS':
      return { ...state, settings: action.settings };
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
      return { ...action.defaults, screen: 'welcome', hydrated: true };
  }
}

export function persistedFromState(state: AppState): PersistedApplication {
  return {
    schemaVersion: 1,
    settings: state.settings,
    bestMazeScore: state.bestMazeScore,
    onboardingComplete: state.onboardingComplete,
    ...(state.calibrationProfile ? { calibrationProfile: state.calibrationProfile } : {}),
    ...(state.calibrationSession ? { calibrationSession: state.calibrationSession } : {}),
    ...(__DEV__ && state.developerLab ? { developerLab: state.developerLab } : {}),
  };
}
