'use strict';
// Actual React Native component hosts, translated to browser CSS for QA.
// Not Yoga, native gesture delivery, safe-area measurement, audio, or Skia.
const Module = require('node:module'), fs = require('node:fs');
const React = require('react'), R = require('react-test-renderer');
const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style && typeof style === 'object' ? style : {};
function hostTree(node) {
  if (typeof node === 'string') return node;
  const children = node.children.map(hostTree).flat().filter(child => child !== null);
  if (typeof node.type !== 'string') return children;
  const p = node.props;
  return { type: node.type, style: flatten(typeof p.style === 'function' ? p.style({ pressed: false }) : p.style), contentStyle: flatten(p.contentContainerStyle),
    testID: p.testID, label: p.accessibilityLabel, disabled: !!p.disabled, pointerEvents: p.pointerEvents, source: p.source?.uri, children };
}
function installNativeHudBridge(context) {
  const RN = {
    View: 'View', Text: 'Text', Image: 'Image', Switch: 'Switch', Modal: () => null,
    Pressable: props => React.createElement('Pressable', { ...props, style: typeof props.style === 'function' ? props.style({ pressed: false }) : props.style }, props.children),
    ScrollView: props => React.createElement('ScrollView', props, props.children),
    StyleSheet: { create: value => value, flatten, absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }, absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 } },
    useWindowDimensions: () => ({ width: context.width, height: context.height, fontScale: context.fontScale, scale: 1 }),
    AccessibilityInfo: { isScreenReaderEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove() {} }), announceForAccessibility() {} },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'ios', select: choices => choices.ios ?? choices.default },
  };
  const audio = { DEFAULT_AUDIO_PREFERENCES: { enabled: false, musicVolume: .18, effectsVolume: .35, illusionEnabled: true },
    normalizeAudioPreferences: preferences => ({ enabled: false, musicVolume: .18, effectsVolume: .35, illusionEnabled: true, ...preferences }),
    getGalleryAudioAvailability: () => 'unavailable',
    createGalleryAudio: () => context.audio ?? { beginEnding() {}, stopMovement() {}, setActive() {}, setPreviewActive() {}, setListenerPosition() {}, playIllusion() { return false; }, stopIllusion() {}, updatePreferences() {}, event() { return false; }, movement() {}, actorMovement() {}, dispose() {}, whenReady: () => Promise.resolve(), getDiagnostics: () => ({ availability: 'unavailable', active: false, ready: false, players: 0, playedEvents: 0, droppedEvents: 0 }) } };
  const load = Module._load;
  Module._load = function (name, ...args) {
    if (name === 'react-native') return RN;
    if (name === 'react-native-safe-area-context') return { SafeAreaView: 'View', useSafeAreaInsets: () => context.insets ?? { left: 0, right: 0, top: 0, bottom: 0 } };
    if (name === 'react-native-reanimated') return { __esModule: true, default: { View: 'View' }, useSharedValue: value => { const [shared] = React.useState(() => ({ value, set(next) { this.value = next; } })); return shared; }, useAnimatedStyle: callback => callback() };
    if (name === '@shopify/react-native-skia') return { Canvas: () => { throw new Error('Skia rendering is outside this HUD bridge'); }, Image: 'Image', ColorType: { RGBA_8888: 0 }, AlphaType: { Opaque: 0 }, FilterMode: { Linear: 0 }, MipmapMode: { None: 0 } };
    if (name === 'expo-clipboard') return { setStringAsync: async () => {} };
    if (name === 'expo-haptics') return { selectionAsync: async () => {} };
    if (name.endsWith('/audio') || name === '../audio') return audio;
    if (name.endsWith('/RawGLProof')) return { RawGLProof: () => null };
    if (name.endsWith('/FirstPersonCanvas')) return { FirstPersonCanvas: props => {
      const { onReady, onSnapshot } = props;
      React.useEffect(() => { context.snapshotCallback = onSnapshot; onReady(); onSnapshot(context.snapshot()); }, [onReady, onSnapshot]);
      return React.createElement('CanvasPlaceholder');
    } };
    if (context.bindController && name.endsWith('/runtimeController')) { const actual = load.call(this, name, ...args); return { ...actual, createController: () => context.controller }; }
    return load.call(this, name, ...args);
  };
  require.extensions['.png'] = (mod, filename) => { mod.exports = { uri: 'data:image/png;base64,' + fs.readFileSync(filename).toString('base64') }; };
  globalThis.__DEV__ = false; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return { audio, async mount(Screen, props) {
    let tree;
    await R.act(async () => { tree = R.create(React.createElement(Screen, props)); });
    return { tree, serialize: () => hostTree(tree.root), update: () => R.act(async () => context.snapshotCallback?.(context.snapshot())),
      async press(label) { const button = tree.root.findAll(n => n.type === 'Pressable' && n.props.accessibilityLabel === label)[0]; if (!button) throw new Error('Actual HUD button missing: ' + label); await R.act(async () => button.props.onPress()); },
      async pressTestID(testID) { const button = tree.root.findAll(n => n.type === 'Pressable' && n.props.testID === testID)[0]; if (!button) throw new Error('Actual HUD button missing: ' + testID); await R.act(async () => button.props.onPress()); },
      async touch(testID, phase, event) { const view = tree.root.findAll(n => n.type === 'View' && n.props.testID === testID)[0]; if (!view) throw new Error('Actual touch view missing: ' + testID); const handler = view.props['onTouch' + phase]; if (!handler) throw new Error('Touch phase missing: ' + phase); await R.act(async () => handler({ nativeEvent: event })); },
      unmount: () => R.act(async () => tree.unmount()) };
  } };
}
const browserStyles = `html,body{margin:0;overflow:hidden;background:#101619;font-family:'Noto Sans CJK JP',sans-serif}*{box-sizing:border-box}.rn-view,.rn-scroll,.rn-pressable,.rn-canvas{display:flex;position:relative;flex-direction:column;align-items:stretch;flex-shrink:0;min-width:0;min-height:0;border:0 solid black}.rn-text{position:relative;white-space:pre-wrap;overflow-wrap:anywhere;flex-shrink:0;margin:0;font-size:14px;line-height:1.2}.rn-scroll{overflow:auto;flex-shrink:1}.rn-canvas{position:absolute;inset:0;pointer-events:none}canvas{display:block}`;
const browserHelpers = `
const unitless=new Set(['opacity','flex','flexGrow','flexShrink','fontWeight','zIndex','order','aspectRatio']);
function css(element,style,scale){for(const [key,raw]of Object.entries(style||{})){let value=raw;if(key==='paddingHorizontal'||key==='marginHorizontal'){for(const side of ['Left','Right'])css(element,{[key.replace('Horizontal',side)]:value},scale);continue;}if(key==='paddingVertical'||key==='marginVertical'){for(const side of ['Top','Bottom'])css(element,{[key.replace('Vertical',side)]:value},scale);continue;}if(key==='transform'){element.style.transform=value.map(t=>Object.entries(t).map(([k,v])=>k+'('+v+(typeof v==='number'&&k.startsWith('translate')?'px':'')+')').join(' ')).join(' ');continue;}if(typeof value==='number'&&['fontSize','lineHeight'].includes(key))value*=scale;if(typeof value==='number'&&!unitless.has(key))value+='px';element.style[key]=value;}}
function hudDOM(node,scale,canvas){if(Array.isArray(node)){const fragment=document.createDocumentFragment();for(const child of node)fragment.append(hudDOM(child,scale,canvas));return fragment;}if(typeof node==='string')return document.createTextNode(node);if(!node)return document.createDocumentFragment();const e=document.createElement(node.type==='Image'?'img':'div');if(node.source)e.src=node.source;e.className=node.type==='Text'?'rn-text':node.type==='Pressable'?'rn-pressable':node.type==='ScrollView'?'rn-scroll':node.type==='CanvasPlaceholder'?'rn-canvas':'rn-view';css(e,node.style,scale);if(node.testID)e.dataset.testid=node.testID;if(node.label)e.dataset.label=node.label;if(node.type==='Pressable'){e.setAttribute('role','button');e.dataset.disabled=String(node.disabled);}if(node.type==='CanvasPlaceholder')e.append(canvas);else if(node.type==='ScrollView'){const inner=document.createElement('div');inner.className='rn-view';css(inner,node.contentStyle,scale);for(const child of node.children)inner.append(hudDOM(child,scale,canvas));e.append(inner);}else for(const child of node.children)e.append(hudDOM(child,scale,canvas));return e;}
function hudRect(e){const r=e.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}
function rectanglesOverlap(a,b){return!!a&&!!b&&a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
function auditHUD(root,panel){const byID=id=>{const e=root.querySelector('[data-testid="'+id+'"]');return e?hudRect(e):null;};const buttons=[...root.querySelectorAll('[role="button"]')].map(e=>{const bounds=hudRect(e),scroll=e.closest('.rn-scroll'),clip=scroll?hudRect(scroll):hudRect(root);return{label:e.dataset.label,disabled:e.dataset.disabled==='true',...bounds,visible:{left:Math.max(bounds.left,clip.left),right:Math.min(bounds.right,clip.right),top:Math.max(bounds.top,clip.top),bottom:Math.min(bounds.bottom,clip.bottom)}};});const pause=byID('pause-control'),objective=byID('current-objective'),heading=byID('vault-device-heading');const scroll=root.querySelector('[data-testid="vault-device-scroll"]');const controls=scroll?hudRect(scroll):byID('vault-device-controls');return{boundary:'Actual component host styles translated to browser CSS, not native Yoga/text metrics',panel,pause,objective,heading,controls,buttons,buttonsAtLeast44:buttons.every(b=>b.width>=44&&b.height>=44),pauseOverlapsObjective:rectanglesOverlap(pause,objective),pauseOverlapsHeading:rectanglesOverlap(pause,heading),controlsOverlapPanel:rectanglesOverlap(controls,panel),buttonOverlapsPanel:buttons.filter(b=>b.visible.right>b.visible.left&&b.visible.bottom>b.visible.top&&rectanglesOverlap(b.visible,panel)).map(b=>b.label),scroll:scroll?{...hudRect(scroll),scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight}:null};}
`;
module.exports = { installNativeHudBridge, hostTree, browserStyles, browserHelpers };
