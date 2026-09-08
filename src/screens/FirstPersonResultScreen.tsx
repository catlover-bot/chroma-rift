import { FreshPressButton } from '../components/FreshPressButton';
import { Body, Heading, Panel, Screen } from '../components/Layout';
import type { FirstPersonChapterSummary } from '../types/application';

export function FirstPersonResultScreen({ summary, onReplay, onHome, onNewGallery, onNextChapter, onNotes }: {
  summary: FirstPersonChapterSummary; onReplay: () => void; onHome: () => void; onNewGallery?: () => void; onNextChapter?: () => void; onNotes?: () => void;
}) {
  const vault = summary.chapterId === 'uncanny-vault-v1';
  const gallery = summary.chapterId === 'perception-gallery-v1';
  const migrated = gallery && summary.migratedCompletion;
  return (
    <Screen>
      <Heading>{vault ? '測れない収蔵庫から脱出' : gallery ? migrated ? '展示室のクリア記録' : '閉館後の展示室から脱出' : '帰り道のない入口から脱出'}</Heading>
      <Body>{vault ? '搬出口の扉を閉めて、収蔵庫から脱出しました。' : gallery ? migrated ? '以前の展示室のクリア記録を保持しています。新版は、好きなときに最初から遊べます。' : '最後の扉を閉めて、展示室から脱出しました。' : 'ふたつの封印を解き、入口の向こうに新しい道を見つけました。'}</Body>
      {!migrated ? <Panel>
        <Body>{gallery || vault ? '持ち帰った発見' : '見破った仕掛け'}</Body>
        {summary.discoveredMechanisms.map((mechanism) => <Body key={mechanism}>{mechanism}</Body>)}
      </Panel> : null}
      <Body muted>{vault ? '端の飾り、傾いた枠、平行な目地。見え方を、自分の操作で比べられます。' : gallery ? '見本の明暗、ないはずの輪郭、そこにいる展示体。それぞれ違う仕組みです。' : '色の見え方、形の重なり、組み替わる空間。それぞれに違う仕組みがあります。'}</Body>
      {(gallery || vault) && onNotes ? <FreshPressButton sessionKey={summary.chapterId} label="発見メモを比べる" onPress={onNotes} /> : null}
      <FreshPressButton sessionKey={summary.chapterId} label={vault ? '収蔵庫を最初から遊ぶ' : gallery ? '展示室を最初から遊ぶ' : '章を最初から遊ぶ'} onPress={onReplay} variant="primary" />
      {!gallery && !vault && onNewGallery ? <FreshPressButton sessionKey={summary.chapterId} label="新しい展示室を始める" onPress={onNewGallery} /> : null}
      {gallery && onNextChapter ? <FreshPressButton sessionKey={summary.chapterId} label="次の章へ：測れない収蔵庫" onPress={onNextChapter} /> : null}
      <FreshPressButton sessionKey={summary.chapterId} label="ホームへ戻る" onPress={onHome} />
    </Screen>
  );
}
