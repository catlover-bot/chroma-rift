#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Actual ending component and native style objects, rendered with browser CSS.
// This tests readable layout and scroll reachability, not native Yoga/VoiceOver.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const { installSourceBridge, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
if (process.argv.length !== 2) throw Error('usage: node scripts/qa-chapter-ending-layout.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal013/ending-layout');
fs.mkdirSync(out, { recursive: true });
const bridge = installSourceBridge(root), context = { width: 320, height: 568, fontScale: 2 };
const native = installNativeHudBridge(context);
const { ChapterOneEndingScreen } = require('../src/screens/ChapterOneEndingScreen.tsx');
const sizes = [[320, 568, 2], [390, 844, 1.5], [430, 932, 1]];
const storyHost = path.join(root, '.expo/goal013/story-layout-host');

async function extract() {
  const records = [];
  for (const [width, height, fontScale] of sizes) for (const showProcedure of [false, true]) {
    Object.assign(context, { width, height, fontScale });
    const callbacks = { shown: 0, home: 0, areas: 0, discoveries: 0 };
    const hud = await native.mount(ChapterOneEndingScreen, {
      showProcedure, onShown: () => { callbacks.shown++; },
      onHome: () => { callbacks.home++; }, onAreas: () => { callbacks.areas++; },
      onDiscoveries: () => { callbacks.discoveries++; },
    });
    try {
      if (callbacks.shown !== 1) throw Error('Ending was not presented exactly once');
      const tree = hud.serialize();
      const labels = hud.tree.root.findAll(node => node.type === 'Pressable')
        .map(node => node.props.accessibilityLabel);
      if (labels.join('|') !== 'エリアを振り返る|発見の記録|ホームへ戻る')
        throw Error('Ending navigation actions changed');
      records.push({ id: `ending-${width}-${showProcedure ? 'procedure' : 'normal'}`,
        type: 'ending', width, height, fontScale, showProcedure, tree, labels });
      await hud.press('ホームへ戻る');
      if (callbacks.home !== 1) throw Error('Ending home action was not delivered');
    } finally { await hud.unmount(); }
  }
  bridge.verify();
  return records;
}

function extractTransitionStories() {
  cp.execFileSync(process.execPath, [path.join(root, 'scripts/preview-chapter-reentry.cjs'),
    '--chapter-one', '--story-layout', '--extract-only', `--out=${storyHost}`],
  { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  const raw = fs.readFileSync(path.join(storyHost, 'story-layout.json'));
  const data = JSON.parse(raw);
  const hostReport = JSON.parse(fs.readFileSync(path.join(storyHost, 'report.json'), 'utf8'));
  if (data.screens?.map(screen => screen.beat).join('|') !==
    'emergency-circuit|containment-procedure|isolation-key')
    throw Error('Actual App did not show all expected transition beats');
  if (hostReport.route?.length !== 5 || !hostReport.final?.campaignCompleted ||
    hostReport.maxActiveCanvasBoundaries !== 1 || hostReport.activeCanvasBoundariesAfterUnmount !== 0)
    throw Error('Story layout was not captured from a completed single-App route');
  return { hash: sha256(raw), host: { route: hostReport.route,
    final: hostReport.final, maxActiveCanvasBoundaries: hostReport.maxActiveCanvasBoundaries,
    activeCanvasBoundariesAfterUnmount: hostReport.activeCanvasBoundariesAfterUnmount,
    motionTrace: { areas: hostReport.motionTrace.areas, ticks: hostReport.motionTrace.ticks,
      samples: hostReport.motionTrace.samples, validation: hostReport.motionTrace.validation },
    sourceHashes: hostReport.sourceHashes,
    toolHash: hostReport.toolHash },
    screens: data.screens.flatMap(screen => sizes.map(([width, height, fontScale]) => ({
    id: `story-${screen.beat}-${width}`, type: 'story', beat: screen.beat,
    fromArea: screen.fromArea, toArea: screen.toArea,
    width, height, fontScale, tree: screen.tree,
  }))) };
}

async function capture(records) {
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${browserStyles}
    #root{position:absolute;inset:0;display:flex;flex-direction:column}</style>
    <div id="root"></div><script type="module">${browserHelpers}
    const root=document.getElementById('root');
    window.draw=async(record,position)=>{root.replaceChildren(hudDOM(record.tree,record.fontScale,document.createElement('div')));
      await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      if(record.type==='story'){
        const button=root.querySelector('[role="button"][data-label="点検を続ける"]');
        if(!button)throw Error('Real App story continue action missing');
        const overlay=button.parentElement,rect=hudRect(overlay),action=hudRect(button);
        const text=[...overlay.querySelectorAll('.rn-text')].map(element=>({content:element.textContent,rect:hudRect(element)}));
        return{position:'overlay',overlay:{rect,scrollHeight:overlay.scrollHeight,
          clientHeight:overlay.clientHeight,scrollWidth:overlay.scrollWidth,clientWidth:overlay.clientWidth},
          action,text};
      }
      const scroll=root.querySelector('.rn-scroll');if(!scroll)throw Error('Ending has no scroll container');
      scroll.scrollTop=position==='bottom'?scroll.scrollHeight:0;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const buttons=[...root.querySelectorAll('[role="button"]')].map(element=>{
        const rect=hudRect(element),clip=hudRect(scroll),visible={left:Math.max(rect.left,clip.left),
          right:Math.min(rect.right,clip.right),top:Math.max(rect.top,clip.top),bottom:Math.min(rect.bottom,clip.bottom)};
        return{label:element.dataset.label,rect,visible,visibleHeight:Math.max(0,visible.bottom-visible.top)};});
      const text=[...root.querySelectorAll('.rn-text')].map(element=>({content:element.textContent,rect:hudRect(element)}));
      return{position,scroll:{scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,
        scrollWidth:scroll.scrollWidth,clientHeight:scroll.clientHeight,clientWidth:scroll.clientWidth},
        buttons,text};};window.ready=true;</script>`);
  const browser = await openBrowser(out), results = [];
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors));
      await delay(100);
    }
    if (!await browser.evaluate('window.ready===true')) throw Error('Ending viewer did not load');
    for (const record of records) {
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width: record.width, height: record.height, deviceScaleFactor: 1, mobile: false });
      for (const position of record.type === 'ending' ? ['top', 'bottom'] : ['overlay']) {
        const metrics = await browser.evaluate(`window.draw(${JSON.stringify(record)},${JSON.stringify(position)})`);
        const image = Buffer.from((await browser.send('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: false })).data, 'base64');
        const file = `${record.id}-${position}.png`;
        fs.writeFileSync(path.join(out, file), image);
        if (record.type === 'story') {
          const action = metrics.action, overlay = metrics.overlay;
          if (overlay.scrollHeight > overlay.clientHeight + 1 || overlay.scrollWidth > overlay.clientWidth + 1 ||
            action.width < 44 || action.height < 44 || action.top < 0 || action.bottom > record.height ||
            metrics.text.some(item => item.rect.top < 0 || item.rect.bottom > record.height))
            throw Error(`${record.id}: transition text or continue action is clipped`);
        } else {
          if (metrics.scroll.scrollWidth > metrics.scroll.clientWidth + 1)
            throw Error(`${record.id}: horizontal text overflow`);
          if (metrics.buttons.some(button => button.rect.width < 44 || button.rect.height < 44))
            throw Error(`${record.id}: a navigation button is too small`);
          if (position === 'bottom' && metrics.buttons.at(-1)?.visibleHeight < 44)
            throw Error(`${record.id}: home button cannot be reached at scroll end`);
        }
        results.push({ id: record.id, width: record.width, height: record.height,
          fontScale: record.fontScale, type: record.type, showProcedure: record.showProcedure,
          position, file, sha256: sha256(image), metrics });
      }
    }
    if (browser.errors.length) throw Error('Browser ending layout error');
    return { results, browserErrors: browser.errors };
  } finally { await browser.close(); }
}

async function main() {
  const ending = await extract(), stories = extractTransitionStories();
  const records = [...ending, ...stories.screens], rendered = await capture(records);
  bridge.verify();
  const report = { method: 'Actual ChapterOneEndingScreen host and three transition overlay trees from one real five-area App host route. Each is drawn at 320×568/fontScale2, 390×844/1.5 and 430×932/1 using native styles translated to browser CSS. Ending top/bottom and transition action/text rectangles are captured. The App host used memory AsyncStorage and stub native Canvas/audio; this is not native Yoga, VoiceOver focus, safe-area or iPhone screenshot evidence.',
    toolHash: sha256(fs.readFileSync(__filename)), sourceHashes: Object.fromEntries(bridge.hashes),
    storyHost: { sha256: stories.hash, file: 'story-layout.json',
      beats: ['emergency-circuit', 'containment-procedure', 'isolation-key'], ...stories.host },
    ...rendered };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ cases: records.length, images: rendered.results.length,
    minimumHomeVisibleHeight: Math.min(...rendered.results.filter(result => result.position === 'bottom')
      .map(result => result.metrics.buttons.at(-1).visibleHeight)), out }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
