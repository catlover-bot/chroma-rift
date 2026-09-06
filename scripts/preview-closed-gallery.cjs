#!/usr/bin/env node
'use strict';
/* global __dirname, Buffer */
/** Reproducible visual QA, not a substitute for native gameplay. Existing React
 * scene hosts are converted to Three objects, their frame callbacks sampled
 * once, then the exported scenes are rendered by actual browser WebGL.
 * Actual HUD hosts/styles are translated to browser CSS; native GL, R3F
 * reconciliation, Yoga/text metrics, gestures, sound and perception are not tested. */
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
const output = path.join(root, 'docs/qa-goal007/gallery');
const sceneOutput = path.join(root, '.expo/goal007/gallery-preview');
const frameCallbacks = [];
let currentView, hudController;
let interceptScreenController = false;
const flattenStyle = style => Array.isArray(style) ? Object.assign({}, ...style.map(flattenStyle)) : style && typeof style === 'object' ? style : {};
const RN = {
  View: 'View', Text: 'Text', Switch: 'Switch', Modal: () => null,
  Pressable: props => React.createElement('Pressable', { ...props, style: typeof props.style === 'function' ? props.style({ pressed: false }) : props.style }, props.children),
  ScrollView: props => React.createElement('ScrollView', props, props.children),
  StyleSheet: { create: value => value, flatten: flattenStyle, absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } },
  useWindowDimensions: () => ({ width: currentView?.width ?? 390, height: currentView?.height ?? 844, fontScale: currentView?.fontScale ?? 1, scale: 1 }),
  AccessibilityInfo: { isScreenReaderEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove() {} }), announceForAccessibility() {} },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'ios', select: choices => choices.ios ?? choices.default },
};
const audioStub = { DEFAULT_AUDIO_PREFERENCES: { enabled: false, musicVolume: .18, effectsVolume: .35 }, createGalleryAudio: () => ({ setActive() {}, updatePreferences() {}, dispose() {} }) };
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText, filename);
}
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (name === 'react-native') return RN;
  if (name === 'react-native-safe-area-context') return { SafeAreaView: 'View', useSafeAreaInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) };
  if (name === 'react-native-reanimated') return { __esModule: true, default: { View: 'View' }, useSharedValue: value => { const [shared] = React.useState(() => ({ value, set(next) { this.value = next; } })); return shared; }, useAnimatedStyle: callback => callback() };
  if (name === 'expo-clipboard') return { setStringAsync: async () => {} };
  if (name === 'expo-haptics') return { selectionAsync: async () => {} };
  if (name.endsWith('/audio') || name === '../audio') return audioStub;
  if (name.endsWith('/FirstPersonCanvas')) return { FirstPersonCanvas: props => { const { onReady, onSnapshot } = props; React.useEffect(() => { onReady(); onSnapshot(RC.controllerSnapshot(hudController)); }, [onReady, onSnapshot]); return React.createElement('CanvasPlaceholder'); } };
  if (name.endsWith('/RawGLProof')) return { RawGLProof: () => null };
  if (interceptScreenController && name.endsWith('/runtimeController')) {
    const actual = originalLoad.call(this, name, ...args);
    return { ...actual, createController: () => hudController, attachControllerAudio: () => () => {} };
  }
  if (name === '@react-three/fiber/native') return { useFrame: (callback) => frameCallbacks.push(callback) };
  return originalLoad.call(this, name, ...args);
};
const React = require('react');
const R = require('react-test-renderer');
const THREE = require('three');
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { GalleryScene } = require('../src/rendering/firstPerson/GalleryScene.tsx');
const { createSceneResources } = require('../src/rendering/firstPerson/resources.ts');
const G = require('../src/domain/gallery/index.ts');
const Actor = require('../src/domain/gallery/actor.ts');
const standbyPosition = Actor.GALLERY_ACTOR_ROUTE[5], standbyFrom = Actor.GALLERY_ACTOR_ROUTE[4];
const standbyYaw = Math.atan2(standbyFrom.x - standbyPosition.x, standbyFrom.z - standbyPosition.z);
const { getWorld } = require('../src/domain/firstPerson/chapter.ts');
const RC = require('../src/rendering/firstPerson/runtimeController.ts');
const { galleryDeviceScreenBounds } = require('../src/rendering/firstPerson/galleryController.ts');
const { createCheckpoint } = require('../src/domain/firstPerson/checkpoint.ts');
const { DEFAULT_SETTINGS, DEFAULT_FIRST_PERSON_CONTROLS } = require('../src/types/application.ts');
globalThis.__DEV__ = false;
interceptScreenController = true;
const { FirstPersonScreen } = require('../src/screens/FirstPersonScreen.tsx');
interceptScreenController = false;
function hudNode(node) {
  if (typeof node === 'string') return node;
  const children = node.children.map(hudNode).flat().filter(child => child !== null);
  if (typeof node.type !== 'string') return children;

  const p = node.props;
  return { type: node.type, style: flattenStyle(typeof p.style === 'function' ? p.style({ pressed: false }) : p.style),
    contentStyle: flattenStyle(p.contentContainerStyle), testID: p.testID, label: p.accessibilityLabel, disabled: !!p.disabled,
    pointerEvents: p.pointerEvents, children };
}
async function extractHUD(view, runtime, camera) {
  currentView = view;
  hudController = RC.createController(createCheckpoint(runtime), false, true, G.GALLERY_CHAPTER_ID);
  hudController.runtime = runtime;
  hudController.viewport = { width: view.width, height: view.height };
  hudController.matrices = { view: Array.from(camera.matrixWorldInverse.elements), projection: Array.from(camera.projectionMatrix.elements) };
  Object.assign(hudController.diagnostics, { stage: 'ready', rendererOwnership: 'live', appActive: true, paused: false, open: false });
  let tree;
  await R.act(async () => {
    tree = R.create(React.createElement(FirstPersonScreen, { chapterId: G.GALLERY_CHAPTER_ID, checkpoint: createCheckpoint(runtime),
      settings: { ...DEFAULT_SETTINGS, haptics: false }, controls: DEFAULT_FIRST_PERSON_CONTROLS, preferredColor: 'neutral',
      onboarding: { schemaVersion: 1, tutorialCompleted: true, controlChoiceAcknowledged: true },
      onSettingsChange() {}, onControlsChange() {}, onCheckpoint() {}, onComplete() {}, onRestart() {}, onExit() {},
    }));
  });
  const result = { tree: hudNode(tree.root), controllerMode: hudController.runtime.gallery?.mode,
    deviceBounds: galleryDeviceScreenBounds(hudController), objective: RC.controllerSnapshot(hudController).objective,
    status: G.galleryDeviceStatus(hudController.runtime) };
  await R.act(async () => tree.unmount());
  return result;
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
function pose(x, z, yaw = 0, pitch = 0) { return { position: { x, y: 1.6, z }, yaw, pitch }; }
function makeRuntime(view) {
  let runtime = G.createGalleryRuntime(undefined, 707); const gp = runtime.progress.gallery;
  runtime.pose = JSON.parse(JSON.stringify(view.pose));
  gp.emergencyLit = !view.unlit; gp.exitInspected = !!view.inspected || !!view.mode;
  if (view.shadow) {
    gp.shadow = shadowState(['two', 'drawer', 'taken'].includes(view.shadow) ? 'correct' : view.shadow === 'one' ? 'baseline' : view.shadow);
    gp.shadow.solved = ['drawer', 'taken'].includes(view.shadow);
    if (view.shadow === 'one') {
      const first = G.createShadowSpec(gp.shadow.seed, gp.shadow.variant).samples.find(sample => sample.color === G.SHADOW_PAIR_COLOR);
      gp.shadow = G.placeShadowSample(gp.shadow, first.id, 'socket-left');
    }
    gp.powerTaken.shadow = view.shadow === 'taken';
  }
  if (view.contour) {
    const aligned = ['aligned', 'drawer', 'taken'].includes(view.contour);
    gp.contour.angles = contourAngles(aligned ? 'correct' : view.contour);
    gp.contour.solved = ['drawer', 'taken'].includes(view.contour);
    gp.powerTaken.contour = view.contour === 'taken';
  }
  if (view.power >= 1) { gp.shadow = { ...shadowState('correct'), solved: true }; gp.powerTaken.shadow = true; }
  if (view.power >= 2) { gp.contour.angles = contourAngles('correct'); gp.contour.solved = true; gp.powerTaken.contour = true; }
  if (view.onlyContourPower) { gp.contour.angles = contourAngles('correct'); gp.contour.solved = true; gp.powerTaken.contour = true; }
  gp.powerConnected = !!view.connected;
  if (view.absence) gp.story = { ...gp.story, foreshadowed: true, absence: true };
  runtime.progress.exitDoorOpen = !!view.finalDoorOpen; runtime.doorExitOpen = Number(!!view.finalDoorOpen);
  runtime.gallery = G.initialGalleryTransient(gp, String(runtime.session));
  runtime.gallery.mode = view.mode ?? 'explore'; runtime.gallery.shadowCompare = !!view.compare;
  runtime.gallery.contourGuide = !!view.guide; runtime.gallery.chromaticNeutral = !!view.neutral;
  runtime.gallery.doorShadowOpen = Number(gp.shadow.solved); runtime.gallery.doorContourOpen = Number(gp.contour.solved);
  runtime.gallery.serviceDoorOpen = Number(gp.powerConnected);
  if (view.actor) Object.assign(runtime.gallery.actor, view.actor);
  if (view.departureTime !== undefined) {
    Object.assign(runtime.gallery.actor, { position: { x: 0, y: 0, z: 9 }, phase: 'departing', routeIndex: 1, visible: true });
    const { advanceGalleryActor } = require('../src/domain/gallery/actor.ts');
    for (let elapsed = 0; elapsed < view.departureTime - 1e-9; elapsed += .05) runtime = advanceGalleryActor(runtime, Math.min(.05, view.departureTime - elapsed), { intensity: 'standard' }).runtime;
  }
  if (view.shadow === 'wrong') runtime.gallery.lastDeviceResult = { puzzle: 'shadow', correct: false };
  return runtime;
}
const views = [
  { id: 'entry-before', pose: G.GALLERY_SPAWN, unlit: true }, { id: 'entry-after', pose: G.GALLERY_SPAWN },
  ...[0, 1, 2].map(power => ({ id: 'exit-' + power, pose: G.GALLERY_SPAWN, power, inspected: true })),
  { id: 'exit-connected', pose: G.GALLERY_SPAWN, power: 2, connected: true },
  { id: 'hub-b-first', pose: pose(0, -10), power: 1 }, { id: 'hub-c-first', pose: pose(0, -10), onlyContourPower: true },
  ...['baseline', 'one', 'two', 'wrong', 'drawer', 'taken'].map(shadow => ({ id: 'b-' + shadow, pose: G.GALLERY_SHADOW_OBSERVATION_POSE, mode: 'shadow', shadow })),
  { id: 'b-compare', pose: G.GALLERY_SHADOW_OBSERVATION_POSE, mode: 'shadow', shadow: 'baseline', compare: true },
  ...['baseline', 'aligned', 'drawer', 'taken'].map(contour => ({ id: 'c-' + contour, pose: G.GALLERY_CONTOUR_OBSERVATION_POSE, mode: 'contour', contour })),
  { id: 'c-guide', pose: G.GALLERY_CONTOUR_OBSERVATION_POSE, mode: 'contour', contour: 'aligned', guide: true },
  { id: 'color-exhibit', pose: pose(0, -2, Math.PI / 2) }, { id: 'neutral-exhibit', pose: pose(0, -2, Math.PI / 2), neutral: true },
  { id: 'service-open', pose: G.GALLERY_SERVICE_CHECKPOINT, power: 2, connected: true },
  { id: 'final-door', pose: G.GALLERY_FINAL_CHECKPOINT, power: 2, connected: true },
  { id: 'actor-foreshadow', pose: pose(0, 3.8, Math.PI) },
  { id: 'actor-foreshadow-side', pose: pose(.2, 3.8, Math.PI - Math.atan2(.2, 5.2)) },
  ...[0, 1, 2, 4].map(departureTime => ({ id: 'actor-depart-' + departureTime, pose: pose(0, 3.8, Math.PI), power: 1, absence: true, departureTime })),
  { id: 'actor-empty-plinth', pose: pose(0, 3.8, Math.PI), power: 1, absence: true },
  { id: 'retreat-west-opening', pose: pose(4, 10.5, 2.3, -.2), power: 2, connected: true, absence: true, actor: { position: { x: 4, y: 0, z: 15 }, phase: 'patrol', visible: true } },
  { id: 'retreat-east-opening', pose: pose(4, 13, -2.2, -.2), power: 2, connected: true, absence: true, actor: { position: { x: 4, y: 0, z: 10.8 }, phase: 'patrol', visible: true } },
  { id: 'actor-retreat-west', pose: G.GALLERY_SAFE_RETREATS[0], power: 2, connected: true, absence: true, actor: { position: { x: 4, y: 0, z: 12.8 }, phase: 'patrol', visible: true, travelledDistance: .18 } },
  { id: 'actor-retreat-east', pose: G.GALLERY_SAFE_RETREATS[1], power: 2, connected: true, absence: true, actor: { position: { x: 4, y: 0, z: 14.1 }, phase: 'patrol', visible: true, yaw: Math.PI, travelledDistance: .35 } },
  { id: 'final-door-approach', pose: pose(4, 14.5, Math.PI), power: 2, connected: true, absence: true, actor: { position: { x: 4, y: 0, z: 10.8 }, phase: 'patrol', visible: true, yaw: 0 } },
  { id: 'actor-passed', pose: pose(4, 14.5, Math.PI), power: 2, connected: true, absence: true, actor: { position: { x: 4, y: 0, z: 10.8 }, phase: 'patrol', visible: true } },
  { id: 'actor-subdued', pose: pose(4, 13.2, Math.PI), power: 2, connected: true, absence: true, actor: { position: standbyPosition, yaw: standbyYaw, phase: 'patrol', visible: true, intensity: 'subdued' } },
  ...['shadow', 'contour'].map(mode => ({ id: mode + '-drawer-320', pose: mode === 'shadow' ? G.GALLERY_SHADOW_OBSERVATION_POSE : G.GALLERY_CONTOUR_OBSERVATION_POSE, mode, [mode]: 'drawer', width: 320, height: 568 })),
];
for (const [width, height] of [[320, 568], [390, 844], [430, 932]]) for (const fontScale of [1, 2]) for (const puzzle of ['b', 'c']) {
  if (width === 390 && fontScale === 1) continue;
  const view = { id: `${puzzle}-layout-${width}-font${fontScale}`, pose: puzzle === 'b' ? G.GALLERY_SHADOW_OBSERVATION_POSE : G.GALLERY_CONTOUR_OBSERVATION_POSE,
    mode: puzzle === 'b' ? 'shadow' : 'contour', shadow: puzzle === 'b' ? 'baseline' : undefined, contour: puzzle === 'c' ? 'aligned' : undefined, width, height, fontScale };
  views.push(view);
  if (puzzle === 'b') views.push({ id: `entry-layout-${width}-font${fontScale}`, pose: G.GALLERY_SPAWN, width, height, fontScale, unlit: true });
  if (fontScale === 2) views.push({ ...view, id: view.id + '-scrolled', scrollBottom: true });
}
for (const view of views) { view.width ??= 390; view.height ??= 844; view.fontScale ??= 1; view.title = view.id; }
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
  const snapshots = [];
  const actorEnvelopeChecks = [];
  const ownershipChecks = [];
  for (const view of views) {
    const runtime = makeRuntime(view), world = getWorld(runtime);
    if (!require('../src/domain/firstPerson/geometry.ts').isSafePose(runtime.pose, world)) throw new Error('QA camera is not in walkable space: ' + view.id);
    const resources = createSceneResources(false, undefined, true);
    const cache = new WeakMap(); frameCallbacks.length = 0;
    let reactView;
    await R.act(async () => { reactView = R.create(React.createElement(GalleryScene, { world, runtime: { current: runtime }, progress: runtime.progress, resources, reducedMotion: false }), { createNodeMock: element => makeHost(element, cache) }); });
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
    const hud = await extractHUD(view, makeRuntime(view), camera);
    view.hud = hud;
    const surfaceIntersections = [];
    for (const id of ['sample-a', 'sample-b', 'sample-c']) {
      const surface = scene.getObjectByName(id + '-interior'), frame = scene.getObjectByName(id + '-outer-frame');
      const inverse = surface.matrixWorld.clone().invert();
      frame.traverse(part => {
        if (!part.isMesh) return;
        part.geometry.computeBoundingBox();
        const box = part.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(part.matrixWorld));
        const overlapX = Math.min(.5, box.max.x) - Math.max(-.5, box.min.x), overlapY = Math.min(.5, box.max.y) - Math.max(-.5, box.min.y);
        if (box.min.z <= 0 && box.max.z >= 0 && overlapX > 1e-6 && overlapY > 1e-6) surfaceIntersections.push({ surface: id, overlapX, overlapY });
      });
    }
    const actor = scene.getObjectByName('gallery-exhibit-actor'), actorBounds = actor ? new THREE.Box3().setFromObject(actor) : null;
    const volumeFor = require('../src/domain/gallery/actor.ts').actorVolume;
    if (view.id === 'entry-before') {
      const savedActor = runtime.gallery.actor;
      for (const yaw of [0, Math.PI / 4, Math.PI / 2, Math.PI, -Math.PI / 2, standbyYaw]) for (const travelledDistance of [0, Math.PI / 12, Math.PI / 4]) {
        runtime.gallery.actor = { ...savedActor, visible: true, position: { ...standbyPosition }, yaw, travelledDistance };
        for (const callback of frameCallbacks) callback({ scene, camera }, 0);
        scene.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(actor), v = volumeFor(runtime);
        const walls = getWorld(runtime).solids.filter(solid => solid.kind === 'wall' || solid.kind === 'door');
        const wallIntersections = walls.filter(wall => ['x','y','z'].every(axis => Math.min(bounds.max[axis],wall.max[axis]) - Math.max(bounds.min[axis],wall.min[axis]) > 1e-6)).map(wall=>wall.id);
        let maxHorizontalVertexRadius = 0;
        actor.traverse(part => {
          if (!part.isMesh) return;
          const vertices = part.geometry.getAttribute('position'), vertex = new THREE.Vector3();
          for (let index = 0; index < vertices.count; index++) {
            vertex.fromBufferAttribute(vertices, index).applyMatrix4(part.matrixWorld);
            maxHorizontalVertexRadius = Math.max(maxHorizontalVertexRadius, Math.hypot(vertex.x - runtime.gallery.actor.position.x, vertex.z - runtime.gallery.actor.position.z));
          }
        });
        actorEnvelopeChecks.push({ yaw, travelledDistance, maxHorizontalVertexRadius, collisionRadius: Actor.ACTOR_COLLISION_RADIUS, insideCollisionRadius: maxHorizontalVertexRadius <= Actor.ACTOR_COLLISION_RADIUS + 1e-6, position: runtime.gallery.actor.position, min: bounds.min.toArray(), max: bounds.max.toArray(),
          insideConservativeVolume: ['x','y','z'].every(axis => bounds.min[axis]>=v.min[axis]-1e-6&&bounds.max[axis]<=v.max[axis]+1e-6),
          wallIntersections, standbyOrientation: yaw === standbyYaw });
      }
      runtime.gallery.actor = savedActor;
      for (const callback of frameCallbacks) callback({ scene, camera }, 0);
      scene.updateMatrixWorld(true);
    }
    const volume = volumeFor(runtime);
    const actorInsideDomainVolume = !actorBounds || ['x','y','z'].every(axis => actorBounds.min[axis] >= volume.min[axis] - 1e-6 && actorBounds.max[axis] <= volume.max[axis] + 1e-6);
    view.geometryAudit = { actorInsideDomainVolume, sampleFrameIntersections: surfaceIntersections, actorWorldBounds: actorBounds ? { min: actorBounds.min.toArray(), max: actorBounds.max.toArray() } : null, actorState: runtime.gallery.actor };
    const f = view.mode === 'shadow' ? G.GALLERY_SHADOW_FIXTURE : view.mode === 'contour' ? G.GALLERY_CONTOUR_FIXTURE : null;
    if (f) {
      const project = (x, y) => { const p = new THREE.Vector3(f.center.x + x, f.center.y + y, f.center.z).project(camera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 }; };
      const points = view.mode === 'shadow' ? G.SAMPLE_IDS.map(id => ({ id, ...G.SHADOW_SLOT_POSITIONS[runtime.progress.gallery.shadow.assignments[id]], half: G.SHADOW_SAMPLE_SIZE / 2 + G.SHADOW_HIT_SLOP })) :
        G.createContourSpec(runtime.progress.gallery.contour.seed).discs.map(d => ({ id: 'disc-' + d.id, ...d.center, half: d.radius * 1.2 }));
      view.hitRects = points.map(p => { const a = project(p.x - p.half, p.y + p.half), b = project(p.x + p.half, p.y - p.half); return { id: p.id, left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y }; });
    }
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
  const sourcePaths = ['src/screens/FirstPersonScreen.tsx', 'src/rendering/firstPerson/GalleryManipulation.tsx', 'src/rendering/firstPerson/SceneActionButton.tsx', 'src/rendering/firstPerson/controlLayout.ts', 'src/rendering/firstPerson/PanelFixture.tsx', 'src/rendering/firstPerson/GalleryScene.tsx', 'src/rendering/firstPerson/galleryGraphics.ts', 'src/rendering/firstPerson/galleryResources.ts', 'src/domain/gallery/definition.ts', 'src/domain/gallery/world.ts', 'src/domain/gallery/shadow.ts', 'src/domain/gallery/contour.ts', 'src/rendering/firstPerson/GalleryActor.tsx', 'src/domain/gallery/actor.ts', 'src/rendering/firstPerson/galleryController.ts', 'src/rendering/firstPerson/manipulationProjection.ts', 'src/domain/firstPerson/panelFixture.ts', 'src/domain/gallery/selectors.ts', 'scripts/preview-closed-gallery.cjs'];
  const sourceHashes = Object.fromEntries(sourcePaths.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
  fs.writeFileSync(path.join(output, 'actor-envelope.json'), JSON.stringify({ allPassed: actorEnvelopeChecks.every(check => check.insideConservativeVolume && check.insideCollisionRadius && (!check.standbyOrientation || check.wallIntersections.length === 0)), boundary: 'Actual mesh world bounds and horizontal vertex radius at authored yaw and maximum stride. Arbitrary yaw at standby is a stress fixture, not a claim that every pose occurs in gameplay.', checks: actorEnvelopeChecks }, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'snapshot-ownership.json'), JSON.stringify({ boundary: 'CPU resource disposal in scene extraction and real React unmount effects; not native GPU, audio or application lifecycle', visits: ownershipChecks.length, allDisposedExactlyOnce: ownershipChecks.every(check => !check.undisposed && !check.disposedMultiple), checks: ownershipChecks }, null, 2) + '\n');
  const metadata = { sourceHashes, boundary: 'Authored fixture snapshots from existing GalleryScene + one sampled scene callback; actual HUD hosts/styles translated to browser CSS; no native R3F/GL/input/Yoga/audio/device/perception validation', three: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/three/package.json'), 'utf8')).version, panels, snapshots };
  fs.writeFileSync(path.join(output, 'scenes.json'), JSON.stringify(metadata, null, 2) + '\n');
  console.log(`Generated ${snapshots.length} authored-scene snapshots and ${panels.length} software panel PNGs.`);
  return snapshots;
}
function html(snapshots) {
  return `<!doctype html><meta charset="utf-8"><title>Closed gallery component/WebGL QA</title>
<style>html,body{margin:0;overflow:hidden;background:#101619;font-family:'Noto Sans CJK JP',sans-serif}*{box-sizing:border-box}#hud{display:flex;position:relative;flex-direction:column}.rn-view,.rn-scroll,.rn-pressable,.rn-canvas{display:flex;position:relative;flex-direction:column;align-items:stretch;flex-shrink:0;min-width:0;min-height:0;border:0 solid black}.rn-text{position:relative;white-space:pre-wrap;overflow-wrap:anywhere;flex-shrink:0;margin:0;font-size:14px;line-height:1.2}.rn-scroll{overflow:auto;flex-shrink:1}.rn-canvas{position:absolute;inset:0;pointer-events:none}canvas{display:block}.qa-hit{position:absolute;pointer-events:none;border:1px dashed #ffcc44}</style>
<div id="hud"></div><script type="module">
import * as T from './three.module.js';
const views=${JSON.stringify(snapshots)}, root=document.getElementById('hud');
const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.outputColorSpace=T.SRGBColorSpace; renderer.toneMapping=T.NoToneMapping; renderer.setPixelRatio(1);
let previous;
const unitless=new Set(['opacity','flex','flexGrow','flexShrink','fontWeight','zIndex','order','aspectRatio']);
function css(element,style,scale){for(const [key,raw] of Object.entries(style||{})){let value=raw;
if(key==='paddingHorizontal'||key==='marginHorizontal'){for(const side of ['Left','Right'])css(element,{[key.replace('Horizontal',side)]:value},scale);continue;}
if(key==='paddingVertical'||key==='marginVertical'){for(const side of ['Top','Bottom'])css(element,{[key.replace('Vertical',side)]:value},scale);continue;}
if(key==='transform'){element.style.transform=value.map(t=>Object.entries(t).map(([k,v])=>k+'('+v+(typeof v==='number'&&(k.startsWith('translate'))?'px':'')+')').join(' ')).join(' ');continue;}
if(typeof value==='number'&&['fontSize','lineHeight'].includes(key))value*=scale;
if(typeof value==='number'&&!unitless.has(key))value+='px';element.style[key]=value;
}}
function dom(node,scale){if(Array.isArray(node)){const fragment=document.createDocumentFragment();for(const c of node)fragment.append(dom(c,scale));return fragment;}
if(typeof node==='string')return document.createTextNode(node);if(!node)return document.createDocumentFragment();
const e=document.createElement('div');e.className=node.type==='Text'?'rn-text':node.type==='Pressable'?'rn-pressable':node.type==='ScrollView'?'rn-scroll':node.type==='CanvasPlaceholder'?'rn-canvas':'rn-view';
css(e,node.style,scale);if(node.testID)e.dataset.testid=node.testID;if(node.label)e.dataset.label=node.label;
if(node.type==='Pressable'){e.setAttribute('role','button');e.dataset.disabled=String(node.disabled);}
if(node.type==='CanvasPlaceholder')e.append(renderer.domElement);
else if(node.type==='ScrollView'){const inner=document.createElement('div');inner.className='rn-view';css(inner,node.contentStyle,scale);for(const child of node.children)inner.append(dom(child,scale));e.append(inner);}
else for(const child of node.children)e.append(dom(child,scale));return e;}
function rect(e){const r=e.getBoundingClientRect();return {left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}
function release(scene){const geometries=new Set(),materials=new Set(),textures=new Set();scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});geometries.forEach(x=>x.dispose());materials.forEach(x=>x.dispose());textures.forEach(x=>x.dispose());renderer.renderLists.dispose();}
window.disposeGalleryView=()=>{if(previous)release(previous);previous=null;return {geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,sceneAttached:!!previous};};
window.renderGalleryView=async(index)=>{const view=views[index];if(previous)release(previous);const data=await(await fetch(view.file)).json();const scene=await new T.ObjectLoader().parseAsync(data);previous=scene;const camera=scene.getObjectByProperty('uuid',view.camera);
renderer.setSize(view.width,view.height);root.style.width=view.width+'px';root.style.height=view.height+'px';root.replaceChildren(dom(view.hud.tree,view.fontScale));
renderer.render(scene,camera);await document.fonts.ready;
const scroll=root.querySelector('[data-testid="gallery-device-scroll"]');if(scroll&&view.scrollBottom)scroll.scrollTop=scroll.scrollHeight;
const controls=root.querySelector('[data-testid="gallery-device-controls"]'), buttons=[...root.querySelectorAll('[role="button"]')].map(e=>{const r=rect(e), clip=e.closest('.rn-scroll'), c=clip?rect(clip):{left:0,top:0,right:view.width,bottom:view.height}; return {label:e.dataset.label,disabled:e.dataset.disabled==='true',...r,visibleRect:{left:Math.max(r.left,c.left),top:Math.max(r.top,c.top),right:Math.min(r.right,c.right),bottom:Math.min(r.bottom,c.bottom)}};});
const panel=view.hud.deviceBounds;const controlRect=scroll?rect(scroll):null;
const pauseElement=root.querySelector('[data-testid="pause-control"]'), objectiveElement=root.querySelector('[data-testid="current-objective"]'), powerElement=root.querySelector('[data-testid="gallery-power-stock"]');
const pause=pauseElement?rect(pauseElement):null,objective=objectiveElement?rect(objectiveElement):null,powerStock=powerElement?rect(powerElement):null;
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const hudLayout={boundary:'Browser CSS layout of actual FirstPersonScreen host tree/styles; not native Yoga/text metrics',fontScale:view.fontScale,buttons,pause,objective,powerStock,pauseOverlapsObjective:!!pause&&!!objective&&overlaps(pause,objective),pauseOverlapsPowerStock:!!pause&&!!powerStock&&overlaps(pause,powerStock),scroll:scroll?{...rect(scroll),scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight}:null,
controls:controls?rect(controls):null,panel,controlsOverlapPanel:!!panel&&!!controlRect&&overlaps(panel,controlRect),hitRects:view.hitRects??[],hitTargetsAtLeast44:(view.hitRects??[]).every(r=>r.width>=44&&r.height>=44),
buttonsAtLeast44:buttons.every(b=>b.width>=44&&b.height>=44),dragHitsBlockedByButtons:(view.hitRects??[]).filter(r=>buttons.some(b=>b.visibleRect.right>b.visibleRect.left&&b.visibleRect.bottom>b.visibleRect.top&&overlaps(r,b.visibleRect))).map(r=>r.id)};
const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');return {id:view.id,title:view.title,width:view.width,height:view.height,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),budget:{drawCalls:150,triangles:100000},withinBudget:renderer.info.render.calls<=150&&renderer.info.render.triangles<=100000,hudLayout,image:renderer.domElement.toDataURL('image/png')};};
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
  for (const view of snapshots.filter(v => v.mode === 'shadow')) {
    const runtime = makeRuntime(view), camera = cameraFor(view), image = readPNG(path.join(output, view.id + '-scene.png'));
    for (const sample of G.createShadowSpec(runtime.progress.gallery.shadow.seed, runtime.progress.gallery.shadow.variant).samples) {
      const local = G.SHADOW_SLOT_POSITIONS[runtime.progress.gallery.shadow.assignments[sample.id]], f = G.GALLERY_SHADOW_FIXTURE.center;
      const pixel = pixelAtWorld({ x: f.x + local.x, y: f.y + local.y, z: f.z + .013 }, camera, view.width, view.height);
      const expected = [1, 3, 5].map(offset => parseInt(sample.color.slice(offset, offset + 2), 16)).concat(255), actual = image.at(pixel.x, pixel.y);
      checks.push({ id: view.id + '/' + sample.id, contract: 'Opaque sample center retains canonical RGBA across source, slot and neutral comparison', expected, actual, passed: expected.every((value, i) => value === actual[i]) });
    }
  }
  const colorView = snapshots.find(v => v.id === 'color-exhibit'), neutralView = snapshots.find(v => v.id === 'neutral-exhibit');
  const colored = readPNG(path.join(output, colorView.id + '-scene.png')), neutral = readPNG(path.join(output, neutralView.id + '-scene.png'));
  const f = G.GALLERY_CHROMATIC_FIXTURE, camera = cameraFor(colorView);
  const corners = [-1, 1].flatMap(x => [-1, 1].map(y => pixelAtWorld({ x: f.center.x, y: f.center.y + y * f.height / 2, z: f.center.z + x * f.width / 2 }, camera, colorView.width, colorView.height)));
  const bounds = { left: Math.min(...corners.map(p => p.x)) - 1, right: Math.max(...corners.map(p => p.x)) + 1, top: Math.min(...corners.map(p => p.y)) - 1, bottom: Math.max(...corners.map(p => p.y)) + 1 };
  let changedInsidePlate = 0, changedOutsidePlate = 0;
  for (let y = 0; y < colorView.height; y++) for (let x = 0; x < colorView.width; x++) {
    if (colored.at(x, y).every((value, channel) => value === neutral.at(x, y)[channel])) continue;
    if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) changedInsidePlate++; else changedOutsidePlate++;
  }
  checks.push({ id: 'optional-color-comparison', contract: 'Color comparison changes only pixels within the same planar exhibit, with identical camera/world/actor', changedInsidePlate, changedOutsidePlate, passed: changedInsidePlate > 0 && changedOutsidePlate === 0 });
  const vertices = G.createContourSpec(G.GALLERY_SEED).discs.map(disc => disc.center), expectedBackground = [232, 228, 216, 255];
  for (const view of snapshots.filter(v => v.mode === 'contour' && v.contour === 'aligned' && !v.guide && !v.scrollBottom)) {
    const image = readPNG(path.join(output, view.id + '-scene.png')), camera = cameraFor(view), f = G.GALLERY_CONTOUR_FIXTURE.center;
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
    checks.push({ id: view.id, contract: 'Ordinary central triangle interior remains uniform background, excluding 18mm edge margin and all HUD pixels', inspectedPixels, nonBackgroundPixels, passed: inspectedPixels > 500 && nonBackgroundPixels === 0 });
  }
  const report = { boundary: 'Raw browser WebGL canvas pixels; no perception claim. HUD reticle is deliberately outside this clean-stimulus test.', allPassed: checks.every(check => check.passed), checks };
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
      fs.writeFileSync(path.join(output, view.id + '-scene.png'), Buffer.from(result.image.split(',')[1], 'base64'));
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, view.image), Buffer.from(screenshot.data, 'base64'));
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
    const geometry = snapshots.map(view => ({ id: view.id, ...view.geometryAudit }));
    const layoutPassed = results.every(result => { const h = result.hudLayout; return !h.pauseOverlapsObjective && !h.pauseOverlapsPowerStock && !h.controlsOverlapPanel && h.hitTargetsAtLeast44 && h.buttonsAtLeast44 && h.dragHitsBlockedByButtons.length === 0; });
    const envelope = JSON.parse(fs.readFileSync(path.join(output, 'actor-envelope.json'), 'utf8'));
    const geometryPassed = envelope.allPassed && geometry.every(check => check.sampleFrameIntersections.length === 0 && check.actorInsideDomainVolume);
    fs.writeFileSync(path.join(output, 'layout-and-geometry.json'), JSON.stringify({ boundary: 'Actual Three geometry and projection; actual component host tree translated to browser CSS. Not native Yoga, finger interaction or device evidence.', layoutPassed, geometryPassed, geometry, layouts: results.map(result => ({ id: result.id, ...result.hudLayout })) }, null, 2) + '\n');
    if (!layoutPassed || !geometryPassed) throw new Error('Layout or geometry audit failed; inspect layout-and-geometry.json');
    const report = { environment: 'Linux Chromium headless, browser Three WebGL/ANGLE SwiftShader; not iPhone, native R3F, or device performance', rendererCount: 1, screenshotKind: 'Browser composite of actual scene + actual React component host tree/CSS approximation; raw WebGL canvas separately preserved', browserErrors, allWithinBudget: results.every(result => result.withinBudget), results };
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
