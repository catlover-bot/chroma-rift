#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Phase B: the actual isolated components and domain command transitions.
// Native input/HUD/full chapter sequences are a separate integration boundary.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { installSourceBridge, mountThree, openBrowser, sha256, delay } = require('./lib/three-scene-qa.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, 'docs/qa-goal009/devices'), stage = path.join(root, '.expo/goal009/vault-devices');
const bridge = installSourceBridge(root);
bridge.hashes.set('scripts/preview-vault.cjs', sha256(fs.readFileSync(__filename)));
bridge.hashes.set('scripts/lib/three-scene-qa.cjs', sha256(fs.readFileSync(path.join(__dirname, 'lib/three-scene-qa.cjs'))));
const React = require('react'), THREE = require('three');
const Components = require('../src/rendering/firstPerson/VaultDevices.tsx');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const { createVaultRuntime } = require('../src/domain/vault/runtime.ts');
const Domain = require('../src/domain/vault/state.ts'), Definition = require('../src/domain/vault/definition.ts'), Spec = require('../src/domain/vault/specs.ts');
const { getVaultWorld } = require('../src/domain/vault/world.ts');
const Projection = require('../src/rendering/firstPerson/manipulationProjection.ts');
const sizes = [[320, 568], [390, 844], [430, 932]], events = [];
const clone = value => JSON.parse(JSON.stringify(value));
const writeJSON = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
let live = createVaultRuntime(undefined, 9009), sequence = 0;
function dispatch(action, targetId) {
  const command = { sessionId: live.vault.sessionId, seq: ++sequence, nowMs: sequence * 16, action };
  const before = { length: live.vault.length, angle: live.vault.angle, saved: clone(live.progress.vault), activeDrag: live.vault.activeDrag };
  const result = Domain.applyVaultCommand(live, command, { rendererReady: true, foreground: true, targetId: targetId ?? 'vault-' + live.vault.mode });
  if (!result.accepted) throw new Error('Actual domain rejected QA command: ' + JSON.stringify(command));
  live = result.runtime; events.push({ command, accepted: result.accepted, before, after: { length: live.vault.length, angle: live.vault.angle, saved: clone(live.progress.vault), activeDrag: live.vault.activeDrag }, message: result.message });
}
function statesFor(device) {
  const result = [], take = id => result.push({ device, id, runtime: clone(live) });
  live.pose = clone(device === 'length' ? Definition.VAULT_LENGTH_POSE : Definition.VAULT_BRAKE_POSE);
  dispatch({ type: 'enter', puzzle: device }, 'vault-' + device); take('baseline');
  const context = device === 'length' ? 'finsHidden' : 'frameHidden', guide = device === 'length' ? 'lengthGuide' : 'plumb';
  dispatch({ type: 'aid', aid: context, enabled: true }); take('context-off');
  dispatch({ type: 'aid', aid: guide, enabled: true }); take('guide-on');
  dispatch({ type: 'aid', aid: context, enabled: false }); dispatch({ type: 'aid', aid: guide, enabled: false });
  const handle = value => device === 'length' ? { x: Spec.LENGTH_SPEC.left + value, y: Spec.LENGTH_SPEC.sliderY } : { x: Math.sin(value) * Spec.ROD_SPEC.length / 2, y: Math.cos(value) * Spec.ROD_SPEC.length / 2 };
  const value = () => device === 'length' ? live.vault.length : live.vault.angle;
  dispatch({ type: 'drag-start', pointerId: 7, point: handle(value()) });
  dispatch({ type: 'drag-move', pointerId: 7, point: handle(device === 'length' ? 1.05 : -.09) }); take('wrong-drag');
  dispatch({ type: 'drag-end', pointerId: 7, inside: true }); take('wrong-released');
  dispatch({ type: 'commit' }); take('wrong-committed');
  dispatch({ type: 'drag-start', pointerId: 8, point: handle(value()) });
  dispatch({ type: 'drag-move', pointerId: 8, point: handle(device === 'length' ? Spec.LENGTH_SPEC.targetLength : Domain.vaultTargetAngle()) }); take('correct-drag');
  dispatch({ type: 'drag-end', pointerId: 8, inside: true }); take('correct-released');
  dispatch({ type: 'commit' }); take('correct-committed');
  for (let i = 0; i < 60; i++) live = Domain.advanceVault(live, 1 / 60);
  take('gate-open'); dispatch({ type: 'leave' });
  return result;
}
function projectedBounds(object, camera, width, height) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  object.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (let p = mesh; p; p = p.parent) if (!p.visible) return;
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld).project(camera);
      minX = Math.min(minX, (p.x + 1) * width / 2); maxX = Math.max(maxX, (p.x + 1) * width / 2);
      minY = Math.min(minY, (1 - p.y) * height / 2); maxY = Math.max(maxY, (1 - p.y) * height / 2);
    }
  });
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, inside: minX >= 0 && maxX <= width && minY >= 0 && maxY <= height };
}
function handleProjectionChecks(states) {
  const radius = Spec.DEVICE_HANDLE_HIT_RADIUS;
  if (!Number.isFinite(radius)) throw new Error('Shared DEVICE_HANDLE_HIT_RADIUS is required for authoritative hit-target QA');
  const checks = [];
  for (const device of ['length', 'rod']) for (const [width, height] of sizes) for (const atMaxDistance of [false, true]) {
    const runtime = clone(states.find(s => s.device === device && s.id === 'baseline').runtime), world = getVaultWorld(runtime);
    const target = world.interactables.find(t => t.id === 'vault-' + device), pose = runtime.pose;
    if (atMaxDistance) {
      const dy = pose.position.y - target.center.y, d = Math.sqrt(target.maxDistance ** 2 - dy ** 2) - 1e-6;
      pose.position.x = target.center.x + target.rectangle.normal.x * d; pose.position.z = target.center.z + target.rectangle.normal.z * d;
    }
    const camera = new THREE.PerspectiveCamera(65, width / height, .05, 60); camera.position.set(pose.position.x, pose.position.y, pose.position.z); camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    const matrices = { projection: camera.projectionMatrix.toArray(), view: camera.matrixWorldInverse.toArray() };
    const project = point => { const w = Projection.fixturePointInWorld(target, point), p = new THREE.Vector3(w.x, w.y, w.z).project(camera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 }; };
    const handles = device === 'length' ? [Spec.LENGTH_SPEC.minLength, Spec.LENGTH_SPEC.initialLength, Spec.LENGTH_SPEC.targetLength, Spec.LENGTH_SPEC.maxLength].map(length => ({ length, center: { x: Spec.LENGTH_SPEC.left + length, y: Spec.LENGTH_SPEC.sliderY } }))
      : [Spec.ROD_SPEC.initialAngle, 0, Math.PI / 4, Math.PI / 2].flatMap(angle => [-1, 1].map(side => ({ angle, center: { x: side * Math.sin(angle) * Spec.ROD_SPEC.length / 2, y: side * Math.cos(angle) * Spec.ROD_SPEC.length / 2 } })));
    for (const handle of handles) {
      const samples = [];
      for (let i = 0; i < 720; i++) { const a = i * Math.PI / 360, p = { x: handle.center.x + Math.cos(a) * radius, y: handle.center.y + Math.sin(a) * radius };
        // The actual ray/plate helper clips hit areas at the board boundary.
        if (Math.abs(p.x) <= target.rectangle.width / 2 && Math.abs(p.y) <= target.rectangle.height / 2) samples.push(project(p)); }
      const hitWidth = Math.max(...samples.map(p => p.x)) - Math.min(...samples.map(p => p.x)), hitHeight = Math.max(...samples.map(p => p.y)) - Math.min(...samples.map(p => p.y));
      const fullVisibleInActualWorld = Projection.fixtureFullyVisible(pose, matrices, world, target);
      const local = Projection.pointOnFixture(pose, matrices, world, target, project(handle.center), width, height);
      checks.push({ device, width, height, atMaxDistance, sharedRadius: radius, handle, pose: clone(pose), hitWidth, hitHeight, atLeast44: hitWidth >= 44 && hitHeight >= 44,
        fullVisibleInActualWorld, centerRayRoundTripError: local ? Math.hypot(local.x - handle.center.x, local.y - handle.center.y) : null,
        boundary: atMaxDistance ? 'Geometric maximum-range target size; actual world visibility is separately reported, not assumed.' : 'Authored observation pose and actual full-device occlusion/plane projection.' });
    }
  }
  return checks;
}
async function extract() {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(stage, { recursive: true });
  const states = [...statesFor('length'), ...statesFor('rod')];
  live.pose = { position: { x: Definition.VAULT_CAFE_FIXTURE.center.x + Definition.VAULT_CAFE_FIXTURE.maxDistance - .1, y: 1.6, z: 7 }, yaw: Math.PI / 2, pitch: 0 };
  states.push({ device: 'cafe', id: 'context-on', runtime: clone(live) });
  dispatch({ type: 'cafe-inspect' }, 'vault-cafe'); states.push({ device: 'cafe', id: 'neutral', runtime: clone(live) });
  const resources = createSceneResources(false, null, true, true), views = [];
  for (const device of ['length', 'rod', 'cafe']) {
    const deviceStates = states.filter(s => s.device === device), runtime = { current: deviceStates[0].runtime };
    const Component = Components[device === 'length' ? 'VaultLengthDevice' : device === 'rod' ? 'VaultRodDevice' : 'VaultCafeWall'];
    const mount = await mountThree(React.createElement(Component, { runtime, resources }), THREE), callbacks = bridge.callbacks.splice(0);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#24332e'); scene.add(...mount.objects);
    scene.add(new THREE.AmbientLight('#c3cac3', 1.5)); const light = new THREE.DirectionalLight('#f0e3c5', 1.5); light.position.set(0, 6, 0); scene.add(light);
    for (const state of deviceStates) for (const [width, height] of sizes) {
      runtime.current = state.runtime;
      const pose = state.runtime.pose, camera = new THREE.PerspectiveCamera(65, width / height, .05, 60);
      camera.position.set(pose.position.x, pose.position.y, pose.position.z); camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
      for (const callback of callbacks) callback({ scene, camera }, 0);
      scene.updateMatrixWorld(true);
      const id = device + '-' + state.id + '-' + width, filename = id + '.json';
      const objects = device === 'length' ? ['vault-reference-shaft', 'vault-variable-shaft', 'vault-length-handle'] : device === 'rod' ? ['vault-rod-shaft', 'vault-rod-handle--1', 'vault-rod-handle-1'] : ['vault-straight-mortar-plane'];
      const geometry = Object.fromEntries(objects.map(name => { const object = scene.getObjectByName(name); return [name, { matrixWorld: object.matrixWorld.toArray(), geometrySHA256: sha256(Buffer.from(object.geometry.getAttribute('position').array.buffer)), bounds: projectedBounds(object, camera, width, height) }]; }));
      const bounds = projectedBounds(mount.objects[0], camera, width, height);
      const view = { id, device, state: state.id, width, height, pose, camera: camera.toJSON(), filename, image: id + '.png', bounds, geometry,
        transient: { length: state.runtime.vault.length, angle: state.runtime.vault.angle, activeDrag: state.runtime.vault.activeDrag }, saved: state.runtime.progress.vault };
      writeJSON(path.join(stage, filename), scene.toJSON()); views.push(view);
    }
    await mount.unmount();
  }
  resources.dispose(); bridge.verify(); writeJSON(path.join(output, 'source-hashes.json'), Object.fromEntries(bridge.hashes));
  writeJSON(path.join(stage, 'views.json'), views);
  const checks = [];
  for (const device of ['length', 'rod']) for (const [width] of sizes) {
    const baseline = views.find(v => v.id === device + '-baseline-' + width), hidden = views.find(v => v.id === device + '-context-off-' + width), guide = views.find(v => v.id === device + '-guide-on-' + width);
    checks.push({ device, width, sameMeasuredGeometryWhenContextChanges: JSON.stringify(baseline.geometry) === JSON.stringify(hidden.geometry) && JSON.stringify(hidden.geometry) === JSON.stringify(guide.geometry),
      aidsNeverSolve: !hidden.saved[device].solved && !guide.saved[device].solved,
      dragDoesNotPersistOrSolve: (() => { const v = views.find(v => v.id === device + '-correct-drag-' + width); return !v.saved[device].solved && (device === 'length' ? v.transient.length !== v.saved.length.length : v.transient.angle !== v.saved.rod.angle); })(),
      releaseDoesNotSolve: !views.find(v => v.id === device + '-correct-released-' + width).saved[device].solved,
      wrongCommitDoesNotSolve: !views.find(v => v.id === device + '-wrong-committed-' + width).saved[device].solved,
      correctCommitSolves: views.find(v => v.id === device + '-correct-committed-' + width).saved[device].solved,
      entireDeviceInFrame: views.filter(v => v.device === device && v.width === width).every(v => v.bounds.inside) });
  }
  for (const [width] of sizes) {
    const on = views.find(v => v.id === 'cafe-context-on-' + width), off = views.find(v => v.id === 'cafe-neutral-' + width);
    checks.push({ device: 'cafe', width, sameStraightMortarGeometry: JSON.stringify(on.geometry) === JSON.stringify(off.geometry), optionalComparisonDoesNotCloseExit: !off.saved.finalDoorClosed, entireDeviceInFrame: on.bounds.inside && off.bounds.inside });
  }
  const handles = handleProjectionChecks(states);
  writeJSON(path.join(output, 'domain-and-projection.json'), { boundary: 'Actual domain commands and actual isolated device components. Local plane input simulates command data, not native touch, HUD exclusion or real finger gestures.', rendererMounts: 3, events, checks, handles, views });
  return { views, checks, handles };
}
async function capture(data) {
  for (const file of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(stage, file));
  fs.writeFileSync(path.join(stage, 'index.html'), `<!doctype html><meta charset="utf-8"><style>body{margin:0}canvas{display:block}</style><script type="module">
import * as THREE from './three.module.js';const views=await(await fetch('./views.json')).json();const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);let scene;
function dispose(){if(scene){const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const value of Object.values(m))if(value?.isTexture)ts.add(value);}});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();scene=null;renderer.renderLists.dispose();}return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};}
window.captureVaultDevice=async i=>{dispose();const v=views[i];scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./'+v.filename)).json());const camera=new THREE.ObjectLoader().parse(v.camera);renderer.setSize(v.width,v.height);renderer.render(scene,camera);return{id:v.id,image:renderer.domElement.toDataURL('image/png'),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};};window.disposeVaultDevices=dispose;window.vaultDevicesReady=true;
</script>`);
  const browser = await openBrowser(stage), results = [];
  try {
    let ready = false; for (let i = 0; i < 150 && !ready; i++) { ready = await browser.evaluate('window.vaultDevicesReady===true'); if (!ready) await delay(100); }
    if (!ready) throw new Error('Vault WebGL not initialized');
    for (let i = 0; i < data.views.length; i++) {
      const result = await browser.evaluate('window.captureVaultDevice(' + i + ')'); fs.writeFileSync(path.join(output, data.views[i].image), Buffer.from(result.image.split(',')[1], 'base64')); delete result.image; results.push(result);
    }
    const disposed = await browser.evaluate('window.disposeVaultDevices()'); bridge.verify();
    const atlases = [];
    for (const device of ['length', 'rod']) for (const [width] of sizes) {
      const selected = data.views.filter(v => v.device === device && v.width === width), directory = path.join(stage, 'atlas-' + device + '-' + width);
      fs.mkdirSync(directory, { recursive: true });
      selected.forEach((view, i) => fs.copyFileSync(path.join(output, view.image), path.join(directory, String(i).padStart(2, '0') + '.png')));
      const filename = device + '-' + width + '-overview.png';
      cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'warning', '-y', '-framerate', '1', '-i', path.join(directory, '%02d.png'), '-vf', 'scale=iw/2:ih/2,tile=5x2', '-frames:v', '1', '-update', '1', path.join(output, filename)], { stdio: ['ignore', 'inherit', 'inherit'] });
      atlases.push({ image: filename, order: 'Left to right, then next row; half-resolution copies of the actual WebGL PNGs, no extra model or UI.', sourceImages: selected.map(v => v.image) });
    }
    writeJSON(path.join(output, 'atlas-index.json'), atlases);
    writeJSON(path.join(output, 'webgl.json'), { boundary: 'Linux Chromium ANGLE SwiftShader WebGL; one browser renderer. Not native GL, perceptual validation, or iPhone gameplay.', rendererCount: 1, disposed, browserErrors: browser.errors, results });
    console.log(JSON.stringify({ views: results.length, disposed, failed: data.checks.filter(c => Object.entries(c).some(([key, value]) => !['device', 'width'].includes(key) && value === false)) }));
    if (browser.errors.length || disposed.geometries || disposed.textures) throw new Error('Browser errors or resource leak');
    if (results.some(result => result.calls > 150 || result.triangles > 100000)) throw new Error('Device WebGL budget exceeded');
    if (data.checks.some(c => Object.entries(c).some(([key, value]) => !['device', 'width'].includes(key) && value === false)) || data.handles.some(h => !h.atLeast44 || !h.atMaxDistance && (!h.fullVisibleInActualWorld || h.centerRayRoundTripError > 1e-7))) throw new Error('Device semantic, framing or 44pt projection gate failed');
  } finally { await browser.close(); }
}
async function main() { const data = await extract(); if (!process.argv.includes('--extract-only')) await capture(data); }
main().catch(error => { console.error(error); process.exitCode = 1; });
