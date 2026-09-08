import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTheatreRuntime, THEATRE_CHECKPOINTS } from '../../domain/theatre';
import { theatreCheckpoint } from '../testFixtures/theatre';
import { vaultCheckpoint } from '../testFixtures/vault';
import { beginFirstPersonSession, decodeTheatreStorage, loadTheatreStorage, loadStageJournal, resetAllApplicationStorage, resetTheatreChapter,
  saveTheatreCheckpoint, saveVaultCheckpoint, THEATRE_BACKUP_KEY, THEATRE_CHECKPOINT_KEY, VAULT_CHECKPOINT_KEY } from '../firstPersonStorage';
beforeEach(async () => { await resetAllApplicationStorage(); jest.clearAllMocks(); });

it('saves this chapter independently and distinguishes accepted curtain, stable sealed and actual exit completion', async () => {
  const lease = beginFirstPersonSession();
  await saveVaultCheckpoint(vaultCheckpoint('length'), lease); const old = await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY);
  for (const stage of ['initial', 'light', 'accepted', 'sealed', 'completed'] as const) {
    const cp = theatreCheckpoint(stage);
    expect(await saveTheatreCheckpoint(cp, lease)).toBe(true);
    expect((await loadTheatreStorage()).checkpoint).toEqual(cp);
    expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(old);
  }
  expect(await saveVaultCheckpoint(theatreCheckpoint(), lease)).toBe(false);
  expect(await saveTheatreCheckpoint(vaultCheckpoint(), lease)).toBe(false);
});

it('cold-restores an accepted curtain to the protected sealed booth without forging completion or a discovery', () => {
  const cp = theatreCheckpoint('accepted'), loaded = decodeTheatreStorage(JSON.stringify(cp)), runtime = createTheatreRuntime(loaded.checkpoint);
  expect(loaded.status).toBe('loaded'); expect(runtime.progress.theatre).toMatchObject({ curtainAccepted: true, passageSealed: true, completed: false, discoveries: { shadow: false, depth: false } });
  expect(runtime.progress.cleared).toBe(false); expect(runtime.pose).toEqual(THEATRE_CHECKPOINTS.booth);
});

it.each(['{bad', '{"schemaVersion":99,"future":"preserve"}', JSON.stringify({ ...theatreCheckpoint(), levelVersion: 99 })])('protects original unknown bytes and allows the other chapter: %s', async raw => {
  await AsyncStorage.setItem(THEATRE_CHECKPOINT_KEY, raw);
  const lease = beginFirstPersonSession();
  expect(await saveTheatreCheckpoint(theatreCheckpoint(), lease)).toBe(false);
  expect((await loadTheatreStorage()).status).toBe('blocked');
  expect(await saveVaultCheckpoint(vaultCheckpoint(), lease)).toBe(true);
  expect(await AsyncStorage.getItem(THEATRE_CHECKPOINT_KEY)).toBe(raw); expect(await AsyncStorage.getItem(THEATRE_BACKUP_KEY)).toBeNull();
});

it('backs up exact recoverable raw before safe replacement and retries a failed backup', async () => {
  const cp = theatreCheckpoint('light'), raw = JSON.stringify({ ...cp, pose: { ...cp.pose, position: { x: 99, y: 1.6, z: 99 } } }, null, 2);
  await AsyncStorage.setItem(THEATRE_CHECKPOINT_KEY, raw);
  const loaded = await loadTheatreStorage(), lease = beginFirstPersonSession();
  expect(loaded.status).toBe('recovered'); expect(loaded.checkpoint.pose).toEqual(THEATRE_CHECKPOINTS.entry);
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('backup failure'));
  expect(await saveTheatreCheckpoint(loaded.checkpoint, lease)).toBe(false); expect(await AsyncStorage.getItem(THEATRE_CHECKPOINT_KEY)).toBe(raw);
  expect(await saveTheatreCheckpoint(loaded.checkpoint, lease)).toBe(true);
  expect(await AsyncStorage.getItem(THEATRE_BACKUP_KEY)).toBe(raw);
  expect(jest.mocked(AsyncStorage.setItem).mock.calls.slice(-2).map(([key]) => key)).toEqual([THEATRE_BACKUP_KEY, THEATRE_CHECKPOINT_KEY]);
});

it('keeps gates, discoveries and story monotonic without persisting transient state', async () => {
  const cp = theatreCheckpoint('inspection'), p = cp.progress.theatre!, lease = beginFirstPersonSession();
  p.discoveries.shadow = true; p.story = { crossingStarted: true, crossingPresented: true, projectorUsed: true };
  expect(await saveTheatreCheckpoint(cp, lease)).toBe(true);
  for (const mutate of [
    (next: typeof cp) => { next.progress.theatre!.discoveries.shadow = false; },
    (next: typeof cp) => { next.progress.theatre!.story.projectorUsed = false; },
    (next: typeof cp) => { next.progress.theatre!.bypassOpen = false; },
    (next: typeof cp) => { next.progress.theatre!.light.rail = .8; },
    (next: typeof cp) => { next.progress.theatre!.seed += 1; },
  ]) { const next = JSON.parse(JSON.stringify(cp)); mutate(next); expect(await saveTheatreCheckpoint(next, lease)).toBe(false); }
  const raw = (await AsyncStorage.getItem(THEATRE_CHECKPOINT_KEY))!;
  expect(raw).not.toMatch(/activeDrag|projectorSeconds|actor|lastNowMs|pointerId/);
  cp.pose = THEATRE_CHECKPOINTS.entry; expect(await saveTheatreCheckpoint(cp, lease)).toBe(true);
});

it('preserves history before a theatre-only replay and rejects stale saves after shared full reset', async () => {
  const lease = beginFirstPersonSession(), cp = theatreCheckpoint('completed'); cp.progress.theatre!.discoveries.shadow = true;
  await saveTheatreCheckpoint(cp, lease); await saveVaultCheckpoint(vaultCheckpoint('rod'), lease);
  const vault = await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY);
  expect(await resetTheatreChapter(theatreCheckpoint('initial', 19))).toBe(true);
  expect((await loadStageJournal()).journal.history['shadow-theatre-v1']).toEqual({ everCleared: true, discoveries: ['shadow'] });
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(vault);
  expect(await saveTheatreCheckpoint(cp, lease)).toBe(false);
  expect(await resetAllApplicationStorage()).toBe(true);
  expect(await AsyncStorage.getItem(THEATRE_CHECKPOINT_KEY)).toBeNull(); expect(await AsyncStorage.getItem(THEATRE_BACKUP_KEY)).toBeNull();
  expect(await saveTheatreCheckpoint(cp, lease)).toBe(false);
});
