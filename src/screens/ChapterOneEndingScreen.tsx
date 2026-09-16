import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { ActionButton, Screen } from '../components/Layout';
import { CHAPTER_ONE } from '../domain/campaign/definition';
import { CHAPTER_ONE_COPY } from '../domain/campaign/story';
import { MATERIAL_CREDITS } from '../content/illusionNotes';
import { UI_COLORS } from '../theme/ui';

export function ChapterOneEndingScreen({ onHome, onAreas, onDiscoveries, onShown, showProcedure = false }: {
  onHome: () => void; onAreas: () => void; onDiscoveries: () => void; onShown?: () => void; showProcedure?: boolean }) {
  const onShownRef = useRef(onShown);
  const [credits, setCredits] = useState(false);
  const skipArmed = useRef(false);
  const [active, setActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const remaining = useRef(12000);
  useEffect(() => { const sub = AppState.addEventListener('change', state => {
    skipArmed.current = false; setActive(state === 'active');
  }); return () => sub.remove(); }, []);
  useEffect(() => {
    if (!active || credits) return;
    const started = Date.now();
    const timer = setTimeout(() => setCredits(true), remaining.current);
    return () => { clearTimeout(timer); remaining.current = Math.max(0, remaining.current - (Date.now() - started)); };
  }, [active, credits]);
  const [procedureAtMount] = useState(showProcedure);
  useEffect(() => { onShownRef.current = onShown; }, [onShown]);
  useEffect(() => { if (credits) onShownRef.current?.(); }, [credits]);
  if (!credits) return <Screen>
    <View style={styles.afterglow}>
      <Text style={styles.attendance}>{CHAPTER_ONE_COPY.attendance00}</Text>
      <View style={styles.horizon}/>
      <Text style={styles.breath}>外の空気が流れている。</Text>
      <Text style={styles.note}>閉館した建物は、もう追ってこない。</Text>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="クレジットを表示"
      accessibilityHint="余韻を省略して、第一章の完了とクレジットを表示します。"
      onPressIn={() => { skipArmed.current = active; }}
      onPress={() => { if (skipArmed.current && active) { skipArmed.current = false; setCredits(true); } }}
      onAccessibilityTap={() => { if (active) setCredits(true); }}
      style={styles.skip}><Text style={styles.credit}>クレジットを表示</Text></Pressable>
  </Screen>;
  return <Screen>
    <Text style={styles.brand}>CHROMA RIFT</Text>
    <View style={styles.rule}/>
    {procedureAtMount ? <View><Text style={styles.credit}>点検手順</Text>
      <Text style={styles.note}>{CHAPTER_ONE_COPY.containmentInstruction}</Text></View> : null}
    <Text style={styles.attendance}>{CHAPTER_ONE_COPY.attendance01} → {CHAPTER_ONE_COPY.attendance00}</Text>
    <Text style={styles.answer}>{CHAPTER_ONE_COPY.attendanceIdentified}</Text>
    <Text style={styles.complete} accessibilityRole="header">第一章「{CHAPTER_ONE.title}」 完</Text>
    <Text style={styles.note}>{CHAPTER_ONE_COPY.recordComplete}。最後の職員は屋外へ出た。巡回体は収容区画で隔離・停止済み。</Text>
    <View style={styles.rule}/>
    <Text style={styles.credit}>素材クレジット</Text>
    <Text style={styles.credit}>{MATERIAL_CREDITS[0].title}：Wael Tsar / cmglee（CC BY 4.0）</Text>
    <ActionButton label="エリアを振り返る" onPress={onAreas}/>
    <ActionButton label="発見の記録" onPress={onDiscoveries}/>
    <ActionButton label="ホームへ戻る" variant="primary" onPress={onHome}/>
  </Screen>;
}

const styles = StyleSheet.create({
  afterglow: { minHeight: 350, flex: 1, justifyContent: 'center', paddingVertical: 48 },
  horizon: { height: 2, backgroundColor: '#bdc9bb', marginVertical: 34 },
  breath: { color: '#e0e7dc', fontSize: 26, lineHeight: 38, marginBottom: 16 },
  skip: { minHeight: 52, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#53655d', borderRadius: 8 },
  brand: { color: UI_COLORS.textMuted, fontSize: 15, letterSpacing: 3, fontWeight: '700' },
  rule: { height: 1, backgroundColor: '#50645D', marginVertical: 16 },
  attendance: { color: '#A9C6B1', fontSize: 16, letterSpacing: 2 },
  answer: { color: UI_COLORS.text, fontSize: 21, lineHeight: 31, marginTop: 20 },
  complete: { color: UI_COLORS.text, fontSize: 27, fontWeight: '700', marginVertical: 18 },
  note: { color: UI_COLORS.textMuted, fontSize: 16, lineHeight: 25 },
  credit: { color: UI_COLORS.textMuted, fontSize: 14, lineHeight: 22 },
});
