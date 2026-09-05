import { ActionButton, Body, Heading, Panel, Screen } from '../components/Layout';

export function PlayInstructionsScreen({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  return (
    <Screen>
      <Heading>準備できました</Heading>
      <Panel>
        <Body>隣の床をタップして、光のかけらをふたつ集めよう。</Body>
      </Panel>
      <Body muted>分かれ道では立ち止まります。来た道にも戻れます。</Body>
      <ActionButton label="回廊へ入る" variant="primary" onPress={onStart} />
      <ActionButton label="ホームへ戻る" onPress={onBack} />
    </Screen>
  );
}
