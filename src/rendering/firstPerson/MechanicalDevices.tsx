/* eslint-disable react/no-unknown-property -- R3F Three intrinsics. */
import { useFrame } from '@react-three/fiber/native';
import { useMemo, useRef } from 'react';
import { Vector3, type Group, type Material, type Mesh } from 'three';
import type { SceneResources } from './resources';
import { computeSegmentTransform } from './segmentTransform';
import type { Vec3 } from '../../domain/firstPerson/types';

export function Cable({ points, resources, width = .018, material, name = 'physical-cable' }: {
  points: readonly Vec3[]; resources: SceneResources; width?: number; material?: Material; name?: string }) {
  return <group name={name}>{points.slice(1).map((point, i) => {
    const transform = computeSegmentTransform(points[i]!, point, width);
    return <mesh key={i} geometry={resources.cylinder} material={material ?? resources.art.rubber}
      position={transform.position} quaternion={transform.quaternion} scale={transform.scale}/>;
  })}</group>;
}

export function MechanismBolts({ resources, width, height }: { resources: SceneResources; width: number; height: number }) {
  return <group name="mounting-fasteners">{[-1, 1].flatMap(x => [-1, 1].map(y =>
    <mesh key={`${x}:${y}`} geometry={resources.cylinder} material={resources.art.metal}
      position={[x * width / 2, y * height / 2, .006]} rotation={[Math.PI / 2, 0, 0]} scale={[.015, .016, .015]}/>))}</group>;
}

/** Two narrow flanges leave the rope visible in the groove between them. */
export function PulleyWheel({ resources, radius = .19 }: { resources: SceneResources; radius?: number }) {
  const scale = radius/.19;
  return <group name="grooved-pulley-wheel" scale={[scale,scale,scale]}>
    {[-1,1].map(side => <mesh key={side} name="pulley-flange" geometry={resources.art.pulley} material={resources.art.brass}
      position={[0,0,side*.04]} scale={[1,1,.35]}/>)}
    <mesh name="pulley-groove-drum" geometry={resources.cylinder} material={resources.art.metal}
      rotation={[Math.PI/2,0,0]} scale={[.175,.06,.175]}/>
    <mesh name="pulley-axle" geometry={resources.cylinder} material={resources.art.metal}
      rotation={[Math.PI/2,0,0]} scale={[.035,.16,.035]}/>
  </group>;
}

/** The outlet is shared by the drum's last tangent and the area's cable rig. */
export const WINCH_CABLE_OUTLET = { x: -.22, y: .93, z: 0 } as const;
const PRACTICE_PULLEY = { x: -.22, y: .3, z: -.27 } as const;
const PRACTICE_WEIGHT_Z = -.4;
export const practiceWeightHeight = (progress: number) => -.38 + .3 * Math.max(0, Math.min(1, progress));

/** A changing rope span keeps its endpoint on the moving physical attachment.
 * Only the existing mesh transform changes; no frame creates GPU resources. */
export function MovingCable({ resources, from, to, name, width = .018 }: {
  resources: SceneResources; from: () => Vec3; to: () => Vec3; name: string; width?: number;
}) {
  const segment = useRef<Mesh>(null), direction = useMemo(() => new Vector3(), []), up = useMemo(() => new Vector3(0, 1, 0), []);
  useFrame(() => {
    const mesh = segment.current; if (!mesh) return;
    const a = from(), b = to(); direction.set(b.x-a.x, b.y-a.y, b.z-a.z);
    const length = direction.length(); mesh.visible = length > .0001;
    mesh.position.set((a.x+b.x)/2, (a.y+b.y)/2, (a.z+b.z)/2);
    mesh.scale.set(width, length, width);
    if (length > .0001) mesh.quaternion.setFromUnitVectors(up, direction.multiplyScalar(1/length));
  }, -.44);
  return <mesh name={name} ref={segment} geometry={resources.cylinder} material={resources.art.rubber}/>;
}

/** One real pivot, a winding drum, and three separate settled pawls. State is
 * read-only here; incomplete work never impersonates a committed tooth. */
export function WinchModel({ resources, practice, state }: { resources: SceneResources; practice: boolean;
  state: () => { holding: boolean; progress: number; ratchets: number; complete: boolean } }) {
  const pivot = useRef<Group>(null), drum = useRef<Group>(null), weight = useRef<Mesh>(null), marks = useRef<(Mesh | null)[]>([]);
  const practiceProgress = () => { const current = state(); return current.complete ? 1 : Math.max(0, Math.min(1, current.progress)); };
  useFrame(() => {
    const current = state();
    if (pivot.current) pivot.current.rotation.x = current.complete ? -.72 : current.holding ? -.36 - current.progress * .26 : .15;
    if (drum.current) drum.current.rotation.x = practice ? practiceProgress() * 1.1 : (current.ratchets + current.progress) * Math.PI * 2 / 3;
    if (weight.current) weight.current.position.y = practiceWeightHeight(practiceProgress());
    marks.current.forEach((mark, i) => { if (mark) { mark.position.y = -.40 + (current.ratchets > i ? .13 : 0);
      mark.rotation.z = current.ratchets > i ? -.32 : .25;
      mark.material = current.ratchets > i ? resources.art.brass : resources.art.metal; } });
  }, -.45);
  const art = resources.art, gripWidth = practice ? .34 : .5;
  return <group name={practice ? 'practice-pulley-bench' : 'floor-mounted-winch'}>
    <mesh name="mechanism-contact" geometry={resources.plane} material={art.contact}
      position={[-.08, -1.393, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[.72, .82, 1]}/>
    <mesh name="mechanism-fixed-body" geometry={art.beveled} material={practice ? art.timber : art.enamel}
      position={[-.16, practice ? -.57 : -.49, 0]} scale={[.48, practice ? .12 : .84, .65]}/>
    {[-.23, .23].map(z => <mesh key={z} name="floor-fixed-feet" geometry={art.beveled} material={art.metal}
      position={[-.16, -1.03, z]} scale={[practice ? .065 : .42, .73, .065]}/>)}
    <mesh geometry={art.beveled} material={art.metal} position={[-.12, -1.365, 0]} scale={[.6, .06, .77]}/>
    <mesh name="axle-mount" geometry={art.beveled} material={art.metal} position={[-.12, -.17, 0]} scale={[.16, .3, .34]}/>
    <group name="winding-drum" ref={drum} position={[-.22, -.1, 0]}>
      <mesh name="visible-winding-drum" geometry={resources.cylinder} material={art.metal}
        rotation={[0, 0, Math.PI / 2]} scale={[.14, .18, .14]}/>
      {[-.055,0,.055].map(x => <mesh key={x} name="wound-rope" geometry={art.pulley} material={art.rubber}
        position={[x,0,0]} rotation={[0,Math.PI/2,0]} scale={[.76,.76,.76]}/>)}
      <mesh name="drum-drive-spoke" geometry={art.beveled} material={art.brass} position={[.105,0,0]} scale={[.025,.25,.035]}/>
    </group>
    <mesh name="handle-to-drum-axle" geometry={resources.cylinder} material={art.metal}
      position={[-.07,-.1,0]} rotation={[0,0,Math.PI/2]} scale={[.035,.36,.035]}/>
    <group name="grip-pivot" ref={pivot} position={[.05, -.1, 0]}>
      {[-1,1].map(sign => <mesh key={sign} name="grip-arm" geometry={art.beveled} material={art.metal}
        position={[0,.07,sign*gripWidth/2]} scale={[.05,.24,.055]}/>)}
      <mesh name="gripping-bar" geometry={art.beveled} material={art.rubber} position={[.04,.17,0]} scale={[.12,.10,gripWidth+.06]}/>
      {[-1,1].map(sign => <mesh key={sign} name="grip-end-stop" geometry={art.beveled} material={art.brass}
        position={[.04,.17,sign*(gripWidth/2+.035)]} scale={[.14,.12,.025]}/>)}
    </group>
    {practice ? <>
      <group name="practice-pulley" position={[PRACTICE_PULLEY.x,PRACTICE_PULLEY.y,PRACTICE_PULLEY.z]} rotation={[0,Math.PI/2,0]}>
        <PulleyWheel resources={resources} radius={.13}/>
      </group>
      <Cable name="practice-drum-to-pulley" resources={resources} width={.012} points={[
        {x:-.22,y:-.1,z:-.14},{x:-.22,y:.3,z:-.14},
        ...[Math.PI/4,Math.PI/2,Math.PI*3/4,Math.PI].map(angle => ({x:-.22,y:.3+Math.sin(angle)*.13,z:-.27+Math.cos(angle)*.13})),
      ]}/>
      <MovingCable name="practice-pulley-to-weight" resources={resources} width={.012}
        from={() => ({x:-.22,y:.3,z:PRACTICE_WEIGHT_Z})}
        to={() => ({x:-.22,y:practiceWeightHeight(practiceProgress())+.11,z:PRACTICE_WEIGHT_Z})}/>
      <mesh name="practice-visible-weight" ref={weight} geometry={art.beveled} material={art.metal}
        position={[-.22,practiceWeightHeight(practiceProgress()),PRACTICE_WEIGHT_Z]} scale={[.20,.22,.18]}/>
      <mesh name="practice-weight-stop" geometry={art.beveled} material={art.rubber} position={[-.22,-.515,PRACTICE_WEIGHT_Z]} scale={[.25,.05,.24]}/>
    </> : <>
      <mesh name="ratchet-locking-rail" geometry={art.beveled} material={art.brass} position={[.115,-.215,0]} scale={[.055,.045,.62]}/>
      {[-.2,0,.2].map((z,i) => <group key={z}>
        <mesh name={`ratchet-slot-${i+1}`} geometry={art.beveled} material={art.rubber} position={[.087,-.35,z]} scale={[.025,.24,.15]}/>
        <mesh name={`physical-ratchet-${i+1}`} ref={mesh => { marks.current[i]=mesh; }} geometry={art.beveled} material={art.metal} position={[.13,-.40,z]} scale={[.12,.09,.11]}/>
        <mesh name={`ratchet-tooth-${i+1}`} geometry={art.beveled} material={art.metal} position={[.15,-.24,z]} rotation={[0,0,-.35]} scale={[.09,.045,.13]}/>
        {Array.from({length:i+1},(_,n) => <mesh key={n} geometry={resources.box} material={art.marking}
          position={[.105,-.54,z+(n-i/2)*.025]} scale={[.01,.055,.01]}/>)}
      </group>)}
      <group name="cable-top-pulley" position={[-.22,.74,0]} rotation={[0,Math.PI/2,0]}><PulleyWheel resources={resources}/></group>
      <Cable name="winch-drum-to-outlet" resources={resources} points={[
        {x:-.22,y:-.1,z:.14},{x:-.22,y:.74,z:.19},
        {x:-.22,y:.74+.19/Math.sqrt(2),z:.19/Math.sqrt(2)},WINCH_CABLE_OUTLET,
      ]}/>
    </>}
  </group>;
}

export function PhysicalBell({ resources, name = 'bell', ringing = false }: { resources: SceneResources; name?: string; ringing?: boolean }) {
  return <group name={name}>
    <mesh geometry={resources.art.beveled} material={resources.art.enamel} position={[0, -.05, 0]} scale={[.42, .1, .38]}/>
    <mesh name={`${name}-cast-bell`} geometry={resources.art.bell} material={resources.art.brass} scale={[.48, .48, .48]} rotation={[0, 0, ringing ? .08 : 0]}/>
    <mesh name={`${name}-push-plunger`} geometry={resources.cylinder} material={resources.art.rubber} position={[0, .18, 0]} scale={[.035, .11, .035]}/>
  </group>;
}

export function GuardedLever({ resources, power = false, active = false }: { resources: SceneResources; power?: boolean; active?: boolean }) {
  return <group name={power ? 'power-disconnect-lever' : 'guarded-isolation-lever'}>
    <mesh geometry={resources.art.beveled} material={resources.art.enamel} scale={[.33, .075, .34]}/>
    <mesh geometry={resources.art.beveled} material={resources.art.rubber} position={[0, .04, 0]} scale={[.08, .02, .27]}/>
    {!power && [-.13, .13].map(x => <mesh key={x} geometry={resources.art.beveled} material={resources.art.metal}
      position={[x, .11, 0]} scale={[.035, .18, .32]}/>)}
    <group name="actuator-pivot" rotation={[active ? -.65 : .5, 0, 0]}>
      <mesh geometry={resources.cylinder} material={resources.art.metal} position={[0, .12, 0]} scale={[.018, .24, .018]}/>
      <mesh name="lever-grip" geometry={resources.art.beveled} material={power ? resources.art.rubber : resources.art.brass}
        position={[0, .25, 0]} scale={power ? [.22, .06, .06] : [.085, .06, .06]}/>
    </group>
  </group>;
}
