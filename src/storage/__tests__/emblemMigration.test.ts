import AsyncStorage from '@react-native-async-storage/async-storage';

import { createCheckpoint, createInitialRuntime, type CheckpointState, type PuzzleState } from '../../domain/firstPerson';
import type { SealCheckpoint } from '../../domain/emblem/puzzle';
import { DEFAULT_FIRST_PERSON_CONTROLS, DEFAULT_FIRST_PERSON_ONBOARDING } from '../../types/application';
import { APPLICATION_STORAGE_KEY, createDefaultApplication } from '../applicationStorage';
import {
  FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY, FIRST_PERSON_ONBOARDING_KEY, FIRST_PERSON_PRE_EMBLEM_KEY,
  beginFirstPersonSession, loadFirstPersonStorage, resetAllApplicationStorage, resetFirstPersonChapter,
  saveFirstPersonCheckpoint, saveFirstPersonControls, saveFirstPersonOnboarding,
} from '../firstPersonStorage';

const fresh = () => createCheckpoint(createInitialRuntime());
function legacy(progress: Partial<PuzzleState> = {}): string {
  const runtime = createInitialRuntime();
  runtime.progress = { ...runtime.progress, ...progress };
  const checkpoint = createCheckpoint(runtime);
  delete checkpoint.progress.emblem;
  return JSON.stringify(checkpoint);
}
function withEmblem(change: Partial<SealCheckpoint>): CheckpointState {
  const checkpoint = fresh();
  checkpoint.progress.emblem = { ...checkpoint.progress.emblem!, ...change };
  return checkpoint;
}

describe('emblem checkpoint migration and backup ownership', () => {
  beforeEach(async () => {
    await resetAllApplicationStorage();
    jest.clearAllMocks();
  });

  it.each([
    { sealA: false, sealB: false, variant: 'entrance' as const },
    { guideExamined: true, markActivated: true, sealA: true, sealB: false, variant: 'entrance' as const },
    { guideExamined: true, markActivated: true, sealA: true, sealB: true, variant: 'exit' as const },
  ])('adds the emblem while preserving legacy progression %p and backs up before the first write', async (progress) => {
    const raw = legacy(progress);
    const application = JSON.stringify({ ...createDefaultApplication(), bestMazeScore: 640 });
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
    await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, application);
    const loaded = await loadFirstPersonStorage();
    expect(loaded.emblemStatus).toBe('migrated');
    expect(loaded.checkpoint.progress).toMatchObject(progress);
    expect(loaded.checkpoint.progress.emblem).toMatchObject({ seed: 21, phase: progress.sealA ? 'released' : 'unexamined' });
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(raw);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBeNull();
    const lease = beginFirstPersonSession();
    expect(await saveFirstPersonCheckpoint(loaded.checkpoint, lease)).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBe(raw);
    expect(JSON.parse((await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY))!)).toEqual(loaded.checkpoint);
    expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBe(application);
    const writes = jest.mocked(AsyncStorage.setItem).mock.calls.map(([key]) => key);
    expect(writes.lastIndexOf(FIRST_PERSON_PRE_EMBLEM_KEY)).toBeLessThan(writes.lastIndexOf(FIRST_PERSON_CHECKPOINT_KEY));
  });

  it.each([
    { schemaVersion: 1, seed: 'broken' },
    { schemaVersion: 1, seed: 21, phase: 'wrong', attempts: 0, hintTier: 0, assist: false, compared: false },
  ])('recovers malformed optional emblem data without losing solved legacy seals: %p', async (emblem) => {
    const raw = JSON.stringify({ ...JSON.parse(legacy({ sealA: true, sealB: true, variant: 'exit' })), progress: {
      ...JSON.parse(legacy({ sealA: true, sealB: true, variant: 'exit' })).progress, emblem,
    } });
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
    const loaded = await loadFirstPersonStorage();
    expect(loaded.emblemStatus).toBe('invalid');
    expect(loaded.checkpointWritable).toBe(true);
    expect(loaded.checkpoint.progress).toMatchObject({ sealA: true, sealB: true, variant: 'exit', emblem: { seed: 21, phase: 'released' } });
    expect(await saveFirstPersonCheckpoint(loaded.checkpoint, beginFirstPersonSession())).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBe(raw);
  });

  it('keeps a future emblem version read-only while resuming already solved key/return progress', async () => {
    const original = JSON.parse(legacy({ sealA: true, sealB: true, variant: 'exit' }));
    const raw = JSON.stringify({ ...original, progress: { ...original.progress, emblem: { schemaVersion: 99, future: 'preserve' } } });
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
    const loaded = await loadFirstPersonStorage();
    expect(loaded.status).toBe('blocked');
    expect(loaded.emblemStatus).toBe('unsupported');
    expect(loaded.checkpointWritable).toBe(false);
    expect(loaded.checkpoint.progress).toMatchObject({ sealA: true, sealB: true, variant: 'exit', emblem: { phase: 'released' } });
    const lease = beginFirstPersonSession();
    expect(await saveFirstPersonCheckpoint(loaded.checkpoint, lease)).toBe(false);
    expect(await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS, lease)).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(raw);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBeNull();
  });

  it('cannot gain seal A by submitting a released emblem inconsistent with the host flags', async () => {
    const inconsistent = withEmblem({ seed: 23, phase: 'released' });
    const raw = JSON.stringify(inconsistent);
    expect(await saveFirstPersonCheckpoint(inconsistent, beginFirstPersonSession())).toBe(false);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBeNull();
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
    const loaded = await loadFirstPersonStorage();
    expect(loaded.emblemStatus).toBe('invalid');
    expect(loaded.checkpoint.progress.sealA).toBe(false);
    expect(loaded.checkpoint.progress.emblem).toMatchObject({ seed: 23, phase: 'observing' });
    expect(await saveFirstPersonCheckpoint(loaded.checkpoint, beginFirstPersonSession())).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBe(raw);
  });

  it('keeps a resumed seed and monotonic attempts/hints/comparison while allowing assistance to be removed', async () => {
    const checkpoint = withEmblem({ seed: 22, phase: 'observing', attempts: 3, hintTier: 2, compared: true, assist: true });
    const lease = beginFirstPersonSession();
    expect(await saveFirstPersonCheckpoint(checkpoint, lease)).toBe(true);
    expect((await loadFirstPersonStorage()).checkpoint.progress.emblem).toEqual(checkpoint.progress.emblem);
    for (const change of [
      { seed: 23 }, { phase: 'unexamined' as const }, { attempts: 2 }, { hintTier: 1 as const }, { compared: false },
    ]) {
      const older = { ...checkpoint, progress: { ...checkpoint.progress, emblem: { ...checkpoint.progress.emblem!, ...change } } };
      expect(await saveFirstPersonCheckpoint(older, lease)).toBe(false);
    }
    const withoutGuide = { ...checkpoint, progress: { ...checkpoint.progress, emblem: { ...checkpoint.progress.emblem!, assist: false } } };
    expect(await saveFirstPersonCheckpoint(withoutGuide, lease)).toBe(true);
    const resumed = (await loadFirstPersonStorage()).checkpoint;
    expect(resumed.progress.emblem).toMatchObject({ seed: 22, phase: 'observing', attempts: 3, hintTier: 2, compared: true, assist: false });
  });

  it('persists only the validated canonical checkpoint, excluding transient or unknown fields', async () => {
    const candidate = { ...fresh(), rendererFrame: 999, progress: { ...fresh().progress, unexpected: 'not progression' } };
    expect(await saveFirstPersonCheckpoint(candidate, beginFirstPersonSession())).toBe(true);
    const saved = JSON.parse((await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY))!);
    expect(saved).not.toHaveProperty('rendererFrame');
    expect(saved.progress).not.toHaveProperty('unexpected');
    expect(saved.progress.emblem).toEqual(candidate.progress.emblem);
  });

  it('preserves the first backup byte-for-byte on later migrations', async () => {
    const first = legacy();
    await AsyncStorage.setItem(FIRST_PERSON_PRE_EMBLEM_KEY, first);
    const later = legacy({ guideExamined: true });
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, later);
    const loaded = await loadFirstPersonStorage();
    expect(await saveFirstPersonCheckpoint(loaded.checkpoint, beginFirstPersonSession())).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBe(first);
  });

  it.each(['read', 'write'])('never overwrites the sole legacy record after a backup %s failure', async (operation) => {
    const raw = legacy();
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
    const loaded = await loadFirstPersonStorage();
    if (operation === 'read') jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('backup read failed'));
    else jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('backup write failed'));
    const lease = beginFirstPersonSession();
    expect(await saveFirstPersonCheckpoint(loaded.checkpoint, lease)).toBe(false);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(raw);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBeNull();
    expect(await saveFirstPersonCheckpoint(loaded.checkpoint, lease)).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBe(raw);
  });

  it('serializes reset after a genuinely in-flight backup write and rejects queued resurrection', async () => {
    const raw = legacy();
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
    const loaded = await loadFirstPersonStorage();
    const memoryWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
    let release: (() => void) | undefined;
    let started: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    const held = new Promise<void>((resolve) => { release = resolve; });
    jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, value) => {
      started?.();
      await held;
      await memoryWrite(key, value);
    });
    const old = beginFirstPersonSession();
    const inFlight = saveFirstPersonCheckpoint(loaded.checkpoint, old);
    await entered;
    const queued = saveFirstPersonCheckpoint(loaded.checkpoint, old);
    const resetting = resetFirstPersonChapter();
    release?.();
    expect(await inFlight).toBe(false);
    expect(await queued).toBe(false);
    expect(await resetting).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBeNull();
    expect(await saveFirstPersonCheckpoint(fresh(), beginFirstPersonSession())).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBeNull();
  });

  it('does not create a backup from a stale load that resolves after reset', async () => {
    let release: ((raw: string) => void) | undefined;
    let started: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => { started = resolve; });
    jest.mocked(AsyncStorage.getItem).mockImplementationOnce(() => new Promise<string>((resolve) => { release = resolve; started?.(); }));
    const loading = loadFirstPersonStorage();
    await entered;
    expect(await resetFirstPersonChapter()).toBe(true);
    release?.(legacy({ sealA: true, sealB: true, variant: 'exit' }));
    expect((await loading).checkpointWritable).toBe(false);
    expect(await saveFirstPersonCheckpoint(fresh(), beginFirstPersonSession())).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBeNull();
  });

  it('clears only chapter and its backup on chapter reset, and clears all namespaces on full reset', async () => {
    const raw = legacy();
    await AsyncStorage.setItem(FIRST_PERSON_CHECKPOINT_KEY, raw);
    const loaded = await loadFirstPersonStorage();
    const lease = beginFirstPersonSession();
    await saveFirstPersonCheckpoint(loaded.checkpoint, lease);
    await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS, lease);
    await saveFirstPersonOnboarding({ ...DEFAULT_FIRST_PERSON_ONBOARDING, tutorialCompleted: true }, lease);
    expect(await resetFirstPersonChapter()).toBe(true);
    expect(await AsyncStorage.getItem(FIRST_PERSON_PRE_EMBLEM_KEY)).toBeNull();
    expect(await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY)).not.toBeNull();
    expect(await AsyncStorage.getItem(FIRST_PERSON_ONBOARDING_KEY)).not.toBeNull();
    await AsyncStorage.setItem(FIRST_PERSON_PRE_EMBLEM_KEY, raw);
    expect(await resetAllApplicationStorage()).toBe(true);
    for (const key of [FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_PRE_EMBLEM_KEY, FIRST_PERSON_CONTROLS_KEY, FIRST_PERSON_ONBOARDING_KEY]) {
      expect(await AsyncStorage.getItem(key)).toBeNull();
    }
  });
});
