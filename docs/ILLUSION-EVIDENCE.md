# 知覚現象と検証 — Goal 006

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
