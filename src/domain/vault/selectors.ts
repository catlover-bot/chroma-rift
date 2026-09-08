import type { ChapterRuntime } from '../firstPerson/types';
import { VAULT_EXIT_FIXTURE, VAULT_LENGTH_FIXTURE, VAULT_ROD_FIXTURE } from './definition';
import { isVaultExitThreshold } from './state';
export function vaultObjective(runtime: ChapterRuntime): string {
  const p = runtime.progress.vault!;
  if (p.finalDoorClosed) return '搬出口を封鎖した。ここは安全だ。';
  if (runtime.vault?.mode === 'length') return p.length.solved ? '格子が開いた。探索へ戻る' : '棒を基準と同じ長さにして固定する';
  if (runtime.vault?.mode === 'rod') return p.rod.solved ? '制動ロックが外れた。搬出口へ' : '針を鉛直に合わせてロックする';
  if (!p.length.solved) return '留め金を調整して、搬出通路を開ける';
  if (!p.rod.solved) return '棚の陰を通って、奥の制動ベイへ';
  if (isVaultExitThreshold(runtime.pose)) return '入ってきた扉の取っ手を見て、閉める';
  return '搬出口へ。仕切りを閉めて視線を切れる';
}
export function vaultHint(runtime: ChapterRuntime) {
  const p = runtime.progress.vault!, i = Math.max(0, Math.min(2, runtime.progress.hintStage - 1));
  if (!p.length.solved) return { text: [
    '右端の輪を横へ動かし、上の棒と同じ長さで固定しよう。',
    '「端の飾りを畳む」で、棒の両端を比べられます。',
    '測定ガイドの二本の線に、下の棒の両端を合わせよう。'][i]!, target: VAULT_LENGTH_FIXTURE.center };
  if (!p.rod.solved) return { text: [
    '中央の棚の左右が通れます。速く金属を踏むと音が届きます。',
    '視線を切り、奥の左壁にある細い格子の内側へ。',
    '制動ベイで下げ振りを出し、針をひもと平行にしてロック。'][i]!, target: VAULT_ROD_FIXTURE.center };
  return { text: [
    '右奥の搬出口へ。近づく予告が見えたら横へ避けよう。',
    '通路の仕切りを通り、振り返って取っ手で閉められます。',
    '最後の扉を通り、取っ手を見て閉めよう。背後は自動で向きません。'][i]!, target: VAULT_EXIT_FIXTURE.center };
}
