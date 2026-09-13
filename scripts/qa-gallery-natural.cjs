#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Sample a real, unmodified area-01 controller route, then replay those domain
// snapshots through the actual ChapterScene in a software WebGL browser.
// The browser view is not native R3F scheduling, input, audio or iPhone video.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
if (process.argv.length !== 2) throw Error('usage: node scripts/qa-gallery-natural.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal013/gallery-natural');
fs.mkdirSync(out, { recursive: true });
const bridge = installSourceBridge(root), React = require('react'), THREE = require('three');
global.expect = require('expect').expect;
const { createChapterOneSession } = require('../src/domain/campaign/session.ts');
const { getWorld } = require('../src/domain/firstPerson/chapter.ts');
const { openNaturalRun, playNaturalArea } = require('../test-support/naturalChapterRoute.ts');
const { ChapterScene } = require('../src/rendering/firstPerson/ChapterScene.tsx');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const FPS = 5, TICKS_PER_FRAME = 12;

function progressLabel(runtime) {
  const gallery = runtime.progress.gallery;
  if (runtime.progress.cleared) return '管理用防火扉を越えた';
  if (runtime.progress.exitDoorOpen && gallery?.wiring.solved) return '管理用防火扉へ';
  if (gallery?.wiring.solved) return '配線を復旧した';
  if (gallery?.powerConnected) return '職員通路の電源を接続した';
  if (gallery?.powerTaken.shadow && gallery?.powerTaken.contour) return '二つの見本を持ち帰った';
  if (gallery?.powerTaken.shadow) return '明暗の見本を持ち帰った';
  if (gallery?.powerTaken.contour) return '輪郭の見本を持ち帰った';
  if (gallery?.emergencyLit) return '非常灯を点けた';
  return '非常灯を探す';
}

function recordRuntime(run, ticks, seconds) {
  const runtime = JSON.parse(JSON.stringify(run.controller.runtime));
  const pose = runtime.pose.position;
  if (!Number.isFinite(pose.x) || !Number.isFinite(pose.y) || !Number.isFinite(pose.z))
    throw Error('Non-finite gallery pose');
  return { ticks, seconds: Number(seconds.toFixed(6)), runtime,
    label: progressLabel(runtime), actor: runtime.gallery?.actor?.phase ?? null };
}

async function extract() {
  const run = openNaturalRun(createChapterOneSession('gallery-natural-qa', '1.0.0'), 'standard');
  const samples = [recordRuntime(run, 0, 0)];
  let ticks = 0, seconds = 0;
  run.onAdvance = (_, dt) => {
    ticks += 1; seconds += dt;
    if (ticks % TICKS_PER_FRAME === 0) samples.push(recordRuntime(run, ticks, seconds));
  };
  const cleared = playNaturalArea(run, 0, ['shadow', 'contour']);
  if (!cleared.progress.cleared || !run.controller.runtime.progress.cleared)
    throw Error('Actual gallery route did not reach its cleared state');
  if (samples.at(-1).ticks !== ticks) samples.push(recordRuntime(run, ticks, seconds));
  const states = [...new Set(samples.map(sample => sample.label))];
  if (!states.includes('非常灯を点けた') || states.at(-1) !== '管理用防火扉を越えた')
    throw Error('Gallery route did not show its expected progress');

  const camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
  const frames = [], sceneFiles = [], events = [], previous = new Map();
  let scene, mounted, resources, callbacks, runtimeRef, key;
  const clearScene = async () => {
    if (mounted) await mounted.unmount();
    resources?.dispose(); mounted = undefined; resources = undefined;
    previous.clear();
  };
  try {
    for (const sample of samples) {
      const nextKey = JSON.stringify(sample.runtime.progress);
      let newScene = false;
      if (nextKey !== key) {
        await clearScene(); key = nextKey;
        runtimeRef = { current: sample.runtime };
        resources = createSceneResources(false, null, true);
        scene = new THREE.Scene(); scene.background = new THREE.Color('#171a1b'); scene.add(camera);
        mounted = await mountThree(React.createElement(ChapterScene, {
          world: getWorld(sample.runtime), runtime: runtimeRef, progress: sample.runtime.progress,
          resources, assist: false, reducedMotion: false, lowQuality: false, lab: false,
          onFrameError: error => { throw error; },
        }), THREE);
        mounted.objects.forEach(object => scene.add(object));
        callbacks = bridge.callbacks.splice(0);
        const file = `scene-${String(sceneFiles.length).padStart(3, '0')}.json`;
        sceneFiles.push(file);
        newScene = true;
      }
      runtimeRef.current = sample.runtime;
      const pose = sample.runtime.pose;
      camera.position.set(pose.position.x, pose.position.y, pose.position.z);
      camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ');
      callbacks.forEach(callback => callback({}, 1 / 60));
      scene.updateMatrixWorld(true);
      if (frames.length === 0 || frames.at(-1).label !== sample.label)
        events.push({ frame: frames.length, seconds: sample.seconds, label: sample.label,
          pose: pose.position, actor: sample.actor });
      const updates = [];
      scene.traverse(object => {
        const value = { matrix: object.matrix.toArray(), visible: object.visible,
          material: !Array.isArray(object.material) ? object.material?.uuid : undefined };
        const encoded = JSON.stringify(value);
        if (previous.get(object.uuid) !== encoded) {
          previous.set(object.uuid, encoded); updates.push([object.uuid, value]);
        }
      });
      frames.push({ scene: sceneFiles.at(-1), camera: camera.uuid, updates,
        ticks: sample.ticks, seconds: sample.seconds, label: sample.label,
        actor: sample.actor, pose: pose.position });
      if (newScene)
        fs.writeFileSync(path.join(out, sceneFiles.at(-1)), JSON.stringify(scene.toJSON()));
    }
  } finally { await clearScene(); }
  bridge.verify();
  const report = { method: 'The natural standard-intensity gallery route drives the actual controller/world once at 60 Hz. Every twelfth update plus the final state is deep-copied, then replayed through the real ChapterScene frame callbacks and camera in a browser Software WebGL renderer at 5 fps. React Three props are remounted when authored progress changes. This is sampled offline scene replay, not continuous native Canvas output, actual finger input, real audio, or iPhone performance.',
    stageId: 'perception-gallery-v1', campaignArea: 'chapter-1-area-01',
    order: ['shadow', 'contour'], simulationTicks: ticks,
    simulationSeconds: Number(seconds.toFixed(6)), frames: frames.length, fps: FPS,
    sceneRebuilds: sceneFiles.length, events, final: { cleared: true, pose: cleared.pose },
    sourceHashes: Object.fromEntries(bridge.hashes), toolHash: sha256(fs.readFileSync(__filename)) };
  fs.writeFileSync(path.join(out, 'animation.json'), JSON.stringify({ frames }));
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  return report;
}

async function capture(report) {
  for (const file of ['three.module.js', 'three.core.js'])
    fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(out, file));
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#080a0d}canvas{display:block}#caption{position:absolute;left:8px;right:8px;top:8px;padding:7px 9px;color:#f4f3e9;background:#081015c9;border:1px solid #8999a5;border-radius:5px;font:13px/1.4 sans-serif;white-space:pre-line}</style><div id="caption"></div><script type="module" src="./viewer.js"></script>');
  fs.writeFileSync(path.join(out, 'viewer.js'), `import * as THREE from './three.module.js';
const data=await(await fetch('./animation.json')).json();
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(390,844);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;document.body.prepend(renderer.domElement);
const caption=document.getElementById('caption');
let scene,sceneId,objects=new Map(),materials=new Map(),last=-1;
function dispose(){if(!scene)return;const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{
 if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){
  ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}});
 gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();
 renderer.renderLists.dispose();scene=null;}
window.draw=async index=>{if(index!==last+1)throw Error('Sequential gallery frames required');
 const f=data.frames[index];if(f.scene!==sceneId){dispose();sceneId=f.scene;
  scene=await new THREE.ObjectLoader().parseAsync(await(await fetch(sceneId)).json());
  objects=new Map();materials=new Map();scene.traverse(o=>{objects.set(o.uuid,o);
   for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.set(m.uuid,m);});}
 for(const[id,v]of f.updates){const o=objects.get(id);if(!o)throw Error('Missing scene object '+id);
  o.matrix.fromArray(v.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=v.visible;
  if(v.material)o.material=materials.get(v.material)||o.material;}
 scene.updateMatrixWorld(true);const camera=objects.get(f.camera);if(!camera)throw Error('Missing camera');
 renderer.render(scene,camera);caption.textContent='01 閉館後の展示室 / 実controller状態の再描画\\n'
  +f.label+'　'+f.seconds.toFixed(1)+'s　'+(f.actor||'')+'\\n'
  +'位置 '+f.pose.x.toFixed(1)+', '+f.pose.z.toFixed(1);
 last=index;await new Promise(r=>requestAnimationFrame(r));
 return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
  geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};};
window.finish=()=>{dispose();caption.remove();return{geometries:renderer.info.memory.geometries,
 textures:renderer.info.memory.textures,renderers:1};};window.ready=true;`);
  const browser = await openBrowser(out), dir = path.join(out, 'frames');
  fs.mkdirSync(dir, { recursive: true });
  let maxCalls = 0, maxTriangles = 0;
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors));
      await delay(100);
    }
    if (!await browser.evaluate('window.ready===true')) throw Error('Gallery viewer did not load');
    for (let frame = 0; frame < report.frames; frame++) {
      const stats = await browser.evaluate(`window.draw(${frame})`);
      maxCalls = Math.max(maxCalls, stats.calls); maxTriangles = Math.max(maxTriangles, stats.triangles);
      const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(dir, `${String(frame).padStart(6, '0')}.png`), Buffer.from(shot.data, 'base64'));
      if (frame % 75 === 0) console.log(`gallery capture ${frame}/${report.frames}`);
    }
    const disposed = await browser.evaluate('window.finish()');
    const webgl = { maxCalls, maxTriangles, disposed, errors: browser.errors };
    fs.writeFileSync(path.join(out, 'webgl.json'), JSON.stringify(webgl, null, 2) + '\n');
    if (disposed.geometries || disposed.textures || browser.errors.length)
      throw Error('Gallery browser resource/error gate failed');
  } finally { await browser.close(); }
  const file = path.join(out, 'area01-natural-route.mp4');
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', String(FPS), '-i', path.join(dir, '%06d.png'), '-frames:v', String(report.frames),
    '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file],
  { stdio: ['ignore', 'inherit', 'inherit'] });
  const contact = path.join(out, 'area01-natural-route-contact.png');
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-i', file, '-vf', 'fps=1/8,scale=195:422,tile=4x3', '-frames:v', '1', contact],
  { stdio: ['ignore', 'inherit', 'inherit'] });
  return { file, sha256: sha256(fs.readFileSync(file)), bytes: fs.statSync(file).size,
    contact: { file: path.basename(contact), sha256: sha256(fs.readFileSync(contact)),
      bytes: fs.statSync(contact).size } };
}

async function main() {
  const report = await extract();
  const video = await capture(report);
  bridge.verify();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ ...report,
    video: { file: path.basename(video.file), sha256: video.sha256, bytes: video.bytes },
    contact: video.contact,
    webgl: JSON.parse(fs.readFileSync(path.join(out, 'webgl.json'), 'utf8')) }, null, 2) + '\n');
  console.log(JSON.stringify({ frames: report.frames, simulationTicks: report.simulationTicks,
    sceneRebuilds: report.sceneRebuilds, video }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
