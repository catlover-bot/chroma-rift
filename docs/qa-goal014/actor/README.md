# 巡回体の同条件比較

beforeは`3632675e5c42ac252cca433a5e6dd45bb028f8c5`の実`GalleryActor`とresource factoryをローカルGit archiveから読む。afterは現在の実componentと明示rigを読む。実React ref／useFrame callbackを実行し、同じ408個のauthoritative actorMotion状態を両方へ渡す。rendererは一つのChromium SwiftShader WebGL2。床と照明は検査用で、本編のAI経路やExpoのnative提示を再現したものではない。

2026-09-16の[再照合記録](source-verification.json)では、身体の4ソース、baselineの56ソース、抽出データ・408状態の列、script、公開画像8枚・動画2本が保存済みhashと一致した。抽出時の広いimport一覧60ファイルのうち、施設標識と環境素材の2ファイルだけは後から変更されている。これらは身体単体のsceneには使われず、身体resource factoryと残る58ファイルは一致するため、この身体比較は再描画せず保持した。本編シーン・標識は別途現行ソースで再採取している。過去の一覧全60ファイルが現在一致するという主張ではない。

- [standard motion](motion-standard.mp4) / [low motion](motion-low.mp4)：17秒、24fps、固定camera、左右before/after。idle→歩行→注意／旋回→捜索→追跡→予備動作→攻撃→戻り→停止。13秒から手→肩→頭。無音の身体検査で、04/05の音付き本編動画とは別。
- [standard front](turntable-standard-front.png) / [quarter](turntable-standard-quarter.png) / [side](turntable-standard-side.png) / [back](turntable-standard-back.png)。lowも同じ名前規則の4方向。左右は同じcamera・照明・pose・品質。恐怖設定によるspeed変更は入れていない。
- [実source／pose／geometry計測](actor-art-extraction.json)：Git baseline、current source hashes、同一timeline hash、bounds、足と眼。
- [実WebGL結果](actor-art-webgl.json)：816枚、全GL error 0、browser exception 0、8方向PNG＋2本の動画hash、各paneごとのdraws／triangles、解放結果。

映像の全編連続視聴・音の実聴・実機計測とは扱わない。front／quarter／side／backと停止途中のフレームを抽出確認した。身体全体のmeshは24→20、標準trianglesは3,274→20,214、lowは3,166→6,730。各paneはactor＋検査床1枚なので、標準idle例はbefore25calls/3,276triangles、after21calls/20,216triangles。足が浮いたframeでは接地面が非表示になりcall数が変わる。この動画に反射／動的shadow passはない。本編mirrorの全pass合計は本編検証で別に計測する。

CPUから2pane分のrenderを発行する壁時計はp50 39.0ms / p95 46.8ms / max77.1ms（ソフトウェアWebGLと画像読出しの検査環境）。GPU時間、iPhoneのframe-time、実機FPSではない。調査scriptは結果に計測scopeを残す。

scene geometryは解放後0。textureはwarm rendererで1、scene解放後も1で増分0。採用Threeの`WebGLRenderer.js`がPBRへ渡すmodule所有の`DFG_LUT`（`shaders/DFGLUTData.js`、16×16 RG half-float）であり、actor専用textureは0。rendererも最後にdisposeし検査contextを終了する。scene ownerのgeometry/materialは10回の実生成・解放テストで各一回を確認する。

途中の失敗を隠さない：最初のactorテストはenvelope定数をbarrelからimportしてundefinedになり2件失敗（本体定数は変更せず正しいmodule importへ修正）。同時にThreeオブジェクトへの直接代入がhook immutability lintに抵触し、rigの`apply`メソッドへまとめた。最初のWebGL quickはactor/GL/geometry解放に合格したが、texture総数0を期待するgateが共有DFG1個で失敗した。warm renderer基準・Three実装と照合したactor増分0のgateへ修正し、全816frameを新しく実行した。最終focusは3suites/21tests PASS、file-specific lint PASS。repo全体のtypecheck途中実行は並行作業中audio型の未実装箇所でFAILし、actorファイルの型エラーはなかった。最終統合checkの結果はGoal014本体に従う。

再生成（クラウド操作なし）：

```bash
node scripts/preview-actor-art.cjs
```

`--extract-only`はsource→pose/geometryを生成、`--render-only`はそのhash済みデータを描画する。`.expo/goal014/actor-art`にPNG列と抽出dataを置く。比較終了時にactor source hashesを再照合し、途中変更は公開失敗にする。`--quick`は少数frame検査だけなので正式動画証拠として数えない。

DEVICE_ACCEPTANCE=PENDING / RELEASE_READY=false。
