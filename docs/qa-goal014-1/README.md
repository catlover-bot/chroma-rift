# Goal 014.1 — ローカル検証資料

`DEVICE_ACCEPTANCE=PENDING`、`RELEASE_READY=false`。開始HEAD `393e58e59d73a65455b423d3aba9fdefe6c6d8de`、作業場所 `/home/mhirotaka/workspace/chroma-rift-goal012`、ブランチ `fix/goal-014-1-audio-and-player-ui`。

本編の音楽・環境音・効果音を含む遷移と、日本語の通常画面／明示的なサポートを修正した。報告されたiPhoneの無音原因を一つに断定せず、再現できたコード不整合、採用native実装からの仮説、実機未確認を分ける。全体の説明は [GOAL-014-1.md](../GOAL-014-1.md)。

| 資料 | 何を示すか |
|---|---|
| [開始点](baseline.json)・[baseline check](baseline-check.json) | cleanな開始点、祖先・設定・ソースhash、126 suites / 1,286 tests |
| [全体check・環境・App音声](final-checks/README.md) | 134 suites / 1,327 tests、lint、型検査、iOS export。実Screenが次エリアへ進める音声回帰、19入場後の解放。Doctor／auditの未合格も保存 |
| [音声検証](../AUDIO-TRANSITION-VERIFICATION.md)・[focused記録](audio/verification.json) | 共有session契約fakeと採用Swiftの対応、失敗前後、曲の障害分離、遅延・逆順完了、音量、ループ、bounded recovery |
| [4 exports](exports/README.md) | preview Hermes／preview JS／production JS／development JSの同梱28音源、source・Three・実Metro、compiled profile |
| [文字監査](../PLAYER-TEXT-AUDIT.md) | 通常Text／a11y／Alert／domain／保存／3D掲示の旧文→新文と、権利・正式名称・明示詳細の例外 |
| [通常UI・サポート](player-ui/README.md) | preview／productionともDEV=false、初期非表示→開く→コピー→閉じる。320幅・文字2倍と390幅、32条件 |
| [変更前後の通常画面](player-ui-comparison/README.md) | 基準393e58eの依存51ファイルと現行55ファイルを分離し、同じ条件で8組を比較。旧marker・ハプティクス・Development Build説明と変更後の日本語 |
| [5エリアHUD](stage-scene-hud/README.md) | 実SceneとHUD、操作中／条件不足／確定後／低負荷など102条件。代表画像28枚 |
| [全編の場面動画](app-replay/README.md) | 01→02→03、04→05→屋外→結末。809フレーム・161.8秒。手動gate通知、無音、結末静止保持という範囲を明記 |
| [実Screen遷移・保存再開の動画](player-resume-app/README.md) | 01→02／02→03の自然なScreen完了、02で同一ownerのpause/resume、実保存を別プロセスで再開。18.4秒・92フレーム、途中攻略省略、無音 |
| [r8 framebuffer](native-framebuffer/README.md) | 採用Three・鏡・補正を使う19ケース、14判定。旧BACKエラー、現行補正、資源解放 |

音声のApp回帰はGL提示成功とexpo-audio APIだけを代替する。全編場面動画は別の視覚資料で、同じ音声回帰を撮影したものではない。追加の再開動画では実Screenの完了通知からAppを進め、同じ音声fixtureの状態も記録する。両方の動画は無音で、音を後付けしてnative修正の証拠にはしていない。Software WebGLやCSSは、iPhoneのAVAudioSession・実聴・Yoga・VoiceOver・実指操作・GPU性能・発熱を証明しない。

実装コミットは `e2af6eb`（音声の共有所有と障害分離）と `6186a5e`（通常文言とサポート、Screen復旧順序、実App回帰）。先に取得した記録にはcapture当時のHEAD `393e58e` が残るが、未コミット修正を含む実ファイルhashで対応を検証しており、古いHEADだけを根拠に検証したものではない。

[最終ソース対応](source-correspondence.json) は、全体checkの530入力が現在も一致し、その後の追加が独立検査したQAツール2本だけであることを示す。全532ファイルをGitの記録対象と照合し、製品・テスト・設定・資産455ファイルは実装コミット `6186a5e` と一致する。保護6ファイルと基準assets42ファイルも不変。[要件別監査](acceptance-audit.md) と [総合manifest](manifest.json) から各結果を追跡できる。

途中の失敗・警告は圧縮ログに保持する。`manifest.json`のhashは圧縮されたファイル自身、`uncompressedSha256`がある場合は展開後の原文を表す。再現コマンドは各資料に記載し、大きな中間export・全フレームは `.expo/goal014-1/` に保存する。これはゲーム保存とは別であり、中間QAだけの削除でプレイ記録を初期化しない。

実機手順は [IPHONE_VALIDATION.md](../IPHONE_VALIDATION.md) 冒頭の現行候補案内とGoal014.1節を使用する。新しい同梱preview・署名・インストール・push・PR・公開はこのローカル作業では行っていない。
