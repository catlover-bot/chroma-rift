import { ActionButton, Body, Heading, Panel, Screen, SectionTitle } from '../components/Layout';
import type { JourneyStageSummary } from '../types/application';

export function JourneyResultScreen({ summaries, onReplay, onHome }: {
  summaries: JourneyStageSummary[];
  onReplay: () => void;
  onHome: () => void;
}) {
  const discoveries = [...new Set(summaries.flatMap((summary) => summary.discoveredMechanisms))];
  return (
    <Screen>
      <Heading>ふたつの迷宮を踏破</Heading>
      <Body>光のかけら {summaries.reduce((sum, summary) => sum + summary.collectibleCount, 0)} / 4</Body>
      <Panel>
        <SectionTitle>見つけた仕掛け</SectionTitle>
        {discoveries.map((mechanism) => <Body key={mechanism}>{mechanism}</Body>)}
        <Body muted>色の見え方、床の高さ、視点でつながる橋。それぞれの変化を探索しました。</Body>
      </Panel>
      <Body muted>色の奥行きの感じ方は人によって違います。補助表示も自由に使えます。</Body>
      <ActionButton label="もう一度遊ぶ" variant="primary" onPress={onReplay} />
      <ActionButton label="ホームへ戻る" onPress={onHome} />
    </Screen>
  );
}
