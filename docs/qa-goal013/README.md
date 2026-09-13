# Goal 013 動的QAの記録

2026-09-13時点で、第一章01→05の一続きの**App操作動画は未収録**。JestのApp host連続ログ、04単独の実反射動画、05単独の自然成功・復旧経路の実controller/scene動画を以下に収録した。Jestはnative Canvas/実音声をモックにしており、04/05の動画も別々のSoftware WebGL実行である。iPhone実機の映像・実聴・知覚・怖さ・発熱の確認ではない。

01→05のcontroller連続経路は、[標準・B→Cのイベントログ](natural-route-standard.json) と [控えめ・C→Bのイベントログ](natural-route-subdued.json) に追加した。`CHROMA_QA_TRACE_DIR=docs/qa-goal013 npm run test -- --silent --runTestsByPath src/domain/campaign/__tests__/naturalChapterRoute.test.ts` が再生成する。新規campaign sessionのcheckpointから各エリアの実controllerを起動し、実旋回・衝突付き歩行・照準・装置操作で完了したcheckpointだけを次のエリアへ渡す。04の隔離キーを05の入口へ引き継ぎ、05の停止checkpointをcampaignへ保存してから屋外へ出る。各遷移の後にcampaign codecをJSONから再parseし、最後まで同じrunIdと連続したrevisionを検査した。両経路とも5エリア完了、`campaignCompleted=true`、在館反応の終幕に対応する隔離・停止・屋外状態を確認した。これは**Node/Jest内のcampaign domain host**であり、App画面、AsyncStorage、native Canvas、実音声の一続きの実行ではない。ソースとこのイベントログにsolved bitやposeの直接代入はない。ログSHA-256は標準 `62a1e30c2a6e8bae06f5c12b65dcad18a2ed4978836747494d0c01c41a9212a7`、控えめ `0d0a1bd336c47639ec699d96f53288787898b68c02512f2473bd48d9c1e9608a`。

さらに、[App host標準・B→Cログ](app-natural-route-standard.json) と [App host控えめ・C→Bログ](app-natural-route-subdued.json) を追加した。`CHROMA_QA_TRACE_DIR=docs/qa-goal013 npm run test -- --silent --runTestsByPath src/screens/__tests__/chapterOneAppFlow.test.tsx` で再生成する。同じApp起動で、各画面にマウントされた**そのcontroller**を実入力経路で最後まで動かす。Canvasのnative frame callbackはモックなので、そこで生じたcodec checkpointをテストから画面の実host lease callbackへ渡して保存する。次エリアのCanvas mock境界が一つずつ所有され、peak 1、エンディングで0。AsyncStorageはJestモックだが、Appの保存APIを通し、05完了後にAppをunmountして再起動してもエンディング入口が残る。素材SHA-256は標準 `72db52141eaad3abeec2a2b36feae02d56b381cb9bd5cc958f9c28a36631ce0b`、控えめ `98059a55cf05a2e694bb7464f5b8893e0f4886fbb92e1b7f7aa3093790c796f7`。05停止後に屋外退館へ直行してもエンディングで巡回体の正体と01→00の経過を表示し、両beatを提示済みとして保存する。別のApp host試験では、05完了envelopeの保存後に結末componentの提示callbackを抑えてunmountし、cold起動後に完了・結末入口・未提示beatの後追い保存を確認した。native GL frame、実音、実端末のAsyncStorage永続性と連続動画は含まない。

[App host標準・cold restoreと逆順replayログ](app-natural-route-standard-cold.json) では、上記と同じ自然操作の標準B→Cを、各エリア完了後の**4回のApp unmount→cold起動**を挟んで通した。各エリアでさらに2回ずつホーム退出→再入場し、完走後のcold起動から05→01の5エリアへ逆順replayした。計20回のCanvas mock入場、10回の同一エリア再入場、4回のエリア遷移後cold restore。保存runIdと次エリア、終了後の本編セーブ原文、古い画面callbackの拒否を検査した。mock ownerは全期間peak 1、退出・unmount後0。ログSHA-256 `5812e200146f50fd601cef669c311aee5a093622b492f8ca456aedbd94519c0c`。再生成時のrunIdは時刻由来のためhashは変わる。これはJestのAsyncStorage/Canvasモック境界であり、実端末の永続性・GPU/音owner解放・frame・発熱の検証ではない。

同じ逆順replayの各エリアで、マウント済みcontrollerを実旋回・衝突付き歩行・装置操作で最後まで動かした。Canvasのframe callbackだけはモックなので、controllerが作った最終checkpointをscreenのhost callbackへ渡す。05、04、03、02、01のすべてが練習結果画面へ到達し、その場のCanvas ownerは0。本編のrunId、現在位置、鍵、checkpoint、物語、隔離済みの最終状態を保ち、新発見がない5回はenvelope原文も不変だった。`reverseReplays` の各項目に `completed:true` と増えた発見IDを記録した。実端末のHUD、音、native Canvasでの練習完走は未確認。

練習エリアの完了handoffは、同じApp host試験の発見記録ケースで別に検査した。偽のclear bitはStage codecで拒否し、codec有効な完了fixtureをscreen callbackへ渡すと練習結果画面へ進む。最終checkpointにだけある発見bitは保存に加わり、本編のエリア・checkpoint・物語提示は保持される。結果画面へ移った旧callbackも拒否する。このケースはApp callbackとJestのCanvas/AsyncStorageモックの検査で、練習を実controllerや実端末で完走した記録ではない。

保存失敗のApp host試験は `src/screens/__tests__/chapterOneAppFlow.test.tsx` で行う。campaign keyへのsetItemだけを拒否し、途中checkpointと冒頭beatの未保存を表示する。再試行が再度失敗しても元rawを保持し、成功時は最新envelopeを保存する。起動中だけ継続なら画面の発見記録は保持するがrawは変えない。書込直後にホームへ退出した場合もCanvas owner 0のまま失敗を表示し、再試行で最新envelopeを保存した。Canvas・AsyncStorageはJestモックであり、実端末の書込失敗・Modal重なりは未確認。

更新したAppログの `transitionStories` は、01 `emergency-circuit`、02 `containment-procedure`、04 `isolation-key` を次エリアのCanvas起動前に表示したことを記録する。05の結末二beatはエンディング画面で提示する。04→05の保存後、隔離キーの文を読む前にunmountした試験では、cold起動後の05安全入口で未提示文が戻る。別のApp host試験は境界文の提示bit書込だけを失敗させ、旧Canvasの保持、元rawの保持、再試行成功または起動中のみの継続を検査した。いずれもCanvas・AsyncStorageのJestモックで、native画面重なりや端末の保存失敗は未確認。

05の手順確認後に物語modalを閉じる前に屋外完了へ進んだApp host経路では、最終envelopeが先に保存される。エンディングは未提示の点検手順を一度表示し、`containment-bell`、`attendance-identified`、`outdoor-exit` の提示bitを保存する。表示前にAppをunmountしたcold試験でも同じ文が復元され、提示済み後の再閲覧では手順欄を繰り返さない。実端末の画面描画と保存では未確認。

03の任意設備音beatは `src/screens/__tests__/chapterOneAppFlow.test.tsx` で別に確認する。旧01/02の完了記録から03へ入り、灯り解放済みの途中状態で実ベルを操作し、実AIが受鈴器の音へ調査を始める一更新をCanvas mockのsnapshot callbackへ渡す。AIがnoise slotを消した後でも `noise-route` の発火・画面文・確認後の提示bitをApp保存APIで一回ずつ確認した。`src/screens/__tests__/theatreScreen.test.tsx` は同じ画面callback、`src/domain/theatre/__tests__/actor.test.ts` は足音・直接視認中の囮を除外するAI判定を確認する。灯り・巡回体の位置はこの試験のために配置した途中状態であり、native frame/実音/自然な通しプレイは対象外。

同じApp host試験で、第一章の設定から「だけを最初から」を選ぶと、現行campaignの進行・発見・物語提示記録の置換時点を明示する確認文が出る。確認後も入場準備画面では保存原文が変わらないことを検査した。実端末のAlert表示は未確認。

04単独の記録： [30.3秒の動画](mirror-natural.mp4)、[1秒ごとの接触シート](mirror-natural-contact.png)、[作業中の鏡内の巡回体](mirror-actor-reflected.png)、[開いた格子](mirror-three-ratchets.png)、[イベント・source hash](mirror-natural-report.json)、[WebGL計測](mirror-natural-webgl.json)。`node scripts/qa-mirror-natural.cjs` は新規04の実controllerと地形で中央の鍵、実鏡面の明示観察、練習、保持二回、途中の退避、格子通過まで歩く。怖さは控えめ。`StageScene` の一つの巡回体meshと実 `planarMirror.ts` をブラウザーで同じsceneへ載せ、反射→主passの順で描いた。native R3F/EXGLのframe ownerやHUD/audioはこの動画では動かしていない。字幕帯はQAラベル。390×844、10fps、303枚、simulation27.58秒、反射target 384×384。反射は303枚中134枚で実行され、画面外では省略、視野へ戻った最初のframeに更新。最大主pass49 calls、反射pass42 calls、3,548 triangles、終了時geometries/textures 0。これらはSoftware WebGLであり、iPhone FPS/発熱の測定ではない。動画SHA-256 `f68f97fb77a3e372a25fd7b9016381dc9b82e272e79f49a2abca12c62fc0a8d1`、接触シート `fa5b25c0ee2ba17342a49fac58ae07588613c037aeef50aa17cfaf15ccc0afdd`。実鏡面の観察はsimulation 7.55秒に実controllerで受理され、最終sessionのmirrorInspected=trueを確認した。接触シート、9.5秒の鏡中の身体、18.5秒の開いた格子の抽出フレームを開いたが、MP4を連続視聴したとは記録しない。

04標準の捕捉・復帰試験 `src/rendering/firstPerson/__tests__/mirrorCorridorHoldController.test.ts` は、Stage codecで受けた鍵・練習済みの途中checkpointから開始する。実controllerの衝突付き歩行で巻上機へ寄り、一段目を保持・解放してから再保持中に巡回体へ捕捉される。保持と未完成fractionが消え、鍵と確定した歯止め、保持指の解放barrier、safe poseが維持される。保存checkpointをStage codecで復元し、標準設定の実controllerで格子を越えて制御室前室の出口まで歩いた。途中入口は試験用の有効fixtureであり、01→04の通し操作や製品HUD・実音・native Canvas・動画の証拠ではない。

05単独の自然成功記録： [18.2秒の動画](departure-natural.mp4)、[1秒ごとの接触シート](departure-natural-contact.png)、[巡回体の収容](departure-contained.png)、[屋外床と通路](departure-outdoor.png)、[イベント・入力とsource hash](departure-natural-report.json)、[WebGL計測](departure-natural-webgl.json)。`node scripts/qa-departure-natural.cjs` は有効な04由来の鍵checkpointを入口とし、実controllerへの旋回・歩行入力で各操作面まで移動する。設備操作も実照準とcommand受理を使い、位置やsolved bitの代入で攻略しない。ベル後は巡回体の全身が物理収容区画へ入るまで同じsimulationを進め、観察窓から身体と閉扉を描き、停止後に職員出口から屋外床を歩いて最終操作する。実 `StageScene` をReact hostで組み立て、単一のブラウザーSoftware WebGLで描画した。字幕帯はQA用合成ラベルで製品HUDではない。動画は390×844、10fps、182枚、simulation 13.52秒。最大46 draw calls/3,578 triangles、終了時geometries/textures 0、renderer 1、browser errors 0。反射pass、iPhone FPS、音、native Canvasは対象外。

自然成功動画SHA-256 `f87d82c51730b897e33708651a42d1f87cd90b03d700e1d43b4eeaaff1b7f6f8`。接触シート `00fcb6646fda9e3c88c73a4444c4afd57544fd95519aec59c3965cba08576fc3`。PNG抽出と接触シートを開いて観察窓内の身体・屋外床を確認したが、MP4の連続視聴は未実施。

05単独の復旧記録： [36.5秒の動画](departure-recovery.mp4)、[1秒ごとの接触シート](departure-recovery-contact.png)、[巡回体が戻る場面](departure-recovery-returning.png)、[再誘導後の収容](departure-recovery-contained.png)、[扉の閉鎖](departure-recovery-latched.png)、[イベント・入力とsource hash](departure-recovery-report.json)、[WebGL計測](departure-recovery-webgl.json)。`node scripts/qa-departure-natural.cjs --recovery` は同じ有効な鍵入口・実controller/scene経路で、全身収容前の閉扉拒否、最初のベルによる収容、閉鎖途中の手動開け直し、巡回体が区画外の通路へ戻るまでの待機、二度目のベルからの再誘導、再閉鎖・停止・屋外退館を一実行で通した。最初の拒否は実commandから「巡回体の全身が収容区画に入るのを待つ。」を返し、扉進行率は0のまま。開け直し後も進行率0・隔離falseを検査した。巡回体が区画外の `z<14.5` に戻った時刻はsimulation 19.87秒で、直前phaseは `return`。次のベルで `investigate` へ移ったことを確認してから、全身収容を再判定した。位置・AI phase・solved bitの直接代入はない。

復旧動画は390×844、10fps、365枚、simulation 30.02秒。最大46 draw calls/3,578 triangles、終了時geometries/textures 0、renderer 1、browser errors 0。動画SHA-256 `13b804c65a7e29dd46bf45f21d0fdd1b85ea568199551e324f7eb2d0d45ff3b8`、接触シート `b24e6fcd26df16398752471bd4965681b7abf35c53e215f956ff9a2b6e066e68`。接触シートと抽出した戻り・再収容・閉鎖のPNGを開いた。MP4の連続視聴、製品HUD・実音・native Canvas、端末での見え方・怖さ・FPS・発熱は未実施。区画外へ戻った位置はイベントログで検査しており、接触シートだけで位置を証明したものではない。

最初の05動画では、受鈴器の反応frameで `scale.setScalar` が配置時の寸法を消し、大きな白い形が巡回体の上半身に重なった。受鈴器の半径・高さへ反応倍率を掛け、音源と実meshを同じ頭上の位置へ移した。今回の実scene収録では受鈴器の最下点が2.792m、巡回体の保守的な身体上端が2.24mで、同じ位置にいても上下で重ならないことを全抽出frameで検査した。更新後の[収容画像](departure-contained.png)と[閉鎖画像](departure-recovery-latched.png)を開き、身体と床灯が確認できることを観察した。これはSoftware WebGL上の観察であり、実端末の透過・明るさ・視認性の保証ではない。

05の別の復旧試験 `src/rendering/firstPerson/__tests__/departureControlController.test.ts` は、鍵設置・手順確認後、巡回体が外にいる閉扉操作を拒否するところから実controllerで始める。衝突付きでベル、収容待ち、閉扉、閉鎖途中の開け直し、再ベル、再収容、隔離、停止、屋外まで進み、開け直したcheckpointがStage codecを通ることも確認した。solved bitやactor座標の代入で復旧させていない。上の動画は同種の復旧操作を別実行で収録したが、checkpointのcold復元は含まない。native HUD/実音/端末操作はどちらも未確認。

Goal 012の同条件before/after比較と検証器は [GOAL-012-EXTENSION-PROOF](../GOAL-012-EXTENSION-PROOF.md) を参照。今回の変更前後は [01の入室・非常灯](area01-light-before-after.mp4)、[02の長さ調整](area02-length-before-after.mp4)、[03の灯り調整](area03-light-before-after.mp4) を左右同時に収録し、[01の入力・hash・限界](area01-before-after.json) と [02/03の入力・hash・限界](area02-03-before-after.json) に固定した。左はGoal 012のゲームソース、右はGoal 013。01は入室後の90 frame、seed 73、全frameのcamera行列が一致し、両方で実HUDから非常灯操作が受理された。Goal 013では冒頭の目的文が職員通路に変わり、点灯後に新しい点検記録が出るため、映像と提示動作は異なる。QA用Three hostは点灯後にpropsを更新するため再構築した。02/03は同じscript、seed、camera、入力を各ソースへ独立に通した結果、それぞれのtimelineと独立動画がbyte一致した。これは各**装置操作一つずつ**の証拠であり、各エリア全体を確認するものではない。01は3秒、02は8.17秒、03は20秒。各並列動画の抽出フレームを開いたが、MP4の連続視聴はしていない。旧素材と新素材を混ぜた編集動画は単一実行の証拠にしない。

必要な録画/ログの順序:

1. 標準と控えめで、B→C/C→Bの両順を含む新規01→05のApp経路を、native Canvasと実音声を使う端末で再実行・録画する。Jestのhandoffログと端末のrunId、保存revision、Canvas owner数を照合する。
2. 04の現動画をnative Canvas/製品HUD/標準の怖さで確認し、鏡像と実景の同一frame、保持指と見回し、捕捉後復帰を実機で検査する。
3. 05では今回の成功経路に加え、早すぎる閉扉と開け直し・再誘導、cold再開、実HUD/音/native Canvasを端末で収録する。
4. 各遷移のcold restore、逆順replay、旧連続prefix移行、保存失敗retry、10回以上の入退場を端末でも記録し、Jestログとの差を確認する。
5. 320×568/390×844/430×932相当、fontScale 1〜2、無音、標準/控えめ、縦画面で、HUD、機器、pause、物語表示の重なりを画像で開いて確認する。

記録には環境（software WebGL/native mock/iPhone）、commit、素材hash、コマンド、同一入力、開始/終了時刻、実観察範囲、未観察項目を添える。スクリーンショットを生成しただけでは目視確認済みとしない。
