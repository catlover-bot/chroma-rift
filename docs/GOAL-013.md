# Goal 013 作業記録

開始点は `/home/mhirotaka/workspace/chroma-rift-goal012` の `feat/goal-012-stage-kit`、HEAD `478b376ea9a954974ad2f08ab5f09d929bd35f06`、clean。`feat/goal-013-chapter-one-product` を同じworktreeに作成した。Goal 012の補完ブランチ `feat/goal-012-completion` にあった比較動画・検証スクリプト・記録は、重複しない差分として `1fb7a94` に取り込んだ。元の `/home/mhirotaka/workspace/chroma-rift` は `5c04d98` の別worktreeのまま。Node `v24.20.0`、npm `11.19.0`、実 `node_modules` を確認した。Goal 011の鏡廊は基準HEADに存在しない。

基準 `npm run check` は95スイート・1,046テスト、lint、typecheck、iOS exportを通過。実行時循環は iOS/Android/neutralでそれぞれ194 production modules、584 runtime edges、0 SCC/0 errors。Stage Kit定義検査も通過。実行中に新しい未参照のcampaignファイルを追加したが、Jestの基準発見件数は95/1,046、MetroのApp到達コードは基準のままである。後続の完全回帰は別に実施する。

現在の変更は、第一章の5エリア順序と第二章のplanned-only metadata、物語文とbeat台帳、厳密なcampaign checkpoint codec、既存3章の連続prefixだけを扱う旧記録移行候補、単一envelopeの保存API。04は固定輪郭の図地キー、練習と3段巻き上げ、物理格子、既存rendererを借りる単一平面鏡pass、同一身体の巡回体、指保持UIを持つ。05は制御ベイ、二経路、受鈴器、物理扉、巡回体の誘導、隔離・停止・屋外退出の独立状態とcontroller/scene bindingを持つ。04/05はStage Moduleとして `routable:true` にした。campaign純粋層では検証済みの停止・屋外checkpointだけが全体完了となる。05のcontroller機器試験では正しい位置への照準を試験内で合わせており、初回からの自然な通しプレイや動画の証拠ではない。

製品ホームとcampaign hostをAppへ接続した。新規/続き/旧記録移行/独立replayを選べ、03→04→05→屋外の画面callbackにcodec検証済みcheckpointを渡す試験では、保存後の切替、cold restore、保存失敗時の旧画面維持を確認した。このhost試験の04/05完了checkpointは構築したもので、自然な操作の証拠ではない。01〜03のHUD・機器文言を館内の次区画へ向けて更新した。「発見の記録」は実際の観察/操作bitと旧履歴の発見IDを表示し、replayで得た発見を本編位置・物語・鍵から独立した一方向のunionへ保存する。保存済みcheckpointより古い画面callbackもdomain側で拒否する。台帳のbeatは安全な初回frame、確定checkpoint、03の実際の設備音調査、終幕画面に結び、発火と提示を別々に保存する。短い冒頭文は操作可能なHUD、途中の記録はcontrollerを一時停止した表示と確認ボタンで提示する。控えめな怖さでも03の設備音へ巡回体が調査に向かうが、追尾・接触は行わない。まだすべてのbeatを自然経路で視認確認したわけではない。`contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false`。ローカルコミットは段階ごとに行い、push・PR・クラウドビルドを行わない。

途中検証：05 moduleとcontroller接続後の全Jestは106スイート・1,084テスト成功。campaign hostと文言更新後の全Jestは108スイート・1,092テスト中1件失敗。展示室の操作時刻がJest環境で直前より約400ms巻き戻り、正常操作が `stale` になる原因を特定して修正した。対応する単独テスト23件と展示室ルートの6回連続再実行は成功。発見履歴と進行判定共有後の全Jestは108スイート・1,096テスト成功。物語表示と控えめ設定の設備反応後の全Jestは108スイート・1,099テスト中、映写室ルート1件失敗。映写室も生成時刻が直前のdevice commandより戻る事象を確認し、展示室と同じ時刻単調化を適用した。映写室ルート6回連続再実行は成功。修正後の全Jestは108スイート・1,100テスト中、新しい時刻回帰テストだけが失敗。テストが現在時刻より小さな固定値を未来と仮定していたため修正し、関連5スイート42テスト、型検査、lintを通過した。

公開準備は別差分として着手した。表示版/パッケージ版を1.0.0へ設定、EASのpreview/productionとremote build versionを追加し、既存Bundle ID/projectIdを保持した。ローカル `expo install --check` が示した7件だけ同一SDK内の推奨パッチへ更新後、差はなく、Doctorは21/21通過。自作の1024角アイコンと透過起動画面を作り、同SDKの `expo-splash-screen` 57.0.9で設定した。`npm audit` は更新前後moderate 10件、splash依存追加後11件、high/critical 0。Skiaの同梱ライブラリコピー用scriptだけ許可し、unrs-resolverの欠けたbinding取得と任意fseventsは拒否した。production exportのiOS/Android source mapでは開発用6画面とStage Kit probeが除外され、5エリアと同梱asset 10点を検査した。詳細と未確認は `docs/RELEASE-CHAPTER-1.md`。設定にアプリ情報/クレジット/端末内保存の説明/サポート復旧案内を追加したが、正式なprivacy URLと問い合わせ先はオーナー未提供で、release blockerのまま。

04標準では、鍵と練習をcodecで検証した途中入口から衝突付きの実controller操作で保持中に捕捉され、保持指の解放barrier、鍵・歯止め保持、safe pose、cold復元後の格子通過・出口を確認した。これは全章経路・動画ではない。

04単独では実controllerの歩行・照準・鍵取得・保持三段・途中退避・物理格子通過を行った。保持中の実カメラで鏡内の巡回体を見られない配置だったため、鏡を巻上機の傍に移し、画面外では反射passを省いて最初の可視frameで更新するようにした。05単独では、鍵を持った有効入口から実controllerの旋回・歩行で装置を順に操作し、ベルによる全身収容、観察窓からの確認、隔離、停止、屋外床への歩行と退館まで通した。初回Software WebGL動画で身体が壁に隠れる問題が見つかり、衝突を保つ観察窓と屋外の建物境界・床を追加した。さらに同じ実controllerの衝突付き歩行経路で、早すぎる閉扉の拒否→ベル誘導→閉鎖途中の手動開け直し→再誘導→隔離・停止・屋外まで通し、開け直し状態のcodec復元も検査した。この復旧経路は動画ではない。両動画と環境/計測は `docs/qa-goal013/README.md`。04と05は別実行であり、05の入口は04の鍵をcodecで構築した。native preview、実音・実HUDを伴う01→05連続プレイは引き続き未確認。

その後、Node/Jestのcampaign domain hostで新規sessionから5つの実controllerを順に操作する連続試験を追加した。標準はB→C、控えめはC→Bで成功し、隔離キーの引継ぎ、05停止checkpointの保存、屋外完了、各遷移後のJSON codec再parseを同一runIdで確認した。経路とrevisionは `docs/qa-goal013/natural-route-*.json` に記録した。さらに同じ経路をJestのApp hostへ接続し、各画面にマウントされたcontrollerの操作結果を同一App起動で画面leaseから保存した。標準/控えめの両方で5エリア完了、Canvas mock peak 1・終了後0、App再起動後のエンディング入口を確認した。実AsyncStorage、native Canvas/音、動画ではない。Appログは `docs/qa-goal013/app-natural-route-*.json`。

途中checkpointと物語提示の書込失敗時に、Appがゲームを一時停止し、再試行と起動中のみ継続を明示する導線を追加した。JestのAsyncStorageモックで再試行失敗の反復、成功後の保存・再開、起動中だけの記録と元raw保持を確認した。書込を依頼した直後にホームへ退出しても、同じleaseの失敗通知と再試行をホームで受け取れるようにした。JestではCanvas owner 0・元raw保持・再試行後の保存を確認した。端末での実容量不足やnative Modalの重なりは未確認。

05完了のenvelopeを保存した直後、エンディング画面の提示callbackを試験で抑えてAppをunmountし、cold起動で本編完了とエンディング入口が残ることを確認した。再表示時に未提示の正体・屋外beatを記録し、runId・完了エリア・最終措置が不変である。JestのAsyncStorageモックと検証済み05 checkpointを用いたhost試験であり、端末の強制終了試験ではない。

停止後のbeatを読む前に屋外退館した場合、巡回体の正体の提示記録だけが未了で残る経路を修正した。エンディングに台帳の確定文と在館反応01→00を表示し、両beatの提示記録を保存する。App試験で表示・保存・cold再開を確認した。

標準B→CのApp経路に、各エリア後の4回のcold restore、各エリア2回のホーム再入場、完走後の05→01逆順replayを追加した。計20回のCanvas mock入場を通じてpeak owner 1・退出後0、同じrunId、次エリアの安全入口、旧画面callbackの拒否、逆順replay後に本編セーブ原文が変わらないことを検査した。ログは `docs/qa-goal013/app-natural-route-standard-cold.json`。実GPU/音ownerと端末保存の検査ではない。

01〜03の変更前後動的QAでは、Goal 012のゲームソースと現ソースに同じseed・camera・入力を渡した。01は実App入口こそ旧Stage Selectと製品ホームで違うが、入室後の30旋回frame→実HUD非常灯操作→60無入力frameを比較した。seed73、camera行列90 frame、最終pose、非常灯の受理が一致し、Goal 013の目的文と新しい点検記録overlayの表示差を確認した。QA用Three hostは点灯後のprops更新で再構築している。02の長さ調整と03の灯り調整は、各timelineと独立Software WebGL動画がbyte一致した。左右同時の比較動画、SHA-256、ソース基準と観察限界は `docs/qa-goal013/area01-before-after.json` と `area02-03-before-after.json` に記録した。各経路は一操作に限る。エリア全体の実機見え方は未確認。

App hostのエリア境界では、完了envelopeを先に保存した後、そのエリアで発火して未提示の短文を旧Canvasの停止中に順に提示し、確認bitを保存してから次のCanvasを起動する。標準・控えめの自然操作ログでは01の非常回路、02の収容手順、04の隔離キーが各境界で表示され、Canvas mock ownerは1を超えなかった。提示bitの書込失敗は旧Canvasを保ったまま再試行または起動中のみ継続でき、保存済み完了envelopeを上書きしない。境界表示前にcold終了した場合は次エリアの安全入口で未提示文を出す。03の任意観測や05の手順を含む全beatの自然経路・実機視認はなお未確認。

最終ローカル自動検査：`npm run check` はlint・型検査・109スイート/1,115テスト・iOS production exportを通過した。lintは途中で一度配列型の表記警告を出したが、表記を修正して警告0を確認した。追加のsource map付きiOS/Android production exportでも5エリアとJS asset各10点を確認し、開発用6画面/probe/QA用経路は含まれない。実行時循環はiOS/Android/neutralとも222 production modules・682 runtime edges・0 SCC/0 errors。Stage Kit定義検査、`expo install --check`、Doctor 21/21も通過。`automatedChecksPassed=true` とし、上記の未実施を理由に `contentComplete=false`、`nativePreviewVerified=false`、`releaseReady=false` を維持する。
