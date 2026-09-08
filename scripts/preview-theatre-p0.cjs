#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Static P0 camera fixtures; actual controller, Scene, and Screen components.
// Raw scene/HUD extraction remains in .expo. No native delivery/FPS claim.
const fs = require('node:fs'), path = require('node:path');
const { installSourceBridge, mountThree, openBrowser, sha256, delay } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
const workspace = path.resolve(__dirname, '..');
const arg = name => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
const label = arg('--label') ?? 'current';
const source = path.resolve(arg('--source') ?? (label === 'baseline' ? '/tmp/chroma-rift-goal010-baseline-04e481e' : workspace));
if (!/^[a-z0-9-]+$/.test(label)) throw Error('Invalid QA label');
const output = path.join(workspace, '.expo/goal010/acquisition', label);
fs.mkdirSync(output, { recursive: true });
const bridge = installSourceBridge(source), context = { width: 390, height: 844, fontScale: 1, bindController: false };
const hudBridge = installNativeHudBridge(context), React = require('react'), THREE = require('three');
const load = file => require(path.join(source, file));
const RC = load('src/rendering/firstPerson/runtimeController.ts');
const VC = load('src/rendering/firstPerson/vaultController.ts');
const D = load('src/domain/vault/definition.ts'), Specs = load('src/domain/vault/specs.ts');
const { VaultScene } = load('src/rendering/firstPerson/VaultScene.tsx');
const { createSceneResources } = load('src/rendering/firstPerson/resources.ts');
const Defaults = load('src/types/application.ts');
context.bindController = true;
const { FirstPersonScreen } = load('src/screens/FirstPersonScreen.tsx');
const writeJSON = (file, value) => fs.writeFileSync(path.join(output, file), JSON.stringify(value) + '\n');
const compactCue = c => ({ kind: c?.kind, reason: c?.reason, target: c?.target?.id, actionLabel: c?.actionLabel });
function fixturePose(puzzle, variant) {
  // These literal positions are identical across baseline/current sources.
  const f = puzzle === 'length' ? { x: -1.15, y: 1.7, z: 3.9 } : { x: -8.78, y: 1.7, z: 18.5 };
  const normal = puzzle === 'length' ? { x: 0, z: -1 } : { x: 1, z: 0 };
  const distance = variant === 'near' ? 1.8 : variant === 'far' ? 5.4 : variant === 'comfortable' ? 3.8 : puzzle === 'length' ? 4.6 : 4.18;
  const position = { x: f.x + normal.x * distance, y: 1.6, z: f.z + normal.z * distance };
  const yaw = Math.atan2(position.x - f.x, position.z - f.z) + (variant === 'left-edge' ? -.24 : variant === 'right-edge' ? .24 : 0);
  const pitch = Math.atan2(f.y - position.y, distance) + (variant === 'top-hud' ? -.28 : variant === 'bottom-hud' ? .28 : 0);
  return { position, yaw, pitch };
}
function newController(puzzle, pose) {
  const c = RC.createController(undefined, false, true, D.VAULT_CHAPTER_ID);
  Object.assign(c.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true, paused: false, open: false, sceneMode: 'chapter' });
  c.runtime = { ...c.runtime, pose };
  if (puzzle === 'rod') {
    c.runtime.progress.vault.length = { length: Specs.LENGTH_SPEC.targetLength, solved: true, attempts: 1 };
    c.runtime.progress.vault.discoveries.length = true;
    c.runtime.vault.length = Specs.LENGTH_SPEC.targetLength; c.runtime.vault.lengthGateOpen = 1;
    c.runtime.vault.checkpointId = 'brake';
  }
  return c;
}
async function extract() {
  const records = [];
  for (const puzzle of ['length', 'rod']) {
    const seed = newController(puzzle, fixturePose(puzzle, 'front')), runtime = { current: seed.runtime };
    const resources = createSceneResources(false, null, true, true), scene = new THREE.Scene();
    scene.background = new THREE.Color('#111c19');
    const mounts = await mountThree(React.createElement(VaultScene, { world: RC.worldForController(seed), runtime, resources, reducedMotion: false, onFrameError: error => { throw error; } }), THREE);
    for (const object of mounts.objects) scene.add(object);
    const callbacks = bridge.callbacks.splice(0);
    for (const callback of callbacks) callback({}, 0);
    scene.updateMatrixWorld(true); writeJSON(puzzle + '-scene.json', scene.toJSON());
    for (const [width, height, fontScale] of [[320, 568, 2], [390, 844, 1.5], [430, 932, 1]]) {
      for (const variant of ['front', 'comfortable', 'near', 'far', 'left-edge', 'right-edge', 'top-hud', 'bottom-hud']) {
        Object.assign(context, { width, height, fontScale });
        const pose = fixturePose(puzzle, variant), controller = newController(puzzle, pose);
        context.controller = controller; controller.viewport = { width, height };
        const camera = new THREE.PerspectiveCamera(65, width / height, .08, 60); RC.syncCamera(controller, camera);
        context.snapshot = () => RC.controllerSnapshot(controller);
        const props = { chapterId: D.VAULT_CHAPTER_ID, settings: { ...Defaults.DEFAULT_SETTINGS, haptics: false }, controls: Defaults.DEFAULT_FIRST_PERSON_CONTROLS,
          onboarding: { schemaVersion: 1, tutorialCompleted: true, controlChoiceAcknowledged: true }, preferredColor: 'neutral',
          onSettingsChange() {}, onControlsChange() {}, onCheckpoint() {}, onComplete() {}, onRestart() {}, onExit() {} };
        const hud = await hudBridge.mount(FirstPersonScreen, props);
        // Hooks may synchronize the same camera/viewport. Re-publish authoritative fixture matrices.
        RC.syncCamera(controller, camera); await hud.update();
        const snapshot = RC.controllerSnapshot(controller), buttons = hud.tree.root.findAll(n => n.type === 'Pressable' && n.props.testID === 'interact');
        if (buttons.length !== 1) throw Error('Expected one actual interaction button');
        const button = { label: buttons[0].props.accessibilityLabel, disabled: !!buttons[0].props.disabled };
        const panel = VC.vaultDeviceScreenBounds(controller, puzzle), panelAccepted = !!VC.vaultPanelTarget(controller, puzzle);
        const acquisition = VC.vaultDeviceAcquisition?.(controller, puzzle);
        const reasonShown = !acquisition || hud.tree.root.findAll(n => n.type === 'Text').some(n => n.children.join('') === acquisition.message);
        const before = hud.serialize(), cameraBefore = JSON.stringify(controller.runtime.pose);
        // Disabled native buttons do not deliver onPress. Only exercise enabled real Screen handlers.
        if (!button.disabled) await hud.pressTestID('interact');
        const entered = controller.runtime.vault.mode === puzzle;
        const id = puzzle + '-' + variant + '-' + width;
        const record = { id, puzzle, variant, width, height, fontScale, pose, camera: camera.toJSON(),
          cue: compactCue(snapshot.cue), target: snapshot.target?.id ?? null, button, panel, panelAccepted, acquisition, reasonShown, entered,
          enabledButRejected: !button.disabled && !entered, cameraUnchanged: cameraBefore === JSON.stringify(controller.runtime.pose),
          feedback: controller.feedbackMessage, before, after: hud.serialize() };
        records.push(record); await hud.unmount();
      }
    }
    await mounts.unmount(); resources.dispose();
  }
  bridge.verify(); writeJSON('raw-views.json', records);
  writeJSON('source-hashes.json', Object.fromEntries(bridge.hashes));
  return records;
}
function viewer() {
  for (const file of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(workspace, 'node_modules/three/build', file), path.join(output, file));
  fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${browserStyles}#screen{position:absolute;inset:0;display:flex;flex-direction:column}</style><div id="screen"></div><script type="module">
import * as THREE from './three.module.js';${browserHelpers}
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
const root=document.getElementById('screen');const records=await(await fetch('./raw-views.json')).json();let scene,puzzle;
function dispose(){if(!scene)return;const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}if(o.isInstancedMesh)o.dispose();});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();renderer.renderLists.dispose();}
window.draw=async(id,after=false)=>{const r=records.find(v=>v.id===id);if(puzzle!==r.puzzle){dispose();scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./'+r.puzzle+'-scene.json')).json());puzzle=r.puzzle;}const camera=new THREE.ObjectLoader().parse(r.camera);renderer.setSize(r.width,r.height);scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);root.replaceChildren(hudDOM(after?r.after:r.before,r.fontScale,renderer.domElement));renderer.render(scene,camera);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const audit=auditHUD(root,r.panel);return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,hud:audit};};
window.finish=()=>{dispose();root.replaceChildren();return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderers:1};};window.ready=true;
</script>`);
}
async function capture(records) {
  viewer(); const browser = await openBrowser(output), reports = [];
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) await delay(100);
    for (const r of records) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: r.width, height: r.height, deviceScaleFactor: 1, mobile: false });
      const stats = await browser.evaluate('window.draw(' + JSON.stringify(r.id) + ')');
      const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = r.id + '.png'; fs.writeFileSync(path.join(output, file), Buffer.from(shot.data, 'base64'));
      const { camera: _camera, before: _before, after: _after, ...compact } = r;
      void _camera; void _before; void _after;
      const h = stats.hud; // Keep only aggregate decisions and relevant rectangles, never per-frame raw dumps.
      reports.push({ ...compact, image: file, sha256: sha256(fs.readFileSync(path.join(output, file))), drawCalls: stats.calls, triangles: stats.triangles,
        ui: { buttonsAtLeast44: h.buttonsAtLeast44, pauseOverlapsObjective: h.pauseOverlapsObjective, objective: h.objective, pause: h.pause,
          action: h.buttons.find(b => b.label === r.button.label), objectiveOverlapsPanel: !!r.panel && !!h.objective && h.objective.left < r.panel.right && h.objective.right > r.panel.left && h.objective.top < r.panel.bottom && h.objective.bottom > r.panel.top } });
    }
    const disposed = await browser.evaluate('window.finish()');
    writeJSON('report.json', { label, source, toolHash: sha256(fs.readFileSync(__filename)), cases: reports.length,
      boundary: 'Fixed authored QA poses, not a travelled route. Real controller/Scene/Screen. Ready and native Canvas are stubbed. Single Chromium ANGLE SwiftShader WebGL renderer; RN host styles translated to CSS, not Yoga, real finger input, device perception or performance.',
      rawDataPolicy: 'Raw scenes/host trees stay in .expo. Durable reports must select compact summaries/images only.',
      enabledButRejected: reports.filter(r => r.enabledButRejected).map(r => r.id), allCameraUnchanged: reports.every(r => r.cameraUnchanged),
      maxCalls: Math.max(...reports.map(r => r.drawCalls)), maxTriangles: Math.max(...reports.map(r => r.triangles)), disposed, errors: browser.errors, reports });
    if (disposed.geometries || disposed.textures || browser.errors.length) throw Error('WebGL resource/error gate failed');
  } finally { await browser.close(); }
}
async function main() {
  const records = process.argv.includes('--capture-only') ? JSON.parse(fs.readFileSync(path.join(output, 'raw-views.json'))) : await extract();
  if (!process.argv.includes('--extract-only')) await capture(records);
  bridge.verify();
  console.log(JSON.stringify({ label, cases: records.length, enabledButRejected: records.filter(r => r.enabledButRejected).length, output }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
