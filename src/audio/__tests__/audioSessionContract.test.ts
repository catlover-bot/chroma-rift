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
afterEach(() => { owners.splice(0).forEach(owner => owner.dispose()); jest.restoreAllMocks(); });
function owner(sessionId: string, musicOnly = false) {
  const { createGalleryAudio } = require('../index') as typeof import('../index');
  const value = createGalleryAudio({ sessionId, areaId: 'gallery-v1', musicOnly }); owners.push(value); return value;
}

it('does not let an old owner schedule global deactivation while the next music player is buffering', async () => {
  const old = owner('home', true); old.setActive(true); await old.whenReady(); old.setMusicState('title_theme', 'home');
  const next = owner('area-01', true); next.setActive(true); await next.whenReady(); next.setMusicState('exploration', 'area-01');
  const voice = mockNative.live().find(p => p.source === 'exploration')!;
  voice.isBuffering = true; voice.playing = false; voice.notify();
  old.dispose(); mockNative.advanceSeconds(.2);
  expect(mockNative.activeSession).toBe(true);
  mockNative.completeBuffering(voice);
  expect(voice.playing).toBe(true);
});

it('keeps healthy environment and effects when one music asset exceeds its foreground load deadline', async () => {
  let now = 1000; jest.spyOn(Date, 'now').mockImplementation(() => now);
  const audio = owner('area-02'); audio.setActive(true); await audio.whenReady();
  const create = mockNative.module.createAudioPlayer.getMockImplementation()!;
  mockNative.module.createAudioPlayer.mockImplementation((asset, options) => {
    const player = create(asset, options);
    if (player.source === 'exploration') player.isLoaded = false;
    return player;
  });
  audio.setMusicState('exploration', 'area-02');
  for (let i = 0; i < 60; i++) { now += 100; audio.advanceMusic(.1, 'area-02'); }
  expect(audio.getDiagnostics()).toMatchObject({ availability: 'available', players: 10, musicPlayers: 0 });
  expect(mockNative.live().find(p => p.source === 'room-gallery')!.playing).toBe(true);
  expect(audio.event({ sessionId: 'area-02', sequence: 1, type: 'unlock' })).toBe(true);
  await Promise.resolve(); await Promise.resolve();
  expect(mockNative.live().some(p => p.source === 'ratchet' && p.playing)).toBe(true);
});

it('matches the installed native guard: an effect finish does not deactivate an already playing sibling', () => {
  const music = mockNative.module.createAudioPlayer('exploration', { keepAudioSessionActive: false });
  const effect = mockNative.module.createAudioPlayer('grip', { keepAudioSessionActive: false });
  music.loop = true; music.play(); effect.play(); mockNative.advanceSeconds(1.2); mockNative.advanceSeconds(.2);
  expect(effect.playing).toBe(false); expect(music.playing).toBe(true); expect(mockNative.activeSession).toBe(true);
  music.release(); effect.release();
});
