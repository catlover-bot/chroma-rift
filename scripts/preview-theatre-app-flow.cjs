#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Actual App/reducer/storage and theatre controller route extraction for QA.
// Native module availability, Canvas/readiness/presentation and audio are stubbed;
// AsyncStorage is isolated in memory. Existing chapter results use explicit
// historical fixtures. Only theatre is solved and walked here. No personal data.
// Run: node scripts/preview-theatre-app-flow.cjs
// Output: .expo/goal010/app-flow/{raw-hosts,report}.json

const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.expo/goal010/app-flow');fs.mkdirSync(out,{recursive:true});
const {installSourceBridge,sha256}=require(path.join(root,'scripts/lib/three-scene-qa.cjs'));
const {installNativeHudBridge}=require(path.join(root,'scripts/lib/native-hud-qa.cjs'));
const bridge=installSourceBridge(root),context={width:390,height:844,fontScale:1.5},native=installNativeHudBridge(context);
const React=require('react'),R=require('react-test-renderer'),THREE=require('three');
const memory=new Map(),writes=[],alerts=[];
const storage={async getItem(k){return memory.get(k)??null;},async setItem(k,v){memory.set(k,v);writes.push({type:'set',key:k,value:v});},async removeItem(k){memory.delete(k);writes.push({type:'remove',key:k});},async multiRemove(keys){for(const key of keys)memory.delete(key);writes.push({type:'remove-many',keys});}};
const load=Module._load;
Module._load=function(name,...args){
 if(name==='@react-native-async-storage/async-storage')return storage;
 if(name==='react-native-gesture-handler')return{GestureHandlerRootView:({children})=>React.createElement(React.Fragment,null,children)};
 if(name==='react-native-worklets')return{scheduleOnRN:fn=>fn()};
 if(name==='expo')return{requireOptionalNativeModule:()=>({})};
 if(name==='react-native'){const actual=load.call(this,name,...args);return{...actual,ActivityIndicator:'View',AccessibilityInfo:{...actual.AccessibilityInfo,isReduceMotionEnabled:async()=>false},Alert:{alert:(title,message,buttons)=>alerts.push({title,message,buttons})}};}
 if(name==='react-native-safe-area-context'){const actual=load.call(this,name,...args);return{...actual,SafeAreaProvider:({children})=>React.createElement(React.Fragment,null,children)};}
 if(name==='@shopify/react-native-skia')return{Canvas:'QASkiaCanvas',Rect:'QASkiaRect',Circle:'QASkiaCircle',Line:'QASkiaLine',vec:(x,y)=>({x,y})};
 if(name.endsWith('/FirstPersonCanvas'))return{FirstPersonCanvas:props=>{
  const {controller,onReady,onSnapshot}=props;
  context.controller=controller;context.snapshotCallback=onSnapshot;
  React.useEffect(()=>{context.camera=new THREE.PerspectiveCamera(65,context.width/context.height,.08,60);RC.syncCamera(controller,context.camera);Object.assign(controller.diagnostics,{stage:'ready',rendererOwnership:'live',appActive:true});onReady();},[controller,onReady]);
  return React.createElement('CanvasPlaceholder');
 }};
 return load.call(this,name,...args);
};
const RC=require(path.join(root,'src/rendering/firstPerson/runtimeController.ts')),TC=require(path.join(root,'src/rendering/firstPerson/theatreController.ts')),D=require(path.join(root,'src/domain/theatre/definition.ts')),L=require(path.join(root,'src/domain/theatre/lightGate.ts'));
const FP=require(path.join(root,'src/domain/firstPerson/index.ts')),Defaults=require(path.join(root,'src/types/application.ts')),Store=require(path.join(root,'src/storage/firstPersonStorage.ts')),AS=require(path.join(root,'src/storage/applicationStorage.ts'));
const {skipQuickSetup}=require(path.join(root,'src/domain/calibration/quickSetup.ts'));
const {vaultCheckpoint}=require(path.join(root,'src/storage/testFixtures/vault.ts')),{originalV2}=require(path.join(root,'src/storage/testFixtures/galleryV2.ts')),{migrateGalleryV2Checkpoint}=require(path.join(root,'src/domain/gallery/index.ts'));
const App=require(path.join(root,'App.tsx')).default,records=[],events=[];
context.snapshot=()=>RC.controllerSnapshot(context.controller);
const flatten=style=>Array.isArray(style)?Object.assign({},...style.map(flatten)):style??{};
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
function primitive(node){if(typeof node==='string')return'';const p=node.props,common=' fill="'+escape(p.color)+'"';if(node.type==='QASkiaRect')return'<rect x="'+p.x+'" y="'+p.y+'" width="'+p.width+'" height="'+p.height+'"'+common+'/>';if(node.type==='QASkiaCircle')return'<circle cx="'+p.cx+'" cy="'+p.cy+'" r="'+p.r+'"'+common+'/>';if(node.type==='QASkiaLine')return'<line x1="'+p.p1.x+'" y1="'+p.p1.y+'" x2="'+p.p2.x+'" y2="'+p.p2.y+'" stroke="'+escape(p.color)+'" stroke-width="'+p.strokeWidth+'"/>';return node.children.map(primitive).join('');}
function serialize(node){if(typeof node==='string')return node;const p=node.props;if(node.type==='QASkiaCanvas'){const svg='<svg xmlns="http://www.w3.org/2000/svg" width="600" height="'+flatten(p.style).height+'">'+node.children.map(primitive).join('')+'</svg>';return{type:'Image',style:{...flatten(p.style),objectFit:'none',objectPosition:'left top'},testID:p.testID,source:'data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64'),children:[]};}const children=node.children.map(serialize).flat().filter(Boolean);if(typeof node.type!=='string')return children;return{type:node.type,style:flatten(typeof p.style==='function'?p.style({pressed:false}):p.style),contentStyle:flatten(p.contentContainerStyle),testID:p.testID,label:p.accessibilityLabel,disabled:!!p.disabled,source:p.source?.uri,children};}
async function settle(){await R.act(async()=>{for(let i=0;i<6;i++)await Promise.resolve();});}
async function press(hud,label,fresh=false){const b=hud.tree.root.findAll(n=>n.type==='Pressable'&&n.props.accessibilityLabel===label)[0];if(!b||b.props.disabled)throw Error('Missing/enabled real App button '+label);await R.act(async()=>fresh?b.props.onAccessibilityAction({nativeEvent:{actionName:'activate'}}):b.props.onPress());await settle();events.push({width:context.width,type:'actual-App-button',label,path:fresh?'explicit-accessibility-activation':'Pressability'});}
function snapshot(hud,id,provenance){records.push({id:id+'-'+context.width,width:context.width,height:context.height,fontScale:context.fontScale,tree:serialize(hud.tree.root),provenance});}
async function setup(width,height,fontScale,kind){
 Object.assign(context,{width,height,fontScale});await Store.resetAllApplicationStorage();memory.clear();alerts.length=0;const app=AS.createDefaultApplication();app.quickSetupResult=skipQuickSetup('2026-09-09T00:00:00Z');app.settings={...app.settings,haptics:false,audio:{...app.settings.audio,enabled:false}};
 await storage.setItem(AS.APPLICATION_STORAGE_KEY,JSON.stringify(app));await storage.setItem(Store.FIRST_PERSON_ONBOARDING_KEY,JSON.stringify({...Defaults.DEFAULT_FIRST_PERSON_ONBOARDING,tutorialCompleted:true,controlChoiceAcknowledged:true}));
 if(kind==='gallery')await storage.setItem(Store.GALLERY_CHECKPOINT_KEY,JSON.stringify(migrateGalleryV2Checkpoint(originalV2('cleared')).checkpoint));
 if(kind==='vault')await storage.setItem(Store.VAULT_CHECKPOINT_KEY,JSON.stringify(vaultCheckpoint('clear')));
 const hud=await native.mount(App,{});await settle();return hud;
}
async function route(hud){
 const c=context.controller,camera=context.camera;c.viewport={width:context.width,height:context.height};
 const trace=[],publish=async()=>{RC.syncCamera(c,camera);await hud.update();};
 function lookAt(target){const p=c.runtime.pose,dx=target.x-p.position.x,dz=target.z-p.position.z,yaw=Math.atan2(-dx,-dz),change=Math.atan2(Math.sin(yaw-p.yaw),Math.cos(yaw-p.yaw));RC.commandController(c,{type:'turn',yaw:change,pitch:Math.atan2(target.y-p.position.y,Math.hypot(dx,dz))-p.pitch});RC.syncCamera(c,camera);}
 async function tick(dt=1/60){RC.advanceController(c,dt,camera);await hud.update();}
 async function walk(x,z){for(let i=0;i<1800;i++){const p=c.runtime.pose.position,d=Math.hypot(x-p.x,z-p.z);if(d<.02||c.runtime.progress.cleared){c.input.forward=0;trace.push({at:[x,z],actual:{...p},phase:c.runtime.theatre.actor.phase,cleared:c.runtime.progress.cleared});return;}lookAt({x,y:p.y,z});c.input.forward=1;const before={...p};await tick(Math.min(1/60,d/FP.MOVE_SPEED));const q=c.runtime.pose.position;if(Math.hypot(q.x-before.x,q.z-before.z)>FP.MOVE_SPEED/60+.001)throw Error('Unexpected caught/teleport on actual east route');}throw Error('Blocked east route '+x+','+z);}
 lookAt(D.THEATRE_LIGHT_FIXTURE.center);await publish();await hud.pressTestID('interact');if(c.runtime.theatre.mode!=='light')throw Error('Light not entered via actual Screen');
 const point=s=>{const h=L.lightHandlePoint(s),f=D.THEATRE_LIGHT_FIXTURE,b=TC.theatreDeviceScreenBounds(c),q=new THREE.Vector3(f.center.x+f.right.x*h.x,f.center.y,f.center.z+f.right.z*h.x).project(camera);return{identifier:17,locationX:(q.x+1)*context.width/2-b.left,locationY:(1-q.y)*context.height/2-b.top};};
 for(const[phase,s]of[['Start',0],['Move',.8],['End',.8]]){const p=point(s);await hud.touch('theatre-device-touch',phase,{touches:phase==='End'?[]:[p],changedTouches:[p],targetTouches:phase==='End'?[]:[p]});}
 await press(hud,'灯りを固定する');if(!c.runtime.progress.theatre.light.accepted)throw Error('Actual commit failed');await press(hud,'探索へ戻る');
 for(const[x,z]of[[2,-2],[2,3],[2,4.6],[2.9,5.5],[2.9,7.6],[2.55,13.8],[2.55,16.7],[0,17.4],[0,19.6],[0,21.3]])await walk(x,z);
 lookAt(D.THEATRE_CURTAIN_FIXTURE.center);await publish();await hud.pressTestID('interact');if(!c.runtime.progress.theatre.curtainAccepted||c.runtime.progress.cleared)throw Error('Curtain accepted/clear invalid');
 for(let i=0;i<70;i++)await tick();if(!c.runtime.progress.theatre.passageSealed||c.runtime.progress.cleared)throw Error('Sealed/completion invalid');
 await walk(0,23.6);await settle();if(!c.runtime.progress.cleared)throw Error('Exit did not clear');const saved=JSON.parse(await storage.getItem(Store.THEATRE_CHECKPOINT_KEY));if(!saved.progress.theatre.completed)throw Error('Actual App did not persist completed callback');
 if(!hud.tree.root.findAll(n=>n.type==='Text'&&n.children.includes('影の映写室から脱出')).length)throw Error('Actual App did not switch to real result');
 events.push({width:context.width,type:'actual-controller-to-App-result',trace,saved,calibrationKept:JSON.parse(await storage.getItem(AS.APPLICATION_STORAGE_KEY)).quickSetupResult!==undefined});
}
async function main(){
 for(const dims of[[320,568,2],[390,844,1.5],[430,932,1]]){
  let hud=await setup(...dims,'gallery'),galleryRaw=await storage.getItem(Store.GALLERY_CHECKPOINT_KEY);
  await hud.pressTestID('review-perception-gallery-v1');await press(hud,'展示室へ入る');snapshot(hud,'gallery-result','Actual App hydration of explicitly seeded historical cleared-gallery fixture; no claim of solving gallery here.');
  await press(hud,'次の章へ：測れない収蔵庫',true);snapshot(hud,'vault-preparation','Actual gallery result fresh activation -> App reducer -> vault preparation.');if(await storage.getItem(Store.GALLERY_CHECKPOINT_KEY)!==galleryRaw)throw Error('Gallery raw changed');await hud.unmount();
  hud=await setup(...dims,'vault');const vaultRaw=await storage.getItem(Store.VAULT_CHECKPOINT_KEY);
  await hud.pressTestID('review-uncanny-vault-v1');await press(hud,'収蔵庫へ入る');snapshot(hud,'vault-result','Actual App hydration of explicitly seeded valid cleared-vault fixture; no claim of solving vault here.');
  await press(hud,'次の章へ：影の映写室',true);snapshot(hud,'theatre-preparation','Actual vault result fresh activation -> App reducer -> theatre preparation.');await press(hud,'映写室へ入る');
  await route(hud);snapshot(hud,'theatre-result','Actual new theatre entry -> Screen drag/explicit commit -> real controller east walk and curtain -> actual exit crossing -> actual App save/reducer -> real FirstPersonResultScreen. Native Canvas/ready/presentation and backend audio stubbed; geometry/navigation/host/save code actual.');
  if(await storage.getItem(Store.VAULT_CHECKPOINT_KEY)!==vaultRaw)throw Error('Vault raw changed');await hud.unmount();
 }
 bridge.verify();fs.writeFileSync(path.join(out,'raw-hosts.json'),JSON.stringify(records));fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({boundary:'Actual App/reducer/chapter storage against in-memory AsyncStorage. Historical gallery/vault completion fixtures are seeded explicitly; current theatre is walked and completed through real Screen/controller. Native module availability, Canvas/readiness/presentation/audio stubbed; no native GPU or timing claim. Host styles require separate browser/native layout verification.',records:records.map(({tree,...r})=>r),events,sourceHashes:Object.fromEntries(bridge.hashes),scriptHash:sha256(fs.readFileSync(__filename))}));console.log(JSON.stringify({records:records.length,events:events.length,out}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
