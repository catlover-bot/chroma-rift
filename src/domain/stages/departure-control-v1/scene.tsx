/* eslint-disable react/no-unknown-property -- R3F Three.js intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { DoubleSide, MeshBasicMaterial, type Group, type Mesh } from 'three';
import type { ChapterRuntime, WorldGeometry } from '../../firstPerson/types';
import { isolationKeyGeometry } from '../isolationKeyGeometry';
import { GalleryActor } from '../../../rendering/firstPerson/GalleryActor';
import type { SceneResources } from '../../../rendering/firstPerson/resources';
import { BELL_RECEIVER, CONTAINMENT_DOOR_Z, STAFF_DOOR_Z, stageWorld } from './definition';
import { isStageSession } from './session';

const RECEIVER_RADIUS = .24, RECEIVER_HEIGHT = .16, KEY_INSERT_SECONDS = .2;

/** Uses the same Canvas and actor body as the earlier areas. The remote bell,
 * observation window, two physical doors and short outdoor threshold remain
 * in the authored world rather than a separate completion overlay. */
export function StageScene({ world, resources, runtime, onFrameError }: { world: WorldGeometry<string>;
  resources: SceneResources; runtime: RefObject<ChapterRuntime>; onFrameError?: ((error: unknown) => void) | undefined }) {
  const containmentDoor = useRef<Mesh>(null), staffDoor = useRef<Mesh>(null), receiver = useRef<Mesh>(null);
  const key = useRef<Group>(null), attendance2 = useRef<Group>(null), attendance1 = useRef<Group>(null), attendance0 = useRef<Group>(null);
  const keyVisual = useRef<{ wasInstalled: boolean | null; elapsed: number }>({ wasInstalled: null, elapsed: 0 });
  const devices = useRef<Record<string, Mesh | null>>({});
  const glass = useMemo(() => new MeshBasicMaterial({ color: '#9ac5cc', transparent: true, opacity: .2, depthWrite: false }), []);
  const outdoorSky = useMemo(() => new MeshBasicMaterial({ color: '#53676d', side: DoubleSide, fog: false, toneMapped: false }), []);
  const keyShape = useMemo(() => isolationKeyGeometry(), []);
  const keyMaterial = useMemo(() => new MeshBasicMaterial({ color: '#edf3e5', side: DoubleSide }), []);
  useEffect(() => () => { glass.dispose(); outdoorSky.dispose(); keyShape.dispose(); keyMaterial.dispose(); }, [glass, outdoorSky, keyShape, keyMaterial]);
  useFrame((_, delta) => {
    try {
      const raw = runtime.current.stageSession?.value;
      if (!isStageSession(raw)) return;
      if (containmentDoor.current) containmentDoor.current.position.y = 3.5 * (1 - raw.doorProgress) + 1.75;
      if (staffDoor.current) staffDoor.current.position.y = (raw.staffDoorOpened ? 3.6 : 0) + 1.75;
      if (key.current) {
        const visual = keyVisual.current;
        if (visual.wasInstalled === null) { visual.wasInstalled = raw.keyInstalled; visual.elapsed = raw.keyInstalled ? KEY_INSERT_SECONDS : 0; }
        else if (visual.wasInstalled !== raw.keyInstalled) { visual.wasInstalled = raw.keyInstalled; visual.elapsed = 0; }
        if (raw.keyInstalled && !runtime.current.paused) visual.elapsed = Math.min(KEY_INSERT_SECONDS, visual.elapsed + Math.max(0, Math.min(delta, .05)));
        key.current.visible = raw.keyInstalled;
        key.current.position.x = -4.35 - .35 * (visual.elapsed / KEY_INSERT_SECONDS);
      }
      if (receiver.current) {
        const pulse = raw.bellCooldown > 5.5 ? 1.35 : 1;
        receiver.current.scale.set(RECEIVER_RADIUS * pulse, RECEIVER_HEIGHT * pulse, RECEIVER_RADIUS * pulse);
      }
      if (attendance2.current) attendance2.current.visible = !raw.stopped;
      if (attendance1.current) attendance1.current.visible = raw.stopped && !raw.cleared;
      if (attendance0.current) attendance0.current.visible = raw.cleared;
      const visible = new Set<string>(stageWorld(raw.doorProgress, raw.staffDoorOpened, undefined, raw.keyInstalled, raw.stopped)
        .interactables.map(item => item.id));
      for (const [id, mesh] of Object.entries(devices.current)) if (mesh)
        mesh.visible = visible.has(id) || id === 'departure-door' && visible.has('departure-reopen');
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
    <ambientLight intensity={1.05}/><directionalLight intensity={.8} position={[-2,4,6]}/>
    {world.floors.map(f => <mesh key={f.id} geometry={resources.box} material={f.id === 'outdoor-paving' ? resources.quiet : resources.floor}
      position={[(f.minX+f.maxX)/2,-.1,(f.minZ+f.maxZ)/2]} scale={[f.maxX-f.minX,.2,f.maxZ-f.minZ]}/>)}
    {world.solids.filter(s => s.id !== 'departure-actor-body').map(s => <mesh name={s.id} key={s.id}
      {...(s.id === 'containment-door' ? { ref: containmentDoor } : s.id === 'staff-door' ? { ref: staffDoor } : {})}
      geometry={resources.box} material={s.opaque === false ? glass : s.kind === 'door' ? resources.door : resources.wall}
      position={[(s.min.x+s.max.x)/2,(s.min.y+s.max.y)/2,(s.min.z+s.max.z)/2]}
      scale={[s.max.x-s.min.x,s.max.y-s.min.y,s.max.z-s.min.z]}/>)}
    {world.interactables.filter(t => t.id !== 'departure-outdoor').map(t => <mesh key={t.id} name={t.id}
      ref={mesh => { devices.current[t.id] = mesh; }} geometry={resources.box} material={resources.device}
      position={[t.center.x,t.center.y,t.center.z]} scale={[.25,.28,.1]}/>)}
    <group name="installed-key" ref={key} visible={false} position={[-4.7,1.55,9]} rotation={[0,Math.PI/2,0]}>
      <mesh name="installed-key-silhouette" geometry={keyShape} material={keyMaterial}/>
      <mesh name="installed-key-knob" geometry={resources.box} material={resources.trim} position={[0,0,-.025]} scale={[.08,.09,.03]}/>
    </group>
    <mesh name="containment-bell-receiver" ref={receiver} geometry={resources.cylinder} material={resources.neutral}
      position={[BELL_RECEIVER.x,BELL_RECEIVER.y,BELL_RECEIVER.z]} scale={[RECEIVER_RADIUS,RECEIVER_HEIGHT,RECEIVER_RADIUS]}/>
    <mesh name="enclosure-floor-light" geometry={resources.box} material={resources.neutral}
      position={[2.45,.07,18.1]} scale={[2.7,.045,.14]}/>
    <group name="attendance-display" position={[-4.74,2.35,10.6]} rotation={[0,Math.PI/2,0]}>
      {digit(0,-.38)}
      <group ref={attendance2}>{digit(2,.25)}</group>
      <group ref={attendance1} visible={false}>{digit(1,.25)}</group>
      <group ref={attendance0} visible={false}>{digit(0,.25)}</group>
    </group>
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
    <mesh name="outdoor-walkway" geometry={resources.box} material={resources.trim}
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
      actorSource={() => { const raw = runtime.current.stageSession?.value; return isStageSession(raw) ? raw.actor : undefined; }}
      onFrameError={onFrameError}/>
  </group>;
}
