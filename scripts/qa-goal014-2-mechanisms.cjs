#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Matched STATIC visual fixtures, not route/success evidence. Both revisions
// execute their actual scene, resources, controller snapshot and Screen HUD.
// Native Canvas/GL/audio are unavailable: React hosts + CSS + SwiftShader only.
const fs=require('node:fs'), path=require('node:path'), cp=require('node:child_process'), ts=require('typescript');
const {installSourceBridge,mountThree,openBrowser,delay,sha256}=require('./lib/three-scene-qa.cjs');
const root=path.resolve(__dirname,'..'), baseline='5bd34f26b65558e8da1cffd9d22ee93c0db78258';
const options=Object.fromEntries(process.argv.slice(2).map(arg=>{const m=/^--(out|phase|only)=(.+)$/.exec(arg);if(!m)throw Error('usage: --out=directory [--phase=before|after] [--only=case-prefix]');return[m[1],m[2]];}));
const out=path.resolve(options.out||path.join(root,'.expo/goal014-2/mechanisms'));
fs.mkdirSync(out,{recursive:true});
const toolFiles=['scripts/qa-goal014-2-mechanisms.cjs','scripts/lib/three-scene-qa.cjs','scripts/lib/native-hud-qa.cjs','scripts/lib/qa-native-metadata.cjs','node_modules/three/build/three.module.js','node_modules/three/build/three.core.js',
  'node_modules/three/build/three.cjs','node_modules/react-test-renderer/package.json','node_modules/typescript/package.json','package-lock.json'];
const toolHashes=Object.fromEntries(toolFiles.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]));
const assetFiles=cp.execFileSync('git',['ls-files','assets'],{cwd:root,encoding:'utf8'}).trim().split('\n').filter(Boolean);
const assetHashes=Object.fromEntries(assetFiles.map(file=>[file,sha256(fs.readFileSync(path.join(root,file)))]));
const json=(file,value)=>fs.writeFileSync(path.join(out,file),JSON.stringify(value,null,2)+'\n');
const source=(file,phase)=>phase==='before'?cp.execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024}):fs.readFileSync(path.join(root,file),'utf8');
function verifyTools(){for(const[file,hash]of Object.entries(assetHashes))if(sha256(fs.readFileSync(path.join(root,file)))!==hash)throw Error('Asset drift '+file);for(const[file,hash]of Object.entries(toolHashes))if(sha256(fs.readFileSync(path.join(root,file)))!==hash)throw Error('QA tool drift '+file);}
async function extract(phase){
  if(phase==='before')for(const file of assetFiles)if(sha256(cp.execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:64*1024*1024}))!==assetHashes[file])throw Error('Baseline/current asset bytes differ '+file);
  require('./lib/qa-native-metadata.cjs');
  const bridge=installSourceBridge(root);
  if(phase==='before')for(const ext of ['.ts','.tsx'])require.extensions[ext]=(mod,filename)=>{
    const key=path.relative(root,filename),bytes=source(key,phase);bridge.hashes.set(key,sha256(bytes));
    mod._compile(ts.transpileModule(bytes,{fileName:filename,compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,filename);
  };
  const {installNativeHudBridge}=require('./lib/native-hud-qa.cjs');
  const context={width:390,height:844,fontScale:1,bindController:false},native=installNativeHudBridge(context);
  const React=require('react'),T=require('three'),RC=require('../src/rendering/firstPerson/runtimeController.ts');
  const D=require('../src/types/application.ts'),{createSceneResources}=require('../src/rendering/firstPerson/resources.ts');
  const {ChapterScene}=require('../src/rendering/firstPerson/ChapterScene.tsx');
  const G=require('../src/domain/gallery/definition.ts'),V=require('../src/domain/vault/definition.ts'),H=require('../src/domain/theatre/definition.ts');
  const {isSafePose}=require('../src/domain/firstPerson/geometry.ts');
  context.bindController=true;const {FirstPersonScreen}=require('../src/screens/FirstPersonScreen.tsx');
  const mirror='mirror-corridor-v1',gallery='perception-gallery-v1',vault='uncanny-vault-v1',theatre='shadow-theatre-v1',departure='departure-control-v1';
  const point=(x,z,y=1.6)=>({x,y,z}),aim=(x,y,z)=>({x,y,z});
  const cases=[
    {id:'practice-rest',stage:mirror,position:point(-2.2,6.05),aim:aim(-2.60,1.38,7.32),practice:0},
    {id:'practice-half',stage:mirror,position:point(-2.2,6.05),aim:aim(-2.60,1.38,7.32),practice:.5},
    {id:'practice-raised',stage:mirror,position:point(-2.2,6.05),aim:aim(-2.60,1.38,7.32),practice:1},
    {id:'winch-work-west',stage:mirror,position:point(-2.45,9.6),aim:aim(-2.15,1.75,11.4),actor:point(0,14.5,0),ratchets:0},
    {id:'winch-mirror-middle',stage:mirror,position:point(-2.05,10.05),aim:aim(-2.55,1.9,11.4),actor:point(0,14.5,0),ratchets:1},
    {id:'winch-mirror-east',stage:mirror,position:point(-1.8,10),aim:aim(-2.55,1.9,11.4),actor:point(0,14.5,0),ratchets:2},
    {id:'winch-released-three',stage:mirror,position:point(-2.45,9.6),aim:aim(-2.15,1.75,11.4),actor:point(0,14.5,0),ratchets:3},
    {id:'grate-closed',stage:mirror,position:point(0,13.3),aim:aim(0,1.6,31.38),actor:point(-1.45,13.4,0),ratchets:0},
    {id:'grate-one',stage:mirror,position:point(0,13.3),aim:aim(0,1.6,31.38),actor:point(-1.45,13.4,0),ratchets:1},
    {id:'grate-passable',stage:mirror,position:point(0,13.3),aim:aim(0,1.6,31.38),actor:point(-1.45,13.4,0),ratchets:3},
    {id:'hoist-route',stage:mirror,position:point(0,9),aim:aim(0,2.8,17.2),ratchets:1},
    {id:'shelter-overview',stage:mirror,position:point(2,11.05),aim:aim(-3.1,1.4,11.05),ratchets:1},
    {id:'shelter-south-approach',stage:mirror,position:point(-1.7,9.5),aim:aim(-3.5,.6,9.85),ratchets:1},
    {id:'shelter-recovery-facing',stage:mirror,position:point(-4.05,10.7),aim:aim(-3.1,1.6,9.85),ratchets:1},
    {id:'visible-exit',stage:mirror,position:point(0,22.5),aim:aim(0,1.7,31.38),ratchets:3},
    {id:'gallery-trays-empty',stage:gallery,position:G.GALLERY_SHADOW_OBSERVATION_POSE.position,aim:G.GALLERY_SHADOW_FIXTURE.center},
    {id:'gallery-trays-occupied',stage:gallery,position:G.GALLERY_SHADOW_OBSERVATION_POSE.position,aim:G.GALLERY_SHADOW_FIXTURE.center,occupied:true},
    {id:'gallery-disc-pivots',stage:gallery,position:G.GALLERY_CONTOUR_OBSERVATION_POSE.position,aim:G.GALLERY_CONTOUR_FIXTURE.center},
    {id:'vault-length',stage:vault,aim:V.VAULT_LENGTH_FIXTURE.center},
    {id:'theatre-light',stage:theatre,aim:H.THEATRE_LIGHT_FIXTURE.center},
    {id:'departure-controls',stage:departure,position:point(-3.75,11.6),aim:aim(-2.85,1.55,13.18)},
    {id:'departure-power',stage:departure,position:point(-3.75,11.6),aim:aim(-3.18,1.55,13.46)},
  ];
  const records=[];
  for(const c of cases.filter(c=>!options.only||c.id.startsWith(options.only)))for(const width of c.id.startsWith('winch-')?[390,320]:[390]){
    const height=width===320?568:844;Object.assign(context,{width,height,fontScale:1});
    const controller=RC.createController(undefined,false,true,c.stage);context.controller=controller;controller.viewport={width,height};
    Object.assign(controller.diagnostics,{stage:'ready',rendererOwnership:'live',appActive:true,paused:false,open:false,sceneMode:'chapter'});
    const state=controller.runtime.stageSession?.value;
    if(c.stage===mirror){state.keyTaken=true;state.practiced=c.practice===undefined||c.practice===1;state.ratchets=c.ratchets||0;
      state.gateLift=state.ratchets===3?3.6:state.ratchets*.9;state.holding=c.practice!==undefined&&c.practice>0&&c.practice<1?'practice':null;state.holdSeconds=(c.practice||0)*.55;
      if(c.actor)state.actor.motion.position={...c.actor};
    }
    if(c.occupied)Object.assign(controller.runtime.progress.gallery.shadow.assignments,{'sample-a':'socket-left','sample-b':'socket-right'});
    const position={...(c.position||controller.runtime.pose.position)},dx=c.aim.x-position.x,dz=c.aim.z-position.z;
    controller.runtime.pose={position,yaw:Math.atan2(-dx,-dz),pitch:Math.atan2(c.aim.y-position.y,Math.hypot(dx,dz))};
    if(state)state.pose=controller.runtime.pose;
    const world=RC.worldForController(controller);
    if(!isSafePose(controller.runtime.pose,world))throw Error(phase+' '+c.id+': static visual camera is not physically legal');
    const camera=new T.PerspectiveCamera(65,width/height,.08,60);RC.syncCamera(controller,camera);
    const scene=new T.Scene();scene.background=new T.Color('#09090c');scene.add(camera);
    const resources=createSceneResources(false,null,true,c.stage===vault,c.stage===theatre),runtime={current:controller.runtime};
    const mounted=await mountThree(React.createElement(ChapterScene,{world,progress:controller.runtime.progress,runtime,resources,
      assist:false,reducedMotion:false,lowQuality:false,lab:false,renderOffscreen:()=>{},onFrameError:e=>{throw e;}}),T);
    mounted.objects.forEach(o=>scene.add(o));
    bridge.callbacks.splice(0).filter(callback=>!callback.toString().includes('mirror.render')).forEach(callback=>callback({},0));
    scene.updateMatrixWorld(true);
    context.snapshot=()=>RC.controllerSnapshot(controller);
    const hud=await native.mount(FirstPersonScreen,{chapterId:c.stage,settings:{...D.DEFAULT_SETTINGS,haptics:false},controls:{...D.DEFAULT_FIRST_PERSON_CONTROLS,quality:'standard'},
      onboarding:{schemaVersion:1,tutorialCompleted:true,controlChoiceAcknowledged:true},preferredColor:'neutral',onSettingsChange(){},onControlsChange(){},onCheckpoint(){},onComplete(){},onRestart(){},onExit(){}});
    await hud.update();const tree=hud.serialize(),id=c.id+'-'+width;
    const surface=scene.getObjectByName('planar-mirror'),material=surface?.material;
    if(surface)surface.material=new T.MeshBasicMaterial({color:'#263331',side:T.DoubleSide});
    const file=id+'-scene.json';fs.writeFileSync(path.join(out,file),JSON.stringify(scene.toJSON()));
    records.push({id,stageId:c.stage,file,width,height,fontScale:1,tree,pose:controller.runtime.pose,target:RC.controllerSnapshot(controller).target?.id??null,fixture:c,physicallyLegal:true,ratchets:state?.ratchets??null,gateLift:state?.gateLift??null});
    if(surface){surface.material.dispose();surface.material=material;}
    await hud.unmount();await mounted.unmount();resources.dispose();RC.retireController(controller);
  }
  if(phase==='after')bridge.verify();verifyTools();
  for(const file of ['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',file),path.join(out,file));
  const mirrorFile='src/rendering/firstPerson/planarMirror.ts',mirrorSource=source(mirrorFile,phase);
  bridge.hashes.set(mirrorFile,sha256(mirrorSource));
  fs.writeFileSync(path.join(out,'planarMirror.js'),ts.transpileModule(mirrorSource,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace("from 'three'","from './three.module.js'"));
  json('extraction.json',{phase,baseline,head:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes:Object.fromEntries(bridge.hashes),assetHashes,toolHashes,records});
  console.log(phase+': '+records.length+' legal static fixtures extracted');
}
async function renderPhase(phase){
  const {browserStyles,browserHelpers}=require('./lib/native-hud-qa.cjs'),extraction=JSON.parse(fs.readFileSync(path.join(out,'extraction.json'),'utf8'));
  fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><style>${browserStyles}
  #qa-root{position:absolute;inset:0;display:flex;flex-direction:column}.hide-text .rn-text{visibility:hidden}</style><div id="qa-root"></div>
  <script type="module">import * as T from './three.module.js';import{createPlanarMirror}from './planarMirror.js';${browserHelpers}
  const root=document.getElementById('qa-root'),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
  const warmScene=new T.Scene(),warmCamera=new T.PerspectiveCamera(65,1,.1,10),wg=new T.BoxGeometry(),wm=new T.MeshStandardMaterial();warmCamera.position.z=3;warmScene.add(new T.Mesh(wg,wm),new T.AmbientLight());renderer.render(warmScene,warmCamera);wg.dispose();wm.dispose();warmScene.clear();
  const warmBaseline={...renderer.info.memory},releases=[];let current=null;
  if(warmBaseline.geometries!==0||warmBaseline.textures!==1)throw Error('Unexpected warm baseline');
  function release(){if(!current)return;const {scene,mirror,id}=current,gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}if(o.isInstancedMesh)o.dispose();});mirror?.dispose();gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();const memory={id,...renderer.info.memory};releases.push(memory);current=null;if(memory.geometries!==0||memory.textures!==warmBaseline.textures)throw Error('Scene leak '+JSON.stringify(memory));}
  function drawMirror(){const{scene,camera,surface,mirror}=current;if(!surface)return false;const f=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));const drew=f.intersectsObject(surface)&&mirror.render(renderer,scene,camera,surface,(r,s,c)=>r.render(s,c));surface.material=drew?mirror.material:mirror.fallbackMaterial;return drew;}
  window.load=async record=>{release();renderer.setSize(record.width,record.height);const scene=await new T.ObjectLoader().parseAsync(await(await fetch(record.file)).json()),camera=scene.children.find(o=>o.isPerspectiveCamera),surface=scene.getObjectByName('planar-mirror'),mirror=surface?createPlanarMirror():null;
    if(surface){surface.material.dispose();surface.material=mirror.material;}scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);current={id:record.id,scene,camera,surface,mirror};root.replaceChildren(hudDOM(record.tree,record.fontScale,renderer.domElement));
    const hiddenNames=[];scene.traverse(o=>{if(/facility-label$|(?:^|-)sign$|destination|receiver-number|window-number|containment-status|attendance-label|attendance-display/.test(o.name)){o.userData.qaText=true;hiddenNames.push(o.name);}});return{hiddenNames};};
  window.draw=async hidden=>{const{scene,camera}=current;root.classList.toggle('hide-text',hidden);scene.traverse(o=>{if(o.userData.qaText)o.visible=!hidden;});const reflected=drawMirror();renderer.render(scene,camera);await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const gl=renderer.getContext(),w=renderer.domElement.width,h=renderer.domElement.height,a=new Uint8Array(w*h*4),b=new Uint8Array(a.length);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);
    const actor=scene.getObjectByName('mirror-corridor-actor');let actorReflectionPixels=0;
    if(actor&&reflected){actor.visible=false;drawMirror();actor.visible=true;renderer.render(scene,camera);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,b);for(let i=0;i<a.length;i+=4)if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>12)actorReflectionPixels++;drawMirror();renderer.render(scene,camera);}
    return{reflected,actorReflectionPixels,mainCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,glError:gl.getError(),memory:{...renderer.info.memory},hud:auditNavigationHUD(root)};};
  window.finish=()=>{release();root.replaceChildren();renderer.renderLists.dispose();renderer.dispose();return{warmBaseline,releases,rendererDisposeCalls:1,programs:renderer.info.programs.length,libraryTextureOwner:'Three0.185.1 shared DFG_LUT16x16 RGhalf; scene release measured before renderer.dispose, context closes afterward'};};window.ready=true;</script>`);
  const browser=await openBrowser(out),results=[];
  try{for(let i=0;i<100&&!await browser.evaluate('window.ready===true');i++){if(browser.errors.length)throw Error(JSON.stringify(browser.errors));await delay(100);}
    for(const record of extraction.records){await browser.send('Emulation.setDeviceMetricsOverride',{width:record.width,height:record.height,deviceScaleFactor:1,mobile:false});const text=await browser.evaluate('window.load('+JSON.stringify(record)+')');
      for(const hidden of [false,true]){const metrics=await browser.evaluate('window.draw('+hidden+')');if(metrics.glError||!metrics.mainCalls)throw Error(record.id+': drawing failed');
        const bytes=Buffer.from((await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false})).data,'base64'),file=record.id+(hidden?'-text-hidden':'-normal')+'.png';fs.writeFileSync(path.join(out,file),bytes);
        const {tree,...small}=record;results.push({...small,textHidden:hidden,hidden3DText:text.hiddenNames,image:file,imageSha256:sha256(bytes),metrics});}
    }
    const disposal=await browser.evaluate('window.finish()');if(disposal.programs||disposal.releases.length!==extraction.records.length||browser.errors.length)throw Error('Disposal/browser failure');
    if(phase==='after')for(const[file,hash]of Object.entries(extraction.sourceHashes))if(sha256(fs.readFileSync(path.join(root,file)))!==hash)throw Error('Source drift '+file);
    verifyTools();json('report.json',{...extraction,records:undefined,results,disposal,errors:browser.errors,limitations:['Static visual fixtures deliberately assign pose, actor and mechanism progress; they prove appearance and are not success-route evidence.','Actual React Screen tree approximated with browser CSS; no native Yoga, EXGL, device FPS, touch, audio playback or novice study.','Actor contribution is a separate QA pass that hides only the actor during reflection, restores it for the main image, and measures changed framebuffer pixels; it is not a production render count.','Baseline loads exact committed TS/TSX git blobs in a separate process using the currently installed unchanged dependencies.']});
    console.log(phase+': '+results.length+' normal/text-hidden images; '+disposal.releases.length+' scene disposals passed');
  }finally{await browser.close();}
}
async function main(){if(options.phase){if(!['before','after'].includes(options.phase))throw Error('Unknown phase');await extract(options.phase);await renderPhase(options.phase);return;}
  for(const phase of ['before','after']){const target=path.join(out,phase),args=[__filename,'--phase='+phase,'--out='+target,...(options.only?['--only='+options.only]:[])];const result=cp.spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:process.env});if(result.status!==0)throw Error(phase+' failed '+result.status);}
  const before=JSON.parse(fs.readFileSync(path.join(out,'before/report.json'))),after=JSON.parse(fs.readFileSync(path.join(out,'after/report.json')));
  if(JSON.stringify(before.assetHashes)!==JSON.stringify(after.assetHashes))throw Error('Asset mismatch between processes');
  if(before.results.length!==after.results.length)throw Error('Pair count mismatch');
  const pairs=before.results.map((old,i)=>{const next=after.results[i];if(old.id!==next.id||old.textHidden!==next.textHidden||JSON.stringify(old.pose)!==JSON.stringify(next.pose)||JSON.stringify(old.fixture)!==JSON.stringify(next.fixture))throw Error('Matched fixture differs '+old.id);return{id:old.id,textHidden:old.textHidden,before:'before/'+old.image,after:'after/'+next.image,beforeHash:old.imageSha256,afterHash:next.imageSha256,beforeActorPixels:old.metrics.actorReflectionPixels,afterActorPixels:next.metrics.actorReflectionPixels};});
  verifyTools();json('comparison.json',{baseline,pairs,assetHashes,toolHashes,staticFixtures:true,matchedCameraAndInput:true});console.log(pairs.length+' exact fixture/camera pairs verified');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
