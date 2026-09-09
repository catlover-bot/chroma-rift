#!/usr/bin/env node
'use strict';
/* global Buffer, __filename */
const fs=require('node:fs'),path=require('node:path');
const {installSourceBridge,mountThree,openBrowser,delay,sha256}=require('./lib/three-scene-qa.cjs');
const {installNativeHudBridge,browserStyles,browserHelpers}=require('./lib/native-hud-qa.cjs');
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const root=process.cwd(),source=path.resolve(option('--source')||root),label=option('--label')||'current';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid capture label');
const out=path.join(root,'.expo/goal010-1/readability',label);fs.mkdirSync(out,{recursive:true});
const bridge=installSourceBridge(source),context={width:390,height:844,fontScale:1.5,bindController:false},native=installNativeHudBridge(context);
const React=require('react'),THREE=require('three'),load=relative=>require(path.join(source,relative));
const RC=load('src/rendering/firstPerson/runtimeController.ts'),TC=load('src/rendering/firstPerson/theatreController.ts'),D=load('src/domain/theatre/definition.ts'),L=load('src/domain/theatre/lightGate.ts'),Defaults=load('src/types/application.ts'),CameraSpec=load('src/domain/firstPerson/chapter.ts');
const {TheatreScene}=load('src/rendering/firstPerson/TheatreScene.tsx'),{createSceneResources}=load('src/rendering/firstPerson/resources.ts');
context.bindController=true;
const {FirstPersonScreen}=load('src/screens/FirstPersonScreen.tsx'),{FirstPersonResultScreen}=load('src/screens/FirstPersonResultScreen.tsx');
const looking=(position,target)=>({position,yaw:Math.atan2(-(target.x-position.x),-(target.z-position.z)),pitch:Math.atan2(target.y-position.y,Math.hypot(target.x-position.x,target.z-position.z))});
const pose=(x,z,yaw=Math.PI,pitch=0)=>({position:{x,y:1.6,z},yaw,pitch});
const projector=looking({x:-5.37,y:1.6,z:14.38},D.THEATRE_PROJECTOR_FIXTURE.center),maintenance=looking({x:-5.1,y:1.6,z:9.45},D.THEATRE_BYPASS_FIXTURE.center);
const fixtures=[
 {name:'light-shadow-shadow',pose:D.THEATRE_SPAWN,rail:0,mode:'light',accepted:false},
 {name:'light-light-shadow',pose:D.THEATRE_SPAWN,rail:.25,mode:'light',accepted:false},
 {name:'light-light-light',pose:D.THEATRE_SPAWN,rail:.65,mode:'light',accepted:false},
 {name:'light-solved-explore',pose:D.THEATRE_SPAWN,rail:.65,accepted:true},
 {name:'first-junction',pose:pose(2,4.6),accepted:true},
 {name:'shelf-edge',pose:looking({x:2.75,y:1.6,z:10.5},{x:1.1,y:1.6,z:13.4}),accepted:true},
 {name:'control-room-entrance',pose:pose(0,17.4),accepted:true},
 {name:'projector-unarmed',pose:projector,accepted:true},
 {name:'projector-armed',pose:projector,accepted:true,armed:true},
 {name:'projector-running',pose:projector,accepted:true,projectorSeconds:3,projectorCooldown:4.2},
 {name:'projector-cooldown',pose:projector,accepted:true,projectorCooldown:.7},
 {name:'maintenance-closed',pose:maintenance,accepted:true,inspection:true},
 {name:'maintenance-open',pose:maintenance,accepted:true,inspection:true,bypass:true},
 {name:'curtain-closed',pose:looking({x:.7,y:1.6,z:22.25},D.THEATRE_CURTAIN_FIXTURE.center),accepted:true,curtain:true},
 {name:'theatre-result',pose:D.THEATRE_CHECKPOINTS.exit,accepted:true,curtain:true,result:true},
];
function bounds(scene,name,camera,width,height){
 const obj=scene.getObjectByName(name);if(!obj)return null;const box=new THREE.Box3().setFromObject(obj),points=[];
 for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z])points.push(new THREE.Vector3(x,y,z).project(camera));
 return{left:Math.min(...points.map(p=>(p.x+1)*width/2)),right:Math.max(...points.map(p=>(p.x+1)*width/2)),top:Math.min(...points.map(p=>(1-p.y)*height/2)),bottom:Math.max(...points.map(p=>(1-p.y)*height/2))};
}
function receiverDecorationAudit(scene,camera,width,height){
 const windows=[];let newFrames=0;
 for(const w of L.LIGHT_WINDOWS){
  const group=scene.getObjectByName('receiver-window-'+w.id);if(!group)continue;
  const a=L.opticalWorldPoint({x:w.minX,y:w.minY,z:L.LIGHT_RECEIVER.point.z}),b=L.opticalWorldPoint({x:w.maxX,y:w.maxY,z:L.LIGHT_RECEIVER.point.z}),sample={minX:a.x,maxX:b.x,minY:a.y,maxY:b.y};
  const projected=[new THREE.Vector3(a.x,a.y,a.z),new THREE.Vector3(b.x,a.y,a.z),new THREE.Vector3(a.x,b.y,a.z),new THREE.Vector3(b.x,b.y,a.z)].map(p=>p.project(camera));
  const screen={left:Math.min(...projected.map(p=>(p.x+1)*width/2)),right:Math.max(...projected.map(p=>(p.x+1)*width/2)),top:Math.min(...projected.map(p=>(1-p.y)*height/2)),bottom:Math.max(...projected.map(p=>(1-p.y)*height/2))};
  const frames=[];group.traverse(o=>{if(!o.isMesh)return;const box=new THREE.Box3().setFromObject(o);const gap=Math.max(sample.minX-box.max.x,box.min.x-sample.maxX,sample.minY-box.max.y,box.min.y-sample.maxY);if(o.name==='receiver-frame-outside-sample')newFrames++;frames.push({name:o.name||o.parent?.name,gapMetres:gap,overlapsWindowInterior:gap< -1e-9});});
  windows.push({id:w.id,sample,projectedSample:screen,minimumDecorationGapMetres:Math.min(...frames.map(f=>f.gapMetres)),decorations:frames});
 }
 if(newFrames&&windows.some(w=>w.decorations.some(d=>d.overlapsWindowInterior)))throw Error('Actual receiver decoration covers optical sample');
 return{method:'Actual mesh world AABBs projected to receiver XY; conservative inclusion of hidden indicator alternatives. Sample rectangles remain authored LIGHT_WINDOWS, with no framebuffer/EXGL perception claim.',newFrames,windows};
}
async function extract(){
 const records=[];
 for(const[width,height,fontScale]of[[320,568,2],[390,844,1.5],[430,932,1]])for(const fixture of fixtures){
  Object.assign(context,{width,height,fontScale});
  const c=RC.createController(undefined,false,true,D.THEATRE_CHAPTER_ID);context.controller=c;c.viewport={width,height};
  Object.assign(c.diagnostics,{stage:'ready',rendererOwnership:'live',appActive:true,paused:false,open:false,sceneMode:'chapter'});
  const r=c.runtime,p=r.progress.theatre,v=r.theatre;r.pose=structuredClone(fixture.pose);
  p.light={rail:fixture.rail??.65,accepted:fixture.accepted,attempts:fixture.accepted?1:0};p.inspectionShutterOpen=!!fixture.inspection;p.bypassOpen=!!fixture.bypass;
  p.curtainAccepted=!!fixture.curtain;p.passageSealed=!!fixture.curtain;p.completed=!!fixture.result;
  p.discoveries={shadow:true,depth:!!fixture.inspection};p.story.projectorUsed=!!fixture.projectorSeconds||!!fixture.projectorCooldown;
  r.progress.exitDoorOpen=fixture.accepted;r.progress.cleared=!!fixture.result;
  Object.assign(v,{rail:fixture.rail??.65,mode:fixture.mode??'explore',lightGateOpen:fixture.accepted?1:0,projectorArmed:!!fixture.armed,projectorSeconds:fixture.projectorSeconds??0,projectorCooldown:fixture.projectorCooldown??0,curtainOpenness:fixture.curtain?0:1});
  const camera=new THREE.PerspectiveCamera(CameraSpec.VERTICAL_FOV,width/height,CameraSpec.CAMERA_NEAR,CameraSpec.CAMERA_FAR);RC.syncCamera(c,camera);context.snapshot=()=>RC.controllerSnapshot(c);
  const props=fixture.result?{summary:{chapterId:D.THEATRE_CHAPTER_ID,discoveredMechanisms:['影の大きさ','部屋の奥行き','保守通路を発見','防火幕を下ろし、サービス出口から脱出']},onReplay(){},onHome(){},onNotes(){}}:{chapterId:D.THEATRE_CHAPTER_ID,settings:{...Defaults.DEFAULT_SETTINGS,haptics:false},controls:Defaults.DEFAULT_FIRST_PERSON_CONTROLS,onboarding:{schemaVersion:1,tutorialCompleted:true,controlChoiceAcknowledged:true},preferredColor:'neutral',onSettingsChange(){},onControlsChange(){},onCheckpoint(){},onComplete(){},onRestart(){},onExit(){}};
  const hud=await native.mount(fixture.result?FirstPersonResultScreen:FirstPersonScreen,props);
  if(!fixture.result){
   RC.syncCamera(c,camera);
   if(fixture.armed&&!TC.theatreAction(c,{type:'enter-projector'}))throw Error('Actual post-mount enter-projector rejected: '+fixture.name);
   if(fixture.mode==='light'&&c.runtime.theatre.mode!=='light'&&!TC.theatreAction(c,{type:'enter-light'}))throw Error('Actual post-mount enter-light rejected');
   await hud.update();
  }
  const current=c.runtime,currentLive=current.theatre,currentProgress=current.progress.theatre;
  const checks={pose:JSON.stringify(current.pose)===JSON.stringify(fixture.pose),rail:currentLive.rail===(fixture.rail??.65),mode:currentLive.mode===(fixture.mode??'explore'),armed:currentLive.projectorArmed===!!fixture.armed,running:currentLive.projectorSeconds===(fixture.projectorSeconds??0),cooldown:currentLive.projectorCooldown===(fixture.projectorCooldown??0),accepted:currentProgress.light.accepted===fixture.accepted,inspection:currentProgress.inspectionShutterOpen===!!fixture.inspection,bypass:currentProgress.bypassOpen===!!fixture.bypass,curtain:currentProgress.passageSealed===!!fixture.curtain,completed:currentProgress.completed===!!fixture.result};
  const tree=hud.serialize();
  const hasID=(node,id)=>Array.isArray(node)?node.some(child=>hasID(child,id)):node&&typeof node==='object'&&(node.testID===id||node.children.some(child=>hasID(child,id)));
  if(!fixture.result)checks.hudMode=!!hasID(tree,'theatre-device-controls')===(currentLive.mode==='light'||currentLive.projectorArmed);
  if(Object.values(checks).some(value=>!value))throw Error('Post-mount fixture/HUD mismatch: '+fixture.name+' '+JSON.stringify(checks));
  const resources=createSceneResources(false,null,true,false,true),runtime={current:c.runtime},scene=new THREE.Scene();scene.background=new THREE.Color('#171a1b');
  const mounted=await mountThree(React.createElement(TheatreScene,{world:RC.worldForController(c),runtime,resources,reducedMotion:false,onFrameError:e=>{throw e;}}),THREE);
  mounted.objects.forEach(o=>scene.add(o));bridge.callbacks.splice(0).forEach(fn=>fn({},0));scene.updateMatrixWorld(true);
  const id=fixture.name+'-'+width,sceneFile=id+'-scene.json';fs.writeFileSync(path.join(out,sceneFile),JSON.stringify(scene.toJSON()));
  records.push({id,fixture:fixture.name,width,height,fontScale,sceneFile,camera:camera.toJSON(),tree,fixtureAssertions:checks,pose:current.pose,rail:currentLive.rail,mode:currentLive.mode,accepted:currentProgress.light.accepted,projector:{armed:currentLive.projectorArmed,running:currentLive.projectorSeconds,cooldown:currentLive.projectorCooldown},inspection:currentProgress.inspectionShutterOpen,bypass:currentProgress.bypassOpen,curtain:currentProgress.passageSealed,result:!!fixture.result,receiverDecorations:receiverDecorationAudit(scene,camera,width,height),windows:L.evaluateLight(currentLive.rail).windows.map(w=>({id:w.id,coverage:w.coverage,lit:w.lit})),deviceBounds:TC.theatreDeviceScreenBounds(c),bounds:{receiver:bounds(scene,'bounded-projection-receiver',camera,width,height),source:bounds(scene,'movable-point-light',camera,width,height)}});
  await hud.unmount();await mounted.unmount();resources.dispose();
 }
 bridge.verify();fs.writeFileSync(path.join(out,'raw-views.json'),JSON.stringify(records));return records;
}
async function main(){
 const records=await extract();
 for(const file of['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',file),path.join(out,file));
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><style>'+browserStyles+'</style><script type="module" src="./viewer.js"></script>');
 fs.writeFileSync(path.join(out,'viewer.js'),"import * as THREE from './three.module.js';\nconst renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;\nconst canvas=renderer.domElement,root=document.createElement('div');root.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column';document.body.append(root);\nHELPERS\nlet scene;\nfunction dispose(){if(!scene)return;const gs=new Set(),ms=new Set(),ts=new Set();scene.traverse(o=>{if(o.geometry)gs.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);}if(o.isInstancedMesh)o.dispose();});gs.forEach(g=>g.dispose());ms.forEach(m=>m.dispose());ts.forEach(t=>t.dispose());scene.clear();renderer.renderLists.dispose();}\nwindow.draw=async record=>{\n dispose();scene=await new THREE.ObjectLoader().parseAsync(await(await fetch(record.sceneFile)).json());\n const camera=new THREE.ObjectLoader().parse(record.camera);renderer.setSize(record.width,record.height);scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);renderer.render(scene,camera);\n root.replaceChildren(hudDOM(record.tree,record.fontScale,canvas));await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));\n const rect=id=>{const e=root.querySelector('[data-testid=\"'+id+'\"]');return e?hudRect(e):null;};\n const heading=rect('theatre-device-heading'),controls=rect('theatre-device-scroll')||rect('theatre-device-controls'),receiver=record.bounds.receiver,source=record.bounds.source;\n return{scrolls:[...root.querySelectorAll('.rn-scroll')].map(e=>({id:e.dataset.testid,scrollWidth:e.scrollWidth,clientWidth:e.clientWidth,horizontalOverflow:e.scrollWidth-e.clientWidth,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight})),calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,...auditHUD(root,record.deviceBounds),heading,controls,headingOverlapsReceiver:rectanglesOverlap(heading,receiver),controlsOverlapReceiver:rectanglesOverlap(controls,receiver),headingOverlapsSource:rectanglesOverlap(heading,source),controlsOverlapSource:rectanglesOverlap(controls,source),text:root.textContent,buttons:[...root.querySelectorAll('[role=\"button\"]')].map(e=>({label:e.dataset.label,disabled:e.dataset.disabled==='true',...hudRect(e)}))};\n};\nwindow.bottom=async()=>{let needed=false;for(const e of root.querySelectorAll('.rn-scroll'))if(e.scrollHeight>e.clientHeight+1){e.scrollTop=e.scrollHeight;needed=true;}await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return needed;};\nwindow.finish=()=>{dispose();return{geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures,renderers:1};};window.ready=true;".replace('HELPERS',browserHelpers));
 const browser=await openBrowser(out),reports=[];
 try{
  for(let i=0;i<100&&!await browser.evaluate('window.ready===true');i++){if(browser.errors.length)throw Error(JSON.stringify(browser.errors));await delay(100);}
  for(const r of records){
   await browser.send('Emulation.setDeviceMetricsOverride',{width:r.width,height:r.height,deviceScaleFactor:1,mobile:false});
   const metrics=await browser.evaluate('window.draw('+JSON.stringify(r)+')'),file=r.id+'.png';
   const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,file),Buffer.from(shot.data,'base64'));
   const{tree: _tree,camera:_camera,sceneFile:_sceneFile,...compact}=r;void _tree;void _camera;void _sceneFile;
   const record={...compact,file,sha256:sha256(fs.readFileSync(path.join(out,file))),...metrics};reports.push(record);
   if(await browser.evaluate('window.bottom()')){const bottom=r.id+'-bottom.png',shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,bottom),Buffer.from(shot.data,'base64'));record.bottom={file:bottom,sha256:sha256(fs.readFileSync(path.join(out,bottom)))};}
  }
  const disposed=await browser.evaluate('window.finish()');bridge.verify();
  const report={label,boundary:'Actual Scene meshes and actual Screen/result component hosts at authored fixed state/pose. useFrame sampled at delta0. Native Canvas/ready/audio are stubbed; CSS is not native Yoga. These still fixtures do not prove controller routes, saves, device frame timing or user perception.',toolHash:sha256(fs.readFileSync(__filename)),sourceHashes:Object.fromEntries(bridge.hashes),cases:reports.length,maxCalls:Math.max(...reports.map(r=>r.calls)),maxTriangles:Math.max(...reports.map(r=>r.triangles)),disposed,errors:browser.errors,reports};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  if(disposed.geometries||disposed.textures||browser.errors.length)throw Error('Disposal/error gate failed');
  console.log(JSON.stringify({label,cases:records.length,maxCalls:report.maxCalls,maxTriangles:report.maxTriangles,disposed}));
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
