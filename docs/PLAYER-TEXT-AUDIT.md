# Goal014.1 プレイヤー向け表示の監査

基準は `393e58e59d73a65455b423d3aba9fdefe6c6d8de`。対象は第一章「最後の退館者」、知覚展示館のエリア01〜05。通常の操作を日本語で理解できるようにし、診断の機械用フィールドと権利表記は文脈を分けて保持する。

`DEVICE_ACCEPTANCE=PENDING`、`RELEASE_READY=false`。以下の自動テストとソフトウェア表示確認は、iPhone上の文字組み、VoiceOverの読み上げ、音の実聴を証明しない。

## 通常表示と明示サポート

`設定 → サポート → 詳しい情報 → 情報をコピー`。ホームにコード識別子や品質管理の未完了表示を常設しない。previewでも通常表示は同じ構成で、詳細は閉じた状態から始まる。

- `SupportInformation` は開く操作を受けて初めて `SupportDetails` をマウントする。閉じると診断Textは描画ツリーと読み上げ対象から外れる。設定のサポートを閉じた場合も同じ。
- preview (`__DEV__=false`) はGLの現在記録、保持した `FIRST_FAILURE`、音の独立した障害・所有者記録を取得する。既存GLレコードのトップレベルキーとschemaを維持し、`support.schemaVersion=1` の追加情報を付ける。詳細を開く／更新する／コピーする時だけ取得し、新しいポーリングは追加しない。
- productionはアプリ・ビルド識別と障害の要約を明示コピーできる。完全なGLトレース、音のイベント列、開発用ツールは表示しない。正常な現在記録を架空の `FIRST_FAILURE` に変換しない。
- `goal-014-1-audio-ja-r1` は既存 `buildIdentity` の生成経路で付け、詳細とコピーJSONにのみ出す。エラー後のホームでも独立したfailureLedgerから取得できる。画面の読み込み前に止まるnative gateも、軽量な記録を保持する。
- 既存の `boundedDiagnosticText` を依存のないplatformファイルへ移し、旧diagnostics APIから再公開した。URL、メール、ユーザーパス、認証値、UUIDの既存除去規則は維持する。サポートは音のdiagnostics leafだけを読み、owner/backend/Threeを起動するための経路にしない。
- コピーは端末内だけ。送信先・連絡先・公開ポリシーは新設／捏造しない。未提供の問い合わせ先は公開判定の残件として扱い、通常のゲーム画面を遮らない。

## 画面と経路の変更

| 出典 | 表示条件・区分 | 旧文／旧表示 | 採用文／表示 |
|---|---|---|---|
| `src/screens/ChapterOneHomeScreen.tsx`, `src/platform/buildIdentity.ts` | 通常ホーム／手動サポート | `コード goal-014-... / preview / iOS build ... / release-js` をpreviewホームに常設 | ホームから外し、サポート詳細・コピーJSONに今回の識別子を表示 |
| `ChapterOneHomeScreen.tsx` | 通常・以前の記録からの引き継ぎ候補 | 以前の記録の原文は残ります | 以前のプレイ記録は残ります |
| 同上 | 通常・引き継ぎ元を読めない／入口未提供 | 原文を保持しています | 記録はそのまま残しています。読込不可と新しく始められる範囲は保持 |
| `App.tsx` | 通常・引き継ぎ確認失敗、新しい周回、第一章のみやり直すAlert | 原文を保持／旧ステージの原文 | 以前のプレイ記録を残す／以前のエリアのプレイ記録。Alertの確認と削除・保持範囲は維持 |
| `src/screens/SettingsScreen.tsx` | 通常・設定とSwitchの読み上げ | ハプティクス／軽い触覚／サウンド | 振動／軽い振動／音 |
| 同上、`src/app/playerText.ts` | 通常・利用可能な音量がある時の実際の音の失敗 | 新しいDevelopment Buildが必要／音を再生できません | 音を再生できませんでした。音なしで探索を続けられます。音がオフ、全音量0の時は故障表示を出さない |
| `SettingsScreen.tsx` | 通常・全消去確認Alert | 旧スコア、各ステージの記録 | 以前のスコア、各エリアの記録。第一章・調整・設定・音・発見の削除範囲と確認操作は維持 |
| 同上 | 通常・サポートの説明 | 3Dの表示に失敗／問い合わせ先は公開前に確定 | 画面を表示できないときの再試行、記録保存の再試行、詳しい情報を開く案内。未提供の連絡先を捏造しない |
| 同上、`ChapterOneHomeScreen.tsx`, `App.tsx` | 内部・開発者向け経路 | ホームの旧一覧、設定直下の開発者ラボ／一人称ランタイム検証／旧検証部屋 | `__DEV__` の設定→サポート→開発用の道具に集約。preview/productionでcallbackを渡しても表示しない。旧迷宮だけの色模様設定もこの明示経路に限定 |
| `src/screens/FirstPersonScreen.tsx`, `src/app/playerText.ts` | 通常・読み込み中／画面失敗 | 部屋の描画を準備／3Dを表示できませんでした＋生のエラー、コード識別子 | 画面を準備しています。／画面を表示できませんでした。生の理由は詳しい情報の中だけ |
| 同上 | 通常・その場の表示再試行 | 確定済みの進行を保ち、安全な再開位置から描画を作り直します | 進行を保ち、安全な場所から再開します。直前の未保存位置や最終ディスク保存と同一とは約束しない |
| 同上 | 通常・再試行上限後 | 診断を確認してホームへ戻れます | 今回はこれ以上やり直せません。詳しい情報を確認するか、ホームへ戻れます。保持済み障害は再試行後／ホーム後にも取得可能 |
| `src/rendering/firstPerson/canvasLifecycle.ts` | 通常・画面失敗の共通メッセージ | 部屋の描画を確認できませんでした。再試行するか… | 画面を表示できませんでした。もう一度試すか、ホームへ戻ってください。reasonCodeは保持 |
| `src/screens/NativeFirstPersonGate.tsx` | 通常・native moduleがない／画面mount失敗／準備 | 3D対応の開発版が必要／新しいDevelopment Build／迷宮を準備 | 画面を表示できませんでした。ホームへ戻って、もう一度お試しください。／画面を準備しています。技術的な理由は手動サポートのみ |
| `src/screens/CalibrationResultScreen.tsx` | 通常・詳しい調整結果 | プロファイル／内部分類ID付きのラベル | 見え方の傾向／日本語のラベル。保存する分類IDは変更しない |
| `src/screens/PlayInstructionsScreen.tsx` | 通常・操作案内 | 展示体の気配と巡回 | 巡回体の気配と巡回。現行の正式名に統一 |
| `src/screens/StageResultScreen.tsx` | 内部経路の旧結果画面 | Depth Assist | 補助表示。正解や成績の判定は変更しない |
| `src/screens/SupportInformation.tsx` | 手動サポート | 診断情報をコピー／診断を閉じる | 情報をコピー／詳しい情報を閉じる。コピー成功・失敗は日本語で通知。更新は手動 |
| `src/components/Layout.tsx` | 通常・小さい幅で文字を拡大した設定の選択肢 | 長い選択ボタンの幅に親要素の上限なし | 共通ボタンを親幅までに制限し、日本語を省略せず折り返す。最小48ptと操作は維持 |

## 変更不要と判断した通常表示と例外

| 出典 | 対象・区分 | 監査結果 |
|---|---|---|
| `ChapterOneHomeScreen.tsx`, `src/domain/campaign/definition.ts` | 通常・開始、続き、到達、発見、第二章 | 第一章、エリア01〜05、第二章の将来案内を維持。第二章を起動する経路を追加しない |
| `FirstPersonScreen.tsx` と各domain selector | 通常・5エリアの目標、対象、操作中、条件不足、成功、一時停止 | 現在状態からの対象名と次の一手を維持。内部reason/stateは保存・判定用、表示文は日本語selectorを使用。エリア05の「ベイ」は下表の通り修正 |
| `QuickSetupScreen.tsx`, `CalibrationInstructionsScreen.tsx`, `CalibrationScreen.tsx`, `firstPersonControlMode.ts` | 通常・見え方調整とa11y | 問い、選択、強さ、回答変更、中断、入力の説明は日本語。刺激の光学値や分類しきい値を変更しない |
| `CampaignStageNotebook.tsx`, `DiscoveryNotebook.tsx`, `VaultNotebook.tsx`, `TheatreNotebook.tsx` | 通常・発見ノート、比較操作、slider読み上げ、取得物 | 日本語の名前・操作・比較説明を保持。現在状態の発見だけを表示。increment/decrement等はOSの機械用action名で、読み上げlabelは増やす／減らす |
| `ChapterOneEndingScreen.tsx` | 通常・余韻、結末、クレジット、戻る | 日本語の物語と第一章完了を維持。文字変更のために12秒の余韻やfresh pressによるスキップ条件を変更しない |
| `ChapterOneHomeScreen.tsx`, `ChapterOneEndingScreen.tsx`, `SettingsScreen.tsx` | ブランド | `CHROMA RIFT` はタイトルロゴ・正式名として保持 |
| `FirstPersonScreen.tsx`, `firstPersonControlMode.ts` | OS機能名 | `VoiceOver` は操作方法が変わる理由を説明する正式名称として保持 |
| `FirstPersonScreen.tsx` | 内部／明示サポート | 「箱が見えない：生のGLを確認」は `__DEV__` のproof操作だけ。通常HUDとpreview/productionには出さない。`checkpoint` はrestoreOrigin JSON enumだけ |
| `NativeFirstPersonGate.tsx` | 明示サポート | `native screen boundary`、`ExpoGL native module is unavailable` はsanitized障害レコードだけ。通常のText／a11yには出さない |
| `DeveloperLabScreen.tsx`, `StageSelectScreen.tsx`, `WelcomeScreen.tsx`, 旧迷宮／旧結果画面 | 内部・互換性経路 | 旧コンテンツを削除せず、明示した開発用経路からのみ到達。通常製品の章・エリアとは区別。ラボの技術説明は通常文字列検査の対象外としてファイル単位で明示 |

## 検証と限界

- `playerTextStaticAudit.test.ts` はAppと画面の実ソースをTypeScript ASTで調べ、文字列・JSXTextに実装語が復活しないか検査する。import、既存restoreOrigin enum、4つのファイル＋完全一致文言だけを例外にする。英字全体の削除はしない。
- `playerTextAudit.test.tsx` は実際にrenderしたhost Text、accessibilityLabel/Hint/value/actionsと実Alertのtitle/body/buttonsを収集する。preview/productionを明示し、ホーム、設定の全情報パネル、破壊的操作の確認、結末・権利、4種類の調整結果を調べる。320×568・fontScale2も入力するが、Jestはnativeの文字測定をしない。
- `playerSupport.test.tsx` はpreview/productionの初期非表示、明示詳細、コピー、最新情報の再取得、閉じるとraw Textが消えること、GLキーの互換性、production要約、音オフ／全音量0を故障扱いしないことを検査する。
- `nativeGateSupport.test.tsx` はmodule不在と画面mount例外を実際の境界で発生させ、ホーム相当のunmount後にもsanitized記録を取得できることを検査する。
- `chapterOneAppFlow.test.tsx` は実Appで再試行上限→ホーム→設定→サポート→詳細を通し、最初の失敗と保存済み進行を保持することを検査する。`stageFlow`/`journeyFlow` は新しい明示開発経路でも旧画面・保存の互換性を確認する。
- 画面のGL失敗・5エリアHUD・操作中と動的reasonは既存の画面/controller回帰と今回のFirstPersonScreen回帰を併用する。静的検査だけで全状態を網羅したとは扱わない。
- [ソフトウェアCSSレイアウト画像・測定](qa-goal014-1/player-ui/README.md)は32条件、1,840のText、928の個別ボタン確認。実行条件とsource hash、近似の限界を記録した。native Yoga、safe-area、VoiceOverの実機評価とは区別する。
- [基準393e58eとの画面比較](qa-goal014-1/player-ui-comparison/README.md)はホーム／設定の8組。基準の全first-party依存51ファイルを分離したgit blobから読み、同じpreview・DEV=false・幅／文字倍率／設定で現行と比較した。旧版の横はみ出しや技術表示を修整せず残し、通常ホームのmarker除去、振動／音／音失敗の日本語を確認した。

## Domain・保存・3D文字の監査追補

開始点: `393e58e59d73a65455b423d3aba9fdefe6c6d8de`。通常文言のみ変更。内部識別子、保存キー、codec、数値、判定条件、形状、音源、権利の原文は変更しない。

## 変更した文言

| 出典 | 表示条件・区分 | 旧文 | 採用文 |
|---|---|---|---|
| `src/domain/calibration/scoring.ts:105` | 通常：詳しい見え方の調整結果。結果画面が型付きラベルと説明を表示。 | 赤が手前に見える回答が一貫していました。赤を主な前景ルートにします。 | 赤が手前に見える回答が一貫していました。この見え方に合わせて色の表示を調整します。 |
| `src/domain/calibration/scoring.ts:106` | 通常：詳しい見え方の調整結果。結果画面が型付きラベルと説明を表示。 | 青が手前に見える回答が一貫していました。青を主な前景ルートにします。 | 青が手前に見える回答が一貫していました。この見え方に合わせて色の表示を調整します。 |
| `src/domain/calibration/scoring.ts:112` | 通常：詳しい見え方の調整結果。結果画面が型付きラベルと説明を表示。 | 赤が手前（RED_FRONT） | 赤が手前 |
| `src/domain/calibration/scoring.ts:113` | 通常：詳しい見え方の調整結果。結果画面が型付きラベルと説明を表示。 | 青が手前（BLUE_FRONT） | 青が手前 |
| `src/domain/calibration/scoring.ts:114` | 通常：詳しい見え方の調整結果。結果画面が型付きラベルと説明を表示。 | 見え方が変化（VARIABLE） | 見え方が変化 |
| `src/domain/calibration/scoring.ts:115` | 通常：詳しい見え方の調整結果。結果画面が型付きラベルと説明を表示。 | 穏やかな奥行き（SOFT_DEPTH） | 穏やかな奥行き |
| `src/domain/stages/departure-control-v1/selectors.ts:24` | 通常：エリア05の隔離扉が動作中／安全な操作側の外から閉鎖を試みた場合のヒントと拒否理由。 | 扉の動きが終わるまで、操作ベイで見届ける。 | 扉の動きが終わるまで、制御盤のそばで見届ける。 |
| `src/domain/stages/departure-control-v1/selectors.ts:53` | 通常：エリア05の隔離扉が動作中／安全な操作側の外から閉鎖を試みた場合のヒントと拒否理由。 | 制御ベイの安全側へ戻る。 | 制御盤のある安全な側へ戻る。 |
| `src/domain/stages/departure-control-v1/binding.ts:28` | 通常：エリア05の隔離扉への操作が安全側の条件を満たさない場合の返答。 | 制御ベイの安全側へ戻る。 | 制御盤のある安全な側へ戻る。 |
| `src/content/illusionNotes.ts:28` | 権利：発見ノートで音の錯覚を選び、素材の説明を表示。正式な文献名・作者・URLは保持。 | 本作の事前合成WAV。資料サイトの音声・コードは使用していません。 | 本作で制作した音です。資料サイトの音声・プログラムは使用していません。 |
| `src/storage/chapterOneStorage.ts:55` | 通常：第一章の読込中にプレイ状態が切り替わった場合／保存記録を読めない場合。Appが通知を表示。 | 読み込み中にセッションが切り替わりました。 | 読み込み中にプレイの状態が切り替わりました。 |
| `src/storage/chapterOneStorage.ts:64` | 通常：第一章の読込中にプレイ状態が切り替わった場合／保存記録を読めない場合。Appが通知を表示。 | 第一章の記録を読み込めませんでした。原文を保持し、自動保存を停止しています。 | 第一章の記録を読み込めませんでした。以前のプレイ記録を残し、自動保存を停止しています。 |
| `src/storage/moduleStageStorage.ts:44` | 通常：エリア04・05などの個別記録を読み込めず、そのエリアの自動保存を止めた場合。 | このステージの保存を読み込めませんでした。元のデータを保持し、この章の自動保存を停止しています。 | このエリアの記録を読み込めませんでした。以前のプレイ記録を残し、このエリアの自動保存を停止しています。 |
| `src/storage/stageJournalStorage.ts:46` | 通常：到達・発見履歴を読み込めず履歴更新を停止した場合。各エリアの進行保存は別に保護。 | ステージ履歴を読み込めないため、履歴の更新を停止しています。元の記録と各章の保存は保持しています。 | エリアの履歴を読み込めないため、履歴の更新を停止しています。以前の記録と各エリアの保存は残っています。 |
| `src/storage/firstPersonStorage.ts:140` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 新しい版の紋章記録を保持しています。読み込める章の進行で再開しますが、この章の変更は保存されません。 | 新しい版の紋章記録を残しています。読み込める進行で再開しますが、このエリアの変更は保存されません。 |
| `src/storage/firstPersonStorage.ts:142` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 章の記録を読み込めませんでした。元の記録を保持し、安全な地点から始めます。この章の進行は保存されません。 | エリアの記録を読み込めませんでした。以前の記録を残し、安全な場所から始めます。このエリアの進行は保存されません。 |
| `src/storage/firstPersonStorage.ts:146` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 操作案内の記録を読み込めませんでした。章の進行と操作設定はそのまま使えます。 | 操作案内の記録を読み込めませんでした。プレイの進行と操作設定はそのまま使えます。 |
| `src/storage/firstPersonStorage.ts:150` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 保存位置を安全なチェックポイントへ戻しました。 | 保存位置を安全な場所へ戻しました。 |
| `src/storage/firstPersonStorage.ts:233` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 操作案内の記録を読み込めませんでした。章の進行と操作設定はそのまま使えます。 | 操作案内の記録を読み込めませんでした。プレイの進行と操作設定はそのまま使えます。 |
| `src/storage/firstPersonStorage.ts:237` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 一人称の保存領域を読み込めませんでした。読み込めなかったデータへの保存を停止しています。 | プレイ記録を読み込めませんでした。読み込めなかった記録の更新を停止しています。 |
| `src/storage/firstPersonStorage.ts:248` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 読み込み中に章の状態が切り替わりました。 | 読み込み中にプレイの状態が切り替わりました。 |
| `src/storage/firstPersonStorage.ts:255` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 読み込み中に保存データがリセットされました。 | 読み込み中に記録の消去が始まりました。 |
| `src/storage/firstPersonStorage.ts:450` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 展示室の記録を読み込めませんでした。元の記録を保持し、この章の変更は保存しません。新規に始める場合は、この章だけをリセットしてください。 | 展示室の記録を読み込めませんでした。以前の記録を残し、このエリアの変更は保存しません。新しく始める場合は、このエリアだけをはじめからやり直してください。 |
| `src/storage/firstPersonStorage.ts:471` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 以前の展示室の記録を読み込めませんでした。元の記録を保持し、この章の変更は保存しません。 | 以前の展示室の記録を読み込めませんでした。以前の記録を残し、このエリアの変更は保存しません。 |
| `src/storage/firstPersonStorage.ts:481` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 読み込み中に章が切り替わりました。 | 読み込み中にエリアが切り替わりました。 |
| `src/storage/firstPersonStorage.ts:489` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 展示室の保存領域を読み込めませんでした。元のデータを保持し、保存を停止しています。 | 展示室の記録を読み込めませんでした。以前の記録を残し、保存を停止しています。 |
| `src/storage/firstPersonStorage.ts:567` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 収蔵庫の記録を読み込めませんでした。元の記録を保持し、この章の変更は保存しません。新規に始める場合は、この章だけをリセットしてください。 | 収蔵庫の記録を読み込めませんでした。以前の記録を残し、このエリアの変更は保存しません。新しく始める場合は、このエリアだけをはじめからやり直してください。 |
| `src/storage/firstPersonStorage.ts:580` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 読み込み中に章が切り替わりました。 | 読み込み中にエリアが切り替わりました。 |
| `src/storage/firstPersonStorage.ts:588` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 収蔵庫の保存領域を読み込めませんでした。元のデータを保持し、保存を停止しています。 | 収蔵庫の記録を読み込めませんでした。以前の記録を残し、保存を停止しています。 |
| `src/storage/firstPersonStorage.ts:662` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 影の映写室の記録を読み込めませんでした。元の記録を保持し、この章の変更は保存しません。新規に始める場合は、この章だけをリセットしてください。 | 影の映写室の記録を読み込めませんでした。以前の記録を残し、このエリアの変更は保存しません。新しく始める場合は、このエリアだけをはじめからやり直してください。 |
| `src/storage/firstPersonStorage.ts:675` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 読み込み中に章が切り替わりました。 | 読み込み中にエリアが切り替わりました。 |
| `src/storage/firstPersonStorage.ts:683` | 通常：個別エリアの読込失敗・安全な位置への復帰・読込中の状態切替・記録消去。分岐と保存範囲は変更なし。 | 影の映写室の保存領域を読み込めませんでした。元のデータを保持し、保存を停止しています。 | 影の映写室の記録を読み込めませんでした。以前の記録を残し、保存を停止しています。 |
| `src/storage/applicationStorage.ts:250` | 通常：設定を含む記録の読込失敗・引継ぎ保存失敗・読込中の記録消去。データ保護と保存停止は変更なし。 | 保存データを読み込めませんでした。元のデータは保持しています。この起動中の変更は保存されません。 | 保存した記録を読み込めませんでした。以前の記録は残っています。今回は変更を保存できません。 |
| `src/storage/applicationStorage.ts:278` | 通常：設定を含む記録の読込失敗・引継ぎ保存失敗・読込中の記録消去。データ保護と保存停止は変更なし。 | 保存データを読み込めませんでした。元のデータは保持しています。この起動中の変更は保存されません。 | 保存した記録を読み込めませんでした。以前の記録は残っています。今回は変更を保存できません。 |
| `src/storage/applicationStorage.ts:308` | 通常：設定を含む記録の読込失敗・引継ぎ保存失敗・読込中の記録消去。データ保護と保存停止は変更なし。 | 読み込み中に保存データがリセットされました。 | 読み込み中に記録の消去が始まりました。 |
| `src/storage/applicationStorage.ts:316` | 通常：設定を含む記録の読込失敗・引継ぎ保存失敗・読込中の記録消去。データ保護と保存停止は変更なし。 | 設定の移行を保存できませんでした。以前のデータは保持しています。 | 引き継いだ設定を保存できませんでした。以前の記録は残っています。 |
| `src/storage/applicationStorage.ts:322` | 通常：設定を含む記録の読込失敗・引継ぎ保存失敗・読込中の記録消去。データ保護と保存停止は変更なし。 | 保存領域を読み込めませんでした。この起動中の変更は保存されません。 | 保存した記録を読み込めませんでした。今回は変更を保存できません。 |

## 維持した掲示・正式表記・内部情報

| 出典 | 条件・区分 | 現行文・判断 |
|---|---|---|
| `src/rendering/firstPerson/facilitySignData.ts; scripts/generate-facility-signs.cjs` | 通常：実際の館内3D掲示に使う18枚のマスク | 練習 — 重りを上げる／巻き上げ機 Ⅰ・Ⅱ・Ⅲ／隔離キー／鈴 → 全身収容 → 隔離 → 停止／収容区画 呼び鈴／隔離扉／閉館制御 停止／収容区画／職員出口／未収容／全身収容を確認／隔離済み／在館反応／01 展示室／02 収蔵庫／03 映写室／04 鏡越しの回廊／05 退館制御室。既に日本語。歯止めのローマ数字・矢印・エリア番号は意味を持つ記号として保持。 |
| `src/rendering/firstPerson/destinationSignData.ts; scripts/generate-destination-signs.cjs` | 通常：エリア移動先の3D掲示に使う3枚のマスク | 02 収蔵庫／03 映写室／04 鏡越しの回廊。既に日本語。 |
| `src/rendering/firstPerson/FacilityDetails.tsx:76; facilitySigns.ts; destinationSigns.ts` | 通常：Scene所有のDataTextureへマスクを展開 | 英語のmesh名・sign IDは画面上の文字ではない。ラベルの字形は日本語マスク由来。ランタイムのフォント依存や画像の再生成は導入しない。 |
| `src/domain/stages/mirror-corridor-v1/selectors.ts; departure-control-v1/selectors.ts; departure-control-v1/copy.ts` | 通常：エリア04・05の目標・対象名・結果・拒否理由 | キー取得・練習・歯止め数・収容・隔離・停止・屋外への移動を現在の状態から説明。機械用reason/state/feedbackRevisionは表示文と別の型付き値として保持。操作しました／まだできませんへの縮退なし。 |
| `src/content/illusionNotes.ts; src/content/vaultNotes.ts; DiscoveryNotebook.tsx:135; VaultNotebook.tsx:50` | 権利：ノートの現象資料・素材説明を明示的に表示 | Pyllusion、Michael Bach、Shepard、Simonet & Campbell、Hybrid Images等の正式文献・作者名、Hollow face illusion.stl、Wael Tsar、cmglee、CC BY 4.0、MIT、正式URL、必要な改変説明は例外として保持。 |
| `src/rendering/firstPerson/RawGLProof.tsx; src/domain/firstPerson/labRuntime.ts; src/domain/stages/stage-kit-probe/definition.ts` | 内部／手動サポート：GL検証・旧検証室・非プレイヤー向けprobe | GLの確認描画／検証扉／Stage Kit 確認室。通常経路の除外はApp/Screen側が管理。文字列の存在のみで通常の漏出とは判定しない。 |
| `src/domain/calibration/types.ts; src/storage/applicationStorage.ts; src/domain/stages/departure-control-v1/selectors.ts` | 内部：保存・分類・状態判定 | RED_FRONT/BLUE_FRONT/VARIABLE/SOFT_DEPTH、schemaVersion、chapterId、unsafeSideなどはコードと保存形式の識別子として維持。表示用ラベルだけを変更。 |
| `src/domain/emblem/color.ts:11` | 通常：色表示の中立的な選択肢名 | 表示A／控えめ／表示B。英語説明・内部語ではない比較記号であり、光学値の優劣を意味しない。画面担当と比較記号の例外として保持することを確認済み。 |

## 検証境界

- 実際のstorage読込・復帰・保存保護とエリア05 controller操作を実行し、返却文言も確認。最初の6スイート71テスト PASS。追加のapplication storage 28テストと対象ファイルlintもPASS。
- 既存の日本語掲示生成器を `--check` で実行し、18枚＋3枚の生成字形とチェックイン済みマスクがバイト単位で一致。実機での視認性やnative描画の確認を意味しない。
- 詳細調整結果の実レンダリング・accessibility・サポートの露出境界は画面担当の検証対象。画面失敗のcanvasLifecycle文言はroot担当。
- ログ: `.expo/goal014-1/domain-text/`。
