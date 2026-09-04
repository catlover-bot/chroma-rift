import { Text, StyleSheet } from 'react-native';

import { ActionButton, Body, Panel, Screen } from '../components/Layout';
import { UI_COLORS } from '../theme/ui';

export function WelcomeScreen({
  onCalibrate,
  onTryWithoutCalibration,
  onSettings,
  onDeveloperLab,
}: {
  onCalibrate: () => void;
  onTryWithoutCalibration: () => void;
  onSettings: () => void;
  onDeveloperLab?: () => void;
}) {
  return (
    <Screen>
      <Text accessibilityRole="header" style={styles.title}>CHROMA RIFT</Text>
      <Text style={styles.subtitle}>赤と青、どちらが手前に見える？</Text>
      <Body>色の見え方を使って、光の迷路を進むゲームです。</Body>
      <Panel>
        <Body muted>見え方には個人差があります。これは視力検査や医療診断ではありません。</Body>
        <Body muted>目に疲れや違和感を感じた場合は、すぐに中断してください。</Body>
      </Panel>
      <ActionButton label="見え方を調整する" onPress={onCalibrate} variant="primary" />
      <ActionButton label="調整なしで試す" onPress={onTryWithoutCalibration} />
      <ActionButton label="設定" onPress={onSettings} />
      {onDeveloperLab ? <ActionButton label="開発者ラボ" onPress={onDeveloperLab} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: UI_COLORS.text, fontSize: 42, fontWeight: '900', letterSpacing: 2, marginTop: 28 },
  subtitle: { color: UI_COLORS.text, fontSize: 22, fontWeight: '700', lineHeight: 31 },
});
