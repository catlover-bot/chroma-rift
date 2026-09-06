import { ActionButton, Body, Heading, Panel, Screen } from '../components/Layout';
import type { FirstPersonChapterSummary } from '../types/application';

export function FirstPersonResultScreen({ summary, onReplay, onHome, onNewGallery }: {
  summary: FirstPersonChapterSummary; onReplay: () => void; onHome: () => void; onNewGallery?: () => void;
}) {
  const gallery = summary.chapterId === 'perception-gallery-v1';
  return (
    <Screen>
      <Heading>{gallery ? '展示室の、その先へ' : '帰り道のない入口から脱出'}</Heading>
      <Body>{gallery ? '四つの封印を解き、覚えている入口の先に、新しい道を見つけました。' : 'ふたつの封印を解き、入口の向こうに新しい道を見つけました。'}</Body>
      <Panel>
        <Body>見破った仕掛け</Body>
        {summary.discoveredMechanisms.map((mechanism) => <Body key={mechanism}>{mechanism}</Body>)}
      </Panel>
      <Body muted>色の見え方、形の重なり、組み替わる空間。それぞれに違う仕組みがあります。</Body>
      <ActionButton label={gallery ? '展示室を最初から遊ぶ' : '章を最初から遊ぶ'} onPress={onReplay} variant="primary" />
      {!gallery && onNewGallery ? <ActionButton label="新しい展示室を始める" onPress={onNewGallery} /> : null}
      <ActionButton label="ホームへ戻る" onPress={onHome} />
    </Screen>
  );
}
