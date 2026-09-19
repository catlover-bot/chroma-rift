# GitHub Pages公開準備 — プライバシー本文の限定再確認

確認日：2026-09-20。対象：`release/goal-015-japanese-app-store`、`201cc0955d16478b87195a5b4c3a0d1b2acf8d15`。本書は現行ソース・既存原稿・GitHub公式資料の照合結果です。以下の初回照合では公開、問い合わせ送信、承認フラグの変更、アプリ変更、最終IPAの検査は行っていません。その後の承認・公開・URL有効化は末尾の追記を参照してください。

## 現行実装と既存原稿

[前回監査](privacy-support-audit.md)と[記録JSON](../qa-goal015/privacy-support.json)を再利用し、対象ファイルの現行バイトをSHA-256で比較しました。

| 再確認した範囲 | 結果・読み取れる限界 |
| --- | --- |
| App.tsxと製品srcのTS/TSX（テスト・testFixtures除外） | 現行253件と旧記録253件のファイル集合・ハッシュがすべて一致。追加・欠落なし。記録JSONの開始HEADと現在HEADが異なるため、HEADだけで一致と判断していない。 |
| 選択済み実装・ネイティブ根拠21件、インストール済みpackage.json 11件、SDK privacy manifest 9件 | すべて旧記録のハッシュと一致。今回は新しいネイティブビルドやmanifest集約を実行していない。 |
| 製品253件の明示的呼出し再検索 | `fetch(`、`XMLHttpRequest`、`WebSocket(`、`getStringAsync(`、`Linking.openURL`の該当なし。SDK・OSを含む実通信ゼロの証明ではない。 |
| 任意の診断コピーと保持 | `SupportInformation.tsx:18`は利用者の操作で`setStringAsync`を呼ぶ。`audio/diagnostics.ts`の64イベント・8owner、`rendering/firstPerson/failureLedger.ts`の3件・各32,768文字の上限は現行でも同じ。自動送信や完全匿名化を約束しない既存原稿と整合する。 |
| 保存・削除、音 | `firstPersonStorage.ts:388`の全保存リセット、`SettingsScreen.tsx:139`以降の章単位／全保存の区別、`nativeBackend.ts:16`以降の消音尊重・録音なし・背景再生なし、`sources.ts`のローカル音源28件を再読。OSバックアップ・コピー済み情報の削除まで保証しない既存原稿と整合する。 |
| 公開ページの生成元 | `static/build-pages.py`は本文とローカルCSSを出力。現行テンプレートにはJavaScript、外部フォント、解析タグ、情報入力フォームがない。`referrer=no-referrer`を指定するが、配信先にIPが届かないという意味ではない。実際の公開レスポンス・Cookie・追加サービスは未確認。 |

[プライバシー原稿](privacy-policy-ja.md)と[サポート原稿](support-ja.md)について、上記範囲で本文の具体的な実装不一致は見つかりませんでした。「データ収集なし」「一切通信しない」「診断コピーは開発版だけ」といった表現へ強めません。

### この照合後に準備したアプリ内リンク

上の253件一致は、今回のリンク追加前の照合結果です。その後 `SettingsScreen.tsx` に利用者が押したときだけ `Linking.openURL` を呼ぶ処理と２つのボタンを追加し、`src/app/publicPages.ts` を新設しました。URLは両方 `null` で、未公開リンクはまだ表示されません。公開と到達確認後に設定するURLへ、診断情報・保存内容を付加する処理はありません。失敗時は日本語の案内を表示します。本編の自動送信・音・保存・診断コピーの処理は変更していません。関連５スイート29テスト、型検査、対象Lintは成功しましたが、実在URLの有効化・実機での遷移確認は未実施です。

## 旧監査から変わった点

- 現行`eas.json`には`submit.production.ios.ascAppId = "6813876632"`がある。旧監査の「ascAppIdはない」は現在の状態としては古い。これは公開運営者名・問い合わせ先・配布済みバイナリの確認に代わる情報ではない。
- 配信先としてGitHub Pagesを準備するため、従来未確定だった`hostingDataHandling`に、下記の確認済み取扱いを入れる候補を用意した。まだ公開済みとは扱わない。
- 確認時の`static/public-fields.json`は運営者・連絡先等が`null`で、`publicInformationApproved`と`productionPrivacyReviewConfirmed`はともに`false`。所有者への既存の一括質問に集約し、本書から追加質問や承認代行をしない。

## GitHub側で確認できた範囲

GitHub Pages公式説明は、訪問者がGitHubへログインしているかどうかにかかわらず、安全性確保のためIPアドレスを記録・保存すると明記しています。これがPagesに直接対応する根拠です。[What is GitHub Pages? — Data collection](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection)

GitHubの現行一般プライバシーステートメントの適用日は2026-04-27です。サービス利用・閲覧情報についての説明と、目的・法的義務等に応じた保持方針がありますが、確認した資料には**Pages訪問者のIPログに一律適用される保存日数**はありません。一般サービス向けに列挙された全情報・Cookieが、この静的ページで必ず収集されるとも読み替えません。[GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

GitHub PagesはHTTPSを利用でき、配信内容はインターネット上で公開されます。公開対象は承認済みのページ素材に絞り、診断ログ・個人情報・未確定欄を配信成果物に含めません。実際の公開URLとHTTPS応答の確認は別途必要です。[Securing your GitHub Pages site with HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)

## `hostingDataHandling`の本文候補

以下は**GitHub Pagesの採用と本文が承認され、公開する時点で使用する候補**です。初回レビュー後の継続作業で、公開予定であることを表す文に調整し、公式URLとともに `public-fields.json` の `hostingDataHandling` へ反映しました。確認用の第２版HTMLにも含めています。`publicInformationApproved` と `productionPrivacyReviewConfirmed` は両方 `false` のままで、運営者・問い合わせ先を補っていません。

> 本サポートページとプライバシーポリシーページは、GitHub Pagesを利用して配信しています。これらのページにアクセスすると、GitHubはセキュリティのため、GitHubへのログインの有無にかかわらず、訪問者のIPアドレスを記録・保存します。GitHub側での情報の取り扱い、保存・削除については、同社のプライバシーステートメントをご確認ください。

参照先は[GitHub General Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)。固定の保存日数、IPの匿名化、運営者がGitHubのログを削除できることは付け足しません。公開ページへのアクセス情報と、アプリ内のゲーム保存や利用者が任意で送る問い合わせを分けて説明します。

現行builderは差込値をHTMLエスケープし、本文のリンク変換は`privacy.html`／`support.html`に限っています。そのまま使う場合、上記参照先の正式URLはプレーンテキストとして差し込めます。クリック可能にする場合は、差込文字列へ任意HTMLを許可せず、生成側で公式HTTPSリンクを限定して扱う変更を親担当で検討してください。

## 最小訂正案と残確認

- 元の`privacy-support-audit.md`を現在形で案内する際は、「公開窓口」行のascAppId不在の記述だけを現行値ありへ更新するか、本書への差分注記を加える。過去JSONの値を現在値として書き換えない。privacy/supportの公開本文にascAppIdを追加する必要はない。
- 運営者名と窓口の承認に加え、実際に選ぶ問い合わせ経路で受け取る情報・保持・削除方法を`supportDataHandling`と照合する。GitHub Pagesの配信説明だけで問い合わせ先の方針まで確定しない。
- 公開成果物に解析・フォーム・外部埋込等を追加した場合は、この静的構成の確認を使い回さず追記する。公開後のURL、HTTPS、リンク、レスポンスとブラウザーの外部リクエストを確認する。
- 最終productionのSDK/Info.plist/通信・同梱素材の確認と、App Storeの申告は前回監査の残件を引き継ぐ。ページの公開だけで`productionPrivacyReviewConfirmed`や審査準備完了を真にしない。

照合した原稿SHA-256：privacy `ca16802f20ed938d4b9c3359ecb687ba07fe8a20fb9bfe3b6833c6a42b3d986c`、support `dbb7b07323ac41f6fc9334f1361820102106473e7a564fd9c5c8863298f3f5f3`。原稿本文と承認フラグは変更せず、後続の差込設定では上記ホスティング説明だけを追加しました。

## 2026-09-20：承認・公開・URL接続の完了

所有者が `output/public-pages-review-v2/` の本文を確認し、公開運営者名 `Hirotaka Monya`、問い合わせメール `better122@icloud.com`、GitHub Pages公開を明示承認しました。公開差込値を入力し、適用日を2026-09-20としました。未指定の著作権者は省略しています。

外部ページ・メール送信ではブラウザー／メールアプリを通じた通信が発生すること、問い合わせ内容を対応に利用すること、公開窓口がiCloudメールを利用すること、保存・削除相談を同じ窓口で受け付けることを記載しました。固定保存日数・完全匿名化・削除完了の保証は追加していません。

`publicInformationApproved=true` を実際の承認に基づき設定しました。所有者がページ公開とproduction監査を分けたため、builderの公開条件は公開承認に限定し、`productionPrivacyReviewConfirmed=false` を生成記録にも残しました。この区別と著作権者省略を含む生成器８テストはPASSです。

公開コミットは `374e2f232c325f6fedc98cd5d4beca23c68c3b7b`。HTML２枚・CSS１枚だけを専用 `gh-pages` から配信しました。匿名HTTPS GETで両ページ・CSSの200、認証なし、リダイレクトなし、承認済みバイトとの一致を確認しています。レスポンスのSet-Cookieは観測されませんでしたが、GitHubのアクセスログがないという意味ではありません。[公開URLと詳細記録](github-pages.md)を参照してください。

公開確認後に `PUBLIC_PAGES` の両URLを有効化しました。実際の設定値をモックせず実 `SettingsScreen` から `Linking.openURL` に同じ２URLが渡ること、描画だけで開かないことを検査しています。関連６スイート30テスト、型検査、対象LintはPASSです。URL未設定時の非表示、失敗時の日本語案内、既存の診断コピーとリセットの独立性も維持しています。

本編、音、保存、Bundle ID、package/lock/app/eas/Metroの保護６ファイルは変更していません。今回の検証で署名済みproduction IPA、実機上のブラウザー遷移・復帰、問い合わせメールの受信、SDK/OSを含む実通信、ASC申告・審査提出を確認したとは扱いません。アプリのリンク変更を配布するための新しいproductionビルドと、その候補に対する監査・実機受入が残っています。

非公開の証拠は `output/public-pages-final-evidence/`（公開素材と別ディレクトリ）と `.expo/public-pages-app/published/` に保存しています。旧監査の253ファイル一致やURL nullの記述は、上記追加前の時点の記録です。
