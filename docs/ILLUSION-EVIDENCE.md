# 知覚現象と検証 — Goal 008

現在の章は、任意の展示を観察し、既存B/Cの二電源と新しい配線1個を解き、一体の展示体を避けて最後の扉を明示的に閉める構成である。以下は実装と検査の記録で、人の錯視・恐怖・音の実聴を測った結果ではない。過去版の記録は末尾に保持する。

| 現象 | 変えない物理量 | 明示操作で変えるもの | 実際の確認 |
| --- | --- | --- | --- |
| 色の奥行き・番号13 | 平面の輪郭、色coreのcoverage、カメラ、地形、判定、敵 | カラー/無彩色とpalette | 既存原本900条件照合、同じ色生成処理、native資源回帰。灰色は相対輝度の近似で、実端末輝度の一致保証ではない |
| Bの明暗 | 見本内のsRGB値と同一性 | 配置と背景比較。確定は明示操作 | 元Bのドラッグ/比較/保存を維持し両順経路を検査 |
| Cの輪郭 | 正解角、同じ円盤と補助groupの区別 | 実円盤の角度、明示した輪郭補助 | 角度と表示/保存一致、補助だけで解放しない |
| 静止凹面仮面 | world matrix、頂点/法線、材質。追従・billboard・凸凹切替なし | 通常のプレイヤー横移動と側面窓の開閉。メモでは別の比較用カメラ | 実STL軸/鼻深度、正面/左右/側面/凸面対照の実WebGL。メモは全頂点を21角度×2窓×3画面で投影し窓内確認 |
| Poggendorff型配線 | カバーだけを動かす時のm/b/offset/許容値/線の端点 | 線を上下ドラッグするとoffsetも描画も同時に変化。カバーは横だけ | 同一plate座標、実ray-plane drag/44pt以上の取得領域、外drop取消/旧session拒否/明示exact-once接続 |
| 静的ハイブリッド | 一枚のtexture ID・RGBA・UV、同じ材質 | 通常歩行による投影倍率。メモの連続倍率。LP/HPだけは明示した補助 | 独自LP/HP生成の全hash再現、clipping0、近中遠の実WebGL。同じ物理iPhone距離を変えた試験ではない |
| Shepard風音 | 生成済み12秒WAV、固定の周波数包絡とRMS/peak上限 | 任意再生/停止/効果音量。mute・控えめ・演出音offでは鳴らない | 8octave合成、RMS0.064998、peak0.113647、DC約−3.4e−9、clipping0。非同期seekの拒否/遅延/停止/破棄と再生要求の成功を検査。実聴なし |

仮面の通常shadingと実視点変化、ハイブリッドの投影倍率は通常の3D/画像表示であり、色彩立体視の効果と呼ばない。Poggendorffの40°と許容値.028m、仮面の照明、周波数σは本作の設定値で、知覚的最適値や安全性を実証していない。錯覚を感じた回答を出口条件・得点・診断にしない。

展示体は独立ID/transformの実メッシュとして移動する。静止仮面や掲示を消して展示体に置き換えない。画面内の提示bitはfrustumと遮蔽から求める「提示された可能性」で、実際の注意や恐怖ではない。音の発見bitは、提示済みの予告に対応する現在sessionでnative play要求が正常に戻った時だけ立てる。音が耳に届いた/上昇を感じたという記録にはしない。旧版の互換配線開通、クリア後の自由比較は本編の発見を捏造しない。

本編のpause/background/未ready/GL失敗ではAIと音を止める。自動移動・crossing story・安全地点・字幕はnative presentation失敗で巻き戻す。最後の閉扉はユーザーの明示操作で進行/衝突/AI停止を確定し、短い反応時間だけを表示する。明示閉扉で既存音を止め、失敗したframeで衝突音を再生せず、背景復帰でも古い音を再生しない。成功後の遅延中に捕まらない。既に受理した明示操作そのものを取り消した検査とは区別する。

証拠の種類は [素材の先行QA](qa-goal008/materials/README.md)、[統合QA](qa-goal008/README.md)、[進行と全検証](GOAL-008.md)、[出典と権利](ILLUSION-SOURCES.md) に分けた。ブラウザーは本物のThree WebGLを使うがSoftware WebGLであり、iPhone GPUではない。native Canvas/reconciler検査はGL境界をmockする。メモの表示窓はSafeArea内のonLayoutを利用し、実Yoga/VoiceOverの最終表示は実機で別途確認する。

iPhone表示、実指の両手操作、VoiceOver読み上げ、錯視の成立と強さ、快適さ、怖さ、音の実聴、実機FPS/熱/GPU残存は未実施。[最初の5分の実機手順](IPHONE_VALIDATION.md)で記録する。単に静止した模様であることやdraw call予算内であることから、安全性/快適さ/性能を断定しない。

---

# Goal 007の過去記録

新版「閉館後の展示室」は旧A/Dの再出題を外した。以下はコードと描画の事実であり、人が錯視や恐怖を感じた測定ではない。

| 対象 | 実装・描画で確認すること | 区別する未確認事項 |
| --- | --- | --- |
| 任意の平面展示番号13 | 赤/青が一つの同一平面・opaque sRGB texture。既存色coreでcolor/neutralの輪郭mask一致。比較でcamera/地形/actor/判定不変。解答を持たない。 | iPhoneで浮いて見えるか、前後方向、個人差。neutralでも見かけの奥行きが消えるとは保証しない。 |
| B 同時対比 | 6配置のうち2枚が同じ#808080。source/drag/socket/背景比較で内部RGB不変。枠とつまみは内部を覆わず、選択で変えるのは外だけ。 | 灰色が違って見えるか。Checker Shadowの完全再現ではない。 |
| C 主観的輪郭 | 通常の中央に線/面なし。表示角と保存角で8°以内の整列数を計算し、明示操作を要求。ガイドは別group。 | 描かれていない三角形を感じるか。0/3〜3/3は角度であり知覚測定ではない。 |
| 本物の3D展示体 | 自作の複数mesh、実position/pose、同じworld床/壁/扉/棚で移動とLOSを判定。 | 色彩立体視とは別。人が怖いと感じるかは実機プレイで確認する。 |
| 台からの不在 | 身体全体の遮蔽を確認後、同じactorが実dtで通路へ歩く。物語イベントは一回。 | 注意やchange blindnessの医学的測定ではない。 |
| 板の干渉修正 | 裏板20mm離隔、中央が空いた4枠。刺激面と非交差。depthTest維持、壁越し表示なし。 | iPhone録画の全現象の唯一原因や、実GPUでの解消は未確認。 |

[新版の実WebGL/HUD画像](qa-goal007/README.md)と[P0 before/after](qa-goal007/p0/README.md)に実行環境と検査方法を記録する。browser compositeのテキストは実FirstPersonScreenのcomponent/style由来だが、native Yogaや実iPhoneの字体測定ではない。人の理解、実指、錯視、恐怖、音は[実機手順](IPHONE_VALIDATION.md)で別に記録する。

以下は旧仕様・旧時点の証拠。A/D/入口変更が新版にも残るという意味ではない。

---

## Goal 006の過去記録

## 新章で確認できること

| 対象 | コード・描画で検証した事実 | 知覚の未確認事項 |
| --- | --- | --- |
| A 色彩立体視を意図した刺激 | 既存coreのshape mask、切れ目、正解を保持。実WebGLでcolor/neutralの板外画素差分0。色比較でcamera/terrain不変。 | iPhoneで奥行きを感じるか、方向や個人差。 |
| B 明暗の同時対比 | 三枚のうち二枚だけ同じopaque sRGB #808080、第三は#B0B0B0/#505050。source/socket/neutralで中心RGBA不変。unlit、toneMapped=false、fog=false。 | 同じ二枚が違う明るさに見えるか。Checker Shadowの完全再現とは呼ばない。 |
| C Kanizsa型の主観的輪郭 | 各頂点から重心への方向に60°切欠き。通常の中央に追加線/fillなし。実mesh raycastと実WebGLの中央背景画素を検査。 | 描かれていない三角形を感じるか。その強さ。 |
| D 幾何学的投影 | 実Threecameraの行列、frustum、遮蔽、位置とshape誤差を使用。明示操作で解放。 | 色彩立体視の発生を証明しない。 |
| 帰路の空間変更 | 同じworld variantのgeometry/collision/floor/interactables。変更領域全体の遮蔽と安全位置を満たしてから切替。同じランドマークを保持。 | 医学的change blindness測定ではない。 |

Bの描かれた明暗文脈は平面のgraphic cueで、物理照明によって暗くなった別物体を同一輝度の錯覚と呼んでいない。sRGB DataTextureまたはsRGB値から作るopaque MeshBasicMaterialを用い、出力変換は既存rendererに一度だけ任せる。選択表示は見本の外に置く。

Cの外側ノッチは各円盤の重心と逆方向に置き、中央の三角形領域へ入れない。輪郭ガイドの破線は別groupで、通常は非表示。8°許容、円盤半径/辺長比、比較1000msは製品上の選択で、科学的最適値や安全保証ではない。正しく回した表示角と保存角を共有して明示commitを要求する。

## 今回の表示証拠

[35画像と検査詳細](qa-goal006/README.md)。本編のmesh/materialを抽出してLinux ChromiumのThree WebGLで19視点、共通domainからソフトウェアラスタ16枚を生成し、すべて開いた。Bの5場面×3見本の中心RGBA一致、A板外差分0、C中央の通常背景一致を確認した。native R3F境界は別の自動検査で、GL/端末境界だけ代替している。

画像やpixel一致は知覚の証明ではない。iPhone実表示、Expo GLの実フレーム、実multi-touch、VoiceOver読み上げ、音の実聴、触覚、快適性、FPSは未実施。[実機手順](IPHONE_VALIDATION.md)で別に記録する。提供録画は未取得であり、依頼文の観察記述と区別する。

Cの根拠として[Banica & Schwarzkopf (2016)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4982671/)の誘導文脈と輪郭に関する研究を参照した。その実験や眼別mask/点滅をアプリへ移していない。Aの過去コア検証と科学的資料は以下に保持する。

---

## Goal 005の過去記録

以下はGoal005当時の実施範囲。browser未実施等の記述を、上記Goal006の新しいQA結果へ適用しない。

### 紋章で何を確かめたか — Goal 005

## 仕組みと証拠の区別

| 対象 | 実装・検査 | これだけでは分からないこと |
| --- | --- | --- |
| 色刺激 | 同一平面の二輪郭、不透明sRGB画素、無彩色とのmask一致 | iPhoneで色彩立体視が起こるか、前後の方向 |
| 通常の3D | 壁・枠・印の厚み、視点移動、扉の昇降 | 色だけが見かけの奥行きを作ったか |
| 鍵 | 異なる距離の片の実camera投影一致 | 色刺激の効果 |
| 解錠 | 観察後に連続する形の物理的な印を押す | 正解者に特定の色知覚があるか |
| 人の観察 | 実機記録を今後実施 | 自動テストで代用できない |

色の感じ方・比較・補助・観察時間に正誤や得点を付けない。輪郭の形と大きさは手掛かりなので、画像全体を「色以外の奥行き手掛かりが完全にない刺激」とは呼ばない。

## 刺激と色処理

提供HTMLの初期seed21を採用。内側の丸が連続し、外側のひし形の左下に切れ目がある。輪郭は96区間、正規化線幅0.017、外半径0.375／内半径0.175。形と内外の6組合せを検査し、本編はseed21からランダム化しない。

[アプリの生成器から出力したPNG](evidence/goal005-stimulus.png)を開き、丸の連続・ひし形の切れ目・欠けの向き・非交差を目視確認した。左はcolor、右はneutral、両方seed21／表示A／unknown／512²。これは刺激のPNGで、ゲーム画面／Expo GL／iPhone screenshotではない。

色のcoverage混合をlinear-sRGBで行い、8bit sRGBへ量子化した画素から相対輝度Yを求め、同じYの灰色へ再符号化する。係数0.2126／0.7152／0.0722とtransfer関数は[W3Cの定義](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance)に一致する。同じ灰色で全線を塗りつぶしていない。

灰色の8bit丸めによる相対輝度誤差の上限は (2.4/1.055) × (0.5/255) < 0.004461。全3palette×全3preferenceの各画素で上限を検査する。端末の発光輝度を測った値ではなく、残る見かけの奥行きがゼロという意味でもない。

ThreeのDataTextureはbottomUpRGBAで行を明示反転し、flipY=false、SRGBColorSpace。不透明・白いMeshBasicMaterial、toneMapped=false、fog=false、depthTest/depthWrite=trueを実クラスで検査する。既存rendererのSRGBColorSpace／NoToneMappingを保ち、global color managementを無効化しない。色textureの注釈と出力変換の役割は[ThreeのColor Management](https://threejs.org/manual/en/color-management.html)を確認した。

輪郭ガイドは同じ連続maskだけを中立色にする静的表示。geometry、z、alpha、cameraは変えない。答えの補助なので「使用中」と表示し、補助なしの知覚結果とは分ける。色／無彩色／ガイドへの切替で別Canvas／rendererを作らない。

## 知覚に関する資料の限界

[Simonet & Campbell (1990) の抄録](https://pubmed.ncbi.nlm.nih.gov/2216476/)は、自然瞳孔の実験で照明条件と観察者によって色の前後方向が異なる結果を報告している。[Ye et al. (1991) の抄録](https://pubmed.ncbi.nlm.nih.gov/1767497/)は、小さい人工瞳孔での色彩立体視と両眼の横色収差の差の関係を扱う。抄録を確認した。これらの実験条件や効果量を今回のiPhone画面へ移して保証しない。

表示A／控えめ／表示Bはpalette名で、感じる強さの序列ではない。クイック設定は3回答からの暫定希望で、科学的信頼度や診断ではない。1秒の比較間隔も操作上の制限で、医学的な安全保証ではない。

## 今回の実施範囲

- Node／Jest：画素、mask、量子化、元previewとの15条件のhash一致、reducer、章通過、保存、入力停止。
- 実R3F native Canvas／reconciler／Threeクラス：mesh、material、行列、frame callback、所有とpresentation gate。GPU／端末境界はmock。
- PNG：刺激だけを開いて確認。
- 本編のbrowserプレイ、Expo GLの実フレーム、iPhoneの同時タッチ、VoiceOver音声、触覚、色奥行き、快適性、FPS：未実施。操作可能なbrowser/device toolはない。
- 旧録画を新しい紋章の表示証拠に流用していない。HTMLをnativeゲーム、JS exportをIPAとして扱わない。

[実機手順](IPHONE_VALIDATION.md)と[記録用紙](EMBLEM_TEST_LOG.md)で、通常表示・camera静止・非誘導の報告を残す。長い凝視や急速な切替を求めず、不快感があれば中止する。
