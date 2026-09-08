import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyJournal, mergeStageHistory, parseStageJournal, type StageId, type StageJournal } from '../app/stages';
import type { CheckpointState } from '../domain/firstPerson/types';
export const STAGE_JOURNAL_KEY = 'chroma-rift.stage-journal.v1';
export type JournalLoad = { journal: StageJournal; writable: boolean; message?: string };
type Boundary = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>;
  epoch: () => number;
  current: (lease: number) => boolean;
  validate: (value: unknown) => CheckpointState | undefined;
};
/** The host injects its existing serial writer and lease. This store never
 * writes chapter keys and never owns a competing queue or reset generation. */
export function createStageJournalStorage(boundary: Boundary) {
  let latest: StageJournal | undefined, writable = true;
  async function read(lease: number): Promise<boolean> {
    if (latest || !writable) return writable;
    try {
      const raw = await AsyncStorage.getItem(STAGE_JOURNAL_KEY);
      if (!boundary.current(lease)) return false;
      const parsed = raw === null ? emptyJournal() : parseStageJournal(JSON.parse(raw));
      if (!parsed) { writable = false; return false; }
      latest = parsed; return true;
    } catch { if (boundary.current(lease)) writable = false; return false; }
  }
  async function mergeUnlocked(checkpoints: readonly CheckpointState[], lease: number, entered?: StageId): Promise<boolean> {
    if (!boundary.current(lease) || !await read(lease) || !boundary.current(lease) || !latest) return false;
    const validated = checkpoints.map(cp => boundary.validate(cp));
    if (validated.some(cp => !cp) || entered && !validated.some(cp => cp?.chapterId === entered && !cp.progress.cleared)) return false;
    const next = mergeStageHistory(latest, validated as CheckpointState[], entered);
    if (JSON.stringify(next) === JSON.stringify(latest)) return true;
    try {
      await AsyncStorage.setItem(STAGE_JOURNAL_KEY, JSON.stringify(next));
      if (!boundary.current(lease)) { latest = undefined; return false; }
      latest = next; return true;
    } catch { return false; }
  }
  return {
    load(): Promise<JournalLoad> {
      const lease = boundary.epoch();
      return boundary.enqueue(async () => {
        if (!boundary.current(lease)) return { journal: latest ?? emptyJournal(), writable: false };
        latest = undefined; writable = true; // Explicit hydration revalidates the current raw document.
        const allowed = await read(lease);
        return { journal: latest ?? emptyJournal(), writable: allowed,
          ...(!allowed ? { message: 'ステージ履歴を読み込めないため、履歴の更新を停止しています。元の記録と各章の保存は保持しています。' } : {}) };
      });
    },
    record(checkpoints: readonly CheckpointState[], lease: number, entered?: StageId): Promise<boolean> {
      const captured = JSON.parse(JSON.stringify(checkpoints)) as CheckpointState[];
      return boundary.enqueue(() => mergeUnlocked(captured, lease, entered));
    },
    /** Called inside the shared queue before replacing a run. A failed history
     * write must not destroy the only known evidence of its prior achievements. */
    async preserveUnlocked(checkpoint: CheckpointState | undefined, lease: number): Promise<boolean> {
      if (!checkpoint) return true;
      const valid = boundary.validate(checkpoint);
      if (!valid) return false;
      if (Object.keys(mergeStageHistory(emptyJournal(), [valid]).history).length === 0) return true;
      return mergeUnlocked([valid], lease);
    },
    resetCache(success: boolean) { latest = undefined; writable = success; },
  };
}
