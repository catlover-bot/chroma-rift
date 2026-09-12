import { migrateGalleryV1Checkpoint, migrateGalleryV2Checkpoint, restoreGalleryCheckpoint } from '../gallery/checkpoint';
import { stageModule } from '../stageKit/modules';
import type { CheckpointState } from '../firstPerson/types';
import { CHAPTER_ONE } from './definition';
import { createChapterOneSession, verifiedAreaCheckpoint, type ChapterOneSession } from './session';

/** Values are raw bytes read from the existing standalone keys. This function
 * never writes or deletes any of them. The caller must offer an explicit choice. */
export type LegacyCampaignRaw = Readonly<{ gallery: string | null; vault: string | null; theatre: string | null }>;
export type LegacyImportProposal =
  | { status: 'none' }
  | { status: 'blocked'; source: keyof LegacyCampaignRaw }
  | { status: 'await-area'; completedPrefix: number }
  | { status: 'ready'; completedPrefix: number; session: ChapterOneSession; recoveredSources: readonly (keyof LegacyCampaignRaw)[] };

function decode(source: keyof LegacyCampaignRaw, raw: string): { checkpoint: CheckpointState; recovered: boolean } | undefined {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return; }
  const restored = source === 'gallery'
    ? restoreGalleryCheckpoint(value) ?? migrateGalleryV2Checkpoint(value) ?? migrateGalleryV1Checkpoint(value)
    : stageModule(source === 'vault' ? 'uncanny-vault-v1' : 'shadow-theatre-v1')?.restore(value);
  return restored ? { checkpoint: restored.checkpoint, recovered: restored.recovered } : undefined;
}

export function proposeLegacyCampaignImport(raw: LegacyCampaignRaw, runId: string, appVersion: string, resetGeneration = 0): LegacyImportProposal {
  const sources = ['gallery', 'vault', 'theatre'] as const;
  if (sources.every(source => raw[source] === null)) return { status: 'none' };
  const decoded: Partial<Record<keyof LegacyCampaignRaw, { checkpoint: CheckpointState; recovered: boolean }>> = {};
  const recoveredSources: (keyof LegacyCampaignRaw)[] = [];
  for (const source of sources) {
    const bytes = raw[source];
    if (bytes === null) continue;
    const entry = decode(source, bytes);
    if (!entry) return { status: 'blocked', source };
    decoded[source] = entry;
    if (entry.recovered) recoveredSources.push(source);
  }
  const completedPrefix = sources.findIndex(source => !decoded[source]?.checkpoint.progress.cleared);
  const prefix = completedPrefix < 0 ? sources.length : completedPrefix;
  const nextArea = CHAPTER_ONE.areas[prefix];
  if (!nextArea) throw new Error('Campaign manifest has no next area');
  const module = stageModule(nextArea.stageId);
  if (!nextArea.routable || !module) return { status: 'await-area', completedPrefix: prefix };
  const targetSource = sources[prefix];
  const entry = targetSource && decoded[targetSource] && !decoded[targetSource].checkpoint.progress.cleared
    ? verifiedAreaCheckpoint(nextArea.id, decoded[targetSource].checkpoint)
    : verifiedAreaCheckpoint(nextArea.id, module.checkpoint(module.create()));
  if (!entry) return { status: 'blocked', source: targetSource ?? 'theatre' };
  const fresh = createChapterOneSession(runId, appVersion, resetGeneration);
  const session: ChapterOneSession = {
    ...fresh, currentArea: nextArea.id,
    completedAreas: CHAPTER_ONE.areas.slice(0, prefix).map(area => area.id),
    checkpoint: entry, migrationSource: 'legacy-prefix',
  };
  return { status: 'ready', completedPrefix: prefix, session, recoveredSources };
}
