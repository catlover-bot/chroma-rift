# Goal 013.1 のローカル再現資料

このフォルダーは端末録画を含まない。`mirror-natural.mp4` は現在のエリア04 controller、StageScene、巡回体と平面鏡をSoftware WebGLで描いた映像。`mirror-standard-recovery.mp4` は標準難度で捕捉後の確定進行を保存し、cold復元から出口へ進む映像。各 `*-summary.json` と `*-webgl.json` は状態・描画計測を保持し、主描画と反射の合計draw callsも別に測る。`main-only.png`／`target-only.png`／`front.png` は同じscene・rendererで通常描画、target確保のみ、反射を順に試した静止画。`legacy-back.png` と `back.png` は正面反射後に背面へ移った旧挙動と修正挙動の比較。`mirror-backside-report.json` にGL結果と画像・ソースhashを置く。

画像と動画はChromium SwiftShaderであり、native EXGL、iPhoneの画面提示、FPS、音、実指、VoiceOverを検証しない。ユーザーの録画はローカルに見つからず、このフォルダーには入れていない。最初の端末例外も未取得。

`area03-to-04.mp4` と `area04-to-05.mp4` は一つの実App hostで01→05を通した保存済みruntimeを、実ChapterSceneへ5fpsで再描画した148秒の内部動画から、それぞれ30 frame／6秒を切り出した。元経路は8,794 simulation tick、App側のCanvas mock同時owner最大1、04の鍵・歯止め・出口と05の隔離・停止・屋外まで順序検査済み。`app-replay-summary.json` にframe範囲、hash、経路、Software WebGL計測を記す。これはApp native Canvasの直接録画ではなく、QA字幕が製品HUDの代わりに表示される。

`local-checks.json` は今回の全体チェック、Doctor、依存監査、実Metro/Three、循環と保護ファイルの小さい索引。npm auditのmoderate 11件は失敗を隠さずexit code 1として記録した。

4本のMP4はFFmpegで全frameをデコードしてエラー0。画像として開いたのは04自然経路の4 frame、App経路の03/04/05境界6 frame、鏡の正面・旧背面・新背面の3枚。人が4本を全編連続視聴した記録ではない。
