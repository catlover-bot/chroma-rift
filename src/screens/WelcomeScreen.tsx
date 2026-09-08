import { Text, StyleSheet, View } from 'react-native';

import { ActionButton, Body, Panel, Screen, SectionTitle } from '../components/Layout';
import { UI_COLORS } from '../theme/ui';

export function WelcomeScreen({ onPlay, onSkip, onSettings, hasSetup, onLegacyContinue, onVaultPlay, vaultSaved = false, vaultCleared = false, vaultBlocked = false, gallerySaved = false, galleryPowerCount = 0, galleryCleared = false, galleryBlocked = false, legacySaved = false }: {
  onPlay: () => void; onSkip: () => void; onSettings: () => void; hasSetup: boolean;
  onVaultPlay?: () => void; vaultSaved?: boolean; vaultCleared?: boolean; vaultBlocked?: boolean;
  onLegacyContinue?: () => void; gallerySaved?: boolean; galleryPowerCount?: number; galleryCleared?: boolean; galleryBlocked?: boolean; legacySaved?: boolean;
}) {
  return (
    <Screen>
      <Text style={styles.brand}>CHROMA RIFT</Text>
      <Text accessibilityRole="header" style={styles.title}>閉館後の展示室</Text>
      <Text style={styles.subtitle}>灯りをつける。電源を探す。ここを出る。</Text>
      <View accessibilityLabel="非常口、影の見本、描かれていない形" style={styles.exhibits}>
        {['↗', '▤', '◔'].map((mark, index) => <View key={index} style={styles.mark}><Text style={styles.markText}>{mark}</Text></View>)}
      </View>
      <Body>誰もいないはずの展示室。二つの予備電源を見つけ、非常口へ向かおう。</Body>
      {gallerySaved ? <Body muted>{galleryCleared ? 'クリア記録を保持しています。' : `予備電源 ${galleryPowerCount} / 2`}</Body> : null}
      <ActionButton label={galleryBlocked ? '保存を保持して展示室を試す' : gallerySaved ? '展示室の続きから' : '新しい展示室を始める'} onPress={onPlay} variant="primary" />
      {!hasSetup ? <ActionButton label="あとで調整して遊ぶ" onPress={onSkip} /> : null}
      {onVaultPlay ? <Panel>
        <SectionTitle>次の章：測れない収蔵庫</SectionTitle>
        <Body muted>{vaultCleared ? '収蔵庫の脱出記録を保持しています。' : '長さを合わせ、針を鉛直へ。棚の間を抜けて搬出口へ向かおう。'}</Body>
        <ActionButton label={vaultBlocked ? '保存を保持して収蔵庫を試す' : vaultSaved ? '収蔵庫の続きから' : '測れない収蔵庫を始める'} onPress={onVaultPlay} />
        <Body muted>展示室をクリアする前でも、この章だけを試せます。</Body>
      </Panel> : null}
      {onLegacyContinue ? <Panel>
        <SectionTitle>帰り道のない入口</SectionTitle>
        <Body muted>{legacySaved ? '前の章の進行は、そのまま残っています。' : 'はじまりの章を、ふたつの仕掛けでたどります。'}</Body>
        <ActionButton label={legacySaved ? '旧章の続きから' : '旧章を遊ぶ'} onPress={onLegacyContinue} />
      </Panel> : null}
      <Body muted>見え方は人それぞれ。怖さ、音、補助表示は、いつでも設定できます。</Body>
      <ActionButton label="設定" onPress={onSettings} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  brand: { color: UI_COLORS.textMuted, fontSize: 14, fontWeight: '700', letterSpacing: 3, marginTop: 16 },
  title: { color: UI_COLORS.text, fontSize: 34, fontWeight: '900', letterSpacing: 1 },
  subtitle: { color: UI_COLORS.text, fontSize: 20, fontWeight: '600', lineHeight: 29 },
  exhibits: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 },
  mark: { backgroundColor: UI_COLORS.panel, borderColor: UI_COLORS.border, borderWidth: 1, borderRadius: 14, width: 54, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  markText: { color: UI_COLORS.text, fontSize: 30 },
});
