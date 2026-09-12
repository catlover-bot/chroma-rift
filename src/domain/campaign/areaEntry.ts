import type { CheckpointState } from '../firstPerson/types';
import { stageModule } from '../stageKit/modules';
import { carriedKeyEntry } from '../stages/departure-control-v1/session';
import { parseStageCheckpoint as parseMirrorCheckpoint } from '../stages/mirror-corridor-v1/checkpoint';
import { campaignArea, type CampaignAreaId } from './definition';
import { verifiedAreaCheckpoint, type ChapterOneSession } from './session';

/** Area bindings adapt a stage's cold entry to campaign inventory. The stage
 * itself never imports the campaign or guesses that the key was collected. */
export function createCampaignAreaEntry(areaId: CampaignAreaId, previous?: ChapterOneSession,
  completedCheckpoint?: unknown): CheckpointState | undefined {
  const area = campaignArea(areaId), module = area && stageModule(area.stageId);
  if (!area || !module) return;
  const fresh = module.checkpoint(module.create());
  if (areaId === 'chapter-1-area-05') {
    const cleared = verifiedAreaCheckpoint('chapter-1-area-04', completedCheckpoint);
    const key = cleared && parseMirrorCheckpoint(cleared.stageData);
    if (previous?.currentArea !== 'chapter-1-area-04' || !cleared?.progress.cleared || !key?.keyTaken) return;
    return verifiedAreaCheckpoint(areaId, { ...fresh, stageData: carriedKeyEntry() });
  }
  return verifiedAreaCheckpoint(areaId, fresh);
}

/** A practice entry is a new, unsaved stage session. It can never inherit a
 * cleared checkpoint or advance the authoritative campaign. */
export function createCampaignReplayEntry(areaId: CampaignAreaId,
  campaign: ChapterOneSession | undefined, legacyReached = false): CheckpointState | undefined {
  const reached = campaign?.currentArea === areaId || campaign?.completedAreas.includes(areaId) || legacyReached;
  const area = campaignArea(areaId), module = area && stageModule(area.stageId);
  if (!reached || !area || !module) return;
  const fresh = module.checkpoint(module.create());
  if (areaId === 'chapter-1-area-05') {
    if (!campaign || campaign.keyLocation === 'unfound') return;
    return verifiedAreaCheckpoint(areaId, { ...fresh, stageData: carriedKeyEntry() });
  }
  return verifiedAreaCheckpoint(areaId, fresh);
}
