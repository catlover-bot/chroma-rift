# 錯視館 — 所有者の一括確認票

2026-09-19に作成、2026-09-20に公開ページの承認・公開結果を反映。既存の公開用設定・文書に承認済みの値が見つからなかった項目をまとめたものです。未入力でもローカルの改名・検査・原稿作成は進めます。Gitの著者情報、過去のApple/Expoログイン情報、技術識別子を公開窓口へ転用していません。

| 確認する項目 | 現在の状態 | 決定・記録先 |
| --- | --- | --- |
| 日本語名「錯視館」（さくしかん）の正式採用 | 提案に基づくローカル表示変更。名称の使用可能性・権利確認・公開承認はPENDING | 所有者が名称と確認結果を承認 |
| 正式な運営者表記・著作権者 | 運営者 `Hirotaka Monya` は公開承認済み。著作権者は未指定 | サイトに運営者だけを表示。著作権者は推測しない |
| 公開問い合わせ先 | `better122@icloud.com` は公開承認済み・サイト反映済み | mailtoを確認。実際のメール受信は未試験 |
| プライバシーポリシーURL | 公開済み・匿名HTTPS 200 | <https://catlover-bot.github.io/chroma-rift/privacy.html> |
| サポートURL | 公開済み・匿名HTTPS 200 | <https://catlover-bot.github.io/chroma-rift/support.html> |
| ポリシー適用日・問い合わせ情報の扱い | 適用日2026-09-20。確認済み第２版本文への公開情報差込みを承認・公開済み | GitHub PagesのIP記録、iCloud窓口、問い合わせ対応と保存・削除相談を記載。固定保存日数や削除保証は追加していない |
| App Store Connectレコード・数値Apple ID | 現行 `eas.json` に `ascAppId="6813876632"` 設定済み | 今回ASCへの接続・アップロードは行っていない。最終候補と登録先の照合は提出時に行う |
| 価格・配信地域・カテゴリ | PENDING | 無料・全世界を仮決定しない。[ストア原稿](store-metadata-ja.md)の案を承認 |
| ストア説明・サブタイトル・年齢質問票 | PENDING | 実装・ホラー表現に沿って承認。年齢の数値を独断で確定しない |
| 審査連絡先 | PENDING（非公開） | App Store Connectの審査欄へ直接入力。氏名・電話・個人メール等をこのGitへ記入する必要はない |
| 公開時期 | PENDING | 審査承認後の手動公開は提案。所有者が決定 |

公開ページの入力用雛形は [static/public-fields.json](static/public-fields.json)。今回承認された公開情報を入力済みです。未指定の著作権者だけは `null` のままです。架空URL・空のmailto・仮の運営者を製品へ入れません。入力は公開情報のみとし、認証情報・Appleパスワード・API秘密鍵・証明書は保存しません。

別途必要な技術確認は[提出チェックリスト](submission-checklist.md)と[最新プライバシー監査](privacy-support-audit.md)を参照してください。所有者の承認だけで未実施のproductionビルド、SDK確認、実機試験が合格になるわけではありません。

`NAME_AND_METADATA_APPROVAL=PENDING`、`PUBLIC_POLICY_AND_SUPPORT=PUBLISHED`、`APP_REVIEW_READY=false`。

公開承認・実行・匿名到達の根拠は[GitHub Pages公開記録](github-pages.md)。`productionPrivacyReviewConfirmed=false` を維持し、名称の権利、価格等の未決定項目を今回のページ承認で一括承認していません。
