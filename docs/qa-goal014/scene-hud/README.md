# 五エリアの本編 scene と HUD

2026-09-16、移動する隔離扉の視線判定と拡大文字の操作領域を修正した後、`qa-stage-scene-hud.cjs` の102ケースを再実行した。現在のソース169ファイル・実行script・102画像のSHA-256がすべて一致し、実行前後の補助scriptのhashも一致した。詳細は [report.json](report.json) と [source-verification.json](source-verification.json)。

実際の `ChapterScene`、`FirstPersonScreen`、controller、checkpoint codecを組み合わせた静止画である。01〜03の装置を実際のHUD pressで開き、04で保持を開始し、05でキー装着・手順確認を行う。場面は視点fixtureであり、連続した自然プレイではない。04はキー取得・練習済みの有効なcheckpointを使い、入口の観察視点へ置き直しているため、入口画像の目的も本レバーのままである。

## 条件と結果

| 条件 | ケース |
| --- | ---: |
| 通常画質 | 51 |
| 低負荷画質 | 51 |
| 320×568 / 文字倍率2 | 34 |
| 390×844 / 文字倍率1.5 | 34 |
| 430×932 / 文字倍率1 | 34 |
| 本編の反射passが描画された画像 | 12 |
| WebGLエラー / browserエラー | 0 / 0 |

通常HUDの目的・pause・移動・文脈・主操作の矩形に、検査対象同士の重なりなし。主操作ボタンの最小サイズは142×64 CSS px。装置モードの操作ボタンは全ケース44×44 CSS px以上。文字倍率2では装置説明カードにスクロールがあり、全内容が同時に見えるという結果ではない。

ボタン矩形だけでなく、246個のボタンの文字範囲も測定した。文字がボタン内に収まり、通常HUDでは画面内にも収まることを確認した（丸め誤差1 CSS pxまで）。当初は320×568・文字2倍で04/05の5ラベル×2画質が3行になり、文字高107.19 pxが104 pxのボタンからはみ出した。[修正前の測定](button-text-before.json)のとおり画面外には出ていなかった。共通配置を132 pxへ広げ、説明位置とタッチ領域も追従させて全102条件が成功した。文字の切り詰め・拡大率の制限は加えておらず、文字倍率1の高さ64 pxは維持した。関連4 suites / 31 tests、型検査、Lintも成功。

| 画質 | main最大draw | reflection最大draw | 同一画像の全pass最大draw | 同一画像の全pass最大triangles |
| --- | ---: | ---: | ---: | ---: |
| 通常 | 134 | 63 | 134 | 27,388 |
| 低負荷 | 134 | 63 | 134 | 12,178 |

各列の最大値は別画像の場合があるため、最大mainと最大reflectionを加算していない。追加shadow passはない。これらは静止画のソフトウェア描画カウントであり、端末FPS、GPU時間、フレーム間隔の測定ではない。

## 代表画像

| 場面 | 画像 |
| --- | --- |
| 01 展示室の入口・標識・巡回体 | [通常430](gallery-entry-standard-430.png) |
| 02 収蔵庫の入口・留め金 | [通常430](vault-entry-standard-430.png) |
| 03 映写室の入口・光源と受光窓 | [通常430](theatre-entry-standard-430.png) |
| 04 取得済み輪郭パネルと入口標識 | [通常430](mirror-entry-standard-430.png) |
| 05 キー差込口を向いた保護位置 | [通常430](departure-key-ready-standard-430.png) |
| 01 同じ灰色の装置、低負荷・文字2倍 | [低負荷320](gallery-shadow-operating-low-320.png) |
| 02 長さの装置、低負荷・文字2倍 | [低負荷320](vault-length-operating-low-320.png) |
| 03 光源の装置、低負荷・文字2倍 | [低負荷320](theatre-light-operating-low-320.png) |
| 04 巻き上げ操作、低負荷・文字2倍 | [低負荷320](mirror-winch-ready-low-320.png) |
| 04 保持中の目的・歯止め・解除表示 | [通常430](mirror-winch-holding-standard-430.png) |
| 05 手順確認段階で停止盤へ向く | [低負荷320](departure-stop-locked-low-320.png) |
| 05 キー装着済みの完了状態 | [通常430](departure-key-installed-standard-430.png) |
| 05 呼び鈴・受鈴器・隔離扉 | [通常430](departure-bell-ready-standard-430.png) |

公開した代表画像13枚を含む全102画像・scene JSONはローカルの `.expo/goal014/stage-scene-hud/` にある。上表の画像は目視で確認した静止フレームであり、連続動画の全編確認ではない。

## 資源の所有と解放

Three 0.185.1の `MeshStandardMaterial` は最初の描画で共通の `DFG_LUT` を作る。採用版の `src/renderers/shaders/DFGLUTData.js` は16×16、RG half float、mipmapなしのmodule cacheを定義する（画像データ1,024 bytes）。`WebGLRenderer.js` がPBR shaderへ渡し、ゲームのmaterialが直接所有するtextureではない。

QAはゲームsceneの前に独立したPBRの箱を一度描画し、箱のgeometry/materialをdisposeして基準を採った。基準はgeometry 0 / texture 1。その後の102回のscene解放がすべて同じ基準へ戻り、ゲームscene由来のtexture差分は0。最後の `renderer.dispose()` 後はprogram 0。共通LUTのmemoryカウンタ1は残り、最終的にbrowser/contextを閉じる。この結果を「すべてのGPUメモリが0」とは表現しない。

当初のtexture 0要求は、このPBR導入前の前提で失敗した。許容数を増やすだけで済ませず、ゲームsceneより先に測ったLUT基準と各scene解放を比較する検査へ修正した。実機の再入場資源検証は別途必要。

## 施設標識の補助検査

[標識report](signs/report.json) は5エリアと04練習／本巻き上げ、05キー／鈴／隔離／電源の11視点。11視点を現行ソースから再採取し、全11枚の画像hash、136ソースhash、script hashを現在のファイルと再照合済み。標識検査が読む136ソースは、その後のHUD配置修正では変わっていない。安全な位置に置いた固定cameraから、対象標識の表面がcameraを向き、四隅が画角内にあることを検査した。WebGLエラー0。

- [展示室](signs/gallery.png)、[収蔵庫](signs/vault.png)、[映写室](signs/theatre.png)、[鏡廊](signs/mirror.png)、[退館制御](signs/departure.png)
- [練習](signs/practice.png)、[巻き上げ](signs/winch.png)
- [キー](signs/console-key.png)、[呼び鈴](signs/console-bell.png)、[隔離](signs/console-isolation.png)、[停止](signs/console-power.png)

これは標識の投影・向きの検査で、全ての自然な歩行位置から読める証明ではない。この標識用scriptは反射を実行せず、resource leakや連続プレイを検査する用途でもない。

## 再現と境界

```bash
node scripts/qa-stage-scene-hud.cjs
node scripts/qa-facility-signs.cjs
```

CSSとSwiftShader WebGLによるQA。native Canvas readiness、音、build metadataは明示fixtureであり、EXGLの正常提示、Yogaの文字組み、実指のgesture、iPhone上の読みやすさ、実聴の代わりにはならない。DEV/preview実機と利用者テストはPENDING、RELEASE_READY=falseを維持する。
