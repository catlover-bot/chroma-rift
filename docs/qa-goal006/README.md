# Goal 006 静止表示 QA

`GalleryScene.tsx` が出す実際の mesh / material / InstancedMesh を取り出し、同じ scene の更新 callback を1回適用して、ブラウザーの Three WebGL で描画した19枚。加えて、`galleryGraphics.galleryRaster` と本編共通の色・頂点・角度・slot定義から生成した16枚のソフトウェアラスタがある。今回すべての PNG を画像として開いて確認した。最終閲覧対象のハッシュは [visual-review.json](visual-review.json) に記録した。

この手順は native R3F reconciler、Expo GL の実フレーム、HUD、指操作、音、端末の色出力、知覚、FPS の検証ではない。React test renderer で設定した場面は QA 用の状態 fixture であり、実プレイでそこへ到達した記録ではない。別の controller 回帰テストや実機確認と区別する。

## 再生成

既存の Node / React / react-test-renderer / TypeScript / Three と Node 標準ライブラリを使用する。新しいブラウザーフレームワークや依存のインストールは不要。

```bash
cd /home/mhirotaka/workspace/chroma-rift
node scripts/preview-gallery.cjs --capture
```

`--capture` を外すと共通ラスタと scene JSON の生成だけを行う。ブラウザーは既存の `~/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell` を使う。別配置では `GALLERY_CHROME` を明示する。必要な共有ライブラリは `LD_LIBRARY_PATH`、未設定時は既存の `~/.local/opt/playwright-libs-ubuntu24/usr/lib/x86_64-linux-gnu` を使う。大きい scene JSON と Three のコピーは git 対象外の `.expo/goal006/gallery-preview/` に置く。

再生成は過去の目視確認を更新しない。PNG が変わったら再び開き、`visual-review.json` を更新する。

## 開いて確認した本編コードの表示

全景は390×844、狭い端末相当例は320×568、pixel ratio 1。65°の垂直FOV、sRGB出力、NoToneMappingを使用した。スクリーンショットの点線・輪郭ガイドは任意の支援表示で、通常の知覚刺激とは分ける。

| 場所 | 確認画像 |
| --- | --- |
| 入口 | [初期視点](entry.png) |
| A | [カラー](a-color.png) / [同じカメラで無彩色](a-neutral.png) |
| 回廊 | [A解放後](hub.png) |
| B | [初期](b-baseline.png) / [中立比較](b-compare.png) / [誤答配置](b-wrong.png) / [正答・ラッチ解放](b-correct.png) / [320px](b-phone320.png) |
| C | [初期](c-baseline.png) / [輪郭ガイド](c-guide.png) / [誤答角度](c-wrong.png) / [通常正答](c-correct.png) / [320px](c-phone320.png) |
| D | [鍵の観察位置](d-key.png) |
| 帰路 | [変更前](return-before.png) / [同じカメラ・変更後](return-after.png) |
| 最後の扉 | [閉じている](final-door.png) / [開いた後](final-open.png) |

帰路の比較カメラは `(0, 1.6, -0.2)`、yaw=π。入口と帰路で非対称の同じ柱・欠けた上桁が残り、その先だけが変化する。sceneの元ファイルとハッシュ、カメラ、寸法は [scenes.json](scenes.json) に記録した。

## 共通データからのラスタ

これはブラウザー画像・ネイティブ画像とは異なる。B の枠・ソケット・建築、C の外側ノッチ等の本編 mesh は含まない。`guide` はBでは中立背景比較、Cでは点線輪郭ガイドを表す。

| 内容 | 512×384 | 320×240 |
| --- | --- | --- |
| B 初期 | [画像](panel-shadow-baseline-512.png) | [画像](panel-shadow-baseline-320.png) |
| B 比較 | [画像](panel-shadow-guide-512.png) | [画像](panel-shadow-guide-320.png) |
| B 誤答 | [画像](panel-shadow-wrong-512.png) | [画像](panel-shadow-wrong-320.png) |
| B 正答 | [画像](panel-shadow-correct-512.png) | [画像](panel-shadow-correct-320.png) |
| C 初期 | [画像](panel-contour-baseline-512.png) | [画像](panel-contour-baseline-320.png) |
| C ガイド | [画像](panel-contour-guide-512.png) | [画像](panel-contour-guide-320.png) |
| C 誤答 | [画像](panel-contour-wrong-512.png) | [画像](panel-contour-wrong-320.png) |
| C 通常正答 | [画像](panel-contour-correct-512.png) | [画像](panel-contour-correct-320.png) |

## 発見した表示の不足と再確認

- 最初のWebGL画像ではAの3つの印が筐体の前面に隠れていた。筐体を後退した修正後、紋章全体と丸・ひし形・四角を同じ観察画像で確認した。
- 入口の初期視点で記憶用装飾が見えなかった。world定義の装飾位置と描画をそろえた修正後、初期視点と帰路の両方で非対称の柱と欠けた上桁を確認した。
- Cの切欠き内側にも残る外周リングを外向きの小さなノッチへ変更。通常正答画像で中央の背景が連続することを確認した。
- 最後の扉を開いても取っ手が空中に残っていた。扉への追従修正後、開いた通路から取っ手が退避することを確認した。
- Bの見本が320×568の画像では小さかった。共通定義を一辺0.42m、判定余白0.06mへ変更した後、画像を再生成して5枚のWebGL画像と8枚のBラスタを再び開いた。320px画像では見本が約38pxに拡大し、各配置で枠内に収まることを確認した。判定余白は画面に描かれず、実端末のドラッグしやすさは未確認。

これらは静止画像での確認である。実端末の押下・引き出し・開閉アニメーションの分かりやすさや初見攻略時間は未測定。

## 数値検査と限界

[WebGL結果](webgl-results.json): Linux Chromium / ANGLE SwiftShaderの実WebGL描画。19視点の最大は **77 draw calls / 3,066 triangles**、全視点で暫定予算150 / 100,000以内、ブラウザー例外0。Software GPUなのでiPhoneの速度・発熱・メモリ上限の証拠にはしない。

[画素検査](pixel-contracts.json): Bの5場面×3見本の中心RGBAはcanonical値に一致した。Aカラー／無彩色の紋章板の外は差分0。C通常正答の三角形内部は辺から18mmを除外して390px版5,832画素・320px版2,662画素を調べ、すべて同じ背景色だった。これらは人が明暗差や輪郭をどう感じたかの測定ではない。

[CPU資源所有](snapshot-ownership.json): 19回のscene抽出・React unmountで各46資源のdisposeを監視し、すべて一度だけ破棄された。フレームcallbackの記録は抽出ハーネスが各回に破棄する。nativeの購読解除をこの仕組みで代用しない。

[ブラウザー再描画](webgl-lifecycle.json): 1 rendererで同じB場面を10回load/render/disposeし、各回geometry / textureカウンターが0へ戻った。QA viewerはanimation timerを登録せず、完了時のCDP待ちリクエストは0。nativeアプリ10回再入場時のrenderer/context/player/listener/timer数は別の実機確認として残る。
