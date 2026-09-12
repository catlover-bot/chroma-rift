#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {installSourceBridge,mountThree,openBrowser,delay,sha256}=require('./lib/three-scene-qa.cjs');
const {installNativeHudBridge,browserStyles,browserHelpers}=require('./lib/native-hud-qa.cjs');
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const root=path.resolve(__dirname,'..'),source=path.resolve(option('source')||root),scenario=option('scenario')||'light',out=path.resolve(option('out')||path.join(root,'.expo/goal010',scenario==='light'?'light-motion':'motion-'+scenario));
const fromSource=relative=>require(path.join(source,relative)),commitLabel=option('commit-label')||'灯りを固定する',solvedLeaveLabel=option('solved-leave-label')||'探索へ戻る';
if(!['light','route-east','route-inspect','route-optional','projector','projector-control','capture-retry','curtain-portrait','maintenance','bell-a','bell-b','shutter'].includes(scenario))throw Error('Unknown scenario');
const optionalDevices=option('optional-devices')||'both',routeIntensity=option('intensity')||'subdued';
if(scenario==='route-optional'&&(!['none','bell','shutter','both'].includes(optionalDevices)||!['standard','subdued'].includes(routeIntensity)))throw Error('Invalid optional route variant');
fs.mkdirSync(out,{recursive:true});
const bridge=installSourceBridge(source),context={width:390,height:844,fontScale:1.5,bindController:false},native=installNativeHudBridge(context);
const React=require('react'),R=require('react-test-renderer'),THREE=require('three');
const RC=fromSource('src/rendering/firstPerson/runtimeController.ts'),TC=fromSource('src/rendering/firstPerson/theatreController.ts'),D=fromSource('src/domain/theatre/definition.ts'),L=fromSource('src/domain/theatre/lightGate.ts'),Defaults=fromSource('src/types/application.ts');
const {MOVE_SPEED}=fromSource('src/domain/firstPerson/index.ts'),AI=fromSource('src/domain/theatre/actor.ts'),{endPointer,beginStick}=fromSource('src/rendering/firstPerson/touchInput.ts'),Ames=fromSource('src/domain/theatre/perspectiveExhibit.ts');
const Motion=fromSource('src/domain/actorMotion/index.ts');
const Env=fromSource('src/domain/theatre/environment.ts');
const {TheatreScene}=fromSource('src/rendering/firstPerson/TheatreScene.tsx'),{createSceneResources}=fromSource('src/rendering/firstPerson/resources.ts');
const deviceStatusPath=path.join(source,'src/domain/theatre/deviceStatus.ts'),Status=fs.existsSync(deviceStatusPath)?fromSource('src/domain/theatre/deviceStatus.ts'):undefined;
context.bindController=true;const {FirstPersonScreen}=fromSource('src/screens/FirstPersonScreen.tsx');
const savedTimers={set:globalThis.setTimeout,clear:globalThis.clearTimeout},timers=new Map();let elapsedMs=0,nextTimer=0;
globalThis.setTimeout=(fn,ms,...args)=>{if(!(ms>=1))return savedTimers.set(fn,ms,...args);const key={qaTimer:++nextTimer};timers.set(key,{due:elapsedMs+ms,fn,args});return key;};
globalThis.clearTimeout=key=>{if(!timers.delete(key))savedTimers.clear(key);};
async function advanceClock(ms){elapsedMs+=ms;const due=[...timers].filter(([,t])=>t.due<=elapsedMs);if(due.length)await R.act(async()=>{for(const[k,t]of due){timers.delete(k);t.fn(...t.args);}});}
const restoreTimers=()=>{globalThis.setTimeout=savedTimers.set;globalThis.clearTimeout=savedTimers.clear;};
const json=(file,value)=>fs.writeFileSync(path.join(out,file),JSON.stringify(value));
async function extract(){
 const c=RC.createController(undefined,false,true,D.THEATRE_CHAPTER_ID);context.controller=c;c.viewport={width:390,height:844};
 Object.assign(c.diagnostics,{stage:'ready',rendererOwnership:'live',appActive:true,paused:false,open:false,sceneMode:'chapter'});
 const camera=new THREE.PerspectiveCamera(65,390/844,.08,60);RC.syncCamera(c,camera);context.snapshot=()=>RC.controllerSnapshot(c);
 const initialMatrix=camera.matrixWorld.toArray(),runtime={current:c.runtime},resources=createSceneResources(false,null,true,false,true),scene=new THREE.Scene();scene.background=new THREE.Color('#171a1b');scene.add(camera);
 const mount=await mountThree(React.createElement(TheatreScene,{world:RC.worldForController(c),runtime,resources,reducedMotion:false,onFrameError:e=>{throw e;}}),THREE);
 mount.objects.forEach(o=>scene.add(o));const callbacks=bridge.callbacks.splice(0),objects=[];scene.traverse(o=>objects.push(o));
 callbacks.forEach(fn=>fn({},0));scene.updateMatrixWorld(true);json('scene.json',scene.toJSON());
 const hud=await native.mount(FirstPersonScreen,{chapterId:D.THEATRE_CHAPTER_ID,settings:{...Defaults.DEFAULT_SETTINGS,haptics:false},controls:Defaults.DEFAULT_FIRST_PERSON_CONTROLS,onboarding:{schemaVersion:1,tutorialCompleted:true,controlChoiceAcknowledged:true},preferredColor:'neutral',onSettingsChange(){},onControlsChange(){},onCheckpoint(){},onComplete(){completedCallbackCount++;},onRestart(){},onExit(){}});
 const frames=[],hudTrees=[],lookup=new Map(),previous=new Map(),events=[],samples=[];let priorShadow='',railBeforeCommit,segment='initial',ticks=0,maxCameraMatrixDelta=0,capturing=true,prepTicks=0,lastPhase='',lastProjectorPhase='',maxActorRadius=0,minActorY=Infinity,maxActorY=-Infinity,actorVertexSamples=0,completedCallbackCount=0;
 const actorByPhase={},visibilityByPhase={},actorIds=new Set(),actorRoot=scene.getObjectByName('theatre-aisle-actor');actorRoot?.traverse(o=>actorIds.add(o.uuid));
 const raycaster=new THREE.Raycaster(),rayOrigin=new THREE.Vector3(),rayTarget=new THREE.Vector3();
 const phaseDurations={},initialStateHashes={};
 function event(type,detail={}){events.push({time:ticks/60,type,...detail});}
 async function press(label){
  const b=hud.tree.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label)[0];if(!b)throw Error('Missing actual button: '+label);
  if(b.props.disabled){event('disabled-button-not-delivered',{label});return false;}
  await hud.press(label);event('actual-button',{label});return true;
 }
 const point=s=>{const f=D.THEATRE_LIGHT_FIXTURE,p=L.lightHandlePoint(s),b=TC.theatreDeviceScreenBounds(c);if(!b)throw Error('No actual touch bounds');const q=new THREE.Vector3(f.center.x+f.right.x*p.x,f.center.y,f.center.z+f.right.z*p.x).project(camera);return{identifier:17,locationX:(q.x+1)*390/2-b.left,locationY:(1-q.y)*844/2-b.top,pageX:(q.x+1)*390/2,pageY:(1-q.y)*844/2};};
 async function touch(phase,s){const p=point(s);await hud.touch('theatre-device-touch',phase,{touches:phase==='End'?[]:[p],changedTouches:[p],targetTouches:phase==='End'?[]:[p]});}
 async function record(){
  const updates=[];
  for(const o of objects){const v={matrix:o.matrix.toArray(),visible:o.visible,material:!Array.isArray(o.material)?o.material?.uuid:undefined},key=JSON.stringify(v);if(previous.get(o.uuid)!==key){previous.set(o.uuid,key);updates.push([o.uuid,v]);}}
  const sg=resources.theatreResources.shadowGeometry,count=sg.drawRange.count,position=Array.from(sg.getAttribute('position').array.slice(0,count*3)),shadowKey=JSON.stringify(position),shadow=shadowKey===priorShadow?undefined:{uuid:sg.uuid,count,position};priorShadow=shadowKey;
  const host=hud.serialize(),key=JSON.stringify(host);let index=lookup.get(key);if(index===undefined){index=hudTrees.length;lookup.set(key,index);hudTrees.push(host);}
  frames.push({time:ticks/60,updates,shadow,hud:index});
  if(ticks%30===0)samples.push({time:ticks/60,segment,player:{...c.runtime.pose.position},yaw:c.runtime.pose.yaw,actor:{phase:c.runtime.theatre.actor.phase,position:{...c.runtime.theatre.actor.motion.position},yaw:c.runtime.theatre.actor.motion.yaw,lastHeard:c.runtime.theatre.actor.lastHeard,headYaw:c.runtime.theatre.actor.motion.headYaw,chestYaw:c.runtime.theatre.actor.motion.chestYaw,plantSequence:c.runtime.theatre.actor.motion.plantSequence},projector:{phase:Status?.theatreProjectorStatus(c.runtime).phase,armed:c.runtime.theatre.projectorArmed,remainingSeconds:c.runtime.theatre.projectorSeconds,cooldownSeconds:c.runtime.theatre.projectorCooldown,noiseSequence:c.runtime.theatre.noiseSequence},lightDragCompleted:c.runtime.theatre.lightDragCompleted,curtain:c.runtime.theatre.curtainOpenness,sealed:c.runtime.progress.theatre.passageSealed,cleared:c.runtime.progress.cleared,rail:c.runtime.theatre.rail,committed:c.runtime.progress.theatre.light.rail,accepted:c.runtime.progress.theatre.light.accepted,gate:c.runtime.theatre.lightGateOpen,windows:L.evaluateLight(c.runtime.theatre.rail).windows.map(w=>({id:w.id,coverage:w.coverage,lit:w.lit}))});
 }

 async function step(dt=1/60){
  RC.advanceController(c,dt,camera);runtime.current=c.runtime;callbacks.forEach(fn=>fn({},dt));scene.updateMatrixWorld(true);
  await advanceClock(dt*1000);await hud.update();
  const phase=c.runtime.theatre.actor.phase,projectorPhase=Status?.theatreProjectorStatus(c.runtime).phase;
  if(capturing){if(projectorPhase&&projectorPhase!==lastProjectorPhase){event('projector-phase',{from:lastProjectorPhase,to:projectorPhase,remainingSeconds:c.runtime.theatre.projectorSeconds,cooldownSeconds:c.runtime.theatre.projectorCooldown});lastProjectorPhase=projectorPhase;}phaseDurations[phase]=(phaseDurations[phase]||0)+dt;if(phase!==lastPhase){event('actor-phase',{from:lastPhase,to:phase,position:c.runtime.theatre.actor.motion.position});lastPhase=phase;}
   maxCameraMatrixDelta=Math.max(maxCameraMatrixDelta,...camera.matrixWorld.elements.map((v,i)=>Math.abs(v-initialMatrix[i])));
   if(scenario==='light'&&maxCameraMatrixDelta>1e-10)throw Error('Optical operation changed camera');
   if(ticks%2===0){const actor=scene.getObjectByName('theatre-aisle-actor'),center=c.runtime.theatre.actor.motion.position,v=new THREE.Vector3();if(actor?.visible)actor.traverse(o=>{if(!o.isMesh)return;const a=o.geometry.getAttribute('position');for(let i=0;i<a.count;i++){v.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);maxActorRadius=Math.max(maxActorRadius,Math.hypot(v.x-center.x,v.z-center.z));minActorY=Math.min(minActorY,v.y-center.y);maxActorY=Math.max(maxActorY,v.y-center.y);actorVertexSamples++;const metric=actorByPhase[phase]??(actorByPhase[phase]={maxRadius:0,minY:Infinity,maxY:-Infinity,vertices:0});metric.maxRadius=Math.max(metric.maxRadius,Math.hypot(v.x-center.x,v.z-center.z));metric.minY=Math.min(metric.minY,v.y-center.y);metric.maxY=Math.max(metric.maxY,v.y-center.y);metric.vertices++;}});
    const visible=visibilityByPhase[phase]??(visibilityByPhase[phase]={sampledFrames:0,headFrames:0,chestFrames:0,feetFrames:0});visible.sampledFrames++;camera.getWorldPosition(rayOrigin);for(const[key,name]of[['headFrames','actor-convex-face'],['chestFrames','actor-tailored-coat'],['feetFrames','actor-planted-foot--1']]){const mesh=scene.getObjectByName(name);if(!mesh)continue;mesh.geometry.computeBoundingBox();mesh.geometry.boundingBox.getCenter(rayTarget).applyMatrix4(mesh.matrixWorld);const projected=rayTarget.clone().project(camera);if(Math.abs(projected.x)>1||Math.abs(projected.y)>1||projected.z< -1||projected.z>1)continue;raycaster.set(rayOrigin,rayTarget.clone().sub(rayOrigin).normalize());raycaster.far=rayOrigin.distanceTo(rayTarget)+.6;const hits=raycaster.intersectObjects(scene.children,true).filter(h=>{let o=h.object;while(o){if(!o.visible)return false;o=o.parent;}return true;});if(hits.length&&actorIds.has(hits[0].object.uuid))visible[key]++;}await record();}ticks++;
  }else prepTicks++;
 }
 async function wait(seconds){c.input.forward=0;c.input.right=0;for(let i=0;i<seconds*60;i++)await step();}
 function lookAt(target){const p=c.runtime.pose,dx=target.x-p.position.x,dz=target.z-p.position.z,desired=Math.atan2(-dx,-dz),change=Math.atan2(Math.sin(desired-p.yaw),Math.cos(desired-p.yaw));RC.commandController(c,{type:'turn',yaw:change,pitch:Math.atan2(target.y-p.position.y,Math.hypot(dx,dz))-p.pitch});RC.syncCamera(c,camera);}
 async function walk(x,z){segment='walk';for(let i=0;i<1800;i++){const p=c.runtime.pose.position,d=Math.hypot(x-p.x,z-p.z);if(d<.02||c.runtime.progress.cleared){c.input.forward=0;return;}lookAt({x,y:p.y,z});c.input.forward=1;const before={...p};c.input.forward=Math.min(1,d/MOVE_SPEED*60);await step();const after=c.runtime.pose.position;if(Math.hypot(after.x-before.x,after.z-before.z)>MOVE_SPEED/60+.001)throw Error('Caught on walk '+JSON.stringify({before,target:[x,z]}));}throw Error('Blocked '+JSON.stringify({position:c.runtime.pose.position,target:[x,z],phase:c.runtime.theatre.actor.phase}));}
 async function pathWalk(points){for(const[x,z]of points)await walk(x,z);}
 async function interact(id,fixture){lookAt(fixture.center);await hud.update();const prior=c.runtime;await hud.pressTestID('interact');if(c.runtime===prior)throw Error('Actual interact did not dispatch '+id);event('actual-screen-interact',{id});}
 async function solve(){lookAt(D.THEATRE_LIGHT_FIXTURE.center);await hud.update();await hud.pressTestID('interact');if(c.runtime.theatre.mode!=='light')throw Error('Enter light failed');await touch('Start',0);await touch('Move',.8);await touch('End',.8);await press(commitLabel);if(!c.runtime.progress.theatre.light.accepted)throw Error('Solve failed');await press(solvedLeaveLabel);event('light-explicitly-solved');await wait(.5);}
 async function crank(){await interact('projector',D.THEATRE_PROJECTOR_FIXTURE);if(!c.runtime.theatre.projectorArmed)throw Error('Projector not armed');
  const pointAngle=angle=>{const f=D.THEATRE_PROJECTOR_FIXTURE,b=TC.theatreDeviceScreenBounds(c),x=D.THEATRE_PROJECTOR.crankRadius*Math.cos(angle),y=D.THEATRE_PROJECTOR.crankRadius*Math.sin(angle),u=new THREE.Vector3().crossVectors(new THREE.Vector3(f.normal.x,f.normal.y,f.normal.z),new THREE.Vector3(f.right.x,f.right.y,f.right.z)),q=new THREE.Vector3(f.center.x+f.right.x*x+u.x*y,f.center.y+f.right.y*x+u.y*y,f.center.z+f.right.z*x+u.z*y).project(camera);return{identifier:29,locationX:(q.x+1)*390/2-b.left,locationY:(1-q.y)*844/2-b.top};};
  const send=async(phase,angle)=>{const p=pointAngle(angle);await hud.touch('theatre-device-touch',phase,{touches:phase==='End'?[]:[p],changedTouches:[p],targetTouches:phase==='End'?[]:[p]});};
  await send('Start',0);for(let i=1;i<=30;i++){await send('Move',2.8*i/30);await step();}await send('End',2.8);endPointer(c.input,29);if(c.runtime.theatre.projectorSeconds!==5)throw Error('Actual crank release failed');event('projector-crank-released');}
 async function finish(){await pathWalk([[0,17.4],[0,19.6],[0,21.3]]);if(scenario==='curtain-portrait'){await walk(.7,22.25);lookAt(D.THEATRE_CURTAIN_FIXTURE.center);await hud.update();capturing=true;events.length=0;samples.length=0;ticks=0;event('actual-walk-to-portrait-curtain-observation',{pose:c.runtime.pose});await wait(1);}segment='curtain';await interact('curtain',D.THEATRE_CURTAIN_FIXTURE);if(!c.runtime.progress.theatre.curtainAccepted||c.runtime.progress.cleared)throw Error('Curtain acceptance incorrectly completes');event('curtain-accepted-before-completion');await wait(1.5);if(!c.runtime.progress.theatre.passageSealed||c.runtime.progress.cleared)throw Error('Sealing incorrectly completes');event('curtain-sealed-before-completion');await walk(0,23.6);if(!c.runtime.progress.cleared)throw Error('Actual exit walk did not complete');event('actual-exit-walk-completed');segment='fresh-result';await wait(3);}
 if(scenario==='light')for(let n=0;n<1200;n++){
  if(ticks===60){await hud.pressTestID('interact');if(c.runtime.theatre.mode!=='light')throw Error('Actual enter failed');event('enter-light');segment='wrong-drag';}
  if(ticks===120){await touch('Start',0);if(!c.runtime.theatre.activeDrag)throw Error('Actual handle not acquired');event('drag-start',{rail:0});}
  if(ticks>120&&ticks<=360)await touch('Move',.25*(ticks-120)/240);
  if(ticks===360){await touch('End',.25);event('drag-release',{rail:c.runtime.theatre.rail});segment='wrong-released';}
  if(ticks===390){await press(commitLabel);if(c.runtime.progress.theatre.light.accepted)throw Error('Wrong released value cleared');event('wrong-retains-closed-gate');}
  if(ticks===450){await touch('Start',.25);if(!c.runtime.theatre.activeDrag)throw Error('Second actual drag failed');event('drag-start',{rail:.25});segment='correct-drag';}
  if(ticks>450&&ticks<=810)await touch('Move',.25+.4*(ticks-450)/360);
  if(ticks===810){await touch('End',.65);railBeforeCommit=c.runtime.theatre.rail;if(c.runtime.progress.theatre.light.accepted)throw Error('Release auto-accepted');event('correct-release-still-unaccepted',{rail:railBeforeCommit});segment='correct-released';}
  if(ticks===870){if(!await press(commitLabel)||!c.runtime.progress.theatre.light.accepted)throw Error('Correct explicit commit failed');event('accepted-after-explicit-commit');segment='physical-gate-opening';}
  if(ticks===930){await press(solvedLeaveLabel);segment='returned-to-explore';}

  await step();
 }else{
  if(scenario.startsWith('projector')||scenario==='curtain-portrait'||scenario==='maintenance'||scenario==='bell-a'||scenario==='bell-b'||scenario==='shutter'||scenario==='route-optional')capturing=false;
  await solve();await pathWalk([[2,-2],[2,3],[2,4.6]]);
  if(scenario==='route-optional'){
   RC.setControllerHorrorIntensity(c,routeIntensity);capturing=true;events.length=0;samples.length=0;ticks=0;segment='optional-approach';event('optional-route-start',{intensity:routeIntensity,devices:optionalDevices});
   await pathWalk([[0,5.2],[-2.7,5.9],[-3.45,7.3]]);
   if(optionalDevices==='bell'||optionalDevices==='both'){segment='optional-bell';await interact('theatre-bell-a',Env.THEATRE_BELLS[0].fixture);event('optional-bell-used',{receiver:c.runtime.theatre.environmentNoise?.position});}
   if(optionalDevices==='shutter'||optionalDevices==='both'){await pathWalk([[-3.4,10.9]]);segment='optional-shutter';await interact('theatre-shutter-south',Env.THEATRE_SHUTTER.handles[0]);await wait(1.2);event('optional-shutter-closed',{closed:c.runtime.theatre.environment.shutter.closed,progress:c.runtime.theatre.environment.shutter.progress});}
   segment='optional-detour';await pathWalk([...(optionalDevices==='shutter'||optionalDevices==='both'?[[-3.4,7.3]]:[]),[-2,7.3],[0,7.3],[2.9,7.3],[2.9,11],[2.55,16.7]]);await finish();
  }
  if(scenario==='bell-a'||scenario==='bell-b'){
   const bell=Env.THEATRE_BELLS[scenario==='bell-a'?0:1];
   if(scenario==='bell-a')await pathWalk([[0,5.2],[-2.7,5.9],[-3.45,7.3]]);
   else await pathWalk([[2.9,5.5],[2.9,7.6],[2.9,11],[3.45,14.6]]);
   c.runtime={...c.runtime,theatre:{...c.runtime.theatre,actor:{...c.runtime.theatre.actor,phase:'patrol',motion:Motion.createActorMotion({x:bell.receiver.x,y:0,z:bell.receiver.z-.7},0),startupGrace:0,contactCooldown:0,lastSeen:undefined,lastHeard:undefined}}};runtime.current=c.runtime;
   lookAt(bell.fixture.center);await hud.update();capturing=true;events.length=0;samples.length=0;ticks=0;segment=scenario;
   event('controlled-actor-setup',{position:c.runtime.theatre.actor.motion.position,phase:'patrol'});event('bell-before',{instanceId:bell.instanceId,receiver:bell.receiver,actorPhase:c.runtime.theatre.actor.phase});await wait(1);
   await interact(bell.instanceId,bell.fixture);event('bell-after',{noiseSource:c.runtime.theatre.environmentNoise?.position,actorPhase:c.runtime.theatre.actor.phase});await wait(8);
  }
  if(scenario==='shutter'){
   await pathWalk([[0,5.2],[-2.7,5.9],[-3.4,7.3],[-3.4,10.9]]);
   const handle=Env.THEATRE_SHUTTER.handles[0];lookAt(handle.center);await hud.update();capturing=true;events.length=0;samples.length=0;ticks=0;segment='shutter-south';
   event('shutter-before',{closed:c.runtime.theatre.environment.shutter.closed});await wait(1);
   await interact('theatre-shutter-south',handle);await wait(2);event('shutter-after',{closed:c.runtime.theatre.environment.shutter.closed,progress:c.runtime.theatre.environment.shutter.progress,actorLastSeen:c.runtime.theatre.actor.lastSeen});
   await wait(3);
  }
  if(scenario==='route-east'||scenario==='curtain-portrait'){await pathWalk([[2.9,5.5],[2.9,7.6],[2.55,13.8],[2.55,16.7]]);await finish();}
  if(scenario==='maintenance'){
   await pathWalk([[0,5.2],[-2.7,5.9],[-3.6,7]]);await interact('inspection',D.THEATRE_INSPECTION_FIXTURE);await wait(.5);await pathWalk([[-4.7,9.45],[-5.2,9.6]]);lookAt(D.THEATRE_BYPASS_FIXTURE.center);await hud.update();
   const beforeCamera=camera.matrixWorld.toArray();capturing=true;events.length=0;samples.length=0;ticks=0;segment='maintenance-closed-stationary';event('maintenance-closed',{pose:c.runtime.pose,opened:c.runtime.progress.theatre.bypassOpen});
   await wait(1);await interact('bypass',D.THEATRE_BYPASS_FIXTURE);if(!c.runtime.progress.theatre.bypassOpen)throw Error('Actual maintenance action did not open passage');segment='maintenance-open-stationary';event('maintenance-opened-without-movement');await wait(3);
   const matrixDifference=Math.max(...camera.matrixWorld.elements.map((v,i)=>Math.abs(v-beforeCamera[i])));if(matrixDifference>1e-10)throw Error('Maintenance observation camera changed');event('maintenance-stationary-snapshot',{cameraMatrixDifference:matrixDifference,opened:c.runtime.progress.theatre.bypassOpen});
  }
  if(scenario==='route-inspect'){
   await pathWalk([[0,5.2],[-2.7,5.9],[-3.6,7]]);await interact('inspection',D.THEATRE_INSPECTION_FIXTURE);await wait(.5);
   for(const name of ['front','intermediate']){const pose=Ames.AMES_OBSERVATION_POINTS[name];await walk(pose.position.x,pose.position.z);RC.commandController(c,{type:'turn',yaw:pose.yaw-c.runtime.pose.yaw,pitch:pose.pitch-c.runtime.pose.pitch});RC.syncCamera(c,camera);segment='ames-'+name;event('ames-view',{name});await wait(1.5);}
   await pathWalk([[-4.7,9.45],[-11.45,10.3]]);const side=Ames.AMES_OBSERVATION_POINTS.side;RC.commandController(c,{type:'turn',yaw:side.yaw-c.runtime.pose.yaw,pitch:side.pitch-c.runtime.pose.pitch});RC.syncCamera(c,camera);segment='ames-side';await wait(2);await interact('ames-side',D.THEATRE_AMES_SIDE_FIXTURE);await pathWalk([[-5.2,9.6]]);await interact('bypass',D.THEATRE_BYPASS_FIXTURE);await pathWalk([[-5.2,11.1],[-5.2,14.38],[D.THEATRE_CHECKPOINTS.projector.position.x,D.THEATRE_CHECKPOINTS.projector.position.z]]);await crank();await wait(2);await pathWalk([[-4.55,14.38],[-4.55,14.75],[-2.6,14.75],[0,14.75],[2.55,16.7]]);await finish();
  }
  if(scenario.startsWith('projector')||scenario==='capture-retry'){
   await pathWalk([[-2.6,6],[-2.6,10.5],[-2.6,14.75]]);
   if(scenario==='capture-retry'){
    c.input.forward=0;lookAt({...c.runtime.theatre.actor.motion.position,y:1.7});await hud.update();beginStick(c.input,77,80,700);if(c.input.stickPointer!==77)throw Error('Held pointer not acquired');event('wait-for-natural-encounter');const saved=JSON.stringify(c.runtime.progress.theatre.light);let caught=false;
    for(let i=0;i<45*60;i++){await step();if(c.runtime.pose.position.z<0){caught=true;break;}}
    if(!caught||JSON.stringify(c.runtime.progress.theatre.light)!==saved||!c.input.releaseBarrier.includes(77))throw Error('Capture recovery invariant failed '+JSON.stringify({caught,savedSame:JSON.stringify(c.runtime.progress.theatre.light)===saved,barrier:c.input.releaseBarrier,pose:c.runtime.pose,phase:c.runtime.theatre.actor.phase}));event('caught-progress-preserved-release-required');endPointer(c.input,77);await wait(1);await pathWalk([[2,-2],[2,3],[2,4.6],[2.9,5.5],[2.9,7.6],[2.55,13.8],[2.55,16.7]]);await finish();
   }else{
    await pathWalk([[-5.37,14.75],[-5.37,14.38]]);c.input.forward=0;
    const candidate={sequence:c.runtime.theatre.noiseSequence+1,position:{...D.THEATRE_PROJECTOR.position},strength:D.THEATRE_PROJECTOR.strength,kind:'projector'};let heard=false;
    for(let i=0;i<45*60;i++){if(c.runtime.theatre.actor.phase==='patrol'&&!AI.theatreActorCanSeePlayer(c.runtime)&&AI.theatreNoiseAudibility(c.runtime.theatre.actor,candidate,RC.worldForController(c))>=AI.THEATRE_AI.noiseThreshold){let predicted=c.runtime;for(let j=0;j<30;j++)predicted=AI.advanceTheatreActor(predicted,1/60,{intensity:'standard'}).runtime;if(predicted.theatre.actor.phase==='patrol'&&!AI.theatreActorCanSeePlayer(predicted)&&AI.theatreNoiseAudibility(predicted.theatre.actor,candidate,RC.worldForController({...c,runtime:predicted}))>=AI.THEATRE_AI.noiseThreshold*1.01){heard=true;break;}}await step();}
    if(!heard)throw Error('No naturally reached decoy comparison state');lookAt(D.THEATRE_PROJECTOR_FIXTURE.center);await hud.update();
    json('comparison-start.json',c.runtime);initialStateHashes.runtime=sha256(JSON.stringify(c.runtime,(key,value)=>['session','sessionId','lastNowMs'].includes(key)?undefined:value));initialStateHashes.pose=sha256(JSON.stringify(c.runtime.pose));
    capturing=true;events.length=0;samples.length=0;ticks=0;segment='same-start-projector-comparison';event('same-start',{runtimeHash:initialStateHashes.runtime,preparationSeconds:prepTicks/60});
    if(scenario==='projector')await crank();else{await wait(.5);event('no-projector-input');}await wait(1.5);lookAt({x:-4.05,y:1.65,z:14.75});event('same-view-through-bay-opening');await wait(6);
    if(scenario==='projector'&&Math.hypot((c.runtime.theatre.actor.lastHeard?.x??100)-D.THEATRE_PROJECTOR.position.x,(c.runtime.theatre.actor.lastHeard?.z??100)-D.THEATRE_PROJECTOR.position.z)>.001)throw Error('Decoy did not create evidence at actual projector');
    if(c.runtime.progress.cleared)throw Error('Projector comparison unexpectedly completed chapter');
   }
  }
 }
 const report={scenario,commitLabel,solvedLeaveLabel,toolHash:sha256(fs.readFileSync(__filename)),duration:frames.length/30,simulationSeconds:ticks/60,fps:30,frames:frames.length,sceneMounts:1,screenMounts:1,cameraUnchanged:scenario==='light',phaseDurations,initialStateHashes,preparationSeconds:prepTicks/60,actorMetrics:{maxActorRadius,minActorY,maxActorY,actorVertexSamples,byPhase:actorByPhase},visibilityByPhase,completedCallbackCount,maxCameraMatrixDelta,angleRepresentationNote:'Runtime normalizes yaw pi to minus pi on the first tick; actual camera matrix is compared instead of JSON angle spelling.',events,samples,railBeforeCommit,final:{accepted:c.runtime.progress.theatre.light.accepted,gate:c.runtime.theatre.lightGateOpen,chapterCompleted:c.runtime.progress.cleared},boundary:'Actual Screen buttons, TheatreTouchLayer native-event shape, controller and live Scene. Native ready/audio stubs; UI timeout callbacks follow the 60 Hz simulation. Light uses a fixed camera; route changes use actual controller turn input. Route corner turns are commanded immediately; this is not a human gesture recording. Browser CSS is not Yoga. No claim of real finger interaction, actual device timing, audio or perceived illusion.'};
 await hud.unmount();await mount.unmount();resources.dispose();report.pendingUITimersAfterUnmount=timers.size;if(timers.size)throw Error('UI timers retained');
 json('animation.json',{width:390,height:844,fontScale:1.5,camera:camera.uuid,hudTrees,frames});json('timeline.json',report);bridge.verify();json('source-hashes.json',Object.fromEntries(bridge.hashes));restoreTimers();return report;
}
function viewer(){
 for(const f of ['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',f),path.join(out,f));
 fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><style>${browserStyles}#screen{position:absolute;inset:0;display:flex;flex-direction:column}</style><div id="screen"></div><script type="module">
import * as THREE from './three.module.js';${browserHelpers}
const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setPixelRatio(1);r.setSize(390,844);r.outputColorSpace=THREE.SRGBColorSpace;r.toneMapping=THREE.NoToneMapping;
const data=await(await fetch('./animation.json')).json(),scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./scene.json')).json()),objects=new Map(),geos=new Map(),mats=new Map(),root=document.getElementById('screen');
scene.traverse(o=>{objects.set(o.uuid,o);if(o.geometry)geos.set(o.geometry.uuid,o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[])mats.set(m.uuid,m);});const camera=objects.get(data.camera);let applied=-1,lastHUD=-1;
window.draw=async frame=>{if(frame<applied)throw Error('Sequential playback required');for(let n=applied+1;n<=frame;n++){const f=data.frames[n];for(const[id,v]of f.updates){const o=objects.get(id);o.matrix.fromArray(v.matrix);o.matrix.decompose(o.position,o.quaternion,o.scale);o.visible=v.visible;if(v.material)o.material=mats.get(v.material);}if(f.shadow){const g=geos.get(f.shadow.uuid),a=g.getAttribute('position');a.array.set(f.shadow.position);a.needsUpdate=true;g.setDrawRange(0,f.shadow.count);g.computeBoundingSphere();}}applied=frame;const f=data.frames[frame];if(lastHUD!==f.hud){root.replaceChildren(hudDOM(data.hudTrees[f.hud],data.fontScale,r.domElement));lastHUD=f.hud;}scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);r.render(scene,camera);return{calls:r.info.render.calls,triangles:r.info.render.triangles,geometries:r.info.memory.geometries,textures:r.info.memory.textures};};
window.finish=()=>{geos.forEach(g=>g.dispose());const ts=new Set();mats.forEach(m=>{for(const t of Object.values(m))if(t?.isTexture)ts.add(t);m.dispose();});ts.forEach(t=>t.dispose());scene.traverse(o=>{if(o.isInstancedMesh)o.dispose();});scene.clear();root.replaceChildren();r.renderLists.dispose();return{geometries:r.info.memory.geometries,textures:r.info.memory.textures,renderers:1};};window.ready=true;
</script>`);
}
async function capture(report){
 viewer();const browser=await openBrowser(out),frames=path.join(out,'frames');fs.mkdirSync(frames,{recursive:true});let maxCalls=0,maxTriangles=0;
 const captureFps=Number(option('capture-fps')||30);if(!Number.isInteger(captureFps)||captureFps<1||30%captureFps!==0)throw Error('capture-fps must divide 30');
 const captureFrameCount=Math.ceil(report.frames/(30/captureFps));
 try{
  await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});
  for(let i=0;i<100&&!await browser.evaluate('window.ready===true');i++)await delay(100);
  const captureFrames=process.argv.includes('--sample-only')?[...new Set([0,Math.floor(report.frames*.1),Math.floor(report.frames*.25),Math.floor(report.frames*.5),Math.floor(report.frames*.75),report.frames-1])]:Array.from({length:Math.ceil(report.frames/(30/captureFps))},(_,i)=>i*(30/captureFps));for(const [index,frame] of captureFrames.entries()){const stats=await browser.evaluate('window.draw('+frame+')');maxCalls=Math.max(maxCalls,stats.calls);maxTriangles=Math.max(maxTriangles,stats.triangles);const shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(frames,String(process.argv.includes('--sample-only')?frame:index).padStart(6,'0')+'.png'),Buffer.from(shot.data,'base64'));if(index%50===0)console.log('captured '+index+'/'+captureFrames.length);}
  const disposed=await browser.evaluate('window.finish()');json('webgl.json',{maxCalls,maxTriangles,disposed,errors:browser.errors});if(disposed.geometries||disposed.textures||browser.errors.length)throw Error('WebGL cleanup gate failed');
 }finally{await browser.close();}
 if(process.argv.includes('--sample-only'))return;const file=path.join(out,scenario==='light'?'light-operation.mp4':scenario+'.mp4');cp.execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-framerate',String(captureFps),'-i',path.join(frames,'%06d.png'),'-frames:v',String(captureFrameCount),'-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',file],{stdio:['ignore','inherit','inherit']});
 const probe=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));json('video.json',{sha256:sha256(fs.readFileSync(file)),probe,duration:report.duration});bridge.verify();
}
async function main(){try{if(process.argv.includes('--capture-only'))for(const[file,hash]of Object.entries(JSON.parse(fs.readFileSync(path.join(out,'source-hashes.json'))))){if(sha256(fs.readFileSync(path.join(source,file)))!==hash)throw Error('Source changed since extraction: '+file);}const report=process.argv.includes('--capture-only')?JSON.parse(fs.readFileSync(path.join(out,'timeline.json'))):await extract();restoreTimers();if(!process.argv.includes('--extract-only'))await capture(report);console.log(JSON.stringify({duration:report.duration,frames:report.frames,out}));}finally{restoreTimers();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
