# Goal014.2 — 機構の同一視点比較

旧版は `5bd34f26b65558e8da1cffd9d22ee93c0db78258` の実際の TypeScript/TSX を `git show` で読み込み、新版は作業ツリーを読み込んだ。別プロセスで同じカメラ、画角65°、装置状態を実 scene と FirstPersonScreen に渡した。26視点×通常／文字非表示×2版＝104画像、52組の一致検査。全カメラ位置を各版の実worldで `isSafePose` 検査した。

これは **静止条件の視認性検査**。姿勢・歯止め・敵位置を指定するfixtureを使用し、実入力で脱出できる証拠には用いない。実入力の経路・捕捉・復帰は別の経路検査を参照する。

## 実装と確認範囲

- 練習機：大きな握り、軸、巻き胴、溝付き滑車、短い重り、受け台を一つの装置にした。重りは0.30m動き、ロープの下端は重りの上端に追従する。0.55秒の成立条件は変更していない。
- 本機：握りから巻き胴、共有出口点、3個の滑車、格子上端の金具まで連続する経路。格子の上昇に従って最後のロープ区間が短くなる。3個の歯止めは確定後も位置を保持する。
- 格子：描画する9本の縦桟・4本の横桟は、実LOS要素と同じ共有bounds。移動用包絡は維持し、透明な隙間を一枚のopaque板として扱わない。上がった格子は上部の受け枠に収まり、前室床と開いた扉が見える。
- 棚：実solidと同じ不透明な在庫・背板、棚板・支柱・箱の面で、隠れる深さを示す。両端の0.75m開口は共有rack定義から決まり、飾りのcolliderは追加していない。
- 鏡：yaw1.32→1.78、描画幅1.20→1.40m。高さ1.20m、カメラ/FOV、反射実装、敵モデルは維持。操作用矩形も同じ寸法から導く。
- 01：試料の取っ手、トレーの留め具、円盤の小さな支点。試料色・寸法、円盤の誘導子と角度判定、錯視の補助線は変更していない。
- 02：可動の握りと固定基準のボルト、比較用の折り畳み形状と確定用の留め具を分離。長さ・飾り・許容差は維持。
- 03：光源の握り、受光側のラッチから扉へ続く配管。光源、投影、受光窓、Ames、鈴・仕切りの判定は維持。
- 05：隔離レバーと閉鎖対象を結ぶ配管、停止側の絶縁支持と端子。既存のキー穴・鈴・操作位置・実判定は維持。

## 観察

練習機の接近位置では、握り、ロープ、受け台、上昇した重りが同じ縦画面に収まる。巻き上げ機の通常の作業構図では手元・ケーブル経路・格子が見える。正面に近い格子比較では、閉鎖時の鉄材と、上昇後の床・次の扉を区別できる。

鏡の中央側 `(-2.05,10.05)` と東側 `(-1.8,10)` の合法位置では、同じ敵の反射像を確認した。敵を反射passだけで除いた別QA描画との差は、390×844で3,876／3,946画素、320×568で1,781／1,822画素。旧版はこの同一条件では0画素。これはCSS HUD合成前のWebGL framebufferの差で、読み取りやすさの人間実測ではない。

復帰地点 `(-4.05,10.7)` は南東の開口へ向くyaw−0.8408966686、pitch0。画面右は棚で、壁と棚の間の床が一部見える。隠れた角を回る構図であり、遮る物のない出口ビューとは主張しない。南側への接近ビューは棚端の床の開口を示す。

西側 `(-2.45,9.6)` の手元・格子を含む構図では、反射した敵の画素数は0。敵の実体は画面左に見える。この構図を「常に鏡で危険が見える」とは扱わない。

## 検査と限界

`readableMechanisms.test.tsx` は、実際にマウントしたThreeメッシュで練習ロープの上下接点、重りの受け台、7段階の格子高さで全13個の鉄材boundsと移動金具、手放し後の確定歯止めを確認する。既存の安全・物理包絡互換検査を合わせて2 suites /25 tests PASS。実際のインストール済みnative R3Fを使う `nativeCanvasLifecycle.test.tsx` は75/75 PASS（129.349秒、端末GL部分は代替）。型検査・対象lintもPASS。

通常表示と文字非表示は同じ3D fixture。後者では本番コードを変えず、CSSのText、施設銘板、窓番号、表示盤の文字をQAブラウザだけで隠す。物理的な刻み、記号、レバー、読み上げ用本番情報は削除していない。

Reactの実画面をブラウザCSSへ写し、実Three sceneをSwiftShader WebGLで描画した。Yoga、EXGL、iPhone/Android端末、実タッチ、実音、初見利用者の理解度の検査ではない。反射した敵の寄与を調べる追加描画はQA専用で、本番の反射pass数を示さない。

各版174個の読み込みソース、42資産、10個のQA/依存ファイルをhash検査。全52 scene破棄でgeometry0・texture1の事前warm baselineへ戻り、renderer.dispose後のprogram数0。texture1はThree0.185.1の共有DFG_LUT。破棄後の端末GPU解放やdevice FPSを測定したという意味ではない。

サンプル中のmain draw call最大値は旧125／新145、三角形数は旧22,116／新33,020。カメラによって見える物が異なるため、これは全ゲームの負荷上限ではない。

`before-report.json.gz` / `after-report.json.gz` は元レポートの圧縮保存、`comparison.json` は全一致組、`manifest.json` は選択画像と検査ログのSHA-256。巨大なscene JSONは `.expo/goal014-2/mechanisms-final` に保存し、このdocsには全104枚のPNGを保存する。再現コマンド：

```sh
node scripts/qa-goal014-2-mechanisms.cjs --out=.expo/goal014-2/mechanisms-repeat
```

## 準備中の失敗を保持

最初の機構検査は `7.3` と行列計算結果 `7.300000000000001` の厳密等値1件が失敗した。接点の検査を緩めず、同じ実寸値を小数6桁で比較するassertionへ修正した。幾何boundsと接点距離の既存1e−6検査は維持した。途中のwinch比較1回は、軸の追加で `MechanicalDevices.tsx` が変わったことをsource guardが検出して拒否した。この途中画像は最終証拠に再利用せず、凍結後に全比較を再生成した。両ログはhistoryに保存する。

## r8の古い「裏側」fixtureの更新履歴

最初の19case実行は `fixedBackSkipped` だけが失敗した。旧QA位置 `(-2.45,7.5)` は、鏡のyawを1.78へ向けた後は表側であり、正しい反射を「裏側の反射スキップ違反」と誤判定していた。これは再実行だけで解消したものとして扱わない。

QA位置を実worldで合法な `(-2.45,13)` へ変更し、描画メッシュから求めた法線とカメラの符号付き距離が−0.02より小さいことも検査した。実測は−0.1366502812。裏側でfallbackを使い反射を描かない、表側へ戻れば更新する、全既存GL検査は保持し、裏側条件を強めた。productionのr8 adapter/reflectorに変更はない。

更新後は19cases（10回の新規entryを含む）と14 gatesがすべてPASS。[最終r8レポート](../final/native-framebuffer.json)のSHA-256は `2f68431498adfb63dbb75ff8a535c6458274c85a94a60685db58d0a8cd1d8fb7`。失敗時の19caseレポートとログをhistoryへ圧縮保存した。失敗時のtool SHA `bc11e05d86a1a806e6516c2be735937d465371121b0c4fb8307be3aff1d361b2` は基準コミットの同スクリプトと一致する。SwiftShaderの実WebGL2に、明示したExpo default-FBO契約のfixtureを与える検査であり、iPhone/EXGLの提示を実測した証拠ではない。

## 同一構図へのリンク

下表は文字非表示。全通常表示も同じbefore/afterディレクトリに `-normal.png` として保存する。

| 対象 | 旧版 | 新版 |
|---|---|---|
| 練習・受け台 | [旧版](before/practice-rest-390-text-hidden.png) | [新版](after/practice-rest-390-text-hidden.png) |
| 練習・上昇保持 | [旧版](before/practice-raised-390-text-hidden.png) | [新版](after/practice-raised-390-text-hidden.png) |
| 手元と格子 | [旧版](before/winch-work-west-390-text-hidden.png) | [新版](after/winch-work-west-390-text-hidden.png) |
| 鏡・中央の合法位置 | [旧版](before/winch-mirror-middle-390-text-hidden.png) | [新版](after/winch-mirror-middle-390-text-hidden.png) |
| 鏡・東側320幅 | [旧版](before/winch-mirror-east-320-text-hidden.png) | [新版](after/winch-mirror-east-320-text-hidden.png) |
| 格子閉鎖 | [旧版](before/grate-closed-390-text-hidden.png) | [新版](after/grate-closed-390-text-hidden.png) |
| 格子通行可能 | [旧版](before/grate-passable-390-text-hidden.png) | [新版](after/grate-passable-390-text-hidden.png) |
| 棚の全体 | [旧版](before/shelter-overview-390-text-hidden.png) | [新版](after/shelter-overview-390-text-hidden.png) |
| 南側の床開口 | [旧版](before/shelter-south-approach-390-text-hidden.png) | [新版](after/shelter-south-approach-390-text-hidden.png) |
| 復帰時の向き | [旧版](before/shelter-recovery-facing-390-text-hidden.png) | [新版](after/shelter-recovery-facing-390-text-hidden.png) |
| 目に見える次の扉 | [旧版](before/visible-exit-390-text-hidden.png) | [新版](after/visible-exit-390-text-hidden.png) |
| 01 トレー占有 | [旧版](before/gallery-trays-occupied-390-text-hidden.png) | [新版](after/gallery-trays-occupied-390-text-hidden.png) |
| 01 円盤の支点 | [旧版](before/gallery-disc-pivots-390-text-hidden.png) | [新版](after/gallery-disc-pivots-390-text-hidden.png) |
| 02 基準・握り・留め具 | [旧版](before/vault-length-390-text-hidden.png) | [新版](after/vault-length-390-text-hidden.png) |
| 03 光源・受光・配管 | [旧版](before/theatre-light-390-text-hidden.png) | [新版](after/theatre-light-390-text-hidden.png) |
| 05 操作群 | [旧版](before/departure-controls-390-text-hidden.png) | [新版](after/departure-controls-390-text-hidden.png) |
| 05 停止側 | [旧版](before/departure-power-390-text-hidden.png) | [新版](after/departure-power-390-text-hidden.png) |
