import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseChapterOneSession } from '../domain/campaign/checkpoint';
import type { ChapterOneSession } from '../domain/campaign/session';
import { CHAPTER_ONE } from '../domain/campaign/definition';

export const CHAPTER_ONE_STORAGE_KEY = 'chroma-rift.campaign.chapter-1.v1';
export const CHAPTER_ONE_BACKUP_KEY = 'chroma-rift.campaign.chapter-1.backup.v1';

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
type Boundary = {
  enqueue: <T>(operation: () => Promise<T>) => Promise<T>;
  epoch: () => number;
  current: (lease: number) => boolean;
  checkpointProgresses: (before: ChapterOneSession['checkpoint'], after: ChapterOneSession['checkpoint']) => boolean;
};
export type ChapterOneLoad =
  | { status: 'empty'; writable: true }
  | { status: 'loaded'; writable: true; session: ChapterOneSession }
  | { status: 'blocked'; writable: false; message: string };

function containsAll<T>(before: readonly T[], after: readonly T[]): boolean {
  return before.every(item => after.includes(item));
}
function canReplace(before: ChapterOneSession, after: ChapterOneSession, boundary: Boundary): boolean {
  const keyRank = { unfound: 0, carried: 1, installed: 2 } as const;
  if (before.runId !== after.runId || before.resetGeneration !== after.resetGeneration || after.revision <= before.revision ||
    after.completedAreas.length < before.completedAreas.length || after.completedAreas.length > before.completedAreas.length + 1 ||
    !containsAll(before.completedAreas, after.completedAreas) ||
    keyRank[after.keyLocation] < keyRank[before.keyLocation] ||
    !containsAll(before.storyFired, after.storyFired) || !containsAll(before.storyPresented, after.storyPresented) ||
    CHAPTER_ONE.areas.some(area => !containsAll(before.discoveryHistory[area.id] ?? [],
      after.discoveryHistory[area.id] ?? [])) ||
    before.campaignCompleted && !after.campaignCompleted ||
    before.currentArea === after.currentArea && !boundary.checkpointProgresses(before.checkpoint, after.checkpoint)) return false;
  // Area 05 deliberately permits reopening a mistaken isolation before the
  // shutdown command. Once stopped, isolation is permanent. The stage codec
  // already validates the reopened door and its safe checkpoint.
  for (const key of ['stopped', 'outdoorExited'] as const)
    if (before.finale[key] && !after.finale[key]) return false;
  if (before.finale.stopped && (before.finale.contained && !after.finale.contained ||
    before.finale.isolated && !after.finale.isolated)) return false;
  return true;
}

/** Inject the existing first-person queue and lease. No second campaign writer
 * or reset generation is created here. One AsyncStorage value owns the whole
 * area transition; no pair of key writes is treated as a transaction. */
export function createChapterOneStorage(boundary: Boundary, storage: Storage = AsyncStorage) {
  let latest: ChapterOneSession | undefined;
  let writable = true;
  let loaded = false;
  async function read(lease: number): Promise<ChapterOneLoad> {
    try {
      const raw = await storage.getItem(CHAPTER_ONE_STORAGE_KEY);
      if (!boundary.current(lease)) return { status: 'blocked', writable: false, message: '読み込み中にプレイの状態が切り替わりました。' };
      if (raw === null) { latest = undefined; writable = true; loaded = true; return { status: 'empty', writable: true }; }
      const parsed = parseChapterOneSession(JSON.parse(raw));
      if (!parsed) throw new Error('unsupported campaign envelope');
      latest = parsed; writable = true; loaded = true;
      return { status: 'loaded', writable: true, session: parsed };
    } catch {
      latest = undefined; writable = false; loaded = true;
      return { status: 'blocked', writable: false,
        message: '第一章の記録を読み込めませんでした。以前のプレイ記録を残し、自動保存を停止しています。' };
    }
  }
  return {
    load(): Promise<ChapterOneLoad> {
      const lease = boundary.epoch();
      return boundary.enqueue(() => read(lease));
    },
    save(candidate: ChapterOneSession, lease: number): Promise<boolean> {
      const parsed = parseChapterOneSession(candidate);
      if (!parsed) return Promise.resolve(false);
      return boundary.enqueue(async () => {
        if (!boundary.current(lease)) return false;
        if (!loaded) await read(lease);
        if (!writable || !boundary.current(lease) || latest && !canReplace(latest, parsed, boundary)) return false;
        if (!latest && (parsed.revision !== 0 || parsed.completedAreas.length !== 0 || parsed.migrationSource !== 'fresh')) return false;
        try {
          await storage.setItem(CHAPTER_ONE_STORAGE_KEY, JSON.stringify(parsed));
          if (!boundary.current(lease)) { loaded = false; latest = undefined; return false; }
          latest = parsed; return true;
        } catch { return false; }
      });
    },
    /** Import is offered only when no campaign envelope exists. Old keys remain untouched. */
    adoptLegacy(candidate: ChapterOneSession, lease: number): Promise<boolean> {
      const parsed = parseChapterOneSession(candidate);
      if (!parsed || parsed.migrationSource !== 'legacy-prefix' || parsed.revision !== 0) return Promise.resolve(false);
      return boundary.enqueue(async () => {
        if (!boundary.current(lease)) return false;
        try {
          if (await storage.getItem(CHAPTER_ONE_STORAGE_KEY) !== null || !boundary.current(lease)) return false;
          await storage.setItem(CHAPTER_ONE_STORAGE_KEY, JSON.stringify(parsed));
          if (!boundary.current(lease)) { loaded = false; latest = undefined; return false; }
          latest = parsed; writable = true; loaded = true; return true;
        } catch { return false; }
      });
    },
    /** Explicit new-game choice. Unknown raw is copied byte-for-byte first. */
    startNew(candidate: ChapterOneSession, lease: number): Promise<boolean> {
      const parsed = parseChapterOneSession(candidate);
      if (!parsed || parsed.migrationSource !== 'fresh' || parsed.revision !== 0 || parsed.completedAreas.length !== 0) return Promise.resolve(false);
      return boundary.enqueue(async () => {
        if (!boundary.current(lease)) return false;
        try {
          const raw = await storage.getItem(CHAPTER_ONE_STORAGE_KEY);
          if (!boundary.current(lease)) return false;
          const previous = raw === null ? undefined : (() => { try { return parseChapterOneSession(JSON.parse(raw)); } catch { return undefined; } })();
          if (previous && parsed.resetGeneration <= previous.resetGeneration) return false;
          if (raw !== null) {
            const backup = await storage.getItem(CHAPTER_ONE_BACKUP_KEY);
            // Keep the first protected raw document byte-for-byte. If a new
            // unsupported document appears later, do not overwrite its only
            // possible recovery copy with a different generation's bytes.
            if (backup === null) await storage.setItem(CHAPTER_ONE_BACKUP_KEY, raw);
            else if (!previous && backup !== raw) return false;
          }
          if (!boundary.current(lease)) return false;
          await storage.setItem(CHAPTER_ONE_STORAGE_KEY, JSON.stringify(parsed));
          if (!boundary.current(lease)) { loaded = false; latest = undefined; return false; }
          latest = parsed; writable = true; loaded = true; return true;
        } catch { return false; }
      });
    },
    resetCache(success: boolean): void { latest = undefined; loaded = false; writable = success; },
  };
}
