import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton, Body, Heading } from '../components/Layout';
import { CHAPTER_ONE_DISCOVERY_TITLES, CHAPTER_ONE_STAGE_NOTE_DETAILS, type ChapterOneStageNoteArea } from '../content/chapterOneDiscoveries';
import { CHAPTER_ONE } from '../domain/campaign/definition';
import { observedCampaignDiscoveries } from '../domain/campaign/discoveries';
import type { CheckpointState } from '../domain/firstPerson';
import { UI_COLORS } from '../theme/ui';

type Props = { areaId: ChapterOneStageNoteArea; checkpoint: CheckpointState; onClose: () => void };

/** The checkpoint is read when the paused notebook opens. Only validated,
 * explicitly observed stage bits appear; clear/replay never unlocks notes. */
export function CampaignStageNotebook({ areaId, checkpoint, onClose }: Props) {
  const area = CHAPTER_ONE.areas.find(item => item.id === areaId)!;
  const observed = observedCampaignDiscoveries(areaId, checkpoint);
  return <SafeAreaView edges={['top', 'right', 'bottom', 'left']} style={styles.screen} accessibilityViewIsModal testID="campaign-stage-notebook">
    <View style={styles.heading}>
      <ActionButton label="一時停止へ戻る" onPress={onClose} />
      <Heading>{area.title}の発見メモ</Heading>
    </View>
    <ScrollView contentContainerStyle={styles.content} testID="campaign-stage-notebook-scroll">
      <Body>本編で調べたり操作したものだけを記録しています。</Body>
      {observed.length ? observed.map(id => <View key={id} style={styles.note}>
        <Heading>{CHAPTER_ONE_DISCOVERY_TITLES[areaId][id]}</Heading>
        <Body>{CHAPTER_ONE_STAGE_NOTE_DETAILS[areaId][id]}</Body>
      </View>) : <Body>まだ発見メモはありません。</Body>}
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI_COLORS.background },
  heading: { padding: 12, gap: 6 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  note: { gap: 8, paddingVertical: 12, borderTopWidth: 1, borderColor: UI_COLORS.border },
});
