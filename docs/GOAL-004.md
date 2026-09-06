# Goal 004 — ドラッグで歩く探索と最初の1分

## 出発点とコードの根拠

開始branchは `feat/goal-003-first-person`、HEAD/期待した祖先は `cee78a6`。開始時worktreeに未コミット変更なし。Node 24.20.0 / npm 11.19.0。変更前の実行結果は **29 suites / 289 tests passed**。

旧 `effectiveControlMode` はReduce Motion、画面読み上げ、fontScale >= 1.5のいずれかで `simple` を有効にした。これにより保存値がstandardでも通常のドラッグ操作に到達しない条件があった。ユーザー端末でどの設定が有効だったかは分からない。旧スティックの小さい固定領域、領域外移動での取消、終了eventにも適用されたtargetTouchesフィルタも実コードで確認した。

共有された録画の説明を出発点としたが、録画ファイルそのものはこの実行環境で確認できていない。壁のような画面だけから描画障害の有無や原因を断定しない。録画からFPSやタッチ遅延は計測していない。

## 変更と保護

- 普通の新規操作はドラッグ。Reduce Motion/文字拡大は操作方式を変えない。VoiceOverは保存値を変えず意味付きボタンを表示する。旧simpleの希望は保持し、最初の一時停止でドラッグを試せる。
- 広い移動領域でtouch-downを原点にしたアナログ歩行、右の相対ドラッグで見回す。複数pointerの独立した取得/解放、領域越え、空のtargetTouchesを含む終了、generationによる古いcallback排除を実装する。詳しい値と境界は[操作設計](CONTROLS-DESIGN.md)。
- 通常の6コマンド移動表と常設の方角/長い説明列を除き、一時停止、小さい照準、短い目的、移動リング、文脈付き操作、色比較を配置。拡大文字とsafe areaでも操作領域を分離する。メニューはスクロールできる。
- しるべ・装置・通常扉に中心6°の取得範囲を追加し、HUDと操作確定で同じ評価を使う。距離、不透明壁/扉の遮蔽、前方、前提条件、連打での一回性を保持。重なる鍵は正確な照準と実行列での投影整列を必要とする。
- 実移動・自分で見回す・しるべの操作を独立して記録し、短い非ブロック案内を消す。通常の目的は一時的な通知と分離する。床の輪が済んでいれば、しるべの後は装置を案内する。
- 入口の両面に同じアーチと菱形の目印を残し、帰路の変化を比べられるようにした。壁の浅い巾木、扉枠、直径0.44のしるべ、装置の面と状態表示を既存mesh/materialで追加。照明方式と色模様の非光依存materialは維持する。
- 導入完了/旧操作案内確認は別のversion付きlocal文書。上下感度は追加任意項目で、欠落/不正値は1。旧standard/simple、v1/v2設定、詳細調整、スコア、chapter keyを保持する。章リセットは導入記録を保持し、全データリセットだけがそれを消す。保存lease・reset epoch・直列化と後戻り禁止を保持する。

操作、HUD、文字、案内の変更でnative rendererを作り直さない。canonical native Three、数値transform tuple、contextごとに一つのrenderer、実render/presentationでの準備完了、前景時間のtimeout、最大2回の手動再試行、診断sceneと失敗報告を維持する。背景/一時停止/失敗時は入力とsimulationを停止する。両パズル、安全に遮蔽された帰路変化、出口の成立条件を保持する。

## 読んだ公式資料

ゲームをプレイした、ゲームのソースを読んだとは主張しない。以下は実際に開いて確認した公式資料。掲載スクリーンショットの取得は成功せず、画像の視覚的な分析は行っていない。ジェスチャ実装や感度を画像から推測していない。

| 資料 | 採用した原則 |
| --- | --- |
| [Granny開発者掲載のモバイルストア](https://play.google.com/store/apps/details?id=com.dvloper.granny&hl=en) | 掲載文にある脱出の目的と音への注意を確認。スクリーンショットの取得は不成功で、見た目の分析は行っていない |
| [The Exit 8・PLAYISM](https://playism.com/en/game/the-exit-8/) | 少ない行動と、見覚えのある場所の違いを認識できる構成 |
| [Frictional Games・Amnesia開発者記事](https://frictionalgames.com/2010-02-closer-look-at-teaser-and-more/) | 小さな一点を探さなくても操作対象を取得できること |
| [Apple・ハンドヘルドゲームのインターフェース](https://developer.apple.com/jp/videos/play/meet-with-apple/243/) | 指の届きやすさ、画面を覆う指、コンパクトな親指操作、端末表示に合わせたUI。動画ページのtranscriptを確認 |
| [Xbox Accessibility Guideline 117](https://learn.microsoft.com/en-us/xbox/accessibility/xbox-accessibility-guidelines/117) | カメラ/動きの選択肢、ユーザーが操作できる感度と不随意な動きの抑制 |
| [Expo・既存development buildの使用](https://docs.expo.dev/develop/development-builds/use-development-builds/) | JS変更を既存buildへ読み込む流れとnative変更時の再build条件 |

Gesture Handlerへ移行せず、インストール済みRNのadapterを拡張した。したがってGesture Handler 3.x APIや2.x Pan APIは今回使用していない。実際に監査したnativeソースはRNの `RCTSurfaceTouchHandler.mm` と `TouchEventEmitter.cpp`。Reanimatedはスティックの見た目だけに使う。sceneの操作ボタンも独立したnative touch ownerを持ち、RN Pressabilityが複数touchの先頭を追跡して第三の指の操作を取り消す条件を避ける。ボタン自身で開始した指だけを採用し、ドラッグ距離と取消を確認する。読み上げのactivateも別に保持する。

既存ゲームのasset、駅、看板、マップ、キャラクター、音、ロゴ、anomaly一覧をコピーしていない。物理エンジン、扉ドラッグ、敵/戦闘/追跡、新しい章、音声依存、post-processingは追加しない。

## 検証結果と限界

| 検証 | 実行結果 |
| --- | --- |
| 変更前Jest | 29 suites / 289 tests passed |
| 操作policy・storage・開始案内の個別Jest | 3 suites / 44 tests passed |
| 上記変更ファイルのESLint | passed |
| npm run lint | passed（最終check内でも成功） |
| npm run typecheck | passed（最終check内でも成功） |
| npm run test | 最終 **34 suites / 370 tests passed** |
| npm run export:ios | passed、最終Hermes bundle 5.1 MB / 1424 modules |
| npm run check | passed：lint → typecheck → 370 tests → iOS export |
| npm run doctor | **21/21 checks passed** |
| npx expo install --check | Dependencies are up to date |
| Three bundle identity | development/productionともpassed。Threeのsourceはthree.cjs一つ、Vector3/Quaternion/Object3D/Meshの同一class identityを確認 |
| 保護対象の設定hash / git diff --check | 開始時と一致 / passed |
| ブラウザ/物理iPhone/実際のGPU描画 | 利用可能な操作ツールなし。未確認 |

主な追加coverageは実adapter/TouchControls/SceneActionButton、三本指の実Pressability event処理、空の終了event、短いlookドラッグの最終差分、30/60/120Hz、3画面サイズと文字倍率/余白、VoiceOverの復元、独立導入記録、旧保存と遅いcallback、共通対象評価と全攻略、rendererの継続/失敗frame巻き戻し。既存の鍵transform検査は、しるべにも再利用したcylinderを誤って含めないよう鍵segment名で選び、全24線分のtuple/座標検査を維持した。

bundle検証は `npx expo export --platform ios --no-bytecode --source-maps --output-dir /tmp/chroma-goal004-three-prod` と、`--dev`を加えた `/tmp/chroma-goal004-three-dev` に対して、`node scripts/inspect-three-bundle.cjs <export-directory> --expect-single` を実行した。両方で `sameClassIdentity: true`。通常の最終Hermes書出しは `index-ca41edbf9b678d8683a2b2f5ae710b8c.hbc`。検証ログはこの実行環境の `/tmp/chroma-goal004-*.log`、identity記録は `/tmp/chroma-goal004-three-*-identity.json`。

既存依存内の THREE.Clock deprecated 警告は出力したまま。警告の抑制や依存更新は行っていない。

GPU境界をmockするcomponent testは実native描画を証明しない。native eventソース監査と実adapterの合成event testは実機の二本指/三本指動作を証明しない。30/60/120Hzの時間・差分比較はsimulationの一致確認で、device FPS計測ではない。文字の実際の折り返し、safe area、指離し、最初のしるべの分かりやすさ、色、触覚、身体的不快感は[15項目の実機確認](IPHONE_VALIDATION.md)が必要。

歩行/見回し10〜15秒、しるべ操作30〜45秒は初見の製品目標で、実測結果でも強制countdownでもない。nativeの快適さ、60fps、恐怖感の達成を主張しない。

## 依存と再起動

package/app/EAS/Metro/native設定を変更しない範囲のJS/TS更新。expo-gl入りのGoal 003系Development BuildはMetroの再読込で再利用できる構成で、今回EAS build/認証/インストールは行っていない。expo-glのないGoal 002 buildは既存のnative gateで案内される。実機上のbuild再利用は未確認。

開始時SHA-256（最終一致を確認、未コミットのユーザーファイルは開始時になし）：

| ファイル | SHA-256 |
| --- | --- |
| package.json | `f59b8631c65582efaacc1f841f58408d83803cda124546f98c6c1fe63f841153` |
| package-lock.json | `f40851bea631369fc283381e158a8e0eb95413d14ab320c7e7e773c0ecb98e84` |
| app.json | `4f2b9d3876ccbd2332e0b1c2e5cadd7646a2d2e63f7f126dd069049a303073d8` |
| eas.json | `8964d8f8aa6ecdf34b6ed01683c2cf88b5fa7b0d80db16c9a9bdbc9e6e8153c0` |
| metro.config.js | `125af6c4ee15a27739bd4b982253d1859f7663f850f9795d3f7738ff1a243185` |

追加確認した `metro/withNativeThree.js` は `8271006e52212447643256b750de9baa859e403c4f185220691a75a564db52ee`、`.nvmrc` は `68ca3fba3b7e864770cb61aeb306d4bd4354b68ab4dd38450860c5d823e42a53`。両者も開始commitと同じ内容。診断revisionは `goal-004-drag-first-r1`。

作業中にroot所有644の既存sourceで書込PermissionErrorを再現した。所有権の広範な修復はせず、担当ファイルだけをWSL rootで書き換えた。npm/Gitにはsudoを使っていない。push/merge/PR/EAS buildは行っていない。最終commitとworktree状態は作業完了報告に記録する。
