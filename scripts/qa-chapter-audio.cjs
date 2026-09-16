#!/usr/bin/env node
'use strict';
/* global __dirname, __filename */
// Real chapter controllers/campaign and audio owner; deterministic ready-player
// fixture. No native audio, App UI or GL acceptance is claimed by this extractor.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), Module = require('node:module');
const { installSourceBridge, sha256 } = require('./lib/three-scene-qa.cjs');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv.find(value => value.startsWith('--out='))?.slice(6) ?? path.join(root, '.expo/goal014/audio-route'));
const baseline = process.argv.find(value => value.startsWith('--baseline='))?.slice(11);
if (process.argv.slice(2).some(value => !value.startsWith('--out=') && !value.startsWith('--baseline='))) throw Error('usage: node scripts/qa-chapter-audio.cjs [--out=directory]');
fs.mkdirSync(out, { recursive: true });
const nativeLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'expo-constants') return {}; // Explicitly unknown native build identity in Node.
  return nativeLoad.call(this, name, ...args);
};
globalThis.__DEV__ = false;
const bridge = installSourceBridge(root);
for (const file of ['app.json', 'src/audio/sources.ts', 'scripts/lib/three-scene-qa.cjs', ...(!baseline ? ['src/screens/ChapterMusic.tsx'] : [])]) bridge.hashes.set(file, sha256(fs.readFileSync(path.join(root, file))));
global.expect = require('expect').expect;
const { createGalleryAudioOwner } = require('../src/audio/owner.ts');
const { DEFAULT_AUDIO_PREFERENCES } = require('../src/audio/preferences.ts');
const presentChapterAudio = baseline ? undefined : require('../src/rendering/firstPerson/chapterAudio.ts').presentChapterAudio;
const { flushControllerAudioFrame, flushControllerPresentationFeedback } = require('../src/rendering/firstPerson/runtimeController.ts');
const { createCheckpoint } = require('../src/domain/firstPerson/index.ts');
const { openNaturalRun, playNaturalArea } = require('../test-support/naturalChapterRoute.ts');
const { CHAPTER_ONE } = require('../src/domain/campaign/definition.ts');
const { createChapterOneSession, recordCampaignCheckpoint, completeCampaignArea } = require('../src/domain/campaign/session.ts');
const { createCampaignAreaEntry } = require('../src/domain/campaign/areaEntry.ts');
const { parseChapterOneSession } = require('../src/domain/campaign/checkpoint.ts');
const assetPaths = {};
for (const match of fs.readFileSync(path.join(root, 'src/audio/sources.ts'), 'utf8').matchAll(/(?:'([^']+)'|(\w+)):\s*require\('\.\.\/\.\.\/([^']+)'\)/g)) assetPaths[match[1] ?? match[2]] = match[3];
const assetHashes = Object.fromEntries(Object.entries(assetPaths).map(([source, file]) => [source, { path: file, sha256: sha256(fs.readFileSync(path.join(root, file))) }]));
const scriptHash = sha256(fs.readFileSync(__filename));

function recording() {
  const events = [], players = [], states = [];
  let time = 0, local = 0, area = '', sequence = 0, maxPlayers = 0;
  const log = (operation, details = {}) => events.push({ sequence: ++sequence, time, area, simulationSeconds: local, operation, ...details });
  const backend = { availability: 'available', prepare: async () => undefined, createPlayer(source) {
    const id = players.length; let volume = 0, loop = false, released = false;
    const player = { id, source, get isLoaded() { return true; },
      get volume() { return volume; }, set volume(next) { volume = next; log('volume', { id, source, value: next }); },
      get loop() { return loop; }, set loop(next) { loop = next; log('loop', { id, source, value: next }); },
      play() { if (released) throw Error('Play after release'); log('play', { id, source }); },
      pause() { log('pause', { id, source }); },
      seekTo(seconds) { log('seek', { id, source, value: seconds });
        // The natural-route helper advances synchronously. This explicit zero-
        // latency ready-player thenable models native completion within this tick.
        // It is not evidence of Expo seek latency or sample-accurate scheduling.
        return { then(callback) { callback(); return { catch() {} }; } };
      },
      release() { if (released) throw Error('Duplicate release'); released = true; log('release', { id, source }); },
      get released() { return released; },
    };
    players.push(player); maxPlayers = Math.max(maxPlayers, players.filter(player => !player.released).length);
    log('create', { id, source }); return player;
  } };
  return { backend, events, players, states,
    enter(next) { area = next; local = 0; log('enter'); },
    advance(dt) { time += dt; local += dt; },
    state(owner, actorPhase) { const value = owner.getDiagnostics().musicState ?? 'not-implemented-in-baseline';
      if (states.at(-1)?.state !== value || states.at(-1)?.area !== area) states.push({ time, area, simulationSeconds: local, state: value, actorPhase }); },
    report() { return { durationSeconds: time, maxPlayers, activePlayersAtEnd: players.filter(player => !player.released).length, events, states }; },
  };
}

async function extractRoute() {
  const r = recording(); let session = createChapterOneSession('goal014-audio-controller-fixture', '1.0.0'); const areas = [];
  for (let index = 0; index < CHAPTER_ONE.areas.length; index++) {
    const area = CHAPTER_ONE.areas[index]; r.enter(area.id);
    const run = openNaturalRun(session, 'standard'), controller = run.controller;
    const owner = createGalleryAudioOwner({ sessionId: String(controller.runtime.session), ...(!baseline ? { areaId: area.stageId } : {}) }, r.backend);
    controller.audio = owner; owner.setActive(true); await owner.whenReady();
    const present = dt => { presentChapterAudio?.(controller, dt); flushControllerAudioFrame(controller); flushControllerPresentationFeedback?.(controller);
      const runtime = controller.runtime, actor = runtime.stageSession?.value?.actor ?? runtime.gallery?.actor ?? runtime.vault?.actor ?? runtime.theatre?.actor;
      r.state(owner, actor?.phase ?? null); };
    present(0);
    run.onAdvance = (_, dt) => { r.advance(dt); present(dt); };
    const cleared = playNaturalArea(run, index, ['shadow', 'contour'], () => {
      const update = recordCampaignCheckpoint(session, area.id, createCheckpoint(controller.runtime));
      if (!update.accepted) throw Error('Stop checkpoint rejected: ' + update.reason); session = update.session;
    });
    present(0); // Commands occurring after the final movement still receive one accepted fixture presentation.
    const next = CHAPTER_ONE.areas[index + 1];
    const transition = completeCampaignArea(session, area.id, cleared, next ? createCampaignAreaEntry(next.id, session, cleared) : undefined);
    if (!transition.accepted) throw Error('Handoff rejected: ' + transition.reason);
    session = parseChapterOneSession(JSON.parse(JSON.stringify(transition.session)));
    if (!session) throw Error('Cold campaign codec rejected route');
    areas.push({ area: area.id, stageId: area.stageId, cleared: cleared.progress.cleared, exitPose: cleared.pose, diagnostics: owner.getDiagnostics() });
    owner.setActive(false); owner.dispose(); controller.audio = undefined;
  }
  if (!session.campaignCompleted || r.report().activePlayersAtEnd) throw Error('Incomplete chapter/audio cleanup');
  return { ...r.report(), areas, finale: session.finale, campaignCompleted: session.campaignCompleted };
}
async function extractListeningSequence() {
  const r = recording(); r.enter('listening-sequence');
  const owner = createGalleryAudioOwner({ sessionId: 'listening-sequence', areaId: 'departure-control-v1' }, r.backend);
  owner.setActive(true); await owner.whenReady();
  let cue = 0;
  for (const [state, seconds] of [['exploration', 14], ['suspicion', 7], ['pursuit', 15], ['release', 11]]) {
    owner.setMusicState(state, 'listening-sequence');
    for (let tick = 0; tick < seconds * 60; tick++) {
      r.advance(1 / 60); owner.advanceMusic(1 / 60, 'listening-sequence'); r.state(owner, null);
      if ((state === 'exploration' || state === 'pursuit') && tick % 43 === 0) owner.movement(.66, 'listening-sequence');
      if (state === 'suspicion' && tick === 80) owner.event({ sessionId: 'listening-sequence', sequence: ++cue, type: 'bell' });
      if (state === 'release' && tick === 0) owner.event({ sessionId: 'listening-sequence', sequence: ++cue, type: 'isolation' });
    }
  }
  owner.dispose();
  r.enter('screen:chapter_end');
  await recordEndingOwner(r, 64);
  return { ...r.report(), boundary: 'Explicit audition state requests through the real owner, then the separate musicOnly owner equivalent to ChapterMusic chapter_end. This sequence is not a played route or React/native lifecycle recording.' };
}
async function recordEndingOwner(r, seconds) {
  const id = 'screen:chapter_end';
  const owner = createGalleryAudioOwner({ sessionId: id, musicOnly: true, preferences: DEFAULT_AUDIO_PREFERENCES }, r.backend);
  owner.setActive(true); await owner.whenReady();
  for (let tick = 0; tick < seconds * 60; tick++) {
    r.advance(1 / 60); owner.setMusicState('chapter_end', id); owner.advanceMusic(tick === 0 ? 0 : 1 / 60, id); r.state(owner, null);
  }
  owner.dispose();
}
async function extractEndingIntro() {
  const r = recording(); r.enter('screen:chapter_end'); await recordEndingOwner(r, 16);
  return { ...r.report(), boundary: 'Sixteen-second ending/credits listening excerpt (12 seconds intro plus 4 seconds credits) using the real owner and the same musicOnly configuration/session/state calls as ChapterMusic.tsx. No React mount, native audio, or actual UI clock is claimed.' };
}
(async () => {
  const route = await extractRoute(), audition = baseline ? undefined : await extractListeningSequence(), ending = baseline ? undefined : await extractEndingIntro();
  bridge.verify();
  if (sha256(fs.readFileSync(__filename)) !== scriptHash) throw Error('Extractor changed during run');
  for (const asset of Object.values(assetHashes)) if (sha256(fs.readFileSync(path.join(root, asset.path))) !== asset.sha256) throw Error('Asset changed during run: ' + asset.path);
  const report = { schemaVersion: 1, head: baseline ?? cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), archiveRevision: baseline ?? null,
    boundary: 'Real standard-intensity controllers, campaign handoffs, audio owner and post-presentation audio hooks. Presentation success is simulated by the QA fixture; all players are loaded with zero-latency seek completion. No native device audio, GL presentation, human continuous play or listening verification.',
    nativeConstantsFixture: {}, defaultPreferences: DEFAULT_AUDIO_PREFERENCES, scriptSha256: scriptHash, sourceHashes: Object.fromEntries(bridge.hashes), assetHashes,
    audioHooks: baseline ? ['flushControllerAudioFrame'] : ['presentChapterAudio', 'flushControllerAudioFrame', 'flushControllerPresentationFeedback'],
    route, ...(audition ? { audition } : {}), ...(ending ? { ending } : {}), baselineHasMusic: baseline ? false : undefined, sourceHashGuardPassed: true, artisticListeningVerified: false, DEVICE_ACCEPTANCE: 'PENDING', RELEASE_READY: false };
  fs.writeFileSync(path.join(out, 'recording.json'), JSON.stringify(report) + '\n');
  console.log(JSON.stringify({ out, routeSeconds: route.durationSeconds, routeMaxPlayers: route.maxPlayers, routeStates: [...new Set(route.states.map(x => x.state))], areas: route.areas.length, auditionSeconds: audition?.durationSeconds ?? null, sourceFiles: bridge.hashes.size }));
})().catch(error => { console.error(error); process.exitCode = 1; });
