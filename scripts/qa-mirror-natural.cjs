#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Actual area-04 controller/StageScene source, with the same planarMirror.ts
// transpiled for a browser Software WebGL pass. Native EXGL remains untested.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), ts = require('typescript'), Module = require('node:module');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const standardRecovery = process.argv.includes('--standard-recovery');
const extractOnly = process.argv.includes('--extract-only');
const outputArgument = process.argv.slice(2).find(argument => argument.startsWith('--out='));
if (process.argv.slice(2).some(argument => argument !== '--standard-recovery' && argument !== '--extract-only' && !argument.startsWith('--out=')))
  throw Error('usage: node scripts/qa-mirror-natural.cjs [--standard-recovery] [--extract-only] [--out=path]');
const name = standardRecovery ? 'mirror-standard-recovery' : 'mirror-natural';
const root = path.resolve(__dirname, '..'), out = outputArgument ? path.resolve(outputArgument.slice(6)) : path.join(root, '.expo/goal014-2', name);
fs.mkdirSync(out, { recursive: true });
// No native app metadata exists in the Node scene extractor.
const load = Module._load;
Module._load = function (name, ...args) {
  if (name === 'expo-constants') return {};
  return load.call(this, name, ...args);
};
globalThis.__DEV__ = false;
const bridge = installSourceBridge(root), React = require('react'), THREE = require('three');
const RC = require('../src/rendering/firstPerson/runtimeController.ts');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const { StageScene } = require('../src/domain/stages/mirror-corridor-v1/scene.tsx');
const { isStageSession } = require('../src/domain/stages/mirror-corridor-v1/session.ts');
const { createCheckpoint } = require('../src/domain/firstPerson/checkpoint.ts');
const { parseStageCheckpoint } = require('../src/domain/stages/mirror-corridor-v1/checkpoint.ts');
const { stageModule } = require('../src/domain/stageKit/modules.ts');
const { FIGURE_CENTER, KEY_CENTER, MIRROR_CENTER, WINCH_CENTER, WINCH_SAFE, PRACTICE_CENTER, SHELTER_SAFE, MIRROR_LAYOUT } = require('../src/domain/stages/mirror-corridor-v1/definition.ts');
const { isSafePose, inspectPoseSafety } = require('../src/domain/firstPerson/geometry.ts');
const { beginStick, endPointer } = require('../src/rendering/firstPerson/touchInput.ts');

function timingSummary(samples) {
  if (!samples.length) throw Error('No CPU timing samples');
  const sorted = [...samples].sort((a, b) => a - b);
  const at = fraction => Number(sorted[Math.floor((sorted.length - 1) * fraction)].toFixed(3));
  return { samples: sorted.length, p50Ms: at(.5), p95Ms: at(.95), maxMs: at(1) };
}

async function extract() {
  const start = (() => {
    if (!standardRecovery) return undefined;
    const module = stageModule('mirror-corridor-v1');
    const fresh = module.checkpoint(module.create());
    const data = parseStageCheckpoint(fresh.stageData);
    if (!data) throw Error('Fresh mirror stage checkpoint is invalid');
    const carried = module.restore({ ...fresh, stageData: { ...data,
      keyTaken: true, practiced: true, ratchets: 0, pose: WINCH_SAFE } })?.checkpoint;
    if (!carried) throw Error('Valid standard winch checkpoint missing');
    return carried;
  })();
  let controller = RC.createController(start, false, true, 'mirror-corridor-v1');
  controller.horrorIntensity = standardRecovery ? 'standard' : 'subdued';
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false });
  const camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
  RC.syncCamera(controller, camera);
  const runtime = { current: controller.runtime }, resources = createSceneResources(false, null, true);
  // The callback for the native offscreen pass is run by the browser viewer
  // with real WebGL. Other callbacks here update the real grate/body meshes.
  const mounted = await mountThree(React.createElement(StageScene, { world: RC.worldForController(controller),
    runtime, resources, renderOffscreen: () => {}, onFrameError: error => { throw error; } }), THREE);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#09090C'); scene.add(camera);
  mounted.objects.forEach(object => scene.add(object));
  if (!scene.getObjectByName('control-vestibule-door') || scene.getObjectByName('mirror-corridor-exit'))
    throw Error('Corridor exit must show the control vestibule without a floating device marker');
  const keyMesh = scene.getObjectByName('isolation-key');
  if (!keyMesh) throw Error('The figure-ground key is absent from area 04');
  const winchKey = scene.getObjectByName('winch-key');
  if (!winchKey) throw Error('The reusable isolation key has no winch visual');
  const mirrorCallbacks = bridge.callbacks.filter(callback => callback.toString().includes('mirror.render'));
  if (mirrorCallbacks.length !== 1) throw Error(`Expected one mirror callback; found ${mirrorCallbacks.length}`);
  const callbacks = bridge.callbacks.filter(callback => !mirrorCallbacks.includes(callback));
  const frames = [], events = [];
  const state = () => { const value = controller.runtime.stageSession?.value;
    if (!isStageSession(value)) throw Error('Mirror stage session lost'); return value; };
  const assertSafe = context => {
    if (!isSafePose(controller.runtime.pose, RC.worldForController(controller)))
      throw Error('Unsafe route pose at ' + context + ': ' + JSON.stringify(inspectPoseSafety(controller.runtime.pose, RC.worldForController(controller))));
  };
  assertSafe('entry');
  const capture = () => {
    scene.updateMatrixWorld(true);
    const objects = [];
    scene.traverse(object => objects.push({ uuid: object.uuid, matrix: object.matrix.toArray(), visible: object.visible }));
    frames.push({ objects, event: events.at(-1)?.label ?? '鏡越しの回廊',
      pose: { ...controller.runtime.pose.position }, actor: { ...state().actor.motion.position },
      ratchets: state().ratchets });
  };
  let simulationFrames = 0;
  let lastActorEvents = [];
  const simulationCpuMs = [];
  const tick = () => {
    const started = performance.now();
    RC.advanceController(controller, 1 / 60, camera); simulationFrames += 1;
    lastActorEvents = [...controller.pendingActorEvents];
    runtime.current = controller.runtime;
    callbacks.forEach(callback => callback({}, 1 / 60));
    RC.flushControllerAudioFrame(controller);
    // Explicit successful presentation fixture; native failed frames are not
    // represented by this extractor and cannot be inferred from the movie.
    RC.presentControllerRecovery(controller, 1 / 60);
    assertSafe('frame');
    simulationCpuMs.push(performance.now() - started);
    if (simulationFrames % 6 === 0) capture();
  };
  const event = (id, label) => { events.push({ id, label, at: simulationFrames / 60,
    pose: { ...controller.runtime.pose.position }, actor: { ...state().actor.motion.position },
    actorPhase: state().actor.phase, ratchets: state().ratchets,
    holding: state().holding, holdSeconds: state().holdSeconds }); capture(); };
  const turn = (yaw, pitch = 0) => {
    RC.commandController(controller, { type: 'turn', yaw: yaw - controller.runtime.pose.yaw,
      pitch: pitch - controller.runtime.pose.pitch });
    RC.syncCamera(controller, camera); runtime.current = controller.runtime;
    callbacks.forEach(callback => callback({}, 0)); capture();
  };
  const walkZ = z => {
    turn(Math.PI); let count = 0;
    while (Math.abs(controller.runtime.pose.position.z - z) > .07 && count < 900 && !controller.runtime.progress.cleared) {
      controller.input.forward = controller.runtime.pose.position.z < z ? 1 : -1;
      tick(); count += 1;
    }
    controller.input.forward = 0;
    if (count === 900) throw Error(`Blocked walking to z=${z}`);
  };
  const walkX = x => {
    turn(Math.PI / 2); let count = 0;
    while (Math.abs(controller.runtime.pose.position.x - x) > .07 && count < 600) {
      controller.input.forward = controller.runtime.pose.position.x > x ? 1 : -1;
      tick(); count += 1;
    }
    controller.input.forward = 0;
    if (count === 600) throw Error(`Blocked walking to x=${x}`);
  };
  const press = (id, label, yaw, pitch) => {
    turn(yaw, pitch);
    if (RC.controllerSnapshot(controller).target?.id !== id || !RC.interactController(controller, id))
      throw Error(`Rejected ${id}: ${controller.feedbackMessage}`);
    runtime.current = controller.runtime;
    callbacks.forEach(callback => callback({}, 0)); event(id, label);
  };
  const aimWinch = () => { const player = controller.runtime.pose.position;
    turn(Math.atan2(-(-2.45 - player.x), -(11.3 - player.z)), -.16); };
  callbacks.forEach(callback => callback({}, 0)); scene.updateMatrixWorld(true);
  if (winchKey.visible) throw Error('The winch key appeared before it was inserted');
  const surface = scene.getObjectByName('planar-mirror');
  const nativeMirrorMaterial = surface.material, transportMaterial = new THREE.MeshBasicMaterial({ color: '#394A4A' });
  surface.material = transportMaterial;
  fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify(scene.toJSON()));
  surface.material = nativeMirrorMaterial; transportMaterial.dispose(); capture();
  if (standardRecovery) {
    event('validated-entry', '鍵と練習を引き継いだ作業地点');
    const walkTo = (x, z) => {
      for (let frame = 0; frame < 900; frame += 1) {
        const pose = controller.runtime.pose;
        if (Math.hypot(x - pose.position.x, z - pose.position.z) < .06 || controller.runtime.progress.cleared) {
          controller.input.forward = 0; return;
        }
        const yaw = Math.atan2(-(x - pose.position.x), -(z - pose.position.z));
        RC.commandController(controller, { type: 'turn', yaw: yaw - pose.yaw, pitch: -pose.pitch });
        controller.input.forward = 1; tick();
      }
      controller.input.forward = 0;
      throw Error(`Recovery walk blocked before ${x},${z}`);
    };
    aimWinch();
    if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-winch' ||
      !RC.beginStageHoldController(controller, 'mirror-corridor-winch', 7)) throw Error('Standard first hold rejected');
    event('first-hold', '標準：一段目を保持');
    for (let frame = 0; frame < 120; frame += 1) tick();
    if (state().ratchets !== 1 || !RC.endStageHoldController(controller, 'mirror-corridor-winch', 7))
      throw Error('Standard first ratchet did not settle');
    event('first-release', '一段目を残して指を離す');
    aimWinch();
    if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-winch' ||
      !RC.beginStageHoldController(controller, 'mirror-corridor-winch', 8)) throw Error('Standard second hold rejected');
    event('second-hold', '次の歯止めを途中で離す');
    for (let frame = 0; frame < 30; frame++) tick();
    if (!RC.endStageHoldController(controller, 'mirror-corridor-winch', 8) || state().ratchets !== 1)
      throw Error('Unfinished tooth did not cancel without losing the first tooth');
    // Deliberately leave cover with a real held movement contact. This adverse
    // route tests capture/progress/contact retirement, not a fairness success.
    walkTo(0, 10); walkTo(0, 10.5);
    beginStick(controller.input, 8, 40, 600);
    if (controller.input.stickPointer !== 8) throw Error('Adverse movement contact not owned');
    event('actor-approaches', '棚から離れた通路で巡回体を待つ');
    let caught = false;
    for (let frame = 0; frame < 900 && !caught; frame += 1) {
      tick(); caught = lastActorEvents.includes('caught');
    }
    if (!caught || state().holding !== null || state().holdSeconds !== 0 ||
      state().ratchets < 1 || state().ratchets >= 3 ||
      !state().keyTaken || !state().practiced) throw Error('Capture did not preserve partial winch progress and key: ' +
        JSON.stringify({ caught, holding: state().holding, ratchets: state().ratchets,
          keyTaken: state().keyTaken, practiced: state().practiced, seconds: simulationFrames / 60,
          events: events.map(({ id, at, actor, actorPhase }) => ({ id, at, actor, actorPhase })) }));
    if (!controller.input.releaseBarrier.includes(8) || RC.endStageHoldController(controller, 'mirror-corridor-winch'))
      throw Error('Capture did not retire the held contact and reject stale winch completion');
    endPointer(controller.input, 8);
    if (controller.input.releaseBarrier.includes(8)) throw Error('Captured movement contact did not release');
    event('caught', '捕捉後、確定した歯止めと鍵を保って復帰');
    let presented = 0;
    while (state().actor.recoveryPending && presented++ < 90) tick();
    if (state().actor.recoveryPending || controller.captureRecovery) throw Error('Recovery did not resume after accepted presentations');
    event('recovery-input-ready', '棚の陰で操作を再開できる');
    const checkpoint = createCheckpoint(controller.runtime);
    const verified = stageModule('mirror-corridor-v1').restore(checkpoint)?.checkpoint;
    if (!verified) throw Error('Caught winch state could not be restored through the Stage codec');
    const previousController = controller;
    RC.retireController(previousController);
    if (!previousController.retired) throw Error('Previous controller remained active during restore');
    controller = RC.createController(verified, false, true, 'mirror-corridor-v1');
    controller.horrorIntensity = 'standard';
    Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
      sceneMode: 'chapter', paused: false, open: false });
    runtime.current = controller.runtime; RC.syncCamera(controller, camera);
    callbacks.forEach(callback => callback({}, 0));
    if (!state().keyTaken || !state().practiced || state().ratchets !== checkpoint.stageData.ratchets ||
      state().holding !== null) throw Error('Cold winch restore lost key, settled teeth, or safe hold state');
    event('cold-resume', '保存した歯止めから再開');
    walkTo(SHELTER_SAFE.position.x, 9.85); walkTo(-2.45, 9.85); walkTo(-2.45, 9.6); aimWinch();
    if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-winch' ||
      !RC.beginStageHoldController(controller, 'mirror-corridor-winch', 9)) throw Error('Recovered winch hold rejected');
    event('rework', '残りの歯止めを巻き上げ直す');
    const remainingFrames = 120 * (3 - state().ratchets);
    for (let frame = 0; frame < remainingFrames; frame += 1) tick();
    if (state().ratchets !== 3 || state().holding !== null || RC.endStageHoldController(controller, 'mirror-corridor-winch', 9))
      throw Error('Recovered winch did not open the physical grate');
    event('grate-open', '確定した歯止めを残して格子が開く');
    walkTo(-2.45, 9.3); walkTo(1.3, 9.3); walkTo(1.3, 15.9); walkTo(0, 15.9); walkTo(0, MIRROR_LAYOUT.doorway.thresholdZ + .2);
    if (!state().gateCrossed || controller.runtime.pose.position.z < MIRROR_LAYOUT.doorway.thresholdZ || !controller.runtime.progress.cleared)
      throw Error('Standard physical corridor exit failed after capture');
    event('exit', '標準：制御室への前室に着く');
  } else {
  walkZ(-1.5);
  press('mirror-corridor-figure', '向き合う横顔を観察',
    Math.atan2(-(FIGURE_CENTER.x - controller.runtime.pose.position.x), -(FIGURE_CENTER.z - controller.runtime.pose.position.z)),
    Math.atan2(FIGURE_CENTER.y - controller.runtime.pose.position.y, Math.hypot(FIGURE_CENTER.x - controller.runtime.pose.position.x, FIGURE_CENTER.z - controller.runtime.pose.position.z)));
  press('mirror-corridor-key', '中央の隔離キーを取得', Math.PI,
    Math.atan2(KEY_CENTER.y - controller.runtime.pose.position.y, KEY_CENTER.z - controller.runtime.pose.position.z));
  if (!keyMesh.visible) throw Error('Accepted key pickup skipped its visible movement');
  for (let i = 0; i < 24; i += 1) tick();
  if (keyMesh.visible || keyMesh.position.z > KEY_CENTER.z - .28) throw Error('Picked-up key did not leave the fixed figure-ground panel');
  event('key-lifted', '中央の部品を取り出した');
  walkZ(5.9); walkX(-2.16); walkZ(6.9);
  const practiceDx = PRACTICE_CENTER.x - controller.runtime.pose.position.x, practiceDz = PRACTICE_CENTER.z - controller.runtime.pose.position.z;
  turn(Math.atan2(-practiceDx, -practiceDz), Math.atan2(PRACTICE_CENTER.y - controller.runtime.pose.position.y, Math.hypot(practiceDx, practiceDz)));
  if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-practice' ||
    !RC.beginStageHoldController(controller, 'mirror-corridor-practice', 3)) throw Error('Practice hold rejected');
  event('practice', '安全な練習レバーを保持');
  for (let i = 0; i < 40; i += 1) tick();
  if (!state().practiced || !RC.endStageHoldController(controller, 'mirror-corridor-practice', 3)) throw Error('Practice did not settle');
  event('practice-release', '練習終了');
  walkZ(5.9); walkX(-1.1); walkZ(9.6); walkX(-1.8); walkZ(10);
  const mirrorDx = MIRROR_CENTER.x - controller.runtime.pose.position.x;
  const mirrorDz = MIRROR_CENTER.z - controller.runtime.pose.position.z;
  press('mirror-corridor-mirror', '実鏡面を調べ、背後の通路を確認',
    Math.atan2(-mirrorDx, -mirrorDz),
    Math.atan2(MIRROR_CENTER.y - controller.runtime.pose.position.y, Math.hypot(mirrorDx, mirrorDz)));
  if (!state().mirrorInspected) throw Error('Mirror inspection was not recorded');
  walkZ(9.6); walkX(-2.45);
  aimWinch();
  if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-winch' ||
    !RC.beginStageHoldController(controller, 'mirror-corridor-winch', 4)) throw Error('Winch hold rejected');
  runtime.current = controller.runtime; callbacks.forEach(callback => callback({}, 0));
  if (!winchKey.visible || winchKey.position.x <= WINCH_CENTER.x + .05) throw Error('Key did not begin moving into the winch');
  event('winch-key-inserting', '隔離キーを差す');
  for (let i = 0; i < 14; i += 1) tick();
  if (Math.abs(winchKey.position.x - (WINCH_CENTER.x + .05)) > 1e-6) throw Error('Key did not seat in the winch');
  event('winch-one', '鏡を見ながら一段目を巻き上げる');
  for (let i = 0; i < 120; i += 1) tick();
  if (state().ratchets !== 1 || !RC.endStageHoldController(controller, 'mirror-corridor-winch', 4)) throw Error('First tooth did not settle');
  runtime.current = controller.runtime; callbacks.forEach(callback => callback({}, 0));
  if (!winchKey.visible) throw Error('Released key vanished before returning from the winch');
  event('winch-key-returning', '隔離キーを戻す');
  for (let i = 0; i < 14; i += 1) tick();
  if (winchKey.visible || !state().keyTaken) throw Error('Winch key did not return to reusable carried state');
  event('release-one', '一段目を残して離す');
  walkZ(9.85); walkX(SHELTER_SAFE.position.x); walkZ(SHELTER_SAFE.position.z); event('retreat', '棚の陰へ退く');
  for (let i = 0; i < 960; i += 1) tick();
  walkZ(9.85); walkX(-2.45); walkZ(9.6); aimWinch();
  if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-winch' ||
    !RC.beginStageHoldController(controller, 'mirror-corridor-winch', 5)) throw Error('Second winch hold rejected');
  runtime.current = controller.runtime; callbacks.forEach(callback => callback({}, 0));
  if (!winchKey.visible) throw Error('Reusable key did not enter the winch again');
  event('winch-rest', '残りの歯止めを巻き上げる');
  for (let i = 0; i < 240; i += 1) tick();
  if (state().ratchets !== 3 || state().holding !== null || RC.endStageHoldController(controller, 'mirror-corridor-winch', 5)) throw Error('Grate did not open');
  event('grate-open', '格子が開いた');
  walkZ(9.3); walkX(1.3); walkZ(15.9); walkX(0); walkZ(MIRROR_LAYOUT.doorway.thresholdZ + .2);
  if (winchKey.visible || !state().keyTaken) throw Error('The isolation key was consumed after opening the grate');
  if (!state().gateCrossed || controller.runtime.pose.position.z < MIRROR_LAYOUT.doorway.thresholdZ || !controller.runtime.progress.cleared)
    throw Error('Physical corridor exit failed');
  event('exit', '制御室への前室に着く');
  }
  fs.writeFileSync(path.join(out, 'animation.json'), JSON.stringify({ frames }));
  await mounted.unmount(); resources.dispose(); bridge.verify();
  return { mode: standardRecovery ? 'standard-recovery' : 'subdued-natural',
    frames: frames.length, simulationSeconds: simulationFrames / 60, events,
    simulationCpu: timingSummary(simulationCpuMs),
    final: { pose: controller.runtime.pose, mirrorInspected: state().mirrorInspected,
      ratchets: state().ratchets, cleared: controller.runtime.progress.cleared },
    sourceHashes: Object.fromEntries(bridge.hashes) };
}

async function render(report) {
  for (const file of ['three.module.js', 'three.core.js'])
    fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(out, file));
  const mirrorPath = path.join(root, 'src/rendering/firstPerson/planarMirror.ts');
  const transpiled = ts.transpileModule(fs.readFileSync(mirrorPath, 'utf8'), { fileName: mirrorPath,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  fs.writeFileSync(path.join(out, 'planarMirror.js'), transpiled.replace("from 'three'", "from './three.module.js'"));
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#09090c;color:#f4f4f6;font:18px sans-serif}canvas{display:block}
    #caption{position:absolute;left:20px;right:20px;bottom:40px;padding:12px;background:#09090cbb;border:1px solid #87938b}
    </style><div id="caption"></div><script type="module">
    import * as THREE from './three.module.js';
    import {createPlanarMirror,MIRROR_TARGET_SIZE} from './planarMirror.js';
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(1);renderer.setSize(390,844);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.NoToneMapping;document.body.prepend(renderer.domElement);
    const data=await(await fetch('./animation.json')).json(),scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./scene.json')).json());
    const objects=new Map();scene.traverse(o=>objects.set(o.uuid,o));
    const camera=[...objects.values()].find(o=>o.isPerspectiveCamera),surface=scene.getObjectByName('planar-mirror');
    const originalMaterial=surface.material,mirror=createPlanarMirror(),frustum=new THREE.Frustum(),projectionView=new THREE.Matrix4();
    surface.material=mirror.material;
    window.draw=async i=>{const frame=data.frames[i];for(const v of frame.objects){const o=objects.get(v.uuid);o.matrix.fromArray(v.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=v.visible;}
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      surface.updateWorldMatrix(true,false);
      frustum.setFromProjectionMatrix(projectionView.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
      const cpuStarted=performance.now();
      const visible=frustum.intersectsObject(surface);
      const reflected=visible
        ? mirror.render(renderer,scene,camera,surface,(r,s,c)=>r.render(s,c)) : false;
      if(visible)surface.material=reflected?mirror.material:mirror.fallbackMaterial;
      const offscreenCalls=reflected?renderer.info.render.calls:0;
      const offscreenTriangles=reflected?renderer.info.render.triangles:0;
      renderer.render(scene,camera);document.getElementById('caption').textContent=frame.event;
      const glError=renderer.getContext().getError();
      const cpuSubmitMs=performance.now()-cpuStarted;
      await new Promise(resolve=>requestAnimationFrame(resolve));
      return{reflected,offscreenCalls,offscreenTriangles,mainCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
        cpuSubmitMs,glError,backing:surface.material===mirror.fallbackMaterial,
        geometres:renderer.info.memory.geometries,textures:renderer.info.memory.textures,rtSize:MIRROR_TARGET_SIZE};};
    window.finish=()=>{const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}});
      mirror.dispose();originalMaterial.dispose();gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();renderer.renderLists.dispose();
      return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderers:1};};window.ready=true;
    </script>`);
  const browser = await openBrowser(out), directory = path.join(out, 'frames'); fs.mkdirSync(directory, { recursive: true });
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844,
      deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i += 1) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors)); await delay(100);
    }
    let maxMainCalls = 0, maxOffscreenCalls = 0, maxCombinedCalls = 0, maxTriangles = 0, maxCombinedTriangles = 0, reflectedFrames = 0, backingFrames = 0;
    const glErrors = [], backingIndices = [];
    const renderCpuMs = [];
    for (let i = 0; i < report.frames; i += 1) {
      const result = await browser.evaluate(`window.draw(${i})`);
      renderCpuMs.push(result.cpuSubmitMs);
      maxMainCalls = Math.max(maxMainCalls, result.mainCalls);
      maxOffscreenCalls = Math.max(maxOffscreenCalls, result.offscreenCalls);
      maxCombinedCalls = Math.max(maxCombinedCalls, result.mainCalls + result.offscreenCalls);
      maxTriangles = Math.max(maxTriangles, result.triangles);
      maxCombinedTriangles = Math.max(maxCombinedTriangles, result.triangles + result.offscreenTriangles);
      if (result.reflected) reflectedFrames += 1;
      if (result.backing) { backingFrames += 1; backingIndices.push(i); }
      if (result.glError) glErrors.push({ frame: i, code: result.glError });
      const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(directory, String(i).padStart(5, '0') + '.png'), Buffer.from(screenshot.data, 'base64'));
    }
    const disposed = await browser.evaluate('window.finish()');
    const metrics = { maxMainCalls, maxOffscreenCalls, maxCombinedCalls, maxTriangles, maxCombinedTriangles,
      reflectedFrames, backingFrames, backingIndices, glErrors,
      targetSize: [384, 384], cpuRenderSubmit: timingSummary(renderCpuMs),
      cpuTimingScope: 'SwiftShader browser JS mirror and main renderer.render calls; excludes screenshot/readback, RAF wait, native presentation and GPU completion',
      disposed, errors: browser.errors };
    fs.writeFileSync(path.join(out, 'webgl.json'), JSON.stringify(metrics, null, 2) + '\n');
    if (!reflectedFrames || !backingFrames || glErrors.length || disposed.geometries || disposed.textures || browser.errors.length)
      throw Error('Mirror WebGL pass/disposal/error gate failed');
  } finally { await browser.close(); }
  const file = path.join(out, name + '.mp4');
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '10',
    '-i', path.join(directory, '%05d.png'), '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', file]);
  report.video = { file, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)), fps: 10 };
}

async function main() {
  const report = await extract(); if (!extractOnly) await render(report);
  report.boundary = `Actual area-04 controller, collisions, held pointer, StageScene and actor body; ${extractOnly ? 'scene extraction only, no browser rendering in this invocation' : 'planarMirror.ts in one Software WebGL renderer with browser QA caption'}; each simulation tick explicitly substitutes a successful recovery presentation. Native app metadata is an empty fixture. No native EXGL/presentation/HUD/audio or chapter-01→03 handoff. ${standardRecovery ? 'Standard intensity from a validated key/practice checkpoint; one tooth is committed and the next unfinished hold is released, then deliberately leaving cover with a held movement contact earns capture. Progress/contact retirement, presented recovery, Stage-codec cold restore, remaining ratchets and physical threshold crossing are asserted. This adverse compatibility path is not the reaction-delay fairness proof. The viewer retains one scene across controller restoration, so it does not prove a native Canvas remount.' : 'Subdued intensity from a fresh area entry.'}`;
  report.toolHash = sha256(fs.readFileSync(__filename));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ frames: report.frames, duration: report.simulationSeconds, video: report.video }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
