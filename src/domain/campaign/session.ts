import type { CheckpointState } from '../firstPerson/types';
import { stageModule } from '../stageKit/modules';
import { CHAPTER_ONE, campaignArea, nextCampaignArea, type CampaignAreaId } from './definition';
import type { ChapterOneBeatId } from './story';
import { parseStageCheckpoint as parseMirrorCheckpoint } from '../stages/mirror-corridor-v1/checkpoint';
import { parseStageCheckpoint as parseDepartureCheckpoint } from '../stages/departure-control-v1/checkpoint';

export type ChapterOneSession = Readonly<{
  schemaVersion: 1;
  chapterId: typeof CHAPTER_ONE.id;
  contentVersion: typeof CHAPTER_ONE.contentVersion;
  appVersion: string;
  runId: string;
  resetGeneration: number;
  migrationSource: 'fresh' | 'legacy-prefix';
  revision: number;
  currentArea: CampaignAreaId;
  completedAreas: readonly CampaignAreaId[];
  /** A single authoritative area snapshot; replay cannot write this object. */
  checkpoint: CheckpointState;
  keyLocation: 'unfound' | 'carried' | 'installed';
  storyFired: readonly ChapterOneBeatId[];
  storyPresented: readonly ChapterOneBeatId[];
  finale: Readonly<{ contained: boolean; isolated: boolean; stopped: boolean; outdoorExited: boolean }>;
  campaignCompleted: boolean;
}>;

export type CampaignTransition =
  | { accepted: true; session: ChapterOneSession; kind: 'area-completed' | 'campaign-completed' }
  | { accepted: false; session: ChapterOneSession; reason: 'wrong-area' | 'unverified-checkpoint' | 'not-cleared' | 'next-area-unavailable' | 'finale-unverified' };
export type CampaignCheckpointUpdate =
  | { accepted: true; session: ChapterOneSession; changed: boolean }
  | { accepted: false; session: ChapterOneSession; reason: 'wrong-area' | 'unverified-checkpoint' | 'area-cleared' | 'contradictory-progress' };

/** A registered stage codec is the authority for a checkpoint, including
 * safe-pose recovery. The campaign never trusts a caller's cleared bit alone. */
export function verifiedAreaCheckpoint(areaId: CampaignAreaId, value: unknown): CheckpointState | undefined {
  const area = campaignArea(areaId);
  const module = area && stageModule(area.stageId);
  const restored = module?.restore(value);
  if (!restored || restored.recovered || restored.checkpoint.chapterId !== area?.stageId) return;
  return restored.checkpoint;
}

export function createChapterOneSession(runId: string, appVersion: string, resetGeneration = 0): ChapterOneSession {
  if (!runId.trim() || !appVersion.trim() || !Number.isSafeInteger(resetGeneration) || resetGeneration < 0) throw new RangeError('Invalid campaign run metadata');
  const first = CHAPTER_ONE.areas[0];
  const module = stageModule(first.stageId);
  if (!module) throw new Error('First campaign area is not registered');
  const checkpoint = verifiedAreaCheckpoint(first.id, module.checkpoint(module.create()));
  if (!checkpoint) throw new Error('First campaign area has no valid entry checkpoint');
  return { schemaVersion: 1, chapterId: CHAPTER_ONE.id, contentVersion: CHAPTER_ONE.contentVersion,
    appVersion, runId, resetGeneration, migrationSource: 'fresh', revision: 0,
    currentArea: first.id, completedAreas: [], checkpoint,
    keyLocation: 'unfound', storyFired: [], storyPresented: [],
    finale: { contained: false, isolated: false, stopped: false, outdoorExited: false },
    campaignCompleted: false };
}

function appendBeat(fired: readonly ChapterOneBeatId[], beat: ChapterOneBeatId): readonly ChapterOneBeatId[] {
  return fired.includes(beat) ? fired : [...fired, beat];
}

/** Only the active area's validated codec can update the campaign envelope.
 * A cleared area is committed with its next safe entry by completeCampaignArea. */
export function recordCampaignCheckpoint(session: ChapterOneSession, areaId: CampaignAreaId,
  value: unknown): CampaignCheckpointUpdate {
  if (session.campaignCompleted || areaId !== session.currentArea) return { accepted: false, session, reason: 'wrong-area' };
  const checkpoint = verifiedAreaCheckpoint(areaId, value);
  if (!checkpoint) return { accepted: false, session, reason: 'unverified-checkpoint' };
  if (checkpoint.progress.cleared) return { accepted: false, session, reason: 'area-cleared' };
  let keyLocation = session.keyLocation;
  let storyFired = session.storyFired;
  let finale = session.finale;
  if (areaId === 'chapter-1-area-04') {
    const data = parseMirrorCheckpoint(checkpoint.stageData);
    if (!data) return { accepted: false, session, reason: 'unverified-checkpoint' };
    keyLocation = data.keyTaken ? 'carried' : 'unfound';
    if (data.keyTaken) storyFired = appendBeat(storyFired, 'isolation-key');
  }
  if (areaId === 'chapter-1-area-05') {
    const data = parseDepartureCheckpoint(checkpoint.stageData);
    if (!data || !data.keyAvailable && !data.keyInstalled) return { accepted: false, session, reason: 'unverified-checkpoint' };
    keyLocation = data.keyInstalled ? 'installed' : 'carried';
    finale = { contained: data.isolated, isolated: data.isolated, stopped: data.stopped, outdoorExited: false };
    if (data.stopped) storyFired = appendBeat(storyFired, 'attendance-identified');
  }
  if (session.keyLocation === 'installed' && keyLocation !== 'installed' ||
    session.keyLocation === 'carried' && keyLocation === 'unfound' ||
    session.finale.stopped && !finale.stopped) return { accepted: false, session, reason: 'contradictory-progress' };
  const changed = JSON.stringify(checkpoint) !== JSON.stringify(session.checkpoint) || keyLocation !== session.keyLocation ||
    JSON.stringify(finale) !== JSON.stringify(session.finale) || storyFired !== session.storyFired;
  return { accepted: true, changed, session: changed ? { ...session, revision: session.revision + 1,
    checkpoint, keyLocation, storyFired, finale } : session };
}

/** The completed area and the next safe entry are one new envelope. Callers
 * must persist this envelope before retiring the old Canvas and entering next. */
export function completeCampaignArea(session: ChapterOneSession, areaId: CampaignAreaId,
  clearedValue: unknown, nextEntryValue?: unknown): CampaignTransition {
  if (session.campaignCompleted || areaId !== session.currentArea) return { accepted: false, session, reason: 'wrong-area' };
  const cleared = verifiedAreaCheckpoint(areaId, clearedValue);
  if (!cleared) return { accepted: false, session, reason: 'unverified-checkpoint' };
  if (!cleared.progress.cleared) return { accepted: false, session, reason: 'not-cleared' };
  const next = nextCampaignArea(areaId);
  if (!next) {
    const data = areaId === 'chapter-1-area-05' ? parseDepartureCheckpoint(cleared.stageData) : undefined;
    if (!data || !data.keyInstalled || !data.isolated || !data.stopped || !data.staffDoorOpened || !data.cleared ||
      session.keyLocation !== 'installed') return { accepted: false, session, reason: 'finale-unverified' };
    return { accepted: true, kind: 'campaign-completed', session: { ...session,
      revision: session.revision + 1, checkpoint: cleared,
      completedAreas: [...session.completedAreas, areaId], campaignCompleted: true,
      finale: { contained: true, isolated: true, stopped: true, outdoorExited: true },
      storyFired: appendBeat(appendBeat(session.storyFired, 'attendance-identified'), 'outdoor-exit') } };
  }
  if (!next.routable) return { accepted: false, session, reason: 'next-area-unavailable' };
  const entry = verifiedAreaCheckpoint(next.id, nextEntryValue);
  if (!entry || entry.progress.cleared) return { accepted: false, session, reason: 'next-area-unavailable' };
  return { accepted: true, kind: 'area-completed', session: {
    ...session, revision: session.revision + 1, currentArea: next.id,
    completedAreas: [...session.completedAreas, areaId], checkpoint: entry,
    keyLocation: areaId === 'chapter-1-area-04' ? 'carried' : session.keyLocation,
    storyFired: areaId === 'chapter-1-area-04' ? appendBeat(session.storyFired, 'isolation-key') : session.storyFired,
  } };
}
