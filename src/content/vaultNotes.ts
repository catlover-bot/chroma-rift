import type { VaultDiscovery } from '../domain/vault/types';
export const VAULT_NOTES: readonly { id: VaultDiscovery; title: string; discovery: string; explanation: string; operation: string; sources: { title: string; url: string }[]; credit: string }[] = [
  { id: 'length', title: '端の飾りと長さ', discovery: '棒の長さを、端の飾りのある見本と比べました。',
    explanation: '端の飾りの向きによって、同じ長さの線も違って見えることがあります。留め金は、飾りを含めず棒そのものの両端で合わせます。',
    operation: '端の飾りを畳み、必要なら測定ガイドを出して比較できます。飾りやガイドの切替では棒の長さは変わりません。',
    sources: [{ title: 'Pyllusion：Müller-Lyer', url: 'https://realitybendinglab.com/Pyllusion/_modules/pyllusion/MullerLyer/MullerLyer.html' }],
    credit: 'CHROMA RIFTの独自図形。Pyllusion / Dominique Makowski（MIT）の、実際の長さと周囲の飾りを分ける構成を参照。Pythonコード・画像の転載はありません。' },
  { id: 'rod', title: '傾いた枠と鉛直', discovery: '傾いた枠の中で、針の向きを確かめました。',
    explanation: '周囲の枠が傾いていると、針の傾きもその枠に引かれて感じられることがあります。装置の鉛直は重力の向きで決まり、枠の向きでは変わりません。',
    operation: '枠を消したり下げ振りを出したりして、同じ針を比べられます。この針に矢印はなく、上下を逆にした向きも同じ鉛直です。',
    sources: [{ title: 'Pyllusion：Rod and Frame', url: 'https://github.com/RealityBending/Pyllusion/tree/master/pyllusion/RodFrame' }],
    credit: 'CHROMA RIFTの独自図形。Pyllusion / Dominique Makowski（MIT）の、針と枠の角度を別々に扱う構成を参照。Pythonコード・画像の転載はありません。' },
  { id: 'cafe', title: '曲がって見える目地', discovery: '壁のタイルと、その間の目地を比べました。',
    explanation: '明暗のタイルを行ごとにずらすと、平行な目地が傾いて見えることがあります。この壁の目地は直線で、タイルを動かさず明暗だけをそろえて確かめられます。',
    operation: 'タイルの明暗をそろえてから元に戻せます。目地の位置・太さ・向きは切り替わりません。',
    sources: [{ title: 'Michael Bach：Café Wall Illusion', url: 'https://michaelbach.de/ot/ang-cafewall/' }],
    credit: 'CHROMA RIFTで制作した静止タイル図形。Michael Bachのページは原理を参照し、画像・動画・デモのコードは転載していません。' },
];
