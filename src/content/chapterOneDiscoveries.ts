import { CHAPTER_ONE, type CampaignAreaId } from '../domain/campaign/definition';
import { CHAPTER_ONE_COPY } from '../domain/campaign/story';

export const CHAPTER_ONE_DISCOVERY_TITLES: Readonly<Record<CampaignAreaId, Readonly<Record<string, string>>>> = {
  'chapter-1-area-01': { chromatic: '色の奥行き', shadow: '明暗の対比', contour: '主観的輪郭',
    mask: '凹面の仮面', wiring: '隠れた配線', hybrid: '近づくと変わる掲示', shepard: '音の錯覚' },
  'chapter-1-area-02': { length: '長さの見え方', rod: '鉛直の見え方', cafe: '平行な目地' },
  'chapter-1-area-03': { shadow: '影の大きさ', depth: '部屋の奥行き' },
  'chapter-1-area-04': { figure: '顔と顔の間の輪郭', mirror: '背後を映す鏡', ratchet: '巻き上げた歯止め' },
  'chapter-1-area-05': { containment: '収容区画の隔離', attendance: '在館反応の変化' },
};

export type ChapterOneStageNoteArea = 'chapter-1-area-04' | 'chapter-1-area-05';
const STAGE_NOTE_AREAS: readonly ChapterOneStageNoteArea[] = ['chapter-1-area-04', 'chapter-1-area-05'];
export function chapterOneStageNoteArea(stageId: string): ChapterOneStageNoteArea | undefined {
  const area = CHAPTER_ONE.areas.find(item => item.stageId === stageId);
  return STAGE_NOTE_AREAS.find(id => id === area?.id);
}
export const CHAPTER_ONE_STAGE_NOTE_DETAILS: Readonly<Record<ChapterOneStageNoteArea, Readonly<Record<string, string>>>> = {
  'chapter-1-area-04': {
    figure: '同じ静止した境界を、向かい合う顔の輪郭にも中央の鍵形にも見られる。図地の見方が変わっても飾りは動かない。',
    mirror: '平面鏡は背後の実際の通路をその場で映す。顔と鍵形の図地反転とは別の仕組み。',
    ratchet: '巻き上げた歯止めはレバーを離しても残る。未確定の途中分だけ戻る。',
  },
  'chapter-1-area-05': {
    containment: '巡回体の全身が区画に入り、隔離扉のラッチが閉じた。',
    attendance: `${CHAPTER_ONE_COPY.attendanceIdentified} ${CHAPTER_ONE_COPY.attendance01}。`,
  },
};
