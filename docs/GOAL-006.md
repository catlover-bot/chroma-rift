# Goal 006 — 不確かな展示室

## 実装した範囲

基準は `7be6d390ffeeca822dc501c8c395e5e9f3d3d9c6`、開始時の作業ツリーは clean。基準HEADと親 `aa8ff20` を保持して `feat/goal-006-perception-gallery` を作成した。作業場所は `/home/mhirotaka/workspace/chroma-rift`、WSL Ubuntu 24.04、Node 24.20.0 / npm 11.19.0。Goal005の照合済みコアを再利用し、新しいキットを前提にしていない。

ホームの「新しい展示室を始める」から独立章 `perception-gallery-v1` に入る。初回3問調整、A→中央回廊→B/C任意順→D→短い帰路→変わった入口→最後の扉を開く→外へ歩いて完了、保存・再開まで接続した。旧章の「旧章の続きから」は元の条件で完走できる。8〜12分は未測定の設計目標で、待機や時間制限を設けていない。

攻略・ヒント・save/gate/variantの定義は [PERCEPTION-GALLERY](PERCEPTION-GALLERY.md)、描画証拠と知覚の区別は [ILLUSION-EVIDENCE](ILLUSION-EVIDENCE.md)。今回の提供録画そのものは取得・視聴していない。依頼文の時刻付き観察を設計入力にした。

## 主な変更

| 領域 | 実装 |
| --- | --- |
| A | 照合済み刺激を維持。眼高1.6mの観察位置、板と形のスイッチ、押下、かんぬき、扉を調整。色比較で形・切れ目・正解・カメラは変わらない。 |
| B | 自作の同時対比文脈。6 authored variantsのうち保存seedで選ぶ。同じopaque grayの別々の二枚を自分でソケットへ置いて明示commit。source→比較台でも色は不変。 |
| C | 各頂点から重心へのatan2を使う60°欠け円盤。表示角と判定角を共有。中央は通常一様な背景、任意の破線だけが輪郭ガイド。 |
| D / 帰路 | 実camera行列の投影・frustum・遮蔽・位置条件を再利用。線幅、外枠の接近ノッチ、ラッチを追加。同じworld variantから描画・衝突・全変更領域の遮蔽証明を構成。 |
| 直接操作 | 既存Canvas/cameraを維持してB/Cへ入る。全装置が視野内・届く距離・遮蔽なしを検査。logical point→ray-plane、単一pointer、持ち直し、外drop/cancel復元、モード遷移で旧入力破棄。 |
| 保存 | 新旧の独立キーと章単位reset。新規seedは開始境界で選んで保存。未知版・破損はread-only、一度だけbackup、queue generation/leaseを維持。 |
| 建築 | 非対称の双柱と欠けた枠を入口と帰路で共有。B格子棚、C明るい壁、D縦枠、hub四印。静的geometryを共有・instance化し、動的shadow/postprocessは追加しない。 |
| アクセシビリティ | VoiceOverと明示した簡単操作は同じdomainへの意味付き操作。B同一性の観察説明、Cadjustable±5°、独立commit。Reduce Motion/文字拡大だけではdragを奪わない。 |

Bは見本を0.42m、共有hit slopを0.06mにし、320×568の実Three投影で44logicalpt以上の非重複取得領域を確認した。Bのgrab offset、C中心deadzoneから出た際の基準更新、古い画面callbackの無効化、兄弟HUDボタンを含むFabric changedTouchesの所属判定を検査した。比較・ガイドは手動操作のみ、B/Cは章内共通1000ms制限。自動点滅、camera shake、強制視点移動はない。

装置の全可視判定は中心と四隅のfrustum確認に加え、眼からパネル全体への角錐とopaque world AABBの分離軸判定を使う。サンプル点を外す細い遮蔽物も操作開始を拒否する。個々のtouch交点でも遮蔽を再検査する。

## 音とnative差分

唯一の追加packageは `expo-audio ~57.0.4`（解決版57.0.4）。Expo/RN/React/Skia/Three/R3F/Reanimated等の既存版は維持した。`app.json` の追加はexpo-audio pluginの4項目をfalseにしたものだけで、Bundle ID、projectId、orientation、暗号化申告などは基準と同じ。

足音、操作音、解錠/扉、環境音の自作4 WAVを固定7 player poolで再利用する。足音は衝突解決後の実移動距離を、描画・presentationが成功したframeの後に渡す。session/sequenceで一度だけ発音し、mute/pause/background/GL failure/退出で停止。古いseek完了・遅延音を再生しない。設定はmaster/environment/effects別、silent switchを尊重する。音源・検査値は [ASSET-PROVENANCE](ASSET-PROVENANCE.md)。

インストール版が公開する `requireOptionalNativeModule('ExpoAudio')` で確認してからaudio実装を読む。moduleのない旧Development Buildはimport時に落とさず、設定で更新を案内して無音で継続する。**新しいnative音声を使う実機確認には新Development Buildが必要。Reloadだけでは追加できない。** EAS build/認証/uploadはユーザーが行う。

`npx expo config --type introspect --json` でiOS microphone description/background audio、Android RECORD_AUDIO/audio foreground permissions/playback・recording serviceがないことを確認した。

## 検証

開始時に既存 **42 suites / 507 tests PASS** を実行確認（26.910s）。追加テストはdomain、実controller両順走破、ray-plane座標、実UI touch/VoiceOver、保存競合、新規seed、audio所有、実R3F native境界と再入場を対象にした。

| 実行 | 最終結果 |
| --- | --- |
| npm run lint | PASS |
| npm run typecheck | PASS |
| npm run test | 51 suites / 604 tests PASS（基準から97件追加、36.206s） |
| npm run export:ios | PASS、Hermes bundle 5.3MB、4 WAVを収録 |
| npm run check | lint → typecheck → test → iOS export、全段階PASS |
| npm run doctor | 21/21 PASS |
| npx expo install --check | Dependencies are up to date |
| dev / prod Metro出力のinspect-three-bundle | 両方PASS。各1個のthree/build/three.cjs、sameClassIdentity=true。アプリ/R3Fの依存辺はdev12 / prod10。 |
| expo config introspect / native差分JSON比較 | PASS、既存app設定保持、追加依存はexpo-audioのみ、録音/背景audio無効 |
| node scripts/generate-audio.cjs --check | PASS、4音のSHA/形式/長さ/clipping/DC再現 |
| 既存core900条件の比較手法 | PASS。既知の参照先を読み、900条件の構造/coverage/RGBA/texture行、15 preview goldensを照合。アプリコアに原テスト28件も成功。 |
| 実画像QA | 35 PNGを閲覧、19実WebGL視点、RGBA/中央背景検査PASS |
| git diff --check / --cached --check | PASS |

コマンドのローカル出力は git 対象外の `.expo/goal006/`、長期記録は [verification.json](qa-goal006/verification.json)。dev/prodは `expo export --platform ios --dev --no-bytecode --source-maps` と同じコマンドから `--dev` を除いた出力を、既存 `scripts/inspect-three-bundle.cjs ... --expect-single` で実評価した。診断revisionは `goal-006-gallery-r1`。

Aの追加確認は既知の `/home/mhirotaka/workspace/chroma-rift-reference/chroma-rift-goal-005` を読んだ既存比較スクリプトの再実行。原本は変更せず、生成物はOS一時ディレクトリ。Goal006の新しい必須キットを探してはいない。原キット単体の過去結果は [Goal005原本照合記録](GOAL-005-KIT-VERIFICATION.md)に保持し、今回のアプリコア/統合結果と区別する。

中間検査ではUIの旧文言/比較常設の期待差分に加え、章描画wrapperがlive runtimeをrender中に読んで旧frame例外転送を外す問題を検出した。選択をimmutable progressへ変更し、元の例外転送テストをそのまま通した。最終checkは上記すべて合格。

既存検査の更新理由:
- ホームの主動線名と新章の入場名を更新。旧章走破・未知版保護のテストは旧章を明示選択してから元の検査を継続。
- 使えない比較ボタンを常設しない仕様に合わせ、spawnで非表示、対象へ近づいて照準を合わせると表示・操作できることを検査。
- 章resetの対象を示す文言、全データresetの新章/backupキー追加を反映。
- 不具合を隠すassert削除、既存実controller走破のmock置換、許容値の拡大はしていない。C保存角の丸め差はcanonical角を維持する実装修正で解消した。

実R3F native Canvas/Provider/reconciler/useFrame/Three geometryを使う検査では、端末GL/rendererだけを代替している。B/C操作・色比較・補助・pause・HUD・音設定によるrenderer/camera再生成を検査し、10回の新章再入場でroot/ownerとscene resourceの破棄を確認した。これは実機GPU検査ではない。

## 画像QAと性能の範囲

[QA記録と35画像](qa-goal006/README.md)を参照。19枚は本編の実mesh/materialをブラウザーのThree WebGLで描画、16枚は共通domainデータのソフトウェアラスタ。すべて画像として開いた。HUD、実指操作、Expo GLのiPhoneフレームのスクリーンショットではない。

画像でA印の台座への埋没、入口ランドマークの視野外配置、C内側に残る補助リング、開扉後の浮く取っ手を発見して修正し、再撮影で確認した。

性能数値はLinux Chromium/ANGLE SwiftShaderの静止WebGL測定。19視点の最大77 draw calls / 3,066 triangles、browser例外0。暫定予算150 draw calls/100k trianglesと比較した値はQA記録にある。1 rendererで10回load/render/disposeしてgeometry/textureが毎回0へ戻った。CPU抽出所有検査とnative R3F境界の所有検査も別々に記録している。iPhone FPS、発熱、GPUメモリ、実機10回再入場の保証には使わない。

## 実機で残る項目

[IPHONE_VALIDATION](IPHONE_VALIDATION.md)に最短の通し手順を記載した。iPhone実表示、色彩立体視・明暗対比・主観的輪郭の知覚、実聴・触覚、native multi-touch/VoiceOver、発熱/FPS、初見8〜12分の目標と面白さは未確認。音がない旧Buildでの実起動も実機では未確認で、module欠如境界を自動検査した。

## コミット構成

1. `ef4ae85db7bb495a8ed7e460f27e717f65d2257f` — `feat: add the playable perception gallery chapter and audio`。新章・操作・保存・音・描画・生成script・全回帰テスト。
2. 本文書を含む後続コミット — `docs: record Goal 006 verification and device acceptance steps`。検証集計、35画像、知覚の限界、素材出自、実機手順。

基準 `7be6d39` と `aa8ff20` はancestorのまま。amend/reset/clean/履歴巻戻しをせず、push、PR、EAS build、認証操作を行っていない。
