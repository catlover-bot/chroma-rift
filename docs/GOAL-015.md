# Goal 015 — 錯視館への改名と初回提出準備

日本語の製品表示を **錯視館（さくしかん）** に統一した。第一章「最後の退館者」全5エリア、既存の遊び・音・保存・復旧を維持する。ストア原稿と公開ページのローカルソースを用意したが、名称の権利・正式情報・最終productionの実機受入は未確認。ローカル改名の完了を、公開承認や審査提出の完了として扱わない。

## 作業地点

- worktree: `/home/mhirotaka/workspace/chroma-rift-goal012`
- branch: `release/goal-015-japanese-app-store`
- 開始HEAD: `0563e2d4bb76280fba2643078aa619e166bf8009`（開始時clean）
- 開始記録・設定・6ファイルの変更前hash: [baseline.json](qa-goal015/baseline.json)
- Node `v24.20.0` / npm `11.19.0`。原本worktreeと別の既存worktreeは変更していない。
- 終了コミットと検証対象の対応は [QA記録](qa-goal015/README.md)。最終記録コミット自身のSHAは `git rev-parse HEAD` で取得する。

基準報告の142 suites / 1,472 testsは過去の結果。今回の実測を下記QA記録に分ける。全体checkの前後で、製品・テスト・検査スクリプト・素材・設定のhashを照合する。

## 実装と許可差分

`src/app/brand.ts` に `APP_NAME` と `APP_NAME_READING` を集約し、製品名は `app.json` から参照する。ホーム、エンディング、アプリ情報、開発時の旧入口、自作素材の表示クレジットを統一した。第三者の名称・出典・ライセンスは改名していない。

タイトルのletterSpacingを3から0にし、ホームとエンディング等に読み「さくしかん」と `accessibilityLanguage="ja-JP"` を指定した。アプリ情報には読みも表示する。実際のVoiceOver発声は端末確認待ち。

| 対象 | 許可した変更／保持した値 |
|---|---|
| `expo.name` | `CHROMA RIFT` → `錯視館` |
| `ios.infoPlist.CFBundleDevelopmentRegion` | `ja` を明示 |
| `ios.infoPlist.CFBundleLocalizations` | `["ja"]` を明示。未実装の多言語対応を宣言しない |
| バージョン | `1.0.0` を保持 |
| Bundle ID | `com.hirotakam.chromarift` を保持 |
| slug / scheme | `chroma-rift` / `chromarift` を保持 |
| EAS projectId | `43063855-e1de-4072-b1e6-1c8621e3cb10` を保持 |
| package / lock / Metro | byte一致 |
| `eas.json` | byte一致。数値のascAppIdが未提供なのでsubmit設定を追加していない |
| supportsTablet / 録音・背景再生設定 | 既存値を保持 |
| campaign / stage / target / 保存 | ID、キー、形式、codec、互換処理を保持 |
| 診断marker | `goal-015-sakushikan-r1`。通常画面には出さず、設定→サポート→詳しい情報で確認 |

`scripts/validate-release-identity.cjs` は、指定した基準SHAに対する `app.json` の変更を上記3パスだけに限定し、他の保護5ファイルと保存・campaign・stage関連48ファイルの一致を検査する。これはGoal015の候補を照合する検査であり、将来の正当な機能追加を永久に禁止するものではない。

動的app configと管理対象の `ios/` / `android/` は存在しない。`expo config --type introspect` の生成値で `CFBundleDisplayName=錯視館`、開発言語ja、localizations=[ja]を確認した。**今回はネイティブ設定変更があるため、新しいproductionビルドが必要。** 既存previewやMetroの再読込では端末ホーム名とネイティブ設定の更新を証明できない。

generic introspectionには開発launcher由来のBonjour/local-network宣言とATS設定が含まれる。インストール済みpluginの非Debug用Xcode処理は自身のBonjour/local-network項目を削除するが、これは最終IPAを検査した証拠ではなく、ATSまで削除する保証でもない。署名・実build番号・不要権限・実Info.plistは最終IPAで確認する。

### 旧名称の保持理由

旧名称の全置換はしない。ソース内のallowlistは [identity.json](qa-goal015/identity.json) にファイル単位で記録した。

- `src/storage/*`、Stage Kit定義、関連fixtures: 既存の保存キーと互換性。
- `planarMirror.ts`: 内部Three material名。
- `canvasLifecycle.ts`: `__DEV__` consoleの診断prefix。
- アサーション内の旧名: 通常UIへ旧名が出ないことの検査。
- package、slug、scheme、Bundle ID、環境変数: 技術識別。
- 過去のGoal文書・QA・生成元台帳: 当時の証拠と権利表示。`assets/perceptual/manifest.json` の原著作者表記も保持する。

通常ホーム、全設定パネル、エンディングの文字監査で旧製品名が出ないことを検査した。試験期待値は製品名とmarkerだけを更新し、内部markerの漏出検査は `goal-\d+` に広げた。skip、timeout増加、ゲームの許容値変更はない。

## 画像と表示

既存アイコン・splashは文字のない自作図形なので変更しない。生成元と実PNGを確認し、新素材・フォントを追加していない。マスターアイコンは1024角で全画素alpha255、四隅も不透明。インストール済みExpoのiOS icon出力と同じ設定で、alpha channelのないRGB・1024角の派生画像を実生成し、元画像との画素一致を確認した。splashの透過は意図したもの。最終Assets.carや端末起動表示の検査とは区別する。

実React画面を使うローカルレイアウトQAで、幅320/390/430、文字1倍/2倍の36状態・48画面を検査した。1,434文字要素・702ボタン、はみ出し0件、最小ボタン66.02×50px。[表示QA](qa-goal015/brand-layout/README.md)と[素材評価](qa-goal015/BRANDING-ASSESSMENT.md)に画像・hash・測定境界を記録した。

初回の320幅・文字2倍の終幕に、QAのデスクトップ用スクロールバーが15pxを予約することによる失敗があった。iOS相当のoverlay幅へQA CSSだけを修正し再検査した。元スクリプトと失敗記録は保持。製品の文字やアサーションを緩めていない。ブラウザーのCSS橋渡しであり、native Yoga、実機VoiceOver、最終ストア画像の証明ではない。

## 提出用の原稿・公開情報

| 成果物 | 内容 |
|---|---|
| [日本語ストア原稿](release/store-metadata-ja.md) / [JSON](release/store-ja.json) | 現在の5エリアに合う名称・説明・宣伝文・keywords。価格・地域・権利は未承認 |
| [審査notes](release/review-notes-ja-en.txt) | 日本語・英語。通常操作による5エリア、04の格子と安全復帰、05の終了、音・怖さ、任意診断、第二章の案内 |
| [公式要件](release/official-requirements.md) | Apple/Expo一次資料の確認日、字数／byte制限、SDK・画像・提出の根拠 |
| [プライバシー原稿](release/privacy-policy-ja.md) / [サポート原稿](release/support-ja.md) | 現在の音・診断コピー・ローカル保存・削除の実装に合わせた未公開本文 |
| [監査](release/privacy-support-audit.md) / [ページソース](release/static/README.md) | 自動送信と任意コピーの区別、SDKの限界、HTML生成と公開手順 |
| [所有者の一括確認票](release/owner-confirmation.md) | 正式名称・権利、運営者・著作権者、実窓口・HTTPS URL、ascAppId、価格・地域、非公開審査連絡先 |
| [スクリーンショット計画](release/screenshot-plan.md) | 実候補から撮る5場面、現行寸法、端末と加工の範囲 |
| [提出チェックリスト](release/submission-checklist.md) | 確認用仮候補→公開情報・リンク反映→最終production→特定IDアップロード→同じbuildの受入→審査 |

原稿の実測は名称3文字、サブタイトル14文字、説明349文字、宣伝文57文字、keywords70 UTF-8 bytes、日英review notes合計3,478 bytes。[機械検証](release/metadata-validation.json)に文字数・hashを保持した。名称の使用可能性や商標を確認した結果ではない。

公開情報が未提供のため、アプリ内に偽URLや空のmailtoを追加していない。公開窓口と実URLが未確定で、アプリ内の外部リンクが未接続であることは提出前の残件。承認済み実URLが届いたら通常ブラウザーで開くリンクを接続し、本文・到達・問い合わせ受信を確認して再検査する。静的ページ生成器は未承認／未入力の公開モードを拒否する。下書き4レイアウトと不正endpoint15ケースを検査したが、到達性・デプロイ・窓口受信を確認したことにはならない。

現行ソース253ファイルで直接のネットワーク呼出し・clipboard読み取りは見つからなかった。診断は利用者の操作でコピーされる。これだけでデータ収集なしとは申告しない。SDKのprivacy manifestはインストール済み9ファイルを棚卸ししたが、Hermesを含む最終frameworkの宣言・署名、required-reason API、OS・ホスティング・問い合わせ先の扱いは最終候補で確認する。

## 検証と残余リスク

最終の実行数・exit code・ログは [QA一覧](qa-goal015/README.md) を参照する。既存 `npm run check` はlint、typecheck、全Jest、iOS exportを順に実行する。別途、実Metro開発／本番のThreeとソース一致、3platform循環、r8 framebuffer、全章audio owner、表示・名称・CNGを検査する。04の退避・入力解放・接触回復・格子通過・安全復帰と保存互換は既存の実controller／実画面テストを維持して再実行する。

### Doctorとauditは未合格

2026-09-19の実測ではDoctorは20/21、exit1。`expo install --check` もexit1で、現在は次のパッチ推奨3件がある。過去の1件という報告へ置き換えない。

| パッケージ | installed | 推奨 |
|---|---|---|
| expo | 57.0.22 | ~57.0.24 |
| expo-asset | 57.0.17 | ~57.0.18 |
| expo-constants | 57.0.18 | ~57.0.19 |

`npm ls --depth=0` はexit0。依存は更新せず、改名の検証結果と互換パッチ推奨を分ける。パッチを採用する場合は別コミットで全検査と最終バイナリ確認をやり直す。

`npm audit --json` は **11 moderate / 0 high / 0 critical、exit1**。11件は11個の独立した欠陥という意味ではなく、uuidのアドバイザリとxcode→Expo設定／ビルドツール群への波及を含む。対象一覧・依存経路・fixAvailableは [environment](qa-goal015/environment/results.json) の生ログへ保存した。

[GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq) はuuidのバッファ境界に関する問題。installed `xcode@3.0.1` が `uuid@7` を要求する。確認した `node_modules/xcode/lib/pbxProject.js` の呼出しは引数なしの `uuid.v4()` で、アドバイザリのv3/v5/v6のbuf/offset経路ではない。実production Metro mapでuuid/xcodeがゲームJSへ入っていないことも検査する。ただし、ネイティブビルドの全実行経路や今後の入力まで非影響と保証しない。依存グラフ上の警告とビルド環境の残余リスクは残る。

auditの自動修正案はExpo46.0.21／splash55.0.25へのmajor変更を含み、現在のSDK57構成を保つ小さな修正ではない。強制audit修正・uuidの無検証override・主要依存一括更新はしていない。最終build前にも再確認し、互換性が検証された修正を別途判断する。

## 外部確認の境界

このGoalでEAS/Apple認証、cloud build、ASCアプリ登録、upload、審査申請、一般公開、ページdeploy、push、PRは実行していない。設定上のproductionはdevelopmentClient=false、autoIncrement=true、remote version管理、production markerを保持する。署名の実体とremote build番号は未確認。

Linux環境にはiOS Simulator実行手段がないため、最終ストアスクリーンショットとproduction実機受入はPENDING。既存の音が聞こえたという利用者報告を、全項目・今回のproductionの合格へ拡張しない。

必要な公開情報は一度に問い合わせ済み。未承認値を残したままローカルの実装・原稿・検証を完成させる。最終の状態値は [提出チェックリスト](release/submission-checklist.md) とQA記録に揃える。公開前には [iPhone確認手順](IPHONE_VALIDATION.md) で同じproduction buildを確認する。TestFlightは本プロジェクトの品質工程であり、Appleが全アプリに常に義務づける工程という説明はしない。

ユーザーが次に行うのは一括確認票の確定と、必要な公開情報の反映。準備後のbuildと特定EAS Build IDによるsubmitコマンドは [提出手順](release/submission-checklist.md) にまとめた。EAS Submitはアップロードであり、App Review送信・承認・一般公開とは別の状態である。
