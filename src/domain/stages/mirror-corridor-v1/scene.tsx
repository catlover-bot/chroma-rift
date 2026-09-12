/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { DoubleSide, MeshBasicMaterial, Shape, ShapeGeometry, type Mesh } from 'three';
import type { ChapterRuntime, WorldGeometry } from '../../firstPerson/types';
import { createPlanarMirror, type OffscreenDraw } from '../../../rendering/firstPerson/planarMirror';
import { GalleryActor } from '../../../rendering/firstPerson/GalleryActor';
import type { SceneResources } from '../../../rendering/firstPerson/resources';
import { FIGURE_CENTER, KEY_CENTER, MIRROR_CENTER, grateY } from './definition';
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
  const gate=useRef<Mesh>(null),key=useRef<Mesh>(null),mirrorMesh=useRef<Mesh>(null);
  const mirror=useMemo(()=>createPlanarMirror(),[]);
  const shape=useMemo(()=>profileGeometry(),[]),faceMaterial=useMemo(()=>new MeshBasicMaterial({color:'#bebfb4',side:DoubleSide}),[]);
  useEffect(()=>()=>{shape.dispose();faceMaterial.dispose();mirror.dispose();},[shape,faceMaterial,mirror]);
  useFrame(()=>{
    const raw=runtime.current.stageSession?.value;
    if(!isStageSession(raw))return;
    if(gate.current)gate.current.position.y=grateY(raw.ratchets)+1.75;
    if(key.current)key.current.visible=!raw.keyTaken;
  },-.5);
  useFrame(state=>{
    if(!mirrorMesh.current)return;
    try {
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
      <mesh geometry={resources.plane} material={resources.dark} scale={[3.1,2.2,1]} position={[0,0,.01]}/>
      <mesh name="left-profile" geometry={shape} material={faceMaterial}/>
      <mesh name="right-profile" geometry={shape} material={faceMaterial} scale={[-1,1,1]}/>
    </group>
    <mesh name="isolation-key" ref={key} geometry={resources.box} material={resources.neutral} position={[KEY_CENTER.x,KEY_CENTER.y,KEY_CENTER.z-.1]} scale={[.16,.42,.08]}/>
    <group position={[MIRROR_CENTER.x,MIRROR_CENTER.y,MIRROR_CENTER.z]} rotation={[0,-Math.PI/3,0]}>
      <mesh name="planar-mirror" ref={mirrorMesh} geometry={resources.plane} material={mirror.material} scale={[1.7,2,1]}/>
      <mesh name="mirror-frame-top" geometry={resources.box} material={resources.trim} position={[0,1.06,0]} scale={[1.85,.11,.12]}/>
      <mesh name="mirror-frame-bottom" geometry={resources.box} material={resources.trim} position={[0,-1.06,0]} scale={[1.85,.11,.12]}/>
      <mesh name="mirror-frame-left" geometry={resources.box} material={resources.trim} position={[-.91,0,0]} scale={[.11,2.1,.12]}/>
      <mesh name="mirror-frame-right" geometry={resources.box} material={resources.trim} position={[.91,0,0]} scale={[.11,2.1,.12]}/>
    </group>
    <mesh name="mirror-landmark" geometry={resources.box} material={resources.neutral} position={[1.05,1.5,14.25]} scale={[.22,.22,.22]}/>
    <GalleryActor name="mirror-corridor-actor" runtime={runtime} resources={resources} reducedMotion={false} framePriority={-.4}
      actorSource={()=>{const raw=runtime.current.stageSession?.value;return isStageSession(raw)?raw.actor:undefined;}} onFrameError={onFrameError}/>
    {world.interactables.filter(t=>t.id!=='mirror-corridor-figure'&&t.id!=='mirror-corridor-key').map(t=><mesh key={t.id} geometry={resources.box} material={resources.device} position={[t.center.x,t.center.y,t.center.z]} scale={[.25,.25,.12]}/>)}
  </group>;
}
