# Goal 007 — 閉館後の展示室

開始HEAD: `922db3d4404c68eeb61b2f0278f43b21da015744`。作業場所: `/home/mhirotaka/workspace/chroma-rift`、ブランチ: `feat/goal-007-clear-horror-redesign`。開始時はclean。過去の `ef4ae85`、`7be6d39`、`aa8ff20`、`1fffa6f` を保持した。

提供本文の動画観察メモを実装根拠とした。録画ファイルを再生して原因を特定したとは扱わない。末尾のホラー要望は本文の指定どおり「ホラーを強めたい」と解釈した。

## 修正した体験

同じlogical gallery `perception-gallery-v1` を levelVersion 2 へ改訂。ホームの主導線は「閉館後の展示室」、旧章「帰り道のない入口」は独立して再プレイと記録を保持。第三の類似章は追加していない。

最初は「出口を探す」。非常灯の大きい面を調べるとレバーと床灯が変わり、出口盤の確認で「予備電源を探す 0/2」になる。B/Cは順不同で、解決→引き出し→明示「電源を取る」→出口盤で2個を原子的に接続→サービス通路→明示的に非常扉を開き外へ歩く。先にB/Cへ行っても完走でき、非常灯を省略した経路では電源接続が灯りの復旧も行う。

新版worldに旧紋章A、鍵D、旧A/Dゲート、帰路の入口差し替えはない。galleryの `sealA/sealB/variant` は旧保存との互換情報で、解除条件ではない。新規プレイの実controller走破は両seal=false、variant=entranceのままクリアする。新版resultも旧4課題の完了を表示しない。

- B: 「同じ灰色の2枚を、下の四角い枠へ置く」。置き先を四角にし、外につまみ、持ち上げ中/配置候補の外枠表示を追加。0枚/1枚/2枚/不一致/解決後の案内を常設し、別ID2枚かつ指を離した時だけ「比べる」。比較名は「背景をそろえる」。RGB、6配置variant、grab offset、入替/無効drop/cancelを保持。
- C: 「3枚を回して、切れ目を中央へ向ける」。円盤のふちをドラッグ、外側つまみで選択状態を示す。実表示角から0/3〜3/3を計算し、8°許容と保存角の一致、指離しを満たすと「引き出しを開く」。通常中央に三角形の線/面はなく、任意ガイドだけ別group。
- 装置中は全高の同じCanvasを維持し、板と開いた引き出し/電源の実投影範囲より下をスクロール可能な操作欄にする。実画像で発見した「引き出しがHUDに隠れる」不足を修正。枠が灰色へ3.5mm重なる不足も、内縁7.5mmの余白へ修正した。

## P0: 板と裏板

旧Gallery Aの箱前面と刺激面はコード上ほぼ同深度で、実WebGLでも干渉を再現した。共通 `createPanelFixture` / `PanelFixture` は裏板前面を刺激面から20mm後方へ離し、中央を抜いた四本の枠を4mm外へ置く。同じ定義からhit plane、world collision、描画を作る。旧章でも同じ部品を使い、板のworld位置/大きさを保持。

赤/青は一枚の同一平面に残す。depthTest/depthWriteを維持し、renderOrderや全体の深度無効化で覆い隠していない。[Three Material](https://threejs.org/docs/pages/Material.html) の各設定の責務と区別して幾何配置を先に修正した。

[P0の40画像・実world離隔・遮蔽検査](qa-goal007/p0/README.md)。beforeは開始HEADの隔離作業コピー、afterはP0変更を適用したコピーを使用し、歴史QA用Gallery Aと現在の新版を混同しない。旧章は以前から20mmの裏板離隔があり、今回共通定義へ統合。iPhoneの全アーティファクトの唯一の原因や実機解消は未確認。

追加の実画像レビューで、展示番号13の共有fixtureのright軸がupを下向きにしていた点を修正し、赤1/青3を正立させた。C操作中に中央へ残ったHUD照準も非表示へ変更し、探索時は保持。

## 一体の展示体と回避

自作の階層mesh。非対称肩、無表情の顔、長い片腕を持つ同じ個体を、予兆・移動・巡回で共有。新しいライブラリ、外部画像、骨格データは使用しない。

非常灯後に格子の向こうで静止。最初の電源後、身体全体が同じ不透明な壁で隠れる証明が得られるまで出発を保留する。一点の画面外判定は使わない。出発後は同じ個体が実dtで管理通路へ歩き、再び見えても消さない。移動距離と実位置を足音へ送る。

6点の手書き経路、worldと共通の床/壁/扉/棚、距離/向き/LOSによる有限状態制御。初回telegraph 2.75秒、noticed→approach→短いsearch→巡回を持つ。B/Cの実境界へ侵入しない。二つの棚陰で待って抜ける実controller経路を検証し、終点手前の安全域で非常扉を操作できる。永久に出口を塞ぐstandbyにしない。

接触は「通路の手前へ戻された」で安全checkpointへ戻す。B/C/取得/接続を保持し、再捕捉猶予と全指解放の入力障壁を設ける。標準/控えめは独立設定。控えめは追尾・接触復帰を無効化し、姿を消さず通行帯の脇へ歩く。謎/出口条件や点数は変えない。

実meshの回転時外形を測り、可視体積をx/z±0.52 m、y=-0.04〜2.24 mへ補完した。衝突にはプレイヤー半径を流用せず、実水平最大半径0.414408 mを含む敵専用0.44 mを使用。控えめ待機点も棚角と壁を避ける位置へ調整した。

pause/background/機構操作/読み込み/GL不準備では敵を進めない。再開は現在位置を保って猶予を与える。描画失敗時はそのフレームの敵移動と物語進行を戻し、未表示の字幕/音を捨てる。字幕は成功したnative presentation後のsequenceだけをScreenが受け取る。

既存expo-audioの7player poolと4音源を再利用。足音の移動積算はプレイヤーと敵で分け、実距離に達した時だけ同じ有界poolから再生する。距離減衰のみで、3D audio API実装とは呼ばない。pause/mute/機構操作/破棄では移動音と未完seekを停止。音量を恐怖の代用にしない。[Frictional Gamesの設計記事](https://frictionalgames.com/2019-10-9-years-9-lessons-on-horror/) は予期と脅威の配置の参考であり、本作の恐怖を実証する資料ではない。

## 色と保存

序盤に任意の平面展示番号「13」を一つ置く。既存色変換coreで同じmaskをcolor/neutralに変換し、手動「色をほどく」で見比べる。比較でactor、camera、terrain、collision、progressは変化しない。A/Dの形選択を別名で再出題しない。[知覚現象の区別](ILLUSION-EVIDENCE.md) を参照。

新保存キーは `chroma-rift.perception-gallery.v2`、内側gallery schema 2。v1原文のbackup保存成功後にv2を書き、v1と旧章キーを非破壊に保持。旧B/C solved→同電源取得済、旧A→導入済、旧D/帰路→接続済、旧cleared→クリア済。新版の未体験をresultで捏造しない。

保存する敵情報は4個の物語event bitだけ。追跡timer、実時刻、操作中のtouch、音player、rendererは保存しない。装置室/入口/サービス手前/二つの棚陰/既到達の最終安全域/クリア外側の認可checkpointを使う。未知版、破損、未知story値はrawを保護。queue/session lease/reset世代、単調進行、exact-once取得/接続/扉を維持。章再開始はfresh v2を原子的に書き、残ったv1から過去進行が復活しない。

## 実装順とテスト変更

開始基準は51 suites /604 tests PASS。P0を隔離コピーで確認し、B/C両順の実controller完走とdomainの24 tests PASSを得てから敵を追加した。最終経路はstandard/subdued×B→C/C→Bの4通りに加え、非常灯/出口説明を省略した両順2通りを検査し、AIをmockせず実衝突と待機を使う。

旧gallery A/D/入口差し替えを要求した期待値は新版light/power/service経路へ更新。旧章実controller、鍵投影、紋章900条件、two-pointer、GL lifecycleの意味を保持。共通fixture階層へ移した板はlocal position比較をworld position比較へ変更。scene名はshadow-context→shadow-plateへ対応。10回のnative R3F再入場テストは増えた実meshを全回検査するため期限を延長し、回数/資源破棄のassertionを減らしていない（10回を一つのテスト内で実行、期限5秒→30秒）。

主な対応検査:

| 要求 | 実行する検査 |
| --- | --- |
| 新版A/Dなし・導入・両順完走 | gallery.test、galleryRouteController.test |
| B配置/色/drag/明示操作・C角度/通常中央 | galleryController、galleryManipulationScreen、nativeCanvasLifecycle、実WebGL画素/矩形 |
| 電源exact-once・v1各段階・未知版・reset競合 | galleryV2Migration、galleryStorage、journeyFlow、gallery.test |
| 共通板離隔・world遮蔽 | PanelFixture、emblemSurface、P0実WebGL |
| 敵の体積遮蔽/LOS/閉扉/猶予/控えめ/保存 | actor.test、6経路のgalleryRouteController |
| 全指離し・古いcallback・操作復帰 | touchInput、TouchControls、galleryController、Screen |
| 単一renderer/Three/GL失敗と音停止 | nativeCanvasLifecycle、nativeRendererFactory、audio owner/nativeBackend、bundle inspection |
| 正しい新版resultと旧章保持 | galleryMenus、journeyFlow、既存旧章domain/controller |

[domainの検証記録](GOAL-007-DOMAIN-VERIFICATION.md)、[実WebGL/HUD画像](qa-goal007/README.md)、[実機受け入れ手順](IPHONE_VALIDATION.md)。

## コマンド結果

最終検査結果は下表のとおり。ローカル一時ログは `.expo/goal007/`（git対象外）。長期保存する[検証集計JSON](qa-goal007/verification.json)に開始/最終件数・保護ハッシュ・Three同一性・検証境界を記録した。

| コマンド | 結果 |
| --- | --- |
| npm run lint | PASS（単体・最終check内） |
| npm run typecheck | PASS（単体・最終check内） |
| npm run test | 単独670 PASS。追加修正後、最終check内は56 suites /674 tests PASS（61.803秒） |
| npm run export:ios | PASS（単体・最終check内、4音源・iOS Hermes bundle） |
| npm run check | PASS: lint → typecheck → 674 tests → iOS export |
| npm run doctor | PASS: 21/21 |
| npx expo install --check | PASS: Dependencies are up to date |
| development/production inspect-three-bundle | 両方PASS、three/build/three.cjs各1個、sameClassIdentity=true、依存辺14 /12 |
| 音源生成/検査 | node scripts/generate-audio.cjs --check PASS、4 WAV完全一致、clipping 0、変更なし |
| git diff --check / 保護ファイル比較 | PASS、保護6ファイルの開始時SHA-256一致 |

新版の実WebGLは61視点、HUD合成61枚とraw5枚を閲覧。画素55検査、敵18姿勢、10回のbrowser生成・破棄はPASS。P0の40枚も別記録として保持した。撮影元19ファイルと生成122画像のSHA-256も最終ファイルに照合済み。iPhone実機の証拠ではない。

package.json、package-lock.json、app.json、eas.json、metro.config.js、metro/withNativeThree.jsは開始時SHA-256と一致した。依存/SDK/native設定/Bundle ID/EAS ID/暗号化申告/権限の変更はない。既存expo-gl＋expo-audio入りDevelopment Buildの再利用を前提とする。

push、PR、main merge、認証、EAS Build/Submitは行わない。

## 実機の残確認

自動検査とsoftware WebGL、実component由来browser HUD composite、GL境界を代替したnative R3Fテストを区別する。iPhoneのGPU表示、実指drag/44pt、VoiceOver、最初の操作の理解、Bの運び方の理解、C無効理由の理解、回避の気づき、恐怖/錯視の知覚、音/触覚の実聴感、フレーム間隔/発熱、10回再入場の実端末資源は未確認。原本照合や過去Goalの実装合格を、これらの確認済みとしない。
