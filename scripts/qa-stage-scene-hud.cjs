#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Area 01–05 scene and FirstPersonScreen HUD from the same live controller.
// Browser CSS/WebGL approximates the native presentation; it is not EXGL/Yoga.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
require('./lib/qa-native-metadata.cjs');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
if (process.argv.length !== 2) throw Error('usage: node scripts/qa-stage-scene-hud.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal014/stage-scene-hud');
fs.mkdirSync(out, { recursive: true });
const sizes = [[320, 568, 2], [390, 844, 1.5], [430, 932, 1]];
const bridge = installSourceBridge(root), context = { width: 320, height: 568, fontScale: 2, bindController: false };
const native = installNativeHudBridge(context), React = require('react'), THREE = require('three');
const RC = require('../src/rendering/firstPerson/runtimeController.ts');
const Defaults = require('../src/types/application.ts');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const { stageModule } = require('../src/domain/stageKit/modules.ts');
const { parseStageCheckpoint } = require('../src/domain/stages/mirror-corridor-v1/checkpoint.ts');
const { WINCH_SAFE, WINCH_CENTER, SPAWN: MIRROR_SPAWN } = require('../src/domain/stages/mirror-corridor-v1/definition.ts');
const { CONTROL_TARGETS } = require('../src/domain/stages/departure-control-v1/definition.ts');
const { THEATRE_LIGHT_FIXTURE } = require('../src/domain/theatre/definition.ts');
const { GALLERY_SHADOW_OBSERVATION_POSE, GALLERY_SHADOW_FIXTURE } = require('../src/domain/gallery/definition.ts');
const { VAULT_LENGTH_FIXTURE } = require('../src/domain/vault/definition.ts');
const { isSafePose } = require('../src/domain/firstPerson/geometry.ts');
const { carriedKeyEntry } = require('../src/domain/stages/departure-control-v1/session.ts');
const { ChapterScene } = require('../src/rendering/firstPerson/ChapterScene.tsx');
context.bindController = true;
const { FirstPersonScreen } = require('../src/screens/FirstPersonScreen.tsx');

function checkpoint(stageId) {
  if (stageId === 'perception-gallery-v1' || stageId === 'uncanny-vault-v1' || stageId === 'shadow-theatre-v1') return undefined;
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
async function extract(stageId, width, height, fontScale, quality) {
  Object.assign(context, { width, height, fontScale });
  const mirror = stageId === 'mirror-corridor-v1', gallery = stageId === 'perception-gallery-v1',
    vault = stageId === 'uncanny-vault-v1', theatre = stageId === 'shadow-theatre-v1', lowQuality = quality === 'low';
  const controller = RC.createController(checkpoint(stageId), false, true, stageId);
  context.controller = controller; controller.viewport = { width: context.width, height: context.height };
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    paused: false, open: false, sceneMode: 'chapter' });
  const camera = new THREE.PerspectiveCamera(65, context.width / context.height, .08, 60);
  if (mirror || !gallery && !vault && !theatre) aim(controller, camera, mirror ? WINCH_CENTER : CONTROL_TARGETS.key,
    mirror ? 'mirror-corridor-winch' : 'departure-key');
  else RC.syncCamera(controller, camera);
  const runtime = { current: controller.runtime }, resources = createSceneResources(lowQuality, null, true, vault, theatre);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#09090c'); scene.add(camera);
  const mounted = await mountThree(React.createElement(ChapterScene,
    { world: RC.worldForController(controller), progress: controller.runtime.progress,
      runtime, resources, assist: false, reducedMotion: false, lowQuality, lab: false,
      renderOffscreen: () => {}, onFrameError: error => { throw error; } }), THREE);
  mounted.objects.forEach(object => scene.add(object));
  const callbacks = bridge.callbacks.splice(0).filter(callback => !callback.toString().includes('mirror.render'));
  const updateScene = () => { runtime.current = controller.runtime; callbacks.forEach(callback => callback({}, 0)); scene.updateMatrixWorld(true); };
  const advanceFrames = count => {
    for (let frame = 0; frame < count; frame++) {
      RC.advanceController(controller, 1 / 60, camera);
      runtime.current = controller.runtime;
      callbacks.forEach(callback => callback({}, 1 / 60));
    }
  };
  context.snapshot = () => RC.controllerSnapshot(controller);
  const hud = await native.mount(FirstPersonScreen, { chapterId: stageId,
    settings: { ...Defaults.DEFAULT_SETTINGS, haptics: false }, controls: { ...Defaults.DEFAULT_FIRST_PERSON_CONTROLS, quality },
    onboarding: { schemaVersion: 1, tutorialCompleted: true, controlChoiceAcknowledged: true },
    preferredColor: 'neutral', onSettingsChange() {}, onControlsChange() {}, onCheckpoint() {},
    onComplete() {}, onRestart() {}, onExit() {} });
  const records = [];
  const capture = async (name, expectedLabel, expectedDisabled = false, kind = 'navigation') => {
    const id = `${name}-${quality}-${width}`;
    await hud.update(); updateScene();
    const tree = hud.serialize(), button = action(tree);
    if (expectedLabel && (!button || button.disabled !== expectedDisabled || button.label !== expectedLabel))
      throw Error(`${id}: expected ${expectedLabel} disabled=${expectedDisabled}, got ${button?.label} disabled=${button?.disabled}`);
    const file = `${id}-scene.json`;
    fs.writeFileSync(path.join(out, file), JSON.stringify(scene.toJSON()));
    records.push({ id, stageId, file, width, height, fontScale, quality, kind, requiresReflection: mirror && name.includes('winch'), tree, target: RC.controllerSnapshot(controller).target?.id,
      pose: controller.runtime.pose, action: button?.label ?? null });
  };
  try {
    if (gallery) {
      await capture('gallery-entry', '非常口を確認', true);
      controller.runtime.pose = GALLERY_SHADOW_OBSERVATION_POSE;
      if (!isSafePose(controller.runtime.pose, RC.worldForController(controller))) throw Error('Shadow fixture pose is unsafe');
      aim(controller, camera, GALLERY_SHADOW_FIXTURE.center, 'shadow-panel');
      await capture('gallery-shadow-ready', '装置を操作');
      await hud.pressTestID('interact');
      if (controller.runtime.gallery?.mode !== 'shadow') throw Error('Actual shadow control did not open');
      await capture('gallery-shadow-operating', undefined, false, 'device');
    } else if (vault) {
      if (RC.controllerSnapshot(controller).target?.id !== 'vault-length')
        throw Error('Fresh vault controller did not target the length clasp');
      await capture('vault-entry', '留め金を調整');
      aim(controller, camera, VAULT_LENGTH_FIXTURE.center, 'vault-length');
      await capture('vault-length-ready', '留め金を調整');
      await hud.pressTestID('interact');
      if (controller.runtime.vault?.mode !== 'length') throw Error('Actual length control did not open');
      await capture('vault-length-operating', undefined, false, 'device');
    } else if (theatre) {
      await capture('theatre-entry');
      aim(controller, camera, THEATRE_LIGHT_FIXTURE.center, 'theatre-light');
      await capture('theatre-light-ready', '灯りを動かす');
      await hud.pressTestID('interact');
      if (controller.runtime.theatre?.mode !== 'light') throw Error('Actual light control did not open');
      await capture('theatre-light-operating', undefined, false, 'device');
    } else if (mirror) {
      controller.runtime.pose = MIRROR_SPAWN;
      RC.syncCamera(controller, camera);
      await capture('mirror-entry');
      controller.runtime.pose = WINCH_SAFE;
      aim(controller, camera, WINCH_CENTER, 'mirror-corridor-winch');
      await capture('mirror-winch-ready', '巻き上げレバーを保持する');
      await hud.pressTestID('interact');
      if (controller.runtime.stageSession?.value?.holding !== 'winch') throw Error('HUD hold was not accepted');
      await capture('mirror-winch-holding', '保持中。もう一度押すと放す');
    } else {
      await capture('departure-key-ready', '隔離キーを差す');
      await hud.pressTestID('interact');
      if (!controller.runtime.stageSession?.value?.keyInstalled) throw Error('HUD key was not installed');
      advanceFrames(12);
      await capture('departure-key-installed', '隔離キーは接続済み', true);
      aim(controller, camera, CONTROL_TARGETS.power, 'departure-stop');
      await capture('departure-stop-locked', '停止盤：収容と隔離が先', true);
      aim(controller, camera, CONTROL_TARGETS.procedure, 'departure-procedure');
      await capture('departure-procedure-ready', '収容手順を読む');
      await hud.pressTestID('interact');
      if (!controller.runtime.stageSession?.value?.procedureRead) throw Error('HUD procedure was not read');
      aim(controller, camera, CONTROL_TARGETS.bell, 'departure-bell');
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
    // Three 0.185.1 lazily uploads one module-owned DFG_LUT for PBR materials.
    // Measure its owner separately before any game scene, then demand that
    // every scene release returns to exactly this baseline.
    const warmScene=new THREE.Scene(),warmCamera=new THREE.PerspectiveCamera(65,1,.1,10),warmGeometry=new THREE.BoxGeometry(),warmMaterial=new THREE.MeshStandardMaterial();
    warmCamera.position.z=3;warmScene.add(new THREE.Mesh(warmGeometry,warmMaterial),new THREE.AmbientLight());renderer.render(warmScene,warmCamera);
    warmGeometry.dispose();warmMaterial.dispose();warmScene.clear();
    const warmBaseline={...renderer.info.memory},sceneDisposals=[];let current=null;
    if(warmBaseline.geometries!==0||warmBaseline.textures!==1)throw Error('Unexpected Three PBR warm baseline '+JSON.stringify(warmBaseline));
    function dispose(){if(!current)return;const {scene,mirror}=current,gs=new Set(),ms=new Set(),ts=new Set();
      scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}if(o.isInstancedMesh)o.dispose();});
      mirror?.dispose();gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();
      const released={id:current.id,...renderer.info.memory};sceneDisposals.push(released);current=null;
      if(released.geometries!==warmBaseline.geometries||released.textures!==warmBaseline.textures)throw Error('Scene resources retained '+JSON.stringify(released));}
    window.draw=async record=>{dispose();renderer.setSize(record.width,record.height);
      const scene=await new THREE.ObjectLoader().parseAsync(await(await fetch(record.file)).json());
      const camera=scene.children.find(o=>o.isPerspectiveCamera),surface=scene.getObjectByName('planar-mirror');
      if(!camera)throw Error('QA scene camera missing');let mirror=null,reflected=false,offscreenCalls=0,offscreenTriangles=0;
      if(surface){mirror=createPlanarMirror();surface.material.dispose();surface.material=mirror.material;
        const f=new THREE.Frustum(),pv=new THREE.Matrix4();scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
        surface.updateWorldMatrix(true,false);f.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        if(f.intersectsObject(surface)){reflected=mirror.render(renderer,scene,camera,surface,(r,s,c)=>r.render(s,c));
          offscreenCalls=reflected?renderer.info.render.calls:0;offscreenTriangles=reflected?renderer.info.render.triangles:0;}}
      root.replaceChildren(hudDOM(record.tree,record.fontScale,renderer.domElement));scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      renderer.render(scene,camera);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      current={scene,mirror,id:record.id};const hud=auditNavigationHUD(root);
      // A button rectangle alone cannot establish that wrapped text fits it.
      // Measure browser glyph ranges as well; these are not native text metrics.
      const buttonText=[...root.querySelectorAll('[role="button"]')].map(button=>{
        const bounds=hudRect(button),ranges=[...button.querySelectorAll('.rn-text')].map(text=>{const range=document.createRange();range.selectNodeContents(text);return hudRect(range);});
        const contains=(outer,inner)=>inner.left>=outer.left-1&&inner.right<=outer.right+1&&inner.top>=outer.top-1&&inner.bottom<=outer.bottom+1;
        return{label:button.dataset.label,bounds,ranges,insideButton:ranges.every(r=>contains(bounds,r)),insideViewport:ranges.every(r=>contains({left:0,top:0,right:record.width,bottom:record.height},r))};});
      return{hud,buttonText,device:record.kind==='device'?auditHUD(root,null):null,glError:renderer.getContext().getError(),reflected,offscreenCalls,offscreenTriangles,mainCalls:renderer.info.render.calls,totalCalls:renderer.info.render.calls+offscreenCalls,triangles:renderer.info.render.triangles,totalTriangles:renderer.info.render.triangles+offscreenTriangles,
        rtSize:reflected?MIRROR_TARGET_SIZE:null,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};};
    window.finish=()=>{dispose();root.replaceChildren();renderer.renderLists.dispose();renderer.dispose();return{
      geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,
      warmBaseline,sceneDisposals,ownedTextures:renderer.info.memory.textures-warmBaseline.textures,
      textureOwner:'Three 0.185.1 module-owned DFG_LUT, 16x16 RG half float, 1024 bytes; retained by the library cache across renderer.dispose, final browser/context closes after report',
      renderers:1,rendererDisposeCalls:1,programsAfterRendererDispose:renderer.info.programs.length};};
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
      results.push({ id: record.id, width: record.width, height: record.height, fontScale: record.fontScale, quality: record.quality, kind: record.kind,
        target: record.target, action: record.action, pose: record.pose,
        image: record.id + '.png', sha256: sha256(image), metrics });
      const a = metrics.hud.action;
      if (record.kind === 'navigation' && (!a || a.left < 0 || a.right > record.width || a.top < 0 || a.bottom > record.height || a.width < 44 || a.height < 44))
        throw Error(record.id + ': action button is clipped or too small');
      if (record.kind === 'device' && (!metrics.device?.buttons.length || !metrics.device.buttonsAtLeast44)) throw Error(record.id + ': device buttons missing or below44');
      if (metrics.glError) throw Error(record.id + ': WebGL error ' + metrics.glError);
      if (!metrics.mainCalls || !metrics.triangles || record.requiresReflection && !metrics.reflected)
        throw Error(record.id + ': scene or mirror pass did not render');
      if (metrics.hud.pauseOverlapsObjective || metrics.hud.contextOverlapsMovement || metrics.hud.contextOverlapsAction)
        throw Error(record.id + ': HUD rectangles overlap');
    }
    const disposed = await browser.evaluate('window.finish()');
    if (disposed.geometries || disposed.ownedTextures || disposed.programsAfterRendererDispose || disposed.sceneDisposals.length !== records.length || browser.errors.length)
      throw Error('WebGL resources or browser error remained: ' + JSON.stringify({ disposed, errors: browser.errors }));
    const textOverflow = results.flatMap(record => record.metrics.buttonText
      .filter(button => !button.insideButton || record.kind === 'navigation' && !button.insideViewport)
      .map(button => ({ id: record.id, ...button })));
    if (textOverflow.length) {
      fs.writeFileSync(path.join(out, 'text-overflow.json'), JSON.stringify(textOverflow, null, 2) + '\n');
      throw Error(`${textOverflow.length} button labels exceeded their bounds; see ${path.join(out, 'text-overflow.json')}`);
    }
    return { results, disposed, errors: browser.errors };
  } finally { await browser.close(); }
}
async function main() {
  const records = [];
  for (const quality of ['standard', 'low'])
    for (const [width, height, fontScale] of sizes)
      for (const stageId of ['perception-gallery-v1', 'uncanny-vault-v1', 'shadow-theatre-v1', 'mirror-corridor-v1', 'departure-control-v1'])
        records.push(...await extract(stageId, width, height, fontScale, quality));
  bridge.verify();
  const rendered = await render(records); bridge.verify();
  const report = { boundary: 'All five actual ChapterScene/FirstPersonScreen/controller integrations, standard and low quality, three paired portrait/font configurations. Initial state and device-ready/operating views share a controller, with 04/05 validated checkpoints and explicit safe camera placement for gallery shadow and mirror entry/winch: these are viewpoint fixtures, not a natural route. Actual HUD presses enter the 01/02/03 devices and perform 04 hold/05 key/procedure actions. The live mirror target is recreated from planarMirror.ts after serialization. Native Canvas readiness/audio/build metadata are fixtures; browser SwiftShader/CSS is not EXGL/Yoga, native touch, iPhone readability or performance acceptance.',
    sizes, toolHash: sha256(fs.readFileSync(__filename)),
    sourceHashes: Object.fromEntries(bridge.hashes), ...rendered };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ cases: rendered.results.length, disposed: rendered.disposed, out }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
