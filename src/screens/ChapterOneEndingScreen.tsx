import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Screen } from '../components/Layout';
import { CHAPTER_ONE } from '../domain/campaign/definition';
import { CHAPTER_ONE_COPY } from '../domain/campaign/story';
import { MATERIAL_CREDITS } from '../content/illusionNotes';
import { UI_COLORS } from '../theme/ui';

export function ChapterOneEndingScreen({ onHome, onAreas }: { onHome: () => void; onAreas: () => void }) {
  return <Screen>
    <Text style={styles.brand}>CHROMA RIFT</Text>
    <View style={styles.rule}/>
    <Text style={styles.attendance}>{CHAPTER_ONE_COPY.attendance00}</Text>
    <Text style={styles.answer}>在館反応 00。閉館処理は、今度こそ終わった。</Text>
    <Text style={styles.complete} accessibilityRole="header">第一章「{CHAPTER_ONE.title}」 完</Text>
    <Text style={styles.note}>退館記録：最後の職員は屋外へ出た。巡回体は収容区画で隔離・停止済み。</Text>
    <View style={styles.rule}/>
    <Text style={styles.credit}>素材クレジット</Text>
    <Text style={styles.credit}>{MATERIAL_CREDITS[0].title}：Wael Tsar / cmglee（CC BY 4.0）</Text>
    <ActionButton label="エリアを振り返る" onPress={onAreas}/>
    <ActionButton label="ホームへ戻る" variant="primary" onPress={onHome}/>
  </Screen>;
}

const styles = StyleSheet.create({
  brand: { color: UI_COLORS.textMuted, fontSize: 15, letterSpacing: 3, fontWeight: '700' },
  rule: { height: 1, backgroundColor: '#50645D', marginVertical: 16 },
  attendance: { color: '#A9C6B1', fontSize: 16, letterSpacing: 2 },
  answer: { color: UI_COLORS.text, fontSize: 21, lineHeight: 31, marginTop: 20 },
  complete: { color: UI_COLORS.text, fontSize: 27, fontWeight: '700', marginVertical: 18 },
  note: { color: UI_COLORS.textMuted, fontSize: 16, lineHeight: 25 },
  credit: { color: UI_COLORS.textMuted, fontSize: 14, lineHeight: 22 },
});
