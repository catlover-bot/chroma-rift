# 第一章 campaign 接続記録

基準HEADは `478b376ea9a954974ad2f08ab5f09d929bd35f06`。作業worktreeは `/home/mhirotaka/workspace/chroma-rift-goal012`、ブランチは `feat/goal-013-chapter-one-product`。現行コードの旧入口と hidden probe は第一章のエリアではない。Goal 011の鏡廊の実装は基準HEADになかった。

`src/domain/campaign/definition.ts` が製品上の順序を固定し、Stage Kitの `stageId` と表示上の `areaId` を分ける。01→gallery、02→vault、03→theatre、04→新規 `mirror-corridor-v1`、05→新規 `departure-control-v1`。既存3章の保存キーは変更しない。第二章は `planned` の文章だけで、stage IDを割り当てず、実行経路も持たない。

`src/domain/campaign/session.ts` は登録済みStage Moduleのcodecを通ったcheckpointだけを受ける。エリア完了と次の安全入口は一つの新しいsession envelopeへ組み立てる。01〜04の `progress.cleared` は館内の境界通過であり、第一章完了ではない。04/05も `routable:true` として接続した。05のcodecは隔離・停止・屋外通過を別々に保持する。campaign純粋層は停止前と屋外到達前の全体完了を拒否し、検証済み05 checkpointでだけ `campaign-completed` を組み立てる。

`App.tsx` の製品入口は第一章ホームに切り替わった。旧ステージ一覧とprobeは開発ビルド内の入口に限定する。新規開始、続き、旧記録の明示移行、独立replayをここから選べる。areaのクリアcheckpointと次の安全入口を一つのenvelopeへ保存し、成功後にそのエリアの未提示beatがあれば旧Canvasを止めた境界画面で示し、提示bitを保存してから次のCanvasへ切り替える。表示途中のcold再開では次の安全入口で未提示beatを再表示する。保存失敗時は旧画面を保持し、再試行または明示した起動中だけの継続を選べる。hostのcallback検証では03→04→05→屋外、各区間のcold restoreと保存失敗を確認した。このテストはStage codecで作ったcheckpointを画面callbackへ渡したもので、01からの自然な操作による通しプレイではない。

「発見の記録」はStage codecが検証した明示観察bitから作り、旧Stage Journalにある観察済み項目と一方向に合流する。旧クリア済みだけでは項目を増やさない。replay中の観察は現在エリア・鍵・最終措置・story beatを変えず、campaignの発見履歴だけを保存する。保存済みcheckpointより古いcallbackは本編のメモリ状態を巻き戻す前に拒否する。04の鏡は実鏡面を照準して「調べる」と明示した時だけ観察bitを保存する。鏡が描画されたことや巡回体の鏡像を見たはずという推測では記録しない。旧04 checkpointにbitが無ければ未観察として復元する。

この文書は進行中の接続記録である。04控えめの実鏡像・保持・退避、05標準の収容・停止・屋外の単独経路はSoftware WebGL動画で確認した。04標準の保持中捕捉→指解放→cold復元→物理出口は実controller試験で確認した。01から屋外までの実controllerによる自然操作は、標準B→Cと控えめC→BでAppのマウント済みcontrollerにも接続した。JestのCanvas/AsyncStorageモックでは4回のエリア遷移後cold restore、10回の再入場、完走後の05→01逆順replayも通過した。native Canvas・音・実端末保存を伴うApp通しプレイ、物語beatと発見記録の実機表示確認は残っている。`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false`。第二章を追加する時は別のCampaignDefinitionとstage群を登録し、第一章の保存schemaや結末を再定義しない。
