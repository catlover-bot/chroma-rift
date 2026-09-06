#!/usr/bin/env node
'use strict';
/* global __dirname */
/** P0 regression captures use the recorded Goal006 scene in isolated copies.
 * The after copy applies the shipping shared fixture and legacy chapter code;
 * the removed Gallery A is retained only inside this historical QA fixture. */
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const os = require('node:os');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const revision = '922db3d4404c68eeb61b2f0278f43b21da015744';
const output = path.join(root, 'docs/qa-goal007/p0');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'chroma-panel-qa-'));
const archive = cp.execFileSync('git', ['archive', revision], { cwd: root, maxBuffer: 30 * 1024 * 1024 });
const hashes = {};
for (const mode of ['before', 'after']) {
  const copy = path.join(temporary, mode); fs.mkdirSync(copy);
  cp.execFileSync('tar', ['-x', '-C', copy], { input: archive });
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(copy, 'node_modules'), 'dir');
  if (mode === 'after') {
    for (const file of ['src/domain/firstPerson/panelFixture.ts', 'src/domain/firstPerson/emblemFixture.ts', 'src/rendering/firstPerson/PanelFixture.tsx', 'src/rendering/firstPerson/ChapterScene.tsx']) {
      fs.copyFileSync(path.join(root, file), path.join(copy, file));
      hashes[file] = crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
    }
    const file = path.join(copy, 'src/rendering/firstPerson/GalleryScene.tsx');
    let scene = fs.readFileSync(file, 'utf8');
    const start = scene.indexOf('    <mesh name="gallery-emblem-frame"'), end = scene.indexOf('    {GALLERY_EMBLEM_SWITCHES.map', start);
    if (start < 0 || end < 0) throw new Error('Recorded Gallery A boundary not found');
    scene = `import { createPanelFixture } from '../../domain/firstPerson/panelFixture';\nimport { PanelFixture } from './PanelFixture';\n` + scene.slice(0, start) +
      `    <PanelFixture name="emblem" fixture={historicalEmblemFixture} box={resources.box} plane={resources.plane} surface={resources.emblemSurface!.material} backing={resources.dark} frame={r.warm} />\n` + scene.slice(end);
    scene = scene.replace('type Block =', 'const historicalEmblemFixture = createPanelFixture(GALLERY_EMBLEM_FIXTURE);\ntype Block =');
    fs.writeFileSync(file, scene);
  }
  let script = fs.readFileSync(path.join(copy, 'scripts/preview-gallery.cjs'), 'utf8');
  script = script.replace("const output = path.join(root, 'docs/qa-goal006');", 'const output = ' + JSON.stringify(path.join(output, mode)) + ';');
  script = script.replace("const sceneOutput = path.join(root, '.expo/goal006/gallery-preview');", 'const sceneOutput = ' + JSON.stringify(path.join(root, '.expo/goal007/p0', mode)) + ';');
  script = script.replace("const { GalleryScene } =", "const { ChapterScene } = require('../src/rendering/firstPerson/ChapterScene.tsx');\nconst { createInitialRuntime } = require('../src/domain/firstPerson/runtime.ts');\nconst { GalleryScene } =");
  script = script.replace('const runtime = G.createGalleryRuntime(undefined, 606);', "const runtime = view.kind === 'legacy' ? createInitialRuntime() : G.createGalleryRuntime(undefined, 606);\n  if (view.kind === 'legacy') { runtime.pose = JSON.parse(JSON.stringify(view.pose)); return runtime; }");
  const a = script.indexOf('const views = ['), b = script.indexOf('function makeHost', a);
  const views = [];
  for (const kind of ['legacy', 'gallery']) {
    const y = kind === 'legacy' ? 1.83 : 2.02;
    const entries = [['front', 1.95, -4.4], ['near', 1.95, -6.25], ['left', 0.2, -5.5], ['right', 2.65, -5.5], ...[-2, -1, 0, 1, 2].map((step, i) => ['move-' + i, 1.6 + step * 0.5, -5.25 - i * 0.12]), ['wall', 1.95, -4.4]];
    for (const [name, x, z] of entries) {
      const dx = 1.95 - x, dz = -7.81 - z;
      views.push({ id: kind + '-' + name, title: kind + ' ' + name, kind, wall: name === 'wall', pose: { position: { x, y: 1.6, z }, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(y - 1.6, Math.hypot(dx, dz)) } });
    }
  }
  script = script.slice(0, a) + 'const views = ' + JSON.stringify(views) + ';\n' + script.slice(b);
  const panelStart = script.indexOf("  for (const kind of ['shadow', 'contour'])"), panelEnd = script.indexOf('  const snapshots = [];', panelStart);
  script = script.slice(0, panelStart) + script.slice(panelEnd);
  script = script.replace('React.createElement(GalleryScene, { world, runtime: { current: runtime }, progress: runtime.progress, resources, reducedMotion: true })', "React.createElement(view.kind === 'legacy' ? ChapterScene : GalleryScene, { world, runtime: { current: runtime }, progress: runtime.progress, resources, reducedMotion: true, assist: false, lowQuality: false, lab: false })");
  script = script.replace('    const runtime = makeRuntime(view), world = getWorld(runtime);', "    const runtime = makeRuntime(view), world = getWorld(runtime);\n    if (!require('../src/domain/firstPerson/geometry.ts').isSafePose(runtime.pose, world)) throw new Error('P0 camera is outside walkable world: ' + view.id);");
  script = script.replace('    scene.updateMatrixWorld(true);', `    if (view.wall) {
      const wall = new THREE.Mesh(resources.box, resources.wall); wall.name = 'qa-opaque-occluder';
      wall.position.set(1.95, 1.9, -6.3); wall.scale.set(3.5, 3.5, .2); scene.add(wall);
    }
    scene.updateMatrixWorld(true);
    const plate = scene.getObjectByName('emblem-plate'), bounds = new THREE.Box3().setFromObject(plate);
    const fixtureMeshes = [];
    scene.traverse(object => { if (object.isMesh && (object.name === 'gallery-emblem-frame' || object.name.startsWith('emblem-frame-') || object.name === 'emblem-backing')) fixtureMeshes.push(object); });
    const panelAudit = { surfaceBounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, surfaceMaterial: { depthTest: plate.material.depthTest, depthWrite: plate.material.depthWrite, transparent: plate.material.transparent, renderOrder: plate.renderOrder },
      parts: fixtureMeshes.map(object => { const box = new THREE.Box3().setFromObject(object); return { name: object.name, min: box.min.toArray(), max: box.max.toArray(), intersectsSurface: box.intersectsBox(bounds), coplanarWithinMicrometre: Math.abs(bounds.min.z - box.max.z) < 1e-6 && Math.min(bounds.max.x, box.max.x) - Math.max(bounds.min.x, box.min.x) > 1e-6 && Math.min(bounds.max.y, box.max.y) - Math.max(bounds.min.y, box.min.y) > 1e-6, behindSurfaceGap: bounds.min.z - box.max.z }; }) };
    view.panelAudit = panelAudit;`);
  script = script.replace('    verifyPixelContracts(snapshots);', '    // P0 records geometric separation and wall visibility; no B/C perception claim.');
  script = script.replace("const sourcePaths = ['src/rendering/firstPerson/GalleryScene.tsx', 'src/rendering/firstPerson/galleryGraphics.ts', 'src/rendering/firstPerson/galleryResources.ts', 'src/domain/gallery/definition.ts', 'src/domain/gallery/world.ts', 'src/domain/gallery/shadow.ts', 'src/domain/gallery/contour.ts'];", "const sourcePaths = ['src/rendering/firstPerson/GalleryScene.tsx', 'src/rendering/firstPerson/ChapterScene.tsx', 'src/domain/firstPerson/emblemFixture.ts', ...['src/rendering/firstPerson/PanelFixture.tsx', 'src/domain/firstPerson/panelFixture.ts'].filter(file => fs.existsSync(path.join(root, file)))];");
  script = script.replace('Authored fixture snapshots from existing GalleryScene + one sampled scene callback; no native R3F/GL/input/HUD/audio/device/perception validation', 'P0 historical Goal006 Gallery A and retained legacy ChapterScene; shared fixture applied only in after; one sampled scene callback; no native R3F/GL/input/HUD/audio/device/perception validation');
  const generated = path.join(copy, 'scripts/p0-generated.cjs'); fs.writeFileSync(generated, script);
  cp.execFileSync(process.execPath, [generated, ...(process.argv.includes('--capture') ? ['--capture'] : [])], { cwd: copy, stdio: 'inherit' });
}
fs.writeFileSync(path.join(output, 'provenance.json'), JSON.stringify({ baselineRevision: revision, temporaryWorkspace: temporary, shippingSourceHashes: hashes,
  oldGalleryAfter: 'Recorded Goal006 Gallery A JSX replaced only by the shipping PanelFixture, inside the isolated QA copy. This is not the redesigned Goal007 gallery.',
  scope: 'Actual authored meshes/materials rendered by browser Three/ANGLE SwiftShader; no native renderer, HUD, touch, perception, sound or device performance claim.' }, null, 2) + '\n');
console.log('P0 artifacts: ' + output);
