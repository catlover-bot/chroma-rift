import type { CheckpointState } from '../firstPerson/types';
import { stageDefinition } from '../stageKit/definitions';
import { parseStageCheckpoint as parseMirrorCheckpoint } from '../stages/mirror-corridor-v1/checkpoint';
import { parseStageCheckpoint as parseDepartureCheckpoint } from '../stages/departure-control-v1/checkpoint';
import { campaignArea, type CampaignAreaId } from './definition';

/** Only explicit observation or operated-device bits become discoveries.
 * A cleared area, imported prefix, and a rendered mirror alone add nothing. */
export type CampaignDiscoveryHistory = Partial<Record<CampaignAreaId, readonly string[]>>;

export function observedCampaignDiscoveries(areaId: CampaignAreaId, checkpoint: CheckpointState): readonly string[] {
  const area = campaignArea(areaId);
  if (!area || checkpoint.chapterId !== area.stageId) return [];
  const allowed = stageDefinition(area.stageId)?.discoveries ?? [];
  let bits: Partial<Record<string, boolean>> = {};
  if (areaId === 'chapter-1-area-01') bits = checkpoint.progress.gallery?.discoveries ?? {};
  else if (areaId === 'chapter-1-area-02') bits = checkpoint.progress.vault?.discoveries ?? {};
  else if (areaId === 'chapter-1-area-03') bits = checkpoint.progress.theatre?.discoveries ?? {};
  else if (areaId === 'chapter-1-area-04') {
    const data = parseMirrorCheckpoint(checkpoint.stageData);
    if (data) bits = { figure: data.figureInspected, mirror: data.mirrorInspected, ratchet: data.ratchets > 0 };
  } else {
    const data = parseDepartureCheckpoint(checkpoint.stageData);
    if (data) bits = { containment: data.isolated, attendance: data.stopped };
  }
  return allowed.filter(id => bits[id] === true);
}

export function mergeCampaignDiscoveries(history: CampaignDiscoveryHistory, areaId: CampaignAreaId,
  checkpoint: CheckpointState): CampaignDiscoveryHistory {
  const observed = observedCampaignDiscoveries(areaId, checkpoint);
  const previous = history[areaId] ?? [];
  const added = observed.filter(id => !previous.includes(id));
  return added.length ? { ...history, [areaId]: [...previous, ...added] } : history;
}
