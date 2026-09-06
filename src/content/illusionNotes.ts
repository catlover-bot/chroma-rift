import type { DiscoveryId } from '../domain/gallery';

export type IllusionSource = { title: string; url: string };
export type IllusionNote = { id: DiscoveryId; title: string; discovery: string; explanation: string; operation: string; sources: IllusionSource[]; credit: string };
/** Catalog registration is not a discovery. Availability comes only from the
 * chapter record, or explicit post-completion free comparison. */
export const ILLUSION_NOTES: readonly IllusionNote[] = [
  { id: 'chromatic', title: '色の奥行き', discovery: '同じ面の色が、違う奥行きに感じられることがあります。',
    explanation: '展示番号は赤と青が同じ平面に描かれています。前後の感じ方には個人差があり、色をなくしても奥行きが消えるとは限りません。', operation: 'カラーと無彩色を切り替える。形と位置は同じです。',
    sources: [{ title: 'Simonet & Campbell (1990), chromostereopsis', url: 'https://pubmed.ncbi.nlm.nih.gov/2216476/' }, { title: '北岡明佳：色立体視3（資料参照のみ）', url: 'https://www.psy.ritsumei.ac.jp/akitaoka/scolor3.html' }], credit: '番号13は本作の図形。資料の画像は使用していません。' },
  { id: 'shadow', title: '明暗の対比', discovery: '同じ灰色でも、周囲によって明るさが違って感じられます。',
    explanation: '見本自体の色を変えず、周囲の明暗だけを変えています。背景をそろえると同じ条件で比べられます。', operation: '同じ見本のまま、元の背景と同じ背景を切り替える。',
    sources: [{ title: 'Pyllusion：Simultaneous Contrast', url: 'https://github.com/RealityBending/Pyllusion#simultaneous-contrast-illusion' }], credit: '本作の見本・背景。公開サンプル画像は使用していません。' },
  { id: 'contour', title: '主観的輪郭', discovery: '円盤の切れ目の間に、描かれていない輪郭を感じることがあります。',
    explanation: '通常表示の中央には三角形の線や面を描いていません。円盤の向きを変える比較と、線を描く補助ガイドは別の操作です。', operation: '円盤の向きを変え、任意で輪郭ガイドを重ねる。',
    sources: [{ title: 'Banica & Schwarzkopf (2016)：主観的輪郭の研究', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4982671/' }], credit: '本作の円盤図形。研究の画像や実験の点滅は使用していません。' },
  { id: 'mask', title: '凹面の仮面', discovery: '顔の向きが変わるように感じても、この仮面は回転していません。',
    explanation: '顔は外へふくらんでいるもの、と解釈しやすいため、へこんだ顔も飛び出して見えることがあります。横から見ると実際にへこんだ構造を確かめられます。', operation: '観察位置を正面から側面へ動かす。変わるのは比較用の視点だけです。',
    sources: [{ title: 'Michael Bach：Rotating face mask', url: 'https://michaelbach.de/ot/fcs-hollowFace/' }, { title: 'Hollow face illusion.stl', url: 'https://commons.wikimedia.org/wiki/File:Hollow_face_illusion.stl' }], credit: 'Hollow face illusion.stl — Wael Tsar。cmglee が中心調整・対称化・STL変換と向き調整。CC BY 4.0。本作では軸・寸法を正規化し法線を再計算。展示体の独立した顔へは凸面改変と縮小。作者の推薦を意味しません。' },
  { id: 'wiring', title: '隠れた配線', discovery: '線の途中が隠れると、左右のつながりをずらして見積もることがあります。',
    explanation: 'カバーを外すと、同じ線の位置を直接比べられます。カバーを動かしても線の高さや正しい接続位置は変わりません。', operation: '高さを動かす操作と、同じ高さでカバーだけを退ける比較を試す。',
    sources: [{ title: 'Pyllusion：Poggendorff', url: 'https://github.com/RealityBending/Pyllusion/tree/3aaacb455af7750abff6491371e7a5c9c084a09c/pyllusion/Poggendorff' }, { title: 'Makowski et al. (2021)', url: 'https://doi.org/10.1177/03010066211057347' }], credit: 'Pyllusion の条件分離を参考にした独自の直線幾何。Pythonコード・画像の移植はありません。' },
  { id: 'hybrid', title: '近づくと変わる掲示', discovery: '同じ一枚でも、小さく見ると別の図柄が目立つことがあります。',
    explanation: '一枚の画像に、細かい形と大きな形を重ねています。小さく見ると細かい形が読み取りにくくなります。端末や見る条件によって感じ方は変わります。', operation: '同じ画像を連続して拡大・縮小する。成分表示は仕組みを確かめる補助です。',
    sources: [{ title: 'Oliva, Torralba & Schyns (2006), Hybrid Images', url: 'https://doi.org/10.1145/1141911.1141919' }, { title: 'Michael Bach：Dr. Angry and Mr. Smile', url: 'https://michaelbach.de/ot/fcs-spatFreqComposites/index.html' }], credit: '本作で生成した仮面と閉館の線画。人物写真・有名な作例は使用していません。' },
  { id: 'shepard', title: '音の錯覚', discovery: '音量が増え続けなくても、音の高さが上がり続けるように感じることがあります。',
    explanation: '異なるオクターブの成分を、滑らかに強さを変えながら重ねています。短い自作音で、いつでも止められます。聞こえ方は進行の条件ではありません。', operation: '任意の短い再生・停止と効果音量。無音・控えめ・演出音オフでは再生しません。',
    sources: [{ title: 'Shepard (1964), Circularity in Judgments of Relative Pitch', url: 'https://doi.org/10.1121/1.1919362' }, { title: 'Michael Bach：Shepard Tone', url: 'https://michaelbach.de/ot/aud-ShepardTone/index.html' }], credit: '本作の事前合成WAV。資料サイトの音声・コードは使用していません。' },
];
export function availableIllusionNotes(discoveries: Partial<Record<DiscoveryId, boolean>>, completed: boolean) {
  return ILLUSION_NOTES.filter(note => completed || discoveries[note.id] === true);
}

export const MATERIAL_CREDITS = [
  { title: '凹面仮面の元データ', text: 'Hollow face illusion.stl / Wael Tsar。cmglee：中心調整、対称化、STL変換、サムネイルのため135度回転。本作：凹面仮面へ軸回転・平行移動・高さ1mへの正規化・法線再計算。展示体の独立した顔へ凸面改変と縮小。CC BY 4.0。作者が本作を推薦する意味はありません。',
    urls: ['https://commons.wikimedia.org/wiki/File:Hollow_face_illusion.stl', 'https://creativecommons.org/licenses/by/4.0/'] },
  { title: '配線の構成資料', text: 'Pyllusion / Dominique Makowski。MIT License, Copyright (c) 2018 Dominique Makowski。図形の条件分離を参照し、本作の線の式と操作を独自実装しました。Pythonコードやサンプル画像は同梱していません。', urls: ['https://github.com/RealityBending/Pyllusion', 'https://github.com/RealityBending/Pyllusion/blob/master/LICENSE'] },
  { title: '解説資料', text: 'Michael Bach の知覚デモ、原著研究、北岡明佳の色立体視解説を参照。各ページの画像・動画・音声は本作へ転載していません。', urls: ['https://michaelbach.de/ot/', 'https://www.psy.ritsumei.ac.jp/akitaoka/scolor3.html'] },
  { title: '本作で制作した素材', text: 'ハイブリッド掲示の線画と合成画像、配線、B/C図形、展示番号、展示体の胴体と四肢、環境・操作・演出音。生成手順と出典台帳をリポジトリに記録しています。資料の人物写真や録音は使っていません。', urls: [] },
] as const;
