#!/usr/bin/env node
'use strict';
/* global __dirname, Buffer */
// Run qa-mirror-natural.cjs first. This probe reuses its actual StageScene
// export and the current planarMirror.ts browser module; no product save writes.
const fs = require('node:fs'), path = require('node:path');
const { openBrowser, delay, sha256 } = require('./lib/three-scene-qa.cjs');
const root = path.resolve(__dirname, '..');
const source = path.join(root, '.expo/goal013/mirror-natural');
const out = path.join(root, '.expo/goal013-1/mirror-backside');
fs.mkdirSync(out, { recursive: true });
for (const name of ['scene.json', 'three.module.js', 'three.core.js', 'planarMirror.js']) {
  fs.copyFileSync(path.join(source, name), path.join(out, name));
}
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#09090c}canvas{display:block}</style><script type="module">
import * as THREE from './three.module.js';
import {createPlanarMirror} from './planarMirror.js';
const scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./scene.json')).json());
const camera=scene.getObjectByProperty('type','PerspectiveCamera');
const surface=scene.getObjectByName('planar-mirror');
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
renderer.setSize(390,844);renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);
const mirror=createPlanarMirror();surface.material=mirror.material;
function pose(x,z){const dx=-2.65-x,dz=11.4-z;
  camera.position.set(x,1.6,z);camera.rotation.set(Math.atan2(.3,Math.hypot(dx,dz)),Math.atan2(-dx,-dz),0,'YXZ');
  camera.aspect=390/844;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);}
window.drawProbe=mode=>{
  if(['main-only','target-only','front'].includes(mode))pose(-1.433,10.866);else pose(-2.45,7.5);
  let reflected=false,framebufferStatus='not-checked';
  if(mode==='target-only'){
    renderer.setRenderTarget(mirror.target);
    framebufferStatus=renderer.getContext().checkFramebufferStatus(renderer.getContext().FRAMEBUFFER);
    renderer.setRenderTarget(null);
  }
  if(mode==='front'||mode==='legacy-back'||mode==='back')
    reflected=mirror.render(renderer,scene,camera,surface,(r,s,c)=>r.render(s,c));
  surface.material=mode==='legacy-back'||reflected?mirror.material:mirror.fallbackMaterial;
  renderer.render(scene,camera);
  const glError=renderer.getContext().getError();
  return {reflected,material:surface.material.name,framebufferStatus,glError,drawCalls:renderer.info.render.calls};
};window.ready=true;
</script>`);
async function main() {
  const browser = await openBrowser(out);
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
    for (let i = 0; i < 100 && !await browser.evaluate('window.ready===true'); i += 1) await delay(100);
    if (!await browser.evaluate('window.ready===true')) throw Error('Probe viewer did not initialize');
    const results = {};
    for (const mode of ['main-only', 'target-only', 'front', 'legacy-back', 'back']) {
      results[mode] = await browser.evaluate(`window.drawProbe('${mode}')`);
      const frame = await browser.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      const bytes = Buffer.from(frame.data, 'base64');
      fs.writeFileSync(path.join(out, mode + '.png'), bytes);
      results[mode].sha256 = sha256(bytes);
    }
    if (!results.front.reflected || results['main-only'].reflected || results['target-only'].reflected ||
      results['target-only'].framebufferStatus !== 36053 || results['legacy-back'].reflected || results.back.reflected ||
      results.back.material !== 'chroma-rift-mirror-unavailable' || Object.values(results).some(result => result.glError) || browser.errors.length)
      throw Error('Backside comparison gate failed: ' + JSON.stringify({ results, errors: browser.errors }));
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ backend: 'Chromium SwiftShader, actual area-04 StageScene export and current planarMirror.ts; no native EXGL',
      camera: { front: [-1.433,1.6,10.866], back: [-2.45,1.6,7.5] }, results, browserErrors: browser.errors,
      sourceSha256: { scene: sha256(fs.readFileSync(path.join(source, 'scene.json'))),
        mirror: sha256(fs.readFileSync(path.join(root, 'src/rendering/firstPerson/planarMirror.ts'))),
        stage: sha256(fs.readFileSync(path.join(root, 'src/domain/stages/mirror-corridor-v1/scene.tsx'))) } }, null, 2) + '\n');
    console.log(JSON.stringify(results));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
