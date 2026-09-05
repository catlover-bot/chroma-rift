import { ActionButton, Body, Heading, Panel, Screen } from '../components/Layout';
import type { FirstPersonControls } from '../types/application';

export function PlayInstructionsScreen({ controls, reducedMotion, onStart, onBack }: { controls: FirstPersonControls; reducedMotion: boolean; onStart: () => void; onBack: () => void }) {
  return (
    <Screen>
      <Heading>準備できました</Heading>
      <Panel>
        <Body>{controls.movementMode === 'simple' || reducedMotion ? '歩く・向くボタンで、少しずつ進もう。' : controls.handedness === 'left' ? '右のスティックで歩き、左をなぞって見回そう。' : '左のスティックで歩き、右をなぞって見回そう。'}</Body>
      </Panel>
      <Body muted>気になるものを正面に捉えて「調べる」。一時停止から簡単操作も選べます。</Body>
      <ActionButton label="迷宮へ入る" variant="primary" onPress={onStart} />
      <ActionButton label="ホームへ戻る" onPress={onBack} />
    </Screen>
  );
}
