import type { PlayerPose, Vec3 } from '../domain/firstPerson/types';
import type { FirstPersonControls } from '../types/application';

export type EffectiveControlMode = {
  mode: FirstPersonControls['movementMode'];
  reason: string;
  forced: boolean;
};

/** The saved preference is never overwritten by accessibility conditions. */
export function effectiveControlMode(preference: FirstPersonControls['movementMode'], reducedMotion: boolean, screenReader: boolean, fontScale: number): EffectiveControlMode {
  const reasons = [
    ...(preference === 'simple' ? ['保存した簡単操作の希望'] : []),
    ...(reducedMotion ? ['動きを減らす設定'] : []),
    ...(screenReader ? ['画面の読み上げ'] : []),
    ...(fontScale >= 1.5 ? ['文字の拡大'] : []),
  ];
  return {
    mode: reasons.length ? 'simple' : 'standard',
    reason: reasons.length ? reasons.join('・') : '保存した標準操作の希望',
    forced: preference === 'standard' && reasons.length > 0,
  };
}

export function firstGuideInstruction(mode: EffectiveControlMode['mode']): string {
  return mode === 'simple' ? '「前へ一歩」で、小さな光へ近づこう。' : 'スティックで前へ進み、小さな光へ近づこう。';
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
