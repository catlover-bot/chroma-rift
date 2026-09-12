#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Real App selection/preparation/pause/return plus live controller/ChapterScene.
// In-memory storage, native availability/readiness/audio, Modal and Skia bridge
// are explicit QA boundaries. No native device or user storage is accessed.
const fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),opt=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3),source=path.resolve(opt('source')||root),out=path.resolve(opt('out')||path.join(root,'.expo/goal010-1/chapter-reentry'));
fs.mkdirSync(out,{recursive:true});
const{installSourceBridge,mountThree,openBrowser,delay,sha256}=require('./lib/three-scene-qa.cjs'),{installNativeHudBridge,browserStyles,browserHelpers}=require('./lib/native-hud-qa.cjs');
const bridge=installSourceBridge(source),context={width:390,height:844,fontScale:1.5},native=installNativeHudBridge(context),React=require('react'),R=require('react-test-renderer'),THREE=require('three');
const memory=new Map(),writes=[],owners=[],alerts=[],load=Module._load;
const storage={async getItem(k){return memory.get(k)??null;},async setItem(k,v){memory.set(k,v);writes.push({key:k,sha256:sha256(v)});},async removeItem(k){memory.delete(k);},async multiRemove(keys){keys.forEach(k=>memory.delete(k));}};
let activeOwners=0,maxActiveOwners=0;
Module._load=function(name,...args){
 if(name==='@react-native-async-storage/async-storage')return storage;
 if(name==='react-native-gesture-handler')return{GestureHandlerRootView:({children})=>React.createElement(React.Fragment,null,children)};
 if(name==='react-native-worklets')return{scheduleOnRN:fn=>fn()};
 if(name==='expo')return{requireOptionalNativeModule:()=>({})};
 if(name==='react-native'){const actual=load.call(this,name,...args);return{...actual,ActivityIndicator:'View',Modal:({visible,children})=>visible?React.createElement('View',{style:{position:'absolute',inset:0}},children):null,AccessibilityInfo:{...actual.AccessibilityInfo,isReduceMotionEnabled:async()=>false},Alert:{alert:(title,message,buttons)=>alerts.push({title,message,buttons})}};}
 if(name==='react-native-safe-area-context')return{...load.call(this,name,...args),SafeAreaProvider:({children})=>React.createElement(React.Fragment,null,children)};
 if(name==='@shopify/react-native-skia')return{Canvas:'QASkiaCanvas',Rect:'QASkiaRect',Circle:'QASkiaCircle',Line:'QASkiaLine',vec:(x,y)=>({x,y})};
 if(name.endsWith('/FirstPersonCanvas'))return{FirstPersonCanvas:props=>{
  const{controller,onReady,onSnapshot}=props;context.controller=controller;context.snapshotCallback=onSnapshot;
  React.useEffect(()=>{const record={chapterId:controller.runtime.chapterId,session:controller.runtime.session,mounted:true,unmounted:false};owners.push(record);activeOwners++;maxActiveOwners=Math.max(maxActiveOwners,activeOwners);if(activeOwners>1)throw Error('App has concurrent Canvas boundary owners');context.camera=new THREE.PerspectiveCamera(65,390/844,.08,60);controller.viewport={width:390,height:844};RC.syncCamera(controller,context.camera);Object.assign(controller.diagnostics,{stage:'ready',rendererOwnership:'live',appActive:true});onReady();return()=>{record.unmounted=true;activeOwners--;};},[controller,onReady]);
  return React.createElement('CanvasPlaceholder');
 }};
 return load.call(this,name,...args);
};
const from=p=>require(path.join(source,p)),RC=from('src/rendering/firstPerson/runtimeController.ts');
const probeVisible=process.argv.includes('--probe-visible'),Definitions=from('src/domain/stageKit/definitions.ts');
if(probeVisible)Definitions.STAGE_DEFINITIONS.find(stage=>stage.id==='stage-kit-probe').playerVisible=true;
const Defaults=from('src/types/application.ts'),AS=from('src/storage/applicationStorage.ts'),Store=from('src/storage/firstPersonStorage.ts'),{skipQuickSetup}=from('src/domain/calibration/quickSetup.ts'),{ChapterScene}=from('src/rendering/firstPerson/ChapterScene.tsx'),{createSceneResources}=from('src/rendering/firstPerson/resources.ts'),App=from('App.tsx').default;
context.snapshot=()=>RC.controllerSnapshot(context.controller);
const flatten=style=>Array.isArray(style)?Object.assign({},...style.map(flatten)):style??{},escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function primitive(node){if(typeof node==='string')return'';const p=node.props,fill=' fill="'+escape(p.color)+'"';if(node.type==='QASkiaRect')return'<rect x="'+p.x+'" y="'+p.y+'" width="'+p.width+'" height="'+p.height+'"'+fill+'/>';if(node.type==='QASkiaCircle')return'<circle cx="'+p.cx+'" cy="'+p.cy+'" r="'+p.r+'"'+fill+'/>';if(node.type==='QASkiaLine')return'<line x1="'+p.p1.x+'" y1="'+p.p1.y+'" x2="'+p.p2.x+'" y2="'+p.p2.y+'" stroke="'+escape(p.color)+'" stroke-width="'+p.strokeWidth+'"/>';return node.children.map(primitive).join('');}
function serialize(node){if(typeof node==='string')return node;const p=node.props;if(node.type==='QASkiaCanvas'){const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="'+flatten(p.style).height+'">'+node.children.map(primitive).join('')+'</svg>';return{type:'Image',style:{...flatten(p.style),objectFit:'none',objectPosition:'left top'},testID:p.testID,source:'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'),children:[]};}const children=node.children.map(serialize).flat().filter(Boolean);if(typeof node.type!=='string')return children;return{type:node.type,style:flatten(typeof p.style==='function'?p.style({pressed:false}):p.style),contentStyle:flatten(p.contentContainerStyle),testID:p.testID,label:p.accessibilityLabel,disabled:!!p.disabled,source:p.source?.uri,children};}
async function settle(){await R.act(async()=>{for(let i=0;i<8;i++)await Promise.resolve();});}
async function extract(){
 await Store.resetAllApplicationStorage();memory.clear();const app=AS.createDefaultApplication();app.quickSetupResult=skipQuickSetup('2026-09-10T00:00:00Z');app.settings={...app.settings,haptics:false,audio:{...app.settings.audio,enabled:false}};
 await storage.setItem(AS.APPLICATION_STORAGE_KEY,JSON.stringify(app));await storage.setItem(Store.FIRST_PERSON_ONBOARDING_KEY,JSON.stringify({...Defaults.DEFAULT_FIRST_PERSON_ONBOARDING,tutorialCompleted:true,controlChoiceAcknowledged:true}));
 let hud=await native.mount(App,{});await settle();
 const frames=[],hudTrees=[],hudMap=new Map(),events=[];let live,stage='stage-select',previous=new Map();
 function event(type,detail={}){events.push({time:frames.length/30,type,...detail});}
 function record(focusId){
  const updates=[];if(live)live.scene.traverse(o=>{const v={matrix:o.matrix.toArray(),visible:o.visible,material:!Array.isArray(o.material)?o.material?.uuid:undefined},key=JSON.stringify(v);if(previous.get(o.uuid)!==key){previous.set(o.uuid,key);updates.push([o.uuid,v]);}});
  const tree=serialize(hud.tree.root),key=JSON.stringify(tree);let index=hudMap.get(key);if(index===undefined){index=hudTrees.length;hudMap.set(key,index);hudTrees.push(tree);}
  frames.push({scene:live?.id??null,camera:live?.camera.uuid??null,updates,hud:index,stage,focusId});
 }
 async function hold(seconds,focusId){for(let i=0;i<seconds*30;i++)record(focusId);}
 async function pressID(id){const b=hud.tree.root.findAll(n=>n.type==='Pressable'&&n.props.testID===id)[0];if(!b||b.props.disabled)throw Error('Missing enabled App button '+id);await R.act(async()=>b.props.onPress());await settle();event('actual-App-button',{testID:id});}
 async function press(label){const b=hud.tree.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label)[0];if(!b||b.props.disabled)throw Error('Missing enabled App button '+label);await R.act(async()=>b.props.onPress());await settle();event('actual-App-button',{label});}
 async function destroyScene(){if(!live)return;await live.mount.unmount();live.resources.dispose();live=undefined;previous=new Map();}
 const sequence=[['perception-gallery-v1','展示室へ入る'],['uncanny-vault-v1','収蔵庫へ入る'],['shadow-theatre-v1','映写室へ入る'],['shadow-theatre-v1','映写室へ入る']];
 if(probeVisible)sequence.push(['stage-kit-probe','Stage Kit 確認室へ入る'],['stage-kit-probe','Stage Kit 確認室へ入る']);
 if(process.argv.includes('--stress-ten'))sequence.push(...Array.from({length:10},()=>['shadow-theatre-v1','映写室へ入る']));
 for(let index=0;index<sequence.length;index++){
  const[id,entryLabel]=sequence[index];stage='stage-select';event('stage-select',{next:id});await hold(1,'select-'+id);
  await pressID('select-'+id);stage='preparation';event('preparation',{chapterId:id});await hold(.8);
  await press(entryLabel);const c=context.controller;if(c.runtime.chapterId!==id)throw Error('Entered wrong chapter');if(c.retired)throw Error('Entered retired controller');await hud.update();
  const resources=createSceneResources(false,null,true,id==='uncanny-vault-v1',id==='shadow-theatre-v1'),runtime={current:c.runtime},scene=new THREE.Scene(),camera=context.camera;scene.background=new THREE.Color('#171a1b');scene.add(camera);
  const mount=await mountThree(React.createElement(ChapterScene,{world:RC.worldForController(c),runtime,progress:c.runtime.progress,resources,assist:false,reducedMotion:false,lowQuality:false,lab:false,onFrameError:e=>{throw e;}}),THREE);mount.objects.forEach(o=>scene.add(o));const callbacks=bridge.callbacks.splice(0);callbacks.forEach(fn=>fn({},0));scene.updateMatrixWorld(true);
  const sceneId='entry-'+index;fs.writeFileSync(path.join(out,sceneId+'.json'),JSON.stringify(scene.toJSON()));live={id:sceneId,scene,camera,resources,mount};previous=new Map();stage='live-chapter';event('validated-entry-boundary',{chapterId:id,session:c.runtime.session,source:'Actual App/Screen callback with stub native ready',reentry:index===3||index===5});
  if(id==='stage-kit-probe'){
   if(index===4){for(let i=0;i<8;i++){c.input.forward=1;RC.advanceController(c,1/60,camera);}c.input.forward=0;RC.syncCamera(c,camera);if(!RC.interactController(c,'stage-kit-probe-device'))throw Error('Probe device rejected in App route');context.snapshotCallback(RC.controllerSnapshot(c));await hud.update();await settle();event('probe-device-saved',{activated:c.runtime.stageSession?.value?.activated});}
   else {if(!c.runtime.stageSession?.value?.activated)throw Error('Probe did not cold-load activated door');event('probe-cold-reentry',{activated:true,door:RC.worldForController(c).solids.find(s=>s.id==='door')?.min.y});}
  }
  for(let frame=0;frame<45;frame++){RC.commandController(c,{type:'turn',yaw:.18/45,pitch:0});RC.advanceController(c,1/30,camera);runtime.current=c.runtime;callbacks.forEach(fn=>fn({},1/30));scene.updateMatrixWorld(true);await hud.update();record();}
  await pressID('pause-control');stage='pause';event('paused',{chapterId:id});await hold(.8);
  await press('ホームへ戻る');await destroyScene();if(!c.retired)throw Error('Leaving chapter did not retire controller');stage='returned-stage-select';event('retired-on-return',{chapterId:id,session:c.runtime.session});await hold(.4,'select-'+id);
  if(probeVisible&&index===4){await hud.unmount();hud=await native.mount(App,{});await settle();event('probe-App-cold-remount',{checkpointKeyPresent:memory.has('chroma-rift.dev.stage-kit-probe.v1')});}
 }
 await hold(1,'select-shadow-theatre-v1');await hud.unmount();bridge.verify();
 if(activeOwners!==0||maxActiveOwners!==1||owners.length!==sequence.length||owners.some(o=>!o.unmounted))throw Error('App Canvas boundary ownership mismatch');
 const finalApp=JSON.parse(await storage.getItem(AS.APPLICATION_STORAGE_KEY));
 const report={method:'Actual App selection/preparation/Screen pause/home/reentry and actual ChapterScene with 45 controller turn+advance frames per chapter. Shared storage uses isolated memory. Native availability/Canvas ready/presentation/audio are stubbed; Modal and Skia are translated host boundaries. Browser renderer is single; UI timing is authored 30 Hz capture timing, not native FPS.',duration:frames.length/30,frames:frames.length,sequence:sequence.map(x=>x[0]),events,owners,maxActiveCanvasBoundaries:maxActiveOwners,activeCanvasBoundariesAfterUnmount:activeOwners,storageKeys:[...memory.keys()],writeCount:writes.length,storedApplication:finalApp,sourceHashes:Object.fromEntries(bridge.hashes),toolHash:sha256(fs.readFileSync(__filename))};
 fs.writeFileSync(path.join(out,'animation.json'),JSON.stringify({hudTrees,frames}));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');return report;
}
async function capture(report){
 for(const f of['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',f),path.join(out,f));
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><style>'+browserStyles+'</style><script type="module" src="./viewer.js"></script>');fs.writeFileSync(path.join(out,'viewer.js'),"import * as THREE from './three.module.js';\nHELPERS\nconst renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(390,844);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;\nconst root=document.createElement('div');root.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column';document.body.append(root);\nconst data=await(await fetch('./animation.json')).json();let scene,sceneId,objects=new Map(),materials=new Map(),last=-1,lastHUD=-1;\nfunction dispose(){if(!scene)return;const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const t of Object.values(m))if(t?.isTexture)ts.add(t);}if(o.isInstancedMesh)o.dispose();});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();renderer.renderLists.dispose();scene=null;}\nwindow.draw=async frame=>{\n if(frame<last)throw Error('Sequential frames required');\n for(let n=last+1;n<=frame;n++){const f=data.frames[n];\n  if(f.scene!==sceneId){dispose();sceneId=f.scene;objects=new Map();materials=new Map();if(sceneId){scene=await new THREE.ObjectLoader().parseAsync(await(await fetch(sceneId+'.json')).json());scene.traverse(o=>{objects.set(o.uuid,o);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])materials.set(m.uuid,m);});}}\n  for(const[id,v]of f.updates){const o=objects.get(id);o.matrix.fromArray(v.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=v.visible;if(v.material)o.material=materials.get(v.material);}\n }\n last=frame;const f=data.frames[frame];\n if(lastHUD!==f.hud){root.replaceChildren(hudDOM(data.hudTrees[f.hud],1.5,renderer.domElement));lastHUD=f.hud;await document.fonts.ready;}\n if(f.focusId){const target=root.querySelector('[data-testid=\"'+f.focusId+'\"]');target?.scrollIntoView({block:'center'});}\n if(scene){const camera=objects.get(f.camera);scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);renderer.render(scene,camera);}\n await new Promise(r=>requestAnimationFrame(r));\n return{calls:scene?renderer.info.render.calls:0,triangles:scene?renderer.info.render.triangles:0,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};\n};\nwindow.finish=()=>{dispose();root.replaceChildren();return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderers:1};};window.ready=true;".replace('HELPERS',browserHelpers));
 const browser=await openBrowser(out),dir=path.join(out,'frames');fs.mkdirSync(dir,{recursive:true});let maxCalls=0,maxTriangles=0;
 try{
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});for(let i=0;i<100&&!await browser.evaluate('window.ready===true');i++){if(browser.errors.length)throw Error(JSON.stringify(browser.errors));await delay(100);}
  const samples=process.argv.includes('--sample-only')?[...new Set([0,...report.events.filter(e=>['preparation','validated-entry-boundary','paused','retired-on-return'].includes(e.type)).map(e=>Math.min(report.frames-1,Math.round(e.time*30)+3)),report.frames-1])].sort((a,b)=>a-b):Array.from({length:report.frames},(_,i)=>i);
  for(const f of samples){const stats=await browser.evaluate('window.draw('+f+')');maxCalls=Math.max(maxCalls,stats.calls);maxTriangles=Math.max(maxTriangles,stats.triangles);const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(dir,String(f).padStart(6,'0')+'.png'),Buffer.from(shot.data,'base64'));if(f%150===0)console.log('captured '+f+'/'+report.frames);}
  const disposed=await browser.evaluate('window.finish()');fs.writeFileSync(path.join(out,'webgl.json'),JSON.stringify({maxCalls,maxTriangles,disposed,errors:browser.errors},null,2)+'\n');if(disposed.geometries||disposed.textures||browser.errors.length)throw Error('Browser resource/error gate failed');
 }finally{await browser.close();}
 if(!process.argv.includes('--sample-only')){const file=path.join(out,'chapter-reentry.mp4');cp.execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-framerate','30','-i',path.join(dir,'%06d.png'),'-frames:v',String(report.frames),'-c:v','libx264','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:['ignore','inherit','inherit']});fs.writeFileSync(path.join(out,'video.json'),JSON.stringify({file:'chapter-reentry.mp4',sha256:sha256(fs.readFileSync(file)),bytes:fs.statSync(file).size,duration:report.duration},null,2)+'\n');}
}
async function main(){const report=process.argv.includes('--capture-only')?JSON.parse(fs.readFileSync(path.join(out,'report.json'))):await extract();if(process.argv.includes('--capture-only'))for(const[f,hash]of Object.entries(report.sourceHashes))if(sha256(fs.readFileSync(path.join(source,f)))!==hash)throw Error('Source changed since extraction: '+f);if(!process.argv.includes('--extract-only'))await capture(report);bridge.verify();console.log(JSON.stringify({frames:report.frames,duration:report.duration,entries:report.owners.length,out}));}
main().catch(error=>{console.error(error);process.exitCode=1;});
