import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCheckpoint, createInitialRuntime } from '../../domain/firstPerson';
import { createGalleryRuntime } from '../../domain/gallery';
import { VAULT_CHECKPOINTS } from '../../domain/vault/definition';
import { createVaultRuntime } from '../../domain/vault/runtime';
import { createVaultCheckpoint } from '../../domain/vault/checkpoint';
import { DEFAULT_FIRST_PERSON_CONTROLS } from '../../types/application';
import { APPLICATION_STORAGE_KEY, createDefaultApplication } from '../applicationStorage';
import { vaultCheckpoint } from '../testFixtures/vault';
import { VAULT_CHECKPOINT_KEY, VAULT_BACKUP_KEY, GALLERY_CHECKPOINT_KEY, GALLERY_V2_CHECKPOINT_KEY, FIRST_PERSON_CHECKPOINT_KEY, FIRST_PERSON_CONTROLS_KEY,
  beginFirstPersonSession, loadVaultStorage, resetAllApplicationStorage, resetVaultChapter,
  saveVaultCheckpoint, saveGalleryCheckpoint, saveFirstPersonCheckpoint, saveFirstPersonControls } from '../firstPersonStorage';

beforeEach(async () => { await resetAllApplicationStorage(); jest.clearAllMocks(); });

it('keeps all three chapters, old raw history, calibration and shared preferences separate', async () => {
  const lease = beginFirstPersonSession(), old = createCheckpoint(createInitialRuntime()), gallery = createCheckpoint(createGalleryRuntime()), vault = vaultCheckpoint('length');
  const appRaw = JSON.stringify(createDefaultApplication()), oldV2 = '{"history":"unaltered"}';
  await AsyncStorage.setItem(APPLICATION_STORAGE_KEY, appRaw);
  expect(await saveFirstPersonCheckpoint(old, lease)).toBe(true);
  expect(await saveGalleryCheckpoint(gallery, lease)).toBe(true);
  const oldRaw = await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY), galleryRaw = await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY);
  await AsyncStorage.setItem(GALLERY_V2_CHECKPOINT_KEY, oldV2);
  expect(await saveVaultCheckpoint(vault, lease)).toBe(true);
  expect((await loadVaultStorage()).checkpoint).toEqual(vault);
  expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(oldRaw);
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(galleryRaw);
  expect(await AsyncStorage.getItem(GALLERY_V2_CHECKPOINT_KEY)).toBe(oldV2);
  expect(await AsyncStorage.getItem(APPLICATION_STORAGE_KEY)).toBe(appRaw);
  expect(await saveVaultCheckpoint(old, lease)).toBe(false); expect(await saveVaultCheckpoint(gallery, lease)).toBe(false);
  expect(await saveFirstPersonCheckpoint(vault, lease)).toBe(false); expect(await saveGalleryCheckpoint(vault, lease)).toBe(false);
});

it.each(['{bad', '{"schemaVersion":99}', JSON.stringify({ ...vaultCheckpoint(), levelVersion: 99 })])('protects invalid/future raw and blocks only vault: %s', async raw => {
  await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, raw);
  const loaded = await loadVaultStorage(), lease = beginFirstPersonSession();
  expect(loaded).toMatchObject({ status: 'blocked', checkpointWritable: false, hasCheckpoint: true });
  expect(await saveVaultCheckpoint(vaultCheckpoint(), lease)).toBe(false);
  expect(await saveGalleryCheckpoint(createCheckpoint(createGalleryRuntime()), lease)).toBe(true);
  expect(await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS, lease)).toBe(true);
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(raw); expect(await AsyncStorage.getItem(VAULT_BACKUP_KEY)).toBeNull();
});

it('refuses a save before load when a future raw already owns this namespace', async () => {
  const raw = '{"schemaVersion":55,"future":"preserve"}'; await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, raw);
  expect(await saveVaultCheckpoint(vaultCheckpoint(), beginFirstPersonSession())).toBe(false);
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(raw);
});

it('selects a run seed once and preserves it through cold restore, retry and checkpoints', async () => {
  expect((await loadVaultStorage()).status).toBe('empty');
  const seed = 0x12345678, initial = createVaultCheckpoint(createVaultRuntime(undefined, undefined, seed)), lease = beginFirstPersonSession();
  expect(await saveVaultCheckpoint(initial, lease)).toBe(true);
  const loaded = (await loadVaultStorage()).checkpoint;
  expect(createVaultRuntime(loaded, undefined, 9).progress.vault!.seed).toBe(seed);
  expect(await saveVaultCheckpoint(vaultCheckpoint('entry', 9), lease)).toBe(false);
  expect((await loadVaultStorage()).checkpoint).toEqual(initial);
});

it('backs up exact recoverable raw before canonical write and retries a failed backup without losing it', async () => {
  const cp = vaultCheckpoint('length'), raw = JSON.stringify({ ...cp, pose: { position: { x: 999, y: 1.6, z: 999 }, yaw: 0, pitch: 0 } }, null, 2);
  await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, raw);
  const loaded = await loadVaultStorage(), lease = beginFirstPersonSession();
  expect(loaded).toMatchObject({ status: 'recovered', checkpoint: { pose: VAULT_CHECKPOINTS.entry } });
  jest.mocked(AsyncStorage.setItem).mockRejectedValueOnce(new Error('backup failed'));
  expect(await saveVaultCheckpoint(loaded.checkpoint, lease)).toBe(false);
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(raw);
  expect(await saveVaultCheckpoint(loaded.checkpoint, lease)).toBe(true);
  expect(await AsyncStorage.getItem(VAULT_BACKUP_KEY)).toBe(raw);
  const writes = jest.mocked(AsyncStorage.setItem).mock.calls.filter(([key]) => key === VAULT_CHECKPOINT_KEY || key === VAULT_BACKUP_KEY);
  expect(writes.slice(-2).map(([key]) => key)).toEqual([VAULT_BACKUP_KEY, VAULT_CHECKPOINT_KEY]);
  expect(await saveVaultCheckpoint(loaded.checkpoint, lease)).toBe(true); expect(await AsyncStorage.getItem(VAULT_BACKUP_KEY)).toBe(raw);
});

it('keeps solved progress and discoveries monotonic while allowing aids and the last visited refuge to change', async () => {
  const cp = vaultCheckpoint('rod'), p = cp.progress.vault!, lease = beginFirstPersonSession();
  p.discoveries.length = true; p.story.revealStarted = true; p.story.revealPresented = true; p.story.finalPursuitStarted = true;
  expect(await saveVaultCheckpoint(cp, lease)).toBe(true);
  const raw = await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY);
  for (const mutation of [
    (next: typeof cp) => { next.progress.vault!.discoveries.length = false; },
    (next: typeof cp) => { next.progress.vault!.story.revealPresented = false; },
    (next: typeof cp) => { next.progress.vault!.length.attempts = 0; },
    (next: typeof cp) => { next.progress.vault!.length.solved = false; },
    (next: typeof cp) => { next.progress.vault!.rod.angle = .01; },
  ]) { const next = JSON.parse(JSON.stringify(cp)); mutation(next); expect(await saveVaultCheckpoint(next, lease)).toBe(false); }
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(raw);
  cp.pose = VAULT_CHECKPOINTS.entry; p.aids.plumb = true;
  expect(await saveVaultCheckpoint(cp, lease)).toBe(true); p.aids.plumb = false;
  expect(await saveVaultCheckpoint(cp, lease)).toBe(true);
  expect((await loadVaultStorage()).checkpoint.pose).toEqual(VAULT_CHECKPOINTS.entry);
});

it('orders a current-chapter reset after an in-flight write and rejects queued or retired callbacks', async () => {
  const memoryWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  let release!: () => void, entered!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, raw) => { entered(); await held; return memoryWrite(key, raw); });
  const lease = beginFirstPersonSession(), oldWrite = saveVaultCheckpoint(vaultCheckpoint('length'), lease);
  await reached;
  const queued = saveVaultCheckpoint(vaultCheckpoint('rod'), lease), fresh = vaultCheckpoint('entry', 12), reset = resetVaultChapter(fresh);
  release(); expect(await oldWrite).toBe(false); expect(await queued).toBe(false); expect(await reset).toBe(true);
  expect((await loadVaultStorage()).checkpoint).toEqual(fresh);
  expect(await saveVaultCheckpoint(vaultCheckpoint('clear'), lease)).toBe(false);
});

it('resets only vault and retains original backups, other chapters and shared settings', async () => {
  const lease = beginFirstPersonSession(), original = '{"source":"keep"}';
  const old = createCheckpoint(createInitialRuntime()), gallery = createCheckpoint(createGalleryRuntime());
  await saveFirstPersonCheckpoint(old, lease); await saveGalleryCheckpoint(gallery, lease); await saveFirstPersonControls(DEFAULT_FIRST_PERSON_CONTROLS, lease);
  await AsyncStorage.setItem(VAULT_BACKUP_KEY, original); await saveVaultCheckpoint(vaultCheckpoint('clear'), lease);
  const controls = await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY), oldRaw = await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY), galleryRaw = await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY);
  expect(await resetVaultChapter(vaultCheckpoint('entry', 44))).toBe(true);
  expect(await AsyncStorage.getItem(VAULT_BACKUP_KEY)).toBe(original); expect(await AsyncStorage.getItem(FIRST_PERSON_CHECKPOINT_KEY)).toBe(oldRaw);
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(galleryRaw); expect(await AsyncStorage.getItem(FIRST_PERSON_CONTROLS_KEY)).toBe(controls);
  expect(await resetAllApplicationStorage()).toBe(true);
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBeNull(); expect(await AsyncStorage.getItem(VAULT_BACKUP_KEY)).toBeNull();
});


it('shares the gallery writer and full-reset generation so neither queued namespace can resurrect', async () => {
  const memoryWrite = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  let release!: () => void, entered!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, raw) => { expect(key).toBe(GALLERY_CHECKPOINT_KEY); entered(); await held; return memoryWrite(key, raw); });
  const lease = beginFirstPersonSession(), galleryWrite = saveGalleryCheckpoint(createCheckpoint(createGalleryRuntime()), lease);
  await reached;
  const vaultWrite = saveVaultCheckpoint(vaultCheckpoint(), lease);
  await Promise.resolve(); expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBeNull();
  const reset = resetAllApplicationStorage(); release();
  expect(await galleryWrite).toBe(false); expect(await vaultWrite).toBe(false); expect(await reset).toBe(true);
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBeNull(); expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBeNull();
  expect(await saveVaultCheckpoint(vaultCheckpoint('clear'), lease)).toBe(false);
  expect(await saveVaultCheckpoint(vaultCheckpoint('entry', 71), beginFirstPersonSession())).toBe(true);
});

it('fails closed on vault read errors while retaining the underlying bytes', async () => {
  const raw = JSON.stringify(vaultCheckpoint('length')); await AsyncStorage.setItem(VAULT_CHECKPOINT_KEY, raw);
  jest.mocked(AsyncStorage.getItem).mockRejectedValueOnce(new Error('storage unavailable'));
  expect(await loadVaultStorage()).toMatchObject({ status: 'blocked', checkpointWritable: false });
  expect(await saveVaultCheckpoint(vaultCheckpoint(), beginFirstPersonSession())).toBe(false);
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(raw);
});
