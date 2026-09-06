import type { PlayerPose, Vec3 } from '../domain/firstPerson/types';
import type { FirstPersonControls } from '../types/application';

export type EffectiveControlMode = {
  mode: FirstPersonControls['movementMode'];
  reason: string;
  forced: boolean;
};

/** Motion and typography affect presentation, never the saved touch preference. */
export function effectiveControlMode(preference: FirstPersonControls['movementMode'], _reducedMotion: boolean, screenReader: boolean, _fontScale: number): EffectiveControlMode {
  return {
    mode: screenReader ? 'simple' : preference,
    reason: screenReader
      ? '画面の読み上げ中はボタン操作を表示します。保存した操作設定は変わりません。'
      : preference === 'simple' ? '保存したボタン操作の希望' : '保存したドラッグ操作の希望',
    forced: screenReader && preference === 'standard',
  };
}

export function firstGuideInstruction(mode: EffectiveControlMode['mode']): string {
  return mode === 'simple' ? '「前へ一歩」で、光のしるべへ近づこう。' : '左側をドラッグして歩こう。';
}

/** Describe a turn toward the already selected visible guide; never change pose. */
export function simpleGuideAimInstruction(pose: PlayerPose, target: Vec3): string {
  const dx = target.x - pose.position.x;
  const dz = target.z - pose.position.z;
  const desiredYaw = Math.atan2(-dx, -dz);
  const yawError = Math.atan2(Math.sin(desiredYaw - pose.yaw), Math.cos(desiredYaw - pose.yaw));
  const pitchError = Math.atan2(target.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch;
  if (Math.max(Math.abs(yawError), Math.abs(pitchError)) < 0.0001) return '光に中央の照準を合わせよう。';
  const button = Math.abs(yawError) > Math.abs(pitchError)
    ? yawError > 0 ? '左を向く' : '右を向く'
    : pitchError > 0 ? '上を見る' : '下を見る';
  return `「${button}」で、光に中央の照準を合わせよう。`;
}
