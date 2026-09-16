#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
// Actual scene-owned plaques, safe static viewing fixtures. Not a route replay.
const fs=require('node:fs'),path=require('node:path');
require('./lib/qa-native-metadata.cjs');
globalThis.__DEV__=false;
const root=path.resolve(__dirname,'..'),out=path.join(root,'.expo/goal014/facility-signs');
const {installSourceBridge,mountThree,openBrowser,delay,sha256}=require(path.join(root,'scripts/lib/three-scene-qa.cjs'));
const bridge=installSourceBridge(root),React=require(path.join(root,'node_modules/react')),THREE=require(path.join(root,'node_modules/three'));
const RC=require(path.join(root,'src/rendering/firstPerson/runtimeController.ts'));
const {ChapterScene}=require(path.join(root,'src/rendering/firstPerson/ChapterScene.tsx'));
const {createSceneResources}=require(path.join(root,'src/rendering/firstPerson/resources.ts'));
const {isSafePose}=require(path.join(root,'src/domain/firstPerson/geometry.ts'));
const cases=[
['gallery','perception-gallery-v1',[0,1.6,2],[0,1.6,6],['gallery']],
['vault','uncanny-vault-v1',[-1.15,1.6,-.7],[-1.15,1.6,3.9],['vault']],
['theatre','shadow-theatre-v1',[-1.4,1.6,-4.3],[-1.4,1.6,3.3],['theatre']],
['mirror','mirror-corridor-v1',[0,1.6,-2.5],[0,1.6,.4],['mirror']],
['practice','mirror-corridor-v1',[-2.16,1.6,6.35],[-2.225,1.75,8.32],['practice']],
['winch','mirror-corridor-v1',[-2.45,1.6,9.6],[-2.2,2.76,10.7],['winch']],
['departure','departure-control-v1',[-3.75,1.6,10.8],[-3.7,2.2,13.84],['departure']],
['console-key','departure-control-v1',[-3.75,1.6,11.6],[-3.67,.96,12.76],['key']],
['console-bell','departure-control-v1',[-3.75,1.6,11.6],[-2.95,.92,12.43],['bell']],
['console-isolation','departure-control-v1',[-3.75,1.6,11.6],[-2.77,1.46,13.15],['isolation']],
['console-power','departure-control-v1',[-3.75,1.6,11.6],[-3.45,1.32,13.4],['power']],
];
async function main(){
fs.mkdirSync(out,{recursive:true});const reports=[];
for(const [id,stage,position,look,signs] of cases){
 const c=RC.createController(undefined,false,true,stage),world=RC.worldForController(c);
 if(!isSafePose({position:{x:position[0],y:position[1],z:position[2]},yaw:0,pitch:0},world))throw Error(id+': unsafe fixture pose');
 const resources=createSceneResources(false,null,true,stage==='uncanny-vault-v1',stage==='shadow-theatre-v1'),runtime={current:c.runtime};
 const mounted=await mountThree(React.createElement(ChapterScene,{world,progress:c.runtime.progress,runtime,resources,assist:false,reducedMotion:false,lowQuality:false,lab:false,renderOffscreen:()=>{},onFrameError:e=>{throw e;}}),THREE);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#171a1b');const camera=new THREE.PerspectiveCamera(65,390/844,.08,60);
 camera.name='qa-camera';camera.position.fromArray(position);camera.lookAt(...look);scene.add(camera);mounted.objects.forEach(o=>scene.add(o));
 // The scene fixture has no native framebuffer; leave mirror on a fresh fallback.
 for(const fn of bridge.callbacks.splice(0))if(!fn.toString().includes('mirror.render'))fn({},0);
 scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);
 const measurements=[];
 for(const sign of signs){const mesh=scene.getObjectByName(sign+'-facility-label');if(!(mesh instanceof THREE.Mesh)||!(mesh.material.map instanceof THREE.DataTexture))throw Error(sign+': missing owned raster');
  const corners=[];for(const x of [-.5,.5])for(const y of [-.5,.5]){const p=new THREE.Vector3(x,y,0).applyMatrix4(mesh.matrixWorld).project(camera);corners.push({x:p.x,y:p.y,z:p.z});}
  const visible=corners.every(p=>Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>=0&&p.z<=1);
  if(!visible)throw Error(sign+': cropped '+JSON.stringify(corners));
  const target=mesh.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(0,0,1).transformDirection(mesh.matrixWorld);
  if(normal.dot(camera.position.clone().sub(target))<=0)throw Error(sign+': back-facing text');
  measurements.push({id:sign,texture:[mesh.material.map.image.width,mesh.material.map.image.height],corners,frontFacing:true,fullyInFrame:true});}
 fs.writeFileSync(path.join(out,id+'.json'),JSON.stringify(scene.toJSON()));reports.push({id,stage,position,look,signs:measurements});
 await mounted.unmount();resources.dispose();RC.retireController(c);
}
bridge.verify();for(const name of ['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',name),path.join(out,name));
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><style>body{margin:0}</style><script type="module" src="./viewer.js"></script>');
fs.writeFileSync(path.join(out,'viewer.js'),`import * as THREE from './three.module.js';const r=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(390,844);r.outputColorSpace=THREE.SRGBColorSpace;document.body.append(r.domElement);window.draw=async id=>{const s=await new THREE.ObjectLoader().parseAsync(await(await fetch(id+'.json')).json());r.render(s,s.getObjectByName('qa-camera'));return {calls:r.info.render.calls,triangles:r.info.render.triangles,error:r.getContext().getError()}};window.ready=true;`);
const browser=await openBrowser(out);try{await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});for(let i=0;i<100&&!await browser.evaluate('window.ready===true');i++)await delay(100);
 for(const report of reports){report.metrics=await browser.evaluate(`window.draw(${JSON.stringify(report.id)})`);if(report.metrics.error)throw Error('WebGL error');const data=await browser.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(path.join(out,report.id+'.png'),Buffer.from(data.data,'base64'));report.sha256=sha256(fs.readFileSync(path.join(out,report.id+'.png')));}
 if(browser.errors.length)throw Error(JSON.stringify(browser.errors));}finally{await browser.close();}
bridge.verify();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({boundary:'Real ChapterScene, manually placed safe camera poses, standard quality, current live source. Static SwiftShader sign visibility check; not native GL, actual controller play, reflection, audio, or device performance acceptance. No historical before claim.',reports,sourceHashes:Object.fromEntries(bridge.hashes),toolHash:sha256(fs.readFileSync(__filename))},null,2)+'\n');console.log(JSON.stringify({views:reports.length,signs:reports.reduce((n,r)=>n+r.signs.length,0),sourceCount:bridge.hashes.size}));}
main().catch(e=>{console.error(e);process.exitCode=1;});
