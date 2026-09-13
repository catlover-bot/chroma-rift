#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Area 04/05 scene and FirstPersonScreen HUD from the same live controller.
// Browser CSS/WebGL approximates the native presentation; it is not EXGL/Yoga.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
if (process.argv.length !== 2) throw Error('usage: node scripts/qa-stage-scene-hud.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal013/stage-scene-hud');
fs.mkdirSync(out, { recursive: true });
const sizes = [[320, 568, 2], [390, 844, 1.5], [430, 932, 1]];
const bridge = installSourceBridge(root), context = { width: 320, height: 568, fontScale: 2, bindController: false };
const native = installNativeHudBridge(context), React = require('react'), THREE = require('three');
const RC = require('../src/rendering/firstPerson/runtimeController.ts');
const Defaults = require('../src/types/application.ts');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const { stageModule } = require('../src/domain/stageKit/modules.ts');
const { parseStageCheckpoint } = require('../src/domain/stages/mirror-corridor-v1/checkpoint.ts');
const { WINCH_SAFE, WINCH_CENTER } = require('../src/domain/stages/mirror-corridor-v1/definition.ts');
const { carriedKeyEntry } = require('../src/domain/stages/departure-control-v1/session.ts');
const { StageScene: MirrorScene } = require('../src/domain/stages/mirror-corridor-v1/scene.tsx');
const { StageScene: DepartureScene } = require('../src/domain/stages/departure-control-v1/scene.tsx');
context.bindController = true;
const { FirstPersonScreen } = require('../src/screens/FirstPersonScreen.tsx');

function checkpoint(stageId) {
  const module = stageModule(stageId), fresh = module.checkpoint(module.create());
  const mirrorData = stageId === 'mirror-corridor-v1' ? parseStageCheckpoint(fresh.stageData) : undefined;
  if (stageId === 'mirror-corridor-v1' && !mirrorData) throw Error('Mirror checkpoint codec rejected fresh entry');
  const stageData = stageId === 'mirror-corridor-v1'
    ? { ...mirrorData, keyTaken: true, practiced: true, ratchets: 0, pose: WINCH_SAFE }
    : carriedKeyEntry();
  const restored = module.restore({ ...fresh, stageData });
  if (!restored) throw Error(`${stageId}: checkpoint codec rejected QA entry`);
  return restored.checkpoint;
}
function aim(controller, camera, point, targetId) {
  const p = controller.runtime.pose, dx = point.x - p.position.x, dz = point.z - p.position.z;
  RC.commandController(controller, { type: 'turn', yaw: Math.atan2(-dx, -dz) - p.yaw,
    pitch: Math.atan2(point.y - p.position.y, Math.hypot(dx, dz)) - p.pitch });
  RC.syncCamera(controller, camera);
  if (RC.controllerSnapshot(controller).target?.id !== targetId)
    throw Error(`Expected ${targetId}; aimed at ${RC.controllerSnapshot(controller).target?.id ?? 'nothing'}`);
}
function action(tree) {
  if (Array.isArray(tree)) return tree.map(action).find(Boolean);
  if (!tree || typeof tree === 'string') return undefined;
  if (tree.type === 'Pressable' && tree.testID === 'interact') return tree;
  return tree.children.map(action).find(Boolean);
}
async function extract(stageId, width, height, fontScale) {
  Object.assign(context, { width, height, fontScale });
  const mirror = stageId === 'mirror-corridor-v1', controller = RC.createController(checkpoint(stageId), false, true, stageId);
  context.controller = controller; controller.viewport = { width: context.width, height: context.height };
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    paused: false, open: false, sceneMode: 'chapter' });
  const camera = new THREE.PerspectiveCamera(65, context.width / context.height, .08, 60);
  aim(controller, camera, mirror ? WINCH_CENTER : { x: -4.75, y: 1.4, z: 9 },
    mirror ? 'mirror-corridor-winch' : 'departure-key');
  const runtime = { current: controller.runtime }, resources = createSceneResources(false, null, true);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#09090c'); scene.add(camera);
  const mounted = await mountThree(React.createElement(mirror ? MirrorScene : DepartureScene,
    { world: RC.worldForController(controller), runtime, resources, renderOffscreen: () => {},
      onFrameError: error => { throw error; } }), THREE);
  mounted.objects.forEach(object => scene.add(object));
  const callbacks = bridge.callbacks.splice(0).filter(callback => !callback.toString().includes('mirror.render'));
  const updateScene = () => { runtime.current = controller.runtime; callbacks.forEach(callback => callback({}, 0)); scene.updateMatrixWorld(true); };
  context.snapshot = () => RC.controllerSnapshot(controller);
  const hud = await native.mount(FirstPersonScreen, { chapterId: stageId,
    settings: { ...Defaults.DEFAULT_SETTINGS, haptics: false }, controls: Defaults.DEFAULT_FIRST_PERSON_CONTROLS,
    onboarding: { schemaVersion: 1, tutorialCompleted: true, controlChoiceAcknowledged: true },
    preferredColor: 'neutral', onSettingsChange() {}, onControlsChange() {}, onCheckpoint() {},
    onComplete() {}, onRestart() {}, onExit() {} });
  const records = [];
  const capture = async (name, expectedLabel) => {
    const id = width === 320 ? name : `${name}-${width}`;
    await hud.update(); updateScene();
    const tree = hud.serialize(), button = action(tree);
    if (!button || button.disabled || button.label !== expectedLabel)
      throw Error(`${id}: expected enabled ${expectedLabel}, got ${button?.label} disabled=${button?.disabled}`);
    const file = `${id}-scene.json`;
    fs.writeFileSync(path.join(out, file), JSON.stringify(scene.toJSON()));
    records.push({ id, stageId, file, width, height, fontScale, tree, target: RC.controllerSnapshot(controller).target?.id,
      pose: controller.runtime.pose, action: button.label });
  };
  try {
    if (mirror) {
      await capture('mirror-winch-ready', '巻き上げレバーを保持する');
      await hud.pressTestID('interact');
      if (controller.runtime.stageSession?.value?.holding !== 'winch') throw Error('HUD hold was not accepted');
      await capture('mirror-winch-holding', '保持中。もう一度押すと放す');
    } else {
      await capture('departure-key-ready', '隔離キーを差す');
      await hud.pressTestID('interact');
      if (!controller.runtime.stageSession?.value?.keyInstalled) throw Error('HUD key was not installed');
      aim(controller, camera, { x: -4.75, y: 1.4, z: 10 }, 'departure-procedure');
      await hud.update(); await hud.pressTestID('interact');
      if (!controller.runtime.stageSession?.value?.procedureRead) throw Error('HUD procedure was not read');
      aim(controller, camera, { x: -4.75, y: 1.4, z: 11 }, 'departure-bell');
      await capture('departure-bell-ready', '収容区画の呼び鈴を鳴らす');
    }
  } finally { await hud.unmount(); await mounted.unmount(); resources.dispose(); RC.retireController(controller); }
  return records;
}

async function render(records) {
  for (const file of ['three.module.js', 'three.core.js'])
    fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(out, file));
  const mirrorPath = path.join(root, 'src/rendering/firstPerson/planarMirror.ts');
  const source = ts.transpileModule(fs.readFileSync(mirrorPath, 'utf8'), { fileName: mirrorPath,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  fs.writeFileSync(path.join(out, 'planarMirror.js'), source.replace("from 'three'", "from './three.module.js'"));
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${browserStyles}
    #qa-root{position:absolute;inset:0;display:flex;flex-direction:column}</style><div id="qa-root"></div>
    <script type="module">import * as THREE from './three.module.js';
    import {createPlanarMirror,MIRROR_TARGET_SIZE} from './planarMirror.js';
    ${browserHelpers}
    const root=document.getElementById('qa-root'),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(1);renderer.setSize(320,568);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.NoToneMapping;
    let current=null;
    function dispose(){if(!current)return;const {scene,mirror}=current,gs=new Set(),ms=new Set(),ts=new Set();
      scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}if(o.isInstancedMesh)o.dispose();});
      mirror?.dispose();gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();current=null;}
    window.draw=async record=>{dispose();renderer.setSize(record.width,record.height);
      const scene=await new THREE.ObjectLoader().parseAsync(await(await fetch(record.file)).json());
      const camera=scene.children.find(o=>o.isPerspectiveCamera),surface=scene.getObjectByName('planar-mirror');
      if(!camera)throw Error('QA scene camera missing');let mirror=null,reflected=false,offscreenCalls=0;
      if(surface){mirror=createPlanarMirror();surface.material.dispose();surface.material=mirror.material;
        const f=new THREE.Frustum(),pv=new THREE.Matrix4();scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        surface.updateWorldMatrix(true,false);f.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        if(f.intersectsObject(surface)){reflected=mirror.render(renderer,scene,camera,surface,(r,s,c)=>r.render(s,c));
          offscreenCalls=reflected?renderer.info.render.calls:0;}}
      root.replaceChildren(hudDOM(record.tree,record.fontScale,renderer.domElement));scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      renderer.render(scene,camera);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      current={scene,mirror};const hud=auditNavigationHUD(root);
      return{hud,reflected,offscreenCalls,mainCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
        rtSize:reflected?MIRROR_TARGET_SIZE:null,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};};
    window.finish=()=>{dispose();root.replaceChildren();renderer.renderLists.dispose();return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderers:1};};
    window.ready=true;</script>`);
  const browser = await openBrowser(out), results = [];
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i += 1) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors)); await delay(100);
    }
    for (const record of records) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: record.width, height: record.height,
        deviceScaleFactor: 1, mobile: false });
      const metrics = await browser.evaluate('window.draw(' + JSON.stringify(record) + ')');
      const image = Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64');
      fs.writeFileSync(path.join(out, record.id + '.png'), image);
      results.push({ id: record.id, width: record.width, height: record.height, fontScale: record.fontScale,
        target: record.target, action: record.action, pose: record.pose,
        image: record.id + '.png', sha256: sha256(image), metrics });
      const a = metrics.hud.action;
      if (!a || a.left < 0 || a.right > record.width || a.top < 0 || a.bottom > record.height || a.width < 44 || a.height < 44)
        throw Error(record.id + ': action button is clipped or too small');
      if (!metrics.mainCalls || !metrics.triangles || record.stageId === 'mirror-corridor-v1' && !metrics.reflected)
        throw Error(record.id + ': scene or mirror pass did not render');
      if (metrics.hud.pauseOverlapsObjective || metrics.hud.contextOverlapsMovement || metrics.hud.contextOverlapsAction)
        throw Error(record.id + ': HUD rectangles overlap');
    }
    const disposed = await browser.evaluate('window.finish()');
    if (disposed.geometries || disposed.textures || browser.errors.length)
      throw Error('WebGL resources or browser error remained: ' + JSON.stringify({ disposed, errors: browser.errors }));
    return { results, disposed, errors: browser.errors };
  } finally { await browser.close(); }
}
async function main() {
  const records = [];
  for (const [width, height, fontScale] of sizes)
    for (const stageId of ['mirror-corridor-v1', 'departure-control-v1'])
      records.push(...await extract(stageId, width, height, fontScale));
  bridge.verify();
  const rendered = await render(records); bridge.verify();
  const report = { boundary: 'Actual area-04/05 StageScene, FirstPersonScreen, controller and validated checkpoint at three portrait sizes; scene and HUD share each controller state. The runtime mirror target is recreated from planarMirror.ts after Three scene serialization. Browser Software WebGL/CSS translation, no native Canvas/EXGL/Yoga, actual finger, audio or iPhone visibility.',
    sizes, toolHash: sha256(fs.readFileSync(__filename)),
    sourceHashes: Object.fromEntries(bridge.hashes), ...rendered };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ cases: rendered.results.length, disposed: rendered.disposed, out }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
