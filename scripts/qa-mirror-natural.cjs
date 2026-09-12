#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Actual area-04 controller/StageScene source, with the same planarMirror.ts
// transpiled for a browser Software WebGL pass. Native EXGL remains untested.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), ts = require('typescript');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal013/mirror-natural');
fs.mkdirSync(out, { recursive: true });
const bridge = installSourceBridge(root), React = require('react'), THREE = require('three');
const RC = require('../src/rendering/firstPerson/runtimeController.ts');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const { StageScene } = require('../src/domain/stages/mirror-corridor-v1/scene.tsx');
const { isStageSession } = require('../src/domain/stages/mirror-corridor-v1/session.ts');
const { MIRROR_CENTER } = require('../src/domain/stages/mirror-corridor-v1/definition.ts');

async function extract() {
  const controller = RC.createController(undefined, false, true, 'mirror-corridor-v1');
  controller.horrorIntensity = 'subdued';
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
  const mirrorCallbacks = bridge.callbacks.filter(callback => callback.toString().includes('mirror.render'));
  if (mirrorCallbacks.length !== 1) throw Error(`Expected one mirror callback; found ${mirrorCallbacks.length}`);
  const callbacks = bridge.callbacks.filter(callback => !mirrorCallbacks.includes(callback));
  const frames = [], events = [];
  const state = () => { const value = controller.runtime.stageSession?.value;
    if (!isStageSession(value)) throw Error('Mirror stage session lost'); return value; };
  const capture = () => {
    scene.updateMatrixWorld(true);
    const objects = [];
    scene.traverse(object => objects.push({ uuid: object.uuid, matrix: object.matrix.toArray(), visible: object.visible }));
    frames.push({ objects, event: events.at(-1)?.label ?? '鏡越しの回廊',
      pose: { ...controller.runtime.pose.position }, actor: { ...state().actor.motion.position },
      ratchets: state().ratchets });
  };
  let simulationFrames = 0;
  const tick = () => {
    RC.advanceController(controller, 1 / 60, camera); simulationFrames += 1;
    runtime.current = controller.runtime;
    callbacks.forEach(callback => callback({}, 1 / 60));
    if (simulationFrames % 6 === 0) capture();
  };
  const event = (id, label) => { events.push({ id, label, at: simulationFrames / 60,
    pose: { ...controller.runtime.pose.position }, actor: { ...state().actor.motion.position },
    ratchets: state().ratchets }); capture(); };
  const turn = (yaw, pitch = 0) => {
    RC.commandController(controller, { type: 'turn', yaw: yaw - controller.runtime.pose.yaw,
      pitch: pitch - controller.runtime.pose.pitch });
    RC.syncCamera(controller, camera); runtime.current = controller.runtime;
    callbacks.forEach(callback => callback({}, 0)); capture();
  };
  const walkZ = z => {
    turn(Math.PI); let count = 0;
    while (Math.abs(controller.runtime.pose.position.z - z) > .07 && count < 600) {
      controller.input.forward = controller.runtime.pose.position.z < z ? 1 : -1;
      tick(); count += 1;
    }
    controller.input.forward = 0;
    if (count === 600) throw Error(`Blocked walking to z=${z}`);
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
  const surface = scene.getObjectByName('planar-mirror');
  const nativeMirrorMaterial = surface.material, transportMaterial = new THREE.MeshBasicMaterial({ color: '#394A4A' });
  surface.material = transportMaterial;
  fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify(scene.toJSON()));
  surface.material = nativeMirrorMaterial; transportMaterial.dispose(); capture();
  walkZ(-1);
  press('mirror-corridor-figure', '向き合う横顔を観察', Math.PI, .1);
  press('mirror-corridor-key', '中央の隔離キーを取得', Math.PI, -.16);
  walkZ(7.5); walkX(-1.5);
  turn(Math.PI / 2, -.16);
  if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-practice' ||
    !RC.beginStageHoldController(controller, 'mirror-corridor-practice', 3)) throw Error('Practice hold rejected');
  event('practice', '安全な練習レバーを保持');
  for (let i = 0; i < 40; i += 1) tick();
  if (!state().practiced || !RC.endStageHoldController(controller, 'mirror-corridor-practice', 3)) throw Error('Practice did not settle');
  event('practice-release', '練習終了');
  walkZ(10.9);
  const mirrorDx = MIRROR_CENTER.x - controller.runtime.pose.position.x;
  const mirrorDz = MIRROR_CENTER.z - controller.runtime.pose.position.z;
  press('mirror-corridor-mirror', '実鏡面を調べ、背後の通路を確認',
    Math.atan2(-mirrorDx, -mirrorDz),
    Math.atan2(MIRROR_CENTER.y - controller.runtime.pose.position.y, Math.hypot(mirrorDx, mirrorDz)));
  if (!state().mirrorInspected) throw Error('Mirror inspection was not recorded');
  aimWinch();
  if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-winch' ||
    !RC.beginStageHoldController(controller, 'mirror-corridor-winch', 4)) throw Error('Winch hold rejected');
  event('winch-one', '鏡を見ながら一段目を巻き上げる');
  for (let i = 0; i < 120; i += 1) tick();
  if (state().ratchets !== 1 || !RC.endStageHoldController(controller, 'mirror-corridor-winch', 4)) throw Error('First tooth did not settle');
  event('release-one', '一段目を残して離す');
  walkZ(8.5); event('retreat', '離れて巡回体を避ける');
  for (let i = 0; i < 30; i += 1) tick();
  walkZ(10.9); aimWinch();
  if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-winch' ||
    !RC.beginStageHoldController(controller, 'mirror-corridor-winch', 5)) throw Error('Second winch hold rejected');
  event('winch-rest', '残りの歯止めを巻き上げる');
  for (let i = 0; i < 240; i += 1) tick();
  if (state().ratchets !== 3 || !RC.endStageHoldController(controller, 'mirror-corridor-winch', 5)) throw Error('Grate did not open');
  event('grate-open', '格子が開いた');
  walkZ(8.5); walkX(0); walkZ(22);
  turn(Math.PI, -.06);
  if (RC.controllerSnapshot(controller).target?.id !== 'mirror-corridor-exit' ||
    !RC.interactController(controller, 'mirror-corridor-exit') || !controller.runtime.progress.cleared)
    throw Error('Physical corridor exit failed');
  event('exit', '制御室への前室に着く');
  fs.writeFileSync(path.join(out, 'animation.json'), JSON.stringify({ frames }));
  await mounted.unmount(); resources.dispose(); bridge.verify();
  return { frames: frames.length, simulationSeconds: simulationFrames / 60, events,
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
      const reflected=frustum.intersectsObject(surface)
        ? mirror.render(renderer,scene,camera,surface,(r,s,c)=>r.render(s,c)) : false;
      const offscreenCalls=reflected?renderer.info.render.calls:0;
      renderer.render(scene,camera);document.getElementById('caption').textContent=frame.event;
      await new Promise(resolve=>requestAnimationFrame(resolve));
      return{reflected,offscreenCalls,mainCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
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
    let maxMainCalls = 0, maxOffscreenCalls = 0, maxTriangles = 0, reflectedFrames = 0;
    for (let i = 0; i < report.frames; i += 1) {
      const result = await browser.evaluate(`window.draw(${i})`);
      maxMainCalls = Math.max(maxMainCalls, result.mainCalls);
      maxOffscreenCalls = Math.max(maxOffscreenCalls, result.offscreenCalls);
      maxTriangles = Math.max(maxTriangles, result.triangles);
      if (result.reflected) reflectedFrames += 1;
      const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(directory, String(i).padStart(5, '0') + '.png'), Buffer.from(screenshot.data, 'base64'));
    }
    const disposed = await browser.evaluate('window.finish()');
    const metrics = { maxMainCalls, maxOffscreenCalls, maxTriangles, reflectedFrames,
      targetSize: [384, 384], disposed, errors: browser.errors };
    fs.writeFileSync(path.join(out, 'webgl.json'), JSON.stringify(metrics, null, 2) + '\n');
    if (!reflectedFrames || disposed.geometries || disposed.textures || browser.errors.length)
      throw Error('Mirror WebGL pass/disposal/error gate failed');
  } finally { await browser.close(); }
  const file = path.join(out, 'mirror-natural.mp4');
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '10',
    '-i', path.join(directory, '%05d.png'), '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', file]);
  report.video = { file, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)), fps: 10 };
}

async function main() {
  const report = await extract(); await render(report);
  report.boundary = 'Actual area-04 controller, collisions, held pointer, StageScene, actor body and planarMirror.ts in one Software WebGL renderer; browser QA caption, no native EXGL/presentation/HUD/audio or chapter-01→03 handoff. Subdued intensity.';
  report.toolHash = sha256(fs.readFileSync(__filename));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ frames: report.frames, duration: report.simulationSeconds, video: report.video }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
