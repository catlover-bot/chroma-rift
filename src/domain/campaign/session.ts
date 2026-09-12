import type { CheckpointState } from '../firstPerson/types';
import { stageModule } from '../stageKit/modules';
import { CHAPTER_ONE, campaignArea, nextCampaignArea, type CampaignAreaId } from './definition';
import type { ChapterOneBeatId } from './story';
import { mergeCampaignDiscoveries, type CampaignDiscoveryHistory } from './discoveries';
import { campaignCheckpointProgresses } from '../stageKit/checkpointProgression';
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
  discoveryHistory: CampaignDiscoveryHistory;
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
    keyLocation: 'unfound', storyFired: [], storyPresented: [], discoveryHistory: {},
    finale: { contained: false, isolated: false, stopped: false, outdoorExited: false },
    campaignCompleted: false };
}

function appendBeat(fired: readonly ChapterOneBeatId[], beat: ChapterOneBeatId): readonly ChapterOneBeatId[] {
  return fired.includes(beat) ? fired : [...fired, beat];
}

/** Entry is reported only after the native scene has presented a safe frame. */
export function recordCampaignSafeEntry(session: ChapterOneSession, areaId: CampaignAreaId): ChapterOneSession {
  if (session.campaignCompleted || session.currentArea !== areaId || areaId !== 'chapter-1-area-01' ||
    session.migrationSource !== 'fresh' || session.storyFired.includes('closing-interrupted')) return session;
  return { ...session, revision: session.revision + 1,
    storyFired: appendBeat(session.storyFired, 'closing-interrupted') };
}

/** Presentation is a separate acknowledgement; imported progress cannot set it. */
export function recordCampaignBeatPresented(session: ChapterOneSession, beat: ChapterOneBeatId): ChapterOneSession {
  if (!session.storyFired.includes(beat) || session.storyPresented.includes(beat)) return session;
  return { ...session, revision: session.revision + 1,
    storyPresented: [...session.storyPresented, beat] };
}

/** A theatre actor actually investigated an equipment sound in the live scene. */
export function recordCampaignNoiseObservation(session: ChapterOneSession, areaId: CampaignAreaId): ChapterOneSession {
  if (session.campaignCompleted || session.currentArea !== areaId || areaId !== 'chapter-1-area-03' ||
    !session.checkpoint.progress.theatre?.light.accepted || session.storyFired.includes('noise-route')) return session;
  return { ...session, revision: session.revision + 1,
    storyFired: appendBeat(session.storyFired, 'noise-route') };
}

/** Only the active area's validated codec can update the campaign envelope.
 * A cleared area is committed with its next safe entry by completeCampaignArea. */
export function recordCampaignCheckpoint(session: ChapterOneSession, areaId: CampaignAreaId,
  value: unknown): CampaignCheckpointUpdate {
  if (session.campaignCompleted || areaId !== session.currentArea) return { accepted: false, session, reason: 'wrong-area' };
  const checkpoint = verifiedAreaCheckpoint(areaId, value);
  if (!checkpoint) return { accepted: false, session, reason: 'unverified-checkpoint' };
  if (checkpoint.progress.cleared) return { accepted: false, session, reason: 'area-cleared' };
  if (!campaignCheckpointProgresses(session.checkpoint, checkpoint))
    return { accepted: false, session, reason: 'contradictory-progress' };
  let keyLocation = session.keyLocation;
  let storyFired = session.storyFired;
  let finale = session.finale;
  const discoveryHistory = mergeCampaignDiscoveries(session.discoveryHistory, areaId, checkpoint);
  if (areaId === 'chapter-1-area-01' && checkpoint.progress.gallery?.emergencyLit)
    storyFired = appendBeat(storyFired, 'emergency-circuit');
  if (areaId === 'chapter-1-area-02') {
    const vault = checkpoint.progress.vault;
    if (vault?.discoveries.cafe && vault.story.revealPresented)
      storyFired = appendBeat(storyFired, 'exhibit-versus-patrol');
    if (vault?.rod.solved) storyFired = appendBeat(storyFired, 'containment-procedure');
  }
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
    if (data.procedureRead) storyFired = appendBeat(storyFired, 'containment-bell');
    if (data.stopped) storyFired = appendBeat(storyFired, 'attendance-identified');
  }
  if (session.keyLocation === 'installed' && keyLocation !== 'installed' ||
    session.keyLocation === 'carried' && keyLocation === 'unfound' ||
    session.finale.stopped && !finale.stopped) return { accepted: false, session, reason: 'contradictory-progress' };
  const changed = JSON.stringify(checkpoint) !== JSON.stringify(session.checkpoint) || keyLocation !== session.keyLocation ||
    JSON.stringify(finale) !== JSON.stringify(session.finale) || storyFired !== session.storyFired ||
    discoveryHistory !== session.discoveryHistory;
  return { accepted: true, changed, session: changed ? { ...session, revision: session.revision + 1,
    checkpoint, keyLocation, storyFired, finale, discoveryHistory } : session };
}

/** Practice writes only observed-note union. The authoritative campaign area,
 * safe checkpoint, key, finale, and story presentation remain untouched. */
export function recordCampaignReplayDiscoveries(session: ChapterOneSession, areaId: CampaignAreaId,
  value: unknown): CampaignCheckpointUpdate {
  if (session.currentArea !== areaId && !session.completedAreas.includes(areaId))
    return { accepted: false, session, reason: 'wrong-area' };
  const checkpoint = verifiedAreaCheckpoint(areaId, value);
  if (!checkpoint) return { accepted: false, session, reason: 'unverified-checkpoint' };
  const discoveryHistory = mergeCampaignDiscoveries(session.discoveryHistory, areaId, checkpoint);
  if (discoveryHistory === session.discoveryHistory) return { accepted: true, session, changed: false };
  return { accepted: true, changed: true,
    session: { ...session, revision: session.revision + 1, discoveryHistory } };
}

/** The completed area and the next safe entry are one new envelope. Callers
 * must persist this envelope before retiring the old Canvas and entering next. */
export function completeCampaignArea(session: ChapterOneSession, areaId: CampaignAreaId,
  clearedValue: unknown, nextEntryValue?: unknown): CampaignTransition {
  if (session.campaignCompleted || areaId !== session.currentArea) return { accepted: false, session, reason: 'wrong-area' };
  const cleared = verifiedAreaCheckpoint(areaId, clearedValue);
  if (!cleared) return { accepted: false, session, reason: 'unverified-checkpoint' };
  if (!cleared.progress.cleared) return { accepted: false, session, reason: 'not-cleared' };
  // A live run has already reported its safe entry or an intermediate device
  // checkpoint. At revision zero the stage codec owns acceptance; imported or
  // test-built entry envelopes can have a seed independent of a cleared fixture.
  if (session.revision > 0 && !campaignCheckpointProgresses(session.checkpoint, cleared))
    return { accepted: false, session, reason: 'unverified-checkpoint' };
  const discoveryHistory = mergeCampaignDiscoveries(session.discoveryHistory, areaId, cleared);
  let storyFired = session.storyFired;
  if (areaId === 'chapter-1-area-01' && cleared.progress.gallery?.emergencyLit)
    storyFired = appendBeat(storyFired, 'emergency-circuit');
  if (areaId === 'chapter-1-area-02') {
    const vault = cleared.progress.vault;
    if (vault?.discoveries.cafe && vault.story.revealPresented)
      storyFired = appendBeat(storyFired, 'exhibit-versus-patrol');
    if (vault?.rod.solved) storyFired = appendBeat(storyFired, 'containment-procedure');
  }
  const next = nextCampaignArea(areaId);
  if (!next) {
    const data = areaId === 'chapter-1-area-05' ? parseDepartureCheckpoint(cleared.stageData) : undefined;
    if (!data || !data.keyInstalled || !data.isolated || !data.stopped || !data.staffDoorOpened || !data.cleared ||
      session.keyLocation !== 'installed') return { accepted: false, session, reason: 'finale-unverified' };
    return { accepted: true, kind: 'campaign-completed', session: { ...session,
      revision: session.revision + 1, checkpoint: cleared, discoveryHistory,
      completedAreas: [...session.completedAreas, areaId], campaignCompleted: true,
      finale: { contained: true, isolated: true, stopped: true, outdoorExited: true },
      storyFired: appendBeat(appendBeat(appendBeat(storyFired, 'containment-bell'), 'attendance-identified'), 'outdoor-exit') } };
  }
  if (!next.routable) return { accepted: false, session, reason: 'next-area-unavailable' };
  const entry = verifiedAreaCheckpoint(next.id, nextEntryValue);
  if (!entry || entry.progress.cleared) return { accepted: false, session, reason: 'next-area-unavailable' };
  return { accepted: true, kind: 'area-completed', session: {
    ...session, revision: session.revision + 1, currentArea: next.id, discoveryHistory,
    completedAreas: [...session.completedAreas, areaId], checkpoint: entry,
    keyLocation: areaId === 'chapter-1-area-04' ? 'carried' : session.keyLocation,
    storyFired: areaId === 'chapter-1-area-04' ? appendBeat(storyFired, 'isolation-key') : storyFired,
  } };
}
