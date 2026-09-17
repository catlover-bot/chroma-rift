#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// QA only: actual App/Screen/controller/save writer, successful GL boundary,
// shared native-audio contract fixture, and offline Three + CSS presentation.
require('./lib/qa-native-metadata.cjs');
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), Module = require('node:module');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
const root = path.resolve(__dirname, '..'), option = name => process.argv.find(x => x.startsWith('--' + name + '='))?.slice(name.length + 3);
const out = path.resolve(option('out') || path.join(root, '.expo/goal014-1/player-resume-app'));
const phase = option('phase'), FPS = 5, WIDTH = 390, HEIGHT = 844;
const toolFiles = ['scripts/qa-player-resume-app.cjs', 'scripts/lib/three-scene-qa.cjs', 'scripts/lib/native-hud-qa.cjs', 'scripts/lib/qa-native-metadata.cjs', 'package.json', 'package-lock.json', 'app.json', 'node_modules/three/build/three.module.js', 'node_modules/three/build/three.core.js'];
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
  let inputSaveHash;
  if (phase === 'cold') {
    const persisted = JSON.parse(fs.readFileSync(path.join(out, 'fresh-storage.json'), 'utf8'));
    for (const [key, value] of persisted) memory.set(key, value);
    inputSaveHash = sha256(memory.get(campaignKey));
  } else {
    await Store.resetAllApplicationStorage(); memory.clear();
    const preferences = AS.createDefaultApplication(); preferences.quickSetupResult = skipQuickSetup('2026-09-17T00:00:00Z');
    preferences.settings = { ...preferences.settings, haptics: false };
    await storage.setItem(AS.APPLICATION_STORAGE_KEY, JSON.stringify(preferences));
    await storage.setItem(Store.FIRST_PERSON_ONBOARDING_KEY, JSON.stringify({ ...defaults.DEFAULT_FIRST_PERSON_ONBOARDING, tutorialCompleted: true, controlChoiceAcknowledged: true }));
  }
  const settle = async () => R.act(async () => { for (let i = 0; i < 24; i++) await Promise.resolve(); });
  const hud = await native.mount(App, {}); await settle();
  const frames = [], hudTrees = [], hudMap = new Map(), events = [], transitions = [], scenes = [];
  let sceneState, previous = new Map();
  const snapshot = () => ({ seconds, canvasOwners: liveOwners, audio: diagnostics(), playing: harness.live().filter(p => p.playing).map(p => p.source), nativeActive: harness.activeSession });
  const event = (type, detail = {}) => events.push({ frame: frames.length, type, ...snapshot(), ...detail });
  const button = label => hud.tree.root.findAll(n => n.type === 'Pressable' && n.props.accessibilityLabel === label && !n.props.disabled)[0];
  async function press(label) {
    const b = button(label); check(b, 'Missing enabled button: ' + label);
    await R.act(async () => { b.props.onPressIn?.(); b.props.onPress(); }); await settle(); event('actual-button', { label });
  }
  function advanceNative(dt) { seconds += dt; harness.advanceSeconds(dt); const callbacks = [...raf.values()]; raf.clear(); callbacks.forEach(fn => fn(seconds * 1000)); }
  function present(props, dt) {
    advanceNative(dt); presentChapterAudio(props.controller, dt); RC.flushControllerAudioFrame(props.controller);
    props.onSnapshot(RC.controllerSnapshot(props.controller)); RC.flushControllerPresentationFeedback(props.controller);
  }
  async function acknowledge() {
    for (let i = 0; i < 8; i++) { await settle(); const label = button('探索へ戻る') ? '探索へ戻る' : button('点検を続ける') ? '点検を続ける' : undefined; if (!label) break; await press(label); }
  }
  async function ready(index) {
    await acknowledge(); check(current?.controller.runtime.chapterId === CHAPTER_ONE.areas[index].stageId, 'Wrong actual App area ' + index);
    await R.act(async () => { await current.controller.audio.whenReady(); }); await settle();
    context.run = natural.attachNaturalRun(current.controller);
    await R.act(async () => { RC.advanceController(current.controller, .05, context.run.camera); present(current, .05); }); await settle();
    check(!current.controller.runtime.paused, 'Area remains paused');
    const d = current.controller.audio.getDiagnostics(); check(d.availability === 'available' && d.active && d.ready, 'Actual audio owner unavailable');
    check(harness.live().some(p => p.playing && p.source === ['room-gallery', 'room-vault', 'room-theatre'][index]), 'Missing area environment status');
    check(harness.live().some(p => p.playing && ['exploration', 'suspicion', 'pursuit', 'release'].includes(p.source)), 'Missing music status');
    event('ready-area', { area: CHAPTER_ONE.areas[index].id, runId: JSON.parse(memory.get(campaignKey)).runId });
  }
  async function clearScene() { if (sceneState) { await sceneState.mount.unmount(); sceneState.resources.dispose(); sceneState = undefined; previous = new Map(); } }
  async function scene() {
    await clearScene(); const c = current.controller, stageId = c.runtime.chapterId;
    const resources = createSceneResources(false, null, true, stageId === 'uncanny-vault-v1', stageId === 'shadow-theatre-v1');
    const runtime = { current: c.runtime }, world = new THREE.Scene(), camera = context.run.camera;
    world.background = new THREE.Color('#171a1b'); world.add(camera);
    const mount = await mountThree(React.createElement(ChapterScene, { world: RC.worldForController(c), runtime, progress: c.runtime.progress, resources,
      assist: false, reducedMotion: false, lowQuality: false, lab: false, renderOffscreen: () => {}, onFrameError: error => { throw error; } }), THREE);
    mount.objects.forEach(object => world.add(object));
    const callbacks = bridge.callbacks.splice(0).filter(fn => !fn.toString().includes('mirror.render'));
    callbacks.forEach(fn => fn({}, 0)); world.updateMatrixWorld(true);
    const file = phase + '-scene-' + scenes.length + '.json'; fs.writeFileSync(path.join(out, file), JSON.stringify(world.toJSON()));
    scenes.push({ file, stageId, sha256: sha256(fs.readFileSync(path.join(out, file))) });
    sceneState = { file, world, camera, c, runtime, mount, resources, callbacks };
  }
  function record(label) {
    const updates = [];
    if (sceneState) {
      sceneState.runtime.current = sceneState.c.runtime;
      sceneState.callbacks.forEach(fn => fn({}, 1 / FPS)); sceneState.world.updateMatrixWorld(true);
      sceneState.world.traverse(object => { const value = { matrix: object.matrix.toArray(), visible: object.visible, material: !Array.isArray(object.material) ? object.material?.uuid : undefined };
        const key = JSON.stringify(value); if (previous.get(object.uuid) !== key) { previous.set(object.uuid, key); updates.push([object.uuid, value]); } });
    }
    const tree = hud.serialize(), key = JSON.stringify(tree); let hudIndex = hudMap.get(key);
    if (hudIndex === undefined) { hudIndex = hudTrees.length; hudMap.set(key, hudIndex); hudTrees.push(tree); }
    frames.push({ scene: sceneState?.file ?? null, camera: sceneState?.camera.uuid ?? null, updates, hud: hudIndex, label, seconds, paused: current?.controller.runtime.paused, audio: snapshot() });
  }
  async function hold(label, duration = 1.2) {
    for (let sample = 0; sample < Math.round(duration * FPS); sample++) {
      await R.act(async () => {
        for (let tick = 0; tick < 12; tick++) {
          if (sceneState && !sceneState.c.retired) { RC.advanceController(sceneState.c, 1 / 60, sceneState.camera); present(current, 1 / 60); }
          else advanceNative(1 / 60);
        }
      }); await settle(); record(label);
    }
  }
  async function walk(label) {
    const c = current.controller, start = { ...c.runtime.pose.position }, firstEvent = harness.events.length;
    const touch = y => ({ changedTouches: [{ identifier: 51, locationX: 62, locationY: y, pageX: 62, pageY: y }] });
    await hud.touch('movement-stick', 'Start', touch(60)); await hud.touch('movement-stick', 'Move', touch(10));
    await hold(label, .6); await hud.touch('movement-stick', 'End', touch(10));
    const distance = Math.hypot(c.runtime.pose.position.x - start.x, c.runtime.pose.position.z - start.z);
    check(distance > .65, 'Actual movement stick did not move player');
    check(harness.events.slice(firstEvent).some(e => e.operation === 'play' && ['step-a', 'step-b'].includes(e.source)), 'Movement lacks footstep status');
    event('actual-movement-stick', { distance }); await hold(label, .8);
  }
  async function complete(index) {
    await clearScene(); const props = current, c = props.controller, run = natural.attachNaturalRun(c), before = seconds;
    run.onAdvance = (_run, dt) => present(props, dt); run.onCommand = () => present(props, 0);
    await R.act(async () => check(natural.playNaturalArea(run, index, ['shadow', 'contour']).progress.cleared, 'Natural route did not clear'));
    await acknowledge();
    for (let tick = 0; tick < 700 && !c.retired && current.controller === c; tick++) {
      await R.act(async () => { RC.advanceController(c, 1 / 60, run.camera); present(props, 1 / 60); });
      if (button('探索へ戻る') || button('点検を続ける')) await acknowledge();
    }
    await settle(); const saved = JSON.parse(memory.get(campaignKey));
    check(c.retired, 'Natural completion did not retire old controller');
    check(saved.completedAreas.includes(CHAPTER_ONE.areas[index].id), 'App did not save actual completion');
    check(saved.currentArea === CHAPTER_ONE.areas[index + 1].id, 'App did not advance campaign area');
    transitions.push({ from: CHAPTER_ONE.areas[index].id, to: saved.currentArea, fromSession: c.runtime.session, routeSeconds: seconds - before,
      saveSha256: sha256(memory.get(campaignKey)), completedAreas: saved.completedAreas, retired: c.retired, callback: 'FirstPersonScreen.publish -> App.onComplete, no manual gate completion' });
    event('natural-completion', transitions.at(-1)); await ready(index + 1); await scene();
    await hold((index === 0 ? '01 → 02' : '02 → 03') + ' 実Appの完了・移動（途中の探索は省略）', 1.6);
  }
  await hold(phase === 'cold' ? '別のNodeプロセス：保存された02を読み込み' : '新しいプレイ：実Appのホーム', 1);
  if (phase === 'fresh') {
    await press('第一章をはじめる'); if (button('あとで調整して遊ぶ')) await press('あとで調整して遊ぶ');
    await hold('01 開始前の案内', .8); await press('展示室へ入る'); await ready(0); await scene(); await hold('01 実Appから入場', 1);
    await complete(0); await walk('02 実際の移動操作');
    const pausedController = current.controller, pausedAudioOwner = current.controller.audio, pausedPose = JSON.stringify(current.controller.runtime.pose);
    await press('一時停止'); check(!harness.live().some(p => p.playing), 'Paused audio still playing'); await hold('02 一時停止：音の再生状態も停止', 1.6);
    check(JSON.stringify(current.controller.runtime.pose) === pausedPose, 'Paused player pose moved');
    await press('再開する'); await ready(1);
    check(current.controller === pausedController && current.controller.audio === pausedAudioOwner, 'Pause/resume replaced controller/audio owner');
    event('same-owner-after-resume', { runtimeSession: current.controller.runtime.session }); await hold('02 同じ所有者で再開', 1.6);
    await press('一時停止'); await hold('02 ホームへ戻る前の一時停止', .8); await press('ホームへ戻る'); await clearScene(); await hold('ホームへ戻る：02を実際に保存', 1.2);
    const raw = memory.get(campaignKey), saved = JSON.parse(raw);
    check(saved.currentArea === CHAPTER_ONE.areas[1].id && saved.completedAreas.length === 1, 'Expected genuine area02 save');
    write('fresh-storage.json', [...memory]); write('fresh-save-proof.json', { sha256: sha256(raw), key: campaignKey, runId: saved.runId, currentArea: saved.currentArea, completedAreas: saved.completedAreas, revision: saved.revision });
    event('persisted-for-cold-process', { sha256: sha256(raw), runId: saved.runId });
    await press('続きから'); await press('収蔵庫へ入る'); await ready(1); await scene(); await hold('02 保存位置から続行', .8); await complete(1);
  } else {
    await press('続きから'); await hold('別プロセス：02の再開案内', 1); await press('収蔵庫へ入る'); await ready(1); await scene();
    const saved = JSON.parse(memory.get(campaignKey)), proof = JSON.parse(fs.readFileSync(path.join(out, 'fresh-save-proof.json'), 'utf8'));
    check(inputSaveHash === proof.sha256 && saved.runId === proof.runId && saved.currentArea === proof.currentArea, 'Cold resume changed input identity');
    check(JSON.stringify(saved.completedAreas) === JSON.stringify(proof.completedAreas), 'Cold resume lost completed area');
    event('cold-restored', { inputSaveHash, runId: saved.runId, currentArea: saved.currentArea, completedAreas: saved.completedAreas });
    await hold('別プロセス：02を直接再開、01完了を保持', 1.6); await walk('別プロセス：02で移動と音の状態を確認');
  }
  await clearScene(); await hud.unmount(); await settle();
  const final = { ...snapshot(), rafCallbacks: raf.size, appStateSubscriptions: appListeners.size, nativePlayers: harness.live().length, nativeSubscriptions: harness.subscriptions };
  check(liveOwners === 0 && peakOwners === 1 && owners.every(o => o.unmounted), 'Canvas ownership leak');
  check(final.audio.liveOwners === 0 && final.audio.livePlayers === 0 && final.audio.session.leases === 0 && final.audio.session.pendingOperations === 0 && !final.audio.session.desiredActive && !final.audio.session.appliedActive, 'Audio owner/session leak');
  check(harness.maxLivePlayers <= 12, 'Exceeded bounded native player pool');
  check(!raf.size && !appListeners.size && !harness.live().length && !harness.subscriptions, 'Callbacks/native fixture leak');
  bridge.verify(); verify(assets);
  write(phase + '-animation.json', { frames, hudTrees });
  const report = { phase, pid: process.pid, frames: frames.length, seconds, inputSaveHash, events, transitions, owners, peakOwners, final,
    scenes, storageWrites: writes, nativeEvents: harness.events, maxNativePlayers: harness.maxLivePlayers, sourceHashes: Object.fromEntries(bridge.hashes), assetHashes: assets, toolHashes: hashes(toolFiles) };
  write(phase + '-report.json', report); console.log(JSON.stringify({ phase, frames: frames.length, seconds, owners: owners.length, finalOwners: final.canvasOwners, finalAudioOwners: final.audio.liveOwners, finalPlayers: final.nativePlayers, finalLeases: final.audio.session.leases, finalCallbacks: final.rafCallbacks + final.appStateSubscriptions }));
}

async function render() {
  const fresh = JSON.parse(fs.readFileSync(path.join(out, 'fresh-animation.json'))), cold = JSON.parse(fs.readFileSync(path.join(out, 'cold-animation.json')));
  const frames = [...fresh.frames, ...cold.frames.map(f => ({ ...f, hud: f.hud + fresh.hudTrees.length }))];
  write('animation.json', { frames, hudTrees: [...fresh.hudTrees, ...cold.hudTrees] });
  for (const file of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(out, file));
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><style>' + browserStyles + '.rn-text{line-height:normal}#app{position:absolute;inset:0 0 48px;display:flex;flex-direction:column}#caption{position:absolute;left:0;right:0;bottom:0;height:48px;padding:5px 9px;color:#eee;background:#080d12;font:12px/18px sans-serif}</style><div id="app"></div><div id="caption"></div><script type="module" src="viewer.js"></script>');
  fs.writeFileSync(path.join(out, 'viewer.js'), `import * as THREE from './three.module.js';
${browserHelpers}
const data=await(await fetch('./animation.json')).json(),root=document.getElementById('app'),caption=document.getElementById('caption');
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(${WIDTH},${HEIGHT});renderer.outputColorSpace=THREE.SRGBColorSpace;
let scene,id,objects=new Map(),materials=new Map(),last=-1;
function clear(){if(!scene)return;const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();renderer.renderLists.dispose();scene=null;}
window.draw=async n=>{if(n!==last+1)throw Error('Sequential frames required');const f=data.frames[n];if(f.scene!==id){clear();id=f.scene;if(id){scene=await new THREE.ObjectLoader().parseAsync(await(await fetch(id)).json());objects=new Map();materials=new Map();scene.traverse(o=>{objects.set(o.uuid,o);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.set(m.uuid,m);});}}
if(scene){for(const[k,v]of f.updates){const o=objects.get(k);if(!o)throw Error('Missing scene object');o.matrix.fromArray(v.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=v.visible;if(v.material)o.material=materials.get(v.material)||o.material;}scene.updateMatrixWorld(true);const camera=objects.get(f.camera);if(!camera)throw Error('Missing camera');renderer.render(scene,camera);}
root.replaceChildren(hudDOM(data.hudTrees[f.hud],1,renderer.domElement));caption.textContent=f.label+'\\nQA: software WebGL / CSS・音は状態モデル（動画は無音）';await document.fonts.ready;await new Promise(r=>requestAnimationFrame(r));last=n;return{label:f.label,text:root.textContent,calls:scene?renderer.info.render.calls:0,triangles:scene?renderer.info.render.triangles:0};};
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
    const disposal = await browser.evaluate('window.finish()'); check(browser.errors.length === 0, 'Browser exception');
    write('render-report.json', { viewport: { width: WIDTH, height: HEIGHT }, captionHeight: 48, fps: FPS, frames: frames.length, duration: frames.length / FPS, selected, disposal, records });
  } finally { await browser.close(); }
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(FPS), '-i', path.join(frameDir, '%06d.png'), '-frames:v', String(frames.length), '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(out, 'player-resume-app.mp4')], { stdio: 'inherit' });
  return { frames: frames.length, duration: frames.length / FPS, selected };
}
async function main() {
  fs.mkdirSync(out, { recursive: true });
  if (phase) { check(['fresh', 'cold'].includes(phase), 'Invalid phase'); await extract(); return; }
  const guard = hashes(toolFiles);
  for (const childPhase of ['fresh', 'cold']) cp.execFileSync(process.execPath, [__filename, '--phase=' + childPhase, '--out=' + out], { cwd: root, stdio: 'inherit' });
  const fresh = JSON.parse(fs.readFileSync(path.join(out, 'fresh-report.json'))), cold = JSON.parse(fs.readFileSync(path.join(out, 'cold-report.json')));
  check(fresh.pid !== cold.pid, 'Cold phase must be a separate process');
  const sourceHashes = { ...fresh.sourceHashes, ...cold.sourceHashes }, assetHashes = { ...fresh.assetHashes, ...cold.assetHashes };
  for (const [file, hash] of Object.entries(fresh.sourceHashes)) if (cold.sourceHashes[file]) check(cold.sourceHashes[file] === hash, 'Cross-process source drift: ' + file);
  for (const [file, hash] of Object.entries(fresh.assetHashes)) if (cold.assetHashes[file]) check(cold.assetHashes[file] === hash, 'Cross-process asset drift: ' + file);
  verify(sourceHashes); verify(assetHashes); verify(guard);
  const video = await render(); verify(sourceHashes); verify(assetHashes); verify(guard);
  const files = ['fresh-report.json', 'cold-report.json', 'fresh-save-proof.json', 'fresh-storage.json', 'render-report.json', 'player-resume-app.mp4'];
  write('report.json', { schemaVersion: 1, head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    method: 'Actual App/Screen/controller commands, completion and storage; two Node processes. Native availability and successful GL presentation substituted. Actual Three scenes/HUD hosts replayed in SwiftShader/CSS. Shared native audio fixture models status, zero-latency seek, not native playback; silent video. Captured segments use 60Hz simulated ticks sampled at 5fps; omitted natural routes use the existing route fixture timing. Exploration routes omitted between labelled transition segments, never realtime FPS evidence.',
    gates: { natural01to02: fresh.transitions.some(t => t.from.endsWith('01') && t.to.endsWith('02')), natural02to03: fresh.transitions.some(t => t.from.endsWith('02') && t.to.endsWith('03')),
      actualPauseResume: fresh.events.some(e => e.label === '一時停止') && fresh.events.some(e => e.label === '再開する'), genuineColdSave: cold.inputSaveHash === JSON.parse(fs.readFileSync(path.join(out, 'fresh-save-proof.json'))).sha256,
      separateProcess: fresh.pid !== cold.pid, sourceGuard: true },
    video, sourceHashes, assetHashes, toolHashes: guard, artifacts: Object.fromEntries(files.map(file => [file, { bytes: fs.statSync(path.join(out, file)).size, sha256: sha256(fs.readFileSync(path.join(out, file))) }])) });
  console.log(JSON.stringify({ result: 'PASS', sourceFiles: Object.keys(sourceHashes).length, ...video }));
}
main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
