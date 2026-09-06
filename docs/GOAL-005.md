# Goal 005 — 触れない紋章の統合

## 出発点と保護

作業branchはfeat/goal-003-first-person、開始HEADは1fffa6f59d2c5a0da6eb04115198f626497564aa（Goal004）。remoteのcee78a6へ戻していない。開始時はcleanでユーザーの未commit変更はなかった。Node24.20.0／npm11.19.0を継続。変更前の実行結果は34 suites / 370 tests passed。

以下は開始HEADと最終treeでbyte一致。依存追加／upgrade、native設定変更、認証、push、PR、EAS buildは行っていない。

| ファイル | SHA256 |
| --- | --- |
| package.json | f59b8631c65582efaacc1f841f58408d83803cda124546f98c6c1fe63f841153 |
| package-lock.json | f40851bea631369fc283381e158a8e0eb95413d14ab320c7e7e773c0ecb98e84 |
| app.json | 4f2b9d3876ccbd2332e0b1c2e5cadd7646a2d2e63f7f126dd069049a303073d8 |
| eas.json | 8964d8f8aa6ecdf34b6ed01683c2cf88b5fa7b0d80db16c9a9bdbc9e6e8153c0 |
| metro.config.js | 125af6c4ee15a27739bd4b982253d1859f7663f850f9795d3f7738ff1a243185 |
| metro/withNativeThree.js | 8271006e52212447643256b750de9baa859e403c4f185220691a75a564db52ee |
| .nvmrc | 68ca3fba3b7e864770cb61aeb306d4bd4354b68ab4dd38450860c5d823e42a53 |

## 提供物と残る照合

追補（2026-09-06）: aa8ff20 を保持して原キットを入手し、ZIP・42 ファイルと原 TypeScript / 付属テストを照合した。今回の追加修正、単体と統合の検証結果、実機で残る確認は [GOAL-005-KIT-VERIFICATION.md](GOAL-005-KIT-VERIFICATION.md) に記録する。以下は aa8ff20 作成時点の入手状況と検証範囲の記録。

Goal005指示のREADME.ja.md、DESIGN.ja.md、INTEGRATION.ja.md、SOURCES.md、src/sealのTypeScript原本と付属テストは、attachments・workspace・Downloads・Documents・Desktop・OneDriveの対象検索では見つからなかった。保存先をユーザーへ質問済みで、原本照合は保留。

利用できたDownloads/chroma-rift-emblem-preview.htmlのSHA256は99248b7900457ebe684a0549da0919d5c9f8afb71096122e9cae13110530a9f9。同梱compiled factoriesのcolor、stimulus、puzzle、surfaceOwnerを読み、src/domain/emblemへ型付き移植した。生成器の15条件のcolor／neutral／mask hashは、元previewを隔離VMで計算した値と一致。未入手の付属テストを実行済みとは扱わず、新規の同等動作検査を作った。

主な適応は既存アプリの所有／保存方式、上限付き共有cache、観察の一度だけの記録と短い反応文。別のseal保存writerやHTMLアプリは導入していない。原キット入手後に4文書・TS／付属テストとの照合を行う。

## プレイヤーの変化

旧しるべ→床の輪→床装置を、板を調べる→連続した形の印を押す、へ置換した。旧対象／装置の衝突／色床／導入3番目の指示は撤去。guideExaminedとmarkActivatedは互換用だけで、新しい進行には使わない。

第一室の北右壁center(1.95,1.83,-7.81)に1.65m四方の板、下のy=.64に三つの印。共有emblemFixtureを描画と対象判定が参照し、扉の開口x[-1,1]を塞がない。初期seed21を固定し、PNGで丸の連続とひし形の切れ目を確認した。自然な初見発見時間は実機playtest待ち。

板は片面の実ray-plane交点を使う矩形対象。可視端の距離・遮蔽で判断し、中心が画面外／隠れただけで拒否しない。普通の印の6°取得と鍵の厳密な実投影を分離する。正解印は.035m沈み、wrongは.35秒で戻る。減動時は短い静的な反応。かんぬきと扉は同じdoorAOpenを参照する。

前後色は正解条件にせず、任意の比較・3ヒント・静的輪郭ガイドを提供。VoiceOverには見えて届く物理対象のsemantic actionと観察後の説明。移動・見回しの2案内は実際の移動／旋回で終える。

## 実装の所在

| 場所 | 役割 |
| --- | --- |
| src/domain/emblem | 色、図形、raster、reducer、cache、core所有境界 |
| src/domain/firstPerson | 世界配置、板の照準、sealAの原子的更新、鍵／帰路／出口、checkpoint移行 |
| src/rendering/firstPerson/emblemSurface.ts・resources.ts・ChapterScene.tsx・FirstPersonCanvas.tsx | canonical Three、texture所有、印・かんぬきの反応 |
| src/rendering/firstPerson/runtimeController.ts・screens/FirstPersonScreen.tsx | 現在camera／lifecycle検証、意味コマンド、HUD、読み上げ |
| src/domain/calibration/quickSetup.ts・screens/QuickSetupScreen.tsx・app/state.ts | 3回答、共有刺激spec、旧quick／詳細結果の共存 |
| src/storage/applicationStorage.ts・firstPersonStorage.ts | additive設定、旧原文backup、未知版の保護、reset世代 |

## 寿命・入力・保存

既存JS simulationとR3F frame ownerを継続。比較／hintはmap／意味状態だけを変更し、renderer／contextを追加しない。生成とtexture allocationはframe外のcache更新に限る。実render／native presentation返却後だけreadyにし、初期化期限、診断、原エラー、最大2回の明示retryを保つ。

hostが現在targetを検証してからPlayContextを作る。session IDと単調連番を照合し、停止時に拒否したpacketも再利用不可。終了／retryで旧controllerをretireし、pause/background/failureでinputとqueued lookを止める。左右別pointer、領域外保持、第三pointer操作、Reduce Motion／文字拡大でdrag希望を保つ既存回帰を維持する。

sealAとprogress.emblemは同じruntime更新で確定。旧sealA=trueはreleasedへ移行し、sealB／variant／出口を保つ。旧原文は最初の新保存の前にchapter.pre-emblem.v1へ一度だけbackup。未知emblem版は既存進行を安全に復元するが原文は書き換えない。種・phase・attempts・hint・comparisonの巻戻しを拒否し、assistは変更可能。resetは既存lease／直列queueの世代を継続する。

レビューで修正した境界例：解錠後も比較表示は実際の紋章mapと対応し、panel前以外では無効。idle中のVoiceOver有効化でも対象が現れ、可視対象集合の変化は意味snapshotに反映。紋章を再比較しても、後続の鍵のhint段階は戻さない。

## 自動検証

2026-09-06に以下を実行して通過した。最後の全テストは41 suites / 493 tests（開始34 suites / 370 testsから7 suites / 123 tests増）。元キットの付属テスト数ではなく、このアプリの実行結果。

| 検査 | 結果 |
| --- | --- |
| npm run lint | pass（0 errors / 0 warnings） |
| npm run typecheck | strict pass |
| npm run test | 41 suites / 493 tests pass |
| npm run export:ios | production Hermes JS export、1432 modules、5.1MB |
| npm run check | lint → typecheck → 全test → iOS export pass |
| npm run doctor | 21/21 pass |
| npx expo install --check | Dependencies are up to date |
| dev／production Three identity | 両方single three.cjs、sameClassIdentity=true |
| git diff --check／cached diff check | pass |

Hermes出力はindex-1282bcdd8f344a1240b4566f9bdace4d.hbc。別途--no-bytecode --source-mapsで出したproductionはindex-ba44b486ab4f3bf55913675478787c7a.js（Three module1365）、devはindex-d41d8cd98f00b204e9800998ecf8427e.js（module1490）。いずれもR3F、renderer、resources、emblemSurfaceが同じthree.cjsを参照。既存scripts/inspect-three-bundle.cjs --expect-singleでVector3／Quaternion／Object3D／Meshの同一性を検査した。source mapのcontroller内容も現在ソースと一致することを確認した。

新規core24、矩形30、hostcontroller11、移行15、レンダリング7など、境界別の検査を追加した。既存suiteへの追加caseも含めた増分が123件。新規テストは既存370件の代替ではない。既存Three.Clock deprecation warningは隠していない。

元370件のうち、撤去したguide／floor-device／floor markを前提にするテストは紋章へ更新した。衝突付きの第一室→鍵→小部屋→帰路→出口、鍵投影、遮蔽証明、drag multi-touch、描画／保存寿命の検査は残した。

新規検査：元previewとのbyte比較、6形状／内外variant、量子化上限、行方向、opaque mask／非交差、色／補助で答え不変、one-time観察／解放、stale／inactive操作、hostの実camera照合、quickと壁のspec一致、legacy／malformed／future保存、実R3Fのplate／switch／latch／資源所有。GPU mockはnative見た目の証拠にはしない。

## 実表示と実機手順

PNG刺激を開いて形と切れ目を確認。本編のbrowser/device操作は未実施。実iPhone、色彩立体視、快適さ、FPSは未確認。[ILLUSION-EVIDENCE](ILLUSION-EVIDENCE.md)で色刺激・投影・解錠・人の観察を分けている。

依存とnative設定のhash一致によりexpo-gl入り既存Development Buildを再利用する。native変更時のrebuild条件は[Expo公式手順](https://docs.expo.dev/develop/development-builds/use-development-builds/)を確認。再利用そのものの実機確認は保留。Metroを止めて npx expo start --dev-client --tunnel --clear を使う。[実機手順](IPHONE_VALIDATION.md)／[記録用紙](EMBLEM_TEST_LOG.md)。

ローカルcommitだけを作り、外部へ送信しない。開始時にユーザー未commitファイルはなく、保護設定も変更していない。
