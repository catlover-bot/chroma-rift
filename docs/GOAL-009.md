# Goal 009 — 測れない収蔵庫と怪異の身体

## 出発点と保持

2026-09-08、開始 HEAD は `d1f7b5513da5c0909089edc30fddc8c0665dadcb`。既存 `feat/goal-008-perceptual-horror` の履歴を保ち、その HEAD から `feat/goal-009-uncanny-vault` を作った。開始時に既存の未コミット変更はなかった。先に作成した検証ディレクトリは [preflight.log](qa-goal009/preflight.log) の untracked 表示に含まれる。aa8ff20、Goal 005照合コミット7be6d39、および以後の既存章を巻き戻していない。

Node 24.20.0、npm 11.19.0、Expo 57.0.1、React 19.2.3、React Native 0.86.3、Three 0.185.1、R3F 9.7.0、TypeScript 6.0.3 を使用。開始時の実測は `npm run check` **64 suites / 782 tests PASS（89.258秒）**、Doctor **21/21 PASS**。[開始check](qa-goal009/baseline-check.log)・[開始Doctor](qa-goal009/baseline-doctor.log)を保存した。

保護6ファイルは [protected-baseline.sha256](qa-goal009/protected-baseline.sha256) に固定した。package.json、package-lock.json、app.json、eas.json、metro.config.js、metro/withNativeThree.js の変更、新依存、native設定・署名・認証変更はない。reset / clean / amend / push / PR / EAS build / 公開は行わない。

## 実装した章と操作

新章IDは `uncanny-vault-v1`、章名は「測れない収蔵庫」。ホームに独立した開始・続きがあり、既存展示室の結果から「次の章へ」で選べる。既存初回調整と設定を共有し、新章進行に旧解放フラグを流用しない。旧章、展示室、第三者クレジットを保持する。

連続経路は補修ベイの留め金→格子越しの怪異→中央棚の左右の遮蔽経路→細い格子内の制動ベイ→搬出口の仕切り→最後の取っ手。必須問題は長さと鉛直の2種類で、旧B/C・配線・紋章・投影鍵は新章に出題しない。小さなカフェウォールは任意の観察だけ。

| 装置 | 操作と真値 | 任意比較が変えるもの |
| --- | --- | --- |
| ミュラー＝リヤー型の留め金 | 右端を横drag、releaseで確定、明示「固定する」。目標1.24m、初期.92m、範囲.68–1.52m、許容差.035m | V字装飾の表示だけ。測定ガイドは固定基準の両端。軸の端点・太さ・奥行き・正解・camera・地形は不変 |
| Rod-and-Frame型の針 | 両端のどちらかをdrag、release、明示「ロックする」。枠18°、初期針−13°、許容差2.5° | 枠の表示、静止した下げ振りの表示だけ。針は両端等価でπ周期。world重力を板座標へ変換した真の鉛直を描画・判定で共有 |
| カフェウォール | 小壁面を観察し、タイルの明暗をそろえる | 目地の位置・水平線・壁・cameraは同じ。第三の必須解放にはしない |

誤答コマンドは受理して短い不一致反応を返すが、解放しない。誤答で敵を呼ばず、値を保持して再調整できる。比較や補助だけでも解放しない。drag中の仮値、release後の確定値、解放を分け、画面外drop/cancelは保存済み値に戻す。端点の大きな輪と共通の半径.30mの板上hit領域を使う。VoiceOver/簡単操作では長さ.02m、角度2°の意味付き調整を提供する。

## 録画から確認した範囲

指定動画を既知のWindows Downloadsで読み取った。元動画はGitや外部へ送っていない。長さ263.559410秒、1170×2532、HEVC、表示frame rate 60/1、AAC音声付き。SHA-256は `f52f8f782fe6923d3aeac4b395fcefdea90cbbd64a296bebc110a78c472897d5`。[録画レビュー](qa-goal009/source-video-review.json)に抽出と観察の境界を記録する。

- 時刻247.825→247.841667秒の連続デコード画像で、背面から正面への全身切替が読み取れた。これは録画PTSで、実ゲームFPSの測定ではない。
- 254秒付近では壁を向いた構図にも閉扉ボタンがある。255.4–255.5秒に結果、255.7秒付近にホームがある。自動消去か利用者の素早い操作かは断定しない。
- 20秒のExpo Dev Launcher / Finding Dev Servers、38秒付近のホーム、48秒付近の本編を区別し、40秒の製品ロードとは扱わない。
- 全動画の実時間視聴・実聴を行ったとは報告しない。錯視、恐怖、戸惑い、操作意図、当時の難易度はフレームだけから決定しない。

旧コードのyaw直接設定、腕の距離sin、頭の固定姿勢を確認して共通身体層を改修した。既存の足処理、lastSeen、LOSが存在したことも区別する。

## 一つの移動・視認・描画所有者

順序は、nativeの実描画準備完了→FrameDriver内の入力消費と衝突付きplayer移動→tick冒頭の実眼位置/実頭向きとLOS・移動音を観測→章別FSMが意図を決定→共有locomotionが実root/速度/接地を更新→同じstateから身体meshを提示→native presentation成功後に音・字幕・snapshotを通知する。

`src/domain/actorMotion` はdesiredHeadingとactual yawを分け、固定120Hzの内部stepで角速度・加速度を制限する。頭、胸、骨盤、足の順に応答し、world foot anchorと平坦床の解析IKを使う。render側の別root motion、AnimationMixerによる別位置更新、毎frameのReact setStateは追加しない。眼の計算とmesh頭部は同じpose関数を参照する。

| 値 | 以前 / 今回 |
| --- | --- |
| body yaw | 目標へ直接代入 → 最大120°/s、角加速度480°/s² |
| 頭・胸・骨盤 | 頭±58°、pitch±18°、胸遅延.16s、骨盤遅延.30s。30fps映像では約.033/.20/.333sに変化開始 |
| 踏み出し / 減速 | .24sの予備動作、加速度2.8m/s²、減速度4.2m/s² |
| 旧展示室速度 | 巡回.84 / 接近1.25m/sを保持。新攻撃FSMを旧章へ適用しない |
| 新章速度 | 巡回.72、調査1.0、追跡2.35、捜索.62m/s。実移動でも追跡2.35m/sを検査 |
| 視認・認知 | 範囲6.4m、実眼方向の左右52°、認知.45s、実不透明solidのLOS |
| 攻撃 | notice .65s、windup .75s、固定標的へのattack .42s、recover .95s。commit後の横移動へhomingしない |
| 身体 / 復帰 | 半径.44m、接触.68m、cold/caught grace3s。控えめは能動追跡/捕捉なし |

音イベントは実player移動.65mごとに生成する。徐行≤.65m/sは強さ.1、通常.4、>1.4m/sは.8、金属床は×1.35。UI・マイク・スピーカー再生成功を音源にしない。壁越しは減衰し、古いsequenceは再観測しない。lastSeen/lastHeardは実際に観測した位置だけ。最後の位置へ到達してから3方向を捜索し、帰路へ戻る。

足音/衣擦れは実再接地イベントから既存10-player poolへ送る。距離閾値の旧actorMovement APIを本編から並行呼出ししない。実音源7件は再生成一致・peak/RMS/DC/非clipの整合性を検査し、音源ファイルは変更しない。方向定位や実聴は確認済みとしない。

詳細なAIとルート検査は [GOAL-009-ACTOR-VERIFICATION.md](GOAL-009-ACTOR-VERIFICATION.md)。静的world、操作対象、無変更のgate形状を再利用し、同じworldの棒で初回格子を描画・遮蔽判定する。格子の隙間は視線が通る一方、playerの幅より狭く通り抜けられない。制動ベイの.70m開口はplayerの.48m幅が通り、怪異の.88m実包絡は通らない。

## 保存・停止・出口と既存UX

新章キーは `chroma-rift.uncanny-vault.v1`、backupは `chroma-rift.uncanny-vault.backup.v1`。共有の直列writer、session lease、reset世代を使う。version/seed、確定値と解放、発見、補助、実際に訪れた安全checkpoint、clearのみを厳密に保存する。actor時計/記憶、途中drag、pointer、GPU/audio、未提示attackを保存しない。未知版・破損原文を保護し、旧gallery/旧first-personキーを新章resetで消さない。

同session pauseはactor記憶・時計を保持する。cold resumeだけ認可済み安全poseとgraceへ復旧する。失敗したnative frameはplayer・actor・観測・noise sequence・安全地点の更新を戻し、そのframeの足音/字幕を捨てる。真のrender/presentation前のready昇格や偽の進捗率はない。

最後は安全敷居にいることと、実際に見える扉/取っ手の距離・向き・遮蔽を照合して明示操作する。受理時にclear・敵停止・全指解放を確定し、余韻を待たず新章checkpointの非同期保存を要求する。保存失敗は画面へ通知し、未知版の原文がある場合は上書きしない。扉は同じworld値で.25秒かけて閉じ、1.4秒の合計余韻を残す。閉鎖を提示してからimpactを一度送る。演出待ちに保存を依存させず、cold clearは閉扉済み。cameraの強制反転やrollはない。

旧展示室も壁向きの閉扉を拒否し、上へ消えていた取っ手を眼高の大きいpull handleと接続ケーブルへ直した。結果画面は新たなdown/upを必要とし、閉扉から持ち越したtouch-up/無所有pressを拒否する。旧B/C/配線のメモ比較は項目ごとの補助状態を表示・保持し、仮面/掲示の観察後は短い構造説明と任意メモへつなぐ。

## 検査と動的画面確認

段階Aの共有身体と約30秒動画、段階Bの装置の不変条件・個別描画を通過してからCで本編に接続した。資料室や単体サンプルだけで完成とはしない。

- A: 30秒×2視点、各900frameのMP4。旧renderer/新rendererを同じcameraとroot経路で比較。時間順の動画デコード画像を閲覧した。全body最大半径.391322m、stance頂点変位最大約1.4×10⁻¹⁶m、眼方向差約7.2×10⁻¹⁶。停止指示を目標到達前へ修正して減速を測り、接地が追跡速度を落としていた問題も修正した。30/60/120Hzと可変deltaの軌跡・接地を検査。A後のGalleryActor差分は例外通知境界の追加で、運動・mesh形状は同じ。
- B: 個別装置66viewsと6一覧、実domain操作29件。3画面幅・距離・長さ極値・rod両端を含む72hit条件は最小47.7447×54.5980ptで44pt以上。板端によるclipを含めて検査。操作床で全板可視、ray/plane往復誤差最大約1.1×10⁻¹³m。最大距離4.9mのrodは格子による遮蔽と純投影サイズを分ける。誤答はacceptedだがsolved=false。比較の9意味群PASS。
- C/D: 実controllerの両通路6完走条件に加え、標準でnotice→pursue→棚LOS遮断→lastSeen捜索→returnを確認。標準/控えめ、無音、補助あり/なし、途中再開を含む。動的WebGLは西40.90秒、東45.20秒、捜索31.13秒、横回避2.53秒、入口観察2.90秒の5本・合計3,680frame。全実頂点の最大半径.414347m < .44m、床下/solid内への頂点侵入0、stance足底の移動最大約3.56×10⁻¹⁵m。実メッシュを実controllerと同じ状態から描き、native ready/音声backendは試験境界として代替した。HUD12条件・48表示と13意味項目の監査もPASS。最終全frameの最大97calls/4,656triは前章132/9,794と同じ予算内だが、別場面のため同一frame性能比較ではない。
- Native契約: 実インストール済みR3F/scene/controllerで10回入退場、単一rendererと全nested資源の一度だけ破棄、失敗frameのnoise/actor rollback、閉扉の同一geometry進行とpresentation後だけのimpactを検査。device GLだけは代替なので実GPU描画の証拠ではない。
- UI: 実Screenとcontrollerでdrag→release→commit、二指/第三指、外drop、VO角度調整、メモpause、checkpoint、閉扉余韻、前章→新章、専用resetを確認。320×568/fontScale2、390×844/1.5、430×932/1の操作領域を検査。320×844で全板が切れる場合の開始拒否も別検査で保持。

A/B/Cごとのsource hashと描画方法は [qa-goal009/README.md](qa-goal009/README.md) にまとめる。WebGL映像や合成RNイベントをiPhone/Metal/EXGL・実指・60fpsの確認に読み替えない。描画数・三角形数は怖さや自然さの証拠ではない。

### テストの変更理由

旧yaw直接代入を前提にした即移動の期待は、予備動作を経て実移動する期待へ変更した。旧最終敷居への到達だけで閉じる試験は、壁向き拒否→本人の視線変更→明示閉扉を検査する。旧native actor rollbackは、実際の踏み出し後に失敗を注入して「動いた未提示frame」を検査するようにした。結果のfireEvent.press依存は明示accessibilityActivateまたは所有down/upへ変更した。全削除のexactキー一覧は新章2キーを追加し、章だけresetの非破壊性は別に検査する。

新native10回入退場の試験は5秒の既定timeoutを超えるため、既存gallery10回と同じ30秒の試験期限へ変更した。回数、資源数、dispose回数、旧callback無効化のassertは維持する。320×844の縦長fixtureを対応機種寸法へ直した際も、元の板切れ拒否検査を残した。検査の緩和で通過させない。

最終HUD追加検査で320×568/fontScale2の長さ案内が5行に折り返し、背景が板上端へ2.259pt重なる不足を発見した。案内を「固定して格子を開く」「下の棒を見本と同じ長さに」へ短くし、文字倍率、装置の寸法・配置、操作条件は保った。文言assertだけを追随させた。修正後の実HUDで見出し下端165.375pt、板上端196.710pt、31.335ptの離隔を確認し、撮影・最終checkとバンドルを更新した。

### 最終実行記録

2026-09-08、アプリソースを固定して以下を実行した。記録は [final-verification.json](qa-goal009/validation/final-verification.json)。開始時782件から最終887件へ105件増え、既存章の完走・保存・native契約を含めて成功した。

| 検査 | 最終結果と証拠 |
| --- | --- |
| lint / typecheck / test / iOS export / check | `npm run check` 内で各scriptを順に実行してすべてPASS。**75 suites / 887 tests、133.186秒**。[全体ログ](qa-goal009/validation/final-check.log) |
| iOS成果物 | 1,513 modules、Hermes約6MB。SHA-256 `1c0f80c7e233acaa469cdac228fd735ca3be9ecaba6f9c036e854172218ea556`。IPA・端末表示の検査ではない |
| Doctor / Expo依存 | [Doctor 21/21 PASS](qa-goal009/validation/final-doctor.log)、[expo install --check: up to date](qa-goal009/validation/final-dependencies.log)。[npm ls](qa-goal009/validation/npm-ls.log)も正常 |
| 開発Three | 実Metro出力のapp/R3F edgeは同一 `three/build/three.cjs`。Vector3/Quaternion/Object3D/Mesh のfactory実評価で同一性PASS。[開発検査](qa-goal009/validation/three-dev-identity.json) |
| 本番Three | minify済み実Metro出力でも同一入口・4クラス同一性PASS。[本番検査](qa-goal009/validation/three-production-identity.json) |
| バンドルの現物照合 | 開発/本番ともsource map内の全アプリソース**143ファイル**を現在のbytesのSHA-256と照合し一致。開発JS実hash `6572cf4e5d6a1775b210a14b4a172ec351f7f685f5210c5f11e741ff0de2840a`、本番JS `550d1943d1b58830c5d0b469a5f59ca8d6dc9389cf1ea85ed2d39b13991cd46c`。出力名だけで判断しない |
| 音源 | 既存2生成scriptの `--check` PASS、7音源にclipped sampleなし。[基本音源](qa-goal009/validation/audio-assets-check.json)・[知覚音源](qa-goal009/validation/perceptual-audio-check.json)。ファイル変更・実聴なし |
| 保護・diff | 保護6ファイルは開始SHA-256と全一致。`git diff --check` PASS。新依存・native・署名・解決設定の変更なし |

開発は `npx expo export --platform ios --dev --no-bytecode --source-maps --output-dir .expo/goal009/three-dev`、本番は同じコマンドから `--dev` を除き別出力先へexportし、それぞれ `node scripts/inspect-three-bundle.cjs <dir> --expect-single` を実行した。各source mapの `sourcesContent` をUTF-8としてhashし、`App.tsx` / `index.tsx` / `src/` の実ファイルへ全件対応付けた。native bundleは大きいためGitへ含めず、実hashと検査ログを保存した。

独立した最終読み取りレビューでも、保存キー・未知版保護・lease、同session pause、未提示frameのrollback、旧galleryの速度値、唯一のroot・接地音所有に重大な不整合は見つからなかった。C/Dの動画と最終HUD検査は [QA記録](qa-goal009/README.md) に分けて記録する。最終の反応・捜索・回避・閉扉の時系列画像と小画面の原寸画像は主担当も開いて確認した。[閲覧記録と実画像hash](qa-goal009/validation/primary-visual-review.json)。成果物241件（A16/B77/C148）のhash、最終本編95ソース、保護6ファイル、両バンドル143ソース、文書リンクも最後に照合した。[最終整合性監査](qa-goal009/validation/final-integrity.json)。

## 実機の残項目と使用資料

実機の表示、接地/旋回が自然に読み取れるか、二錯視の文脈あり/なしの知覚、視線を切る判断の分かりやすさ、恐怖、実聴、快適さ、FPS、初見6–10分は未確認。自動試験の件数からこれらを推測しない。iPhone手順は [IPHONE_VALIDATION.md](IPHONE_VALIDATION.md)、攻略と退避は [UNCANNY-VAULT.md](UNCANNY-VAULT.md)。目安時間は設計目標で制限時間ではない。

Pyllusionの固定commit/実読取ファイルは [reference-source-record.json](qa-goal009/reference-source-record.json)。MullerLyer/RodFrameの原理と条件分離を参照し、Python翻訳や元画像は同梱しない。カフェウォールも独自幾何。既存CC BY仮面の動的顔への加工履歴を含むクレジットを保持する。[ILLUSION-SOURCES.md](ILLUSION-SOURCES.md)で素材の取り込みと原理参考を分けた。

最終diffがJS/TSと既存対応assetの範囲で保護6ファイルを維持する場合、今回の変更を理由とするnative再ビルドは不要。既存expo-gl/audio入りDevelopment Buildの実機再利用確認は別途必要であり、iOS exportをIPAや実機確認と扱わない。
