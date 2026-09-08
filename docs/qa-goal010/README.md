# Goal010 視覚・動的QA

実装された Scene、光学データ、コントローラー、React 画面から生成した証拠です。7本のMP4（合計4,269フレーム）を生成し、**符号化後の動画から抽出した58フレームを時系列で実際に閲覧**しました。動画全編を実時間で連続再生した扱いにはしていません。[閲覧記録と画像hash](manual-review.json)、[成果物60件のhash](visual-artifact-manifest.json)、[全体の検証結果](verification.json)を分けて保存しています。

ソフトウェアWebGL、60Hz固定シミュレーション、30fps書き出し、実React Native hostのCSS近似です。Native Canvas/ready/presentation、音出力は検証用境界です。30fpsは動画の符号化レートであり、iPhoneの実測FPSではありません。実指、Yoga/Skia、Safe Area、実聴、錯覚の知覚、怖さ、発熱は未確認です。[実機手順](../IPHONE_VALIDATION.md)で確認してください。

## 必須成果物

| 要求 | 実際の証拠 | 確認範囲 |
|---|---|---|
| ホームと章間遷移 | [章一覧](images/home-320.png)、[gallery結果の次章操作](images/gallery-result-320-bottom.png)、[vault準備](images/vault-preparation-320-top.png)、[vault→theatre](images/vault-result-320-bottom.png)、[App記録](app-flow.json) | 実App/reducer/storage。旧2章の完了は明示した保存fixtureで、今回の走破実績ではない。次章への操作と新章への入場は実コード。 |
| 旧装置の取得 | [変更前](images/p0-before-near.png)、[変更後](images/p0-after-near.png)、[距離を取った状態](images/p0-after-far.png)、[48姿勢の比較](acquisition.json) | 同一カメラ。押せるのに操作へ入れない状態を8/48から0/48へ。近すぎる場合は無効化と具体的な理由が一致。 |
| 光源の連続操作 | [20秒MP4](clips/light-operation.mp4)、[時系列](images/light-sequence.png) | 初期、誤位置、正位置への連続ドラッグ、release、明示固定。影の元の小物、光源、影、両窓を含む。 |
| 歪んだ部屋 | [正面](images/ames-front.png)、[途中](images/ames-intermediate.png)、[閉じた側窓](images/ames-side-closed.png)、[側方](images/ames-side-open.png)、[38.83秒の実経路](clips/route-inspect.mp4) | 同じSceneの部屋・置物。実歩行と窓/側路操作。[固定幾何記録](optics.json)。 |
| 映写機と敵 | [操作あり8秒](clips/projector.mp4)、[操作なし8秒](clips/projector-control.mp4)、[ありの時系列](images/projector-sequence.png)、[なしの時系列](images/projector-control-sequence.png) | 実歩行で得た同一初期状態・同じカメラ。ありだけ0.5秒でinvestigate、5.5167秒でsearch。記憶した音源は実機構の位置。 |
| 幕・出口・結果 | [縦画面6.07秒](clips/curtain-portrait.mp4)、[下降](images/curtain-portrait-lowering.png)、[閉止](images/curtain-portrait-closed.png)、[実App結果上端](images/theatre-result-320-top.png)・[下端](images/theatre-result-320-bottom.png) | 合法な床へ実歩行して操作。幕の閉止と出口の完了を分離。実Appによる保存・結果遷移は別の結合経路で確認。 |
| 本編の通し経路 | [東側20.03秒](clips/route-east.mp4)、[観察＋映写機38.83秒](clips/route-inspect.mp4)、[捕捉→再挑戦41.37秒](clips/capture-retry.mp4)、[敵の接近](images/capture-retry-sequence.png) | 実入力経路、当たり判定、HUD、明示幕操作、出口まで。6本以上の条件別走破テストは[全体検証](verification.json)に別記。 |

## 比較条件と結果

P0の旧版は `04e481e41e0dc8ab73589e9283a110f6985157fb` の実ファイルを `/tmp/chroma-rift-goal010-baseline-04e481e` に隔離したものです。初回archiveをrepo内に置いた際はJestの重複探索を招いたため、このQA専用archiveをファイルhash確認後にrepo外へ移しました。旧版・現行それぞれ2装置×3画面×8姿勢を評価し、文字列を置き換えた比較用画面は作っていません。カメラは48件すべて不変です。現行の追加目印による最大描画数は旧100→現103 calls、4,804→5,032 trianglesでした。

光学監査はレール2,001点、独立 `Three.Ray.intersectTriangle` による各窓65×49点・41位置の面積サンプリングを実施しました。面積比の最大差は0.00103633（約0.104 percentage point）です。初期は両窓100%遮蔽、許容位置には `[-1,-0.748]` と `[0.492,1]` の幅がありました。[被覆率図](images/coverage.png)は純幾何の結果です。動画では6.5秒の誤位置でボタンがdisabled、13.5秒の正位置releaseでは未固定、14.5秒の実ボタン操作で固定されました。カメラmatrix最大差は2.45e-16です。

Ames室の数学的閉立体は6面・12辺、面の誤差2.22e-16、基準視線との誤差2.72e-16。両置物は実寸0.22×0.82×0.22m、scale 1で同じ形を維持します。背面の奥行き比は約1.906、基準画像の投影高さ比は約1.605です。これらは投影・構造の事実で、知覚の強さではありません。先行QAで側方候補が壁と視野外を映したため、実表示を確認して観察点を調整しました。最終側方は `(-11.45,1.6,10.3), yaw=-0.6, pitch=-0.12`、視野角65°です。

320×568/fontScale2、390×844/1.5、430×932/1で、章一覧9状態45画像、実App遷移15状態30画像、装置HUD6画像を計測しました。[一覧](stage-list.json)、[App配置](app-layout.json)、[装置配置](hud-layout.json)。装置の見出し/操作欄と受光面・光源の重なりは0件。320/font2では操作欄をscrollして「探索へ戻る」へ到達します。CSS近似でありnative文字寸法の保証ではありません。実pointerの22px円周8方向とレール端/クランク各角度を含む480件は、22pxが240/240受理、23pxが240/240拒否、初回grabの位置飛び0でした。[44pt判定記録](hit-targets.json)。

映写機の比較用初期状態は、敵を移設せず実歩行・待機で取得しました。0.5秒のクランク操作後に音が届く時間帯を選んでいます。全runtimeの比較hashは、プロセスごとのsession識別子と単調時計 `lastNowMs` だけを除外して一致します。操作ありのlastHeardは `(-5.37,1.3,15.8)`。なしは8秒間patrolを継続しました。実際の画像では、操作ありは約2.2秒に開口部を通り、その後視野外へ移ります。なしは同じ開口部を異なる時刻に巡回します。画像に写らない時間を可視の動き確認とは扱いません。

実Meshの全頂点を30Hzで検査した最大水平半径は0.417352m（許容0.44m）、足底の最小Yは0、上端最大Yは2.160651m（包含上限2.24m）でした。capture-retryでは実rayで頭/胸の位置が遮られず画面内に入ったサンプルがnotice 19、pursue 78、windup 23、attack 11フレームあります。全表面がこの間ずっと見えたという意味ではありません。通しinspectの逃走中は敵が画面外になるため、その区間を接近の視覚証拠には使っていません。[動的記録](dynamic-visuals.json)にはphase時刻、実位置、足接地sequence、描画統計を0.5秒間隔の小型記録として残しています。

幕の縦画面補完は、同じ実経路から保護床内 `(0.7,1.6,22.25)` へ実際に歩いて取得しました。取っ手中心を向いた操作が受理され、カメラを固定したまま茶色の下端が降下します。1秒で明示操作、2.5秒時点で閉止確認、3.0667秒で実際に出口へ到達しました。全幅2.8mをportraitの取っ手中心照準に収めた主張はしていません。[横長補完](curtain-detail.json)は同じ物理frameを別aspectの診断カメラで見る追加証拠です。縦画面の代わりにはしていません。

Screen単体の動画はonCompleteが1度届くところまで追い、その後は完了HUDを保持しています。動画内の `fresh-result` という脚本内segment名はApp結果表示の証明ではありません。**実App結果は別途、実Screen→callback→App reducer→memory AsyncStorage保存→実FirstPersonResultScreenを3画面幅で通したもの**です。新章はこの結合経路で新規開始から出口まで走破し、旧vaultの保存bytesは保持しました。実ユーザーの端末保存が成功したという主張はしていません。

## 描画・source・閲覧の境界

動的7本は各1 Scene/1 Screen/1 WebGLRenderer。最大75 calls / 4,932 triangles、破棄後のGPU管理geometry/texture数は0でした。Goal009の別場面の最大70/4,656とは撮影場面が違うため、同一frameの性能改善比較には使えません。いずれも150 calls / 100,000 trianglesの予算内です。iPhoneのフレーム時間・10回入退場の熱/メモリ挙動は、ソフト側の回帰と分けて実機で確認します。

[visual-source-hashes.json](visual-source-hashes.json)には使用sourceと、撮影後に変わったimportのみのモジュールを分けて記録しました。5本の動画と一部静止画は、表示していないNotebookの `theatreComparisons.ts` のpitch修正前です。これらが実際に描画したScene/controller/Screenは最終sourceと一致します。Light最終回はその修正後に再生成しました。途中のlight終了guardが同ファイルの変更を検出した失敗も、source混在を防いだものとして記録しています。最終のscriptは既存6経路の後にportrait幕補完を追加したため、各動画の生成時toolHashと現在のscript hashも区別しています。2Dメモの最終pitch修正は独立Three投影テストの対象で、このQAではメモ画像を追加閲覧していません。

QA脚本の初回capture-only経路で仮想timerの復帰漏れがあり、撮影開始前の待機が止まりました。自分のジョブを停止し、実timerへ戻す修正後に再実行しました。アプリのtimer不具合ではありません。捕捉テストの初稿では、保持したstickに対して離散turn操作を混ぜると正当に入力ownerが解除されました。カメラを向けてから指を保持する条件へ修正し、捕捉後のrelease barrierを検査しました。検査を削除して通したものではありません。

元のユーザー録画は402.527秒・1170×2532で、指定ファイルのhashと17時刻の閲覧事実だけを[動画確認記録](source-video-review.json)へ残しています。原動画・抽出画像はGitへ追加していません。書き出したQA動画はすべて独自生成です。

## 再現

既存依存、Node、ローカルChromiumとffmpegを使用します。新たな依存・native moduleは追加しません。次の順序で生成でき、出力の生データは `.expo/goal010` に置かれます。baseline用archiveは上記commitをrepo外へ展開し、既存node_modulesを参照させます。端末データや原キットへ書き込みません。

```bash
node scripts/preview-theatre-p0.cjs --label baseline
node scripts/preview-theatre-p0.cjs --label current
node scripts/preview-stage-select.cjs
node scripts/measure-theatre-optics.cjs
node scripts/preview-theatre.cjs
node scripts/preview-theatre-hud.cjs
node scripts/measure-theatre-hit.cjs
for scenario in light route-east route-inspect capture-retry projector projector-control curtain-portrait; do
  node scripts/preview-theatre-motion.cjs --scenario="$scenario"
done
node scripts/preview-theatre-curtain.cjs
node scripts/preview-theatre-app-flow.cjs
node scripts/capture-theatre-app-flow.cjs
node scripts/package-theatre-evidence.cjs
```

packagerは生成済みMP4を検証し、選定画像・動画・集約記録だけをコピーします。raw Scene/host tree、毎frameの行列JSON、PNG全frame列はコピーしません。再生成した映像の目視は自動実行されません。`manual-review.json` は閲覧した本人が新しい画像hashとともに更新する必要があります。最終lint/typecheck/test/export/Doctor/依存/Three同一性/保護hashは[verification.json](verification.json)、[source照合](bundle-source-verification.json)、[テスト対象source](tested-source-sha256.json)を参照してください。
