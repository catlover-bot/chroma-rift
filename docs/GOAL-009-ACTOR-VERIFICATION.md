# Goal 009 — 怪異の動作と新章 AI の検証

対象: `d1f7b5513da5c0909089edc30fddc8c0665dadcb` を保持する `feat/goal-009-uncanny-vault`。旧章の進行・保存・危険設定と、新章の危険設定を分離した。

## 実装の順序と所有

1. 親担当の開始時 `npm run check` は 64 suites / 782 tests、iOS export を含め成功、Doctor は 21/21。
2. Phase A で共有 `src/domain/actorMotion/` を導入し、既存 `GalleryActor` を実位置・実頭部方向・接地 anchors へ接続した。既存 gallery のフェーズ条件・速度値・接触条件は新章の値へ変更していない。
3. 共有動作の数値検査後、実コンポーネント・同一資源の 30 秒動画を生成。撮影担当が最終動画からの時間順画像を開き、全 900 フレームの実メッシュ検査を記録した。これを Phase A の gate とした。
4. Phase B の二装置と任意目地の実描画・不変条件が成功してから、新章の controller/world/AI を統合した。
5. 新章の両通路を実 controller で完走後、元の例外を既存 native failure owner へ返す `GalleryActor.onFrameError` guard を追加した。Phase A 動画との後続 renderer 差分はこの例外伝播であり、動作計算・形状の差ではない。

実行の参照順序:

- `runtimeController` が実際に衝突解決した player 移動と、その距離から game noise を生成する。音量設定やスピーカーの再生成功は noise を決めない。
- `vault/actor.ts` が実頭部の eye/LOS と新しい noise を観測し、`lastSeen` / `lastHeard`、フェーズ、移動意図を決める。
- `actorMotion/locomotion.ts` の一つの owner が実 root 位置・yaw・速度・足の world anchor を更新する。実 world の床・棚・扉と actor 半径 0.44 m で移動を拒否する。
- `actorMotion/pose.ts` が同じ motion から頭・胸・骨盤・脚・腕を算出する。`GalleryActor` は変換を表示し、root を別途動かさない。LOS の眼位置と向きもこの姿勢を参照する。
- 接地は一意な `footPlants` として返す。controller は成功した presentation 後だけ音へ渡す。native speculative frame の失敗時は motion、noise 累積/sequence、semantic story を含む runtime が rollback される（native 側の検査は親担当）。

## Authoring 値と測定

数値はゲームの調整値であり、人の運動・恐怖・知覚の測定値ではない。

| 項目 | 実装 / 検査 |
| --- | --- |
| body 角速度 / 角加速度 | 最大 120°/s / 480°/s²。両方向 180°と ±π 境界を検査 |
| head / chest / pelvis | 頭の局所 yaw ±58°、pitch ±18°、胸 yaw ±24°。胸遅れ 0.16 s、骨盤遅れ 0.30 s |
| 踏み出し / 減速 | 予備動作 0.24 s、加速度 2.8 m/s²、減速度 4.2 m/s² |
| 時間積分 | 120 Hz 固定 step。30/60/120 Hz と可変 delta で同じ経路・接地 sequence・足 anchor |
| 新章速度 | patrol 0.72、investigate 1.0、search 0.62、pursue 2.35 m/s |
| 実 world の追跡速度 | 西通路の追跡で安定区間 2.35000 m/s。player 最大 2.15 m/s を上回る実移動を確認 |
| 新章視認 | 実眼方向の半角 52°、距離 6.4 m、0.45 s の認知蓄積、実 opaque LOS |
| 新章聴覚 | 距離上限 7 m、強度閾値 0.22、遮蔽 gain 0.28。背後の速歩 .8 と徐行 .1 を区別 |
| 攻撃 | notice 0.65 s、windup 0.75 s、固定 target の attack 0.42 s、recover 0.95 s、接触距離 0.68 m |
| 復帰 | cold resume / 接触復旧は 3 s grace。同 session pause は記憶・タイマーを凍結し、復帰で grace を再発行しない |
| 捜索 | 最後に観測した到達可能位置へ移動した後、4.2 s で三方向を確認し return。移動時間で捜索時間を使い切らない |

Phase A の実描画 900 フレームでは、最小 y = 0、最大水平半径 0.391323 m、接地中の実足底四隅の最大移動は約 1.41×10⁻¹⁶ m、実頭方向と LOS eye の誤差は約 7.21×10⁻¹⁶。移動中停止の root 移動は 0.01925 m。動画・source hash・条件・撮影の不足修正は [QA 記録](qa-goal009/README.md) を参照する。これは新章の全 gait・本番通路の全姿勢を検査済みという意味ではなく、後続の統合 QA と区別する。

## 新章の対処可能性と修正

`vault/actor.ts` の 12 waypoint と実 world の 13 graph edge を検査。初回の実格子は、spawnから実collision移動で到達する (-0.3, 1.6, 3) から固定 actor の眼 (2.4, 1.95, 8.485) へ視線を向けると透過し、胴・足は奥の低い隔壁で隠れる。4つの格子隙間は閉状態でplayer通過を拒否し、開状態では同じ座標から通過する。覗いただけで新しい予告や進行フラグを立てない。中央棚の両側は通行でき、閉じた二つの通路扉と最終扉を越えない。制動ベイの 0.70 m の実 grille は player が通れ、0.88 m 幅の actor footprint は通れない。扉の向こう、制動ベイ内、最終安全域では攻撃が成立しない。

西の標準経路では、実 controller で `notice → pursue → 実棚で LOS 遮断 → search` を経て制動ベイへ到達した。さらにその実安全域で、最後の観測位置への移動・三方向捜索・`return` まで待っても捕捉されないことを検査した。敵の AI を途中で差し替えたり、進行/位置を成功状態へ直接書き換えていない。

東の最短導線で actor 正面へ走ると捕捉された。隔壁外側の x=4.2 経由で中央棚の東側へ入り、実際の身体を避ける経路にした。西/東とも標準と控えめ、音無効、補助の有無、制動ベイからの cold resume を含む 6 通し条件が成功した。これは初見の人が経路を理解することや恐怖の強さの測定ではない。

追加で検査中に見つけた不足:

- 聞こえない足音も新しい sequence は消費する。同じ古いイベントを後から強い音として再観測させない。`lastHeard` は受理した音源だけを保持する。
- 捜索の停止時間を移動時間から分離した。遠い `lastSeen` に到達する前に return しない。
- 至近距離の player が控えめ actor の通過を止めた場合、離れる方向まで一律拒否して二者が詰まる不足を補完した。静的衝突を確認した短い離隔歩行を行い、接近禁止を保持する。これは足元の衝突回避であり、隠れた相手の観測記憶を更新しない。

## 実行結果とテストの意味

担当追加分の最終実行:

```sh
npm test -- --runInBand src/rendering/firstPerson/__tests__/actorFrameBoundary.test.tsx src/domain/vault/__tests__/actor.test.ts src/rendering/firstPerson/__tests__/vaultRouteController.test.ts
# 3 suites / 26 tests PASS (8.222 s)
npm run typecheck
npx eslint src/rendering/firstPerson/GalleryActor.tsx src/rendering/firstPerson/GalleryScene.tsx src/rendering/firstPerson/__tests__/actorFrameBoundary.test.tsx src/rendering/firstPerson/__tests__/vaultRouteController.test.ts src/domain/vault/actor.ts src/domain/vault/types.ts src/domain/vault/__tests__/actor.test.ts --max-warnings 0
git diff --check
# PASS
```

26 件は、新 AI 17 件、実 controller 7 件、actor の frame 例外境界 2 件。Phase A の共有 motion 12 件とは別であり、アプリ全体の最終テスト数でもない。

- 新 AI: 実眼と希望向きの分離、有限認知、音の閾値/遮蔽/sequence、観測記憶、捜索、実速度、予告後の固定 target 攻撃、横回避、接触一度、旧進行保持、安全復帰、pause、控えめ、immutable rollback を検査。
- controller: 二つの装置を実画面投影から直接 drag → release → 明示 commit。途中 commit の拒否、同操作の重複解放拒否、実 collision 移動、保存再開、本人の向き直りでのみ最終取っ手を操作。閉扉の成功は即確定して非同期保存を要求し、world の描画/衝突は 0.25 s で閉鎖、1.4 s の余韻が進行条件にならない。cold clear は最初から閉鎖。
- 既存 gallery crossing の検査は、最初の 0.05 s の即移動期待を『root は予備動作中、頭は先行』へ変更し、その後の連続距離・到達位置・提示保持を検査した。共有動作の仕様変更に対応するもので、移動を検査しない変更ではない。
- 旧章の最終閉扉は Goal009 §8.2 に合わせ、不可視の扉を押す旧期待を本人が実扉へ向いて押す操作へ変更した（親担当）。

実 WebGL と native lifecycle の全体結果は主 Goal009 / QA 記録に集約する。この文書の Jest は実 controller・実 Three camera・実 world geometry を使うが、GPU ready の成功境界を mock する。実機の指操作、EXGL/Metal の表示、音の実聴、錯視の成立、恐怖/自然さ、実機 FPS は別途 iPhone 受け入れが必要。

## 最終の独立境界レビュー

`App.tsx`、`FirstPersonScreen.tsx`、`firstPersonStorage.ts`、`app/state.ts`、`chapterSummary.ts` を読み取り専用で照合した。captured session lease と chapterId、journeyRun と章別summary条件、未知版の保存停止、復旧原文backup先行、新章キーだけの明示reset、結果の新規down/up、同session pauseの観測記憶維持、native失敗時のruntime rollbackとpublish抑止を確認した。このレビュー範囲で重大な保存破壊や章ID混同は見つからなかった。新しいテストを実行した結果や実機確認とは区別する。
