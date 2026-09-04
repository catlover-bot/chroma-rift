import { ActionButton, Heading, Panel, Screen, Stat } from '../components/Layout';
import { PROFILE_LABELS } from '../domain/calibration/scoring';
import type { CalibrationProfile } from '../domain/calibration/types';
import type { MazeScore } from '../domain/maze/types';
import type { AppSettings } from '../types/application';

export function StageResultScreen({
  score,
  bestScore,
  profile,
  settings,
  onRetry,
  onHome,
}: {
  score: MazeScore;
  bestScore: number;
  profile?: CalibrationProfile;
  settings: AppSettings;
  onRetry: () => void;
  onHome: () => void;
}) {
  const accuracy = score.decisions === 0 ? 0 : Math.round((score.correctCount / score.decisions) * 100);
  return (
    <Screen>
      <Heading>ステージ結果</Heading>
      <Panel>
        <Stat label="スコア" value={score.score} />
        <Stat label="ベストスコア" value={bestScore} />
        <Stat label="正解" value={`${score.correctCount} / 3`} />
        <Stat label="正解率" value={`${accuracy}%`} />
        <Stat label="ベストコンボ" value={score.bestCombo} />
        <Stat
          label="調整プロファイル"
          value={profile ? PROFILE_LABELS[profile.preference] : '未調整'}
        />
        <Stat label="Depth Assist" value={settings.depthAssist ? 'オン' : 'オフ'} />
      </Panel>
      <ActionButton label="もう一度遊ぶ" onPress={onRetry} variant="primary" />
      <ActionButton label="ホームへ戻る" onPress={onHome} />
    </Screen>
  );
}
