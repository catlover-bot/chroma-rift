# ADR 003 — Skiaを維持して一人称3Dを追加する

通常本編はThreeと `@react-three/fiber/native`。Skiaは3問／12問調整、刺激ラボ、旧2.5D迷宮を担当する。

## 理由と代替案

連続した一人称の移動・見回しには透視投影、深度テスト、遮蔽が必要。固定視点用Skia投影を汎用3Dエンジンへ広げず、既存レンダラーを使う。旧カメラの高さだけを下げる案、静止パノラマ、WebViewは採用しない。Unity/Godotや物理エンジンもこの平坦な小章には不要。

費用はネイティブ再ビルド、GL互換性の実機確認、GPU資源の所有・破棄。既存の調整UIまで3Dへ移さない。

## 依存の確認

| パッケージ | 解決版 |
| --- | --- |
| three | 0.185.1 |
| @react-three/fiber | 9.7.0 |
| @types/three（開発依存） | 0.185.4 |
| expo-gl | 57.0.2 |
| expo-asset | 57.0.16 |
| expo-file-system | 57.0.6 |

npm公開情報と使用版package.jsonを導入前に確認。R3F 9.7のpeerはReact `>=19 <19.3`、Three `>=0.156`、RN `>=0.78`。既存React 19.2.3/RN 0.86.3と合う。Expo 57.0.20（既存lock解決版）など基盤を変更していない。React 19とR3F 9の組合せに沿う。[使用版の公式installation](https://raw.githubusercontent.com/pmndrs/react-three-fiber/v9.7.0/docs/getting-started/installation.mdx)

Expoパッケージはexpo installで合わせた。asset/file-systemは既存間接依存を直接宣言。自動追加された未使用expo-asset config pluginは、引数なしで設定を変えない実装を確認し、追加分だけ戻した。app.jsonは開始時のバイト列と一致。iosディレクトリや新しいpluginは追加していない。自動リンクされるExpoGLの追加により再ビルドは必要。[Expo Development Build](https://docs.expo.dev/develop/development-builds/use-development-builds/)

lock差分に既存パッケージの版変更はなく、Expoの一部間接依存は同じ版で上位へ配置された。R3Fの間接依存zustandはアプリ全体へ導入していない。@types/threeの宣言ファイル用の間接開発依存として@dimforge/rapier3d-compat 0.12.0などもlockに入るが、本編からはimportせず、物理エンジンとして使用していない。

## GL境界

使用版GLView.tsxとExpoGLModule.swiftの実名ExpoGLを確認。Expo公開API `requireOptionalNativeModule('ExpoGL')` をlazy callback内のnative依存評価より前に呼ぶ。旧ビルドでは案内とホーム操作。読込／描画エラーと初期化待ちにも復帰UIを設ける。

Expo GLは完全なWebGL2ではない。公式の未実装一覧にはgetInternalformatParameter、renderbufferStorageMultisample、compressed texture、sync系が含まれる。使用版ソースも点検。検証室と本章は不透明mesh、標準material、基本照明、DataTextureを使い、antialias・影map・postprocess・render target・圧縮texture・GPU syncを使わない。peer解決／JS exportの成功はiPhoneのGL互換性の証明ではない。[GLView](https://docs.expo.dev/versions/latest/sdk/gl-view/)

## 世界・入力・色

getWorldのfloor/solid/doorを描画と衝突の両方に使う。R3Fがカメラとフレームを所有する。毎フレームの姿勢・入力はruntime ref、React更新は対象・目的・封印・pause等の変化時だけ。ThreeオブジェクトをReanimated workletへ渡さない。

左右の独立ポインター、照準ray＋距離＋遮蔽による対象ID判定を使う。簡単操作も同じ幾何。vertical FOV 65°、near 0.08、眼高1.6、水平半径0.24。pitch制限・dead zone・dt制限と分割移動。揺れ、head bob、roll、強制ズームは使わず、感度・短い歩行・角度旋回・中断を提供する。[XAG 117](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117)

刺激は同じ床面の単一DataTexture、opaque/unlit MeshBasicMaterial、fog:false、toneMapped:false。sRGB byte textureにSRGBColorSpaceを付ける。hexはThree.Colorの自動変換を使い、手動で二重linear化しない。出力はsRGB。[Three色管理](https://threejs.org/manual/en/color-management.html)、[Material](https://threejs.org/docs/pages/Material.html)

無彩色化はsRGB→linear→Rec.709係数0.2126/0.7152/0.0722でグレー値→sRGB。素材だけを変え、照明・形・進行は同じ。等輝度やSkiaとの知覚的一致は保証しない。Skiaラボに共有パレットの色／グレー表示がある。

## 資源と制限

mountが共有geometry/material/textureを所有し終了時dispose。低品質では円の分割数・模様textureを減らす。R3F 9.7 nativeはPixelRatioからDPRを設定するため、低品質が画面解像度を下げるとは扱わない。pause／背景ではループ・入力を止め、復帰は再開操作を待つ。

平坦室と矩形壁に限定。落下・ジャンプ・ポータル・動的影はない。100 draw calls程度、60fpsは目安でiPhone性能は未計測。GL初回描画、10回リプレイ後のGPU資源、発熱・電池は実機で確認する。
