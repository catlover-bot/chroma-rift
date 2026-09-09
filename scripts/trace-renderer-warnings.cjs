'use strict';
// Read-only source audit and forwarding browser trace. This is not native EXGL.
const fs=require('node:fs'),path=require('node:path');
const {installSourceBridge,openBrowser,sha256,delay}=require('./lib/three-scene-qa.cjs');
const root=process.cwd(),args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?undefined:args[i+1];};
const source=path.resolve(option('--source')||root),out=path.resolve(option('--out')||path.join(root,'.expo/goal010-1/warnings'));
const bridge=installSourceBridge(source),THREE=require('three');
const {createSceneResources}=require(path.join(source,'src/rendering/firstPerson/resources.ts'));
fs.mkdirSync(out,{recursive:true});
function packageVersion(name){return JSON.parse(fs.readFileSync(path.join(root,'node_modules',name,'package.json'),'utf8')).version;}
function evidence(relative,tokens){
 const bytes=fs.readFileSync(path.join(root,relative)),lines=bytes.toString().split('\n');
 return {file:relative,sha256:sha256(bytes),references:lines.flatMap((line,i)=>tokens.some(t=>line.includes(t))?[{line:i+1,code:line.trim()}]:[])};
}
async function main(){
 const r=createSceneResources(false,undefined,true,true,true),g=r.galleryResources,textures=new Map();
 function add(name,texture){if(!texture?.isDataTexture)throw Error('Expected actual DataTexture: '+name);if(!textures.has(texture.uuid))textures.set(texture.uuid,{name,texture});}
 add('legacy-palette',r.texture);r.emblemSurface.textures.forEach((t,i)=>add('emblem-'+i,t));
 add('gallery-shadow-color',g.shadowPanel.map);g.setComparison(true);add('gallery-shadow-neutral',g.shadowPanel.map);
 add('chromatic-color',g.chromaticSurface.material.map);g.chromaticSurface.update(true,'baseline');add('chromatic-neutral',g.chromaticSurface.material.map);
 add('perceptual-hybrid',g.perceptual.hybridTexture);
 const scene=new THREE.Scene(),inventory=[];let i=0;
 for(const {name,texture}of textures.values()){
  const bytes=texture.image.data;let minAlpha=255,maxAlpha=0;
  for(let j=3;j<bytes.length;j+=4){minAlpha=Math.min(minAlpha,bytes[j]);maxAlpha=Math.max(maxAlpha,bytes[j]);}
  inventory.push({name,uuid:texture.uuid,width:texture.image.width,height:texture.image.height,bytes:bytes.byteLength,dataSha256:sha256(bytes),minAlpha,maxAlpha,colorSpace:texture.colorSpace,flipY:texture.flipY,premultiplyAlpha:texture.premultiplyAlpha,unpackAlignment:texture.unpackAlignment,generateMipmaps:texture.generateMipmaps,updateRanges:texture.updateRanges.length});
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(.9,.9),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
  mesh.name=name;mesh.position.set((i%3)-1,1-Math.floor(i/3),0);scene.add(mesh);i++;
 }
 fs.writeFileSync(path.join(out,'texture-scene.json'),JSON.stringify(scene.toJSON()));
 for(const f of ['three.module.js','three.core.js'])fs.copyFileSync(path.join(root,'node_modules/three/build',f),path.join(out,f));
 fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><canvas id="canvas"></canvas><script type="module" src="./trace.js"></script>');
 fs.writeFileSync(path.join(out,'trace.js'),"import * as THREE from './three.module.js';\nconst canvas = document.getElementById('canvas'), gl = canvas.getContext('webgl2', { alpha: false });\nif (!gl) throw Error('WebGL2 unavailable');\nconst calls = [], original = gl.pixelStorei; let phase = 'renderer-creation';\ngl.pixelStorei = function (...args) { calls.push({ phase, pname: args[0], value: args[1], stack: new Error().stack.split('\\n').slice(2,5) }); return Reflect.apply(original, this, args); };\nconst renderer = new THREE.WebGLRenderer({ canvas, context: gl });\nrenderer.setSize(600,600); renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.NoToneMapping;\nconst scene=new THREE.ObjectLoader().parse(await (await fetch('./texture-scene.json')).json());\nconst camera=new THREE.OrthographicCamera(-1.7,1.7,1.7,-1.7,.1,10); camera.position.z=3;\nconst textures=new Map(); scene.traverse(o=>{if(o.material?.map)textures.set(o.material.map.uuid,o.material.map);});\nphase='first-upload'; renderer.render(scene,camera);\nconst first={...renderer.info.memory,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};\nphase='whole-texture-update'; for(const t of textures.values())t.needsUpdate=true; renderer.render(scene,camera);\nconst glError=gl.getError(); phase='dispose'; for(const t of textures.values())t.dispose();\nscene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();}); renderer.renderLists.dispose();\nconst after={...renderer.info.memory}; gl.pixelStorei=original; renderer.dispose();\nwindow.traceReport={calls,first,after,glError,textures:textures.size,restored:gl.pixelStorei===original,renderer:gl.getParameter(gl.RENDERER),version:gl.getParameter(gl.VERSION)};\nwindow.ready=true;");
 const browser=await openBrowser(out);
 try{
  for(let j=0;j<100&&!await browser.evaluate('Boolean(window.ready)');j++){if(browser.errors.length)throw Error(JSON.stringify(browser.errors));await delay(100);}
  const trace=await browser.evaluate('window.traceReport');if(!trace)throw Error('Trace incomplete');
  const names={37440:'UNPACK_FLIP_Y_WEBGL',37441:'UNPACK_PREMULTIPLY_ALPHA_WEBGL',37443:'UNPACK_COLORSPACE_CONVERSION_WEBGL',3317:'UNPACK_ALIGNMENT',3314:'UNPACK_ROW_LENGTH',3316:'UNPACK_SKIP_PIXELS',3315:'UNPACK_SKIP_ROWS'};
  const unique=[...new Map(trace.calls.map(c=>[c.pname+':'+String(c.value),{pname:c.pname,name:names[c.pname]||'OTHER',value:c.value,supportedByInstalledEXGLPixelStorei:c.pname===37440||c.pname===3317}])).values()];
  const report={
   method:'Actual app resource constructors, serialized DataTextures and installed browser WebGLRenderer; one pixelStorei instance wrapper forwards every call unchanged and is restored. Not native EXGL.',
   packages:Object.fromEntries(['three','@react-three/fiber','expo','expo-gl'].map(p=>[p,packageVersion(p)])),
   inventory,trace,unique,sourceHashes:Object.fromEntries(bridge.hashes),
   dependencies:[
    evidence('node_modules/@react-three/fiber/native/dist/react-three-fiber-native.cjs.dev.js',["require('../../dist/events-"]),
    evidence('node_modules/@react-three/fiber/dist/events-b1bdeb1a.cjs.dev.js',['const createStore','new THREE__namespace.Clock()','clock.stop()','clock.start()','clock.elapsedTime','clock.oldTime','clock.getDelta()']),
    evidence('node_modules/three/src/core/Clock.js',['deprecated','warn(']),
    evidence('node_modules/three/src/renderers/webgl/WebGLState.js',['function pixelStorei','parameters[ name ]','gl.pixelStorei( name, value )']),
    evidence('node_modules/three/src/renderers/webgl/WebGLTextures.js',['state.pixelStorei(']),
    evidence('node_modules/expo-gl/common/EXWebGLMethods.cpp',['NATIVE_METHOD(pixelStorei)','case GL_UNPACK_', "doesn't support this parameter yet"]),
   ],
   conclusions:[
    'R3F native entry imports an events module whose root store constructs Three.Clock. Production/ESM use the same design. Separate production scan found no direct app Clock/pixelStorei call.',
    'R3F uses Clock start/stop/getDelta and mutable elapsedTime/oldTime. Timer is not a drop-in substitution.',
    'Browser upload arguments matched against installed EXGL unsupported cases are candidate explanations, not captured native warning parameters.',
    'Audited textures use opaque RGBA, explicit sRGB, false flipY and false premultiplyAlpha. Several sources explicitly reverse rows. Browser output does not prove native orientation/color.',
    'No evidence links warnings to dark corridors. No dependency, GL argument, app warning handler or app runtime is changed.',
   ],
   nativeUnverified:['Exact original native warning arguments','Native warning count/order and owner IDs','iPhone orientation/alpha/color','Native pause/resume delta and presentation'],
   references:['https://metrobundler.dev/docs/configuration/#requirecycleignorepatterns','https://nodejs.org/api/modules.html#cycles','https://threejs.org/docs/pages/Clock.html','https://threejs.org/docs/pages/Timer.html','https://docs.expo.dev/versions/latest/sdk/gl-view/','https://docs.expo.dev/develop/development-builds/use-development-builds/','https://docs.expo.dev/more/expo-cli/'],
  };
  bridge.verify();fs.writeFileSync(path.join(out,'warning-audit.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({textures:inventory.length,unique,memoryBefore:trace.first,memoryAfter:trace.after,glError:trace.glError,restored:trace.restored}));
 }finally{await browser.close();r.dispose();scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
