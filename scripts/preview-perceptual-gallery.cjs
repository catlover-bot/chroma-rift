#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
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
const actorBefore = process.argv.includes('--actor-before');
const output = path.join(root, actorBefore ? 'docs/qa-goal008/actor-before' : 'docs/qa-goal008/gallery');
const sceneOutput = path.join(root, actorBefore ? '.expo/goal008/actor-before' : '.expo/goal008/gallery-preview');
const baselineRevision = '8ca5ba3456c7f54284981e9cae1b0d5a8848b21d';
let baselineActorModule;
if (actorBefore) { fs.mkdirSync(sceneOutput, { recursive: true }); fs.writeFileSync(path.join(sceneOutput, 'GalleryActor.baseline.tsx'), cp.execFileSync('git', ['show', baselineRevision + ':src/rendering/firstPerson/GalleryActor.tsx'], { cwd: root })); }
const frameCallbacks = [];
const loadedSourceHashes = new Map();
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const readSource = filename => { const source=fs.readFileSync(filename,'utf8'),key=path.relative(root,filename),hash=sha256(source);if(loadedSourceHashes.has(key)&&loadedSourceHashes.get(key)!==hash)throw new Error('Source changed between loads: '+key);loadedSourceHashes.set(key,hash);return source; };
loadedSourceHashes.set('scripts/preview-perceptual-gallery.cjs',sha256(fs.readFileSync(__filename)));
let currentView, hudController;
let interceptScreenController = false;
const flattenStyle = style => Array.isArray(style) ? Object.assign({}, ...style.map(flattenStyle)) : style && typeof style === 'object' ? style : {};
const RN = {
  View: 'View', Text: 'Text', Image: 'Image', Switch: 'Switch', Modal: () => null,
  Pressable: props => React.createElement('Pressable', { ...props, style: typeof props.style === 'function' ? props.style({ pressed: false }) : props.style }, props.children),
  ScrollView: props => React.createElement('ScrollView', props, props.children),
  StyleSheet: { create: value => value, flatten: flattenStyle, absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } },
  useWindowDimensions: () => ({ width: currentView?.width ?? 390, height: currentView?.height ?? 844, fontScale: currentView?.fontScale ?? 1, scale: 1 }),
  AccessibilityInfo: { isScreenReaderEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove() {} }), announceForAccessibility() {} },
  AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'ios', select: choices => choices.ios ?? choices.default },
};
const audioStub = { DEFAULT_AUDIO_PREFERENCES: { enabled: false, musicVolume: .18, effectsVolume: .35, illusionEnabled: true }, normalizeAudioPreferences: p => ({enabled:false,musicVolume:.18,effectsVolume:.35,illusionEnabled:true,...p}), createGalleryAudio: () => ({ beginEnding() {}, setActive() {}, setPreviewActive() {}, playIllusion() {}, stopIllusion() {}, updatePreferences() {}, dispose() {} }) };
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (mod, filename) => mod._compile(ts.transpileModule(readSource(filename), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 }, fileName: filename,
  }).outputText, filename);
}
require.extensions['.png']=(mod,filename)=>{mod.exports={uri:'data:image/png;base64,'+fs.readFileSync(filename).toString('base64')};};
function rasterPNG(width,height,rgba){
 const crc=bytes=>{let c=0xffffffff;for(const v of bytes){c^=v;for(let i=0;i<8;i++)c=c&1?(c>>>1)^0xedb88320:c>>>1;}return(c^0xffffffff)>>>0;};
 const chunk=(name,data)=>{const t=Buffer.from(name),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,data])),data.length+8);return out;};
 const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;const scan=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)Buffer.from(rgba.buffer,rgba.byteOffset+y*width*4,width*4).copy(scan,y*(width*4+1)+1);
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(scan)),chunk('IEND',Buffer.alloc(0))]);
}
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  if (actorBefore && name.endsWith('/GalleryActor')) {
    if (!baselineActorModule) {
      const filename = path.join(root, 'src/rendering/firstPerson/GalleryActor.tsx');
      baselineActorModule = new Module(filename, module); baselineActorModule.filename = filename; baselineActorModule.paths = Module._nodeModulePaths(path.dirname(filename));
      baselineActorModule._compile(ts.transpileModule(fs.readFileSync(path.join(sceneOutput, 'GalleryActor.baseline.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText, filename);
    }
    return baselineActorModule.exports;
  }
  if (name === 'react-native') return RN;
  if (name === 'react-native-safe-area-context') return { SafeAreaView: 'View', useSafeAreaInsets: () => ({ left: 0, right: 0, top: 0, bottom: 0 }) };
  if (name === 'react-native-reanimated') return { __esModule: true, default: { View: 'View' }, useSharedValue: value => { const [shared] = React.useState(() => ({ value, set(next) { this.value = next; } })); return shared; }, useAnimatedStyle: callback => callback() };
  if (name === '@shopify/react-native-skia') return { Canvas:'View', Image:props=>React.createElement('Image',{style:{width:props.width,height:props.height},source:{uri:'data:image/png;base64,'+rasterPNG(props.image.width,props.image.height,props.image.bytes).toString('base64')}}),ColorType:{RGBA_8888:0},AlphaType:{Opaque:0},FilterMode:{Linear:0},MipmapMode:{None:0},Skia:{Data:{fromBytes:bytes=>({bytes,dispose(){}})},Image:{MakeImage:(info,data)=>({...info,bytes:data.bytes,dispose(){}})}} }; // Exact app comparison pixels; native Skia is outside this browser boundary.
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
const standbyPosition = Actor.GALLERY_ACTOR_ROUTE.at(-1), standbyFrom = Actor.GALLERY_ACTOR_ROUTE.at(-2);
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
    pointerEvents: p.pointerEvents, source:p.source?.uri, children };
}
async function extractHUD(view, runtime, camera) {
  currentView = view;
  if(view.notebook)return extractNotebook(view,runtime);
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

async function extractNotebook(view,runtime){
 const {DiscoveryNotebook}=require('../src/screens/DiscoveryNotebook.tsx');const {ILLUSION_NOTES}=require('../src/content/illusionNotes.ts');let tree,preview;
 const props={progress:runtime.progress.gallery,completed:true,settings:{...DEFAULT_SETTINGS,audio:audioStub.DEFAULT_AUDIO_PREFERENCES},onSettingsChange(){},onClose(){},onPreview:p=>{preview=p;},onPlaySound(){},onStopSound(){}};
 await R.act(async()=>{tree=R.create(React.createElement(DiscoveryNotebook,props));});
 const press=async label=>{const host=tree.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label)[0];if(!host)throw new Error('Notebook button missing: '+label);await R.act(async()=>host.props.onPress());};
 if(view.notebook!=='list')await press(view.notebook==='credits'?'出典と素材クレジット':ILLUSION_NOTES.find(n=>n.id===view.notebook).title+'（自由比較）');
 for(const label of view.notebookPresses??[])await press(label);
 if(view.notebookAdjust){const {label,value}=view.notebookAdjust;const slider=tree.root.findAll(n=>n.type==='View'&&n.props.accessibilityRole==='adjustable'&&n.props.accessibilityLabel===label)[0];if(!slider)throw new Error('Notebook slider missing');const range=slider.props.accessibilityValue;await R.act(async()=>{slider.props.onLayout({nativeEvent:{layout:{width:240}}});slider.props.onTouchStart({nativeEvent:{changedTouches:[{identifier:19,locationX:240*(value-range.min)/(range.max-range.min)}]}});slider.props.onTouchEnd({nativeEvent:{changedTouches:[{identifier:19,locationX:0}]}});});}
 const node=hudNode(tree.root);const result={tree:view.notebook==='mask'?[{type:'CanvasPlaceholder',style:{},children:[]},node]:node,controllerMode:'paused-comparison',deviceBounds:null,objective:'Explicit post-completion notebook fixture; no discovery is added',notebookPreview:preview};await R.act(async()=>tree.unmount());return result;
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
  gp.maskWindowOpen = !!view.maskWindow;
  gp.wiring = { ...gp.wiring, offset: view.wiringOffset ?? .24, cover: view.wiringCover ?? 0, inspected: !!view.mode, solved: !!view.wiringSolved };
  gp.finalDoorClosed = !!view.finalDoorClosed;
  if(view.finalDoorClosed){runtime.progress.cleared=true;gp.story.resolved=true;}
  if (view.absence) gp.story = { ...gp.story, foreshadowed: true, absence: true };
  runtime.progress.exitDoorOpen = !!view.finalDoorOpen; runtime.doorExitOpen = Number(!!view.finalDoorOpen);
  runtime.gallery = G.initialGalleryTransient(gp, String(runtime.session));
  runtime.gallery.mode = view.mode ?? 'explore'; runtime.gallery.shadowCompare = !!view.compare;
  runtime.gallery.contourGuide = !!view.guide; runtime.gallery.chromaticNeutral = !!view.neutral;
  runtime.gallery.doorShadowOpen = Number(gp.shadow.solved); runtime.gallery.doorContourOpen = Number(gp.contour.solved);
  runtime.gallery.serviceDoorOpen = Number(gp.powerConnected);
  runtime.gallery.wiringOffset = gp.wiring.offset; runtime.gallery.wiringCover = gp.wiring.cover; runtime.gallery.wiringDoorOpen = Number(gp.wiring.solved);
  if (view.actor) Object.assign(runtime.gallery.actor, view.actor);
  if (view.departureTime !== undefined) {
    Object.assign(runtime.gallery.actor, { position: { x: 0, y: 0, z: 9 }, phase: 'departing', routeIndex: 1, visible: true });
    const { advanceGalleryActor } = require('../src/domain/gallery/actor.ts');
    for (let elapsed = 0; elapsed < view.departureTime - 1e-9; elapsed += .05) runtime = advanceGalleryActor(runtime, Math.min(.05, view.departureTime - elapsed), { intensity: 'standard' }).runtime;
  }
  if (view.shadow === 'wrong') runtime.gallery.lastDeviceResult = { puzzle: 'shadow', correct: false };
  return runtime;
}
const comparisonActor = { position: { x: 0, y: 0, z: 9 }, phase: 'patrol', visible: true, yaw: 0, travelledDistance: 0 };
const actorViews = [
  { id: 'actor-front', pose: pose(0, 6.4, Math.PI) },
  { id: 'actor-quarter', pose: pose(2.6, 8.6, Math.atan2(2.6, -.4)) },
  { id: 'actor-side', pose: pose(2.6, 9, Math.PI / 2) },
  { id: 'actor-back', pose: pose(0, 11.6, 0) },
].map(v => ({ ...v, power: 2, connected: true, wiringSolved: true, actor: comparisonActor }));
const views = actorBefore ? actorViews : [
  ...actorViews,
  { id: 'entry-before', pose: G.GALLERY_SPAWN, unlit: true }, { id: 'entry-after', pose: G.GALLERY_SPAWN },
  { id: 'b-baseline', pose: G.GALLERY_SHADOW_OBSERVATION_POSE, mode: 'shadow', shadow: 'baseline' },
  { id: 'b-drawer', pose: G.GALLERY_SHADOW_OBSERVATION_POSE, mode: 'shadow', shadow: 'drawer' },
  { id: 'c-aligned', pose: G.GALLERY_CONTOUR_OBSERVATION_POSE, mode: 'contour', contour: 'aligned' },
  { id: 'c-drawer', pose: G.GALLERY_CONTOUR_OBSERVATION_POSE, mode: 'contour', contour: 'drawer' },
  { id: 'color-exhibit', pose: pose(0, -2, Math.PI / 2) }, { id: 'neutral-exhibit', pose: pose(0, -2, Math.PI / 2), neutral: true },
  { id: 'mask-front', pose: pose(-.2, -5, -Math.PI / 2) },
  { id: 'mask-left', pose: pose(.1, -5.8, -Math.PI / 2 - Math.atan(.8/2.15)) },
  { id: 'mask-right', pose: pose(.1, -4.2, -Math.PI / 2 + Math.atan(.8/2.15)) },
  { id: 'mask-window-closed', pose: pose(1.7, -3.6, -.55) },
  { id: 'mask-window-open', pose: pose(1.7, -3.6, -.55), maskWindow: true },
  ...[['near',-.48],['middle',.82],['far',2.42]].map(([label,x]) => ({ id: 'hybrid-'+label, pose: pose(x,-6.5,Math.PI/2) })),
  ...[false,true].flatMap(correct => [false,true].map(open => ({ id: `wiring-${correct?'correct':'offset'}-${open?'open':'covered'}`, pose: G.GALLERY_WIRING_OBSERVATION_POSE, mode: 'wiring', power: 2, connected: true, wiringOffset: correct?0:.24, wiringCover: open?-.97:0 }))),
  { id: 'wiring-released', pose: G.GALLERY_WIRING_OBSERVATION_POSE, mode: 'wiring', power: 2, connected: true, wiringOffset: 0, wiringCover: -.97, wiringSolved: true },
];
if (!actorBefore) for (const [width,height] of [[320,568],[390,844],[430,932]]) for (const fontScale of [1,2]) for (const mode of ['shadow','contour','wiring']) {
  const view={id:`${mode}-layout-${width}-font${fontScale}`,pose:mode==='shadow'?G.GALLERY_SHADOW_OBSERVATION_POSE:mode==='contour'?G.GALLERY_CONTOUR_OBSERVATION_POSE:G.GALLERY_WIRING_OBSERVATION_POSE,mode,width,height,fontScale,shadow:mode==='shadow'?'baseline':undefined,contour:mode==='contour'?'aligned':undefined,power:mode==='wiring'?2:0,connected:mode==='wiring'};
  views.push(view); if(fontScale===2)views.push({...view,id:view.id+'-scrolled',scrollBottom:true});
}
if(!actorBefore){
 const actorAt=(x,z,yaw=0,phase='patrol')=>({position:{x,y:0,z},yaw,phase,visible:true,travelledDistance:1.2});
 views.push(
  {id:'actor-safe-crossing',pose:pose(0,3.8,Math.PI),power:2,connected:true,actor:actorAt(.28,9,-Math.PI/2,'crossing-pause')},
  {id:'actor-empty-display',pose:pose(0,3.8,Math.PI),power:2,connected:true,absence:true,actor:actorAt(4,10.25,Math.PI)},
  {id:'actor-west-shelf-entry',pose:pose(4,11.5,2.35),power:2,connected:true,wiringSolved:true,actor:actorAt(4,17,0)},
  {id:'actor-west-shelf-hidden',pose:pose(1.6,13.8,-Math.PI/2),power:2,connected:true,wiringSolved:true,actor:actorAt(4,13.8,0)},
  {id:'actor-east-shelf-entry',pose:pose(4,16.5,-2.35),power:2,connected:true,wiringSolved:true,actor:actorAt(4,13,Math.PI)},
  {id:'actor-east-shelf-hidden',pose:pose(6.4,18.8,Math.PI/2),power:2,connected:true,wiringSolved:true,actor:actorAt(4,18.8,0)},
  {id:'actor-noticed',pose:pose(4,16.6,Math.PI),power:2,connected:true,wiringSolved:true,actor:actorAt(4,20,0,'noticed')},
  {id:'actor-chasing',pose:pose(4,16.6,Math.PI),power:2,connected:true,wiringSolved:true,actor:actorAt(4,19.3,0,'approach')},
  {id:'actor-searching',pose:pose(1.6,14.8,-Math.PI/2),power:2,connected:true,wiringSolved:true,actor:actorAt(4,15.3,0,'search')},
  {id:'exit-approach',pose:pose(4,21.1,Math.PI),power:2,connected:true,wiringSolved:true,actor:actorAt(4,17,0)},
  {id:'exit-outside-open',pose:pose(4,24.6,0),power:2,connected:true,wiringSolved:true,finalDoorOpen:true,actor:actorAt(4,18.5,Math.PI)},
  {id:'exit-outside-closed',pose:pose(4,24.6,0),power:2,connected:true,wiringSolved:true,finalDoorClosed:true,actor:actorAt(4,18.5,Math.PI)});
 for(const notebook of ['list','chromatic','shadow','contour','mask','wiring','hybrid','shepard','credits'])views.push({id:'notebook-'+notebook,notebook,pose:G.GALLERY_SPAWN});
 views.push({id:'notebook-mask-side',notebook:'mask',pose:G.GALLERY_SPAWN,notebookYaw:Math.PI/2,notebookAdjust:{label:'仮面を見る位置',value:Math.PI/2}},
 {id:'notebook-hybrid-small',notebook:'hybrid',pose:G.GALLERY_SPAWN,notebookAdjust:{label:'画像の倍率',value:.3}},
 {id:'notebook-wiring-cover-open',notebook:'wiring',pose:G.GALLERY_SPAWN,notebookAdjust:{label:'カバーの位置',value:-.97}},
 {id:'notebook-chromatic-neutral',notebook:'chromatic',pose:G.GALLERY_SPAWN,notebookPresses:['無彩色で比べる']},
 {id:'notebook-contour-guide',notebook:'contour',pose:G.GALLERY_SPAWN,notebookPresses:['補助の輪郭ガイド']});
 for(const [width,height]of[[320,568],[390,844],[430,932]])for(const scrollBottom of[false,true])views.push({id:`notebook-wiring-${width}-font2${scrollBottom?'-scrolled':''}`,notebook:'wiring',pose:G.GALLERY_SPAWN,width,height,fontScale:2,scrollBottom});
}
if(!actorBefore)for(const [width,height]of[[320,568],[390,844],[430,932]])views.push({id:`notebook-mask-${width}-font2`,notebook:'mask',pose:G.GALLERY_SPAWN,width,height,fontScale:2},{id:`notebook-wiring-${width}-font2-controls`,notebook:'wiring',pose:G.GALLERY_SPAWN,width,height,fontScale:2,scrollTarget:'線の高さ −'});
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
    await R.act(async () => { reactView = R.create(React.createElement(view.notebook==='mask'?require('../src/rendering/firstPerson/NotebookMaskScene.tsx').NotebookMaskScene:GalleryScene, { world, runtime: { current: runtime }, progress: runtime.progress, resources, reducedMotion: false }), { createNodeMock: element => makeHost(element, cache) }); });
    const scene = new THREE.Scene();
    for (const child of convert(reactView.root, cache)) scene.add(child);
    const width = view.width ?? 390, height = view.height ?? 844;
    const camera = new THREE.PerspectiveCamera(65, width / height, .08, 60);
    camera.position.set(runtime.pose.position.x, runtime.pose.position.y, runtime.pose.position.z);
    camera.rotation.set(runtime.pose.pitch, runtime.pose.yaw, 0, 'YXZ');
    if(view.notebook==='mask')require('../src/rendering/firstPerson/notebookCamera.ts').configureNotebookCamera(camera,width,height,{kind:'mask',yaw:view.notebookYaw??0});
    camera.updateMatrixWorld(true); scene.add(camera);
    // Execute the registered scene mutation once against its real Three refs.
    // This is a snapshot boundary, not the native R3F frame loop or presented-frame gate.
    for (const callback of frameCallbacks) callback({ scene, camera }, 0);
    scene.updateMatrixWorld(true);
    const hud = await extractHUD(view, makeRuntime(view), camera);
    view.hud = hud;
    const surfaceIntersections = [];
    for (const id of ['sample-a', 'sample-b', 'sample-c']) {
      const surface = scene.getObjectByName(id + '-interior'), frame = scene.getObjectByName(id + '-outer-frame');
      if(!surface||!frame)continue;
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
    if (!actorBefore && view.id === 'actor-front') {
      const savedActor=runtime.gallery.actor, footsteps=require('../src/rendering/firstPerson/exhibitSculpture.ts');
      for(const phase of ['patrol','noticed']) for(const yaw of [0,Math.PI/4,Math.PI/2,Math.PI,-Math.PI/2,standbyYaw]) for(let sample=0;sample<=72;sample++){
        const travelledDistance=sample*.02;
        runtime.gallery.actor={...savedActor,visible:true,position:{...standbyPosition},yaw,travelledDistance,phase};
        for(const callback of frameCallbacks)callback({scene,camera},0);scene.updateMatrixWorld(true);
        const bounds=new THREE.Box3().setFromObject(actor),v=volumeFor(runtime);
        let maxHorizontalVertexRadius=0;
        actor.traverse(part=>{if(!part.isMesh)return;const vertices=part.geometry.getAttribute('position'),vertex=new THREE.Vector3();for(let i=0;i<vertices.count;i++){vertex.fromBufferAttribute(vertices,i).applyMatrix4(part.matrixWorld);maxHorizontalVertexRadius=Math.max(maxHorizontalVertexRadius,Math.hypot(vertex.x-standbyPosition.x,vertex.z-standbyPosition.z));}});
        const feet=[-1,1].map(side=>{const foot=scene.getObjectByName('actor-planted-foot-'+side);return {side,minY:new THREE.Box3().setFromObject(foot).min.y,stance:footsteps.exhibitFootPose(travelledDistance,side).stance};});
        const wallIntersections=getWorld(runtime).solids.filter(s=>s.kind==='wall'||s.kind==='door').filter(s=>['x','y','z'].every(axis=>Math.min(bounds.max[axis],s.max[axis])-Math.max(bounds.min[axis],s.min[axis])>1e-6)).map(s=>s.id);
        actorEnvelopeChecks.push({phase,yaw,travelledDistance,position:standbyPosition,min:bounds.min.toArray(),max:bounds.max.toArray(),maxHorizontalVertexRadius,collisionRadius:Actor.ACTOR_COLLISION_RADIUS,insideCollisionRadius:maxHorizontalVertexRadius<=Actor.ACTOR_COLLISION_RADIUS+1e-6,insideConservativeVolume:['x','y','z'].every(axis=>bounds.min[axis]>=v.min[axis]-1e-6&&bounds.max[axis]<=v.max[axis]+1e-6),feet,feetNonnegative:feet.every(f=>f.minY>=-1e-6),atLeastOneFootGrounded:feet.some(f=>Math.abs(f.minY)<=1e-6),wallIntersections,standbyOrientation:yaw===standbyYaw});
      }
      const gaitChecks=[];
      for(const yaw of [0,Math.PI/2,-Math.PI/2]){
        const previous={};let maxStanceWorldError=0,comparisons=0;
        for(let sample=0;sample<=72;sample++){
          const distance=sample*.02;
          runtime.gallery.actor={...savedActor,visible:true,position:{x:-Math.sin(yaw)*distance,y:0,z:9-Math.cos(yaw)*distance},yaw,travelledDistance:distance};
          for(const callback of frameCallbacks)callback({scene,camera},0);scene.updateMatrixWorld(true);
          for(const side of [-1,1]){const phase=footsteps.exhibitFootPose(distance,side),cycle=Math.floor(distance/(footsteps.EXHIBIT_STEP_DISTANCE*2)+(side<0?0:.5));const foot=scene.getObjectByName('actor-planted-foot-'+side),point=new THREE.Vector3(0,-.5,0).applyMatrix4(foot.matrixWorld);
            if(phase.stance&&previous[side]?.stance&&previous[side].cycle===cycle){maxStanceWorldError=Math.max(maxStanceWorldError,point.distanceTo(previous[side].point));comparisons++;}
            previous[side]={point,cycle,stance:phase.stance};
          }
        }
        gaitChecks.push({yaw,comparisons,maxStanceWorldError,passed:comparisons>60&&maxStanceWorldError<1e-6});
      }
      fs.writeFileSync(path.join(output,'actor-grounding.json'),JSON.stringify({boundary:'Actual mesh sole world points along straight authoritative -Z-forward root travel, not a video frame-rate measurement',allPassed:gaitChecks.every(c=>c.passed),checks:gaitChecks},null,2)+'\n');
      runtime.gallery.actor=savedActor;for(const callback of frameCallbacks)callback({scene,camera},0);scene.updateMatrixWorld(true);
    }
    const volume = volumeFor(runtime);
    const actorInsideDomainVolume = !actorBounds || ['x','y','z'].every(axis => actorBounds.min[axis] >= volume.min[axis] - 1e-6 && actorBounds.max[axis] <= volume.max[axis] + 1e-6);
    const resourceHash = values => crypto.createHash('sha256').update(Buffer.from(values.buffer, values.byteOffset, values.byteLength)).digest('hex');
    const assetAudit = name => { const o=scene.getObjectByName(name); if(!o)return null;const t=o.material.map;return { matrix:o.matrixWorld.elements, positions:resourceHash(o.geometry.attributes.position.array), normals:resourceHash(o.geometry.attributes.normal.array), uv:o.geometry.attributes.uv?resourceHash(o.geometry.attributes.uv.array):null, textureAsset:t?.name, textureBytes:t?.image?.data?resourceHash(t.image.data):null }; };
    view.perceptualAudit = { mask:assetAudit('gallery-static-hollow-mask'), hybrid:assetAudit('hybrid-exhibit-plate'), notebookMask:assetAudit('notebook-hollow-mask'), wiring:{offset:runtime.gallery.wiringOffset,cover:runtime.gallery.wiringCover,spec:G.getWiringSpec({offset:runtime.gallery.wiringOffset,cover:runtime.gallery.wiringCover}),fixed:scene.getObjectByName('wiring-fixed-line')?.matrixWorld.elements,moving:scene.getObjectByName('wiring-movable-centerline')?.matrixWorld.elements,coverMatrix:scene.getObjectByName('wiring-opaque-cover')?.matrixWorld.elements} };
    if(view.id.startsWith('mask-')){const mask=scene.getObjectByName('gallery-static-hollow-mask'),a=mask.geometry.getAttribute('position'),v=new THREE.Vector3();let visible=0;for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(mask.matrixWorld).project(camera);if(Math.abs(v.x)<=1&&Math.abs(v.y)<=1&&Math.abs(v.z)<=1)visible++;}view.maskProjectedVertexCount=visible;if(visible<100)throw new Error('Mask QA camera misses its intended subject: '+view.id);}
    if(view.id.endsWith('shelf-hidden')){const {segmentOccluded}=require('../src/domain/firstPerson/geometry.ts');let checked=0,occluded=0;actor.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.getAttribute('position'),v=new THREE.Vector3();for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);checked++;if(segmentOccluded(runtime.pose.position,v,world))occluded++;}});view.actorOcclusion={checked,occluded,boundary:'All actual actor mesh vertices against the same opaque world solids including device shelves'};if(!checked||checked!==occluded)throw new Error('Shelf hidden fixture leaves actor vertices visible: '+view.id);}
    view.geometryAudit = { actorInsideDomainVolume, sampleFrameIntersections: surfaceIntersections, actorWorldBounds: actorBounds ? { min: actorBounds.min.toArray(), max: actorBounds.max.toArray() } : null, actorState: runtime.gallery.actor };
    const f = view.mode === 'shadow' ? G.GALLERY_SHADOW_FIXTURE : view.mode === 'contour' ? G.GALLERY_CONTOUR_FIXTURE : view.mode === 'wiring' ? G.GALLERY_WIRING_FIXTURE : null;
    if (f) {
      const up = new THREE.Vector3(f.normal.x,f.normal.y,f.normal.z).cross(new THREE.Vector3(f.right.x,f.right.y,f.right.z));
      const project = (x, y) => { const p = new THREE.Vector3(f.center.x + f.right.x*x + up.x*y, f.center.y + f.right.y*x + up.y*y, f.center.z + f.right.z*x + up.z*y).project(camera); return { x: (p.x + 1) * width / 2, y: (1 - p.y) * height / 2 }; };
      const points = view.mode === 'shadow' ? G.SAMPLE_IDS.map(id => ({ id, ...G.SHADOW_SLOT_POSITIONS[runtime.progress.gallery.shadow.assignments[id]], half: G.SHADOW_SAMPLE_SIZE / 2 + G.SHADOW_HIT_SLOP })) :
        view.mode === 'contour' ? G.createContourSpec(runtime.progress.gallery.contour.seed).discs.map(d => ({ id: 'disc-' + d.id, ...d.center, half: d.radius * 1.2 })) : Object.entries(G.getWiringSpec({offset:runtime.gallery.wiringOffset,cover:runtime.gallery.wiringCover}).handles).map(([id,h])=>({id,...h.center,half:h.hitRadius}));
      view.hitRects = points.map(p => { const a = project(p.x - p.half, p.y + p.half), b = project(p.x + p.half, p.y - p.half); return { id: p.id, left: a.x, top: a.y, right: b.x, bottom: b.y, width: b.x - a.x, height: b.y - a.y }; });
    }
    const wiringLocal=scene.getObjectByName('wiring-local');
    const expectedWiring=G.getWiringSpec({offset:runtime.gallery.wiringOffset,cover:runtime.gallery.wiringCover});
    const endpointErrors=[];
    for(const [name,expected] of view.notebook==='mask'?[]:[['wiring-fixed-line',expectedWiring.fixedLine],['wiring-movable-centerline',expectedWiring.movableLine]]){
      const o=scene.getObjectByName(name); if(!o)throw new Error('Missing physical wiring mesh '+name);
      const actual=[-.5,.5].map(y=>new THREE.Vector3(0,y,0).applyMatrix4(o.matrixWorld));
      const target=expected.map(p=>new THREE.Vector3(p.x,p.y,.025).applyMatrix4(wiringLocal.matrixWorld));
      endpointErrors.push({name,maxError:Math.min(Math.max(actual[0].distanceTo(target[0]),actual[1].distanceTo(target[1])),Math.max(actual[0].distanceTo(target[1]),actual[1].distanceTo(target[0])))});
    }
    view.perceptualAudit.wiring.endpointErrors=endpointErrors;
    if(endpointErrors.some(e=>e.maxError>1e-6))throw new Error('Wiring rendered endpoints differ from domain centerlines');
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
    const textureInventory=[...owned].filter(r=>r.isTexture).map(t=>{const width=t.image?.width??0,height=t.image?.height??0,baseBytes=t.image?.data?.byteLength??0;let mipBytes=baseBytes;if(t.generateMipmaps&&baseBytes){let w=width,h=height;while(w>1||h>1){w=Math.max(1,Math.floor(w/2));h=Math.max(1,Math.floor(h/2));mipBytes+=w*h*(baseBytes/(width*height));}}return{name:t.name,width,height,baseBytes,mipBytes,generateMipmaps:t.generateMipmaps};});
    const inventory = { textures:textureInventory,textureBaseBytes:textureInventory.reduce((n,t)=>n+t.baseBytes,0),textureBytesWithMipmaps:textureInventory.reduce((n,t)=>n+t.mipBytes,0), meshes: 0, instancedMeshes: 0, instances: 0, frameCallbacksSampled: frameCallbacks.length };
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
  fs.writeFileSync(path.join(sceneOutput,'notebookCamera.js'),ts.transpileModule(readSource(path.join(root,'src/rendering/firstPerson/notebookCamera.ts')),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
  fs.writeFileSync(path.join(sceneOutput, 'index.html'), html(snapshots));
  const sourcePaths = ['src/screens/FirstPersonScreen.tsx', 'src/rendering/firstPerson/GalleryManipulation.tsx', 'src/rendering/firstPerson/SceneActionButton.tsx', 'src/rendering/firstPerson/controlLayout.ts', 'src/rendering/firstPerson/PanelFixture.tsx', 'src/rendering/firstPerson/GalleryScene.tsx', 'src/rendering/firstPerson/galleryGraphics.ts', 'src/rendering/firstPerson/galleryResources.ts', 'src/domain/gallery/definition.ts', 'src/domain/gallery/world.ts', 'src/domain/gallery/shadow.ts', 'src/domain/gallery/contour.ts', 'src/rendering/firstPerson/GalleryActor.tsx', 'src/domain/gallery/actor.ts', 'src/rendering/firstPerson/galleryController.ts', 'src/rendering/firstPerson/manipulationProjection.ts', 'src/domain/firstPerson/panelFixture.ts', 'src/domain/gallery/selectors.ts', 'scripts/preview-perceptual-gallery.cjs', 'src/rendering/firstPerson/PerceptualGalleryExhibits.tsx', 'src/rendering/firstPerson/perceptualResources.ts', 'assets/perceptual/hollow-mask.json', 'assets/perceptual/hybrid-texture.json', 'src/domain/gallery/wiring.ts', 'src/rendering/firstPerson/exhibitSculpture.ts','src/rendering/firstPerson/NotebookMaskScene.tsx','src/rendering/firstPerson/nativeSceneSession.ts','src/screens/DiscoveryNotebook.tsx','src/content/illusionComparisons.ts','src/content/illusionNotes.ts','src/rendering/firstPerson/notebookCamera.ts'];
  for(const file of loadedSourceHashes.keys())if(file.startsWith('src/')&&!sourcePaths.includes(file))sourcePaths.push(file);
  const sourceHashes = Object.fromEntries(sourcePaths.map(file => [file, loadedSourceHashes.get(file)??sha256(fs.readFileSync(path.join(root,file)))]));
  const sourcesChangedDuringCapture=sourcePaths.filter(file=>sourceHashes[file]!==sha256(fs.readFileSync(path.join(root,file))));
  fs.writeFileSync(path.join(output, 'actor-envelope.json'), JSON.stringify({ allPassed: actorEnvelopeChecks.every(check => check.insideConservativeVolume && check.insideCollisionRadius && check.feetNonnegative && check.atLeastOneFootGrounded && (!check.standbyOrientation || check.wallIntersections.length === 0)), boundary: 'Actual mesh world bounds and horizontal vertex radius at authored yaw and maximum stride. Arbitrary yaw at standby is a stress fixture, not a claim that every pose occurs in gameplay.', checks: actorEnvelopeChecks }, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'snapshot-ownership.json'), JSON.stringify({ boundary: 'CPU resource disposal in scene extraction and real React unmount effects; not native GPU, audio or application lifecycle', visits: ownershipChecks.length, allDisposedExactlyOnce: ownershipChecks.every(check => !check.undisposed && !check.disposedMultiple), checks: ownershipChecks }, null, 2) + '\n');
  const metadata = { capturedAt:new Date().toISOString(), actorSource: actorBefore ? { baselineRevision, isolatedPath: path.join(sceneOutput, 'GalleryActor.baseline.tsx'), sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(sceneOutput, 'GalleryActor.baseline.tsx'))).digest('hex') } : { current: true }, sourceHashes, sourcesChangedDuringCapture, boundary: 'Authored fixture snapshots from existing GalleryScene + one sampled scene callback; actual HUD hosts/styles translated to browser CSS; no native R3F/GL/input/Yoga/audio/device/perception validation', three: JSON.parse(fs.readFileSync(path.join(root, 'node_modules/three/package.json'), 'utf8')).version, panels, snapshots };
  fs.writeFileSync(path.join(output, 'scenes.json'), JSON.stringify(metadata, null, 2) + '\n');
  if(sourcesChangedDuringCapture.length)throw new Error('Rendering sources changed during capture: '+sourcesChangedDuringCapture.join(', '));
  console.log(`Generated ${snapshots.length} authored-scene snapshots and ${panels.length} software panel PNGs.`);
  return snapshots;
}
function html(snapshots) {
  return `<!doctype html><meta charset="utf-8"><title>Closed gallery component/WebGL QA</title>
<style>html,body{margin:0;overflow:hidden;background:#101619;font-family:'Noto Sans CJK JP',sans-serif}*{box-sizing:border-box}#hud{display:flex;position:relative;flex-direction:column}.rn-view,.rn-scroll,.rn-pressable,.rn-canvas{display:flex;position:relative;flex-direction:column;align-items:stretch;flex-shrink:0;min-width:0;min-height:0;border:0 solid black}.rn-text{position:relative;white-space:pre-wrap;overflow-wrap:anywhere;flex-shrink:0;margin:0;font-size:14px;line-height:1.2}.rn-scroll{overflow:auto;flex-shrink:1}.rn-canvas{position:absolute;inset:0;pointer-events:none}canvas{display:block}.qa-hit{position:absolute;pointer-events:none;border:1px dashed #ffcc44}</style>
<div id="hud"></div><script type="module">
import * as T from './three.module.js';
import {configureNotebookCamera} from './notebookCamera.js';
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
const e=document.createElement(node.type==='Image'?'img':'div');if(node.source)e.src=node.source;e.className=node.type==='Text'?'rn-text':node.type==='Pressable'?'rn-pressable':node.type==='ScrollView'?'rn-scroll':node.type==='CanvasPlaceholder'?'rn-canvas':'rn-view';
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
await document.fonts.ready;await Promise.all([...root.querySelectorAll('img')].map(i=>i.decode()));
let notebookProjection=null;if(view.notebook==='mask'){const element=root.querySelector('[data-testid="notebook-mask-window"]');if(!element)throw new Error('Missing real notebook mask window');const wr=rect(element),rr=rect(root);const window={x:(wr.left-rr.left)/view.width,y:(wr.top-rr.top)/view.height,width:wr.width/view.width,height:wr.height/view.height};configureNotebookCamera(camera,view.width,view.height,{kind:'mask',yaw:view.notebookYaw??0,window});const mask=scene.getObjectByName('notebook-hollow-mask'),vertices=mask.geometry.getAttribute('position'),v=new T.Vector3();const bounds={left:Infinity,top:Infinity,right:-Infinity,bottom:-Infinity};for(let i=0;i<vertices.count;i++){v.fromBufferAttribute(vertices,i).applyMatrix4(mask.matrixWorld).project(camera);const x=(v.x+1)*view.width/2,y=(1-v.y)*view.height/2;bounds.left=Math.min(bounds.left,x);bounds.right=Math.max(bounds.right,x);bounds.top=Math.min(bounds.top,y);bounds.bottom=Math.max(bounds.bottom,y);}notebookProjection={window:wr,normalizedWindow:window,maskProjectedBounds:bounds,insideWindow:bounds.left>=wr.left&&bounds.right<=wr.right&&bounds.top>=wr.top&&bounds.bottom<=wr.bottom,windowInsideViewport:wr.left>=0&&wr.top>=0&&wr.right<=view.width&&wr.bottom<=view.height,cameraPosition:camera.position.toArray(),projection:camera.projectionMatrix.elements};}
renderer.render(scene,camera);
const scroll=root.querySelector('[data-testid="gallery-device-scroll"]')??(view.notebook?root.querySelector('.rn-scroll'):null);if(scroll&&view.scrollBottom)scroll.scrollTop=scroll.scrollHeight;if(scroll&&view.scrollTarget){const target=[...root.querySelectorAll('[role="button"]')].find(e=>e.dataset.label===view.scrollTarget);if(!target)throw new Error('Missing notebook scroll target');target.scrollIntoView({block:'center'});}
const controls=root.querySelector('[data-testid="gallery-device-controls"]'), buttons=[...root.querySelectorAll('[role="button"]')].map(e=>{const r=rect(e), clip=e.closest('.rn-scroll'), c=clip?rect(clip):{left:0,top:0,right:view.width,bottom:view.height}; return {label:e.dataset.label,disabled:e.dataset.disabled==='true',...r,visibleRect:{left:Math.max(r.left,c.left),top:Math.max(r.top,c.top),right:Math.min(r.right,c.right),bottom:Math.min(r.bottom,c.bottom)}};});
const panel=view.hud.deviceBounds;const controlRect=scroll?rect(scroll):null;
const pauseElement=root.querySelector('[data-testid="pause-control"]'), objectiveElement=root.querySelector('[data-testid="current-objective"]'), powerElement=root.querySelector('[data-testid="gallery-power-stock"]');
const pause=pauseElement?rect(pauseElement):null,objective=objectiveElement?rect(objectiveElement):null,powerStock=powerElement?rect(powerElement):null;
const overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const hudLayout={notebookProjection,boundary:'Browser CSS layout of actual FirstPersonScreen host tree/styles; not native Yoga/text metrics',fontScale:view.fontScale,buttons,pause,objective,powerStock,pauseOverlapsObjective:!!pause&&!!objective&&overlaps(pause,objective),pauseOverlapsPowerStock:!!pause&&!!powerStock&&overlaps(pause,powerStock),scroll:scroll?{...rect(scroll),scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth}:null,
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
    const reentryIndex=actorBefore?0:snapshots.findIndex(v=>v.id==='hybrid-near');if(reentryIndex<0)throw new Error('Missing hybrid texture reentry view');
    for (let visit = 0; visit < 10; visit += 1) {
      const loaded = await evaluate(`window.renderGalleryView(${reentryIndex})`);
      const disposed = await evaluate('window.disposeGalleryView()');
      reentries.push({ visit: visit + 1, loaded: { geometries: loaded.geometries, textures: loaded.textures, calls: loaded.calls }, disposed });
    }
    const lifecycle = { boundary: 'Ten load/render/dispose cycles of serialized Three scenes using one browser WebGL renderer; not ten native app reentries', rendererCount: 1, reentryView:snapshots[reentryIndex].id,textureUploadChecked:!actorBefore,loadedTextureEachVisit:reentries.every(entry=>entry.loaded.textures>=1),pendingCdpRequests: pending.size, disposedToZeroEachTime: reentries.every(entry => entry.disposed.geometries === 0 && entry.disposed.textures === 0 && !entry.disposed.sceneAttached), noAnimationTimersInstalledByViewer: true, reentries };
    fs.writeFileSync(path.join(output, 'webgl-lifecycle.json'), JSON.stringify(lifecycle, null, 2) + '\n');
    if(!actorBefore&&!lifecycle.loadedTextureEachVisit)throw new Error('Hybrid texture was not uploaded on every reentry');
    if (!lifecycle.disposedToZeroEachTime) throw new Error('Browser scene disposal did not return its resource counters to zero');
    if (!actorBefore) verifyPixelContracts(snapshots);
    const byId=Object.fromEntries(snapshots.map(v=>[v.id,v]));
    const perceptualChecks=[];
    if(!actorBefore){
      const maskViews=snapshots.filter(v=>v.id.startsWith('mask-'));const maskBase=JSON.stringify(maskViews[0].perceptualAudit.mask);
      perceptualChecks.push({contract:'mask same physical data across walking and window',passed:maskViews.length>=5&&maskViews.every(v=>v.perceptualAudit.mask&&JSON.stringify(v.perceptualAudit.mask)===maskBase)});
      const hybrids=snapshots.filter(v=>v.id.startsWith('hybrid-'));const hybridBase=JSON.stringify(hybrids[0].perceptualAudit.hybrid);
      const notebookMasks=snapshots.filter(v=>v.notebook==='mask');const mainMask=maskViews[0].perceptualAudit.mask;const notebookBase=JSON.stringify(notebookMasks[0]?.perceptualAudit.notebookMask);
       perceptualChecks.push({contract:'notebook mask shares immutable geometry, camera-only change',passed:notebookMasks.length>=2&&notebookMasks.every(v=>v.perceptualAudit.notebookMask&&v.perceptualAudit.notebookMask.positions===mainMask.positions&&v.perceptualAudit.notebookMask.normals===mainMask.normals&&JSON.stringify(v.perceptualAudit.notebookMask)===notebookBase)});
       perceptualChecks.push({contract:'hybrid same geometry UV transform asset bytes across distance',passed:hybrids.length===3&&hybrids.every(v=>v.perceptualAudit.hybrid&&JSON.stringify(v.perceptualAudit.hybrid)===hybridBase)});
      for(const offset of ['offset','correct']){const a=byId[`wiring-${offset}-covered`].perceptualAudit.wiring,b=byId[`wiring-${offset}-open`].perceptualAudit.wiring;perceptualChecks.push({contract:`same ${offset} line geometry when cover moves`,passed:JSON.stringify(a.fixed)===JSON.stringify(b.fixed)&&JSON.stringify(a.moving)===JSON.stringify(b.moving)&&a.offset===b.offset&&JSON.stringify(a.coverMatrix)!==JSON.stringify(b.coverMatrix)});}
    }
    fs.writeFileSync(path.join(output,'perceptual-invariants.json'),JSON.stringify({allPassed:perceptualChecks.every(c=>c.passed),checks:perceptualChecks,views:snapshots.map(v=>({id:v.id,...v.perceptualAudit}))},null,2)+'\n');
    if(perceptualChecks.some(c=>!c.passed))throw new Error('Perceptual fixture invariants failed');
    const geometry = snapshots.map(view => ({ id: view.id, ...view.geometryAudit }));
    const layoutPassed = results.every(result => { const h = result.hudLayout; return (!h.notebookProjection||h.notebookProjection.insideWindow&&h.notebookProjection.windowInsideViewport)&&!h.pauseOverlapsObjective && !h.pauseOverlapsPowerStock && !h.controlsOverlapPanel && h.hitTargetsAtLeast44 && h.buttonsAtLeast44 && h.dragHitsBlockedByButtons.length === 0; });
    const envelope = JSON.parse(fs.readFileSync(path.join(output, 'actor-envelope.json'), 'utf8'));
    const grounding=actorBefore?{allPassed:true}:JSON.parse(fs.readFileSync(path.join(output,'actor-grounding.json'),'utf8'));
    const geometryPassed = grounding.allPassed && envelope.allPassed && geometry.every(check => check.sampleFrameIntersections.length === 0 && check.actorInsideDomainVolume);
    fs.writeFileSync(path.join(output, 'layout-and-geometry.json'), JSON.stringify({ boundary: 'Actual Three geometry and projection; actual component host tree translated to browser CSS. Not native Yoga, finger interaction or device evidence.', layoutPassed, geometryPassed, geometry, layouts: results.map(result => ({ id: result.id, ...result.hudLayout })) }, null, 2) + '\n');
    if (!layoutPassed || !geometryPassed) throw new Error('Layout or geometry audit failed; inspect layout-and-geometry.json');
    const report = { environment: 'Linux Chromium headless, browser Three WebGL/ANGLE SwiftShader; not iPhone, native R3F, or device performance', rendererCount: 1, screenshotKind: 'Browser composite of actual scene + actual React component host tree/CSS approximation; raw WebGL canvas separately preserved', browserErrors, allWithinBudget: results.every(result => result.withinBudget), results };
    fs.writeFileSync(path.join(output, 'webgl-results.json'), JSON.stringify(report, null, 2) + '\n');
    if(!report.allWithinBudget)throw new Error('Browser WebGL draw/triangle budget exceeded');
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
