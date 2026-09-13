# 第一章の公開準備と未完了ゲート

製品の設定から、公開ナビゲーションにない旧迷宮専用の色模様の強さを外した。保存値と開発用の旧迷宮設定は維持する。03映写室の一時停止設定にも無関係な紋章色ボタンが出ていたため、同画面では除いた。01展示室の色選択と旧入口の紋章色選択は維持。関連する画面試験2スイート/21テストは通過した。端末での設定画面・文字拡大・アクセシビリティ確認は未実施。

この製品UI修正後の `npm run check` はlint・型検査・109スイート/1,126テスト・通常iOS exportを通過。公開用iOS/Android JSは1,576/1,575 source・各10 assetで5エリア同梱・開発画面/probe除外、first-party各197 source本文一致、Three 1 source/22参照のclass identity、3対象の実行時循環0、Stage定義2件を確認した。`automatedChecksPassed=true`、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` は維持。iPhone previewと正式なprivacy/support URLは残件。

05の人数表示は線分修正後も、安全な開始位置から製品と同じ縦FOV 65で見ると左右が切れていた。実sceneの表示groupを0.72倍にし、自然成功のcontroller記録から02/01/00の各状態を同じ開始位置と近接視点で描画した。6画像を開き、全数字が画面内で読めることを確認した。QA cameraは手動で表示へ向けており、製品の実旋回/HUD、native Canvas、iPhoneでの見え方は未確認。自然成功・復旧動画を再収録し、source hashと計測を更新した。詳細は `docs/qa-goal013/README.md`。

表示寸法修正後の `npm run check` はlint・型検査・109スイート/1,124テスト・iOS通常exportを通過。source map付き公開用JSはiOS 1,576/Android 1,575 source・各10 assetで5エリア同梱・開発画面/probe除外を確認し、first-party各197 sourceの本文一致、Three 1 source/22参照のclass identity、iOS/Android/neutralの実行時循環0、Stage定義2件も通過した。`automatedChecksPassed=true`、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。実機previewと正式なprivacy/support URLは引き続き公開ゲートの残件。

05の人数表示で `0` の左下線が欠け、右下線が重複していたため実sceneを修正した。実controller記録から02→01→00の全frameの切替と線分を検査し、Software WebGLの近接画像3枚を開いた。再収録した自然成功・復旧動画のSHA-256は旧動画と同一で、記録のsource hashと計測を更新した。修正後の `npm run check` はlint・型検査・109スイート/1,124テスト・iOS通常exportを通過。公開用iOS/Android JSは1,576/1,575 source・各10 asset、5エリア同梱、開発画面/probe除外、first-party各197 source本文一致、Three class identity 22参照、循環0を確認した。近接画像は製品cameraや実端末の視認性を証明しない。`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持し、iPhone previewと正式なprivacy/support URLを待つ。

第一章完了後の製品ホームからも、確認付きで「第一章をはじめから」を選べるようにした。Jest App hostでは、確認前の完了記録保持、入場時の原文backup、新runIdとreset世代の更新を確認。変更後の全109スイート/1,124テスト、通常iOS export、両OS公開用source-map検査、循環/定義検査は通過した。端末での完了後の再開始、実AsyncStorageのbackupと画面表示はpreviewで確認する。

04の鏡像と実身体を同一simulation frameで並べたSoftware WebGLのQA動画を `docs/qa-goal013/mirror-identity.mp4` に追加した。右側は固定QA cameraであり、製品の一人称表示やiPhoneの反射確認ではない。native previewで鏡像・実体・操作を確認するゲートは未完了のまま。

この文書は2026-09-13時点のローカル設定と確認範囲を記録する。`automatedChecksPassed=true`（lint、型検査、109スイート/1,124テスト、iOS/Android export、循環と定義検査、Doctor）、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false`。自動検査の詳細は `docs/GOAL-013.md` に記録した。ローカルのJS export、Doctor、JestはiPhoneの実行やストア審査の代わりにならない。

## ビルド構成

`app.json` の表示版は1.0.0。`package.json` も同じ版とし、保存記録の `APP_VERSION` は `app.json` から読む。既存の `com.hirotakam.chromarift`、EAS projectId、縦画面、マイク録音と背景再生の無効化を維持した。`eas.json` には従来のdevelopmentに加え、内部配布・開発ツールなしのpreviewと、ストア用productionを追加。preview/productionはdevelopmentを継承しない。`cli.appVersionSource=remote` とproductionの `autoIncrement=true` を指定した。**EAS上の既存buildNumberは未確認**であり、remote値の初期化や変更は行っていない。ビルド実行前にオーナーが過去のTestFlight/App Store ConnectとEASの番号を照合する。

`assets/branding/icon.png` は1024角・不透明の自作アイコン、`splash-icon.png` は同じ図形の透過PNG。`scripts/generate-brand-assets.cjs` で再生成できる。SDK 57が推奨した `expo-splash-screen` 57.0.9のconfig pluginで、暗色背景と中央200pxの図形を設定した。ローカル `expo config --type prebuild --json` は設定を解釈できた。実際のlaunch画面とOS側のアイコンmaskはpreview/production端末で確認する。 [Expoのicon/splash設定](https://docs.expo.dev/develop/user-interface/splash-screen-and-app-icon/)。

同じBundle IDで開発版をpreview/production版に上書きする場合は、先に旧データのバックアップと旧版→新版の継続を端末で確認する。アプリ削除は保存の検証手順に含めない。preview/productionは同梱JSとassetを使う新しいバイナリが必要で、Metroを止めて機内モードで起動する。クラウドビルド、署名、Apple認証、アップロードはこの作業では実施しない。

公式設定: [EAS build profiles](https://docs.expo.dev/build/eas-json/)、[remote build versions](https://docs.expo.dev/build-reference/app-versions/)、[内部配布](https://docs.expo.dev/build/internal-distribution/)。

## 同梱と公開導線

製品ホームは第一章の5エリア、新規/続き/旧記録移行/到達済みエリアの振り返り、発見の記録、設定、第一章エンディング、第二章の予告のみを案内する。旧Stage Select、probe、旧迷宮、開発者ラボ、描画診断は`__DEV__`条件の経路。`.easignore` は `.gitignore` を引き継ぎ、docs、scripts、test-support、テスト、旧fixture、原STL、生成元/解析だけのassetをEASのアップロードから除外する。本編でimportする仮面JSON、ハイブリッド画像、WAVは残す。Expoの静的import/require資産はproduction binaryへ同梱されるが、これは実バイナリの機内モード確認を代替しない。 [EAS ignore](https://docs.expo.dev/build-reference/easignore/)、[Expo assets](https://docs.expo.dev/develop/user-interface/assets/)。

`metro/withReleaseComposition.js` はproductionのiOS/Android解決時に開発用画面とprobe実装を空の境界へ差し替える。公開用のStageカード台帳は旧試作を除き、旧IDのjournal parseと移行元の保存は維持する。`node scripts/check-release-export.cjs <export-directory> ios|android` で実exportのsource map、5エリアID、同梱assetを検査した。04前室追加後の再exportではiOSが1,576 source/10 JS asset、Androidが1,575 source/10 JS assetで、開発用6画面、probe source/ID、test-supportは含まれない。アイコンとsplashはJS asset一覧ではなくconfig pluginのネイティブ資産として指定した。これは実端末の表示・音・オフライン起動を証明しない。第二章のruntime/scene/saveはまだ提供しない。

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

- 第一章01→05の実controllerとcampaign domain host、およびマウント済みcontrollerを動かすApp/AsyncStorageモックの連続経路は、標準B→C/控えめC→Bで通過した。Canvas mockのpeak ownerは1、エンディング後0で、App cold restart後もエンディング入口が残る。結末画面の提示前に終了した条件もJest hostで検査し、完了envelopeと後追いのbeat提示を分けて確認した。05停止beatを読み飛ばして屋外へ進む場合も、結末で巡回体の正体・01→00を台帳の文で示し、両beatの提示を保存する。**native Canvas・実音声を伴うApp操作の連続動画**は未完了。04控えめと05標準の単独成功経路は実controller/sceneのSoftware WebGL動画で確認した。05の早すぎる閉扉拒否と手動開け直し→再誘導→退館、04標準の保持中捕捉とcold復元後の出口は実controller試験で通過した。04標準の未完成巻上げ中の捕捉、Stage codec復元、残り一段の再作業と出口もSoftware WebGL動画へ収録した。05の開け直し復旧はSoftware WebGL動画を収録したが、追跡の実機見え方、実HUD・音・native Canvasは未確認。`docs/qa-goal013/README.md`に証拠と範囲を記録した。
- Appの途中checkpoint・物語提示・replay発見の保存失敗は再試行/起動中だけ継続の選択肢を出し、画面内controllerを停止する。モックの書込失敗を連続させた試験で、原文保持、再試行成功後の保存、起動中だけのメモリ上の発見を確認した。保存依頼直後にホームへ退出した失敗も同じleaseなら通知・再試行できる。実端末の容量不足とnative画面重なりは未確認。
- 標準B→CのJest App経路では、4回のエリア遷移後cold restore、10回の同一エリア再入場、完走後の05→01逆順replayを加えた。Canvas mockは計20回の入場でpeak 1、退出・unmount後0。本編セーブとrunIdは保持された。実端末のGPU/音owner、AsyncStorage、熱・frame timeを証明しない。
- 逆順replayの5エリアは、各マウント済みcontrollerを実操作で出口まで進め、codec有効な最終checkpointから練習結果画面へ到達した。新発見のない実行では本編envelope原文を変えず、結果画面のCanvas mock ownerは0。練習完了のnative Canvas/実音/端末保存は未確認。
- 01〜03の変更前後は同条件のSoftware WebGL動画で各エリアの短い操作を比較した。01は目的文と点灯後の点検記録の差があり、非常灯の受理とcameraは一致。02の長さ調整と03の灯り調整は観測経路のtimeline・独立動画がbyte一致。各エリア全体の実機比較は未完了。
- 04の図地展示は、単独scene動画の再点検で横顔が台板に隠れていたため描画順を修正した。自作の鍵形も実sceneへ入れ、取得前後の抽出画像と実controller動画で表示を照合した。前室追加後の控えめ経路では、反射を含むSoftware WebGLの最大主58/反射49 draw calls・3,675 triangles・RT384×384を記録した。これは端末測定ではない。iPhone previewで横顔と鍵の視認性、鍵取得の動き、鏡と実景の一体感を改めて確認する。
- App hostでエリア境界の未提示短文を次Canvas起動前に表示・保存する経路を追加した。完了envelope保存後に提示bitの書込が失敗しても、旧Canvasを維持して再試行/起動中のみ継続を選べる。境界表示中のcold終了は次エリアの安全入口で未提示文を再表示する。JestのCanvas/AsyncStorageモックによる確認で、native表示と実端末の永続性は未確認。

- 05完了保存後に未提示の収容手順がある場合は、エンディングで一度示してから提示bitを保存する。結末表示前のcold終了と再閲覧の非反復をJest App hostで確認した。実機表示と実AsyncStorageは未確認。

- iPhone preview/TestFlightの機内モード、10〜15分連続、無音、VoiceOver、文字拡大、片手/両手、safe area、温度、frame time、鏡pass資源、10回以上の再入場を未実施。結果は `docs/IPHONE_VALIDATION.md` の第一章節へ記入する。
- 正式なプライバシーポリシーURLとサポート連絡先はオーナー未提供。架空URLは設定やストア情報へ入れない。App Store説明・スクリーンショット・年齢レーティングの申告と審査承認も未実施。
- アイコンと起動画面の実機表示、実機の同梱asset、公開用metadataを確認するまでストア提出しない。

04で取得した隔離キーと05の制御盤に残る鍵は同じ形状から描く。取得時0.3秒、設置時0.2秒の移動と、設置前後の可視状態をSoftware WebGLの実controller/scene動画で確認した。抽出画像・ログ・CPU計測は `docs/qa-goal013/README.md` に保存した。iPhone previewで同じ操作を行い、鍵形の見やすさと挿入の向き・長さを最終確認する。

鍵表示修正後の製品JSをsource map付きでiOS/Androidへ再exportし、1,576/1,575 source・各10 asset、5エリア同梱、開発用画面/probe除外を確認した。iOSのfirst-party 197 source、Androidの存在するfirst-party 195 sourceはmap内本文と一致し、Three class identityと実行時循環0も確認した。`npm run check` は109スイート/1,123テスト、lint、型検査、通常iOS exportを通過。これらはpreview/productionの署名済み端末バイナリや機内モード起動の証拠ではない。

さらにnative R3F Canvas境界で、04未取得・取得済み、05持参中・設置済みの4つの検証済みcheckpointをcold起動し、最初のframeの鍵表示と05の設置座標を照合した。端末GLは試験代替。この追加後の全チェックは109スイート/1,124テスト、lint、型検査、通常iOS exportを通過した。製品ソースは前段のsource map付きexportから変わっていない。

04巻上機への鍵の差し戻しを実sceneへ追加した後、実controller動画で初回・再使用と格子通過を確認した。iOS/Androidのsource map付き製品exportを取り直し、1,576/1,575 source・各10 asset、開発用画面/probe除外、first-party本文一致、Three class同一性、実行時循環0を確認した。`npm run check` は109スイート/1,124テスト、lint、型検査、通常iOS exportを通過。端末の鍵の大きさ・鏡像・実指の離し戻しは未確認。

05の屋外出口は、Software WebGL録画で黒い背景と浮いた操作四角形になっていた。worldの退館操作を維持して実sceneへ空・遠景・歩道・灯具を追加し、自然成功と扉の開け直し復旧の両方で出口を歩いて完了する動画を取り直した。抽出画像とWebGL計測は `docs/qa-goal013/README.md`。実機の輝度、色、操作面の見つけやすさはiPhone previewで確認する。native preview、正式なプライバシーURLとサポート連絡先、ストア申告は引き続きrelease gateの残件。

このscene変更後の `npm run check` はlint・型検査・109スイート/1,124テスト・iOS通常exportを通過。iOS/Androidのsource map付き公開用JSも再exportし、1,576/1,575 source・各10 assetで5エリア同梱、開発用画面/probe除外を検査した。両OSで現在存在するfirst-party source各197件がmap本文と一致し、Three source 1件・22参照のclass identityと実行時循環0を確認した。`automatedChecksPassed=true`、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false`。実機previewと公式URLなしで公開判定へ進めない。

04標準の捕捉復帰は、鍵・練習済みの検証済み入口から実controller/sceneのSoftware WebGL動画を追加した。一段目の保持・解放・退避・再保持中に巡回体が接触し、歯止め2/3と鍵を保って未完成時間だけ失った。Stage codec復元後に残り一段と出口まで実操作した。映像、時刻、WebGL計測、観察の限界は `docs/qa-goal013/README.md`。その後、04出口の製品sceneを修正した。ネイティブ設定は変えていない。iPhoneでのnative Canvas、指操作、鏡像、実音、恐怖・視認性は引き続き未確認。

04格子後の出口も、旧Software WebGL映像では黒背景と浮いた汎用マーカーだった。次の館内区画として前室の床・壁・天井・扉・灯りをsceneへ加え、控えめ自然経路と標準捕捉復帰の両方で出口commandと視界を再確認した。iPhone previewではこの前室の明るさと操作の見つけやすさを05屋外と一緒に確認する。映像と検証範囲は `docs/qa-goal013/README.md`。

このscene変更後の `npm run check` はlint・型検査・109スイート/1,124テスト・iOS通常exportを通過。iOS/Androidのsource map付き製品JSも再exportし、1,576/1,575 source・各10 asset、5エリア同梱・開発用画面/probe除外を確認した。両OSの存在するfirst-party各197 sourceは本文一致、04前室と05屋外のsceneも同梱。Three source 1件・22参照のclass identity、実行時循環0を確認した。04両動画のtool/video/112 source hash、全frameデコード、WebGL資源解放も通過。これらは署名済みpreviewバイナリや実機体験ではない。`automatedChecksPassed=true`、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。

01〜03も実sceneの出口側を追加点検し、無地の終端壁／抽象記号だけだった視界へ次区画の扉面・枠・小灯を加えた。`docs/qa-goal013/README.md` の3枚はworld床上へQA cameraを置いた静止画で、実操作やiPhone表示の録画ではない。操作・衝突・保存の製品コードは変えていない。変更後の `npm run check` はlint・型検査・109スイート/1,124テスト・iOS通常exportを通過。source map付き公開用JSはiOS 1,576/Android 1,575 source・各10 assetで5エリア同梱・開発用画面/probe除外を確認し、両OSで現存するfirst-party各197 sourceがmap本文と一致した。Three class identity 22参照、実行時循環0も維持。端末で01〜03の扉の視認性と次区画への移行を確認するまで `contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。正式なprivacy/support URLも公開ゲートの残件。

オーナーが上記を埋めた後のコマンド例（**この作業では実行しない**）:

```sh
cd /home/mhirotaka/workspace/chroma-rift-goal012
eas build --platform ios --profile preview
eas build --platform ios --profile production
```
