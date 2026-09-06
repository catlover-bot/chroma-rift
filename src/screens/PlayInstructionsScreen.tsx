import { ActionButton, Body, Heading, Panel, Screen } from '../components/Layout';
import type { FirstPersonControls } from '../types/application';

export function PlayInstructionsScreen({ controls, onStart, onBack, chapterId }: { controls: FirstPersonControls; reducedMotion: boolean; chapterId?: string; onStart: () => void; onBack: () => void }) {
  return (
    <Screen>
      <Heading>準備できました</Heading>
      {chapterId === 'perception-gallery-v1' ? <Body>不確かな展示室</Body> : null}
      <Panel>
        <Body>{controls.movementMode === 'simple' ? '歩く・向くボタンで、少しずつ進もう。' : controls.handedness === 'left' ? '右側をドラッグして歩き、左側をドラッグして見回そう。' : '左側をドラッグして歩き、右側をドラッグして見回そう。'}</Body>
      </Panel>
      <Body muted>壁の紋章に近づいて調べよう。一時停止からドラッグ操作・ボタン操作を選べます。</Body>
      <ActionButton label={chapterId === 'perception-gallery-v1' ? '展示室へ入る' : '迷宮へ入る'} variant="primary" onPress={onStart} />
      <ActionButton label="ホームへ戻る" onPress={onBack} />
    </Screen>
  );
}
