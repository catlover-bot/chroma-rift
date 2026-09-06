import { Text, StyleSheet, View } from 'react-native';

import { ActionButton, Body, Panel, Screen, SectionTitle } from '../components/Layout';
import { UI_COLORS } from '../theme/ui';

export function WelcomeScreen({ onPlay, onSkip, onSettings, hasSetup, onLegacyContinue, gallerySaved = false, gallerySolved = 0, galleryCleared = false, galleryBlocked = false, legacySaved = false }: {
  onPlay: () => void; onSkip: () => void; onSettings: () => void; hasSetup: boolean;
  onLegacyContinue?: () => void; gallerySaved?: boolean; gallerySolved?: number; galleryCleared?: boolean; galleryBlocked?: boolean; legacySaved?: boolean;
}) {
  return (
    <Screen>
      <Text style={styles.brand}>CHROMA RIFT</Text>
      <Text accessibilityRole="header" style={styles.title}>不確かな展示室</Text>
      <Text style={styles.subtitle}>歩く。比べる。見つける。</Text>
      <View accessibilityLabel="四つの展示：紋章、影の見本、描かれていない形、重なる鍵" style={styles.exhibits}>
        {['○', '▤', '◔', '⋈'].map((mark, index) => <View key={index} style={styles.mark}><Text style={styles.markText}>{mark}</Text></View>)}
      </View>
      <Body>色、明暗、ないはずの輪郭。四つの仕掛けをめぐり、覚えている入口へ帰ろう。</Body>
      {gallerySaved ? <Body muted>{galleryCleared ? '展示室を探索済み。発見を振り返れます。' : `展示室の封印 ${gallerySolved} / 4`}</Body> : null}
      <ActionButton label={galleryBlocked ? '保存を保持して展示室を試す' : gallerySaved ? '展示室の続きから' : '新しい展示室を始める'} onPress={onPlay} variant="primary" />
      {!hasSetup ? <ActionButton label="あとで調整して遊ぶ" onPress={onSkip} /> : null}
      {onLegacyContinue ? <Panel>
        <SectionTitle>帰り道のない入口</SectionTitle>
        <Body muted>{legacySaved ? '前の章の進行は、そのまま残っています。' : 'はじまりの章を、ふたつの仕掛けでたどります。'}</Body>
        <ActionButton label={legacySaved ? '旧章の続きから' : '旧章を遊ぶ'} onPress={onLegacyContinue} />
      </Panel> : null}
      <Body muted>見え方は人それぞれ。音や補助表示は、いつでも設定できます。</Body>
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
