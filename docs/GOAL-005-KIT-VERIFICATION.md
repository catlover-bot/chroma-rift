# Goal 005 原実装キット照合

検証日: 2026-09-06。今回の開始ブランチは `feat/goal-003-first-person`、HEAD は `aa8ff20d9672d97ffac814542c71045761e61e92`、作業ツリーは clean。`git merge-base --is-ancestor aa8ff20 HEAD` は成功した。aa8ff20 の実装を基準に追加修正し、reset / clean / 履歴の巻き戻し / amend は行っていない。

本書は、aa8ff20 時点で未入手だった原 TypeScript と付属テストを実際に読んだ追補記録である。既存のプレビューから移植したアプリ実装を原キットそのものとして扱わない。[前回の実装記録](GOAL-005.md)は、その時点で実施できたことの記録として残す。

## 原本の取得元と完全性

開始時、WSL の `/home/mhirotaka/workspace/chroma-rift-reference` は存在したが空で、指定 ZIP と展開先はまだ読めなかった。次の Windows Downloads の ZIP が指定 SHA-256 と一致することを先に確認し、既存ファイルを上書きせず WSL の指定先へコピー・展開した。

- 取得元: `C:\Users\m.hirotaka\Downloads\chroma-rift-goal-005-implementation.zip`
- 実際に読み取った ZIP: `/home/mhirotaka/workspace/chroma-rift-reference/chroma-rift-goal-005-implementation.zip`
- 実際に読み取った原キット: `/home/mhirotaka/workspace/chroma-rift-reference/chroma-rift-goal-005`
- ZIP SHA-256（指定値・Downloads・WSL すべて一致）: `320aa4e3c6dcb36c8f1e54083d511c1425ef3df5067899862d3fa18309cb0811`
- `MANIFEST.sha256.json` 自体の SHA-256: `d4f53e091b5c484333ed04fd9da1954b840453befccb50fcc4cca4d4c2a68a24`
- マニフェストは **42 エントリ、42/42 ファイル一致**。ソースやテストだけでなく、文書・build・preview・設定も検査した。

コンパイル・統合検証後にも ZIP と 42 ファイルを再照合し、すべて同じハッシュであることを確認した。

展開後の原キットは読み取り専用の参照対象として扱った。コンパイル・テストには別コピーを使用し、原キットの package.json / tsconfig.json / build をアプリへ上書きしていない。`README.ja.md`、`DESIGN.ja.md`、`INTEGRATION.ja.md`、`SOURCES.md`、原キットの `GOAL-005.md` とアプリの `docs/GOAL-005.md` を読んだ。SOURCES の外部根拠とパック独自の設計判断を区別し、実機・知覚について新たな検証済み主張は加えていない。

## 原本ファイルとアプリの対応

以下の「移植」は意味と契約の対応を指す。パス、ホストの型、保存所有者の違いだけを不一致として数えていない。

| 原本 | アプリ側の対応先 | 移植内容・適応・不足への対応 |
| --- | --- | --- |
| `src/seal/color.ts` | `src/domain/emblem/color.ts` | sRGB/linear 変換、相対輝度、8-bit 無彩色化、3 パレット、coverage 混色を移植。日本語表示名と型をホストへ追加。内部パレットの freeze 不足を今回補完。 |
| `src/seal/stimulus.ts` | `src/domain/emblem/stimulus.ts`、`presentation.ts` | 同じ version、seed、丸/ひし形/四角、内外配置、切れ目、coverage、opaque raster、行反転。ホストには上限 8 件の共有 cache を追加し、初回調整と本編の生成器を共通化。 |
| `src/seal/puzzle.ts` | `src/domain/emblem/puzzle.ts`、`src/domain/firstPerson/runtime.ts`、`src/rendering/firstPerson/runtimeController.ts` | 観察→輪郭選択、任意比較、ヒント、補助、連打制限、session/seq/時刻検証、checkpoint を移植。観察の記録を一度だけにし、反応文と objective を分離。第一の封印はホスト状態へ同時反映。 |
| `src/seal/interaction.ts` | `src/domain/firstPerson/interaction.ts`、`geometry.ts`、`emblemFixture.ts`、`src/rendering/firstPerson/runtimeController.ts` | ホストの距離・6°照準・遮蔽・実 camera に接続。板は実 ray-plane 矩形判定、印は既存対象取得を使用。鍵の厳密な投影判定を保持。不正な遮蔽物を遮断する原契約の不足を今回修正。 |
| `src/seal/storage.ts` | `src/storage/firstPersonStorage.ts`、`src/domain/firstPerson/checkpoint.ts`、`src/storage/applicationStorage.ts` | 独立した seal 保存キーの例は採用せず、既存 checkpoint の versioned optional `progress.emblem` へ統合。既存 writer/lease/reset 世代、旧原文 backup、未知版保護を利用。 |
| `src/seal/surfaceOwner.ts` | `src/domain/emblem/surfaceOwner.ts`、`src/rendering/firstPerson/emblemSurface.ts`、`resources.ts` | コアの色/無彩色二枚の所有・map 切替・一度だけの破棄を保持。ネイティブでは SceneResources が canonical Three の一つの material と上限付き texture cache を所有。 |
| `src/seal/index.ts` | `src/domain/emblem/index.ts` | コア export をホストへ整理。interaction/storage は既存ホストモジュールを使用し、共有 presentation を export。別の保存系や操作系は作らない。 |
| `test/stimulus.test.cjs` | `src/domain/emblem/__tests__/emblem.test.ts`、`kitContracts.test.ts`、`src/domain/calibration/__tests__/quickSetup.test.ts`、`src/rendering/firstPerson/__tests__/emblemSurface.test.ts` | 色数式、入力検査、全形状・内外、色/好みで形と答え不変、輝度誤差、mask 非交差、opaque、行順、cache/共有刺激の契約を検査。原本試験のアプリ適用も別途実施。 |
| `test/puzzle.test.cjs` | `src/domain/emblem/__tests__/emblem.test.ts`、`kitContracts.test.ts`、`src/domain/firstPerson/__tests__/emblemIntegration.test.ts`、`src/rendering/firstPerson/__tests__/emblemController.test.ts` | 全 variant、正誤、任意比較/補助、自動解錠禁止、session/seq/時刻、停止・復帰、one-time release、保存対象の意味を対応。ホストの実 camera と章の進行でも検査。 |
| `test/integration-boundaries.test.cjs` | `src/domain/firstPerson/__tests__/interaction.test.ts`、`rectangleInteraction.test.ts`、`src/storage/__tests__/emblemMigration.test.ts`、`firstPersonStorage.test.ts`、`src/rendering/firstPerson/__tests__/emblemSurface.test.ts`、`resources.test.ts`、`src/domain/emblem/__tests__/emblem.test.ts` | 距離/照準/遮蔽、保存破損/未知版/reset 競合、資源一度だけの破棄・部分生成失敗をホスト所有方式で検査。原本の不正 blocker 検査に対応する回帰を追加。 |

## 意図的な統合変更

- 原キットの壁座標は旧確認版の候補値。現アプリでは北右壁の `EMBLEM_FIXTURE`、中心 `(1.95, 1.83, -7.81)`、1.65 m 四方を描画と対象判定で共有し、既存扉の開口を避ける。板全体の可視範囲を調べられるよう矩形判定を使用する。
- 初回本編は seed 21、初回調整は seed 21/22/23。`getSealRasterPair` を両方で使い、設定回答を途中の出題や輪郭の正解に反映しない。Skia と Three の表示経路・補間の差や実機の色出力は、データ一致とは別に残る。
- 比較は同じ material の color/neutral map 交換。輪郭ガイドは連続輪郭の同じ coverage を静的な中立色へ置き換える補助表示で、補助ありの画面を純粋な色比較の測定に使わない。
- コアの再 inspect による繰り返し観察効果を抑え、最初だけ記録。短い触覚的な文と objective を分け、解放後も既存の鍵・帰路のヒント段階を戻さない。
- 単体キットの保存 helper は独立使用例であり、ホストへ第二の権威ある保存キーを増やさない。sealA と `progress.emblem` は同時に保存し、sealA 済みの旧セーブを released に移行する。矛盾する optional field だけで未解放の扉を開けない。
- 原 helper の保存失敗時の Promise rejection は、既存ホストの `false` 返却と UI 通知に適応した。単体 seal JSON の 4096 文字上限を章全体の文書へ機械的に適用せず、既存 decoder の境界を使用する。
- generic surfaceOwner に加え、ネイティブ側は scene ごとの material と最大 8 種の texture 組を保持する。比較や HUD 更新で renderer / GL context を増やさず、現在表示中の map を差し替えてから古い texture を破棄する。
- generic owner は原本と同様に破棄後の変更を throw する。native owner は終了後の callback を無処理にし、texture や renderer を再生成しない。これはホストの寿命管理への適応である。

原本 `test/integration-boundaries.test.cjs` の 10 ケースは、独立 helper を一式追加して通す代わりに、実際に使用するホストの契約へ次のように対応させた。

| 原本の検査意図 | アプリ側の検査・適応 |
| --- | --- |
| 距離と照準を別々に判定 | `interaction.test.ts` の近距離印/遠距離対象、`rectangleInteraction.test.ts` の触れた面までの距離。 |
| 6° 内を許可、外を拒否 | 5.8° 許可、6.8°/12°/180° 拒否と閾値 6 の検査。鍵には適用しない。 |
| 前方の壁は遮蔽、対象の背後の壁は非遮蔽 | 既存の閉じた扉/矩形端の遮蔽に、今回正常な背後壁の検査を追加。 |
| 不正 camera / ray / blocker を拒否 | ホストは有限 yaw/pitch から単位 ray を生成するためゼロ方向入力 API はない。不正 pose/camera 拒否と今回の不正 box 4 ケースで対応。 |
| checkpoint の破損/未知版、既存 schema 保護 | `emblem.test.ts`、`emblemIntegration.test.ts`、`emblemMigration.test.ts`、`firstPersonStorage.test.ts`。standalone 保存キーは導入しない。 |
| 進行中・待機中の保存より reset が勝つ | `firstPersonStorage.test.ts` の直列 reset と、`emblemMigration.test.ts` の backup 途中/reset/古い load の競合検査。 |
| 保存失敗後も次の保存が可能 | backup 読み書き失敗時 false、同じ lease で再保存成功。既存ホストのエラー通知方式に適応。 |
| 二枚の texture を保持し map だけ変更 | generic owner、native `emblemSurface.test.ts`、実 R3F を使用する `nativeCanvasLifecycle.test.tsx` の資源数・geometry/material/context 維持。 |
| 二重破棄と破棄後の変更 | 各資源の dispose が一度だけ。generic は late throw、native は late no-op。 |
| 二枚目の生成失敗で一枚目を破棄 | `emblem.test.ts` の部分生成失敗検査。native の初期 material/cache と guide の rollback もコードを確認。 |

## 原本照合で見つかった不足と修正

1. **パレット内部の変更防止**: 原本は各パレット定義まで `Object.freeze` するが、aa8ff20 は外側のみだった。同じ刺激条件が後から書き換わらない契約を回復するため、内部も freeze し、変更拒否を回帰検査した。
2. **不正な遮蔽物の扱い**: ホストの `rayBoxDistance` は逆転/NaN/Infinity の bounds をすり抜ける場合があった。原本の「不正 blocker は操作を遮断する」という契約に合わせ、全軸を先に検証して距離 0 の遮蔽とする。正常な先行軸で早期 miss して後続軸の破損を見落とす場合も遮断する。
3. **原本由来の直接検査と再現性**: 既存 preview の golden 値だけでなく、原 TypeScript と原テストを使用する監査経路を追加した。`kitContracts.test.ts` の **9 テスト**で、色入力/256 階調往復、100 seed、resume の ready 条件、非有限イベント値など、元の意味契約を追加検査した。

遮蔽物は修正前に 4 ケースの失敗を再現し、修正後は関連 8 suites / 132 tests が成功した。逆転、NaN、Infinity、先行軸 miss の拒否に正常な背後壁を加えた **5 テストを追加**。板と印の両方について、実 camera を渡す経路でも対象が選べないことを検査した。既存 assertion の削除・緩和はしていない。

## 原 TypeScript とアプリの直接比較

再現用 [scripts/verify-goal005-reference.cjs](../scripts/verify-goal005-reference.cjs) を追加した。指定の既知マニフェスト SHA-256 と 42 ファイルを先に確認し、原 TS とアプリ TS を別々の一時ディレクトリへコンパイルする。アプリや原キットの build へは出力しない。

```bash
cd /home/mhirotaka/workspace/chroma-rift
node scripts/verify-goal005-reference.cjs --kit /home/mhirotaka/workspace/chroma-rift-reference/chroma-rift-goal-005
```

最終実行の結果は `.expo/goal005-kit-verification/reference-audit.json`、一時出力は `/tmp/goal005-reference-audit-X02OMz`。

- `stimulus.test.cjs` **12 件**と `puzzle.test.cjs` **16 件**を byte 同一コピーし、アプリの一時コンパイル出力に対して **28/28 PASS**。出力ディレクトリの構造を合わせたため、require 行もテスト本文も変更していない。
- **100 seeds × 3 palettes × 3 preferences = 900 条件**、128 × 128 pixels、color/neutral の両方で一致。version / seed / palette / preference / answer / distractor / paths / geometryKey / coverage / RGBA / bottomUpRGBA を比較した。
- aa8ff20 の既存 preview golden **15 レコード × 6 項目 = 90 一致**。golden の出典 SHA-256 は今回の原キット `preview.html` と一致する `99248b7900457ebe684a0549da0919d5c9f8afb71096122e9cae13110530a9f9`。
- この 28 件は原本の core 試験をアプリへ適用した結果であり、原キット単体の全 38 件や、アプリ全体の Jest 件数へ加算していない。保存・相互作用・資源所有の残る原 10 件は前掲のホスト対応表とアプリ検査で照合した。

## 原キット単体の再検証

隔離コピー: `/tmp/chroma-rift-goal-005-original-check-l82I98`。Node **24.20.0**、npm **11.19.0**、アプリに既存の TypeScript **6.0.3** を使用した。依存インストールは行っていない。

| 実行 | 結果 |
| --- | --- |
| 原設定の `tsc -p tsconfig.json` | TS5107、exit 2。`moduleResolution: "Node"`（node10）の非推奨設定による停止。 |
| 原設定の `npm run check` | 同じ TS5107 で停止。原設定のまま成功したとは扱わない。 |
| 原設定の `npm test` | 同梱 build に対して **38/38 PASS**。 |
| 作業コピーだけ `ignoreDeprecations: "6.0"` を追加して compile / test / check | ソースから再コンパイル成功、**38/38 PASS**。 |
| 原設定＋CLI `tsc -p tsconfig.original.json --ignoreDeprecations 6.0` | PASS。 |
| `examples/threeAdapter.example.ts` を現在の Three / 型で型検査 | PASS（Three 0.185.1 / @types/three 0.185.4）。 |

互換調整は非推奨設定通知の指定のみ。strict、noUncheckedIndexedAccess、exactOptionalPropertyTypes、noUnusedLocals、noUnusedParameters 等の検査は維持。コピーの src 7 件、test 3 件、check script 1 件も原マニフェストと 11/11 一致した。

単体ログは上記コピーの `standalone-*.log`。特に `standalone-original-check.log` と `standalone-compatible-check.log` を区別する。Adapter の型検査は以下で実行した（コピー内の node_modules はアプリの既存依存へ接続）。

```bash
tsc --ignoreConfig --noEmit --strict --noUncheckedIndexedAccess \
  --exactOptionalPropertyTypes --skipLibCheck --target es2022 \
  --module esnext --moduleResolution bundler --types three \
  examples/threeAdapter.example.ts
```

## アプリ統合後の再検証

変更前の実行は **41 suites / 493 tests PASS**（24.967 秒）。これは今回 aa8ff20 の実ツリーで実行した結果であり、原キットの 38 テストとは別である。今回、既存テストを通すための期待値削減や仕様の弱化は行っていない。

最終結果は **42 suites / 507 tests PASS**（26.621 秒）。既存 493 件を保持し、原コア契約 9 件、不正遮蔽物/正常背後壁 5 件の **14 件を追加**した。既存テストの仕様変更による書き換えはない。前回 370→493 件の変更理由は [GOAL-005.md](GOAL-005.md) の記録に残している。

ログ保存先: アプリの `.expo/goal005-kit-verification/`（git 対象外）。

| 検証 | 最終結果・証拠 |
| --- | --- |
| `npm run lint` | `npm run check` 内で実行、0 errors / 0 warnings。監査スクリプトの最終変更後も対象 lint 成功。 |
| `npm run typecheck` | `npm run check` 内で `tsc --noEmit` 成功。既存 strict 設定を維持。 |
| `npm run test` | `npm run check` 内で **42 suites / 507 tests PASS**。既存の Three.Clock 非推奨 warning は隠していない。 |
| `npm run export:ios` | `npm run check` 内で成功。1432 modules、Hermes 5.1 MB。`index-96f84f62c5999201727419fa0ad0d320.hbc`。IPA/実機表示の検査ではない。 |
| `CI=1 npm run check` | lint → typecheck → 全 test → iOS export の全段階成功。`final-check.log`。 |
| `npm run doctor` | **21/21 PASS**。`doctor.log`。 |
| `npx expo install --check` | Dependencies are up to date。`dependencies.log`。 |
| `npm ls --depth=0` / `npm ls three` | 成功。three 0.185.1、R3F 9.7.0 から deduped。`npm-ls.log` / `three-dependencies.log`。 |
| 開発・本番 Three 同一性 | 両方で three.cjs が 1 件、全参照同一 module、Vector3 / Quaternion / Object3D / Mesh の `sameClassIdentity=true`。 |
| バンドルと修正済みソースの一致 | 開発・本番の source map 内容を color.ts / geometry.ts / runtimeController.ts / emblemSurface.ts の現ファイルと比較し、全件一致。`bundle-source-verification.json`。 |
| `git diff --check` / `git diff --cached --check` | 成功。 |
| 原本の最終ハッシュ | ZIP 指定値一致、マニフェスト **42/42 一致**。 |

開発・本番は今回のソースから次の追加 export を行い、既存 inspector で実際に出力された Three factory のクラス同一性を検査した。

```bash
CI=1 npx expo export --platform ios --dev --no-bytecode --source-maps --output-dir .expo/goal005-kit-verification/dev
node scripts/inspect-three-bundle.cjs .expo/goal005-kit-verification/dev --expect-single
CI=1 npx expo export --platform ios --no-bytecode --source-maps --output-dir .expo/goal005-kit-verification/production
node scripts/inspect-three-bundle.cjs .expo/goal005-kit-verification/production --expect-single
```

| バンドル | 内容 SHA-256 | Three module |
| --- | --- | --- |
| dev `index-d41d8cd98f00b204e9800998ecf8427e.js` | `b6a1d2ba68ff3b5b5abb02fb3be4b8f4b3b3bf21007aa81509d033471c1fd0be` | 1490 |
| production `index-2e85624ae1b61a7773b8d71eb231594b.js` | `b56a43eb427e2dda570b6601acbe572a7c8a5cab6a08e345b86b53d11d97cb73` | 1365 |

R3F、nativeSceneSession、resources、emblemSurface がそれぞれ同じ three.cjs を参照する。dev のファイル名が前回と同じでも、その名前を検証済みの根拠にせず、内容ハッシュと今回の source map 一致を確認した。

| 要求された不変条件 | 照合した実装とアプリ検査 |
| --- | --- |
| 比較で輪郭・切れ目・正解・camera・地形が変わらない | 原本900条件比較、emblemSurface の map/cache 検査、nativeCanvasLifecycle の同一 geometry/transform/context、controller の意味更新を確認。 |
| 初回調整と本編が同じ生成処理を共有 | quickSetup の3試行が `getSealRasterPair` の同じ object/bytes/mask を使用する検査。 |
| 主観的な色の見え方を正誤に使わない | reducer は seed から得る uninterrupted glyph だけを正解にする。32 seed×3 preference、全形状/内外・補助ありの検査。 |
| 比較・補助だけで自動クリアしない | 原本の比較・ヒント/補助の試験、アプリ core/controller/emblemIntegration で sealA と phase の未解放を確認。 |
| 旧床条件を二重の必須条件にしない | guideExamined/markActivated が false のまま紋章を解放し、テスト内の衝突判定付き移動で第一扉を通過。firstPerson の章全体検査で鍵→帰路→出口を保持。 |
| 第一封印と保存の整合、旧進行を後退させない | commitEmblemResult の同時更新、旧 sealA=true→released、sealB/variant/exit 保持、backup/未知版/reset 競合検査。 |
| ドラッグ・単一 renderer・Three・ready 判定 | 既存 touchInput/TouchControls/runtimeController/nativeCanvasLifecycle 等を再実行。左右pointer/片指解放/領域外/第三指、停止・retry、render/presentation 返却後だけ ready を維持。Three は上記両バンドルで実検査。 |

## 保持したファイルと終了範囲

次のファイルは `git show aa8ff20:<path>` の bytes と現在のファイルを比較し、すべて同一だった（`protected-files.json`）。依存追加・更新、Expo/Apple 識別子変更、Metro 解決経路変更はない。

| ファイル | SHA-256 |
| --- | --- |
| package.json | `f59b8631c65582efaacc1f841f58408d83803cda124546f98c6c1fe63f841153` |
| package-lock.json | `f40851bea631369fc283381e158a8e0eb95413d14ab320c7e7e773c0ecb98e84` |
| tsconfig.json | `2b00c46f678d36b6ec566a96b4577077ad518de43dda62cbb260ddddff45085c` |
| app.json | `4f2b9d3876ccbd2332e0b1c2e5cadd7646a2d2e63f7f126dd069049a303073d8` |
| eas.json | `8964d8f8aa6ecdf34b6ed01683c2cf88b5fa7b0d80db16c9a9bdbc9e6e8153c0` |
| metro.config.js | `125af6c4ee15a27739bd4b982253d1859f7663f850f9795d3f7738ff1a243185` |
| metro/withNativeThree.js | `8271006e52212447643256b750de9baa859e403c4f185220691a75a564db52ee` |
| .nvmrc | `68ca3fba3b7e864770cb61aeb306d4bd4354b68ab4dd38450860c5d823e42a53` |

今回の実行コード修正はパレット内部の凍結と不正遮蔽物の拒否だけで、残りは追加回帰、再現用監査スクリプト、本書と前回記録への追補リンクである。開始時にユーザーの未 commit 変更はなかった。必要な差分は aa8ff20 の後続の新しいローカルコミットへまとめる。

## 実機で残る確認

今回の原本照合、Node/Jest、型検査、Metro export は、iPhone の実表示や色彩立体視の知覚を確認した証拠ではない。ブラウザーでの統合シーン操作、実 iPhone、GL 実フレーム、錯視・快適さ・FPS の測定は今回未実施。

1. 既存 Development Build で初回表示、描画準備完了、左右同時ドラッグ、片指解放、領域外ドラッグ、第三指 pause、背景復帰、3 回の再入場を確認する。
2. 初回調整と本編の上下左右・線幅・色・切れ目の読みやすさを同じ端末で比較する。カラー/無彩色比較中にカメラ、地形、輪郭、答えが実表示でも変わらないことを確認する。
3. 攻略説明なしに接近→観察→誤答→正答→扉通過→鍵→帰路→出口を試す。比較なし、見え方不明、輪郭ガイド、VoiceOver でも同じ解答論理で進めるか確認する。
4. 旧解放済みセーブ・誤答後の新セーブを実機で再開し、第一の封印と後続進行が戻らないことを確認する。
5. 機種/iOS、通常の明るさ、True Tone/Night Shift、palette/seed/補助を記録し、前後・差なし・不快感の本人の報告を記録する。知覚方向や成功時間を誘導・捏造しない。

手順と記録様式: [IPHONE_VALIDATION.md](IPHONE_VALIDATION.md)、[EMBLEM_TEST_LOG.md](EMBLEM_TEST_LOG.md)、[ILLUSION-EVIDENCE.md](ILLUSION-EVIDENCE.md)。既存 Metro を止めてから、アプリディレクトリで `npx expo start --dev-client --tunnel --clear` を実行する。アプリ削除・保存全消去は不要。今回の依存/native 設定は同一で、再ビルドを要求する新しい変更はない。既存 Build の実機再利用確認自体は残る。

push、PR、EAS build、認証操作は行っていない。
