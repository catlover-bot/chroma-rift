# 錯視館（さくしかん）

閉館後の知覚展示館を進む、iPhone向け一人称ホラー脱出ゲームです。色と輪郭、長さと傾き、光と影、鏡に映る背後を確かめ、仕掛けを操作しながら退館を目指します。

現在の本編は **第一章「最後の退館者」／全5エリア** です。

1. 閉館後の展示室
2. 測れない収蔵庫
3. 影の映写室
4. 鏡越しの回廊
5. 退館制御室

第一章はこの5エリアで完結します。第二章は将来の案内だけで、開始・購入・ダウンロード機能はありません。「錯視館」はローカル表示へ採用した名称案です。App Storeでの名称確保や権利確認、正式公開承認を済ませたという意味ではありません。

## 操作と保存

- 左右のドラッグで移動と見回しを同時に操作し、近くの装置を調べます。左右配置・感度・簡単なボタン操作を設定できます。
- 鏡廊の巻き上げ機は保持で進み、確定した歯止めは手を放しても残ります。危険に気づいたら棚陰へ退き、戻って作業を再開できます。開いた格子と奥の扉は自分で歩いて通ります。
- 音楽・環境音・効果音、怖さ、振動、補助表示、動きを減らす設定があります。錯覚の感じ方には個人差があり、視覚の検査・診断をするアプリではありません。
- 進行と設定は端末内に保存します。旧セーブを消す改名ではありません。読み取り不能・未知版の保存は保護し、リセットは利用者が選択・確認した場合に行います。
- 設定 → サポート → 詳しい情報から診断を開き、任意でコピーできます。コピーは自動送信ではありません。

## 開発場所と検証

今回の作業場所は `/home/mhirotaka/workspace/chroma-rift-goal012`、ブランチは `release/goal-015-japanese-app-store` です。古い `/home/mhirotaka/workspace/chroma-rift` やmainへ戻す手順ではありません。

Expo SDK57 / React Native0.86.3 / React19.2.3 / Three0.185.1 / React Three Fiber9.7.0を使用します。実際の解決版は `package-lock.json` を参照してください。新規チェックアウトでは `npm ci`、通常のローカル検証は次のとおりです。

```sh
cd /home/mhirotaka/workspace/chroma-rift-goal012
npm run check
npm run doctor
npx expo install --check
node scripts/check-runtime-cycles.cjs
```

`check` はlint・型検査・Jest・iOS JS exportです。署名済みiOSバイナリの作成、端末の描画・音・操作・VoiceOver・FPSや発熱の検証を代替しません。現在の結果と失敗履歴は [Goal015](docs/GOAL-015.md) に記録します。

## 新しいiOSビルド

今回の改名は `app.json` の表示名と日本語言語指定を変更します。端末アイコン下の名前を反映するには新しいネイティブビルドが必要です。既存の同梱previewをMetroへ接続して更新する方式ではありません。

- `development`：開発client。対応するインストール済み開発ビルドでのみ `npm run start:dev-client` を利用します。
- `preview`：internal配布の同梱ビルド。App Store提出用ではありません。
- `production`：App Store用候補。同じ候補をTestFlight等で実機確認してから、ユーザーが審査へ提出します。

Bundle ID `com.hirotakam.chromarift`、EAS projectId、slug `chroma-rift`、scheme `chromarift`、保存キーは維持します。versionは `1.0.0`、build番号は既存のremote管理とautoIncrementを使います。

公開先・必要な設定・素材がそろってからユーザーが実行するbuild/submitの正確な手順は [提出チェックリスト](docs/release/submission-checklist.md) にあります。EAS Submitはバイナリのアップロードであり、審査送信や一般公開ではありません。認証情報をリポジトリへ保存しません。

## 提出準備と現在の範囲

- [日本語ストア原稿](docs/release/store-metadata-ja.md)
- [審査用説明](docs/release/review-notes-ja-en.txt)
- [公開前の確認票](docs/release/owner-confirmation.md)
- [プライバシー原稿](docs/release/privacy-policy-ja.md) / [サポート原稿](docs/release/support-ja.md)
- [スクリーンショット計画](docs/release/screenshot-plan.md)
- [実機確認手順](docs/IPHONE_VALIDATION.md)

公開ページ・価格・地域・名称や権利の承認は、指定された値だけを確定します。ローカルのページ原稿を公開済みURLとして扱いません。正式なproductionビルド、最終スクリーンショット、同じビルドの端末評価が未確認の間は **APP_REVIEW_READY=false / RELEASE_READY=false** です。

過去の実装・検証記録は [Goal014.2](docs/GOAL-014-2.md)、[Goal014.1](docs/GOAL-014-1.md)、[Stage Kit](docs/GOAL-012.md)、[錯視と検証の区別](docs/ILLUSION-EVIDENCE.md) から参照できます。古い記録の製品名・ビルド手順・端末結果は、その時点の記録として残します。
