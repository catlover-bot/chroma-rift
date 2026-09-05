import { Canvas, Group, Line, Rect, vec } from '@shopify/react-native-skia';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ActionButton, Body, Screen } from '../components/Layout';
import type { QuickSetupAnswer, QuickSetupSession } from '../domain/calibration/quickSetup';
import { STIMULUS_COLORS } from '../theme/stimulus';
import { UI_COLORS } from '../theme/ui';

const TITLES = ['扉のしるし', '橋の模様', '光のかけら'];

/** Static, separated, identical red/blue geometry: no intersection, shading or motion. */
function QuickStimulus({ index, width, height }: { index: number; width: number; height: number }) {
  const radius = Math.min(width * 0.11, height * 0.2);
  const y = height / 2;
  return (
    <View style={{ width, height, alignSelf: 'center' }} accessibilityRole="image" accessibilityLabel={`${TITLES[index]}。同じ大きさの赤と青の模様`}>
      <Canvas style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={width} height={height} color={UI_COLORS.background} />
        {[0, 1].map((side) => {
          const x = width * (side === 0 ? 0.29 : 0.71);
          const color = (side + index) % 2 === 0 ? STIMULUS_COLORS.red : STIMULUS_COLORS.blue;
          return (
            <Group key={side}>
              {index === 0 ? <Rect x={x - radius} y={y - radius} width={radius * 2} height={radius * 2} color={color} style="stroke" strokeWidth={6} /> : null}
              {index === 1 ? [-1, 0, 1].map((row) => (
                <Line key={row} p1={vec(x - radius, y + row * radius * 0.65)} p2={vec(x + radius, y + row * radius * 0.65)} color={color} strokeWidth={6} />
              )) : null}
              {index === 2 ? [[0, -1, 1, 0], [1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1]].map(([x1 = 0, y1 = 0, x2 = 0, y2 = 0], segment) => (
                <Line key={segment} p1={vec(x + x1 * radius, y + y1 * radius)} p2={vec(x + x2 * radius, y + y2 * radius)} color={color} strokeWidth={6} />
              )) : null}
            </Group>
          );
        })}
      </Canvas>
    </View>
  );
}

export function QuickSetupScreen({ session, onResponse, onSkip, onExit }: {
  session: QuickSetupSession;
  onResponse: (index: number, answer: QuickSetupAnswer) => void;
  onSkip: () => void;
  onExit: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const index = session.responses.length;
  const submitted = useRef(false);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    // A brief neutral input gate also catches a second physical tap after rerender.
    const timer = setTimeout(() => { submitted.current = false; setLocked(false); }, index === 0 ? 0 : 300);
    return () => clearTimeout(timer);
  }, [session.id, index]);
  const submit = (answer: QuickSetupAnswer) => {
    if (submitted.current || index >= 3) return;
    submitted.current = true;
    setLocked(true);
    onResponse(index, answer);
  };
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>見え方を、3つだけ</Text>
      <Text style={styles.progress} accessibilityLiveRegion="polite">{Math.min(index + 1, 3)} / 3</Text>
      <QuickStimulus index={index} width={Math.max(180, Math.min(width - 40, 430))} height={Math.min(220, Math.max(130, height * 0.25))} />
      <Body>どちらが手前に見えますか？</Body>
      <View style={styles.answers}>
        <ActionButton label="赤が手前" onPress={() => submit('redFront')} disabled={locked} testID="quick-answer-red" />
        <ActionButton label="青が手前" onPress={() => submit('blueFront')} disabled={locked} testID="quick-answer-blue" />
        <ActionButton label="同じ・分かりにくい" onPress={() => submit('unclear')} disabled={locked} testID="quick-answer-unclear" />
      </View>
      <ActionButton label="あとで調整して遊ぶ" onPress={onSkip} />
      <ActionButton label="ホームへ戻る" onPress={onExit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: UI_COLORS.text, fontSize: 25, fontWeight: '700' },
  progress: { color: UI_COLORS.textMuted, fontSize: 17, minHeight: 26 },
  answers: { gap: 10 },
});
