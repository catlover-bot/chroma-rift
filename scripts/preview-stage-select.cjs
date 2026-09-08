#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// StageSelectScreen's real host tree and StageArtwork drawing coordinates.
// Browser CSS + SVG are visual QA boundaries, not native Yoga/Skia tests.
const fs = require('node:fs'), path = require('node:path'), Module = require('node:module');
const { installSourceBridge, openBrowser, sha256, delay } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
const root = path.resolve(__dirname, '..'), stage = path.join(root, '.expo/goal010/stage-select');
fs.mkdirSync(stage, { recursive: true });
const bridge = installSourceBridge(root), context = { width: 390, height: 844, fontScale: 1 };
const native = installNativeHudBridge(context);
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  if (name === '@shopify/react-native-skia') return { Canvas: 'QASkiaCanvas', Rect: 'QASkiaRect', Circle: 'QASkiaCircle', Line: 'QASkiaLine', vec: (x, y) => ({ x, y }) };
  return originalLoad.call(this, name, ...args);
};
const { StageSelectScreen } = require('../src/screens/StageSelectScreen.tsx');
const { STAGES, emptyJournal, resumableStage } = require('../src/app/stages.ts');
const flatten = style => Array.isArray(style) ? Object.assign({}, ...style.map(flatten)) : style ?? {};
const escape = s => String(s).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
function primitive(node) {
  if (typeof node === 'string') return '';
  const p = node.props, common = ' fill="' + escape(p.color) + '"';
  if (node.type === 'QASkiaRect') return '<rect x="' + p.x + '" y="' + p.y + '" width="' + p.width + '" height="' + p.height + '"' + common + '/>';
  if (node.type === 'QASkiaCircle') return '<circle cx="' + p.cx + '" cy="' + p.cy + '" r="' + p.r + '"' + common + '/>';
  if (node.type === 'QASkiaLine') return '<line x1="' + p.p1.x + '" y1="' + p.p1.y + '" x2="' + p.p2.x + '" y2="' + p.p2.y + '" stroke="' + escape(p.color) + '" stroke-width="' + p.strokeWidth + '"/>';
  if (typeof node.type === 'string' && node.type.startsWith('QASkia')) throw Error('Unmapped drawing primitive: ' + node.type);
  return node.children.map(primitive).join('');
}
function serialize(node) {
  if (typeof node === 'string') return node;
  const p = node.props;
  if (node.type === 'QASkiaCanvas') {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="' + flatten(p.style).height + '">' + node.children.map(primitive).join('') + '</svg>';
    return { type: 'Image', style: { ...flatten(p.style), objectFit: 'none', objectPosition: 'left top' }, testID: p.testID,
      source: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), children: [] };
  }
  const children = node.children.map(serialize).flat().filter(Boolean);
  if (typeof node.type !== 'string') return children;
  return { type: node.type, style: flatten(typeof p.style === 'function' ? p.style({ pressed: false }) : p.style), contentStyle: flatten(p.contentContainerStyle),
    testID: p.testID, label: p.accessibilityLabel, disabled: !!p.disabled, pointerEvents: p.pointerEvents, source: p.source?.uri, children };
}
async function main() {
  const raw = [], events = [];
  for (const [width, height, fontScale] of [[320, 568, 2], [390, 844, 1.5], [430, 932, 1]]) for (const scenario of ['new', 'resumable-vault', 'protected-replay']) {
    Object.assign(context, { width, height, fontScale });
    const cards = STAGES.map((s, i) => ({ id: s.id, current: scenario === 'new' ? 'new' : scenario === 'resumable-vault' ? i === 0 ? 'cleared' : i === 1 ? 'exploring' : 'new' : i === 0 ? 'blocked' : i === 1 ? 'cleared' : 'new',
      history: { everCleared: scenario !== 'new' && i < 2, discoveries: [] } }));
    const journal = { ...emptyJournal(), recentEntries: scenario === 'new' ? [] : ['uncanny-vault-v1', 'perception-gallery-v1'] };
    const lastResume = resumableStage(journal, cards), id = scenario + '-' + width;
    const view = await native.mount(StageSelectScreen, { cards, lastResume, onSelect(stageId, replay) { events.push({ id, stageId, replay }); }, onSettings() {} });
    raw.push({ id, width, height, fontScale, cards, lastResume, tree: serialize(view.tree.root) });
    if (lastResume) await view.pressTestID('resume-last-stage');
    for (const card of cards) await view.pressTestID('select-' + card.id);
    await view.unmount();
  }
  bridge.verify();
  fs.writeFileSync(path.join(stage, 'raw-hosts.json'), JSON.stringify(raw));
  fs.writeFileSync(path.join(stage, 'source-hashes.json'), JSON.stringify(Object.fromEntries(bridge.hashes)));
  fs.writeFileSync(path.join(stage, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${browserStyles}body{background:#09090E}#screen{position:absolute;inset:0;display:flex;flex-direction:column}</style><div id="screen"></div><script type="module">${browserHelpers}
const root=document.getElementById('screen'), data=await(await fetch('./raw-hosts.json')).json();
window.draw=async(id,target)=>{const r=data.find(x=>x.id===id);root.replaceChildren(hudDOM(r.tree,r.fontScale,document.createElement('canvas')));await document.fonts.ready;for(const img of root.querySelectorAll('img'))await img.decode();const scroll=root.querySelector('.rn-scroll');if(target==='bottom')scroll.scrollTop=scroll.scrollHeight;else if(target){const element=root.querySelector('[data-testid="'+target+'"]');if(!element)throw Error('Missing target '+target);element.scrollIntoView({block:'center'});}await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const bounds=hudRect(root), buttons=[...root.querySelectorAll('[role="button"]')].map(e=>({label:e.dataset.label,id:e.dataset.testid,...hudRect(e)}));const texts=[...root.querySelectorAll('.rn-text')].filter(e=>e.children.length===0).map(e=>({text:e.textContent,...hudRect(e)}));return{buttons,scroll:{...hudRect(scroll),height:scroll.scrollHeight,top:scroll.scrollTop},root:bounds,horizontalOverflow:texts.filter(e=>e.left<bounds.left-.1||e.right>bounds.right+.1).map(e=>e.text),artworkCount:root.querySelectorAll('img').length};};window.ready=true;
</script>`);
  const browser = await openBrowser(stage), reports = [];
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) await delay(100);
    for (const r of raw) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: r.width, height: r.height, deviceScaleFactor: 1, mobile: false });
      for (const target of [null, ...STAGES.map(s => 'select-' + s.id)]) {
        const metrics = await browser.evaluate('window.draw(' + JSON.stringify(r.id) + ',' + JSON.stringify(target) + ')');
        const file = r.id + '-' + (target ?? 'top') + '.png';
        const shot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(stage, file), Buffer.from(shot.data, 'base64'));
        reports.push({ id: r.id, width: r.width, height: r.height, fontScale: r.fontScale, target, file, sha256: sha256(fs.readFileSync(path.join(stage, file))),
          lastResume: r.lastResume, buttonsAtLeast44: metrics.buttons.every(b => b.width >= 44 && b.height >= 44), horizontalOverflow: metrics.horizontalOverflow,
          artworkCount: metrics.artworkCount, targetButton: target ? metrics.buttons.find(b => b.id === target) : undefined, scroll: metrics.scroll });
      }
    }
    fs.writeFileSync(path.join(stage, 'report.json'), JSON.stringify({ cases: raw.length, images: reports.length, toolHash: sha256(fs.readFileSync(__filename)),
      boundary: 'Actual StageSelectScreen and StageArtwork. Real selection callbacks are recorded against fixture card state. This isolated view does not prove App navigation/storage or native Skia/Yoga. Actual Rect/Circle/Line coordinates are translated to SVG without replacement artwork.', events, errors: browser.errors, reports }));
    if (browser.errors.length || reports.some(r => !r.buttonsAtLeast44 || r.horizontalOverflow.length)) throw Error('Stage layout audit failed; see compact report');
  } finally { await browser.close(); }
  bridge.verify(); console.log(JSON.stringify({ cases: raw.length, images: reports.length, stage }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
