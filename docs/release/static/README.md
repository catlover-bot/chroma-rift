# 公開ページのローカルソース

本文の原本は上位の [privacy-policy-ja.md](../privacy-policy-ja.md) と [support-ja.md](../support-ja.md) の `PUBLIC START/END` 区間です。二重のHTML原稿は管理しません。静的HTML/CSSのみを出力し、JavaScript、広告、解析タグ、外部フォント、送信フォームを含めません。サーバーのアクセスログや問い合わせサービスの扱いは、採用する公開先で別途確認します。

ローカル下書きを確認するには、リポジトリのルートから次を実行します。

```bash
python3 docs/release/static/build-pages.py --draft --output .expo/goal015/public-pages-draft
```

生成物は公開前表示と `noindex,nofollow` を付けた未公開の資料です。`privacy.html` と `support.html` はローカルファイルとして読めます。`noindex` はアクセス制限ではないため、下書きを公開サーバーへ置かないでください。

公開準備は次の順序です。

SDK・Info.plist等の確認用production候補を先に作る必要がある場合は、審査提出しない候補として監査します。その結果で公開本文を確定し、ページの公開・アプリへのURL接続後に最終提出候補を作り直して確認します。先行候補の確認を、URL接続後の最終IPAや同一ビルドの実機受入の代わりにしません。全体の順序は[提出手順](../submission-checklist.md)に従います。

1. [一括確認票](../owner-confirmation.md)の公開情報を承認し、`public-fields.json` のコピーへ入力する。審査連絡先・認証情報は入力しない。`contactUrl` は承認済みの `mailto:` またはHTTPS問い合わせ先。名前からメールアドレスを作らない。
2. `externalDataHandling` には最終production版のSDK・外部データの監査結果、`hostingDataHandling` にはホスティングのアクセスログ・保存期間・委託先・保護、`supportDataHandling` には問い合わせの利用目的・保持期間・削除依頼・委託先・保護を、承認済みの日本語文章で記入する。これらは自動監査で埋められる値ではない。
3. 公開情報と公開内容に対応するproduction候補のプライバシー確認が済んだときだけ、対応する二つの確認フラグをtrueにする。このフラグは確認者の表明で、技術検証を代行しない。
4. `--draft` を付けず、承認済みJSONを `--config` に指定して別のローカル出力先へ生成する。欠落・仮値のある入力は失敗し、公開用ファイルを新規生成しない。既存出力先は再利用せず、以前の生成物との取り違えを避ける。
5. 所有者が承認したHTTPSホスティングへHTML2枚とCSSを公開する。このGoalではデプロイしない。認証なしの到達、証明書、本文・連絡先、スマートフォン表示、実際の問い合わせ受信を確認する。リンク切れ、リダイレクト先、ホスティング側の追加タグも確認する。
6. 同じ承認済みHTTPS URLをアプリの設定とApp Store Connectへ接続し、同じproduction候補で開けることを確認する。HTML生成だけで公開URLやアプリ内リンクの完成とは扱わない。

必要な公開情報が未提供なので、現状のJSONで公開モードは失敗するのが正しい動作です。ダミーURLや仮運営者は作りません。Python標準ライブラリだけを使い、ネットワーク接続・アップロードは行いません。
