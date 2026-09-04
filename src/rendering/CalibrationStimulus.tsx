import { Canvas, Circle, Group, Line, Rect, vec } from '@shopify/react-native-skia';
import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { CalibrationTrial } from '../domain/calibration/types';
import { CALIBRATION_STIMULUS, STIMULUS_COLORS, type StimulusParameters } from '../theme/stimulus';

type Props = {
  trial: CalibrationTrial;
  width: number;
  height: number;
  parameters?: StimulusParameters;
};

function CalibrationStimulusComponent({
  trial,
  width,
  height,
  parameters = CALIBRATION_STIMULUS,
}: Props) {
  const geometry = useMemo(() => {
    const center = { x: width / 2, y: height / 2 };
    const size = Math.min(width, height);
    const primary = trial.colorRoleAssignment === 'primaryRed' ? parameters.red : parameters.blue;
    const secondary = trial.colorRoleAssignment === 'primaryRed' ? parameters.blue : parameters.red;
    return { center, size, primary, secondary };
  }, [height, parameters.blue, parameters.red, trial.colorRoleAssignment, width]);

  const transform = useMemo(
    () => [
      { rotate: (trial.rotation * Math.PI) / 180 },
      ...(trial.mirrored ? [{ scaleX: -1 }] : []),
    ],
    [trial.mirrored, trial.rotation],
  );

  const background =
    trial.background === 'dark' ? STIMULUS_COLORS.darkBackground : STIMULUS_COLORS.lightBackground;

  return (
    <View
      style={[styles.frame, { width, height }]}
      accessibilityRole="image"
      accessibilityLabel="色奥行き調整パターン"
    >
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height} color={background} />
        <Group origin={vec(geometry.center.x, geometry.center.y)} transform={transform}>
          {trial.patternFamily === 'rings' ? (
            <>
              <Circle
                cx={geometry.center.x}
                cy={geometry.center.y}
                r={geometry.size * 0.15}
                color={geometry.primary}
                style="stroke"
                strokeWidth={parameters.strokeWidth}
              />
              <Circle
                cx={geometry.center.x}
                cy={geometry.center.y}
                r={geometry.size * 0.28}
                color={geometry.primary}
                style="stroke"
                strokeWidth={parameters.strokeWidth}
              />
              <Circle
                cx={geometry.center.x}
                cy={geometry.center.y}
                r={geometry.size * 0.39}
                color={geometry.secondary}
                style="stroke"
                strokeWidth={parameters.strokeWidth}
              />
              <Circle
                cx={geometry.center.x}
                cy={geometry.center.y}
                r={geometry.size * 0.48}
                color={geometry.secondary}
                style="stroke"
                strokeWidth={parameters.strokeWidth}
              />
            </>
          ) : null}

          {trial.patternFamily === 'crossingRails' ? (
            <>
              {[-1.5, -0.5, 0.5, 1.5].map((offset) => (
                <Line
                  key={`horizontal-${offset}`}
                  p1={vec(width * 0.12, geometry.center.y + offset * parameters.spacing)}
                  p2={vec(width * 0.88, geometry.center.y + offset * parameters.spacing)}
                  color={geometry.primary}
                  strokeWidth={parameters.strokeWidth}
                />
              ))}
              {[-1.5, -0.5, 0.5, 1.5].map((offset) => (
                <Line
                  key={`vertical-${offset}`}
                  p1={vec(geometry.center.x + offset * parameters.spacing, height * 0.12)}
                  p2={vec(geometry.center.x + offset * parameters.spacing, height * 0.88)}
                  color={geometry.secondary}
                  strokeWidth={parameters.strokeWidth}
                />
              ))}
            </>
          ) : null}

          {trial.patternFamily === 'dotFields' ? (
            <>
              {Array.from({ length: 6 }, (_, row) =>
                Array.from({ length: 7 }, (_, column) => {
                  const offset = parameters.spacing * 0.36;
                  const x = geometry.center.x + (column - 3) * parameters.spacing;
                  const y = geometry.center.y + (row - 2.5) * parameters.spacing;
                  return (
                    <Group key={`dots-${row}-${column}`}>
                      <Circle cx={x - offset} cy={y} r={parameters.strokeWidth * 0.62} color={geometry.primary} />
                      <Circle cx={x + offset} cy={y} r={parameters.strokeWidth * 0.62} color={geometry.secondary} />
                    </Group>
                  );
                }),
              )}
            </>
          ) : null}
        </Group>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: 18,
    overflow: 'hidden',
  },
});

export const CalibrationStimulus = memo(CalibrationStimulusComponent);
