'use strict';
/* global __dirname, __filename */
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {openBrowser,delay}=require('./lib/three-scene-qa.cjs');
const root=path.resolve(__dirname,'..'),source=path.join(root,'.expo/goal013/mirror-natural'),out=path.join(root,'.expo/goal013-1/mirror-sweep');
const sha=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const natural=JSON.parse(fs.readFileSync(path.join(source,'report.json')));
if(natural.sourceHashes['src/domain/stages/mirror-corridor-v1/scene.tsx']!==sha(path.join(root,'src/domain/stages/mirror-corridor-v1/scene.tsx'))||natural.sourceHashes['src/rendering/firstPerson/planarMirror.ts']!==sha(path.join(root,'src/rendering/firstPerson/planarMirror.ts')))throw Error('Run qa-mirror-natural.cjs first: scene source changed');
fs.mkdirSync(out,{recursive:true});
for(const name of ['scene.json','three.module.js','three.core.js','planarMirror.js'])fs.copyFileSync(path.join(source,name),path.join(out,name));
fs.writeFileSync(path.join(out,'index.html'),`<!doctype html><meta charset="utf-8"><script type="module">
import * as THREE from './three.module.js';import {createPlanarMirror} from './planarMirror.js';
const scene=await new THREE.ObjectLoader().parseAsync(await(await fetch('./scene.json')).json());
const camera=scene.getObjectByProperty('type','PerspectiveCamera');const surface=scene.getObjectByName('planar-mirror');
const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:false});renderer.setSize(390,844);renderer.setPixelRatio(1);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.NoToneMapping;document.body.append(renderer.domElement);
const mirror=createPlanarMirror(),frustum=new THREE.Frustum(),projectionView=new THREE.Matrix4();
const xs=[-3.2,-2.8,-2.65,-2.58,-2.45,-1.8],zs=[7.5,10,11.3,11.4,11.5,13],offsets=[-1.2,-.3,0,.3,1.2],pitches=[-.2,0,.2];
window.runGroup=i=>{const result={samples:0,visible:0,reflected:0,backing:0,fboIncomplete:0,glErrors:[],exceptions:[],nonfinite:0,maxCalls:0};
 for(const z of zs)for(const offset of offsets)for(const pitch of pitches){const x=xs[i],dx=-2.65-x,dz=11.4-z,yaw=Math.atan2(-dx,-dz)+offset;
  camera.position.set(x,1.6,z);camera.rotation.set(pitch,yaw,0,'YXZ');camera.aspect=390/844;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
  frustum.setFromProjectionMatrix(projectionView.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));const visible=frustum.intersectsObject(surface);let reflected=false;
  try{if(visible){result.visible++;reflected=mirror.render(renderer,scene,camera,surface,(r,s,c)=>{if(result.reflected===0&&r.getContext().checkFramebufferStatus(r.getContext().FRAMEBUFFER)!==r.getContext().FRAMEBUFFER_COMPLETE)result.fboIncomplete++;r.render(s,c);});}
   surface.material=reflected?mirror.material:mirror.fallbackMaterial;renderer.render(scene,camera);
   const gl=renderer.getContext(),code=gl.getError();if(code!==gl.NO_ERROR)result.glErrors.push({x,z,offset,pitch,code});
   if(reflected&&!([...mirror.camera.projectionMatrix.elements,...mirror.camera.matrixWorld.elements].every(Number.isFinite)))result.nonfinite++;
   result.reflected+=Number(reflected);result.backing+=Number(!reflected);result.maxCalls=Math.max(result.maxCalls,renderer.info.render.calls);
  }catch(error){result.exceptions.push({x,z,offset,pitch,message:String(error?.message??error)});}result.samples++;
 }return result;};window.finish=()=>{mirror.dispose();renderer.dispose();};window.ready=true;
</script>`);
(async()=>{const browser=await openBrowser(out);try{await browser.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});for(let i=0;i<100&&!await browser.evaluate('window.ready===true');i++)await delay(100);if(!await browser.evaluate('window.ready===true'))throw Error('viewer not ready');const groups=[];for(let i=0;i<6;i++)groups.push(await browser.evaluate(`window.runGroup(${i})`));await browser.evaluate('window.finish()');const total={samples:0,visible:0,reflected:0,backing:0,fboIncomplete:0,nonfinite:0,maxCalls:0,glErrors:[],exceptions:[]};for(const g of groups){for(const k of ['samples','visible','reflected','backing','fboIncomplete','nonfinite'])total[k]+=g[k];total.maxCalls=Math.max(total.maxCalls,g.maxCalls);total.glErrors.push(...g.glErrors);total.exceptions.push(...g.exceptions);}const report={scope:'Serialized actual mirror StageScene and actual planarMirror.ts in Chromium SwiftShader; authored camera grid around practice/winch/mirror, not controller route, native EXGL or iPhone.',grid:{xs:[-3.2,-2.8,-2.65,-2.58,-2.45,-1.8],zs:[7.5,10,11.3,11.4,11.5,13],yawOffsets:[-1.2,-.3,0,.3,1.2],pitches:[-.2,0,.2]},total,browserErrors:browser.errors,toolSha256:sha(__filename),naturalReportSha256:sha(path.join(source,'report.json')),sourceHashes:{scene:sha(path.join(source,'scene.json')),mirror:sha(path.join(root,'src/rendering/firstPerson/planarMirror.ts')),stage:sha(path.join(root,'src/domain/stages/mirror-corridor-v1/scene.tsx'))}};fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(total));if(total.glErrors.length||total.exceptions.length||total.nonfinite||total.fboIncomplete||browser.errors.length)process.exitCode=1;}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1});
