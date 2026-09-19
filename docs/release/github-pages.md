# 錯視館 — GitHub Pages公開記録と更新手順

2026-09-20、所有者が確認した `output/public-pages-review-v2/` の本文へ、承認された運営者名 `Hirotaka Monya` と問い合わせ先 `better122@icloud.com` を反映し、公開しました。

- サポート：<https://catlover-bot.github.io/chroma-rift/support.html>
- プライバシーポリシー：<https://catlover-bot.github.io/chroma-rift/privacy.html>
- 公開コミット：`374e2f232c325f6fedc98cd5d4beca23c68c3b7b`
- 公開元：`catlover-bot/chroma-rift` の `gh-pages`、`/`（root）。`build_type=legacy`、`https_enforced=true`、独自ドメインなし。
- 公開ファイル：`support.html`、`privacy.html`、`site.css` の３件だけ。

## 実行した公開操作

アプリの作業先は `/home/mhirotaka/workspace/chroma-rift-goal012`、ブランチは `release/goal-015-japanese-app-store`、開始HEADは `201cc0955d16478b87195a5b4c3a0d1b2acf8d15` です。

公開直前、Pages APIは404、リモートの `gh-pages` は存在しませんでした。既存のPages設定や公開履歴を置き換えていません。アプリとは別の空ディレクトリ `/home/mhirotaka/workspace/chroma-rift-gh-pages` に、独立したGitリポジトリを作りました。アプリ履歴を親に持たない１コミットのブランチです。作者情報にはGitHubの公開noreplyアドレスを使いました。

承認済みの [最終生成物](../../output/public-pages-final/) から３ファイルを名前指定でコピーし、生成記録のSHA-256と照合しました。indexとコミットのファイル一覧が３件だけであることを確認して、次の通常pushを実行しました。

```sh
git -C /home/mhirotaka/workspace/chroma-rift-gh-pages push -u origin gh-pages:gh-pages
```

`main`・リリースブランチはpushしていません。履歴の強制更新、PR作成、録画・ログ・認証情報・内部文書のアップロードは行っていません。

push後にPages APIを再取得すると、既に `gh-pages` のルートを使う公開設定が現れ、ビルド中でした。作成・更新APIは呼ばず、この一致した設定を維持しました。GitHubの最終ビルドは対象コミットに対して `built`、エラーなし、完了時刻は `2026-09-19T18:55:32Z` です（日本時間2026-09-20 03:55:32）。GitHub上の公開コミットツリーも３ファイルだけであることを確認しました。

## 配信の確認

`2026-09-19T18:56:14Z`（日本時間03:56）に、認証ヘッダー・Cookie・ログインを使わないHTTPS GETで、両HTMLとCSSがHTTP 200になることを確認しました。リダイレクトなし、証明書検証有効、配信された全バイトが承認済みローカルファイルと一致しました。その応答に `Set-Cookie` はありませんでした。この観測をGitHub側のIPログ不在とは扱いません。

| ファイル | SHA-256 |
| --- | --- |
| privacy.html | `0fa21eaa86232e1760a88c7f9507140e288e121e8576bd9eddaa62f41c83adba` |
| support.html | `f72b569a846e82376c2949442bad1147c0e1c5e63abef21a835db8ee03e120e2` |
| site.css | `497903285cd667fbf92828c751b1af90519000a0699fb87579861a93044d09a6` |

本文の運営者名、メール、`mailto:better122@icloud.com`、両ページへのHTTPSリンクを確認しました。未確定欄・下書き表示・noindexはありません。生成版は320／390px幅、本文16／32pxの８条件で横溢れなし。新規プロファイルのChromiumで実HTTPSページも同じ８条件で確認しました。ページ間リンクを実クリックして両方向に計８回移動し、本文・連絡先・CSSを確認。観測されたdocument/CSS資源は同じGitHub Pages originだけでした。結果と16画像は `output/public-pages-final-evidence/live-browser/` に保存しています。メールリンクは宛先とクリック対象を確認し、メールアプリ起動・送信は行っていません。

ローカル記録：`output/public-pages-final-evidence/`。生成記録・画像・テスト・公開ツリー・API応答・匿名HTTP照合を保存しています。**このディレクトリ自体は公開していません。** 生成器の `local-build.json` の `deployed=false` は生成時点の記録であり、後続公開の根拠は `anonymous-http.json` とPagesビルド記録です。

## 承認の範囲とアプリ

`publicInformationApproved=true` は今回の明示的な公開承認です。`productionPrivacyReviewConfirmed=false` は維持しました。署名済みIPA・同梱SDK・実通信・実機受入・審査申請が終わったという意味ではありません。著作権者は指定されていないため、公開フッターへ推測で追加していません。

確認したURLを `src/app/publicPages.ts` に設定し、設定画面の「プライバシーポリシー」「お問い合わせ」から押した時だけブラウザーを開く構成です。診断情報や保存内容はURLへ付加しません。実設定と実画面を使った配線検査を含む関連６スイート30テスト、型検査、対象LintはPASSです。起動時に勝手に開かないこと、未設定なら非表示、失敗時の日本語案内も検査しました。production端末での動作確認は残件です。

**設定画面のリンクを配布版へ反映するには、新しいproductionビルドが必要です。** 今回は既存のReact Native URL起動機能を使い、ネイティブ依存・権限・Bundle ID・保存・ゲーム処理を変更していません。現行構成にはOTA更新の配信設定がなく、既存ビルドへJS変更が自動配信されることはありません。最終候補のIPA監査、同じ候補の端末でのリンク遷移・復帰と全体受入、問い合わせメールの実受信、ASCへのURL設定等は[提出チェックリスト](submission-checklist.md)で追跡します。

## 今後のページ更新

1. [本文原稿](privacy-policy-ja.md)、[サポート原稿](support-ja.md)、[公開差込値](static/public-fields.json)の変更を確定する。公開情報だけを入れ、審査連絡先や認証情報を追加しない。実態が変わる場合は本文と適用日を見直す。
2. [生成器の手順](static/README.md)で未使用ディレクトリへ最終HTML/CSSを生成し、本文・リンク・表示・３ファイルのハッシュを確認する。
3. 更新時は既存 `gh-pages` の最新リモート履歴から作業する。Pages APIでsource・独自ドメインを再確認し、他の作業で変わっていた場合はその設定を保護する。今回の独立ルートコミット作成を繰り返さない。
4. 承認した３ファイルだけを名前指定で更新し、差分を確認して通常pushする。`--force`、`--force-with-lease`、`--mirror`は使用しない。push競合時は既存の変更を比較して取り込む。
5. 対象コミットのPagesビルド完了後、匿名HTTPSで両ページとCSSを照合し、ページ間リンクと連絡先を確認する。HTML生成やpushだけで公開完了としない。

GitHub公式：[公開元の設定](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)、[Pages REST API](https://docs.github.com/en/rest/pages/pages)、[HTTPS設定](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)。今回はAPIによる設定変更やGitHub画面での残操作は不要でした。
