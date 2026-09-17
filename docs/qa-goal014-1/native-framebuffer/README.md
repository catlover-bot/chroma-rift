# Goal014.1 — r8 default-framebuffer 回帰

現行ソースで19ケース（10回の新規入退室を含む）を実行し、14の判定がすべて成功しました。実行時に読み込んだ127ソースとインストール済みThreeの2ファイルをSHA-256で照合し、公開時も一致を確認しています。`nativeDefaultFramebuffer.ts`、`planarMirror.ts`、`nativeGlObserver.ts` はGoal014.1で変更していません。

実行コマンド:

```bash
node scripts/qa-native-default-framebuffer.cjs \
  --out=.expo/goal014-1/native-framebuffer \
  --report=.expo/goal014-1/native-framebuffer/report.json
```

| ケース／確認 | 実結果 |
|---|---|
| adapterを外した正面・既存r7姿勢 | 反射後の復元で `BACK` を渡し、実WebGL2の `0x502` を再現。反射自体はエラーなし |
| 現行adapter | 論理的default FBOへ `COLOR_ATTACHMENT0` を渡す。全fixedケースの各段階がFBO complete／GLエラーなし |
| 正面／裏側 | 正面は反射1回。裏側は反射0回でfallback材質 |
| 主画面／提示fixture | 各ケースで主画面1回、明示的なbrowser blit1回。iOSの `endFrameEXP` ではない |
| trace有／無 | 各姿勢で出力pixel hashとrender統計が一致。traceはboundedで任意 |
| observer | 現行observerが描画中の `getError` を単独所有。成功後にtrace記録を解放 |
| 10回の新規入退室 | renderer、mirror target、fixture FBO、canvasの追跡数が毎回0へ戻る。method復元、fixture削除、dispose時GLエラーなし |
| Three資源 | scene解放後・renderer dispose前にgeometry0、renderer所有のPBR DFG LUT1枚（16×16 RG half float、1KiB）。その後rendererをdisposeしcontextを解放。これをsceneの増加とは扱わない |

traceの追加 `getError` 回数は正面とr7姿勢で17、裏側で1でした。これはbrowser APIの回数であり、Expo queueのコストやiPhoneの時間計測ではありません。

[summary.json](summary.json) は全ケースの短い一覧、[report.json](report.json) はsource hash・GL呼び出し・observer・disposeの詳細です。[run.log.gz](run.log.gz) に19ケースの実行ログを保持しました。report SHA-256: `041dc385064b20f28447048c119c29934bcd951088fa2c179a3ac0bb8e8b8b83`。既存ツールのレポート識別子 `GOAL_013_1_R8_REGRESSION_B` はテスト名として維持し、今回の実行先・生成時刻・source hashでGoal014.1の実行と識別します。

実行境界はChromium WebGL2／ANGLE SwiftShaderと、Expoのdefault FBOの意味を明示したfixtureです。現行area04の新規StageSceneを実際に構築し、現行mirror・adapter・observerを実行します。adapterを外した比較ケースは違反検出後もQAのため続行しますが、製品は提示前に失敗停止します。before／fixedの画素が同じでも、無効なGL呼び出しが安全という意味にはなりません。

このツールはスクリーンショットを保存せず、QA readbackのpixel hashを記録します。新しい画像は捏造せず、[今回の実UI画像](../player-ui/README.md)と別の証拠として扱います。iPhone GPU、native Canvasの順序、実機提示、音の実聴、長時間の実機資源利用は未確認です。`DEVICE_ACCEPTANCE=PENDING`、`RELEASE_READY=false`。
