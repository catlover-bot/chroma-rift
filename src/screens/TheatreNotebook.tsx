import { useLayoutEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton, Body, Heading } from '../components/Layout';
import { theatreComparison, type TheatreComparisonState } from '../content/theatreComparisons';
import { evaluateLight } from '../domain/theatre/lightGate';
import type { TheatreDiscovery, TheatreProgress } from '../domain/theatre/types';
import { UI_COLORS } from '../theme/ui';
import { ComparisonSlider, RasterFigure } from './DiscoveryNotebook';
const NOTES = [
  { id: 'shadow', title: '影の大きさ', discovery: '灯りと投影される影を調べた。',
    explanation: '光源から物を通って受光面へ伸びる線が、影の位置と大きさを決めます。影の元になった小さな物と、通路を歩く展示体は別のものです。',
    operation: '灯りだけを動かして、受光面の影と窓の状態を比べます。下の図は同じ配置を上から見た構造図です。',
    source: 'https://threejs.org/manual/en/shadows.html' },
  { id: 'depth', title: '部屋の奥行き', discovery: '横の観察口から、部屋の構造を調べた。',
    explanation: '正面の視点に合わせて、奥の壁と床・天井が斜めに作られています。二つの置物は同じ実寸でも、奥行きと周囲の形が見かけの大きさに関わります。',
    operation: '正面・途中・横を切り替えます。これは同じ部屋の構造図で、置物の大きさ、部屋の形、視野角は変えません。',
    source: 'https://www.exploratorium.edu/snacks/ames-chair' },
] as const;
function lifetime() { let active = true; return { current: () => active, activate: () => { active = true; }, dispose: () => { active = false; } }; }
export function TheatreNotebook({ progress, completed, onClose }: { progress: TheatreProgress; completed: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<TheatreDiscovery>();
  const [state, setState] = useState<TheatreComparisonState>(() => ({ rail: progress.light.rail, view: 'front' }));
  const owner = useMemo(() => lifetime(), []);
  useLayoutEffect(() => { owner.activate(); return () => owner.dispose(); }, [owner]);
  const width = Math.max(128, Math.min(360, useWindowDimensions().width - 64));
  const note = NOTES.find(item => item.id === selected), available = NOTES.filter(item => completed || progress.discoveries[item.id]);
  const raster = useMemo(() => selected ? theatreComparison(selected, state) : undefined, [selected, state]);
  const choose = (id?: TheatreDiscovery) => { if (owner.current()) setSelected(id); };
  const change = (patch: Partial<TheatreComparisonState>) => { if (owner.current()) setState(previous => ({ ...previous, ...patch })); };
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.screen} accessibilityViewIsModal testID="theatre-notebook">
    <View style={styles.heading}><ActionButton label={selected ? 'メモ一覧へ' : completed ? '結果へ戻る' : '一時停止へ戻る'} onPress={() => { if (!owner.current()) return; if (selected) choose(); else onClose(); }} /><Heading>{note?.title ?? '映写室の発見メモ'}</Heading></View>
    <ScrollView contentContainerStyle={styles.content} testID="theatre-notebook-scroll">
      {!note ? <><Body>{completed ? '敵のいない自由比較です。未体験の項目は発見済みにしません。' : '本編で調べたものだけを記録しています。'}</Body>
        {available.length ? available.map(item => <ActionButton key={item.id} label={item.title + (progress.discoveries[item.id] ? '' : '（自由比較）')} onPress={() => choose(item.id)} />) : <Body>まだ発見メモはありません。</Body>}
      </> : <>
        <Body>{progress.discoveries[note.id] ? note.discovery : 'クリア後の自由比較。本編の発見記録には追加しません。'}</Body>
        <Body muted>説明用の構造図です。本編の状態や進行は変わりません。</Body>
        {raster ? <RasterFigure raster={raster} width={width} /> : null}
        <Body>{note.explanation}</Body><Body muted>{note.operation}</Body>
        {selected === 'shadow' ? <>
          <ComparisonSlider label="比較する灯りの位置" value={state.rail} min={-1} max={1} step={.05} onChange={rail => change({ rail })} />
          {evaluateLight(state.rail).windows.map(window => <Body key={window.id}>{window.id === 'left' ? '左' : '右'}の窓：{window.lit ? '光が届く' : '影がかかる'}</Body>)}
        </> : <>
          <Body>視点：{state.view === 'front' ? '正面' : state.view === 'intermediate' ? '途中' : '横'}</Body>
          {(['front', 'intermediate', 'side'] as const).map(view => <ActionButton key={view} label={view === 'front' ? '正面から見る' : view === 'intermediate' ? '途中から見る' : '横から見る'} variant={state.view === view ? 'primary' : 'secondary'} onPress={() => change({ view })} />)}
        </>}
        <Body muted>構造の確認と、錯覚を知覚したことは別です。補助図への切替を、自然な見え方の実績にはしません。</Body>
        <Body>現象の資料</Body><Text selectable style={styles.source}>{note.source}</Text>
        <Body>素材クレジット</Body><Body muted>CHROMA RIFT projectの独自形状・説明図。外部の写真・型紙・図は使用していません。</Body>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: UI_COLORS.background }, heading: { padding: 12, gap: 6 },
  content: { padding: 16, gap: 12, paddingBottom: 32 }, source: { color: UI_COLORS.textMuted, fontSize: 12, lineHeight: 18 } });
