import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCheckpoint } from '../../domain/firstPerson';
import { createGalleryRuntime } from '../../domain/gallery';
import { beginFirstPersonSession, GALLERY_CHECKPOINT_KEY, GALLERY_PRE_V3_KEY, GALLERY_V1_CHECKPOINT_KEY, GALLERY_V2_CHECKPOINT_KEY, loadGalleryStorage, resetAllApplicationStorage, resetGalleryChapter, saveGalleryCheckpoint } from '../firstPersonStorage';
import { originalV1 } from '../testFixtures/galleryV1';
import { originalV2 } from '../testFixtures/galleryV2';

beforeEach(async () => { await resetAllApplicationStorage(); jest.clearAllMocks(); });
it.each(['initial', 'B', 'C', 'BC', 'connected', 'ending', 'cleared'] as const)('migrates actual v2 %s semantics without inventing new discoveries', async stage => {
  const old = originalV2(stage), raw = JSON.stringify(old, null, 2), v1 = JSON.stringify(originalV1('initial'));
  await AsyncStorage.setItem(GALLERY_V2_CHECKPOINT_KEY, raw); await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, v1);
  const loaded = await loadGalleryStorage(), gallery = loaded.checkpoint.progress.gallery!, bypass = ['connected', 'ending', 'cleared'].includes(stage);
  expect(loaded.status).toBe('migrated'); expect(loaded.checkpoint.levelVersion).toBe(3);
  expect(gallery.powerTaken).toEqual(old.progress.gallery.powerTaken); expect(gallery.powerConnected).toBe(old.progress.gallery.powerConnected);
  expect(gallery.wiring).toMatchObject({ solved: bypass, compatibleBypass: bypass, inspected: false });
  expect(Object.values(gallery.discoveries)).toEqual(Array(7).fill(false));
  expect(gallery.story).toMatchObject({ crossingStarted: false, crossingPresented: false });
  expect(gallery.completedFromV2).toBe(stage === 'cleared'); expect(gallery.finalDoorClosed).toBe(stage === 'cleared');
  expect(await saveGalleryCheckpoint(loaded.checkpoint, beginFirstPersonSession())).toBe(true);
  expect(await AsyncStorage.getItem(GALLERY_PRE_V3_KEY)).toBe(raw); expect(await AsyncStorage.getItem(GALLERY_V2_CHECKPOINT_KEY)).toBe(raw); expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(v1);
  const calls = jest.mocked(AsyncStorage.setItem).mock.calls;
  expect(calls.findIndex(([key]) => key === GALLERY_PRE_V3_KEY)).toBeLessThan(calls.findIndex(([key]) => key === GALLERY_CHECKPOINT_KEY));
});
it.each(['{broken', '{"schemaVersion":99}'])('protects unreadable v2 %s instead of falling back to v1', async raw => {
  await AsyncStorage.setItem(GALLERY_V2_CHECKPOINT_KEY, raw); await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, JSON.stringify(originalV1('cleared')));
  expect((await loadGalleryStorage()).status).toBe('blocked'); expect(await saveGalleryCheckpoint(createCheckpoint(createGalleryRuntime()), beginFirstPersonSession())).toBe(false);
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBeNull(); expect(await AsyncStorage.getItem(GALLERY_V2_CHECKPOINT_KEY)).toBe(raw);
});
it('protects future v3 even when a valid old v2 is present', async () => {
  const future = '{"schemaVersion":99,"future":"preserve"}'; await AsyncStorage.setItem(GALLERY_CHECKPOINT_KEY, future); await AsyncStorage.setItem(GALLERY_V2_CHECKPOINT_KEY, JSON.stringify(originalV2('cleared')));
  expect((await loadGalleryStorage()).status).toBe('blocked'); expect(await saveGalleryCheckpoint(createCheckpoint(createGalleryRuntime()), beginFirstPersonSession())).toBe(false);
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(future); expect(await AsyncStorage.getItem(GALLERY_PRE_V3_KEY)).toBeNull();
});
it('requires the v2 raw backup before v3 write and preserves it through explicit new play', async () => {
  const raw = JSON.stringify(originalV2('connected')); await AsyncStorage.setItem(GALLERY_V2_CHECKPOINT_KEY, raw);
  const loaded = await loadGalleryStorage(), lease = beginFirstPersonSession(); jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('backup'));
  expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(false); expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBeNull();
  expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(true);
  const fresh = createCheckpoint(createGalleryRuntime(undefined, undefined, 904)); expect(await resetGalleryChapter(fresh)).toBe(true);
  expect((await loadGalleryStorage()).checkpoint).toEqual(fresh); expect(fresh.progress.gallery!.wiring).toMatchObject({ solved: false, compatibleBypass: false });
  expect(await AsyncStorage.getItem(GALLERY_V2_CHECKPOINT_KEY)).toBe(raw); expect(await AsyncStorage.getItem(GALLERY_PRE_V3_KEY)).toBe(raw);
  expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(false);
});
it('keeps compatibility and discovered bits monotonic without saving notes or live comparison state', async () => {
  await AsyncStorage.setItem(GALLERY_V2_CHECKPOINT_KEY, JSON.stringify(originalV2('connected')));
  const loaded = await loadGalleryStorage(), cp = loaded.checkpoint, gallery = cp.progress.gallery!, lease = beginFirstPersonSession();
  const discovered = { ...cp, progress: { ...cp.progress, gallery: { ...gallery, discoveries: { ...gallery.discoveries, chromatic: true } } } };
  expect(await saveGalleryCheckpoint(discovered, lease)).toBe(true);
  expect(await saveGalleryCheckpoint(cp, lease)).toBe(false);
  const changed = { ...discovered, progress: { ...discovered.progress, gallery: { ...discovered.progress.gallery, wiring: { ...gallery.wiring, compatibleBypass: false } } } };
  expect(await saveGalleryCheckpoint(changed, lease)).toBe(false);
  const serialized = await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY); expect(serialized).not.toContain('notebookPreview'); expect(serialized).not.toContain('activeDrag');
});

it('persists opening and closing the inspection window while preserving its discovery', async () => {
  const cp = createCheckpoint(createGalleryRuntime()), gallery = cp.progress.gallery!, lease = beginFirstPersonSession();
  const opened = { ...cp, progress: { ...cp.progress, gallery: { ...gallery, maskWindowOpen: true, discoveries: { ...gallery.discoveries, mask: true } } } };
  expect(await saveGalleryCheckpoint(opened, lease)).toBe(true);
  const closed = { ...opened, progress: { ...opened.progress, gallery: { ...opened.progress.gallery, maskWindowOpen: false } } };
  expect(await saveGalleryCheckpoint(closed, lease)).toBe(true);
  expect((await loadGalleryStorage()).checkpoint.progress.gallery).toMatchObject({ maskWindowOpen: false, discoveries: { mask: true } });
});

it.each(['crossingStarted', 'crossingPresented'] as const)('preserves the new story bit %s after a confirmed write', async field => {
  await AsyncStorage.setItem(GALLERY_V2_CHECKPOINT_KEY, JSON.stringify(originalV2('B')));
  const checkpoint = (await loadGalleryStorage()).checkpoint, gallery = checkpoint.progress.gallery!, lease = beginFirstPersonSession();
  const advanced = { ...checkpoint, progress: { ...checkpoint.progress, gallery: { ...gallery, story: { ...gallery.story, crossingStarted: true, [field]: true } } } };
  expect(await saveGalleryCheckpoint(advanced, lease)).toBe(true);
  expect(await saveGalleryCheckpoint(checkpoint, lease)).toBe(false);
});
