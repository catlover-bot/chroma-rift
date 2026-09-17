# Goal 014.1 — 全体検査と実App音声経路

最終の `npm run check` は **134 suites / 1,327 tests、lint、typecheck、iOS exportが成功**。開始時は126 suites / 1,286 tests。最終実行は2026-09-17 10:46:52 UTCに終了し、全体392.681秒、Jest318.387秒、iOS exportは1,618 modules / 31 assetsだった。

[check-attempt-01.json](check-attempt-01.json) は実行中の530ファイルのhashと前後不変を記録する。capture時のHEADは開始コミット `393e58e` だが、未コミットの修正を含む実際のファイルhashを保存している。音声修正 `e2af6eb` と画面・文言・App回帰 `6186a5e` のコミット後も、その530ファイルと一致する。後から追加した比較・再開動画のQAツールはこの全体checkの対象に含めず、各実行記録で別途検査する。

生ログは [check-attempt-01.log.gz](check-attempt-01.log.gz)。既存のThree.Clock、React test renderer、import-order、色環境の警告を残した。`manifest.json` の `uncompressedSha256` は展開後の元ログhashで、gzip自身のhashとは区別する。

## 実Appの音声経路

[app-audio.json.gz](app-audio.json.gz) は全体check内の実App回帰が出力した記録。実App、Gate、Screen、controller、owner、director、backend、共有sessionを実行し、GL提示成功とexpo-audio native APIを明示したfixtureで代替する。自然な01〜05の完了、実際に生成した02〜05保存の再開、pause／設定／ノート／音off-on／背景復帰／経路切断、振り返りから本編へ戻る経路を通す。合計19回のScreen入場、214.134秒のsimulationを記録し、最後にowner・player・subscription・lease・pending operation・画面音楽のRAF・AppState購読が0へ戻る。

gateの完了callbackを直接呼ばず、Screen自身のcheckpoint／完了処理からAppが進む。ホームは54秒の曲終端を越える。ループや遅延非同期の詳しい制御は[音声focused検査](../audio/verification.json)も参照。契約fakeのplayingと時刻進行は、AVFoundationの実行やiPhoneで聞こえた証明ではない。

## 環境と保護

- [environment.json](environment.json): `npm ls`成功。Expo依存検査とDoctorはExpo 57.0.22→~57.0.23のパッチ推奨で未合格。Doctor **20/21**。
- [audit.log.gz](audit.log.gz): `npm audit`は**moderate 11 / high 0 / critical 0**で非zero。依存変更・強制修復はしていない。
- [runtime-cycles.json.gz](runtime-cycles.json.gz): iOS／Android／neutralとも253 production modules、764 edges、循環0、解析エラー0。
- [asset-preservation.json](asset-preservation.json): 既存assets42ファイルは開始時と一致。6保護ファイルも一致。従来音・知覚音・施設掲示・行先掲示の生成器 `--check` が成功。
- 4種類のexportの全28音源と実bundle照合は[別のexport記録](../exports/bundles.json)。

## 途中の結果

`history-*` と `domain-*` には失敗を含む途中の検査を保存した。`history-screen-recovery-order-red.log.gz` は修復前のScreen再開順序で実際に失敗した回帰。その他のApp初期実行には、fixtureがclosing tailを処理しなかった問題、実測前の経過秒期待、buildキー名の誤り、helper移動中のmodule参照、ホームへ戻る途中画面の押下漏れがある。これらを製品不具合の再現と混同しない。`domain-screen-native-before.log.gz` の旧ラベル不一致は日本語化後の期待値更新前であり、同じ挙動・資源・失敗保存のassertを保持した後の成功ログも残す。

すべてローカル検査。`DEVICE_ACCEPTANCE=PENDING`、`RELEASE_READY=false`。
