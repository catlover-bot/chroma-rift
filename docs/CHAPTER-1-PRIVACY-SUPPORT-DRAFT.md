# 第一章のプライバシー・サポート文案（未承認）

> 過去記録（Goal013時点）。Goal015の現行原稿は [プライバシー](release/privacy-policy-ja.md)・[サポート](release/support-ja.md)、根拠は [最新監査](release/privacy-support-audit.md)を参照してください。以下の旧名称・診断範囲・当時の検査結果は履歴として保持しており、現在の提出用本文ではありません。

この文書は `feat/goal-013-chapter-one-product` のコード監査に基づく**公開前の下書き**。運営者、正式な連絡先、公開URL、SDKを含む実バイナリのデータ取扱いが未確定なので、そのまま公開しない。アプリ内や App Store Connect に仮URLを入れない。

## プライバシーポリシー候補本文

> CHROMA RIFT は、第一章の進行、エリアの到達・完了、取得した鍵と観察の記録、表示の調整結果、操作・音・怖さの設定を、この端末のアプリ保存領域に記録します。これらは続きを再開し、発見を振り返り、選んだ設定を保つために使います。
>
> ゲームの操作にアカウント登録、位置情報、カメラ、マイクは必要ありません。録音と背景音声再生はビルド設定で無効にしています。広告、課金、ゲーム進行を同期するアプリ独自のサーバー機能は実装していません。
>
> 設定の「保存データをリセット」で、本作が管理する進行、観察履歴、調整結果、設定、旧記録とバックアップを端末のアプリ保存領域から削除できます。削除に失敗した場合は画面に案内を表示します。端末・OSが別に管理するバックアップの削除方法は、その設定に従います。

上の3段落は現在のアプリコードで確認できる範囲の**候補**であり、第三者SDK・OSが実際に送信するデータや診断情報を含む完全なポリシーではない。公開版では運営者名、適用日、連絡先、収集・共有の有無と用途、保存期間・削除手順を実バイナリと提供事業者の情報に照らして追記・承認する。確認前に「データ収集なし」を App Store Connect へ申告しない。

## サポート候補本文

> 3D表示に失敗した場合は、章の画面で「表示を再試行」を選んでください。保存に失敗した場合は、画面の案内に従って再試行してください。問題が続く場合は、使用端末・OS・アプリのバージョンと、発生したエリア・操作を添えてサポートへ連絡してください。保存データや端末の識別情報を、案内がないまま送らないでください。

問い合わせ先とサポートURLはオーナーの正式な指定を待つ。設定画面の現行文言「問い合わせ先は公開前に確定して案内します。」はリリース前に正式な案内へ置き換え、実際に開けることを確認する。

## コードと権限の確認範囲

| 項目 | 確認した事実 | 残る確認 |
| --- | --- | --- |
| ゲームの保存 | `src/storage/chapterOneStorage.ts` は単一の AsyncStorage envelope を読み書きする。`applicationStorage.ts` と `firstPersonStorage.ts` は設定、旧章、履歴、バックアップを扱う。 | 端末の実保存・OSバックアップ挙動。 |
| 全データ削除 | `resetAllApplicationStorage` は管理するキーを `multiRemove` し、失敗を呼出元へ返す。設定画面で失敗を表示する。 | 実端末での削除と再起動後の確認。 |
| アプリ独自の通信 | `App.tsx` と `src/` の製品コードで `fetch`、XHR、WebSocket、`expo-updates`、分析・広告SDKの呼出しを見つけていない。 | インストール済みネイティブSDK、OSサービス、署名済みバイナリの通信・プライバシーマニフェスト。 |
| 診断コピー | `expo-clipboard` は開発者ラボと `__DEV__` 限定の描画診断で使用。アプリ内に送信処理はない。 | 公開バイナリで開発画面が除外されることを最終再検査。 |
| iOS録音・背景音 | `app.json` の `expo-audio` は `microphonePermission:false`、録音・背景録音/再生を無効指定。`expo config --type prebuild` の `infoPlist` にマイク使用説明は出ない。 | 最終 IPA の Info.plist とSDKマニフェスト。 |
| Android権限 | `expo-file-system` の plugin が外部ストレージ読書と `INTERNET` を加え、`expo-audio` が `MODIFY_AUDIO_SETTINGS` を加える。外部ストレージAPIのアプリ直接利用は見つからないため、`app.json` の `android.blockedPermissions` で読書権限を除外。introspection で両方に `tools:node="remove"` を確認。 | 最終AAB/APKの統合manifest。Android package IDは現時点で未設定なので、Android配布判断も別途必要。`INTERNET`、テンプレートの `SYSTEM_ALERT_WINDOW`/`VIBRATE`、音声権限の最終用途を確認。 |

`expo-file-system` 自体は同梱アセットや内部キャッシュの処理に利用され得るため削除しない。外部ストレージ権限の除外は新しいAndroidバイナリでのみ反映される。iOSのBundle ID・Info.plist設定・本編の保存形式は変更していない。

権限の前後差とコマンド範囲は [permission-audit.json](qa-goal013/permission-audit.json) に記録した。Expo introspection は最終バイナリの統合manifestや実際の通信を証明しない。

## オーナーと実機で確定する事項

1. 運営者の正式名、公開日、プライバシーポリシーの公開URL、サポートURLと連絡先を指定し、公開ページとアプリ内リンクを同じ内容で確認する。
2. Preview/TestFlightの実バイナリで、Info.plist、Android配布時の統合manifest、SDKのプライバシーマニフェスト、初回起動とゲーム中のネットワーク挙動を監査し、第三者のデータ取扱いを確定する。
3. App Store Connectのプライバシー申告を実バイナリと第三者コードに合わせて回答する。AppleはポリシーURLを全アプリに求め、アプリ内にも容易にアクセスできるリンクと、収集・共有・保持・削除の説明を求める。現在の設定画面は短い説明だけなので、正式URLの承認後にリンクを実装・確認する。

参照：[Apple App Review Guidelines 5.1.1](https://developer.apple.com/app-store/review/guidelines/)、[Apple App Privacy](https://developer.apple.com/help/app-store-connect/reference/app-privacy/)、[Apple App Store Connectのプライバシー管理](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)、[Expo Android権限設定](https://docs.expo.dev/guides/permissions/)。
