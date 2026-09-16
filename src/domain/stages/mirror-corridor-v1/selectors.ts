import type { StageTargetPresentation } from '../../stageKit/presentation';
import { RATCHET_COUNT, type TargetId } from './definition';
import type { StageSession } from './session';

export function selectMirrorPresentation(session: StageSession) {
  return { objective: session.cleared ? '制御室への前室に着いた。' : !session.keyTaken ? '横顔の余白から隔離キーを取る。' :
    !session.practiced ? '前室の練習レバーを一度保持する。' : session.ratchets < RATCHET_COUNT ? `本レバーで格子を巻き上げる。歯止め ${session.ratchets}/3。` : '開いた格子の先へ進む。',
  hint: { text: session.ratchets === RATCHET_COUNT ? '三つの歯止めは固定済み。保持せず、開いた格子を通れる。' :
    !session.keyTaken ? '向き合う横顔の間に、同じ輪郭のキーがある。' : !session.practiced ? '低い台の短い取っ手が練習用。本機へ進む前に一度試す。' :
      '確定した歯止めは残る。危険なら指を離し、新しい左指で棚の陰へ退く。' },
  feedbackRevision: [session.keyTaken, session.practiced, session.ratchets, session.cleared].join(':') };
}

export function selectMirrorAction(session: StageSession, targetId: TargetId): StageTargetPresentation {
  const result = (state: StageTargetPresentation['state'], label: string, message: string): StageTargetPresentation => ({ state, label, message });
  switch (targetId) {
    case 'mirror-corridor-figure': return result('ready', '横顔と余白を見比べる', session.keyTaken ? 'キーを外しても、横顔と余白の輪郭は同じ形だった。' : '二つの横顔と中央のキーは、同じ輪郭を分け合っている。');
    case 'mirror-corridor-mirror': return result('ready', '鏡で背後を確かめる', '鏡には背後の通路が映る。同じ巡回体の動きを確かめられる。');
    case 'mirror-corridor-key': return session.keyTaken ? result('completed', '隔離キーは取得済み', selectMirrorPresentation(session).hint.text) : result('ready', '隔離キーを取る', '横顔の間にある白いキーを取る。');
    case 'mirror-corridor-practice': return session.practiced ? result('completed', '練習完了。指を離して本機へ', '短い重りを持ち上げた。本レバーへ進める。') :
      result(session.holding === 'practice' ? 'operating' : 'ready', '練習レバーを保持する', '短い取っ手を押し続けて、重りを持ち上げる。');
    case 'mirror-corridor-winch':
      if (session.ratchets === RATCHET_COUNT) return result('completed', '格子は開放済み', '三つの歯止めが固定した。指を離して、開いた格子へ進む。');
      if (!session.keyTaken) return result('locked', '本レバー：隔離キーが必要', '先に横顔の余白から隔離キーを取る。');
      if (!session.practiced) return result('locked', '本レバー：練習を済ませる', '低い台の練習レバーを一度保持する。');
      return result(session.holding === 'winch' ? 'operating' : 'ready', '巻き上げレバーを保持する', `歯止め ${session.ratchets}/3。指を離せば止まる。確定した段は残る。`);
    case 'mirror-corridor-exit': return session.cleared ? result('completed', '前室に到着済み', '制御室への前室に着いた。') :
      session.ratchets === RATCHET_COUNT && !session.holding && session.pose.position.z >= 21.2 ? result('ready', '制御室への前室へ進む', '開いた格子を抜け、隔離キーを次の制御盤へ運ぶ。') : result('locked', '開いた格子を通る', '三つの歯止めを固定し、格子の向こうまで歩く。');
  }
}
