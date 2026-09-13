# 第一章の公開準備と未完了ゲート

この文書は2026-09-13時点のローカル設定と確認範囲を記録する。`automatedChecksPassed=true`（lint、型検査、109スイート/1,122テスト、iOS/Android export、循環と定義検査、Doctor）、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false`。自動検査の詳細は `docs/GOAL-013.md` に記録した。ローカルのJS export、Doctor、JestはiPhoneの実行やストア審査の代わりにならない。

## ビルド構成

`app.json` の表示版は1.0.0。`package.json` も同じ版とし、保存記録の `APP_VERSION` は `app.json` から読む。既存の `com.hirotakam.chromarift`、EAS projectId、縦画面、マイク録音と背景再生の無効化を維持した。`eas.json` には従来のdevelopmentに加え、内部配布・開発ツールなしのpreviewと、ストア用productionを追加。preview/productionはdevelopmentを継承しない。`cli.appVersionSource=remote` とproductionの `autoIncrement=true` を指定した。**EAS上の既存buildNumberは未確認**であり、remote値の初期化や変更は行っていない。ビルド実行前にオーナーが過去のTestFlight/App Store ConnectとEASの番号を照合する。

`assets/branding/icon.png` は1024角・不透明の自作アイコン、`splash-icon.png` は同じ図形の透過PNG。`scripts/generate-brand-assets.cjs` で再生成できる。SDK 57が推奨した `expo-splash-screen` 57.0.9のconfig pluginで、暗色背景と中央200pxの図形を設定した。ローカル `expo config --type prebuild --json` は設定を解釈できた。実際のlaunch画面とOS側のアイコンmaskはpreview/production端末で確認する。 [Expoのicon/splash設定](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)。

同じBundle IDで開発版をpreview/production版に上書きする場合は、先に旧データのバックアップと旧版→新版の継続を端末で確認する。アプリ削除は保存の検証手順に含めない。preview/productionは同梱JSとassetを使う新しいバイナリが必要で、Metroを止めて機内モードで起動する。クラウドビルド、署名、Apple認証、アップロードはこの作業では実施しない。

公式設定: [EAS build profiles](https://docs.expo.dev/build/eas-json/)、[remote build versions](https://docs.expo.dev/build-reference/app-versions/)、[内部配布](https://docs.expo.dev/build/internal-distribution/)。

## 同梱と公開導線

製品ホームは第一章の5エリア、新規/続き/旧記録移行/到達済みエリアの振り返り、発見の記録、設定、第一章エンディング、第二章の予告のみを案内する。旧Stage Select、probe、旧迷宮、開発者ラボ、描画診断は`__DEV__`条件の経路。`.easignore` は `.gitignore` を引き継ぎ、docs、scripts、test-support、テスト、旧fixture、原STL、生成元/解析だけのassetをEASのアップロードから除外する。本編でimportする仮面JSON、ハイブリッド画像、WAVは残す。Expoの静的import/require資産はproduction binaryへ同梱されるが、これは実バイナリの機内モード確認を代替しない。 [EAS ignore](https://docs.expo.dev/build-reference/easignore/)、[Expo assets](https://docs.expo.dev/develop/user-interface/assets/)。

`metro/withReleaseComposition.js` はproductionのiOS/Android解決時に開発用画面とprobe実装を空の境界へ差し替える。公開用のStageカード台帳は旧試作を除き、旧IDのjournal parseと移行元の保存は維持する。`node scripts/check-release-export.cjs <export-directory> ios|android` で実exportのsource map、5エリアID、同梱assetを検査した。鏡面の明示観察追加後の再exportではiOSが1,575 source/10 JS asset、Androidが1,574 source/10 JS assetで、開発用6画面、probe source/ID、test-supportは含まれない。アイコンとsplashはJS asset一覧ではなくconfig pluginのネイティブ資産として指定した。これは実端末の表示・音・オフライン起動を証明しない。第二章のruntime/scene/saveはまだ提供しない。

05の受鈴器表示修正後も、source map付きiOS/Android exportを各々再実行し、その時点では1,504/1,503 source・各10 JS asset、5エリア、開発用画面/probe除外を確認した。Software WebGLの観察窓動画では巡回体の身体が受鈴器に隠れなくなったが、previewバイナリの実機表示は未確認。

## 依存・スクリプト・権限

ローカルのExpo CLIで `expo install --check` が7件の同SDK推奨パッチ差を示したので、SDK 57のまま `expo install --fix` を行い、expo 57.0.22、expo-asset 57.0.17、expo-audio 57.0.5、expo-clipboard 57.0.2、expo-dev-client 57.0.19、expo-file-system 57.0.7、expo-haptics 57.0.3に合わせた。`expo install --check` はその後「Dependencies are up to date」。Expo Doctorは21/21成功。Three/R3F/RNのメジャー更新、`npm audit fix --force`、lockfile削除は行っていない。

更新前の `npm audit` はmoderate 10件（high/critical 0）。内訳はExpo CLI/config/prebuild/Metro系と、そのconfig-plugins→xcode→uuid 7.0.3の依存。`uuid` のadvisoryは古いv3/v5/v6で呼出側がbufferを渡す場合の境界チェック。アプリ本編の直接依存ではなく、CLI/ネイティブ生成の経路だが、これでビルド時の問題が無害と確定したわけではない。同SDKパッチ更新後も10件、`expo-splash-screen`追加後は11件（config-pluginsからの伝播）と表示された。high/criticalは0。upstreamの修正と到達可能性を公開前に再確認する。

npm 11のinstall-script方針では、`@shopify/react-native-skia` のpostinstallは同梱済みxcframework/static libsを `node_modules` 内へコピーする処理と確認したため、`package.json` の `allowScripts` でそのパッケージだけ許可した。`unrs-resolver` のpostinstallは欠けたnative bindingをnpm registryから取得し得るので明示的に拒否し、現在のLinux bindingは既に存在しrequireできることを確認した。任意の `fsevents` も拒否。EAS workerのnpm版とclean installでSkia libs、resolver bindingが揃うかはpreviewビルド時に検査する。全スクリプト一括許可はしていない。

`expo-audio` の録音・背景機能は無効。アプリの操作はカメラ、位置情報、マイクを要求しない。設定の「プライバシー」は端末内の進行・設定の保存と削除方法を説明する。正式なストア向けデータ取扱い申告とpermission manifestは新しいpreview/production binaryを確認して確定する。

## ストア表示の下書き

説明案：`CHROMA RIFTは、閉館後の知覚展示館を歩く一人称の観察・回避ゲームです。第一章「最後の退館者」では5つのエリアで色、影、長さ、図地、鏡を観察し、巡回体を収容して屋外へ退館します。進行は端末内へ保存され、オフラインで遊べます。怖さを抑える設定と字幕・操作補助があります。第二章は今後のアップデートで追加予定です。` 現在のpreview端末で全記述を確認後に採用する。プレイ時間、実機性能、未収録の第二章を約束しない。

スクリーンショット候補は、製品ホーム、01の観察と目的、03の設備音と遮蔽、04の実反射と巻き上げ、05の収容窓と完了表示。いずれも配布候補バイナリの実画面から撮り、開発UIや合成QA画像をストア素材に転用しない。レビュー案内には「第一章をはじめる」から5エリアを進むこと、控えめ設定、オフライン起動、旧記録の移行を記す。最終手順は端末QA後に確定する。

年齢レーティング申告では、巡回体の不穏な追跡・捕捉、暗い館内と突然の物音を「恐怖・ホラーテーマ」に照らして頻度を判断する。現状は流血・性的表現・賭博・ユーザー投稿・広告・課金を実装していないが、実ビルドと全場面を確認して回答する。数値のレーティングをここで固定しない。Appleの[年齢レーティング質問票](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating)は内容別の頻度から算定される。Appleの[審査ガイドライン](https://developer.apple.com/app-store/review/guidelines/)は正確な説明・画像と、ストア情報およびアプリ内のプライバシーポリシーへのリンクを求める。URL未提供の現状では提出できない。

## オーナーと実機の残件

- 第一章01→05の実controllerとcampaign domain host、およびマウント済みcontrollerを動かすApp/AsyncStorageモックの連続経路は、標準B→C/控えめC→Bで通過した。Canvas mockのpeak ownerは1、エンディング後0で、App cold restart後もエンディング入口が残る。結末画面の提示前に終了した条件もJest hostで検査し、完了envelopeと後追いのbeat提示を分けて確認した。05停止beatを読み飛ばして屋外へ進む場合も、結末で巡回体の正体・01→00を台帳の文で示し、両beatの提示を保存する。**native Canvas・実音声を伴うApp操作の連続動画**は未完了。04控えめと05標準の単独成功経路は実controller/sceneのSoftware WebGL動画で確認した。05の早すぎる閉扉拒否と手動開け直し→再誘導→退館、04標準の保持中捕捉とcold復元後の出口は実controller試験で通過した。両復帰経路の動画、追跡の実機見え方、実HUD・音・native Canvasは未確認。`docs/qa-goal013/README.md`に証拠と範囲を記録した。
- Appの途中checkpoint・物語提示・replay発見の保存失敗は再試行/起動中だけ継続の選択肢を出し、画面内controllerを停止する。モックの書込失敗を連続させた試験で、原文保持、再試行成功後の保存、起動中だけのメモリ上の発見を確認した。保存依頼直後にホームへ退出した失敗も同じleaseなら通知・再試行できる。実端末の容量不足とnative画面重なりは未確認。
- 標準B→CのJest App経路では、4回のエリア遷移後cold restore、10回の同一エリア再入場、完走後の05→01逆順replayを加えた。Canvas mockは計20回の入場でpeak 1、退出・unmount後0。本編セーブとrunIdは保持された。実端末のGPU/音owner、AsyncStorage、熱・frame timeを証明しない。
- 逆順replayの5エリアは、各マウント済みcontrollerを実操作で出口まで進め、codec有効な最終checkpointから練習結果画面へ到達した。新発見のない実行では本編envelope原文を変えず、結果画面のCanvas mock ownerは0。練習完了のnative Canvas/実音/端末保存は未確認。
- 01〜03の変更前後は同条件のSoftware WebGL動画で各エリアの短い操作を比較した。01は目的文と点灯後の点検記録の差があり、非常灯の受理とcameraは一致。02の長さ調整と03の灯り調整は観測経路のtimeline・独立動画がbyte一致。各エリア全体の実機比較は未完了。
- App hostでエリア境界の未提示短文を次Canvas起動前に表示・保存する経路を追加した。完了envelope保存後に提示bitの書込が失敗しても、旧Canvasを維持して再試行/起動中のみ継続を選べる。境界表示中のcold終了は次エリアの安全入口で未提示文を再表示する。JestのCanvas/AsyncStorageモックによる確認で、native表示と実端末の永続性は未確認。

- 05完了保存後に未提示の収容手順がある場合は、エンディングで一度示してから提示bitを保存する。結末表示前のcold終了と再閲覧の非反復をJest App hostで確認した。実機表示と実AsyncStorageは未確認。

- iPhone preview/TestFlightの機内モード、10〜15分連続、無音、VoiceOver、文字拡大、片手/両手、safe area、温度、frame time、鏡pass資源、10回以上の再入場を未実施。結果は `docs/IPHONE_VALIDATION.md` の第一章節へ記入する。
- 正式なプライバシーポリシーURLとサポート連絡先はオーナー未提供。架空URLは設定やストア情報へ入れない。App Store説明・スクリーンショット・年齢レーティングの申告と審査承認も未実施。
- アイコンと起動画面の実機表示、実機の同梱asset、公開用metadataを確認するまでストア提出しない。

オーナーが上記を埋めた後のコマンド例（**この作業では実行しない**）:

```sh
cd /home/mhirotaka/workspace/chroma-rift-goal012
eas build --platform ios --profile preview
eas build --platform ios --profile production
```
