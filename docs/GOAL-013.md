# Goal 013 作業記録

開始点は `/home/mhirotaka/workspace/chroma-rift-goal012` の `feat/goal-012-stage-kit`、HEAD `478b376ea9a954974ad2f08ab5f09d929bd35f06`、clean。`feat/goal-013-chapter-one-product` を同じworktreeに作成した。Goal 012の補完ブランチ `feat/goal-012-completion` にあった比較動画・検証スクリプト・記録は、重複しない差分として `1fb7a94` に取り込んだ。元の `/home/mhirotaka/workspace/chroma-rift` は `5c04d98` の別worktreeのまま。Node `v24.20.0`、npm `11.19.0`、実 `node_modules` を確認した。Goal 011の鏡廊は基準HEADに存在しない。

基準 `npm run check` は95スイート・1,046テスト、lint、typecheck、iOS exportを通過。実行時循環は iOS/Android/neutralでそれぞれ194 production modules、584 runtime edges、0 SCC/0 errors。Stage Kit定義検査も通過。実行中に新しい未参照のcampaignファイルを追加したが、Jestの基準発見件数は95/1,046、MetroのApp到達コードは基準のままである。後続の完全回帰は別に実施する。

現在の変更は、第一章の5エリア順序と第二章のplanned-only metadata、物語文とbeat台帳、厳密なcampaign checkpoint codec、既存3章の連続prefixだけを扱う旧記録移行候補、単一envelopeの保存API。04は固定輪郭の図地キー、練習と3段巻き上げ、物理格子、既存rendererを借りる単一平面鏡pass、同一身体の巡回体、指保持UIを持つ。05は制御ベイ、二経路、受鈴器、物理扉、巡回体の誘導、隔離・停止・屋外退出の独立状態とcontroller/scene bindingを持つ。04/05はStage Moduleとして `routable:true` にした。campaign純粋層では検証済みの停止・屋外checkpointだけが全体完了となる。05のcontroller機器試験では正しい位置への照準を試験内で合わせており、初回からの自然な通しプレイや動画の証拠ではない。

製品ホームとcampaign hostをAppへ接続した。新規/続き/旧記録移行/独立replayを選べ、03→04→05→屋外の画面callbackにcodec検証済みcheckpointを渡す試験では、保存後の切替、cold restore、保存失敗時の旧画面維持を確認した。01〜03のHUD・機器文言を館内の次区画へ向けて更新した。ストーリーbeatの製品表示、全エリアの自然な連続操作、発見履歴の製品表示、04の鏡像と保持、05の誘導と退館を含む連続動的QA、release設定と実機確認は残る。`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false`。ローカルコミットは段階ごとに行い、push・PR・クラウドビルドを行わない。

途中検証（最終合格ではない）：05 moduleとcontroller接続後の全Jestは106スイート・1,084テスト成功。campaign hostと文言更新後の全Jestは108スイート・1,092テスト中1件失敗。展示室の操作時刻がJest環境で直前より約400ms巻き戻り、正常操作が `stale` になる原因を特定して修正した。対応する単独テスト23件と展示室ルートの6回連続再実行は成功。修正後の全Jestは108スイート・1,093テスト成功。型検査とlintも成功。循環検査は220 production modules・669 runtime edges、iOS/Android/neutralとも0 SCC/0 errors。Stage Kit定義検査も成功。エリア05の初回からの歩行と実Canvas映像、第一章の自然な連続経路、端末実行は未検証。
