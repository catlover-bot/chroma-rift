# 展示体の改修前 — 比較用の4視点

baseline `8ca5ba3456c7f54284981e9cae1b0d5a8848b21d` の GalleryActor.tsx を `git show` で一時隔離ファイルへ保存し、現在のGoal008 world/materialsで実GallerySceneに接続して撮影した。旧アプリ全体のスクリーンショットとは扱わない。source hash・一時コピー実パス・カメラ・actor stateは scenes.json にある。改修前画像は以後上書きしない。

[正面](actor-front.png) / [斜め](actor-quarter.png) / [側面](actor-side.png) / [後方](actor-back.png) の4枚を実際に開いた。球状の頭、棒状の四肢、非対称な肩、長い片腕が見える。raw WebGL像は各 `-scene.png`。`visual-review.json` に閲覧4枚とraw4枚のSHAを分けた。

ブラウザーThree WebGLのmeshから描いた画像と、実FirstPersonScreenのhost/styleをCSSへ写した合成であり、native R3F/Yoga、実指、iPhone、怖さの証拠ではない。4視点の最大110 calls / 5,952 triangles、1renderer、10回のbrowser scene生成・破棄でresource counter復帰。actor envelopeは各撮影姿勢を検査したのみで、Goal008改修後の回転/歩行stress検査ではない。

本比較画像を作った時点の一時scene JSONは `.expo/goal008/actor-before/` に保持した。`node scripts/preview-perceptual-gallery.cjs --actor-before --capture` はbaseline actorを使うが、周囲のworld/resourcesは実行時の作業ツリーになる。将来の再実行をこの初回beforeの同一成果物と見なさない。

ファイル名の front/back は保存したカメラ位置の識別子であり、旧モデルの顔の方向を保証する名前ではない。旧モデルの頭部意匠は local +Z 側だった。Goal008 は actor の移動・視線と同じ local -Z 側を正面へ統一したため、同 camera 比較では顔が見える側も変わる。before の画像や向きは改変していない。
