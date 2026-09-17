# Goal 014.1 — 4種類のローカルiOS export

[bundles.json](bundles.json) に正確なコマンド、環境、bundle／map／全28音源hash、448入力の前後hash、検査結果とログを保存した。すべて成功し、全音源が各metadataのassetへ対応する。新しいmarkerが含まれ、旧Goal014 markerは含まれない。

| export | 条件 | 確認 |
|---|---|---|
| preview Hermes | NODE_ENV=production、profile=preview | HBCと全28音源の同梱。Hermes実行はしていない |
| preview JavaScript | production／preview、no-bytecode、source-maps | mappedソース225一致、Three共有、release除外 |
| production JavaScript | production／production、no-bytecode、source-maps | mappedソース225一致、Three共有、release除外 |
| development JavaScript | development／development、dev、no-bytecode、source-maps | mappedソース245一致、Three共有。実Metro loaderの1,768 factory・6順序・循環0 |

実際のminify済みbuildIdentity factoryを評価し、previewでinternal diagnosticsが有効、productionで無効になることを確認した。native Expo Constantsだけは空objectを明示代替したため、native buildは`unknown`である。EAS build ID、iPhoneでの実行、端末に入ったコード、実音声の再生成功をこのexportから推測しない。

capture時のHEAD `393e58e` と未コミット状態はそのまま記録している。448ファイルのhashは最終実装の実ファイルに対応する。記録内の `sourceInputsMatchEndCommit:false` は撮影当時に未コミットだった事実であり、後からtrueへ書き換えない。実装コミット後の照合は上位資料で別途行う。

出力は `.expo/goal014-1/exports/final/`。添付した20個の圧縮ログ・再現helperはローカル検査の証拠であり、クラウドビルドを起動するものではない。`DEVICE_ACCEPTANCE=PENDING`、`RELEASE_READY=false`。
