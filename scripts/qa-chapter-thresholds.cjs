#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Visual-only QA at three reachable post-door floor positions. The camera is
// placed directly; this is not a filmed controller route or native preview.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.expo/goal013/chapter-thresholds');
fs.mkdirSync(out, {recursive: true});
const {installSourceBridge, mountThree, openBrowser, delay, sha256} = require(path.join(root, 'scripts/lib/three-scene-qa.cjs'));
const bridge = installSourceBridge(root);
const React = require('react');
const THREE = require('three');
const RC = require(path.join(root, 'src/rendering/firstPerson/runtimeController.ts'));
const {ChapterScene} = require(path.join(root, 'src/rendering/firstPerson/ChapterScene.tsx'));
const {createSceneResources} = require(path.join(root, 'src/rendering/firstPerson/resources.ts'));

async function main() {
  const exits = [
    ['perception-gallery-v1', 4, 23.4, 'gallery-vault-threshold-door'],
    ['uncanny-vault-v1', 3, 28.1, 'vault-theatre-threshold-door'],
    ['shadow-theatre-v1', 0, 22, 'theatre-mirror-threshold-door'],
  ];
  for (const [id, x, z, doorName] of exits) {
    const controller = RC.createController(undefined, false, true, id);
    const world = RC.worldForController(controller);
    if (!world.floors.some(f => x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ))
      throw Error(`${id}: QA camera is not on a real floor`);
    const resources = createSceneResources(false, null, true,
      id === 'uncanny-vault-v1', id === 'shadow-theatre-v1');
    const runtime = {current: controller.runtime};
    const mounted = await mountThree(React.createElement(ChapterScene, {
      world, progress: controller.runtime.progress,
      runtime, resources, assist: false, reducedMotion: false, lowQuality: false,
      lab: false, onFrameError: e => {throw e;},
    }), THREE);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#171a1b');
    const camera = new THREE.PerspectiveCamera(65, 390 / 844, .08, 60);
    camera.name = 'qa-camera'; camera.position.set(x, 1.6, z);
    camera.lookAt(x, 1.6, z + 10); scene.add(camera);
    mounted.objects.forEach(o => scene.add(o));
    const door = scene.getObjectByName(doorName);
    const leaf = scene.getObjectByName(doorName.replace(/-door$/, '-leaf'));
    const handle = scene.getObjectByName(doorName.replace(/-door$/, '-handle'));
    const sign = scene.getObjectByName(doorName.replace(/-door$/, '-sign'));
    if (!(door instanceof THREE.Mesh) || !(leaf instanceof THREE.Mesh) || !(handle instanceof THREE.Mesh) ||
        !(sign instanceof THREE.Mesh) || !(sign.material.map instanceof THREE.DataTexture))
      throw Error(`${id}: incomplete destination threshold door`);
    for (const fn of bridge.callbacks.splice(0)) fn({}, 0);
    scene.updateMatrixWorld(true);
    const base = door.material.color, face = leaf.material.color;
    if (Math.hypot(base.r - face.r, base.g - face.g, base.b - face.b) < .1)
      throw Error(`${id}: destination door leaf has insufficient material contrast`);
    const pixels = sign.material.map.image.data;
    if (new Set(Array.from({ length: pixels.length / 4 }, (_, i) => pixels[i * 4])).size < 2)
      throw Error(`${id}: destination plaque has no lettering`);
    for (const part of [leaf, handle, sign]) {
      const point = part.getWorldPosition(new THREE.Vector3()).project(camera);
      if (Math.abs(point.x) >= 1 || Math.abs(point.y) >= 1 || point.z < 0 || point.z > 1)
        throw Error(`${id}: ${part.name} is outside the threshold QA view`);
    }
    fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(scene.toJSON()));
    await mounted.unmount(); resources.dispose(); RC.retireController(controller);
  }
  bridge.verify();
  for (const name of ['three.module.js', 'three.core.js'])
    fs.copyFileSync(path.join(root, 'node_modules/three/build', name), path.join(out, name));
  fs.writeFileSync(path.join(out, 'index.html'),
    '<!doctype html><meta charset="utf-8"><style>body{margin:0}</style><script type="module" src="./viewer.js"></script>');
  fs.writeFileSync(path.join(out, 'viewer.js'),
    `import * as THREE from './three.module.js';
     const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
     renderer.setSize(390,844);renderer.outputColorSpace=THREE.SRGBColorSpace;
     document.body.append(renderer.domElement);
     window.draw=async id=>{const scene=await new THREE.ObjectLoader().parseAsync(await(await fetch(id+'.json')).json());
       const camera=scene.getObjectByName('qa-camera');renderer.render(scene,camera);return {calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};};
     window.ready=true;`);
  const browser = await openBrowser(out);
  const images = [];
  try {
    await browser.send('Emulation.setDeviceMetricsOverride', {width:390,height:844,deviceScaleFactor:1,mobile:false});
    for (let i=0;i<100&&!await browser.evaluate('window.ready===true');i++) await delay(100);
    for (const [id, x, z, doorName] of exits) {
      const metrics=await browser.evaluate(`window.draw(${JSON.stringify(id)})`);
      await browser.send('Page.captureScreenshot', {format:'png', captureBeyondViewport:false})
        .then(r=>fs.writeFileSync(path.join(out, id+'.png'), Buffer.from(r.data,'base64')));
      const image = fs.readFileSync(path.join(out,id+'.png'));
      images.push({stage:id, camera:{x,y:1.6,z}, doorName, ...metrics, bytes:image.length, sha256:sha256(image)});
    }
    if (browser.errors.length) throw Error(JSON.stringify(browser.errors));
  } finally {await browser.close();}
  bridge.verify();
  fs.writeFileSync(path.join(out,'report.json'), JSON.stringify({
    boundary:'Real ChapterScene and initial stage world, manually placed camera on an existing floor after the prior door; visual destination-threshold audit only. No controller route, product HUD, native Canvas, iPhone visibility or FPS proof.',
    size:[390,844], images, toolHash:sha256(fs.readFileSync(__filename)), sourceHashes:Object.fromEntries(bridge.hashes),
  },null,2)+'\n');
  console.log(JSON.stringify({images, sourceCount:bridge.hashes.size}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
