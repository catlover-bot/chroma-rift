/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { DoubleSide, MeshBasicMaterial, type Group, type Mesh } from 'three';
import type { ChapterRuntime, WorldGeometry } from '../../firstPerson/types';
import { isolationKeyGeometry } from '../isolationKeyGeometry';
import { GalleryActor } from '../../../rendering/firstPerson/GalleryActor';
import type { SceneResources } from '../../../rendering/firstPerson/resources';
import { actorFullyContained, BELL_RECEIVER, CONTAINMENT, CONTAINMENT_DOOR_Z, CONTROL_TARGETS, STAFF_DOOR_Z } from './definition';
import { isStageSession } from './session';
import { Cable, GuardedLever, PhysicalBell } from '../../../rendering/firstPerson/MechanicalDevices';
import { FacilityFloor, FacilityPlaque } from '../../../rendering/firstPerson/FacilityDetails';
import { CONTAINMENT_DOOR_ORIGIN, CONTAINMENT_DOOR_PARTS, containmentDoorBottom } from './containmentDoor';

const KEY_INSERT_SECONDS = .2;
// Controls remain physical objects after their interaction targets deactivate.
// The door/reopen commands share the same authored panel.


/** Uses the same Canvas and actor body as the earlier areas. The remote bell,
 * observation window, two physical doors and short outdoor threshold remain
 * in the authored world rather than a separate completion overlay. */
export function StageScene({ world, resources, runtime, onFrameError }: { world: WorldGeometry<string>;
  resources: SceneResources; runtime: RefObject<ChapterRuntime>; onFrameError?: ((error: unknown) => void) | undefined }) {
  const containmentDoor = useRef<Group>(null), staffDoor = useRef<Group>(null), receiver = useRef<Group>(null);
  const isolationLever = useRef<Group>(null), powerLever = useRef<Group>(null), statusSign = useRef<Mesh>(null);
  const key = useRef<Group>(null), attendance2 = useRef<Group>(null), attendance1 = useRef<Group>(null), attendance0 = useRef<Group>(null);
  const keyVisual = useRef<{ wasInstalled: boolean | null; elapsed: number }>({ wasInstalled: null, elapsed: 0 });
  const glass = useMemo(() => new MeshBasicMaterial({ color: '#9ac5cc', transparent: true, opacity: .2, depthWrite: false }), []);
  const outdoorSky = useMemo(() => new MeshBasicMaterial({ color: '#b6c7c6', side: DoubleSide, fog: false, toneMapped: false }), []);
  const keyShape = useMemo(() => isolationKeyGeometry(), []);
  const keyMaterial = useMemo(() => new MeshBasicMaterial({ color: '#edf3e5', side: DoubleSide, toneMapped:false, fog:false }), []);
  useEffect(() => () => { glass.dispose(); outdoorSky.dispose(); keyShape.dispose(); keyMaterial.dispose(); }, [glass, outdoorSky, keyShape, keyMaterial]);
  useFrame((_, delta) => {
    try {
      const raw = runtime.current.stageSession?.value;
      if (!isStageSession(raw)) return;
      if (containmentDoor.current) containmentDoor.current.position.y = containmentDoorBottom(raw.doorProgress) + CONTAINMENT_DOOR_ORIGIN.y;
      if (staffDoor.current) staffDoor.current.position.y = raw.staffDoorProgress * 3.6 + 1.75;
      const isolationPivot=isolationLever.current?.getObjectByName('actuator-pivot');
      if (isolationPivot) isolationPivot.rotation.x = raw.doorProgress > 0 ? -.65 : .5;
      const powerPivot=powerLever.current?.getObjectByName('actuator-pivot');
      if (powerPivot) powerPivot.rotation.x = raw.stopped ? -.65 : .5;
      if (statusSign.current) statusSign.current.material = resources.facilitySign(raw.isolated ? 'isolated' : actorFullyContained(raw.actor.motion.position) ? 'contained' : 'waiting');
      if (key.current) {
        const visual = keyVisual.current;
        if (visual.wasInstalled === null) { visual.wasInstalled = raw.keyInstalled; visual.elapsed = raw.keyInstalled ? KEY_INSERT_SECONDS : 0; }
        else if (visual.wasInstalled !== raw.keyInstalled) { visual.wasInstalled = raw.keyInstalled; visual.elapsed = 0; }
        if (raw.keyInstalled && !runtime.current.paused) visual.elapsed = Math.min(KEY_INSERT_SECONDS, visual.elapsed + Math.max(0, Math.min(delta, .05)));
        key.current.visible = raw.keyInstalled;
        key.current.position.y = CONTROL_TARGETS.key.y + .2 * (1 - visual.elapsed / KEY_INSERT_SECONDS);
      }
      if (receiver.current) {
        receiver.current.rotation.z = raw.bellCooldown > 5.5 ? Math.sin((6-raw.bellCooldown)*35)*.12 : 0;
      }
      if (attendance2.current) attendance2.current.visible = !raw.stopped;
      if (attendance1.current) attendance1.current.visible = raw.stopped && !raw.cleared;
      if (attendance0.current) attendance0.current.visible = raw.cleared;
    } catch (error) { if (onFrameError) onFrameError(error); else throw error; }
  }, -.5);
  const segment = (x: number, y: number, horizontal: boolean) =>
    <mesh geometry={resources.box} material={resources.neutral} position={[x, y, 0]} scale={horizontal ? [.28, .045, .035] : [.045, .24, .035]} />;
  const digit = (value: 0 | 1 | 2, x: number) => <group position={[x, 0, 0]}>
    {(value === 0 || value === 2) && segment(0, .27, true)}
    {(value === 0 || value === 2) && segment(0, -.27, true)}
    {value === 2 && segment(0, 0, true)}
    {value === 0 && segment(-.15, .14, false)}
    {value === 0 || value === 1 || value === 2 ? segment(.15, .14, false) : null}
    {value === 0 || value === 1 ? segment(.15, -.14, false) : null}
    {(value === 0 || value === 2) && segment(-.15, -.14, false)}
  </group>;
  return <group name="departure-control-v1" dispose={null}>
    <ambientLight intensity={.75}/><directionalLight intensity={1.35} position={[-2,4,6]}/><directionalLight intensity={.4} position={[3,4,21]}/>
    {world.floors.map(f => <FacilityFloor key={f.id} resources={resources} x={(f.minX+f.maxX)/2} z={(f.minZ+f.maxZ)/2}
      width={f.maxX-f.minX} depth={f.maxZ-f.minZ} outdoor={f.id==='outdoor-paving'}/>)}
    {world.solids.filter(s => !['departure-actor-body','containment-door','staff-door'].includes(s.id) && !s.id.startsWith('containment-door-part-')).map(s => <mesh name={s.id} key={s.id}
      geometry={s.id==='control-console'?resources.art.beveled:resources.box} material={s.opaque === false ? glass : s.id==='control-console'?resources.art.enamel:resources.wall}
      position={[(s.min.x+s.max.x)/2,(s.min.y+s.max.y)/2,(s.min.z+s.max.z)/2]}
      scale={[s.max.x-s.min.x,s.max.y-s.min.y,s.max.z-s.min.z]}/>)}
    <group name="containment-door" ref={containmentDoor} position={[CONTAINMENT_DOOR_ORIGIN.x,
      (world.solids.find(solid => solid.id === 'containment-door')?.min.y ?? containmentDoorBottom(0)) + CONTAINMENT_DOOR_ORIGIN.y,
      CONTAINMENT_DOOR_ORIGIN.z]}>
      {CONTAINMENT_DOOR_PARTS.map(part => <mesh name={part.id} key={part.id}
        geometry={part.surface === 'glass' ? resources.box : resources.art.beveled}
        material={part.surface === 'glass' ? glass : part.surface === 'steel' ? resources.art.enamel : resources.art[part.surface]}
        position={part.center} scale={part.size}/>)}
    </group>
    <group name="staff-door" ref={staffDoor} position={[-3.7,1.75,13.99]}>
      <mesh geometry={resources.art.beveled} material={resources.art.enamel} scale={[.92,3.5,.18]}/>
      <mesh name="staff-door-pushbar" geometry={resources.art.beveled} material={resources.art.brass} position={[0,-.25,-.16]} scale={[.65,.07,.085]}/>
      {[-1.1,1.1].map(y => <mesh key={y} geometry={resources.cylinder} material={resources.art.metal} position={[-.42,y,-.1]} scale={[.035,.18,.035]}/>)}
    </group>
    <Cable resources={resources} material={resources.art.metal} width={.045} points={[{x:-3.13,y:.9,z:12.95},{x:-3.55,y:1.05,z:12.95}]}/>
    <mesh name="power-lever-pedestal" geometry={resources.art.beveled} material={resources.art.enamel} position={[-3.18,1.265,13.46]} scale={[.22,.54,.24]}/>
    <mesh name="bell-plinth" geometry={resources.art.beveled} material={resources.art.enamel} position={[-2.72,1.025,12.72]} scale={[.42,.11,.38]}/>
    <mesh name="isolation-lever-plinth" geometry={resources.art.beveled} material={resources.art.enamel} position={[-2.72,1.065,13.18]} scale={[.35,.15,.37]}/>
    <group name="shaped-key-socket" position={[CONTROL_TARGETS.key.x,CONTROL_TARGETS.key.y,CONTROL_TARGETS.key.z]} rotation={[-Math.PI/2,0,0]} scale={[.55,.55,.55]}>
      <mesh geometry={resources.art.beveled} material={resources.art.metal} scale={[.74,.9,.08]}/>
      <mesh name="matching-key-recess" geometry={keyShape} material={resources.dark} position={[0,0,.046]}/>
      {[-.31,.31].map(x => <mesh key={x} geometry={resources.art.beveled} material={resources.art.brass} position={[x,0,.08]} scale={[.045,.58,.08]}/>)}
    </group>
    <group name="installed-key" ref={key} visible={false} position={[CONTROL_TARGETS.key.x,CONTROL_TARGETS.key.y,CONTROL_TARGETS.key.z]} rotation={[-Math.PI/2,0,0]} scale={[.55,.55,.55]}>
      <mesh name="installed-key-silhouette" geometry={keyShape} material={keyMaterial} position={[0,0,.05]}/>
      <mesh name="installed-key-knob" geometry={resources.art.beveled} material={resources.art.brass} position={[0,0,.095]} scale={[.08,.09,.055]}/>
    </group>
    <mesh name="procedure-reading-stand" geometry={resources.art.beveled} material={resources.art.timber} position={[-3.15,1.05,13.08]} scale={[.45,.12,.54]}/>
    <group name="procedure-diagram" position={[CONTROL_TARGETS.procedure.x,CONTROL_TARGETS.procedure.y,CONTROL_TARGETS.procedure.z]} rotation={[-Math.PI/2,0,0]}>
      <mesh geometry={resources.art.beveled} material={resources.art.paper} scale={[.43,.52,.025]}/>
      {[0,1,2,3].map(i => <group key={i} position={[-.15+i*.1,.07,.022]}>
        <mesh geometry={resources.ring} material={resources.dark} scale={[.08,.08,.08]}/>
        {i<3&&<mesh geometry={resources.box} material={resources.dark} position={[.05,0,0]} scale={[.04,.008,.006]}/>}
        <mesh geometry={resources.box} material={resources.dark} position={[0,-.1,0]} scale={[.065,.012,.006]}/>
      </group>)}
    </group>
    <FacilityPlaque id="key" resources={resources} position={[-3.67,.96,12.76]} yaw={-2.1} width={.52}/>
    <FacilityPlaque id="bell" resources={resources} position={[-2.95,.92,12.43]} yaw={-2.1} width={.50}/>
    <FacilityPlaque id="isolation" resources={resources} position={[-2.77,1.46,13.15]} yaw={-2.1} width={.45}/>
    <FacilityPlaque id="power" resources={resources} position={[-3.45,1.32,13.4]} yaw={-2.1} width={.60}/>
    <group position={[CONTROL_TARGETS.bell.x,CONTROL_TARGETS.bell.y,CONTROL_TARGETS.bell.z]}><PhysicalBell resources={resources} name="containment-call-bell"/></group>
    <group ref={isolationLever} position={[CONTROL_TARGETS.isolation.x,CONTROL_TARGETS.isolation.y,CONTROL_TARGETS.isolation.z]}><GuardedLever resources={resources}/></group>
    <group ref={powerLever} position={[CONTROL_TARGETS.power.x,CONTROL_TARGETS.power.y,CONTROL_TARGETS.power.z]}><GuardedLever resources={resources} power/></group>
    <Cable name="isolation-lever-to-door-conduit" resources={resources} width={.032} material={resources.art.metal}
      points={[CONTROL_TARGETS.isolation,{x:CONTROL_TARGETS.isolation.x,y:1.08,z:CONTROL_TARGETS.isolation.z},
        {x:-2.55,y:1.08,z:13.18},{x:-2.55,y:3.4,z:13.18},{x:2.55,y:3.4,z:13.18},{x:2.55,y:3.4,z:CONTAINMENT_DOOR_Z}]}/>
    <group name="power-disconnect-cabinet" position={[CONTROL_TARGETS.power.x,CONTROL_TARGETS.power.y-.08,CONTROL_TARGETS.power.z]}>
      <mesh name="disconnect-backing" geometry={resources.art.beveled} material={resources.art.enamel} position={[0,0,.08]} scale={[.42,.20,.38]}/>
      {[-1,1].map(side => <mesh key={side} name="disconnect-insulator" geometry={resources.cylinder} material={resources.art.paper}
        position={[side*.105,.11,.08]} scale={[.045,.09,.045]}/>)}
      <mesh name="disconnect-terminal-bridge" geometry={resources.art.beveled} material={resources.art.brass} position={[0,.16,.08]} scale={[.27,.035,.05]}/>
    </group>
    <Cable resources={resources} width={.022} points={[CONTROL_TARGETS.bell,{x:-2.57,y:1.05,z:12.72},{x:-2.57,y:3.05,z:12.72},{x:2.45,y:3.05,z:12.72},{x:2.45,y:3.05,z:18.1},BELL_RECEIVER]}/>
    <group name="containment-bell-receiver" ref={receiver} position={[BELL_RECEIVER.x,BELL_RECEIVER.y,BELL_RECEIVER.z]} rotation={[Math.PI,0,0]}>
      <mesh name="receiver-cast-bell" geometry={resources.art.bell} material={resources.art.brass}/>
      <mesh geometry={resources.cylinder} material={resources.art.metal} position={[0,.15,0]} scale={[.025,.24,.025]}/>
    </group>
    {[CONTAINMENT.minX,CONTAINMENT.maxX].map(x => <group key={x}>{Array.from({length:9},(_,i)=><mesh key={i} name="containment-floor-dash" geometry={resources.box} material={resources.art.marking}
      position={[x,.012,CONTAINMENT.minZ+.22+i*.56]} scale={[.075,.02,.31]}/>)}</group>)}
    {[CONTAINMENT.minZ,CONTAINMENT.maxZ].map(z => <mesh key={z} geometry={resources.box} material={resources.art.marking} position={[2.55,.012,z]} scale={[3.5,.02,.07]}/>)}
    <mesh name="containment-status" ref={statusSign} geometry={resources.plane} material={resources.facilitySign('waiting')} position={[2.55,3.06,14.97]} rotation={[0,-2.1,0]} scale={[1.8,.34,1]}/>
    <mesh name="containment-sign" geometry={resources.plane} material={resources.facilitySign('containment')} position={[2.55,3.4,14.97]} rotation={[0,-2.1,0]} scale={[1.8,.34,1]}/>
    <mesh name="staff-exit-sign" geometry={resources.plane} material={resources.facilitySign('outside')} position={[-3.7,2.9,13.86]} rotation={[0,Math.PI,0]} scale={[.85,.16,1]}/>
    <mesh name="procedure-order-sign" geometry={resources.plane} material={resources.facilitySign('procedure')} position={[-3.04,1.08,12.55]} rotation={[-1.25,0,Math.PI]} scale={[1.02,.19,1]}/>
    <mesh name="console-work-light" geometry={resources.art.beveled} material={resources.art.glow} position={[-2.59,2.5,13.05]} scale={[.08,.08,.9]}/>
    <group name="attendance-display" position={[-2.59,2.35,13.38]} rotation={[0,-Math.PI/2,0]} scale={[.72,.72,.72]}>
      {digit(0,-.38)}
      <group ref={attendance2}>{digit(2,.25)}</group>
      <group ref={attendance1} visible={false}>{digit(1,.25)}</group>
      <group ref={attendance0} visible={false}>{digit(0,.25)}</group>
    </group>
    <mesh name="attendance-label" geometry={resources.plane} material={resources.facilitySign('attendance')} position={[-2.6,2.85,13.15]} rotation={[0,-Math.PI/2,0]} scale={[.85,.16,1]}/>
    <mesh name="exit-canopy" geometry={resources.art.beveled} material={resources.art.enamel} position={[-3.7,3.35,23.25]} scale={[2.7,.13,2.5]}/>
    {[-4.9,-2.5].map(x=><mesh key={x} name="canopy-column" geometry={resources.art.beveled} material={resources.art.metal} position={[x,1.63,24.3]} scale={[.08,3.26,.08]}/>)}
    {[22.8,23.4,24,24.6,25.2].map(z=><mesh key={z} name="courtyard-paving-joint" geometry={resources.box} material={resources.art.rubber} position={[-3.75,.003,z]} scale={[2.2,.003,.008]}/>)}
    {[-4.3,-3.7,-3.1].map(x=><mesh key={x} name="courtyard-paving-long-joint" geometry={resources.box} material={resources.art.rubber} position={[x,.003,24]} scale={[.008,.003,3.6]}/>)}
    <mesh name="outdoor-threshold" geometry={resources.box} material={resources.neutral}
      position={[-3.75,.02,22.15]} scale={[2,.04,.18]}/>
    <mesh name="outdoor-sky" geometry={resources.plane} material={outdoorSky}
      position={[-3.75,8,42]} scale={[60,30,1]}/>
    <mesh name="distant-courtyard-ground" geometry={resources.box} material={resources.dark}
      position={[-3.75,-.14,34]} scale={[30,.22,16]}/>
    <mesh name="distant-garden-left" geometry={resources.box} material={resources.trim}
      position={[-10,1.25,37]} scale={[9,2.5,1.2]}/>
    <mesh name="distant-garden-right" geometry={resources.box} material={resources.trim}
      position={[4.2,1.85,38]} scale={[10,3.7,1.2]}/>
    <mesh name="outdoor-walkway" geometry={resources.box} material={resources.art.floor}
      position={[-3.75,.015,27.1]} scale={[1.55,.03,9.7]}/>
    <mesh name="outdoor-walkway-line" geometry={resources.box} material={resources.neutral}
      position={[-3.75,.04,23.5]} scale={[1.4,.012,.045]}/>
    <mesh name="courtyard-planter-left" geometry={resources.box} material={resources.wall}
      position={[-1.25,.3,24.7]} scale={[1.8,.6,.8]}/>
    <mesh name="courtyard-planter-right" geometry={resources.box} material={resources.wall}
      position={[2.8,.3,24.7]} scale={[1.8,.6,.8]}/>
    <mesh name="courtyard-lamp-post" geometry={resources.cylinder} material={resources.trim}
      position={[-2.05,1.65,28.5]} scale={[.07,1.65,.07]}/>
    <mesh name="courtyard-lamp" geometry={resources.box} material={resources.neutral}
      position={[-2.05,3.3,28.5]} scale={[.42,.18,.42]}/>
    <mesh name="courtyard-lamp-post-left" geometry={resources.cylinder} material={resources.trim}
      position={[-5.45,1.65,28.5]} scale={[.07,1.65,.07]}/>
    <mesh name="courtyard-lamp-left" geometry={resources.box} material={resources.neutral}
      position={[-5.45,3.3,28.5]} scale={[.42,.18,.42]}/>
    <mesh name="containment-door-marker" geometry={resources.box} material={resources.trim}
      position={[2.55,3.45,CONTAINMENT_DOOR_Z]} scale={[3.7,.12,.2]}/>
    <mesh name="staff-exit-marker" geometry={resources.box} material={resources.trim}
      position={[-3.7,3.45,STAFF_DOOR_Z]} scale={[1.1,.12,.2]}/>
    <GalleryActor name="departure-patrol-actor" runtime={runtime} resources={resources} reducedMotion={false} framePriority={-.4}
      actorSource={() => { const raw = runtime.current.stageSession?.value; return isStageSession(raw) ? {...raw.actor,...(raw.stopped?{shutdownSeconds:raw.shutdownSeconds}:{})} : undefined; }}
      onFrameError={onFrameError}/>
  </group>;
}
