# Goal 007 — domain と実 controller の確認

基準は `922db3d4404c68eeb61b2f0278f43b21da015744`、ブランチは `feat/goal-007-clear-horror-redesign`。2026-09-07、WSL の既存依存を使用した。原仕様は今回の依頼本文と現行実装で、新しいキットを前提にしていない。

## 実装順と確認済みゲート

1. root が変更前の **51 suites / 604 tests PASS** を確認してから編集した。
2. 旧 A/D/入口差替えを新版 world から外し、非常灯→B/C→各電源取得→同時接続→サービス通路→非常扉で完走させた。**敵を追加する前に domain 22件＋実 controller 両順2件、計24件 PASS（2.494秒）** を確認した。
3. その後に一体の FSM と保存イベントを追加。実 controller で棚陰に退き、巡回が通過するまで待ち、反対側から出る経路を検査した。B→C/C→B と標準/控えめの4経路に、非常灯・出口確認を後回しにする標準2経路を加えた。
4. 最後の担当検査は **3 suites / 39 tests PASS（6.808秒）**。内訳は gallery domain22、actor11、実 controller6。既存 firstPerson domain5 suites102件も前段でPASSし、旧章の条件を保持した。

実行コマンド:

```sh
npx jest --runInBand src/domain/gallery src/rendering/firstPerson/__tests__/galleryRouteController.test.ts
npx jest --runInBand src/domain/firstPerson/__tests__
npx eslint src/domain/gallery src/domain/firstPerson/runtime.ts src/domain/firstPerson/interaction.ts src/domain/firstPerson/types.ts src/domain/firstPerson/chapter.ts src/rendering/firstPerson/__tests__/galleryRouteController.test.ts
npm run typecheck
git diff --check
```

いずれも担当変更の確認時点でPASS。アプリ全体の check、iOS export、Doctor、依存・Three同一性・最終件数は [GOAL-007](GOAL-007.md) の集計を参照。

## 変えた期待値と根拠

- 新版に旧紋章・鍵の interactable、旧 gate、旧帰路 variant を要求していた2種類の走破期待を、新仕様の電源・サービス通路へ置換した。新規の `sealA=false / sealB=false / variant=entrance` のまま出口まで進むことを検査する。旧章の刺激・投影・走破検査をこの置換に含めていない。
- B は別IDの2枚が配置された時だけ「比べる」が有効。0枚の commit を誤答回数に含める旧期待を無効操作の拒否へ変更し、実際の異なる2枚を並べた誤答、置換まで残る説明、明示成功を別に検査する。
- C は同じ表示角から0/3〜3/3を計算し、3/3かつ指を離した時だけ開く。8°の許容値を変更せず、未整列時の無効操作では試行数を増やさない。中央の通常無描画、角度 wrap、中心横断、持ち直し、cancel は保持した。
- 2個接続は取得状態の再確認と同じ操作で非常灯も復旧する。先に探索した人が灯りを飛ばしても進め、接続の照明反応と同時に展示体が見える。通路の中へ進んだ瞬間に新しく表示する不整合を修正した。
- 棚陰の北出口が実移動で狭いことを検出し、東の退避 floor を `z=17` まで延長した。壁・床・描画は同じ定義を使用する。
- 敵の移動にはプレイヤーの半径を流用せず、専用の水平円半径0.44mと全高-0.04〜2.24mで床・壁・棚・閉扉を検査する。待機点を `(4.45, 0, 15.8)` に寄せ、棚際・頭高の障害・狭い床の拒否と全routeを再検査した。playerと旧章の衝突寸法は変更していない。 QAが実mesh全頂点をyaw6種×歩行3姿勢で測り、水平最大半径0.414408mを確認した。半径0.44mに約25.59mmの余白があり、新しい待機角でも実worldの壁・扉との正体積交差は0だった（[18姿勢の実測](qa-goal007/gallery/actor-envelope.json)）。
- 任意展示13のローカル右軸を壁の法線に対して正立する `-z` へ修正し、描画と当たり判定が使う同じfixtureへ反映した。

## 仕様との対応

| 依頼の検証項目 | 確認した境界 |
| --- | --- |
| 1–3 | 新版にA/Dがない。非常灯の意味状態と両順走破、先探索でも接続・脱出可能。 |
| 4–8 | Bの0/1/2と誤答案内、canonical gray/別ID、offset/swap/drop/cancel、C角度/中央背景、解決→一度だけ取得→2個の原子的接続。 |
| 9–10 | 共有 controller/lifecycle と panel fixture の接続をコード照合。renderer所有と旧紋章の離隔は別の rendering/P0検査で確認する。 |
| 11–15 | 6 waypoint、同じ world の床/壁/閉扉による edge 判定、全身の遮蔽、向き/距離/LOS、2.75秒の予兆、棚陰での巡回待ち、接触後の電源保持と安全復帰、pause/装置中の凍結・再開猶予。 |
| 16 | 標準/控えめの同じ出口条件を実 controller で走破。控えめは追尾・接触復帰を行わず、位置を保って脇へ歩く。VoiceOver/mute等のUI接続は画面・audio検査の担当範囲。 |
| 17–19 | v1途中/B/C/旧D/clearedの純粋移行、v2未知版・破損story拒否、安全pose、巡回タイマー非保存。一回イベントは意味bits、再開には新しい猶予。queue/lease/resetと字幕は storage/Screen の別検査。 |
| 20 | 新版の結果生成は旧A/Dの完了を使わない。v1 clearedは `completedFromV1` を保持し、新版の体験を捏造しない。 |

実meshの横向きQAで旧z包絡を5.42mm超える点を検出し、可視体積をx/z双方±0.52m、y=-0.04..2.24mへ拡張した。移動速度や判定を緩めず、身体が見えている間に不在イベントを誤認しないための保守的な包絡である。

不在演出は全身が一枚の遮蔽面に隠れた時に出発を許可する。中心だけが隠れる遮蔽物や単に後ろを向くことは許可条件にしない。その後は同じ展示体が実dtと衝突判定で歩き、再び見えても消さない。接触・非常扉の条件は色や主観的な見え方を参照しない。actor の意味更新は runtime 内にあり、失敗した GL frame は既存の rollback 対象、音と字幕は提示成功後に渡す。

## 確認の限界

実 controller テストは本物の Three カメラと domain の移動・衝突・FSM を使い、GL準備完了/rendererだけを代替する。敵のAIや章進行全体をmockしていない。一方、iPhone GPU表示、指の操作、初見の理解、怖さ、錯視、実聴、発熱・FPSの確認ではない。全身の実mesh包絡、画像、HUD付きviewportは [画像QA](qa-goal007/README.md) に分けて記録し、実機項目は [IPHONE_VALIDATION](IPHONE_VALIDATION.md) に残す。
