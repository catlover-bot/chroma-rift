import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from '../components/Layout';
import { CHAPTER_ONE, CHAPTER_TWO, type CampaignAreaId } from '../domain/campaign/definition';
import type { LegacyImportProposal } from '../domain/campaign/migration';
import type { ChapterOneSession } from '../domain/campaign/session';
import type { CampaignDiscoveryHistory } from '../domain/campaign/discoveries';
import { UI_COLORS } from '../theme/ui';

const DISCOVERY_TITLES: Readonly<Record<CampaignAreaId, Readonly<Record<string, string>>>> = {
  'chapter-1-area-01': { chromatic: '色の奥行き', shadow: '明暗の対比', contour: '主観的輪郭',
    mask: '凹面の仮面', wiring: '隠れた配線', hybrid: '近づくと変わる掲示', shepard: '音の錯覚' },
  'chapter-1-area-02': { length: '長さの見え方', rod: '鉛直の見え方', cafe: '平行な目地' },
  'chapter-1-area-03': { shadow: '影の大きさ', depth: '部屋の奥行き' },
  'chapter-1-area-04': { figure: '顔と顔の間の輪郭', mirror: '背後を映す鏡', ratchet: '巻き上げた歯止め' },
  'chapter-1-area-05': { containment: '収容区画の隔離', attendance: '在館反応の変化' },
};

type Props = {
  session?: ChapterOneSession | undefined;
  migration?: LegacyImportProposal | undefined;
  loading: boolean;
  blocked?: string | undefined;
  message?: string | undefined;
  replayable: readonly CampaignAreaId[];
  showAreas: boolean;
  showDiscoveries: boolean;
  discoveries: CampaignDiscoveryHistory;
  onContinue: () => void;
  onNew: () => void;
  onImport: () => void;
  onAreas: () => void;
  onDiscoveries: () => void;
  onHome: () => void;
  onReplay: (areaId: CampaignAreaId) => void;
  onEnding: () => void;
  onSettings: () => void;
  onLegacyStages?: () => void;
};

/** One chapter and exactly five product areas. Legacy/probe routes are not
 * exposed by this screen; discovery and migration remain separate records. */
export function ChapterOneHomeScreen(props: Props) {
  const current = CHAPTER_ONE.areas.find(area => area.id === props.session?.currentArea);
  return <SafeAreaView style={styles.safe} edges={['top','right','bottom','left']}>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.brand}>CHROMA RIFT</Text>
      <View style={styles.rule}/>
      <Text style={styles.eyebrow}>第一章</Text>
      <Text style={styles.title} accessibilityRole="header">最後の退館者</Text>
      {props.showDiscoveries ? <>
        <Text style={styles.description}>実際に調べたり操作した記録。以前のクリア記録だけで未発見の項目は増えません。</Text>
        {CHAPTER_ONE.areas.map(area => <View key={area.id} style={styles.areaRow}>
          <Text style={styles.areaNumber}>{area.number}</Text>
          <View style={styles.areaCopy}>
            <Text style={styles.areaName}>{area.title}</Text>
            {(props.discoveries[area.id] ?? []).length
              ? (props.discoveries[area.id] ?? []).map(id => <Text key={id} style={styles.note}>・{DISCOVERY_TITLES[area.id][id] ?? '調べた展示'}</Text>)
              : <Text style={styles.areaStatus}>まだ発見の記録はありません</Text>}
          </View>
        </View>)}
        <ActionButton label="第一章のホームへ" onPress={props.onHome}/>
      </> : props.showAreas ? <>
        <Text style={styles.description}>知覚展示館　館内経路</Text>
        {CHAPTER_ONE.areas.map(area => {
          const completed = !!props.session?.completedAreas.includes(area.id);
          const underway = props.session?.currentArea === area.id && !props.session.campaignCompleted;
          const reached = completed || underway || props.replayable.includes(area.id);
          const status = completed ? '到達済み' : underway ? '進行中' : reached ? '記録あり' : '未到達';
          return <View key={area.id} style={styles.areaRow}>
            <Text style={styles.areaNumber}>{area.number}</Text>
            <View style={styles.areaCopy}>
              <Text style={styles.areaName}>{area.title}</Text>
              <Text style={styles.areaStatus}>{status}</Text>
              {props.replayable.includes(area.id) ? <ActionButton label={`${area.title}を振り返る`}
                onPress={() => props.onReplay(area.id)} /> : null}
            </View>
          </View>;
        })}
        <ActionButton label="第一章のホームへ" onPress={props.onHome}/>
      </> : <>
        <Text style={styles.description}>閉館点検中、在館表示は02で止まった。非常灯と職員経路をたどり、閉館処理を終える。</Text>
        {props.loading ? <Text style={styles.note}>記録を確認しています…</Text> : null}
        {props.blocked ? <Text accessibilityRole="alert" style={styles.warning}>{props.blocked}</Text> : null}
        {props.message ? <Text accessibilityRole="alert" style={styles.warning}>{props.message}</Text> : null}
        {props.session?.campaignCompleted ? <>
          <Text style={styles.progress}>第一章　完了</Text>
          <ActionButton label="エンディングを見る" variant="primary" onPress={props.onEnding}/>
        </> : props.session ? <>
          <Text style={styles.progress}>エリア {current?.number ?? '01'} / 05　{current?.title ?? ''}</Text>
          <ActionButton label="続きから" variant="primary" onPress={props.onContinue}/>
        </> : !props.loading ? <ActionButton label="第一章をはじめる" variant="primary" onPress={props.onNew}/> : null}
        {props.migration?.status === 'ready' && !props.session ? <View style={styles.migration}>
          <Text style={styles.note}>以前のプレイ記録が見つかりました。エリア{String(props.migration.completedPrefix + 1).padStart(2,'0')}から引き継げます。</Text>
          <ActionButton label="記録を引き継ぐ" onPress={props.onImport}/>
          <Text style={styles.small}>引き継がなくても、以前の記録の原文は残ります。</Text>
        </View> : null}
        {props.migration?.status === 'blocked' && !props.session ? <Text style={styles.warning}>
          以前の記録の一部を読めません。原文を保持しています。第一章を新しく始めることはできます。
        </Text> : null}
        {props.migration?.status === 'await-area' && !props.session ? <Text style={styles.warning}>
          以前の記録を引き継ぐ入口を準備中です。原文を保持しています。
        </Text> : null}
        {props.session && !props.session.campaignCompleted ? <ActionButton label="第一章をはじめから" onPress={props.onNew}/> : null}
        <ActionButton label="エリアを振り返る" onPress={props.onAreas} disabled={props.loading}/>
        <ActionButton label="発見の記録" onPress={props.onDiscoveries} disabled={props.loading}/>
        <ActionButton label="設定" onPress={props.onSettings}/>
        {__DEV__ && props.onLegacyStages ? <ActionButton label="旧ステージ一覧（開発用）" onPress={props.onLegacyStages}/> : null}
      </>}
      <View style={styles.rule}/>
      <Text style={styles.eyebrow}>第二章</Text>
      <Text style={styles.planned}>{CHAPTER_TWO.notice}</Text>
      <Text style={styles.small}>{CHAPTER_TWO.unavailable}</Text>
      <Text style={styles.footer}>知覚展示館　閉館点検記録</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: UI_COLORS.background },
  content: { paddingHorizontal: 24, paddingTop: 28, paddingBottom: 46, gap: 14 },
  brand: { color: UI_COLORS.text, fontSize: 24, fontWeight: '800', letterSpacing: 3 },
  rule: { height: 1, backgroundColor: '#50645D', marginVertical: 8 },
  eyebrow: { color: '#9EB6A8', fontSize: 14, fontWeight: '700', letterSpacing: 2 },
  title: { color: UI_COLORS.text, fontSize: 31, fontWeight: '700' },
  description: { color: UI_COLORS.textMuted, fontSize: 16, lineHeight: 26, marginBottom: 8 },
  progress: { color: '#D5E5D7', fontSize: 17, marginVertical: 5 },
  note: { color: UI_COLORS.text, fontSize: 16, lineHeight: 24 },
  warning: { color: UI_COLORS.danger, fontSize: 15, lineHeight: 23 },
  small: { color: UI_COLORS.textMuted, fontSize: 14, lineHeight: 21 },
  migration: { gap: 9, paddingVertical: 10, borderTopWidth: 1, borderColor: UI_COLORS.border },
  areaRow: { flexDirection: 'row', gap: 20, borderTopWidth: 1, borderColor: UI_COLORS.border, paddingVertical: 15 },
  areaNumber: { color: '#9EB6A8', fontSize: 22, width: 36, fontWeight: '700' },
  areaCopy: { flex: 1, gap: 5 },
  areaName: { color: UI_COLORS.text, fontSize: 19, fontWeight: '600' },
  areaStatus: { color: UI_COLORS.textMuted, fontSize: 14 },
  planned: { color: UI_COLORS.textMuted, fontSize: 17 },
  footer: { color: '#6F7E76', fontSize: 12, marginTop: 28, letterSpacing: 1 },
});
