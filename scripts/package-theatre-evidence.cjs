#!/usr/bin/env node
'use strict';
/* global __dirname, __filename */
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {sha256}=require('./lib/three-scene-qa.cjs');
const root=path.resolve(__dirname,'..'),local=path.join(root,'.expo/goal010'),out=path.join(root,'docs/qa-goal010'),written=[];
const read=file=>JSON.parse(fs.readFileSync(path.join(local,file))),bytes=file=>fs.readFileSync(path.join(root,file));
function write(file,data){const target=path.join(out,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(data));written.push(file);}
function copy(from,to){const target=path.join(out,to);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(local,from),target);written.push(to);}
const sources={},laterImportedChanges=[];
function sourceSet(label,map){for(const[file,hash]of Object.entries(map)){const current=sha256(bytes(file));if(current!==hash){if(file!=='src/content/theatreComparisons.ts')throw Error('Visual source changed: '+label+' '+file);laterImportedChanges.push({capture:label,file,captured:hash,current,note:'Imported Notebook module was not opened/rendered by this capture. Later pitch correction affects only the separate 2D Notebook comparison.'});}sources[file]=current;}}
const plans=[
 ['light','light-motion','light-operation',[1,3,6,9,12,14,15,18]],
 ['route-east','motion-route-east','route-east',[0,3,5,8,11,14,16,18.7]],
 ['route-inspect','motion-route-inspect','route-inspect',[5.4,8,10,17,22,24,33.6,35.4,36.8,38]],
 ['capture-retry','motion-capture-retry','capture-retry',[13.4,16.8,17.5,18.5,19.5,20.2,20.8,21.3]],
 ['projector','motion-projector','projector',[0,.5,1.5,2.2,3,4,5.5,7.5]],
 ['projector-control','motion-projector-control','projector-control',[0,.5,1.5,2.2,3,4,5.5,7.5]],
 ['curtain-portrait','motion-curtain-portrait','curtain-portrait',[0,.8,1.1,1.4,1.8,2.15,2.55,5.8]],
];
const dynamics=[];
for(const[id,dir,basename,times]of plans){const timeline=read(dir+'/timeline.json'),webgl=read(dir+'/webgl.json'),video=read(dir+'/video.json');sourceSet(id,read(dir+'/source-hashes.json'));
 if(webgl.disposed.geometries||webgl.disposed.textures||webgl.errors.length)throw Error('WebGL gate failed '+id);
 if(timeline.actorMetrics.maxActorRadius>.44||timeline.actorMetrics.minActorY< -1e-6||timeline.actorMetrics.maxActorY>2.24)throw Error('Actor envelope exceeded '+id);
 const file=dir+'/'+basename+'.mp4',actual=sha256(fs.readFileSync(path.join(local,file)));if(actual!==video.sha256)throw Error('MP4 changed '+id);copy(file,'clips/'+basename+'.mp4');
 const frames=times.map(t=>Math.floor(t*30)),select=frames.map(n=>'eq(n,'+n+')').join('+'),columns=frames.length===10?5:4,contact='images/'+id+'-sequence.png';
 fs.mkdirSync(path.join(out,'images'),{recursive:true});cp.execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-i',path.join(local,file),'-vf',"select='"+select+"',scale=195:422,drawtext=text='%{pts\\:hms}':x=5:y=5:fontsize=12:fontcolor=white:box=1:boxcolor=black@0.7,tile="+columns+'x2:padding=4:margin=4','-frames:v','1',path.join(out,contact)],{stdio:['ignore','inherit','inherit']});written.push(contact);
 dynamics.push({...timeline,id,video:{file:'clips/'+basename+'.mp4',sha256:actual,codec:video.probe.streams[0].codec_name,width:video.probe.streams[0].width,height:video.probe.streams[0].height,frames:Number(video.probe.streams[0].nb_frames),duration:Number(video.probe.format.duration),bytes:Number(video.probe.format.size)},webgl,review:{contactSheet:contact,selectedFrameIndices:frames,selectedSeconds:frames.map(n=>n/30),status:'generated; human inspection is recorded separately in manual-review.json'}});
}
const projector=dynamics.find(x=>x.id==='projector'),control=dynamics.find(x=>x.id==='projector-control');if(projector.initialStateHashes.runtime!==control.initialStateHashes.runtime)throw Error('Projector comparison starts differ');
write('dynamic-visuals.json',{boundary:'Actual Screen/controller/Scene, fixed 60 Hz simulation sampled at 30 Hz; browser software WebGL with CSS host HUD, native Canvas/ready/audio stubbed. OnComplete in these clips is counted but navigation is owned by App; their post-exit retained HUD is not the App result. See app-flow.json for actual App transition and result.',comparisonHashScope:'All runtime fields except native session identifiers and monotonic command lastNowMs (different process origins); physical state, player/actor memory and progress included.',clips:dynamics});
const before=read('acquisition/baseline/report.json'),after=read('acquisition/current/report.json');sourceSet('P0-current',read('acquisition/current/source-hashes.json'));
const slim=r=>({cue:r.cue,button:r.button,panelAccepted:r.panelAccepted,entered:r.entered,enabledButRejected:r.enabledButRejected,acquisition:r.acquisition,reasonShown:r.reasonShown,cameraUnchanged:r.cameraUnchanged,image:r.image,imageHash:r.sha256});
write('acquisition.json',{baselineCommit:'04e481e41e0dc8ab73589e9283a110f6985157fb',baselineArchive:'/tmp/chroma-rift-goal010-baseline-04e481e',boundary:after.boundary,before:{cases:before.cases,enabledButRejected:before.enabledButRejected,drawCalls:before.maxCalls,triangles:before.maxTriangles},after:{cases:after.cases,enabledButRejected:after.enabledButRejected,drawCalls:after.maxCalls,triangles:after.maxTriangles},allCameraUnchanged:after.allCameraUnchanged,cases:after.reports.map((r,i)=>({id:r.id,viewport:[r.width,r.height],fontScale:r.fontScale,pose:r.pose,before:slim(before.reports[i]),after:slim(r)})),baselineSourceHashes:read('acquisition/baseline/source-hashes.json')});
const optics=read('optics/geometry-report.json');sourceSet('optics',optics.sourceHash);write('optics.json',optics);copy('optics/coverage.png','images/coverage.png');
write('hit-targets.json',read('theatre-hit-report.json'));
const preflight=read('theatre-preflight/report.json');sourceSet('preflight',read('theatre-preflight/source-hashes.json'));write('scene-views.json',preflight);
const hud=read('theatre-hud/report.json');sourceSet('HUD',hud.sourceHashes);write('hud-layout.json',hud);
const stages=read('stage-select/report.json');sourceSet('stage-list',read('stage-select/source-hashes.json'));write('stage-list.json',stages);
const app=read('app-flow/report.json');sourceSet('App-flow',app.sourceHashes);write('app-flow.json',app);write('app-layout.json',read('app-flow/layout.json'));
write('curtain-detail.json',read('curtain-detail/report.json'));
const selections=[
 ['acquisition/baseline/length-near-390.png','p0-before-near.png'],['acquisition/current/length-near-390.png','p0-after-near.png'],['acquisition/current/length-far-390.png','p0-after-far.png'],['acquisition/current/length-front-320.png','p0-front-320.png'],
 ['stage-select/new-320-top.png','home-320.png'],['stage-select/resumable-vault-390-top.png','home-resume-390.png'],['stage-select/new-320-select-shadow-theatre-v1.png','theatre-card-320.png'],
 ['theatre-preflight/ames-front-closed-390.png','ames-front.png'],['theatre-preflight/ames-intermediate-closed-390.png','ames-intermediate.png'],['theatre-preflight/ames-side-closed-390.png','ames-side-closed.png'],['theatre-preflight/ames-side-open-390.png','ames-side-open.png'],
 ['theatre-hud/light-320-top.png','light-hud-320-top.png'],['theatre-hud/light-320-bottom.png','light-hud-320-bottom.png'],
 ['curtain-detail/curtain-1002.png','curtain-landscape-open.png'],['curtain-detail/curtain-1014.png','curtain-landscape-lowering.png'],['curtain-detail/curtain-1035.png','curtain-landscape-closed.png'],
 ['motion-curtain-portrait/frames/000030.png','curtain-portrait-open.png'],['motion-curtain-portrait/frames/000042.png','curtain-portrait-lowering.png'],['motion-curtain-portrait/frames/000066.png','curtain-portrait-closed.png'],
];
for(const[from,to]of selections)copy(from,'images/'+to);
for(const id of ['gallery-result-320','vault-preparation-320','vault-result-320','theatre-preparation-320','theatre-result-320','theatre-result-390','theatre-preparation-390'])for(const side of ['top','bottom'])copy('app-flow/'+id+'-'+side+'.png','images/'+id+'-'+side+'.png');
write('source-video-review.json',{...read('video-review/source.json'),probe:read('video-review/probe.json'),observations:read('video-review/observations.json'),repositoryPolicy:'Source MP4 and extracted source frames remain outside Git. This file stores metadata and factual observations only; no realtime full-video/audio/device FPS claim.'});
for(const file of fs.readdirSync(path.join(root,'scripts')).filter(f=>/^(preview-theatre|preview-stage-select|measure-theatre|capture-theatre|package-theatre)/.test(f)))sources['scripts/'+file]=sha256(bytes('scripts/'+file));for(const f of ['scripts/lib/three-scene-qa.cjs','scripts/lib/native-hud-qa.cjs'])sources[f]=sha256(bytes(f));
write('visual-source-hashes.json',{current:sources,importedButUnrenderedLaterChanges:laterImportedChanges,toolVersionNote:'Per-clip toolHash records the producing script. Final script adds the separate curtain-portrait branch after six original clips; existing scenario paths and their captured tool hashes are retained.'});
const files=written.map(file=>{const p=path.join(out,file);return{file,bytes:fs.statSync(p).size,sha256:sha256(fs.readFileSync(p))};});
write('visual-artifact-manifest.json',{packagerHash:sha256(fs.readFileSync(__filename)),files,totalBytes:files.reduce((n,f)=>n+f.bytes,0),rawPolicy:'No raw per-frame JSON, full Scene/HUD trees, private video, node_modules or dist copied. Only bounded generated original QA artifacts and compact records.'});console.log(JSON.stringify({files:files.length,totalBytes:files.reduce((n,f)=>n+f.bytes,0),clips:dynamics.length,frames:dynamics.reduce((n,d)=>n+d.frames,0),maxCalls:Math.max(...dynamics.map(d=>d.webgl.maxCalls)),maxTriangles:Math.max(...dynamics.map(d=>d.webgl.maxTriangles)),out}));
