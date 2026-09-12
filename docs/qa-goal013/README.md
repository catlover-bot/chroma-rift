# Goal 013 動的QAの記録

2026-09-13時点で、第一章01→05の一続きのApp操作動画は**未収録**。04単独の実反射を含む動画と、05単独の自然歩行・実controller/sceneによる動画を以下に収録した。どちらも独立試験で、01→05のApp host連続完走やiPhone実機の映像・実聴・知覚・怖さ・発熱の確認ではない。

01→05のcontroller連続経路は、[標準・B→Cのイベントログ](natural-route-standard.json) と [控えめ・C→Bのイベントログ](natural-route-subdued.json) に追加した。`CHROMA_QA_TRACE_DIR=docs/qa-goal013 npm run test -- --silent --runTestsByPath src/domain/campaign/__tests__/naturalChapterRoute.test.ts` が再生成する。新規campaign sessionのcheckpointから各エリアの実controllerを起動し、実旋回・衝突付き歩行・照準・装置操作で完了したcheckpointだけを次のエリアへ渡す。04の隔離キーを05の入口へ引き継ぎ、05の停止checkpointをcampaignへ保存してから屋外へ出る。各遷移の後にcampaign codecをJSONから再parseし、最後まで同じrunIdと連続したrevisionを検査した。両経路とも5エリア完了、`campaignCompleted=true`、在館反応の終幕に対応する隔離・停止・屋外状態を確認した。これは**Node/Jest内のcampaign domain host**であり、App画面、AsyncStorage、native Canvas、実音声の一続きの実行ではない。ソースとこのイベントログにsolved bitやposeの直接代入はない。ログSHA-256は標準 `62a1e30c2a6e8bae06f5c12b65dcad18a2ed4978836747494d0c01c41a9212a7`、控えめ `0d0a1bd336c47639ec699d96f53288787898b68c02512f2473bd48d9c1e9608a`。

04単独の記録： [30.1秒の動画](mirror-natural.mp4)、[1秒ごとの接触シート](mirror-natural-contact.png)、[作業中の鏡内の巡回体](mirror-actor-reflected.png)、[三段目までの作業](mirror-three-ratchets.png)、[イベント・source hash](mirror-natural-report.json)、[WebGL計測](mirror-natural-webgl.json)。`node scripts/qa-mirror-natural.cjs` は新規04の実controllerと地形で中央の鍵、練習、保持二回、途中の退避、格子通過まで歩く。怖さは控えめ。`StageScene` の一つの巡回体meshと実 `planarMirror.ts` をブラウザーで同じsceneへ載せ、反射→主passの順で描いた。native R3F/EXGLのframe ownerやHUD/audioはこの動画では動かしていない。字幕帯はQAラベル。390×844、10fps、301枚、simulation27.58秒、反射target 384×384。反射は301枚中132枚で実行され、画面外では省略、視野へ戻った最初のframeに更新。最大主pass49 calls、反射pass42 calls、3,548 triangles、終了時geometries/textures 0。これらはSoftware WebGLであり、iPhone FPS/発熱の測定ではない。動画SHA-256 `a09530cac44776a3cf4da3d006460d99e512a58dcbf4f2ff061f2d5c5110913f`、接触シート `6262775e718e168730ce167386611ff736dfc0505979742d3fd31226db265294`。接触シートと作業中の抽出フレームを開いて鏡内の身体を確認したが、MP4を連続視聴したとは記録しない。

05単独の記録： [18.1秒の動画](departure-natural.mp4)、[1秒ごとの接触シート](departure-natural-contact.png)、[巡回体の収容](departure-contained.png)、[屋外床と通路](departure-outdoor.png)、[イベント・入力とsource hash](departure-natural-report.json)、[WebGL計測](departure-natural-webgl.json)。`node scripts/qa-departure-natural.cjs` は有効な04由来の鍵checkpointを入口とし、実controllerへの旋回・歩行入力で各操作面まで移動する。設備操作も実照準とcommand受理を使い、位置やsolved bitの代入で攻略しない。ベル後は巡回体の全身が物理収容区画へ入るまで同じsimulationを進め、観察窓から身体と閉扉を描き、停止後に職員出口から屋外床を歩いて最終操作する。実 `StageScene` をReact hostで組み立て、単一のブラウザーSoftware WebGLで描画した。字幕帯はQA用合成ラベルで製品HUDではない。動画は390×844、10fps、181枚で、simulationは13.52秒。最大44 draw calls/3,534 triangles、終了時geometries/textures 0。反射pass、iPhone FPS、音、native Canvasは対象外。

動画SHA-256 `b2b8e1bcdc843f47b5832f1768ad01c10de057b67c786e786030c10b3ec16a20`。接触シート `4ec06e5777fd6d0c1a2764710459525f39106bf622f61c574e18df0800885e49`。PNG抽出と接触シートを開いて観察窓内の身体・屋外床を確認したが、MP4の連続視聴は未実施。端末での見え方、恐怖、聴こえ方をここから推定しない。

Goal 012の同条件before/after比較と検証器は [GOAL-012-EXTENSION-PROOF](../GOAL-012-EXTENSION-PROOF.md) を参照。今回の01〜03の館内向け文言変更については同一route/seed/camera/入力の変更前後映像を追加する。旧素材と新素材を混ぜた編集動画は単一実行の証拠にしない。

必要な録画/ログの順序:

1. 標準と控えめで、B→C/C→Bの両順を含む新規01→05の**App画面・保存・Canvas owner**経路を実行し、domain連続ログの範囲を拡張する。area handoff前後に同一runId、保存revision、Canvas owner数を記録する。
2. 04の現動画をnative Canvas/製品HUD/標準の怖さで確認し、鏡像と実景の同一frame、保持指と見回し、失敗復帰を実機で検査する。
3. 05では今回の成功経路に加え、誤閉鎖と復旧、再開、実HUD/音/native Canvasを収録する。
4. 各遷移のcold restore、逆順replay、旧連続prefix移行、保存失敗retry、10回以上の入退場を同一テスト条件で記録する。
5. 320×568/390×844/430×932相当、fontScale 1〜2、無音、標準/控えめ、縦画面で、HUD、機器、pause、物語表示の重なりを画像で開いて確認する。

記録には環境（software WebGL/native mock/iPhone）、commit、素材hash、コマンド、同一入力、開始/終了時刻、実観察範囲、未観察項目を添える。スクリーンショットを生成しただけでは目視確認済みとしない。
