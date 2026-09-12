import type { CheckpointState } from '../domain/firstPerson/types';
import { STAGE_DEFINITIONS, type PlayableStageDefinition, type PlayableStageId as StageId } from '../domain/stageKit/definitions';
export type { PlayableStageId as StageId } from '../domain/stageKit/definitions';
const playable=STAGE_DEFINITIONS.filter((stage):stage is PlayableStageDefinition=>stage.playerVisible);
export const STAGE_IDS: readonly StageId[] = playable.map(stage => stage.id);
export type StageHistory = { everCleared: boolean; discoveries: string[] };
export type StageJournal = { schemaVersion: 1; recentEntries: StageId[]; history: Partial<Record<StageId, StageHistory>> };
export type StageCardState = { id: StageId; current: 'new' | 'exploring' | 'cleared' | 'blocked'; history: StageHistory };
export const STAGES: readonly { id: StageId; number?: string; title: string; teaser: string }[] = playable;
const discoveryIds = new Map<StageId, readonly string[]>(playable.map(stage => [stage.id, stage.discoveries]));
const discoveriesFor = (id: StageId): readonly string[] => discoveryIds.get(id) ?? [];
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
      !h.discoveries.every(d => typeof d === 'string' && discoveriesFor(id).includes(d)) || new Set(h.discoveries).size !== h.discoveries.length) return;
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
    const discovered = discoveriesFor(cp.chapterId).filter(id => bits && (bits as Record<string, boolean>)[id]);
    if (!prior && !cp.progress.cleared && discovered.length === 0) continue;
    next.history[cp.chapterId] = { everCleared: prior?.everCleared === true || cp.progress.cleared,
      discoveries: discoveriesFor(cp.chapterId).filter(id => prior?.discoveries.includes(id) || discovered.includes(id)) };
  }
  return next;
}
export function resumableStage(journal: StageJournal, cards: readonly StageCardState[]): StageId | undefined {
  return journal.recentEntries.find(id => cards.some(card => card.id === id && card.current === 'exploring'));
}
