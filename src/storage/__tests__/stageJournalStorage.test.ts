import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptyJournal, mergeStageHistory, parseStageJournal, resumableStage, type StageCardState } from '../../app/stages';
import { createGalleryRuntime, migrateGalleryV2Checkpoint } from '../../domain/gallery';
import { createCheckpoint } from '../../domain/firstPerson';
import { originalV2 } from '../testFixtures/galleryV2';
import { vaultCheckpoint } from '../testFixtures/vault';
import { STAGE_JOURNAL_KEY, VAULT_CHECKPOINT_KEY, GALLERY_CHECKPOINT_KEY, beginFirstPersonSession, loadStageJournal,
  recordStageEntry, recordStageHistory, resetAllApplicationStorage, resetVaultChapter, saveVaultCheckpoint, saveGalleryCheckpoint } from '../firstPersonStorage';

beforeEach(async () => { await resetAllApplicationStorage(); jest.clearAllMocks(); });

it('reconciles only recorded achievements without inventing discovery or entry chronology', () => {
  const migrated = migrateGalleryV2Checkpoint(originalV2('cleared'))!.checkpoint;
  const vault = vaultCheckpoint('rod'); vault.progress.vault!.discoveries.length = true;
  const journal = mergeStageHistory(emptyJournal(), [migrated, vault]);
  expect(journal.recentEntries).toEqual([]);
  expect(journal.history['perception-gallery-v1']).toEqual({ everCleared: true, discoveries: [] });
  expect(journal.history['uncanny-vault-v1']).toEqual({ everCleared: false, discoveries: ['length'] });
  const next = mergeStageHistory(journal, [vaultCheckpoint()]);
  expect(next).toEqual(journal);
});

it('tracks actual entered order and chooses only a validated current resumable run', async () => {
  const lease = beginFirstPersonSession(), gallery = createCheckpoint(createGalleryRuntime()), vault = vaultCheckpoint();
  expect(await recordStageEntry(gallery, lease, 'perception-gallery-v1')).toBe(true);
  expect(await recordStageEntry(vault, lease, 'uncanny-vault-v1')).toBe(true);
  expect(await recordStageEntry(vault, lease, 'uncanny-vault-v1')).toBe(true);
  const loaded = await loadStageJournal();
  expect(loaded.journal.recentEntries).toEqual(['uncanny-vault-v1', 'perception-gallery-v1']);
  const cards: StageCardState[] = [{ id: 'uncanny-vault-v1', current: 'blocked', history: { everCleared: false, discoveries: [] } },
    { id: 'perception-gallery-v1', current: 'exploring', history: { everCleared: false, discoveries: [] } }];
  expect(resumableStage(loaded.journal, cards)).toBe('perception-gallery-v1');
  cards[1]!.current = 'cleared'; expect(resumableStage(loaded.journal, cards)).toBeUndefined();
  expect(await recordStageEntry(vaultCheckpoint('clear'), lease, 'uncanny-vault-v1')).toBe(false);
  expect(await recordStageEntry(vault, lease, 'perception-gallery-v1')).toBe(false);
});

it.each(['{bad', '{"schemaVersion":99,"raw":"preserve"}',
  '{"schemaVersion":1,"recentEntries":["unknown"],"history":{}}',
  '{"schemaVersion":1,"recentEntries":[],"history":{"uncanny-vault-v1":{"everCleared":true,"discoveries":["unknown"]}}}'])('protects unknown journal bytes without blocking chapter progress: %s', async raw => {
  await AsyncStorage.setItem(STAGE_JOURNAL_KEY, raw);
  expect((await loadStageJournal()).writable).toBe(false);
  const lease = beginFirstPersonSession();
  expect(await recordStageHistory([vaultCheckpoint('clear')], lease)).toBe(false);
  expect(await saveVaultCheckpoint(vaultCheckpoint('length'), lease)).toBe(true);
  expect(await AsyncStorage.getItem(STAGE_JOURNAL_KEY)).toBe(raw);
});

it('preserves recorded achievement history before replacing just one current run', async () => {
  const lease = beginFirstPersonSession(), prior = vaultCheckpoint('clear');
  prior.progress.vault!.discoveries.length = true;
  const gallery = createCheckpoint(createGalleryRuntime());
  await saveGalleryCheckpoint(gallery, lease); await saveVaultCheckpoint(prior, lease);
  const other = await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY);
  expect(await resetVaultChapter(vaultCheckpoint('entry', 82))).toBe(true);
  expect((await loadStageJournal()).journal.history['uncanny-vault-v1']).toEqual({ everCleared: true, discoveries: ['length'] });
  expect(JSON.parse((await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY))!).progress.vault.seed).toBe(82);
  expect(await AsyncStorage.getItem(GALLERY_CHECKPOINT_KEY)).toBe(other);
  const writes = jest.mocked(AsyncStorage.setItem).mock.calls.map(([key]) => key);
  expect(writes.lastIndexOf(STAGE_JOURNAL_KEY)).toBeLessThan(writes.lastIndexOf(VAULT_CHECKPOINT_KEY));
});

it('does not destroy the only achievement evidence when its journal cannot be written', async () => {
  await saveVaultCheckpoint(vaultCheckpoint('clear'), beginFirstPersonSession());
  const prior = await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY);
  const write = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  jest.mocked(AsyncStorage.setItem).mockImplementation(async (key, raw) => {
    if (key === STAGE_JOURNAL_KEY) throw new Error('history disk failure');
    return write(key, raw);
  });
  expect(await resetVaultChapter(vaultCheckpoint('entry', 8))).toBe(false);
  expect(await AsyncStorage.getItem(VAULT_CHECKPOINT_KEY)).toBe(prior);
  jest.mocked(AsyncStorage.setItem).mockImplementation(write);
});

it('serializes history with chapter writes and full reset so old callbacks cannot resurrect it', async () => {
  const write = jest.mocked(AsyncStorage.setItem).getMockImplementation()!;
  let release!: () => void, reached!: () => void;
  const entered = new Promise<void>(resolve => { reached = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  jest.mocked(AsyncStorage.setItem).mockImplementationOnce(async (key, raw) => { reached(); await held; return write(key, raw); });
  const lease = beginFirstPersonSession(), pending = recordStageEntry(vaultCheckpoint(), lease, 'uncanny-vault-v1');
  await entered;
  const queued = recordStageHistory([vaultCheckpoint('clear')], lease), reset = resetAllApplicationStorage();
  release();
  expect(await pending).toBe(false); expect(await queued).toBe(false); expect(await reset).toBe(true);
  expect(await AsyncStorage.getItem(STAGE_JOURNAL_KEY)).toBeNull();
  expect(await recordStageHistory([vaultCheckpoint('clear')], lease)).toBe(false);
  expect((await loadStageJournal()).journal).toEqual(emptyJournal());
});

it('rejects malformed exact journal fields rather than making unknown achievements look real', () => {
  expect(parseStageJournal({ schemaVersion: 1, recentEntries: ['uncanny-vault-v1', 'uncanny-vault-v1'], history: {} })).toBeUndefined();
  expect(parseStageJournal({ schemaVersion: 1, recentEntries: [], history: { 'uncanny-vault-v1': { everCleared: 'yes', discoveries: [] } } })).toBeUndefined();
});
