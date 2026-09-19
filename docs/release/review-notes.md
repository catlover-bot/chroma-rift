# App Review用の日英メモ

貼り付け用原稿：[review-notes-ja-en.txt](review-notes-ja-en.txt)。日本語と英語の合計は**3,478 UTF-8バイト**（末尾改行込み）。[AppleのNotes上限4,000バイト](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information)を2026-09-19に確認し、[計測結果](metadata-validation.json)に原稿ハッシュを記録した。ゲーム内の英語UI追加ではない。

これはローカルで実装を確認した進め方。最終productionを受け入れた記録ではない。同じ提出ビルドで経路とラベルを照合してから貼り付ける。

| 原稿の説明 | 実装根拠 |
| --- | --- |
| ログイン不要、第一章開始、操作説明 | [App.tsx](../../App.tsx)、[ホーム](../../src/screens/ChapterOneHomeScreen.tsx)、[操作説明](../../src/screens/PlayInstructionsScreen.tsx)。通常経路に認証画面やアカウント条件はない。 |
| 01〜03の装置・退避・出口 | [通常経路](../../test-support/naturalChapterRoute.ts)の`finishGallery`、`finishVault`、`finishTheatre`。実装済み操作だけを案内する。 |
| 04のキー・練習・歯止め・実際の歩行による出口 | [状態更新](../../src/domain/stages/mirror-corridor-v1/session.ts)、[説明選択](../../src/domain/stages/mirror-corridor-v1/selectors.ts)。最終段の保持解除は自動で、旧出口ボタンを案内しない。 |
| 04の接触後の復帰 | [巡回体](../../src/domain/stages/mirror-corridor-v1/actor.ts)、[復帰場所](../../src/domain/stages/mirror-corridor-v1/definition.ts)、[提示後の復帰処理](../../src/rendering/firstPerson/runtimeController.ts)。未確定の保持時間まで保存すると説明しない。 |
| 05の全身収容・敷居・隔離・停止・屋外歩行 | [共通判定と説明](../../src/domain/stages/departure-control-v1/selectors.ts)、[状態更新](../../src/domain/stages/departure-control-v1/session.ts)。単にベルを押すだけで終了とはしない。 |
| 音・怖さ・簡単操作 | [設定](../../src/screens/SettingsScreen.tsx)。標準と控えめの出口条件は同じ。音の実機品質は受入項目に残す。 |
| 任意に開く診断／コピーのみ | [サポート詳細](../../src/screens/SupportInformation.tsx)。送信ボタンや自動問い合わせを案内しない。[現行監査](privacy-support-audit.md)参照。 |
| 第二章は案内のみ | [章定義](../../src/domain/campaign/definition.ts)と[ホーム](../../src/screens/ChapterOneHomeScreen.tsx)。開始・購入・ダウンロード経路なし。 |

審査用の氏名・メール・国番号付き電話はASCの非公開App Review Informationへ所有者が直接入力する。公開サポート連絡先とは別の項目。[所有者確認票](owner-confirmation.md)には承認状態を記録し、個人情報やパスワードをこの原稿やGitへ追加しない。現行アプリに不要なテストアカウント、解除コード、隠しクリア手順は用意していない。
