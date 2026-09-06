import AsyncStorage from '@react-native-async-storage/async-storage';

import { createCheckpoint, createInitialRuntime, getWorld, restoreCheckpoint, type CheckpointState } from '../../domain/firstPerson';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_FIRST_PERSON_ONBOARDING } from '../../types/application';
import { APPLICATION_STORAGE_KEY, LEGACY_APPLICATION_STORAGE_KEY, createDefaultApplication, loadApplication, saveApplication } from '../applicationStorage';
import {
  FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY, FIRST_PERSON_ONBOARDING_KEY, FIRST_PERSON_PRE_EMBLEM_KEY, beginFirstPersonSession, decodeFirstPersonStorage,
  isFirstPersonSessionCurrent, loadFirstPersonStorage, resetAllApplicationStorage, resetFirstPersonChapter,
  saveFirstPersonCheckpoint, saveFirstPersonControls, saveFirstPersonOnboarding,
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
    await saveFirstPersonOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING, tutorialCompleted: true }, lease);
    expect(await resetAllApplicationStorage()).toBe(true);
    for (const key of [APPLICATION_STORAGE_KEY, LEGACY_APPLICATION_STORAGE_KEY, FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY, FIRST_PERSON_ONBOARDING_KEY, FIRST_PERSON_PRE_EMBLEM_KEY]) expect(await AsyncStorage.getItem(key)).toBeNull();
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
    jest.mocked(AsyncStorage.multiRemove).mockRejectedValueOnce(new Error('reset failed'));
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

  it('preserves old simple preferences without inventing selection provenance or rewriting the raw save', async () => {
    const raw = JSON.stringify({ schemaVersion: 1, controls: { sensitivity: 1.5, movementMode: 'simple', handedness: 'left', quality: 'low' } });
    await AsyncStorage.setItem(FIRST_PERSON_CONTROLS_KEY, raw);
    const loaded = await loadFirstPersonStorage();
    expect(loaded.controls).toEqual({ sensitivity: 1.5, verticalSensitivity: 1, movementMode: 'simple', handedness: 'left', quality: 'low' });
    expect(loaded.onboarding).toEqual(DEFAULT_FIRST_PERSON_ONBOARDING);
    expect(loaded.controlsWritable).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY)).toBe(raw);
    expect(await AsyncStorage.getItem(FIRST_PERSON_ONBOARDING_KEY)).toBeNull();
  });

  it.each([undefined, null, 'slow', 0, 3, -1, {}])('defaults malformed optional vertical sensitivity %p without discarding valid old preferences or progress', (verticalSensitivity) => {
    const checkpoint = solvedCheckpoint();
    const raw = JSON.stringify({ schemaVersion: 1, controls: { ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple', sensitivity: 0.5, verticalSensitivity } });
    const loaded = decodeFirstPersonStorage(JSON.stringify(checkpoint), raw);
    expect(loaded.controls.verticalSensitivity).toBe(1);
    expect(loaded.controls.movementMode).toBe('simple');
    expect(loaded.controls.sensitivity).toBe(0.5);
    expect(loaded.controlsWritable).toBe(true);
    expect(loaded.checkpoint).toEqual(checkpoint);
  });

  it('round-trips a valid separate vertical sensitivity', async () => {
    const controls = { ...DEFAULT_FIRST_PERSON_CONTROLS, sensitivity: 1.5, verticalSensitivity: 0.5 };
    expect(await saveFirstPersonControls(controls)).toBe(true);
    expect((await loadFirstPersonStorage()).controls).toEqual(controls);
    expect(await saveFirstPersonControls({ ...controls, verticalSensitivity: Number.NaN })).toBe(false);
    expect((await loadFirstPersonStorage()).controls).toEqual(controls);
  });

  it('validates acknowledgement fields independently without deriving tutorial completion from puzzle state', () => {
    const loaded = decodeFirstPersonStorage(JSON.stringify(solvedCheckpoint()), null, JSON.stringify({ schemaVersion: 1, controlChoiceAcknowledged: true, tutorialCompleted: 'yes' }));
    expect(loaded.onboarding).toEqual({ schemaVersion: 1, controlChoiceAcknowledged: true, tutorialCompleted: false });
    expect(loaded.onboardingWritable).toBe(true);
    const missing = decodeFirstPersonStorage(JSON.stringify(solvedCheckpoint()), null);
    expect(missing.onboarding.tutorialCompleted).toBe(false);
  });

  it('writes acknowledgements independently, merges out-of-order completions and retains them through chapter restart', async () => {
    const application = JSON.stringify({ ...createDefaultApplication(), bestMazeScore: 998 });
    const checkpoint = JSON.stringify(solvedCheckpoint());
    const oldControls = controlsDocument({ ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' });
    await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, application);
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, checkpoint);
    await AsyncStorage.setItem(FIRST_PERSON_CONTROLS_KEY, oldControls);
    await loadFirstPersonStorage();
    const lease = beginFirstPersonSession();
    const choice = saveFirstPersonOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING, controlChoiceAcknowledged: true }, lease);
    const tutorial = saveFirstPersonOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING, tutorialCompleted: true }, lease);
    expect(await choice).toBe(true);
    expect(await tutorial).toBe(true);
    expect((await loadFirstPersonStorage()).onboarding).toEqual({ schemaVersion: 1, controlChoiceAcknowledged: true, tutorialCompleted: true });
    expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBe(application);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(checkpoint);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY)).toBe(oldControls);
    expect(await resetFirstPersonChapter()).toBe(true);
    expect((await loadFirstPersonStorage()).onboarding.tutorialCompleted).toBe(true);
    expect(await saveFirstPersonOnboarding(DEFAULT_FIRST_PERSON_ONBOARDING, lease)).toBe(false);
  });

  it.each(['{broken', '{"schemaVersion":99}'])('retains unreadable onboarding independently from chapter and control writes: %s', async (raw) => {
    await AsyncStorage.setItem(FIRST_PERSON_ONBOARDING_KEY, raw);
    const loaded = await loadFirstPersonStorage();
    expect(loaded.onboardingWritable).toBe(false);
    expect(loaded.controlsWritable).toBe(true);
    expect(loaded.checkpointWritable).toBe(true);
    const lease = beginFirstPersonSession();
    expect(await saveFirstPersonOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING, tutorialCompleted: true }, lease)).toBe(false);
    expect(await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS, lease)).toBe(true);
    expect(await saveFirstPersonCheckpoint(freshCheckpoint(), lease)).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_ONBOARDING_KEY)).toBe(raw);
  });

  it('rejects queued control and onboarding callbacks after a session replacement', async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; started?.(); }));
    const oldLease = beginFirstPersonSession();
    const inFlight = saveFirstPersonCheckpoint(freshCheckpoint(), oldLease);
    await entered;
    const oldControls = saveFirstPersonControls({ ...DEFAULT_FIRST_PERSON_CONTROLS, movementMode: 'simple' }, oldLease);
    const oldOnboarding = saveFirstPersonOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING, tutorialCompleted: true }, oldLease);
    beginFirstPersonSession();
    release?.();
    expect(await inFlight).toBe(false);
    expect(await oldControls).toBe(false);
    expect(await oldOnboarding).toBe(false);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(FIRST_PERSON_ONBOARDING_KEY)).toBeNull();
  });

  it('full reset removes an in-flight onboarding write and rejects queued acknowledgement resurrection', async () => {
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; started?.(); }));
    const lease = beginFirstPersonSession();
    const inFlight = saveFirstPersonOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING, tutorialCompleted: true }, lease);
    await entered;
    const queued = saveFirstPersonOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING, controlChoiceAcknowledged: true }, lease);
    const resetting = resetAllApplicationStorage();
    release?.();
    expect(await inFlight).toBe(false);
    expect(await queued).toBe(false);
    expect(await resetting).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_ONBOARDING_KEY)).toBeNull();
    expect((await loadFirstPersonStorage()).onboarding).toEqual(DEFAULT_FIRST_PERSON_ONBOARDING);
  });

});
