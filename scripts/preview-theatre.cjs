#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
const fs = require('node:fs'), path = require('node:path');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const root = path.resolve(__dirname, '..'), output = path.join(root, '.expo/goal010/theatre-preflight');
fs.mkdirSync(output, { recursive: true });
const bridge = installSourceBridge(root), React = require('react'), THREE = require('three');
const { TheatreScene } = require('../src/rendering/firstPerson/TheatreScene.tsx');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const { createTheatreRuntime } = require('../src/domain/theatre/runtime.ts');
const { getTheatreWorld } = require('../src/domain/theatre/world.ts');
const D = require('../src/domain/theatre/definition.ts'), L = require('../src/domain/theatre/lightGate.ts'), A = require('../src/domain/theatre/perspectiveExhibit.ts');
const { VERTICAL_FOV, CAMERA_NEAR, CAMERA_FAR } = require('../src/domain/firstPerson/chapter.ts');
const json = (file, data) => fs.writeFileSync(path.join(output, file), JSON.stringify(data));
async function extract() {
  const runtime = { current: createTheatreRuntime() }, resources = createSceneResources(false, null, true, false, true), scene = new THREE.Scene();
  scene.background = new THREE.Color('#171a1b');
  const mount = await mountThree(React.createElement(TheatreScene, { world: getTheatreWorld(runtime.current), runtime, resources, reducedMotion: false, onFrameError: error => { throw error; } }), THREE);
  for (const object of mount.objects) scene.add(object);
  const callbacks = bridge.callbacks.splice(0); callbacks.forEach(fn => fn({}, 0)); scene.updateMatrixWorld(true);
  const lineObjects = ['ames-fixed-structure-and-scale-lines', 'ames-observation-opening'].map(n => scene.getObjectByName(n));
  if (lineObjects.some(o => !o?.isLineSegments)) throw Error('Actual Ames lines were not preserved by QA host bridge');
  const props = A.AMES_PROPS.map(p => scene.getObjectByName(p.id));
  if (props.some(p => !p?.isMesh) || props[0].geometry !== props[1].geometry) throw Error('Ames props must use the same actual geometry');
  json('scene.json', scene.toJSON());
  const records = [], configurations = [
    ['light-initial', D.THEATRE_SPAWN, 0, false],
    ['light-wrong', D.THEATRE_SPAWN, .25, false],
    ['light-left-valid-uncommitted', D.THEATRE_SPAWN, -.9, false],
    ['light-right-valid-uncommitted', D.THEATRE_SPAWN, .65, false],
    ['ames-front-closed', A.AMES_OBSERVATION_POINTS.front, 0, false],
    ['ames-intermediate-closed', A.AMES_OBSERVATION_POINTS.intermediate, 0, false],
    ['ames-side-closed', A.AMES_OBSERVATION_POINTS.side, 0, false],
    ['ames-side-open', A.AMES_OBSERVATION_POINTS.side, 0, true],
    ['ames-intermediate-open', A.AMES_OBSERVATION_POINTS.intermediate, 0, true],
    ['ames-front-open', A.AMES_OBSERVATION_POINTS.front, 0, true],
    ['ames-side-wide-open', { position: { x: -11.45, y: 1.6, z: 10.3 }, yaw: -.6, pitch: -.12 }, 0, true],
    ['ames-intermediate-facing-open', { position: { x: -5, y: 1.6, z: 9.35 }, yaw: 1, pitch: -.1 }, 0, true],
    ['ames-intermediate-front-offset', { position: { x: -4.3, y: 1.6, z: 7.45 }, yaw: 1.5, pitch: 0 }, 0, false],
  ];
  for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) for (const [name, pose, rail, open] of configurations) {
    runtime.current = createTheatreRuntime(); runtime.current.pose = pose; runtime.current.theatre.rail = rail; runtime.current.progress.theatre.inspectionShutterOpen = open;
    callbacks.forEach(fn => fn({}, 0)); scene.updateMatrixWorld(true);
    const camera = new THREE.PerspectiveCamera(VERTICAL_FOV, width / height, CAMERA_NEAR, CAMERA_FAR);
    camera.position.set(pose.position.x, pose.position.y, pose.position.z); camera.rotation.set(pose.pitch, pose.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
    const objects = []; scene.traverse(o => objects.push({ uuid: o.uuid, matrix: o.matrix.toArray(), visible: o.visible, material: !Array.isArray(o.material) ? o.material?.uuid : undefined }));
    const geometry = resources.theatreResources.shadowGeometry, count = geometry.drawRange.count;
    const attribute = geometry.getAttribute('position');
    const shadow = { uuid: geometry.uuid, count, position: Array.from(attribute.array.slice(0, count * 3)) };
    const projectedBounds = name => {
      const obj = scene.getObjectByName(name), box = new THREE.Box3().setFromObject(obj), points = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) points.push(new THREE.Vector3(x, y, z).project(camera));
      return { left: Math.min(...points.map(p => (p.x + 1) * width / 2)), right: Math.max(...points.map(p => (p.x + 1) * width / 2)), top: Math.min(...points.map(p => (1 - p.y) * height / 2)), bottom: Math.max(...points.map(p => (1 - p.y) * height / 2)) };
    };
    records.push({ id: name + '-' + width, name, width, height, pose, rail, inspectionOpen: open, camera: camera.toJSON(), objects, shadow,
      semantics: { canLock: L.evaluateLight(rail).canLock, accepted: runtime.current.progress.theatre.light.accepted, gateOpen: runtime.current.theatre.lightGateOpen },
      bounds: Object.fromEntries(['bounded-projection-receiver', 'actual-coat-occluding-surface', 'movable-point-light', ...A.AMES_PROPS.map(p => p.id)].map(n => [n, projectedBounds(n)])),
      props: props.map(o => ({ name: o.name, position: o.position.toArray(), scale: o.scale.toArray(), geometry: o.geometry.uuid })) });
  }
  await mount.unmount(); resources.dispose(); bridge.verify();
  json('views.json', records); json('source-hashes.json', Object.fromEntries(bridge.hashes)); return records;
}
function viewer() {
  for (const file of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(root, 'node_modules/three/build', file), path.join(output, file));
  fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden}canvas{display:block}</style><script type="module">
import * as THREE from './three.module.js';
const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);
const data=await(await fetch('./views.json')).json(),scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./scene.json')).json()),objects=new Map(),geometries=new Map(),materials=new Map();
scene.traverse(o=>{objects.set(o.uuid,o);if(o.geometry)geometries.set(o.geometry.uuid,o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.set(m.uuid,m);});
window.draw=async id=>{const r=data.find(v=>v.id===id);for(const v of r.objects){const o=objects.get(v.uuid);o.matrix.fromArray(v.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=v.visible;if(v.material)o.material=materials.get(v.material);}const g=geometries.get(r.shadow.uuid),a=g.getAttribute('position');a.array.set(r.shadow.position);a.needsUpdate=true;g.setDrawRange(0,r.shadow.count);g.computeBoundingSphere();const camera=new THREE.ObjectLoader().parse(r.camera);renderer.setSize(r.width,r.height);scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);renderer.render(scene,camera);await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};};
window.finish=()=>{geometries.forEach(g=>g.dispose());const textures=new Set();materials.forEach(m=>{for(const t of Object.values(m))if(t?.isTexture)textures.add(t);m.dispose();});textures.forEach(t=>t.dispose());scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});scene.clear();renderer.renderLists.dispose();return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderers:1};};window.ready=true;
</script>`);
}
async function main() {
  const records = await extract(); viewer(); const browser = await openBrowser(output), reports = [];
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) await delay(100);
    for (const r of records) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: r.width, height: r.height, deviceScaleFactor: 1, mobile: false });
      const metrics = await browser.evaluate('window.draw(' + JSON.stringify(r.id) + ')');
      const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const file = r.id + '.png'; fs.writeFileSync(path.join(output, file), Buffer.from(shot.data, 'base64'));
      reports.push({ id: r.id, file, sha256: sha256(fs.readFileSync(path.join(output, file))), width: r.width, height: r.height, pose: r.pose, rail: r.rail, inspectionOpen: r.inspectionOpen, semantics: r.semantics, bounds: r.bounds, props: r.props, ...metrics });
    }
    const disposed = await browser.evaluate('window.finish()'); json('report.json', { cases: reports.length, sceneMounts: 1, toolHash: sha256(fs.readFileSync(__filename)),
      boundary: 'Actual TheatreScene with authored fixed runtime values. Scene useFrame callbacks run at delta0; no fake silhouette or per-camera prop scaling. No controller interaction/HUD/route or real-device perception verified at this preflight phase. Raw geometry/object snapshots remain in .expo.',
      maxCalls: Math.max(...reports.map(r => r.calls)), maxTriangles: Math.max(...reports.map(r => r.triangles)), disposed, errors: browser.errors, reports });
    if (disposed.geometries || disposed.textures || browser.errors.length) throw Error('WebGL disposal/error gate failed');
  } finally { await browser.close(); }
  bridge.verify(); console.log(JSON.stringify({ views: records.length, output }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
