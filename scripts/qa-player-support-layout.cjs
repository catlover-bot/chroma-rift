#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Actual home/settings/support React hosts and interactions. CSS translation is
// an explicit software approximation; it is not Yoga, VoiceOver or native audio.
const fs = require('node:fs'), path = require('node:path');
require('./lib/qa-native-metadata.cjs');
const { installSourceBridge, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
if (process.argv.length !== 2) throw Error('usage: node scripts/qa-player-support-layout.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal014-1/player-ui');
fs.mkdirSync(out, { recursive: true });
const bridge = installSourceBridge(root), context = { width: 320, height: 568, fontScale: 2 };
const native = installNativeHudBridge(context);
const { ChapterOneHomeScreen } = require('../src/screens/ChapterOneHomeScreen.tsx');
const { SettingsScreen } = require('../src/screens/SettingsScreen.tsx');
const { DEFAULT_SETTINGS, DEFAULT_FIRST_PERSON_CONTROLS } = require('../src/types/application.ts');
const { rememberFailureSnapshot, resetFailureSnapshotsForTest } = require('../src/rendering/firstPerson/failureLedger.ts');
const { recordAudioFailure, resetAudioDiagnosticsForTests } = require('../src/audio/diagnostics.ts');
const sizes = [[320, 568, 2], [390, 844, 1]];
const deny = /goal-014|release-js|\b(?:native|GL|renderer|framebuffer|checkpoint|schema|Runtime|Stage Kit|BGM|SE)\b|ランタイム|スキーマ|ハプティクス|原文|Development Build/;
const noop = () => {};
const sourceTools = ['scripts/qa-player-support-layout.cjs', 'scripts/lib/native-hud-qa.cjs', 'scripts/lib/three-scene-qa.cjs', 'scripts/lib/qa-native-metadata.cjs', 'app.json', 'package.json', 'package-lock.json'];
const toolHashes = Object.fromEntries(sourceTools.map(file => [file, sha256(fs.readFileSync(path.join(root, file)))]));
const verify = () => {
  bridge.verify();
  for (const [file, expected] of Object.entries(toolHashes)) if (sha256(fs.readFileSync(path.join(root, file))) !== expected) throw Error('QA tool changed: ' + file);
};
function literals(node) {
  if (Array.isArray(node)) return node.map(literals).join(' ');
  if (typeof node === 'string') return node;
  return node ? [node.label ?? '', ...node.children.map(literals)].join(' ') : '';
}
function switches(node) {
  if (Array.isArray(node)) return node.map(switches);
  if (!node || typeof node === 'string') return node;
  // The bridge cannot render UISwitch. Reserve an explicitly approximate 51x31
  // track so text is tested beside a control instead of a zero-width placeholder.
  return { ...node, ...(node.type === 'Switch' ? { style: { ...node.style, width: 51, height: 31, flexShrink: 0, borderRadius: 16, backgroundColor: '#59665e' } } : {}), children: node.children.map(switches) };
}
async function extract() {
  const records = [];
  for (const profile of ['preview', 'production']) for (const [width, height, fontScale] of sizes) {
    process.env.EXPO_PUBLIC_CHROMA_BUILD_PROFILE = profile;
    Object.assign(context, { width, height, fontScale });
    resetFailureSnapshotsForTest(); resetAudioDiagnosticsForTests();
    rememberFailureSnapshot(JSON.stringify({ label: 'FIRST_FAILURE', schemaVersion: 1,
      firstFailure: { reasonCode: 'QA_FIXTURE', error: { phase: 'QA_FIXTURE', message: 'ソフトウェア表示確認用の例。実機の障害記録ではありません。' } }, events: [{ event: 'QA_FIXTURE' }] }));
    recordAudioFailure(0, new Error('QA_FIXTURE: software layout only, not device audio'), 'QA_FIXTURE');
    const take = (hud, state, details = false) => {
      const tree = switches(hud.serialize()), text = literals(tree);
      if (!details && deny.test(text)) throw Error(`${profile}/${state}: technical text outside explicit support`);
      if (details && (!text.includes('goal-015-sakushikan-r1') || !text.includes('FIRST_FAILURE'))) throw Error('Explicit detail identity/failure missing');
      records.push({ id: `${profile}-${state}-${width}`, profile, state, width, height, fontScale, details, tree });
    };
    for (const blocked of [false, true]) {
      const home = await native.mount(ChapterOneHomeScreen, { loading: false,
        ...(blocked ? { migration: { status: 'blocked', source: 'gallery' } } : {}), replayable: [], showAreas: false, showDiscoveries: false, discoveries: {},
        onContinue: noop, onNew: noop, onImport: noop, onAreas: noop, onDiscoveries: noop, onHome: noop, onReplay: noop, onEnding: noop, onSettings: noop });
      try { take(home, blocked ? 'home-migration' : 'home'); } finally { await home.unmount(); }
    }
    for (const unavailable of [false, true]) {
      native.audio.getGalleryAudioAvailability = () => unavailable ? 'missing-native' : 'available';
      const settings = await native.mount(SettingsScreen, { settings: DEFAULT_SETTINGS, controls: DEFAULT_FIRST_PERSON_CONTROLS,
        onChange: noop, onControlsChange: noop, onRecalibrate: noop, onQuickSetup: noop, onReset: noop, onBack: noop, onResetChapter: noop, currentChapterName: '第一章' });
      try {
        take(settings, unavailable ? 'settings-audio-failure' : 'settings');
        if (unavailable) continue;
        await settings.press('サポート'); take(settings, 'support-closed');
        await settings.press('詳しい情報'); take(settings, 'support-open', true);
        await settings.press('情報をコピー'); take(settings, 'support-copied', true);
        await settings.press('詳しい情報を閉じる'); take(settings, 'support-reclosed');
      } finally { await settings.unmount(); }
    }
  }
  verify(); return records;
}
async function capture(records) {
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${browserStyles}
#root{position:absolute;inset:0;display:flex;flex-direction:column}.rn-text{line-height:normal}</style><div id="root"></div><script>${browserHelpers}
const root=document.getElementById('root');
window.draw=async record=>{root.replaceChildren(hudDOM(record.tree,record.fontScale,document.createElement('div')));await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
const scroll=root.querySelector('.rn-scroll');if(!scroll)throw Error('Expected actual screen ScrollView');
const textFailures=[],buttonTextOverhangs=[];let measuredText=0;for(const e of root.querySelectorAll('.rn-text')){const own=hudRect(e),pieces=[],walk=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let textNode;while((textNode=walk.nextNode()))for(const match of textNode.textContent.matchAll(/\\S+/gu)){const range=document.createRange();range.setStart(textNode,match.index);range.setEnd(textNode,match.index+match[0].length);pieces.push(...range.getClientRects());}const button=e.closest('[role=button]'),box=button?hudRect(button):own;measuredText++;if(button&&pieces.some(p=>p.left<own.left-1||p.right>own.right+1))buttonTextOverhangs.push({text:e.textContent,own,button:box});if(pieces.some(p=>p.left<box.left-1||p.right>box.right+1||(button&&(p.top<box.top-1||p.bottom>box.bottom+1))))textFailures.push({text:e.textContent.slice(0,80),own,pieces:pieces.map(p=>({left:p.left,right:p.right,top:p.top,bottom:p.bottom}))});}
const buttons=[];for(const button of root.querySelectorAll('[role="button"]')){button.scrollIntoView({block:'center'});await new Promise(r=>requestAnimationFrame(r));const rect=hudRect(button),clip=hudRect(scroll),text=button.querySelector('.rn-text'),tr=text?hudRect(text):null;buttons.push({label:button.dataset.label,width:rect.width,height:rect.height,visibleHeight:Math.max(0,Math.min(rect.bottom,clip.bottom)-Math.max(rect.top,clip.top)),textWithin:!tr||(tr.left>=rect.left-1&&tr.right<=rect.right+1&&tr.top>=rect.top-1&&tr.bottom<=rect.bottom+1)});}
scroll.scrollTop=0;await new Promise(r=>requestAnimationFrame(r));return{scroll:{scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth},buttons,measuredText,textFailures,buttonTextOverhangs};};
window.move=async label=>{const scroll=root.querySelector('.rn-scroll');if(label==='bottom')scroll.scrollTop=scroll.scrollHeight;else if(label==='top')scroll.scrollTop=0;else if(label==='record'){root.querySelector('[data-testid=render-diagnostic-record]').scrollIntoView({block:'start'});}else{const button=[...root.querySelectorAll('[role="button"]')].find(b=>b.dataset.label===label);if(!button)throw Error('Missing scroll target '+label);button.scrollIntoView({block:'center'});}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return scroll.scrollTop;};window.ready=true;</script>`);
  const browser = await openBrowser(out), results = [];
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) { if (browser.errors.length) throw Error(JSON.stringify(browser.errors)); await delay(100); }
    if (!await browser.evaluate('window.ready===true')) throw Error('Viewer did not load');
    for (const record of records) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: record.width, height: record.height, deviceScaleFactor: 1, mobile: false });
      const metrics = await browser.evaluate(`window.draw(${JSON.stringify(record)})`);
      if (metrics.scroll.scrollWidth > metrics.scroll.clientWidth + 1 || metrics.textFailures.length || metrics.buttons.some(b => b.width < 44 || b.height < 44 || b.visibleHeight < 44 || !b.textWithin)) throw Error(`${record.id}: ${JSON.stringify(metrics)}`);
      const files = [];
      if (record.width === 320 && !['support-copied', 'support-reclosed'].includes(record.state)) {
        const positions = record.state.startsWith('support') ? record.details ? ['情報をコピー', 'record'] : ['詳しい情報'] : record.state.startsWith('settings') ? ['top', '上下の感度：控えめ', 'bottom'] : ['top', 'bottom'];
        for (const position of positions) {
          const scrollTop = await browser.evaluate(`window.move(${JSON.stringify(position)})`);
          const bytes = Buffer.from((await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })).data, 'base64');
          const file = `${record.id}-${['top', 'bottom', 'record'].includes(position) ? position : position === '上下の感度：控えめ' ? 'controls' : 'support'}.png`;
          fs.writeFileSync(path.join(out, file), bytes); files.push({ file, bytes: bytes.length, sha256: sha256(bytes), scrollTop });
        }
      }
      results.push({ id: record.id, profile: record.profile, state: record.state, width: record.width, height: record.height, fontScale: record.fontScale, details: record.details, metrics, files });
    }
    if (browser.errors.length) throw Error(JSON.stringify(browser.errors));
    return { results, browserErrors: browser.errors };
  } finally { await browser.close(); }
}
async function main() {
  const records = await extract(), rendered = await capture(records); verify();
  const report = { method: 'Actual ChapterOneHomeScreen/SettingsScreen/SupportInformation hosts and Japanese button callbacks. UI-only migration and explicitly QA_FIXTURE GL/audio records; unavailable audio is a bridge fixture. Existing styles translated to browser CSS. Switch footprint is an explicit approximate 51x31 placeholder. Unset text line-height uses CSS normal; authored numeric line-height remains scaled. Non-whitespace text fragments (excluding CSS hanging spaces) checked against their own horizontal boxes or containing button ink bounds (including native padding); any text-box overhang within a button is retained in metrics; buttons individually scrolled and measured. Not native Yoga, iPhone safe-area, VoiceOver or audible playback.',
    toolHash: sha256(fs.readFileSync(__filename)), toolHashes, sourceHashes: Object.fromEntries(bridge.hashes), ...rendered };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ cases: records.length, images: rendered.results.flatMap(r => r.files).length, measuredText: rendered.results.reduce((n,r)=>n+r.metrics.measuredText,0), out }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
