# Goal014 — 採用した美術

## 巡回体：共通の造形・rig・material

`GalleryActor` 一体を01〜05と鏡で共有する。`actorArtResources.ts` の編集可能な断面とUVから、裾→胸→肩→襟が連続した上着、曲面に沿った左右非対称の襟・補修ポケット、案内係の小さい金具、袖と袖口、指・親指のある鋳造手、ズボンと革靴を作る。浮いた多面体肩と露出した棒状の前腕・脛を置き換えた。片袖の補修と襟のずれが非対称の理由になる。新しい外部キャラクター素材・texture・native依存はない。

`actorArtRig.ts` は胸、独立した頭、肩→肘→手首、IK脚と実接地足の明示rig。domain `actorMotion` が所有するroot・視認眼・足anchorを使い、render側のroot motionや別時計を追加しない。注意時の頭→胸→足、加減速、捜索の注視は既存simulationを保つ。腕はwindup／attack／recoverに対応する有界の反応を加えた。服には荷重に追従する小さい傾きがある。速度・視野角・捕捉距離・collision radiusは変えていない。鏡は同じposed objectを読む。

最終停止はarea05のcommit済み `shutdownSeconds` を受け、手0〜0.45秒、肩0.4〜1.05秒、頭0.95〜1.6秒の順に緊張を落とす。1.6秒以後は同じposeで、cold復帰は停止済みの姿勢を渡す。足とrootを動かさず、active時の実眼位置・視線は従来の`actorMotionEye`と一致する。停止後の頭下げは無効化済みのAIを再起動しない。この時計・提示rollback・保存の所有者はstageである。

| 用途 | 採用surface | 値・扱い |
|---|---|---|
| 重い上着 | MeshStandardMaterial、縫い目・ひだの頂点色 | roughness .96、metalness 0 |
| 補修した襟・片袖 | 別の布色、同じ曲面・UV | roughness .94 |
| ズボン | 暗い織地、太さが変わる断面 | roughness .98 |
| 仮面・手 | マットな鋳造／塗装、目の奥・口・片側の塗装亀裂 | roughness .91、発光なし |
| 靴・仮面後殻 | 形のある革面 | roughness .83 |
| 固定具・案内係金具 | 鈍い金属 | roughness .72、metalness .55 |
| 接地 | 片足ごとの小さい頂点alpha面 | 接地足のみ、depthWriteなし、texture／追加shadow passなし |

顔の形状は既存 Wael Tsar / cmglee `Hollow face illusion.stl`（CC BY 4.0）から作られた凸面を独立cloneし、actor専用のUV・頂点塗装を追加した。元の凹面刺激・凸面比較geometry/materialは変更しない。[既存出典・改変台帳](ILLUSION-SOURCES.md)と[権利表示](../THIRD_PARTY_NOTICES)を保持する。元assetの置換・再取得はしていない。

| actor単体 | before standard / low | after standard / low |
|---|---:|---:|
| triangles（接地面含む） | 3,274 / 3,166 | 20,214 / 6,730 |
| body triangles（接地面除く） | 3,274 / 3,166 | 19,974 / 6,586 |
| mesh数 | 24 / 24 | 20 / 20（18 body＋2接地面） |
| unique geometry / material | — | 14 / 7 |
| vertex＋index typed buffer容量 | — | 468,752 / 176,296 bytes |
| actor texture maps | 0 | 0 |

容量はgeometryのtyped buffer合計で、driver実使用メモリやFPSではない。Three0.185.1のPBRが初めて使う共有`DFG_LUT`は16×16 RG half-float（1,024 bytes、mipmapなし）。これはThreeのmodule/renderer所有で、actorのtexture mapではない。検証ではwarm rendererのtexture数1とscene解放後の1を区別し、actor再入場でtextureが増えたと扱わない。自作surfaceと既存錯視刺激は別materialで、刺激へPBR・汚れ・AOを混ぜない。

同じ408状態×2品質の実GalleryActor比較で、最大高さ2.15126m、最大root中心半径0.40508m、足底minY=0を確認。既存モデル上限2.24mとcollision radius .44m内に収まる。active眼方向差は最大5.12e-16、接地頂点の滑りは最大2.49e-16（浮動小数点誤差）。各代表gaitの実頂点／足／眼、停止順序、元顔の不変、10回のresource owner解放は自動検査する。[同条件画像・動画と測定境界](qa-goal014/actor/README.md)を参照。実機の見栄え・操作・GPU時間・熱・FPSは未確認。

制作では[Three MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)を読み、lockfile採用版のmaterial/DFG実装と照合した。[Frictional Gamesの制作記事](https://frictionalgames.com/2011-03-birth-of-a-monster-part-4-its-alive/)はrig→本編での見え方という制作手順のみ参照し、作品のmesh・rig・音をコピーしていない。R3F Performance pitfallsページ取得は応答サイズ制限で失敗し、読了扱いにしていない。

## 施設、機構、錯視面

全5エリアで塗装壁、テラゾー床、琺瑯の装置、木の棚、鈍い金属、ゴム握り、紙の手順を共有する。`environmentArtResources.ts` が4種の自作タイルの色と凹凸／roughnessデータを所有する。標準512角、低負荷256角。色だけsRGB、凹凸はlinear、壁・床はroughness .96/.8、装置 .57、木 .88。低負荷ではbumpを外す。追加textureはmipmap込み約10.67MiB／2.67MiB、immutable CPU原画cacheは両品質合わせ10MiBで有界。GPU Textureは各scene ownerが作り、破棄する。原画cacheは再入場ごとに増やさない。

床のUV密度は0.6m単位。幅木、壁継ぎ、棚端、接触影は既存の開口を塞がず、4つのInstancedMeshへまとめる。材質のための追加renderer、shadow pass、postprocessはない。一般面は柔らかい環境光と2方向の光を使い、錯視面は従来のunlit/no fog/no tone mappingを保つ。灰色値、円盤の成立条件、長さ・鉛直、Ames/FOV、受光窓の計算、鏡の視錐台とdefault framebuffer補正は変更しない。

04は低い練習台・小さい重りと床固定巻き上げ機を別形状にした。握り、軸、巻胴、ケーブル、3枚の歯止めが格子へつながる。確定後の各段はdomainの`gateLift`で0.9秒かけて上がり、同じ値で見える格子と衝突／視認境界を動かす。手を離しても確定した段の動きは続く。cold復帰は保存した整数段の完了位置で、途中の保持は再開しない。練習台を囲む実壁と0.71mの入口はplayerの径と巡回体の径を区別し、魔法の無敵領域を増やさない。

横顔と白い隔離キーは同じ`ISOLATION_KEY_PROFILE`の境界から作る。取得時にキーが抜け、05の差込口も同じgeometryを使う。本保持中のキーは握り下の小さい部品で、鏡の中央を覆わない。

05は低い操作台、紙の手順、押し鈴、ガード付き隔離レバー、T字の停止レバーを分けた。台の支持脚と部品の土台を見せ、低い視界から収容区画を見渡せる。ワイヤと実鈴、床の区画境界、全身収容を確認する表示、枠・シール・ガラスのある隔離戸が因果をつなぐ。全身包絡と扉sweepの安全判定はdomainから読む。移動する戸は共通の部品定義から金属・枠・シールのmeshと視線遮蔽を作り、透明部分は視線を通す。身体には従来と同じ厚さ・範囲の戸が衝突する。職員扉の1.2秒の開きもworldの進捗と一致する。

各エリア名、練習と本番、05の各操作名は同梱の日本語bitmaskから読む標識。`FacilityPlaque`は共有geometryと遅延生成するscene所有materialを借りる。文字の判定やHUD可読性を低負荷で落とさない。屋外は床の継ぎ、庇、柱、明るい空、外気で屋内からの変化を示す。退館保存後の4秒も、実際の床と衝突に従って歩き、視点を動かせる。停止後に脅威を再起動する演出はない。
