# P0 — 板・裏板・枠の描画干渉

40枚を実際に画像として開いて確認した。Linux Chromium headless / Three WebGL / ANGLE SwiftShader、390×844、pixel ratio 1、65° vertical FOV、sRGB / NoToneMappingで撮影した。本編のmesh/materialと一度だけ実行したscene callbackからの静止画であり、native R3F reconciler、iPhone GL、HUD、実指、知覚の確認ではない。

## 比較元と再生成

```bash
node scripts/preview-panel-fixtures.cjs --capture
```

スクリプトは履歴 `922db3d4404c68eeb61b2f0278f43b21da015744` をOS一時ディレクトリへ展開し、既存node_modulesを読み取りに使う。beforeはそのままの旧章とGoal006 Gallery A。afterはアプリの現在の共通PanelFixture、legacy ChapterScene、emblemFixtureをコピーし、隔離した旧Gallery Aのbox/planeだけを同じ共通部品に置き換える。**旧Gallery Aのafter画像は、Goal007新版にAが残っている証拠ではない。** 再設計された新版Galleryとは分けた回帰fixtureである。新しいキット・依存・native設定を追加しない。

元revision、隔離パス、適用したアプリソースのSHA-256は [provenance.json](provenance.json)、各シーンの実world bounds、カメラ、材質属性は [before/scenes.json](before/scenes.json) と [after/scenes.json](after/scenes.json)。全撮影位置を元の実worldのisSafePoseで検査した。move-0〜4は連続する経路上の5視点を同じ順で描いた静止系列であり、実フレーム間隔を測定した動画ではない。

## 実際に見えた差

旧Gallery Aの元boxは中心z=-7.86、厚さ0.1で、刺激面z=-7.81と同一面。Threeの倍精度計算では差が約8.9e-16mとなるため、厳密なBox3交差だけに依存せず、面積の重なりと1μm以内の同一深度も記録した。beforeでは正面・近接で茶色面に覆われ、右斜めと複数の移動視点で格子・縞の混入を再現した。左斜めなど正常に見える視点もあり、依頼文の視点依存の観察と整合した。ただし、提供録画自体を視聴した結果やiPhone固有原因の断定ではない。

afterは裏板前面z=-7.83、刺激面z=-7.81の20mm離隔。四本の枠は刺激の外側へ4mmの開口余白を置いた。20シーンすべてで裏板・枠が刺激面に交差せず、同一面もない。赤・青は同じ一枚のplane上の既存opaque textureのまま。depthTest/depthWrite=true、renderOrder=0を維持した。

旧章は元から裏板が20mm後方にあり、今回の画像でもGallery同様の中央混入は再現しなかった。ただし元の四枠は刺激の端と接していたため、同じ共通寸法から4mm余白を導出するよう変更した。旧章の表面中心・幅高さ・hit plane・距離条件、solidの外形を維持し、手入力で重複していた枠座標を除いた。before/afterの近接・左右・移動系列で色面の輪郭を保っている。

wall画像はQA用の不透明な実Three boxを板の手前へ追加したもの。before/afterとも板は壁に隠れ、透過して見えない。既存worldの壁越しinteraction拒否は別のdomain回帰テストで維持する。

## 閲覧した画像

| 視点 | 旧章 before | 旧章 after | 旧Gallery A before | 共通部品適用 after |
| --- | --- | --- | --- | --- |
| 正面 | [画像](before/legacy-front.png) | [画像](after/legacy-front.png) | [画像](before/gallery-front.png) | [画像](after/gallery-front.png) |
| 近接 | [画像](before/legacy-near.png) | [画像](after/legacy-near.png) | [画像](before/gallery-near.png) | [画像](after/gallery-near.png) |
| 左斜め | [画像](before/legacy-left.png) | [画像](after/legacy-left.png) | [画像](before/gallery-left.png) | [画像](after/gallery-left.png) |
| 右斜め | [画像](before/legacy-right.png) | [画像](after/legacy-right.png) | [画像](before/gallery-right.png) | [画像](after/gallery-right.png) |
| 移動系列 0 | [画像](before/legacy-move-0.png) | [画像](after/legacy-move-0.png) | [画像](before/gallery-move-0.png) | [画像](after/gallery-move-0.png) |
| 移動系列 1 | [画像](before/legacy-move-1.png) | [画像](after/legacy-move-1.png) | [画像](before/gallery-move-1.png) | [画像](after/gallery-move-1.png) |
| 移動系列 2 | [画像](before/legacy-move-2.png) | [画像](after/legacy-move-2.png) | [画像](before/gallery-move-2.png) | [画像](after/gallery-move-2.png) |
| 移動系列 3 | [画像](before/legacy-move-3.png) | [画像](after/legacy-move-3.png) | [画像](before/gallery-move-3.png) | [画像](after/gallery-move-3.png) |
| 移動系列 4 | [画像](before/legacy-move-4.png) | [画像](after/legacy-move-4.png) | [画像](before/gallery-move-4.png) | [画像](after/gallery-move-4.png) |
| 手前の不透明壁 | [画像](before/legacy-wall.png) | [画像](after/legacy-wall.png) | [画像](before/gallery-wall.png) | [画像](after/gallery-wall.png) |

## 他の近接面の監査

記録したGoal006描画ではB/Cのbody前面z=-15.79に対し背景面z=-15.78で10mm離隔。Bの見本本体は背景から13mm、外枠は12mm前方。C円盤は背景から10mm前方で、通常の中央を塗らない。棚の細い部材は別の実体として背景より3mm前へ出る。床はy=0、色板y=0.008、観察マーカーy=0.012で一致していない。今回の旧章に独立した文字ラベル面はない。新版B/Cのトレー・取っ手・ラベル・床灯は新版QAで別途確認する。

## 自動検査

- 共通部品＋既存startupGeometry＋emblemSurface: 3 suites / 12 tests PASS。実ChapterScene JSXにinstalled R3F applyPropsを適用し、実Three world行列から裏板・枠・面・hitplane・solidの整合を検査。側壁に回転したfixtureも確認。
- P0を適用した隔離コピーのTypeScript型検査: PASS（新版gallery全体の最終型検査とは別）。対象ファイルのESLint: 警告なしPASS。
- before/afterそれぞれ20視点を実WebGLで描画。browser exception 0。最大はbefore 125 calls / 2,756 triangles、after 125 / 2,804。これはSoftware GPUの静止描画数で、iPhone性能の測定ではない。
- 各セットで1 rendererを使って10回load/render/disposeし、geometry / textureカウンターが毎回0へ復帰。CPU所有検査も各sceneの実React unmountとresource disposeを確認した。native再入場の代用ではない。

数値は各セットのwebgl-results.json、webgl-lifecycle.json、snapshot-ownership.json。閲覧画像のSHA-256は [visual-review.json](visual-review.json)。再生成後の画像を見ずに目視済みハッシュだけを更新しない。

## 実機で残ること

iPhoneの正面・近接・左右・歩行中で色面へ茶色片や縞が混じらないか、壁越し表示がないかを確認する。今回確認したのは幾何学とブラウザー表示であり、端末の描画解消、実指操作、錯視の知覚、怖さ、音、発熱、実フレーム時間は未確認。
