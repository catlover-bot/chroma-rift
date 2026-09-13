/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { DoubleSide, Frustum, Matrix4, MeshBasicMaterial, Shape, ShapeGeometry, type Group, type Mesh } from 'three';
import type { ChapterRuntime, WorldGeometry } from '../../firstPerson/types';
import { isolationKeyGeometry } from '../isolationKeyGeometry';
import { createPlanarMirror, type OffscreenDraw } from '../../../rendering/firstPerson/planarMirror';
import { GalleryActor } from '../../../rendering/firstPerson/GalleryActor';
import type { SceneResources } from '../../../rendering/firstPerson/resources';
import { FIGURE_CENTER, KEY_CENTER, MIRROR_CENTER, MIRROR_YAW, WINCH_CENTER, grateY } from './definition';
import { isStageSession } from './session';

/** Original symmetric profile. The pale central void is left by the same two
 * fixed silhouettes, rather than toggled after gaze/time or replaced by art. */
function profileGeometry() {
  const face = new Shape();
  face.moveTo(-1.35, -0.95);
  face.lineTo(-0.55, -0.95); face.lineTo(-0.6, -0.64); face.lineTo(-0.36, -0.38);
  face.lineTo(-0.27, -0.16); face.lineTo(-0.49, -0.06); face.lineTo(-0.39, 0.04);
  face.lineTo(-0.57, 0.22); face.lineTo(-0.5, 0.44); face.lineTo(-0.76, 0.75);
  face.lineTo(-1.35, 0.95); face.closePath();
  return new ShapeGeometry(face);
}

/** One flat mirror borrows this area's Canvas. The same actor mesh is rendered
 * once in the scene and appears again optically through the reflection pass. */
export function StageScene({world,resources,runtime,renderOffscreen,onFrameError}:{world:WorldGeometry<string>;resources:SceneResources;runtime:RefObject<ChapterRuntime>;
  renderOffscreen?:OffscreenDraw|undefined;onFrameError?:((error:unknown)=>void)|undefined}){
  const gate=useRef<Mesh>(null),key=useRef<Group>(null),winchKey=useRef<Group>(null),mirrorMesh=useRef<Mesh>(null);
  const keyVisual=useRef<{wasTaken:boolean|null;elapsed:number}>({wasTaken:null,elapsed:0});
  const winchKeyVisual=useRef<{initialized:boolean;travel:number}>({initialized:false,travel:0});
  const mirror=useMemo(()=>createPlanarMirror(),[]);
  const mirrorFrustum=useMemo(()=>new Frustum(),[]),projectionView=useMemo(()=>new Matrix4(),[]);
  const shape=useMemo(()=>profileGeometry(),[]),faceMaterial=useMemo(()=>new MeshBasicMaterial({color:'#bebfb4',side:DoubleSide}),[]);
  const keyShape=useMemo(()=>isolationKeyGeometry(),[]),keyMaterial=useMemo(()=>new MeshBasicMaterial({color:'#edf3e5',side:DoubleSide}),[]);
  useEffect(()=>()=>{shape.dispose();faceMaterial.dispose();keyShape.dispose();keyMaterial.dispose();mirror.dispose();},[shape,faceMaterial,keyShape,keyMaterial,mirror]);
  useFrame((_,delta)=>{
    const raw=runtime.current.stageSession?.value;
    if(!isStageSession(raw))return;
    if(gate.current)gate.current.position.y=grateY(raw.ratchets)+1.75;
    if(key.current){
      const visual=keyVisual.current;
      if(visual.wasTaken===null){visual.wasTaken=raw.keyTaken;visual.elapsed=raw.keyTaken ? .3 : 0;}
      else if(visual.wasTaken!==raw.keyTaken){visual.wasTaken=raw.keyTaken;visual.elapsed=0;}
      if(raw.keyTaken&&!runtime.current.paused)visual.elapsed=Math.min(.3,visual.elapsed+Math.max(0,Math.min(delta,.05)));
      const travel=raw.keyTaken?visual.elapsed/.3:0;
      key.current.visible=!raw.keyTaken||travel<1;
      key.current.position.set(KEY_CENTER.x,KEY_CENTER.y-.16*travel,KEY_CENTER.z-.1-.24*travel);
      key.current.rotation.z=-.25*travel;
    }
    if(winchKey.current){
      const active=raw.keyTaken&&raw.holding==='winch',visual=winchKeyVisual.current;
      if(!visual.initialized){visual.initialized=true;visual.travel=active?1:0;}
      else if(!runtime.current.paused){const step=Math.max(0,Math.min(delta,.05))/.22;
        visual.travel=Math.max(0,Math.min(1,visual.travel+(active?step:-step)));}
      winchKey.current.visible=raw.keyTaken&&(active||visual.travel>0);
      winchKey.current.position.x=WINCH_CENTER.x+.35-.3*visual.travel;
    }
  },-.5);
  useFrame(state=>{
    if(!mirrorMesh.current)return;
    try {
      // Skip an offscreen mirror entirely. The first visible frame draws a new
      // reflection before the main pass, so it never presents stale danger.
      state.camera.updateMatrixWorld(true);
      mirrorMesh.current.updateWorldMatrix(true,false);
      mirrorFrustum.setFromProjectionMatrix(projectionView.multiplyMatrices(state.camera.projectionMatrix,state.camera.matrixWorldInverse));
      if(!mirrorFrustum.intersectsObject(mirrorMesh.current))return;
      if(!renderOffscreen)throw new Error('Mirror scene has no offscreen native Canvas draw');
      mirror.render(state.gl,state.scene,state.camera as import('three').PerspectiveCamera,mirrorMesh.current,renderOffscreen);
    } catch(error) {
      if(onFrameError)onFrameError(error);
      else throw error;
    }
  },-.25);
  return <group name="mirror-corridor-v1" dispose={null}>
    <ambientLight intensity={1.15}/><directionalLight intensity={1.1} position={[2,4,3]}/>
    {world.floors.map(f=><mesh key={f.id} geometry={resources.box} material={resources.floor} position={[(f.minX+f.maxX)/2,-.1,(f.minZ+f.maxZ)/2]} scale={[f.maxX-f.minX,.2,f.maxZ-f.minZ]}/>)}
    {world.solids.filter(s=>s.id!=='mirror-actor-body').map(s=><mesh name={s.id} key={s.id} {...(s.id==='isolation-grate'?{ref:gate}:{})} geometry={resources.box}
      material={s.kind==='door'?resources.door:resources.wall} position={[(s.min.x+s.max.x)/2,(s.min.y+s.max.y)/2,(s.min.z+s.max.z)/2]}
      scale={[s.max.x-s.min.x,s.max.y-s.min.y,s.max.z-s.min.z]}/>)}
    <group name="fixed-figure-ground" position={[FIGURE_CENTER.x,FIGURE_CENTER.y,FIGURE_CENTER.z]} rotation={[0,Math.PI,0]}>
      <mesh geometry={resources.plane} material={resources.dark} scale={[3.1,2.2,1]}/>
      <mesh name="left-profile" geometry={shape} material={faceMaterial} position={[0,0,.02]}/>
      <mesh name="right-profile" geometry={shape} material={faceMaterial} position={[0,0,.02]} scale={[-1,1,1]}/>
    </group>
    <group name="isolation-key" ref={key} position={[KEY_CENTER.x,KEY_CENTER.y,KEY_CENTER.z-.1]}>
      <mesh name="isolation-key-silhouette" geometry={keyShape} material={keyMaterial}/>
      <mesh name="isolation-key-knob" geometry={resources.box} material={resources.trim} position={[0,0,-.025]} scale={[.08,.09,.03]}/>
    </group>
    <group name="winch-key" ref={winchKey} visible={false} position={[WINCH_CENTER.x+.35,WINCH_CENTER.y+.12,WINCH_CENTER.z]} rotation={[0,Math.PI/2,0]}>
      <mesh name="winch-key-silhouette" geometry={keyShape} material={keyMaterial}/>
      <mesh name="winch-key-knob" geometry={resources.box} material={resources.trim} position={[0,0,-.025]} scale={[.08,.09,.03]}/>
    </group>
    <group position={[MIRROR_CENTER.x,MIRROR_CENTER.y,MIRROR_CENTER.z]} rotation={[0,MIRROR_YAW,0]}>
      <mesh name="planar-mirror" ref={mirrorMesh} geometry={resources.plane} material={mirror.material} scale={[1.2,1.2,1]}/>
      <mesh name="mirror-frame-top" geometry={resources.box} material={resources.trim} position={[0,.65,0]} scale={[1.3,.08,.1]}/>
      <mesh name="mirror-frame-bottom" geometry={resources.box} material={resources.trim} position={[0,-.65,0]} scale={[1.3,.08,.1]}/>
      <mesh name="mirror-frame-left" geometry={resources.box} material={resources.trim} position={[-.65,0,0]} scale={[.08,1.3,.1]}/>
      <mesh name="mirror-frame-right" geometry={resources.box} material={resources.trim} position={[.65,0,0]} scale={[.08,1.3,.1]}/>
    </group>
    <mesh name="mirror-landmark" geometry={resources.box} material={resources.neutral} position={[1.05,1.5,14.25]} scale={[.22,.22,.22]}/>
    <mesh name="control-vestibule-floor" geometry={resources.box} material={resources.floor} position={[0,-.1,27.75]} scale={[6,.2,7.5]}/>
    <mesh name="control-vestibule-west" geometry={resources.box} material={resources.wall} position={[-3.08,1.75,27.75]} scale={[.16,3.5,7.5]}/>
    <mesh name="control-vestibule-east" geometry={resources.box} material={resources.wall} position={[3.08,1.75,27.75]} scale={[.16,3.5,7.5]}/>
    <mesh name="control-vestibule-ceiling" geometry={resources.box} material={resources.ceiling} position={[0,3.57,27.75]} scale={[6.2,.14,7.5]}/>
    <mesh name="control-vestibule-end" geometry={resources.box} material={resources.wall} position={[0,1.75,31.5]} scale={[6,3.5,.16]}/>
    <mesh name="control-vestibule-door" geometry={resources.box} material={resources.door} position={[0,1.6,31.38]} scale={[1.5,3.2,.05]}/>
    <mesh name="control-vestibule-door-head" geometry={resources.box} material={resources.trim} position={[0,3.28,31.3]} scale={[1.72,.12,.12]}/>
    <mesh name="control-vestibule-light" geometry={resources.box} material={resources.neutral} position={[0,3.35,27]} scale={[.75,.05,.6]}/>
    <mesh name="control-vestibule-sign" geometry={resources.box} material={resources.device} position={[-2.1,2.2,31.35]} scale={[.8,.25,.035]}/>
    <GalleryActor name="mirror-corridor-actor" runtime={runtime} resources={resources} reducedMotion={false} framePriority={-.4}
      actorSource={()=>{const raw=runtime.current.stageSession?.value;return isStageSession(raw)?raw.actor:undefined;}} onFrameError={onFrameError}/>
    {world.interactables.filter(t=>t.id!=='mirror-corridor-figure'&&t.id!=='mirror-corridor-key'&&t.id!=='mirror-corridor-mirror'&&t.id!=='mirror-corridor-exit').map(t=><mesh key={t.id} name={t.id} geometry={resources.box} material={resources.device} position={[t.center.x,t.center.y,t.center.z]} scale={[.25,.25,.12]}/>)}
  </group>;
}
