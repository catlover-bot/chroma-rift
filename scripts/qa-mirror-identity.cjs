#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Same serialized StageScene and controller frames as qa-mirror-natural.cjs.
// Two views are composed only for QA; the product still presents one main view.
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');

if (process.argv.length !== 2) throw Error('usage: node scripts/qa-mirror-identity.cjs');
const root = path.resolve(__dirname, '..');
const natural = path.join(root, '.expo/goal013/mirror-natural');
const out = path.join(root, '.expo/goal013/mirror-identity');
const retained = path.join(root, 'docs/qa-goal013');
const first = 98, last = 140, anchor = 100;
const read = file => fs.readFileSync(file);
const hash = file => sha256(read(file));
const naturalReport = JSON.parse(read(path.join(natural, 'report.json')));
const naturalTool = path.join(root, 'scripts/qa-mirror-natural.cjs');
if (naturalReport.mode !== 'subdued-natural' || naturalReport.frames < last + 1 ||
    naturalReport.toolHash !== hash(naturalTool) ||
    naturalReport.video.sha256 !== hash(path.join(natural, 'mirror-natural.mp4')))
  throw Error('Run qa-mirror-natural.cjs again: its source/video report is stale');
for (const [relative, expected] of Object.entries(naturalReport.sourceHashes))
  if (hash(path.join(root, relative)) !== expected) throw Error(`Source changed: ${relative}`);

const sceneData = JSON.parse(read(path.join(natural, 'scene.json')));
const animation = JSON.parse(read(path.join(natural, 'animation.json')));
if (animation.frames.length !== naturalReport.frames) throw Error('Animation/report frame count differs');
const named = [];
function collect(object) {
  if (object.name) named.push({ name: object.name, uuid: object.uuid });
  for (const child of object.children || []) collect(child);
}
collect(sceneData.object);
const actors = named.filter(object => object.name === 'mirror-corridor-actor');
const mirrors = named.filter(object => object.name === 'planar-mirror');
if (actors.length !== 1 || mirrors.length !== 1) throw Error('Expected one actor and one mirror in StageScene');
const actorUuid = actors[0].uuid;
for (let i = first; i <= last; i += 1) {
  const frame = animation.frames[i];
  const actor = frame.objects.find(object => object.uuid === actorUuid);
  if (!actor) throw Error(`Actor missing in frame ${i}`);
  for (const [axis, matrixIndex] of [['x', 12], ['y', 13], ['z', 14]])
    if (Math.abs(actor.matrix[matrixIndex] - frame.actor[axis]) > 1e-9)
      throw Error(`Actor transform differs from controller state at frame ${i}`);
}
const startActor = animation.frames[first].actor, endActor = animation.frames[last].actor;
if (Math.hypot(endActor.x - startActor.x, endActor.z - startActor.z) < .4)
  throw Error('Actor did not move during the identity clip');

fs.mkdirSync(out, { recursive: true });
for (const file of ['scene.json', 'animation.json', 'planarMirror.js', 'three.module.js', 'three.core.js'])
  fs.copyFileSync(path.join(natural, file), path.join(out, file));
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#09090c;color:#fff;font:600 17px sans-serif}
  canvas{display:block} .label{position:absolute;top:0;width:390px;box-sizing:border-box;
    padding:13px 12px;background:#09090cdd;border-bottom:1px solid #a4b4b1}
  #right{left:390px;border-left:2px solid #cad5d1} #divider{position:absolute;left:389px;top:0;
    width:2px;height:844px;background:#cad5d1;pointer-events:none}
  #foot{position:absolute;bottom:0;left:0;right:0;box-sizing:border-box;padding:9px 12px;
    background:#09090cdd;text-align:center;font-size:13px;letter-spacing:.07em}
  </style><div id="left" class="label">PLAYER VIEW · MIRROR</div>
  <div id="right" class="label">FIXED QA VIEW · REAL BODY</div><div id="divider"></div>
  <div id="foot">SAME STAGE SESSION · SAME SIMULATION FRAME</div><script type="module">
  import * as THREE from './three.module.js';
  import {createPlanarMirror} from './planarMirror.js';
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(1);renderer.setSize(780,844);renderer.autoClear=false;
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;
  document.body.prepend(renderer.domElement);
  const scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./scene.json')).json());
  const frames=(await(await fetch('./animation.json')).json()).frames;
  const objects=new Map();scene.traverse(object=>objects.set(object.uuid,object));
  const player=[...objects.values()].find(object=>object.isPerspectiveCamera);
  const actor=scene.getObjectByName('mirror-corridor-actor');
  const surface=scene.getObjectByName('planar-mirror');
  const mirror=createPlanarMirror();surface.material=mirror.material;
  const observer=new THREE.PerspectiveCamera(45,390/844,.08,60);
  observer.position.set(0,1.6,4);observer.lookAt(-.5,1.6,16);observer.updateMatrixWorld(true);
  const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
  function view(camera,x){
    renderer.setViewport(x,0,390,844);renderer.setScissor(x,0,390,844);renderer.setScissorTest(true);
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    const reflected=frustum.intersectsObject(surface)
      ? mirror.render(renderer,scene,camera,surface,(r,s,c)=>r.render(s,c)) : false;
    renderer.render(scene,camera);return reflected;
  }
  window.draw=async i=>{
    const frame=frames[i];
    for(const value of frame.objects){const object=objects.get(value.uuid);
      object.matrix.fromArray(value.matrix);object.matrix.decompose(object.position,object.quaternion,object.scale);
      object.visible=value.visible;}
    scene.updateMatrixWorld(true);player.updateMatrixWorld(true);surface.updateWorldMatrix(true,false);
    renderer.setScissorTest(false);renderer.setViewport(0,0,780,844);renderer.clear();
    const playerReflection=view(player,0),observerReflection=view(observer,390);
    renderer.setScissorTest(false);
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const position=new THREE.Vector3().setFromMatrixPosition(actor.matrixWorld);
    return {playerReflection,observerReflection,actorPosition:position.toArray(),
      actorUuid:actor.uuid,recordedActor:frame.actor};
  };
  window.finish=()=>{const geometries=new Set(),materials=new Set(),textures=new Set();
    scene.traverse(object=>{if(object.geometry)geometries.add(object.geometry);
      for(const material of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){
        materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}});
    mirror.dispose();geometries.forEach(value=>value.dispose());materials.forEach(value=>value.dispose());
    textures.forEach(value=>value.dispose());scene.clear();renderer.renderLists.dispose();
    return {geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderers:1};};
  window.ready=true;
  </script>`);

async function main() {
  const browser = await openBrowser(out);
  const framesDir = path.join(out, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  let reflectedFrames = 0, anchorSeen = false, disposed;
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 780, height: 844,
      deviceScaleFactor: 1, mobile: false });
    for (let attempt = 0; attempt < 100 && !await browser.evaluate('window.ready===true'); attempt += 1) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors));
      await delay(100);
    }
    if (!await browser.evaluate('window.ready===true')) throw Error('QA browser did not become ready');
    for (let i = first; i <= last; i += 1) {
      const result = await browser.evaluate(`window.draw(${i})`);
      if (result.actorUuid !== actorUuid ||
          Math.hypot(...result.actorPosition.map((value, axis) =>
            value - result.recordedActor[['x', 'y', 'z'][axis]])) > 1e-8)
        throw Error(`Rendered actor differs from controller frame ${i}`);
      if (result.playerReflection) reflectedFrames += 1;
      if (i === anchor) anchorSeen = result.playerReflection;
      const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(framesDir, String(i).padStart(5, '0') + '.png'),
        Buffer.from(screenshot.data, 'base64'));
    }
    disposed = await browser.evaluate('window.finish()');
    if (browser.errors.length || disposed.geometries || disposed.textures ||
        !anchorSeen || reflectedFrames < 10) throw Error('Identity render/disposal gate failed');
  } finally { await browser.close(); }
  const video = path.join(retained, 'mirror-identity.mp4');
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
    '-framerate', '10', '-start_number', String(first), '-i', path.join(framesDir, '%05d.png'),
    '-frames:v', String(last - first + 1), '-c:v', 'libx264', '-crf', '21', '-pix_fmt', 'yuv420p', video]);
  const still = path.join(retained, 'mirror-identity-frame100.png');
  fs.copyFileSync(path.join(framesDir, String(anchor).padStart(5, '0') + '.png'), still);
  const report = {
    method: 'Two QA camera views of the same serialized StageScene and controller frame, rendered in one Software WebGL scene. The right view is not the product camera or a second simulation.',
    input: { originalToolSha256: naturalReport.toolHash, originalCaptureReportSha256: hash(path.join(natural, 'report.json')),
      originalVideoSha256: naturalReport.video.sha256, sceneSha256: hash(path.join(natural, 'scene.json')),
      animationSha256: hash(path.join(natural, 'animation.json')),
      currentSourceCount: Object.keys(naturalReport.sourceHashes).length,
      currentSourceManifestSha256: sha256(Buffer.from(JSON.stringify(naturalReport.sourceHashes))) },
    actorUuid, mirrorUuid: mirrors[0].uuid, observer: { fovDegrees: 45, position: [0, 1.6, 4], lookAt: [-.5, 1.6, 16] },
    simulationFrames: [first, last], capturedFrames: last - first + 1, fps: 10,
    anchor: { frame: anchor, actor: animation.frames[anchor].actor, playerReflection: anchorSeen },
    reflectedFrames, disposed, browserErrors: [],
    output: { video: { bytes: fs.statSync(video).size, sha256: hash(video) },
      still: { bytes: fs.statSync(still).size, sha256: hash(still) } },
    toolSha256: hash(__filename),
    limits: 'Software WebGL and CSS QA labels; observer camera adds an extra main render only for comparison. Not native Canvas, product HUD, iPhone visibility, frame-rate, audio, or a perceptual proof.',
  };
  fs.writeFileSync(path.join(retained, 'mirror-identity-report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ capturedFrames: report.capturedFrames, reflectedFrames, output: report.output }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
