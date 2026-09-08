import type { CheckpointState } from '../domain/firstPerson/types';
export const STAGE_IDS = ['perception-gallery-v1', 'uncanny-vault-v1', 'shadow-theatre-v1', 'returnless-entrance'] as const;
export type StageId = typeof STAGE_IDS[number];
export type StageHistory = { everCleared: boolean; discoveries: string[] };
export type StageJournal = { schemaVersion: 1; recentEntries: StageId[]; history: Partial<Record<StageId, StageHistory>> };
export type StageCardState = { id: StageId; current: 'new' | 'exploring' | 'cleared' | 'blocked'; history: StageHistory };
export const STAGES: readonly { id: StageId; number?: string; title: string; teaser: string }[] = [
  { id: 'perception-gallery-v1', number: '01', title: '閉館後の展示室', teaser: '誰もいない展示室で、灯りと出口を探す。' },
  { id: 'uncanny-vault-v1', number: '02', title: '測れない収蔵庫', teaser: '長さと鉛直を確かめ、棚の陰を抜ける。' },
  { id: 'shadow-theatre-v1', number: '03', title: '影の映写室', teaser: '灯りで影を動かし、静かな映写室を抜ける。' },
  { id: 'returnless-entrance', title: '帰り道のない入口', teaser: 'ふたつの仕掛けをたどる、はじまりの章。' },
];
export const DISCOVERY_IDS: Record<StageId, readonly string[]> = {
  'perception-gallery-v1': ['chromatic', 'shadow', 'contour', 'mask', 'wiring', 'hybrid', 'shepard'],
  'uncanny-vault-v1': ['length', 'rod', 'cafe'],
  'shadow-theatre-v1': ['shadow', 'depth'],
  'returnless-entrance': [],
};
export const isStageId = (value: unknown): value is StageId => typeof value === 'string' && STAGE_IDS.includes(value as StageId);
export const emptyJournal = (): StageJournal => ({ schemaVersion: 1, recentEntries: [], history: {} });
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export function parseStageJournal(value: unknown): StageJournal | undefined {
  if (!record(value) || value.schemaVersion !== 1 || !Array.isArray(value.recentEntries) ||
    value.recentEntries.length > STAGE_IDS.length || !value.recentEntries.every(isStageId) ||
    new Set(value.recentEntries).size !== value.recentEntries.length || !record(value.history)) return;
  const history: StageJournal['history'] = {};
  for (const [id, h] of Object.entries(value.history)) {
    if (!isStageId(id) || !record(h) || typeof h.everCleared !== 'boolean' || !Array.isArray(h.discoveries) ||
      !h.discoveries.every(d => typeof d === 'string' && DISCOVERY_IDS[id].includes(d)) || new Set(h.discoveries).size !== h.discoveries.length) return;
    history[id] = { everCleared: h.everCleared, discoveries: [...h.discoveries] as string[] };
  }
  return { schemaVersion: 1, recentEntries: [...value.recentEntries], history };
}
/** Input must be a validated current checkpoint. Never derive discoveries from
 * solved gates or old migrated completion; only explicit saved observation bits. */
export function mergeStageHistory(journal: StageJournal, checkpoints: readonly CheckpointState[], entered?: StageId): StageJournal {
  const next: StageJournal = { schemaVersion: 1, recentEntries: entered ? [entered, ...journal.recentEntries.filter(id => id !== entered)] : [...journal.recentEntries], history: { ...journal.history } };
  for (const cp of checkpoints) {
    if (!isStageId(cp.chapterId)) continue;
    const prior = next.history[cp.chapterId];
    const bits = cp.progress.gallery?.discoveries ?? cp.progress.vault?.discoveries ?? cp.progress.theatre?.discoveries;
    const discovered = DISCOVERY_IDS[cp.chapterId].filter(id => bits && (bits as Record<string, boolean>)[id]);
    if (!prior && !cp.progress.cleared && discovered.length === 0) continue;
    next.history[cp.chapterId] = { everCleared: prior?.everCleared === true || cp.progress.cleared,
      discoveries: DISCOVERY_IDS[cp.chapterId].filter(id => prior?.discoveries.includes(id) || discovered.includes(id)) };
  }
  return next;
}
export function resumableStage(journal: StageJournal, cards: readonly StageCardState[]): StageId | undefined {
  return journal.recentEntries.find(id => cards.some(card => card.id === id && card.current === 'exploring'));
}
