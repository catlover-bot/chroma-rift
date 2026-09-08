# Goal 010 — ステージ選択と「影の映写室」

2026-09-09。既存の CHROMA RIFT に、ステージ選択・再開と装置への入りやすさを改善し、独立した第三章「影の映写室」を追加した。ゲーム内の操作と脱出、保存、数値、描画を検査する。iPhone上の見え方、錯視、怖さ、実音、実FPSを検証済みとはしない。

## 開始点と環境

開始HEADは `04e481e41e0dc8ab73589e9283a110f6985157fb`、開始時は `feat/goal-009-uncanny-vault` のcleanな作業ツリー。祖先判定を確認し、そこから `feat/goal-010-shadow-theatre` を作成した。Goal005の `aa8ff20` と原本照合 `7be6d39` も履歴に残る。原キットを取り違えたり再実装品を原本と扱う作業は行わない。

実環境はNode24.20.0 / npm11.19.0 / Expo57.0.20 / RN0.86.3 / Three0.185.1 / R3F9.7.0 / React19.2.3 / TypeScript6.0.3。package.jsonのExpo指定範囲は `^57.0.1` だが、今回読み取った実インストール・lock値は57.0.20。過去文書の範囲表示と混同しない。

開始時の `npm run check` は75 suites / 887 tests PASS、117.975秒、iOS export 1,513 modules。Doctorは開始時から20/21、Expo依存確認も57.0.21へのパッチ推奨でexit1だった。依頼に従いこの更新を取り込まず、検査の除外設定も加えない。

package.json / package-lock.json / app.json / eas.json / metro.config.js / metro/withNativeThree.js のSHA-256を開始時に記録し、変更後も6件一致を確認した。[保護ファイルと検証記録](qa-goal010/verification.json)に実値を保存する。新しいnative依存、署名、アカウント、backendは追加しない。

## 遊べる内容と進行

- 番号付きの01「閉館後の展示室」、02「測れない収蔵庫」、03「影の映写室」を選ぶ。旧「帰り道のない入口」は独立した以前の章として残す。
- 「続きから」は実際のnative描画準備が完了した入場・再開の順序から選ぶ。プレビュー、確認の取消、未ready、旧callback、未知セーブの試遊を順序へ加えない。
- 現在のrunと、過去の脱出・明示的な発見を別に保存する。再プレイは確認後にその章のrunだけを作り直し、履歴は保持する。履歴保存に失敗する時は唯一の達成証拠を消さない。
- galleryの結果からvaultへ、vaultからtheatreへ進める。再調整や以前の必須問題の解き直しを要求しない。
- 新章は灯りを動かして2窓へ光を届け、明示的に固定すると進める。任意の歪んだ部屋と保守通路、任意の映写機の囮を使い、制御室で防火幕を下ろしてから実出口まで歩く。
- 怖さ・音・見え方・左右手/ドラッグ/簡単操作/感度は入場前とpauseから利用する。実際に歩く・見回す操作を終えた常設チュートリアル表示を畳み、pauseの操作説明を残す。

影の物理投影、Ames型の歪んだ部屋、普通の敵/囮の仕組みは [ILLUSION-EVIDENCE](ILLUSION-EVIDENCE.md) で区別する。攻略なしの案内と明示した攻略は [SHADOW-THEATRE](SHADOW-THEATRE.md)。

## 既存装置の入口 — 原因と修正

指定の原動画を既知のDownloadsから読み、17枚の抽出フレームを実閲覧した。約402.527秒の動画を初見所要時間や実FPSとは呼ばない。全編の連続再生・実聴は行っていない。個人動画はGitや外部に送らない。

旧実装では、板の一部に照準が合うとボタンを有効に見せ、押した後に別の全体可視判定で拒否していた。実Sceneと実Screenを同じ48条件で比較し、有効ボタンからの拒否を8件再現した。修正後は0件。ボタンと許可判定が同じ現カメラの `ready / tooNear / tooFar / offscreenLeft・Right・Top・Bottom / occluded / busy` を使い、その理由だけを案内する。

距離・全体と取っ手の可視・壁の遮蔽・細い遮蔽物を含む視錐体チェックは維持する。vaultの長さ装置は既存の奥行きに合わせ到達距離4.9→6.0mへ広げ、板の寸法、棒の真値、保存値、カメラを変えない。支持床内の1.2×0.6m、3画面幅・81姿勢で受理できることを確認した。床に観察範囲、棚に異なる端面、壁に背の高い枠、床の分岐に区切りを追加した。旧経路・扉・パズル条件は変えない。

新章の灯りでは、小画面の斜めのレール端で操作範囲が26.56ptまで縮むことを実投影で確認した。表示中の本物の取っ手を中心に44 logical ptの取得範囲を設け、480ケースで22pt以内240件を受理、23ptの240件を拒否した。掴んだ位置からの差分を維持し、開始時に灯りやクランクが跳ばない。輪郭、光源の軌道、窓、正解の調整ではない。

この変更によるvaultの描画最大値は100→103 calls、4,804→5,032 triangles。カメラ自動移動や新しい照準補助は導入していない。これらは同条件Software WebGLの比較で、iPhone FPSの測定ではない。

## 構造・保存・操作

主な追加は `src/domain/theatre/` の純粋な光学/進行/敵/保存処理、`TheatreScene`、`theatreResources`、`theatreController`、`TheatreManipulation`。既存のworld/controller/Canvasとtyped dispatcherへ統合し、別ゲームや別rendererは作らない。実敵は既存の身体移動・眼・足接地を再利用する。

新章キーは `chroma-rift.shadow-theatre.v1`、履歴は `chroma-rift.stage-journal.v1`。既存の直列writer、session lease、reset世代、backup、未知原文の読み取り専用試遊を使用する。保存するのは確定したレール値、解放・点検・通路・発見・提示・安全地点・幕・脱出。ドラッグ途中、ポインター、敵のlive時計、音やGPUは保存しない。保存失敗時も進行とseedをメモリに保つ。

幕はメモリ上で受理を即確定し、非同期保存を要求する。閉鎖アニメーションの途中でcold起動した場合は安全な制御室と閉じた幕を復元し、未達の脱出は与えない。同一sessionのpauseは敵の記憶を消さず、正規の停止・再開とする。

映写機は実取っ手を回して指を離すと有限の稼働を開始し、物理位置からゲーム内の音を出す。音量ゼロでも聴覚信号は残る。有効な視覚を優先し、プレイヤーの未知の位置へ敵を向けない。操作中は探索入力を所有するが敵の時間は進める。初回の作業bay、映写機bay、保守路、制御室は実際の戸・狭口で敵の身体が通れない。Ames歩廊は支持床であり無敵領域ではない。

## レビューで修正した不足

1. 装置の表示と実取得の不一致を同じ理由付き判定へ統合。
2. Ames前面/側面を塞いでいた壁を実開口へ分割し、側面の実描画で両展示物と歪みが見える歩廊内の視点を選び直した。
3. 点検時の保守取っ手は実カバーの移動で露出させ、操作対象だけを突然有効にする見せ方を避けた。
4. Ames歩廊に広くかかっていた攻撃無効範囲を除去し、通常の観察・追跡・接触が成立する回帰を追加。
5. 通常の簡単操作の歩行/方向入力で、受理済みの幕の効果音予約を消していた処理を修正。通常操作では成功した閉幕提示後に1回、pauseでは取消、という検査を追加。
6. 入場履歴の旧callback、確認取消後のcallback、保存leaseを残すHome復帰後のcallbackを拒否。履歴と現在runの意味を分離。
7. 発見メモの部屋の2D投影に、同じ観察点のpitchを反映。正面・途中・側面の両propを独立Threeカメラと照合し、実Sceneの部屋・物体は固定したまま図の整合を修正。

## 試験と描画証拠

既存試験の変更は新しい章選択/再プレイ確認のUI経路と、full resetに新章・履歴のキーを加えた期待値に限る。旧ゲーム、衝突、視線、保存、fresh pressのassertは弱めていない。開始時の887件に新しい境界検査を加え、歩廊の実危険、幕の効果音、メモの全観察点の投影一致も含む最終結果を以下に記録する。

| 検査 | 最終結果 |
| --- | --- |
| lint / typecheck / test / iOS export / check | 全PASS。87 suites / 987 tests、149.468秒。iOSは1,534 modules、index-eb68a210c9f3d70843da54c701c3634b.hbc。検査開始/終了で259 source SHA一致 |
| Doctor | 20/21。Expo57.0.20に対する57.0.21パッチ推奨のみ。exit1をPASSと表示しない |
| Expo依存チェック | 同じパッチ推奨でexit1。更新・除外指定なし |
| npm ls --depth=0 | PASS |
| 開発/本番の実Metro Three | 両exportと実factory検査PASS。Threeはthree.cjs一つ、開発23 import edges / module1551、本番21 / module1426。同じclass identity。各構成のApp/index/src全164 sourceをsource mapの内容とbyte照合、不一致・重複0 |
| 音/素材 | 既存2音生成scriptの--check PASS。既存assetsとTHIRD_PARTY_NOTICESは開始HEADとbyte同一。外部素材の追加なし |
| 保護6ファイル / diff | 開始SHAと最終値が全6件一致。git diff --check PASS。履歴の巻き戻しなし |

純domainだけでなく実controllerで8経路を実行した。必須の灯り、任意展示の有無、囮の有無、standard/subdued、誤位置、取消、自然な敵のnotice→pursue→windup→attack→捕捉と安全地点からの再挑戦、再プレイを含む。同じ実到達状態から分岐する囮対照では、操作なしは巡回を継続、操作ありは実映写機位置を調査した。これを人のプレイテストとは呼ばない。

新章の実native R3F境界を10回mount/unmountし、1renderer、同じThree、全資源の破棄を検査。幕の描画/衝突の下降位置、クリアの分離、失敗したrender/presentationからの出口到達・保存候補の巻き戻しを検査した。

[描画QA](qa-goal010/README.md)に、章選択、P0前後、操作付き灯り映像、部屋の正面/途中/側面/点検、敵と囮の対照、幕と実出口、代表通し経路を置く。実閲覧済みと生成のみを区別する。生の全frame・全runtime JSONは.expo内に置き、Gitには必要な原作QA映像・画像と小さい測定記録だけを含める。

## 実機への引継ぎと残項目

診断revisionは `goal-010-theatre-r1`。保護6ファイルとnative依存を変更していないため、既存expo-gl/audio対応Development Buildを意図した実行環境とする。ただし手元のインストール済みバイナリ自体は検査していない。JS exportはIPA・native build・端末表示の確認ではない。

ユーザーがMetroを止めた後に実行するコマンド:

```bash
cd /home/mhirotaka/workspace/chroma-rift
npx expo start --dev-client --tunnel --clear
```

この作業からtunnel、push、PR、EAS build、認証、署名登録、アップロードは行わない。ネットワーク/tunnelの失敗をゲーム本体の失敗と混同せず、保存を消して直そうとしない。

残る実機確認は [IPHONE_VALIDATION](IPHONE_VALIDATION.md)。画面の読みやすさ、2本指、VoiceOver、大きな文字、音なし、操作と恐怖の快適さ、錯視の見え方、実音、FPS/フレーム時間分布・熱を、実際の端末で別々に記録する。6–10分は初見向けの設計目標で未測定。
