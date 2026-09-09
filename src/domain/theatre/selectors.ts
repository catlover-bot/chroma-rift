import type { ChapterRuntime } from '../firstPerson/types';
import { THEATRE_CURTAIN_FIXTURE,THEATRE_LIGHT_FIXTURE } from './definition';
import { THEATRE_LIGHT_COMMIT_LABEL } from './deviceStatus';
export function theatreObjective(runtime:ChapterRuntime):string {
  const p=runtime.progress.theatre!,v=runtime.theatre!;
  if(p.completed)return 'サービス出口から外へ出た。';
  if(p.passageSealed)return '防火幕は閉じた。奥のサービス出口まで歩く';
  if(p.curtainAccepted)return '幕が止まるのを確かめ、奥の出口へ';
  if(v.projectorArmed)return '取っ手を回すと映写機が響く。周囲への注意は続く';
  if(!p.light.accepted)return '灯りを動かし、2つの受光窓に光を届ける';
  return '棚の左右を通り、奥の制御室で防火幕を下ろす';
}
export function theatreHint(runtime:ChapterRuntime) {
  const p=runtime.progress.theatre!,i=Math.max(0,Math.min(2,runtime.progress.hintStage-1));
  return !p.light.accepted?{text:['大きな影は、小さな物体に灯りが当たってできています。','光源をレールに沿って動かし、左右の窓から影を外そう。',`両窓の印が灯ったら「${THEATRE_LIGHT_COMMIT_LABEL}」を押そう。`][i]!,target:THEATRE_LIGHT_FIXTURE.center}:
    {text:['中央の仕切りの左右が通れます。見られたら遮蔽物の陰へ。','左奥の映写機は、その場所から音を出します。点検歩廊に別の通路もあります。','奥の狭い入口を通り、防火幕の取っ手を見て下ろしたら、サービス出口まで歩こう。'][i]!,target:THEATRE_CURTAIN_FIXTURE.center};
}
