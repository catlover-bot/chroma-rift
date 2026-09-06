# Goal 008 — 疑う・確かめる・逃げる

実装と最終検証の記録。新しい必須課題は配線1個。既存B/Cを両順で解き、任意の仮面・掲示を調べ、一体の展示体から棚陰へ退避し、安全な敷居で「扉を閉める」までつないだ。削除済みA/Dは復活させず、旧章は保持した。物理iPhone・人の知覚・恐怖・音の実聴は未実施。

## 出発点と履歴

- worktree: `/home/mhirotaka/workspace/chroma-rift`
- baseline HEAD: `8ca5ba3456c7f54284981e9cae1b0d5a8848b21d`、開始時clean。
- 開始branch `feat/goal-007-clear-horror-redesign` から `feat/goal-008-perceptual-horror` を作成。期待HEADと `aa8ff20` を含む履歴を保持。
- Node 24.20.0 / npm 11.19.0。baseline `npm run check`: lint/typecheck/**56 suites・674 tests（57.546秒）**/iOS export PASS。baseline Doctor **21/21 PASS**。
- package.json / package-lock.json / app.json / eas.json / metro.config.js / metro/withNativeThree.js の開始SHAを保存。最終SHAも同一。native/依存/SDK設定は変更していない。
- 実装は本書を追加する新しいローカルcommit。完全IDと最終clean状態は終了報告に記す。amend/reset/clean/stash、push/PR/EAS build/auth/署名/外部uploadは行っていない。

## 動画の実確認範囲

`C:/Users/m.hirotaka/Downloads/ScreenRecording_09-07-2026 01-59-49_1.mp4` を実際に読めた。ffprobeで162.063333秒・1170×2532・HEVC/AACを確認し、20秒間隔の一覧画像と28/117/123秒の個別フレームを開いた。全編の連続視聴、音の実聴、FPS測定ではない。壁/床の均一な面と格子越しの単純な頭/四肢を確認したが、怖くない理由をこれだけで確定していない。元動画はcommit・転載・uploadしていない。SHAと一時抽出は `.expo/goal008/video/`。

## 完成した流れと実装順

A: baselineと資料を確認。B: 独立した仮面の正面/左右/側面/凹凸対照とハイブリッド近中遠の**13実WebGL画像＋5生成画像**を実際に開き、3素材テストを通してから本編統合へ進んだ。C: 同一plateの配線domainとdrag・明示解放・移行を結び、既存B/Cと旧章の7 suites/131 testsを通過。D: 一体の連続横切り・実身体衝突・捜索・棚陰を実controller経路で検査。E: 発見メモ7項目、音、credits、保存、VoiceOver意味操作を接続。F: 本編WebGL/HUDを比較し、下記の具体的な表示不整合を修正した。

仮面は実際に凹んだ固定meshで、横移動してもworld matrix/頂点/法線を変えない。窓だけが開き、側面へ普通に歩ける。掲示は独自のLP/HPを合成した一枚のtextureとUVを継続使用する。配線は `m=tan(40°), b=-.1m, abs(offset)<=.028m`、線の上下操作だけがoffsetを変え、カバーは横へ動くだけ。補助・比較・見え方への回答だけで解放しない。[不変量と証拠](ILLUSION-EVIDENCE.md)。

展示体は静止仮面とは別ID/transform。外装、非対称の肩/腕、顔、後頭部、関節と接地する足を作り、local −Zを見た目・LOS・移動で共有。初回電源後の帰路で一回の横切りと停止、配線後の2.75秒以上の予告、巡回→気づき→追跡→lastSeen捜索→巡回をつないだ。実棚の遮蔽と身体boundsを使い、作業ベイへ侵入しない。接触は進行を保持して最後の認可安全地点へ戻す。終幕は安全域の明示閉扉で衝突/cleared/AI停止を同時に確定し、0.6秒の余韻中も捕まらない。[全経路と数値](HORROR-PACING.md)。

発見メモは7項目の短い説明と操作可能な比較を持つ。本編をpauseし、2D比較または同じCanvasの比較sceneを使う。仮面メモは測定した表示窓に比較カメラを合わせ、本編のcameraと形状は変えない。未発見項目はプレイ中に出さず、クリア後は敵なしで同じ比較を使えるが本編の発見には加算しない。

音は旧4 WAVに加えてcloth .42秒、door-impact .5秒、Shepard風12秒を自作。固定10player pool、Shepardは非loop、mute/控えめ/演出音offでは鳴らず、音なしで全経路を通せる。RMS/peak/DC/clippingと非同期seek/再生失敗を検査した。発見記録は現在sessionのnative play要求が正常に戻った時だけで、実際に聴いた/錯覚した記録ではない。

## 保存と互換性

同じlogical galleryのschema/levelをv3にした。v2/v1のB/C、獲得物、接続、控えめ設定、旧クリアを残し、旧接続済み/終盤/clearedの配線は互換開通する。通常の新規開始は配線未解決。互換開通と新発見を分け、結果画面でも未体験配線を体験したと表示しない。危険な旧位置は認可安全checkpointへ復元する。旧raw backup、未知schema/破損の原文保護、直列writer/lease/reset generationを維持し、リセット後の古い書込復活を防ぐ。AI時刻/touch/audio/GPUは保存しない。

## 使用素材と資料の区別

実際の第三者素材は **Wael Tsar / cmglee, Hollow face illusion.stl, CC BY 4.0**。原本125,984 bytes、SHA `3ab98617f246ff0b3616cec9656aecdcd670ce43e8c96d66a7e1acaa8a8a5a75`。proper rotation、正の一様scale、中心調整、weld/index化、法線再計算をしてnormalized JSONへ変換。静止凹面には深度反転を使わず、別の展示体の顔だけ凸面へ加工した。アプリ内credits、NOTICE、原本/加工物の帰属と再利用方針を収録。[出典・11ファイルhash](ILLUSION-SOURCES.md)。

PyllusionはPoggendorffの条件分離を参照し、Python翻訳移植・runtime導入・画像利用はない。Bach、北岡、IllusionVQA、論文、Frictional、Xbox、Expoは資料として参照した。取得できなかった論文本文を引用したことにせず、NC/ND/不明の図版・録音をruntimeへ入れていない。ハイブリッド原画・配線・胴体/布/四肢・新WAVは本作の独自生成。

## 発見した不整合と修正

| 発見 | 修正と反証検査 |
| --- | --- |
| 凸面対照の裏面、外装の法線 | 面向きを修正。FrontSide ray交差・実座標・正面/側面画像で検査 |
| 側面窓と枠の重なり、取手の浮き | frameから離隔し取手を窓に接続。開閉後の画像と同じcollision stateで確認 |
| 展示体の顔/歩行とFSM前方の逆向き | 全てlocal −Zへ統一。876実メッシュ姿勢で衝突半径内/片足接地、yaw0/±π/2の立脚world固定 |
| pauseで装置の所有指を失い再取得できる | pause前にbarrierへ移し、B/C/配線の全指解放と新指だけの再取得、Fabric batch監視を追加 |
| クリア直後にScreenが音ownerを停止して閉扉音が落ちる | 明示閉扉で既存音を即停止し、.6秒の反応中だけready/foregroundの音ownerを維持。実owner＋native backend代替で提示後の閉扉音一回/終了停止/背景復帰時の旧音不再生を検査 |
| ShepardのRMSが初回0.0915、終了音が余韻より長い | Shepard固定RMS0.065へ正規化、終了音を.5秒に短縮。全asset再生成/hash検査 |
| seek受理だけで音の発見が立つ | 正常play要求後のcallbackで登録。遅延/失敗/停止/旧owner/sessionで発見しない |
| 旧配線の互換開通を体験済みと結果表示 | discoveryとcompatibleBypassに従い文言を修正。旧接続から新終幕の回帰を追加 |
| メモの顎が説明欄に隠れる | SafeArea内の実窓rectへカメラfit/投影中心を調整。全頂点×21角度×2窓×3画面と実WebGL/HUDで窓内を検査 |
| 直進で敷居へ入ると閉扉HUDが更新されず、安全地点だけの変更も未保存 | objective/閉扉可否/認可安全地点をsnapshot keyへ含め、保存identityにも安全地点を追加。方向転換なしの実native連続移動で提示とidle時の更新抑制を検査 |
| 最終安全域へ到達後の接触と保存再開が異なる地点へ戻る | 最後の認可安全地点に統一。明示閉扉前のcleared=falseを維持して回帰確認 |

既存テスト変更の理由は仕様に対応するものに限った。v3/key追加、新crossing bit=false、冒頭の説明字幕撤去と実横切り提示、旧自動脱出→明示閉扉、新しい身体collisionを避ける通行経路、固定SERVICE復帰→最後の安全地点、音pool7→10を更新した。色比較は新chromatic発見bitだけを明示した期待値へ追加し、他の全progress/actor/camera/worldの同一性を保持した。geometry/LOS/同一値/保存/全指解放のassertを維持し、fixtureの安全保存poseと操作前live poseの比較対象を区別した。角度π/−πは同じ向きなので位置/pitchを厳密に、yawを正規化差で検査した。

## 要求20項目の確認先

| 要求 | 検査と証拠 |
| --- | --- |
| 1–4: 仮面/ハイブリッド不変・座標・再現 | perceptualResources / notebookCamera tests、materials QA、gallery/perceptual-invariants.json、生成全hash |
| 5–7: 配線独立・表示一致・exact-once/旧進行 | wiring.test.ts、galleryController.test.ts、galleryV3Migration.test.ts、実WebGL端点比較 |
| 8–9: 順不同・設定・任意観察・見逃し | galleryRouteController.test.tsの実6経路、domain旧章/B/C両順。AI/衝突をmockしない |
| 10–11: 壁/閉扉/ベイ/捜索/独立個体 | actor.test.ts、同じ6経路内のnoticed→approach→棚LOS→lastSeen固定search→patrol、876姿勢のbounds |
| 12–13: 中断/失敗・最後の閉扉 | actorController / nativeCanvasLifecycle tests。失敗した移動/story/安全地点をrollback、終了音は提示成功後一回 |
| 14–16: メモ復帰・新旧発見・UI/意味操作 | nativeメモ10回/一renderer、discoveryNotebook / galleryManipulationScreen / journeyFlow / migration tests、320/390/430・font2 HUD |
| 17–18: 比較と敵の独立・音 | 既存比較回帰、2D同値検査、audio owner/asset tests。遅延/失敗/音量設定/中断/dispose |
| 19: 権利 | ILLUSION-SOURCES / THIRD_PARTY_NOTICES、11実ファイルhash照合、原理参照と素材の区分 |
| 20: Three/native再入場/GL failure | dev/prod実Metro factory評価、native10再入場とGL失敗検査、browser10資源cycleを別記 |

## 最終コマンドと資源

| 検証 | 最終結果 |
| --- | --- |
| npm run check（lint / typecheck / test / export:ios） | **PASS、64 suites / 782 tests、89.848秒**。baselineは56 / 674。iOS Hermes export 1,491 modules / 10 assets成功（IPAではない） |
| Doctor / 依存 | **21/21 PASS** / `npx expo install --check`: up to date |
| Three同一性 | 開発18経路・本番16経路の実Metro factoryを評価し、双方 `three/build/three.cjs` の同じclass identity |
| 原本core | 展開先42 files、原test28、900条件、旧preview90assert PASS。単体kit全suiteとは別 |
| 素材/音 | 素材8hash再現、台帳11hash、音3hash一致、旧4WAV不変。音の実聴なし |
| 設定/履歴/diff | 保護6file SHA同一、aa8ff20とbaselineを祖先に保持、diff check PASS |
| 統合WebGL | **90視点・元77file現行一致・撮影中変更0**、最大**132 calls / 9,794 triangles**（目標150 / 100k）。旧Goal007集計は61視点・53 / 2,400で、同一frameの性能比較ではない |
| 資源 | CPU所有texture4枚、base **3,407,872 bytes** / mip込み推計 **3,757,396 bytes**、実WebGL同時最大3枚。hybrid描画10回は毎回texture1以上→geometry/texture0、renderer1。native GL代替の10再入場・メモ10回でも所有と破棄PASS |
| 展示体 | 876姿勢の最大半径 **0.425340m < 0.44m**、片足以上接地、実移動に対する立脚world固定PASS |

ログは `.expo/goal008/`、永続集計は [verification.json](qa-goal008/verification.json)。checkはlint/typecheck/test/iOS exportを順に実行するため、それらの実行を兼ねる。途中のlint global宣言漏れとテストのoptional型代入は修正後に再実行した。既存Three.Clock非推奨などの非関連警告を隠したり依存更新で消したりしていない。

原キットは `/home/mhirotaka/workspace/chroma-rift-reference/chroma-rift-goal-005` を読み、manifestの42ファイルを再照合。別tmpへcompileして原本testのうちcore28件を文字列変更なしでアプリcoreへ実行しPASS、900条件の刺激/coverage/RGBA/answerと旧preview90assert一致。当Goalでは展開先を検証し、元ZIPは指定位置に存在しなかったため再ハッシュしていない（過去のZIP照合記録は保持）。これはcore対応監査で、原キット単体の全テスト結果やアプリ全テストと合算しない。過去の [Goal005原本対応記録](GOAL-005-KIT-VERIFICATION.md) を保持し、原キットは変更していない。

[統合画像と閲覧記録](qa-goal008/README.md)は、同じcameraの旧/新展示体、凹面/側面窓、配線4状態、掲示近中遠、棚/最終扉、全7メモ、320/390/430級・文字拡大を含む。Software WebGLのdraw calls/triangles、CPU資源所有、native mockを分け、予算内をFPSの証明としない。

## 残る実機確認と起動

必須実装の未実装項目はない。iPhoneでの実表示/指操作/VoiceOver音声、錯視の成立と強さ、初見の理解/怖さ、実聴/音量/快適さ、FPS/熱/GPU残存はpending。小画面＋大きい文字のメモでは仮面が小さくなるため、顔の読み取りや操作のしやすさも実機で確認する。[全セーブを消さずに試す最初の5分](IPHONE_VALIDATION.md)。公開品質・医学的安全性・App Store審査を保証する報告ではない。

JS/TSと既存対応assetsのみを変更し、保護6ファイル・native依存が同じなので、expo-gl/expo-audioを含む既存development buildのnative再ビルドは不要。

```sh
cd /home/mhirotaka/workspace/chroma-rift
npx expo start --dev-client --tunnel --clear
```
