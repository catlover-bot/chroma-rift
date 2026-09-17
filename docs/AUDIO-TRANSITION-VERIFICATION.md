# Goal 014.1 音声の遷移・復帰検証

判定は **ローカル実装・契約テスト確認済み / DEVICE_ACCEPTANCE=PENDING / RELEASE_READY=false**。ユーザー報告は「2ステージ目以降は音がなかった」であり、音楽だけの不具合とは限定していない。今回、iPhoneの音声出力や聴取は確認していない。

開始点は `393e58e59d73a65455b423d3aba9fdefe6c6d8de`、作業場所は `chroma-rift-goal012`、ブランチは `fix/goal-014-1-audio-and-player-ui`。機械可読の出典、ソース・資産hash、実行ログと途中の失敗は [audio/verification.json](qa-goal014-1/audio/verification.json) に保存した。この資料の focused 実行と、最終全体check・exportは別の証拠として扱う。

## 確認した不整合と原因の確度

|項目|確認できたこと|確度・限界|
|---|---|---|
|曲の読み込み失敗|旧musicDirectorの失敗がownerの`failAudio()`へ伝わり、正常な環境音・効果音も解放、availabilityがunavailableになる。新しい回帰テストは修正前に失敗した。|コード上の不整合を再現。報告されたiPhoneで、この条件が起きたかは未確定。|
|個別playerによる共有session停止|採用中expo-audio **57.0.5** のSwiftは、`keepAudioSessionActive:false`のpause/終了後、100ms待ち、再生中playerが一つもない場合だけsessionを停止する。旧owner停止と新曲bufferingの重なりを契約fakeで再現した。|条件付きの仮説。既に再生中の兄弟がいれば停止しない負の対照も通過。無条件にSEが全音を止めるとは結論しない。|
|同曲の再開|曲ID一致だけでplay要求を済んだ扱いにせず、取得できるplaying/currentTimeを見る。出力経路切断後の毎フレーム再起動は行わず、ユーザー/前景復帰の明示された再開で復旧する。|契約fakeで確認。実際のOS出力先・中断通知は実機確認待ち。|
|フェード|次曲のplay要求だけで前曲を消すと、次曲がbuffering中に無音になり得る。取得できるnative playingがtrueになるまで前曲を保持する。|新しい回帰テストが修正前に失敗、修正後通過。|
|nativeエラーの取得|Swift `currentStatus()`は`error:nil`を返す。失敗の文字列は`playbackStatusUpdate`イベントにだけ追加される。live状態を取得しつつ、このエラーをplayer寿命中保持する。|イベントのみの失敗がポーリングに隠れる回帰をRED→GREENで確認。|
|Screenの再開順|inactiveのownerに先にrecoverを呼ぶと復旧が拒否される。Screenは明示された再開意図を保存し、setActive後に渡す。|実Appのpause/resumeテストが旧順序で失敗、修正後通過。|

採用版の一次出典は `node_modules/expo-audio/ios/AudioModule.swift` と `AudioPlayer.swift`。該当行とファイルhashをJSONへ記録した。[Expo公式Audio資料](https://docs.expo.dev/versions/latest/sdk/audio/)も参照したが、現在の最新版資料を採用バイナリの実行証明にはしていない。

## 実装した所有権と停止・復帰

- [nativeSession.ts](../src/audio/nativeSession.ts)だけがglobal activationを管理する。ownerはleaseを有効化/解除する。操作は直列化し、前ownerのfalseが既に実行中なら、次ownerの準備完了はその後のtrueまで待つ。旧generationのprepare完了は新ownerを有効化しない。
- 管理対象の全native playerに`keepAudioSessionActive:true`を指定した。最後のactive leaseの停止、背景、全音off、全音量0、disposeでは共有管理へ停止を伝える。playerや無音音源を残してsessionを維持する処理はない。
- 既存の`playsInSilentMode:false`、録音off、背景再生offを保持。設定値を初期化せず復帰する。音楽0、環境音0、効果音0、全off、控えめ設定、音錯覚offは別条件のまま。
- 曲の失敗はそのvoiceだけを解放する。部分的な音楽復旧は正常な環境音・効果音playerを維持する。未再生の一発音は復帰キューへ積まない。seek完了はsession・epoch・slot token・250msの有効期限を照合する。
- 復旧は明示された`foreground`または`user`の意図で、ownerあたり実修復を最大2回まで行う。同時呼び出しは一本にまとめ、正常時の確認は回数を消費しない。失敗した曲を毎フレーム作り直さない。
- 読み込み期限はvoiceを作成してからの実時間5秒。非アクティブ化でvoiceを終了するため、背景で過ごした時間を次の前景ロードへ足さない。取得できるnative currentTime/終了状態で有限曲を終了し、paused中のゲーム時刻だけで曲を完了扱いにしない。
- 音楽最大2、効果音・環境音pool合計10、active ownerの最大12 playerを保持。音声owner/session管理用の新しいtimerは0。disposeはplayerとstatus購読を解放する。

**故障分類の限界:** 曲単位の失敗は分離した。一方、効果音/環境音の生成・play・seek等で分類不能な例外が出た場合は、owner poolを安全に停止して正確なphase/原因を残し、明示的な bounded recoveryを使う。これを「native全体の致命的障害が証明された」とは扱わず、各効果音asset別の回復機構を追加したとも主張しない。

## 回帰テストと実際に通した経路

音声と関連controllerのfocused最終結果は **11 suites / 107 tests PASS**。owned lint、全体typecheckもexit0。テストは [audioSessionContract](../src/audio/__tests__/audioSessionContract.test.ts)、[audioRecovery](../src/audio/__tests__/audioRecovery.test.ts)、[diagnostics](../src/audio/__tests__/diagnostics.test.ts) と既存のowner/music/assets/controllerテスト。helperは既存のtest-only規約に合わせ `src/audio/testFixtures/sharedNativeAudio.ts` へ置き、Jest/依存scanner設定は変更していない。

|経路・条件|音楽|環境音・効果音|証拠|
|---|---|---|---|
|ホーム→01→02→03→04→05→屋外→結末|実ChapterMusic/Screenのownerを使用。ホーム54秒境界を越え、各エリアと結末のnative契約playingを確認。|各エリアの室内音、05屋外音と実controllerからの効果音要求を確認。|実Appテスト。自然な同一runの保存/クリアからScreen cleanupと次エリアへ進む。|
|保存02/03/04/05の直接再開|上の自然runが実際に作った保存を、テスト隔離storageで再ロード。|各エリアの環境音、歩行効果音を確認。|Appをunmount/mountし「続きから」で入る。テスト側のcontroller差し替えで代用しない。|
|pause、設定、ノート、音off/on、背景/前景|停止条件を尊重して再開、設定値を維持。|ノートのShepardは明示操作のみ。遅れた一発音は再開しない。|実Appのメニュー操作とownerの制御可能な非同期テスト。|
|振り返り→ホーム→本編続き|別ownerへの引き継ぎを確認。|旧player全解放、本編保存が変わらない。|実Appで19回のScreen entry。|
|古いprepare/seek/fade、逆順のseek完了|obsolete完了は新ownerへ影響しない。|pause/dispose後のplayを拒否。|deferred操作を使ったowner/sessionテスト。|
|曲失敗→pause/resume|正常音を保持し、Screenがactiveになってから同じownerを復旧。|失敗中も環境音/歩行効果音が使える。|実Appの別テスト、旧順序RED→新順序GREEN。|
|経路切断・OSが再開を許可しない中断|同曲ID要求/複数フレームでも自動再開しない。明示された復旧で再開。|OS通知モデルに従って停止。|契約fake。実機の通知配送は含まない。|
|長時間・ループ・フェード・有限曲|探索曲88秒を2回超える180秒、buffering中フェード、終了曲62秒を越えた一度だけの完了を確認。|SE終了で再生中の兄弟を停止しない。|音声テスト。壁で移動距離0なら足音0の既存検査も維持。|
|12回のowner入退出/実App19 entry後|重複voiceなし。|player/subscription/lease/pending operationが0へ戻る。実AppのRAF/AppState購読も0。|音声fixtureと実Appの双方で独立確認。|

実App focused evidenceは [focused-app-audio-expanded.json.gz](qa-goal014-1/audio/focused-app-audio-expanded.json.gz) と [focused-root-screen-r4.log.gz](qa-goal014-1/audio/focused-root-screen-r4.log.gz)（App2件＋controls29件）。これはfocused実行の保存物であり、最終全体source freezeの証明と混同しない。

最終全体実行の音声traceは [final-checks/app-audio.json.gz](qa-goal014-1/final-checks/app-audio.json.gz)。全体checkは134 suites / 1,327 tests成功、530入力不変。別の [18.4秒の再開動画](qa-goal014-1/player-resume-app/README.md)でも、実Screenの完了処理による01→02／02→03、02の一時停止と同じownerでの再開、同じ実保存値を別プロセスから直接再開する動作を確認した。音声は同じ共有session fixtureによる状態記録のみで、動画に音声trackはない。

**置き換えた境界:** Reactの実App/Gate/Screen、domain/controller、音owner/director/nativeBackend/sharedSessionを実行し、GLの提示成功境界とexpo-audio native moduleだけをfixtureへ置き換えた。音声fakeは採用Swiftの共有registry/100ms停止/activation/status/中断をモデル化しているが、AVFoundationや実decoderではない。長いAppルートではseekを即時完了させるfixture設定を明記し、別テストで遅延・逆順完了を検査した。有限SEの多くはfixtureで1秒へ簡略化している。`play()`、playing=true、時刻進行のどれも、実際に聞こえた証明にはしていない。

## 途中の失敗を保持

最初のREDは共有sessionのbuffering窓と曲失敗波及の2件、負の対照1件はPASS。その後、旧keepAudioSessionActive期待/ゲーム時刻だけの期限期待、Jestがhelperを空test suiteとして発見した問題、新しい迅速pause/resumeテストの過剰な「native操作1回」期待も記録した。迅速切り替えは安全な直列`true→false→true`とready待機を検査する。部分復旧/フェード/失敗contextの3件RED、イベントのみのnativeエラー1件REDも残した。ログ一覧とsha256はJSONにある。失敗した実行を削除してall-passにしていない。

## 診断・資産・実機への引き渡し

[diagnostics.ts](../src/audio/diagnostics.ts)の`getAudioSupportSnapshot()`は軽量なleaf。version1の64件リングにarea/stage/campaign/runtime session、owner/generation、意図/対象asset、設定/停止理由、prepare/load/fade/duck、player数、native status、受理/拒否とglobal操作を残す。最初の音声失敗はowner破棄後も保持し、既存GL FIRST_FAILUREとは別。文字列は既存sanitizerと160文字上限を通す。URI、認証値、個人パス、UUID等を生でコピーせず、サーバー送信/マイク測定/録音権限を追加しない。サポートwrapperがbuild識別を付け、通常HUDには表示しない。

optional native moduleが存在しない場合は`missing-native`というavailabilityの事実を残し、架空の例外を作らない。実際のprobe/import例外はowner生成前なのでownerId0として最初の失敗を保存する。

既存6曲、15物理音、その他既存音、analysis/作曲scriptを含む**37ファイルのhashが基準と一致**。依存/package-lock、Expo/EAS/Metro/native resolverも一致。新たな4種類のローカルiOS export（preview Hermes、preview JS、production JS、development JS）すべてで、静的registryの28音源のバイトhashがmetadata内assetと一致した。[export報告](qa-goal014-1/exports/bundles.json)では448入力の前後不変、JSの225/225/245 first-party source一致、Three共有、release除外、development Metro実loaderの6順序も確認している。Hermesは実行しておらず、同梱確認をnative再生成功とは扱わない。古いGoal014の後付けmix動画は作曲資料のまま、今回のnative無音修正の合格証拠へ流用しない。

新しい同梱previewを入れた実機では、設定→サポートの詳細でmarker/buildを確認する。既存保存を消さず、01→02→03、04→05→屋外/結末、02直接再開、設定/ノート、音off/on、背景復帰を試す。各エリアで「音楽・環境音・効果音」を別々に記録し、端末消音・出力先・アプリ設定を一定にする。再発したらその時の実サポートJSONを保存する。fixtureのログや推測値を端末ログとして提出しない。実機聴取・OS割り込み・経路変更・長時間運用は引き続き未確認である。
