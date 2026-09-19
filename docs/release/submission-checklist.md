# 錯視館 — 初回提出の引き渡し

2026-09-19に作成、2026-09-20に公開ページの完了を反映。所有者の承認を受け、GitHub Pages公開とアプリ内リンクの接続を実施しました。EAS productionビルド、ASCアップロード、実機受入、審査申請は未実施です。この文書にある今後のビルド・提出コマンドは手順であり、今回のページ公開承認には含まれません。

## 現在の状態

| 状態 | 値／根拠 |
| --- | --- |
| LOCAL_RENAME_AND_CHECKS | PASS（2026-09-19の改名検証記録）。当時の最終`npm run check` exit0、142 suites／1,472 tests、541ファイルの実行前後hash一致。Metro dev／production、Three・ソース、循環、r8 framebuffer、全章音声、名称・表示検査も成功。[検証記録](../qa-goal015/README.md)。Doctor／auditの未合格は下記へ別記し、審査準備PASSとは扱わない。 |
| NAME_AND_METADATA_APPROVAL | PENDING |
| PUBLIC_POLICY_AND_SUPPORT | PUBLISHED。両ページの匿名HTTPS 200・配信バイト一致。[公開記録](github-pages.md)。メール実受信とproduction端末の遷移は未確認。 |
| PUBLIC_APP_LINKS | 実URL設定済み。実設定・実画面の配線を含む６スイート30テスト、型検査、対象LintはPASS。production端末は未確認。 |
| FINAL_SCREENSHOTS | PENDING |
| PRODUCTION_BUILD | NOT_RUN |
| ASC_UPLOAD | NOT_RUN |
| PRODUCTION_DEVICE_ACCEPTANCE | PENDING |
| APP_REVIEW_READY | false |
| APP_REVIEW_SUBMITTED | false |
| RELEASE_READY | false |

「音が聞こえた」という既存報告は、同じproductionビルドの全項目受入・公開承認を意味しない。所有者が決める値は[確認票](owner-confirmation.md)に集約し、私的な審査連絡先や認証情報はGitへ残さない。

## 最終提出候補を確定する前

ネイティブのプライバシー確認にIPAが必要な場合、所有者は下記のビルド手順で**未提出の仮production候補**を先に作り、検査できる。この仮候補を作るために公開ページの完成やsubmit用`ascAppId`を要求しない。未確定の連絡先やURLを架空の値で埋めず、公開情報未完成の候補として記録する。仮候補はASCへアップロードせず、審査・実機受入が完了したとも扱わない。

2026-09-20に、所有者は公開情報とページ公開をproduction監査と分けて承認しました。本文・連絡先・URLの公開とアプリ接続は済んだため、次はリンクを含むproduction候補を作成し、IPA・SDK・実通信と同じ候補の実機受入を確認します。実態との差が判明した場合は本文も見直します。`publicInformationApproved=true`、`productionPrivacyReviewConfirmed=false` を維持し、後者を形式だけtrueにしません。以下は最終候補・アップロードに向けて満たす項目であり、最初の監査用ビルドの前に全項目を済ませる必要はない。

1. [日本語原稿](store-metadata-ja.md)と名前の採用・権利を承認する。ASCで名前を利用できることと商標等の確認を別に行う。主言語は日本語、価格・地域・カテゴリは所有者が選ぶ。
2. 公開本文・連絡先は承認済み。実在するHTTPSの[プライバシー](https://catlover-bot.github.io/chroma-rift/privacy.html)／[サポート](https://catlover-bot.github.io/chroma-rift/support.html)は公開・匿名到達を確認し、アプリへ接続した。残りはASCへのURL反映、最終productionの[プライバシー監査](privacy-support-audit.md)、同じビルドからのリンク動作・復帰、メール実受信の確認。仮文言が残る版は提出しない。
3. ASCで`com.hirotakam.chromarift`の既存レコードを確認する。なければ所有者がiOS、日本語、採用名、同じBundle IDで登録する。[Appleの登録手順](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)を参照。別Bundle IDや別EASプロジェクトを作らない。
4. ASCのGeneral → App Information → General Informationにある**数値Apple ID**を確認した時だけ、既存`eas.json`に`submit.production.ios.ascAppId`を文字列として最小追加する。現行の設定値は `"6813876632"`。今回この値は変更していない。提出時に正しい登録先であることを照合し、ダミーや別の識別子へ置き換えない。[Expoの項目説明](https://docs.expo.dev/submit/ios/)参照。
5. `version=1.0.0`、remote version、productionの`autoIncrement:true`、`developmentClient:false`とproduction markerを維持。simulator／internal／ad hoc用の成果物は提出しない。既存のASCバージョンが異なる場合は先に突き合わせる。設定や依存を変えたら必要なローカル検証を更新して候補ソースを確定する。

既知の依存残件（2026-09-19の新しい検査）：Doctorは20/21で、Expo互換パッチ推奨が`expo 57.0.22 → ~57.0.24`、`expo-asset 57.0.17 → ~57.0.18`、`expo-constants 57.0.18 → ~57.0.19`の3件。auditは11 moderate、high／criticalは0で、`uuid <11.1.1`の`GHSA-w5hq-g745-h8pq`が`xcode`等のExpoビルド用依存へ波及する。既存であることを安全の証明にしない。完全な結果・依存経路・残余リスクは[Goal015](../GOAL-015.md)の保存ログと評価を参照。一括更新や`audit fix --force`はしない。更新する場合は改名と分離し、検証と最終バイナリ確認をやり直す。

## productionビルド（所有者が実行）

監査用の仮候補か、公開情報を反映した最終候補かを記録し、ビルドするgit SHAと差分を確定して実行する。認証・署名の質問は所有者が扱い、既存の署名識別を維持する。

```bash
cd /home/mhirotaka/workspace/chroma-rift-goal012 &&
npx eas-cli@latest build --platform ios --profile production
```

返されたEAS Build ID、実行日時、git SHA、プロファイル、`1.0.0`の実build番号、成果物ハッシュ、実際のXcode／SDKを記録する。2026-09-19確認時の最低条件はXcode 26以降・iOS 26 SDK以降（2026-04-28から）。提出日に[Apple公式案内](https://developer.apple.com/news/upcoming-requirements/)を再確認する。Expo SDK 57という番号だけで適合判定しない。最低対応iOSは別途、生成設定・IPAで確認する。

IPAでは署名、Bundle ID、日本語`CFBundleDisplayName`、version/build、ローカライズ、アイコン・起動画面、Info.plistの権限、各SDKのprivacy manifest／required-reason宣言、同梱画像・音源を検査する。ローカルのJS exportはIPAや署名済みnativeビルドの検査を代替しない。

ページ公開と実在URLのアプリ接続は完了した。今回のURL接続を含むソースから、新しいproductionビルドを作成する。監査後にアプリのコードや設定をさらに変えた場合も、ローカル検証を更新してproductionを再ビルドする。公開ページだけを更新しバイナリが変わらない場合も、承認本文と実態の一致・リンク到達を再確認する。最終候補のIPA検査と、後述する同じversion/buildのTestFlight受入が必要で、仮候補の確認だけでは代替しない。

## 今回のビルドだけをASCへアップロード（所有者が実行）

先に公開ページと実在するアプリ内リンク、実在の`ascAppId`とproduction submit設定を確認する。入力するのは、仮候補と区別して作成・検査した**最終候補のEAS Build ID**。アップロード先の数値Apple IDでも、`CFBundleVersion`でもない。コマンドは任意の非空文字列までしか検査しないため、所有者がEAS上のプロファイルとIDを照合する。

```bash
cd /home/mhirotaka/workspace/chroma-rift-goal012 &&
read -r -p "今回作成したproductionのEAS Build ID: " production_build_id &&
test -n "$production_build_id" &&
npx eas-cli@latest submit --platform ios --profile production --id "$production_build_id"
```

[Expo CLI](https://docs.expo.dev/eas/cli/)の`--id`で特定する。`--latest`は使わない。アップロード成功、Apple側の処理完了、TestFlight利用可能をそれぞれ確認する。これだけでApp Reviewに申請したことにはならない。[Expo iOS submit](https://docs.expo.dev/submit/ios/)参照。

## 同じproductionの実機受入とASC入力

- TestFlightから**上記と同じversion/build**を入れる。これは本プロジェクトの品質工程であり、Appleが全アプリに一律必須としているという説明ではない。
- 日本語のホームアイコン下の名前、アイコン、起動表示、通常画面・文字拡大・読み上げを確認する。日本語の読み方も聞く。全機能のVoiceOver対応を推測で申告しない。
- 同梱コードでオフライン起動し、全5エリアを通し、音／消音／音量／中断再開／背景復帰／保存を確認する。04の保持解除・棚への退避・接触復帰・格子通過、05の隔離・停止・屋外・エンディングを含める。旧セーブ再開を残し、利用者の保存を無断で消さない。
- productionの通常画面から旧ラボ・probe・旧ステージが出ないこと、任意のサポート詳細・コピー・エラー復旧が機能すること、実在の公開リンクと連絡先を確認する。
- [最終5枚](screenshot-plan.md)を提出候補から用意し、原本とハッシュ、機種／OS／撮影日時を保存する。
- ASCに承認済み原稿、著作権、URL、実装とSDKに基づくApp Privacy、暗号申告、地域固有の要件を入力する。`ITSAppUsesNonExemptEncryption:false`は最終成果物の暗号利用と照合する。
- [年齢質問票](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/)を標準の怖さも含む実内容・頻度に沿って回答する。控えめ設定を理由に追跡・接触・恐怖表現を省かない。結果の年齢を独断で先に決めない。
- [審査メモ](review-notes.md)、非公開の審査連絡先を入力し、正しいversion/buildを選ぶ。公開方法は所有者が決定する。手動公開を推奨する場合も承認前に設定済みとはしない。

## 審査申請と公開は別操作

以上が全て完了し、所有者が審査申請を承認して初めて`APP_REVIEW_READY=true`にできる。[Appleの現行手順](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/)に従い、正しいビルドを確認して**Add for Review → Submit for Review**と進める。Add for Reviewだけでは未送信。送信日時とASC状態を確認して`APP_REVIEW_SUBMITTED=true`にする。

審査承認と公開開始も別。手動公開を選んだ場合は承認後のPending Developer Releaseを確認し、所有者の公開判断を待つ。自動公開を選ぶと承認後に公開され得るため、選択時点で所有者が理解・承認する。[公開設定の定義](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)参照。公開の記録なしに`RELEASE_READY`や公開済みを真にしない。
