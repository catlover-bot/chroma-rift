import { useEffect, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { appReducer, initialAppState, persistedFromState } from './src/app/state';
import { createCheckpoint, createInitialRuntime, type CheckpointState } from './src/domain/firstPerson';
import { CalibrationInstructionsScreen } from './src/screens/CalibrationInstructionsScreen';
import { CalibrationResultScreen } from './src/screens/CalibrationResultScreen';
import { CalibrationScreen } from './src/screens/CalibrationScreen';
import { DeveloperLabScreen } from './src/screens/DeveloperLabScreen';
import { IllusionMazeScreen } from './src/screens/IllusionMazeScreen';
import { JourneyResultScreen } from './src/screens/JourneyResultScreen';
import { MicroMazeScreen } from './src/screens/MicroMazeScreen';
import { NativeFirstPersonGate } from './src/screens/NativeFirstPersonGate';
import { FirstPersonResultScreen } from './src/screens/FirstPersonResultScreen';
import { PlayInstructionsScreen } from './src/screens/PlayInstructionsScreen';
import { QuickSetupScreen } from './src/screens/QuickSetupScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StageResultScreen } from './src/screens/StageResultScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import {
  createDefaultApplication,
  loadApplication,
  saveApplication,
} from './src/storage/applicationStorage';
import {
  beginFirstPersonSession, isFirstPersonSessionCurrent, loadFirstPersonStorage,
  resetAllApplicationStorage, resetFirstPersonChapter,
  saveFirstPersonCheckpoint, saveFirstPersonControls, saveFirstPersonOnboarding,
} from './src/storage/firstPersonStorage';
import { UI_COLORS } from './src/theme/ui';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_FIRST_PERSON_ONBOARDING, DEFAULT_LAB_PARAMETERS, type FirstPersonControls, type FirstPersonOnboarding, type PersistedApplication } from './src/types/application';

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);
  const [storageWritable, setStorageWritable] = useState(false);
  const [storageMessage, setStorageMessage] = useState<string | undefined>();
  const [resetting, setResetting] = useState(false);
  const resetInFlight = useRef(false);
  const [controls, setControls] = useState<FirstPersonControls>({ ...DEFAULT_FIRST_PERSON_CONTROLS });
  const [checkpoint, setCheckpoint] = useState<CheckpointState>(() => createCheckpoint(createInitialRuntime()));
  const [firstPersonMessage, setFirstPersonMessage] = useState<string | undefined>();
  const [chapterLease, setChapterLease] = useState(0);
  const [completedAtEntry, setCompletedAtEntry] = useState(false);
  const [onboarding, setOnboarding] = useState<FirstPersonOnboarding>({ ...DEFAULT_FIRST_PERSON_ONBOARDING });
  const [onboardingWritable, setOnboardingWritable] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      let systemReducedMotion = false;
      try {
        systemReducedMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        // The in-app setting remains available if the platform preference cannot be read.
      }
      const [loaded, chapter] = await Promise.all([loadApplication(systemReducedMotion), loadFirstPersonStorage()]);
      if (!active) return;
      setControls(chapter.controls);
      setOnboarding(chapter.onboarding);
      setOnboardingWritable(chapter.onboardingWritable);
      setCheckpoint(chapter.checkpoint);
      setFirstPersonMessage(chapter.message);
      setStorageWritable(loaded.status !== 'blocked');
      setStorageMessage(loaded.message);
      dispatch({ type: 'HYDRATE', persisted: loaded.application, systemReducedMotion });
    })();
    return () => { active = false; };
  }, []);

  // Navigation and transient game actions do not cause duplicate persistence writes.
  const persistedJSON = JSON.stringify(persistedFromState(state));
  useEffect(() => {
    if (!state.hydrated || !storageWritable) return;
    let active = true;
    void saveApplication(JSON.parse(persistedJSON) as PersistedApplication).then((saved) => {
      if (active) setStorageMessage(saved ? undefined : '保存できませんでした。この起動中はそのまま遊べます。');
    });
    return () => { active = false; };
  }, [persistedJSON, state.hydrated, storageWritable]);

  useEffect(() => {
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (reducedMotion) => {
      if (!state.settings.reducedMotionOverridden) {
        dispatch({ type: 'UPDATE_SETTINGS', settings: { ...state.settings, reducedMotion } });
      }
    });
    return () => subscription.remove();
  }, [state.settings]);

  const navigateHome = () => dispatch({ type: 'NAVIGATE', screen: 'welcome' });
  const beginCalibration = () =>
    dispatch({ type: 'START_CALIBRATION', seed: Date.now() >>> 0, startedAt: new Date().toISOString() });
  const beginChapter = (restart = false) => {
    setCompletedAtEntry(!restart && checkpoint.progress.cleared);
    setChapterLease(beginFirstPersonSession());
    dispatch({ type: 'BEGIN_JOURNEY' });
  };
  const restartChapter = async () => {
    if (resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    const removed = await resetFirstPersonChapter();
    if (removed) {
      setCheckpoint(createCheckpoint(createInitialRuntime()));
      setFirstPersonMessage(undefined);
      beginChapter(true);
    } else {
      setFirstPersonMessage('章をリセットできませんでした。保存データを保持しています。');
      navigateHome();
    }
    resetInFlight.current = false;
    setResetting(false);
  };

  const reset = async () => {
    if (resetInFlight.current) return;
    resetInFlight.current = true;
    setResetting(true);
    setStorageWritable(false);
    const removed = await resetAllApplicationStorage();
    if (!removed) {
      setStorageMessage('保存データを削除できませんでした。この起動中の変更は保存されません。設定画面からもう一度お試しください。');
      resetInFlight.current = false;
      setResetting(false);
      return;
    }
    let systemReducedMotion = false;
    try {
      systemReducedMotion = await AccessibilityInfo.isReduceMotionEnabled();
    } catch {
      // Reset does not depend on the platform preference being available.
    }
    setStorageWritable(true);
    setStorageMessage(undefined);
    setFirstPersonMessage(undefined);
    setControls({ ...DEFAULT_FIRST_PERSON_CONTROLS });
    setOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING });
    setOnboardingWritable(true);
    setCheckpoint(createCheckpoint(createInitialRuntime()));
    setChapterLease(beginFirstPersonSession());
    dispatch({ type: 'RESET', defaults: createDefaultApplication(systemReducedMotion) });
    resetInFlight.current = false;
    setResetting(false);
  };

  const hasSetup = Boolean(state.quickSetupResult || state.calibrationProfile);
  let screen;
  if (!state.hydrated || resetting) {
    screen = <View style={styles.loading} accessibilityLabel="読み込み中"><ActivityIndicator color={UI_COLORS.text} /></View>;
  } else if (state.screen === 'quickSetup' && state.quickSetupSession) {
    const session = state.quickSetupSession;
    screen = (
      <QuickSetupScreen
        session={session}
        onResponse={(index, answer) => dispatch({
          type: 'ADD_QUICK_RESPONSE', sessionId: session.id, index, answer, respondedAt: new Date().toISOString(),
        })}
        onSkip={() => dispatch({ type: 'SKIP_QUICK_SETUP', completedAt: new Date().toISOString() })}
        onExit={navigateHome}
      />
    );
  } else if (state.screen === 'playInstructions') {
    screen = <PlayInstructionsScreen controls={controls} reducedMotion={state.settings.reducedMotion} onStart={() => beginChapter()} onBack={navigateHome} />;
  } else if (state.screen === 'firstPersonResult' && state.firstPersonSummary) {
    screen = <FirstPersonResultScreen summary={state.firstPersonSummary} onReplay={() => void restartChapter()} onHome={navigateHome} />;
  } else if (state.screen === 'firstPerson' || (state.screen === 'firstPersonLab' && __DEV__)) {
    const lab = state.screen === 'firstPersonLab';
    // Every callback captures this mounted run's lease; an old save/completion cannot adopt a new run.
    const lease = chapterLease;
    screen = !lab && completedAtEntry ? (
      <FirstPersonResultScreen
        summary={{ chapterId: checkpoint.chapterId, seals: 2, discoveredMechanisms: ['消えない床', '重なる鍵', '戻ったはずの入口'] }}
        onReplay={() => void restartChapter()} onHome={navigateHome}
      />
    ) : (
      <NativeFirstPersonGate
        key={`${lab ? 'lab' : 'chapter'}-${lease}`} scene={lab ? 'lab' : 'chapter'}
        settings={state.settings} controls={controls} {...(!lab ? { checkpoint } : {})}
        onboarding={onboarding}
        onOnboardingChange={(next) => {
          if (lab || !isFirstPersonSessionCurrent(lease)) return;
          setOnboarding((previous) => isFirstPersonSessionCurrent(lease) ? {
            schemaVersion: 1,
            controlChoiceAcknowledged: previous.controlChoiceAcknowledged || next.controlChoiceAcknowledged,
            tutorialCompleted: previous.tutorialCompleted || next.tutorialCompleted,
          } : previous);
          if (onboardingWritable) void saveFirstPersonOnboarding(next, lease).then((saved) => {
            if (!saved && isFirstPersonSessionCurrent(lease)) setFirstPersonMessage('操作の案内を保存できませんでした。この起動中は続けられます。');
          });
        }}
        preferredColor={state.activeSetupSource === 'quick' ? state.quickSetupResult?.provisionalColor ?? 'neutral' : state.calibrationProfile?.preferredForegroundColor ?? state.quickSetupResult?.provisionalColor ?? 'neutral'}
        onSettingsChange={(settings) => { if (isFirstPersonSessionCurrent(lease)) dispatch({ type: 'UPDATE_SETTINGS', settings }); }}
        onControlsChange={(next) => {
          if (!isFirstPersonSessionCurrent(lease)) return;
          setControls(next);
          void saveFirstPersonControls(next, lease).then((saved) => {
            if (!saved && isFirstPersonSessionCurrent(lease)) setFirstPersonMessage('操作設定を保存できませんでした。この起動中は変更した設定で遊べます。');
          });
        }}
        onCheckpoint={(next) => {
          if (lab || !isFirstPersonSessionCurrent(lease)) return;
          setCheckpoint(next);
          void saveFirstPersonCheckpoint(next, lease).then((saved) => {
            if (!saved && isFirstPersonSessionCurrent(lease)) setFirstPersonMessage('章の進行を保存できませんでした。この起動中はそのまま遊べます。');
          });
        }}
        onComplete={(summary) => {
          if (!lab && isFirstPersonSessionCurrent(lease)) dispatch({ type: 'COMPLETE_CHAPTER', summary, journeyRun: state.journeyRun });
        }}
        onRestart={() => { if (!isFirstPersonSessionCurrent(lease)) return; if (lab) setChapterLease(beginFirstPersonSession()); else void restartChapter(); }}
        onExit={() => { if (isFirstPersonSessionCurrent(lease)) navigateHome(); }}
      />
    );
  } else if (state.screen === 'illusionMaze') {
    screen = (
      <IllusionMazeScreen
        key={`${state.journeyRun}-${state.stageIndex}`}
        levelIndex={state.stageIndex}
        settings={state.settings}
        preferredColor={state.activeSetupSource === 'quick' ? state.quickSetupResult?.provisionalColor ?? 'neutral' : state.calibrationProfile?.preferredForegroundColor ?? state.quickSetupResult?.provisionalColor ?? 'neutral'}
        onSettingsChange={(settings) => dispatch({ type: 'UPDATE_SETTINGS', settings })}
        onComplete={(summary) => dispatch({ type: 'COMPLETE_STAGE', summary, journeyRun: state.journeyRun })}
        onExit={navigateHome}
      />
    );
  } else if (state.screen === 'journeyResult') {
    screen = <JourneyResultScreen summaries={state.journeySummaries} onReplay={() => dispatch({ type: 'BEGIN_LEGACY_JOURNEY' })} onHome={navigateHome} />;
  } else if (state.screen === 'calibrationInstructions') {
    screen = <CalibrationInstructionsScreen onStart={beginCalibration} onBack={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  } else if (state.screen === 'calibration' && state.calibrationSession) {
    screen = <CalibrationScreen session={state.calibrationSession} onResponse={(response) => dispatch({ type: 'ADD_CALIBRATION_RESPONSE', response })} onExit={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  } else if (state.screen === 'calibrationResult' && state.calibrationProfile) {
    screen = <CalibrationResultScreen profile={state.calibrationProfile} onMaze={() => dispatch({ type: 'PLAY' })} onRecalibrate={() => dispatch({ type: 'NAVIGATE', screen: 'calibrationInstructions' })} onHome={navigateHome} />;
  } else if (state.screen === 'settings') {
    screen = (
      <SettingsScreen
        settings={state.settings}
        onChange={(settings) => dispatch({ type: 'UPDATE_SETTINGS', settings })}
        onQuickSetup={() => dispatch({ type: 'START_QUICK_SETUP', sessionId: String(Date.now()) })}
        onRecalibrate={() => dispatch({ type: 'NAVIGATE', screen: 'calibrationInstructions' })}
        onReset={() => void reset()}
        onBack={navigateHome}
        {...(__DEV__ ? {
          onDeveloperLab: () => dispatch({ type: 'NAVIGATE', screen: 'developerLab' }),
          onLegacyMaze: () => dispatch({ type: 'NAVIGATE', screen: 'microMaze' }),
          onLegacyJourney: () => dispatch({ type: 'BEGIN_LEGACY_JOURNEY' }),
          onFirstPersonLab: () => { setChapterLease(beginFirstPersonSession()); dispatch({ type: 'NAVIGATE', screen: 'firstPersonLab' }); },
        } : {})}
      />
    );
  } else if (state.screen === 'developerLab' && __DEV__) {
    screen = (
      <DeveloperLabScreen
        parameters={state.developerLab ?? DEFAULT_LAB_PARAMETERS}
        {...(state.calibrationSession ? { session: state.calibrationSession } : {})}
        onChange={(parameters) => dispatch({ type: 'UPDATE_LAB', parameters })}
        onEnvironmentChange={(environment) => {
          dispatch({ type: 'UPDATE_LAB', parameters: { ...(state.developerLab ?? DEFAULT_LAB_PARAMETERS), environment } });
          dispatch({ type: 'UPDATE_ENVIRONMENT', environment });
        }}
        onBack={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}
      />
    );
  } else if (state.screen === 'microMaze' && __DEV__) {
    screen = <MicroMazeScreen {...(state.calibrationProfile ? { profile: state.calibrationProfile } : {})} settings={state.settings} onComplete={(score) => dispatch({ type: 'FINISH_MAZE', score })} onExit={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  } else if (state.screen === 'stageResult' && state.latestMazeScore && __DEV__) {
    screen = <StageResultScreen score={state.latestMazeScore} bestScore={state.bestMazeScore} {...(state.calibrationProfile ? { profile: state.calibrationProfile } : {})} settings={state.settings} onRetry={() => dispatch({ type: 'NAVIGATE', screen: 'microMaze' })} onHome={navigateHome} />;
  } else {
    screen = <WelcomeScreen hasSetup={hasSetup} onPlay={() => dispatch({ type: 'PLAY', sessionId: String(Date.now()) })} onSkip={() => dispatch({ type: 'SKIP_QUICK_SETUP', completedAt: new Date().toISOString() })} onSettings={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  }

  return (
    <SafeAreaProvider>
      <View style={styles.application}>
        {screen}
        {storageMessage ? <Text accessibilityRole="alert" style={styles.notice}>{storageMessage}</Text> : null}
        {firstPersonMessage ? <Text accessibilityRole="alert" style={styles.notice}>{firstPersonMessage}</Text> : null}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  application: { flex: 1, backgroundColor: UI_COLORS.background },
  loading: { alignItems: 'center', backgroundColor: UI_COLORS.background, flex: 1, justifyContent: 'center' },
  notice: { backgroundColor: UI_COLORS.panel, color: UI_COLORS.text, fontSize: 14, padding: 12 },
});
