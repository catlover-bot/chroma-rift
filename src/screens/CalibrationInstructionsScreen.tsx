import { ActionButton, Body, Heading, Panel, Screen } from '../components/Layout';

const instructions = [
  '両目で画面を見てください',
  '画面は普段使っている明るさにしてください',
  '赤と青のうち、手前に見える方を選んでください',
  '正解・不正解はありません',
  '分からない場合は「よく分からない」を選べます',
];

export function CalibrationInstructionsScreen({ onStart, onBack }: { onStart: () => void; onBack: () => void }) {
  return (
    <Screen>
      <Heading>見え方の調整</Heading>
      <Panel>
        {instructions.map((instruction, index) => (
          <Body key={instruction}>{index + 1}. {instruction}</Body>
        ))}
      </Panel>
      <Body muted>刺激は回答するまで静止します。無理に見続ける必要はありません。</Body>
      <ActionButton label="12問を始める" onPress={onStart} variant="primary" />
      <ActionButton label="ホームへ戻る" onPress={onBack} />
    </Screen>
  );
}
