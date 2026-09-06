# 素材の出自

## Goal 006

| 素材 | 出自・生成元 | 備考 |
| --- | --- | --- |
| 建築、門、枠、ラッチ、引き出し | `src/domain/gallery/world.ts` / `GalleryScene.tsx` の自作配置とThree基本geometry | 他ゲームのstage・画像・modelを使っていない。 |
| A紋章 | Goal005照合済み `src/domain/emblem` | [原本対応記録](GOAL-005-KIT-VERIFICATION.md)を保持。色比較で刺激の構造を変えない。 |
| B文脈と見本 | `src/domain/gallery/shadow.ts` / `galleryGraphics.ts` の自作同時対比図 | MIT Checker Shadowの元画像・円柱・レイアウトをコピーしていない。完全再現を主張しない。 |
| C誘導図形 | `src/domain/gallery/contour.ts` / `galleryResources.ts` の自作欠け円盤 | 頂点→重心から角度を導出。通常中央には三角形fill/線なし。 |
| D鍵 | 既存worldの実投影幾何を新章座標へ移し、線幅調整 | 完成形と断片を同じ定義で描画・判定。 |
| QA PNG | `scripts/preview-gallery.cjs` | 本編の共通定義から作成。[閲覧記録・SHA](qa-goal006/visual-review.json)。生成AI画像・外部素材downloadなし。 |
| 音4系統 | `scripts/generate-audio.cjs` のNode標準ライブラリによる独自合成 | 外部sample、録音、台詞、他ゲーム音は含まない。 |

音はmono PCM16LE / 24kHz。footstep 0.18秒、interaction 0.14秒、mechanism 0.68秒、ambience 4秒。複数成分、attack/release envelopeとDC補正を使う。純粋な大音量sine beepを成功音に使わない。

`assets/audio/analysis.json` にSHA-256、peak、RMS、DC、clipping、loop境界値を記録した。全asset clipping 0、DC絶対値<0.0001、最大peak約0.2600、環境音peak約0.0450。これらはファイル値であり、実際に聞いた音量や快適性ではない。`listeningVerified:false` のとおり実聴未実施。

```sh
node scripts/generate-audio.cjs --check
node scripts/preview-gallery.cjs --capture
```

前者はバイト再現性、後者はブラウザー実WebGLとソフトウェアラスタを検査する。browserの既存実行環境要件は [QA README](qa-goal006/README.md)。新しいbrowser framework依存は追加していない。

## 参照資料

資料は現象・APIの根拠として扱い、素材の流用指示とはしていない。

- [MIT Checker Shadow](https://persci.mit.edu/gallery/checkershadow/)：見かけの明暗と画面上の同一値の区別。
- [Banica & Schwarzkopf (2016)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4982671/)：誘導図形と主観的輪郭の研究。論文の実験条件・効果量をiPhoneへ移して保証しない。
- [Three Color Management](https://threejs.org/manual/en/color-management.html)：sRGB入力注釈と出力変換。
- [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/) とインストール版 `plugin/src/withAudio.ts` / `src/AudioModule.ts`：plugin schemaと公開native module境界。

依存のライセンスは各packageのLICENSEに従う。今回追加のexpo-audioはMIT。アプリ全体や提供キットのライセンスを新たに推定・変更していない。

## Goal 007 の追加

- 展示体: `src/rendering/firstPerson/GalleryActor.tsx` の自作階層mesh。Threeの基本geometryを組み合わせた非対称肩/顔/片腕/脚。外部キャラクター・画像・骨格データは使用しない。
- 任意の展示番号13: `chromaticExhibit.ts` の独自の平面path。既存emblem色変換coreを使用。新たな正解図形や外部kitではない。
- 四角いトレー、共通panel fixture、灯り/電源/棚: domain寸法と既存基本geometryによる本作のコード生成。
- 音: Goal006の自作4 WAVをそのまま再利用。敵の実移動を既存足音に接続し、外部音源を追加していない。
- `docs/qa-goal007/` の画像: 同リポジトリの実mesh/materialと実component由来HUDを使用したローカルbrowser WebGL/合成QA。iPhone録画や他作品の転載画像ではない。実行環境と対象版は各READMEに記載。
