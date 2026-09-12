/** Shared final-area wording is stage-owned; the campaign story table refers
 * to it without making the stage module depend on its host. */
export const DEPARTURE_COPY = {
  attendance01: '在館反応 01',
  attendance00: '在館反応 00',
  containmentInstruction: '呼び鈴で収容区画へ誘導し、全身が入ってから隔離扉を閉じる。',
  isolationFirst: '巡回体の隔離を先に確認する。',
  recordComplete: '閉館処理 完了',
} as const;
