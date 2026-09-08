import { useLayoutEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton, Body, Heading } from '../components/Layout';
import { VAULT_NOTES } from '../content/vaultNotes';
import { createVaultComparisons, vaultComparison, type VaultComparisons } from '../content/vaultComparisons';
import { LENGTH_SPEC } from '../domain/vault/specs';
import type { VaultDiscovery, VaultProgress } from '../domain/vault/types';
import { UI_COLORS } from '../theme/ui';
import { ComparisonSlider, RasterFigure } from './DiscoveryNotebook';
export type VaultNotebookProps = { progress: VaultProgress; completed: boolean; onClose: () => void;
  comparisons?: VaultComparisons; onComparisonsChange?: (state: VaultComparisons) => void };
function lifetime() { let active = true; return { current: () => active, activate: () => { active = true; }, dispose: () => { active = false; } }; }
export function VaultNotebook({ progress, completed, onClose, comparisons, onComparisonsChange }: VaultNotebookProps) {
  const [selected, setSelected] = useState<VaultDiscovery>();
  const [local, setLocal] = useState(() => createVaultComparisons(progress));
  const owner = useMemo(() => lifetime(), []), state = comparisons ?? local;
  useLayoutEffect(() => { owner.activate(); return () => owner.dispose(); }, [owner]);
  const width = Math.max(128, Math.min(360, useWindowDimensions().width - 64));
  const note = VAULT_NOTES.find(item => item.id === selected), available = VAULT_NOTES.filter(item => completed || progress.discoveries[item.id]);
  const raster = useMemo(() => selected ? vaultComparison(selected, state) : undefined, [selected, state]);
  const choose = (id?: VaultDiscovery) => { if (owner.current()) setSelected(id); };
  const update = (patch: Partial<VaultComparisons>) => { if (!owner.current()) return; const next = { ...state, ...patch }; setLocal(next); onComparisonsChange?.(next); };
  const aid = (key: keyof VaultProgress['aids']) => update({ aids: { ...state.aids, [key]: !state.aids[key] } });
  const aided = selected === 'length' ? state.aids.finsHidden || state.aids.lengthGuide : selected === 'rod' ? state.aids.frameHidden || state.aids.plumb : state.aids.cafeNeutral;
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.screen} accessibilityViewIsModal testID="vault-notebook">
    <View style={styles.heading}><ActionButton label={selected ? 'メモ一覧へ' : completed ? '結果へ戻る' : '一時停止へ戻る'} onPress={() => { if (!owner.current()) return; if (selected) choose(); else onClose(); }} />
      <Heading>{note?.title ?? '収蔵庫の発見メモ'}</Heading></View>
    <ScrollView testID="vault-notebook-scroll" contentContainerStyle={styles.content}>
      {!note ? <><Body>{completed ? '敵のいない自由比較です。未体験の項目は発見済みにしません。' : '本編で調べたものだけを記録しています。'}</Body>
        {available.length ? available.map(item => <ActionButton key={item.id} label={item.title + (progress.discoveries[item.id] ? '' : '（自由比較）')} onPress={() => choose(item.id)} />) : <Body>まだ発見メモはありません。</Body>}
      </> : <>
        <Body>{progress.discoveries[note.id] ? note.discovery : 'クリア後の自由比較。本編の発見記録には追加しません。'}</Body>
        <Body muted>正面からの比較図。本編の棒・針・進行は変わりません。</Body>
        {raster ? <RasterFigure raster={raster} width={width} /> : null}
        <Body>{note.explanation}</Body><Body muted>{note.operation}</Body>
        {selected === 'length' ? <>
          <Body>{`端の飾り：${state.aids.finsHidden ? 'なし' : 'あり'} ／ 測定ガイド：${state.aids.lengthGuide ? 'オン' : 'オフ'}`}</Body>
          <ComparisonSlider key="length" label="比較する棒の長さ" value={state.length} min={LENGTH_SPEC.minLength} max={LENGTH_SPEC.maxLength} step={.02} onChange={length => update({ length })} />
          <ActionButton label={state.aids.finsHidden ? '端の飾りを戻す' : '端の飾りを畳む'} onPress={() => aid('finsHidden')} />
          <ActionButton label={state.aids.lengthGuide ? '測定ガイドを消す' : '測定ガイド'} onPress={() => aid('lengthGuide')} />
        </> : selected === 'rod' ? <>
          <Body>{`傾いた枠：${state.aids.frameHidden ? 'なし' : 'あり'} ／ 下げ振り：${state.aids.plumb ? 'オン' : 'オフ'}`}</Body>
          <ComparisonSlider key="rod" label="比較する針の向き" value={state.angle} min={-Math.PI / 2} max={Math.PI / 2} step={Math.PI / 90} onChange={angle => update({ angle })} />
          <ActionButton label={state.aids.frameHidden ? '枠を戻す' : '枠を消す'} onPress={() => aid('frameHidden')} />
          <ActionButton label={state.aids.plumb ? '下げ振りを消す' : '下げ振り'} onPress={() => aid('plumb')} />
        </> : <><Body>{state.aids.cafeNeutral ? 'タイル：明暗をそろえた比較' : 'タイル：元の明暗'}</Body>
          <ActionButton label={state.aids.cafeNeutral ? '元の明暗へ戻す' : 'タイルの明暗をそろえる'} onPress={() => aid('cafeNeutral')} /></>}
        {aided ? <Body muted>補助を使った比較です。自然な見え方を確認した記録にはしません。</Body> : null}
        <Body>現象の資料</Body>{note.sources.map(source => <View key={source.url}><Body muted>{source.title}</Body><Text selectable style={styles.source}>{source.url}</Text></View>)}
        <Body>素材クレジット</Body><Body muted>{note.credit}</Body>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: UI_COLORS.background }, heading: { padding: 12, gap: 6 },
  content: { padding: 16, gap: 12, paddingBottom: 32 }, source: { color: UI_COLORS.textMuted, fontSize: 12, lineHeight: 18 } });
