# 第一章の保存と旧記録の移行

第一章完了済みのホームにも確認付き再開始を表示する。確認前は完了envelopeを保持し、新周回の01入場時に旧原文をbackupへ複写してから新しいrunId・reset世代+1のenvelopeへ置き換える。App host統合試験でこの順序を検査した。保存層の処理自体は変更していない。端末の実AsyncStorageでは未確認。

第一章の単一 envelope は `chroma-rift.campaign.chapter-1.v1`。明示した新規開始時だけ、既存 envelope の原文を `chroma-rift.campaign.chapter-1.backup.v1` へ先に複写する。Stage Kit の既存キーを改名・削除しない。campaign は既存 first-person の直列 writer と session lease を使い、エリア完了と次の安全入口を一つの値で保存する。AsyncStorage の二つのキーをtransactionとは扱わない。

| 既存記録 | 現在のキー | 移行時の意味 |
| --- | --- | --- |
| 展示室 v1/v2/v3 | `chroma-rift.perception-gallery.v1` / `.v2` / `.v3` | 各版codecで検証。クリア済みなら連続prefixの01を確定。旧rawは残す |
| 収蔵庫 | `chroma-rift.uncanny-vault.v1` | 01もクリア済みなら02を確定。02だけの記録で01を飛ばさない |
| 映写室 | `chroma-rift.shadow-theatre.v1` | 01・02もクリア済みなら03を確定。01〜03が連続クリア済みなら新規04入口を作る |
| 旧入口 | `chroma-rift.first-person.chapter.v1` | 本編5エリアのどれにも再分類しない。原文保持 |
| 発見履歴 | `chroma-rift.stage-journal.v1` | 旧replayの到達・発見として保持。campaignの未観測beatに変換しない |

campaign envelope には `schemaVersion`、独立した `contentVersion` と `appVersion`、`runId`、`resetGeneration`、`revision`、現在エリア、連続完了prefix、現在の安全checkpoint、鍵の所在、物語の確定/提示bit、エリア別の観察済み発見ID、最終措置を入れる。発見IDは各Stage定義の許可集合で検証し、一方向のunionで保存する。GL、音のowner、pointer、未確定drag、frame時刻を入れない。未知版・破損原文は読み込みを `blocked` とし、自動保存を止める。明示的な新規開始なら元bytesをbackupした後に置き換えられる。保存失敗では成功を返さない。

旧記録の候補生成は `proposeLegacyCampaignImport`。全ての与えられたrawを対応codecで検査し、先頭から続くクリア数だけを使う。例えば01のみなら02へ、02のみなら01へ、01〜03なら04へ進む候補。続行エリアに有効な途中checkpointがあれば復元し、危険なposeは既存codecの安全checkpointへ正規化する。新しい物語の `presented` bitは空にする。移行はホームで本人が選んだ時だけ確定し、旧rawはそのまま残す。

02だけの旧クリア記録でも、移行前の製品ホームから02を独立練習できる。App host試験で実controllerの入口から出口・練習結果まで通し、旧02 rawのbyte一致、campaign key未生成、他4エリア未到達を確認した。Canvas/AsyncStorageはJestモックであり、実端末の移行試験ではない。

製品ホームは移行選択、`第一章を最初から`、独立replay、発見の記録、全データ削除へ接続した。新規開始の確認を経ると、未知版rawを含む現行campaignの原文を先にbackupし、その後に新しいenvelopeを保存する。保存できない遷移では現在の画面を維持し、再試行か起動中だけの継続を本人が選ぶ。05完了envelopeが保存されたあと結末表示前にアプリが終了した場合、次回起動では本編完了のホームからエンディングを開ける。未提示beatの記録は表示時に後続revisionで保存する。replayで見つけた発見は本編位置を変えず、検証済みcheckpoint由来の発見IDだけを永続unionに追加する。既存standaloneの各保存は開発用経路で独立して動く。途中checkpoint・物語提示・replay発見の保存が失敗した場合は実controllerを一時停止し、保存再試行か「この起動中だけ続ける」を選ぶ。再試行は直列writerの後で最新のメモリenvelopeを保存し、失敗が続く間は保存済みと表示しない。起動中だけ続ける場合、後続の自動保存を止め、ホームの発見記録はメモリ上で維持する。保存依頼直後のホーム退出でも同じleaseが有効なら失敗を表示し、再試行を受け付ける。App/AsyncStorageモックの書込失敗試験で確認したが、端末の容量不足・OS強制終了は未検証。
