#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Continuous area-05 controller/world/StageScene path with browser WebGL video.
// The native Canvas, HUD, audio and chapter-01→04 handoff are outside this QA.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const recovery = process.argv.includes('--recovery');
if (process.argv.slice(2).some(argument => argument !== '--recovery')) throw Error('usage: node scripts/qa-departure-natural.cjs [--recovery]');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal013', recovery ? 'departure-recovery' : 'departure-natural');
fs.mkdirSync(out, { recursive: true });
const bridge = installSourceBridge(root), React = require('react'), THREE = require('three');
const RC = require('../src/rendering/firstPerson/runtimeController.ts');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const { StageScene } = require('../src/domain/stages/departure-control-v1/scene.tsx');
const { stageModule } = require('../src/domain/stageKit/modules.ts');
const { carriedKeyEntry, isStageSession } = require('../src/domain/stages/departure-control-v1/session.ts');
const { actorFullyContained, doorSweepClear, BELL_RECEIVER } = require('../src/domain/stages/departure-control-v1/definition.ts');
const { ACTOR_MODEL_BOUNDS } = require('../src/domain/actorMotion/envelope.ts');
const observationTarget = { ...BELL_RECEIVER, y: 1.6 };

function timingSummary(samples) {
  if (!samples.length) throw Error('No CPU timing samples');
  const sorted = [...samples].sort((a, b) => a - b);
  const at = fraction => Number(sorted[Math.floor((sorted.length - 1) * fraction)].toFixed(3));
  return { samples: sorted.length, p50Ms: at(.5), p95Ms: at(.95), maxMs: at(1) };
}

async function extract() {
  const module = stageModule('departure-control-v1');
  const fresh = module.checkpoint(module.create());
  const carried = module.restore({ ...fresh, stageData: carriedKeyEntry() })?.checkpoint;
  if (!carried) throw Error('Valid carried-key entry missing');
  const controller = RC.createController(carried, false, true, 'departure-control-v1');
  Object.assign(controller.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true,
    sceneMode: 'chapter', paused: false, open: false });
  const camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
  RC.syncCamera(controller, camera);
  if (RC.controllerSnapshot(controller).target?.id !== 'departure-key')
    throw Error('Carried-key entry does not face the first required key panel');
  const runtime = { current: controller.runtime }, resources = createSceneResources(false, null, true);
  const mounted = await mountThree(React.createElement(StageScene, { world: RC.worldForController(controller),
    runtime, resources, onFrameError: error => { throw error; } }), THREE);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#09090C'); scene.add(camera);
  mounted.objects.forEach(object => scene.add(object));
  const receiverMesh = scene.getObjectByName('containment-bell-receiver');
  if (!receiverMesh) throw Error('Containment bell receiver is missing from the scene');
  if (!scene.getObjectByName('outdoor-sky') || !scene.getObjectByName('distant-courtyard-ground') ||
    scene.getObjectByName('departure-outdoor'))
    throw Error('Outdoor exit must show the courtyard rather than a floating interaction marker');
  const installedKey = scene.getObjectByName('installed-key');
  if (!installedKey) throw Error('Area 05 has no physical isolation key');
  let minimumReceiverBottom = Infinity;
  const callbacks = bridge.callbacks.splice(0), frames = [], events = [];
  const simulationCpuMs = [];
  const state = () => { const value = controller.runtime.stageSession?.value;
    if (!isStageSession(value)) throw Error('Departure session lost'); return value; };
  const tick = () => {
    const started = performance.now();
    RC.advanceController(controller, 1 / 60, camera);
    runtime.current = controller.runtime;
    callbacks.forEach(callback => callback({}, 1 / 60));
    scene.updateMatrixWorld(true);
    simulationCpuMs.push(performance.now() - started);
    if (events.length === 0 || tick.count % 6 === 0) capture();
    tick.count += 1;
  }; tick.count = 0;
  const capture = () => {
    scene.updateMatrixWorld(true);
    const receiverBottom = receiverMesh.position.y - receiverMesh.scale.y / 2;
    minimumReceiverBottom = Math.min(minimumReceiverBottom, receiverBottom);
    if (receiverBottom <= ACTOR_MODEL_BOUNDS.height)
      throw Error(`Bell receiver obscures the actor body envelope: ${receiverBottom}`);
    const objects = [];
    scene.traverse(object => objects.push({ uuid: object.uuid, matrix: object.matrix.toArray(), visible: object.visible }));
    frames.push({ objects, event: events.at(-1)?.label ?? '退館制御室',
      actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
  };
  const turn = (yaw, pitch = 0) => {
    RC.commandController(controller, { type: 'turn', yaw: yaw - controller.runtime.pose.yaw,
      pitch: pitch - controller.runtime.pose.pitch });
    RC.syncCamera(controller, camera); runtime.current = controller.runtime;
    callbacks.forEach(callback => callback({}, 0)); capture();
  };
  const walkTo = z => {
    turn(Math.PI);
    let n = 0;
    while (Math.abs(controller.runtime.pose.position.z - z) > .07 && n < 500) {
      controller.input.forward = controller.runtime.pose.position.z < z ? 1 : -1;
      tick(); n += 1;
    }
    controller.input.forward = 0;
    if (n === 500) throw Error(`Collision route blocked before z=${z}`);
  };
  const press = (id, label, yaw = Math.PI / 2, pitch = -.16) => {
    turn(yaw, pitch);
    if (RC.controllerSnapshot(controller).target?.id !== id || !RC.interactController(controller, id))
      throw Error(`Equipment ray/command rejected: ${id} ${controller.feedbackMessage}`);
    events.push({ at: tick.count / 60, id, label, feedback: controller.feedbackMessage,
      actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
    runtime.current = controller.runtime;
    callbacks.forEach(callback => callback({}, 0)); capture();
  };
  const lookAt = target => {
    const player = controller.runtime.pose.position;
    turn(Math.atan2(-(target.x - player.x), -(target.z - player.z)),
      Math.atan2((target.y ?? 1.6) - player.y, Math.hypot(target.x - player.x, target.z - player.z)));
  };
  const lookAtActor = () => lookAt(state().actor.motion.position);
  callbacks.forEach(callback => callback({}, 0)); scene.updateMatrixWorld(true);
  if (installedKey.visible) throw Error('Isolation key appeared in the socket before installation');
  fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify(scene.toJSON())); capture();
  walkTo(9); press('departure-key', '隔離キーを差す');
  if (!installedKey.visible || installedKey.position.x <= -4.7) throw Error('Accepted key installation has no visible insertion travel');
  for (let i = 0; i < 12; i += 1) tick();
  if (!installedKey.visible || Math.abs(installedKey.position.x + 4.66) > 1e-6 ||
    !scene.getObjectByName('departure-key')?.visible)
    throw Error('Installed key did not remain seated in the control panel');
  events.push({ at: tick.count / 60, id: 'key-seated', label: '隔離キーが制御盤に収まる',
    actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
  capture();
  walkTo(10); press('departure-procedure', '点検手順を読む');
  if (recovery) {
    walkTo(12); turn(Math.PI / 2, -.16);
    if (RC.controllerSnapshot(controller).target?.id !== 'departure-door' ||
      RC.interactController(controller, 'departure-door') || state().doorProgress !== 0)
      throw Error('Early closure was not safely refused');
    events.push({ at: tick.count / 60, id: 'early-door-refused', label: '全身収容前の閉扉は拒否',
      feedback: controller.feedbackMessage, actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
    capture();
  }
  walkTo(11); press('departure-bell', '収容区画の呼び鈴');
  lookAt(observationTarget);
  const awaitContainment = label => {
    let wait = 0;
    while (!(actorFullyContained(state().actor.motion.position) && doorSweepClear(state().actor.motion.position)) && wait < 780) {
      tick(); wait += 1;
    }
    if (wait === 780) throw Error(`Actor never entered the physical containment space: ${JSON.stringify({phase:state().actor.phase,position:state().actor.motion.position})}`);
    events.push({ at: tick.count / 60, id: 'observe-containment', label,
      actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
  };
  awaitContainment('観察窓で巡回体の全身を確認');
  lookAtActor(); for (let i = 0; i < 30; i += 1) tick();
  walkTo(12); press('departure-door', '全身収容後に隔離扉を閉じる');
  if (recovery) {
    tick();
    if (state().doorProgress <= 0) throw Error('Closing door did not start moving');
    press('departure-reopen', '閉鎖途中の扉を手動で開け直す');
    if (state().doorMode !== 'opening') throw Error('Manual reopening did not begin');
    lookAt(observationTarget);
    for (let frame = 0; frame < 90 && state().doorProgress > 0; frame += 1) tick();
    if (state().doorProgress !== 0 || state().isolated) throw Error('Reopened door did not reach a safe state');
    events.push({ at: tick.count / 60, id: 'door-reopened', label: '開け直した扉から巡回体が戻るのを待つ',
      actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
    capture();
    walkTo(11);
    lookAt(observationTarget);
    let leftContainment = 0;
    while ((actorFullyContained(state().actor.motion.position) || state().actor.motion.position.z >= 14.5) && leftContainment < 1800) {
      tick(); leftContainment += 1;
    }
    if (leftContainment === 1800) throw Error('Actor did not return to the outer corridor after reopening');
    events.push({ at: tick.count / 60, id: 'actor-left-containment', label: '開け直した区画から外側通路へ戻る',
      actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
    capture();
    for (let frame = 0; frame < 390 && state().bellCooldown > 0; frame += 1) tick();
    if (state().bellCooldown > 0) throw Error('Bell did not cool down');
    const beforeBellPhase = state().actor.phase;
    if (beforeBellPhase === 'investigate') throw Error('Actor was still investigating the first bell');
    press('departure-bell', 'もう一度、収容区画へ誘導する');
    lookAt(observationTarget);
    tick();
    if (state().actor.phase !== 'investigate') throw Error(`Second bell did not start a new investigation from ${beforeBellPhase}`);
    events.push({ at: tick.count / 60, id: 'actor-reinvestigates', label: '二度目の鈴へ巡回体が反応',
      beforePhase: beforeBellPhase, actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
    capture();
    awaitContainment('再誘導した巡回体の全身を確認');
    lookAtActor(); for (let i = 0; i < 20; i += 1) tick();
    walkTo(12); press('departure-door', '開け直した隔離扉を閉じる');
  }
  events.push({ at: tick.count / 60, id: 'watch-latch', label: '観察窓から隔離扉の閉鎖を確認',
    actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
  lookAtActor();
  for (let i = 0; i < 90; i += 1) tick();
  if (!state().isolated) throw Error('Door latch did not finish');
  walkTo(13); press('departure-stop', '閉館制御を停止');
  events.push({ at: tick.count / 60, id: 'watch-stopped', label: '停止した巡回体を観察',
    actor: { ...state().actor.motion.position }, pose: { ...controller.runtime.pose.position } });
  lookAtActor(); for (let i = 0; i < 30; i += 1) tick();
  press('departure-staff-door', '職員出口を開ける', Math.PI, -.07);
  walkTo(22.45); press('departure-outdoor', '屋外へ出る', Math.PI, -.07);
  if (!controller.runtime.progress.cleared || !state().stopped) throw Error('Natural outdoor route did not complete');
  fs.writeFileSync(path.join(out, 'animation.json'), JSON.stringify({ frames }));
  await mounted.unmount(); resources.dispose(); bridge.verify();
  return { mode: recovery ? 'recovery' : 'natural', frames: frames.length, simulationSeconds: tick.count / 60, events,
    simulationCpu: timingSummary(simulationCpuMs),
    visualClearance: { minimumReceiverBottom, actorBodyHeight: ACTOR_MODEL_BOUNDS.height },
    final: { pose: controller.runtime.pose, cleared: controller.runtime.progress.cleared, actor: state().actor },
    sourceHashes: Object.fromEntries(bridge.hashes) };
}

async function render(report) {
  for (const file of ['three.module.js', 'three.core.js'])
    fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(out, file));
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#09090c;color:#f4f4f6;font:18px sans-serif}canvas{display:block}
    #caption{position:absolute;left:20px;right:20px;bottom:40px;padding:12px;background:#09090cbb;border:1px solid #87938b}
    </style><div id="caption"></div><script type="module">
    import * as THREE from './three.module.js';
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
    renderer.setPixelRatio(1);renderer.setSize(390,844);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.NoToneMapping;document.body.prepend(renderer.domElement);
    const data=await(await fetch('./animation.json')).json(),scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./scene.json')).json());
    const objects=new Map();scene.traverse(o=>objects.set(o.uuid,o));
    const camera=[...objects.values()].find(o=>o.isPerspectiveCamera);
    window.draw=async i=>{const frame=data.frames[i];for(const v of frame.objects){const o=objects.get(v.uuid);o.matrix.fromArray(v.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=v.visible;}
      scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
      const cpuStarted=performance.now();renderer.render(scene,camera);
      const cpuSubmitMs=performance.now()-cpuStarted;
      document.getElementById('caption').textContent=frame.event;
      await new Promise(resolve=>requestAnimationFrame(resolve));
      return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,cpuSubmitMs,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};};
    window.finish=()=>{const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}});
      gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();renderer.renderLists.dispose();
      return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderers:1};};window.ready=true;
    </script>`);
  const browser = await openBrowser(out), directory = path.join(out, 'frames'); fs.mkdirSync(directory, { recursive: true });
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844,
      deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i += 1) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors)); await delay(100);
    }
    let maxCalls = 0, maxTriangles = 0;
    const renderCpuMs = [];
    for (let i = 0; i < report.frames; i += 1) {
      const result = await browser.evaluate(`window.draw(${i})`);
      renderCpuMs.push(result.cpuSubmitMs);
      maxCalls = Math.max(maxCalls, result.calls); maxTriangles = Math.max(maxTriangles, result.triangles);
      const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(directory, String(i).padStart(5, '0') + '.png'), Buffer.from(screenshot.data, 'base64'));
    }
    const disposed = await browser.evaluate('window.finish()');
    const metrics = { maxCalls, maxTriangles, cpuRenderSubmit: timingSummary(renderCpuMs),
      cpuTimingScope: 'SwiftShader browser JS renderer.render call; excludes screenshot/readback, RAF wait, native presentation and GPU completion',
      disposed, errors: browser.errors };
    fs.writeFileSync(path.join(out, 'webgl.json'), JSON.stringify(metrics, null, 2) + '\n');
    if (disposed.geometries || disposed.textures || browser.errors.length) throw Error('WebGL disposal/error gate failed');
  } finally { await browser.close(); }
  const file = path.join(out, recovery ? 'departure-recovery.mp4' : 'departure-natural.mp4');
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', '10',
    '-i', path.join(directory, '%05d.png'), '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', file]);
  report.video = { file, bytes: fs.statSync(file).size, sha256: sha256(fs.readFileSync(file)), fps: 10,
    durationSeconds: report.frames / 10 };
}

async function main() {
  const report = await extract();
  await render(report);
  report.boundary = `Actual area-05 controller, world collision, commands, StageScene and body animation; isolated memory entry carries a validated key. ${recovery ? 'Early closure refusal, manual reopening, second bell and final outdoor exit.' : 'First bell and final outdoor exit.'} Browser Software WebGL with QA caption, no native HUD/audio/Canvas or first four areas.`;
  report.toolHash = sha256(fs.readFileSync(__filename));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ frames: report.frames, duration: report.simulationSeconds, video: report.video }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
