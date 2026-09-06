# Architecture — Goal 005

## 通常本編と紋章

通常フローは welcome → 初回quickSetup（3回答／スキップ）→ playInstructions → firstPerson → firstPersonResult。旧2.5D迷宮・詳細調整は保持する。

- domain/emblem：プレビュー同梱coreを型付き移植した輪郭・sRGB画素・意味イベントreducer。画素ペアとマスクを種／表示／解像度で上限付きキャッシュ。
- domain/firstPerson：既存の衝突・鍵投影・帰路遮蔽証明に紋章を統合。共有emblemFixtureがメッシュと照準矩形を定義。sealAとemblem checkpointは一つのruntime更新で確定。
- rendering/firstPerson/runtimeController：一つのJSシミュレーション。描画完了・foreground・pause・現在のカメラを検査し、セッションID＋単調連番を確認してからhost側でtargetIdを作る。停止中に拒否したpacketも再利用できない。
- rendering/firstPerson/emblemSurface：canonical threeの不透明DataTextureと白いMeshBasicMaterial。色／無彩色／静的ガイドはmapだけを交換する。所有するtexture/materialをscene寿命で一度disposeし、frameごとの再生成はしない。
- screens/QuickSetupScreen：同じgetSealRasterPairのtop-down RGBAをSkiaへ渡す。ThreeはbottomUpRGBAで行を反転する。ネイティブSkia/GLの見た目の一致は実機確認待ち。
- storage/firstPersonStorage：既存leaseと直列キューで新旧章保存を扱い、旧原文の一度だけのバックアップ、未知版の書込停止、reset世代を保つ。

新quick結果だけschemaVersion2／stimulusVersion1／kind=emblemのspecを保存する。旧quick schemaVersion1／stimulusVersion2や詳細調整の刺激版は書き換えない。settings.emblemPaletteは任意項目でbaselineが既定。旧effectStrengthは旧コンテンツ用に保持する。

通常の照準は大きな板の実ray-plane交点、印／普通の対象は元の6°範囲を使う。可視端の判定を板の中心が画面外という理由だけで拒否しない。VoiceOverの対象選択は可視・距離・遮蔽を再検査し、鍵の正解判定には接続しない。

Native Canvas／renderer／contextの所有、実renderとendFrameEXP返却後のready、foreground時間の初期化期限、診断・最大2回の手動再試行を維持する。詳細は[FIRST_PERSON_CHAPTER](FIRST_PERSON_CHAPTER.md)と[GOAL-005](GOAL-005.md)。

## 旧2.5Dコンテンツ（保持）

## フローと責務

```text
welcome → quickSetup（初回のみ・スキップ可）→ playInstructions
        → illusionMaze 1 → illusionMaze 2 → journeyResult
settings → quickSetup | calibrationInstructions → calibration → calibrationResult
settings → developerLab | microMaze → stageResult（開発時のみ）
```

アプリの画面と設定は `src/app/state.ts`、一区間の移動は `src/domain/illusion/state.ts` が管理します。新しいゲームは旧 `targetSequenceForProfile` を参照しません。通常の隣接関係はレベルの無向グラフです。

- `domain/calibration`：3回答の暫定設定と、別系統の詳細12問分類。
- `domain/illusion`：世界座標、手作りレベル、投影、面の可視性、当たり判定、移動、取得、接続、勝利、全状態の到達可能性。
- `rendering/IllusionMazeCanvas.tsx`：投影済み面と模様、かけら、出口、オリジナルの白いキャラクター。Skiaの既存プリミティブのみ。
- `screens/IllusionMazeScreen.tsx`：タップ受付、離散カメラ、一時停止、補助表示、移動先一覧、VoiceOver。
- `storage/applicationStorage.ts`：実行時検証、v1移行、直列化した保存、書き込み世代付きリセット。

## 2.5Dとふたつの迷宮

世界Y軸が高さです。2つの固定行列で斜め見下ろし投影を計算し、画面幅と高さに収めます。回転中の不定な姿勢は作らず、停止姿勢をボタンで即時に切り替えます。移動中はカメラ操作を無効化します。

「浮遊回廊」は16ノード。下の再合流ループ、かけらのある戻れる小部屋、階段、上の見晴らし台、上下に重なる橋、出口があります。「つながらない橋」は13ノードの離れた2島。高い島と低い島でかけらを集めます。

橋の特殊エッジはcamera Bのみ有効です。別の3D座標にある橋端の投影が一致することと、エッジの有効条件を同じ固定カメラで検証します。演出は出発床→出発端→同じ画面位置の到着端→到着床。世界の空白上に通常床がある扱いにはしません。

色奥行き観察パネルの赤青は同じ平面に置きます。床の高さ・側面・階段の遮蔽は普通の幾何学です。色プロフィールは模様の配色にのみ使い、移動や勝利条件は変更しません。

## 描画順とタップ

床の上面、カメラ側に向いた側面、階段の各踏面を生成します。投影面の重なる領域で同じ画面点の深度を比較し、前後の依存順で描画します。自動Zバッファはありません。対象はこの小さな固定2ステージだけで、任意の交差ポリゴンや自由視点エンジンではありません。

タップは描画と同じ投影面を使います。直接当たる最前面の床を優先し、側面や選べない手前の床を透過して選びません。何も描かれていない付近の拡張領域は、可視面のサンプルとの距離、前後、安定したID順で決めます。画面外や非有限座標は拒否します。HUDはキャンバス外です。

床自体が小さい場所や隠れた通路では、44pt以上の「移動先」ボタンから隣接する床名で選べます。VoiceOverの候補も現在有効なエッジから生成します。

通常はヘッダーと下部操作以外を可変キャンバスに充てます。小画面（高さ600pt未満）または文字倍率1.5以上では、キャンバスを230pt以上に保ったスクロール配置に切り替え、操作を見切れさせないことを優先します。浮遊回廊の橋の下は上面に隠れるため、その任意の回り道は「移動先」も使って進めます。

## 移動と競合

移動は400ms、特殊接続は700ms、減動時は100msの最小遷移です。Reanimatedのshared valueで位置と歩行を更新し、フレームごとのReact更新はありません。常時アニメーションループはありません。

入力直後に同期refと純粋reducerで移動を確定し、React描画前の連打も拒否します。完了はsession/tokenが一致する場合のみ受理。中断は最後に着地した床へ戻し、未完了の取得は行いません。復帰には再開操作が必要です。リプレイは世代を進め、画面を離れた古いコールバックを無効化します。アプリのステージ完了にもjourneyRunを使います。

## 色をほどく

色模様のみを、sRGBを線形化 → Y = 0.2126R + 0.7152G + 0.0722B → sRGBへ再符号化してRGB同値に変換します。床、位置、カメラ、影、遮蔽、接続、かけらは同じです。端末上の等輝度や錯視の消失を保証する変換ではありません。明示的な往復操作のみで、クリア後も比較できます。

## 調整の版と保存

簡易結果 `QuickSetupResult` は詳細プロフィールと別型です。3回答だけを受け取り、同じ色2件以上かつ反対色0件の場合だけ暫定色を採用します。それ以外は未確定として補助表示を提案します。強度や信頼度は生成しません。補助表示の明示的な選択を自動で変更しません。

詳細12条件は保ち、同じ図形が連続しないシード付き順序にします。交差線は両方向に対称な空隙を設け、上描きの遮蔽を除きます。新しい刺激・回答に `stimulusVersion: 2` を記録。版がない旧回答はそのまま保持し、新版への回答に書き換えません。詳細分類器・背景別集計は継続します。

v2キーは `chroma-rift.application.v2`、旧キーは `chroma-rift.application.v1`。v2がなければv1を検証してコピーし、書き込み後もv1を削除しません。設定、プロフィール、詳細セッション、旧ベストスコアを保持します。再調整時の既存詳細セッションは `calibrationHistory` に残します。

`activeSetupSource` で直近に完了した簡易／詳細調整を表示に採用します。未指定の旧データでは保存済み詳細を優先します。v1では補助表示が明示選択だったか分からないため、選択済みとして保守的に保持します。

不正JSON、未知の版、整合しない試行／回答は元データを保持し、その起動中の自動保存を止めます。保存失敗は通知してメモリ内の操作を継続します。リセットは確認後に両キーを削除し、待機中の旧保存を世代で無効化。処理中の設定操作を止めます。新しいゲームにランキングはありません。途中の迷路位置は永続化せず、アプリの再起動後はホームから遊び直します。
