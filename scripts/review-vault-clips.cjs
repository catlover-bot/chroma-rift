#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Decode completed real WebGL videos into ordered inspection sheets and audit
// the exact serialized mesh transforms. No app source or images are synthesized.
const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process');
const THREE = require('three');
const { sha256, openBrowser, delay } = require('./lib/three-scene-qa.cjs');
const root = path.resolve(__dirname, '..'), source = path.join(root, '.expo/goal009/vault-chapter'), output = path.join(root, 'docs/qa-goal009/chapter');
const json = filename => JSON.parse(fs.readFileSync(filename)), write = (filename, value) => fs.writeFileSync(filename, JSON.stringify(value, null, 2) + '\n');
const sheets = [
  { id: 'west-overview', video: 'west', start: 0, rate: .5, tile: '5x5' },
  { id: 'east-overview', video: 'east', start: 0, rate: .5, tile: '5x5' },
  { id: 'notice-pursuit', video: 'west', start: 9, rate: 2, tile: '4x4' },
  { id: 'length-operation', video: 'west', start: 1, rate: 2, tile: '4x4' },
  { id: 'rod-operation', video: 'west', start: 19, rate: 2, tile: '4x4' },
  { id: 'search-overview', video: 'search', start: 0, rate: .7, tile: '5x5' },
  { id: 'search-and-return', video: 'search', start: 20, rate: 1, tile: '4x3' },
  { id: 'partition-attack-blocked', video: 'west', start: 33.8, rate: 5, tile: '4x3' },
  { id: 'final-door-and-result', video: 'west', start: 37.7, rate: 5, tile: '4x4' },
  { id: 'lateral-dodge', video: 'windup-dodge', start: 0, rate: 5, tile: '5x3' },
  { id: 'entry-peek', video: 'entry-peek', start: 0, rate: 4, tile: '4x3' },
];
async function captureSettledLayouts() {
  const ids = fs.readdirSync(source).filter(id => id.startsWith('layout-') && fs.statSync(path.join(source, id)).isDirectory()).sort();
  const browser = await openBrowser(source), reports = [];
  try {
    for (let i = 0; i < 200 && !await browser.evaluate('window.chapterReady===true'); i++) await delay(100);
    for (const id of ids) {
      const timeline = json(path.join(source, id, 'timeline.json'));
      await browser.send('Emulation.setDeviceMetricsOverride', { width: timeline.width, height: timeline.height, deviceScaleFactor: 1, mobile: false });
      await browser.evaluate('window.loadChapter(' + JSON.stringify(id) + ')');
      const stats = [];
      for (const shot of timeline.snapshots) for (const bottom of [false, true]) {
        const value = await browser.evaluate('window.renderChapterFrame(' + shot.frame + ',' + bottom + ')');
        // Scrolling is composited asynchronously in Chromium. Let both layout
        // and compositor frames settle before recording the actual pixels.
        await browser.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
        const png = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        fs.writeFileSync(path.join(output, id + '-' + shot.name + (bottom ? '-bottom' : '') + '.png'), Buffer.from(png.data, 'base64'));
        stats.push({ ...value, scrollPosition: bottom ? 'bottom' : 'top', compositorFramesWaited: 2 });
      }
      const disposed = await browser.evaluate('window.disposeChapter()'); reports.push({ id, stats, disposed });
    }
    write(path.join(output, 'layout-webgl.json'), { boundary: 'Second sequential QA pass, one renderer reused for 12 layouts; actual DOM scroll waits two compositor frames. Main video renderer has already closed.', errors: browser.errors, reports });
  } finally { await browser.close(); }
  return reports;
}
async function main() {
const settledLayouts = await captureSettledLayouts();
const layoutAtlases = [];
for (const size of ['320-font1', '320-font2', '390-font1.5', '390-font2', '430-font1', '430-font2']) {
  const files = ['length', 'rod'].flatMap(puzzle => ['baseline', 'expanded', 'baseline-bottom', 'expanded-bottom'].map(state => 'layout-' + puzzle + '-' + size + '-' + state + '.png'));
  const concat = path.join(source, 'layout-' + size + '-atlas.txt');
  fs.writeFileSync(concat, files.map(file => "file '" + path.join(output, file) + "'\nduration 1").join('\n') + '\n');
  const filename = 'layout-' + size + '-overview.png';
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', concat, '-vf', 'fps=1,scale=195:422:force_original_aspect_ratio=decrease,pad=195:422:(ow-iw)/2:(oh-ih)/2:color=0x101619,tile=4x2', '-frames:v', '1', '-update', '1', path.join(output, filename)], { stdio: ['ignore', 'inherit', 'inherit'] });
  layoutAtlases.push({ filename, order: 'Left to right; length top row, rod bottom row. Baseline / expanded / baseline scroll bottom / expanded scroll bottom. Aspect ratio preserved.', files });
}
write(path.join(output, 'layout-atlas-index.json'), layoutAtlases);
// A previous run may have produced more frames in a scratch directory. Encode
// exactly the current timeline length; do not include stale trailing PNGs.
for (const id of ['west', 'east', 'search', 'entry-peek', 'windup-dodge']) {
  const timeline = json(path.join(output, id + '-timeline.json')), file = path.join(output, id + '.mp4');
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(timeline.fps), '-i', path.join(source, id, 'frames/%06d.png'), '-frames:v', String(timeline.frameCount), '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['ignore', 'inherit', 'inherit'] });
  const probe = JSON.parse(cp.execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }));
  if (Number(probe.streams[0].nb_frames) !== timeline.frameCount) throw new Error('Encoded frame count differs from actual timeline: ' + id);
  write(path.join(output, id + '-video.json'), { sha256: sha256(fs.readFileSync(file)), expectedFrames: timeline.frameCount, probe });
}
for (const sheet of sheets) {
  sheet.sampleEverySourceFrames = Math.round(30 / sheet.rate);
  const filter = "select='not(mod(n," + sheet.sampleEverySourceFrames + "))',scale=195:422,pad=iw:ih+22:0:22:color=0x101619,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:text=\'" + sheet.id + ' +%{pts\\:hms}\':x=4:y=4:fontsize=10:fontcolor=white,tile=' + sheet.tile;
  cp.execFileSync('ffmpeg', ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(sheet.start), '-i', path.join(output, sheet.video + '.mp4'), '-vf', filter, '-frames:v', '1', '-update', '1', path.join(output, sheet.id + '.png')], { stdio: ['ignore', 'inherit', 'inherit'] });
}
const reports = [];
for (const id of ['west', 'east', 'search', 'entry-peek', 'windup-dodge']) {
  const timeline = json(path.join(output, id + '-timeline.json')), animation = json(path.join(source, id, 'animation.json'));
  const scene = new THREE.ObjectLoader().parse(json(path.join(source, id, 'scene.json'))), objects = new Map(); scene.traverse(o => objects.set(o.uuid, o));
  const door = scene.getObjectByName('vault-final-door-solid'), rib = scene.getObjectByName('vault-door-impact-rib');
  let maxDoorMismatch = 0, ribMax = .105;
  for (let i = 0; i < timeline.frames.length; i++) {
    for (const [uuid, value] of animation.updates[i]) { const o = objects.get(uuid); o.matrix.fromArray(value.matrix); o.matrix.decompose(o.position, o.quaternion, o.scale); o.visible = value.visible; }
    scene.updateMatrixWorld(true);
    maxDoorMismatch = Math.max(maxDoorMismatch, Math.abs(new THREE.Box3().setFromObject(door).min.y - timeline.frames[i].finalDoorMinY)); ribMax = Math.max(ribMax, rib.position.z);
  }
  const closing = timeline.frames.filter(f => f.progress.finalDoorClosed), phaseStats = {};
  for (const frame of timeline.frames) {
    const stats = phaseStats[frame.actor.phase] ??= { frames: 0, maxActualSpeed: 0, maxRadius: 0, minimumPlayerDistance: Infinity, observedLastSeenChanges: 0 };
    stats.frames++; stats.maxActualSpeed = Math.max(stats.maxActualSpeed, frame.actor.motion.speed); stats.maxRadius = Math.max(stats.maxRadius, frame.audit.radius);
    stats.minimumPlayerDistance = Math.min(stats.minimumPlayerDistance, Math.hypot(frame.actor.motion.position.x - frame.pose.position.x, frame.actor.motion.position.z - frame.pose.position.z));
  }
  const winds = timeline.frames.filter(f => f.actor.phase === 'windup'), attacks = timeline.frames.filter(f => f.actor.phase === 'attack'), search = timeline.frames.filter(f => f.actor.phase === 'search');
  const lastSeen = [...new Set(search.map(f => JSON.stringify(f.actor.lastSeen)))];
  const targets = [...new Set(attacks.map(f => JSON.stringify(f.actor.attackTarget)))];
  reports.push({ id, frameCount: timeline.frameCount, duration: timeline.duration, phases: timeline.phases, phaseStats, summary: timeline.summary,
    closure: { frames: closing.length, actualMeshVsWorldDoorMinYMaxError: maxDoorMismatch, maximumRibDeflection: ribMax - .105, cameraMatricesDuringClose: new Set(closing.map(f => JSON.stringify(f.camera))).size,
      completionCallbacks: timeline.completionCount, firstSavedClearTime: closing[0]?.time, firstResultTime: timeline.frames.find(f => f.result)?.time },
    search: { frames: search.length, occludedFrames: search.filter(f => f.occluded).length, lastSeenSamples: lastSeen.map(text => text ? JSON.parse(text) : null),
      settledDirections: [...new Set(search.filter(f => f.actor.searchDwellSeconds > 0).map(f => f.actor.searchIndex))] },
    attack: { windupSecondsSampled: winds.length / timeline.fps, attackSecondsSampled: attacks.length / timeline.fps, committedTargets: targets.map(text => text ? JSON.parse(text) : null),
      hitFrames: attacks.filter(f => f.actor.attackHit).length, lateralDodgeDistance: id === 'windup-dodge' ? timeline.frames.at(-1).pose.position.x - timeline.frames[0].pose.position.x : null } });
}
const webgl = json(path.join(output, 'webgl.json')), finalReports = [...webgl.reports.filter(r => !r.id.startsWith('layout-')), ...settledLayouts];
const audits = finalReports.flatMap(r => r.stats.map(s => ({ id: r.id, frame: s.frame, scrollPosition: s.scrollPosition ?? 'top', ...s.hud })));
const device = audits.filter(a => a.panel);
const findings = { actualButtonsAtLeast44: device.every(a => a.buttonsAtLeast44), pauseSeparate: device.every(a => !a.pauseOverlapsObjective && !a.pauseOverlapsHeading),
  controlsSeparateFromBoard: device.every(a => !a.controlsOverlapPanel && a.buttonOverlapsPanel.length === 0),
  headingSeparateFromBoard: device.every(a => !a.heading || a.heading.bottom <= a.panel.top || a.heading.top >= a.panel.bottom || a.heading.right <= a.panel.left || a.heading.left >= a.panel.right),
  allBoardBoundsInside: device.every(a => { const width = Number(a.id.match(/-(320|390|430)-/)?.[1] ?? 390), height = width === 320 ? 568 : width === 430 ? 932 : 844; return a.panel.left >= 0 && a.panel.top >= 0 && a.panel.right <= width && a.panel.bottom <= height; }),
  meshWithinCollisionRadius: reports.every(r => r.summary.maxRadius <= .44), noVertexInsideWorldSolids: reports.every(r => r.summary.penetrationVertices === 0),
  stanceWithin2cm: reports.every(r => r.summary.maxStanceCornerSlip <= .02), actualDoorMatchesCollider: reports.every(r => r.closure.actualMeshVsWorldDoorMinYMaxError < 1e-7),
  noCameraChangeAfterClosing: reports.filter(r => r.closure.frames).every(r => r.closure.cameraMatricesDuringClose === 1), completeExactlyOnce: reports.filter(r => ['west','east'].includes(r.id)).every(r => r.closure.completionCallbacks === 1),
  oneRendererReleased: finalReports.every(r => r.disposed.rendererCount === 1 && r.disposed.geometries === 0 && r.disposed.textures === 0), browserErrorsZero: webgl.errors.length === 0 && json(path.join(output, 'layout-webgl.json')).errors.length === 0 };
write(path.join(output, 'sequence-and-hud-audit.json'), { toolSHA256: sha256(fs.readFileSync(__filename)), boundary: 'Actual Scene meshes, continuous controller state and actual Screen host tree translated to CSS. Native touch delivery, Yoga, sound listening, perceived motion/illusion/fear and device FPS are unverified. Vertex containment checks are sampled, not an arbitrary triangle/solid proof; authoritative collision radius also bounds actual horizontal extent.', findings, reports, layoutAudits: audits.filter(a => a.id.startsWith('layout-')), sheets });
console.log(JSON.stringify(findings));
if (Object.values(findings).some(value => !value)) throw new Error('QA audit has failed findings; inspect sequence-and-hud-audit.json');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
