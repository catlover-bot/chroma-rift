# Goal014 — 第一章の「分かる・解ける・解放される」

## 作業の起点と範囲

作業場所は `/home/mhirotaka/workspace/chroma-rift-goal012`、branchは `feat/goal-014-chapter-one-polish`。cleanな `3632675e5c42ac252cca433a5e6dd45bb028f8c5` から開始し、r8実装修正 `c79a75f` とQA記録を保持した。元worktree、旧main、別のユーザー作業は変更しない。新native依存、SDK更新、設定変更、push、PR、EAS／クラウドbuild、認証、公開は行わない。

正式な表示語は第一章「最後の退館者」、巡回体、隔離キー、収容区画、職員出口。施設は現行どおり展示館と呼び、新しい固有名や物語設定を足さない。第二章は将来追加・配信時期未定の非起動案内のまま。既存5エリアと旧章・保存・権利表示を維持する。

ユーザーのr8/build3録画は04→完の一経路の根拠。今回ローカルで連続視聴、実聴、端末FPS測定したとは扱わない。指定の観察時刻02:00、02:52、07:30と終幕前後を、操作の意味、未達理由、古い目的の回帰へ変換した。

## 実装した体験

- 04/05の `ready/locked/operating/completed` selectorをHUDとcommandで共有する。先にキー、手順、全身収容、sweep、安全側、隔離、停止という条件を同じ判定で伝える。feedbackはarea/session/revision/目的/対象に帰属し、対象や進行が変わると古い文を落とす。[全41対象の対応表](GIMMICK-CLARITY.md)。
- 04は同じ輪郭から作る顔と白いキー、実壁で区切る練習台、小さい重り、床固定巻き上げ機、握り、ケーブル、3枚の歯止めにした。キーは握り下に収まり鏡を隠さない。各確定段の0.9秒の格子移動はworldとsceneで同じ値。保持取消は未確定の小数だけを捨て、確定段を保つ。右指を離した直後の新しい左操作で退避でき、古い接触から視点操作を復活させない。
- 05はキー差込口、手順用紙、実鈴、隔離レバー、停止レバーを別形状と支持構造にし、保護された操作位置から区画が見える。実鈴と配線、床境界、全身収容／未収容／隔離済み表示、枠とシールのある戸を持続的に見せる。判定は実actor包絡、戸sweep、安全側から作り、UIだけで収容を成立させない。
- 隔離後は巡回体の知覚、追跡、noise反応、捕捉を止める。停止は手→肩→頭の1.6秒、以後の能動移動なし。職員扉は同じ衝突進捗で1.2秒かけて開く。屋外へ歩くと在館01→00、即時に完了保存。4秒の外気の余韻中も歩行・視点操作でき、確定済みcheckpointは変わらない。12秒の終幕導入も保存を遅らせない。新しい押下でクレジットへ進め、background中は導入の時間を進めない。
- 01〜03へ共通material、床UV、壁と棚の構造、館内標識、巡回体、主題と各室の環境音を適用。03の2個の鈴と仕切りは独立したまま。錯視の灰色値・輪郭・主観的色・長さ／鉛直・Ames寸法/FOV・受光判定は変えない。r8鏡のGL境界、default framebuffer/BACK補正、renderer一体、提示成功の準備完了、retry/checkpoint保護を保持する。

## 巡回体と音

[実採用美術](ART-DIRECTION.md)に断面／UV／明示rig、PBR材質、照明、worldとの対応を記す。巡回体は同じdomain root・眼・足anchorを使う一体。標準20,214／低負荷6,730 triangles、20mesh、14geometry、7material、actor追加textureなし。代表408pose×2品質で既存包絡内、足接地とactive眼位置の一致を検査した。環境の新規textureはmipmap込み標準10.67MiB／低負荷2.67MiB。GPU実メモリや端末FPSと混同しない。

オリジナルD–A–E–F主題を、title_theme54秒、exploration88秒、suspicion56秒、pursuit38秒、release10秒、chapter_end62秒へ編曲した。完成mixとscore／制作script、ファイル単位の出典とhashを同梱する。音楽最大2player＋既存効果pool10、pause／background／mute／disposeで所有者を停止・解放。実area・actor・進行から状態を導出し、滞在時間とcrossfade、重要SE時のduckを使う。機械SEとAI noiseは別契約。[音源・再生成・試聴用リンク](AUDIO-DIRECTION.md)、[出典台帳](ASSET-ATTRIBUTION.md)。

6曲と15物理／環境音は技術検証済みmix候補。デコード、LUFS、true peak、mono、所有者寿命とcommand traceを検査し、端末での実聴や人の芸術的評価を代用しない。

## 検証と受入れ

新しいbaselineは113 suites／1,190 tests、lint/type/iOS export PASS。実装中には旧fixture座標・音源名・字幕語・資源alias期待の失敗に加え、完了候補の同一revisionを二重保存して遷移が止まる実不具合が見つかった。同一候補／leaseの保存promiseを再利用し、失敗した保存は再試行可能に保った。audio callback失敗が提示済み進行をrollbackする経路も分離した。初回失敗と修正後結果は[QA記録](qa-goal014/README.md)に分けて残す。

依存6保護ファイルは同一。現在のExpo互換メタデータは57.0.23を推奨するため、固定した57.0.22に対するDoctorは20/21、dependency checkはpatch差の指摘。npm auditは既存11 moderate／high0／critical0。無関係な依存更新で本変更へ混ぜず、[生結果とhash](qa-goal014/environment-checks.json)に記録する。

最終 `npm run check` は126 suites／1,286 tests、lint/type/iOS exportが成功し、実行中の514ファイルは不変でコミット `f20801e` と一致した。4種類の実export、Three同一性、iOS/Android/neutralの247モジュール・742辺・循環0、GL、比較画像・音付き動画の確定値と場所は[QA索引](qa-goal014/README.md)を正とする。ソフトウェアWebGL、CSS/mock、native実機、人の評価は別欄にする。

最終画面検査では320×568・文字2倍の長い操作名が、2行分の高さしかないボタンを超えることも見つかった。共通HUDとtouchの配置を3行分へ広げ、本文の切り詰めや文字倍率制限は加えなかった。全102画面・246件のボタン文字範囲と、11の館内標識視点が成功。音付きの5エリア通し、同じ入力テープを両版へ渡す04/05比較、同じ姿勢の巡回体と鏡の比較を別々に記録し、異なる経路を「同一入力」とは呼ばない。

ローカル実装は `dcdf26f`（主題音楽・物理音と所有者）、`0fe8fbd`（本編の理解・美術・巡回体・結末）、`f20801e`（比較の再現ツール・preview識別）に分けた。後続の記録コミットはソースを変えず、実行時のHEADと実際に読んだファイルhash、コミット済み内容の[照合記録](qa-goal014/local-artifact-source-correspondence.json)を分けて保持する。

**DEVICE_ACCEPTANCE=PENDING / RELEASE_READY=false。** 新preview実機、初見3〜5人の理解と手応え、イヤホン／スピーカーの実聴、公開運営情報・URL・ストア申告は未確認。[iPhone検証手順](IPHONE_VALIDATION.md)で新marker `goal-014-polish-r1` を確認する。新previewのEASコマンドはユーザー向け案内のみで、この作業では実行しない。
