# 錯視館 — 所有者の一括確認票

2026-09-19。既存の公開用設定・文書に承認済みの値が見つからなかった項目をまとめたものです。未入力でもローカルの改名・検査・原稿作成は進めます。Gitの著者情報、過去のApple/Expoログイン情報、技術識別子を公開窓口へ転用していません。

| 確認する項目 | 現在の状態 | 決定・記録先 |
| --- | --- | --- |
| 日本語名「錯視館」（さくしかん）の正式採用 | 提案に基づくローカル表示変更。名称の使用可能性・権利確認・公開承認はPENDING | 所有者が名称と確認結果を承認 |
| 正式な運営者表記・著作権者 | PENDING | 公開してよい名称だけを指定 |
| 公開問い合わせ先 | PENDING | 実際に受信できる公開専用メール、またはHTTPS問い合わせページ。審査担当者個人の連絡先とは別 |
| プライバシーポリシーURL | PENDING | 所有者が管理する実在HTTPSページ。本文承認と公開後の到達確認が必要 |
| サポートURL | PENDING | 所有者が管理する実在HTTPSページ。連絡方法を掲載 |
| ポリシー適用日・問い合わせ情報の扱い | PENDING | 利用目的、保持期間、削除依頼への対応、メール/フォーム/ホスティング委託先と保護、アクセスログ等を承認。候補本文は[プライバシー原稿](privacy-policy-ja.md) |
| App Store Connectレコード・数値Apple ID | PENDING | 既存Bundle ID `com.hirotakam.chromarift` のレコード有無を所有者が確認。`ascAppId` はEAS UUIDやチームIDではない |
| 価格・配信地域・カテゴリ | PENDING | 無料・全世界を仮決定しない。[ストア原稿](store-metadata-ja.md)の案を承認 |
| ストア説明・サブタイトル・年齢質問票 | PENDING | 実装・ホラー表現に沿って承認。年齢の数値を独断で確定しない |
| 審査連絡先 | PENDING（非公開） | App Store Connectの審査欄へ直接入力。氏名・電話・個人メール等をこのGitへ記入する必要はない |
| 公開時期 | PENDING | 審査承認後の手動公開は提案。所有者が決定 |

公開ページの入力用雛形は [static/public-fields.json](static/public-fields.json)。空欄は `null` のままです。架空URL・空のmailto・仮の運営者を製品へ入れません。入力は公開情報のみとし、認証情報・Appleパスワード・API秘密鍵・証明書は保存しません。

別途必要な技術確認は[提出チェックリスト](submission-checklist.md)と[最新プライバシー監査](privacy-support-audit.md)を参照してください。所有者の承認だけで未実施のproductionビルド、SDK確認、実機試験が合格になるわけではありません。

`NAME_AND_METADATA_APPROVAL=PENDING`、`PUBLIC_POLICY_AND_SUPPORT=PENDING`、`APP_REVIEW_READY=false`。
