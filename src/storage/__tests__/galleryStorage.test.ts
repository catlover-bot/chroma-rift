import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCheckpoint, createInitialRuntime, type CheckpointState } from '../../domain/firstPerson';
import { createGalleryRuntime, createShadowSpec, createContourSpec, placeShadowSample, normalizeAngle, type DiscAngles } from '../../domain/gallery';
import { DEFAULT_AUDIO_PREFERENCES } from '../../audio';
import { DEFAULT_FIRST_PERSON_CONTROLS } from '../../types/application';
import { APPLICATION_STORAGE_KEY, createDefaultApplication, decodePersistedApplication, loadApplication, saveApplication } from '../applicationStorage';
import {
  GALLERY_CHECKPOINT_KEY, GALLERY_BACKUP_KEY, FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY,
  beginFirstPersonSession, decodeGalleryStorage, loadGalleryStorage, loadFirstPersonStorage,
  resetAllApplicationStorage, resetGalleryChapter, resetFirstPersonChapter,
  saveGalleryCheckpoint, saveFirstPersonCheckpoint, saveFirstPersonControls,
} from '../firstPersonStorage';

const fresh = () => createCheckpoint(createGalleryRuntime());
function solvedWings(): CheckpointState {
  const runtime = createGalleryRuntime(), gallery = runtime.progress.gallery!;
  let shadow = gallery.shadow;
  const pair = createShadowSpec(shadow.seed, shadow.variant).samples.filter(sample => sample.color === '#808080');
  shadow = placeShadowSample(shadow, pair[0]!.id, 'socket-left');
  shadow = placeShadowSample(shadow, pair[1]!.id, 'socket-right');
  runtime.progress = { ...runtime.progress, gallery: { ...gallery,
    shadow: { ...shadow, inspected: true, solved: true, attempts: 1 },
    contour: { ...gallery.contour, inspected: true, solved: true, attempts: 1,
      angles: createContourSpec(gallery.contour.seed).discs.map(disc => normalizeAngle(disc.targetAngle)) as DiscAngles }, order: ['C', 'B'],
  } };
  return createCheckpoint(runtime);
}

describe('independent gallery checkpoint and shared preferences', () => {
  beforeEach(async () => { await resetAllApplicationStorage(); jest.clearAllMocks(); });

  it('saves both chapters independently without changing legacy unlocks or calibration bytes', async () => {
    const oldRuntime = createInitialRuntime();
    oldRuntime.progress = { ...oldRuntime.progress, sealA: true, sealB: true, variant: 'exit' };
    const old = createCheckpoint(oldRuntime), appRaw = JSON.stringify(createDefaultApplication());
    await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, appRaw);
    const lease = beginFirstPersonSession();
    expect(await saveFirstPersonCheckpoint(old, lease)).toBe(true);
    const oldRaw = await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY);
    const gallery = solvedWings();
    expect(await saveGalleryCheckpoint(gallery, lease)).toBe(true);
    expect((await loadGalleryStorage()).checkpoint).toEqual(gallery);
    expect((await loadFirstPersonStorage()).checkpoint).toEqual(old);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(oldRaw);
    expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBe(appRaw);
    expect(await saveGalleryCheckpoint(old, lease)).toBe(false);
    expect(await saveFirstPersonCheckpoint(gallery, lease)).toBe(false);
  });

  it.each(['{bad', '{"schemaVersion":99}', '{"chapterId":"returnless-entrance"}'])('preserves unreadable gallery bytes and only blocks that chapter: %s', async (raw) => {
    await AsyncStorage.setItem(GALLERY_CHECKPOINT_KEY, raw);
    const loaded = await loadGalleryStorage();
    expect(loaded).toMatchObject({ status: 'blocked', checkpointWritable: false, hasCheckpoint: true });
    const lease = beginFirstPersonSession();
    expect(await saveGalleryCheckpoint(fresh(), lease)).toBe(false);
    expect(await saveFirstPersonCheckpoint(createCheckpoint(createInitialRuntime()), lease)).toBe(true);
    expect(await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS, lease)).toBe(true);
    expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(raw);
    expect(await AsyncStorage.getItem(GALLERY_BACKUP_KEY)).toBeNull();
  });

  it('accepts a newly chosen run seed in an empty namespace and then preserves it', async () => {
    const loaded = await loadGalleryStorage();
    expect(loaded.status).toBe('empty');
    const initial = createCheckpoint(createGalleryRuntime(undefined, undefined, 0x12345678));
    const lease = beginFirstPersonSession();
    expect(await saveGalleryCheckpoint(initial, lease)).toBe(true);
    expect((await loadGalleryStorage()).checkpoint.progress.gallery!.seed).toBe(0x12345678);
    expect(await saveGalleryCheckpoint(createCheckpoint(createGalleryRuntime(undefined, undefined, 99)), lease)).toBe(false);
    expect((await loadGalleryStorage()).checkpoint).toEqual(initial);
  });

  it('protects a future gallery document even when a caller saves before loading', async () => {
    const raw = '{"schemaVersion":44,"future":"retain"}';
    await AsyncStorage.setItem(GALLERY_CHECKPOINT_KEY, raw);
    expect(await saveGalleryCheckpoint(fresh(), beginFirstPersonSession())).toBe(false);
    expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(raw);
  });

  it('backs up a recoverable position once before replacing its original record', async () => {
    const checkpoint = solvedWings();
    const raw = JSON.stringify({ ...checkpoint, pose: { ...checkpoint.pose, position: { x: 999, y: 1.6, z: 999 } } });
    await AsyncStorage.setItem(GALLERY_CHECKPOINT_KEY, raw);
    const loaded = await loadGalleryStorage();
    expect(loaded.status).toBe('recovered');
    expect(loaded.checkpoint.progress).toEqual(checkpoint.progress);
    expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(raw);
    const lease = beginFirstPersonSession();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('backup failed'));
    expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(false);
    expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(raw);
    expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(true);
    expect(await AsyncStorage.getItem(GALLERY_BACKUP_KEY)).toBe(raw);
    expect(await saveGalleryCheckpoint(loaded.checkpoint, lease)).toBe(true);
    expect(await AsyncStorage.getItem(GALLERY_BACKUP_KEY)).toBe(raw);
  });

  it('never rewinds puzzle seeds, attempts, release order or solved flags', async () => {
    const solved = solvedWings(), lease = beginFirstPersonSession();
    expect(await saveGalleryCheckpoint(solved, lease)).toBe(true);
    const stored = await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY);
    const gallery = solved.progress.gallery!;
    for (const change of [
      { seed: gallery.seed + 1 }, { order: ['B', 'C'] as ('B' | 'C')[] },
      { shadow: { ...gallery.shadow, seed: gallery.shadow.seed + 1 } },
      { shadow: { ...gallery.shadow, solved: false } },
      { contour: { ...gallery.contour, attempts: 0 } },
    ]) {
      const next = { ...solved, progress: { ...solved.progress, gallery: { ...gallery, ...change } } };
      expect(await saveGalleryCheckpoint(next, lease)).toBe(false);
    }
    expect(await saveGalleryCheckpoint(fresh(), lease)).toBe(false);
    expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(stored);
  });

  it('snapshots committed placements without saving runtime pointers, mode, timers or audio', async () => {
    const checkpoint = solvedWings();
    const candidate = { ...checkpoint, activeDrag: { pointerId: 77 }, audioPlayer: 'transient', elapsed: 80 };
    const lease = beginFirstPersonSession();
    const writing = saveGalleryCheckpoint(candidate, lease);
    candidate.progress.gallery!.shadow.assignments['sample-a'] = 'source-a';
    expect(await writing).toBe(true);
    const saved = JSON.parse((await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY))!);
    expect(saved).not.toHaveProperty('activeDrag'); expect(saved).not.toHaveProperty('audioPlayer'); expect(saved).not.toHaveProperty('elapsed');
    expect(saved).toEqual(solvedWings());
  });

  it('serializes gallery reset after an in-flight write and rejects queued or old-session resurrection', async () => {
    const memoryWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
    let release: (() => void) | undefined, entered: (() => void) | undefined;
    const began = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, raw) => { entered?.(); await gate; await memoryWrite(key, raw); });
    const old = beginFirstPersonSession(), inFlight = saveGalleryCheckpoint(fresh(), old);
    await began;
    const queued = saveGalleryCheckpoint(solvedWings(), old);
    const reset = resetGalleryChapter(); release?.();
    expect(await inFlight).toBe(false); expect(await queued).toBe(false); expect(await reset).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY))!)).toEqual(fresh());
    expect(await saveGalleryCheckpoint(solvedWings(), old)).toBe(false);
    expect(await saveGalleryCheckpoint(fresh(), beginFirstPersonSession())).toBe(true);
  });

  it('does not revive a slow gallery load completed after reset', async () => {
    let release: ((value: string) => void) | undefined, entered: (() => void) | undefined;
    const began = new Promise<void>(resolve => { entered = resolve; });
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise(resolve => { release = resolve; entered?.(); }));
    const loading = loadGalleryStorage(); await began;
    expect(await resetGalleryChapter()).toBe(true);
    release?.(JSON.stringify(solvedWings()));
    expect((await loading).checkpointWritable).toBe(false);
    expect(await saveGalleryCheckpoint(fresh(), beginFirstPersonSession())).toBe(true);
    expect(await AsyncStorage.getItem(GALLERY_BACKUP_KEY)).toBeNull();
  });

  it('resets only the selected chapter and reserves both chapters plus audio removal for full reset', async () => {
    const lease = beginFirstPersonSession(), old = createCheckpoint(createInitialRuntime());
    await saveFirstPersonCheckpoint(old, lease); await saveGalleryCheckpoint(solvedWings(), lease);
    await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS, lease);
    await saveApplication({ ...createDefaultApplication(), settings: { ...createDefaultApplication().settings, audio: { enabled: false, musicVolume: 0.1, effectsVolume: 0.2 } } });
    expect(await resetFirstPersonChapter()).toBe(true);
    expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).not.toBeNull();
    await saveFirstPersonCheckpoint(old, beginFirstPersonSession());
    const oldRaw = await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY);
    expect(await resetGalleryChapter()).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(oldRaw);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY)).not.toBeNull();
    expect((await loadApplication()).application.settings.audio?.enabled).toBe(false);
    expect(await resetAllApplicationStorage()).toBe(true);
    for (const key of [FIRST_PERSON_CHECKPOINT_KEY, GALLERY_CHECKPOINT_KEY, GALLERY_BACKUP_KEY, APPLICATION_STORAGE_KEY]) expect(await AsyncStorage.getItem(key)).toBeNull();
  });

  it('adds audio defaults to old settings without losing quick setup or other values', () => {
    const original = createDefaultApplication(); delete original.settings.audio;
    const raw = JSON.stringify({ ...original, bestMazeScore: 777 });
    const loaded = decodePersistedApplication(raw);
    expect(loaded.status).toBe('loaded'); expect(loaded.application.bestMazeScore).toBe(777);
    expect(loaded.application.settings.audio).toEqual(DEFAULT_AUDIO_PREFERENCES);
    expect(decodeGalleryStorage(null)).toMatchObject({ status: 'empty', hasCheckpoint: false });
  });
});
