#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Real continuous controller input, actual mounted Scene and Screen hosts.
// Native ready/audio/presentation are explicit QA boundaries, not device tests.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { installSourceBridge, mountThree, openBrowser, sha256, delay } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
const root = path.resolve(__dirname, '..'), stage = path.join(root, '.expo/goal009/vault-chapter'), output = path.join(root, 'docs/qa-goal009/chapter');
const bridge = installSourceBridge(root), context = { width: 390, height: 844, fontScale: 1, bindController: false };
for (const filename of [__filename, path.join(__dirname, 'lib/three-scene-qa.cjs'), path.join(__dirname, 'lib/native-hud-qa.cjs')]) bridge.hashes.set(path.relative(root, filename), sha256(fs.readFileSync(filename)));
const hudBridge = installNativeHudBridge(context), React = require('react'), THREE = require('three');
const RC = require('../src/rendering/firstPerson/runtimeController.ts');
const VC = require('../src/rendering/firstPerson/vaultController.ts');
const Projection = require('../src/rendering/firstPerson/manipulationProjection.ts');
const FP = require('../src/domain/firstPerson/index.ts');
const Motion = require('../src/domain/actorMotion/index.ts');
const D = require('../src/domain/vault/definition.ts'), Specs = require('../src/domain/vault/specs.ts');
const { VaultScene } = require('../src/rendering/firstPerson/VaultScene.tsx');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const Defaults = require('../src/types/application.ts');
context.bindController = true;
const { FirstPersonScreen } = require('../src/screens/FirstPersonScreen.tsx');
const { FirstPersonResultScreen } = require('../src/screens/FirstPersonResultScreen.tsx');
const R = require('react-test-renderer');
const writeJSON = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
const fps = 30, dt = 1 / 60;
const wrap = angle => Math.atan2(Math.sin(angle), Math.cos(angle));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// Screen notices use elapsed timers. Advance those timers with the authored
// simulation rather than letting fast offline extraction prolong subtitles.
const nativeTimers = { set: globalThis.setTimeout, clear: globalThis.clearTimeout };
const uiTimers = new Map(); let uiTime = 0, timerSequence = 0, simulatedTimers = true;
globalThis.setTimeout = (callback, milliseconds, ...args) => {
  if (!simulatedTimers || !(milliseconds >= 1)) return nativeTimers.set(callback, milliseconds, ...args);
  const timer = { qaTimer: ++timerSequence }; uiTimers.set(timer, { due: uiTime + milliseconds, callback, args }); return timer;
};
globalThis.clearTimeout = timer => { if (!uiTimers.delete(timer)) nativeTimers.clear(timer); };
async function advanceUITimers(milliseconds) {
  uiTime += milliseconds;
  const due = [...uiTimers].filter(([, timer]) => timer.due <= uiTime);
  if (due.length) await R.act(async () => { for (const [key, timer] of due) { uiTimers.delete(key); timer.callback(...timer.args); } });
}

async function session(id, width = 390, height = 844, fontScale = 1) {
  Object.assign(context, { width, height, fontScale });
  const controller = RC.createController(undefined, false, true, D.VAULT_CHAPTER_ID);
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true, paused: false, open: false });
  controller.viewport = { width, height }; context.controller = controller;
  const camera = new THREE.PerspectiveCamera(65, width / height, .08, 60); camera.name = 'actual-controller-camera'; RC.syncCamera(controller, camera);
  context.snapshot = () => RC.controllerSnapshot(controller);
  const resources = createSceneResources(false, null, true, true), runtime = { current: controller.runtime }, scene = new THREE.Scene();
  scene.background = new THREE.Color('#111c19'); scene.add(camera);
  const mounts = await mountThree(React.createElement(VaultScene, { world: RC.worldForController(controller), runtime, resources, reducedMotion: false, onFrameError: error => { throw error; } }), THREE);
  for (const object of mounts.objects) scene.add(object);
  const callbacks = bridge.callbacks.splice(0), objects = []; scene.traverse(object => objects.push(object));
  let completion = null, completionCount = 0, resultTree = null;
  const props = { chapterId: D.VAULT_CHAPTER_ID, settings: { ...Defaults.DEFAULT_SETTINGS, haptics: false }, controls: Defaults.DEFAULT_FIRST_PERSON_CONTROLS,
    onboarding: { schemaVersion: 1, tutorialCompleted: true, controlChoiceAcknowledged: true }, preferredColor: 'neutral',
    onSettingsChange() {}, onControlsChange() {}, onCheckpoint() {}, onComplete(summary) { completion = summary; completionCount++; }, onRestart() {}, onExit() {} };
  const hud = await hudBridge.mount(FirstPersonScreen, props);
  const directory = path.join(stage, id); fs.mkdirSync(directory, { recursive: true });
  const frames = [], updates = [], hudTrees = [], hudLookup = new Map(), previous = new Map(), events = [], snapshots = [], phases = new Set(), contacts = [];
  const summary = { minY: Infinity, maxY: -Infinity, maxRadius: 0, maxStanceCornerSlip: 0, maxPlayerFrameDistance: 0, penetrationVertices: 0, penetrationSolids: {} };
  let ticks = 0, segment = 'entry', previousPhase = null;
  function inspect() {
    const actor = controller.runtime.vault.actor, meshRoot = scene.getObjectByName('vault-exhibit-actor');
    const world = RC.worldForController(controller), solids = world.solids.filter(solid => solid.id !== 'vault-actor-body' && solid.max.y > .001 && solid.min.y < 2.3);
    const vertex = new THREE.Vector3(); let minY = Infinity, maxY = -Infinity, radius = 0, penetrations = 0;
    meshRoot.traverse(mesh => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      for (let index = 0; index < position.count; index++) {
        vertex.fromBufferAttribute(position, index).applyMatrix4(mesh.matrixWorld);
        minY = Math.min(minY, vertex.y); maxY = Math.max(maxY, vertex.y); radius = Math.max(radius, Math.hypot(vertex.x - actor.motion.position.x, vertex.z - actor.motion.position.z));
        for (const solid of solids) if (vertex.x > solid.min.x + 1e-5 && vertex.x < solid.max.x - 1e-5 && vertex.y > solid.min.y + 1e-5 && vertex.y < solid.max.y - 1e-5 && vertex.z > solid.min.z + 1e-5 && vertex.z < solid.max.z - 1e-5) {
          penetrations++; summary.penetrationSolids[solid.id] = (summary.penetrationSolids[solid.id] ?? 0) + 1;
        }
      }
    });
    let slip = 0;
    actor.motion.feet.forEach((foot, index) => {
      const mesh = meshRoot.getObjectByName('actor-planted-foot-' + (index ? 1 : -1));
      const corners = [-.5, .5].flatMap(x => [-.5, .5].map(z => new THREE.Vector3(x, -.5, z).applyMatrix4(mesh.matrixWorld).toArray()));
      const prior = contacts[index];
      if (foot.stance && prior?.stance && same(foot.anchor, prior.anchor)) for (let i = 0; i < 4; i++) slip = Math.max(slip, Math.hypot(...corners[i].map((n, axis) => n - prior.corners[i][axis])));
      contacts[index] = { stance: foot.stance, anchor: foot.anchor, corners };
    });
    summary.minY = Math.min(summary.minY, minY); summary.maxY = Math.max(summary.maxY, maxY); summary.maxRadius = Math.max(summary.maxRadius, radius);
    summary.maxStanceCornerSlip = Math.max(summary.maxStanceCornerSlip, slip); summary.penetrationVertices += penetrations;
    return { minY, maxY, radius, stanceCornerSlip: slip, penetrationVertices: penetrations };
  }
  async function record() {
    runtime.current = controller.runtime;
    for (const callback of callbacks) callback({ scene, camera }, 1 / fps);
    scene.updateMatrixWorld(true); await hud.update();
    if (completion && !resultTree) await R.act(async () => { resultTree = R.create(React.createElement(FirstPersonResultScreen, { summary: completion, onReplay() {}, onHome() {}, onNotes() {} })); });
    const tree = resultTree ? require('./lib/native-hud-qa.cjs').hostTree(resultTree.root) : hud.serialize();
    const text = JSON.stringify(tree), hash = sha256(text); let hudIndex = hudLookup.get(hash);
    if (hudIndex === undefined) { hudIndex = hudTrees.length; hudTrees.push(tree); hudLookup.set(hash, hudIndex); }
    const changed = [];
    for (const object of objects) {
      const value = { matrix: object.matrix.toArray(), visible: object.visible, material: object.material?.uuid };
      if (!same(previous.get(object.uuid), value)) { changed.push([object.uuid, value]); previous.set(object.uuid, value); }
    }
    updates.push(changed);
    if (!frames.length) writeJSON(path.join(directory, 'scene.json'), scene.toJSON());
    const actor = controller.runtime.vault.actor, eye = Motion.actorMotionEye(actor.motion), audit = inspect();
    const frame = { frame: frames.length, time: ticks / 60, segment, pose: controller.runtime.pose, camera: camera.matrix.toArray(), actor,
      occluded: FP.segmentOccluded(eye.position, controller.runtime.pose.position, RC.worldForController(controller)),
      progress: controller.runtime.progress.vault, mode: controller.runtime.vault.mode, length: controller.runtime.vault.length, angle: controller.runtime.vault.angle,
      drag: controller.runtime.vault.activeDrag, noiseSequence: controller.runtime.vault.noiseSequence,
      exitClosureSeconds: controller.runtime.vault.exitClosureSeconds, finalDoorMinY: RC.worldForController(controller).solids.find(s => s.id === 'vault-final-door').min.y,
      hud: hudIndex, panel: VC.vaultDeviceScreenBounds(controller) ?? null, result: !!resultTree, audit };
    frames.push(frame); phases.add(actor.phase);
    if (previousPhase !== actor.phase) { events.push({ time: frame.time, phase: actor.phase, position: actor.motion.position, lastSeen: actor.lastSeen, lastHeard: actor.lastHeard }); previousPhase = actor.phase; }
  }
  async function tick() {
    const before = controller.runtime.pose.position;
    RC.advanceController(controller, dt, camera); ticks++; await advanceUITimers(1000 / 60);
    const after = controller.runtime.pose.position;
    summary.maxPlayerFrameDistance = Math.max(summary.maxPlayerFrameDistance, Math.hypot(after.x - before.x, after.z - before.z));
    if (Math.hypot(after.x - before.x, after.z - before.z) > FP.MOVE_SPEED / 60 + .002) throw new Error('Controller caught/teleported in ' + id + '/' + segment + ': ' + JSON.stringify({ before, after }));
    // Native presentation is outside this extractor. Queues are logged then
    // consumed to prevent accumulation; this does not claim sound playback.
    if (controller.pendingActorPlants.length || controller.pendingActorEvents.length) events.push({ time: ticks / 60, plants: controller.pendingActorPlants, signals: controller.pendingActorEvents });
    RC.flushControllerAudioFrame(controller);
    if (ticks % 2 === 0) await record();
  }
  async function wait(seconds, label = segment) {
    segment = label; controller.input.forward = 0; controller.input.right = 0;
    for (let i = 0; i < Math.round(seconds * 60); i++) await tick();
  }
  function turnToward(target, amount = Infinity) {
    const pose = controller.runtime.pose, dx = target.x - pose.position.x, dz = target.z - pose.position.z;
    const yaw = wrap(Math.atan2(-dx, -dz) - pose.yaw), pitch = Math.atan2(target.y - pose.position.y, Math.hypot(dx, dz)) - pose.pitch;
    RC.commandController(controller, { type: 'turn', yaw: clamp(yaw, -amount, amount), pitch: clamp(pitch, -amount, amount) }); RC.syncCamera(controller, camera);
    return Math.abs(yaw) + Math.abs(pitch);
  }
  async function look(target, label) {
    segment = label; controller.input.forward = 0; controller.input.right = 0;
    for (let i = 0; i < 240; i++) { const remaining = turnToward(target, Math.PI * dt); await tick(); if (remaining < .003) return; }
  }
  async function walk(x, z, label) {
    segment = label;
    for (let i = 0; i < 1800; i++) {
      const p = controller.runtime.pose.position, dx = x - p.x, dz = z - p.z, distance = Math.hypot(dx, dz);
      if (distance < .02) { controller.input.forward = 0; controller.input.right = 0; return; }
      const gaze = label === 'first-grille-open' || label.endsWith('-occlusion-route') && z < 8
        ? Motion.actorMotionEye(controller.runtime.vault.actor.motion).position : { x, y: p.y, z };
      turnToward(gaze, Math.PI * dt);
      const yaw = controller.runtime.pose.yaw, magnitude = Math.min(1, distance / (FP.MOVE_SPEED * dt));
      // User-authored simultaneous movement/look keeps the continuous world
      // route while limiting QA camera turns to 180 degrees/s.
      controller.input.forward = -(dx * Math.sin(yaw) + dz * Math.cos(yaw)) / distance * magnitude;
      controller.input.right = (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / distance * magnitude;
      await tick();
    }
    throw new Error('Blocked route at ' + JSON.stringify(controller.runtime.pose.position) + ' toward ' + x + ',' + z);
  }
  async function press(label) { await hud.press(label); await hud.update(); }
  async function drag(puzzle, value, label) {
    segment = label;
    const target = RC.worldForController(controller).interactables.find(t => t.id === 'vault-' + puzzle);
    const start = puzzle === 'length' ? controller.runtime.vault.length : controller.runtime.vault.angle;
    const point = value => {
      const local = puzzle === 'length' ? { x: Specs.LENGTH_SPEC.left + value, y: Specs.LENGTH_SPEC.sliderY } : { x: Math.sin(value) * Specs.ROD_SPEC.length / 2, y: Math.cos(value) * Specs.ROD_SPEC.length / 2 };
      const w = Projection.fixturePointInWorld(target, local), p = new THREE.Vector3(w.x, w.y, w.z).project(camera), bounds = VC.vaultDeviceScreenBounds(controller);
      return { identifier: 17, locationX: (p.x + 1) * width / 2 - bounds.left, locationY: (1 - p.y) * height / 2 - bounds.top, pageX: (p.x + 1) * width / 2, pageY: (1 - p.y) * height / 2 };
    };
    const event = p => ({ touches: [p], changedTouches: [p], targetTouches: [p] });
    await hud.touch('vault-device-touch', 'Start', event(point(start)));
    if (!controller.runtime.vault.activeDrag) throw new Error('Actual touch did not acquire handle');
    for (let i = 1; i <= 72; i++) { await hud.touch('vault-device-touch', 'Move', event(point(start + (value - start) * i / 72))); await tick(); }
    if (controller.runtime.progress.vault[puzzle].solved) throw new Error('Drag auto-solved');
    snapshots.push({ name: label, frame: frames.length - 1 });
    const end = point(value); await hud.touch('vault-device-touch', 'End', { touches: [], changedTouches: [end], targetTouches: [] });
    if (controller.runtime.progress.vault[puzzle].solved) throw new Error('Release auto-solved');
    await wait(.6, label + '-released'); snapshots.push({ name: label + '-released', frame: frames.length - 1 });
  }
  async function solve(puzzle) {
    const f = puzzle === 'length' ? D.VAULT_LENGTH_FIXTURE : D.VAULT_ROD_FIXTURE;
    await look(f.center, puzzle + '-look'); await press(puzzle === 'length' ? '留め金を調整' : '針を調整');
    if (controller.runtime.vault.mode !== puzzle) throw new Error('Device mode refused: ' + puzzle);
    await wait(.6, puzzle + '-baseline'); snapshots.push({ name: puzzle + '-baseline', frame: frames.length - 1 });
    fs.mkdirSync(path.join(stage, 'fixtures'), { recursive: true }); writeJSON(path.join(stage, 'fixtures', puzzle + '.json'), controller.runtime);
    await press('補助'); await press(puzzle === 'length' ? '端の飾りを畳む' : '枠を消す');
    await wait(.6, puzzle + '-context-off'); snapshots.push({ name: puzzle + '-context-off', frame: frames.length - 1 });
    await press(puzzle === 'length' ? '測定ガイド' : '下げ振り');
    await wait(.6, puzzle + '-guide-on'); snapshots.push({ name: puzzle + '-guide-on', frame: frames.length - 1 });
    await press(puzzle === 'length' ? '端の飾りを戻す' : '枠を戻す'); await press('補助を閉じる');
    await drag(puzzle, puzzle === 'length' ? 1.02 : .3, puzzle + '-wrong-drag');
    await press(puzzle === 'length' ? '固定する' : 'ロックする');
    if (controller.runtime.progress.vault[puzzle].solved) throw new Error('Wrong answer solved');
    await wait(.7, puzzle + '-wrong-committed'); snapshots.push({ name: puzzle + '-wrong-committed', frame: frames.length - 1 });
    await drag(puzzle, puzzle === 'length' ? Specs.LENGTH_SPEC.targetLength : 0, puzzle + '-correct-drag');
    await press(puzzle === 'length' ? '固定する' : 'ロックする');
    if (!controller.runtime.progress.vault[puzzle].solved) throw new Error('Correct commit not solved');
    await wait(1, puzzle + '-correct-committed'); snapshots.push({ name: puzzle + '-correct-committed', frame: frames.length - 1 });
    await press('探索へ戻る'); await wait(.4, puzzle + '-leave');
  }
  async function finish() {
    const report = { id, width, height, fontScale, fps, duration: frames.length / fps, frameCount: frames.length,
      boundary: 'Actual continuous controller, shared player collision/AI/world, real Scene useFrame callbacks and Screen handlers. Native ready and audio backend stubbed; actual WebGL occurs during playback. HUD uses browser CSS, not Yoga. Result component receives actual Screen completion callback; App navigation/storage are outside this capture.',
      sceneMounts: 1, screenMounts: 1, callbacks: callbacks.length, timerClock: 'Actual Screen setTimeout callbacks advanced with 60 Hz simulation; no native wall-clock or frame-rate claim', phases: [...phases], summary, completionCount, snapshots, events, frames };
    writeJSON(path.join(directory, 'timeline.json'), report);
    fs.writeFileSync(path.join(directory, 'animation.json'), JSON.stringify({ width, height, fontScale, fps, camera: camera.uuid, updates, hudTrees, frames: frames.map(f => ({ time: f.time, hud: f.hud, panel: f.panel, phase: f.actor.phase, segment: f.segment })) }));
    await hud.unmount(); if (resultTree) await R.act(async () => resultTree.unmount()); await mounts.unmount(); resources.dispose();
    report.pendingUITimersAfterUnmount = uiTimers.size;
    if (uiTimers.size) throw new Error('HUD timer retained after unmount');
    writeJSON(path.join(directory, 'timeline.json'), report);
    return report;
  }
  return { id, controller, camera, scene, hud, wait, walk, look, press, solve, tick, record, finish, setSegment(value) { segment = value; }, snapshots, frames };
}

async function route(lane) {
  const run = await session(lane), c = run.controller;
  await run.record(); await run.wait(.6, 'entry'); await run.solve('length');
  for (const [x, z] of [[.65, 2.9], [.65, 4.5], [0, 6.5]]) await run.walk(x, z, 'first-grille-open');
  const points = lane !== 'east' ? [[-2.2, 7.2], [-2.2, 11.5], [-2.2, 15.5], [-3.1, 18.5]] : [[4.2, 6.5], [4.2, 9], [2.3, 9], [2.3, 11.5], [2.3, 17.8], [0, 18.5], [-3.1, 18.5]];
  for (const [x, z] of points) await run.walk(x, z, lane + '-occlusion-route');
  await run.walk(-4.6, 18.5, 'physical-brake-grille');
  if (lane === 'search') {
    await run.look({ x: -3.1, y: 1.4, z: 18.5 }, 'look-back-through-grille');
    for (let frame = 0; frame < 1800 && c.runtime.vault.actor.phase !== 'return'; frame++) { run.setSegment('last-seen-search-and-return'); await run.tick(); }
    if (c.runtime.vault.actor.phase !== 'return') throw new Error('Expected actual search -> return');
    await run.wait(2, 'return'); run.snapshots.push({ name: 'return', frame: run.frames.length - 1 });
    return run.finish();
  }
  await run.solve('rod'); await run.wait(1, 'brake-open');
  for (const [x, z] of [[-3.1, 18.5], [0, 18.5], [3, 18.5], [3, 21], [3, 24.3]]) await run.walk(x, z, 'final-pursuit-and-partition');
  await run.look(D.VAULT_PARTITION_FIXTURE.center, 'look-at-partition-handle');
  const target = RC.controllerSnapshot(c).target;
  if (target?.id !== 'vault-partition') throw new Error('Partition not visible as actual target');
  await run.hud.pressTestID('interact'); await run.wait(.6, 'close-partition');
  await run.walk(3, 29, 'enter-exit-safe-room');
  if (RC.interactController(c, 'vault-exit')) throw new Error('Invisible exit unexpectedly closed');
  await run.look(D.VAULT_EXIT_FIXTURE.center, 'look-at-final-door-handle'); await run.wait(.6);
  run.snapshots.push({ name: 'final-door-before-close', frame: run.frames.length - 1 });
  const exit = RC.controllerSnapshot(c).target;
  if (exit?.id !== 'vault-exit') throw new Error('Exit not actual visible target');
  await run.hud.pressTestID('interact'); await run.wait(2.2, 'visible-door-close-impact-result');
  if (!c.runtime.progress.cleared) throw new Error('Route did not clear');
  return run.finish();
}

async function layouts() {
  const reports = [];
  for (const [width, height, scale] of [[320, 568, 1], [320, 568, 2], [390, 844, 1.5], [390, 844, 2], [430, 932, 1], [430, 932, 2]]) for (const puzzle of ['length', 'rod']) {
    const run = await session('layout-' + puzzle + '-' + width + '-font' + scale, width, height, scale);
    run.controller.runtime = JSON.parse(fs.readFileSync(path.join(stage, 'fixtures', puzzle + '.json')));
    RC.syncCamera(run.controller, run.camera); await run.record();
    run.snapshots.push({ name: 'baseline', frame: 0 });
    await run.press('補助'); await run.record(); run.snapshots.push({ name: 'expanded', frame: 1 });
    reports.push(await run.finish());
  }
  return reports;
}
async function peek() {
  const run = await session('entry-peek'); await run.record();
  await run.walk(-.3, 3, 'walk-to-closed-grille');
  const eye = Motion.actorMotionEye(run.controller.runtime.vault.actor.motion).position;
  await run.look(eye, 'look-through-physical-grille'); await run.wait(1, 'face-partial-occlusion');
  run.snapshots.push({ name: 'head-through-grille', frame: run.frames.length - 1 });
  return run.finish();
}
async function dodge() {
  const run = await session('windup-dodge'), c = run.controller;
  // Isolated authoritative-controller fixture, not an earned checkpoint or
  // a teleport during the clip. All later player/actor movement is simulation.
  const saved = { ...c.runtime.progress.vault, length: { length: Specs.LENGTH_SPEC.targetLength, attempts: 1, solved: true }, discoveries: { ...c.runtime.progress.vault.discoveries, length: true }, story: { ...c.runtime.progress.vault.story, revealStarted: true, revealPresented: true } };
  c.runtime = { ...c.runtime, pose: { position: { x: 2.3, y: 1.6, z: 19.2 }, yaw: 0, pitch: 0 }, progress: { ...c.runtime.progress, vault: saved },
    vault: { ...c.runtime.vault, length: Specs.LENGTH_SPEC.targetLength, lengthGateOpen: 1, actor: { ...c.runtime.vault.actor, phase: 'pursue', startupGrace: 0, contactCooldown: 0, revealTime: 1.4,
      motion: Motion.createActorMotion({ x: 2.3, y: 0, z: 18 }, Math.PI), lastSeen: { x: 2.3, y: 1.6, z: 19.2 } } } };
  RC.syncCamera(c, run.camera); await run.record();
  for (let frame = 0; frame < 300 && c.runtime.vault.actor.phase !== 'attack'; frame++) { run.setSegment('visible-windup-await-commit'); await run.tick(); }
  if (c.runtime.vault.actor.phase !== 'attack') throw new Error('Dodge fixture did not reach attack');
  const committed = c.runtime.vault.actor.attackTarget;
  c.input.right = 1;
  for (let frame = 0; frame < 30; frame++) { run.setSegment('lateral-input-after-attack-commit'); await run.tick(); }
  c.input.right = 0; await run.look(Motion.actorMotionEye(c.runtime.vault.actor.motion).position, 'look-back-at-recover'); await run.wait(.25, 'recover-after-dodge');
  if (!run.frames.some(f => f.actor.phase === 'recover')) throw new Error('No recover after dodge');
  run.snapshots.push({ name: 'recover', frame: run.frames.length - 1 });
  const report = await run.finish(); report.initialFixture = 'actor(2.3,0,18), yaw pi, pursue; player(2.3,1.6,19.2), yaw0; length gate previously solved. Not full chapter travel.'; report.committedAttackTarget = committed;
  writeJSON(path.join(stage, report.id, 'timeline.json'), report); return report;
}

function viewer() {
  for (const file of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(stage, file));
  fs.writeFileSync(path.join(stage, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${browserStyles}#screen{position:absolute;inset:0;display:flex;flex-direction:column}</style><div id="screen"></div><script type="module">
import * as THREE from './three.module.js';${browserHelpers}
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
const root=document.getElementById('screen');let scene,camera,data,objects,materials,applied=-1,hudIndex=-1;
window.loadChapter=async id=>{data=await(await fetch('./'+id+'/animation.json')).json();scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./'+id+'/scene.json')).json());objects=new Map();materials=new Map();scene.traverse(o=>{objects.set(o.uuid,o);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.set(m.uuid,m);});camera=objects.get(data.camera);renderer.setSize(data.width,data.height);applied=-1;hudIndex=-1;return{width:data.width,height:data.height,frames:data.frames.length};};
window.renderChapterFrame=(frame,scrollBottom=false)=>{if(frame<applied)throw Error('Sequential frame order required');for(let f=applied+1;f<=frame;f++)for(const [uuid,value]of data.updates[f]){const o=objects.get(uuid);o.matrix.fromArray(value.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=value.visible;if(value.material&&materials.has(value.material))o.material=materials.get(value.material);}applied=frame;scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);renderer.render(scene,camera);const record=data.frames[frame];if(hudIndex!==record.hud){root.replaceChildren(hudDOM(data.hudTrees[record.hud],data.fontScale,renderer.domElement));hudIndex=record.hud;}const scroll=root.querySelector('[data-testid="vault-device-scroll"]');if(scroll)scroll.scrollTop=scrollBottom?scroll.scrollHeight:0;return{frame,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,hud:auditHUD(root,record.panel)};};
window.disposeChapter=()=>{const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}if(o.isInstancedMesh)o.dispose();});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();root.replaceChildren();renderer.renderLists.dispose();return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,rendererCount:1};};window.chapterReady=true;
</script>`);
}
async function capture(reports) {
  viewer(); const browser = await openBrowser(stage), all = [];
  try {
    let ready = false; for (let i = 0; i < 200 && !ready; i++) { ready = await browser.evaluate('window.chapterReady===true'); if (!ready) await delay(100); }
    if (!ready) throw new Error('Browser startup failed');
    for (const report of reports) {
      const directory = path.join(stage, report.id, 'frames'); fs.mkdirSync(directory, { recursive: true });
      await browser.send('Emulation.setDeviceMetricsOverride', { width: report.width, height: report.height, deviceScaleFactor: 1, mobile: false });
      await browser.evaluate('window.loadChapter(' + JSON.stringify(report.id) + ')');
      const stats = [], quick = process.argv.includes('--quick');
      const selected = quick ? [...new Set([0, ...report.snapshots.map(s => s.frame), ...report.frames.filter((_, i) => i % 150 === 0).map(f => f.frame), report.frameCount - 1])].sort((a, b) => a - b) : Array.from({ length: report.frameCount }, (_, i) => i);
      for (const frame of selected) {
        stats.push(await browser.evaluate('window.renderChapterFrame(' + frame + ')'));
        const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const bytes = Buffer.from(screenshot.data, 'base64'); fs.writeFileSync(path.join(directory, String(frame).padStart(6, '0') + '.png'), bytes);
        for (const shot of report.snapshots.filter(s => s.frame === frame)) {
          fs.writeFileSync(path.join(output, report.id + '-' + shot.name + '.png'), bytes);
          if (report.id.startsWith('layout-')) {
            const bottom = await browser.evaluate('window.renderChapterFrame(' + frame + ',true)'); stats.push({ ...bottom, scrollPosition: 'bottom' });
            const bottomShot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
            fs.writeFileSync(path.join(output, report.id + '-' + shot.name + '-bottom.png'), Buffer.from(bottomShot.data, 'base64'));
          }
        }
        if (frame % 300 === 0) console.log('WebGL ' + report.id + ' ' + frame + '/' + report.frameCount);
      }
      const disposed = await browser.evaluate('window.disposeChapter()');
      if (!quick && !report.id.startsWith('layout-')) {
        const file = path.join(output, report.id + '.mp4');
        cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(fps), '-i', path.join(directory, '%06d.png'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['ignore', 'inherit', 'inherit'] });
        const probe = JSON.parse(cp.execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
        writeJSON(path.join(output, report.id + '-video.json'), { sha256: sha256(fs.readFileSync(file)), probe });
      }
      all.push({ id: report.id, maxCalls: Math.max(...stats.map(s => s.calls)), maxTriangles: Math.max(...stats.map(s => s.triangles)), disposed, stats });
      fs.copyFileSync(path.join(stage, report.id, 'timeline.json'), path.join(output, report.id + '-timeline.json'));
    }
    writeJSON(path.join(output, 'webgl.json'), { renderer: 'Chromium ANGLE SwiftShader WebGL; one renderer across sequences', errors: browser.errors, reports: all });
    if (all.some(r => r.maxCalls > 150 || r.maxTriangles > 100000 || r.disposed.geometries || r.disposed.textures) || browser.errors.length) throw new Error('WebGL budget/disposal/error gate failed');
  } finally { await browser.close(); }
}
async function main() {
  fs.mkdirSync(stage, { recursive: true }); fs.mkdirSync(output, { recursive: true });
  const reports = [];
  for (const lane of process.argv.includes('--west-only') ? ['west'] : ['west', 'east', 'search']) {
    const report = await route(lane); reports.push(report); console.log(JSON.stringify({ id: report.id, frames: report.frameCount, phases: report.phases, summary: report.summary, completionCount: report.completionCount }));
  }
  if (!process.argv.includes('--west-only')) {
    reports.push(await peek(), await dodge(), ...await layouts());
    for (const r of reports.slice(3)) console.log(JSON.stringify({ id: r.id, frames: r.frameCount, phases: r.phases, summary: r.summary }));
  }
  bridge.verify(); writeJSON(path.join(output, 'source-hashes.json'), Object.fromEntries(bridge.hashes));
  simulatedTimers = false; globalThis.setTimeout = nativeTimers.set; globalThis.clearTimeout = nativeTimers.clear;
  if (!process.argv.includes('--extract-only')) await capture(reports);
  bridge.verify();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
