#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, THREE, createPlanarMirror, adapterModule, observerModule */
// Regression B: fresh authored StageScene + installed Three + current mirror and
// adapter, on real browser WebGL2 with an explicit Expo default-FBO semantic fixture.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const ts = require('typescript');
const Module = require('node:module');
const { installSourceBridge, mountThree, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');

if (process.argv.slice(2).some(arg=>!arg.startsWith('--out=')&&!arg.startsWith('--report='))) throw Error('usage: node scripts/qa-native-default-framebuffer.cjs [--out=directory] [--report=file]');
const root = path.resolve(__dirname, '..');
const out = path.resolve(process.argv.find(arg=>arg.startsWith('--out='))?.slice(6) || path.join(root, '.expo/goal013-1/r8-native-default-framebuffer', new Date().toISOString().replace(/[:.]/g, '-')));
fs.mkdirSync(out, { recursive: true });
const bridge = installSourceBridge(root);
// Source-only controller construction does not have an installed Expo binary.
// Keep build metadata unavailable; no synthetic device/build identifiers.
globalThis.__DEV__ = false;
const sourceLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'expo-constants') return { expoConfig: null, platform: null };
  return sourceLoad.call(this, name, ...args);
};
const React = require('react'), NodeThree = require('three');
const RC = require('../src/rendering/firstPerson/runtimeController.ts');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const { StageScene } = require('../src/domain/stages/mirror-corridor-v1/scene.tsx');
const { MIRROR_CENTER } = require('../src/domain/stages/mirror-corridor-v1/definition.ts');
const { isSafePose } = require('../src/domain/firstPerson/geometry.ts');
const BACK_CAMERA_POSITION = { x: -2.45, y: 1.6, z: 13 };

async function extractScene() {
  const controller = RC.createController(undefined, false, true, 'mirror-corridor-v1');
  if (!isSafePose({ position: BACK_CAMERA_POSITION, yaw: 0, pitch: 0 }, RC.worldForController(controller)))
    throw Error('Backside fixture camera is not physically legal');
  const camera = new NodeThree.PerspectiveCamera(65, 390 / 844, .08, 60);
  RC.syncCamera(controller, camera);
  const runtime = { current: controller.runtime }, resources = createSceneResources(false, null, true);
  const mounted = await mountThree(React.createElement(StageScene, {
    world: RC.worldForController(controller), runtime, resources,
    renderOffscreen: () => {}, onFrameError: error => { throw error; },
  }), NodeThree);
  try {
    const scene = new NodeThree.Scene(); scene.background = new NodeThree.Color('#09090C'); scene.add(camera);
    mounted.objects.forEach(object => scene.add(object));
    bridge.callbacks.filter(callback => !callback.toString().includes('mirror.render')).forEach(callback => callback({}, 0));
    scene.updateMatrixWorld(true);
    const surface = scene.getObjectByName('planar-mirror');
    if (!surface || !scene.getObjectByName('mirror-corridor-actor') || !scene.getObjectByName('control-vestibule-door'))
      throw Error('Fresh area04 scene is missing required authored objects');
    const material = surface.material, transport = new NodeThree.MeshBasicMaterial({ color: '#394A4A' });
    surface.material = transport;
    fs.writeFileSync(path.join(out, 'scene.json'), JSON.stringify(scene.toJSON()));
    surface.material = material; transport.dispose();
    let meshes = 0; scene.traverse(object => { if (object.isMesh) meshes += 1; });
    return { meshes, controllerStage: controller.runtime.stageSession.stageId,
      method: 'Fresh StageScene React host mount and current controller world; browser reconstructs exported objects and invokes current planarMirror with equivalent StageScene frustum gating.' };
  } finally {
    await mounted.unmount(); resources.dispose(); RC.retireController(controller); bridge.verify();
  }
}

function browserProgram() {
  const width = 390, height = 844;
  const assert = (value, message) => { if (!value) throw Error(message); };
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const scenePromise = fetch('./scene.json').then(response => response.json());
  const configPromise = fetch('./config.json').then(response => response.json());
  const enumName = (gl, value) => value === gl.BACK ? 'BACK' : value === gl.NONE ? 'NONE'
    : value >= gl.COLOR_ATTACHMENT0 && value < gl.COLOR_ATTACHMENT0 + 16 ? 'COLOR_ATTACHMENT' + (value - gl.COLOR_ATTACHMENT0)
      : '0x' + value.toString(16);
  // Fixture setup/disposal run outside the active product observer's lifetime.
  // During rendering, the actual nativeGlObserver is the sole error consumer.
  const drain = gl => {
    const errors = [];
    for (let i = 0; i < 8; i += 1) { const value = gl.getError(); if (value === gl.NO_ERROR) break; errors.push('0x' + value.toString(16)); }
    return errors;
  };
  const live = { renderers: 0, mirrorTargets: 0, fixtureFramebuffers: 0, canvases: 0 };
  const baseline = { ...live };

  window.runCase = async ({ name, fixed, trace, pose }) => {
    const sceneData = await scenePromise, config = await configPromise;
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    document.body.append(canvas); live.canvases += 1;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: true, stencil: false, preserveDrawingBuffer: true });
    assert(gl, 'Real browser WebGL2 is unavailable');
    const rawBind = gl.bindFramebuffer, rawDraw = gl.drawBuffers, rawRead = gl.readBuffer;
    const fixtureFbo = gl.createFramebuffer(), fixtureTexture = gl.createTexture(), fixtureDepth = gl.createRenderbuffer();
    live.fixtureFramebuffers += 1;
    rawBind.call(gl, gl.FRAMEBUFFER, fixtureFbo);
    gl.bindTexture(gl.TEXTURE_2D, fixtureTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fixtureTexture, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, fixtureDepth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, fixtureDepth);
    gl.bindTexture(gl.TEXTURE_2D, null); gl.bindRenderbuffer(gl.RENDERBUFFER, null);
    const setup = { framebufferStatus: gl.checkFramebufferStatus(gl.FRAMEBUFFER), errors: drain(gl) };
    assert(setup.framebufferStatus === gl.FRAMEBUFFER_COMPLETE && !setup.errors.length, 'Fixture setup invalid');
    let logicalDraw = null, logicalRead = null, phase = 'renderer-initialization';
    const nativeCalls = [], samples = [], traceEvents = [], counts = { reflection: 0, main: 0, presentation: 0, presentationReturns: 0 };
    gl.bindFramebuffer = function (target, framebuffer) {
      const result = rawBind.call(this, target, framebuffer === null ? fixtureFbo : framebuffer);
      if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) logicalDraw = framebuffer;
      if (target === gl.FRAMEBUFFER || target === gl.READ_FRAMEBUFFER) logicalRead = framebuffer;
      return result;
    };
    gl.drawBuffers = function (buffers) {
      nativeCalls.push({ phase, logicalDefaultDraw: logicalDraw === null, buffers: Array.from(buffers, value => enumName(gl, value)) });
      return rawDraw.call(this, buffers);
    };
    // Marker fields only enable the candidate's Expo/iOS branch. All GL calls
    // still go to real browser WebGL2; this does not claim an Expo native binary.
    gl.supportsWebGL2 = true; gl.endFrameEXP = () => {};
    const fixtureBind = gl.bindFramebuffer, fixtureDraw = gl.drawBuffers;
    // Explicit diagnostic-record fixture: these are exactly the three fields
    // consumed by the real observer. They do not identify a native device/run.
    const diagnosticRecord = { glTrace: observerModule.createGlTraceRecord(), glErrors: [], frameSequence: 1 };
    let observer;
    const adapter = fixed ? adapterModule.installNativeDefaultFramebuffer(gl, {
      platform: 'ios', owned: true, onTrace: trace ? event => {
        traceEvents.push(event);
        observer?.boundary(phase + ':' + event.operation + ':' + event.phase);
      } : undefined,
    }) : null;
    assert(!fixed || adapter, 'Candidate rejected the explicitly owned iOS semantic fixture');
    observer = observerModule.createNativeGlObserver(diagnosticRecord, gl, trace, () => adapter?.snapshot() ?? {
      draw: logicalDraw === null ? 'default' : 'offscreen', read: logicalRead === null ? 'default' : 'offscreen',
    });
    observer.boundary('pre-existing/init');
    let renderer, mirror, scene;
    const sample = label => {
      const framebufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      const entry = observer.read(label);
      const result = { phase: label, logicalDefaultDraw: logicalDraw === null,
        framebufferStatus, errors: entry.errors };
      samples.push(result); return result;
    };
    let result;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, context: gl, antialias: false, alpha: false, depth: true, stencil: false });
      live.renderers += 1;
      renderer.setPixelRatio(1); renderer.setSize(width, height); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping; renderer.info.autoReset = false;
      sample(phase);
      scene = await new THREE.ObjectLoader().parseAsync(sceneData);
      const camera = scene.getObjectByProperty('type', 'PerspectiveCamera'), surface = scene.getObjectByName('planar-mirror');
      const transportMaterial = surface.material;
      mirror = createPlanarMirror(); live.mirrorTargets += 1; surface.material = mirror.material; transportMaterial.dispose();
      if (pose === 'supplied-r7') {
        camera.position.set(0, 1.6, 2.5); camera.rotation.set(0, Math.PI, 0, 'YXZ');
      } else {
        const [x, z] = pose === 'front' ? [-1.433, 10.866] : [config.backCameraPosition.x, config.backCameraPosition.z];
        const dx = config.mirrorCenter.x - x, dz = config.mirrorCenter.z - z;
        camera.position.set(x, 1.6, z);
        camera.rotation.set(Math.atan2(config.mirrorCenter.y - 1.6, Math.hypot(dx, dz)), Math.atan2(-dx, -dz), 0, 'YXZ');
      }
      camera.aspect = width / height; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true); scene.updateMatrixWorld(true);
      const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      const visible = frustum.intersectsObject(surface);
      // Measure the actual rendered plane. An old booth fixture moved to the
      // front side when the mirror was angled toward legal work positions.
      const planeNormal = new THREE.Vector3(0, 0, 1).transformDirection(surface.matrixWorld);
      const planeSide = new THREE.Vector3().subVectors(camera.position, surface.getWorldPosition(new THREE.Vector3())).dot(planeNormal);
      if (pose === 'back') assert(planeSide < -.02 && visible, 'Back fixture must face the visible back of the actual mirror plane');
      phase = 'reflection';
      const reflected = visible && mirror.render(renderer, scene, camera, surface, (r, s, c) => {
        counts.reflection += 1; r.render(s, c); sample('reflection'); phase = 'restore';
      });
      if (visible) surface.material = reflected ? mirror.material : mirror.fallbackMaterial;
      sample(reflected ? 'restore' : 'reflection-skipped');
      phase = 'main'; counts.main += 1; renderer.render(scene, camera); sample('main');
      const renderStats = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
      // QA-only output comparison. This readback is never added to native startup.
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let pixelHash = 2166136261;
      for (const byte of pixels) { pixelHash ^= byte; pixelHash = Math.imul(pixelHash, 16777619) >>> 0; }
      sample('qa-output-readback');
      phase = 'presentation'; counts.presentation += 1;
      // An owned fixture blit, not endFrameEXP or iOS presentation. Use raw binds
      // so the actual browser default framebuffer can receive the image, then
      // restore physical bindings without changing the application's logical view.
      rawBind.call(gl, gl.READ_FRAMEBUFFER, fixtureFbo); rawBind.call(gl, gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
      rawBind.call(gl, gl.READ_FRAMEBUFFER, logicalRead === null ? fixtureFbo : logicalRead);
      rawBind.call(gl, gl.DRAW_FRAMEBUFFER, logicalDraw === null ? fixtureFbo : logicalDraw);
      counts.presentationReturns += 1; sample('presentation');
      result = { name, fixed, trace, pose, setup, camera: { position: camera.position.toArray(), yaw: camera.rotation.y, pitch: camera.rotation.x },
        visible, planeSide, reflected, material: surface.material.name, target: { width: mirror.target.width, height: mirror.target.height,
          samples: mirror.target.samples, type: mirror.target.texture.type, format: mirror.target.texture.format },
        counts, samples, nativeCalls, traceEvents, adapterSnapshot: adapter?.snapshot(),
        observerEvidence: { fixture: 'Minimal diagnostic record: real createGlTraceRecord(), empty glErrors, frameSequence=1',
          glErrors: [...diagnosticRecord.glErrors], log: JSON.parse(JSON.stringify(diagnosticRecord.glTrace)) },
        renderStats, pixelHash: pixelHash.toString(16),
        gl: { version: gl.getParameter(gl.VERSION), renderer: gl.getParameter(gl.RENDERER) } };
    } finally {
      if (result && !diagnosticRecord.glErrors.length) observer.complete(); else observer.stop();
      adapter?.stopTrace();
      if (result) result.observerEvidence.afterCompletion = { state: diagnosticRecord.glTrace.state, retainedEntries: diagnosticRecord.glTrace.entries.length };
      phase = 'disposal';
      if (scene) {
        const geometries = new Set(), materials = new Set(), textures = new Set();
        scene.traverse(object => { if (object.geometry) geometries.add(object.geometry);
          for (const material of Array.isArray(object.material) ? object.material : object.material ? [object.material] : []) {
            materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
          }
        });
        mirror?.dispose(); if (mirror) live.mirrorTargets -= 1;
        geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
        scene.clear();
      }
      if (renderer) {
        renderer.renderLists.dispose();
        if (result) result.disposedThreeMemory = { geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
        renderer.dispose(); live.renderers -= 1;
      }
      adapter?.dispose();
      const restored = gl.bindFramebuffer === fixtureBind && gl.drawBuffers === fixtureDraw && gl.readBuffer === rawRead;
      gl.bindFramebuffer = rawBind; gl.drawBuffers = rawDraw;
      rawBind.call(gl, gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fixtureFbo); gl.deleteTexture(fixtureTexture); gl.deleteRenderbuffer(fixtureDepth); live.fixtureFramebuffers -= 1;
      const deleted = !gl.isFramebuffer(fixtureFbo) && !gl.isTexture(fixtureTexture) && !gl.isRenderbuffer(fixtureDepth);
      const disposalErrors = drain(gl);
      canvas.remove(); live.canvases -= 1;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      if (result) result.disposal = { adapterMethodsRestored: restored, fixtureObjectsDeleted: deleted, errors: disposalErrors, live: { ...live }, matchesBaseline: same(live, baseline) };
    }
    return result;
  };
  window.ready = true;
}

async function main() {
  const extraction = await extractScene();
  const dependencies = {};
  for (const file of ['three.module.js', 'three.core.js']) {
    const source = path.join(root, 'node_modules/three/build', file);
    dependencies[path.relative(root, source)] = sha256(fs.readFileSync(source));
    fs.copyFileSync(source, path.join(out, file));
  }
  for (const name of ['planarMirror', 'nativeDefaultFramebuffer', 'nativeGlObserver']) {
    const filename = path.join(root, 'src/rendering/firstPerson', name + '.ts'), source = fs.readFileSync(filename, 'utf8');
    const relative = path.relative(root, filename), expected = bridge.hashes.get(relative);
    if (expected && expected !== sha256(source)) throw Error('Source changed before transpilation: ' + relative);
    bridge.hashes.set(relative, sha256(source));
    const compiled = ts.transpileModule(source, { fileName: filename, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    fs.writeFileSync(path.join(out, name + '.js'), compiled.replace("from 'three'", "from './three.module.js'"));
  }
  fs.writeFileSync(path.join(out, 'config.json'), JSON.stringify({ mirrorCenter: MIRROR_CENTER, backCameraPosition: BACK_CAMERA_POSITION }));
  fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><meta charset="utf-8"><style>body{margin:0}canvas{display:block}</style><script type="module">\n' +
    "import * as THREE from './three.module.js';\nimport {createPlanarMirror} from './planarMirror.js';\nimport * as adapterModule from './nativeDefaultFramebuffer.js';\nimport * as observerModule from './nativeGlObserver.js';\n" +
    '(' + browserProgram.toString() + ')();\n</script>');
  const browser = await openBrowser(out), results = [];
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i += 1) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors)); await delay(100);
    }
    if (!await browser.evaluate('window.ready===true')) throw Error('Regression viewer did not initialize');
    const cases = [];
    for (const pose of ['front', 'supplied-r7', 'back']) {
      cases.push({ name: 'before-' + pose, pose, fixed: false, trace: false });
      for (const trace of [false, true]) cases.push({ name: 'fixed-' + pose + (trace ? '-trace' : ''), pose, fixed: true, trace });
    }
    for (let i = 0; i < 10; i += 1) cases.push({ name: 'entry-' + (i + 1), pose: 'front', fixed: true, trace: i % 2 === 0 });
    for (const item of cases) {
      results.push(await browser.evaluate('window.runCase(' + JSON.stringify(item) + ')'));
      fs.writeFileSync(path.join(out, 'partial-results.json'), JSON.stringify(results, null, 2) + '\n');
      console.log(JSON.stringify({ completed: results.length, total: cases.length, name: item.name }));
    }
  } finally { await browser.close(); }
  bridge.verify();
  for (const [file, expected] of Object.entries(dependencies)) if (sha256(fs.readFileSync(path.join(root, file))) !== expected) throw Error('Installed Three changed during QA');
  const beforeFront = results.find(result => result.name === 'before-front');
  const rendererOwnedTextureCount = JSON.parse(fs.readFileSync(path.join(out,'scene.json'),'utf8')).materials.some(material=>material.type==='MeshStandardMaterial') ? 1 : 0;
  const fixed = results.filter(result => result.fixed), checks = {
    realInvalidOperationOnRestore: beforeFront.reflected && beforeFront.samples.some(sample => sample.phase === 'restore' && sample.framebufferStatus === 36053 && sample.errors.includes('0x502')),
    beforeReflectionClean: beforeFront.samples.find(sample => sample.phase === 'reflection')?.errors.length === 0,
    fixedPhasesClean: fixed.every(result => result.samples.every(sample => sample.errors.length === 0 && sample.framebufferStatus === 36053)),
    fixedNativeBACKRemoved: fixed.every(result => result.nativeCalls.every(call => !call.logicalDefaultDraw || !call.buffers.includes('BACK'))),
    traceIsOptionalAndBounded: fixed.every(result => result.trace
      ? result.traceEvents.length === Math.min(64, 2 * (result.adapterSnapshot.bindCalls + result.adapterSnapshot.drawBuffersCalls))
      : result.traceEvents.length === 0),
    fixedFrontReflection: fixed.filter(result => result.pose === 'front').every(result => result.reflected && result.counts.reflection === 1),
    fixedBackSkipped: fixed.filter(result => result.pose === 'back').every(result => result.planeSide < -.02 && !result.reflected && result.counts.reflection === 0 && result.material === 'chroma-rift-mirror-unavailable'),
    oneMainAndFixturePresentation: results.every(result => result.counts.main === 1 && result.counts.presentation === 1 && result.counts.presentationReturns === 1),
    traceDoesNotChangeOutput: ['front', 'supplied-r7', 'back'].every(pose => {
      const [off, on] = fixed.filter(result => result.pose === pose && result.name.startsWith('fixed-'));
      return off.pixelHash === on.pixelHash && JSON.stringify(off.renderStats) === JSON.stringify(on.renderStats) && JSON.stringify(off.samples) === JSON.stringify(on.samples);
    }),
    actualObserverTraceCostRecorded: ['front', 'supplied-r7', 'back'].every(pose => {
      const [off, on] = fixed.filter(result => result.pose === pose && result.name.startsWith('fixed-'));
      return on.observerEvidence.log.reads > off.observerEvidence.log.reads &&
        on.observerEvidence.log.reads - off.observerEvidence.log.reads === on.traceEvents.length + 1 &&
        off.observerEvidence.log.reads === off.samples.length;
    }),
    successfulObserverTraceReleased: fixed.every(result => result.observerEvidence.afterCompletion.state === 'completed' && result.observerEvidence.afterCompletion.retainedEntries === 0),
    allOwnersDisposed: results.every(result => result.disposal.adapterMethodsRestored && result.disposal.fixtureObjectsDeleted && result.disposal.matchesBaseline && !result.disposal.errors.length && !result.disposedThreeMemory.geometries && result.disposedThreeMemory.textures === rendererOwnedTextureCount),
    tenFreshEntries: results.filter(result => result.name.startsWith('entry-')).length === 10,
    browserExceptionsAbsent: browser.errors.length === 0,
  };
  const report = { schemaVersion: 1, label: 'GOAL_013_1_R8_REGRESSION_B', generatedAt: new Date().toISOString(),
    sourceCommit: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    sourceCommitScope: 'Repository HEAD at report time; exact executed candidate contents are identified by sourceHashes, including any uncommitted files below.',
    sourceWorktreeStatus: cp.execFileSync('git', ['status', '--porcelain', '--', 'src'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean),
    boundary: 'Real Chromium WebGL2/ANGLE SwiftShader with a fixture-owned RGBA8+depth FBO replacing logical default framebuffer binds. Fresh authored area04 StageScene export, installed Three renderer and current planarMirror/adapter/nativeGlObserver source. Not an Expo binary, iPhone GPU, native Canvas scheduling or endFrameEXP presentation.',
    observerBoundary: 'Actual createNativeGlObserver is the sole active-phase getError consumer. Adapter before/returned callbacks invoke its boundary method when tracing is enabled; both modes use its read method for QA phase samples. Only fixture setup/disposal use the separate drain outside its active lifetime. Read counts measure browser GL calls, not Expo queue cost, native timing, or iPhone performance.',
    observerTraceComparisons: ['front', 'supplied-r7', 'back'].map(pose => {
      const [off, on] = fixed.filter(result => result.pose === pose && result.name.startsWith('fixed-'));
      return { pose, offReads: off.observerEvidence.log.reads, onReads: on.observerEvidence.log.reads,
        extraReads: on.observerEvidence.log.reads - off.observerEvidence.log.reads,
        offBoundaries: off.observerEvidence.log.boundaries, onBoundaries: on.observerEvidence.log.boundaries,
        samePixels: off.pixelHash === on.pixelHash, offPixelHash: off.pixelHash, onPixelHash: on.pixelHash };
    }),
    presentation: 'One explicit fixture blit to the real browser default framebuffer; pre-fix cases intentionally continue after the QA observer records the illegal call so later phases can be compared. The actual product fails closed before native presentation.',
    extraction, sourceOnlyHostSubstitutions: ['Expo Constants metadata unavailable (null); __DEV__ false', 'R3F useFrame captures callbacks in the existing React/Three host bridge'],
    sourceHashes: Object.fromEntries(bridge.hashes), installedThreeHashes: dependencies,
    toolSha256: sha256(fs.readFileSync(__filename)), helperSha256: sha256(fs.readFileSync(path.join(__dirname, 'lib/three-scene-qa.cjs'))),
    sceneSha256: sha256(fs.readFileSync(path.join(out, 'scene.json'))), checks, results, browserErrors: browser.errors,
    rendererOwnedTextureCount, rendererOwnedTextureNote: 'Three PBR DFG_LUT: 16x16 RG half float, 1024 bytes; renderer-owned until renderer disposal, not scene textures.',
    nativeAcceptance: 'PENDING', RELEASE_READY: false, runDirectory: path.relative(root, out) };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  if (Object.values(checks).some(value => !value)) throw Error('Regression B gates failed: ' + JSON.stringify(checks));
  const retained = path.resolve(process.argv.find(arg=>arg.startsWith('--report='))?.slice(9) || path.join(root, 'docs/qa-goal013-1/r8-browser-framebuffer-report.json'));
  fs.copyFileSync(path.join(out, 'report.json'), retained);
  console.log(JSON.stringify({ report: path.relative(root, retained), sha256: sha256(fs.readFileSync(retained)), checks }));
}

main().catch(error => { console.error(error); process.exitCode = 1; });
