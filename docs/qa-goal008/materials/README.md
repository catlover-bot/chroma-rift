# Goal 008 Phase B — 仮面と静的ハイブリッドの先行 QA

実装前半の独立した素材シーンで、13枚の実WebGL画像と5枚のoffline 2D画像を開いて確認した。本編のcabinet・窓・HUD・操作・敵・実iPhoneはこの段階には含まない。アプリ統合後のQAと、錯視や怖さを人が感じた検証は別にする。

## 元素材と座標

[Commonsの実ファイルページ](https://commons.wikimedia.org/wiki/File:Hollow_face_illusion.stl)は Wael Tsar の顔をcmgleeがrecenter/symmetrize/STL変換したものとして、[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)を表示していた。currentファイルは2022-03-15のthumbnail用135度回転版、page revision 881101748。原本を指定URLから1回目の要求で取得（HTTP200、application/sla、125,984 bytes）。原本SHA-256は `3ab98617f246ff0b3616cec9656aecdcd670ce43e8c96d66a7e1acaa8a8a5a75`。取得失敗や独自fallbackへ進んだものとして扱わない。

原STLは2,518三角形、1,293の重複除去後頂点。回転後の軸は `X=(sourceX-sourceY)/sqrt(2), Y=sourceZ, Z=-(sourceX+sourceY)/sqrt(2)`。行列式+1の回転、正の一様scale、高さ1m、Y中心と最前端z=0への平行移動だけを形状へ適用した。原本自体が凹面であり、本編用の鼻深度を反転していない。頂点をexact weldしてindexを作り、面積重みの法線を再計算した。元面法線との向き違い0、退化三角形0。

normalized boundsは x=±0.4001147m、y=±0.5m、z=-0.5550166〜0m。中央の鼻頂点は `(0,-0.0516989,-0.5550166)`、法線z=0.9822796。見る側はlocal +Z、Face materialはFrontSide、runtime scaleに負値を使わない。[実座標の中心線断面図](mask-coordinate-section.svg)と [機械可読台帳](../../../assets/perceptual/manifest.json)に根拠を残した。

凸面controlは別の説明用geometryで、zだけを反転して法線を再計算する。開いた面を同じ+Z側から見るためXY windingを保つ。初回QAで凸controlのwindingを反転すると裏面しか見えなくなる問題を見つけて修正し、正面からのray交差と法線をテストした。本編の固定仮面をこのcontrolへ入れ替えない。

## ハイブリッドの実処理

顔と棚/ドット線文字CLOSEDを数式と自作5×7字形で描いた。外部写真、Bachの掲載画像、外部フォントを同梱していない。512×512、seed80873、linear-light grayで生成する。

`H = 0.46 + 0.20 * normalize(Gaussian(low,12)) + 0.28 * normalize(high-Gaussian(high,2.25))`

Gaussianは半径ceil(3σ)、分離畳み込み、正規化重み、端clamp。LP/HPのnormalizeは各々平均を引き、最大絶対偏差で除す。最後にsRGB transferで8bit grayへ変換する。clipping率0、原画・LP・HP・最終画像を保存。HP対照は符号を表示するため0.5を中心に再表示した補助画像で、本編の別variantではない。

runtimeは同じ512² DataTexture/UVを保持し、sRGB、LinearFilter拡大、LinearMipmapLinearFilter縮小を使う。基底RGBA1,048,576 bytes、全mip込み1,398,100 bytes。一つの材質へ固定し、距離thresholdやクロスフェードを持たない。[Bachの解説](https://michaelbach.de/ot/fcs-spatFreqComposites/index.html)は周波数分離の現象の参考で、掲載画像は使用していない。Oliva Labの指定要旨URLは取得時timeoutで、取得できた本文として引用しない。

## 実際に開いた画像

全WebGLは390×844、vertical FOV65度、pixel ratio1、sRGB出力/NoToneMapping、Linux Chromium headless/ANGLE SwiftShader。仮面の固定光源はambient .35＋directional1.15（位置-2,3,4）。控えめfixtureも同じ明るさで、光の差を錯視の代用にしていない。ただし、この画像は本編設定UIを動かした証拠ではない。

| 対象 | 画像 |
| --- | --- |
| 正面 | [固定仮面](mask-front.png) / [同じ明るさの控えめfixture](mask-subdued.png) |
| 左右 | [左](mask-left.png) / [右](mask-right.png) / [さらに左](mask-left-far.png) / [さらに右](mask-right-far.png) |
| 凹面構造 | [側面](mask-side.png) / [側方観察](mask-section.png) |
| 別の凸面対照 | [正面](mask-convex-control.png) / [側面](mask-convex-side-control.png) |
| 同一の掲示 | [近2.3m](hybrid-near.png) / [中3.6m](hybrid-middle.png) / [遠5.2m](hybrid-far.png) |
| 自作原画 | [低周波用の顔](../../../assets/perceptual/hybrid-source-low.png) / [高周波用の掲示](../../../assets/perceptual/hybrid-source-high.png) |
| 周波数対照 | [LP](../../../assets/perceptual/hybrid-low-pass.png) / [HP補助表示](../../../assets/perceptual/hybrid-high-pass.png) / [最終H](../../../assets/perceptual/hybrid-composite.png) |

仮面の目鼻口は読め、側方では端と鼻の奥行き関係を確認できた。近景の掲示ではCLOSEDと棚線が読みやすく、縮小した像では大きい顔の輪郭が目立つ構図になった。掲示の投影幅/高さは約360/230/159pxで、ユーザーが物理的に端末から離れた実験ではない。これを人一般への錯視成立や「必ず追って見る」という証拠としない。

## 自動検査と再現

```bash
node scripts/generate-perceptual-assets.cjs
node scripts/preview-perceptual.cjs --capture
npx jest --runInBand src/rendering/firstPerson/__tests__/perceptualResources.test.ts
```

生成スクリプトはnetworkを使わず同梱した原STLを読む。runtimeはSTL loader/addonsを持たずnormalized JSONからcanonical Threeを作る。既存ブラウザーがない環境ではGALLERY_CHROMEを指定する。共有ライブラリーは既存Playwright用Linux配置を使う。

- Offline再生成で8素材の全SHAが一致: [再現記録](reproducibility.json)。
- 13 views全て1 rendererで実WebGLを描画。仮面は1 draw call/2,518 triangles、掲示は1/2。cameraを変えてもloaded objectのmatrix/position/normal/UV/texture identityは不変、budget内、browser exception0: [結果](webgl-results.json)。
- 3 tests PASS: 鼻/凹面と凸controlのFrontSide ray交差、座標と1 textureの不変、全資源dispose exactly once。対象lintとdiffチェックPASS。
- [source hashと視点](sources-and-views.json)、[実閲覧した18画像のSHA](visual-review.json)。本編の10回入退出やiPhoneのGPU残存数はこの小シーンの結果から推測しない。

本編のcabinet側面窓、通常操作で側方へ歩くこと、展示間の動線、大きい文字、通常/控えめの実設定、native minification、知覚・音・怖さ・実機FPSは統合と実機の別段階で確認する。
