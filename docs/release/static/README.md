# 公開ページのローカルソース

本文の原本は上位の [privacy-policy-ja.md](../privacy-policy-ja.md) と [support-ja.md](../support-ja.md) の `PUBLIC START/END` 区間です。差込値は [public-fields.json](public-fields.json) で管理します。静的HTML/CSSのみを出力し、JavaScript、広告、解析タグ、外部フォント、送信フォームを含めません。

公開先は専用 `gh-pages` ブランチを使うGitHub Pagesです。[公開記録と更新手順](../github-pages.md)、[取り扱いの確認記録](../pages-privacy-review.md)を参照してください。2026-09-20に所有者が第２版の本文、公開運営者名 `Hirotaka Monya`、問い合わせ先 `better122@icloud.com`、GitHub Pagesでの公開を承認しました。著作権者の表記は指定されていないため省略しています。

## 生成

Python標準ライブラリだけを使用します。この生成器自身はネットワーク接続やデプロイを行いません。ローカル下書きは次のように生成します。

```sh
python3 docs/release/static/build-pages.py --draft --output output/public-pages-draft-next
```

下書きには公開前表示と `noindex,nofollow` が付きます。`noindex` はアクセス制限ではないため、下書きを公開サーバーへ置かないでください。

公開版は承認済みJSONと未使用の出力先・記録パスを指定します。

```sh
python3 docs/release/static/build-pages.py \
  --config docs/release/static/public-fields.json \
  --output output/public-pages-ready-next \
  --manifest output/public-pages-ready-next.local-build.json
```

出力先には `privacy.html`、`support.html`、`site.css` だけを置きます。内部記録は既定で `<output>.local-build.json` という外側のファイルへ保存し、`--manifest` で外側の別パスも指定できます。既存の非空出力先・シンボリックリンク・既存の記録は上書きしません。確認画像、入力JSON、ログ、録画を出力先へ追加しないでください。

## 承認と監査を分ける

公開モードは必須の公開情報、HTTPS URL、連絡先、日付と `publicInformationApproved=true` を要求します。未入力・仮値は拒否します。著作権者は任意で、未指定ならフッターを出しません。

`productionPrivacyReviewConfirmed` は最終production候補の監査記録です。今回の所有者の承認はページ公開に限られるため、**falseのまま**です。ページ生成の条件にはせず、生成記録へ実値を残します。公開版の生成、ホスティングへの公開、アプリのリンクテストを理由にtrueへ変更しません。

外部ページ・問い合わせの文章には確認できた取扱いだけを記入します。固定の保存日数、完全匿名化、外部サービスのログ削除保証は推測で追加しません。最終IPA・SDK・Info.plist・実通信の監査は[提出チェックリスト](../submission-checklist.md)の残件であり、後から実態の差が判明した場合は本文も見直します。

## 公開・検証

生成後は本文・名前・メール・相互リンクとスマートフォン表示を確認し、３ファイルのハッシュを記録します。[専用ブランチの手順](../github-pages.md)で、その３ファイルだけを公開します。HTML生成だけで公開完了とせず、認証なしのHTTPS 200、配信バイトの一致、CSS、相互リンクを確認します。

実在URLを確認してからアプリ設定へ接続します。アプリ内ボタンは押した時だけURLを開き、診断や保存情報を付加しません。公開ページはアプリ再ビルドなしで更新できますが、設定画面の変更を配布版へ届けるには新しいproductionビルドが必要です。同じ最終production版の端末で遷移・復帰を確認し、問い合わせ先への実際の受信確認も別に行います。
