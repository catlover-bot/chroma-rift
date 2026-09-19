# 第一章の公開準備と未完了ゲート

> 2026-09-19：以下はGoal013以降の当時の検証記録として保存しています。現在の「錯視館」の提出手順・状態は[Goal015の提出チェックリスト](release/submission-checklist.md)を参照してください。以下の古い名称・件数・原稿を現行提出情報として転記しないでください。

01→05を一つのApp hostで進めた740状態を実sceneへ順に再描画し、148秒の[ローカルQA動画](qa-goal013/chapter-one-app-scene-replay.mp4)と圧縮runtime/計測/hashを保存した。04の鍵・巻上げ、05の隔離・停止・屋外完了までの順序を同じhost経路で検査できる。04の鏡も実 `planarMirror.ts` の反射passを47 frameで描き、同じsceneの巡回体と鍵を確認した。これは5本を別実行してつないだ映像ではないが、native Canvas/HUD/音を連続収録した動画でもない。鏡への明示観察は別の04動画、native表示はiPhone previewで判定する。製品ソース・依存は変更せず、QA抽出ツールと記録のみ更新した。iPhone実行、正式privacy/support URL、ストア申告の未完了ゲートと `contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。

第一章ホームを最大文字・最小幅で描くと5エリア一覧の番号が2行に割れたため、番号列の固定幅を最小幅へ変更した。新規/旧記録案内、進行中、完了、振り返り、発見記録の15条件では番号が1行、各ボタンのスクロール到達は最低48px、横はみ出し0。[QA画像と測定](qa-goal013/README.md)はbrowser CSSであり、native Yoga、VoiceOver、safe areaや実端末の操作確認ではない。製品ソース変更後の全check（110スイート/1,134テスト、lint、型検査、通常iOS export）と[両OS公開用source-map検査](qa-goal013/home-layout-release-checks.json)は通過した。`automatedChecksPassed=true`、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持し、preview端末と正式privacy/support URL、ストア申告の公開ゲートは残る。

結末とエリア間の点検記録を、実React Native component/App hostから3つの縦画面・文字倍率へ再描画した。最小320×568/fontScale 2では結末の3ボタンへスクロールで到達でき、01→02、02→03、04→05の短文と続行ボタンは画面内に収まった。画像と寸法、再現方法は [QA記録](qa-goal013/README.md)。従来の01→05同一Appログとscene/HUD静止画も現行抽出ツールで再検証した。これはbrowser CSSによる確認で、native Yoga、VoiceOver、safe area、preview端末の受入ではない。製品ソース・依存に差分はなく、前回の全check/両OS公開用export結果を維持する。正式privacy/support URL、ストア申告、iPhone previewの残件と4つの公開ゲートは変わらない。

05単独の自然成功・開け直し復旧動画は、屋外操作の受理後に実controllerが返す `在館反応 00。閉館処理 完了。` をQA字幕で見せるよう再収録した。各196/378 frameで、最後の9 frame・0.9秒はsimulationを進めない静止保持。受理後もcameraが実歩行位置に残ることを検査し、全frameをデコード、最終画像を原寸で確認した。[現行動画・計測・hash](qa-goal013/README.md)を参照。製品runtimeと依存・native設定は変更しておらず、前回の両OS公開用exportと全checkの製品ソース検証が適用される。iPhone実行や正式URL・ストア申告の未完了ゲートは維持する。

最新の同一App host検査では、01→05を一つのmountと5つの実controllerで進め、8,794更新／1,474 sampleの[domain動作ログ](qa-goal013/app-scene-walkthrough-motion-trace.json)、各入口・完了のscene/HUD 10枚と結末1枚、保存遷移を再取得した。05屋外完了で歩行位置が約0.58m飛ぶ不具合を直し、修正後は歩行中の位置を維持したまま完了する。cold checkpointだけは安全な屋外位置へ正規化する。[QA記録](qa-goal013/README.md)にログの範囲、画像・動画hash、Software WebGLの計測を記した。修正後の全checkはlint・型検査・110スイート/1,134テスト・通常iOS exportを通過し、両OS公開用export、first-party各201 source本文一致、5エリア同梱・開発画面除外、循環0、Doctor 21/21、Expo依存検査を[数値とbundle hash](qa-goal013/release-controls-source-checks.json)に記録した。`automatedChecksPassed=true`。sample間の描画frameはなく、一続きのApp実描画動画やnative previewの代用ではない。5エリアの実機受入が残るため `contentComplete=false`、iPhoneバイナリを実行していないため `nativePreviewVerified=false`、正式privacy/support URL・ストア申告も未完了のため `releaseReady=false` を維持する。

02収蔵庫の西経路と03映写室の通常/鈴・仕切り経路を、現行製品ソースの実controller・画面・sceneから個別に動画化した。計３本の実装と入力の証拠は [QA記録](qa-goal013/README.md) にある。05動画も入口でキー盤を取得可能と検査し、接触シートを初frameから再作成した。これらは各エリアの局所動作を強める証拠であり、01→05の一続きのApp描画、実機preview、正式URL/ストア申告の未完了ゲートは変わらない。

05の隔離キー盤へ向く新規入口pose `8869c76` 後のローカル検査は、lint・型検査・110スイート/1,134テスト・iOS通常export、iOS/Androidのsource map付きexport、公開用5エリア同梱/開発画面除外、first-party各201 source本文一致、循環0、Three class identity、Doctor 21/21、Expo依存検査に通過した。[数値とbundle SHA-256](qa-goal013/release-controls-source-checks.json)を参照。実App hostの01→05保存遷移を一つのmountで再現し、10枚のエリアscene/HUD静止画と結末1枚を確認したが、中間の実描画frameを含む連続動画ではない。05の実controller/scene自然成功・復旧動画を現行ソースで再収録した。`automatedChecksPassed=true`。5エリアを通した実描画による内容最終受入は未完、preview/productionのiPhoneバイナリ未実行、正式privacy/support URLとストア申告未完のため、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。

最新の権限・プライバシー監査では、アプリ独自の通信API呼出しは製品ソースに見つからず、進行・設定・旧記録はAsyncStorageの管理キーへ保存され、設定から削除できることを確認した。`expo-file-system` が自動追加するAndroid外部ストレージ読書権限はアプリから直接使っていないため、`app.json` の `android.blockedPermissions` で除外した。Expoのintrospectionでは両権限に `tools:node="remove"` が付き、iOS Info.plistの録音設定は変わらない。全 `npm run check` はlint・型検査・110スイート/1,132テスト・iOS exportに成功し、Expo Doctorは21/21、`expo install --check`も通過した。最終統合manifest・実バイナリのSDK通信は未確認で、Android配布用package IDも未設定。公開用本文とサポート案内の未承認案は [プライバシー・サポート文案](CHAPTER-1-PRIVACY-SUPPORT-DRAFT.md) に分離した。正式な運営者・連絡先・公開URL、端末確認、ストア申告を受け取るまで `contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。

後続の接続整理では、04・05のメモ対象を第一章エリア台帳から引き、怖さ設定をStage Moduleのactor能力に合わせた。hidden probeのメモ/怖さボタンは出ない。更新後の全check、公開用iOS/Android exportとsource map、定義済み5エリア・開発画面/probe除外、first-party各199 sourceの本文一致、循環0を確認した。公開判定は引き続き `contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false`。

04・05の一時停止メニューから、観察済みbitだけを表示する発見メモを開けるようにした。04では図地反転と鏡の光学反射を区別し、05の在館反応01は隔離後の停止を観察した時だけ記録する。両エリアの巡回体に対して怖さ設定も一時停止中に切り替えられる。Jest画面試験4件、全110スイート/1,130テスト、lint、型検査、iOS通常export、Stage定義検査、runtime循環0、両OSの公開用source-map検査を通過。iOS/Androidのfirst-party source各199件はmap本文と一致し、5エリア同梱・開発画面/probe除外を確認した。実iPhoneでのVoiceOver・文字拡大・メモの重なりは未確認。正式なprivacy/support URLも未提供で、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。

製品の設定から、公開ナビゲーションにない旧迷宮専用の色模様の強さを外した。保存値と開発用の旧迷宮設定は維持する。03映写室の一時停止設定にも無関係な紋章色ボタンが出ていたため、同画面では除いた。01展示室の色選択と旧入口の紋章色選択は維持。関連する画面試験2スイート/21テストは通過した。端末での設定画面・文字拡大・アクセシビリティ確認は未実施。

この製品UI修正後の `npm run check` はlint・型検査・109スイート/1,126テスト・通常iOS exportを通過。公開用iOS/Android JSは1,576/1,575 source・各10 assetで5エリア同梱・開発画面/probe除外、first-party各197 source本文一致、Three 1 source/22参照のclass identity、3対象の実行時循環0、Stage定義2件を確認した。`automatedChecksPassed=true`、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` は維持。iPhone previewと正式なprivacy/support URLは残件。

05の人数表示は線分修正後も、安全な開始位置から製品と同じ縦FOV 65で見ると左右が切れていた。実sceneの表示groupを0.72倍にし、自然成功のcontroller記録から02/01/00の各状態を同じ開始位置と近接視点で描画した。6画像を開き、全数字が画面内で読めることを確認した。QA cameraは手動で表示へ向けており、製品の実旋回/HUD、native Canvas、iPhoneでの見え方は未確認。自然成功・復旧動画を再収録し、source hashと計測を更新した。詳細は `docs/qa-goal013/README.md`。

表示寸法修正後の `npm run check` はlint・型検査・109スイート/1,124テスト・iOS通常exportを通過。source map付き公開用JSはiOS 1,576/Android 1,575 source・各10 assetで5エリア同梱・開発画面/probe除外を確認し、first-party各197 sourceの本文一致、Three 1 source/22参照のclass identity、iOS/Android/neutralの実行時循環0、Stage定義2件も通過した。`automatedChecksPassed=true`、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。実機previewと正式なprivacy/support URLは引き続き公開ゲートの残件。

05の人数表示で `0` の左下線が欠け、右下線が重複していたため実sceneを修正した。実controller記録から02→01→00の全frameの切替と線分を検査し、Software WebGLの近接画像3枚を開いた。再収録した自然成功・復旧動画のSHA-256は旧動画と同一で、記録のsource hashと計測を更新した。修正後の `npm run check` はlint・型検査・109スイート/1,124テスト・iOS通常exportを通過。公開用iOS/Android JSは1,576/1,575 source・各10 asset、5エリア同梱、開発画面/probe除外、first-party各197 source本文一致、Three class identity 22参照、循環0を確認した。近接画像は製品cameraや実端末の視認性を証明しない。`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持し、iPhone previewと正式なprivacy/support URLを待つ。

第一章完了後の製品ホームからも、確認付きで「第一章をはじめから」を選べるようにした。Jest App hostでは、確認前の完了記録保持、入場時の原文backup、新runIdとreset世代の更新を確認。変更後の全109スイート/1,124テスト、通常iOS export、両OS公開用source-map検査、循環/定義検査は通過した。端末での完了後の再開始、実AsyncStorageのbackupと画面表示はpreviewで確認する。

04の鏡像と実身体を同一simulation frameで並べたSoftware WebGLのQA動画を `docs/qa-goal013/mirror-identity.mp4` に追加した。右側は固定QA cameraであり、製品の一人称表示やiPhoneの反射確認ではない。native previewで鏡像・実体・操作を確認するゲートは未完了のまま。

この文書は2026-09-13時点のローカル設定と確認範囲を記録する。05操作盤の実scene修正 `7ff4a83` 後、01/02の実scene/HUD静止画6枚も追加した。`automatedChecksPassed=true`（lint、型検査、110スイート/1,133テスト、iOS通常export、両OSの公開用source-map export、循環・定義検査、Doctor）。現行ソースのexportとQAの数値は [release-controls-source-checks.json](qa-goal013/release-controls-source-checks.json)、画像と動画は [QA記録](qa-goal013/README.md) に残した。全5エリアを一続きに実描画したApp操作の最終受入が未完了のため `contentComplete=false`。iPhoneで操作盤・鏡・画面と実指/実音を確認していないため `nativePreviewVerified=false`。正式privacy/support URLとストア申告も未完了なので `releaseReady=false` を維持する。ローカルのJS export、Doctor、JestはiPhoneの実行やストア審査の代わりにならない。

## ビルド構成

`app.json` の表示版は1.0.0。`package.json` も同じ版とし、保存記録の `APP_VERSION` は `app.json` から読む。既存の `com.hirotakam.chromarift`、EAS projectId、縦画面、マイク録音と背景再生の無効化を維持した。`eas.json` には従来のdevelopmentに加え、内部配布のpreviewとストア用productionを追加。preview/productionはdevelopmentを継承せず、両方に `developmentClient: false` を明示した。`cli.appVersionSource=remote` とproductionの `autoIncrement=true` を指定した。**EAS上の既存buildNumberは未確認**であり、remote値の初期化や変更は行っていない。ビルド実行前にオーナーが過去のTestFlight/App Store ConnectとEASの番号を照合する。

[EASの設定仕様](https://docs.expo.dev/eas/json/)では `developmentClient: false` は通常ビルドを指定する。現行製品ソースの公開用JS source mapを検査すると、iOS 1,580・Android 1,579 sourceの双方で開発画面、probe、`expo-dev-client`/`expo-dev-launcher`/`expo-dev-menu`系JSは0件。検査scriptにもこれらのJSが混入したら失敗する条件を加えた。ただしローカルのExpo prebuild設定には開発用ネイティブモジュールが自動リンク候補として残る。ここで分かるのはprofileとJSの範囲までで、実際のpreview/productionバイナリの起動画面・開発メニュー・深いリンクの挙動は新しい端末ビルドで確認する。

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

掲載名、サブタイトル、説明、キーワード、実機スクリーンショットの撮影表、審査Notes、年齢レーティングの判断材料を [App Store掲載・審査情報の下書き](CHAPTER-1-STORE-METADATA-DRAFT.md) にまとめた。現行候補の文字数・bytesはAppleの上限内。以前の短い説明案にあった「オフラインで遊べます」は、配布候補バイナリの機内モード確認まで掲載文から外した。画像と審査Notesもpreview実機・正式URL・オーナーの確認後に確定する。年齢数値や提出済み状態は付けない。

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

01〜03の旧境界画像を開き直すと、近接視点では実際の扉が判別しにくかったため、各終端sceneの扉面・内枠・取っ手を視野内へ追加し、同じworld床上QA cameraの3枚を再生成・目視した。QAは色差・部品の視野内位置と画像/source hashを確認する。この段階では銘板に読める次エリア名はなかった。端末の製品HUD・実操作・視認性は未確認で、公開ゲートは引き続き `contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false`。

この差分後の全回帰は110スイート/1,131テスト、lint、型検査、iOS通常exportに成功。Stage定義2件、iOS/Android/neutralの循環0、source map付き両OS公開用export（iOS 1,578/Android 1,577 source、各10 asset、first-party各199 source本文一致、5エリア同梱・開発画面/probe除外）、iOS Three 1 source/22参照のclass identity、Doctor 21/21、Expo依存検査も通過した。`automatedChecksPassed=true` を維持し、実機previewと公式URLがないため `contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。

01〜03の出口銘板には日本語の次エリア名と番号を加えた。ローカルSoftware WebGLの390×844画像3枚を開いて可読性を確認した。フォント本体は同梱せず、生成済みマスクをstageごとのDataTextureへ復元する。iPhoneの実表示・製品HUDとの重なりと最終扉からの操作はpreviewで確認するまで未検証。

看板追加後の `npm run check` は110スイート/1,132テスト、lint、型検査、iOS通常exportを通過。Stage定義2件、iOS/Android/neutral循環0、両OSの公開用source-map export（iOS 1,580/Android 1,579 source、各10 asset、first-party各201 source本文一致、5エリア同梱・開発画面/probe除外）、iOS Three 1 source/23参照のclass identity、Doctor 21/21、Expo依存検査も通過した。04/05の現行ソースでの動画4本は旧MP4とbyte一致し、resource変更に伴うQA reportだけを更新した。`automatedChecksPassed=true` を維持し、native previewと正式な公開URLがないため `contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。

03灯り装置のHUDを、実画面host treeをbrowser CSSへ翻訳したQAで320×568/fontScale 2、390×844/1.5、430×932/1の3条件へ広げた。最小条件では装置パネルをスクロールした下端に確定・退出ボタンが収まり、実controller操作も同じ受理結果になった。画像と寸法は `docs/qa-goal013/theatre-hud-responsive-report.json`。この局所QAでnative Yoga/VoiceOverのレイアウトや01・02・04・05のHUDを確認したことにはならない。preview実機で全エリアの画面・操作を確認するゲート、正式なprivacy/support URL、ストア申告は残る。

04巻上機と05隔離キー/手順/ベルのHUDも3サイズ・12状態で局所検査した。最小幅・最大文字で重複した対象名が移動スティックへ重なっていたため、ボタンと同じ中段名を省いた。修正後の画像・寸法・画面ボタンからの実controller受理は `docs/qa-goal013/stage-hud-report.json`。空のCanvasとbrowser CSSによる検査であり、native画面/操作・VoiceOver・実sceneとの重なりの公開ゲートは満たさない。

このHUD修正後の全回帰は110スイート/1,132テスト、lint、型検査、iOS通常exportに成功。定義検査2件、実行時循環0、iOS/Android公開用source mapのfirst-party各201件本文一致、iOS Three class identity 1 source/23参照を確認した。製品の依存・native設定は変えていない。`automatedChecksPassed=true`、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。

01初期画面と02留め金取得画面も同じサイズ条件へ加えた。02でボタンと異なる対象説明がスティックに重なったため、説明を残して操作ボタン真上の右列へ移した。現行reportは01/02/04/05の18状態を記録する。01/02の装置全体、native場面との重なり・実指・VoiceOverはpreviewで確認する。

03映写機の実scene付きHUDも3サイズで再抽出した。320幅では取得不能理由・映写機状態・通知が重なったため、右列の説明を一つにし、コンパクト画面の通知を目的欄に一時表示するよう修正した。各サイズ7抽出frameのCSS監査でHUD矩形の重なり0、代表画像を開いて確認した。native previewとVoiceOverの公開ゲートは引き続き未確認。

現行ソースで03映写機と灯り操作を各3サイズ・7抽出frameで再検査し、HUD重なり0と320幅のスクロール後の確定・退出ボタンを画像で確認した。全回帰はlint・型検査・110スイート/1,132テスト・iOS通常exportを通過。定義検査2件、3対象の循環0、iOS/Androidのsource mapでfirst-party各201件一致、iOS Three 1 source/23参照のclass identityを確認した。native preview、正式なprivacy/support URLとストア申告は未完了で、`automatedChecksPassed=true`、`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。

02の長さ/鉛直装置も現行の実sceneと画面で12レイアウトを再抽出し、補助前後24状態で「探索へ戻る」がスクロール途中に44px以上見えることを確認した。画像と150 source hashは `docs/qa-goal013/vault-large-text-report.json`。端末のYoga/VoiceOver/指操作のゲートは未確認のまま。

最終HUDの製品ソース以降はQAツールと文書だけが変わったことを確認し、同じ両OSのsource-map exportへ `check-release-export.cjs` を再適用した。iOS 1,580 source/10 asset、Android 1,579 source/10 assetで、5エリア同梱・開発画面/probe除外を両方とも通過した。`expo install --check` は推奨依存と一致、`npm ls --depth=0` はexit 0。現行lockfileへの `npm audit` と `npm audit --omit=dev` はともにmoderate 11、high/critical 0で、11件を解決済みとはしない。CLIが示す自動修正候補はExpo 46とsplash-screen 55へのメジャー変更を含むため適用していない。コマンド範囲・bundle hash・生のaudit JSONは [release-local-checks.json](qa-goal013/release-local-checks.json) に残した。署名済みバイナリ、実機のoffline起動、正式URL、ストア申告のゲートは変わらない。

04/05を320×568/文字2倍、390×844/1.5倍、430×932/標準で確認し、同一controllerから実sceneと実HUDを描いた現行24静止画を開いた。操作面とボタンの同時配置、01初期、02留め金、04保持中の鍵、05キー設置前後・手順・ベルの視界を画像で見た。全サイズで操作ボタンは44px以上・画面内、測定したHUDの重なりは0。計測と画像は [QA記録](qa-goal013/README.md) にある。ブラウザーへの翻訳であり、iPhoneのYoga/EXGL、実指、実音、鏡像の見え方や端末性能を確認したことにはならない。native previewと正式privacy/support URLの公開ゲートは維持する。
