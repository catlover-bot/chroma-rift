#!/usr/bin/env node
'use strict';
/* global __dirname, Buffer */
// Actual baseline/current React host comparison. Native boundaries and CSS
// translation are explicit fixtures; this does not execute a native preview.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const Module = require('node:module'), ts = require('typescript');
require('./lib/qa-native-metadata.cjs');
const { installSourceBridge, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
if (process.argv.length !== 2) throw Error('usage: node scripts/qa-player-ui-comparison.cjs');
const root = path.resolve(__dirname, '..'), revision = '393e58e59d73a65455b423d3aba9fdefe6c6d8de';
const out = path.join(root, '.expo/goal014-1/player-ui-comparison');
const destination = path.join(root, 'docs/qa-goal014-1/player-ui-comparison');
fs.mkdirSync(out, { recursive: true }); fs.mkdirSync(destination, { recursive: true });
const bridge = installSourceBridge(root), context = { width: 390, height: 844, fontScale: 1 };
const native = installNativeHudBridge(context);
process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = 'preview';
const toolPaths = ['scripts/qa-player-ui-comparison.cjs', 'scripts/lib/three-scene-qa.cjs', 'scripts/lib/native-hud-qa.cjs', 'scripts/lib/qa-native-metadata.cjs'];
function currentInputs() {
  const files = ['App.tsx', 'index.tsx', 'app.json', 'package.json', 'package-lock.json', 'eas.json', 'metro.config.js', ...toolPaths];
  for (const folder of ['src', 'assets', 'metro']) for (const entry of fs.readdirSync(path.join(root, folder), { recursive: true, withFileTypes: true })) {
    if (entry.isFile()) files.push(path.relative(root, path.join(entry.parentPath, entry.name)));
  }
  return Object.fromEntries([...new Set(files)].sort().map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
}
const guarded = currentInputs();
// loadBaseline in the shared helper swaps only one entry. This comparison needs
// the entire baseline first-party closure, including Layout and buildIdentity.
function installBaselineLoader() {
  const blobs = new Map(cp.execFileSync('git', ['ls-tree', '-r', '--format=%(path)\t%(objectname)', revision], { cwd: root, encoding: 'utf8' }).trim().split('\n').map(line => line.split('\t')));
  const cache = new Map(), hashes = new Map(), baseLoad = Module._load;
  const nativeAudio = request => request === '../audio' || request.endsWith('/audio');
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    if (!blobs.has(relative)) throw Error('No baseline blob: ' + relative);
    const bytes = cp.execFileSync('git', ['cat-file', 'blob', blobs.get(relative)], { cwd: root });
    hashes.set(relative, { sha256: sha256(bytes), blob: blobs.get(relative) });
    const filename = path.join(root, relative), mod = new Module(filename, module);
    mod.filename = filename; mod.paths = Module._nodeModulePaths(path.dirname(filename)); mod.baselineRevision = revision; cache.set(relative, mod);
    if (relative.endsWith('.json')) mod.exports = JSON.parse(bytes.toString('utf8'));
    else if (relative.endsWith('.png')) mod.exports = { uri: 'data:image/png;base64,' + bytes.toString('base64') };
    else if (/\.[cm]?[jt]sx?$/.test(relative)) {
      const source = bytes.toString('utf8');
      mod._compile(/\.tsx?$/.test(relative) ? ts.transpileModule(source, { fileName: filename,
        compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText : source, filename);
    } else throw Error('Unsupported baseline source: ' + relative);
    return mod.exports;
  }
  Module._load = function (request, parent, ...rest) {
    // The exact same explicit native audio fixture is shared by both versions.
    if (parent?.baselineRevision === revision && request.startsWith('.') && !nativeAudio(request)) {
      const absolute = path.resolve(path.dirname(parent.filename), request), base = path.relative(root, absolute).replaceAll(path.sep, '/');
      const candidate = [base, ...['.ts', '.tsx', '.json', '.js', '/index.ts', '/index.tsx', '/index.js'].map(ext => base + ext)].find(file => blobs.has(file));
      if (!candidate) throw Error('Baseline dependency missing: ' + base);
      return load(candidate);
    }
    return baseLoad.call(this, request, parent, ...rest);
  };
  return { load, hashes, verify() {
    if (cp.execFileSync('git', ['rev-parse', revision + '^{commit}'], { cwd: root, encoding: 'utf8' }).trim() !== revision) throw Error('Baseline identity changed');
    for (const [file, proof] of hashes) if (sha256(cp.execFileSync('git', ['cat-file', 'blob', proof.blob], { cwd: root })) !== proof.sha256) throw Error('Baseline blob changed: ' + file);
  } };
}
const baseline = installBaselineLoader();
const versions = {
  before: { Home: baseline.load('src/screens/ChapterOneHomeScreen.tsx').ChapterOneHomeScreen, Settings: baseline.load('src/screens/SettingsScreen.tsx').SettingsScreen,
    defaults: baseline.load('src/types/application.ts') },
  after: { Home: require('../src/screens/ChapterOneHomeScreen.tsx').ChapterOneHomeScreen, Settings: require('../src/screens/SettingsScreen.tsx').SettingsScreen,
    defaults: require('../src/types/application.ts') },
};
const noop = () => {};
function textOf(node) { return Array.isArray(node) ? node.map(textOf).join(' ') : typeof node === 'string' ? node : node ? [node.label ?? '', ...node.children.map(textOf)].join(' ') : ''; }
function switches(node) {
  if (Array.isArray(node)) return node.map(switches);
  if (!node || typeof node === 'string') return node;
  return { ...node, ...(node.type === 'Switch' ? { style: { ...node.style, width: 51, height: 31, flexShrink: 0, borderRadius: 16, backgroundColor: '#59665e' } } : {}), children: node.children.map(switches) };
}
function verify() {
  bridge.verify(); baseline.verify();
  const current = currentInputs(), changed = [...new Set([...Object.keys(guarded), ...Object.keys(current)])].filter(file => current[file] !== guarded[file]);
  if (changed.length) throw Error('Current source/tool drift: ' + changed.join(', '));
}
async function extract() {
  const records = [];
  for (const [width, height, fontScale] of [[320, 568, 2], [390, 844, 1]]) for (const [version, modules] of Object.entries(versions)) {
    Object.assign(context, { width, height, fontScale });
    const take = async (state, Screen, props, availability = 'available') => {
      native.audio.getGalleryAudioAvailability = () => availability;
      const mounted = await native.mount(Screen, props);
      try {
        const tree = switches(mounted.serialize()), text = textOf(tree);
        if (text.includes('詳しい情報を閉じる') || text.includes('FIRST_FAILURE')) throw Error('Support details unexpectedly open');
        if (version === 'after' && /goal-014|release-js|preview|Development Build|ハプティクス|サウンド|\b(?:GL|native|renderer|checkpoint|schema)\b/.test(text)) throw Error('Technical/old wording in current normal UI: ' + state);
        if (state === 'home' && version === 'before' && !['コード goal-014-polish-r1', 'preview', 'iOS build unknown', 'release-js'].every(value => text.includes(value))) throw Error('Expected actual baseline identity missing');
        if (state !== 'home' && !text.includes(version === 'before' ? 'ハプティクス' : '振動')) throw Error('Expected setting wording missing');
        if (state === 'settings-missing-native' && !text.includes(version === 'before' ? 'Development Build' : '音を再生できませんでした。音なしで探索を続けられます。')) throw Error('Audio availability wording missing');
        records.push({ id: `${version}-${state}-${width}`, version, state, width, height, fontScale, profile: 'preview', dev: false, availability, supportDetailsOpen: false, tree, text, treeSha256: sha256(JSON.stringify(tree)) });
      } finally { await mounted.unmount(); }
    };
    await take('home', modules.Home, { loading: false, replayable: [], showAreas: false, showDiscoveries: false, discoveries: {},
      onContinue: noop, onNew: noop, onImport: noop, onAreas: noop, onDiscoveries: noop, onHome: noop, onReplay: noop, onEnding: noop, onSettings: noop });
    const settings = { ...modules.defaults.DEFAULT_SETTINGS, audio: { enabled: true, musicVolume: .18, environmentVolume: .2, effectsVolume: .35, illusionEnabled: true } };
    const props = { settings, controls: modules.defaults.DEFAULT_FIRST_PERSON_CONTROLS, onChange: noop, onControlsChange: noop, onRecalibrate: noop,
      onQuickSetup: noop, onReset: noop, onBack: noop, onResetChapter: noop, currentChapterName: '第一章' };
    await take('settings', modules.Settings, props);
    await take('settings-missing-native', modules.Settings, props, 'missing-native');
  }
  verify(); return records;
}
async function capture(records) {
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${browserStyles}
.rn-text{line-height:normal}.pane{position:absolute;top:36px;display:flex;flex-direction:column;overflow:hidden}.caption{position:absolute;top:0;height:36px;color:#eee;font-size:13px;display:flex;align-items:center;padding:0 10px;background:#252b30}</style><div id="before-caption" class="caption">変更前 · 393e58e</div><div id="after-caption" class="caption">変更後 · Goal 014.1</div><div id="before" class="pane"></div><div id="after" class="pane"></div><script>${browserHelpers}
window.draw=async(record,anchor)=>{const root=document.getElementById(record.version),caption=document.getElementById(record.version+'-caption');root.style.left=caption.style.left=(record.version==='before'?0:record.width)+'px';root.style.width=caption.style.width=record.width+'px';root.style.height=record.height+'px';root.replaceChildren(hudDOM(record.tree,record.fontScale,document.createElement('div')));await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const scroll=root.querySelector('.rn-scroll');if(!scroll)throw Error('Actual screen ScrollView missing');const texts=[...root.querySelectorAll('.rn-text')];const target=texts.find(e=>anchor==='title'?e.textContent==='最後の退館者':anchor==='vibration'?e.textContent===(record.version==='before'?'ハプティクス':'振動'):anchor==='audio'?e.textContent==='音':record.version==='before'?e.textContent.includes('Development Build'):e.textContent.includes('音を再生できませんでした。'));if(!target)throw Error('Anchor missing: '+anchor);target.scrollIntoView({block:anchor==='title'||anchor==='audio'?'start':'center'});await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));const clip=hudRect(scroll),rect=hudRect(target),identity=root.querySelector('[data-testid=home-build-identity]');const visible=element=>{const r=hudRect(element);return r.top>=clip.top-1&&r.bottom<=clip.bottom+1&&r.left>=clip.left-1&&r.right<=clip.right+1;};return{scroll:{top:scroll.scrollTop,width:scroll.clientWidth,height:scroll.clientHeight,contentWidth:scroll.scrollWidth,contentHeight:scroll.scrollHeight},target:{text:target.textContent,rect,fullyVisible:visible(target)},identity:identity?{text:identity.textContent,rect:hudRect(identity),fullyVisible:visible(identity)}:null};};window.ready=true;</script>`);
  const browser = await openBrowser(out), results = [];
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) { if (browser.errors.length) throw Error(JSON.stringify(browser.errors)); await delay(100); }
    if (!await browser.evaluate('window.ready===true')) throw Error('Comparison viewer did not load');
    for (const width of [320, 390]) for (const [state, anchor] of [['home', 'title'], ['settings', 'vibration'], ['settings', 'audio'], ['settings-missing-native', 'failure']]) {
      const pair = ['before', 'after'].map(version => records.find(record => record.version === version && record.state === state && record.width === width));
      await browser.send('Emulation.setDeviceMetricsOverride', { width: width * 2, height: pair[0].height + 36, deviceScaleFactor: 1, mobile: false });
      const metrics = {};
      for (const record of pair) {
        metrics[record.version] = await browser.evaluate(`window.draw(${JSON.stringify(record)},${JSON.stringify(anchor)})`);
        if (!metrics[record.version].target.fullyVisible) throw Error(record.id + ': comparison target clipped');
        if (record.version === 'after' && metrics.after.scroll.contentWidth > metrics.after.scroll.width + 1) throw Error(record.id + ': current horizontal overflow');
      }
      if (state === 'home' && !metrics.before.identity?.fullyVisible) throw Error('Baseline code identity not fully visible');
      const bytes = Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64');
      const file = `${state}-${anchor}-${width}-font${pair[0].fontScale}.png`;
      fs.writeFileSync(path.join(out, file), bytes); fs.writeFileSync(path.join(destination, file), bytes);
      results.push({ file, sha256: sha256(bytes), bytes: bytes.length, state, anchor, widthPerScreen: width, heightPerScreen: pair[0].height, fontScale: pair[0].fontScale,
        comparisonAlignment: 'Same semantic text anchor within each actual ScrollView; scroll offsets recorded, no text or geometry replacement.', metrics, records: pair.map(record => record.id) });
    }
    if (browser.errors.length) throw Error(JSON.stringify(browser.errors));
    return { results, browserErrors: browser.errors };
  } finally { await browser.close(); }
}
async function main() {
  const records = await extract(), rendered = await capture(records); verify();
  const sourceCorrespondence = { before: { revision, modules: Object.fromEntries(baseline.hashes) }, after: { head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), modules: Object.fromEntries(bridge.hashes), state: 'Current filesystem bytes; source hashes define identity independently of commit status.' } };
  const report = { schemaVersion: 1, profile: 'preview', dev: false, nativeExecuted: false, sourceCorrespondence, guardedCurrentInputs: guarded, sourceInputsStable: true,
    method: 'Actual ChapterOneHomeScreen/SettingsScreen React hosts. Every relative baseline first-party dependency is loaded from the immutable 393e58e git blob closure in its own module cache; current dependencies use the source bridge. Both use identical installed React, explicit native fixtures and browser CSS translation. No checkout or product changes.',
    fixtures: { nativeConstants: {}, nativeBuild: 'unknown', safeAreaInsets: { top: 0, right: 0, bottom: 0, left: 0 }, audio: 'available for normal settings, missing-native only for the labeled conditional message case; inert owner/no playback', audioPreferences: { enabled: true, musicVolume: .18, environmentVolume: .2, effectsVolume: .35, illusionEnabled: true }, switches: 'approximate 51x31 static CSS track', home: 'new chapter, no saved progress/import/failure', support: 'information and details remain closed; no clicks to open support', previewMeaning: 'Source-level __DEV__false and EXPO_PUBLIC_CHROMA_BUILD_PROFILE=preview. This is not an emitted native preview binary.' },
    limits: ['CSS software screenshots are not native Yoga/text shaping/safe-area/VoiceOver or iPhone operation.', 'No App navigation, native audio, persisted user state or device build identity is exercised by this comparison.', 'QA captions above the authored screen identify before/after; captured content comes from actual component host trees.', 'Current support details have independent open/copy/close evidence in player-ui; this comparison intentionally shows only normal closed state.'],
    records: records.map(({ tree, ...record }) => record), ...rendered };
  fs.writeFileSync(path.join(out, 'host-trees.json'), JSON.stringify(records, null, 2) + '\n');
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(destination, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ hosts: records.length, pairs: rendered.results.length, beforeSources: baseline.hashes.size, afterSources: bridge.hashes.size, guardedInputs: Object.keys(guarded).length, out, destination }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
