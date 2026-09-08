#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
const fs=require('node:fs'),path=require('node:path');
const {installSourceBridge,openBrowser,delay,sha256}=require('./lib/three-scene-qa.cjs');
const {installNativeHudBridge,browserStyles,browserHelpers}=require('./lib/native-hud-qa.cjs');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'.expo/goal010/theatre-preflight'),output=path.join(root,'.expo/goal010/theatre-hud');
fs.mkdirSync(output,{recursive:true});
const bridge=installSourceBridge(root),context={width:390,height:844,fontScale:1,bindController:false},native=installNativeHudBridge(context);
const THREE=require('three'),RC=require('../src/rendering/firstPerson/runtimeController.ts'),TC=require('../src/rendering/firstPerson/theatreController.ts'),D=require('../src/domain/theatre/definition.ts'),Defaults=require('../src/types/application.ts');
context.bindController=true;
const {FirstPersonScreen}=require('../src/screens/FirstPersonScreen.tsx');
const fixtures=JSON.parse(fs.readFileSync(path.join(directory,'views.json')));
async function main(){
 const records=[];
 for(const [width,height,fontScale]of [[320,568,2],[390,844,1.5],[430,932,1]]){
  Object.assign(context,{width,height,fontScale});
  const c=RC.createController(undefined,false,true,D.THEATRE_CHAPTER_ID);context.controller=c;c.viewport={width,height};
  Object.assign(c.diagnostics,{stage:'ready',rendererOwnership:'live',appActive:true,paused:false,open:false,sceneMode:'chapter'});
  const camera=new THREE.PerspectiveCamera(65,width/height,.08,60);RC.syncCamera(c,camera);context.snapshot=()=>RC.controllerSnapshot(c);
  const hud=await native.mount(FirstPersonScreen,{chapterId:D.THEATRE_CHAPTER_ID,settings:{...Defaults.DEFAULT_SETTINGS,haptics:false},controls:Defaults.DEFAULT_FIRST_PERSON_CONTROLS,onboarding:{schemaVersion:1,tutorialCompleted:true,controlChoiceAcknowledged:true},preferredColor:'neutral',onSettingsChange(){},onControlsChange(){},onCheckpoint(){},onComplete(){},onRestart(){},onExit(){}});
  RC.syncCamera(c,camera);await hud.update();await hud.pressTestID('interact');
  if(c.runtime.theatre.mode!=='light')throw Error('Actual Screen did not enter light mode: '+c.feedbackMessage);
  await hud.update();const fixture=fixtures.find(f=>f.id==='light-initial-'+width);
  records.push({id:'light-'+width,width,height,fontScale,tree:hud.serialize(),fixture:fixture.id,panel:TC.theatreDeviceScreenBounds(c),receiver:fixture.bounds['bounded-projection-receiver'],source:fixture.bounds['movable-point-light']});
  await hud.unmount();
 }
 bridge.verify();fs.writeFileSync(path.join(output,'raw-hosts.json'),JSON.stringify(records));
 const browser=await openBrowser(directory),reports=[];
 try{
  for(let i=0;i<100&&!await browser.evaluate('window.ready===true');i++)await delay(100);
  await browser.evaluate(`(()=>{const style=document.createElement('style');style.textContent=${JSON.stringify(browserStyles)};document.head.append(style);const canvas=document.querySelector('canvas'),root=document.createElement('div');root.style.cssText='position:absolute;inset:0;display:flex;flex-direction:column';document.body.append(root);${browserHelpers}
window.drawHUD=async(record,bottom)=>{root.replaceChildren(hudDOM(record.tree,record.fontScale,canvas));await document.fonts.ready;const scroll=root.querySelector('[data-testid="theatre-device-scroll"]');if(scroll)scroll.scrollTop=bottom?scroll.scrollHeight:0;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));const rect=id=>{const e=root.querySelector('[data-testid="'+id+'"]');return e?hudRect(e):null;};const heading=rect('theatre-device-heading'),controls=scroll?hudRect(scroll):rect('theatre-device-controls');const buttons=[...root.querySelectorAll('[role="button"]')].map(e=>({label:e.dataset.label,...hudRect(e)}));return{heading,controls,pause:rect('pause-control'),scroll:scroll?{height:scroll.scrollHeight,client:scroll.clientHeight,top:scroll.scrollTop}:null,buttons,headingOverlapsReceiver:rectanglesOverlap(heading,record.receiver),controlsOverlapReceiver:rectanglesOverlap(controls,record.receiver),headingOverlapsSource:rectanglesOverlap(heading,record.source),controlsOverlapSource:rectanglesOverlap(controls,record.source)};};})()`);
  for(const r of records){
   await browser.send('Emulation.setDeviceMetricsOverride',{width:r.width,height:r.height,deviceScaleFactor:1,mobile:false});
   await browser.evaluate('window.draw('+JSON.stringify(r.fixture)+')');
   for(const bottom of [false,true]){
    const metrics=await browser.evaluate('window.drawHUD('+JSON.stringify(r)+','+bottom+')');
    const file=r.id+(bottom?'-bottom':'-top')+'.png',shot=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(output,file),Buffer.from(shot.data,'base64'));
    reports.push({id:r.id,width:r.width,height:r.height,fontScale:r.fontScale,file,sha256:sha256(fs.readFileSync(path.join(output,file))),panel:r.panel,receiver:r.receiver,source:r.source,...metrics});
   }
  }
  await browser.evaluate('window.finish()');
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify({boundary:'Actual FirstPersonScreen and TheatreControls; actual Screen enter handler. WebGL reuses current actual TheatreScene extraction. Native Canvas/ready/gesture are stubbed; CSS is not Yoga. Fixed fixture, not App/storage route.',toolHash:sha256(fs.readFileSync(__filename)),sourceHashes:Object.fromEntries(bridge.hashes),errors:browser.errors,reports}));
 }finally{await browser.close();}
 bridge.verify();console.log(JSON.stringify({views:reports.length,output,overlaps:reports.filter(r=>r.headingOverlapsReceiver||r.controlsOverlapReceiver||r.headingOverlapsSource||r.controlsOverlapSource).map(r=>r.file)}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
