import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ActionButton, Body, ChoiceRow, Heading, Panel, Screen, Stat } from '../components/Layout';
import type { CalibrationProfile } from '../domain/calibration/types';
import { findNearestEligibleRail } from '../domain/maze/geometry';
import { createValidationLevel } from '../domain/maze/level';
import { INITIAL_MAZE_SCORE, scoreMazeDecision } from '../domain/maze/scoring';
import type { MazeScore, Point, RailColor, RailPath } from '../domain/maze/types';
import { playSelectionHaptic } from '../platform/haptics';
import { MazeCanvas } from '../rendering/MazeCanvas';
import { buildMazeGeometry } from '../rendering/mazeGeometry';
import { UI_COLORS } from '../theme/ui';
import type { AppSettings } from '../types/application';

export function MicroMazeScreen({
  profile,
  settings,
  onComplete,
  onExit,
}: {
  profile?: CalibrationProfile;
  settings: AppSettings;
  onComplete: (score: MazeScore) => void;
  onExit: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const canvasWidth = Math.min(width - 40, 430);
  const canvasHeight = Math.min(Math.max(height * 0.42, 300), 520);
  const geometry = useMemo(() => buildMazeGeometry(canvasWidth, canvasHeight), [canvasHeight, canvasWidth]);
  const level = useMemo(() => createValidationLevel(profile?.preference), [profile?.preference]);
  const [junctionIndex, setJunctionIndex] = useState(0);
  const [selectedRail, setSelectedRail] = useState<RailPath | undefined>();
  const [score, setScore] = useState(INITIAL_MAZE_SCORE);
  const [paused, setPaused] = useState(false);
  const inputLocked = selectedRail !== undefined || paused;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPaused(true);
    });
    return () => subscription.remove();
  }, []);

  const chooseRail = useCallback(
    (rail: RailPath) => {
      if (inputLocked || rail.junctionIndex !== junctionIndex) return;
      const correct = rail.color === level.targetSequence[junctionIndex];
      setSelectedRail(rail);
      setScore((current) => scoreMazeDecision(current, correct));
      void playSelectionHaptic(settings.haptics);
    },
    [inputLocked, junctionIndex, level.targetSequence, settings.haptics],
  );

  const chooseColor = useCallback(
    (color: RailColor) => {
      const rail = geometry.rails.find(
        (candidate) => candidate.junctionIndex === junctionIndex && candidate.color === color,
      );
      if (rail) chooseRail(rail);
    },
    [chooseRail, geometry.rails, junctionIndex],
  );

  const handleTap = useCallback(
    (point: Point) => {
      if (inputLocked) return;
      const eligible = geometry.rails.filter((rail) => rail.junctionIndex === junctionIndex);
      const rail = findNearestEligibleRail(point, eligible, 28);
      if (rail) chooseRail(rail);
    },
    [chooseRail, geometry.rails, inputLocked, junctionIndex],
  );

  const handleTravelComplete = useCallback(() => {
    if (junctionIndex === 2) {
      onComplete(score);
      return;
    }
    setJunctionIndex((current) => current + 1);
    setSelectedRail(undefined);
  }, [junctionIndex, onComplete, score]);

  const reset = () => {
    setJunctionIndex(0);
    setSelectedRail(undefined);
    setScore(INITIAL_MAZE_SCORE);
    setPaused(false);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Heading>3分岐マイクロ迷路</Heading>
        <Text style={styles.progress}>{Math.min(junctionIndex + 1, 3)} / 3</Text>
      </View>
      <Body muted>上の開始点 ● から、下のゴール ○ へ進みます。</Body>
      <View style={styles.canvasArea}>
        <MazeCanvas
          width={canvasWidth}
          height={canvasHeight}
          junctionIndex={junctionIndex}
          selectedRail={selectedRail}
          targetColor={level.targetSequence[junctionIndex] ?? 'red'}
          depthAssist={settings.depthAssist}
          reducedMotion={settings.reducedMotion}
          effectStrength={settings.effectStrength}
          paused={paused}
          onTap={handleTap}
          onTravelComplete={handleTravelComplete}
        />
        {paused ? (
          <View style={styles.pauseOverlay} accessibilityViewIsModal>
            <Panel>
              <Body>一時停止中</Body>
              <ActionButton label="再開する" onPress={() => setPaused(false)} variant="primary" />
            </Panel>
          </View>
        ) : null}
      </View>
      <Stat label="スコア" value={score.score} />
      <Body muted>レール自体をタップしてください。画面外のタップは無視されます。</Body>
      <ChoiceRow>
        <ActionButton
          label="赤のルートを選ぶ"
          onPress={() => chooseColor('red')}
          disabled={inputLocked}
          accessibilityHint="キャンバスの赤いレールを選ぶ操作と同じです"
        />
        <ActionButton
          label="青のルートを選ぶ"
          onPress={() => chooseColor('blue')}
          disabled={inputLocked}
          accessibilityHint="キャンバスの青いレールを選ぶ操作と同じです"
        />
      </ChoiceRow>
      <ChoiceRow>
        <ActionButton label={paused ? '再開' : '一時停止'} onPress={() => setPaused((value) => !value)} />
        <ActionButton label="やり直す" onPress={reset} />
        <ActionButton label="ホームへ戻る" onPress={onExit} />
      </ChoiceRow>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  progress: { color: UI_COLORS.text, fontSize: 18, fontWeight: '800' },
  canvasArea: { alignItems: 'center', flex: 1, justifyContent: 'center', position: 'relative' },
  pauseOverlay: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(9,9,12,0.88)',
    justifyContent: 'center',
    padding: 30,
  },
});
