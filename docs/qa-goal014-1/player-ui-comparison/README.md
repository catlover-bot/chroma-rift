# 通常画面の変更前後

左は基準 `393e58e`、右は今回の変更後。同じ画面幅・文字倍率・設定状態で、実際のホーム/設定コンポーネントを描画した。両側ともソース上の `__DEV__=false`、profile=preview。サポートと詳しい情報は閉じている。

|比較対象|幅320・文字2倍|幅390・文字1倍|
|---|---|---|
|ホームのコード表示を通常画面から除外|[比較](home-title-320-font2.png)|[比較](home-title-390-font1.png)|
|「ハプティクス」→「振動」|[比較](settings-vibration-320-font2.png)|[比較](settings-vibration-390-font1.png)|
|「サウンド」→「音」|[比較](settings-audio-320-font2.png)|[比較](settings-audio-390-font1.png)|
|音声module欠落時の通常案内|[比較](settings-missing-native-failure-320-font2.png)|[比較](settings-missing-native-failure-390-font1.png)|

基準側は51個のfirst-party依存を含め、すべて当該コミットのgit blobから分離したmodule cacheへ読み込んだ。現在側は55個の実ソースmoduleを読み込み、ソース・資産・設定・使用QAツール450入力の前後一致を確認した。元のLayout/buildIdentityへ現在のコードを混ぜていない。

各画像は同じ意味の見出し/項目をScrollView内で見せたもの。スクロール量と対象の境界を[report.json](report.json)に記録。旧ホームのcode/preview/iOS build unknown/release-js全文と、変更後に通常画面から消えたことを確認した。8画像すべてを目視確認。旧版の文字拡大設定では既存の横はみ出しもそのまま残している。

これはブラウザーCSSによるソフトウェア表示比較で、native Yoga、iPhoneのフォントやsafe-area、VoiceOver、実Appの画面遷移、実音声ではない。Switchは51×31の近似表示、native Constantsは空のfixtureなのでbuildはunknown。最後の行は両側に同じmissing-native状態を与えた条件付きメッセージの比較で、端末の故障を観測したものではない。画像上部の変更前/後ラベルはQA用で、通常UIの一部ではない。

[verification.json](verification.json)に実行コマンド・hash・圧縮ログを保存。lintとcaptureはexit0。最初のcaptureも成功したが、未使用のQA global宣言のlint警告を除いてから再実行し、8画像のバイト一致を確認した。React test rendererの既知の非推奨警告はcaptureログへ保持し、ブラウザー例外は0。

再実行: `node scripts/qa-player-ui-comparison.cjs`。中間データは `.expo/goal014-1/player-ui-comparison`。新しい端末用previewでの表示・聴取確認は別途必要。
