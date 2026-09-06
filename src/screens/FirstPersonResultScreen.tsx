import { ActionButton, Body, Heading, Panel, Screen } from '../components/Layout';
import type { FirstPersonChapterSummary } from '../types/application';

export function FirstPersonResultScreen({ summary, onReplay, onHome, onNewGallery, onNotes }: {
  summary: FirstPersonChapterSummary; onReplay: () => void; onHome: () => void; onNewGallery?: () => void; onNotes?: () => void;
}) {
  const gallery = summary.chapterId === 'perception-gallery-v1';
  const migrated = gallery && summary.migratedCompletion;
  return (
    <Screen>
      <Heading>{gallery ? migrated ? '展示室のクリア記録' : '閉館後の展示室から脱出' : '帰り道のない入口から脱出'}</Heading>
      <Body>{gallery ? migrated ? '以前の展示室のクリア記録を保持しています。新版は、好きなときに最初から遊べます。' : '最後の扉を閉めて、展示室から脱出しました。' : 'ふたつの封印を解き、入口の向こうに新しい道を見つけました。'}</Body>
      {!migrated ? <Panel>
        <Body>{gallery ? '持ち帰った発見' : '見破った仕掛け'}</Body>
        {summary.discoveredMechanisms.map((mechanism) => <Body key={mechanism}>{mechanism}</Body>)}
      </Panel> : null}
      <Body muted>{gallery ? '見本の明暗、ないはずの輪郭、そこにいる展示体。それぞれ違う仕組みです。' : '色の見え方、形の重なり、組み替わる空間。それぞれに違う仕組みがあります。'}</Body>
      {gallery && onNotes ? <ActionButton label="発見メモを比べる" onPress={onNotes} /> : null}
      <ActionButton label={gallery ? '展示室を最初から遊ぶ' : '章を最初から遊ぶ'} onPress={onReplay} variant="primary" />
      {!gallery && onNewGallery ? <ActionButton label="新しい展示室を始める" onPress={onNewGallery} /> : null}
      <ActionButton label="ホームへ戻る" onPress={onHome} />
    </Screen>
  );
}
