# Goal 013.1 — r7実機GL失敗とr8候補の調査

## 判定と入力

**r7 / preview / release-js / 1.0.0 / iOS build 2 のエリア04受入れはFAIL。r8の実機受入れはPENDING、RELEASE_READY=false。** 入力はユーザーが端末からコピーしたと報告した[診断JSON](qa-goal013-1/r7-device-build2-first-failure.json)であり、こちらで操作したiPhoneや自作fixtureの出力ではない。端末機種、iOS版、EAS build ID、失敗した個々のGL命令は入力にない。原文のJSON値を保持し、CRLFだけLFへ正規化した。両hashと値の一致は[baseline](qa-goal013-1/r8-baseline.json)に記録した。

| 観測 | 確定できる意味 |
| --- | --- |
| GL_FRAME、elapsedMs=1040、remainingMs=11871、readyAtMs=null | 12秒の起動timeoutより前、初回提示前のGL検査で停止した。 |
| frameSequence=1、reflection=1、main=1、presentation=0 | 反射と主描画の関数は戻ったが、正常な提示帰還は記録されていない。画素の表示証明ではない。 |
| inspectGl / before native presentation | この検査が例外を投げた。endFrameEXP自身の失敗とは断定しない。 |
| framebufferStatus=36053 (0x8CD5) | FRAMEBUFFER_COMPLETEという状態。FBOのIDではない。 |
| errors=[0x502] | INVALID_OPERATION。INVALID_FRAMEBUFFER_OPERATION (0x506)ではない。 |
| rendererCreates=contextCreates=activeRendererOwners=1 | この試行には二重ownerの記録がない。他試行も含めた完全証明ではない。 |
| RT 384×384、samples=0、depth=true、stencil=false | RTは既にMSAAなし。iOS drawableのMSAAとは別。 |
| shaderErrors=[] | 捕捉されたshader errorがないだけで、全GL命令の正常証明ではない。 |
| failure.paused=false / startup.paused=true | 失敗時と停止後のsnapshotとして両立する。 |
| failed-unpresented-frame / stateRevision=0 | 失敗poseを最後の提示・保存位置と同一視せず、保存を削除しない。 |

r5録画の原因へ今回の情報を逆算して適用しない。「r7識別／FIRST_FAILURE待ち」という旧待機理由は今回の入力で解消した。従来の1,155テスト成功も、この実機FAILを取り消さない。

## 作業状態

開始は `/home/mhirotaka/workspace/chroma-rift-goal012`、branch `fix/goal-013-1-mirror-runtime-recovery`、cleanな `f99406236b0601b093579ecb239c3c08413b6d49`。後続履歴、r7までの修正、第一章を保持した。元worktreeとGoal 012 completion worktreeへ変更を移していない。

実装commitは `c79a75f5a9b37d2dfd872dd2fd3b3902e6748db9`。最終記録commit（終了HEAD）は、この文書を追加したcommitと最終回答で特定する。終了時の検査対象source hash・保護ファイルは[r8検証記録](qa-goal013-1/r8-verification.json)に保存する。自己参照するcommit hashをJSへ埋めず、コード識別を `goal-013-1-mirror-runtime-r8` とした。

製品変更は `buildIdentity.ts`、`nativeDefaultFramebuffer.ts`、`nativeGlObserver.ts`、`nativeGlSession.ts`、`nativeSceneSession.ts`、`canvasLifecycle.ts`、`diagnostics.ts`。追加・更新した検査はnative framebuffer、GL observer、報告checkpoint復旧、既存native Canvas lifecycleと `scripts/qa-native-default-framebuffer.cjs`。ゲーム定義、world、鏡の材質・RT設定・隠蔽処理、入力、音、保存codec、依存とnativeソースは変更していない。

## H1の採用版監査

採用版はThree 0.185.1、expo-gl 57.0.2、R3F 9.7.0。解決先、lockfile、30のローカル参照行と各SHA256を[機構記録](qa-goal013-1/r8-source-mechanism.json)に固定した。

| 採用ソース | 確認した経路 |
| --- | --- |
| Three `WebGLRenderer.js:2890–3022` | `setRenderTarget(null)`で論理defaultへ戻し、bind更新時にstate.drawBuffersを呼び得る。 |
| Three `WebGLState.js:483–560` | RTにはCOLOR_ATTACHMENT0+i、defaultにはBACKを使う。default配列をcacheするため、毎復元・毎frameにBACKが出るという主張ではない。 |
| Expo `EXWebGLMethods.cpp:351–367` | null/0を `ctx->defaultFramebuffer` へ変換してbindする。 |
| Expo `GLView.swift:154–172,338–339` | iOSが生成した非zeroのmsaaFramebufferへCOLOR_ATTACHMENT0を付け、Expoのdefaultとして返す。アプリはこのIDを照会・推測していない。 |
| Expo `EXWebGLMethodsDraw.cpp:421–426` | 与えられた配列をglDrawBuffersへ渡し、BACK補正を行わない。 |
| 既存アプリ `planarMirror.ts` | 同じsceneの鏡を反射中だけ隠し、finallyで元target・表示・viewport等を復元する。補正は存在しなかった。 |

OpenGL ESの[drawBuffers規則](https://github.com/KhronosGroup/OpenGL-Refpages/blob/main/es3.0/glDrawBuffers.xml)では、非zero FBOへBACKを指定する操作は不正になる。[getError](https://github.com/KhronosGroup/OpenGL-Refpages/blob/main/es3.0/glGetError.xml)は保持されたエラーを消費する。**H1は採用ソースと機構試験で成立した原因候補であり、r7 iPhoneの個別命令を確定したものではない。**

RTのtype=1009はUnsignedByteType、format=1023はRGBAFormat。HalfFloatとする根拠はなく、samples=0を再指定する修正も行わない。readBufferは採用ThreeのMRT読取でCOLOR_ATTACHMENTiを使う別経路で、今回の鏡／主描画にBACK指定の根拠がないため補正対象にしない。鏡のfeedback loop対策と背面fallbackは既存どおり。program/uniform/VAO等の別原因は今回の実機JSONだけでは棄却できない。

## 修正の範囲

Canvasが取得した**所有中のExpo iOS contextだけ**に、Threeのconstructorより前にadapterを入れる。FRAMEBUFFERはread/draw双方、DRAW_FRAMEBUFFERはdraw、READ_FRAMEBUFFERはreadの要求状態を追跡する。論理default drawへの厳密な単要素 `[BACK]` だけを新しい `[COLOR_ATTACHMENT0]` 配列として転送する。

BACK定数、元の引数配列、通常ブラウザー、Android、他owner、offscreen、MRT、NONE、不正入力、readBufferは変更しない。getParameter(FRAMEBUFFER_BINDING)やnative IDを使わず、診断は `tracked/requested` と明記する。元のthis・戻り・例外、read/draw分離、重複owner拒否、例外時finally、descriptor復元、10回の再入場を厳密なsemantic fixtureで確認した。手動bindでThreeのcacheを飛び越さず、通常のsetRenderTarget経路を維持する。

## エラー観測と寿命

`nativeGlObserver`がこのCanvasのgetError取得者となる。既存の終端検査も同じobserverを使い、読んだエラーは先頭8個まで保持して後続のcleanupで押し出さない。Expo GET_ERRORS loggerは有効にしない。チェック対象は既に採用nativeで確認したframebuffer status、VERSION、SHADING_LANGUAGE_VERSIONであり、attachment/bindingの未対応照会を増やしていない。

内部preview／developmentの最初のフレームだけ、context/init、target setup前後、反射前後、target restoration前後、main前後、diagnostic query前後、既存native提示直前・帰還後を区切る。bindFramebuffer/drawBuffersは最大64 callback、各配列は最大8 enum、初期boundary読取は最大96、各読取は最大4 error、詳細記録は48 entryまで。エラー境界は詳細上限から独立して保持する。getErrorは同期queue境界を作るため、計測は負荷・実行時刻に影響する。gl.finishは追加しない。

`firstFailure`へ `firstErrorBoundary`、観測できた場合だけ `firstInvalidOperation`、query failureを追加した。個別drawBuffersへの帰属には、直前のgetErrorが実際にNO_ERRORへ到達した `confirmedClear` と、直後の0x502を要求する。単に関数が存在する／空配列だったという推測は使わない。getErrorがthrowした直後はqueryを実行せず、後から見つけたエラーをquery原因と偽らない。query自身のGL error、query例外、帰属不能も区別する。schemaVersionは既存1の追加fieldとして維持する。

正常な最初のwrapper帰還とGL検査後は詳細entryを捨て、回数・補正数だけ残す。setRenderTarget計測wrapperとadapter callbackを解除し、通常playで毎命令の同期検査を継続しない。終端検査は従来のstartup最大2Hz、play最大1Hzを保ち、各queryの前後だけ読取が増える。現在の単一status query fixtureでは1回の終端検査がgetError 1回→3回になる。失敗時は計測を止め、反射finallyの復元を終えたmicrotaskでadapterを復元する。close時は即時・冪等に復元し、タイムアウト／mount failureも同じownerの停止hookで処理する。

GLエラーを検出したframeは提示／readyに進めず、主描画の受理return counterも更新しない。`renderCalls`は試行数として残す。r7 JSONのmain return=1という過去の観測を書き換えず、r8の `renderReturns` はそのframeで予定された検査を通過したreturnを数える。提示APIの帰還は実画素の証明ではない。シミュレーション、入力、AI、音は反射で二回更新せず、既存の提示後publishと失敗rollbackを維持する。

## 検証の証拠境界

| 検査 | 結果と限界 |
| --- | --- |
| 付録Bの再実行 | 既存EGL 1.5 / Mesa25.2.8 / llvmpipe / ES3.2。本当のFBO0+BACKは正常。completeな非zero RGBA8 FBO+BACKは0x502、COLOR_ATTACHMENT0は正常。7 gate成功。ExpoアプリやiPhoneではない。 |
| adapter単体 | 21ケース成功。未補正経路がexpected0/actual1282で落ちたredを保持。同じnative drawable意味fixtureで修正後green。 |
| Three＋本編scene | [新QA script](../scripts/qa-native-default-framebuffer.cjs)が新しく実StageSceneをmount/exportし、採用Three WebGLRenderer、実planarMirror材質/RT、実adapterをChromium SwiftShaderへ載せた。logical nullをfixture所有の実非zero FBOへ写す。19ケース／14 gate成功。正面と報告poseの双方で未修正restoreの実GL0x502を再現、修正後の全境界は正常。trace ON/OFFで画素hash・描画数一致、背面skip、10回の所有・解放を確認。Expo native提示は模擬API帰還。 |
| installed native R3F経路 | 実Canvas/Provider/reconciler/鏡sceneを使い、device context/rendererだけをsemantic fixtureにした。反射後・復元drawBuffers直後・query・pre-existingの注入を提示前に止め、counter/ready非昇格、最初の原因、wrapper復元を確認。これは実Three GL-stateの代わりではなく、上行と補完する検査。 |
| 保存・本編 | 報告poseのcheckpoint、鍵、確定歯止め、未確定保持中のGL failureと安全retry、home/coldを実controller/codecで検査。03→04→05、全01→05のcontroller/App通し、pause/背景/10回入退場を既存検査と実scene再生で確認する。詳細は[製品回帰](qa-goal013-1/r8-product-regression.json)。 |

Bの結果・実際のsource hash・backend・command列は[r8-browser-framebuffer-report.json](qa-goal013-1/r8-browser-framebuffer-report.json)。actual nativeGlObserverをQAの単一error readerとして使い、adapter callbackを通して同期command境界も比較した。正面と報告poseではtrace OFF6回／ON23回、背面ではOFF5回／ON6回のgetError読取となり、出力は一致した。これはsoftware WebGLでの比較であり、EXGL queueやiPhone性能の保証ではない。

初回QA assertionは「背面で反射を省略するとtrace eventが0」という正常条件を誤って拒否したため訂正し、最終19ケースを実行した。observerの独立レビューでも「getErrorがthrowした後の誤帰属」を再現し、confirmedClear追加後に同じfixtureで解消を確認した。失敗した試行を合格数へ含めていない。

baselineは110 suites／1,155 testsと通常iOS export成功。初回native integrationは68成功／1失敗で、失敗はコピーassertの旧r7文字列だった。r8へ更新後、該当ケースが成功した。誤った名前filterによる全69対象外の試行も検証成功として数えない。最終 `npm run check` はlint・型検査・113 suites／1,190 tests（240.83秒、skip0）・iOS export1,578 modules／10 assetsまで成功。iOS/Android/neutralは各232 production modules／709 runtime edges、循環0／検査error0。保護6ファイルは開始時とbyte一致。Doctorは初回React Native Directoryの外部応答異常で20/21、詳細付き再実行で21/21。Expo依存チェック・npm ls・Stage validator・両音源再生成checkは成功。auditは既存moderate11／high0／critical0でexit1、修正は適用していない。source map照合、Three同一性、profile別export、各log hashを含む最終結果は[r8-verification.json](qa-goal013-1/r8-verification.json)に記録する。

preview Hermes、preview／productionのsource-map付きRelease JS、developmentの4 exportも `--clear` で成功した。全bundleはr8を含みr7を含まない。preview206、production206、development226のfirst-party本文が `c79a75f` と一致し、248入力のhash guardも一致。実Threeクラス同一性、Releaseの5エリア／10 assets、開発画面・probe除外、実development Metroの6入口が成功した。実minified buildIdentity factoryはpreview診断true、production診断false。native Constantsだけを空metadataとして代用し、native buildはunknownとした。[r8-bundles.json](qa-goal013-1/r8-bundles.json)にコマンド、各bundle hash、全source対応と代用境界を記録した。

## 次の実機確認

修正版r8を含むpreviewの手順は[IPHONE_VALIDATION.md](IPHONE_VALIDATION.md)先頭へ集約する。今回の変更はJS/TSのみで、新しいnative依存・署名設定変更はない。ただし同梱Releaseのr7 previewはMetroで更新されないため、r8を含む新しいpreviewが必要。既存 `autoIncrement:true` と `appVersionSource:remote` を保持し、remote値をリセットしていない。次のnative build番号・EAS IDはビルド後に得られる値であり、ここではunknown。

最短確認はr8/profile/native build識別→既存04の続き→初回提示→レバー／鏡→05。再発時は詳細表示と診断コピーで最初の境界を取得する。01から全章や未変更r7の再ビルドを先に求めない。iPhoneの表示、実指、VoiceOver、錯視・怖さ、実聴、FPS／発熱は未実施。観測済みr7はFAIL、新候補r8はPENDING。push、PR、cloud build、認証、署名、OTA、アプリ／保存削除は行っていない。
