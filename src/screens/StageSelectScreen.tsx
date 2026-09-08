import { StyleSheet, Text, View } from 'react-native';
import { ActionButton, Body, Panel, Screen } from '../components/Layout';
import { StageArtwork } from '../components/StageArtwork';
import { STAGES, type StageCardState, type StageId } from '../app/stages';
import { UI_COLORS } from '../theme/ui';
export function StageSelectScreen({ cards, lastResume, onSelect, onSettings }: {
  cards: readonly StageCardState[]; lastResume?: StageId; onSelect: (id: StageId, replay: boolean) => void; onSettings: () => void;
}) {
  const last = STAGES.find(stage => stage.id === lastResume);
  return <Screen>
    <Text style={styles.brand}>CHROMA RIFT</Text>
    <Text style={styles.title} accessibilityRole="header">ステージを選ぶ</Text>
    <Body muted>それぞれの物語を、好きなところから。</Body>
    {last ? <Panel><Body>前回の続き：{last.title}</Body><ActionButton label="続きから" testID="resume-last-stage" variant="primary" onPress={() => onSelect(last.id, false)} /></Panel> : null}
    {STAGES.map(stage => {
      const card = cards.find(item => item.id === stage.id); if (!card) return null;
      const status = card.current === 'new' ? '未開始' : card.current === 'exploring' ? '探索中' : card.current === 'cleared' ? '脱出済み' : '保存を保護中';
      return <View key={stage.id} style={styles.group}>
        {!stage.number ? <Text style={styles.earlier} accessibilityRole="header">はじまりの章</Text> : null}
        <Panel><StageArtwork id={stage.id} />
          <Text style={styles.cardTitle} accessibilityRole="header">{stage.number ? stage.number + '　' : ''}{stage.title}</Text>
          <Body>{stage.teaser}</Body><Body>今回：{status}</Body>
          {card.history.everCleared ? <Body muted>これまでに脱出した記録があります</Body> : null}
          {card.history.discoveries.length ? <Body muted>見つけたメモ：{card.history.discoveries.length}</Body> : null}
          <ActionButton testID={'select-' + stage.id} label={card.current === 'blocked' ? '保存を保持して試す' : card.current === 'cleared' ? 'もう一度遊ぶ' : card.current === 'new' ? '始める' : '続ける'}
            onPress={() => onSelect(stage.id, card.current === 'cleared')} />
          {card.current === 'cleared' ? <ActionButton testID={'review-' + stage.id} label="クリア記録を見る" onPress={() => onSelect(stage.id, false)} /> : null}
        </Panel>
      </View>;
    })}
    <Body muted>怖さ・音・見え方・操作は、入る前と一時停止で変更できます。</Body>
    <ActionButton label="設定" onPress={onSettings} />
  </Screen>;
}
const styles = StyleSheet.create({ brand: { color: UI_COLORS.textMuted, fontSize: 15, fontWeight: '700', letterSpacing: 3 },
  title: { color: UI_COLORS.text, fontSize: 28, fontWeight: '800' }, cardTitle: { color: UI_COLORS.text, fontSize: 22, fontWeight: '700', flexShrink: 1 },
  earlier: { color: UI_COLORS.textMuted, fontSize: 18, marginTop: 12 }, group: { gap: 10 } });
