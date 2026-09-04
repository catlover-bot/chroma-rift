import { useEffect, useReducer } from 'react';
import { AccessibilityInfo, ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { appReducer, initialAppState, persistedFromState } from './src/app/state';
import { CalibrationInstructionsScreen } from './src/screens/CalibrationInstructionsScreen';
import { CalibrationResultScreen } from './src/screens/CalibrationResultScreen';
import { CalibrationScreen } from './src/screens/CalibrationScreen';
import { DeveloperLabScreen } from './src/screens/DeveloperLabScreen';
import { MicroMazeScreen } from './src/screens/MicroMazeScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { StageResultScreen } from './src/screens/StageResultScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import {
  createDefaultApplication,
  loadApplication,
  resetApplicationStorage,
  saveApplication,
} from './src/storage/applicationStorage';
import { UI_COLORS } from './src/theme/ui';
import { DEFAULT_LAB_PARAMETERS } from './src/types/application';

export default function App() {
  const [state, dispatch] = useReducer(appReducer, initialAppState);

  useEffect(() => {
    let active = true;
    void (async () => {
      let systemReducedMotion = false;
      try {
        systemReducedMotion = await AccessibilityInfo.isReduceMotionEnabled();
      } catch {
        // Continue with a conservative, user-overridable in-app default.
      }
      const persisted = await loadApplication(systemReducedMotion);
      if (active) dispatch({ type: 'HYDRATE', persisted, systemReducedMotion });
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (state.hydrated) void saveApplication(persistedFromState(state));
  }, [state]);

  const beginCalibration = () =>
    dispatch({ type: 'START_CALIBRATION', seed: Date.now() >>> 0, startedAt: new Date().toISOString() });

  const reset = async () => {
    await resetApplicationStorage();
    let systemReducedMotion = false;
    try {
      systemReducedMotion = await AccessibilityInfo.isReduceMotionEnabled();
    } catch {
      // Reset remains available even when the platform preference cannot be read.
    }
    dispatch({ type: 'RESET', defaults: createDefaultApplication(systemReducedMotion) });
  };

  let screen = null;
  if (!state.hydrated) {
    screen = (
      <View style={styles.loading} accessibilityLabel="読み込み中">
        <ActivityIndicator color={UI_COLORS.text} />
      </View>
    );
  } else if (state.screen === 'welcome') {
    screen = (
      <WelcomeScreen
        onCalibrate={() => dispatch({ type: 'NAVIGATE', screen: 'calibrationInstructions' })}
        onTryWithoutCalibration={() => dispatch({ type: 'NAVIGATE', screen: 'microMaze' })}
        onSettings={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })}
        {...(__DEV__ ? { onDeveloperLab: () => dispatch({ type: 'NAVIGATE', screen: 'developerLab' }) } : {})}
      />
    );
  } else if (state.screen === 'calibrationInstructions') {
    screen = <CalibrationInstructionsScreen onStart={beginCalibration} onBack={() => dispatch({ type: 'NAVIGATE', screen: 'welcome' })} />;
  } else if (state.screen === 'calibration' && state.calibrationSession) {
    screen = (
      <CalibrationScreen
        session={state.calibrationSession}
        onResponse={(response) => dispatch({ type: 'ADD_CALIBRATION_RESPONSE', response })}
        onExit={() => dispatch({ type: 'NAVIGATE', screen: 'welcome' })}
      />
    );
  } else if (state.screen === 'calibrationResult' && state.calibrationProfile) {
    screen = (
      <CalibrationResultScreen
        profile={state.calibrationProfile}
        onMaze={() => dispatch({ type: 'NAVIGATE', screen: 'microMaze' })}
        onRecalibrate={() => dispatch({ type: 'NAVIGATE', screen: 'calibrationInstructions' })}
        onHome={() => dispatch({ type: 'NAVIGATE', screen: 'welcome' })}
      />
    );
  } else if (state.screen === 'microMaze') {
    screen = (
      <MicroMazeScreen
        {...(state.calibrationProfile ? { profile: state.calibrationProfile } : {})}
        settings={state.settings}
        onComplete={(score) => dispatch({ type: 'FINISH_MAZE', score })}
        onExit={() => dispatch({ type: 'NAVIGATE', screen: 'welcome' })}
      />
    );
  } else if (state.screen === 'stageResult' && state.latestMazeScore) {
    screen = (
      <StageResultScreen
        score={state.latestMazeScore}
        bestScore={state.bestMazeScore}
        {...(state.calibrationProfile ? { profile: state.calibrationProfile } : {})}
        settings={state.settings}
        onRetry={() => dispatch({ type: 'NAVIGATE', screen: 'microMaze' })}
        onHome={() => dispatch({ type: 'NAVIGATE', screen: 'welcome' })}
      />
    );
  } else if (state.screen === 'settings') {
    screen = (
      <SettingsScreen
        settings={state.settings}
        onChange={(settings) => dispatch({ type: 'UPDATE_SETTINGS', settings })}
        onRecalibrate={() => dispatch({ type: 'NAVIGATE', screen: 'calibrationInstructions' })}
        onReset={() => void reset()}
        onBack={() => dispatch({ type: 'NAVIGATE', screen: 'welcome' })}
      />
    );
  } else if (state.screen === 'developerLab' && __DEV__) {
    screen = (
      <DeveloperLabScreen
        parameters={state.developerLab ?? DEFAULT_LAB_PARAMETERS}
        {...(state.calibrationSession ? { session: state.calibrationSession } : {})}
        onChange={(parameters) => dispatch({ type: 'UPDATE_LAB', parameters })}
        onEnvironmentChange={(environment) => {
          dispatch({
            type: 'UPDATE_LAB',
            parameters: { ...(state.developerLab ?? DEFAULT_LAB_PARAMETERS), environment },
          });
          dispatch({ type: 'UPDATE_ENVIRONMENT', environment });
        }}
        onBack={() => dispatch({ type: 'NAVIGATE', screen: 'welcome' })}
      />
    );
  } else {
    screen = <WelcomeScreen onCalibrate={() => dispatch({ type: 'NAVIGATE', screen: 'calibrationInstructions' })} onTryWithoutCalibration={() => dispatch({ type: 'NAVIGATE', screen: 'microMaze' })} onSettings={() => dispatch({ type: 'NAVIGATE', screen: 'settings' })} />;
  }

  return <SafeAreaProvider>{screen}</SafeAreaProvider>;
}

const styles = StyleSheet.create({
  loading: { alignItems: 'center', backgroundColor: UI_COLORS.background, flex: 1, justifyContent: 'center' },
});
