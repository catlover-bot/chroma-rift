/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import * as THREE from 'three';
import type { ChapterRuntime, WorldGeometry } from '../../domain/firstPerson/types';
import { THEATRE_CURTAIN, THEATRE_CURTAIN_FIXTURE, THEATRE_FLOORS, THEATRE_INSPECTION_FIXTURE, THEATRE_LIGHT_FIXTURE, THEATRE_PROJECTOR, THEATRE_PROJECTOR_FIXTURE, THEATRE_BYPASS_FIXTURE } from '../../domain/theatre/definition';
import { LIGHT_RECEIVER, LIGHT_SPEC, LIGHT_WINDOWS, evaluateLight, lightSource, opticalWorldPoint } from '../../domain/theatre/lightGate';
import { AMES_PROPS } from '../../domain/theatre/perspectiveExhibit';
import { THEATRE_WINDOW_LABELS } from '../../domain/theatre/deviceStatus';
import { THEATRE_STATIC_SOLIDS, getTheatreWorld } from '../../domain/theatre/world';
import { THEATRE_BELLS, THEATRE_SHUTTER } from '../../domain/theatre/environment';
import { GalleryActor } from './GalleryActor';
import { computeSegmentTransform } from './segmentTransform';
import type { SceneResources } from './resources';

type Block = { position: [number,number,number]; scale:[number,number,number] };
function Blocks({ blocks, resources, material, name }: { blocks:readonly Block[]; resources:SceneResources; material:THREE.Material; name:string }) {
  const mesh = useMemo(() => {
    const object = new THREE.InstancedMesh(resources.box,material,blocks.length), transform = new THREE.Object3D();
    for (let i=0;i<blocks.length;i++) { const b=blocks[i]!; transform.position.fromArray(b.position); transform.scale.fromArray(b.scale); transform.updateMatrix(); object.setMatrixAt(i,transform.matrix); }
    object.instanceMatrix.needsUpdate=true; object.computeBoundingSphere(); object.name=name; return object;
  },[blocks,resources.box,material,name]);
  useEffect(()=>()=>mesh.dispose(),[mesh]);
  return <primitive object={mesh} dispose={null} />;
}
const omitted = new Set(['theatre-light-rail-body','theatre-coat-stand','theatre-ames-exhibit-volume','theatre-receiver-body','theatre-bell-a-receiver','theatre-bell-b-receiver']);
const architecture:Block[] = THEATRE_STATIC_SOLIDS.filter(b=>!omitted.has(b.id)).map(b=>({
  position:[(b.min.x+b.max.x)/2,(b.min.y+b.max.y)/2,(b.min.z+b.max.z)/2], scale:[b.max.x-b.min.x,b.max.y-b.min.y,b.max.z-b.min.z],
}));
const floors:Block[] = THEATRE_FLOORS.map(f=>({position:[(f.minX+f.maxX)/2,-.10,(f.minZ+f.maxZ)/2],scale:[f.maxX-f.minX,.2,f.maxZ-f.minZ]}));
const ceilings:Block[] = THEATRE_FLOORS.filter(f=>f.minX>=-4).map(f=>({position:[(f.minX+f.maxX)/2,3.56,(f.minZ+f.maxZ)/2],scale:[f.maxX-f.minX,.12,f.maxZ-f.minZ]}));
const cableCovers:Block[] = [
  { position:[-3.75,.018,1],scale:[.13,.035,5] },{ position:[0,.018,3.5],scale:[7.6,.035,.10] },
  { position:[-3.75,.018,11],scale:[.12,.035,13] },{ position:[0,.018,17.4],scale:[7.6,.035,.12] },
];
const practicalLights:Block[] = [
  { position:[0,2.8,-4.99],scale:[.85,.13,.025] },{ position:[2.0,3.2,3.89],scale:[1.1,.08,.05] },
  { position:[3.88,2.5,10],scale:[.07,.13,.6] },{ position:[-3.85,2.5,16.45],scale:[.07,.13,.4] },
  { position:[0,2.8,24.38],scale:[.9,.13,.035] },
];
// These thin surface trims reveal existing boundaries, without adding collision
// geometry, changing the world, or lighting the optical receiver/Ames surfaces.
const routeWalls = THEATRE_STATIC_SOLIDS.filter(b=>b.kind==='wall' && b.min.y===0 && !b.id.includes('ames-'));
const edgeTrims:Block[] = routeWalls.flatMap(b=>{
  const dx=b.max.x-b.min.x,dz=b.max.z-b.min.z,cx=(b.min.x+b.max.x)/2,cz=(b.min.z+b.max.z)/2;
  return dx>=dz
    ? [b.min.z-.008,b.max.z+.008].map(z=>({position:[cx,.07,z] as [number,number,number],scale:[dx,.06,.016] as [number,number,number]}))
    : [b.min.x-.008,b.max.x+.008].map(x=>({position:[x,.07,cz] as [number,number,number],scale:[.016,.06,dz] as [number,number,number]}));
});
const coverEdges:Block[] = THEATRE_STATIC_SOLIDS.filter(b=>['theatre-central-divider','theatre-crossing-screen'].includes(b.id)).flatMap(b=>
  [b.min.x-.009,b.max.x+.009].flatMap(x=>[b.min.z-.009,b.max.z+.009].map(z=>({
    position:[x,(b.min.y+b.max.y)/2,z] as [number,number,number],scale:[.028,b.max.y-b.min.y,.028] as [number,number,number],
  }))));
const routeMarks:Block[] = [5.3,8.5,12.5,16.8].flatMap(z=>[3.60,3.75].map(x=>({
  position:[x,.008,z] as [number,number,number],scale:[.035,.012,.28] as [number,number,number],
})));
const passageFrames:Block[] = [
  // Tall square control-room doorway; the paired bars repeat on the rear wall.
  {position:[-.385,1.34,18.535],scale:[.035,2.68,.025]},
  {position:[.385,1.34,18.535],scale:[.035,2.68,.025]},
  {position:[0,2.67,18.535],scale:[.805,.035,.025]},
  // Maintenance entrance has a lower, broad lintel and a tool-shaped sign.
  {position:[-5.60,1.25,10.665],scale:[.045,2.5,.025]},
  {position:[-4.80,1.25,10.665],scale:[.045,2.5,.025]},
  {position:[-5.20,2.48,10.665],scale:[.85,.07,.025]},
];
const handleFixtures = [THEATRE_INSPECTION_FIXTURE, THEATRE_BYPASS_FIXTURE, THEATRE_CURTAIN_FIXTURE];
const receiverCenter = opticalWorldPoint({ x:0,y:1.8,z:6 });
const rail = computeSegmentTransform(opticalWorldPoint(lightSource(-1)),opticalWorldPoint(lightSource(1)),.035);
const r = THEATRE_LIGHT_FIXTURE.right, n = THEATRE_LIGHT_FIXTURE.normal;
const handleRotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(r.x,r.y,r.z),new THREE.Vector3(0,1,0),new THREE.Vector3(n.x,n.y,n.z)));
const projectorPosition = THEATRE_PROJECTOR_FIXTURE.center;

export function TheatreScene({ world, runtime, resources, reducedMotion, onFrameError }: {
  world:WorldGeometry; runtime:RefObject<ChapterRuntime>; resources:SceneResources; reducedMotion:boolean; onFrameError?:((error:unknown)=>void)|undefined;
}) {
  const t=resources.theatreResources!, movingLight=useRef<THREE.Group>(null), crank=useRef<THREE.Group>(null), flywheel=useRef<THREE.Group>(null), motorIndicator=useRef<THREE.Mesh>(null), latch=useRef<THREE.Mesh>(null);
  const bellIndicators=useRef<Record<string,THREE.Mesh|null>>({});
  const doors=useRef<Record<string,THREE.Group|null>>({}), windows=useRef<Record<string,THREE.Group|null>>({});
  const gateDefinitions=useMemo(()=>world.solids.filter(s=>s.kind==='door'),[world]);
  useFrame((_,delta)=>{
    try {
      const current=runtime.current, live=current.theatre; if(!live)return;
      t.updateLight(live.rail);
      const source=opticalWorldPoint(lightSource(live.rail)); movingLight.current?.position.set(source.x,source.y,source.z);
      const optical=evaluateLight(live.rail);
      for(const state of optical.windows) { const indicator=windows.current[state.id]; if(indicator) { indicator.getObjectByName('lit')!.visible=state.lit; indicator.getObjectByName('blocked')!.visible=!state.lit; } }
      for(const solid of getTheatreWorld(current).solids) { const door=doors.current[solid.id]; if(door)door.position.y=(solid.min.y+solid.max.y)/2; }
      if(latch.current)latch.current.position.y=2.63+live.lightGateOpen*.15;
      if(crank.current)crank.current.rotation.z=live.projectorAngle;
      if(flywheel.current && !current.paused && live.projectorSeconds>0)flywheel.current.rotation.z+=Math.min(.05,Math.max(0,delta))*(reducedMotion?1.4:4);
      if(motorIndicator.current)motorIndicator.current.material=live.projectorSeconds>0?t.amber:t.dark;
      for(const bell of THEATRE_BELLS){const indicator=bellIndicators.current[bell.instanceId];if(indicator)indicator.material=live.environment.bells[bell.instanceId].cooldown>0?t.amber:t.dark;}
    }catch(error){if(onFrameError)onFrameError(error);else throw error;}
  });
  const source=opticalWorldPoint(lightSource(runtime.current.theatre?.rail??0));
  return <group name="shadow-theatre" dispose={null}>
    <ambientLight intensity={1.15}/><directionalLight intensity={.8} position={[-2,5,1]}/>
    <Blocks name="theatre-collider-architecture" blocks={architecture} resources={resources} material={t.wall}/>
    <Blocks name="theatre-supported-floors" blocks={floors} resources={resources} material={t.floor}/>
    <Blocks name="theatre-ceilings" blocks={ceilings} resources={resources} material={t.wall}/>
    <Blocks name="theatre-floor-cable-covers" blocks={cableCovers} resources={resources} material={t.dark}/>
    <Blocks name="theatre-emergency-practicals" blocks={practicalLights} resources={resources} material={t.amber}/>
    <Blocks name="theatre-wall-floor-edge-trims" blocks={edgeTrims} resources={resources} material={t.trim}/>
    <Blocks name="theatre-cover-end-edges" blocks={coverEdges} resources={resources} material={t.trim}/>
    <Blocks name="theatre-paired-route-marks" blocks={routeMarks} resources={resources} material={t.trim}/>
    <Blocks name="theatre-distinct-passage-frames" blocks={passageFrames} resources={resources} material={t.trim}/>
    {THEATRE_BELLS.map(bell=><group key={bell.instanceId} name={bell.instanceId}>
      <group name={`${bell.instanceId}-panel`} position={[bell.fixture.center.x,bell.fixture.center.y,bell.fixture.center.z]} rotation={[0,Math.atan2(bell.fixture.normal.x,bell.fixture.normal.z),0]}>
        <mesh geometry={resources.box} material={t.dark} scale={[.47,.53,.075]}/>
        <mesh geometry={resources.ring} material={t.amber} position={[0,-.04,-.055]} scale={[.38,.38,1]}/>
        {Array.from({length:bell.number},(_,i)=><mesh key={i} geometry={resources.box} material={t.label} position={[(i-(bell.number-1)/2)*.09,.16,-.055]} scale={[.035,.13,.012]}/>)}
      </group>
      <group name={`${bell.instanceId}-receiver`} position={[bell.receiver.x,bell.receiver.y,bell.receiver.z]}>
        <mesh geometry={resources.box} material={t.metal} scale={[.24,.30,.20]}/>
        <mesh ref={mesh=>{bellIndicators.current[bell.instanceId]=mesh;}} geometry={resources.box} material={t.dark} position={[0,.11,-.11]} scale={[.13,.06,.02]}/>
        {Array.from({length:bell.number},(_,i)=><mesh key={i} geometry={resources.box} material={t.label} position={[(i-(bell.number-1)/2)*.09,-.04,-.11]} scale={[.035,.11,.02]}/>)}
      </group>
      <mesh name={`${bell.instanceId}-wire-up`} geometry={resources.box} material={t.trim} position={[bell.fixture.center.x,2.35,bell.fixture.center.z]} scale={[.025,1.55,.025]}/>
      <mesh name={`${bell.instanceId}-wire-cross`} geometry={resources.box} material={t.trim} position={[(bell.fixture.center.x+bell.receiver.x)/2,3.15,bell.fixture.center.z]} scale={[Math.abs(bell.receiver.x-bell.fixture.center.x),.025,.025]}/>
      <mesh name={`${bell.instanceId}-wire-down`} geometry={resources.box} material={t.trim} position={[bell.receiver.x,2.94,(bell.fixture.center.z+bell.receiver.z)/2]} scale={[.025,.025,Math.abs(bell.receiver.z-bell.fixture.center.z)]}/>
    </group>)}
    {THEATRE_SHUTTER.handles.map((handle,i)=><group key={i} name={`manual-shutter-handle-${i}`} position={[handle.center.x,handle.center.y,handle.center.z]}>
      <mesh geometry={resources.box} material={t.dark} scale={[.54,.70,.08]}/>
      <mesh geometry={resources.box} material={t.amber} position={[0,0,i===0?-.07:.07]} scale={[.34,.13,.13]}/>
    </group>)}
    <group name="control-room-paired-bar-landmark" position={[0,2.10,24.465]}>
      <mesh geometry={resources.box} material={t.dark} scale={[.92,.72,.025]}/>
      {[-.18,.18].map(x=><mesh key={x} geometry={resources.box} material={t.label} position={[x,0,-.018]} scale={[.075,.42,.012]}/>)}
      {[-1,1].map(sign=><mesh key={'slider'+sign} name="control-room-slider-mark" geometry={resources.box} material={t.label} position={[sign*.18,sign*.11,-.02]} scale={[.22,.065,.014]}/>)}
      <mesh geometry={resources.box} material={t.trim} position={[0,-.28,-.018]} scale={[.70,.025,.012]}/>
    </group>
    <group name="maintenance-tool-landmark" position={[-5.20,2.16,10.64]}>
      <mesh geometry={resources.box} material={t.dark} scale={[.48,.47,.025]}/>
      <mesh geometry={resources.ring} material={t.label} position={[-.06,.08,-.018]} scale={[.24,.24,1]}/>
      <mesh geometry={resources.box} material={t.label} position={[.035,-.075,-.018]} rotation={[0,0,Math.PI/4]} scale={[.035,.25,.014]}/>
    </group>
    {gateDefinitions.map(s=><group key={s.id} name={s.id} ref={g=>{doors.current[s.id]=g;}} position={[(s.min.x+s.max.x)/2,(s.min.y+s.max.y)/2,(s.min.z+s.max.z)/2]}>
      <mesh name={s.id+'-physical-surface'} geometry={resources.box} material={s.id==='theatre-fire-curtain'?t.curtain:t.metal} scale={[s.max.x-s.min.x,s.max.y-s.min.y,s.max.z-s.min.z]}/>
      {s.id==='theatre-fire-curtain'?[-1.12,-.84,-.56,-.28,0,.28,.56,.84,1.12].map(x=><mesh key={x} name="curtain-vertical-fold" geometry={resources.box} material={t.curtain} position={[x,0,THEATRE_CURTAIN.depth/2-.005]} scale={[.065,THEATRE_CURTAIN.height,.01]}/>):null}
    </group>)}
    <mesh name="bounded-projection-receiver" geometry={resources.box} material={t.receiver} position={[receiverCenter.x,receiverCenter.y,receiverCenter.z+.04]} scale={[4.8*LIGHT_SPEC.scale,3.6*LIGHT_SPEC.scale,.08]}/>
    <mesh name="actual-coat-occluding-surface" geometry={t.coat} material={t.shadow}/>
    <mesh name="coat-stand-pedestal" geometry={resources.box} material={t.dark} position={[-1.4,.48,1.1]} scale={[.22,.96,.10]}/>
    <mesh name="point-source-projected-opaque-shadow" geometry={t.shadowGeometry} material={t.shadow} frustumCulled={false}/>
    <mesh name="physical-light-rail" geometry={resources.cylinder} material={t.metal} position={rail.position} quaternion={rail.quaternion} scale={rail.scale}/>
    <group ref={movingLight} name="movable-point-light" position={[source.x,source.y,source.z]}>
      <mesh name="light-emitter" geometry={resources.box} material={t.amber} scale={[.075,.075,.025]}/>
      <mesh name="light-housing" geometry={resources.cylinder} material={t.metal} rotation={[Math.PI/2,0,0]} position={[0,0,-.075]} scale={[.12,.13,.12]}/>
      <mesh name="light-drag-handle" geometry={resources.ring} material={t.amber} quaternion={handleRotation} scale={[.41,.41,1]}/>
    </group>
    {LIGHT_WINDOWS.map(window=>{
      const cx=(window.minX+window.maxX)/2,cy=(window.minY+window.maxY)/2, p=opticalWorldPoint({x:cx,y:cy,z:LIGHT_RECEIVER.point.z});
      const w=(window.maxX-window.minX)*LIGHT_SPEC.scale,h=(window.maxY-window.minY)*LIGHT_SPEC.scale;
      return <group key={window.id} name={'receiver-window-'+window.id} position={[p.x,p.y,p.z-.019]}>
        {[-1,1].flatMap(sign=>[
          <mesh key={'h'+sign} name="receiver-frame-outside-sample" geometry={resources.box} material={t.label} position={[0,sign*(h/2+.018),0]} scale={[w+.072,.028,.010]}/>,
          <mesh key={'v'+sign} name="receiver-frame-outside-sample" geometry={resources.box} material={t.label} position={[sign*(w/2+.018),0,0]} scale={[.028,h+.008,.010]}/>,
        ])}
        <group name={'receiver-number-'+THEATRE_WINDOW_LABELS[window.id].number} position={[0,h/2+.22,-.004]}>
          <mesh name="number-backing-outside-sample" geometry={resources.box} material={t.dark} scale={[.22,.29,.012]}/>
          {THEATRE_WINDOW_LABELS[window.id].number===1
            ? <mesh name="number-1" geometry={resources.box} material={t.label} position={[0,0,-.01]} scale={[.028,.21,.006]}/>
            : <group name="number-2">
              {[-.10,0,.10].map(y=><mesh key={'h'+y} geometry={resources.box} material={t.label} position={[0,y,-.01]} scale={[.11,.022,.006]}/>)}
              {[-1,1].map(sign=><mesh key={'v'+sign} geometry={resources.box} material={t.label} position={[-sign*.044,sign*.05,-.01]} scale={[.022,.10,.006]}/>)}
            </group>}
        </group>
        <group name={'receiver-semantic-indicator-'+window.id} ref={g=>{windows.current[window.id]=g;}} position={[0,-.19,-.003]}>
          <mesh name="lit" visible={evaluateLight(runtime.current.theatre?.rail??0).windows.find(s=>s.id===window.id)?.lit??false} geometry={resources.ring} material={t.label} scale={[.24,.24,1]}/>
          <group name="blocked" visible={!(evaluateLight(runtime.current.theatre?.rail??0).windows.find(s=>s.id===window.id)?.lit??false)}>
            <mesh geometry={resources.box} material={t.label} rotation={[0,0,Math.PI/4]} scale={[.14,.022,.006]}/>
            <mesh geometry={resources.box} material={t.label} rotation={[0,0,-Math.PI/4]} scale={[.14,.022,.006]}/>
          </group>
        </group>
      </group>;
    })}
    <mesh name="light-gate-lock" ref={latch} geometry={resources.box} material={t.amber} position={[-1.4,2.63,3.24]} scale={[.35,.07,.05]}/>
    <group name="fixed-distorted-room-exhibit">
      <mesh name="ames-skewed-walls-floor-ceiling" geometry={t.room} material={t.receiver}/>
      <lineSegments name="ames-fixed-structure-and-scale-lines" geometry={t.roomEdges} material={t.line}/>
      <lineSegments name="ames-observation-opening" geometry={t.frameEdges} material={t.line}/>
      {AMES_PROPS.map(p=><mesh key={p.id} name={p.id} geometry={t.prop} material={t.dark} position={[p.position.x,p.position.y,p.position.z]} scale={[1,1,1]}/>)}
    </group>
    {handleFixtures.map((f,i)=><group key={i} name={['inspection-pull-handle','bypass-pull-handle','curtain-pull-handle'][i]!} position={[f.center.x,f.center.y,f.center.z]} rotation={[0,Math.atan2(f.normal.x,f.normal.z),0]}>
      <mesh geometry={resources.box} material={t.amber} scale={[.30,.09,.08]}/>
      <mesh geometry={resources.box} material={t.metal} position={[0,.6,0]} scale={[.024,1.2,.04]}/>
    </group>)}
    <group name="projector-mechanism" rotation={[0,Math.PI,0]} position={[projectorPosition.x,projectorPosition.y,projectorPosition.z]}>
      <group ref={crank} name="projector-crank">
        <mesh geometry={resources.box} material={t.metal} position={[THEATRE_PROJECTOR.crankRadius/2,0,.025]} scale={[THEATRE_PROJECTOR.crankRadius,.035,.04]}/>
        <mesh name="projector-crank-handle" geometry={resources.ring} material={t.amber} position={[THEATRE_PROJECTOR.crankRadius,0,.08]} scale={[.30,.30,1]}/>
      </group>
      <group ref={flywheel} name="projector-flywheel" position={[0,.61,.04]}>
        <mesh geometry={resources.ring} material={t.metal} scale={[.75,.75,1]}/>
        {[0,Math.PI/3,Math.PI*2/3].map(angle=><mesh key={angle} geometry={resources.box} material={t.metal} rotation={[0,0,angle]} scale={[.54,.032,.035]}/>)}
      </group>
      <mesh name="projector-running-lamp" ref={motorIndicator} geometry={resources.box} material={runtime.current.theatre?.projectorSeconds?t.amber:t.dark} position={[.29,.35,.045]} scale={[.10,.10,.035]}/>
    </group>
    <GalleryActor name="theatre-aisle-actor" runtime={runtime} resources={resources} reducedMotion={reducedMotion} onFrameError={onFrameError} actorSource={()=>runtime.current.theatre?.actor}/>
  </group>;
}
