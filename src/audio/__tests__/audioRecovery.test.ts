import { createSharedNativeAudioHarness, mockStaticAudioAssets } from '../testFixtures/sharedNativeAudio';
import type { GalleryAudio } from '../types';

let mockNative: ReturnType<typeof createSharedNativeAudioHarness>;
jest.mock('expo', () => ({ requireOptionalNativeModule: () => ({}) }));
jest.mock('expo-audio', () => ({
  createAudioPlayer: (...args: Parameters<typeof mockNative.module.createAudioPlayer>) => mockNative.module.createAudioPlayer(...args),
  setAudioModeAsync: (mode: unknown) => mockNative.module.setAudioModeAsync(mode),
  setIsAudioActiveAsync: (active: boolean) => mockNative.module.setIsAudioActiveAsync(active),
}));
const owners: GalleryAudio[] = [];
beforeEach(() => { jest.resetModules(); mockStaticAudioAssets(); mockNative = createSharedNativeAudioHarness(); });
afterEach(async () => { owners.splice(0).forEach(owner => owner.dispose()); await settle(); jest.restoreAllMocks(); });
async function settle() { for (let i = 0; i < 16; i++) await Promise.resolve(); }
function make(id = 'area-02', musicOnly = false) {
  const { createGalleryAudio } = require('../index') as typeof import('../index');
  const owner = createGalleryAudio({ sessionId: id, areaId: 'gallery-v1', campaignAreaId: '02', campaignSessionId: 'campaign', runtimeSession: 2, musicOnly });
  owners.push(owner); return owner;
}
const support = () => (require('../diagnostics') as typeof import('../diagnostics')).getAudioSupportSnapshot();
async function playing() { const owner = make(); owner.setActive(true); await owner.whenReady(); owner.setMusicState('exploration', 'area-02'); return owner; }
function advance(owner: GalleryAudio, seconds: number) { for (let i = 0; i < seconds * 10; i++) { mockNative.advanceSeconds(.1); owner.advanceMusic(.1, 'area-02'); } }

it('repairs a late last-owner false before declaring a newly mounted owner ready', async () => {
  const first = await playing(); const delayedFalse = mockNative.deferNextActivation(); first.dispose(); await settle();
  expect(mockNative.events.at(-1)?.operation).toBe('deactivate-request');
  const next = make('area-03'); next.setActive(true); let ready = false; void next.whenReady().then(() => { ready = true; }); await settle();
  expect(ready).toBe(false); expect(mockNative.live()).toHaveLength(0);
  delayedFalse.resolve(); await next.whenReady(); next.setMusicState('exploration', 'area-03');
  expect(mockNative.activeSession).toBe(true); expect(mockNative.live().some(p => p.source === 'exploration' && p.playing)).toBe(true);
  const operations = mockNative.events.filter(event => event.operation.endsWith('return')).map(event => event.operation);
  expect(operations.slice(-2)).toEqual(['deactivate-return', 'activate-return']);
});

it('ignores a disposed owner prepare completion and its queued music intent', async () => {
  const pending = mockNative.deferNextPrepare(); const old = make('old'); old.setActive(true); old.setMusicState('pursuit', 'old'); await settle();
  old.dispose(); const next = make('next'); next.setActive(true); next.setMusicState('exploration', 'next');
  pending.resolve(); await old.whenReady(); await next.whenReady();
  expect(mockNative.live().filter(p => p.source === 'pursuit')).toHaveLength(0);
  expect(mockNative.live().filter(p => p.source === 'exploration')).toHaveLength(1);
  expect(support().events.some(event => event.phase === 'obsolete-prepare')).toBe(true);
});

it('rejects reverse seek completions after reuse, pause, and disposal without replaying old one-shots', async () => {
  const owner = await playing(); const oldSeek = mockNative.deferNextSeek(); const second = mockNative.deferNextSeek();
  owner.event({ sessionId: 'area-02', sequence: 1, type: 'key' }); owner.event({ sessionId: 'area-02', sequence: 2, type: 'key' });
  second.resolve(); await settle(); const key = mockNative.live().find(p => p.source === 'key')!; expect(key.play).toHaveBeenCalledTimes(1);
  owner.setActive(false, 'paused'); oldSeek.resolve(); await settle(); expect(key.play).toHaveBeenCalledTimes(1);
  owner.setActive(true); await owner.whenReady(); const late = mockNative.deferNextSeek(); owner.event({ sessionId: 'area-02', sequence: 3, type: 'key' }); owner.dispose();
  late.resolve(); await settle(); expect(key.play).toHaveBeenCalledTimes(1); expect(mockNative.live()).toHaveLength(0);
});

it('does not restart a route-disconnected voice each frame or infer resume from the same requested ID', async () => {
  const owner = await playing(); const original = mockNative.live().find(p => p.source === 'exploration')!;
  mockNative.disconnectRoute(); owner.setMusicState('exploration', 'area-02'); advance(owner, 6);
  expect(original.play).toHaveBeenCalledTimes(1); expect(original.playing).toBe(false);
  expect(await owner.recover('user')).toBe(true);
  expect(mockNative.live().some(p => p.source === 'exploration' && p.playing)).toBe(true);
});

it('isolates music recovery from healthy environment/effects and de-duplicates concurrent repair', async () => {
  const owner = await playing(); const ambient = mockNative.live().find(p => p.source === 'room-gallery')!;
  const voice = mockNative.live().find(p => p.source === 'exploration')!; voice.error = 'isolated music failure'; voice.notify(); owner.advanceMusic(.1, 'area-02');
  expect(owner.getDiagnostics().availability).toBe('available'); expect(ambient.playing).toBe(true);
  await Promise.all([owner.recover('user'), owner.recover('foreground')]);
  expect(ambient.release).not.toHaveBeenCalled(); expect(ambient.play).toHaveBeenCalledTimes(1);
  expect(mockNative.live().filter(p => p.source === 'exploration')).toHaveLength(1);
  expect(support().events.filter(event => event.phase === 'recovery-start')).toHaveLength(1);
});

it('bounds failed backend recovery to two repairs and retains the original failure through disposal', async () => {
  const pending = mockNative.deferNextPrepare(); const owner = make(); owner.setActive(true); await settle(); pending.reject(new Error('initial token=secret https://private.invalid/a')); await owner.whenReady();
  expect(owner.getDiagnostics()).toMatchObject({ availability: 'unavailable', players: 0 });
  mockNative.module.setAudioModeAsync.mockRejectedValue(new Error('later failure'));
  expect(await owner.recover('user')).toBe(false); expect(await owner.recover('foreground')).toBe(false); expect(await owner.recover('user')).toBe(false);
  expect(mockNative.module.setAudioModeAsync).toHaveBeenCalledTimes(3); owner.dispose(); await settle();
  expect(support().firstAudioFailure?.message).toBe('initial [credential] [url]');
  expect(support().firstAudioFailure?.campaignAreaId).toBe('02'); expect(support().livePlayers).toBe(0);
});

it('keeps intentional music silence and all-zero preferences out of failure and recovery', async () => {
  const owner = make(); owner.updatePreferences({ enabled: true, musicVolume: 0, environmentVolume: 0, effectsVolume: 0 }); owner.setActive(true); await owner.whenReady();
  owner.setMusicState('exploration', 'area-02'); expect(await owner.recover('foreground')).toBe(false);
  expect(mockNative.players).toHaveLength(0); expect(support().firstAudioFailure).toBeNull();
  owner.updatePreferences({ enabled: true, musicVolume: 0, environmentVolume: .2, effectsVolume: .3 }); await owner.whenReady();
  expect(mockNative.live().find(p => p.source === 'room-gallery')!.volume).toBeCloseTo(.12); expect(owner.getDiagnostics().musicPlayers).toBe(0);
  owner.setActive(false, 'background'); await settle(); expect(mockNative.activeSession).toBe(false);
  expect(mockNative.live().every(p => !p.playing && p.volume === 0)).toBe(true);
  owner.setActive(true); await owner.whenReady(); expect(await owner.recover('foreground')).toBe(true);
  expect(mockNative.live().find(p => p.source === 'room-gallery')!.volume).toBeCloseTo(.12); expect(support().firstAudioFailure).toBeNull();
});

it('runs beyond two full exploration loops, crossfades only an actually playing incoming voice, then completes ending once', async () => {
  const owner = await playing(); advance(owner, 180);
  const outgoing = mockNative.live().find(p => p.source === 'exploration')!; expect(outgoing.play).toHaveBeenCalledTimes(1); expect(outgoing.currentTime).toBeCloseTo(4, 4);
  const create = mockNative.module.createAudioPlayer.getMockImplementation()!;
  mockNative.module.createAudioPlayer.mockImplementation((asset, options) => { const p = create(asset, options); if (p.source === 'pursuit') p.isBuffering = true; return p; });
  owner.setMusicState('pursuit', 'area-02'); advance(owner, 4);
  expect(outgoing.release).not.toHaveBeenCalled(); expect(outgoing.volume).toBeGreaterThan(0);
  const incoming = mockNative.live().find(p => p.source === 'pursuit')!; mockNative.completeBuffering(incoming); advance(owner, 2);
  expect(outgoing.release).toHaveBeenCalledTimes(1); expect(incoming.playing).toBe(true);
  owner.setMusicState('chapter_end', 'area-02'); advance(owner, 65);
  expect(owner.getDiagnostics().musicPlayers).toBe(0); owner.setMusicState('chapter_end', 'area-02'); advance(owner, 3);
  expect(mockNative.players.filter(p => p.source === 'chapter_end')).toHaveLength(1); expect(mockNative.maxLivePlayers).toBeLessThanOrEqual(12);
});

it('returns owner/player/subscription/native-deactivation counts to zero over twelve complete entries', async () => {
  for (let visit = 0; visit < 12; visit++) {
    const owner = await playing(); advance(owner, 5); owner.setMusicState('pursuit', 'area-02'); advance(owner, .5);
    owner.setActive(false, 'notes'); await settle(); owner.setPreviewActive(true); await owner.whenReady();
    expect(owner.playIllusion('area-02', 'subdued')).toBe(false); expect(owner.playIllusion('area-02', 'standard')).toBe(true); await settle();
    owner.setPreviewActive(false); owner.dispose(); await settle();
    expect(mockNative.live()).toHaveLength(0); expect(mockNative.subscriptions).toBe(0); expect(mockNative.pendingNativeDeactivations).toBe(0);
    expect(support()).toMatchObject({ liveOwners: 0, livePlayers: 0, session: { leases: 0, pendingOperations: 0, desiredActive: false, appliedActive: false } });
  }
  expect(mockNative.maxLivePlayers).toBeLessThanOrEqual(12); expect(mockNative.players.every(p => p.release.mock.calls.length === 1)).toBe(true);
  expect(support().events.length).toBeLessThanOrEqual(64);
});

it('honors native interruption resume authorization and requires explicit user recovery otherwise', async () => {
  const owner = await playing(); const voice = mockNative.live().find(p => p.source === 'exploration')!;
  mockNative.interrupt({ resume: true }); advance(owner, 1);
  expect(voice.playing).toBe(true); expect(voice.play).toHaveBeenCalledTimes(1);
  mockNative.interrupt({ resume: false }); advance(owner, 4);
  expect(mockNative.activeSession).toBe(true); expect(voice.playing).toBe(false); expect(voice.play).toHaveBeenCalledTimes(1);
  expect(await owner.recover('user')).toBe(true); expect(mockNative.live().some(p => p.source === 'exploration' && p.playing)).toBe(true);
});

it('settles rapid pause/resume during activation before whenReady resolves and never overlaps native global calls', async () => {
  const delayed = mockNative.deferNextActivation(); const owner = make(); owner.setActive(true); await settle();
  owner.setActive(false, 'paused'); owner.setActive(true); owner.setMusicState('exploration', 'area-02');
  let ready = false; void owner.whenReady().then(() => { ready = true; }); await settle();
  expect(ready).toBe(false); expect(mockNative.module.setIsAudioActiveAsync).toHaveBeenCalledTimes(1);
  delayed.resolve(); await owner.whenReady(); await settle();
  expect(ready).toBe(true); expect(mockNative.activeSession).toBe(true); expect(owner.getDiagnostics().ready).toBe(true);
  expect(mockNative.live().filter(p => p.source === 'exploration' && p.playing)).toHaveLength(1);
  // The obsolete preparation settles before the resumed generation acquires its lease.
  expect(mockNative.module.setIsAudioActiveAsync.mock.calls.map(([active]) => active)).toEqual([true, false, true]);
  expect(mockNative.events.filter(event => /^(?:de)?activate-(?:request|return)$/.test(event.operation)).map(event => event.operation)).toEqual([
    'activate-request', 'activate-return', 'deactivate-request', 'deactivate-return', 'activate-request', 'activate-return',
  ]);
});

it('drops the old fading owner clock and settings after a fresh owner has started', async () => {
  const old = await playing(); advance(old, 5); old.setMusicState('pursuit', 'area-02'); advance(old, .4); old.dispose(); await settle();
  const current = await playing(); const live = mockNative.live(); const volumes = live.map(p => p.volume);
  advance(old, 4); old.updatePreferences({ enabled: false, musicVolume: 0, environmentVolume: 0, effectsVolume: 0 });
  expect(mockNative.live()).toEqual(live); expect(live.map(p => p.volume)).toEqual(volumes); expect(current.getDiagnostics().availability).toBe('available');
});

it('does not charge background time against a new foreground music load or consume healthy recovery budget', async () => {
  let now = 1000; jest.spyOn(Date, 'now').mockImplementation(() => now);
  const create = mockNative.module.createAudioPlayer.getMockImplementation()!;
  mockNative.module.createAudioPlayer.mockImplementation((asset, options) => { const p = create(asset, options); if (p.source === 'exploration') p.isLoaded = false; return p; });
  const owner = await playing(); for (let i = 0; i < 70; i++) owner.advanceMusic(.1, 'area-02');
  expect(support().firstAudioFailure).toBeNull();
  owner.setActive(false, 'background'); await settle(); now += 60000;
  owner.setActive(true); await owner.whenReady(); owner.setMusicState('exploration', 'area-02');
  for (let i = 0; i < 4; i++) expect(await owner.recover('foreground')).toBe(true);
  expect(support().events.some(event => event.phase === 'recovery-start')).toBe(false); expect(support().firstAudioFailure).toBeNull();
  const voice = mockNative.live().find(p => p.source === 'exploration')!; voice.isLoaded = true; voice.notify(); owner.advanceMusic(.1, 'area-02');
  expect(voice.playing).toBe(true); mockNative.disconnectRoute(); expect(await owner.recover('user')).toBe(true);
});

it('releases a player whose native status subscription fails, without stopping healthy effect siblings', async () => {
  const owner = await playing(); const old = mockNative.live().find(p => p.source === 'exploration')!;
  const create = mockNative.module.createAudioPlayer.getMockImplementation()!;
  mockNative.module.createAudioPlayer.mockImplementation((asset, options) => {
    const p = create(asset, options); if (p.source === 'pursuit') p.addListener = () => { throw new Error('native subscribe failed'); }; return p;
  });
  advance(owner, 5); owner.setMusicState('pursuit', 'area-02'); advance(owner, 1);
  expect(old.playing).toBe(true); expect(owner.getDiagnostics()).toMatchObject({ availability: 'available', players: 11 });
  expect(mockNative.players.find(p => p.source === 'pursuit')!.release).toHaveBeenCalledTimes(1);
  expect(support().livePlayers).toBe(11); owner.dispose(); await settle(); expect(support().livePlayers).toBe(0); expect(mockNative.subscriptions).toBe(0);
});

it('retains an event-only native item error even though Swift currentStatus returns error:nil', async () => {
  const owner = await playing(); const voice = mockNative.live().find(p => p.source === 'exploration')!;
  // AudioPlayer.swift updateStatus merges the error only into the emitted event.
  voice.notify({ error: 'event-only decoder failure' }); expect(voice.currentStatus.error).toBeNull();
  owner.advanceMusic(.1, 'area-02');
  expect(voice.release).toHaveBeenCalledTimes(1); expect(owner.getDiagnostics()).toMatchObject({ availability: 'available', musicPlayers: 0, players: 10 });
  expect(support().firstAudioFailure).toMatchObject({ message: 'event-only decoder failure', source: 'exploration' });
});
