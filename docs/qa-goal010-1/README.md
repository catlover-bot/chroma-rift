# Goal 010.1 QA

変更前は固定した `bafd563`、変更後は Part A `5e33c7c` を含む最終 Part B ソースです。以下は実 Scene・材質・controller・画面 component から作った比較です。固定画像は同じ姿勢・設定・意味状態で各45ケース（320×568 / fontScale 2、390×844 / 1.5、430×932 / 1）を採取しました。動画内の操作は実 Screen/controller を通します。端末の録画を再現したカメラ位置と断定せず、比較用に定めた同一視点です。

[全体実装・検証](../GOAL-010-1.md)、[最終検証](final-verification.json)、[最終循環検査](runtime-cycles-after.json.gz)、[Part A 検証](part-a-verification.json)、[循環 before](runtime-cycles-before.json.gz)、[循環 after](runtime-cycles-after-part-a.json.gz)、[Metro の入口検査](metro-stage-entry-part-a.json) は、下記の視覚資料とは別の証拠です。ソフトウェア描画や cold-import 検査を、実機の新規起動確認とは扱いません。

| 同一視点・390×844 / fontScale 1.5 | 変更前 | 変更後 |
|---|---|---|
| 灯り・両窓に影 | [画像](stills/before/light-shadow-shadow-390.png) | [画像](stills/after/light-shadow-shadow-390.png) |
| 灯り・一方に光 | [画像](stills/before/light-light-shadow-390.png) | [画像](stills/after/light-light-shadow-390.png) |
| 灯り・両窓に光 | [画像](stills/before/light-light-light-390.png) | [画像](stills/after/light-light-light-390.png) |
| 解放後の灯り・正面 | [画像](stills/before/light-solved-explore-390.png) | [画像](stills/after/light-solved-explore-390.png) |
| 最初の暗い分岐 | [画像](stills/before/first-junction-390.png) | [画像](stills/after/first-junction-390.png) |
| 棚・隠れ場所の縁 | [画像](stills/before/shelf-edge-390.png) | [画像](stills/after/shelf-edge-390.png) |
| 制御室入口 | [画像](stills/before/control-room-entrance-390.png) | [画像](stills/after/control-room-entrance-390.png) |
| 映写機・未操作 | [画像](stills/before/projector-unarmed-390.png) | [画像](stills/after/projector-unarmed-390.png) |
| 映写機・取っ手操作中 | [画像](stills/before/projector-armed-390.png) | [画像](stills/after/projector-armed-390.png) |
| 映写機・作動中 | [画像](stills/before/projector-running-390.png) | [画像](stills/after/projector-running-390.png) |
| 映写機・再使用待ち | [画像](stills/before/projector-cooldown-390.png) | [画像](stills/after/projector-cooldown-390.png) |
| 保守通路・閉 | [画像](stills/before/maintenance-closed-390.png) | [画像](stills/after/maintenance-closed-390.png) |
| 保守通路・開 | [画像](stills/before/maintenance-open-390.png) | [画像](stills/after/maintenance-open-390.png) |
| 防火幕・閉 | [画像](stills/before/curtain-closed-390.png) | [画像](stills/after/curtain-closed-390.png) |
| 劇場結果 component | [画像](stills/before/theatre-result-390.png) | [画像](stills/after/theatre-result-390.png) |

結果画像は明示した完了 fixture を実結果 component に渡したものです。この静止画だけを実 App の走破・保存成功の証拠にはしません。最小幅の灯りは [320 / 文字2倍・上端](stills/after/light-shadow-shadow-320.png) と [下端](stills/after/light-shadow-shadow-320-bottom.png)、[両窓に光・上端](stills/after/light-light-light-320.png) と [下端](stills/after/light-light-light-320-bottom.png) を保存しました。

全45組でカメラ姿勢と光学・進行状態が一致し、最終 UI の横方向 overflow と受光面・光源への見出し／操作欄の交差は0件でした。実 mesh の保守的 AABB 検査では新しい窓枠8部品が標本内側へ入らず、最小余白は約0.004 mです。番号・枠・床端・棚端・制御盤形の標識を代表画像で確認しました。これは実機の輝度・コントラスト測定や錯視の知覚検査ではありません。[全ケースの検査値](visual-comparison.json) に姿勢、光学値、実表示文、ボタン状態を残しています。

| 実操作の短い映像 | 長さ / フレーム数 | 確認できる変化 |
|---|---:|---|
| [灯り](clips/light-operation.mp4) | 20秒 / 600 | 6秒で1/2・ドラッグ案内消失、13.5秒で2/2だが未確定、14.5秒で明示固定、15.5秒で任意観察を終了 |
| [保守通路](clips/maintenance.mp4) | 4秒 / 120 | 1秒で実ボタンから開通、その後3秒間はカメラを動かさず開通済み・無効表示を維持 |
| [映写機・実起動](clips/projector.mp4) | 8秒 / 240 | 0.5秒で起動と怪異の調査、1.3秒で作動中、5.5秒で再使用待ち、6.7秒で再使用可能 |
| [同じ開始状態・操作なし](clips/projector-control.mp4) | 8秒 / 240 | 同じ位置・進行・怪異状態から開始し巡回を継続 |
| [実 App の章間再入場](clips/chapter-reentry.mp4) | 19秒 / 570 | 章選択→準備→展示室→ホーム→収蔵庫→ホーム→映写室→ホーム→映写室再入場 |

映写機の2本は操作直前の正規化 runtime と pose の hash が一致します。起動側の怪異は0.5秒に patrol→investigate、5.5167秒に search へ遷移しました。2.2秒の [起動側](review/projector-002200.png) と [操作なし](review/projector-control-002200.png) では、開口部に実際の頭・胸が見え、位置と向きが異なります。その後の全時刻で怪異が画面内にいるわけではありません。音の再生だけから誘導成功を推測せず、実状態の遷移と画像を併記しています。実聴はしていません。

映像は合計59秒・1,770フレーム。最終 MP4 を復号した時刻順の35枚を実際に開きました。全編を実時間で再生して見たとは扱いません。代表静止画は変更前後それぞれ15枚すべてと最小幅の灯り上下を開きました。[閲覧記録](visual-review.json)、[35時刻と動的イベント・所有者・描画統計](motion-review.json) を参照してください。章間映像は実 App/reducer/保存処理を隔離メモリで実行し、4つの別 session、最大1つの Canvas 所有境界、復帰後の全所有者破棄を確認しました。Native Canvas／ready／音声は stub です。

ブラウザは Chromium のソフトウェア WebGL、HUD は実 React Native host の CSS 変換です。ネイティブ Yoga、SafeArea、指のジェスチャー配送、EXGL の提示完了ではありません。静止比較は最大66→87 draw calls、4,706→5,738 triangles、動画全体では最大92 calls / 6,170 triangles。既存150 calls / 100,000 trianglesの目安内ですが、描画時間・端末 FPS を示しません。各ブラウザの renderer は1つ、終了時 geometry/texture は0。別の実 texture upload 検査では8 textureを描画後0へ解放しました。

撮影中に分かった不備も記録しています。最小幅の長い固定ボタンは横にはみ出したため、文字サイズを保った折返しを追加して再測定しました。固定 armed fixture は画面 mount の停止処理に解除されたため、ハーネスを mount 後の実 enter-projector 操作へ直し、全状態と HUD controls の一致を検査して両版を再撮影しました。解放後灯りの比較も、任意ラベルが実際に出る正面へ両版を揃えました。作動中 fixture は正規の残り3秒／cooldown4.2秒へ修正しました。編集中ソースを検出した draft は破棄し、最終 hash 一致した成果物を採用しています。

[警告調査](warning-audit.json) は baseline と最終の実 resource upload を分けています。installed R3F 9.7.0 の native entry が読む events module は `Clock` を生成し、start/stop/getDelta と可変 elapsedTime/oldTime を使用します。Three 0.185.1 の Clock は非推奨ですが、Timer は別 API なので置換・monkey-patchをしていません。[Clock](https://threejs.org/docs/pages/Clock.html) と [Timer](https://threejs.org/docs/pages/Timer.html) の公式説明も確認しました。

実8 DataTextureのブラウザ upload では `pixelStorei` の引数をそのまま転送して一時記録し、wrapperを復元しました。installed expo-gl 57.0.2 の実装では FLIP_Y / ALIGNMENT の処理に対し、PREMULTIPLY_ALPHA / COLORSPACE_CONVERSION は未対応分岐へ入るため、今回警告の候補になります。元の端末で実際に渡った引数・回数を捕捉した結果ではありません。opaque alpha、sRGB、行方向の実装を確認しても、iPhone上の上下・alpha・色を確認したことにはなりません。暗い壁との因果関係も立証していません。[Expo GL](https://docs.expo.dev/versions/latest/sdk/gl-view/) のネイティブ境界を保ち、警告抑制や GL no-op は追加していません。[Metro の警告除外](https://metrobundler.dev/docs/configuration/#requirecycleignorepatterns)、[Node の循環説明](https://nodejs.org/api/modules.html#cycles) は循環の構造修正や Metro 実起動を代替しません。[開発ビルド](https://docs.expo.dev/develop/development-builds/use-development-builds/) と [Expo CLI](https://docs.expo.dev/more/expo-cli/) も参照し、依存更新・native rebuild は今回行っていません。

[個人録画の限定観察](video-review.json) は basename・hash・寸法と実際に開いた17時刻の事実だけです。原動画とその抽出画像、個人パス、端末識別 tags、巨大な scene/host/frame JSON は Git 対象にしていません。実機の新規起動、章順の入替、文字2倍での操作・開通済み表示、映写機の実聴／敵への反応、pause/resume、native textureの上下／alpha／色、錯視と怖さは [実機手順](../IPHONE_VALIDATION.md) で確認が必要です。

再現は既存依存とローカル Chromium / ffmpeg で実行します。before は固定 archive のソースを使い、現在の実装を旧版と呼び替えません。出力は ignored `.expo/goal010-1`、ソース変更があれば hash guard が失敗します。

```sh
node scripts/preview-theatre-readability.cjs --source /tmp/chroma-rift-goal010-1-baseline-bafd563 --label before
node scripts/preview-theatre-readability.cjs --label after
node scripts/preview-theatre-stability-motion.cjs --scenario=light
node scripts/preview-theatre-stability-motion.cjs --scenario=maintenance
node scripts/preview-theatre-stability-motion.cjs --scenario=projector
node scripts/preview-theatre-stability-motion.cjs --scenario=projector-control
node scripts/preview-chapter-reentry.cjs
node scripts/trace-renderer-warnings.cjs --source /tmp/chroma-rift-goal010-1-baseline-bafd563 --out .expo/goal010-1/warnings
node scripts/trace-renderer-warnings.cjs --out .expo/goal010-1/warnings-final
```

[読み込んだソースと脚本の hash](visual-source-hashes.json) は各 QA プロセスの範囲を記録し、アプリ全ファイルの監査とは区別します。[小型成果物 manifest](visual-manifest.json) は画像・動画・検査値の57ファイルを対象とし、READMEと親担当の全体検証記録は含みません。

撮影後、3つの QA 脚本の末尾にあった余分な空行だけを削除しました。撮影時 hash は保持し、最終 hash と末尾以外の byte 一致・位置情報を除いた Babel AST の一致を [ソース記録](visual-source-hashes.json) に併記しています。本編・画像・動画に変更はなく、再撮影していません。
