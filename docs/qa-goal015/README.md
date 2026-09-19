# Goal015 検証記録

**LOCAL_RENAME_AND_CHECKS=PASS。** 2026-09-19、Linux／Node24.20.0／npm11.19.0。ローカルの改名・機能回帰・原稿検査を完了した。Doctorとauditは未合格として別記する。署名済みproduction、実機受入、公開情報の正式承認は未完了。

開始HEADは `0563e2d4bb76280fba2643078aa619e166bf8009`、開始時clean。worktreeは `/home/mhirotaka/workspace/chroma-rift-goal012`、branchは `release/goal-015-japanese-app-store`。当時の142 suites／1,472 testsという報告は履歴であり、以下は今回の実行結果。実装前の全体テストを再実行したという意味ではない。

## 今回の実測

| 検査 | 実際の結果 | 記録 |
|---|---|---|
| 初期typecheck／改名箇所lint | exit0 | [final](final/retained-artifacts.json) |
| 名称・任意サポートのfocused Jest | 2 suites／12 tests PASS | [rename-focused.txt](final/rename-focused.txt) |
| 最終 `npm run check` | **exit0、142 suites／1,472 tests、失敗0**。lint→typecheck→全Jest→iOS export | [summary.json](final/summary.json)、[全ログgzip](final/check.txt.gz) |
| checkの実行時間・ソース照合 | 全体557.347秒、Jest481.697秒。541ファイル、前後一致。全体実行は1回 | [check-result.json](final/check-result.json)、[前](final/check-source-before.json.gz)／[後](final/check-source-after.json.gz) |
| 04 controller退避行列 | 81ケース。反応遅れ0.75秒:27/27完了・捕捉0、1.25秒:27/27・0、1.75秒:26/27・捕捉1 | [fairness.json.gz](final/fairness.json.gz) |
| 04実画面の入力・格子・復帰 | 7/7 PASS。標準／控えめ、直進、退避、左指保持、捕捉、格子通過後捕捉、lifecycle | [screen-routes.json.gz](final/screen-routes.json.gz) |
| 循環依存 | iOS／Android／neutral各254 production files・776 runtime edges・循環0 | [runtime](runtime/README.md) |
| 実Metro dev／release | 8コマンドexit0。Three各1、first-partyソース照合246／226、直接入口6VMケースPASS | [runtime/summary.json](runtime/summary.json) |
| production環境を明示した追加export | export／Three／sources／releaseの4コマンドexit0。1,626 sources、5エリア・31 assets、開発画面／probe／dev-client JSなし | [結果](final/production-profile/results.json)、[release.txt](final/production-profile/release.txt) |
| 名前・読み・profile markerの実bundle | AST文字列とmapで錯視館／さくしかん／goal-015-sakushikan-r1を確認。uuid／xcodeソース0 | [bundle-audit.json](final/production-profile/bundle-audit.json) |
| r8 GL回帰 | 実software WebGL／Three／現鏡scene、19ケース・14判定PASS、10回新規入場 | [runtime](runtime/README.md) |
| 全5エリアaudio | 実controller／campaign／owner、5エリア完了。route155.117秒、5,997イベント、最大12players・終了時0 | [runtime](runtime/README.md) |
| 表示・名前・ボタン | 36状態、48 UI PNG、1,434文字測定／702ボタン、はみ出し0 | [brand-layout](brand-layout/README.md) |
| icon／splash | 既存図形を保持、iOS派生1024角RGB・不透明・元画素一致 | [評価](BRANDING-ASSESSMENT.md) |
| CNG／識別子／保存 | 名前・ja生成値、app.json許可3パス、保護5ファイルbyte一致、保存等48ファイルbyte一致 | [identity.json](identity.json) |
| ストア／日英notes | 現行制限内、内容・hash確認 | [metadata-validation.json](../release/metadata-validation.json) |
| 公開ページ | 4レイアウトPASS、15不正endpoint拒否、未承認で公開用生成を拒否 | [page-checks](public-pages/page-checks.json)、[builder-checks](public-pages/builder-checks.json) |
| npm ls | depth0 exit0 | [environment](environment/results.json) |
| Doctor／Expo check | **exit1**、Doctor20/21、互換パッチ推奨3件 | [doctor.txt](environment/doctor.txt.gz)、[expo-install-check.txt](environment/expo-install-check.txt) |
| npm audit | **exit1**、11 moderate、0 high、0 critical | [audit.txt](environment/audit.txt)、[uuid依存経路](environment/uuid-path.json) |

04行列の1.75秒で捕捉した1ケースを成功へ数え直していない。これは遅い反応を含む既存テストの観測で、全81ケース無捕捉という主張はしない。人の実反応・音の聞こえやすさ・iPhone FPSを測った値でもない。Jestの保存／writer競合、audio owner・遷移、native lifecycle、同梱音源・素材・出典検査は既存の142 suitesに含む。

Doctorの現在の推奨はexpo57.0.22→~57.0.24、expo-asset57.0.17→~57.0.18、expo-constants57.0.18→~57.0.19。依存更新はしていない。uuidアドバイザリの利用経路・自動修正のmajor変更・残余リスクは [Goal015](../GOAL-015.md) に記録した。Clock等の警告はログに保持し、一括抑制していない。

## 失敗履歴と測定限界

全体checkは初回で合格し、単独でだけ通った製品テストはない。次のQA側の失敗は別に残した。

1. レイアウトQAの初回は、デスクトップの15pxスクロールバーがiOS相当より文字領域を狭めた。overlay幅へQA CSSを修正し、同じ厳格な判定で全36状態を再実行した。[失敗ログ](brand-layout/history/classic-scrollbar-failure.log)と[初期スクリプト](brand-layout/history/initial-script.cjs.txt)を保持した。製品・文字列・判定許容値は変更していない。
2. production環境の追加export後、単純なUTF-8部分一致が日本語のUnicodeエスケープを見落とし、追加brand auditがexit1になった。[初回値](final/production-profile/initial-bundle-audit.json)を保持した。同じbundleをJavaScript ASTで解析し、文字列値とmapのapp.jsonを確認してPASS。exportの再生成や製品修正は不要だった。
3. 公開ページの未承認JSONによる生成exit1は、偽の公開情報を出さないための期待した拒否。[記録](public-pages/public-build-expected-failure.txt)。公開・到達確認を実施したという意味ではない。

ブラウザーの画面QAは実コンポーネントをCSSへ橋渡ししたもの。GLはsoftware WebGLの実描画、audioは成功presentationと即時seekを模擬した実ownerのイベント検査。native Yoga、iPhone GPU／表示／触覚、VoiceOver発声、実聴、実機FPS／発熱、署名／実IPAのmanifestを証明しない。今回の画像はストア提出用の実機スクリーンショットではない。

## 再実行の入口

リポジトリのルートで実行する。生成ログのコマンド・引数は各resultsにも保持した。

```sh
npm run check
node scripts/check-runtime-cycles.cjs --report .expo/goal015/recheck-cycles.json
EXPO_PUBLIC_CHROMA_BUILD_PROFILE=production npx expo config --type introspect --json > .expo/goal015/recheck-introspect.json
node scripts/validate-release-identity.cjs --introspection=.expo/goal015/recheck-introspect.json
node scripts/qa-goal015-brand-layout.cjs
node scripts/qa-native-default-framebuffer.cjs --out=.expo/goal015/recheck-framebuffer --report=.expo/goal015/recheck-framebuffer.json
node scripts/qa-chapter-audio.cjs --out=.expo/goal015/recheck-audio
```

identity検査のデフォルト基準はGoal015開始SHA。将来、承認済みascAppId等を設定した場合は許容差分と記録を明示更新し、その正当な変更を黙って除外しない。既存QAは出力先を指定して過去の証拠を上書きしない。

## ローカルコミットと証拠の対応

- `0720141` — 日本語製品名、最小config/UI、読み、名称・互換／表示検査。
- `83d846e` — ストア・日英審査原稿、公開原稿・静的ソース、READMEと過去文書への案内。
- このQA記録を含む最終コミット — 検証ログ・差分・引き渡し。SHAは `git log -3 --oneline` で取得する。自身のSHAを本文へ循環埋め込みしない。

各生成レポート内のHEADは当時の基準SHAであり、未コミットだった候補全体の識別子ではない。実行したbyteはsource hashで示す。最終check後、コードコミットと原稿コミットを終えた時点でも541ファイルの一致を確認した。[final/summary.json](final/summary.json)。最終コミット後も同じ照合とclean状態を確認して引き渡す。

大きいログ・JSONは元byteを変えずgzip化した。[保持対応表](final/retained-artifacts.json)は元／保存物双方のhashを記録する。[全証拠manifest](manifest.json)は自身を除くQAファイル、主要報告文書・設定・スクリプトのhashを記録する。元bundle/mapは `.expo/goal015/final` にローカル保持し、巨大なnode_modulesやbundleをGitへ複製しない。

```text
LOCAL_RENAME_AND_CHECKS = PASS
NAME_AND_METADATA_APPROVAL = PENDING
PUBLIC_POLICY_AND_SUPPORT = PENDING
FINAL_SCREENSHOTS = PENDING
PRODUCTION_BUILD = NOT_RUN
ASC_UPLOAD = NOT_RUN
PRODUCTION_DEVICE_ACCEPTANCE = PENDING
APP_REVIEW_READY = false
APP_REVIEW_SUBMITTED = false
RELEASE_READY = false
```

公開情報は [一括確認票](../release/owner-confirmation.md)、build／特定IDのsubmit／同一buildのTestFlight／審査は [提出手順](../release/submission-checklist.md)、実機項目は [iPhone確認](../IPHONE_VALIDATION.md) を使う。push、PR、EAS/Apple認証、cloud build、ASC登録/upload/申告/審査、ページ公開は実行していない。
