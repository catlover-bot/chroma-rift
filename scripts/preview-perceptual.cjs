#!/usr/bin/env node
'use strict';
/* global __dirname, Buffer */
/** Phase B: actual bundled geometry/DataTexture with canonical Three and browser
 * WebGL. No native R3F, HUD, iPhone, human perception or frame-rate claim. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),cp=require('node:child_process'),crypto=require('node:crypto'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),output=path.join(root,'docs/qa-goal008/materials'),sceneOutput=path.join(root,'.expo/goal008/material-preview');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true,target:ts.ScriptTarget.ES2022}}).outputText,file);
const T=require('three'),{createPerceptualResources}=require('../src/rendering/firstPerson/perceptualResources.ts');
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const views=[
 {id:'mask-front',kind:'hollow',position:[0,0,2]},
 {id:'mask-left',kind:'hollow',position:[-.8,0,1.9]},
 {id:'mask-right',kind:'hollow',position:[.8,0,1.9]},
 {id:'mask-left-far',kind:'hollow',position:[-1.1,0,1.4]},
 {id:'mask-right-far',kind:'hollow',position:[1.1,0,1.4]},
 {id:'mask-side',kind:'hollow',position:[1.4,0,-.1]},
 {id:'mask-section',kind:'hollow',position:[1.7,.12,.35]},
 {id:'mask-subdued',kind:'hollow',position:[0,0,2],subdued:true},
 {id:'mask-convex-control',kind:'convex',position:[0,0,2]},
 {id:'mask-convex-side-control',kind:'convex',position:[1.4,0,.1]},
 ...[['near',2.3],['middle',3.6],['far',5.2]].map(([label,distance])=>({id:'hybrid-'+label,kind:'hybrid',position:[0,0,distance]})),
];
function generate(){fs.mkdirSync(output,{recursive:true});fs.mkdirSync(sceneOutput,{recursive:true});const r=createPerceptualResources();const scenes={};
 for(const kind of ['hollow','convex','hybrid']){const scene=new T.Scene();scene.background=new T.Color('#303A3C');
  if(kind==='hybrid'){const panel=new T.Mesh(new T.PlaneGeometry(1.25,1.25),r.hybridMaterial);panel.name='static-hybrid-panel';scene.add(panel);}
  else {const mesh=new T.Mesh(kind==='hollow'?r.maskGeometry:r.convexControlGeometry,r.maskMaterial);mesh.name=kind==='hollow'?'static-hollow-mask':'explicit-convex-control';scene.add(mesh);scene.add(new T.AmbientLight('#FFFFFF',.35));const light=new T.DirectionalLight('#FFFFFF',1.15);light.position.set(-2,3,4);light.name='fixed-key-light';scene.add(light);}
  scene.updateMatrixWorld(true);const filename=kind+'.json';fs.writeFileSync(path.join(sceneOutput,filename),JSON.stringify(scene.toJSON()));scenes[kind]={filename};
 }

 const points=[];for(let i=0;i<r.maskGeometry.attributes.position.count;i++){const p=r.maskGeometry.attributes.position;if(Math.abs(p.getX(i))<1e-6)points.push([p.getY(i),p.getZ(i)]);}points.sort((a,b)=>b[0]-a[0]);
 const profile=sign=>points.map(([y,z])=>`${450+sign*z*600},${400-y*600}`).join(' ');
 fs.writeFileSync(path.join(output,'mask-coordinate-section.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="800" viewBox="0 0 900 800"><rect width="900" height="800" fill="#f2eee3"/><g fill="#253632" font-family="sans-serif" font-size="22"><text x="35" y="38">Actual center-line vertices: concave (left) / convex control (right)</text><text x="455" y="80">z = 0, frontmost rim plane</text><text x="50" y="745">Blue: shipped hollow mesh. Orange: explicit reflected-depth control.</text><text x="50" y="777">Viewer is on +Z side. Geometry never follows the camera.</text></g><line x1="450" y1="90" x2="450" y2="710" stroke="#888" stroke-dasharray="8 8"/><polyline points="${profile(1)}" fill="none" stroke="#275678" stroke-width="4"/><polyline points="${profile(-1)}" fill="none" stroke="#9b5526" stroke-width="4"/></svg>`);
 const geometry=r.maskGeometry.getAttribute('position'),normals=r.maskGeometry.getAttribute('normal');
 const metadata={boundary:'Source asset geometry/DataTexture with real browser WebGL; no native renderer, HUD, finger, perception or iPhone validation',sourceHashes:Object.fromEntries(['scripts/generate-perceptual-assets.cjs','scripts/preview-perceptual.cjs','src/rendering/firstPerson/perceptualResources.ts','assets/perceptual/hollow-mask.json','assets/perceptual/hybrid-texture.json'].map(n=>[n,sha(fs.readFileSync(path.join(root,n)))])),mask:{positionSHA256:sha(Buffer.from(geometry.array.buffer)),normalSHA256:sha(Buffer.from(normals.array.buffer)),indexSHA256:sha(Buffer.from(r.maskGeometry.index.array.buffer)),frontSide:r.maskMaterial.side===T.FrontSide,bounds:r.maskGeometry.boundingBox,positiveScale:true,triangles:r.maskGeometry.index.count/3},hybrid:{textureId:r.hybridTexture.name,textureByteSHA256:sha(Buffer.from(r.hybridTexture.image.data)),width:512,height:512,baseBytes:r.textureBytes,mipBytes:r.textureBytesWithMipmaps,unchangedUV:true,minFilter:r.hybridTexture.minFilter,magFilter:r.hybridTexture.magFilter,colorSpace:r.hybridTexture.colorSpace},views:views.map(v=>({...v,width:390,height:844,verticalFOV:65,target:v.kind==='hybrid'?[0,0,0]:v.kind==='convex'?[0,0,.2]:[0,0,-.2],projectedPlatePixels:v.kind==='hybrid'?844/(2*Math.tan(65*Math.PI/360))*1.25/v.position[2]:undefined}))};
 fs.writeFileSync(path.join(output,'sources-and-views.json'),JSON.stringify(metadata,null,2)+'\n');
 fs.writeFileSync(path.join(sceneOutput,'index.html'),html(metadata.views,scenes));for(const file of ['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',file),path.join(sceneOutput,file));r.dispose();return metadata.views;
}
function html(views,scenes){return `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#303a3c;overflow:hidden}canvas{display:block}</style><script type="module">
import * as T from './three.module.js';const views=${JSON.stringify(views)},files=${JSON.stringify(scenes)};const renderer=new T.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;renderer.setPixelRatio(1);document.body.appendChild(renderer.domElement);const loader=new T.ObjectLoader(),scenes={};for(const [kind,file]of Object.entries(files))scenes[kind]=loader.parse(await(await fetch(file.filename)).json());const initial={};for(const[kind,scene]of Object.entries(scenes)){const mesh=scene.children.find(o=>o.isMesh);initial[kind]={matrix:mesh.matrixWorld.elements.join(','),positions:Array.from(mesh.geometry.attributes.position.array).join(','),normals:Array.from(mesh.geometry.attributes.normal.array).join(','),uv:mesh.geometry.attributes.uv?Array.from(mesh.geometry.attributes.uv.array).join(','):null,texture:mesh.material.map?.uuid};}
window.renderGalleryView=index=>{const v=views[index],scene=scenes[v.kind],mesh=scene.children.find(o=>o.isMesh),camera=new T.PerspectiveCamera(v.verticalFOV,v.width/v.height,.05,30);camera.position.fromArray(v.position);camera.lookAt(new T.Vector3(...v.target));camera.updateMatrixWorld();renderer.setSize(v.width,v.height,false);scene.updateMatrixWorld(true);renderer.render(scene,camera);const now={matrix:mesh.matrixWorld.elements.join(','),positions:Array.from(mesh.geometry.attributes.position.array).join(','),normals:Array.from(mesh.geometry.attributes.normal.array).join(','),uv:mesh.geometry.attributes.uv?Array.from(mesh.geometry.attributes.uv.array).join(','):null,texture:mesh.material.map?.uuid};const info=renderer.info;return{id:v.id,image:renderer.domElement.toDataURL('image/png'),calls:info.render.calls,triangles:info.render.triangles,textures:info.memory.textures,geometries:info.memory.geometries,invariantsUnchanged:JSON.stringify(now)===JSON.stringify(initial[v.kind]),sameSceneAndTexture:true,projectedPlatePixels:v.projectedPlatePixels,withinBudget:info.render.calls<=150&&info.render.triangles<=100000};};window.galleryQAReady=true;
</script>`;}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function capture(snapshots) {
  const requested = process.env.GALLERY_CHROME;
  const chrome = requested ?? path.join(os.homedir(), '.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell');
  if (!fs.existsSync(chrome)) throw new Error('Set GALLERY_CHROME to an existing Chromium/headless-shell executable. No browser dependency is installed by this script.');
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const filename = path.resolve(sceneOutput, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!filename.startsWith(sceneOutput + path.sep)) { response.writeHead(403); response.end(); return; }
    fs.readFile(filename, (error, bytes) => {
      if (error) { response.writeHead(404); response.end(); return; }
      response.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : filename.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8'); response.end(bytes);
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  const chromeProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'chroma-gallery-chrome-'));
  const child = cp.spawn(chrome, ['--headless', '--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-port=0', `--user-data-dir=${chromeProfile}`, 'about:blank'], {
    stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH || path.join(os.homedir(), '.local/opt/playwright-libs-ubuntu24/usr/lib/x86_64-linux-gnu') },
  });
  let stderr = '', socket;
  child.stderr.on('data', bytes => { stderr += bytes; });
  try {
    for (let i = 0; i < 100 && !stderr.includes('DevTools listening on'); i += 1) { if (child.exitCode !== null) throw new Error(`Chromium exited ${child.exitCode}: ${stderr}`); await sleep(100); }
    const endpoint = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
    if (!endpoint) throw new Error(`Chromium debug endpoint unavailable: ${stderr}`);
    const port = new URL(endpoint).port;
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let id = 0; const pending = new Map(), browserErrors = [];
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id) { const handler = pending.get(message.id); if (handler) { pending.delete(message.id); if (message.error) handler.reject(new Error(JSON.stringify(message.error))); else handler.resolve(message.result); } }
      if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params.exceptionDetails);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const seq = ++id; pending.set(seq, { resolve, reject }); socket.send(JSON.stringify({ id: seq, method, params })); });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${serverPort}/` });
    let ready = false;
    for (let i = 0; i < 100 && !ready; i += 1) { ready = await evaluate('window.galleryQAReady === true'); if (!ready) await sleep(100); }
    if (!ready) throw new Error('WebGL viewer did not initialize. ' + JSON.stringify(browserErrors));
    const results = [];
    for (let i = 0; i < snapshots.length; i += 1) {
      const view = snapshots[i];
      await send('Emulation.setDeviceMetricsOverride', { width: view.width, height: view.height, deviceScaleFactor: 1, mobile: false });
      const result = await evaluate(`window.renderGalleryView(${i})`);
      fs.writeFileSync(path.join(output, view.id + '.png'), Buffer.from(result.image.split(',')[1], 'base64'));
      delete result.image; results.push(result);
      console.log(`${result.id}: ${result.calls} calls / ${result.triangles} triangles`);
    }
    const report = { boundary: 'Single actual browser WebGL renderer, same loaded scene/geometry/texture across camera views; not native app or perception', rendererCount: 1, browserErrors, allPassed: results.every(r=>r.withinBudget&&r.invariantsUnchanged), results };
    fs.writeFileSync(path.join(output,'webgl-results.json'),JSON.stringify(report,null,2)+'\n');
    if(browserErrors.length||!report.allPassed)throw new Error('Perceptual WebGL QA failed');
  } finally {
    if (socket) socket.close(); child.kill('SIGTERM'); server.close();
    fs.writeFileSync(path.join(sceneOutput, 'chromium.log'), stderr);
  }
}

(async()=>{const views=generate();if(process.argv.includes('--capture'))await capture(views);})().catch(error=>{console.error(error);process.exitCode=1;});
