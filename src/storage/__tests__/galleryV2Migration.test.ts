import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCheckpoint, createInitialRuntime, type CheckpointState } from '../../domain/firstPerson';
import { createGalleryRuntime } from '../../domain/gallery';
import { DEFAULT_SETTINGS } from '../../types/application';
import { createDefaultApplication, decodePersistedApplication } from '../applicationStorage';
import { beginFirstPersonSession, GALLERY_BACKUP_KEY, GALLERY_CHECKPOINT_KEY, GALLERY_PRE_V2_KEY, GALLERY_V1_BACKUP_KEY, GALLERY_V1_CHECKPOINT_KEY, FIRST_PERSON_CHECKPOINT_KEY, loadGalleryStorage, resetAllApplicationStorage, resetGalleryChapter, saveGalleryCheckpoint } from '../firstPersonStorage';

import { originalV1 } from '../testFixtures/galleryV1';

const fresh = (seed = 73) => createCheckpoint(createGalleryRuntime(undefined, undefined, seed));
beforeEach(async () => { await resetAllApplicationStorage(); jest.clearAllMocks(); });

it.each(['initial', 'A', 'B', 'C', 'BC', 'D', 'return', 'cleared'] as const)('migrates v1 %s once while preserving source bytes, collection and completion', async stage => {
  const original = originalV1(stage), raw = JSON.stringify(original, null, 2), legacy = JSON.stringify(createCheckpoint(createInitialRuntime()));
  await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, raw); await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, legacy);
  const loaded = await loadGalleryStorage(), progress = loaded.checkpoint.progress, gallery = progress.gallery!;
  expect(loaded).toMatchObject({ status: 'migrated', hasCheckpoint: true, checkpointWritable: true });
  expect(loaded.checkpoint.levelVersion).toBe(2); expect(gallery.schemaVersion).toBe(2);
  expect(gallery.shadow).toEqual(original.progress.gallery.shadow); expect(gallery.contour).toEqual(original.progress.gallery.contour);
  expect(gallery.powerTaken).toEqual({ shadow: gallery.shadow.solved, contour: gallery.contour.solved });
  expect(gallery.powerConnected).toBe(original.progress.sealB); expect(gallery.emergencyLit).toBe(stage !== 'initial');
  expect(gallery.completedFromV1).toBe(stage === 'cleared'); expect(progress.cleared).toBe(stage === 'cleared');
  expect(gallery.story).toEqual({ foreshadowed: stage !== 'initial', absence: !['initial', 'A'].includes(stage),
    serviceWarned: ['D', 'return', 'cleared'].includes(stage), resolved: stage === 'cleared' });
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBeNull();
  expect(await saveGalleryCheckpoint(loaded.checkpoint, beginFirstPersonSession())).toBe(true);
  expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(raw); expect(await AsyncStorage.getItem(GALLERY_PRE_V2_KEY)).toBe(raw);
  expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(legacy);
  const writes = jest.mocked(AsyncStorage.setItem).mock.calls;
  expect(writes.findIndex(([key]) => key === GALLERY_CHECKPOINT_KEY)).toBeGreaterThan(writes.findIndex(([key]) => key === GALLERY_PRE_V2_KEY));
  expect((await loadGalleryStorage()).status).toBe('loaded');
});

it('recovers unsafe v1 coordinates without removing powers or requiring the old key again', async () => {
  const source = originalV1('D'); source.pose.position = { x: 999, y: -50, z: 999 };
  const raw = JSON.stringify(source); await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, raw);
  const loaded = await loadGalleryStorage(); expect(loaded.checkpoint.pose.position).not.toEqual(source.pose.position);
  expect(loaded.checkpoint.progress.gallery).toMatchObject({ powerConnected: true, powerTaken: { shadow: true, contour: true } });
  expect(await saveGalleryCheckpoint(loaded.checkpoint, beginFirstPersonSession())).toBe(true); expect(await AsyncStorage.getItem(GALLERY_PRE_V2_KEY)).toBe(raw);
});

it.each(['{bad', '{"schemaVersion":99}', '{"schemaVersion":1,"levelVersion":44}'])('protects malformed or future v1 source: %s', async raw => {
  await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, raw);
  expect((await loadGalleryStorage()).status).toBe('blocked'); expect(await saveGalleryCheckpoint(fresh(), beginFirstPersonSession())).toBe(false);
  expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(raw); expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBeNull(); expect(await AsyncStorage.getItem(GALLERY_PRE_V2_KEY)).toBeNull();
});

it.each(['{bad', '{"schemaVersion":99,"future":"keep"}'])('never downgrades unreadable v2 into readable v1: %s', async raw => {
  const original = JSON.stringify(originalV1('cleared')); await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, original); await AsyncStorage.setItem(GALLERY_CHECKPOINT_KEY, raw);
  expect((await loadGalleryStorage()).status).toBe('blocked'); expect(await saveGalleryCheckpoint(fresh(), beginFirstPersonSession())).toBe(false);
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(raw); expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(original);
});

it('protects migration progress when a fresh writer is called before loading', async () => {
  const source = JSON.stringify(originalV1('BC')); await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, source);
  expect(await saveGalleryCheckpoint(fresh(), beginFirstPersonSession())).toBe(false);
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBeNull(); expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(source);
});

it('never writes v2 after failed backup and preserves an existing original backup on retry', async () => {
  const source = JSON.stringify(originalV1('B')); await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, source);
  const loaded = await loadGalleryStorage(), lease = beginFirstPersonSession();
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('backup failed'));
  expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(false); expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBeNull();
  expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(source);
  await AsyncStorage.setItem(GALLERY_PRE_V2_KEY, 'original backup retained');
  expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(true); expect(await AsyncStorage.getItem(GALLERY_PRE_V2_KEY)).toBe('original backup retained');
});

it('atomically resets v2 without resurrecting retained v1 on the next launch', async () => {
  const source = JSON.stringify(originalV1('cleared')); await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, source);
  const loaded = await loadGalleryStorage(); await saveGalleryCheckpoint(loaded.checkpoint, beginFirstPersonSession());
  const reset = fresh(88); expect(await resetGalleryChapter(reset)).toBe(true); expect((await loadGalleryStorage()).checkpoint).toEqual(reset);
  expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(source); expect(await AsyncStorage.getItem(GALLERY_PRE_V2_KEY)).toBe(source);
});

it('leaves both v1 and v2 intact when an explicit atomic reset fails', async () => {
  const source = JSON.stringify(originalV1('B')); await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, source);
  const loaded = await loadGalleryStorage(); await saveGalleryCheckpoint(loaded.checkpoint, beginFirstPersonSession()); const raw = await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY);
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('reset failed'));
  expect(await resetGalleryChapter(fresh(99))).toBe(false); expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(raw); expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(source);
});

it('serializes reset after an in-flight migration backup and rejects stale continuation', async () => {
  const source = JSON.stringify(originalV1('BC')); await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, source);
  const loaded = await loadGalleryStorage(), oldLease = beginFirstPersonSession(), write = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  let release: (() => void) | undefined, started: (() => void) | undefined;
  const entered = new Promise<void>(resolve => { started = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, raw) => { started!(); await gate; await write(key, raw); });
  const saving = saveGalleryCheckpoint(loaded.checkpoint, oldLease); await entered; const reset = resetGalleryChapter(fresh(22)); release!();
  expect(await saving).toBe(false); expect(await reset).toBe(true); expect(await saveGalleryCheckpoint(loaded.checkpoint, oldLease)).toBe(false);
  expect((await loadGalleryStorage()).checkpoint).toEqual(fresh(22)); expect(await AsyncStorage.getItem(GALLERY_V1_CHECKPOINT_KEY)).toBe(source);
});

it('refuses power/connection rewinds while treating old A/D flags as irrelevant', async () => {
  await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, JSON.stringify(originalV1('D')));
  const loaded = await loadGalleryStorage(), lease = beginFirstPersonSession(); expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(true);
  const p = loaded.checkpoint.progress, gallery = p.gallery!;
  for (const patch of [{ powerConnected: false }, { powerTaken: { shadow: true, contour: false } }, { emergencyLit: false }, { exitInspected: false }]) {
    const next: CheckpointState = { ...loaded.checkpoint, progress: { ...p, gallery: { ...gallery, ...patch } } }; expect(await saveGalleryCheckpoint(next, lease)).toBe(false);
  }
  const noOldConditions = { ...loaded.checkpoint, progress: { ...p, sealA: false, sealB: false, variant: 'entrance' as const } };
  expect(await saveGalleryCheckpoint(noOldConditions, lease)).toBe(true); expect((await loadGalleryStorage()).checkpoint.progress.gallery!.powerConnected).toBe(true);
});

it('removes retained migration sources only through explicit full-data reset', async () => {
  const keys = [GALLERY_V1_CHECKPOINT_KEY, GALLERY_V1_BACKUP_KEY, GALLERY_PRE_V2_KEY, GALLERY_CHECKPOINT_KEY, GALLERY_BACKUP_KEY];
  for (const key of keys) await AsyncStorage.setItem(key, 'retained');
  expect(await resetAllApplicationStorage()).toBe(true); for (const key of keys) expect(await AsyncStorage.getItem(key)).toBeNull();
});

it('adds only independent standard horror preference to old or malformed settings', () => {
  const original = createDefaultApplication(); delete original.settings.horrorIntensity;
  for (const value of [undefined, 'future-mode', null]) {
    const loaded = decodePersistedApplication(JSON.stringify({ ...original, settings: { ...original.settings, horrorIntensity: value }, bestMazeScore: 77 }));
    expect(loaded.status).toBe('loaded'); expect(loaded.application.settings).toEqual(DEFAULT_SETTINGS); expect(loaded.application.bestMazeScore).toBe(77);
  }
  const subdued = decodePersistedApplication(JSON.stringify({ ...original, settings: { ...original.settings, horrorIntensity: 'subdued', reducedMotion: true } }));
  expect(subdued.application.settings).toEqual({ ...DEFAULT_SETTINGS, horrorIntensity: 'subdued', reducedMotion: true });
});


it.each(['foreshadowed', 'absence', 'serviceWarned', 'resolved'] as const)('never rewinds completed story bit %s or persists an instantaneous actor', async bit => {
  await AsyncStorage.setItem(GALLERY_V1_CHECKPOINT_KEY, JSON.stringify(originalV1('cleared')));
  const loaded = await loadGalleryStorage(), lease = beginFirstPersonSession();
  expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(true);
  const runtime = createGalleryRuntime(loaded.checkpoint), checkpoint = createCheckpoint(runtime);
  const savedRaw = await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY), raw = JSON.stringify(checkpoint);
  expect(raw).not.toContain('startupGrace'); expect(raw).not.toContain('travelledDistance'); expect(raw).not.toContain('contactCooldown');
  const gallery = checkpoint.progress.gallery!;
  const rewound: CheckpointState = { ...checkpoint, progress: { ...checkpoint.progress,
    gallery: { ...gallery, story: { ...gallery.story, [bit]: false } } } };
  expect(await saveGalleryCheckpoint(rewound, lease)).toBe(false);
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(savedRaw);
});
