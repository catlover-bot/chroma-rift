import { createChapterOneSession, type ChapterOneSession } from '../../domain/campaign/session';
import { CHAPTER_ONE } from '../../domain/campaign/definition';
import { stageModule } from '../../domain/stageKit/modules';
import { carriedKeyEntry } from '../../domain/stages/departure-control-v1/session';
import { proposeLegacyCampaignImport } from '../../domain/campaign/migration';
import { originalV1 } from '../testFixtures/galleryV1';
import { CHAPTER_ONE_BACKUP_KEY, CHAPTER_ONE_STORAGE_KEY, createChapterOneStorage } from '../chapterOneStorage';

function harness() {
  const values = new Map<string, string>();
  let epoch = 1, queue: Promise<unknown> = Promise.resolve();
  const storage = {
    async getItem(key: string) { return values.get(key) ?? null; },
    async setItem(key: string, value: string) { values.set(key, value); },
  };
  const boundary = {
    enqueue<T>(operation: () => Promise<T>): Promise<T> { const result = queue.then(operation, operation); queue = result.catch(() => undefined); return result; },
    epoch: () => epoch,
    current: (lease: number) => lease === epoch,
    checkpointProgresses: (before: ReturnType<typeof createChapterOneSession>['checkpoint'], after: ReturnType<typeof createChapterOneSession>['checkpoint']) =>
      before.chapterId === after.chapterId && (!before.progress.gallery?.emergencyLit || !!after.progress.gallery?.emergencyLit),
  };
  return { values, storage, boundary, nextLease: () => ++epoch };
}

test('one campaign envelope cold-loads and refuses a stale lease or story rewind', async () => {
  const h = harness(), store = createChapterOneStorage(h.boundary, h.storage);
  expect(await store.load()).toEqual({status:'empty',writable:true});
  const fresh = createChapterOneSession('first-run', '0.1.0');
  expect(await store.save(fresh,1)).toBe(true);
  const cold = createChapterOneStorage(h.boundary,h.storage);
  expect(await cold.load()).toMatchObject({status:'loaded',session:{runId:'first-run',currentArea:'chapter-1-area-01'}});
  const observed = {...fresh,revision:1,storyFired:['closing-interrupted'] as const};
  expect(await cold.save(observed,1)).toBe(true);
  expect(await cold.save({...observed,revision:2,storyFired:[]},1)).toBe(false);
  expect(await cold.save({...observed,revision:2},h.nextLease()-1)).toBe(false);
  expect(JSON.parse(h.values.get(CHAPTER_ONE_STORAGE_KEY)!).revision).toBe(1);
});

test('a higher revision cannot restore an older checkpoint in the same area', async () => {
  const h = harness(), store = createChapterOneStorage(h.boundary, h.storage);
  const fresh = createChapterOneSession('one-area', '0.1.0');
  expect(await store.save(fresh, 1)).toBe(true);
  const progressed = { ...fresh, revision: 1, checkpoint: { ...fresh.checkpoint,
    progress: { ...fresh.checkpoint.progress, gallery: { ...fresh.checkpoint.progress.gallery!, emergencyLit: true } } } };
  // The domain codec validates exact progress shape; use it as the authority.
  expect(await store.save(progressed, 1)).toBe(true);
  expect(await store.save({ ...fresh, revision: 2 }, 1)).toBe(false);
  expect(JSON.parse(h.values.get(CHAPTER_ONE_STORAGE_KEY)!).revision).toBe(1);
});

test('saved practice discoveries cannot be removed by a later revision', async () => {
  const h = harness(), store = createChapterOneStorage(h.boundary, h.storage);
  const fresh = createChapterOneSession('practice-history', '0.1.0');
  expect(await store.save(fresh, 1)).toBe(true);
  const discovered = { ...fresh, revision: 1,
    discoveryHistory: { 'chapter-1-area-01': ['chromatic'] } };
  expect(await store.save(discovered, 1)).toBe(true);
  expect(await store.save({ ...fresh, revision: 2 }, 1)).toBe(false);
  expect((await createChapterOneStorage(h.boundary, h.storage).load())).toMatchObject({
    status: 'loaded', session: { discoveryHistory: { 'chapter-1-area-01': ['chromatic'] } },
  });
});

test('unknown raw blocks autosave and explicit restart backs up its exact bytes', async () => {
  const h=harness(),store=createChapterOneStorage(h.boundary,h.storage),raw='{"schemaVersion":99,"unreadable":true}';
  h.values.set(CHAPTER_ONE_STORAGE_KEY,raw);
  expect(await store.load()).toMatchObject({status:'blocked',writable:false,
    message:'第一章の記録を読み込めませんでした。以前のプレイ記録を残し、自動保存を停止しています。'});
  expect(await store.save(createChapterOneSession('new-run','0.1.0'),1)).toBe(false);
  expect(h.values.get(CHAPTER_ONE_STORAGE_KEY)).toBe(raw);
  expect(await store.startNew(createChapterOneSession('new-run','0.1.0'),1)).toBe(true);
  expect(h.values.get(CHAPTER_ONE_BACKUP_KEY)).toBe(raw);
});

test('a superseded load explains the changed play state without exposing its session key', async () => {
  const h = harness(), store = createChapterOneStorage(h.boundary, h.storage);
  const pending = store.load();
  h.nextLease();
  expect(await pending).toEqual({ status: 'blocked', writable: false,
    message: '読み込み中にプレイの状態が切り替わりました。' });
  expect(h.values.size).toBe(0);
});

test('a later restart never overwrites the first raw recovery copy', async () => {
  const h = harness(), store = createChapterOneStorage(h.boundary, h.storage);
  const raw = '{"schemaVersion":99,"first":true}';
  h.values.set(CHAPTER_ONE_STORAGE_KEY, raw);
  expect(await store.startNew(createChapterOneSession('fresh-1', '0.1.0'), 1)).toBe(true);
  expect(await store.startNew(createChapterOneSession('fresh-2', '0.1.0', 1), 1)).toBe(true);
  expect(h.values.get(CHAPTER_ONE_BACKUP_KEY)).toBe(raw);
  const laterUnknown = '{"schemaVersion":100,"later":true}';
  h.values.set(CHAPTER_ONE_STORAGE_KEY, laterUnknown);
  expect(await store.startNew(createChapterOneSession('fresh-3', '0.1.0', 2), 1)).toBe(false);
  expect(h.values.get(CHAPTER_ONE_STORAGE_KEY)).toBe(laterUnknown);
  expect(h.values.get(CHAPTER_ONE_BACKUP_KEY)).toBe(raw);
});

test('historical import writes only the new campaign key and cannot replace a campaign', async () => {
  const h=harness(),store=createChapterOneStorage(h.boundary,h.storage),legacy=JSON.stringify(originalV1('cleared'));
  h.values.set('chroma-rift.perception-gallery.v1',legacy);
  const proposal=proposeLegacyCampaignImport({gallery:legacy,vault:null,theatre:null},'imported','0.1.0');
  expect(proposal.status).toBe('ready');
  if(proposal.status!=='ready')return;
  expect(await store.adoptLegacy(proposal.session,1)).toBe(true);
  expect(h.values.get('chroma-rift.perception-gallery.v1')).toBe(legacy);
  expect(await store.adoptLegacy(proposal.session,1)).toBe(false);
  expect((await createChapterOneStorage(h.boundary,h.storage).load())).toMatchObject({status:'loaded',session:{currentArea:'chapter-1-area-02',migrationSource:'legacy-prefix'}});
});

test('a mistaken isolation can be reopened before shutdown and cold-restored', async () => {
  const h = harness(), store = createChapterOneStorage(h.boundary, h.storage);
  const module = stageModule('departure-control-v1')!;
  const checkpoint = { ...module.checkpoint(module.create()), stageData: carriedKeyEntry() };
  const entry: ChapterOneSession = { ...createChapterOneSession('reopen-run', '0.1.0'),
    migrationSource: 'legacy-prefix', currentArea: 'chapter-1-area-05',
    completedAreas: CHAPTER_ONE.areas.slice(0, 4).map(area => area.id),
    checkpoint, keyLocation: 'carried' };
  expect(await store.adoptLegacy(entry, 1)).toBe(true);
  const installed = { ...checkpoint.stageData, keyAvailable: false, keyInstalled: true, procedureRead: true };
  const isolated: ChapterOneSession = { ...entry, revision: 1, keyLocation: 'installed',
    checkpoint: { ...checkpoint, stageData: { ...installed, isolated: true } },
    finale: { contained: true, isolated: true, stopped: false, outdoorExited: false } };
  expect(await store.save(isolated, 1)).toBe(true);
  const reopened: ChapterOneSession = { ...isolated, revision: 2,
    checkpoint: { ...checkpoint, stageData: { ...installed, isolated: false } },
    finale: { contained: false, isolated: false, stopped: false, outdoorExited: false } };
  expect(await store.save(reopened, 1)).toBe(true);
  expect((await createChapterOneStorage(h.boundary, h.storage).load())).toMatchObject({
    status: 'loaded', session: { revision: 2, finale: { isolated: false, stopped: false } },
  });
  expect(await store.save({ ...reopened, revision: 3,
    checkpoint: { ...checkpoint, stageData: { ...installed, isolated: true, stopped: true } },
    finale: { contained: true, isolated: true, stopped: true, outdoorExited: false } }, 1)).toBe(true);
  expect(await store.save({ ...reopened, revision: 4 }, 1)).toBe(false);
});
