# 紋章で何を確かめたか — Goal 005

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
