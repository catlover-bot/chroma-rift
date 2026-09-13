#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Inspect the real area-05 display at three recorded controller states.
const fs = require('node:fs'), path = require('node:path');
const { openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const root = path.resolve(__dirname, '..');
const source = path.join(root, '.expo/goal013/departure-natural');
const browserDirectory = path.join(source, 'attendance');
const output = path.join(root, 'docs/qa-goal013');
const sceneFile = path.join(source, 'scene.json'), animationFile = path.join(source, 'animation.json');
const scene = JSON.parse(fs.readFileSync(sceneFile)), animation = JSON.parse(fs.readFileSync(animationFile));
const sourceHash = sha256(fs.readFileSync(path.join(root, 'src/domain/stages/departure-control-v1/scene.tsx')));
const naturalReport = JSON.parse(fs.readFileSync(path.join(source, 'report.json')));
if (naturalReport.sourceHashes['src/domain/stages/departure-control-v1/scene.tsx'] !== sourceHash)
  throw Error('Area-05 scene changed since natural controller capture');
function find(object, name) {
  if (object.name === name) return object;
  for (const child of object.children || []) { const result = find(child, name); if (result) return result; }
}
const display = find(scene.object, 'attendance-display');
if (!display || display.children.length !== 4) throw Error('Attendance display topology changed');
const digits = display.children.map((group, i) => i === 0 ? group : group.children[0]);
const positions = digits.map(group => group.children.map(mesh => {
  const [x, y] = mesh.matrix ? [mesh.matrix[12], mesh.matrix[13]] : mesh.position.slice(0, 2);
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}));
const expected = [
  ['0.00,0.27', '0.00,-0.27', '-0.15,0.14', '0.15,0.14', '0.15,-0.14', '-0.15,-0.14'],
  ['0.00,0.27', '0.00,-0.27', '0.00,0.00', '0.15,0.14', '-0.15,-0.14'],
  ['0.15,0.14', '0.15,-0.14'],
  ['0.00,0.27', '0.00,-0.27', '-0.15,0.14', '0.15,0.14', '0.15,-0.14', '-0.15,-0.14'],
];
for (let i = 0; i < digits.length; i += 1)
  if (JSON.stringify([...positions[i]].sort()) !== JSON.stringify([...expected[i]].sort()))
    throw Error(`Digit ${i} segments incorrect: ${positions[i]}`);
const units = display.children.slice(1).map(group => group.uuid);
const states = ['02', '01', '00'];
let lastState = 0;
for (const [index, frame] of animation.frames.entries()) {
  const visible = units.map(id => frame.objects.find(object => object.uuid === id)?.visible);
  if (visible.filter(Boolean).length !== 1) throw Error(`Frame ${index} has an invalid attendance readout`);
  const currentState = visible.findIndex(Boolean);
  if (currentState < lastState) throw Error(`Attendance readout reversed at frame ${index}`);
  lastState = currentState;
}
const chosen = states.map((state, index) => {
  const frame = animation.frames.findIndex(item => units.every((id, unit) =>
    item.objects.find(object => object.uuid === id)?.visible === (unit === index)));
  if (frame < 0) throw Error(`Recorded controller never displayed ${state}`);
  return { state, frame, event: animation.frames[frame].event };
});
if (!(chosen[0].frame < chosen[1].frame && chosen[1].frame < chosen[2].frame))
  throw Error('Attendance display did not progress 02→01→00');
if (chosen[1].event !== '閉館制御を停止' || chosen[2].event !== '屋外へ出る')
  throw Error('Attendance changes are not tied to stop and outdoor commands');
fs.mkdirSync(browserDirectory, { recursive: true });
for (const file of ['scene.json', 'animation.json', 'three.module.js', 'three.core.js'])
  fs.copyFileSync(path.join(source, file), path.join(browserDirectory, file));
fs.writeFileSync(path.join(browserDirectory, 'index.html'), `<!doctype html><meta charset="utf-8"><style>
  body{margin:0;background:#09090c;color:#f4f4f6;font:22px sans-serif}
  header{height:58px;box-sizing:border-box;padding:14px 18px;border-bottom:1px solid #87938b}
  canvas{display:block}</style><header id="caption"></header><script type="module">
  import * as THREE from './three.module.js';
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setSize(390,320);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
  document.body.append(renderer.domElement);
  const scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./scene.json')).json());
  const animation=await(await fetch('./animation.json')).json();
  const objects=new Map();scene.traverse(object=>objects.set(object.uuid,object));
  const camera=new THREE.PerspectiveCamera(32,390/320,.08,60);
  window.draw=async(i,label,mode)=>{const close=mode==='close',height=close?320:844;
    renderer.setSize(390,height);camera.fov=close?32:65;camera.aspect=390/height;camera.updateProjectionMatrix();
    if(close)camera.position.set(-2.54,2.35,10.6);
    else {const pose=animation.frames[0].pose;camera.position.set(pose.x,pose.y,pose.z);}
    camera.lookAt(-4.74,2.35,10.6);
    for(const value of animation.frames[i].objects){const object=objects.get(value.uuid);
    object.matrix.fromArray(value.matrix);object.matrix.decompose(object.position,object.quaternion,object.scale);object.visible=value.visible;}
    scene.updateMatrixWorld(true);renderer.render(scene,camera);document.querySelector('#caption').textContent=label;
    camera.updateMatrixWorld(true);const points=[],display=scene.getObjectByName('attendance-display');
    for(const group of display.children)if(group.visible)group.traverse(object=>{if(!object.isMesh||!object.visible)return;
      const box=new THREE.Box3().setFromObject(object);
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])
        points.push(new THREE.Vector3(x,y,z).project(camera));});
    const displayNdc={minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),
      minY:Math.min(...points.map(p=>p.y)),maxY:Math.max(...points.map(p=>p.y))};
    await new Promise(resolve=>requestAnimationFrame(resolve));return{calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,displayNdc};};
  window.finish=()=>{const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(object=>{if(object.geometry)gs.add(object.geometry);
    for(const m of Array.isArray(object.material)?object.material:object.material?[object.material]:[]){ms.add(m);
      for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}});
    gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();renderer.renderLists.dispose();
    return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};};window.ready=true;
  </script>`);
async function main() {
  const browser = await openBrowser(browserDirectory);
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 378, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i += 1) {
      if (browser.errors.length) throw Error(JSON.stringify(browser.errors)); await delay(100);
    }
    for (const mode of ['close', 'spawn']) {
      await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: mode === 'close' ? 378 : 902,
        deviceScaleFactor: 1, mobile: false });
      for (const item of chosen) {
        const label = item.state + ' — ' + (mode === 'close' ? item.event : '安全な開始位置');
        const render = await browser.evaluate(`window.draw(${item.frame},${JSON.stringify(label)},${JSON.stringify(mode)})`);
        const screenshot = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const file = path.join(output, `departure-attendance-${mode === 'close' ? '' : 'spawn-'}${item.state}.png`);
        fs.writeFileSync(file, Buffer.from(screenshot.data, 'base64'));
        if (mode === 'close') { item.render = render; item.imageSha256 = sha256(fs.readFileSync(file)); }
        else {
          item.spawnRender = render; item.spawnImageSha256 = sha256(fs.readFileSync(file));
          const bounds = render.displayNdc;
          if (bounds.minX < -.9 || bounds.maxX > .9 || bounds.minY < -.9 || bounds.maxY > .9)
            throw Error(`Attendance ${item.state} is clipped at the safe spawn: ${JSON.stringify(bounds)}`);
        }
      }
    }
    const disposed = await browser.evaluate('window.finish()');
    if (disposed.geometries || disposed.textures || browser.errors.length) throw Error('Attendance WebGL disposal/error gate failed');
    const report = { sourceHash, toolHash: sha256(fs.readFileSync(__filename)), sceneSha256: sha256(fs.readFileSync(sceneFile)), animationSha256: sha256(fs.readFileSync(animationFile)),
      controllerReportSha256: sha256(fs.readFileSync(path.join(source, 'report.json'))), chosen, digitSegments: positions,
      spawnCamera: { pose: animation.frames[0].pose, fieldOfViewDegrees: 65, size: [390, 844], lookAt: [-4.74, 2.35, 10.6] },
      disposed, browserErrors: browser.errors, boundary: 'Real area-05 StageScene and recorded controller states; fixed QA close-up and floor spawn cameras in browser Software WebGL. Spawn camera uses product FOV but manual aim. No actual product turn, native Canvas, HUD, audio, or iPhone preview.' };
    fs.writeFileSync(path.join(output, 'departure-attendance-report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ chosen, disposed }));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
