/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { DoubleSide, Frustum, Matrix4, MeshBasicMaterial, Shape, ShapeGeometry, type Group, type Mesh } from 'three';
import type { ChapterRuntime, WorldGeometry } from '../../firstPerson/types';
import { ISOLATION_KEY_PROFILE, isolationKeyGeometry } from '../isolationKeyGeometry';
import { createPlanarMirror, type OffscreenDraw } from '../../../rendering/firstPerson/planarMirror';
import { GalleryActor } from '../../../rendering/firstPerson/GalleryActor';
import type { SceneResources } from '../../../rendering/firstPerson/resources';
import { FIGURE_CENTER, KEY_CENTER, MIRROR_CENTER, MIRROR_YAW, PRACTICE_CENTER, WINCH_CENTER, GATE_Z } from './definition';
import { isStageSession } from './session';
import { FacilityFloor, FacilityPlaque } from '../../../rendering/firstPerson/FacilityDetails';
import { Cable, WinchModel } from '../../../rendering/firstPerson/MechanicalDevices';

/** Original symmetric profile. The pale central void is left by the same two
 * fixed silhouettes, rather than toggled after gaze/time or replaced by art. */
function profileGeometry() {
  const face = new Shape();
  face.moveTo(-.69, -.35);
  ISOLATION_KEY_PROFILE.forEach(([x,y]) => face.lineTo(x,y));
  face.lineTo(-.69,.35); face.closePath();
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
  const shape=useMemo(()=>profileGeometry(),[]),faceMaterial=useMemo(()=>new MeshBasicMaterial({color:'#bebfb4',side:DoubleSide,toneMapped:false,fog:false}),[]);
  const keyShape=useMemo(()=>isolationKeyGeometry(),[]),keyMaterial=useMemo(()=>new MeshBasicMaterial({color:'#edf3e5',side:DoubleSide,toneMapped:false,fog:false}),[]);
  useEffect(()=>()=>{shape.dispose();faceMaterial.dispose();keyShape.dispose();keyMaterial.dispose();mirror.dispose();},[shape,faceMaterial,keyShape,keyMaterial,mirror]);
  useFrame((_,delta)=>{
    const raw=runtime.current.stageSession?.value;
    if(!isStageSession(raw))return;
    if(gate.current)gate.current.position.y=raw.gateLift+1.75;
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
      const reflected=mirror.render(state.gl,state.scene,state.camera as import('three').PerspectiveCamera,mirrorMesh.current,renderOffscreen);
      // A skipped reflection can be behind the plane, even while the mesh is
      // inside the main camera frustum. Do not show the previous danger frame.
      mirrorMesh.current.material=reflected?mirror.material:mirror.fallbackMaterial;
    } catch(error) {
      if(onFrameError)onFrameError(error);
      else throw error;
    }
  },-.25);
  return <group name="mirror-corridor-v1" dispose={null}>
    <FacilityPlaque id="mirror" resources={resources} position={[0,2.65,.3]} yaw={Math.PI} width={1.5}/>
    <FacilityPlaque id="practice" resources={resources} position={[-2.225,2.12,8.32]} yaw={Math.PI} width={1.05}/>
    <FacilityPlaque id="winch" resources={resources} position={[-2.2,2.76,10.7]} yaw={Math.PI} width={.8}/>
    <ambientLight intensity={.72}/><directionalLight intensity={1.55} position={[2,4,3]}/><directionalLight intensity={.32} position={[-3,3,18]}/>
    {world.floors.map(f=><FacilityFloor key={f.id} resources={resources} x={(f.minX+f.maxX)/2} z={(f.minZ+f.maxZ)/2} width={f.maxX-f.minX} depth={f.maxZ-f.minZ}/>)}
    {world.solids.filter(s=>!['mirror-actor-body','practice-bench-core','winch-core'].includes(s.id)).map(s=><mesh name={s.id} key={s.id} {...(s.id==='isolation-grate'?{ref:gate}:{})} geometry={resources.box}
      material={s.kind==='door'?resources.door:resources.wall} position={[(s.min.x+s.max.x)/2,(s.min.y+s.max.y)/2,(s.min.z+s.max.z)/2]}
      scale={[s.max.x-s.min.x,s.max.y-s.min.y,s.max.z-s.min.z]}/>)}
    <group name="fixed-figure-ground" position={[0,KEY_CENTER.y,FIGURE_CENTER.z]} rotation={[0,Math.PI,0]}>
      <mesh geometry={resources.plane} material={resources.dark} scale={[1.6,1.02,1]}/>
      <mesh name="left-profile" geometry={shape} material={faceMaterial} position={[0,0,.02]}/>
      <mesh name="right-profile" geometry={shape} material={faceMaterial} position={[0,0,.02]} scale={[-1,1,1]}/>
    </group>
    <group name="isolation-key" ref={key} position={[KEY_CENTER.x,KEY_CENTER.y,KEY_CENTER.z-.1]}>
      <mesh name="isolation-key-silhouette" geometry={keyShape} material={keyMaterial}/>
      <mesh name="isolation-key-knob" geometry={resources.box} material={resources.trim} position={[0,0,-.025]} scale={[.08,.09,.03]}/>
    </group>
    <group name="winch-key" ref={winchKey} visible={false} position={[WINCH_CENTER.x+.35,WINCH_CENTER.y-.65,WINCH_CENTER.z+.15]} rotation={[0,Math.PI/2,0]} scale={[.32,.32,.32]}>
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
    <mesh name="practice-waymark" geometry={resources.box} material={resources.neutral} position={[-2.94,1.25,5.25]} scale={[.04,.3,.13]}/>
    <mesh name="practice-lever-marker" geometry={resources.box} material={resources.neutral} position={[-2.45,1.72,7.5]} scale={[.16,.055,.08]}/>
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
    {[true,false].map(practice => <group key={String(practice)} position={[
      practice ? PRACTICE_CENTER.x : WINCH_CENTER.x, practice ? PRACTICE_CENTER.y : WINCH_CENTER.y,
      practice ? PRACTICE_CENTER.z : WINCH_CENTER.z]}>
      <WinchModel resources={resources} practice={practice} state={() => {
        const raw=runtime.current.stageSession?.value;
        return isStageSession(raw) ? { holding:raw.holding===(practice?'practice':'winch'),
          progress: practice ? raw.holdSeconds / .55 : raw.holdSeconds / 2, ratchets:raw.ratchets,
          complete:practice?raw.practiced:raw.ratchets===3 } : {holding:false,progress:0,ratchets:0,complete:false};
      }}/>
    </group>)}
    <Cable resources={resources} points={[
      {x:WINCH_CENTER.x-.22,y:WINCH_CENTER.y+.93,z:WINCH_CENTER.z},
      {x:-2.85,y:3.15,z:WINCH_CENTER.z},{x:-2.85,y:3.15,z:GATE_Z},
      {x:0,y:3.15,z:GATE_Z},{x:0,y:3.45,z:GATE_Z},
    ]}/>
    <mesh name="winch-worklight" geometry={resources.art.beveled} material={resources.art.glow} position={[-2.7,2.8,10.8]} scale={[.12,.045,.62]}/>
    <mesh name="practice-worklight" geometry={resources.art.beveled} material={resources.art.glow} position={[-2.88,2.45,7.5]} scale={[.08,.045,.42]}/>

  </group>;
}
