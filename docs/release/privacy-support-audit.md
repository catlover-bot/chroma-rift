# 錯視館 — プライバシー・サポート監査

確認日：2026-09-19。開始基準：`0563e2d4bb76280fba2643078aa619e166bf8009`。作業場所：`/home/mhirotaka/workspace/chroma-rift-goal012`。現行ソースとインストール済みSDKを読んだローカル監査であり、署名済みproduction IPA、実通信、App Store Connectの申告は未確認です。機械可読のファイルハッシュ・SDK宣言は [privacy-support.json](../qa-goal015/privacy-support.json) に記録します。

2026-09-20の公開準備・承認・公開・アプリ内リンク有効化の差分は [追加レビュー](pages-privacy-review.md) を参照してください。現行 `eas.json` には数値 `ascAppId` が設定済みです。以下の表は前回監査時点の記録を保持しており、公開窓口欄の `ascAppId` 不在を現在の状態として扱いません。両ページは公開済みで、匿名HTTPS 200と承認済み本文のバイト一致を確認しました。アプリ内リンクの実設定を含む関連30テスト・型・LintもPASSです。[実URLと公開記録](github-pages.md)を参照してください。production監査・実機受入は未完了です。

公開本文は [プライバシー原稿](privacy-policy-ja.md)、[サポート原稿](support-ja.md)。正式情報の不足は [所有者の一括確認票](owner-confirmation.md)へ集約しました。Goal013の [旧文案](../CHAPTER-1-PRIVACY-SUPPORT-DRAFT.md)は過去記録として保持し、現行の事実として転載しません。

## 現行コードで確認した取り扱い

| 範囲 | 実装で確認したこと | 限界・公開文への反映 |
| --- | --- | --- |
| 保存 | `chapterOneStorage.ts`、`applicationStorage.ts`、`firstPersonStorage.ts`、`moduleStageStorage.ts`、`stageJournalStorage.ts`がAsyncStorageで進行・設定・調整・履歴・旧記録とバックアップを扱う | 端末内の保存と外部での収集は別。OSのバックアップ挙動までこの検査では証明しない |
| 全保存の削除 | `resetAllApplicationStorage`は共有writer/epochで古い書き込みを無効化し、アプリ管理キーを削除。Appは失敗を表示する | OSバックアップ、コピー済み情報、問い合わせ先の保存を削除する処理ではない。章だけのリセットは履歴・設定等を残す |
| 本編の通信 | `App.tsx`と製品`src`の明示的なfetch/XHR/WebSocket呼出しは検索で0件。独自のログイン・広告・分析・進行同期・診断送信処理は見つからない | 静的な呼出し検索であり、全SDK/OSの通信が0である証明ではない。最終IPAで同梱アセット、初回・ゲーム中・サポート操作時の通信を確認 |
| 音 | `sources.ts`の28音源はローカルrequire。`nativeBackend.ts`は再生専用で録音・背景再生false、消音設定を尊重。音サンプリングAPIは使っていない | SDKにはURL音源やダウンロードの能力がある。実際の同梱・ローカルURI解決・オフライン起動は最終productionで確認 |
| 公開版の診断 | `SupportInformation.tsx`は手動で詳しい情報を開き、更新・コピーを選ぶ。productionはbuild情報、最初の音失敗、描画失敗の要約が中心。preview/developmentは詳しい描画・音の状態を含む | 旧文案の「診断コピーは開発画面限定」は現行では誤り。通常UIへ自動表示せず、送信APIもない |
| 診断の保持 | 音イベントは最大64件、音ownerのsnapshotは最大8件、描画失敗は最大3件・各32,768文字。プロセス内メモリに保持 | アプリの保存リセットでは診断メモリを消さない。プロセス終了で失われる。アプリの保存DBへ診断を永続化していない |
| マスキング | `diagnosticText.ts`がURL・メール・一部のユーザー/端末パス・credentialパターン・UUIDを伏せる。support整形には深さ/配列/文字数の上限がある | 全個人情報を完全匿名化する保証とは書かない。ゲーム内座標やセッション番号は現実の位置・端末IDとは区別 |
| クリップボード | 製品のコピーは`expo-clipboard`57.0.2の`setStringAsync`。iOS実装は`UIPasteboard.general.string`へ書く。利用者の既存クリップボードをアプリが読み出す呼出しはない | コピーはサポート送信ではないが、OS管理の共有領域。localOnly/期限指定はこのAPI経路にない。OSのUniversal Clipboard設定で別端末へ共有され得る。保存リセットでは消去しない |
| 公開窓口 | app/eas設定、現在の公開前文書に正式な運営者・問い合わせ先・実在HTTPS policy/support URL・ascAppIdはない。Settingsにも外部ポリシー/窓口リンクはない | 仮URLを作らない。現状は提出準備の残件。旧文案にある仮の問い合わせ説明自体はGoal014.1で通常UIから除去済みだが、連絡手段が完成したわけではない |

根拠ファイルの版・ハッシュをJSONへ固定しました。調整結果はゲーム表示の好みであり、医療検査・診断結果と宣伝しません。クリップボードの端末間共有は[Apple Universal Clipboard](https://support.apple.com/en-us/102430)で確認しました。

## インストール済みiOS privacy manifest

ローカル`node_modules`で9件の`.xcprivacy`をXMLとして読みました。以下は**配布されたSDKソースの宣言**であり、提出IPAの統合結果ではありません。

| 配布元・ファイル群 | 宣言されたrequired-reasonカテゴリと理由 |
| --- | --- |
| React Native 0.86.3 React/Resources | FileTimestamp `C617.1`、UserDefaults `CA92.1` |
| React Native cxxreact / RCT-Folly / glog | FileTimestamp `C617.1` |
| React Native timing | SystemBootTime `35F9.1` |
| React Native boost | FileTimestamp `C617.1`、SystemBootTime `35F9.1` |
| expo-file-system 57.0.7 | FileTimestamp `0A2A.1`,`3B52.1`、DiskSpace `E174.1`,`85F4.1` |
| expo-constants 57.0.18 | UserDefaults `CA92.1` |
| AsyncStorage 2.2.0 | FileTimestamp `C617.1` |

9件とも`NSPrivacyCollectedDataTypes`は空配列でした。8件は`NSPrivacyTracking=false`を明示し、AsyncStorageはそのキーを持ちません。これだけでアプリ全体の「データ収集なし」を決定しません。expo-audio/clipboard等で独立したmanifestが見つからないことも、それだけで不適合の証拠にはしません。

Expo FileSystem、Constants、AsyncStorageのpodspecにはmanifestをresource bundleへ入れる指定があります。React Nativeの`privacy_manifest_utils.rb`にはPodの宣言とcore理由をまとめる処理があります。現行`app.json`に独自の`ios.privacyManifests`指定はありません。必要な理由を根拠なく追加したり、SDKを一括更新したりしていません。[Expoのprivacy manifest案内](https://docs.expo.dev/guides/apple-privacy/)も静的Podの集約を最終的に確かめる必要を説明しています。

Appleの[SDK要件一覧](https://developer.apple.com/support/third-party-SDK-requirements/)には`hermes`が含まれます。現在のReact Native podspecはHermes frameworkをネイティブビルドで解決するため、このLinuxのJS依存一覧だけでは同梱frameworkのmanifest・署名を検証できません。該当SDKのmanifest、バイナリ依存の場合の署名、Xcodeのprivacy reportを提出候補で確認します。

## Info.plist・developmentとproductionの区別

親タスクの `.expo/goal015/baseline-introspect.json` はローカルExpo introspectionです。録音の使用説明と背景audioモードはありませんが、Expo Dev Launcher用の`NSBonjourServices=[_expo._tcp]`、`NSLocalNetworkUsageDescription`、ATSの`NSAllowsArbitraryLoads=true`とlocalhost例外が見えます。これをproductionの最終権限と呼びません。

実際の`expo-dev-launcher/plugin/build/withDevLauncher.js`はconfig処理でローカルネットワーク用キーを加え、別のXcode build phaseで**Debug以外**の場合にExpo用Bonjour項目と既定の説明を削除します。独自の説明/サービスは維持します。このbuild phaseはATS例外を削除する処理ではありません。Xcodeを実行していないintrospectionでは、その後処理の結果は見えません。

最終productionの実Info.plistで、日本語名、Bundle ID、版、録音/カメラ/位置等の不要なusage descriptions、背景モード、Bonjour/ローカルネットワーク、ATS、URL scheme、entitlementsを確認します。一般の`developmentClient:false`やJS exportだけで、全ネイティブ権限が除去されたとは断定しません。

## App Storeの申告・公開要件

2026-09-19にApple公式ページを再確認しました。

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) §1.5はアプリとSupport URLから連絡できること、§2.1は完成した内容と機能するURL、§5.1.1(i)はアプリ内とApp Store Connectのプライバシーリンク、データの取得・用途・共有・保持・削除の説明を求めています。
- [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)はiOSのpolicy URLと、同梱第三者コードも含むデータ取扱いの申告を求めています。
- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/)では、端末内だけの処理と、外部へ送って保持する収集を区別しています。問い合わせ等の任意開示例外は全条件を満たす必要があり、「利用者がコピーした」という一点から申告不要とは決定しません。採用する問い合わせ経路・保持・個人への紐付き・第三者の扱いを所有者が確認します。
- [Required-reason API](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)と[privacy manifest](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)はバイナリ内の宣言と実使用を照合する対象です。manifestは公開ポリシーURLやApp Storeの申告の代わりではありません。

## 残る検証

最終IPAとXcode privacy reportの取得、Hermes等の統合宣言・必要署名、Info.plist/entitlements、同梱音源・画像、初回起動と5エリア・診断操作の通信、公開ページと窓口の受信・保持条件、同じproduction版からの外部リンクを確認します。アプリ独自の送信処理が見つからなかったという事実と、最終バイナリ/OS/委託先まで確認したという主張を分けます。

2026-09-19時点の状態：`PUBLIC_POLICY_AND_SUPPORT=PENDING`、`PRODUCTION_BUILD=NOT_RUN`、`PRODUCTION_DEVICE_ACCEPTANCE=PENDING`、`APP_REVIEW_READY=false`、`RELEASE_READY=false`。

2026-09-20更新：`PUBLIC_POLICY_AND_SUPPORT=PUBLISHED`。`productionPrivacyReviewConfirmed=false`、`PRODUCTION_BUILD=NOT_RUN`、`PRODUCTION_DEVICE_ACCEPTANCE=PENDING`、`APP_REVIEW_READY=false`、`RELEASE_READY=false`を維持。メール実受信も未確認です。
