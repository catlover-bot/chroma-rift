# Goal 013 動的QAの記録

2026-09-13時点で、第一章01→05の一続きの**App操作動画は未収録**。JestのApp host連続ログ、04単独の実反射動画、05単独の自然歩行・実controller/scene動画を以下に収録した。Jestはnative Canvas/実音声をモックにしており、04/05の動画も別々のSoftware WebGL実行である。iPhone実機の映像・実聴・知覚・怖さ・発熱の確認ではない。

01→05のcontroller連続経路は、[標準・B→Cのイベントログ](natural-route-standard.json) と [控えめ・C→Bのイベントログ](natural-route-subdued.json) に追加した。`CHROMA_QA_TRACE_DIR=docs/qa-goal013 npm run test -- --silent --runTestsByPath src/domain/campaign/__tests__/naturalChapterRoute.test.ts` が再生成する。新規campaign sessionのcheckpointから各エリアの実controllerを起動し、実旋回・衝突付き歩行・照準・装置操作で完了したcheckpointだけを次のエリアへ渡す。04の隔離キーを05の入口へ引き継ぎ、05の停止checkpointをcampaignへ保存してから屋外へ出る。各遷移の後にcampaign codecをJSONから再parseし、最後まで同じrunIdと連続したrevisionを検査した。両経路とも5エリア完了、`campaignCompleted=true`、在館反応の終幕に対応する隔離・停止・屋外状態を確認した。これは**Node/Jest内のcampaign domain host**であり、App画面、AsyncStorage、native Canvas、実音声の一続きの実行ではない。ソースとこのイベントログにsolved bitやposeの直接代入はない。ログSHA-256は標準 `62a1e30c2a6e8bae06f5c12b65dcad18a2ed4978836747494d0c01c41a9212a7`、控えめ `0d0a1bd336c47639ec699d96f53288787898b68c02512f2473bd48d9c1e9608a`。

さらに、[App host標準・B→Cログ](app-natural-route-standard.json) と [App host控えめ・C→Bログ](app-natural-route-subdued.json) を追加した。`CHROMA_QA_TRACE_DIR=docs/qa-goal013 npm run test -- --silent --runTestsByPath src/screens/__tests__/chapterOneAppFlow.test.tsx` で再生成する。同じApp起動で、各画面にマウントされた**そのcontroller**を実入力経路で最後まで動かす。Canvasのnative frame callbackはモックなので、そこで生じたcodec checkpointをテストから画面の実host lease callbackへ渡して保存する。次エリアのCanvas mock境界が一つずつ所有され、peak 1、エンディングで0。AsyncStorageはJestモックだが、Appの保存APIを通し、05完了後にAppをunmountして再起動してもエンディング入口が残る。素材SHA-256は標準 `f9b48d40bff197d872a4a4510ee7ebd6d817ce40bbe9c8ff1c5bcbc2c836b55e`、控えめ `bd76a6cddbaa7e53bc54dde7ccaeb483c19bc0ee7cc6a5889bcc3eae82ef0ac6`。native GL frame、実音、実端末のAsyncStorage永続性と連続動画は含まない。

04単独の記録： [30.1秒の動画](mirror-natural.mp4)、[1秒ごとの接触シート](mirror-natural-contact.png)、[作業中の鏡内の巡回体](mirror-actor-reflected.png)、[三段目までの作業](mirror-three-ratchets.png)、[イベント・source hash](mirror-natural-report.json)、[WebGL計測](mirror-natural-webgl.json)。`node scripts/qa-mirror-natural.cjs` は新規04の実controllerと地形で中央の鍵、練習、保持二回、途中の退避、格子通過まで歩く。怖さは控えめ。`StageScene` の一つの巡回体meshと実 `planarMirror.ts` をブラウザーで同じsceneへ載せ、反射→主passの順で描いた。native R3F/EXGLのframe ownerやHUD/audioはこの動画では動かしていない。字幕帯はQAラベル。390×844、10fps、301枚、simulation27.58秒、反射target 384×384。反射は301枚中132枚で実行され、画面外では省略、視野へ戻った最初のframeに更新。最大主pass49 calls、反射pass42 calls、3,548 triangles、終了時geometries/textures 0。これらはSoftware WebGLであり、iPhone FPS/発熱の測定ではない。動画SHA-256 `a09530cac44776a3cf4da3d006460d99e512a58dcbf4f2ff061f2d5c5110913f`、接触シート `6262775e718e168730ce167386611ff736dfc0505979742d3fd31226db265294`。接触シートと作業中の抽出フレームを開いて鏡内の身体を確認したが、MP4を連続視聴したとは記録しない。

05単独の記録： [18.1秒の動画](departure-natural.mp4)、[1秒ごとの接触シート](departure-natural-contact.png)、[巡回体の収容](departure-contained.png)、[屋外床と通路](departure-outdoor.png)、[イベント・入力とsource hash](departure-natural-report.json)、[WebGL計測](departure-natural-webgl.json)。`node scripts/qa-departure-natural.cjs` は有効な04由来の鍵checkpointを入口とし、実controllerへの旋回・歩行入力で各操作面まで移動する。設備操作も実照準とcommand受理を使い、位置やsolved bitの代入で攻略しない。ベル後は巡回体の全身が物理収容区画へ入るまで同じsimulationを進め、観察窓から身体と閉扉を描き、停止後に職員出口から屋外床を歩いて最終操作する。実 `StageScene` をReact hostで組み立て、単一のブラウザーSoftware WebGLで描画した。字幕帯はQA用合成ラベルで製品HUDではない。動画は390×844、10fps、181枚で、simulationは13.52秒。最大44 draw calls/3,534 triangles、終了時geometries/textures 0。反射pass、iPhone FPS、音、native Canvasは対象外。

動画SHA-256 `b2b8e1bcdc843f47b5832f1768ad01c10de057b67c786e786030c10b3ec16a20`。接触シート `4ec06e5777fd6d0c1a2764710459525f39106bf622f61c574e18df0800885e49`。PNG抽出と接触シートを開いて観察窓内の身体・屋外床を確認したが、MP4の連続視聴は未実施。端末での見え方、恐怖、聴こえ方をここから推定しない。

Goal 012の同条件before/after比較と検証器は [GOAL-012-EXTENSION-PROOF](../GOAL-012-EXTENSION-PROOF.md) を参照。今回の変更前後は [01の入室・非常灯](area01-light-before-after.mp4)、[02の長さ調整](area02-length-before-after.mp4)、[03の灯り調整](area03-light-before-after.mp4) を左右同時に収録し、[01の入力・hash・限界](area01-before-after.json) と [02/03の入力・hash・限界](area02-03-before-after.json) に固定した。左はGoal 012のゲームソース、右はGoal 013。01は入室後の90 frame、seed 73、全frameのcamera行列が一致し、両方で実HUDから非常灯操作が受理された。Goal 013では冒頭の目的文が職員通路に変わり、点灯後に新しい点検記録が出るため、映像と提示動作は異なる。QA用Three hostは点灯後にpropsを更新するため再構築した。02/03は同じscript、seed、camera、入力を各ソースへ独立に通した結果、それぞれのtimelineと独立動画がbyte一致した。これは各**装置操作一つずつ**の証拠であり、各エリア全体を確認するものではない。01は3秒、02は8.17秒、03は20秒。各並列動画の抽出フレームを開いたが、MP4の連続視聴はしていない。旧素材と新素材を混ぜた編集動画は単一実行の証拠にしない。

必要な録画/ログの順序:

1. 標準と控えめで、B→C/C→Bの両順を含む新規01→05のApp経路を、native Canvasと実音声を使う端末で再実行・録画する。Jestのhandoffログと端末のrunId、保存revision、Canvas owner数を照合する。
2. 04の現動画をnative Canvas/製品HUD/標準の怖さで確認し、鏡像と実景の同一frame、保持指と見回し、失敗復帰を実機で検査する。
3. 05では今回の成功経路に加え、誤閉鎖と復旧、再開、実HUD/音/native Canvasを収録する。
4. 各遷移のcold restore、逆順replay、旧連続prefix移行、保存失敗retry、10回以上の入退場を同一テスト条件で記録する。
5. 320×568/390×844/430×932相当、fontScale 1〜2、無音、標準/控えめ、縦画面で、HUD、機器、pause、物語表示の重なりを画像で開いて確認する。

記録には環境（software WebGL/native mock/iPhone）、commit、素材hash、コマンド、同一入力、開始/終了時刻、実観察範囲、未観察項目を添える。スクリーンショットを生成しただけでは目視確認済みとしない。
