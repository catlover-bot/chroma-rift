# Goal008 — 素材先行・統合描画 QA

本記録は実装由来の形状・画像・HUDを確認するための証拠であり、iPhone実機、実指操作、実聴、錯視や怖さの知覚確認ではない。原キットの検証結果とも分けて扱う。

## 記録の範囲

| 記録 | 内容 |
| --- | --- |
| [素材先行 QA](materials/README.md) | 本編統合前の凹面仮面・凸面対照・断面とハイブリッド近中遠。取得原STL、正規化、Gaussian処理、再現hash。 |
| [改修前の展示体](actor-before/README.md) | baseline `8ca5ba3` の実GalleryActorを隔離し、Goal008作業中のworld/materialsで同camera4視点を保存。旧アプリ全体の画像ではない。 |
| [統合画像の全覧](gallery/index.md) | 90視点の合成PNG。各raw WebGL PNGも保存する。 |
| [画像閲覧とSHA](gallery/visual-review.json) | 合成90枚の実閲覧、raw画像との区別、最終SHA。 |
| [描画元と各状態](gallery/scenes.json) | ロードしたTS/TSX・素材・脚本のSHA、camera、viewport、fontScale、意味状態、resource内訳。 |
| [WebGL測定](gallery/webgl-results.json) | 1 renderer の実ブラウザーdraw call/triangle/texture数、HUD矩形。 |
| [形状と配置](gallery/layout-and-geometry.json) | 板・引き出しと操作UIの離隔、44論理px以上のhit/button矩形、pause/objectiveの交差検査。 |
| [刺激の不変条件](gallery/perceptual-invariants.json) | 仮面の位置・頂点・法線、hybridのUV・変換・texture bytes、配線のcoverだけを変えた比較。 |
| [展示体の外形](gallery/actor-envelope.json) / [足の接地](gallery/actor-grounding.json) | 実meshの876姿勢と、実移動方向での立脚world点。 |
| [CPU所有資源](gallery/snapshot-ownership.json) / [WebGL再入](gallery/webgl-lifecycle.json) | React unmountでの所有資源の破棄と、hybridを実描画する10回のload/render/dispose。 |
| [原コア再照合](reference-core-audit.json) | 親タスクが実施した原展開先42ファイルと原コア検証。本描画QAから独立。 |
| [開発Three](three-development.json) / [本番Three](three-production.json) / [保護ファイル](protected-files.json) | 親タスクが収集した統合検証証拠。 |

## 再現手順と境界

アプリの作業ルートで `node scripts/generate-perceptual-assets.cjs`、`node scripts/preview-perceptual.cjs --capture` が素材先行QAを再現する。統合描画は `node scripts/preview-perceptual-gallery.cjs --capture`。取得済みSTLと同梱データを使用し、ネットワーク取得や新規依存導入はしない。

Node 24 / インストール済みThree / Linux Chromium headless（ANGLE SwiftShader）を使用した。`GalleryScene` と `GalleryActor` の実React hostをThree Objectへ写し、登録されたframe callbackを実refに対して標本実行してScene JSONに保存する。ブラウザーのThree WebGLで描画した。`FirstPersonScreen` の実host/styleをCSSへ写すが、controller作成とCanvas/native bridgeは隔離している。状態は撮影用に指定したfixtureであり、画像からFSMの遷移やセーブ復元・連続操作の成功を主張しない。

メモは実`DiscoveryNotebook`のボタン・slider callbackを実行し、アプリの`chromaticComparison`/`diagramComparison`が返すRGBAをそのままPNG化した。hybridは同梱PNGを同じまま拡縮する。native Skia自体は実行していない。仮面だけは実`NotebookMaskScene`を同じ1 rendererで描画し、実DOMの透明窓矩形を、アプリと共有する`configureNotebookCamera`へ渡す。副カメラは本編の仮面meshとカメラを変更しない。

ブラウザーのSafeArea余白は0、CSSフォントとスクロールバーはiOS Yogaとは異なる。native Switchの外見、音、GPU実機負荷、タッチの競合、描画準備完了のnative判定はこの脚本の範囲外。raw `-scene.png` は保存・hash照合したが、90枚すべてを別途開いた扱いにはしない。合成PNGは90枚すべてを実際に開いた。

## 視覚確認の内容

- 仮面は[正面](gallery/mask-front.png)、[左](gallery/mask-left.png)、[右](gallery/mask-right.png)、[側面窓閉](gallery/mask-window-closed.png)、[側面窓開](gallery/mask-window-open.png)で目・鼻・口と立体形状を確認した。窓を動かしても仮面のmodel matrix・頂点・法線は同一。凹凸の物理的根拠は素材先行QAの座標と断面にあり、全観察者の知覚を保証しない。
- [配線ずれ/coverあり](gallery/wiring-offset-covered.png)、[ずれ/coverなし](gallery/wiring-offset-open.png)、[正解/coverあり](gallery/wiring-correct-covered.png)、[正解/coverなし](gallery/wiring-correct-open.png)を比較した。coverは線を動かさず、露出した同じ線の位置を比較できる。実線端点とdomainの式をworld座標で照合した。
- hybridの[近](gallery/hybrid-near.png)、[中](gallery/hybrid-middle.png)、[遠](gallery/hybrid-far.png)で、近距離の閉館文字と細線、遠距離の大きい顔の成分を確認した。同じtexture bytes・UV・meshを使用する。
- [新展示体正面](gallery/actor-front.png)、[側面](gallery/actor-side.png)、[背面](gallery/actor-back.png)では顔、胴体、非対称な肩・腕、屈曲した脚と足を確認した。旧モデルは意匠がlocal +Z側、新モデルは移動・視線と同じlocal -Z側なので、before/afterの同cameraで顔が見える側も変わる。before画像を反転・回転してはいない。
- 棚の[西入口](gallery/actor-west-shelf-entry.png)と[東入口](gallery/actor-east-shelf-entry.png)は棚の端と入れる空間を同時に写す。完全遮蔽の2視点は実actor全頂点に対し同じworldのopaque solidで遮蔽を判定する。追跡/探索の画像はそれぞれの意味状態を指定した静止像。
- [外側の開いた扉](gallery/exit-outside-open.png)と[閉じた扉](gallery/exit-outside-closed.png)は同camera。閉じた状態では表示とclear状態を整合させる。実際の押下・presentation・音の一回性はアプリ側テストの検証対象。
- 320×568、390×844、430×932とfontScale 1/2のB/C/配線を確認した。文字が大きい条件では操作欄を縦スクロールし、板の上へUIを重ねずに操作へ届く。メモは一覧・7項目・creditsと比較操作、320/390/430の大きい文字も確認した。仮面メモは透明窓の中へ全形を収める。

## 今回の確認で直した点

仮面の側面窓が筐体底面へ4 cm重なる箇所を画像と座標で見つけ、world側で4 mmの余白を設けた。取手は窓と一緒に上へ動く。展示体の顔と足運びは初期造形の+Z前提を改め、domainの-Z前進と一致させた。仮面メモで鼻下・顎が説明欄に隠れる問題は、透明窓の実測矩形で共通カメラをfitする処理で直した。

QA側でも、凸面対照の裏向きwinding、左右観察用カメラの向き、棚の入口を塞いで見える撮影角を修正した。棚の遮蔽にはlegacyの薄いwall専用証明を誤用せず、実mesh頂点とdevice棚を含む共通worldを照合する。最初の10回再入はtexture未描画の視点だったため、hybridを実際に描く視点へ変更し毎回texture upload>=1を必須にした。検査を省略して成功とする扱いはしていない。最終化中にはruntimeControllerの更新をsource guardが検知し、撮影前に停止した。これは意図した混在防止であり、更新完了後の同一ソースから再生成して確定した。

## 最終測定結果

90視点の描画、配置・形状・刺激不変条件がPASS。描画元77ファイルは読み込み時と最終作業ツリーのSHAが一致し、撮影中の変更は0件。最終画像は既に閲覧した88枚とbyte一致し、棚の完全遮蔽用に変更した2枚を再度開いた。

| 検査 | 結果 |
| --- | --- |
| 実ブラウザーdraw call / triangle最大 | 132 / 9,794（予算150 / 100,000以内） |
| 同時にGPUへuploadされたtexture最大 | 3 |
| CPU所有texture | 最大4枚、base 3,407,872 bytes、mip推計込み 3,757,396 bytes |
| hybrid texture単体 | base 1,048,576 bytes、全mip推計込み1,398,100 bytes |
| 10回WebGL再入 | hybrid-near、毎回loaded geometry=2 / texture=1 → disposed 0 / 0、rendererは1個 |
| 所有資源の破棄 | 90 scene抽出すべてで所有資源を1回ずつdispose |
| 展示体の実mesh stress | 876姿勢、水平半径最大0.4253398641 m < 0.44 m、足底minY=0、常に片足以上が接地 |
| 立脚world点 | -Z前進・yaw 0/±π/2、各69比較、最大誤差1.78e-15 m |
| 320幅の配線handle hit | 最小46.72論理px。44以上 |
| 仮面メモ | 正面/側面/320・390・430 font2の5条件で、全実頂点の投影が実測透明窓内 |
| 棚の完全遮蔽fixture | 西・東とも実actor 2,969頂点の全点が共通worldのopaque solidで遮られる |

texture byte数は同梱pixel bufferとmip列からの算定であり、driver全体のVRAM/heap測定ではない。10回の検査は同じブラウザーrendererへのscene再入であり、nativeアプリを10回入り直した結果ではない。

## 実機に残る確認

iPhoneでの凹面の見え方、hybridの近中遠での読み替わり、怖さ、明暗・色知覚、実聴は未確認。ドラッグ、slider、スクロール、SafeArea、fontScale、バックグラウンド/復帰、音の停止と残留、10回の本編出入り、温度・電力・frame timeは実機で確認する。320/font2の仮面メモではブラウザーの縦スクロールバーが幅を減らし8 pxの横overflowが記録された。button矩形は画面内にあり、nativeの問題とは断定しないが実機で横ずれと比較操作を確認する。
