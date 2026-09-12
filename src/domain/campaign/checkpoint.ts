import { CHAPTER_ONE, campaignArea, type CampaignAreaId } from './definition';
import { CHAPTER_ONE_BEATS, type ChapterOneBeatId } from './story';
import { stageDefinition } from '../stageKit/definitions';
import type { CampaignDiscoveryHistory } from './discoveries';
import { verifiedAreaCheckpoint, type ChapterOneSession } from './session';
import { parseStageCheckpoint as parseMirrorCheckpoint } from '../stages/mirror-corridor-v1/checkpoint';
import { parseStageCheckpoint as parseDepartureCheckpoint } from '../stages/departure-control-v1/checkpoint';

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const nonnegativeInteger = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
const isBeat = (value: unknown): value is ChapterOneBeatId => typeof value === 'string' && CHAPTER_ONE_BEATS.some(beat => beat.id === value);
const uniqueBeats = (value: unknown): value is ChapterOneBeatId[] => Array.isArray(value) && value.every(isBeat) && new Set(value).size === value.length;
const areaId = (value: unknown): value is CampaignAreaId => !!campaignArea(value);

/** Strict v1 parser. Unknown and damaged raw data must be blocked by storage,
 * never accepted as an empty campaign or overwritten by hydration. */
export function parseChapterOneSession(value: unknown): ChapterOneSession | undefined {
  if (!record(value)) return;
  const storyFired = value.storyFired, storyPresented = value.storyPresented;
  if (value.schemaVersion !== 1 || value.chapterId !== CHAPTER_ONE.id ||
    value.contentVersion !== CHAPTER_ONE.contentVersion || typeof value.appVersion !== 'string' || !value.appVersion.trim() ||
    typeof value.runId !== 'string' || !value.runId.trim() || !nonnegativeInteger(value.resetGeneration) ||
    (value.migrationSource !== 'fresh' && value.migrationSource !== 'legacy-prefix') || !nonnegativeInteger(value.revision) ||
    !areaId(value.currentArea) || !Array.isArray(value.completedAreas) || !value.completedAreas.every(areaId) ||
    !uniqueBeats(storyFired) || !uniqueBeats(storyPresented) || !record(value.discoveryHistory) ||
    !storyPresented.every(beat => storyFired.includes(beat)) ||
    (value.keyLocation !== 'unfound' && value.keyLocation !== 'carried' && value.keyLocation !== 'installed') ||
    !record(value.finale) || typeof value.finale.contained !== 'boolean' || typeof value.finale.isolated !== 'boolean' ||
    typeof value.finale.stopped !== 'boolean' || typeof value.finale.outdoorExited !== 'boolean' ||
    typeof value.campaignCompleted !== 'boolean') return;
  const index = CHAPTER_ONE.areas.findIndex(area => area.id === value.currentArea);
  const discoveryHistory: CampaignDiscoveryHistory = {};
  for (const [id, entries] of Object.entries(value.discoveryHistory)) {
    const area = campaignArea(id), allowed = area && stageDefinition(area.stageId)?.discoveries;
    if (!area || !allowed || CHAPTER_ONE.areas.indexOf(area) > index || !Array.isArray(entries) ||
      !entries.every(item => typeof item === 'string' && allowed.some(known => known === item)) ||
      new Set(entries).size !== entries.length) return;
    discoveryHistory[area.id] = [...entries];
  }
  const expected = CHAPTER_ONE.areas.slice(0, index).map(area => area.id);
  if (value.campaignCompleted) expected.push(CHAPTER_ONE.areas[4].id);
  if (JSON.stringify(value.completedAreas) !== JSON.stringify(expected) ||
    value.finale.isolated && !value.finale.contained || value.finale.stopped && !value.finale.isolated ||
    value.finale.outdoorExited && !value.finale.stopped || value.campaignCompleted !== value.finale.outdoorExited ||
    index < 4 && Object.values(value.finale).some(Boolean) || index < 3 && value.keyLocation !== 'unfound' ||
    index === 4 && value.keyLocation === 'unfound') return;
  const checkpoint = verifiedAreaCheckpoint(value.currentArea, value.checkpoint);
  if (!checkpoint || checkpoint.progress.cleared !== value.campaignCompleted) return;
  if (index === 3) {
    const data = parseMirrorCheckpoint(checkpoint.stageData);
    if (!data || value.keyLocation !== (data.keyTaken ? 'carried' : 'unfound')) return;
  }
  if (index === 4) {
    const data = parseDepartureCheckpoint(checkpoint.stageData);
    if (!data || !data.keyAvailable && !data.keyInstalled ||
      value.keyLocation !== (data.keyInstalled ? 'installed' : 'carried') ||
      value.finale.contained !== data.isolated || value.finale.isolated !== data.isolated ||
      value.finale.stopped !== data.stopped || value.finale.outdoorExited !== data.cleared) return;
  }
  return { schemaVersion: 1, chapterId: CHAPTER_ONE.id, contentVersion: CHAPTER_ONE.contentVersion,
    appVersion: value.appVersion, runId: value.runId, resetGeneration: value.resetGeneration,
    migrationSource: value.migrationSource, revision: value.revision,
    currentArea: value.currentArea, completedAreas: [...expected], checkpoint,
    keyLocation: value.keyLocation, storyFired: [...storyFired], storyPresented: [...storyPresented], discoveryHistory,
    finale: { contained: value.finale.contained, isolated: value.finale.isolated,
      stopped: value.finale.stopped, outdoorExited: value.finale.outdoorExited },
    campaignCompleted: value.campaignCompleted };
}
