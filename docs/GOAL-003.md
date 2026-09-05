# Goal 003 — 一人称の錯覚探索章

## 実装した体験

ホーム → 初回だけ既存3問（またはスキップ）→ 短い操作案内 →「帰り道のない入口」→ 脱出結果。保存済み設定では調整を省略する。3問・強さ回答なし・通常開始まで5タップ／スキップと設定済みは2タップを維持する。章の初見5〜8分は設計目標で未計測。

左スティックで連続移動し、右ドラッグでyaw/pitchを変える。照準・距離・遮蔽を満たす対象を調べる。短い歩行と角度旋回の簡単操作、左右配置、感度、補助、減動、低品質、3段階ヒントを実装。色比較は任意。タイマー、スコア、死亡、敵、課金はない。

床のしるべを調べる→中央の輪を踏む→奥の装置で封印A。鍵の観察位置と視線を合わせ「重ねる」で封印B。帰路から同じ入口へ戻ると奥が広い出口の間に変わり、最後の扉を調べて向こうへ歩くと脱出する。戻れる小部屋、回り道と短い帰路を含む。[完全な攻略](FIRST_PERSON_CHAPTER.md)

旧2.5D迷宮・旧レール・最小一人称確認室は開発ビルドの設定画面に残す。通常「遊ぶ」は一人称へ進む。12問詳細調整と純粋な判定ロジックを維持する。

## 描画と状態

Three 0.185.1、R3F 9.7.0のnative Canvas、expo-gl 57.0.2を追加。asset 57.0.16、file-system 57.0.6を直接宣言し、@types/three 0.185.4を開発依存に追加。既存Expo 57.0.20／React 19.2.3／RN 0.86.3を更新していない。使用版peer、npm公開情報、Expo推奨範囲、native入口を確認した。[設計と一次資料](ADR-003-FIRST-PERSON.md)

worldの床・壁・扉からmeshと衝突を作る。カメラ・描画ループはR3F、連続入力・姿勢はref、UIは意味のある変化時だけ更新。ThreeをReanimated workletに渡さない。円と壁の分割移動、支持床、dt上限、実カメラ行列、視線rayを使う。開く扉のmesh位置と衝突位置は同じ開度に従う。

RN 0.86 Fabricのglobal changedTouchesと領域別targetTouchesを実装資料で確認し、左右同時タッチを領域のIDで分離する。取消・領域外・中断時は入力をゼロにする。古い画面通知、保存、完了処理はmount状態・session leaseで保護。

床の色模様はunlit/opaqueの単一DataTexture。色だけをlinear sRGBのRec.709グレーへ変換し、sRGBへ戻す。カメラ・形・接続は同じ。Skia開発ラボにも同じパレットを表示する。通常の3D、色による見かけ、鍵の投影、部屋差し替えは別の仕組みで、科学的な測定・等輝度・必ず錯視が消える保証には使わない。

帰路のvariantは両封印後、プレイヤーが変更領域外にいて、変更する全直方体が固定不透明壁に隠れる証明があるときだけラッチ。床と天井の厚みまで範囲に含める。前後のworldで安全位置を確認し、variantから描画と衝突を一緒に変える。画面外の一点だけで差し替えない。

## 保存と既存変更の保護

既存v1/v2を維持し、詳細生回答・プロフィール・旧スコアを保持する。別キー:

- `chroma-rift.first-person.chapter.v1`: schemaVersion/chapterId/levelVersion、安全な名前付きcheckpoint、しるべ／輪／封印／variant／最後の扉／clear。
- `chroma-rift.first-person.controls.v1`: 感度、操作方式、左右配置、品質。

毎フレーム保存しない。進行イベント・一時停止で保存し、再開は手動。壁内・不正位置・既知旧layoutは安全地点へ戻す。未知版やJSON不正は元の文書を保持して書込を止める。章リセットは旧設定を保持、全削除は旧新キーを対象にする。非同期の古い読込や保存による復活を防ぐ。

作業開始はGoal 002の0d739bf。既存ユーザー変更はapp.jsonの暗号化設定のみ。開始時のstatus、差分、ハッシュを.expoに記録。app.jsonのSHA256は開始・終了で一致:

`4f2b9d3876ccbd2332e0b1c2e5cadd7646a2d2e63f7f126dd069049a303073d8`

この変更はコミットへ含めない。projectId、owner、Bundle ID、署名、向き、番号管理は変更していない。eas.jsonはdevelopmentClient/internal、ios.buildNumberやautoIncrement/appVersionSourceは未指定の既存方針を維持。

## 検証

Node v24.20.0 / npm 11.19.0、WindowsからWSL Ubuntu 24.04で実行。

| 項目 | 結果 |
| --- | --- |
| npm run lint | 成功 |
| npm run typecheck | 成功 |
| npm run test | 18 suites / 214 tests成功 |
| npm run export:ios | native依存を含む1410 modules、Hermes 5.8 MBをexport |
| npm run check | lint→typecheck→Jest→iOS JS export成功 |
| npm run doctor | 21/21成功 |
| npx expo install --check | Dependencies are up to date |
| git diff --check | 成功 |
| app.jsonのSHA256比較 | 一致 |

元の11 suites / 127 testsを削除して成功させていない。旧2.5Dの画面テストは開発用入口へ期待値を移し、完走検証を維持した。新しいAppの全章フローはnative Canvas境界だけを置換し、実際の移動・衝突・照準・状態・保存を通す。3問／スキップ／再起動／詳細調整／不正保存／リセットも検証。Jest境界の成功はnative GLの描画確認ではない。

追加検証には薄い壁・角・dt差、扉、背後／遠方／遮蔽、対象ID一致、同時タッチbatch、解答の冪等性、全章の実歩行、途中checkpointから次の仕掛けへの経路、異なる縦aspectでの実Three行列、全変更範囲の遮蔽・包含、旧保存保護、古い通知拒否、10 mountのdisposeを含む。

監査は前後ともmoderate 10、high/critical 0で、該当パッケージ名も同じ。既存CLI系の指摘に強制更新は行っていない。lock内の既存版変更はなく、Expo間接依存の同版hoistと新依存を確認。@types/three由来のRapier互換パッケージは間接開発依存として存在するが、本編へ物理エンジンは組み込んでいない。

初回lintは補助プレビュー用に.expoへコピーした依存ソースを拾ったため失敗。生成キャッシュ.expoをESLint対象外へ追加し、実装ソースを含むlint全体が成功した。

## 視覚確認・実機確認待ち

実際のChapterSceneのmesh/materialを使うブラウザー補助プレビューを生成したが、Chrome起動が実行ポリシーに拒否された。拒否の詳細は返されず、画像を取得・視覚確認していない。iPhoneの新ビルドも操作していない。

GL shader、実機の前後関係、色、左右同時操作、VoiceOver、触覚、文字拡大、酔い・目の不快感、初見所要時間、発熱、電池、frame time、60fpsは未確認／未計測。10 mountテストはdispose呼出しの確認で、実機GPUメモリーの増加がない証明ではない。

低品質はtexture 256→128、円の分割と装飾を削減する。native CanvasのDPRを下げる実装ではない。開発用のpause計測表示は実行時のframe intervalとrenderer.infoを参照する。100 draw calls程度・60fpsは設計目安で、達成値ではない。

平坦室・単純壁に限定。落下、ジャンプ、物理エンジン、自由ポータル、動的影、postprocess、共有API、カメラ／センサー権限、バックエンドは実装していない。

## 引き渡し

ネイティブ再ビルドが必要。旧Skia Development BuildではExpoGLの存在確認後に案内からホームへ戻し、native importを評価しない。新ビルドの作成・インストール・Metro接続・実機チェックは[IPHONE_VALIDATION.md](IPHONE_VALIDATION.md)を参照。

作業ブランチは `feat/goal-003-first-person`、worktreeは `/home/mhirotaka/workspace/chroma-rift`。関連する変更だけをコミットし、ユーザーのapp.jsonは未コミットで残す。push、PR作成、認証、EASクラウドビルドは実行しない。

主な変更箇所はApp/画面状態、src/domain/firstPerson、src/rendering/firstPerson、FirstPersonScreen/NativeFirstPersonGate/結果画面、firstPersonStorage、各回帰テスト、依存lock、READMEと本Goalの文書。コミットIDと正確な未コミット一覧は最終報告に記載する。
