import AsyncStorage from '@react-native-async-storage/async-storage';

import { createCheckpoint, createInitialRuntime, getWorld, restoreCheckpoint, type CheckpointState } from '../../domain/firstPerson';
import { DEFAULT_FIRST_PERSON_CONTROLS } from '../../types/application';
import { APPLICATION_STORAGE_KEY, LEGACY_APPLICATION_STORAGE_KEY, createDefaultApplication, loadApplication, saveApplication } from '../applicationStorage';
import {
  FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY, beginFirstPersonSession, decodeFirstPersonStorage,
  isFirstPersonSessionCurrent, loadFirstPersonStorage, resetAllApplicationStorage, resetFirstPersonChapter,
  saveFirstPersonCheckpoint, saveFirstPersonControls,
} from '../firstPersonStorage';

const freshCheckpoint = () => createCheckpoint(createInitialRuntime());
const controlsDocument = (controls = DEFAULT_FIRST_PERSON_CONTROLS) => JSON.stringify({ schemaVersion: 1, controls });

function solvedCheckpoint(): CheckpointState {
  const runtime = createInitialRuntime();
  return createCheckpoint({ ...runtime, progress: { ...runtime.progress, guideExamined: true, markActivated: true, sealA: true, sealB: true, variant: 'exit' } });
}

describe('first-person persistence and isolation', () => {
  beforeEach(async () => {
    await resetAllApplicationStorage();
    jest.clearAllMocks();
  });

  it('starts at an explicit first-person checkpoint and keeps old documents byte-for-byte', async () => {
    const oldApplication = { ...createDefaultApplication(), bestMazeScore: 777 };
    const legacyRaw = JSON.stringify({ ...oldApplication, schemaVersion: 1 });
    const currentRaw = JSON.stringify(oldApplication);
    await AsyncStorage.setItem(LEGACY_APPLICATION_STORAGE_KEY, legacyRaw);
    await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, currentRaw);
    const firstPerson = await loadFirstPersonStorage();
    expect(firstPerson.status).toBe('empty');
    expect(firstPerson.checkpoint).toEqual(freshCheckpoint());
    expect(firstPerson.controls).toEqual(DEFAULT_FIRST_PERSON_CONTROLS);
    expect(await AsyncStorage.getItem(LEGACY_APPLICATION_STORAGE_KEY)).toBe(legacyRaw);
    expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBe(currentRaw);
    expect((await loadApplication()).application.bestMazeScore).toBe(777);
  });

  it('persists chapter progress and independent comfort preferences', async () => {
    const checkpoint = solvedCheckpoint();
    const controls = { ...DEFAULT_FIRST_PERSON_CONTROLS, sensitivity: 0.5, movementMode: 'simple' as const, handedness: 'left' as const, quality: 'low' as const };
    const lease = beginFirstPersonSession();
    expect(await saveFirstPersonControls(controls)).toBe(true);
    expect(await saveFirstPersonCheckpoint(checkpoint, lease)).toBe(true);
    const restored = await loadFirstPersonStorage();
    expect(restored.checkpoint).toEqual(checkpoint);
    expect(restored.controls).toEqual(controls);
    expect(restored.checkpoint.progress.variant).toBe('exit');
    expect(restored.checkpoint.progress.sealA).toBe(true);
    expect(restored.checkpoint.progress.sealB).toBe(true);
  });

  it('never rewinds seals or the changed room from an older semantic checkpoint', async () => {
    const lease = beginFirstPersonSession();
    const solved = solvedCheckpoint();
    expect(await saveFirstPersonCheckpoint(solved, lease)).toBe(true);
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), lease)).toBe(false);
    expect(JSON.parse((await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)) ?? 'null')).toEqual(solved);
  });

  it('recovers an unsupported old level version through the domain safe-checkpoint validator', () => {
    const original = solvedCheckpoint();
    const raw = JSON.stringify({ ...original, levelVersion: 0 });
    const loaded = decodeFirstPersonStorage(raw, null);
    expect(loaded.status).toBe('recovered');
    expect(loaded.checkpointWritable).toBe(true);
    expect(loaded.checkpoint.levelVersion).toBe(original.levelVersion);
    expect(loaded.checkpoint.progress).toEqual(original.progress);
    expect(restoreCheckpoint(loaded.checkpoint)?.recovered).toBe(false);
  });

  it('recovers invalid/unsupported positions while preserving compatible solved flags', () => {
    const checkpoint = solvedCheckpoint();
    const loaded = decodeFirstPersonStorage(JSON.stringify({ ...checkpoint, pose: { ...checkpoint.pose, position: { x: 99999, y: -10, z: 99999 } } }), null);
    expect(loaded.status).toBe('recovered');
    expect(loaded.checkpoint.progress).toEqual(checkpoint.progress);
    expect(restoreCheckpoint(loaded.checkpoint)?.recovered).toBe(false);
  });

  it('recovers a pose inside an actual closed door collider', () => {
    const checkpoint = freshCheckpoint();
    const door = getWorld(createInitialRuntime()).solids.find((volume) => volume.kind === 'door');
    expect(door).toBeDefined();
    const pose = { ...checkpoint.pose, position: { x: (door!.min.x + door!.max.x) / 2, y: checkpoint.pose.position.y, z: (door!.min.z + door!.max.z) / 2 } };
    const loaded = decodeFirstPersonStorage(JSON.stringify({ ...checkpoint, pose }), null);
    expect(loaded.status).toBe('recovered');
    expect(restoreCheckpoint(loaded.checkpoint)?.recovered).toBe(false);
  });

  it.each(['{broken', '{"schemaVersion":99}', JSON.stringify({ ...freshCheckpoint(), chapterId: 'another-chapter' })])('preserves unsupported progress and blocks its autosave: %s', async (raw) => {
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
    await AsyncStorage.setItem(FIRST_PERSON_CONTROLS_KEY, controlsDocument());
    const loaded = await loadFirstPersonStorage();
    expect(loaded.status).toBe('blocked');
    expect(loaded.checkpoint).toEqual(freshCheckpoint());
    expect(loaded.checkpointWritable).toBe(false);
    expect(loaded.controlsWritable).toBe(true);
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), beginFirstPersonSession())).toBe(false);
    expect(await saveFirstPersonControls({ ...DEFAULT_FIRST_PERSON_CONTROLS, sensitivity: 2 })).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(raw);
  });

  it('blocks malformed controls without discarding the valid chapter', async () => {
    const checkpoint = solvedCheckpoint();
    const raw = controlsDocument({ ...DEFAULT_FIRST_PERSON_CONTROLS, sensitivity: 900 });
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, JSON.stringify(checkpoint));
    await AsyncStorage.setItem(FIRST_PERSON_CONTROLS_KEY, raw);
    const loaded = await loadFirstPersonStorage();
    expect(loaded.controlsWritable).toBe(false);
    expect(loaded.checkpointWritable).toBe(true);
    expect(loaded.checkpoint).toEqual(checkpoint);
    expect(await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS)).toBe(false);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY)).toBe(raw);
  });

  it('chapter reset clears only first-person progress and rejects callbacks from the prior lease', async () => {
    const controls = { ...DEFAULT_FIRST_PERSON_CONTROLS, sensitivity: 2 };
    const old = JSON.stringify(createDefaultApplication());
    await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, old);
    await saveFirstPersonControls(controls);
    const lease = beginFirstPersonSession();
    await saveFirstPersonCheckpoint(solvedCheckpoint(), lease);
    expect(await resetFirstPersonChapter()).toBe(true);
    expect(isFirstPersonSessionCurrent(lease)).toBe(false);
    expect(await saveFirstPersonCheckpoint(solvedCheckpoint(), lease)).toBe(false);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBe(old);
    expect((await loadFirstPersonStorage()).controls).toEqual(controls);
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), beginFirstPersonSession())).toBe(true);
  });

  it('invalidates callbacks when another run resumes', async () => {
    const old = beginFirstPersonSession();
    const next = beginFirstPersonSession();
    expect(await saveFirstPersonCheckpoint(solvedCheckpoint(), old)).toBe(false);
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), next)).toBe(true);
  });

  it('does not revive a checkpoint from a slow load that finishes after chapter reset', async () => {
    let release: ((raw: string) => void) | undefined;
    let began: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { began = resolve; });
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; began?.(); }));
    const loading = loadFirstPersonStorage();
    await entered;
    expect(await resetFirstPersonChapter()).toBe(true);
    release?.(JSON.stringify(solvedCheckpoint()));
    const loaded = await loading;
    expect(loaded.status).toBe('blocked');
    expect(loaded.checkpoint).toEqual(freshCheckpoint());
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), beginFirstPersonSession())).toBe(true);
  });

  it('snapshots the mutable checkpoint before an asynchronous storage write', async () => {
    const checkpoint = freshCheckpoint();
    const expected = JSON.parse(JSON.stringify(checkpoint));
    const saving = saveFirstPersonCheckpoint(checkpoint, beginFirstPersonSession());
    checkpoint.pose.position.x = 99999;
    expect(await saving).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)) ?? 'null')).toEqual(expected);
  });

  it('serializes chapter reset behind in-flight storage and prevents stale resurrection afterward', async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; started?.(); }));
    const oldLease = beginFirstPersonSession();
    const inFlight = saveFirstPersonCheckpoint(solvedCheckpoint(), oldLease);
    await entered;
    const queued = saveFirstPersonCheckpoint(solvedCheckpoint(), oldLease);
    const resetting = resetFirstPersonChapter();
    release?.();
    expect(await inFlight).toBe(false);
    expect(await queued).toBe(false);
    expect(await resetting).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBeNull();
    expect(await saveFirstPersonCheckpoint(solvedCheckpoint(), oldLease)).toBe(false);
  });

  it('full reset removes both legacy documents, chapter and controls and invalidates old saves', async () => {
    await AsyncStorage.setItem(LEGACY_APPLICATION_STORAGE_KEY, 'old-v1');
    await saveApplication(createDefaultApplication());
    await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS);
    const lease = beginFirstPersonSession();
    await saveFirstPersonCheckpoint(solvedCheckpoint(), lease);
    expect(await resetAllApplicationStorage()).toBe(true);
    for (const key of [APPLICATION_STORAGE_KEY, LEGACY_APPLICATION_STORAGE_KEY, FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY]) expect(await AsyncStorage.getItem(key)).toBeNull();
    expect(await saveFirstPersonCheckpoint(solvedCheckpoint(), lease)).toBe(false);
  });

  it('full reset coordinates pending application, checkpoint and controls saves', async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; started?.(); }));
    const oldApplicationWrite = saveApplication({ ...createDefaultApplication(), bestMazeScore: 500 });
    await entered;
    const lease = beginFirstPersonSession();
    const oldCheckpointWrite = saveFirstPersonCheckpoint(solvedCheckpoint(), lease);
    const oldControlsWrite = saveFirstPersonControls({ ...DEFAULT_FIRST_PERSON_CONTROLS, sensitivity: 2 });
    const reset = resetAllApplicationStorage();
    release?.();
    await oldApplicationWrite;
    expect(await oldCheckpointWrite).toBe(false);
    expect(await oldControlsWrite).toBe(false);
    expect(await reset).toBe(true);
    for (const key of [APPLICATION_STORAGE_KEY, FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY]) expect(await AsyncStorage.getItem(key)).toBeNull();
  });

  it('reports read, write and reset failures without deleting unrelated settings', async () => {
    await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS);
    jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('read failed'));
    const loaded = await loadFirstPersonStorage();
    expect(loaded.checkpointWritable).toBe(false);
    expect(loaded.controlsWritable).toBe(true);
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), beginFirstPersonSession())).toBe(false);
    await resetFirstPersonChapter();
    jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('write failed'));
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), beginFirstPersonSession())).toBe(false);
    jest.mocked(AsyncStorage.removeItem).mockRejectedValueOnce(new Error('reset failed'));
    expect(await resetFirstPersonChapter()).toBe(false);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY)).not.toBeNull();
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), beginFirstPersonSession())).toBe(false);
  });

  it('keeps both new namespaces write-blocked after a partial full-reset failure', async () => {
    await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS);
    jest.mocked(AsyncStorage.multiRemove).mockRejectedValueOnce(new Error('partial reset failed'));
    expect(await resetAllApplicationStorage()).toBe(false);
    expect(await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS)).toBe(false);
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), beginFirstPersonSession())).toBe(false);
    expect(await resetAllApplicationStorage()).toBe(true);
    expect(await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS)).toBe(true);
  });
});
