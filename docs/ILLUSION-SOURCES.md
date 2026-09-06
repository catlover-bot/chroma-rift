# 知覚表現の出典・素材台帳（Goal 008）

確認日: 2026-09-07。公開サイトは資料として読み、アプリはネットワークから素材を取得しない。「原理の参考」「コードの利用」「実素材」を区別する。錯視を感じることは攻略条件ではなく、この台帳や幾何検査は iPhone の知覚・怖さ・実聴の証明ではない。

## 実際に同梱する外部素材

| 項目 | 記録 |
| --- | --- |
| 名称 / 作者 | Hollow face illusion.stl / Wael Tsar |
| 原公開ページ | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Hollow_face_illusion.stl)、確認時 revision 881101748 |
| 原ファイル URL | [STL 原本](https://upload.wikimedia.org/wikipedia/commons/d/db/Hollow_face_illusion.stl) |
| ライセンス | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| 既存の改変 | cmglee: 中心調整、対称化、STL 変換。2022-03-15 に凹面側の thumbnail のため 135° 回転 |
| 今回の改変 | proper-axis rotation（行列式 +1）、正の等方拡大で高さ 1m、平行移動、頂点統合 / index 化、面積加重頂点法線の再計算 |
| 本編の用途 | 静止した凹面仮面。別 ID / transform の移動展示体の頭部では、別の凸面 geometry へ改変し縮小する |
| 重要な区別 | 原本は既に凹面。静止仮面は深度反転・負 scale・BackSide で作らない。展示体の凸面は静止仮面の差替えではない |
| 帰属表示 | アプリ「設定」→「出典と素材クレジット」、発見メモの仮面、[THIRD_PARTY_NOTICES](../THIRD_PARTY_NOTICES) |
| 再利用 | 原 STL、改変 JSON および同素材を単独で配布する場合も CC BY 4.0 の許諾を妨げる追加制限を設けない。作者・改変者による推薦は示さない |

原本を 1 回取得し HTTP 200 / application/sla / 125,984 bytes を確認。原本は [source/hollow-face-original.stl](../assets/perceptual/source/hollow-face-original.stl)、加工物は [hollow-mask.json](../assets/perceptual/hollow-mask.json)。fallback の別素材は使用していない。詳しい軸、bounds、鼻の頂点と法線、生成パラメーターは [manifest.json](../assets/perceptual/manifest.json)。[素材の描画 QA](qa-goal008/materials/README.md) はブラウザー WebGL と offline 画像の検査範囲を記録する。

## 本作で制作した素材

- **ハイブリッド掲示**: CHROMA RIFT project による手続き生成の線画。外部写真・フォント・既存の有名作例は使わない。512×512、seed 80873。linear-light grayscale 上で Gaussian LP σ=12 と HP σ=2.25 を作り、各々 mean を引き max absolute deviation で正規化。`H = .46 + .20 LP + .28 HP`、sRGB 8 bit へ出力。clipping 0 pixels。合成画像は一枚で、ゲーム中の距離による差替えはない。LP / HP 単体はメモの明示した「補助」専用。
- **配線**: 独自の線図形。`y = tan(40°) x − .1` と可動側 `+ offset`。cover は遮蔽領域だけを平行移動し、線の傾き・位置・許容値 .028m を変更しない。
- **B / C / 展示番号**: 本作の図形。既存の刺激生成処理と幾何から描き、論文・サイトの画像を転載しない。
- **展示体**: 胴体・布・四肢は本作の geometry。顔だけは上記 CC BY 素材を改変して使用する。
- **音**: cloth .42 秒、door-impact .5 秒、Shepard 12 秒を [generate-perceptual-audio.cjs](../scripts/generate-perceptual-audio.cjs) で自作合成。mono PCM16 / 24kHz、外部録音なし。Shepard は 8 octaves、base 27.5Hz / center 440Hz / Gaussian σ1.05 octaves / 両端 .08 秒 fade。実行時は有限の一回再生で、連続音量増加や強制 loop を行わない。[音の計測](../assets/audio/perceptual-analysis.json) に RMS・peak・DC・clipping・境界差を記録。実聴は未確認。

## 参照したコードと原理

| 資料 | 確認内容 / 本作への取り込み |
| --- | --- |
| [Pyllusion GitHub](https://github.com/RealityBending/Pyllusion) / [documentation](https://realitybendinglab.com/Pyllusion/) | MIT。README、LICENSE、Poggendorff の parameters / image の Python 本文を確認。角度・ずれ・遮蔽の条件分離を参考にした。Python の翻訳移植やサンプル画像の同梱はない。README の Kanizsa は TODO なので実装済み根拠にしない |
| [Makowski et al. (2021)](https://doi.org/10.1177/03010066211057347) | Pyllusion の書誌情報。DOI の本文取得は今回失敗し、論文全文を確認したとは扱わない |
| [Bach: Hollow face](https://michaelbach.de/ot/fcs-hollowFace/) | 凹面を凸面と解釈する現象の説明を確認。ページの動画・画像・コードは使用しない |
| [Bach: Hybrid image](https://michaelbach.de/ot/fcs-spatFreqComposites/index.html) / [Oliva, Torralba & Schyns (2006)](https://doi.org/10.1145/1141911.1141919) | 低 / 高空間周波数を重ねる原理を参照。Bach は確認。指定された [Oliva abstract URL](https://olivalab.mit.edu/abstracts/acm_transactions_graphics.html) は取得失敗、DOI は HTTP 403 で本文未確認。人物写真・作例画像を使用しない |
| [Bach: Shepard tone](https://michaelbach.de/ot/aud-ShepardTone/index.html) / [Shepard (1964)](https://doi.org/10.1121/1.1919362) | オクターブ成分の重ね合わせの説明を参照。Bach は確認。DOI 本文取得は失敗。サイトの録音・生成コードは使用しない |
| [Bach FAQ](https://michaelbach.de/ot/-misc/faq.html) | 帰属の案内を確認。ただし第三者の作品に別の許諾が必要なことから、当サイトを一括の素材許諾元にしない |
| [北岡明佳](https://www.psy.ritsumei.ac.jp/akitaoka/) / [色立体視3](https://www.psy.ritsumei.ac.jp/akitaoka/scolor3.html) | 著作権表記と個人差を含む例を確認。原理・分類の参照のみ。画像、輪郭の写し取り、回転する蛇、データセットは使用しない |
| [IllusionVQA](https://github.com/csebuetnlp/IllusionVQA) | README の non-commercial research / CC BY-NC-SA 4.0 / training 制限を確認。許諾未取得画像を含む旨もある。分類参考のみでデータセットを取得・同梱・学習利用しない |

Pyllusion 確認 revision: `3aaacb455af7750abff6491371e7a5c9c084a09c`。MIT の著作権表記は `Copyright (c) 2018 Dominique Makowski`。比較した公開ソース SHA-256:

| 公開ファイル | SHA-256 |
| --- | --- |
| pyllusion/Poggendorff/poggendorff_parameters.py | d46cb3d8db8952d8449bbc05f34f0178da0908d00a9bef5735a49f9c6da65ac0 |
| pyllusion/Poggendorff/poggendorff_image.py | d75424fe54a7854b388f44e5ed585b261cf20505e62ab9f61838a794e03e3986 |
| LICENSE | df6ff3a16279a99286277d76451e10f2f2daeee436727ec69ce57fba7f7e9bf6 |

「MIT のコードを参考にした」と「コードを実際に移植した」を区別する。後に翻訳・移植する場合は対象と改変を台帳へ追記し、必要な MIT notice を残す。現状のゲーム内直線計算は独自実装である。

## 設計の参考

[Frictional: 9 lessons](https://frictionalgames.com/2019-10-9-years-9-lessons-on-horror/) と [horror simulation](https://frictionalgames.com/2014-10-thoughts-on-alien-isolation-and-horror-simulation/) を読み、見えない時間と予兆・世界内の説明・公平な回避の参考にした。文章・画像・ゲーム素材は同梱しない。[Xbox guideline 117](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/117) / [118](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/118) を読んだが、対応を医学的安全性や認証として表示しない。既存 Build の扱いは [Expo の公式説明](https://docs.expo.dev/develop/development-builds/use-development-builds/) を参照した。

## 同梱ファイルの SHA-256

全数と生成条件は上記 machine-readable manifest を正とする。以下は固定した素材の一覧。

| ファイル | SHA-256 |
| --- | --- |
| assets/perceptual/source/hollow-face-original.stl | 3ab98617f246ff0b3616cec9656aecdcd670ce43e8c96d66a7e1acaa8a8a5a75 |
| assets/perceptual/hollow-mask.json | 8669760878aed7164dc4c79f15d795a9d117875d77d4e884e1d0835a01fc1453 |
| assets/perceptual/hybrid-source-low.png | e14d41a15a79dde142e73bfd4e6c773c42f6e3740e4141e87d5e5c036e7bbd1b |
| assets/perceptual/hybrid-source-high.png | c6e309d19ec06d58c69ff0c3e069f1dba786038a88c6ce378fe592fde43b5e7b |
| assets/perceptual/hybrid-low-pass.png | 80ad4bc90e4fd61caac8ea584c71444766bf5f7288f4ccfc6df6e115e482d2ca |
| assets/perceptual/hybrid-high-pass.png | 0e248f74cd51f8b48e2a607bc4bbbc15d7890706f55a8a6dc2b7033223eb1df1 |
| assets/perceptual/hybrid-composite.png | 22ba6c8b7eb68c52843fa6f07c26d4063f758c390c563ebf4f85498cf9082ffa |
| assets/perceptual/hybrid-texture.json | 685b0dbf28658c2b1989a1127468dcc6c1b781da7b24c850b550332ebdd33207 |
| assets/audio/cloth.wav | 9ca8d101577af92b6fa2be1dea6b989a475a0a1a3e911f1607454e49df71b0cb |
| assets/audio/door-impact.wav | ad517be84d5b421691f9b41fb0eb43e4efe82fc3b3eff3315a35371236a06c77 |
| assets/audio/shepard.wav | bfc15c3aaaafc00a9b9856cbc79ed75d4c94ca1d409ba55ee5aaf5fc391281b2 |

アプリのクレジットはネットワーク接続や外部リンクの訪問を必要としない。source URL は選択・コピーできる文字列で表示し、未発見のメモの一覧・説明をクレジットから開く導線は置かない。公開・アップロード・権利者への連絡は今回行っていない。
