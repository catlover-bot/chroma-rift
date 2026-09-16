# 第一章「最後の退館者」— ギミックの目的と反応

Goal 014 / 2026-09-16。現行01〜05の本編worldに登録された41対象（同じ装置の両面取っ手・取得物も別対象として数える）を下表に列挙する。旧章と開発確認室は第一章の対象外。世界観の呼称は「巡回体」「隔離キー」「収容区画」「職員出口」で統一する。

根拠は各areaのdefinition/world、command reducer、presentation selector、checkpoint codec。見た目・音・入力の実機評価をこの表だけでPASSにしない。ローカルの経路・画面・音の成果物は [Goal 014 QA](qa-goal014/README.md)、実機の未確認項目は [iPhone検証](IPHONE_VALIDATION.md) を参照する。

## 操作と表示の共通境界

- 通常HUDの主文は現在の目的。対象の短い操作文と、必要な条件・進捗を別に出す。04/05の `ready / locked / operating / completed` は各stageのpure selectorをHUDとcommandの両方が参照する。01〜03は既存の装置status/evaluatorを保持する。
- 画面上の対象取得には距離、向き、遮蔽、現在session、提示準備完了が必要。下表の「未達条件」はその装置固有の条件であり、この共通取得条件を省略しない。
- feedbackの所有者はarea/session/現在目的/進捗revision/対象。いずれかが変わった文は表示対象から外す。04/05は明示的な意味上のrevision、既存areaはprogressを用いる。
- 「操作中」は完了ではない。dragは対象の握り位置から開始し、同じpointerだけがpreviewを更新する。releaseで値を確定し、別の確定操作が必要な問題ではそこで正解を判定する。cancel・pause・background・renderer再試行は未確定previewとpointerを捨てる。
- 04の保持はframe時間で進む。正常release直後は新しい左指で退避できる。保持前から残る指は操作権を取り戻さない。pause/background/retryによる中断は既存の全指解放境界を保ち、古い指で再開しない。
- 各表の「保存」は確定済み値。cold resumeはcodecの安全地点から再構築し、古いpointer、敵の途中AI、音声再生位置、未提示cueを保存しない。同一sessionのpauseはworld進行を止め、復帰後に必要な操作を握り直す。再プレイは新しい進行から始め、保存済み第一章完了を取り消さない。
- 比較表示は任意。背景・輪郭ガイド・検査窓・視点移動で理由を確かめても、それだけで問題の正解を自動実行しない。色の主観的な前後は正誤条件にしない。

## 01 閉館後の展示室

根拠: [definition](../src/domain/gallery/definition.ts)、[world](../src/domain/gallery/world.ts)、[selectors](../src/domain/gallery/selectors.ts)、[state](../src/domain/gallery/state.ts)、[checkpoint](../src/domain/gallery/checkpoint.ts)。安全地点で確定値を保存。比較用の無彩色・共通背景・輪郭ガイドはcold resumeでは通常表示へ戻る。操作中の問題からは探索へ戻り、完了した引き出し・電源・通路は保持する。

| 対象 / 目的 | 形状・配置 / 入力 | 未達条件と理由 | 即時反応 → 次の道 | 任意比較 | 保存・再開 |
|---|---|---|---|---|---|
| `gallery-light` 非常灯 | 入り口側の壁スイッチを押す | 点灯済みなら再点灯不要 | 非常灯が点き、左右の部屋と電源盤を照らす | なし | `emergencyLit`。点灯状態を復元 |
| `gallery-exit-panel` 職員通路への給電 | 非常灯隣の電源盤を調べ、2電源を接続 | 未取得なら「予備電源が二つ必要」 | 接続が成立し灯り復旧 → サービス通路が開く | なし | 2取得フラグと`powerConnected`。再接続不要 |
| `chromatic-exhibit` 展示番号13の観察 | 導入展示の平面を見て比較を切替 | 主観的奥行きの正誤判定なし。連打には比較cooldown | カラー/無彩色を切替。通路開放には不要 | 無彩色でも形・配置は同じ | 発見記録のみ。coldでは通常カラー |
| `shadow-panel` 同じ灰色2枚を探す | 影の見本から2枚を下の枠へdrag/drop、「比べる」で確定 | 2枠未配置・drag中は確定不可。不一致なら「明るさが違う」 | 同じ灰色の判定 → 下の引き出しが開く | 共通背景で見比べる。数値の灰色は不変 | 配置・判定・試行回数。つかみ中の移動は保存しない |
| `shadow-power` 予備電源を取る | 開いた引き出し内の電源を押す | 影の問題未解決では現れない | 電源がなくなり取得数が増える → 電源盤へ | なし | 取得済みを復元。再取得しない |
| `contour-panel` 3枚の切れ目を中央へ向ける | 黒い円盤の縁をdrag回転。指を離して「引き出しを開く」 | 3枚未整列・drag中は確定不可 | 切れ目の方向が揃う → 下の引き出しが開く | 輪郭ガイド。guide自体は角度も正解も変えない | releaseした角度・判定。cancelは最後の確定角へ |
| `contour-power` 2つ目の予備電源 | 開いた引き出し内の電源を押す | 輪郭問題未解決では現れない | 電源取得 → 2個なら電源盤へ戻る | なし | 取得済みを復元 |
| `wiring-panel` 隠れた線をつなぐ | 保守ベイのつまみをdragして高さ調整。release後「接続する」 | 通路への給電が先。高さ不一致なら調整を促す | 接続・留め具反応 → 奥へのシャッターが開く | カバーを動かして隠れた線を確かめる | releaseした高さ/カバー・解決を保存。preview取消 |
| `mask-exhibit` 凹面の観察 | 横向きの仮面を調べる | 必須解錠条件なし | 側面の検査窓へ案内。通路には影響なし | 正面/横から同じ立体を観察、発見メモ | 観察案内自体は進行を開かない |
| `mask-window` 構造を確かめる | 仮面横の窓取っ手で開閉 | 取得可能な向き・距離が必要 | 窓が動き側面が見える | 凹面の同じ構造を別方向から比較 | 開閉値と発見を保存 |
| `hybrid-exhibit` 閉館掲示の観察 | 掲示を調べ、実際に近づく/離れる | 必須解錠条件なし | 観察文と発見記録。通路には影響なし | 距離変化、メモの大きい成分/細部比較 | 発見を保存。メモの比較値は攻略状態と別 |
| `exit` 収蔵庫への防火扉 | 配線の先を歩き、扉の向こうから取っ手へ振り返り「閉める」 | 給電・配線解決・実際の出口側位置が必要 | 扉が閉じ追跡が終わる → 02へ | なし | `finalDoorClosed`とclearを保存。完了時は出口側 |

## 02 測れない収蔵庫

根拠: [definition](../src/domain/vault/definition.ts)、[selectors](../src/domain/vault/selectors.ts)、[state](../src/domain/vault/state.ts)、[checkpoint](../src/domain/vault/checkpoint.ts)。長さ/角度/補助表示/正解を保存し、coldでは安全ベイと確定済みの開いた格子を再構成する。ドラッグpreviewと任意仕切りの閉状態は保存しない。

| 対象 / 目的 | 形状・配置 / 入力 | 未達条件と理由 | 即時反応 → 次の道 | 任意比較 | 保存・再開 |
|---|---|---|---|---|---|
| `vault-length` 搬出通路の留め金 | 上下の棒と端の輪。右端を水平drag、release後固定 | 指を離すまで確定不可。長さ不一致は「まだ収まらない」 | 輪・棒が動く → 留め金が収まり格子が開く | 端の飾りを畳む/測定ガイド。棒そのものの長さは不変 | 確定長・解決・補助設定。握り位置は捨てる |
| `vault-rod` 制動ロック | 奥の安全ベイの針。端をdrag回転、release後ロック | 長さの通路開放が先。鉛直不一致なら下げ振りを促す | 針が回る → 制動ロック解除、搬送路へ | 傾いた枠を隠す/下げ振り。真の鉛直は不変 | 確定角・解決・補助設定 |
| `vault-cafe` 傾きの観察 | 棚側面のタイル展示を調べる | 必須解錠条件なし | 中立比較表示を切替。通路には影響なし | タイル周囲の効果を取り除いて比べる | 発見と`cafeNeutral`を保存 |
| `vault-partition` 視線を切る | 搬送路側へ抜けた仕切りの取っ手を押す | 制動解除・仕切りの先の位置・巡回体が閉鎖部にいないこと | 仕切りを閉じ、通路の視線を切る | なし | 同一sessionでは保持、coldでは開く。clearの必須条件ではない |
| `vault-exit` 映写室への扉 | 安全側へ歩き、取っ手を見て閉める | 制動解除と出口側の実位置が必要 | 扉が閉じ巡回体との区間が終わる → 03へ | なし | 完了を保存、出口側の安全地点で復元 |

## 03 影の映写室

根拠: [definition](../src/domain/theatre/definition.ts)、[environment](../src/domain/theatre/environment.ts)、[deviceStatus](../src/domain/theatre/deviceStatus.ts)、[state](../src/domain/theatre/state.ts)、[checkpoint](../src/domain/theatre/checkpoint.ts)。光学の正解は光源・遮蔽物・2受光窓の同じ計算で決まる。任意誘導装置はAIに音源位置を伝えるが、追跡中でも必ず誘導成功する装置ではない。主通路の危険は続く。

| 対象 / 目的 | 形状・配置 / 入力 | 未達条件と理由 | 即時反応 → 次の道 | 任意比較 | 保存・再開 |
|---|---|---|---|---|---|
| `theatre-light` 2受光窓へ照明 | 光源レールの取っ手をdrag。release後「灯りを固定して扉を開く」 | 未release・一方に影が残る間は固定不可 | 光源→影→窓1/2の光表示 → 格子開放 | 固定後も灯り/影/窓を任意観察 | rail確定値と受理を保存。coldでは格子は開放済み |
| `theatre-inspection` 側面の点検窓 | Ames展示の検査取っ手を押す | 灯りの固定が先 | 点検窓が開き側面歩廊から構造が見える | 正面と側面を自分で歩いて比較 | 開放を保存。再開放不要 |
| `theatre-ames-side` 部屋の構造 | 点検歩廊から展示を調べる | 点検窓を先に開ける | 構造の発見記録 | 同じ寸法の展示を異なる視点から見る | 発見を保存。FOV/部屋寸法を解法補助で変更しない |
| `theatre-bypass` 保守通路 | 側面歩廊奥の戸取っ手を押す | 点検窓を先に開ける | 戸が開く → 映写機側へ別の歩行経路 | なし | 開通を保存 |
| `theatre-projector` 音で注意を移す | 左奥のクランクを選び、十分に回してrelease | 光源固定が先。作動・cooldown中は待つ。不足回転ならもう少し回す | 回転→映写機作動、この場所から音 → 移動の機会 | 実音源と動きを観察。聞いたかはAI側の判定 | 作動5秒/cooldown/未完回転はcoldでは初期化。pauseは時間停止 |
| `theatre-bell-a` 奥の受鈴器へ誘導 | 西側の番号1押し板。押す | 光源固定が先。自身のcooldown8秒 | 対応する遠方受鈴器から音。必須通路は変えない | 押し板と受鈴器の対応を世界で見る | Bと独立。coldでcooldown/activationを初期化 |
| `theatre-bell-b` 手前の受鈴器へ誘導 | 東側の番号2押し板。押す | 光源固定が先。自身のcooldown8秒 | 別の受鈴器から音。Aの状態は変えない | 同上 | Aと独立。coldで初期化 |
| `theatre-shutter-south` 任意仕切りの南取っ手 | 西通路の手動仕切りを開閉 | 光源固定が先。移動中・閉鎖範囲の占有中は閉じない | 板が動き同じcollider/遮蔽が変わる | 板の見た目と遮蔽を見返せる | 北側と同じ1枚。同一pauseは保持、coldでは開放 |
| `theatre-shutter-north` 任意仕切りの北取っ手 | 同じ板の向こう側から開閉 | 南側と同じ閉鎖安全条件 | 向こう側から再開放し、行き止まりを避ける | なし | 南側と同じtransient。進行保存条件を増やさない |
| `theatre-curtain` 防火幕で区間を閉じる | 奥の狭い入口を通り、制御室側の取っ手を押す | 光源固定、制御室側、安全に幕を下ろせる位置が必要 | 幕が下がり通路を封鎖 → 点検回廊まで歩いて04へ | なし | 受理/封鎖/完了を保存。coldは確定した安全側状態 |

## 04 鏡越しの回廊

根拠: [definition](../src/domain/stages/mirror-corridor-v1/definition.ts)、[selectors](../src/domain/stages/mirror-corridor-v1/selectors.ts)、[session](../src/domain/stages/mirror-corridor-v1/session.ts)、[checkpoint](../src/domain/stages/mirror-corridor-v1/checkpoint.ts)。練習と本機は別形状・別の危険方針。練習前室には物理的な狭い入口があり、本保持中には巡回体の探索・追跡が進む。

| 対象 / 目的 | 形状・配置 / 入力 | 未達条件と理由 | 即時反応 → 次の道 | 任意比較 | 保存・再開 |
|---|---|---|---|---|---|
| `mirror-corridor-figure` 余白の理解 | 向き合う横顔と中央の余白を観察 | 必須検査フラグにせず、キーは実物を取得 | 「二つの横顔と中央のキーは同じ輪郭」を返す | キー取得後にも、残った横顔が同じ輪郭だと見返す | 観察記録を保存。再調査は短い観察文 |
| `mirror-corridor-key` 隔離キーの取得 | 横顔の余白にある白いキーのつまみを押す | 取得可能な距離/向き。取得後は二重取得しない | 実物キーが外れる → 練習・本レバー・次areaの差込口へ | 取り外した部分と輪郭は同形 | `keyTaken`を保存。05へ引き渡す |
| `mirror-corridor-mirror` 背後の確認 | 本機付近の鏡を向く/調べる | 準備完了した同じsceneの反射。検査自体は攻略条件なし | 同じ巡回体の動きを反射で見せる | 主視点と鏡で同じ身体・動き・位置を確かめる | 観察記録だけ保存。反射画像や別AIを保存しない |
| `mirror-corridor-practice` 保持の練習 | 低い台・短い取っ手・小滑車と重り。保持開始→.55秒で1回完了→release | 練習未完なら再度保持。完了後は「練習完了」 | 小さな重りが上がる → 本機へ進む | 同じ保持/解放の操作を安全な前室で確かめる | `practiced`を保存。途中秒は取消。coldで握り直し |
| `mirror-corridor-winch` 格子を巻き上げる | 大きい巻き上げ機の取っ手を保持。視点/移動は保持中停止、releaseで退避 | キーが先、次に練習。0/3〜3/3を示す。完了後は保持不要 | 歯止めが1段ずつ確定、格子が上がる → 全3段で通過 | 実物の歯止め・格子・鏡を任意に見返す | 0〜3段の整数を保存。release/cancelは未完の端数だけ捨てる。旧pointerは復活しない |
| `mirror-corridor-exit` 制御室への前室 | 開いた格子を自分で抜け、出口を操作 | 3段固定、保持終了、格子の向こうの実位置が必要 | 前室に到達 → キーを保持して05へ | なし | clearと安全地点を保存 |

## 05 退館制御室

根拠: [definition](../src/domain/stages/departure-control-v1/definition.ts)、[selectors](../src/domain/stages/departure-control-v1/selectors.ts)、[session](../src/domain/stages/departure-control-v1/session.ts)、[checkpoint](../src/domain/stages/departure-control-v1/checkpoint.ts)。低い斜め操作盤から受鈴器・収容区画・隔離扉を見られる配置。完成状態でも操作対象を残し、古い手順を再要求しない。判定は画面の見かけや巡回体の中心点でなく実身体包絡を使う。

| 対象 / 目的 | 形状・配置 / 入力 | 未達条件と理由 | 即時反応 → 次の道 | 任意比較 | 保存・再開 |
|---|---|---|---|---|---|
| `departure-key` 操作盤を有効化 | 04のキーと同形の差込口を押す | キー未所持なら04で取得。接続済みは再要求しない | キー接続 → 収容手順へ | 余白のキーと同じ輪郭を対応付ける | `keyInstalled`、所持消費を保存。r8旧安全poseも読める |
| `departure-procedure` 操作順を理解 | 図のある手順板を読む | キー接続が先 | 受鈴器への誘導→隔離→停止を案内 | 現物の受鈴器・境界・戸を見比べる | `procedureRead`保存。完了後は現在の次行動を返す |
| `departure-bell` 収容区画内へ誘導 | 操作盤の呼び鈴を押す。受鈴器は区画の奥 | 手順が先。扉が開いていること、自身のcooldownが必要 | 受鈴器側から音 → 巡回体が入る機会 | 押した場所と鳴る場所を対応線/番号/実物で確かめる | cooldown/音/追跡中の位置はcoldでは再構築。隔離後は「誘導は完了」 |
| `departure-door` 全身を隔離 | 隔離レバーを押す | 手順、操作ベイ安全側、全身が境界内、扉sweepが空、扉停止が必要。未達を別理由で示す | 扉が下がる → 完全閉鎖で隔離確定、停止盤へ | 身体全体・床境界・戸の隙間を目視できる | `isolated`確定前の途中progressは保存しない。確定後は閉扉/収容済みを復元 |
| `departure-reopen` 閉じ直しを可能にする | 同じ隔離レバーの状態に応じた操作 | 開き中は待つ。停止後は隔離を保ち再開放しない | 隔離を解除し扉が開く → 必要なら誘導から再試行 | 同じ板と衝突/遮蔽の連動 | 同一sessionで開閉。coldは保存済み隔離の有無で復元 |
| `departure-stop` 閉館制御を停止 | 他の小操作と高さを分けた主制御レバー | 全身収容・完全閉鎖・隔離が先。「収容と隔離が先」で無効表示 | 巡回体/装置が停止へ移る → 職員出口が操作可能 | ガラス越しに収容・停止の結果を見返せる | `stopped`保存。coldでは停止演出の途中へ戻さない |
| `departure-staff-door` 職員出口を開放 | 独立した職員通路の押し棒を押す | 制御停止が先 | 扉が1.2秒で開く → 安全な職員通路と屋外へ | なし | `staffDoorOpened`保存。coldでは開放済み。旧手順/キー文を出さない |
| `departure-outdoor` 第一章の退館 | 開いた職員出口の先を実際に歩く | 停止・出口開放・屋外敷居への到達。室内の押下だけではclearしない | 屋外到達で即座にclearを保存 → 4秒の危険なし余韻 → 第一章結末 | 結末後は発見メモを任意で見る | clear後の未完音/余韻は保存しない。再入場で収容・停止を要求しない |

## P0で見つかった不一致と回帰

| 発見した問題 | 実装した境界 | 検証 |
|---|---|---|
| 04を調べても具体的な観察文がcontrollerへ届かない | `interactResult`で同じselectorの観察文を返す | `stageClarityController`: real mirror inspection |
| 手順未確認なのに05停止が操作可能に見える | 状態selectorで対象の文言/活性/理由とcommand条件を一致 | 同test: stop panel visibly locked + command explanation、`stageClarityScreen`: premature stop |
| 出口が開いても旧手順/キー案内が残る | completed対象を残し現在目的を返す。noticeにrevisionと所有対象を付ける | 同controller: open staff exit、同screen: new progress revision with same target |
| 保持を離しても以前のlook接触が退避を塞ぐ | 正常releaseは旧所有pointerのみ抑止し、新しい左touchを受理 | real TouchAdapter/Fabric event、旧look抑止・新stick後退を同時確認 |
| 練習済み・歯止めの表示と未確定保持が混同される | completedとoperatingを分け、確定済み段はcancelで失わない | 既存`mirrorCorridorHoldController`と`StageHoldButton`回帰 |
| 屋外の実歩行clearと結末画面の時刻が結び付く | clear checkpointは先に発行。`completionTail`中も実worldの衝突で歩行・視点操作を続ける | actual screenで即時checkpoint、余韻中も歩行/視点操作可、確定checkpoint不変/敵イベントなし、4秒後onComplete一回 |

最初のP0回帰テストは実装前4件すべて失敗し、`/tmp/chroma-goal014-p0-red.log`へ記録した。実装後の集約は7 suites / 64 tests PASS（`/tmp/chroma-goal014-p0-green.log`）。この内screenテストのCanvas準備完了はfixtureで、画面/controller/codecは実コード。成功表示を捏造するnative GLの検証ではない。同一対象のnotice失効テストはvalidated checkpoint fixtureでrevision変更を分離し、自然な全行程の代用とはしない。

対象数・表の照合元は `src/domain/stageKit/definitions.ts` の01〜05、動的power/door/reopenの実world。第一章以外の旧emblem操作や開発probeを、この41対象に混ぜない。全体check・本編の自然経路・描画/音・実機受入の最終結果はGoal 014 QA記録を正とする。
