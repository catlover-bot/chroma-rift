import { ActionButton, Body, Heading, Panel, Screen } from '../components/Layout';
import type { FirstPersonChapterSummary } from '../types/application';

export function FirstPersonResultScreen({ summary, onReplay, onHome }: {
  summary: FirstPersonChapterSummary; onReplay: () => void; onHome: () => void;
}) {
  return (
    <Screen>
      <Heading>帰り道のない入口から脱出</Heading>
      <Body>ふたつの封印を解き、入口の向こうに新しい道を見つけました。</Body>
      <Panel>
        <Body>見破った仕掛け</Body>
        {summary.discoveredMechanisms.map((mechanism) => <Body key={mechanism}>{mechanism}</Body>)}
      </Panel>
      <Body muted>色の見え方、形の重なり、組み替わる空間。それぞれに違う仕組みがあります。</Body>
      <ActionButton label="章を最初から遊ぶ" onPress={onReplay} variant="primary" />
      <ActionButton label="ホームへ戻る" onPress={onHome} />
    </Screen>
  );
}
