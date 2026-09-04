import { Canvas, Circle, Group, Line, Rect, vec } from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  cancelAnimation,
  Easing,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import type { Point, RailPath } from '../domain/maze/types';
import { STIMULUS_COLORS } from '../theme/stimulus';
import { UI_COLORS } from '../theme/ui';
import { buildMazeGeometry, pointAlongRail } from './mazeGeometry';

type Props = {
  width: number;
  height: number;
  junctionIndex: number;
  selectedRail: RailPath | undefined;
  targetColor: 'red' | 'blue';
  depthAssist: boolean;
  reducedMotion: boolean;
  effectStrength: 'low' | 'medium' | 'high';
  paused: boolean;
  onTap: (point: Point) => void;
  onTravelComplete: () => void;
};

export function MazeCanvas({
  width,
  height,
  junctionIndex,
  selectedRail,
  targetColor,
  depthAssist,
  reducedMotion,
  effectStrength,
  paused,
  onTap,
  onTravelComplete,
}: Props) {
  const geometry = useMemo(() => buildMazeGeometry(width, height), [height, width]);
  const progress = useSharedValue(0);
  const selectedPoints = selectedRail?.points;
  const entry = geometry.entries[junctionIndex] ?? geometry.goal;

  useEffect(() => {
    if (paused) {
      cancelAnimation(progress);
      return;
    }
    if (!selectedRail) {
      progress.value = 0;
      return;
    }
    const duration = reducedMotion ? 120 : 900;
    progress.value = withTiming(
      1,
      { duration, easing: Easing.inOut(Easing.cubic) },
      (finished) => {
        if (finished) scheduleOnRN(onTravelComplete);
      },
    );
    return () => cancelAnimation(progress);
  }, [onTravelComplete, paused, progress, reducedMotion, selectedRail]);

  const orbX = useDerivedValue(() =>
    selectedPoints ? pointAlongRail(selectedPoints, progress.value).x : entry.x,
  );
  const orbY = useDerivedValue(() =>
    selectedPoints ? pointAlongRail(selectedPoints, progress.value).y : entry.y,
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        .onEnd((event) => onTap({ x: event.x, y: event.y })),
    [onTap],
  );
  const glowWidth = effectStrength === 'high' ? 16 : effectStrength === 'medium' ? 12 : 0;

  return (
    <GestureDetector gesture={tapGesture}>
      <View
        style={[styles.frame, { width, height }]}
        accessibilityRole="image"
        accessibilityLabel={`3分岐の迷路。現在 ${Math.min(junctionIndex + 1, 3)} 番目の分岐`}
      >
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={width} height={height} color={UI_COLORS.background} />
          {geometry.rails.map((rail) => (
            <Group key={rail.id}>
              {glowWidth > 0
                ? rail.points.slice(0, -1).map((point, index) => {
                    const next = rail.points[index + 1];
                    return next ? (
                      <Line
                        key={`${rail.id}-glow-${index}`}
                        p1={vec(point.x, point.y)}
                        p2={vec(next.x, next.y)}
                        color={rail.color === 'red' ? '#4A151D' : '#0D2852'}
                        strokeWidth={glowWidth}
                      />
                    ) : null;
                  })
                : null}
              {rail.points.slice(0, -1).map((point, index) => {
                const next = rail.points[index + 1];
                return next ? (
                  <Line
                    key={`${rail.id}-${index}`}
                    p1={vec(point.x, point.y)}
                    p2={vec(next.x, next.y)}
                    color={rail.color === 'red' ? STIMULUS_COLORS.red : STIMULUS_COLORS.blue}
                    strokeWidth={
                      depthAssist && rail.junctionIndex === junctionIndex && rail.color === targetColor ? 10 : 7
                    }
                    strokeCap="round"
                  />
                ) : null;
              })}
            </Group>
          ))}
          {depthAssist && junctionIndex < 3 ? (
            <Circle
              cx={
                (geometry.rails.find(
                  (rail) => rail.junctionIndex === junctionIndex && rail.color === targetColor,
                )?.points[1]?.x ?? width / 2) + (targetColor === 'red' ? 16 : -16)
              }
              cy={
                geometry.rails.find(
                  (rail) => rail.junctionIndex === junctionIndex && rail.color === targetColor,
                )?.points[1]?.y ?? 0
              }
              r={6}
              color={UI_COLORS.text}
            />
          ) : null}
          <Circle cx={geometry.entries[0].x} cy={geometry.entries[0].y - 22} r={7} color={UI_COLORS.textMuted} />
          <Circle cx={geometry.goal.x} cy={geometry.goal.y} r={12} color={UI_COLORS.success} style="stroke" strokeWidth={4} />
          <Circle cx={orbX} cy={orbY} r={9} color="#FFFFFF" />
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderColor: UI_COLORS.border,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
