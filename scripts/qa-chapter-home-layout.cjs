#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Actual chapter home component, with UI-only state fixtures. Browser CSS is
// useful for layout inspection, but it is not native Yoga or VoiceOver.
const fs = require('node:fs'), path = require('node:path');
const { installSourceBridge, openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const { installNativeHudBridge, browserStyles, browserHelpers } = require('./lib/native-hud-qa.cjs');
if (process.argv.length !== 2) throw Error('usage: node scripts/qa-chapter-home-layout.cjs');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal013/home-layout');
fs.mkdirSync(out, { recursive: true });
const bridge = installSourceBridge(root), context = { width: 320, height: 568, fontScale: 2 };
const native = installNativeHudBridge(context);
const { ChapterOneHomeScreen } = require('../src/screens/ChapterOneHomeScreen.tsx');
const { CHAPTER_ONE, CHAPTER_TWO } = require('../src/domain/campaign/definition.ts');
const { CHAPTER_ONE_DISCOVERY_TITLES } = require('../src/content/chapterOneDiscoveries.ts');
const areas = CHAPTER_ONE.areas.map(area => area.id), sizes = [[320, 568, 2], [390, 844, 1.5], [430, 932, 1]];
const discoveryFixture = Object.fromEntries(areas.map(id => [id, Object.keys(CHAPTER_ONE_DISCOVERY_TITLES[id])]));
const sessionFixture = { currentArea: areas[2], completedAreas: areas.slice(0, 2), campaignCompleted: false };
const completeFixture = { currentArea: areas[4], completedAreas: areas, campaignCompleted: true };
const states = [
  { id: 'new-import', migration: { status: 'ready', completedPrefix: 2 }, replayable: areas.slice(0, 2),
    expected: ['第一章をはじめる', '記録を引き継ぐ', 'エリアを振り返る', '発見の記録', '設定'], action: '記録を引き継ぐ' },
  { id: 'in-progress', session: sessionFixture, replayable: areas.slice(0, 3),
    expected: ['続きから', '第一章をはじめから', 'エリアを振り返る', '発見の記録', '設定'], action: '続きから' },
  { id: 'completed', session: completeFixture, replayable: areas,
    expected: ['エンディングを見る', '第一章をはじめから', 'エリアを振り返る', '発見の記録', '設定'], action: 'エンディングを見る' },
  { id: 'area-list', session: completeFixture, replayable: areas, showAreas: true,
    expected: [...CHAPTER_ONE.areas.map(area => `${area.title}を振り返る`), '第一章のホームへ'], action: '第一章のホームへ' },
  { id: 'discoveries', session: completeFixture, replayable: areas, showDiscoveries: true,
    discoveries: discoveryFixture, expected: ['第一章のホームへ'], action: '第一章のホームへ' },
];

async function extract() {
  const records = [];
  for (const [width, height, fontScale] of sizes) for (const state of states) {
    Object.assign(context, { width, height, fontScale });
    const callbacks = [];
    const props = { session: state.session, migration: state.migration, loading: false,
      replayable: state.replayable, showAreas: !!state.showAreas,
      showDiscoveries: !!state.showDiscoveries, discoveries: state.discoveries ?? {},
      onContinue: () => callbacks.push('続きから'), onNew: () => callbacks.push('第一章をはじめる'),
      onImport: () => callbacks.push('記録を引き継ぐ'), onAreas: () => callbacks.push('エリアを振り返る'),
      onDiscoveries: () => callbacks.push('発見の記録'), onHome: () => callbacks.push('第一章のホームへ'),
      onReplay: id => callbacks.push(`replay:${id}`), onEnding: () => callbacks.push('エンディングを見る'),
      onSettings: () => callbacks.push('設定') };
    const hud = await native.mount(ChapterOneHomeScreen, props);
    try {
      const tree = hud.serialize();
      const labels = hud.tree.root.findAll(node => node.type === 'Pressable')
        .map(node => node.props.accessibilityLabel);
      if (labels.join('|') !== state.expected.join('|')) throw Error(`${state.id}: chapter home actions changed: ${labels}`);
      const text = hud.tree.root.findAll(node => node.type === 'Text').map(node => node.children.join('')).join(' ');
      if (!text.includes(CHAPTER_TWO.notice) || !text.includes(CHAPTER_TWO.unavailable))
        throw Error(`${state.id}: planned chapter notice missing`);
      records.push({ id: `${state.id}-${width}`, width, height, fontScale, tree, labels, state: state.id });
      await hud.press(state.action);
      const expectedCallback = state.action === '第一章をはじめから' ? '第一章をはじめる' : state.action;
      if (callbacks.join('|') !== expectedCallback) throw Error(`${state.id}: primary action not delivered`);
    } finally { await hud.unmount(); }
  }
  bridge.verify();
  return records;
}

async function capture(records) {
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>${browserStyles}
    #root{position:absolute;inset:0;display:flex;flex-direction:column}</style>
    <div id="root"></div><script type="module">${browserHelpers}
    const root=document.getElementById('root');
    window.draw=async(record)=>{root.replaceChildren(hudDOM(record.tree,record.fontScale,document.createElement('div')));
      await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const scroll=root.querySelector('.rn-scroll');if(!scroll)throw Error('Chapter home scroll missing');
      const numbers=[...root.querySelectorAll('.rn-text')].filter(e=>/^0[1-5]$/.test(e.textContent))
        .map(e=>{const range=document.createRange();range.selectNodeContents(e);
          return{text:e.textContent,lines:range.getClientRects().length,width:hudRect(e).width};});
      const buttons=[...root.querySelectorAll('[role="button"]')];const reach=[];
      for(const button of buttons){button.scrollIntoView({block:'center'});
        await new Promise(r=>requestAnimationFrame(r));
        const rect=hudRect(button),clip=hudRect(scroll);
        reach.push({label:button.dataset.label,width:rect.width,height:rect.height,
          visibleHeight:Math.max(0,Math.min(rect.bottom,clip.bottom)-Math.max(rect.top,clip.top))});}
      scroll.scrollTop=0;await new Promise(r=>requestAnimationFrame(r));
      const top={scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,
        clientHeight:scroll.clientHeight,scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth};
      return{top,reach,numbers};};
    window.move=async(position)=>{const scroll=root.querySelector('.rn-scroll');
      scroll.scrollTop=position==='middle'?scroll.scrollHeight/2:scroll.scrollHeight;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return{scrollTop:scroll.scrollTop,scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,
        scrollWidth:scroll.scrollWidth,clientWidth:scroll.clientWidth};};window.ready=true;</script>`);
  const browser = await openBrowser(out), results = [];
  try {
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i++) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors));
      await delay(100);
    }
    if (!await browser.evaluate('window.ready===true')) throw Error('Home viewer did not load');
    for (const record of records) {
      await browser.send('Emulation.setDeviceMetricsOverride', {
        width: record.width, height: record.height, deviceScaleFactor: 1, mobile: false });
      const metrics = await browser.evaluate(`window.draw(${JSON.stringify(record)})`);
      if (metrics.top.scrollWidth > metrics.top.clientWidth + 1 ||
        ((record.state === 'area-list' || record.state === 'discoveries') &&
          (metrics.numbers.length !== 5 || metrics.numbers.some(number => number.lines !== 1))) ||
        metrics.reach.some(button => button.width < 44 || button.height < 44 || button.visibleHeight < 44))
        throw Error(`${record.id}: chapter home button, number or horizontal text clipped: ${JSON.stringify({scroll:metrics.top,numbers:metrics.numbers,reach:metrics.reach})}`);
      const files = [];
      if (record.width === 320) {
        for (const position of record.state === 'area-list' || record.state === 'discoveries'
          ? ['top', 'middle', 'bottom'] : ['top', 'bottom']) {
          if (position !== 'top') metrics[position] = await browser.evaluate(`window.move(${JSON.stringify(position)})`);
          const image = Buffer.from((await browser.send('Page.captureScreenshot', {
            format: 'png', captureBeyondViewport: false })).data, 'base64');
          const file = `${record.id}-${position}.png`;
          fs.writeFileSync(path.join(out, file), image);
          files.push({ file, sha256: sha256(image) });
        }
      }
      results.push({ id: record.id, state: record.state, width: record.width,
        height: record.height, fontScale: record.fontScale, labels: record.labels, metrics, files });
    }
    if (browser.errors.length) throw Error('Browser home layout error');
    return { results, browserErrors: browser.errors };
  } finally { await browser.close(); }
}

async function main() {
  const records = await extract(), rendered = await capture(records);
  bridge.verify();
  const report = { method: 'Actual ChapterOneHomeScreen host with UI-only new/import, progress, completed, area-list and full-discoveries fixtures. Native styles translated to browser CSS at three sizes. All actions are individually scrolled into view and their visible button rectangles measured. This does not verify native Yoga, VoiceOver focus, safe-area insets, device persistence, or real user progress.',
    toolHash: sha256(fs.readFileSync(__filename)), sourceHashes: Object.fromEntries(bridge.hashes), ...rendered };
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ states: states.length, cases: records.length,
    images: rendered.results.flatMap(result => result.files).length,
    minimumVisibleHeight: Math.min(...rendered.results.flatMap(result => result.metrics.reach.map(button => button.visibleHeight))), out }));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
