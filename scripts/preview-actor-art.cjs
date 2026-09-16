#!/usr/bin/env node
'use strict';
/* global __dirname, __filename, Buffer */
/** Actual baseline/current GalleryActor + shared authoritative poses, rendered
 * with one real software WebGL renderer. The inspection stage is not native
 * scheduling, an AI route, or an iPhone performance/acceptance measurement. */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const {installSourceBridge,mountThree,openBrowser,delay,sha256}=require('./lib/three-scene-qa.cjs');
const root=path.resolve(__dirname,'..'),stage=path.join(root,'.expo/goal014/actor-art'),output=path.join(root,'docs/qa-goal014/actor');
const revision='3632675e5c42ac252cca433a5e6dd45bb028f8c5',fps=24,frames=408;
const write=(file,data)=>fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');
const actorPaths=['src/rendering/firstPerson/GalleryActor.tsx','src/rendering/firstPerson/actorArtResources.ts','src/rendering/firstPerson/actorArtRig.ts','src/rendering/firstPerson/galleryResources.ts'];
function intent(t){if(t<1)return {gait:'idle',maxSpeed:0};if(t<5)return {gait:'patrol',maxSpeed:.65,target:{x:0,y:0,z:-1.5}};if(t<7)return {gait:'notice',maxSpeed:0,desiredHeading:-Math.PI/2};if(t<9)return {gait:'search',maxSpeed:0,desiredHeading:0,lookTarget:{x:-1,y:1.6,z:-4}};if(t<11)return {gait:'pursue',maxSpeed:1.25,target:{x:.8,y:0,z:-1.8}};if(t<11.5)return {gait:'windup',maxSpeed:0};if(t<12.1)return {gait:'attack',maxSpeed:0};if(t<13)return {gait:'recover',maxSpeed:0};return {gait:'idle',maxSpeed:0};}
async function extract(){
  fs.mkdirSync(stage,{recursive:true});fs.mkdirSync(output,{recursive:true});
  // Local immutable source archive, not a branch switch or a second worktree.
  const archive=fs.mkdtempSync(path.join(os.tmpdir(),'chroma-actor-baseline-'));
  cp.execFileSync('tar',['-x','-C',archive],{input:cp.execFileSync('git',['archive',revision,'src','assets'],{cwd:root,maxBuffer:32*1024*1024})});
  fs.symlinkSync(path.join(root,'node_modules'),path.join(archive,'node_modules'),'dir');
  const bridge=installSourceBridge(root),React=require('react'),THREE=require('three');
  const oldActor=require(path.join(archive,'src/rendering/firstPerson/GalleryActor.tsx')).GalleryActor;
  const oldResources=require(path.join(archive,'src/rendering/firstPerson/resources.ts')).createSceneResources;
  const {GalleryActor}=require('../src/rendering/firstPerson/GalleryActor.tsx'),{createSceneResources}=require('../src/rendering/firstPerson/resources.ts');
  const Motion=require(path.join(archive,'src/domain/actorMotion/index.ts'));
  let motion=Motion.createActorMotion({x:0,y:0,z:1.5});const timeline=[];
  for(let frame=0;frame<frames;frame++){const time=frame/fps;if(frame&&time<13)motion=Motion.advanceActorMotion(motion,intent(time),1/fps,()=>true).state;
    timeline.push({motion,visible:true,phase:intent(time).gait,...(time>=13?{shutdownSeconds:time-13}:{})});}
  const variants=[],summary=[];
  for(const low of [false,true])for(const after of [false,true]){
    const resources=(after?createSceneResources:oldResources)(low,null,true),runtime={current:{gallery:{actor:timeline[0]}}};
    const mounted=await mountThree(React.createElement(after?GalleryActor:oldActor,{runtime,resources,reducedMotion:false}),THREE),callbacks=bridge.callbacks.splice(0),group=mounted.objects[0],objects=[];
    group.traverse(o=>objects.push(o));const updates=[],contacts=[],p=new THREE.Vector3(),bounds={minY:Infinity,maxY:0,maxRadius:0,maxEyeError:0,maxStanceSlip:0},prior=new Map();let object;
    for(let frame=0;frame<frames;frame++){
      const source=timeline[frame];runtime.current.gallery.actor=source;for(const cb of callbacks)cb({},1/fps);group.updateMatrixWorld(true);
      if(frame===0)object=group.toJSON();updates.push(objects.map(o=>[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()]));
      group.traverse(o=>{if(!o.isMesh)return;const attr=o.geometry.getAttribute('position');for(let i=0;i<attr.count;i++){
        p.fromBufferAttribute(attr,i).applyMatrix4(o.matrixWorld);bounds.minY=Math.min(bounds.minY,p.y);bounds.maxY=Math.max(bounds.maxY,p.y);
        bounds.maxRadius=Math.max(bounds.maxRadius,Math.hypot(p.x-source.motion.position.x,p.z-source.motion.position.z));}});
      const head=group.getObjectByName('actor-leading-head'),eye=Motion.actorMotionEye(source.motion);
      if(source.shutdownSeconds===undefined){const direction=new THREE.Vector3(0,0,-1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));bounds.maxEyeError=Math.max(bounds.maxEyeError,direction.distanceTo(new THREE.Vector3(eye.direction.x,eye.direction.y,eye.direction.z)));}
      for(const [index,side]of [-1,1].entries()){
        const mesh=group.getObjectByName('actor-planted-foot-'+side),foot=source.motion.feet[index],vertices=[];
        const attr=mesh.geometry.getAttribute('position');for(let i=0;i<attr.count;i++){p.fromBufferAttribute(attr,i).applyMatrix4(mesh.matrixWorld);vertices.push(p.toArray());}
        const old=prior.get(side);if(foot.stance&&old?.stance&&JSON.stringify(foot.anchor)===JSON.stringify(old.anchor))for(let i=0;i<vertices.length;i++)bounds.maxStanceSlip=Math.max(bounds.maxStanceSlip,Math.hypot(...vertices[i].map((v,j)=>v-old.vertices[i][j])));
        prior.set(side,{stance:foot.stance,anchor:foot.anchor,vertices});
      }
      if(frame%24===0)contacts.push({frame,phase:source.phase,feet:source.motion.feet.map(f=>({stance:f.stance,position:f.position}))});
    }
    let triangles=0,meshes=0;group.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.getAttribute('position').count)/3;}});
    const id=(after?'after':'before')+'-'+(low?'low':'standard');variants.push({id,object,objects:objects.map(o=>o.uuid),updates});summary.push({id,triangles,meshes,bounds,contacts});
    await mounted.unmount();resources.dispose();
  }
  bridge.verify();
  const sourceHashes=Object.fromEntries([...bridge.hashes].filter(([p])=>!p.startsWith('../'))),baselineSourceHashes=Object.fromEntries([...bridge.hashes].filter(([p])=>p.startsWith('../')).map(([p,h])=>[path.relative(archive,path.resolve(root,p)),h]));
  const data={fps,frames,revision,timeline,variants};fs.writeFileSync(path.join(stage,'data.json'),JSON.stringify(data));
  write(path.join(output,'actor-art-extraction.json'),{label:'Actual shared body pose extraction; native scheduling and device rendering not tested',baselineRevision:revision,sourceHead:cp.execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes,baselineSourceHashes,actorSourceHashes:Object.fromEntries(actorPaths.map(p=>[p,sha256(fs.readFileSync(path.join(root,p)))])),sourceArchiveScope:'src and assets from baseline Git commit; current installed node_modules shared; actual baseline/current component and resource factories',fps,frames,seconds:frames/fps,sameAuthoritativeTimelineForAllVariants:true,timelineSha256:sha256(JSON.stringify(timeline)),dataSha256:sha256(fs.readFileSync(path.join(stage,'data.json'))),summary});
  fs.rmSync(archive,{recursive:true,force:true});
}
function viewer(){
  for(const file of ['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',file),path.join(stage,file));
  fs.writeFileSync(path.join(stage,'index.html'),`<!doctype html><html><body style="margin:0;background:#333d3a"><script type="module">
import * as T from './three.module.js';
const data=await(await fetch('data.json')).json(),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1100,850);const output=document.createElement('canvas');output.width=1100;output.height=900;document.body.append(output);const ctx=output.getContext('2d');
const scene=new T.Scene();scene.background=new T.Color('#333d3a');const ambient=new T.AmbientLight('#d6dacc',1.3),key=new T.DirectionalLight('#ffead0',2.3),rim=new T.DirectionalLight('#b1c2c8',1);key.position.set(-3,5,-3);rim.position.set(2,3,4);scene.add(ambient,key,rim);
const floor=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardMaterial({color:'#59625a',roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.006;scene.add(floor);
const warmCamera=new T.PerspectiveCamera(43,1,.05,40);warmCamera.position.set(0,1,-4);warmCamera.lookAt(0,0,0);renderer.render(scene,warmCamera);const warmRendererTextures=renderer.info.memory.textures;
const variants=data.variants.map(v=>{const root=new T.ObjectLoader().parse(v.object);scene.add(root);return{...v,root,nodes:v.objects.map(uuid=>root.getObjectByProperty('uuid',uuid))};});const camera=new T.PerspectiveCamera(43,550/850,.05,40);
window.renderActor=(frame,low=false,angle=0,turntable=false)=>{const stats=[];renderer.setScissorTest(true);const started=performance.now();for(let pane=0;pane<2;pane++){
 const variant=variants.find(v=>v.id===(pane?'after':'before')+'-'+(low?'low':'standard'));for(const v of variants)v.root.visible=v===variant;
 variant.nodes.forEach((node,i)=>{const u=variant.updates[frame][i];node.position.fromArray(u);node.quaternion.fromArray(u,3);node.scale.fromArray(u,7);});
 const focus=turntable?1.5:.1,distance=turntable?4:6.2;camera.position.set(Math.sin(angle)*distance,1.35,focus-Math.cos(angle)*distance);camera.lookAt(0,1.12,focus);renderer.setViewport(pane*550,0,550,850);renderer.setScissor(pane*550,0,550,850);renderer.info.reset();renderer.render(scene,camera);stats.push({calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});}
 const error=renderer.getContext().getError();ctx.fillStyle='#1b2421';ctx.fillRect(0,0,1100,900);ctx.drawImage(renderer.domElement,0,50);ctx.fillStyle='#f0ece0';ctx.font='18px sans-serif';ctx.fillText('Before · 3632675',18,22);ctx.fillText('After · Goal014 '+(low?'low':'standard'),568,22);ctx.font='14px sans-serif';ctx.fillText((frame/data.fps).toFixed(2)+' s · '+(frame>=312?'hands → shoulders → head / stopped':data.timeline[frame].phase)+' · identical root / camera / lighting',18,43);
 return {image:output.toDataURL('image/png'),frame,low,stats,error,jsRenderMilliseconds:performance.now()-started,geometries:renderer.info.memory.geometries,textures:renderer.info.memory.textures};};
window.disposeActor=()=>{const g=new Set(),m=new Set();scene.traverse(o=>{if(o.geometry)g.add(o.geometry);for(const x of Array.isArray(o.material)?o.material:o.material?[o.material]:[])m.add(x);});g.forEach(x=>x.dispose());m.forEach(x=>x.dispose());scene.clear();renderer.renderLists.dispose();const memory={...renderer.info.memory,warmRendererTextures,textureScope:'Installed Three0.185 DFG_LUT is renderer/module-owned; actor has no texture maps'};renderer.dispose();renderer.forceContextLoss();return memory;};window.ready=true;
</script></body></html>`);
}
async function render(){
  viewer();const metadata=JSON.parse(fs.readFileSync(path.join(output,'actor-art-extraction.json')));if(sha256(fs.readFileSync(path.join(stage,'data.json')))!==metadata.dataSha256)throw new Error('Extracted pose data changed');
  const browser=await openBrowser(stage),results=[],artifacts=[];
  try{for(let i=0;i<150&&!await browser.evaluate('window.ready===true');i++)await delay(100);
    if(!await browser.evaluate('window.ready===true'))throw new Error('Actor viewer did not initialize');
    for(const low of [false,true]){
      const quality=low?'low':'standard',directory=path.join(stage,quality);fs.mkdirSync(directory,{recursive:true});
      for(const [name,angle]of [['front',0],['quarter',.65],['side',Math.PI/2],['back',Math.PI]]){
        const r=await browser.evaluate('window.renderActor(0,'+low+','+angle+',true)');const file=path.join(output,'turntable-'+quality+'-'+name+'.png');fs.writeFileSync(file,Buffer.from(r.image.split(',')[1],'base64'));artifacts.push({file:path.relative(root,file),sha256:sha256(fs.readFileSync(file))});}
      const quick=process.argv.includes('--quick'),selected=quick?[0,24,96,120,156,192,240,264,276,288,311,312,317,329,341,351,407]:Array.from({length:frames},(_,i)=>i);
      for(const frame of selected){const r=await browser.evaluate('window.renderActor('+frame+','+low+',.2,false)');fs.writeFileSync(path.join(directory,String(frame).padStart(6,'0')+'.png'),Buffer.from(r.image.split(',')[1],'base64'));delete r.image;results.push(r);}
      if(!quick){const movie=path.join(output,'motion-'+quality+'.mp4');cp.execFileSync('ffmpeg',['-nostdin','-hide_banner','-loglevel','error','-y','-framerate',String(fps),'-i',path.join(directory,'%06d.png'),'-c:v','libx264','-preset','medium','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',movie]);const probe=JSON.parse(cp.execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',movie],{encoding:'utf8'}));artifacts.push({file:path.relative(root,movie),sha256:sha256(fs.readFileSync(movie)),probe});}
    }
    const disposed=await browser.evaluate('window.disposeActor()');
    for(const [p,hash]of Object.entries(metadata.actorSourceHashes))if(sha256(fs.readFileSync(path.join(root,p)))!==hash)throw new Error('Actor source changed during QA: '+p);
    const times=results.map(r=>r.jsRenderMilliseconds).sort((a,b)=>a-b),checks={actualSharedBody:true,sameAuthoritativePose:true,zeroGlErrors:results.every(r=>r.error===0),zeroBrowserErrors:browser.errors.length===0,disposedGeometries:disposed.geometries===0,noActorTextureGrowth:disposed.textures===disposed.warmRendererTextures};
    write(path.join(output,'actor-art-webgl.json'),{label:'Software WebGL body inspection, not native frame timing or device acceptance',toolSha256:sha256(fs.readFileSync(__filename)),extractionSha256:sha256(fs.readFileSync(path.join(output,'actor-art-extraction.json'))),checks,completeVideo:!process.argv.includes('--quick'),poseFramesPerQuality:results.length/2,artifacts,drawScope:'Each pane is one body + one inspection floor. Before and after draw counts are separate; no mirror/shadow pass in this inspection.',jsRenderMilliseconds:{p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],max:times.at(-1),scope:'CPU wall time issuing both pane renders on Chromium SwiftShader; not GPU time, native FPS or presentation intervals'},results,disposed,browserErrors:browser.errors,deviceAcceptance:'PENDING',RELEASE_READY:false});
    if(Object.values(checks).some(v=>!v))throw new Error('Actor browser checks failed');console.log(JSON.stringify({checks,frames:results.length,artifacts:artifacts.length,disposed}));
  }finally{await browser.close();}
}
(async()=>{if(!process.argv.includes('--render-only'))await extract();if(!process.argv.includes('--extract-only'))await render();})().catch(e=>{console.error(e);process.exitCode=1;});
