# Goal014 — 実採用資産の出典と改変

既存の[錯視出典](ILLUSION-SOURCES.md)、[権利表示](../THIRD_PARTY_NOTICES)、既存音源の権利を維持する。元資料のライセンスと、このプロジェクトで制作した派生成果物の権利を混同しない。

| 資産 | 元資料／制作 | 改変と実参照 |
|---|---|---|
| 巡回体の上着・袖・手・ズボン・靴・明示rig | 本プロジェクト用の自作断面・UV・頂点色 | `GalleryActor`から全5エリアと鏡に共通使用。actorArtResources/actorArtRigを編集可能な原本として保持 |
| 仮面の凸面 | Wael Tsar / cmglee, Hollow face illusion.stl, CC BY4.0 | 既存の合法な元geometryをcloneし、actor専用UV・頂点塗装。原凹面の刺激は変更しない。詳細は既存台帳 |
| 4種の施設material、面取り、滑車、ベル、機械、キー輪郭 | 本プロジェクト用の自作コード生成 | sourceが再生成可能な原本。新規texture画像の借用なし |
| 館内標識 | Noto Sans CJK JP（SIL OFL1.1）、[既存台帳](ASSET-PROVENANCE.md)と同じローカル制作経路 | フォント本体を同梱せず、18種の文字maskを生成。generatorと生成結果のhashを資産manifestへ記録 |
| 6曲の音楽 | オリジナルD–A–E–F主題、score JSON、offline renderer | 8個の許諾確認済みVSCO 2 CE CC0サンプルを使用。ライブラリ全量は同梱せず完成mixだけ同梱 |
| 物理SE・環境音15点 | 自作の有界noise／modal物理モデル | generatorを保持。録音者、実録素材、外部AI利用を捏造しない |

音楽6点・物理／環境15点の元サンプルURL、CC0原文、改変、ファイル単位SHA-256、長さ、bytesは[音源台帳](qa-goal014/audio/asset-provenance.json)と[AUDIO-DIRECTION](AUDIO-DIRECTION.md)に保持する。ソース／生成標識／同梱音源の最終hashは`qa-goal014/asset-manifest.json`へ記録する。音楽は技術検証済みmix候補で、人の芸術的評価・iPhone実聴は未確認。
