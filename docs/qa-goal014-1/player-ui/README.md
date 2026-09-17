# Goal014.1 通常UI・サポート表示

実際の `ChapterOneHomeScreen`、`SettingsScreen`、`SupportInformation` をReact hostで開き、日本語ボタンのcallbackを通して取得した画面です。nativeスタイルをChromiumのCSSに写して確認しました。障害レコードは明示した `QA_FIXTURE` で、iPhoneの故障記録や音の実聴ではありません。

`DEVICE_ACCEPTANCE=PENDING`、`RELEASE_READY=false`。

| 確認 | 結果 |
|---|---|
| 条件 | preview / production、両方 `__DEV__=false` |
| 幅・文字 | 320×568 / fontScale 2、390×844 / fontScale 1 |
| 状態 | ホーム、移行元読込不可、設定、音の利用不可、サポート閉／開／コピー後／再び閉 |
| ケース | 32 |
| 保存画像 | 26 |
| 測定したText | 1,840 |
| 個別ボタンのスクロール・境界確認 | 928、最小可視高さ50px |
| 横方向のスクロール・ボタン外の文字 | 最終実行では検出なし |
| ソースガード | 読み込んだ55ソース＋7ツール／設定ファイルを実行前後と公開時にSHA-256照合 |

[通常ホーム](preview-home-320-top.png)、[長い設定名の折り返し](preview-settings-320-controls.png)、[通常設定の末尾](preview-settings-320-bottom.png)、[閉じたサポート](preview-support-closed-320-support.png)、[明示的に開いた操作](preview-support-open-320-support.png)、[preview識別子](preview-support-open-320-record.png)、[production識別子](production-support-open-320-record.png)。いずれも小幅・文字2倍です。

## 修正と測定の区別

共通ボタンに親幅までの `maxWidth: '100%'` を追加しました。設定の「上下の感度：控えめ」は、幅322pxから親内の231pxになり、高さ72pxから118pxへ折り返しました。設定画面の横スクロール幅は359pxから305px（表示領域と一致）になりました。名前を短縮せず、同じ設定値を変更します。

最初の測定にはCSS helperの問題もありました。明示されていないline-heightを1.2にする旧近似は、React Nativeの固有フォント行高を表さないため、新しい確認ツールではCSSの `normal` としました。明示された数値line-heightは従来どおり文字倍率で拡大します。また、CSSで行末に張り出す空白は字形ではないため除外し、非空白文字の範囲を測定します。ボタン内の文字はボタン全体の境界でも確認します。12件の「表示A（選択中）」の文字ボックスからの張り出しは、ボタン内に収まることを確認し、削除せず `buttonTextOverhangs` に残しています。

この手法はYoga、iOSのフォント測定、実機safe-area、VoiceOverフォーカス、ネイティブSwitchの描画を再現しません。Switchは幅51×高さ31の明示した近似枠を置き、その隣の文章を測ります。画面途中の画像に上下へ続く文章があるのはScrollViewの表示位置です。すべてのボタンを個別に表示領域へ移動して確認しています。

## 回帰と記録

- 最初のUI回帰3件は、旧ホームの常設markerとpreview/productionへの開発用ボタン露出で失敗しました。修正後は詳細を手動で開くまで診断Textをマウントしません。
- 所有範囲の8スイート67件は成功。その後の1行の幅修正と新しい操作回帰を含む `galleryMenus` 10件も成功しました。全体の最終件数は上位のGoal014.1検証記録を参照してください。
- static／rendered監査、native gateの実際のmount失敗、GLキー互換性、productionの要約、音オフ／全音量0、実Appの再試行上限→ホーム→設定→詳細による障害保持を確認しています。
- lintとtypecheckは成功。React hostの実行では既存 `react-test-renderer` の非推奨警告が出ており、ログに残しています。
- 最初の失敗、途中の古い期待値／テストimportの修正、CSS近似の修正を含むログを `.log.gz` として保持しています。成功するまでの経過を最終実行へ混ぜず、[manifest.json](manifest.json) の `phase` に区分しました。

実行:

```bash
node scripts/qa-player-support-layout.cjs
```

[report.json](report.json) は全32ケースの測定値とソースhashを含みます。SHA-256: `ce1780930d5faa3d2e0995545d7771957de864725ad910a2dc1a52efb36831e3`。[manifest.json](manifest.json) は画像・ログの長さとhashを記録します。
