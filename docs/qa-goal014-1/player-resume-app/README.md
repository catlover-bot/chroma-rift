# 実Appの一時停止・再開・エリア02からの再開

[18.4秒の動画](player-resume-app.mp4)は、実Appで01→02、02の移動・一時停止・再開・ホームへの帰還、02→03、別プロセスで保存した02から再開する流れを収録しています。[検証結果](summary.json)の6項目はすべて成功しました。

390×844の画面に、画面を覆わない48pxのQA説明欄を下に付けています。92フレーム、5fps、H.264、無音です。撮影した区間は60Hzのシミュレーションから5fpsで抽出しています。途中の自然攻略は省略し、映像内にも省略を明示しています。これは実機の連続プレイ時間やFPSの測定ではありません。

## 経路と保存の根拠

- App、NativeFirstPersonGate、FirstPersonScreen、controller、保存codec・writer、ChapterMusic、audio owner/director/backend/nativeSessionは実装を使用しています。01と02は既存の自然攻略fixtureによる移動・照準・装置操作で完了し、Screenのsnapshot受付→実Appの完了処理によって次のエリアへ進みました。完了callbackの直接呼び出しや完了フラグ・座標の注入は行っていません。
- 02の一時停止・再開・ホームへの帰還は実際のボタンhandlerを使用しています。一時停止中の位置・向きの維持、再生状態停止と、再開後にcontroller/audio ownerが同一であることを検証しました。02では画面の移動パッドhandlerで0.65mを超えて歩き、足音の再生要求も確認しています。
- ホームへ戻った後、実Appが書いた保存領域のkey/value全体をそのまま保持し、別のNodeプロセスへ渡しました。別プロセスのAppは「続きから」→「収蔵庫へ入る」で02を復元し、同じrunIdと01完了履歴を保持しています。入力したcampaign保存値のSHA-256は両プロセスとも `1a5cca1435348dd999b35d47e54bd3e42946a9e66af3bb77d7c601b548b5474e` です。[保存値の証明](fresh-save-proof.json)と[gzip圧縮した実際の保存領域](fresh-storage.json.gz)を保持しています。これは今回生成した検証用データです。
- 自然攻略部分は01が77.447秒、02が20.488秒のシミュレーションです。初回プロセス全体111.585秒、別プロセス5.05秒から必要な画面を抽出しました。

## 画像

| 状態 | 画像 |
|---|---|
| 実Appの01完了から02へ | [01→02](01-to-02.png) |
| 02の一時停止 | [一時停止メニュー](02-paused.png) |
| 同じcontroller・音の所有者で再開 | [再開後](02-resumed.png) |
| 02を保存してホームへ戻る | [ホーム](home-after-save.png) |
| 実Appの02完了から03へ | [02→03](02-to-03.png) |
| 別プロセスで02を復元 | [直接再開](cold-02-restored.png) |
| 復元後に移動 | [移動後](cold-02-movement.png) |

画像を開いて確認し、一時停止メニューの日本語、再開・ホームボタン、02の施設表示と装置、通常HUDが描かれていることを確認しました。近づきすぎた位置では装置ボタンが無効になり、理由「少し下がると、装置全体と取っ手が見えます。」も表示されています。

## 検証境界

Native Canvasの利用可否・成功した初回描画の通知は検証用の代替です。Sceneは実際のChapterSceneをThree ObjectLoaderで再構築してSwiftShaderで描画し、HUD・Modalは実コンポーネントのhost/styleをCSSに変換しています。React NativeのYoga、EXGLの表示、iPhoneの実測ではありません。静的sceneは必要な状態で再構築し、収録区間の移動・姿勢は実controllerの行列で更新しています。

音は `sharedNativeAudio` fixtureによる共有セッション・再生状態のモデルです。assetの識別子は実レジストリのliteral requireに対応し、seekは明示的なゼロ遅延fixtureです。MP4には音声trackがありません。実機での聴取、AVFoundationの動作・タイミング、音質を検証した記録ではありません。

描画所有者は両プロセスとも最大1、初回4回・別プロセス1回の入場で、終了時はすべて解放されました。音の同時playerは最大12/11。終了時は音の所有者・player・session lease・未完了操作、RAF、AppState subscriptionがすべて0です。audio first failureはありません。ブラウザーscene解放後のgeometryは0、textureは既知のライブラリー所有PBR DFG LUTが1個で、その後renderer.disposeを実行しています。dispose後のGPUメモリーは測定していません。

## 再現と一致確認

```sh
node --check scripts/qa-player-resume-app.cjs
npx eslint scripts/qa-player-resume-app.cjs
node scripts/qa-player-resume-app.cjs --out=.expo/goal014-1/player-resume-app
```

構文・ESLint・収録は成功しました。読み込んだ235個のTypeScriptファイル（自然攻略・audio fixtureを含む）、28個のasset、9個のtool/config/Three bundleを撮影前後およびプロセス間で照合しています。[完全なreport](report.json)がhashを保持します。capture時HEADは `6186a5e` です。

[manifest](manifest.json)には公開artifactのbytes/SHA-256を収録しています。圧縮report・animationは元のJSONのbyte列をそのまま圧縮したもので、[summary](summary.json)に展開後のhashがあります。巨大な一時scene JSONと全92枚の連番画像は `.expo/goal014-1/player-resume-app` にあり、公開用には動画と7枚を選んでいます。既存の製品ソース・保存仕様・他のQAツールは変更していません。
