#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Actual area-04/05 controller and FirstPersonScreen hosts. The Canvas is a
// placeholder and React Native host styles are translated to browser CSS;
// this is a HUD check, not native Yoga, EXGL, touch delivery, or scene QA.
const fs = require('node:fs'), path = require('node:path');
const { installSourceBridge, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
if (process.argv.length !== 2) throw Error('usage: node scripts/qa-stage-hud.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal013/stage-hud');
fs.mkdirSync(out, { recursive: true });
const bridge = installSourceBridge(root);
const context = { width: 390, height: 844, fontScale: 1, bindController: false };
const native = installNativeHudBridge(context);
const THREE = require('three');
const RC = require('../src/rendering/firstPerson/runtimeController.ts');
const Defaults = require('../src/types/application.ts');
const { stageModule } = require('../src/domain/stageKit/modules.ts');
const { parseStageCheckpoint } = require('../src/domain/stages/mirror-corridor-v1/checkpoint.ts');
const { WINCH_SAFE, WINCH_CENTER } = require('../src/domain/stages/mirror-corridor-v1/definition.ts');
const { carriedKeyEntry } = require('../src/domain/stages/departure-control-v1/session.ts');
context.bindController = true;
const { FirstPersonScreen } = require('../src/screens/FirstPersonScreen.tsx');

function checkpointFor(stageId) {
  const module = stageModule(stageId), fresh = module.checkpoint(module.create());
  if (stageId === 'mirror-corridor-v1') {
    const data = parseStageCheckpoint(fresh.stageData);
    if (!data) throw Error('Fresh mirror checkpoint invalid');
    const restored = module.restore({ ...fresh, stageData: { ...data, keyTaken: true, practiced: true,
      ratchets: 0, pose: WINCH_SAFE } });
    if (!restored) throw Error('Mirror winch checkpoint rejected by module codec');
    return restored.checkpoint;
  }
  const restored = module.restore({ ...fresh, stageData: carriedKeyEntry() });
  if (!restored) throw Error('Departure carried-key checkpoint rejected by module codec');
  return restored.checkpoint;
}

function aim(controller, camera, point, expected) {
  const p = controller.runtime.pose.position, dx = point.x - p.x, dz = point.z - p.z;
  RC.commandController(controller, { type: 'turn',
    yaw: Math.atan2(-dx, -dz) - controller.runtime.pose.yaw,
    pitch: Math.atan2(point.y - p.y, Math.hypot(dx, dz)) - controller.runtime.pose.pitch });
  RC.syncCamera(controller, camera);
  const actual = RC.controllerSnapshot(controller).target?.id;
  if (actual !== expected) throw Error(`Expected ${expected}; aimed at ${actual ?? 'nothing'}`);
}

function button(tree, testID) {
  if (Array.isArray(tree)) return tree.map(node => button(node, testID)).find(Boolean);
  if (!tree || typeof tree === 'string') return undefined;
  if (tree.type === 'Pressable' && tree.testID === testID) return tree;
  return tree.children.map(node => button(node, testID)).find(Boolean);
}

async function main() {
  const records = [];
  for (const [width, height, fontScale] of [[320, 568, 2], [390, 844, 1.5], [430, 932, 1]]) {
    Object.assign(context, { width, height, fontScale });
    for (const stageId of ['mirror-corridor-v1', 'departure-control-v1']) {
      const controller = RC.createController(checkpointFor(stageId), false, true, stageId);
      context.controller = controller;
      controller.viewport = { width, height };
      Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
        paused: false, open: false, sceneMode: 'chapter' });
      const camera = new THREE.PerspectiveCamera(65, width / height, .08, 60);
      const mirror = stageId === 'mirror-corridor-v1';
      aim(controller, camera, mirror ? WINCH_CENTER : { x: -4.75, y: 1.4, z: 9 },
        mirror ? 'mirror-corridor-winch' : 'departure-key');
      context.snapshot = () => RC.controllerSnapshot(controller);
      const hud = await native.mount(FirstPersonScreen, { chapterId: stageId,
        settings: { ...Defaults.DEFAULT_SETTINGS, haptics: false },
        controls: Defaults.DEFAULT_FIRST_PERSON_CONTROLS,
        onboarding: { schemaVersion: 1, tutorialCompleted: true, controlChoiceAcknowledged: true },
        preferredColor: 'neutral', onSettingsChange() {}, onControlsChange() {}, onCheckpoint() {},
        onComplete() {}, onRestart() {}, onExit() {} });
      try {
        const capture = (state, expectedLabel) => {
          const tree = hud.serialize(), action = button(tree, 'interact');
          if (!action || action.disabled || action.label !== expectedLabel)
            throw Error(`${stageId}/${state}: HUD action ${action?.label} disabled=${action?.disabled}; expected ${expectedLabel}`);
          records.push({ id: `${mirror ? 'mirror' : 'departure'}-${state}-${width}`, stageId,
            width, height, fontScale, state, target: RC.controllerSnapshot(controller).target?.id,
            label: action.label, tree });
        };
        await hud.update();
        if (mirror) {
          capture('winch-ready', '巻き上げレバーを保持する');
          await hud.pressTestID('interact'); await hud.update();
          if (controller.runtime.stageSession?.value?.holding !== 'winch')
            throw Error('Real Screen hold button did not start the winch');
          capture('winch-holding', '保持中。もう一度押すと放す');
          await hud.pressTestID('interact'); await hud.update();
          if (controller.runtime.stageSession?.value?.holding !== null)
            throw Error('Real Screen hold button did not release the winch');
        } else {
          capture('key-ready', '隔離キーを差す');
          await hud.pressTestID('interact'); await hud.update();
          if (!controller.runtime.stageSession?.value?.keyInstalled)
            throw Error('Real Screen key button did not install the key');
          aim(controller, camera, { x: -4.75, y: 1.4, z: 10 }, 'departure-procedure');
          await hud.update();
          if (button(hud.serialize(), 'interact')?.label !== '点検手順を読む')
            throw Error('Procedure action missing after key installation');
          await hud.pressTestID('interact'); await hud.update();
          if (!controller.runtime.stageSession?.value?.procedureRead)
            throw Error('Real Screen procedure button did not read the instruction');
          aim(controller, camera, { x: -4.75, y: 1.4, z: 11 }, 'departure-bell');
          await hud.update();
          capture('bell-ready', '収容区画の呼び鈴を鳴らす');
          await hud.pressTestID('interact'); await hud.update();
          if (!(controller.runtime.stageSession?.value?.bellCooldown > 0))
            throw Error('Real Screen bell button did not ring the containment receiver');
        }
      } finally { await hud.unmount(); RC.retireController(controller); }
    }
  }
  bridge.verify();
  fs.writeFileSync(path.join(out, 'raw-hosts.json'), JSON.stringify(records));
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${browserStyles}</style><div id="qa-root"></div><script>
  ${browserHelpers}
  const root=document.getElementById('qa-root');root.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column';
  window.renderHUD=async record=>{root.replaceChildren(hudDOM(record.tree,record.fontScale,document.createElement('div')));await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const rect=id=>{const e=root.querySelector('[data-testid="'+id+'"]');return e?hudRect(e):null;};const buttons=[...root.querySelectorAll('[role="button"]')].map(e=>({label:e.dataset.label,disabled:e.dataset.disabled==='true',...hudRect(e)}));return{objective:rect('current-objective'),pause:rect('pause-control'),reticle:rect('first-person-reticle'),action:rect('interact'),context:rect('target-context'),movement:rect('movement-stick'),buttons};};
  </script>`);
  const browser = await openBrowser(out), reports = [];
  try {
    for (const record of records) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: record.width, height: record.height,
        deviceScaleFactor: 1, mobile: false });
      const metrics = await browser.evaluate('window.renderHUD(' + JSON.stringify(record) + ')');
      const file = record.id + '.png';
      const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const bytes = Buffer.from(shot.data, 'base64'); fs.writeFileSync(path.join(out, file), bytes);
      const a = metrics.action, p = metrics.pause, o = metrics.objective;
      const overlap = (x, y) => !!x && !!y && x.left < y.right && x.right > y.left && x.top < y.bottom && x.bottom > y.top;
      reports.push({ ...record, tree: undefined, file, sha256: sha256(bytes),
        actionVisible: !!a && a.left >= 0 && a.right <= record.width && a.top >= 0 && a.bottom <= record.height,
        actionAtLeast44: !!a && a.width >= 44 && a.height >= 44,
        pauseOverlapsObjective: overlap(p, o), actionOverlapsObjective: overlap(a, o),
        contextOverlapsMovement: overlap(metrics.context, metrics.movement),
        metrics });
    }
    if (browser.errors.length) throw Error('Browser errors: ' + JSON.stringify(browser.errors));
  } finally { await browser.close(); }
  bridge.verify();
  const failures = reports.filter(r => !r.actionVisible || !r.actionAtLeast44 || r.pauseOverlapsObjective ||
    r.actionOverlapsObjective || r.contextOverlapsMovement || r.metrics.context);
  const report = { boundary: 'Actual FirstPersonScreen/controller and validated area checkpoints; Canvas placeholder and browser CSS host translation, not native Yoga/EXGL/gesture or visible scene',
    toolHash: sha256(fs.readFileSync(__filename)), sourceHashes: Object.fromEntries(bridge.hashes), reports, failures: failures.map(r => r.id) };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ cases: reports.length, failures: report.failures, out }));
  if (failures.length) process.exitCode = 1;
}
main().catch(error => { console.error(error); process.exitCode = 1; });
