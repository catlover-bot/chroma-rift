import { CHAPTER_ONE, CHAPTER_TWO, campaignArea } from '../definition';
import { completeCampaignArea, createChapterOneSession, recordCampaignBeatPresented, recordCampaignCheckpoint, recordCampaignNoiseObservation, recordCampaignReplayDiscoveries, recordCampaignSafeEntry, verifiedAreaCheckpoint } from '../session';
import { observedCampaignDiscoveries } from '../discoveries';
import { createCampaignAreaEntry } from '../areaEntry';
import { migrateGalleryV1Checkpoint } from '../../gallery/checkpoint';
import { originalV1 } from '../../../storage/testFixtures/galleryV1';
import { vaultCheckpoint } from '../../../storage/testFixtures/vault';
import { theatreCheckpoint } from '../../../storage/testFixtures/theatre';
import { EXIT } from '../../stages/mirror-corridor-v1/definition';
import { OUTDOOR } from '../../stages/departure-control-v1/definition';
import { parseStageCheckpoint as parseMirrorCheckpoint } from '../../stages/mirror-corridor-v1/checkpoint';
import { parseStageCheckpoint as parseDepartureCheckpoint } from '../../stages/departure-control-v1/checkpoint';
import { CHAPTER_ONE_BEATS } from '../story';
import { parseChapterOneSession } from '../checkpoint';
declare const __dirname: string;
const { readFileSync } = require('node:fs') as { readFileSync(path: string, encoding: 'utf8'): string };
const { resolve } = require('node:path') as { resolve(...parts: string[]): string };

test('the product contract has exactly five distinct areas and no playable second chapter', () => {
  expect(CHAPTER_ONE.areas.map(area => area.number)).toEqual(['01', '02', '03', '04', '05']);
  expect(new Set(CHAPTER_ONE.areas.map(area => area.id)).size).toBe(5);
  expect(new Set(CHAPTER_ONE.areas.map(area => area.stageId)).size).toBe(5);
  expect(CHAPTER_ONE.areas.map(area => area.stageId)).not.toContain('returnless-entrance');
  expect(CHAPTER_ONE.areas.map(area => area.stageId)).not.toContain('stage-kit-probe');
  expect(CHAPTER_TWO.availability).toBe('planned');
  expect(Object.keys(CHAPTER_TWO)).toEqual(['id', 'availability', 'notice', 'unavailable']);
  expect(campaignArea('chapter-1-area-06')).toBeUndefined();
});

test('story beats have unique identifiers and the outdoor answer follows control stop', () => {
  expect(new Set(CHAPTER_ONE_BEATS.map(beat => beat.id)).size).toBe(CHAPTER_ONE_BEATS.length);
  const identified = CHAPTER_ONE_BEATS.findIndex(beat => beat.id === 'attendance-identified');
  const outdoor = CHAPTER_ONE_BEATS.findIndex(beat => beat.id === 'outdoor-exit');
  expect(outdoor).toBeGreaterThan(identified);
  expect(CHAPTER_ONE_BEATS.every(beat => campaignArea(beat.area))).toBe(true);
  const bible = readFileSync(resolve(__dirname, '../../../../docs/CHAPTER-1-STORY.md'), 'utf8');
  for (const beat of CHAPTER_ONE_BEATS) {
    expect(bible).toContain(`\`${beat.id}\``);
    expect(bible).toContain(beat.text);
  }
});

test('fresh campaign entry uses the real gallery codec and cannot skip to a later stage', () => {
  const session = createChapterOneSession('test-run-1', '0.1.0');
  expect(session.currentArea).toBe('chapter-1-area-01');
  expect(session.completedAreas).toEqual([]);
  expect(session.campaignCompleted).toBe(false);
  expect(verifiedAreaCheckpoint(session.currentArea, session.checkpoint)).toEqual(session.checkpoint);
  expect(verifiedAreaCheckpoint('chapter-1-area-04', session.checkpoint)).toBeUndefined();
  expect(completeCampaignArea(session, 'chapter-1-area-02', session.checkpoint)).toMatchObject({ accepted: false, reason: 'wrong-area' });
  expect(completeCampaignArea(session, session.currentArea, session.checkpoint)).toMatchObject({ accepted: false, reason: 'not-cleared' });
  expect(completeCampaignArea(session, session.currentArea, { ...session.checkpoint, progress: { ...session.checkpoint.progress, cleared: true } })).toMatchObject({ accepted: false });
});

test('campaign codec rejects future versions, forged progress and unseen story presentation', () => {
  const fresh = createChapterOneSession('test-run-2', '0.1.0');
  expect(parseChapterOneSession(fresh)).toEqual(fresh);
  expect(parseChapterOneSession({ ...fresh, schemaVersion: 2 })).toBeUndefined();
  expect(parseChapterOneSession({ ...fresh, currentArea: 'chapter-1-area-05' })).toBeUndefined();
  expect(parseChapterOneSession({ ...fresh, completedAreas: ['chapter-1-area-01'] })).toBeUndefined();
  expect(parseChapterOneSession({ ...fresh, storyPresented: ['closing-interrupted'] })).toBeUndefined();
  expect(parseChapterOneSession({ ...fresh, storyFired: ['outdoor-exit'] })).toBeUndefined();
  expect(parseChapterOneSession({ ...fresh, storyFired: ['isolation-key'] })).toBeUndefined();
  expect(parseChapterOneSession({ ...fresh, discoveryHistory: { 'chapter-1-area-01': ['unknown-exhibit'] } })).toBeUndefined();
  expect(parseChapterOneSession({ ...fresh, discoveryHistory: { 'chapter-1-area-04': ['figure'] } })).toBeUndefined();
  expect(parseChapterOneSession({ ...fresh, finale: { contained: true, isolated: true, stopped: true, outdoorExited: true }, campaignCompleted: true })).toBeUndefined();
  const restored = parseChapterOneSession(fresh)!;
  restored.checkpoint.pose.position.x = 9;
  expect(fresh.checkpoint.pose.position.x).not.toBe(9);
});

test('a real safe entry fires the opening, while only acknowledgement records presentation', () => {
  const fresh = createChapterOneSession('story-entry', '0.1.0');
  expect(recordCampaignBeatPresented(fresh, 'closing-interrupted')).toBe(fresh);
  const entered = recordCampaignSafeEntry(fresh, fresh.currentArea);
  expect(entered.storyFired).toEqual(['closing-interrupted']);
  expect(entered.storyPresented).toEqual([]);
  expect(recordCampaignSafeEntry(entered, entered.currentArea)).toBe(entered);
  const shown = recordCampaignBeatPresented(entered, 'closing-interrupted');
  expect(shown.storyPresented).toEqual(['closing-interrupted']);
  expect(recordCampaignBeatPresented(shown, 'closing-interrupted')).toBe(shown);
  expect(parseChapterOneSession(shown)).toBeDefined();
  expect(recordCampaignSafeEntry({ ...fresh, migrationSource: 'legacy-prefix' }, fresh.currentArea)).toMatchObject({ storyFired: [] });
});

test('confirmed area progress fires mandatory beats, while practice and unobserved theatre noise do not', () => {
  let session = createChapterOneSession('story-progress', '0.1.0');
  const galleryClear = migrateGalleryV1Checkpoint(originalV1('cleared'))!.checkpoint;
  const gallery = completeCampaignArea(session, session.currentArea, galleryClear, createCampaignAreaEntry('chapter-1-area-02'));
  expect(gallery.accepted).toBe(true);
  if (!gallery.accepted) return;
  session = gallery.session;
  expect(session.storyFired).toContain('emergency-circuit');
  const rod = recordCampaignCheckpoint(session, session.currentArea, vaultCheckpoint('rod'));
  expect(rod.accepted).toBe(true);
  if (!rod.accepted) return;
  session = rod.session;
  expect(session.storyFired).toContain('containment-procedure');
  expect(session.storyFired).not.toContain('exhibit-versus-patrol');
  const vault = completeCampaignArea(session, session.currentArea, vaultCheckpoint('clear'), createCampaignAreaEntry('chapter-1-area-03'));
  expect(vault.accepted).toBe(true);
  if (!vault.accepted) return;
  session = vault.session;
  expect(recordCampaignNoiseObservation(session, 'chapter-1-area-02')).toBe(session);
  expect(session.storyFired).not.toContain('noise-route');
  const light = recordCampaignCheckpoint(session, session.currentArea, theatreCheckpoint('light'));
  expect(light.accepted).toBe(true);
  if (!light.accepted) return;
  const observed = recordCampaignNoiseObservation(light.session, light.session.currentArea);
  expect(observed.storyFired).toContain('noise-route');
  expect(observed.storyPresented).toEqual([]);
  expect(recordCampaignNoiseObservation(observed, observed.currentArea)).toBe(observed);
  expect(parseChapterOneSession(observed)).toBeDefined();
});

test('observed discoveries form a one-way union while practice leaves the campaign route intact', () => {
  const fresh = createChapterOneSession('discovery-run', '0.1.0');
  const gallery = fresh.checkpoint.progress.gallery!;
  const observed = { ...fresh.checkpoint, progress: { ...fresh.checkpoint.progress,
    gallery: { ...gallery, discoveries: { ...gallery.discoveries, chromatic: true } } } };
  expect(observedCampaignDiscoveries(fresh.currentArea, observed)).toContain('chromatic');
  const practice = recordCampaignReplayDiscoveries(fresh, fresh.currentArea, observed);
  expect(practice).toMatchObject({ accepted: true, changed: true });
  if (!practice.accepted) return;
  expect(practice.session).toMatchObject({ currentArea: fresh.currentArea, checkpoint: fresh.checkpoint,
    storyFired: [], storyPresented: [], discoveryHistory: { 'chapter-1-area-01': ['chromatic'] } });
  expect(parseChapterOneSession(practice.session)).toBeDefined();
  expect(recordCampaignReplayDiscoveries(practice.session, fresh.currentArea, fresh.checkpoint))
    .toMatchObject({ accepted: true, changed: false });
  expect(recordCampaignReplayDiscoveries(practice.session, 'chapter-1-area-04', observed))
    .toMatchObject({ accepted: false, reason: 'wrong-area' });
});

test('the five area boundaries stay indoor until a verified stopped and outdoor finale', () => {
  let session = createChapterOneSession('five-areas', '0.1.0');
  const cleared = [migrateGalleryV1Checkpoint(originalV1('cleared'))!.checkpoint,
    vaultCheckpoint('clear'), theatreCheckpoint('completed')];
  for (let index = 0; index < 3; index += 1) {
    const next = CHAPTER_ONE.areas[index + 1]!;
    const transition = completeCampaignArea(session, session.currentArea, cleared[index], createCampaignAreaEntry(next.id));
    expect(transition.accepted).toBe(true);
    if (!transition.accepted) return;
    session = transition.session;
    expect(session.currentArea).toBe(next.id);
    expect(session.campaignCompleted).toBe(false);
    expect(session.finale.outdoorExited).toBe(false);
  }
  const mirrorEntry = session.checkpoint, mirror = parseMirrorCheckpoint(mirrorEntry.stageData)!;
  const clearedMirror = { ...mirrorEntry, stageData: { ...mirror, keyTaken: true, practiced: true,
    ratchets: 3, cleared: true, pose: EXIT } };
  const controlEntry = createCampaignAreaEntry('chapter-1-area-05', session, clearedMirror);
  expect(controlEntry?.stageData).toMatchObject({keyAvailable:true,keyInstalled:false});
  const fourth = completeCampaignArea(session, session.currentArea, clearedMirror, controlEntry);
  expect(fourth.accepted).toBe(true);
  if (!fourth.accepted) return;
  session = fourth.session;
  expect(session).toMatchObject({currentArea:'chapter-1-area-05',keyLocation:'carried',campaignCompleted:false});
  const control = parseDepartureCheckpoint(session.checkpoint.stageData)!;
  const stopped = { ...session.checkpoint, stageData: { ...control, keyAvailable: false,
    keyInstalled: true, procedureRead: true, isolated: true, stopped: true } };
  const premature = completeCampaignArea(session, session.currentArea, stopped);
  expect(premature).toMatchObject({accepted:false,reason:'not-cleared'});
  const update = recordCampaignCheckpoint(session, session.currentArea, stopped);
  expect(update.accepted).toBe(true);
  if (!update.accepted) return;
  session = update.session;
  expect(session.finale).toMatchObject({isolated:true,stopped:true,outdoorExited:false});
  const outdoor = { ...stopped, stageData: { ...stopped.stageData,
    staffDoorOpened: true, cleared: true, pose: OUTDOOR } };
  const final = completeCampaignArea(session, session.currentArea, outdoor);
  expect(final).toMatchObject({accepted:true,kind:'campaign-completed'});
  if (final.accepted) expect(final.session).toMatchObject({campaignCompleted:true,
    completedAreas:CHAPTER_ONE.areas.map(area=>area.id),finale:{contained:true,isolated:true,stopped:true,outdoorExited:true}});
});
