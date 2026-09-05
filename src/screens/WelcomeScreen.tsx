import { Text, StyleSheet } from 'react-native';

import { ActionButton, Body, Panel, Screen } from '../components/Layout';
import { UI_COLORS } from '../theme/ui';

export function WelcomeScreen({
  onPlay,
  onSkip,
  onSettings,
  hasSetup,
}: {
  onPlay: () => void;
  onSkip: () => void;
  onSettings: () => void;
  hasSetup: boolean;
}) {
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>CHROMA RIFT</Text>
      <Text style={styles.subtitle}>浮かぶ回廊に、道を見つけよう。</Text>
      <Body>床をたどり、光のかけらを集める、小さなふたつの迷宮。</Body>
      <Panel>
        <Body muted>色の奥行きは人によって違います。感じにくくても遊べます。</Body>
        <Body muted>違和感があれば、いつでも一時停止できます。</Body>
      </Panel>
      <ActionButton label="遊ぶ" onPress={onPlay} variant="primary" />
      {!hasSetup ? <ActionButton label="あとで調整して遊ぶ" onPress={onSkip} /> : null}
      <ActionButton label="設定" onPress={onSettings} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: UI_COLORS.text, fontSize: 42, fontWeight: '900', letterSpacing: 2, marginTop: 28 },
  subtitle: { color: UI_COLORS.text, fontSize: 22, fontWeight: '700', lineHeight: 31 },
});
