#!/usr/bin/env node
'use strict';
require('./lib/qa-native-metadata.cjs');
/* global __dirname, __filename, Buffer */
// One real App host route supplies sampled runtime states. Replaying those
// states through ChapterScene gives intervening visual evidence, but does not
// record the App's native Canvas, HUD, audio, or a human's continuous play.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), ts = require('typescript');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
if (process.argv.slice(2).some(arg=>!arg.startsWith('--out='))) throw Error('usage: node scripts/qa-chapter-app-replay.cjs [--out=directory]');
const root = path.resolve(__dirname, '..'), out = path.resolve(process.argv.find(arg=>arg.startsWith('--out='))?.slice(6) || path.join(root, '.expo/goal014/after/app-scene-replay'));
fs.mkdirSync(out, { recursive: true });
const bridge = installSourceBridge(root), React = require('react'), THREE = require('three');
const { actorFullyContained } = require('../src/domain/stages/departure-control-v1/definition.ts');
const { CHAPTER_ONE } = require('../src/domain/campaign/definition.ts');
const { getWorld } = require('../src/domain/firstPerson/chapter.ts');
const { ChapterScene } = require('../src/rendering/firstPerson/ChapterScene.tsx');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const FPS = 5;

function sceneKey(sample) {
  const runtime = sample.runtime, data = runtime.stageSession?.value;
  const staticState = sample.area === 'chapter-1-area-04' && data
    ? { figureInspected: data.figureInspected, keyTaken: data.keyTaken,
      practiced: data.practiced, ratchets: data.ratchets, cleared: data.cleared }
    : sample.area === 'chapter-1-area-05' && data
      ? { keyInstalled: data.keyInstalled, procedureRead: data.procedureRead,
        isolated: data.isolated, stopped: data.stopped, contained: actorFullyContained(data.actor.motion.position),
        staffDoorOpened: data.staffDoorOpened, cleared: data.cleared }
      : null;
  return JSON.stringify({ area: sample.area, progress: runtime.progress, staticState });
}

function validateHost(data, host) {
  const ids = CHAPTER_ONE.areas.map(area => area.id), seen = [...new Set(data.samples.map(sample => sample.area))];
  if (seen.join('|') !== ids.join('|') || host.route?.length !== 5 || !host.final?.campaignCompleted ||
    host.maxActiveCanvasBoundaries !== 1 || host.activeCanvasBoundariesAfterUnmount !== 0)
    throw Error('App route was not a completed single-owner chapter');
  if (data.samples.length < 700 || data.samples.length > 1000 ||
    data.samples.some(sample => sample.stageId !== CHAPTER_ONE.areas.find(area => area.id === sample.area)?.stageId))
    throw Error('Scene replay runtime sampling changed unexpectedly');
  for (let i = 1; i < data.samples.length; i++) {
    const previous = data.samples[i - 1], current = data.samples[i];
    if (previous.area === current.area &&
      (current.tick < previous.tick || current.simulationSeconds < previous.simulationSeconds))
      throw Error('Non-monotonic scene replay runtime samples');
  }
  const stages = [
    ['04-key-taken', 'chapter-1-area-04', value => value.keyTaken],
    ['04-ratchet-1', 'chapter-1-area-04', value => value.ratchets >= 1],
    ['04-ratchet-3', 'chapter-1-area-04', value => value.ratchets === 3],
    ['04-cleared', 'chapter-1-area-04', value => value.cleared],
    ['05-key-installed', 'chapter-1-area-05', value => value.keyInstalled],
    ['05-procedure-read', 'chapter-1-area-05', value => value.procedureRead],
    ['05-isolated', 'chapter-1-area-05', value => value.isolated],
    ['05-stopped', 'chapter-1-area-05', value => value.stopped],
    ['05-outdoor-exited', 'chapter-1-area-05', value => value.cleared],
  ];
  const milestones = stages.map(([id, area, condition]) => {
    const frame = data.samples.findIndex(sample => sample.area === area &&
      condition(sample.runtime.stageSession?.value ?? {}));
    if (frame < 0) throw Error(`App replay milestone missing: ${id}`);
    return { id, frame, tick: data.samples[frame].tick };
  });
  if (milestones.some((item, index) => index > 0 && item.frame <= milestones[index - 1].frame))
    throw Error('App replay final-action order changed');
  return milestones;
}

async function extract() {
  cp.execFileSync(process.execPath, [path.join(root, 'scripts/preview-chapter-reentry.cjs'),
    '--chapter-one', '--scene-replay', '--extract-only', `--out=${out}`],
  { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  const runtimeFile = path.join(out, 'scene-replay-runtimes.json');
  const data = JSON.parse(fs.readFileSync(runtimeFile, 'utf8'));
  const host = JSON.parse(fs.readFileSync(path.join(out, 'report.json'), 'utf8'));
  const motion = JSON.parse(fs.readFileSync(path.join(out, 'motion-trace.json'), 'utf8'));
  if (data.runId !== motion.runId || motion.samples.length !== host.motionTrace.samples)
    throw Error('Scene samples and App motion log came from different routes');
  const milestones = validateHost(data, host);
  const camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
  const frames = [], scenes = [], events = [], previous = new Map();
  let scene, mounted, resources, callbacks, runtimeRef, currentKey;
  const clear = async () => {
    if (mounted) await mounted.unmount();
    resources?.dispose(); mounted = undefined; resources = undefined;
    previous.clear();
  };
  try {
    for (const sample of data.samples) {
      const nextKey = sceneKey(sample), stageId = sample.stageId;
      let rebuilt = false;
      if (nextKey !== currentKey) {
        await clear(); currentKey = nextKey;
        runtimeRef = { current: sample.runtime };
        resources = createSceneResources(false, null, true,
          stageId === 'uncanny-vault-v1', stageId === 'shadow-theatre-v1');
        scene = new THREE.Scene(); scene.background = new THREE.Color('#171a1b'); scene.add(camera);
        mounted = await mountThree(React.createElement(ChapterScene, {
          world: getWorld(sample.runtime), runtime: runtimeRef,
          progress: sample.runtime.progress, resources, assist: false,
          reducedMotion: false, lowQuality: false, lab: false,
          renderOffscreen: () => {}, onFrameError: error => { throw error; },
        }), THREE);
        mounted.objects.forEach(object => scene.add(object));
        callbacks = bridge.callbacks.splice(0).filter(callback => !callback.toString().includes('mirror.render'));
        const file = `scene-${String(scenes.length).padStart(3, '0')}.json`;
        scenes.push({ file, area: sample.area, tick: sample.tick });
        rebuilt = true;
      }
      runtimeRef.current = sample.runtime;
      const pose = sample.runtime.pose;
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
      callbacks.forEach(callback => callback({}, 1 / 60));
      scene.updateMatrixWorld(true);
      const updates = [];
      scene.traverse(object => {
        const value = { matrix: object.matrix.toArray(), visible: object.visible,
          material: !Array.isArray(object.material) ? object.material?.uuid : undefined };
        const encoded = JSON.stringify(value);
        if (previous.get(object.uuid) !== encoded) {
          previous.set(object.uuid, encoded); updates.push([object.uuid, value]);
        }
      });
      frames.push({ scene: scenes.at(-1).file, camera: camera.uuid, updates,
        area: sample.area, tick: sample.tick, seconds: sample.simulationSeconds,
        phase: sample.phase, actor: sample.runtime.gallery?.actor?.phase ??
          sample.runtime.vault?.actor?.phase ?? sample.runtime.theatre?.actor?.phase ??
          sample.runtime.stageSession?.value?.actor?.phase ?? null });
      if (rebuilt) {
        const surface = sample.area === 'chapter-1-area-04' ? scene.getObjectByName('planar-mirror') : null;
        if (sample.area === 'chapter-1-area-04' && !surface) throw Error('App mirror scene has no planar surface');
        const nativeMaterial = surface?.material;
        const transportMaterial = surface ? new THREE.MeshBasicMaterial({ color: '#394A4A' }) : null;
        try {
          if (surface) surface.material = transportMaterial;
          fs.writeFileSync(path.join(out, scenes.at(-1).file), JSON.stringify(scene.toJSON()));
        } finally {
          if (surface) surface.material = nativeMaterial;
          transportMaterial?.dispose();
        }
        events.push({ frame: frames.length - 1, area: sample.area, tick: sample.tick,
          reason: 'static scene state changed' });
      }
    }
  } finally { await clear(); }
  bridge.verify();
  fs.writeFileSync(path.join(out, 'animation.json'), JSON.stringify({ frames }));
  return { host, runtimeFile, frames, scenes, events, milestones };
}

async function capture(frameCount) {
  for (const file of ['three.module.js', 'three.core.js'])
    fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(out, file));
  const mirrorPath = path.join(root, 'src/rendering/firstPerson/planarMirror.ts');
  const transpiled = ts.transpileModule(fs.readFileSync(mirrorPath, 'utf8'), { fileName: mirrorPath,
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  fs.writeFileSync(path.join(out, 'planarMirror.js'), transpiled.replace("from 'three'", "from './three.module.js'"));
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#080a0d}canvas{display:block}#caption{position:absolute;left:8px;right:8px;top:8px;padding:7px 9px;color:#f4f3e9;background:#081015c9;border:1px solid #8999a5;border-radius:5px;font:13px/1.4 sans-serif;white-space:pre-line}</style><div id="caption"></div><script type="module" src="./viewer.js"></script>');
  fs.writeFileSync(path.join(out, 'viewer.js'), `import * as THREE from './three.module.js';
import {createPlanarMirror,MIRROR_TARGET_SIZE} from './planarMirror.js';
const data=await(await fetch('./animation.json')).json();
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(390,844);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;document.body.prepend(renderer.domElement);
const caption=document.getElementById('caption');
let scene,sceneId,objects=new Map(),materials=new Map(),last=-1,mirror,surface,transportMaterial;
const frustum=new THREE.Frustum(),projectionView=new THREE.Matrix4();
function dispose(){if(!scene)return;
 if(mirror){surface.material=transportMaterial;mirror.dispose();mirror=undefined;surface=undefined;transportMaterial=undefined;}
 const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{
 if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){
  ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}});
 gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();
 renderer.renderLists.dispose();scene=null;}
window.draw=async index=>{if(index!==last+1)throw Error('Sequential App replay frames required');
 const f=data.frames[index],sceneChanged=f.scene!==sceneId,loadStart=performance.now();let sceneLoadMs=0;
 if(sceneChanged){dispose();sceneId=f.scene;
  scene=await new THREE.ObjectLoader().parseAsync(await(await fetch(sceneId)).json());
  objects=new Map();materials=new Map();scene.traverse(o=>{objects.set(o.uuid,o);
   for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.set(m.uuid,m);});
  surface=scene.getObjectByName('planar-mirror');
  if(surface){if(!scene.getObjectByName('mirror-corridor-actor'))throw Error('Mirror has no shared actor body');
   transportMaterial=surface.material;mirror=createPlanarMirror();surface.material=mirror.material;}
  sceneLoadMs=performance.now()-loadStart;}
 for(const[id,v]of f.updates){const o=objects.get(id);if(!o)throw Error('Missing scene object '+id);
  o.matrix.fromArray(v.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=v.visible;
  if(v.material)o.material=materials.get(v.material)||o.material;}
 scene.updateMatrixWorld(true);const camera=objects.get(f.camera);if(!camera)throw Error('Missing camera');
 camera.updateMatrixWorld(true);const started=performance.now();let reflected=false,offscreenCalls=0,offscreenTriangles=0;
 if(mirror){surface.updateWorldMatrix(true,false);
  frustum.setFromProjectionMatrix(projectionView.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  if(frustum.intersectsObject(surface)){
   reflected=mirror.render(renderer,scene,camera,surface,(r,s,c)=>r.render(s,c));
   if(reflected){offscreenCalls=renderer.info.render.calls;
    offscreenTriangles=renderer.info.render.triangles;}}}
 renderer.render(scene,camera);const cpuSubmitMs=performance.now()-started,number=Number(f.area.slice(-2));
 caption.textContent='第一章 0'+number+' / 実App経路の状態を再描画（QA字幕）\\n'
  +'simulation '+f.seconds.toFixed(1)+'s / '+f.phase+' / 巡回体 '+(f.actor||'なし')+'\\n'
  +'native Canvas・HUD・音の録画ではありません';
 last=index;await new Promise(r=>requestAnimationFrame(r));
 return{calls:renderer.info.render.calls,offscreenCalls,offscreenTriangles,reflected,cpuSubmitMs,sceneChanged,sceneLoadMs,
  triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,
  textures:renderer.info.memory.textures,rtSize:MIRROR_TARGET_SIZE};};
window.finish=()=>{dispose();caption.remove();return{geometries:renderer.info.memory.geometries,
 textures:renderer.info.memory.textures,renderers:1};};window.ready=true;`);
  const browser = await openBrowser(out), dir = path.join(out, 'frames');
  fs.mkdirSync(dir, { recursive: true });
  let maxCalls = 0, maxOffscreenCalls = 0, maxTotalCalls = 0;
  let maxTriangles = 0, maxOffscreenTriangles = 0, maxTotalTriangles = 0;
  const reflectedFrameIndices = [];
  const cpuSamples = [], perFrame = [];
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors));
      await delay(100);
    }
    if (!await browser.evaluate('window.ready===true')) throw Error('App replay viewer did not load');
    for (let frame = 0; frame < frameCount; frame++) {
      const stats = await browser.evaluate(`window.draw(${frame})`);
      maxCalls = Math.max(maxCalls, stats.calls); maxTriangles = Math.max(maxTriangles, stats.triangles);
      maxOffscreenCalls = Math.max(maxOffscreenCalls, stats.offscreenCalls);
      maxOffscreenTriangles = Math.max(maxOffscreenTriangles, stats.offscreenTriangles);
      maxTotalCalls = Math.max(maxTotalCalls, stats.calls + stats.offscreenCalls);
      maxTotalTriangles = Math.max(maxTotalTriangles, stats.triangles + stats.offscreenTriangles);
      if (stats.reflected) reflectedFrameIndices.push(frame);
      cpuSamples.push(stats.cpuSubmitMs);perFrame.push({frame,...stats});
      const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(dir, `${String(frame).padStart(6, '0')}.png`), Buffer.from(shot.data, 'base64'));
      if (frame % 100 === 0) console.log(`app replay capture ${frame}/${frameCount}`);
    }
    const disposed = await browser.evaluate('window.finish()');
    cpuSamples.sort((a, b) => a - b);
    const percentile = fraction => Number(cpuSamples[Math.floor((cpuSamples.length - 1) * fraction)].toFixed(3));
    const distribution=values=>{const sorted=values.sort((a,b)=>a-b);const p=f=>Number(sorted[Math.floor((sorted.length-1)*f)].toFixed(3));return {samples:sorted.length,p50Ms:p(.5),p95Ms:p(.95),maxMs:p(1)};};
    fs.writeFileSync(path.join(out,'render-frame-metrics.json'),JSON.stringify(perFrame));
    const webgl = { maxCalls, maxOffscreenCalls, maxTotalCalls,
      maxTriangles, maxOffscreenTriangles, maxTotalTriangles,
      reflectedFrames: reflectedFrameIndices.length, reflectedFrameIndices,
      mirrorTargetSize: [384, 384], cpuRenderSubmit: { samples: cpuSamples.length,
        p50Ms: percentile(.5), p95Ms: percentile(.95), maxMs: percentile(1) },
      warmRenderSubmit:distribution(perFrame.filter(frame=>!frame.sceneChanged).map(frame=>frame.cpuSubmitMs)),
      remountRenderSubmit:distribution(perFrame.filter(frame=>frame.sceneChanged).map(frame=>frame.cpuSubmitMs)),
      sceneLoad:distribution(perFrame.filter(frame=>frame.sceneChanged).map(frame=>frame.sceneLoadMs)),
      sceneLoadScope:'Offline replay fetch/JSON parse/Three ObjectLoader before GPU submission, not native asset decode. Cold scenes are rebuilt for static evidence states, while the actual Canvas retains its resource owner per entry.',
      cpuTimingScope: 'SwiftShader browser JS offscreen and main renderer.render submission; excludes screenshot/readback, RAF wait, native presentation and GPU completion',
      disposed, errors: browser.errors };
    fs.writeFileSync(path.join(out, 'webgl.json'), JSON.stringify(webgl, null, 2) + '\n');
    // Three0.185 PBR keeps its renderer-owned16x16 DFG LUT (1KiB), outside scene asset ownership.
    if (!reflectedFrameIndices.length || disposed.geometries || disposed.textures !== 1 || browser.errors.length)
      throw Error('App replay browser resource/error gate failed');
  } finally { await browser.close(); }
  const video = path.join(out, 'chapter-one-app-scene-replay.mp4');
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS), '-i', path.join(dir, '%06d.png'), '-frames:v', String(frameCount),
    '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video],
  { stdio: ['ignore', 'inherit', 'inherit'] });
  const contact = path.join(out, 'chapter-one-app-scene-replay-contact.png');
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-i', video, '-vf', 'fps=1/12,scale=195:422,tile=4x4', '-frames:v', '1', contact],
  { stdio: ['ignore', 'inherit', 'inherit'] });
  return { video: { file: path.basename(video), sha256: sha256(fs.readFileSync(video)),
    bytes: fs.statSync(video).size }, contact: { file: path.basename(contact),
    sha256: sha256(fs.readFileSync(contact)), bytes: fs.statSync(contact).size } };
}

async function main() {
  const extracted = await extract(), captured = await capture(extracted.frames.length);
  bridge.verify();
  const report = { method: 'One actual App host mount supplies deep-copied runtime states from five naturally played controllers at every twelfth simulation update plus entry/clear and every committed interaction. Interaction evidence frames add no simulation time; each occupies one 5Hz video frame, and the audio frame map explicitly retains repeated simulation timestamps. These states are replayed at 5 fps through the actual ChapterScene frame callbacks and camera, with scene remounts when static progress changes. The area-04 surface uses the actual planarMirror.ts offscreen pass and the same scene actor when visible. The MP4 is one sampled offline render of that route, not a direct continuous App or native R3F recording. QA captions replace the live HUD; audio and native input are absent. The underlying App host uses memory AsyncStorage and stub native Canvas/audio.',
    fps: FPS, frames: extracted.frames.length, duration: extracted.frames.length / FPS,
    sequence: CHAPTER_ONE.areas.map(area => ({ area: area.id, stageId: area.stageId,
      samples: extracted.frames.filter(frame => frame.area === area.id).length })),
    sceneRebuilds: extracted.scenes.length, events: extracted.events,
    milestones: extracted.milestones,
    host: { route: extracted.host.route, final: extracted.host.final,
      maxActiveCanvasBoundaries: extracted.host.maxActiveCanvasBoundaries,
      activeCanvasBoundariesAfterUnmount: extracted.host.activeCanvasBoundariesAfterUnmount,
      simulationTicks: extracted.host.motionTrace.ticks,
      motionSamples: extracted.host.motionTrace.samples,
      sourceHashes: extracted.host.sourceHashes,
      toolHash: extracted.host.toolHash },
    runtimeSamplesSha256: sha256(fs.readFileSync(extracted.runtimeFile)),
    sourceHashes: Object.fromEntries(bridge.hashes), toolHash: sha256(fs.readFileSync(__filename)),
    ...captured, webgl: JSON.parse(fs.readFileSync(path.join(out, 'webgl.json'), 'utf8')) };
  fs.writeFileSync(path.join(out, 'video-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ frames: report.frames, sceneRebuilds: report.sceneRebuilds,
    duration: report.duration, video: report.video, webgl: report.webgl }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
