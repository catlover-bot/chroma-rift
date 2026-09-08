import { ActionButton, Body, ChoiceRow, Heading, Panel, Screen } from '../components/Layout';
import type { FirstPersonControls, HorrorIntensity } from '../types/application';

export function PlayInstructionsScreen({ controls, onStart, onBack, chapterId, horrorIntensity = 'standard', onHorrorChange }: {
  controls: FirstPersonControls; reducedMotion: boolean; chapterId?: string; onStart: () => void; onBack: () => void;
  horrorIntensity?: HorrorIntensity; onHorrorChange?: (value: HorrorIntensity) => void;
}) {
  const vault = chapterId === 'uncanny-vault-v1';
  const gallery = chapterId === 'perception-gallery-v1';
  return (
    <Screen>
      <Heading>準備できました</Heading>
      {vault ? <Body>測れない収蔵庫</Body> : gallery ? <Body>閉館後の展示室</Body> : null}
      <Panel>
        <Body>{controls.movementMode === 'simple' ? '歩く・向くボタンで、少しずつ進もう。' : controls.handedness === 'left' ? '右側をドラッグして歩き、左側をドラッグして見回そう。' : '左側をドラッグして歩き、右側をドラッグして見回そう。'}</Body>
      </Panel>
      <Body>{vault ? 'まず下の棒の長さを見本に合わせ、固定しよう。棚の奥に搬出口があります。' : gallery ? 'まず出口を探そう。大きな非常灯スイッチは、近づいて押せます。' : '壁の紋章に近づいて調べよう。'}</Body>
      {gallery || vault ? <Panel>
        <Body>展示体の気配と巡回があります。控えめでは追尾と接触によるやり直しがありません。</Body>
        {onHorrorChange ? <ChoiceRow>
          <ActionButton label="標準の怖さ" variant={horrorIntensity === 'standard' ? 'primary' : 'secondary'} onPress={() => onHorrorChange('standard')} />
          <ActionButton label="控えめな怖さ" variant={horrorIntensity === 'subdued' ? 'primary' : 'secondary'} onPress={() => onHorrorChange('subdued')} />
        </ChoiceRow> : null}
      </Panel> : null}
      <Body muted>{gallery || vault ? '一時停止から操作と怖さを変更できます。' : '一時停止からドラッグ操作・ボタン操作を選べます。'}</Body>
      <ActionButton label={vault ? '収蔵庫へ入る' : gallery ? '展示室へ入る' : '迷宮へ入る'} variant="primary" onPress={onStart} />
      <ActionButton label="ホームへ戻る" onPress={onBack} />
    </Screen>
  );
}
