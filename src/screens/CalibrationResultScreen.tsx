import { ActionButton, Body, Heading, Panel, Screen, Stat } from '../components/Layout';
import { PROFILE_EXPLANATIONS, PROFILE_LABELS } from '../domain/calibration/scoring';
import type { CalibrationProfile } from '../domain/calibration/types';

const directionLabel = (direction: number) => {
  if (direction >= 0.45) return '赤が手前';
  if (direction <= -0.45) return '青が手前';
  return '混合または同程度';
};

export function CalibrationResultScreen({
  profile,
  onMaze,
  onRecalibrate,
  onHome,
}: {
  profile: CalibrationProfile;
  onMaze: () => void;
  onRecalibrate: () => void;
  onHome: () => void;
}) {
  return (
    <Screen>
      <Heading>調整結果</Heading>
      <Panel>
        <Stat label="プロファイル" value={PROFILE_LABELS[profile.preference]} />
        <Body>{PROFILE_EXPLANATIONS[profile.preference]}</Body>
        <Body muted>この分類はゲーム設定用の暫定的な目安で、視力の診断ではありません。</Body>
      </Panel>
      <Panel>
        <Stat label="明確な回答" value={`${profile.decisiveCount} / 12`} />
        <Stat label="知覚した方向" value={directionLabel(profile.direction)} />
        <Stat
          label="効果の強さ"
          value={profile.decisiveCount === 0 ? 'なし' : profile.meanDecisiveStrength.toFixed(1)}
        />
        <Stat label="一貫度" value={`${Math.round(profile.confidence * 100)}%`} />
        <Stat label="背景による反転" value={profile.backgroundReversalObserved ? '観察された' : '観察されなかった'} />
        <Stat label="補助表示" value={profile.depthAssistDefault ? '推奨' : '任意'} />
      </Panel>
      <ActionButton label="迷路を試す" onPress={onMaze} variant="primary" />
      <ActionButton label="もう一度調整する" onPress={onRecalibrate} />
      <ActionButton label="ホームへ戻る" onPress={onHome} />
    </Screen>
  );
}
