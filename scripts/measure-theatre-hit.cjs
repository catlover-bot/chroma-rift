#!/usr/bin/env node
'use strict';
/* global __dirname, __filename */
const fs=require('node:fs'),path=require('node:path');
const {installSourceBridge,sha256}=require('./lib/three-scene-qa.cjs');
const root=path.resolve(__dirname,'..'),bridge=installSourceBridge(root),THREE=require('three');
const RC=require('../src/rendering/firstPerson/runtimeController.ts'),TC=require('../src/rendering/firstPerson/theatreController.ts'),D=require('../src/domain/theatre/definition.ts'),L=require('../src/domain/theatre/lightGate.ts');
function probe(device,width,height,depth,value,angle,radius){
 const c=RC.createController(undefined,false,true,D.THEATRE_CHAPTER_ID);
 const f=device==='light'?D.THEATRE_LIGHT_FIXTURE:D.THEATRE_PROJECTOR_FIXTURE;
 c.runtime.pose={position:device==='light'?{x:-1.4,y:1.6,z:depth}:{x:f.center.x,y:1.6,z:depth},yaw:Math.PI,pitch:0};
 if(device==='projector'){c.runtime.progress.theatre.light.accepted=true;c.runtime.theatre.lightGateOpen=1;c.runtime.theatre.projectorAngle=value;}
 else c.runtime.theatre.rail=value;
 Object.assign(c.diagnostics,{stage:'ready',rendererOwnership:'live',appActive:true,paused:false,open:false,sceneMode:'chapter'});
 c.viewport={width,height};const camera=new THREE.PerspectiveCamera(65,width/height,.08,60);RC.syncCamera(c,camera);
 const entered=TC.theatreAction(c,{type:device==='light'?'enter-light':'enter-projector'});
 if(!entered)return{entered:false,reason:TC.theatreDeviceAcquisition(c,device)};
 const local=device==='light'?L.lightHandlePoint(value):{x:D.THEATRE_PROJECTOR.crankRadius*Math.cos(value),y:D.THEATRE_PROJECTOR.crankRadius*Math.sin(value)};
 const p=new THREE.Vector3(f.center.x+f.right.x*local.x,f.center.y+local.y,f.center.z+f.right.z*local.x).project(camera);
 const center={x:(p.x+1)*width/2,y:(1-p.y)*height/2},point={x:center.x+radius*Math.cos(angle),y:center.y+radius*Math.sin(angle)};
 const accepted=TC.theatrePointer(c,'start',17,point,width,height),before=device==='light'?c.runtime.theatre.rail:c.runtime.theatre.projectorAngle;
 if(accepted)TC.theatrePointer(c,'move',17,point,width,height);
 const after=device==='light'?c.runtime.theatre.rail:c.runtime.theatre.projectorAngle;
 const b=TC.theatreDeviceScreenBounds(c);
 return{entered,accepted,noGrabJump:Math.abs(after-value)<1e-10&&Math.abs(before-value)<1e-10,touchLayerContains:!!b&&point.x>=b.left&&point.x<=b.right&&point.y>=b.top&&point.y<=b.bottom};
}
function main(){
 const failures=[],groups=[];let count=0;
 for(const device of ['light','projector'])for(const [width,height]of [[320,568],[390,844],[430,932]])for(const depth of device==='light'?[-4.3,-4.7]:[13.8]){
  let accepted22=0,rejected23=0,grabsStable=0;
  for(const value of device==='light'?[-1,0,1]:[0,Math.PI/2,Math.PI,Math.PI*1.5])for(let i=0;i<8;i++)for(const radius of [22,23]){
   const r=probe(device,width,height,depth,value,i*Math.PI/4,radius);count++;
   const expected=radius===22;
   if(r.entered&&r.accepted===expected&&(!expected||r.noGrabJump&&r.touchLayerContains)){if(expected){accepted22++;grabsStable++;}else rejected23++;}
   else failures.push({device,width,height,depth,value,direction:i,radius,...r});
  }
  groups.push({device,viewport:[width,height],depth,accepted22,rejected23,grabsStable});
 }
 bridge.verify();const report={boundary:'Actual theatrePointer entry hit tests on the gameplay camera and shared fixture plane. Native TouchLayer extent is checked numerically. No actual finger/device test; optical truth parameters and camera are not modified by the probe.',cases:count,groups,failures,sourceHashes:Object.fromEntries(bridge.hashes),toolHash:sha256(fs.readFileSync(__filename))};
 const file=path.join(root,'.expo/goal010/theatre-hit-report.json');fs.writeFileSync(file,JSON.stringify(report));
 console.log(JSON.stringify({cases:count,failures:failures.length,groups,file}));if(failures.length)process.exitCode=1;
}
main();
