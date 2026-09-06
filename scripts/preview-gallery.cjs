#!/usr/bin/env node
'use strict';
/* global __dirname, Buffer */
/** Reproducible visual QA, not a substitute for native gameplay. Existing React
 * scene hosts are converted to Three objects, their frame callbacks sampled
 * once, then the exported scenes are rendered by actual browser WebGL.
 * No native GL, R3F reconciler, gesture/HUD, sound, or human perception is tested. */
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const zlib = require('node:zlib');
const http = require('node:http');
const cp = require('node:child_process');
const os = require('node:os');
const crypto = require('node:crypto');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'docs/qa-goal006');
const sceneOutput = path.join(root, '.expo/goal006/gallery-preview');
const frameCallbacks = [];
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText, filename);
}
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === '@react-three/fiber/native') return { useFrame: (callback) => frameCallbacks.push(callback) };
  return originalLoad.call(this, name, ...args);
};
const React = require('react');
const R = require('react-test-renderer');
const THREE = require('three');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { GalleryScene } = require('../src/rendering/firstPerson/GalleryScene.tsx');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const { galleryRaster } = require('../src/rendering/firstPerson/galleryGraphics.ts');
const G = require('../src/domain/gallery/index.ts');
const { getWorld } = require('../src/domain/firstPerson/chapter.ts');

function chunk(type, data) {
  const name = Buffer.from(type), crcData = Buffer.concat([name, data]);
  let crc = 0xffffffff;
  for (const byte of crcData) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  const length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, name, data, checksum]);
}
function png(raster) {
  const { width, height, rgba } = raster;
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('sRGB', Buffer.from([0])), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function shadowState(mode) {
  let state = G.initialShadow(G.GALLERY_SEED);
  const samples = G.createShadowSpec(state.seed, state.variant).samples;
  const pair = samples.filter((sample) => sample.color === G.SHADOW_PAIR_COLOR);
  const different = samples.find((sample) => sample.color !== G.SHADOW_PAIR_COLOR);
  if (mode === 'wrong' || mode === 'correct') {
    state = G.placeShadowSample(state, pair[0].id, 'socket-left');
    state = G.placeShadowSample(state, mode === 'correct' ? pair[1].id : different.id, 'socket-right');
    state = { ...state, inspected: true, solved: mode === 'correct', attempts: mode === 'wrong' ? 1 : 0 };
  }
  return state;
}
function contourAngles(mode) {
  const correct = G.createContourSpec(G.GALLERY_SEED).discs.map(d => d.targetAngle);
  return mode === 'correct' ? correct : mode === 'wrong' ? [correct[0] + 0.4, correct[1], correct[2]] : G.initialContour(G.GALLERY_SEED).angles;
}
function makeRuntime(view) {
  const runtime = G.createGalleryRuntime(undefined, 606);
  runtime.pose = JSON.parse(JSON.stringify(view.pose));
  if (view.unlocked || view.solved || view.variant === 'exit') {
    runtime.progress.sealA = true; runtime.progress.emblem.phase = 'released'; runtime.emblem.phase = 'released'; runtime.doorAOpen = 1;
  }
  const gp = runtime.progress.gallery;
  if (view.shadow) gp.shadow = shadowState(view.shadow);
  if (view.contour) {
    gp.contour.angles = contourAngles(view.contour);
    gp.contour.solved = view.contour === 'correct'; gp.contour.inspected = true;
  }
  if (view.solved || view.variant === 'exit') {
    gp.shadow = shadowState('correct'); gp.contour.angles = contourAngles('correct'); gp.contour.solved = true;
    runtime.progress.sealB = true; runtime.doorBOpen = 1;
  }
  if (view.variant) runtime.progress.variant = view.variant;
  if (view.finalDoorOpen) { runtime.progress.exitDoorOpen = true; runtime.doorExitOpen = 1; }
  runtime.gallery = G.initialGalleryTransient(gp, String(runtime.session));
  runtime.gallery.shadowCompare = !!view.compare; runtime.gallery.contourGuide = !!view.guide;
  return runtime;
}
function pose(x, z, yaw = 0, pitch = 0) { return { position: { x, y: 1.6, z }, yaw, pitch }; }
const views = [
  { id: 'entry', title: '入口・初期視点', pose: G.GALLERY_SPAWN },
  { id: 'a-color', title: 'A・紋章と三つの印', pose: G.GALLERY_A_OBSERVATION_POSE },
  { id: 'a-neutral', title: 'A・同じカメラで無彩色', pose: G.GALLERY_A_OBSERVATION_POSE, neutral: true },
  { id: 'hub', title: '中央回廊・A解放後', pose: pose(0, -9.5), unlocked: true },
  { id: 'b-baseline', title: 'B・初期配置', pose: G.GALLERY_SHADOW_OBSERVATION_POSE, unlocked: true, shadow: 'baseline' },
  { id: 'b-compare', title: 'B・任意の中立比較', pose: G.GALLERY_SHADOW_OBSERVATION_POSE, unlocked: true, shadow: 'baseline', compare: true },
  { id: 'b-wrong', title: 'B・異なる見本を二枚配置', pose: G.GALLERY_SHADOW_OBSERVATION_POSE, unlocked: true, shadow: 'wrong' },
  { id: 'b-correct', title: 'B・同じ見本を二枚配置、ラッチ解放', pose: G.GALLERY_SHADOW_OBSERVATION_POSE, unlocked: true, shadow: 'correct' },
  { id: 'c-baseline', title: 'C・ばらばらの円盤', pose: G.GALLERY_CONTOUR_OBSERVATION_POSE, unlocked: true, contour: 'baseline' },
  { id: 'c-guide', title: 'C・任意の輪郭ガイド', pose: G.GALLERY_CONTOUR_OBSERVATION_POSE, unlocked: true, contour: 'baseline', guide: true },
  { id: 'c-wrong', title: 'C・一枚だけ角度が不一致', pose: G.GALLERY_CONTOUR_OBSERVATION_POSE, unlocked: true, contour: 'wrong' },
  { id: 'c-correct', title: 'C・通常描画の正答、中央に三角形を描かない', pose: G.GALLERY_CONTOUR_OBSERVATION_POSE, unlocked: true, contour: 'correct' },
  { id: 'd-key', title: 'D・実投影の観察位置', pose: G.GALLERY_OBSERVATION_POSE, solved: true },
  { id: 'return-before', title: '同じ入口・変更前', pose: pose(0, -0.2, Math.PI), unlocked: true },
  { id: 'return-after', title: '同じ入口・変更後', pose: pose(0, -0.2, Math.PI), variant: 'exit' },
  { id: 'final-door', title: '最後の扉', pose: pose(0, 11.5, Math.PI), variant: 'exit' },
  { id: 'final-open', title: '最後の扉を開いた後', pose: pose(0, 11.5, Math.PI), variant: 'exit', finalDoorOpen: true },
  { id: 'b-phone320', title: 'B・320px幅の実シーン', pose: G.GALLERY_SHADOW_OBSERVATION_POSE, unlocked: true, shadow: 'baseline', width: 320, height: 568 },
  { id: 'c-phone320', title: 'C・320px幅の実シーン', pose: G.GALLERY_CONTOUR_OBSERVATION_POSE, unlocked: true, contour: 'correct', width: 320, height: 568 },
];
function makeHost(node, cache) {
  if (cache.has(node.props)) return cache.get(node.props);
  const p = node.props; let object;
  if (node.type === 'primitive') object = p.object;
  else if (node.type === 'mesh') object = new THREE.Mesh(p.geometry, p.material);
  else if (node.type === 'ambientLight') object = new THREE.AmbientLight(p.color ?? 0xffffff, p.intensity);
  else if (node.type === 'directionalLight') object = new THREE.DirectionalLight(p.color ?? 0xffffff, p.intensity);
  else object = new THREE.Group();
  if (!object?.isObject3D) throw new Error(`Unsupported scene host ${node.type}`);
  if (p.name) object.name = p.name;
  for (const property of ['position', 'scale', 'quaternion']) {
    if (p[property] === undefined) continue;
    if (typeof p[property] === 'number') object[property].setScalar(p[property]);
    else if (Array.isArray(p[property])) object[property].fromArray(p[property]);
    else object[property].copy(p[property]);
  }
  if (p.rotation) object.rotation.fromArray(p.rotation);
  for (const property of ['visible', 'castShadow', 'receiveShadow', 'frustumCulled', 'renderOrder']) if (p[property] !== undefined) object[property] = p[property];
  cache.set(node.props, object); return object;
}
function convert(instance, cache) {
  if (typeof instance === 'string') return [];
  const children = instance.children.flatMap(child => convert(child, cache));
  if (typeof instance.type !== 'string') return children;
  const object = makeHost(instance, cache);
  for (const child of children) object.add(child);
  return [object];
}
async function generate() {
  fs.mkdirSync(output, { recursive: true }); fs.mkdirSync(sceneOutput, { recursive: true });
  const panels = [];
  for (const kind of ['shadow', 'contour']) for (const state of ['baseline', 'guide', 'wrong', 'correct']) for (const size of [512, 320]) {
    const file = `panel-${kind}-${state}-${size}.png`;
    const raster = galleryRaster(kind, size, kind === 'shadow' ? { shadow: shadowState(state), compare: state === 'guide' } : { angles: contourAngles(state), guide: state === 'guide' });
    fs.writeFileSync(path.join(output, file), png(raster));
    panels.push({ file, kind, state, width: raster.width, height: raster.height, source: 'galleryGraphics.galleryRaster; same domain colors/positions used by native meshes; software raster, not GPU' });
  }
  const snapshots = [];
  const ownershipChecks = [];
  for (const view of views) {
    const runtime = makeRuntime(view), world = getWorld(runtime);
    const resources = createSceneResources(false, undefined, true);
    if (view.neutral) resources.emblemSurface.update({ ...resources.emblemSurface.appearance, presentation: 'neutral' });
    const cache = new WeakMap(); frameCallbacks.length = 0;
    let reactView;
    await R.act(async () => { reactView = R.create(React.createElement(GalleryScene, { world, runtime: { current: runtime }, progress: runtime.progress, resources, reducedMotion: true }), { createNodeMock: element => makeHost(element, cache) }); });
    const scene = new THREE.Scene();
    for (const child of convert(reactView.root, cache)) scene.add(child);
    const width = view.width ?? 390, height = view.height ?? 844;
    const camera = new THREE.PerspectiveCamera(65, width / height, .08, 60);
    camera.position.set(runtime.pose.position.x, runtime.pose.position.y, runtime.pose.position.z);
    camera.rotation.set(runtime.pose.pitch, runtime.pose.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true); scene.add(camera);
    // Execute the registered scene mutation once against its real Three refs.
    // This is a snapshot boundary, not the native R3F frame loop or presented-frame gate.
    for (const callback of frameCallbacks) callback({ scene, camera }, 0);
    scene.updateMatrixWorld(true);
    const owned = new Set();
    function visitResource(value) {
      if (!value || typeof value !== 'object') return;
      if (value.isBufferGeometry || value.isMaterial || value.isTexture) { owned.add(value); return; }
      if (Array.isArray(value)) value.forEach(visitResource);
      else if (Object.getPrototypeOf(value) === Object.prototype) Object.values(value).forEach(visitResource);
    }
    visitResource(resources);
    scene.traverse(object => { if (object.isInstancedMesh) owned.add(object); });
    const disposalCounts = new Map([...owned].map(resource => [resource, 0]));
    for (const resource of owned) resource.addEventListener('dispose', () => disposalCounts.set(resource, disposalCounts.get(resource) + 1));
    const inventory = { meshes: 0, instancedMeshes: 0, instances: 0, frameCallbacksSampled: frameCallbacks.length };
    scene.traverse(object => { if (object.isMesh) inventory.meshes += 1; if (object.isInstancedMesh) { inventory.instancedMeshes += 1; inventory.instances += object.count; } });
    fs.writeFileSync(path.join(sceneOutput, `${view.id}.json`), JSON.stringify(scene.toJSON()));
    snapshots.push({ ...view, width, height, camera: camera.uuid, file: `${view.id}.json`, image: `${view.id}.png`, inventory });
    await R.act(async () => reactView.unmount()); resources.dispose();
    const ownership = { id: view.id, resources: owned.size, disposedOnce: [...disposalCounts.values()].filter(count => count === 1).length, undisposed: [...disposalCounts.values()].filter(count => count === 0).length, disposedMultiple: [...disposalCounts.values()].filter(count => count > 1).length };
    ownershipChecks.push(ownership);
    frameCallbacks.length = 0;
    if (ownership.undisposed || ownership.disposedMultiple) throw new Error('Snapshot resource ownership failed: ' + JSON.stringify(ownership));
  }
  for (const filename of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(root, 'node_modules/three/build', filename), path.join(sceneOutput, filename));
  fs.writeFileSync(path.join(sceneOutput, 'index.html'), html(snapshots));
  const sourcePaths = ['src/rendering/firstPerson/GalleryScene.tsx', 'src/rendering/firstPerson/galleryGraphics.ts', 'src/rendering/firstPerson/galleryResources.ts', 'src/domain/gallery/definition.ts', 'src/domain/gallery/world.ts', 'src/domain/gallery/shadow.ts', 'src/domain/gallery/contour.ts'];
  const sourceHashes = Object.fromEntries(sourcePaths.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
  fs.writeFileSync(path.join(output, 'snapshot-ownership.json'), JSON.stringify({ boundary: 'CPU resource disposal in scene extraction and real React unmount effects; not native GPU, audio or application lifecycle', visits: ownershipChecks.length, allDisposedExactlyOnce: ownershipChecks.every(check => !check.undisposed && !check.disposedMultiple), checks: ownershipChecks }, null, 2) + '\n');
  const metadata = { sourceHashes, boundary: 'Authored fixture snapshots from existing GalleryScene + one sampled scene callback; no native R3F/GL/input/HUD/audio/device/perception validation', three: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/three/package.json'), 'utf8')).version, panels, snapshots };
  fs.writeFileSync(path.join(output, 'scenes.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(`Generated ${snapshots.length} native-scene snapshots and ${panels.length} software panel PNGs.`);
  return snapshots;
}
function html(snapshots) {
  return `<!doctype html><meta charset="utf-8"><title>Gallery scene WebGL QA</title><style>html,body{margin:0;background:#101619;overflow:hidden}canvas{display:block}</style><script type="module">
import * as T from './three.module.js';
const views=${JSON.stringify(snapshots)};
const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.outputColorSpace=T.SRGBColorSpace; renderer.toneMapping=T.NoToneMapping; renderer.setPixelRatio(1); document.body.append(renderer.domElement);
let previous;
function release(scene){const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());textures.forEach(x=>x.dispose());renderer.renderLists.dispose();}
window.disposeGalleryView=()=>{if(previous)release(previous);previous=null;return {geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,sceneAttached:!!previous};};
window.renderGalleryView=async(index)=>{const view=views[index];if(previous)release(previous);const data=await(await fetch(view.file)).json();const scene=await new T.ObjectLoader().parseAsync(data);previous=scene;const camera=scene.getObjectByProperty('uuid',view.camera);renderer.setSize(view.width,view.height);renderer.render(scene,camera);const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return {id:view.id,title:view.title,width:view.width,height:view.height,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),budget:{drawCalls:150,triangles:100000},withinBudget:renderer.info.render.calls<=150&&renderer.info.render.triangles<=100000,image:renderer.domElement.toDataURL('image/png')};};
window.galleryQAReady=true;
</script>`;
}

function readPNG(filename) {
  const bytes = fs.readFileSync(filename); let offset = 8, width, height, channels;
  const compressed = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8), data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9]) || data[12] !== 0) throw new Error('QA PNG must be non-interlaced RGB/RGBA8');
      channels = data[9] === 6 ? 4 : 3;
    }
    if (type === 'IDAT') compressed.push(data);
    offset += length + 12;
  }
  const raw = zlib.inflateSync(Buffer.concat(compressed)), stride = width * channels;
  const decoded = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? decoded[y * stride + x - channels] : 0;
      const b = y > 0 ? decoded[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? decoded[(y - 1) * stride + x - channels] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? Math.floor((a + b) / 2) : filter === 4 ? paeth(a, b, c) : NaN;
      if (!Number.isFinite(predictor)) throw new Error('Unsupported PNG filter');
      decoded[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
  }
  return { width, height, at(x, y) { const i = (y * width + x) * channels; return [...decoded.subarray(i, i + 3), channels === 4 ? decoded[i + 3] : 255]; } };
}
function cameraFor(view) {
  const camera = new THREE.PerspectiveCamera(65, view.width / view.height, .08, 60);
  camera.position.set(view.pose.position.x, view.pose.position.y, view.pose.position.z);
  camera.rotation.set(view.pose.pitch, view.pose.yaw, 0, 'YXZ'); camera.updateMatrixWorld(true);
  return camera;
}
function pixelAtWorld(point, camera, width, height) {
  const ndc = new THREE.Vector3(point.x, point.y, point.z).project(camera);
  return { x: Math.floor((ndc.x + 1) / 2 * width), y: Math.floor((1 - ndc.y) / 2 * height) };
}
function verifyPixelContracts(snapshots) {
  const checks = [];
  for (const id of ['b-baseline', 'b-compare', 'b-wrong', 'b-correct', 'b-phone320']) {
    const view = snapshots.find(v => v.id === id), image = readPNG(path.join(output, view.image)), camera = cameraFor(view), state = shadowState(view.shadow);
    const samples = G.createShadowSpec(state.seed, state.variant).samples.map(sample => {
      const local = G.SHADOW_SLOT_POSITIONS[state.assignments[sample.id]], f = G.GALLERY_SHADOW_FIXTURE.center;
      const pixel = pixelAtWorld({ x: f.x + local.x, y: f.y + local.y, z: f.z + .013 }, camera, view.width, view.height);
      const actual = image.at(pixel.x, pixel.y), expected = [...sample.rgba];
      return { id: sample.id, pixel, actual, expected, equal: actual.every((value, i) => value === expected[i]) };
    });
    checks.push({ id, contract: 'Native-mesh sample interior equals its canonical opaque RGBA after the browser color pipeline', passed: samples.every(sample => sample.equal), samples });
  }
  const a = snapshots.find(v => v.id === 'a-color'), aColor = readPNG(path.join(output, a.image)), aNeutral = readPNG(path.join(output, 'a-neutral.png'));
  const af = G.GALLERY_EMBLEM_FIXTURE, ac = cameraFor(a);
  const corners = [-1, 1].flatMap(sx => [-1, 1].map(sy => pixelAtWorld({ x: af.center.x + sx * af.width / 2, y: af.center.y + sy * af.height / 2, z: af.center.z }, ac, a.width, a.height)));
  const bounds = { left: Math.min(...corners.map(p => p.x)) - 1, right: Math.max(...corners.map(p => p.x)) + 1, top: Math.min(...corners.map(p => p.y)) - 1, bottom: Math.max(...corners.map(p => p.y)) + 1 };
  let changedOutsidePlate = 0, changedInsidePlate = 0;
  for (let y = 0; y < a.height; y += 1) for (let x = 0; x < a.width; x += 1) {
    if (aColor.at(x, y).every((value, i) => value === aNeutral.at(x, y)[i])) continue;
    if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) changedInsidePlate += 1;
    else changedOutsidePlate += 1;
  }
  checks.push({ id: 'a-color-vs-neutral', contract: 'Identical camera/world pixels outside the emblem plate', passed: changedOutsidePlate === 0 && changedInsidePlate > 0, bounds, changedOutsidePlate, changedInsidePlate });
  const vertices = G.createContourSpec(G.GALLERY_SEED).discs.map(disc => disc.center), expectedBackground = [232, 228, 216, 255];
  for (const id of ['c-correct', 'c-phone320']) {
    const view = snapshots.find(v => v.id === id), image = readPNG(path.join(output, view.image)), camera = cameraFor(view), f = G.GALLERY_CONTOUR_FIXTURE.center;
    let inspectedPixels = 0, nonBackgroundPixels = 0;
    for (let y = 0; y < view.height; y += 1) for (let x = 0; x < view.width; x += 1) {
      const ray = new THREE.Vector3((x + .5) / view.width * 2 - 1, 1 - (y + .5) / view.height * 2, .5).unproject(camera).sub(camera.position);
      const t = (f.z - camera.position.z) / ray.z;
      const point = { x: camera.position.x + t * ray.x - f.x, y: camera.position.y + t * ray.y - f.y };
      const edges = vertices.map((a, i) => { const b = vertices[(i + 1) % 3]; return ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y); });
      if (!edges.every(value => value > .018)) continue;
      inspectedPixels += 1;
      if (image.at(x, y).some((value, i) => value !== expectedBackground[i])) nonBackgroundPixels += 1;
    }
    checks.push({ id, contract: 'Ordinary central triangle interior remains uniform background, excluding an 18mm edge margin', inspectedPixels, nonBackgroundPixels, passed: inspectedPixels > 500 && nonBackgroundPixels === 0 });
  }
  const report = { boundary: 'Pixel facts in browser-rendered scene snapshots; no perception claim', allPassed: checks.every(check => check.passed), checks };
  fs.writeFileSync(path.join(output, 'pixel-contracts.json'), JSON.stringify(report, null, 2) + '\n');
  if (!report.allPassed) throw new Error('Browser pixel contracts failed: ' + JSON.stringify(checks.filter(check => !check.passed)));
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function capture(snapshots) {
  const requested = process.env.GALLERY_CHROME;
  const chrome = requested ?? path.join(os.homedir(), '.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell');
  if (!fs.existsSync(chrome)) throw new Error('Set GALLERY_CHROME to an existing Chromium/headless-shell executable. No browser dependency is installed by this script.');
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const filename = path.resolve(sceneOutput, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(sceneOutput + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(filename, (error, bytes) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'); response.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chroma-gallery-chrome-'));
  const child = cp.spawn(chrome, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0', `--user-data-dir=${chromeProfile}`, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || path.join(os.homedir(), '.local/opt/playwright-libs-ubuntu24/usr/lib/x86_64-linux-gnu') },
  });
  let stderr = '', socket;
  child.stderr.on('data', bytes => { stderr += bytes; });
  try {
    for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i += 1) { if (child.exitCode !== null) throw new Error(`Chromium exited ${child.exitCode}: ${stderr}`); await sleep(100); }
    const endpoint = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (!endpoint) throw new Error(`Chromium debug endpoint unavailable: ${stderr}`);
    const port = new URL(endpoint).port;
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0; const pending = new Map(), browserErrors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) { const handler = pending.get(message.id); if (handler) { pending.delete(message.id); if (message.error) handler.reject(new Error(JSON.stringify(message.error))); else handler.resolve(message.result); } }
      if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const seq = ++id; pending.set(seq, { resolve, reject }); socket.send(JSON.stringify({ id: seq, method, params })); });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/` });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i += 1) { ready = await evaluate('window.galleryQAReady === true'); if (!ready) await sleep(100); }
    if (!ready) throw new Error('WebGL viewer did not initialize. ' + JSON.stringify(browserErrors));
    const results = [];
    for (let i = 0; i < snapshots.length; i += 1) {
      const view = snapshots[i];
      await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: 1, mobile: false });
      const result = await evaluate(`window.renderGalleryView(${i})`);
      fs.writeFileSync(path.join(output, view.image), Buffer.from(result.image.split(',')[1], 'base64'));
      delete result.image; results.push(result);
      console.log(`${result.id}: ${result.calls} calls / ${result.triangles} triangles`);
    }
    await evaluate('window.disposeGalleryView()');
    const reentries = [];
    for (let visit = 0; visit < 10; visit += 1) {
      const loaded = await evaluate('window.renderGalleryView(4)');
      const disposed = await evaluate('window.disposeGalleryView()');
      reentries.push({ visit: visit + 1, loaded: { geometries: loaded.geometries, textures: loaded.textures, calls: loaded.calls }, disposed });
    }
    const lifecycle = { boundary: 'Ten load/render/dispose cycles of serialized Three scenes using one browser WebGL renderer; not ten native app reentries', rendererCount: 1, pendingCdpRequests: pending.size, disposedToZeroEachTime: reentries.every(entry => entry.disposed.geometries === 0 && entry.disposed.textures === 0 && !entry.disposed.sceneAttached), noAnimationTimersInstalledByViewer: true, reentries };
    fs.writeFileSync(path.join(output, 'webgl-lifecycle.json'), JSON.stringify(lifecycle, null, 2) + '\n');
    if (!lifecycle.disposedToZeroEachTime) throw new Error('Browser scene disposal did not return its resource counters to zero');
    verifyPixelContracts(snapshots);
    const report = { environment: 'Linux Chromium headless, browser Three WebGL/ANGLE SwiftShader; not iPhone, native R3F, or device performance', rendererCount: 1, screenshotKind: 'WebGL canvas pixels (HUD not included)', browserErrors, allWithinBudget: results.every(result => result.withinBudget), results };
    fs.writeFileSync(path.join(output, 'webgl-results.json'), JSON.stringify(report, null, 2) + '\n');
    if (browserErrors.length) throw new Error('Browser exceptions occurred: ' + JSON.stringify(browserErrors));
  } finally {
    if (socket) socket.close(); child.kill('SIGTERM'); server.close();
    fs.writeFileSync(path.join(sceneOutput, 'chromium.log'), stderr);
  }
}
(async () => {
  const snapshots = await generate();
  if (process.argv.includes('--capture')) await capture(snapshots);
})().catch(error => { console.error(error); process.exitCode = 1; });
