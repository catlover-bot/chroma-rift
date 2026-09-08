#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
/** Continuous shared simulation -> actual mounted GalleryActor callbacks ->
 * one browser renderer. The inspection floor is not a chapter AI route. */
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { installSourceBridge, mountThree, openBrowser, sha256, delay } = require('./lib/three-scene-qa.cjs');
const root = path.resolve(__dirname, '..'), stage = path.join(root, '.expo/goal009/actor-motion');
const output = path.join(root, 'docs/qa-goal009/motion');
const baselineRevision = 'd1f7b5513da5c0909089edc30fddc8c0665dadcb';
const fps = 30, duration = 30, frameCount = fps * duration;
const bridge = installSourceBridge(root);
bridge.hashes.set('scripts/preview-actor-motion.cjs', sha256(fs.readFileSync(__filename)));
bridge.hashes.set('scripts/lib/three-scene-qa.cjs', sha256(fs.readFileSync(path.join(__dirname, 'lib/three-scene-qa.cjs'))));
const React = require('react'), THREE = require('three');
const Motion = require('../src/domain/actorMotion/index.ts');
const { GalleryActor } = require('../src/rendering/firstPerson/GalleryActor.tsx');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const before = bridge.loadBaseline('src/rendering/firstPerson/GalleryActor.tsx', baselineRevision);
const writeJSON = (filename, data) => fs.writeFileSync(filename, JSON.stringify(data, null, 2) + '\n');
const controls = [
  { start: 0, end: 4, name: 'idle', gait: 'idle', desiredHeading: 0, maxSpeed: 0 },
  { start: 4, end: 8, name: 'look-right-and-turn-90', gait: 'listen', desiredHeading: -Math.PI / 2, maxSpeed: 0 },
  { start: 8, end: 14, name: 'turn-180', gait: 'search', desiredHeading: Math.PI / 2, maxSpeed: 0 },
  { start: 14, end: 21, name: 'walk', gait: 'patrol', target: { x: -8, y: 0, z: 0 }, desiredHeading: Math.PI / 2, maxSpeed: .42 },
  { start: 21, end: 30, name: 'stop', gait: 'idle', desiredHeading: Math.PI / 2, maxSpeed: 0 },
];
const intentAt = time => controls.find(c => time >= c.start && time < c.end) ?? controls.at(-1);
const cameras = [
  { id: 'full-feet', position: [-1.4, 2.4, -5.6], target: [-1.4, 1.05, 0], fov: 52 },
  { id: 'player-height', position: [1.4, 1.6, -3.8], target: [-1.05, 1.14, 0], fov: 65 },
];
function makeStage(resources) {
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#202a28');
  const floor = new THREE.Mesh(resources.box, resources.floor); floor.name = 'inspection-floor-app-material'; floor.position.set(-1, -.05, 0); floor.scale.set(10, .1, 8); scene.add(floor);
  const ambient = new THREE.AmbientLight('#b8c6bf', 1.4), directional = new THREE.DirectionalLight('#e7dfc7', 2);
  directional.position.set(-3, 5, -3); scene.add(ambient, directional);
  return scene;
}
function scanActor(actor, state, previousContacts) {
  let minY = Infinity, maxY = -Infinity, radius = 0;
  const vertex = new THREE.Vector3();
  actor.traverse(mesh => {
    if (!mesh.isMesh) return;
    const positions = mesh.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrixWorld);
      minY = Math.min(minY, vertex.y); maxY = Math.max(maxY, vertex.y);
      radius = Math.max(radius, Math.hypot(vertex.x - state.position.x, vertex.z - state.position.z));
    }
  });
  let maxAnchorError = 0, maxStanceVertexSlip = 0;
  const feet = state.feet.map((foot, index) => {
    const mesh = actor.getObjectByName('actor-planted-foot-' + (index === 0 ? -1 : 1));
    if (!mesh) throw new Error('Missing real actor foot mesh');
    const center = mesh.getWorldPosition(new THREE.Vector3());
    maxAnchorError = Math.max(maxAnchorError, Math.hypot(center.x - foot.position.x, center.y - foot.position.y - .07, center.z - foot.position.z));
    const corners = [-.5, .5].flatMap(x => [-.5, .5].map(z => new THREE.Vector3(x, -.5, z).applyMatrix4(mesh.matrixWorld).toArray()));
    const prior = previousContacts[index];
    if (foot.stance && prior?.stance && JSON.stringify(prior.anchor) === JSON.stringify(foot.anchor)) for (let i = 0; i < corners.length; i++) maxStanceVertexSlip = Math.max(maxStanceVertexSlip, Math.hypot(...corners[i].map((value, axis) => value - prior.corners[i][axis])));
    const entry = { ...foot, corners, center: center.toArray() }; previousContacts[index] = entry; return entry;
  });
  const head = actor.getObjectByName('actor-leading-head');
  if (!head) throw new Error('GalleryActor motion integration absent: actor-leading-head not found');
  const headPosition = head.getWorldPosition(new THREE.Vector3()), eye = Motion.actorMotionEye(state);
  const actualDirection = new THREE.Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  const eyeDirectionError = actualDirection.distanceTo(new THREE.Vector3(eye.direction.x, eye.direction.y, eye.direction.z));
  return { minY, maxY, radius, maxAnchorError, maxStanceVertexSlip, eyeDirectionError, feet, headPosition: headPosition.toArray(), eye };
}
async function extract() {
  fs.mkdirSync(stage, { recursive: true }); fs.mkdirSync(output, { recursive: true });
  const resources = createSceneResources(false, null, true), scene = makeStage(resources);
  let motion = Motion.createActorMotion({ x: 0, y: 0, z: 0 });
  const runtime = { current: { gallery: { actor: { visible: true, phase: 'patrol', position: motion.position, yaw: 0, travelledDistance: 0, motion } } } };
  const oldRuntime = { current: { gallery: { actor: { ...runtime.current.gallery.actor } } } };
  const newMount = await mountThree(React.createElement(GalleryActor, { runtime, resources, reducedMotion: false }), THREE);
  const newCallbacks = bridge.callbacks.splice(0);
  const oldMount = await mountThree(React.createElement(before.exports.GalleryActor, { runtime: oldRuntime, resources, reducedMotion: false }), THREE);
  const oldCallbacks = bridge.callbacks.splice(0);
  const currentActor = newMount.objects[0], oldActor = oldMount.objects[0];
  currentActor.name = 'current-actor'; oldActor.name = 'baseline-actor'; scene.add(currentActor, oldActor);
  const camera = new THREE.PerspectiveCamera();
  const inspectionCameras = cameras.map(c => { const camera = new THREE.PerspectiveCamera(c.fov, 480 / 640, .05, 50); camera.position.fromArray(c.position); camera.lookAt(...c.target); camera.updateMatrixWorld(true); return camera; });
  const framing = cameras.map(c => ({ camera: c.id, maxAbsX: 0, maxAbsY: 0, minDepth: Infinity, maxDepth: -Infinity }));
  const objects = []; currentActor.traverse(object => objects.push(object)); oldActor.traverse(object => objects.push(object));
  const updates = [], timeline = [], previousContacts = [], plantEvents = [], summary = { minY: Infinity, maxY: -Infinity, maxRadius: 0, maxAnchorError: 0, maxStanceVertexSlip: 0, maxEyeDirectionError: 0, maxYawRate: 0, maxYawAcceleration: 0 };
  const previousMatrices = new Map();
  let previousYaw = motion.yaw, previousRate = 0;
  for (let frame = 0; frame < frameCount; frame++) {
    const time = frame / fps, intent = intentAt(time);
    if (frame) for (let sub = 0; sub < 2; sub++) {
      const step = Motion.advanceActorMotion(motion, intentAt((frame - 1) / fps + sub / 60), 1 / 60, () => true);
      motion = step.state; plantEvents.push(...step.footPlants.map(event => ({ time: (frame - 1) / fps + (sub + 1) / 60, ...event })));
    }
    Object.assign(runtime.current.gallery.actor, { motion, position: motion.position, yaw: motion.yaw, travelledDistance: motion.travelledDistance });
    // Matched root translation/speed isolates the rendering change. The old
    // renderer gets the old immediate target heading; it is not a replay of AI.
    Object.assign(oldRuntime.current.gallery.actor, { position: motion.position, yaw: intent.desiredHeading, travelledDistance: motion.travelledDistance });
    for (const callback of newCallbacks) callback({ scene, camera }, 1 / fps);
    for (const callback of oldCallbacks) callback({ scene, camera }, 1 / fps);
    scene.updateMatrixWorld(true);
    for (const actor of [currentActor, oldActor]) {
      const bounds = new THREE.Box3().setFromObject(actor);
      for (let c = 0; c < inspectionCameras.length; c++) for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(inspectionCameras[c]), record = framing[c];
        record.maxAbsX = Math.max(record.maxAbsX, Math.abs(p.x)); record.maxAbsY = Math.max(record.maxAbsY, Math.abs(p.y)); record.minDepth = Math.min(record.minDepth, p.z); record.maxDepth = Math.max(record.maxDepth, p.z);
      }
    }
    const audit = scanActor(currentActor, motion, previousContacts), rate = frame ? Motion.wrapActorAngle(motion.yaw - previousYaw) * fps : 0;
    summary.minY = Math.min(summary.minY, audit.minY); summary.maxY = Math.max(summary.maxY, audit.maxY); summary.maxRadius = Math.max(summary.maxRadius, audit.radius);
    summary.maxAnchorError = Math.max(summary.maxAnchorError, audit.maxAnchorError); summary.maxStanceVertexSlip = Math.max(summary.maxStanceVertexSlip, audit.maxStanceVertexSlip);
    summary.maxEyeDirectionError = Math.max(summary.maxEyeDirectionError, audit.eyeDirectionError);
    summary.maxYawRate = Math.max(summary.maxYawRate, Math.abs(rate)); summary.maxYawAcceleration = Math.max(summary.maxYawAcceleration, Math.abs(rate - previousRate) * fps);
    previousYaw = motion.yaw; previousRate = rate;
    timeline.push({ frame, time, phase: intent.name, state: motion, audit, yawRate: rate });
    const changes = [];
    for (const object of objects) { const matrix = object.matrix.toArray(), previous = previousMatrices.get(object.uuid); if (!previous || matrix.some((value, i) => value !== previous[i])) { changes.push([object.uuid, matrix]); previousMatrices.set(object.uuid, matrix); } }
    updates.push(changes);
    if (frame === 0) writeJSON(path.join(stage, 'scene.json'), scene.toJSON());
  }
  const stopStart = timeline[21 * fps].state, stopEnd = timeline.at(-1).state;
  const stop = { startSpeed: stopStart.speed, endSpeed: stopEnd.speed, displacement: Math.hypot(stopStart.position.x - stopEnd.position.x, stopStart.position.z - stopEnd.position.z),
    samples: timeline.filter(f => f.time >= 20.9 && f.time <= 21.3).map(f => ({ time: f.time, position: f.state.position, speed: f.state.speed, stance: f.state.feet.map(foot => foot.stance) })) };
  const gates = { feetNotBelowGround: summary.minY >= -1e-7, modelInsideCollisionRadius: summary.maxRadius <= .44,
    bothActorsWholeBodyInBothCameras: framing.every(c => c.maxAbsX < .98 && c.maxAbsY < .98 && c.minDepth > -1 && c.maxDepth < 1),
    stanceSlipBelow2cm: summary.maxStanceVertexSlip <= .02, actualSoleMatchesSharedFoot: summary.maxAnchorError <= 1e-7,
    renderedHeadMatchesLOSEyeDirection: summary.maxEyeDirectionError < 1e-7,
    yawSpeedBounded: summary.maxYawRate <= Motion.ACTOR_MOTION.bodyMaxYawRate + 1e-7, yawAccelerationBounded: summary.maxYawAcceleration <= Motion.ACTOR_MOTION.bodyMaxYawAcceleration + 1e-7,
    stoppedFromMovement: stop.startSpeed > .3 && stop.endSpeed === 0 && stop.displacement > .005 && stop.displacement < .08 };
  const report = { boundary: '30 s continuous shared locomotion; actual GalleryActor mounted once per version, actual useFrame callbacks per frame. Inspection floor uses app material. No chapter AI, native frame-loop, collision-route, sound, or iPhone claims.', baselineRevision, baselineActorSHA256: before.sha256,
    comparison: 'Left: unmodified baseline actor renderer with same root translation/distance and immediate desired heading. Right: current actor renderer with continuous shared motion. Both use current unchanged actor resources. This isolates turn/foot rendering, not old complete game simulation.',
    fps, duration, frameCount, simulationHz: 60, internalSimulationHz: 120, controls, cameras, framing, mounts: 2, frameCallbacks: { current: newCallbacks.length, baseline: oldCallbacks.length }, summary, stop, gates, plantEvents, timeline };
  writeJSON(path.join(output, 'timeline.json'), report);
  fs.writeFileSync(path.join(stage, 'animation.json'), JSON.stringify({ updates, currentActor: currentActor.uuid, oldActor: oldActor.uuid, cameras, fps, duration, phases: timeline.map(f => f.phase) }));
  fs.writeFileSync(path.join(stage, 'GalleryActor.baseline.tsx'), before.source);
  bridge.verify(); writeJSON(path.join(output, 'source-hashes.json'), Object.fromEntries(bridge.hashes));
  await newMount.unmount(); await oldMount.unmount(); resources.dispose();
  console.log(JSON.stringify({ extracted: frameCount, summary, stop, gates, plants: plantEvents.length }));
  if (Object.values(gates).some(passed => !passed)) throw new Error('Actor motion mesh/stop gates failed; inspect timeline.json');
  return report;
}

function writeViewer() {
  for (const file of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(stage, file));
  fs.writeFileSync(path.join(stage, 'index.html'), `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#202a28;color:white;font:14px sans-serif}canvas{display:block}button{padding:12px}</style><button id="play">Play / pause 30 s</button><button id="camera">Switch camera</button><div id="caption"></div><script type="module">
import * as THREE from './three.module.js';
const data=await(await fetch('./animation.json')).json(), scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./scene.json')).json());
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(960,640);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);
const output=document.createElement('canvas');output.width=960;output.height=680;const ctx=output.getContext('2d');
const objects=new Map();scene.traverse(o=>objects.set(o.uuid,o));const current=objects.get(data.currentActor),old=objects.get(data.oldActor);
const cameras=data.cameras.map(c=>{const camera=new THREE.PerspectiveCamera(c.fov,480/640,.05,50);camera.position.fromArray(c.position);camera.lookAt(...c.target);camera.updateMatrixWorld(true);return camera;});
let applied=-1, playing=false, start=0, view=0, request=0;const stats=[];
function apply(frame){if(frame<applied)applied=-1;for(let f=applied+1;f<=frame;f++)for(const [uuid,matrix]of data.updates[f]){const o=objects.get(uuid);o.matrix.fromArray(matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);}applied=frame;scene.updateMatrixWorld(true);}
window.renderMotionFrame=(frame,cameraIndex=0)=>{apply(frame);renderer.setScissorTest(true);let calls=0,triangles=0;for(let side=0;side<2;side++){current.visible=side===1;old.visible=side===0;renderer.setViewport(side*480,0,480,640);renderer.setScissor(side*480,0,480,640);renderer.render(scene,cameras[cameraIndex]);calls+=renderer.info.render.calls;triangles+=renderer.info.render.triangles;}
ctx.fillStyle='#111a17';ctx.fillRect(0,0,960,680);ctx.drawImage(renderer.domElement,0,40);ctx.fillStyle='#fff';ctx.font='16px sans-serif';ctx.fillText('d1f7b55 renderer | same root translation',12,19);ctx.fillText('Current shared motion | '+(frame/data.fps).toFixed(2)+' s',492,19);ctx.font='12px sans-serif';ctx.fillText(data.phases[frame]+' | '+data.cameras[cameraIndex].id+' | actual app actor / inspection stage',12,35);
const result={frame,calls,triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};stats.push(result);return{...result,image:output.toDataURL('image/png')};};
document.getElementById('camera').onclick=()=>{view=1-view;};function tick(now){if(!playing)return;const frame=Math.min(data.updates.length-1,Math.floor((now-start)/1000*data.fps));window.renderMotionFrame(frame,view);if(frame<data.updates.length-1)request=requestAnimationFrame(tick);else playing=false;}
document.getElementById('play').onclick=()=>{playing=!playing;if(playing){start=performance.now();request=requestAnimationFrame(tick);}else cancelAnimationFrame(request);};
window.disposeMotion=()=>{playing=false;cancelAnimationFrame(request);const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());scene.clear();renderer.renderLists.dispose();return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,rendererCount:1,animationStopped:!playing};};
window.motionReady=true;
</script>`);
}
async function capture(report) {
  writeViewer(); const browser = await openBrowser(stage), results = [];
  try {
    let ready = false; for (let i = 0; i < 200 && !ready; i++) { ready = await browser.evaluate('window.motionReady===true'); if (!ready) await delay(100); }
    if (!ready) throw new Error('Motion WebGL not initialized: ' + JSON.stringify(browser.errors));
    const quick = process.argv.includes('--quick'), selected = quick ? [0,120,126,135,150,165,180,240,246,255,270,285,300,330,420,450,480,540,600,660,720,750,780,899] : Array.from({ length: frameCount }, (_, i) => i);
    for (let camera = 0; camera < cameras.length; camera++) {
      const directory = path.join(stage, cameras[camera].id); fs.mkdirSync(directory, { recursive: true });
      for (const frame of selected) {
        const result = await browser.evaluate('window.renderMotionFrame(' + frame + ',' + camera + ')');
        fs.writeFileSync(path.join(directory, String(frame).padStart(6, '0') + '.png'), Buffer.from(result.image.split(',')[1], 'base64'));
        delete result.image; results.push({ camera: cameras[camera].id, ...result });
        if (frame % 150 === 0) console.log(cameras[camera].id + ' ' + frame + '/' + frameCount);
      }
      if (!quick) {
        cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'warning', '-y', '-framerate', String(fps), '-i', path.join(directory, '%06d.png'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, cameras[camera].id + '.mp4')], { stdio: ['ignore', 'inherit', 'inherit'] });
        const probe = JSON.parse(cp.execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(output, cameras[camera].id + '.mp4')], { encoding: 'utf8' }));
        writeJSON(path.join(output, cameras[camera].id + '-video.json'), { sha256: sha256(fs.readFileSync(path.join(output, cameras[camera].id + '.mp4'))), probe });
        for (const review of [{ id: 'overview', start: 0, rate: 1, tile: '6x5' }, { id: 'right-turn', start: 4, rate: 5, tile: '4x3' }, { id: 'half-turn', start: 8, rate: 5, tile: '4x3' }, { id: 'stop', start: 20.8, rate: 10, tile: '4x3' }]) {
          cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'warning', '-y', '-ss', String(review.start), '-i', path.join(output, cameras[camera].id + '.mp4'), '-vf', 'fps=' + review.rate + ',crop=480:680:480:0,scale=240:340,tile=' + review.tile, '-frames:v', '1', '-update', '1', path.join(output, cameras[camera].id + '-' + review.id + '.png')], { stdio: ['ignore', 'inherit', 'inherit'] });
        }
      }
    }
    const disposed = await browser.evaluate('window.disposeMotion()'); bridge.verify();
    const checks = { frameCount: selected.length, views: cameras.length, singleRenderer: true, geometryCountStable: new Set(results.map(r => r.geometries)).size === 1, maxDrawCallsPerPair: Math.max(...results.map(r => r.calls)), maxTrianglesPerPair: Math.max(...results.map(r => r.triangles)), disposed, browserErrors: browser.errors, summary: report.summary, completeVideo: !quick };
    writeJSON(path.join(output, quick ? 'quick-webgl.json' : 'webgl.json'), checks);
    if (browser.errors.length || disposed.geometries !== 0 || disposed.textures !== 0) throw new Error('Browser errors or unreleased resources');
    console.log(JSON.stringify(checks));
  } finally { await browser.close(); }
}
async function main() { const report = await extract(); if (!process.argv.includes('--extract-only')) await capture(report); }
main().catch(error => { console.error(error); process.exitCode = 1; });
