import { DEPARTURE_COPY } from '../stages/departure-control-v1/copy';

export const CHAPTER_ONE_COPY = {
  attendance02: '在館反応 02',
  attendance01: DEPARTURE_COPY.attendance01,
  attendance00: DEPARTURE_COPY.attendance00,
  openingThought: '残っている職員は、私ひとりのはずだ。',
  attendanceIdentified: 'もう一つの反応は巡回体だった。隔離と停止を確認した。',
  faceClue: '顔と顔の間にも、輪郭がある。',
  containmentInstruction: DEPARTURE_COPY.containmentInstruction,
  isolationFirst: DEPARTURE_COPY.isolationFirst,
  recordComplete: DEPARTURE_COPY.recordComplete,
} as const;

export const CHAPTER_ONE_BEATS = [
  { id: 'closing-interrupted', area: 'chapter-1-area-01', trigger: 'first-safe-entry', learns: '主照明停止と在館反応02', text: CHAPTER_ONE_COPY.openingThought, response: CHAPTER_ONE_COPY.attendance02, resume: 'already-presented-is-not-repeated', payoff: 'attendance-identified' },
  { id: 'emergency-circuit', area: 'chapter-1-area-01', trigger: 'emergency-light-accepted', learns: '外ではなく職員通路を探す', text: '非常回路が戻った。収蔵庫の職員通路へ進む。', response: '非常灯が点く', resume: 'confirmed-progress-retained', payoff: 'staff-route-restored' },
  { id: 'exhibit-versus-patrol', area: 'chapter-1-area-02', trigger: 'vault-observation', learns: '静止展示の見かけと動く巡回体は別', text: '動いたように見える展示と、床を踏む巡回体は別だ。', response: '実際の足音', resume: 'observation-not-inferred-from-migration', payoff: 'attendance-identified' },
  { id: 'containment-procedure', area: 'chapter-1-area-02', trigger: 'service-route-repaired', learns: '巡回体を収容して閉館処理を終える必要', text: '閉館手順は中断されたまま。巡回体を収容区画へ戻す。', response: '管理経路の標識', resume: 'confirmed-progress-retained', payoff: 'power-stopped' },
  { id: 'noise-route', area: 'chapter-1-area-03', trigger: 'theatre-noise-observed', learns: '館の設備音へ巡回体が反応する', text: '物音を調べる動きは、閉館設備の設計どおりだ。', response: '受鈴器と巡回体の調査', resume: 'observation-not-inferred-from-migration', payoff: 'containment-bell' },
  { id: 'isolation-key', area: 'chapter-1-area-04', trigger: 'key-explicitly-taken', learns: '図地の中央に隔離キーがある', text: CHAPTER_ONE_COPY.faceClue, response: '中央の部品だけが取れる', resume: 'key-owner-is-saved', payoff: 'key-installed' },
  { id: 'containment-bell', area: 'chapter-1-area-05', trigger: 'instruction-read', learns: '誘導と閉扉の順序', text: CHAPTER_ONE_COPY.containmentInstruction, response: '収容区画の受鈴器', resume: 'instruction-may-be-reread', payoff: 'actor-contained' },
  { id: 'attendance-identified', area: 'chapter-1-area-05', trigger: 'control-stopped-after-isolation', learns: '02のもう一つは巡回体だった', text: CHAPTER_ONE_COPY.attendanceIdentified, response: CHAPTER_ONE_COPY.attendance01, resume: 'stopped-state-is-irreversible', payoff: 'outdoor-exit' },
  { id: 'outdoor-exit', area: 'chapter-1-area-05', trigger: 'outdoor-threshold-crossed', learns: '主人公も退館し閉館記録が完了', text: CHAPTER_ONE_COPY.recordComplete, response: CHAPTER_ONE_COPY.attendance00, resume: 'ending-can-replay-without-restarting-actor', payoff: 'chapter-ended' },
] as const;

export type ChapterOneBeatId = typeof CHAPTER_ONE_BEATS[number]['id'];
export function chapterOneBeat(id: unknown) {
  return typeof id === 'string' ? CHAPTER_ONE_BEATS.find(beat => beat.id === id) : undefined;
}
