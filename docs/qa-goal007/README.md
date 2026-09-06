# Goal 007 表示・操作配置 QA

P0では40枚、新版では61枚のHUD合成画像と5枚のraw画像を実際に開いて確認した。これは幾何学・ブラウザー描画・CSS配置の検証であり、iPhone、実指、錯視の知覚、怖さ、実聴の確認ではない。アプリの実controller走破、native GL mock、保存、音の検証は [GOAL-007](../GOAL-007.md) 側の結果と分ける。

## P0の回帰比較

[板・枠・裏板のbefore/after](p0/README.md)には履歴922db3dの旧章と旧Gallery A、40画像、実Three座標、閲覧ハッシュを保持した。旧Gallery Aは隔離した回帰fixtureであり、新版に必須のAを再追加したものではない。旧Gallery Aのopaque box前面と刺激面の同一深度を再現し、共通PanelFixtureの20mm裏板離隔・4mm枠余白で解消した。旧章は元から裏板の離隔があり、中央の茶色混入を同様には再現しなかった。

## 再生成の範囲

```bash
node scripts/preview-closed-gallery.cjs --capture
```

既存のReact/react-test-renderer/Three/TypeScriptとNode標準ライブラリを使用する。新規ブラウザーフレームワークや依存の導入はない。既存Chromium headless-shellを起動し、Node WebSocketでCDPへ接続する。環境はLinux Chromium / ANGLE SwiftShader、Three 0.185.1、pixel ratio 1、65度のvertical FOV、sRGB / NoToneMapping。既定ブラウザーがない環境では `GALLERY_CHROME` に実行可能ファイルを指定する。必要なLinux共有ライブラリーは既存の `~/.local/opt/playwright-libs-ubuntu24/usr/lib/x86_64-linux-gnu` を使う。

実GallerySceneとGalleryActorのReactホストを実Three objectへ写し、実scene callbackを一度実行してJSONへ抽出する。InstancedMesh、world行列、材質、runtimeの位置を使う。HUDは実FirstPersonScreen、GalleryDeviceControls、SceneActionButtonのホスト・文言・styleを取得し、ブラウザーCSSへ変換して重ねる。nativeCanvas、音、hapticsは境界で差し替えている。safe areaを除いたscene領域相当のlogical寸法として320×568・390×844・430×932、fontScale 1/2を使った。native YogaやiOSフォントメトリクスと同一とは扱わない。

B/Cの状態と電源数などは意味を明示したQA fixtureとして構成している。画像から、実入力による到達や保存復元まで済んだとは推論しない。例外として出発0/1/2/4秒系列は、台上のdeparting状態から実advanceGalleryActorを0.05秒刻みで進めた静止系列である。完全なプレイ経路や実時間動画の証拠ではない。全カメラは実worldのisSafePoseを通す。

HUD合成は `gallery/<id>.png`、同じ描画のHUDなしrawは `<id>-scene.png`。撮影元19ファイルのSHA-256と全fixtureは [scenes.json](gallery/scenes.json)、開いた画像のSHA-256は [visual-review.json](gallery/visual-review.json)。再生成後に画像を見ず、閲覧ハッシュだけを更新しない。

## 見た目と配置

Bは0枚・1枚・2枚・不正解・引き出し・取得後・背景比較を確認した。見本自体の灰色は保持され、持ち手と外枠が内側の色面へ入らない。Cは未整列・整列・ガイド・引き出し・取得後を確認した。通常の中央は無描画で、B/C操作中のHUD照準も表示しない。補助ガイドだけに細い破線が現れる。13は正立し、比較で板外の地形・カメラが変わらない。

幅320・文字2倍では下部をスクロールして操作する。上端と下端の両画像を確認した。ボタンを一度に全て表示できるとは主張しない。スクロールしても板と完全に開いた引き出し・電源の投影範囲へ操作欄が重ならない。pauseと目的/電源欄の横余白は8 logical px、全寸法・文字倍率で矩形交差0だった。探索中の移動・照準HUDは残る。

予兆は格子の向こうの頭・長腕・非対称な肩として見える。横視点では頭が格子の間へ見える。出発系列は台から横へ連続移動し、空台が残る。棚奥の2画像では棚が画面を覆って敵を遮蔽するため、入口の説明には別の通路側画像を使う。控えめの休止位置は実route[5]と最終接近角から導出した。最終扉の接近像は、敵を背後z10.8に置いた通過済みfixtureで、前方の扉と進路を見る。画像上の見え方は、人が怖いと感じた結果ではない。

## 数値と修正の証拠

| 検査 | 結果 |
| --- | --- |
| 61視点の実WebGL | 全て予算150 calls / 100,000 triangles内。最大53 calls / 2,400 triangles、browser exception 0。 [結果](gallery/webgl-results.json) |
| HUD・投影・部品 | 全PASS。操作欄と板/引き出しの交差0、ボタンによるdrag領域遮蔽0、ボタン最小48 logical px。Bの最小drag矩形47.387px、C48.145px。 [座標](gallery/layout-and-geometry.json) |
| raw画素55検査 | 全PASS。Bの見本中心は配置・比較を通じcanonical opaque RGBA。任意色比較の板外変化0。C整列時の中央内部は背景RGBA(232,228,216,255)のみ。境界18mmは除外し、raw検査はHUDを含めない。 [結果](gallery/pixel-contracts.json) |
| 敵の実mesh体積 | yaw6種×stride3種の18姿勢で保守体積内。全実頂点の水平半径最大0.414407919m、専用半径0.44m内。実休止向きの3姿勢は壁/扉の正体積交差0。 [全座標](gallery/actor-envelope.json) |
| 10回生成・破棄 | 1 browser renderer。各回geometry/textureが0、scene離脱。未完了CDP要求0、viewerにanimation timerなし。 [結果](gallery/webgl-lifecycle.json) |
| React/CPU所有 | 61sceneで各50追跡resourceを1回ずつdispose、未破棄/二重破棄0。native GPU/audio/application lifecycleとは別。 [結果](gallery/snapshot-ownership.json) |

QAで見つかった不足は、B外枠の色面への3.5mm侵入、操作欄による引き出し・電源の遮蔽、歩行時の足底/回転姿勢が敵の保守体積から出ること、13の上下方向、C中央のHUD照準だった。担当実装側でそれぞれ外枠寸法、full-open world AABBの投影、actor体積と専用衝突半径、fixtureのright方向、装置操作時の照準を修正し、今回の再撮影・数値で再確認した。

裏板・枠は共通PanelFixtureで刺激面から分離する。新版B/Cでは板面local z=0、見本面+.013、socket枠+.005（厚み.006）、C切れ目印+.006（厚み.006）、円盤+.010、補助破線+.020。通常面に同一深度の裏板や全面boxを重ねていない。引き出し本体・取っ手・電源は別の立体部品、床本体上面y=0・観察輪y=.012・誘導灯下面y=.0045で同一面を避ける。旧P0の壁画像と新版棚の遮蔽像でdepthを無効化した疑似修正ではないことも分けて記録する。

## 画像一覧

| 区分 | 実際に開いた画像 |
| --- | --- |
| 入口と電源 | [entry-before](gallery/entry-before.png) / [entry-after](gallery/entry-after.png) / [exit-0](gallery/exit-0.png) / [exit-1](gallery/exit-1.png) / [exit-2](gallery/exit-2.png) / [exit-connected](gallery/exit-connected.png) |
| 両順の電源 | [hub-b-first](gallery/hub-b-first.png) / [hub-c-first](gallery/hub-c-first.png) |
| B 配置 | [b-baseline](gallery/b-baseline.png) / [b-one](gallery/b-one.png) / [b-two](gallery/b-two.png) / [b-wrong](gallery/b-wrong.png) |
| B 取得・比較 | [b-drawer](gallery/b-drawer.png) / [b-taken](gallery/b-taken.png) / [b-compare](gallery/b-compare.png) |
| C 通常・整列 | [c-baseline](gallery/c-baseline.png) / [c-aligned](gallery/c-aligned.png) / [c-guide](gallery/c-guide.png) |
| C 取得 | [c-drawer](gallery/c-drawer.png) / [c-taken](gallery/c-taken.png) |
| 任意展示 | [color-exhibit](gallery/color-exhibit.png) / [neutral-exhibit](gallery/neutral-exhibit.png) |
| 通路・扉 | [service-open](gallery/service-open.png) / [final-door](gallery/final-door.png) / [final-door-approach](gallery/final-door-approach.png) |
| 敵の予兆 | [actor-foreshadow](gallery/actor-foreshadow.png) / [actor-foreshadow-side](gallery/actor-foreshadow-side.png) |
| 台からの出発 | [actor-depart-0](gallery/actor-depart-0.png) / [actor-depart-1](gallery/actor-depart-1.png) / [actor-depart-2](gallery/actor-depart-2.png) / [actor-depart-4](gallery/actor-depart-4.png) / [actor-empty-plinth](gallery/actor-empty-plinth.png) |
| 退避場所 | [retreat-west-opening](gallery/retreat-west-opening.png) / [retreat-east-opening](gallery/retreat-east-opening.png) / [actor-retreat-west](gallery/actor-retreat-west.png) / [actor-retreat-east](gallery/actor-retreat-east.png) |
| 通過・控えめ | [actor-passed](gallery/actor-passed.png) / [actor-subdued](gallery/actor-subdued.png) |
| 320幅の引き出し | [shadow-drawer-320](gallery/shadow-drawer-320.png) / [contour-drawer-320](gallery/contour-drawer-320.png) |
| 320幅・fontScale 1 | [b-layout-320-font1](gallery/b-layout-320-font1.png) / [entry-layout-320-font1](gallery/entry-layout-320-font1.png) / [c-layout-320-font1](gallery/c-layout-320-font1.png) |
| 320幅・fontScale 2 | [b-layout-320-font2](gallery/b-layout-320-font2.png) / [entry-layout-320-font2](gallery/entry-layout-320-font2.png) / [b-layout-320-font2-scrolled](gallery/b-layout-320-font2-scrolled.png) / [c-layout-320-font2](gallery/c-layout-320-font2.png) / [c-layout-320-font2-scrolled](gallery/c-layout-320-font2-scrolled.png) |
| 390幅・fontScale 2 | [b-layout-390-font2](gallery/b-layout-390-font2.png) / [entry-layout-390-font2](gallery/entry-layout-390-font2.png) / [b-layout-390-font2-scrolled](gallery/b-layout-390-font2-scrolled.png) / [c-layout-390-font2](gallery/c-layout-390-font2.png) / [c-layout-390-font2-scrolled](gallery/c-layout-390-font2-scrolled.png) |
| 430幅・fontScale 1 | [b-layout-430-font1](gallery/b-layout-430-font1.png) / [entry-layout-430-font1](gallery/entry-layout-430-font1.png) / [c-layout-430-font1](gallery/c-layout-430-font1.png) |
| 430幅・fontScale 2 | [b-layout-430-font2](gallery/b-layout-430-font2.png) / [entry-layout-430-font2](gallery/entry-layout-430-font2.png) / [b-layout-430-font2-scrolled](gallery/b-layout-430-font2-scrolled.png) / [c-layout-430-font2](gallery/c-layout-430-font2.png) / [c-layout-430-font2-scrolled](gallery/c-layout-430-font2-scrolled.png) |

rawで追加閲覧した5枚: [c-aligned-scene](gallery/c-aligned-scene.png) / [c-guide-scene](gallery/c-guide-scene.png) / [b-compare-scene](gallery/b-compare-scene.png) / [color-exhibit-scene](gallery/color-exhibit-scene.png) / [neutral-exhibit-scene](gallery/neutral-exhibit-scene.png)。

## 実機で残る確認

iPhone上のsafe area・Dynamic Type・VoiceOver・長い文言、指でのドラッグ/円盤回転とスクロールの競合、壁越し表示、実GPUの深度精度、色の知覚、怪異の怖さ、音量・定位・消音スイッチ、background復帰、10回の実再入場、発熱・メモリー・FPSは未確認。実装/ブラウザーQA完了をこれらの合格と置き換えない。[実機手順](../IPHONE_VALIDATION.md)に従って別途記録する。
