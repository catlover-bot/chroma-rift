#!/usr/bin/env node
'use strict';
/* global __dirname, Buffer */
// QA only: actual App/Screen/controller/save writer, successful GL boundary,
// shared native-audio contract fixture, and offline Three + CSS presentation.
require('./lib/qa-native-metadata.cjs');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), ts = require('typescript'), Module = require('node:module');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
const root = path.resolve(__dirname, '..'), option = name => process.argv.find(x => x.startsWith('--' + name + '='))?.slice(name.length + 3);
const out = path.resolve(option('out') || path.join(root, '.expo/goal014-2/screen-route'));
const extractOnly = process.argv.includes('--extract-only'), FPS = 10, WIDTH = 390, HEIGHT = 844;
const scenario = option('scenario') || 'straight';
if (!['straight', 'retreat', 'capture'].includes(scenario)) throw Error('Unsupported scenario');
const toolFiles = ['scripts/qa-goal014-2-screen-route.cjs', 'test-support/mirrorPointerRoute.ts', 'src/rendering/firstPerson/planarMirror.ts', 'scripts/lib/three-scene-qa.cjs', 'scripts/lib/native-hud-qa.cjs', 'scripts/lib/qa-native-metadata.cjs', 'package.json', 'package-lock.json', 'app.json', 'node_modules/three/build/three.module.js', 'node_modules/three/build/three.core.js'];
const hashes = files => Object.fromEntries(files.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
const verify = entries => { for (const [file, hash] of Object.entries(entries)) if (sha256(fs.readFileSync(path.join(root, file))) !== hash) throw Error('Source changed: ' + file); };
const check = (condition, message) => { if (!condition) throw Error(message); };
const write = (file, value) => fs.writeFileSync(path.join(out, file), JSON.stringify(value, null, 2) + '\n');

async function extract() {
  const bridge = installSourceBridge(root), context = { width: WIDTH, height: HEIGHT, fontScale: 1 };
  const native = installNativeHudBridge(context), React = require('react'), R = require('react-test-renderer'), THREE = require('three');
  globalThis.expect = require('expect').expect;
  globalThis.jest = { fn: require('jest-mock').fn };
  const from = file => require(path.join(root, file)), memory = new Map(), writes = [], owners = [], appListeners = new Set(), raf = new Map();
  let actualAudio, harness, current, liveOwners = 0, peakOwners = 0, seconds = 0, frameId = 0;
  globalThis.requestAnimationFrame = callback => { raf.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = id => raf.delete(id);
  const assets = {};
  const pngLoader = require.extensions['.png'];
  require.extensions['.png'] = (mod, file) => { assets[path.relative(root, file)] = sha256(fs.readFileSync(file)); pngLoader(mod, file); };
  for (const ext of ['.wav', '.m4a']) require.extensions[ext] = (mod, file) => { const relative = path.relative(root, file); assets[relative] = sha256(fs.readFileSync(file)); mod.exports = relative; };
  const storage = {
    async getItem(key) { return memory.get(key) ?? null; },
    async setItem(key, value) { memory.set(key, value); writes.push({ seconds, key, sha256: sha256(value) }); },
    async removeItem(key) { memory.delete(key); },
    async multiRemove(keys) { keys.forEach(key => memory.delete(key)); },
  };
  const load = Module._load;
  Module._load = function (name, ...args) {
    if (name === '@react-native-async-storage/async-storage') return storage;
    if (name === 'expo-audio') return harness.module;
    if (actualAudio && (name.endsWith('/audio') || name === '../audio')) return actualAudio;
    if (name === 'expo') return { requireOptionalNativeModule: () => ({}) };
    if (name === 'react-native-gesture-handler') return { GestureHandlerRootView: ({ children }) => React.createElement(React.Fragment, null, children) };
    if (name === 'react-native-worklets') return { scheduleOnRN: fn => fn() };
    if (name === 'react-native-safe-area-context') return { ...load.call(this, name, ...args), SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children) };
    if (name === 'react-native') {
      const actual = load.call(this, name, ...args);
      return { ...actual, ActivityIndicator: 'View', Modal: ({ visible, children }) => visible ? React.createElement('View', { style: { position: 'absolute', inset: 0 } }, children) : null,
        AccessibilityInfo: { ...actual.AccessibilityInfo, isReduceMotionEnabled: async () => false },
        AppState: { currentState: 'active', addEventListener: (_event, callback) => { appListeners.add(callback); return { remove: () => appListeners.delete(callback) }; } },
        Alert: { alert: title => { throw Error('Unexpected alert: ' + title); } } };
    }
    if (name.endsWith('/FirstPersonCanvas')) return { FirstPersonCanvas: props => {
      current = props; const initial = React.useRef(props);
      React.useEffect(() => {
        const c = initial.current.controller, record = { stageId: c.runtime.chapterId, session: c.runtime.session, unmounted: false };
        owners.push(record); liveOwners++; peakOwners = Math.max(peakOwners, liveOwners);
        check(liveOwners === 1, 'Concurrent Canvas owners');
        context.run = natural.attachNaturalRun(c);
        Object.assign(c.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true }); initial.current.onReady();
        return () => { record.unmounted = true; liveOwners--; };
      }, [props.controller]);
      return React.createElement('CanvasPlaceholder');
    } };
    return load.call(this, name, ...args);
  };
  const sources = from('src/audio/sources.ts').AUDIO_SOURCES;
  harness = from('src/audio/testFixtures/sharedNativeAudio.ts').createSharedNativeAudioHarness({ immediateSeeks: true, sources });
  actualAudio = from('src/audio/index.ts');
  const diagnostics = from('src/audio/diagnostics.ts').getAudioSupportSnapshot;
  const RC = from('src/rendering/firstPerson/runtimeController.ts');
  const { presentChapterAudio } = from('src/rendering/firstPerson/chapterAudio.ts');
  const natural = from('test-support/naturalChapterRoute.ts');
  const AS = from('src/storage/applicationStorage.ts'), Store = from('src/storage/firstPersonStorage.ts');
  const defaults = from('src/types/application.ts'), { skipQuickSetup } = from('src/domain/calibration/quickSetup.ts');
  const { CHAPTER_ONE_STORAGE_KEY: campaignKey } = from('src/storage/chapterOneStorage.ts');
  const { CHAPTER_ONE } = from('src/domain/campaign/definition.ts');
  const { ChapterScene } = from('src/rendering/firstPerson/ChapterScene.tsx'), { createSceneResources } = from('src/rendering/firstPerson/resources.ts');
  const App = from('App.tsx').default;
  const { createChapterOneSession } = from('src/domain/campaign/session.ts');
  const { parseChapterOneSession } = from('src/domain/campaign/checkpoint.ts');
  const { stageBinding } = from('src/domain/stages/mirror-corridor-v1/binding.ts');
  const { FIGURE_CENTER, KEY_CENTER, PRACTICE_CENTER, WINCH_CENTER } = from('src/domain/stages/mirror-corridor-v1/definition.ts');
  const { mirrorPointerRoute } = from('test-support/mirrorPointerRoute.ts');
  const { inspectPoseSafety, isSafePose } = from('src/domain/firstPerson/geometry.ts');
  await Store.resetAllApplicationStorage(); memory.clear();
  const preferences = AS.createDefaultApplication(); preferences.quickSetupResult = skipQuickSetup('2026-09-18T00:00:00Z');
  preferences.settings = { ...preferences.settings, haptics: false, horrorIntensity: 'standard' };
  await storage.setItem(AS.APPLICATION_STORAGE_KEY, JSON.stringify(preferences));
  await storage.setItem(Store.FIRST_PERSON_ONBOARDING_KEY, JSON.stringify({ ...defaults.DEFAULT_FIRST_PERSON_ONBOARDING, tutorialCompleted: true, controlChoiceAcknowledged: true }));
  // Declared valid cold area04 entry; no area04 solved progress or actor state is
  // injected. Every subsequent pose/progress change comes from actual Screen input.
  const initialSave = { ...createChapterOneSession('QA-goal014-2-screen-' + scenario, '2026-09-18'),
    currentArea: 'chapter-1-area-04', completedAreas: CHAPTER_ONE.areas.slice(0, 3).map(a => a.id),
    checkpoint: stageBinding.checkpoint(stageBinding.create()), revision: 12 };
  check(parseChapterOneSession(initialSave), 'Initial cold campaign fixture invalid');
  await storage.setItem(campaignKey, JSON.stringify(initialSave));
  const settle = async () => R.act(async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); });
  const hud = await native.mount(App, {}); await settle();
  const frames = [], hudTrees = [], hudMap = new Map(), events = [], scenes = [], inputs = [];
  let sceneState, previous = new Map(), label = '04 保存から実Appへ入場', nextSample = 0, ticks = 0, caught = 0;
  const audioSnapshot = () => ({ ...diagnostics(), playing: harness.live().filter(p => p.playing).map(p => p.source), nativeActive: harness.activeSession });
  const button = text => hud.tree.root.findAll(n => n.type === 'Pressable' && n.props.accessibilityLabel === text && !n.props.disabled)[0];
  const mark = (name, details = {}) => {
    const c = current?.controller, s = c?.runtime.stageSession?.value;
    events.push({ name, seconds, tick: ticks, frame: frames.length, stageId: c?.runtime.chapterId,
      pose: c ? structuredClone(c.runtime.pose) : undefined, ratchets: s?.ratchets, holdSeconds: s?.holdSeconds,
      holding: s?.holding, gateLift: s?.gateLift, gateCrossed: s?.gateCrossed, actorPhase: s?.actor?.phase,
      actorPosition: s?.actor ? { ...s.actor.motion.position } : undefined,
      safety: c ? inspectPoseSafety(c.runtime.pose, RC.worldForController(c)) : undefined,
      pointers: c ? { move: c.input.stickPointer, look: c.input.lookPointer, barrier: [...c.input.releaseBarrier] } : undefined,
      audio: audioSnapshot(), ...details });
  };
  async function press(text) {
    const b = button(text); check(b, 'Missing enabled App button ' + text);
    await R.act(async () => { b.props.onPressIn?.(); b.props.onPress(); }); await settle(); mark('app-button', { text });
  }
  async function dismissStory() {
    const text = button('探索へ戻る') ? '探索へ戻る' : button('点検を続ける') ? '点検を続ける' : undefined;
    if (text) await press(text);
  }
  async function clearScene() {
    if (!sceneState) return;
    await sceneState.mount.unmount(); sceneState.resources.dispose(); sceneState = undefined; previous = new Map();
  }
  async function ensureScene() {
    if (!current || current.controller === sceneState?.c) return;
    await clearScene();
    const c = current.controller, stageId = c.runtime.chapterId, resources = createSceneResources(false, null, true);
    const runtime = { current: c.runtime }, world = new THREE.Scene(), camera = context.run.camera;
    world.background = new THREE.Color('#171a1b'); world.add(camera);
    const mount = await mountThree(React.createElement(ChapterScene, { world: RC.worldForController(c), runtime, progress: c.runtime.progress, resources,
      assist: false, reducedMotion: false, lowQuality: false, lab: false, renderOffscreen: () => {}, onFrameError: error => { throw error; } }), THREE);
    mount.objects.forEach(object => world.add(object));
    const callbacks = bridge.callbacks.splice(0).filter(fn => !fn.toString().includes('mirror.render'));
    callbacks.forEach(fn => fn({}, 0)); world.updateMatrixWorld(true);
    const file = 'scene-' + scenes.length + '.json', surface = world.getObjectByName('planar-mirror');
    const nativeMaterial = surface?.material, transport = surface ? new THREE.MeshBasicMaterial({ color: '#394a4a' }) : undefined;
    if (surface) surface.material = transport;
    fs.writeFileSync(path.join(out, file), JSON.stringify(world.toJSON()));
    if (surface) surface.material = nativeMaterial;
    transport?.dispose();
    scenes.push({ file, stageId, sha256: sha256(fs.readFileSync(path.join(out, file))) });
    sceneState = { file, world, camera, c, runtime, mount, resources, callbacks };
  }
  function record() {
    const updates = [];
    if (sceneState) {
      sceneState.world.updateMatrixWorld(true);
      sceneState.world.traverse(object => {
        const v = { matrix: object.matrix.toArray(), visible: object.visible, material: !Array.isArray(object.material) ? object.material?.uuid : undefined };
        const key = JSON.stringify(v); if (previous.get(object.uuid) !== key) { previous.set(object.uuid, key); updates.push([object.uuid, v]); }
      });
    }
    const tree = hud.serialize(), key = JSON.stringify(tree); let index = hudMap.get(key);
    if (index === undefined) { index = hudTrees.length; hudMap.set(key, index); hudTrees.push(tree); }
    const c = current?.controller, s = c?.runtime.stageSession?.value;
    frames.push({ scene: sceneState?.file ?? null, camera: sceneState?.camera.uuid ?? null, updates, hud: index, label, seconds, tick: ticks,
      stageId: c?.runtime.chapterId, pose: c ? structuredClone(c.runtime.pose) : undefined, progress: c ? structuredClone(c.runtime.progress) : undefined,
      state: s ? structuredClone(s) : undefined, recovery: c?.captureRecovery ? { ...c.captureRecovery } : null, audio: audioSnapshot() });
  }
  await press('続きから'); if (button('あとで調整して遊ぶ')) await press('あとで調整して遊ぶ');
  await press('鏡越しの回廊へ入る'); await dismissStory();
  check(current?.controller.runtime.chapterId === 'mirror-corridor-v1', 'Actual App did not enter04');
  const canvas = current, c = canvas.controller;
  await R.act(async () => { await c.audio.whenReady(); }); await settle();
  check(c.horrorIntensity === 'standard' && !c.runtime.paused, 'Wrong active entry settings');
  await ensureScene();
  let dangerCue, released = false, movementMarked = false;
  const handlerNames = { start: 'onTouchStart', move: 'onTouchMove', end: 'onTouchEnd', cancel: 'onTouchCancel' };
  let heldHandlers = {};
  async function advance(count, dt) {
    for (let i = 0; i < count; i++) {
      const props = current, live = props.controller, cam = context.run.camera, previousState = live.runtime.stageSession?.value;
      const before = { ...live.runtime.pose.position };
      await R.act(async () => {
        RC.advanceController(live, dt, cam); seconds += dt; ticks++;
        harness.advanceSeconds(dt); const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(fn => fn(seconds * 1000));
        const state = live.runtime.stageSession?.value;
        if (live === c) {
          if (dangerCue === undefined && state.holding === 'winch' && live.pendingActorPlants.some(p => Math.hypot(p.position.x - before.x, p.position.z - before.z) <= 4.5)) {
            dangerCue = seconds; mark('firstDangerCue');
          }
          if (live.pendingActorEvents.includes('caught')) { caught++; mark('captureConfirmed'); }
          if (previousState.gateLift < 1.82 && state.gateLift >= 1.82) mark('gatePassable');
          if (!previousState.gateCrossed && state.gateCrossed) mark('gateCrossed');
          if (released && !movementMarked && Math.hypot(before.x - live.runtime.pose.position.x, before.z - live.runtime.pose.position.z) > .001) { movementMarked = true; mark('movementResumed'); }
        }
        if (sceneState?.c === live) { sceneState.runtime.current = live.runtime; sceneState.callbacks.forEach(fn => fn({}, dt)); }
        const pending = live.captureRecovery;
        RC.presentControllerRecovery(live, dt);
        if (pending && !pending.presented) throw Error('Accepted presentation failed to start recovery');
        if (pending && live.captureRecovery?.remaining === 1.2) mark('recoveryPresented');
        if (pending && !live.captureRecovery) mark('recoveryInputReady');
        presentChapterAudio(live, dt); RC.flushControllerAudioFrame(live);
        props.onSnapshot(RC.controllerSnapshot(live)); RC.flushControllerPresentationFeedback(live);
      });
      await settle(); await dismissStory(); await ensureScene();
      check(isSafePose(current.controller.runtime.pose, RC.worldForController(current.controller)), 'Route entered invalid static/body pose');
      if (seconds + 1e-9 >= nextSample) { record(); nextSample += 1 / FPS; }
    }
  }
  const route = mirrorPointerRoute({ controller: c,
    touch: async (region, phase, nativeEvent) => {
      inputs.push({ seconds, tick: ticks, region, phase, event: structuredClone(nativeEvent) });
      if (region === 'interact') {
        if (phase === 'start') { const b = hud.tree.root.findAll(n => typeof n.type === 'string' && n.props.testID === region && n.props.onTouchStart)[0]; check(b, 'Missing actual held action'); heldHandlers = Object.fromEntries(Object.entries(handlerNames).map(([key, prop]) => [key, b.props[prop]])); }
        check(heldHandlers[phase], 'Missing original held contact handler'); await R.act(async () => heldHandlers[phase]({ nativeEvent }));
      } else await hud.touch(region, phase[0].toUpperCase() + phase.slice(1), nativeEvent);
      // The host renderer does not provide native bubbling. Deliver the same
      // terminal event to the stable scene ancestor, as the native tree does.
      if (phase === 'end' || phase === 'cancel') await hud.touch('first-person-play', phase[0].toUpperCase() + phase.slice(1), nativeEvent);
      await settle();
    },
    press: async () => { inputs.push({ seconds, tick: ticks, region: 'interact', phase: 'press' }); await hud.pressTestID('interact'); await dismissStory(); },
    frames: advance,
  });
  mark('entry');
  await route.wait(.5);
  label = '04 鍵と練習';
  await route.walk(0, -1.5); await route.press('mirror-corridor-figure', FIGURE_CENTER); await route.press('mirror-corridor-key', KEY_CENTER);
  await route.walk(0, 5.9); await route.walk(-2.16, 5.9); await route.walk(-2.16, 6.9);
  await route.hold(PRACTICE_CENTER); await route.wait(.6); await route.release(); check(route.live().practiced, 'Practice not earned');
  await route.walk(-2.16, 5.9); await route.walk(-1.1, 5.9); await route.walk(-1.1, 9.6); await route.walk(-2.45, 9.6);
  label = '04 巻き上げ作業'; await route.hold(WINCH_CENTER); mark('workStart');
  if (scenario === 'straight') { await route.wait(6.05); await route.release(); }
  else {
    await route.wait(2.05); check(route.live().ratchets === 1, 'First tooth not settled');
    if (scenario === 'retreat') {
      const deadline = seconds + 4;
      while ((dangerCue === undefined || seconds < dangerCue + 1.25) && seconds < deadline) await route.wait(1 / 60);
      check(dangerCue !== undefined && seconds - dangerCue >= 1.25, 'Reaction interval missing');
    }
    await route.release(); released = true; mark('release');
    if (scenario === 'capture') {
      label = '04 棚から離れて捕捉・安全位置へ復帰';
      await route.walk(0, 9.6); await route.walk(0, 10.5);
      const deadline = seconds + 30; while (!caught && seconds < deadline) await route.wait(1 / 60);
      check(caught === 1, 'Adverse exposed route did not earn one capture');
      check(route.live().ratchets === 1 && route.live().keyTaken && route.live().practiced, 'Capture lost committed progress');
      const confirmed = seconds; while (c.captureRecovery && seconds < confirmed + 2) await route.wait(1 / 60);
      check(!c.captureRecovery && seconds - confirmed <= 1.3, 'Successful presentation recovery exceeded1.3s');
    } else {
      label = '04 音の合図から1.25秒後に離し、棚へ退避';
      await route.walk(-2.45, 9.85); await route.walk(-4.05, 9.85); await route.walk(-4.05, 10.7); mark('coverReached'); await route.wait(16);
    }
    label = '04 棚から作業へ戻る';
    await route.walk(-4.05, 9.85); await route.walk(-2.45, 9.85); await route.walk(-2.45, 9.6);
    await route.hold(WINCH_CENTER); released = false; movementMarked = false; mark('workStart');
    await route.wait(4.05); await route.release();
  }
  check(route.live().ratchets === 3 && route.live().holding === null, 'Third tooth did not automatically release');
  released = true; movementMarked = false; mark('release'); label = '04 格子と扉を実際に歩いて通る';
  await route.walk(-2.45, 9.3); await route.walk(1.3, 9.3); await route.walk(1.3, 15.9); await route.walk(0, 15.9); await route.walk(0, 31.7);
  check(c.runtime.pose.position.z >= 31.5 && c.runtime.progress.cleared && route.live().gateCrossed, 'Physical threshold not crossed');
  check(caught === (scenario === 'capture' ? 1 : 0), 'Unexpected captures');
  await settle(); await dismissStory(); await ensureScene();
  check(current.controller.runtime.chapterId === 'departure-control-v1' && c.retired, 'Actual App did not replace04 with05');
  const savedRaw = memory.get(campaignKey), saved = parseChapterOneSession(JSON.parse(savedRaw));
  check(saved?.runId === initialSave.runId && saved.currentArea === 'chapter-1-area-05' && saved.keyLocation === 'carried', 'Actual App save did not preserve identity/progress');
  write('save-proof.json', { initialSave, finalSave: saved, finalRawSha256: sha256(savedRaw), storageWrites: writes });
  mark('area05Entered', { saveSha256: sha256(savedRaw), runId: saved.runId });
  label = '05 実Appが到着と鍵の持ち越しを保存';
  await R.act(async () => { await current.controller.audio.whenReady(); });
  await advance(90, 1 / 60);
  check(harness.live().some(p => p.playing && p.source === 'room-control'), 'Area05 environment audio status missing');
  await clearScene(); await hud.unmount(); await settle();
  const final = { canvasOwners: liveOwners, audio: diagnostics(), rafCallbacks: raf.size, appStateSubscriptions: appListeners.size, nativePlayers: harness.live().length, nativeSubscriptions: harness.subscriptions };
  check(!liveOwners && peakOwners === 1 && owners.every(o => o.unmounted), 'Canvas ownership leak');
  check(!final.audio.liveOwners && !final.audio.livePlayers && !final.audio.session.leases && !final.audio.session.pendingOperations && !final.audio.session.desiredActive && !final.audio.session.appliedActive, 'Audio owner/session leak');
  check(harness.maxLivePlayers <= 12 && !raf.size && !appListeners.size && !harness.live().length && !harness.subscriptions, 'Callback/player leak');
  bridge.verify(); verify(assets);
  write('animation.json', { frames, hudTrees });
  const report = { scenario, frames: frames.length, simulationSeconds: seconds, fps: FPS, settings: { intensity: 'standard', quality: 'standard', width: WIDTH, height: HEIGHT, fontScale: 1, verticalFov: 65 },
    events, inputs, owners, peakOwners, final, scenes, nativeEvents: harness.events, maxNativePlayers: harness.maxLivePlayers,
    sourceHashes: Object.fromEntries(bridge.hashes), assetHashes: assets, toolHashes: hashes(toolFiles), sourceGuardPassed: true,
    gates: { actualScreenPointers: inputs.length > 0, continuousSimulatedTime: true, physicalThreshold: c.runtime.pose.position.z >= 31.5, actualAppSave05: saved.currentArea === 'chapter-1-area-05', oneCanvasOwner: peakOwners === 1, noFinalResourceOwners: true },
    boundary: 'Declared valid cold area04 entry with01–03 completed;04 starts unsolved. Actual App/Screen touch handlers, controller, physics, completion and save. Native Canvas ready/successful presentation, memory AsyncStorage and shared native audio status backend are fixtures. Actual ChapterScene callbacks sampled continuously at10fps with60Hz simulation; no omitted route segments or mid-run pose injection. CSS/SwiftShader movie is not EXGL/Yoga/native touch or microphone audio; no device-performance or human reaction claim.' };
  write('extract-report.json', report); console.log(JSON.stringify({ result: 'PASS', scenario, frames: frames.length, seconds, inputs: inputs.length, events: events.length }));
  return report;
}

async function render() {
  const { frames } = JSON.parse(fs.readFileSync(path.join(out, 'animation.json')));
  for (const file of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(out, file));
  const mirrorFile = path.join(root, 'src/rendering/firstPerson/planarMirror.ts');
  const mirrorSource = ts.transpileModule(fs.readFileSync(mirrorFile, 'utf8'), { fileName: mirrorFile, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  fs.writeFileSync(path.join(out, 'planarMirror.js'), mirrorSource.replace("from 'three'", "from './three.module.js'"));
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><style>' + browserStyles + '.rn-text{line-height:normal}#app{position:absolute;inset:0 0 48px;display:flex;flex-direction:column}#caption{position:absolute;left:0;right:0;bottom:0;height:48px;padding:5px 9px;color:#eee;background:#080d12;font:12px/18px sans-serif}</style><div id="app"></div><div id="caption"></div><script type="module" src="viewer.js"></script>');
  fs.writeFileSync(path.join(out, 'viewer.js'), `import * as THREE from './three.module.js';
import {createPlanarMirror} from './planarMirror.js';
${browserHelpers}
const data=await(await fetch('./animation.json')).json(),root=document.getElementById('app'),caption=document.getElementById('caption');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(${WIDTH},${HEIGHT});renderer.outputColorSpace=THREE.SRGBColorSpace;
let scene,id,objects=new Map(),materials=new Map(),last=-1,mirror,surface,transport;
const frustum=new THREE.Frustum(),projectionView=new THREE.Matrix4();
function clear(){if(!scene)return;if(mirror){surface.material=transport;mirror.dispose();mirror=undefined;surface=undefined;transport=undefined;}const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();renderer.renderLists.dispose();scene=null;}
window.draw=async n=>{if(n!==last+1)throw Error('Sequential frames required');const f=data.frames[n];if(f.scene!==id){clear();id=f.scene;if(id){scene=await new THREE.ObjectLoader().parseAsync(await(await fetch(id)).json());objects=new Map();materials=new Map();scene.traverse(o=>{objects.set(o.uuid,o);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.set(m.uuid,m);});surface=scene.getObjectByName('planar-mirror');if(surface){if(!scene.getObjectByName('mirror-corridor-actor'))throw Error('Missing shared mirror actor');transport=surface.material;mirror=createPlanarMirror();surface.material=mirror.material;}}}
let reflected=false,offscreenCalls=0;if(scene){for(const[k,v]of f.updates){const o=objects.get(k);if(!o)throw Error('Missing scene object');o.matrix.fromArray(v.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=v.visible;if(v.material)o.material=materials.get(v.material)||o.material;}scene.updateMatrixWorld(true);const camera=objects.get(f.camera);if(!camera)throw Error('Missing camera');camera.updateMatrixWorld(true);if(mirror){surface.updateWorldMatrix(true,false);frustum.setFromProjectionMatrix(projectionView.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));if(frustum.intersectsObject(surface)){reflected=mirror.render(renderer,scene,camera,surface,(r,s,c)=>r.render(s,c));surface.material=reflected?mirror.material:mirror.fallbackMaterial;if(reflected)offscreenCalls=renderer.info.render.calls;}}renderer.render(scene,camera);}
root.replaceChildren(hudDOM(data.hudTrees[f.hud],1,renderer.domElement));caption.textContent=f.seconds.toFixed(1)+'s / '+f.label+'\\nQA: software WebGL / CSS・音は状態モデル（動画は無音）';await document.fonts.ready;await new Promise(r=>requestAnimationFrame(r));last=n;return{label:f.label,seconds:f.seconds,reflected,offscreenCalls,glError:renderer.getContext().getError(),hud:auditHUD(root,null),text:root.textContent,calls:scene?renderer.info.render.calls:0,triangles:scene?renderer.info.render.triangles:0};};
window.finish=()=>{clear();const before={...renderer.info.memory};if(before.geometries!==0||before.textures>1)throw Error('Unexpected scene resource retention');renderer.dispose();return{beforeRendererDispose:before,remainingTexture:'One known library-owned PBR DFG_LUT remains in the pre-dispose measurement; renderer.dispose() called, post-dispose GPU memory not measured',liveRenderers:0};};window.ready=true;`);
  const frameDir = path.join(out, 'frames'); fs.mkdirSync(frameDir, { recursive: true });
  const browser = await openBrowser(out), records = [], selected = [];
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT + 48, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) { if (browser.errors.length) throw Error(JSON.stringify(browser.errors)); await delay(100); }
    check(await browser.evaluate('window.ready===true'), 'Viewer did not load');
    for (let i = 0; i < frames.length; i++) {
      records.push(await browser.evaluate('window.draw(' + i + ')'));
      const bytes = Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64');
      fs.writeFileSync(path.join(frameDir, String(i).padStart(6, '0') + '.png'), bytes);
      if (i === frames.length - 1 || frames[i + 1].label !== frames[i].label) selected.push({ frame: i, label: frames[i].label, file: String(i).padStart(6, '0') + '.png', sha256: sha256(bytes) });
    }
    check(records.every(r => r.glError === 0), 'WebGL error');
    check(records.some(r => r.reflected), 'Route never rendered the real mirror pass');
    const disposal = await browser.evaluate('window.finish()'); check(browser.errors.length === 0, 'Browser exception');
    write('render-report.json', { viewport: { width: WIDTH, height: HEIGHT }, captionHeight: 48, fps: FPS, frames: frames.length, duration: frames.length / FPS, selected, disposal, records });
  } finally { await browser.close(); }
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frameDir, '%06d.png'), '-frames:v', String(frames.length), '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, 'screen-route.mp4')], { stdio: 'inherit' });
  return { frames: frames.length, duration: frames.length / FPS, selected };
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  const guard = hashes(toolFiles), result = await extract();
  verify(result.sourceHashes); verify(result.assetHashes); verify(guard);
  if (extractOnly) return;
  const video = await render(); verify(result.sourceHashes); verify(result.assetHashes); verify(guard);
  const artifactNames = ['extract-report.json', 'animation.json', 'save-proof.json', 'render-report.json', 'screen-route.mp4'];
  write('report.json', { ...result, head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), video,
    artifacts: Object.fromEntries(artifactNames.map(file => [file, { bytes: fs.statSync(path.join(out, file)).size, sha256: sha256(fs.readFileSync(path.join(out, file))) }])) });
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
