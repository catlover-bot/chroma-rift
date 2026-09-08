# Goal 009 視覚検証

## Phase A: 連続モーション

実際の `GalleryActor` と共有 `actorMotion` を使い、30 秒・30 fps・900 フレームの動画を 2 視点で生成した。

- [全身と足元の動画](motion/full-feet.mp4) / [プレイヤーの目の高さの動画](motion/player-height.mp4)
- [全身・30 秒の順序画像](motion/full-feet-overview.png) / [目の高さ・30 秒の順序画像](motion/player-height-overview.png)
- [右向き](motion/full-feet-right-turn.png) / [180 度旋回](motion/full-feet-half-turn.png) / [移動途中の停止](motion/full-feet-stop.png)
- [時刻・意図・角度・実位置・接地 sequence・実メッシュ検査](motion/timeline.json)
- [WebGL と解放結果](motion/webgl.json)、[実際に開いた画像と観察の限界](motion/visual-review.json)、[ソース SHA-256](motion/source-hashes.json)、[成果物 SHA-256](motion/manifest.json)

動画の左は `d1f7b55` からそのまま取得した旧 `GalleryActor`、右は現在の共有モーションである。旧モデルにも同じ root 移動距離を渡し、旧来の即時目標向きと旧レンダラーの足の描画を比較した。**旧章の AI 全体を再生した比較ではない。** 新旧とも同じ描画資源と固定カメラを使う。足を隠さず調べるため床だけの検査空間を使用し、本編の遮蔽・経路・明暗の見え方とは分けた。

React の実コンポーネントを新旧それぞれ 1 回だけ mount し、実 Three の参照へ登録された `useFrame` を各フレームで呼ぶ。共有シミュレーションを 60 Hz（内部 120 Hz）で連続更新し、実オブジェクトの変換だけをブラウザーに渡した。モデルをフレームごとに生成し直したり、見栄えのための別アニメーションを追加したりしていない。ブラウザーでは 1 個の Three WebGL renderer を使う。native R3F のスケジューリング、EXGL の presentation、Metal、実機の FPS を検査したものではない。

| 検査 | 結果 |
| --- | --- |
| 動作順 | 0–4 秒静止、4–8 秒右へ向く、8–14 秒半回転、14–21 秒歩行、21 秒に移動途中で停止 |
| 実メッシュ全 900 フレームの最小 y / 最大水平半径 | 0 m / 0.391323 m（許容半径 0.44 m 内） |
| 接地中の実足底四隅の最大 world 移動 | 約 1.41 × 10⁻¹⁶ m（2 cm 未満） |
| 実足中心と共有足位置の誤差 | 約 7.08 × 10⁻¹⁷ m |
| 実頭部方向と LOS の目の方向の誤差 | 約 7.21 × 10⁻¹⁶ |
| 最大 root 角速度 / 角加速度 | 120°/s / 480°/s² |
| 右向き入力からの先行順（30 fps 抽出、0.001 rad 閾値） | 頭 0.033 秒 → 胸 0.200 秒 → 骨盤 0.333 秒 |
| 停止指示 | 0.42 m/s から 0.1 秒で 0、root 移動 0.01925 m、最後の遊脚も接地 |
| 足音へ渡す接地イベント | 26 件の一意な sequence を記録。音の実聴はしていない |
| 固定カメラ内の全身保持 | 新旧両モデル・全 900 フレーム・両視点の投影 AABB が画面内 |
| 描画量 | 比較の 2 描画合計で最大 50 calls / 6,572 triangles |
| 資源 | 同時 geometry 数一定、終了時 geometry / texture とも 0、ブラウザー例外 0 |

最終動画をデコードした順序画像 8 枚を実際に開いた。各 overview は 30 秒から 1 秒間隔の 30 コマ、右向き・半回転・停止は各 12 コマで、画像内に動画の時刻がある。頭が先に動き、胴体と足が後から追う過程、半回転の途中の背面・側面、足の植え替え、歩行から停止までを確認した。これは **動画からの時間順フレーム観察** であり、30 秒を実時間速度で通して再生視聴した扱いにはしていない。人間の怖さ、自然さ、知覚の評価や実機操作も未実施である。

初回の撮影には「停止指示前に目的地へ到着する」「終盤で全身用カメラの右端にモデルが切れる」という不足があった。前者は遠い目的地へ歩行中に停止する条件へ変更し、実装の即停止も発見して共有減速処理の修正へつなげた。後者は固定カメラの位置だけを修正し、新旧両方へ同じ条件を適用して全フレーム投影検査を追加した。また、撮影途中の `locomotion.ts` 更新を SHA guard が検知した実行は不成立とし、freeze 後に再生成した。

再現は WSL のアプリルートで `node scripts/preview-actor-motion.cjs`。既存 Chromium、Node、ffmpeg/libx264 を使用し、依存は追加しない。`--extract-only` は数値抽出のみ、`--quick` は間引いた WebGL 撮影のみで、完成した動画検証とは扱わない。ローカルの `.expo/goal009/actor-motion/` に連続変換データ、全 PNG、実時間再生ボタン付きの HTML を生成する。HTML を再生できる状態は用意したが、この環境での実時間視聴を行った記録ではない。

## 提供された録画

[元動画の hash・解析結果・実際に開いた 40 フレームの記録](source-video-review.json)。元動画と抽出した録画画像は Git に入れていない。連続するデコード画像の 247.825 秒と 247.841667 秒で、役者の後ろ姿から顔・胸の向きへの変化を確認した。これは録画上の時刻でありゲーム FPS やシミュレーションの旋回速度には換算していない。254 秒付近には扉の面・取っ手が画面に見えない状態で閉扉ボタンが有効な画像があった。結果画面から戻る速さが自動遷移か利用者のタップかは画像だけでは確定していない。音の実聴、全編の実時間再生、難易度設定の特定はしていない。

## Phase B: 個別装置

実 `VaultLengthDevice` / `VaultRodDevice` / `VaultCafeWall` をそれぞれ 1 回 mount し、同じ実 `SceneResources` と実ドメインの状態更新から **66 枚**を描画した。320×568、390×844、430×932、固定 FOV 65°。操作に入るときのカメラの移動・拡縮は追加していない。

- 長さの全状態: [320](devices/length-320-overview.png) / [390](devices/length-390-overview.png) / [430](devices/length-430-overview.png)
- 針の全状態: [320](devices/rod-320-overview.png) / [390](devices/rod-390-overview.png) / [430](devices/rod-430-overview.png)
- 元サイズ例: [長さ baseline](devices/length-baseline-390.png)、[針 baseline](devices/rod-baseline-390.png)、[目地](devices/cafe-context-on-390.png)、[目地の中立表示](devices/cafe-neutral-390.png)
- [操作・形状・投影・72 条件の操作範囲](devices/domain-and-projection.json)、[WebGL](devices/webgl.json)、[ソース hash](devices/source-hashes.json)、[閲覧記録](devices/visual-review.json)、[成果物 hash](devices/manifest.json)

一覧画像は左から右、次の行へ、baseline → 文脈非表示 → 補助表示 → 誤答位置へドラッグ中 → 誤答位置で解放 → 誤答確定 → 正答位置へドラッグ中 → 正答位置で解放 → 正答確定 → 解放アニメーション後の順。元の実 WebGL PNG を半分の解像度で並べたもので、別のモデルや架空の HUD は描いていない。[対応する元画像](devices/atlas-index.json)も記録した。6 枚の一覧で長さ・針の全 60 状態、カフェウォールの 6 枚を実際に開き、代表の原寸画像も開いた。

| 検査 | 結果 |
| --- | --- |
| 全体の見切れ | 全 66 画像で実メッシュ全体が画面内。観察床で板全体の実 world 遮蔽検査も成功 |
| 文脈・補助切替 | 長さの shaft と針の実 world matrix / geometry は不変。目地の直線 geometry も不変 |
| ドラッグ・解放・確定 | 実ドメインの 29 操作を記録。ドラッグ中は保存値を変更せず、指を離すと値を保存するが解放しない。誤答 commit は受理して feedback を返し未解放を維持。正答 commit でのみ解放 |
| 操作範囲 | 共通半径 `DEVICE_HANDLE_HIT_RADIUS = 0.30 m` を使用。長さ min/initial/correct/max と針両端の 4 角度、3 画面寸法、観察距離/最大 4.9 m の **72 条件すべて 44 pt 以上** |
| 板端の切り取り込みの最小操作範囲 | 幅 **47.7447 pt**、高さ **54.5980 pt**。見える輪の半径 0.16 m と区別 |
| 実 ray→板座標の往復誤差 | 最大約 1.10 × 10⁻¹³ m |
| 描画量と寿命 | 最大 36 calls / 326 triangles。1 renderer、破棄後 geometry / texture とも 0、ブラウザー例外 0 |

最大距離 4.9 m の針の視点は実 world の格子に遮られる場合があるため、操作範囲の純投影サイズと、その地点で入れるかという遮蔽判定を混同していない。実際の観察床では全体可視を必須にした。

初期の長さ板は距離 3.25 m のままだと縦長画面で幅が不足したため、実装側で観察床を遠ざけ、針の部屋も広げた。個別検査のカフェウォールは端が切れた撮影視点を許容距離内の 3.4 m へ引いた。撮影中に定義が変わった実行は source guard で不成立とし、定義・共通半径の freeze 後に再生成した。

再現: `node scripts/preview-vault.cjs`。`--extract-only` はドメインと投影だけを検査する。これは実装済みのドメイン操作を板座標で送る個別検査であり、**native の指操作、実 HUD の文字倍率・重なり、プレイヤーが錯視を感じたか、章の通し経路を検証したものではない。** 実 HUD と本編の動的検査は、次の Phase C に分けて記録する。

## Phase C: 実コントローラー・本編・HUD

実 `FirstPersonScreen` / `VaultTouchLayer` / `VaultScene` と同じ資源を使い、西・東の両経路で長さ調整から出口封鎖まで連続操作した。1 シーケンスにつき Scene と Screen を各 1 回 mount し、実コントローラーを 60 Hz で進め、実 `useFrame` の結果を 30 fps でブラウザーへ渡す。装置は Screen の実ボタンと TouchLayer の `onTouchStart/Move/End` を通す。ドラッグ中・解放直後・誤答確定・正答確定を別々に記録し、確定前に解放しないことを検査した。

- [西の通し動画 40.90 秒](chapter/west.mp4) / [東の通し動画 45.20 秒](chapter/east.mp4)
- [西の時間順一覧](chapter/west-overview.png) / [東の時間順一覧](chapter/east-overview.png)
- [反応と追跡の順序画像](chapter/notice-pursuit.png)、[長さの直接操作](chapter/length-operation.png)、[針の直接操作](chapter/rod-operation.png)
- [退避して捜索終了を待つ動画 31.13 秒](chapter/search.mp4) / [捜索と復帰の順序画像](chapter/search-and-return.png)
- [攻撃確定後に横へ避ける動画](chapter/windup-dodge.mp4) / [回避の順序画像](chapter/lateral-dodge.png)
- [扉を見る・閉める・結果の順序画像](chapter/final-door-and-result.png)、[仕切りによる攻撃遮断](chapter/partition-attack-blocked.png)
- [初回格子越しの観察動画](chapter/entry-peek.mp4) / [実際の頭・肩の部分像](chapter/entry-peek-head-through-grille.png)
- [実数値・時系列・HUD 矩形監査](chapter/sequence-and-hud-audit.json)、[全 WebGL フレーム](chapter/webgl.json)、[最終ソース SHA](chapter/source-hashes.json)、[画像の閲覧記録](chapter/visual-review.json)、[成果物 SHA](chapter/manifest.json)

| 時刻（西動画） | 実際の状態・操作 |
| --- | --- |
| 9.133 → 10.567 → 11.100 → 11.733 秒 | patrol → 実移動からの noise に investigate → notice → pursue |
| 約 10.5–12.5 秒 | 実プレイヤーの look 入力で対象を見ながら移動。顔・胸・歩行が映る。以後は棚の遮蔽へ向く |
| 18.600 秒 | 棚と作業ベイの実形状で視線を切り、最後に見た場所の search へ |
| 29.067 秒 | 針の解放後の二度目の pursue |
| 34.200 → 34.933 → 35.367 秒 | windup → attack → recover。本人が取っ手を見て仕切りを閉じ、実遮蔽で攻撃を防ぐ |
| 38.700 秒以降 | 本人が搬出口の取っ手を見て明示閉扉。進行上の完了を即確定して非同期保存を要求し、降下・余韻の後に実結果コンポーネントへ。App の保存成否は capture 外 |

別の search 動画では西経路から同じ安全ベイへ入り、格子の開口へ自分で向いて待つ。18.6 秒からの記憶位置への移動、到着後の 3 方向の捜索、29.133 秒の return を連続して計算した。24–30 秒には実モデルの接近、顔・胸の向き直り、背を向ける過程が見える。長く待つ場合は敵の後の位置も変わるため、捜索観察用シーケンスはここで終了する。実装の危険を消して通し動画へ継ぎ足したものではない。

横回避の動画だけは独立した初期 fixture を使用する。役者 `(2.3,0,18)`・yaw π・pursue、プレイヤー `(2.3,1.6,19.2)`・yaw 0 から始め、予告を待ち、attack が位置を確定した後に実右移動を 0.5 秒入力する。途中のテレポートや敵の移動差し替えはない。回復中には本人の look 入力で再び見る。これは通しプレイでそこまで進んだ記録とは分けている。

カメラは実コントローラーの位置・FOV 65°・yaw/pitch をそのまま使う。移動中に見たい方向は合成したプレイヤー入力で与え、QA の look 入力の上限は 180°/秒。装置開始時の自動位置合わせ・拡縮、敵へカメラを自動で振るゲーム機能は追加していない。出口の閉扉開始後はカメラ行列が 1 種類のまま、実扉メッシュの下端は共有 world の下端と一致する。Screen の通知タイマーはオフライン抽出でも 60 Hz のシミュレーション時計で進め、処理が速いことを理由に字幕を延長しない。

| 検査 | 結果 |
| --- | --- |
| 追跡・windup・attack・recover を含む実メッシュ | 最小 y = 0 m、最大高さ約 2.16065 m、全頂点の最大水平半径 0.414347 m < 0.44 m |
| world の壁・棚・閉扉との照合 | サンプルした全フレームで、実頂点の solid 内侵入 0。任意の三角形と面の全交差検査ではない点は区別 |
| 接地中の足底四隅 | world 最大移動約 3.56 × 10⁻¹⁵ m、2 cm 未満 |
| 通し経路 | 西・東とも捕捉による座標ジャンプなし、明示閉扉後の完了 callback 各 1 回 |
| 描画予算 | 実 WebGL 全フレーム最大 97 calls / 4,656 triangles、予算 150 / 100,000 内。先行の間引き撮影は 70 calls だった |
| 資源 | 各撮影 pass でブラウザー renderer 1 個をシーケンス間で再利用。各シーン破棄後 geometry / texture = 0、ブラウザー例外 0 |

Goal 008 の別場面の最大値は 132 calls / 9,794 triangles だった。今回は同じ予算内だが、同一フレームの高速化比較ではない。生成動画の 30 fps も出力ファイルのサンプリングであり iPhone の実 FPS ではない。

HUD は 320×568 の文字 1/2 倍、390×844 の 1.5/2 倍、430×932 の 1/2 倍について、両装置の通常・補助展開・スクロール上端/下端を確認する。実 Button は 44 pt 以上、操作レールと板は離隔し、補助の最後へスクロールできる。320×844 のように板が収まらない極端な縦長条件を、カメラ変更で無理に通したものではない。

初回の矩形監査には見出しと板の組合せが欠けていた。追加すると 320×568・文字 2 倍で見出し背景が板に約 2.26 px 重なることが分かり、実アプリの長さの目的文を意味を保って短くした。修正後は見出し下端 165.375 px、板上端 196.710 px で約 31.34 px 離れる。原寸例: [長さ・文字 2 倍](chapter/layout-length-320-font2-expanded.png) / [スクロール末尾](chapter/layout-length-320-font2-expanded-bottom.png)、[針・430 幅](chapter/layout-rod-430-font1-expanded.png)。

撮影前の最初の search 視点はベイの側壁を向き、phase ログがあっても実モデルの捜索を見せる画像になっていなかった。格子の開口へ本人の look 入力を向けるよう撮り直した。移動時も棚ばかりを映していた区間があったため、最初の反応が起こる短い区間だけ、同じ移動経路を保ちながら実入力で対象を見ている。初回の準備用画像や短文化前の画像を最終合格画像として扱わない。

再現は `node scripts/preview-vault-chapter.cjs`、続いて `node scripts/review-vault-clips.cjs`。後者は現 timeline のフレーム数を指定して動画を確定し、以前の作業 PNG が末尾へ混入しないことを ffprobe で検査する。動画を時間順にデコードし、実 Scene の変換と HUD 矩形も再照合する。スクロールは Chromium の合成が非同期なので、静止 layout の別 pass で 2 描画フレーム待って 48 枚を取り直し、スクロール前の pixels が残る撮影を除いた。この pass も 1 renderer を再利用し、動画用 renderer の終了後に実行する。[layout の実測](chapter/layout-webgl.json)。各順序画像の `+時刻` はその抽出区間内の経過時間で、元動画の開始時刻は監査 JSON の `sheets[].start` にある。

A/B の source hash は各段階が成立した時点の記録である。後段の統合で A の 4 ファイル（GalleryActor の error guard、specs、chapter、runtime）、B の 6 ファイル（VaultDevices の error guard、state、chapter、runtime、actor、world）が変わった。A/B の成果物 hash 93 件は保持して実一致を再確認し、最終本編の source 一致は C の hash で別に検査する。

これらは **時間順のデコード画像を実際に開いた観察** であり、動画全編を実時間の速度で通して視聴したとはしていない。実 native の ready/presentation、音声 backend、指イベント配送、safe area は stub 境界であり、実 Three/WebGL 描画と分ける。HUD は実 React Native コンポーネントの host style をブラウザー CSS へ写した結果で、Yoga や UIKit の文字計測を実測したものではない。照明下の輪郭や取っ手を画像で確認しても、実機の暗所視認性、恐怖、錯視の知覚、音の実聴、実指の操作感は未確認である。
